// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry
/**
 * lilium 辭典 — file format detection & loading orchestration.
 * mdd asset extraction, companion css/js/font integration, dict info export.
 */

import { gunzipSync, unzipSync } from 'fflate';
import { MdictReader } from './mdict';
import { Lex0Reader } from './tei-lex0';
import {
  DictService,
  MdictDict,
  Lex0Dict,
  LiDict,
} from './service';
import { ExtractedAsset, extractMddAssets, ASSET_KIND_RES } from './mdd-assets';

/**
 * P0-1：掃描緩存屍體實例檢查——實例曾被 service.clear()/remove() dispose 後，
 * reader 內部資料已釋放（mdict buf 清空 / lex0 條目清空），查詢恆空。
 * 以各 dict 實作暴露的可辨識狀態判定；無法判定時保守視為未 dispose。
 */
export function isDictDisposed(dict: LiDict): boolean {
  const reader = (dict as unknown as { reader?: { disposed?: boolean; articles?: unknown[] } }).reader;
  if (!reader) return false;
  if (reader.disposed === true) return true; // MdictReader.dispose 標記
  if (Array.isArray(reader.articles)) return reader.articles.length === 0; // Lex0Reader.dispose 清空條目
  return false;
}




export interface LoadResult {
  ok: boolean;
  dict?: LiDict;
  error?: string;
  name?: string;
  format?: string;
  /** extraction stats (mdict) */
  assets?: ExtractedAsset[];
  skipped?: number;
  /** B4：冷路徑解壓後 bytes（gunzip/tar 抽取完成態）——資產抽取通路復用，免二次 gunzip */
  /** P0-2：TEI 磁盤緩存還原時回傳的來源檔簽名（mtime:size），供調用方與現檔比對 */
  srcSig?: string;
  bytes?: Uint8Array;
  /** P0-3：容器形態（tar/zip/gunzip 後容器）完整位元組——資產抽取通路須吃容器而非內層 XML */
  containerBytes?: Uint8Array;
}

export interface AssetWriter {
  /** write binary file inside the vault; vaultPath is vault-relative */
  writeBinary(vaultPath: string, data: Uint8Array): Promise<void>;
  /** write text file inside the vault */
  writeText(vaultPath: string, text: string): Promise<void>;
}

export const ASSET_FOLDER = 'lilium/assets';
// 歷史：'.lilium-assets' → 'lilium-assets'（Obsidian 不索引 dot 資料夾，資產必須
// 入索引才能用 vault.getResourcePath() 產出可載入的 app:// URL——舊 dot 路徑在
// Obsidian 1.14 的 app://local/<rel> 已不可 fetch，圖片/發音全 404）。
// r59d：'lilium-assets' → 'lilium/assets'（收編為 lilium 資料夾子夾；
// 舊資料夾由 plugin.ts migrateLegacyAssetFolder 自動搬移＋磁盤緩存 json 前綴改寫）。
/** 舊資產根（r59d 前版本遺留）——遷移源，僅 migrateLegacyAssetFolder 與掃描排除使用 */
export const LEGACY_ASSET_FOLDER = 'lilium-assets';

/** Load an MDX dictionary, extract .mdd assets, integrate companion css/js */
export async function loadMdict(
  mdxData: Uint8Array,
  fileName: string,
  opts: {
    mddData?: Uint8Array;
    assetWriter?: AssetWriter;
    dictId?: string;
    extractAssets?: boolean;
    /** P2-6：mdd 資產抽取總量預算（bytes）——缺省 800MB（mdd-assets.ts 內定） */
    mddAssetBudgetBytes?: number;
    onProgress?: (phase: string, done: number, total: number) => void;
  } = {},
): Promise<LoadResult> {
  try {
    const reader = new MdictReader(mdxData, 'mdx');
    let mddReader: MdictReader | null = null;
    let assets: ExtractedAsset[] = [];
    let skipped = 0;
    let mddEntryCount: number | undefined;

    if (opts.mddData) {
      try {
        mddReader = new MdictReader(opts.mddData, 'mdd');
        mddEntryCount = mddReader.entryCount;
      } catch {
        mddReader = null;
      }
    }

    const dict = new MdictDict(reader, fileName, {
      mddReader: mddReader || undefined,
      mddEntryCount,
    });

    // extract assets so <img>/<audio>/css work inside the article sandbox
    if (mddReader && opts.assetWriter && opts.extractAssets !== false && opts.dictId) {
      const res = await extractMddAssets(mddReader, {
        writeBinary: (p, d) => opts.assetWriter!.writeBinary(p, d),
        vaultFolder: ASSET_FOLDER,
        dictId: opts.dictId,
        // P2-6：設定頁 mddAssetBudgetMb 透傳（此前該設定是安慰劑——僅存不讀）
        maxTotalBytes: opts.mddAssetBudgetBytes,
        onProgress: (done, total) => opts.onProgress?.('mdd', done, total),
      });
      assets = res.assets;
      skipped = res.skipped;
      dict.meta.assets = assets;
    }

    // 大辭典防範：資源提取完成後釋放 mdd buffer（數百 MB 不再駐留內存）
    try { mddReader?.dispose(); } catch { /* 忽略 */ }
    return { ok: true, dict, name: dict.meta.name, format: 'mdict', assets, skipped };
  } catch (e) {
    return { ok: false, error: describeError(e), name: fileName, format: 'mdict' };
  }
}

/** 跨重啟掃描緩存——從落盤元數據恢復 MdictDict（buf 重讀，解析與 keyIndex 重建跳過）。
   mdd 不恢復 reader：資源已於首次掃描提取落盤，僅帶 entryCount 元數據。 */
export async function loadMdictFromCache(
  mdxData: Uint8Array,
  fileName: string,
  saved: string,
  opts: { dictId?: string; mddEntryCount?: number } = {},
): Promise<LoadResult> {
  try {
    const reader = MdictReader.restore(mdxData, 'mdx', saved);
    const dict = new MdictDict(reader, fileName, {
      mddEntryCount: opts.mddEntryCount,
    });
    return { ok: true, dict, name: dict.meta.name, format: 'mdict', assets: dict.meta.assets ?? [], skipped: 0 };
  } catch (e) {
    return { ok: false, error: describeError(e), name: fileName, format: 'mdict' };
  }
}

/** 從未壓縮 tar bytes 抽最大 .xml 成員（512B header＋content padding，ustar）。 */
function extractLargestXmlFromTar(bytes: Uint8Array): Uint8Array | null {
  let best: { name: string; data: Uint8Array } | null = null;
  for (const m of iterTarMembers(bytes)) {
    if (/\.xml$/i.test(m.name) && (!best || m.data.length > best.data.length)) {
      best = { name: m.name, data: m.data };
    }
  }
  return best ? best.data : null;
}

/** tar 單成員（① TEI 圖形資產通路：tar 包內 img/audio/css 類資源可隨包發佈）。 */
export interface TeiTarMember {
  name: string;
  data: Uint8Array;
}

/** 逐成員走訪未壓縮 tar（512B header＋content padding，ustar）。 */
function iterTarMembers(bytes: Uint8Array): TeiTarMember[] {
  const out: TeiTarMember[] = [];
  let p = 0;
  while (p + 512 <= bytes.length) {
    const nameEnd = bytes.subarray(p, p + 100).indexOf(0);
    if (nameEnd <= 0) break;
    const name = new TextDecoder().decode(bytes.subarray(p, p + nameEnd));
    const sizeStr = new TextDecoder().decode(bytes.subarray(p + 124, p + 136)).replace(/\0|\s/g, '');
    const size = parseInt(sizeStr, 8) || 0;
    if (!size && !name) break;
    if (p + 512 + size > bytes.length) break; // 截斷檔防護
    out.push({ name, data: bytes.subarray(p + 512, p + 512 + size) });
    p += 512 + Math.ceil(size / 512) * 512;
  }
  return out;
}

/** zip 抽最大 .xml 成員（DILA 三典 .zip 分發實錘；PK 魔數）。 */
export function extractLargestXmlFromZip(bytes: Uint8Array): Uint8Array | null {
  try {
    const files = unzipSync(bytes);
    let best: Uint8Array | null = null;
    let bestName = '';
    for (const name of Object.keys(files)) {
      if (!/\.xml$/i.test(name) || name.startsWith('__MACOSX')) continue;
      const d = files[name];
      if (!best || d.length > best.length) { best = d; bestName = name; }
    }
    void bestName;
    return best;
  } catch { return null; }
}

/** ① TEI 圖形資產通路（zip 版）：img/audio/css 成員抽取，模式同 extractTeiTarAssetMembers。 */
export function extractTeiZipAssetMembers(bytes: Uint8Array): Array<{ name: string; data: Uint8Array; kind: 'image' | 'audio' | 'css' }> {
  const kinds: Array<'image' | 'audio' | 'css'> = ['image', 'audio', 'css'];
  const out: Array<{ name: string; data: Uint8Array; kind: 'image' | 'audio' | 'css' }> = [];
  try {
    const files = unzipSync(bytes);
    for (const name of Object.keys(files)) {
      if (name.startsWith('__MACOSX') || name.endsWith('/')) continue;
      const kind = kinds.find((k) => ASSET_KIND_RES[k].test(name.toLowerCase()));
      if (kind) out.push({ name, data: files[name], kind });
    }
  } catch { /* 損壞 zip：空清單，不拖垮詞典本體 */ }
  return out;
}

/**
 * ① TEI 圖形資產通路：tar/資料夾導入 TEI 時抽取 img/audio/css 類成員，
 * 掛 dict.meta.assets（對照 MDict extractMddAssets 模式）——view.ts 的
 * li-lex0-g-img 相對路徑改寫靠這批 assets 才有東西可命中。
 */
export function extractTeiTarAssetMembers(bytes: Uint8Array): Array<TeiTarMember & { kind: 'image' | 'audio' | 'css' }> {
  let data = bytes;
  if (data.length > 2 && data[0] === 0x1f && data[1] === 0x8b) {
     

    data = gunzipSync(data);
  }
  if (!(data.length > 262 && String.fromCharCode(...data.subarray(257, 262)) === 'ustar')) return [];
  const kinds: Array<'image' | 'audio' | 'css'> = ['image', 'audio', 'css'];
  const out: Array<TeiTarMember & { kind: 'image' | 'audio' | 'css' }> = [];
  for (const m of iterTarMembers(data)) {
    const lower = m.name.toLowerCase();
    // C6：副檔名清單收斂 classifyAsset 單一來源（mdd-assets.ts ASSET_KIND_RES）
    const kind = kinds.find((k) => ASSET_KIND_RES[k].test(lower));
    if (kind) out.push({ ...m, kind });
  }
  return out;
}

/**
 * TEI Lex-0 序列化緩存還原——tar.gz 冷解析一次後 gzip 落盤，
 * 啟動還原 648ms vs 冷解析 5.1s（koktai 44k 條實測 7.8×）。
 * @param gzData  緩存檔 bytes（gzip(JSON)）
 */
export function loadLex0FromCache(gzData: Uint8Array, fileName: string): LoadResult {
  try {

    const json = new TextDecoder('utf-8').decode(gunzipSync(gzData));
    // r58：緩存外層包裝 {reader, assets}（r58 起冷解析落盤時帶 assets 清單）；
    // 舊緩存為裸 reader JSON（首字元 '{' 且無 "reader": 鍵）——兩態兼容。
    let readerJson = json;
    let assets: unknown;
    let srcSig: string | undefined;
    try {
      const outer = JSON.parse(json) as { reader?: string; assets?: unknown; srcSig?: string };
      if (typeof outer.reader === 'string') {
        readerJson = outer.reader;
        assets = outer.assets;
        srcSig = outer.srcSig; // P0-2：來源檔簽名隨緩存還原，供調用方校驗
      }
    } catch { /* 非物件＝裸 JSON，走原路 */ }
    const reader = Lex0Reader.deserialize(readerJson);
    if (!reader.articles.length) {
      return { ok: false, error: 'lex0 cache empty', name: fileName, format: 'tei-lex0' };
    }
    const dict = new Lex0Dict(reader, fileName);
    if (Array.isArray(assets) && assets.length) {
      (dict.meta as { assets?: unknown }).assets = assets; // 還原路徑補掛資產清單（vault 檔案本身已落盤留存）
    }
    return { ok: true, dict, name: dict.meta.name, format: 'tei-lex0', srcSig };
  } catch (e) {
    return { ok: false, error: describeError(e), name: fileName, format: 'tei-lex0' };
  }
}

/** Load a TEI Lex-0 dictionary (.lex0.xml / TEI XML) */
export function loadLex0(data: Uint8Array, fileName: string): LoadResult {
  try {
    let bytes = data;
    if (bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b) {
       
  
      bytes = gunzipSync(bytes);
    }
    // P0-3：容器形態（tar/zip）在抽 XML 前保存解壓態容器——資產抽取通路
    // （plugin 抽 img/audio/css 成員）須吃完整容器而非內層 XML。
    let containerBytes: Uint8Array | null = null;
    // tar 包裝——ustar 魔數在偏移 257，抽最大 .xml 成員
    if (bytes.length > 262 && String.fromCharCode(...bytes.subarray(257, 262)) === 'ustar') {
      containerBytes = bytes;
      const inner = extractLargestXmlFromTar(bytes);
      if (inner) bytes = inner;
    }
    // zip 包裝（DILA 三典實際分發格式）——PK 魔數，抽最大 .xml 成員
    if (!containerBytes && bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && (bytes[2] === 3 || bytes[2] === 5 || bytes[2] === 7)) {
      containerBytes = bytes;
      const inner = extractLargestXmlFromZip(bytes);
      if (inner) bytes = inner;
    }
    const text = new TextDecoder('utf-8').decode(bytes);
    const reader = new Lex0Reader(text);
    if (!reader.entryCount) {
      return { ok: false, error: 'No <entry> elements found — not a TEI Lex-0 dictionary?', name: fileName, format: 'tei-lex0' };
    }
    const dict = new Lex0Dict(reader, fileName);
    // B4：回傳解壓態 bytes；P0-3：容器形態額外回傳完整容器（資產抽取通路）
    return containerBytes
      ? { ok: true, dict, name: dict.meta.name, format: 'tei-lex0', bytes, containerBytes }
      : { ok: true, dict, name: dict.meta.name, format: 'tei-lex0', bytes };
  } catch (e) {
    return { ok: false, error: describeError(e), name: fileName, format: 'tei-lex0' };
  }
}

/** Standalone CSS/JS/Font files: bundled into a "style pack" attached to a dict by base name */
export interface StylePack {
  css?: { name: string; text: string };
  js?: { name: string; text: string }[];
  fonts: { name: string; data: Uint8Array }[];
}

export function isCompanionAsset(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return /\.(css|js|ttf|otf|woff2?|eot)$/.test(lower);
}

function describeError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/LZO/i.test(msg)) {
    return '此辭典使用 LZO 壓縮，但解碼失敗 / LZO decompression failed — the file may be corrupted';
  }
  if (/encrypt/i.test(msg)) {
    return '此辭典已加密，暫不支持 / encrypted dictionaries are not supported';
  }
  return msg;
}

// export a service factory
export function createDictService(): DictService {
  return new DictService();
}
