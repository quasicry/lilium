// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry
/**
 * lilium 辭典 — MDict (.mdx/.mdd) reader.
 *
 * Implements the MDict container per xwang/mdict-analysis readmdict.py semantics:
 *  - header: BE u32 headerLen, UTF-16LE XML text, adler32
 *  - v1.x: 4-byte numbers; v2.0+: 8-byte numbers
 *  - key header / key block info (zlib in v2, plain in v1) / key blocks (raw|lzo|zlib)
 *  - record header / record block info / record blocks (raw|lzo|zlib)
 *  - Encrypted=1 record blocks: fast-xor with ripemd128(BE adler32)
 *  - Encrypted=2 key block info: fast-xor with ripemd128(adler32 || LE u32 0x3695)
 *  - v3.0 unencrypted files are readable; v3 encrypted needs xxhash-based keys (unsupported)
 */

import { decompressSync as zlibInflate } from 'fflate';
import { lzo1x } from './lzo1x';
import { ripemd128 } from './ripemd128';
import { readBE } from './util';
import { SortedKeyIndex } from './sorted-index';

export interface MdictHeader {
  [k: string]: string;
}

export interface MdictEntry {
  keyText: string;
  /** record block index */
  recordIdx: number;
  /** start offset inside the decompressed record block (after finalize) */
  recordStart: number;
  recordEnd: number;
}

interface KeyBlockInfo {
  numEntries: number;
  compSize: number;
  compAcc: number;
  unpackSize: number;
}

interface RecordBlockInfo {
  compSize: number;
  compAcc: number;
  unpackSize: number;
  unpackAcc: number;
}

const UTF16LE = 'utf-16le';

function fastDecrypt(data: Uint8Array, key: Uint8Array): Uint8Array {
  const b = data.slice();
  let previous = 0x36;
  for (let i = 0; i < b.length; i++) {
    let t = ((b[i] >> 4) | (b[i] << 4)) & 0xff;
    t = (t ^ previous ^ (i & 0xff) ^ key[i % key.length]) & 0xff;
    previous = b[i];
    b[i] = t;
  }
  return b;
}

function concat(...arrs: Uint8Array[]): Uint8Array {
  const total = arrs.reduce((s, a) => s + a.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const a of arrs) {
    out.set(a, off);
    off += a.length;
  }
  return out;
}

export class MdictReader {
  readonly header: MdictHeader = {};
  readonly version: number;
  readonly isMdd: boolean;
  readonly encoding: string;
  /** header KeyCaseSensitive：true＝詞頭區分大小寫（不做小寫歸一；P2-1） */
  readonly keyCaseSensitive: boolean;
  /** header StripKey：false＝不剝首尾空格/標點（P2-1） */
  readonly stripKey: boolean;
  entries: MdictEntry[] = [];

  private buf: Uint8Array;
  private numWidth: number;
  private encrypt = 0;
  private keyBlockInfos: KeyBlockInfo[] = [];
  private recordInfos: RecordBlockInfo[] = [];
  private keyBlockStart = 0;
  private recordStart = 0;
  private decoder: TextDecoder;
  private lzoOk = true;
  /**
   * 詞頭索引。`null` 表示該詞典的詞頭並非字典序（罕見的格式偏差），
   * 此時所有查詢自動退回原本的線性掃描，行為與舊版一致。
   */
  private keyIndex: SortedKeyIndex | null = null;
  /**
   * record block 解壓快取（詞條卡片加載卡頓修復）：
   * 每次查詢的每條 hit（含 @@@LINK 跟讀每跳）都經 readRecordBytes→decodeBlock 整塊
   * 解壓（zlib/lzo），同塊反覆重解壓在移動端 CPU 上以十毫秒計，多典多 hit 疊加可達秒級。
   * 快取鍵＝record block 索引；Map 插入序＝訪問序（命中即移尾），按 unpacked 總字節
   * 封頂淘汰最舊（真 LRU）。MdictEntry 的 record offset 是解壓塊內偏移，同一塊內
   * 多條目共享一次解壓。
   */
  private recordBlockCache = new Map<number, Uint8Array>();
  private recordBlockCacheBytes = 0;
  /** 快取 unpacked 總量封頂：容大詞典最熱若干塊，記憶體可控（移動端友好）。 */
  private static RECORD_BLOCK_CACHE_MAX_BYTES = 48 * 1024 * 1024;

  constructor(data: Uint8Array, ext?: 'mdx' | 'mdd') {
    this.buf = data;
    const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const headerLen = dv.getUint32(0);
    const headerBytes = data.subarray(4, 4 + headerLen);
    const headerText = new TextDecoder(UTF16LE).decode(headerBytes.subarray(0, Math.max(0, headerLen - 2)));
    this.header = MdictReader.parseHeader(headerText);

    this.version = parseFloat(this.header.GeneratedByEngineVersion || '2.0');
    this.numWidth = this.version >= 2.0 ? 8 : 4;
    this.isMdd = ext ? ext === 'mdd' : false;

    const enc = (this.header.Encoding || 'utf-8').trim();
    if (this.isMdd || /utf-?16/i.test(enc)) this.encoding = UTF16LE;
    else if (/^(gbk|gb2312)$/i.test(enc)) this.encoding = 'gb18030';
    else if (/^big5$/i.test(enc)) this.encoding = 'big5';
    else this.encoding = 'utf-8';
    try {
      this.decoder = new TextDecoder(this.encoding);
    } catch {
      this.decoder = new TextDecoder('utf-8');
    }

    const flag = this.header.Encrypted || '';
    this.encrypt = !flag || flag === 'No' ? 0 : flag === 'Yes' ? 1 : parseInt(flag, 10) || 0;

    // P2-1：讀 header 的 KeyCaseSensitive/StripKey（MDict 官方語義——KeyCaseSensitive="true"
    // 表示詞頭區分大小寫，查詢不做小寫歸一；StripKey="false" 表示詞頭不剝空格/標點）。
    // 缺省（header 未寫）沿用舊行為＝小寫歸一＋剝除——既有語料/斷言基線不變；
    // 僅明確宣告 true/yes/1 才啟用大小寫區分。
    this.keyCaseSensitive = /^(true|yes|1)$/i.test((this.header.KeyCaseSensitive || '').trim());
    this.stripKey = !/^(false|no|0)$/i.test((this.header.StripKey || '').trim());

    this.parse();
  }

  static parseHeader(text: string): MdictHeader {
    const header: MdictHeader = {};
    const re = /(\w+)="(.*?)"/gs;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      header[m[1]] = m[2]
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&');
    }
    return header;
  }

  get title(): string {
    // 「提取顯示名失敗」）：兩類病源——
    // ① header 鍵名大小寫/別名不統一（Title/title/BookName）；
    // ② 部分製作工具（如三藏法數.mdx／阿毗達磨辭典.mdx）留佔位垃圾
    //    Title="Title (No HTML code allowed)"，照單全收會顯示成佔位串。
    const keys = ['Title', 'title', 'TITLE', 'BookName', 'bookname', 'Name', 'name'];
    for (const k of keys) {
      const v = this.header[k];
      const t = v ? String(v).trim() : '';
      if (t && !/^Title\s*\(No HTML code allowed\)$/i.test(t)) return t;
    }
    return '';
  }

  get description(): string {
    return this.header.Description || '';
  }

  get entryCount(): number {
    return this.entries.length;
  }

  get supported(): boolean {
    return this.lzoOk;
  }

  /** Decode one compressed/encrypted container block (8-byte prefix + payload) */
  private decodeBlock(block: Uint8Array, decompressedSize: number): Uint8Array {
    const dv = new DataView(block.buffer, block.byteOffset, block.byteLength);
    const info = dv.getUint32(0, true); // LE
    const comp = info & 0xf;
    const encMethod = (info >> 4) & 0xf;
    const encSize = (info >> 8) & 0xff;

    let data = block.subarray(8);
    if (encMethod !== 0) {
      const key = ripemd128(block.subarray(4, 8));
      if (encMethod === 1) {
        data = concat(fastDecrypt(data.subarray(0, encSize), key), data.subarray(encSize));
      } else if (encMethod === 2) {
        data = concat(fastDecrypt(data.subarray(0, encSize), key), data.subarray(encSize));
      } else {
        throw new Error(`MDict: unsupported per-block encryption ${encMethod}`);
      }
    }

    if (comp === 0) return data;
    if (comp === 1) {
      const hdr = new Uint8Array(5);
      hdr[0] = 0xf0;
      new DataView(hdr.buffer).setUint32(1, decompressedSize, false);
      const out = lzo1x.decompress(concat(hdr, data));
      return out.subarray(0, decompressedSize);
    }
    if (comp === 2) return zlibInflate(data);
    throw new Error(`MDict: unknown compression method ${comp}`);
  }

  private parse(): void {
    const dv = new DataView(this.buf.buffer, this.buf.byteOffset, this.buf.byteLength);
    const headerLen = dv.getUint32(0);
    let pos = 4 + headerLen + 4; // skip header len + header + adler32

    // ---- key header ----
    pos += this.numWidth;
    readBE(this.buf, pos, this.numWidth); // numEntriesTotal
    pos += this.numWidth;
    if (this.version >= 2.0) pos += this.numWidth; // key info decompressed size
    const keyInfoCompSize = readBE(this.buf, pos, this.numWidth);
    pos += this.numWidth;
    const keyBlocksTotalSize = readBE(this.buf, pos, this.numWidth);
    pos += this.numWidth;
    if (this.version >= 2.0) pos += 4; // adler32

    // ---- key block info ----
    let keyInfo = this.buf.subarray(pos, pos + keyInfoCompSize);
    pos += keyInfoCompSize;
    if (this.version >= 2.0) {
      if (this.encrypt & 0x02) {
        const key = ripemd128(concat(keyInfo.subarray(4, 8), new Uint8Array([0x95, 0x36, 0x00, 0x00])));
        keyInfo = concat(keyInfo.subarray(0, 8), fastDecrypt(keyInfo.subarray(8), key));
      }
      if (keyInfo[0] === 2) {
        keyInfo = zlibInflate(keyInfo.subarray(8));
      }
      // else: MdxBuilder 2.x wrote plain (non-compressed) key info with Encrypted flag absent
    }

    // decode key block info entries
    const textTerm = this.version >= 2.0 ? 1 : 0;
    const w = this.version >= 2.0 ? 2 : 1;
    let compAcc = 0;
    let i = 0;
    try {
      while (i < keyInfo.length) {
        const blockEntries = readBE(keyInfo, i, this.numWidth);
        i += this.numWidth;
        let headSize = readBE(keyInfo, i, w);
        i += w;
        headSize = this.encoding === UTF16LE ? (headSize + textTerm) * 2 : headSize + textTerm;
        i += headSize; // first key bytes (we don't need them for lookup)
        let tailSize = readBE(keyInfo, i, w);
        i += w;
        tailSize = this.encoding === UTF16LE ? (tailSize + textTerm) * 2 : tailSize + textTerm;
        i += tailSize; // last key bytes
        const cSize = readBE(keyInfo, i, this.numWidth);
        i += this.numWidth;
        const uSize = readBE(keyInfo, i, this.numWidth);
        i += this.numWidth;
        this.keyBlockInfos.push({ numEntries: blockEntries, compSize: cSize, compAcc, unpackSize: uSize });
        compAcc += cSize;
      }
    } catch {
      throw new Error('MDict: failed to parse key block info — file may be encrypted');
    }

    // ---- key blocks ----
    this.keyBlockStart = pos;
    const recordHeaderStart = this.keyBlockStart + keyBlocksTotalSize;

    // ---- record header ----
    let rp = recordHeaderStart;
    const numRecordBlocks = readBE(this.buf, rp, this.numWidth);
    rp += this.numWidth;
    readBE(this.buf, rp, this.numWidth); // total entries in records
    rp += this.numWidth;
    const recordInfoSize = readBE(this.buf, rp, this.numWidth);
    rp += this.numWidth;
    readBE(this.buf, rp, this.numWidth); // record blocks total size
    rp += this.numWidth;

    // ---- record block info ----
    const recInfo = this.buf.subarray(rp, rp + recordInfoSize);
    let racc = 0;
    let runacc = 0;
    for (let b = 0; b < numRecordBlocks; b++) {
      const cSize = readBE(recInfo, b * this.numWidth * 2, this.numWidth);
      const uSize = readBE(recInfo, b * this.numWidth * 2 + this.numWidth, this.numWidth);
      this.recordInfos.push({ compSize: cSize, compAcc: racc, unpackSize: uSize, unpackAcc: runacc });
      racc += cSize;
      runacc += uSize;
    }
    this.recordStart = rp + recordInfoSize;

    // ---- decode key blocks and split keys ----
    const entries: MdictEntry[] = [];
    for (const ki of this.keyBlockInfos) {
      const packed = this.buf.subarray(this.keyBlockStart + ki.compAcc, this.keyBlockStart + ki.compAcc + ki.compSize);
      let keyBlock: Uint8Array;
      try {
        keyBlock = this.decodeBlock(packed, ki.unpackSize);
      } catch (e) {
        // LZO missing or unsupported encryption — mark degraded and stop key parsing
        if (/LZO/i.test(String(e))) this.lzoOk = false;
        throw e;
      }
      this.splitKeyBlock(keyBlock, ki, entries);
    }

    // resolve recordIdx/recordEnd: entries carry absolute record offsets; map to block-relative
    let blockIdx = 0;
    const infos = this.recordInfos;
    for (let e = 0; e < entries.length; e++) {
      const ent = entries[e];
      while (blockIdx < infos.length - 1 && ent.recordStart >= infos[blockIdx].unpackAcc + infos[blockIdx].unpackSize) {
        blockIdx++;
      }
      ent.recordIdx = blockIdx;
      ent.recordStart = ent.recordStart - infos[blockIdx].unpackAcc;
      const next = e + 1 < entries.length ? entries[e + 1].recordStart : infos[blockIdx].unpackAcc + infos[blockIdx].unpackSize;
      ent.recordEnd = Math.min(next, infos[blockIdx].unpackAcc + infos[blockIdx].unpackSize) - infos[blockIdx].unpackAcc;
    }
    this.entries = entries;
    // 建詞頭索引（字典序 + 正規化索引），把查詞從 O(n) 線性掃描降為 O(log n)。
    // SortedKeyIndex 建構即排序（sortedKeys 恆有序），keyIndex 恆非 null。
    this.keyIndex = new SortedKeyIndex(
      entries.map((e) => e.keyText),
      this.normFn(),
    );
  }

  /**
   * 序列化解析結果（元數據＋索引）——供跨重啟掃描緩存落盤。
   * 不含 buf（原檔 bytes 由重啟後 readBinary 重新提供，讀檔遠快於解析）。
   */
  serialize(): string {
    return JSON.stringify({
      v: 1,
      header: this.header,
      version: this.version,
      isMdd: this.isMdd,
      encoding: this.encoding,
      keyCaseSensitive: this.keyCaseSensitive,
      stripKey: this.stripKey,
      entries: this.entries,
      keyBlockInfos: this.keyBlockInfos,
      recordInfos: this.recordInfos,
      keyBlockStart: this.keyBlockStart,
      recordStart: this.recordStart,
      lzoOk: this.lzoOk,
    });
  }

  /** 從序列化結果恢復（跳過整個 key/record block 解析與 keyIndex 重建）。 */
  static restore(data: Uint8Array, ext: 'mdx' | 'mdd', saved: string): MdictReader {
    const o = JSON.parse(saved) as {
      header: MdictHeader; version: number; isMdd: boolean; encoding: string;
      keyCaseSensitive?: boolean; stripKey?: boolean;
      entries: MdictEntry[]; keyBlockInfos: KeyBlockInfo[]; recordInfos: RecordBlockInfo[];
      keyBlockStart: number; recordStart: number; lzoOk: boolean;
    };
    const r = Object.create(MdictReader.prototype) as MdictReader;
    // 類欄位初始化器不會在 Object.create 路徑執行——restore 重建的新快取欄位須手動補齊。
    (r as unknown as { recordBlockCache: Map<number, Uint8Array> }).recordBlockCache = new Map();
    (r as unknown as { recordBlockCacheBytes: number }).recordBlockCacheBytes = 0;
    (r as unknown as { buf: Uint8Array }).buf = data;
    (r as unknown as { numWidth: number }).numWidth = o.version >= 2.0 ? 8 : 4;
    (r as unknown as { encrypt: number }).encrypt = 0;
    (r as unknown as { decoder: TextDecoder }).decoder = new TextDecoder(o.encoding || UTF16LE);
    (r as unknown as { header: MdictHeader }).header = o.header;
    (r as unknown as { version: number }).version = o.version;
    (r as unknown as { isMdd: boolean }).isMdd = o.isMdd;
    (r as unknown as { encoding: string }).encoding = o.encoding;
    (r as unknown as { keyCaseSensitive: boolean }).keyCaseSensitive = o.keyCaseSensitive === true;
    (r as unknown as { stripKey: boolean }).stripKey = o.stripKey !== false;
    (r as unknown as { entries: MdictEntry[] }).entries = o.entries;
    (r as unknown as { keyBlockInfos: KeyBlockInfo[] }).keyBlockInfos = o.keyBlockInfos;
    (r as unknown as { recordInfos: RecordBlockInfo[] }).recordInfos = o.recordInfos;
    (r as unknown as { keyBlockStart: number }).keyBlockStart = o.keyBlockStart;
    (r as unknown as { recordStart: number }).recordStart = o.recordStart;
    (r as unknown as { lzoOk: boolean }).lzoOk = o.lzoOk;
    const entries = o.entries;
    // 重建詞頭索引（O(n log n) 一次；遠快於解壓 key blocks）
    const savedOpts = { caseSensitive: o.keyCaseSensitive, strip: o.stripKey };
    const ki = new SortedKeyIndex(entries.map((e) => e.keyText), (k) => normalizeKey(k, o.isMdd, savedOpts));
    (r as unknown as { keyIndex: SortedKeyIndex | null }).keyIndex = ki;
    return r;
  }

  private splitKeyBlock(keyBlock: Uint8Array, ki: KeyBlockInfo, out: MdictEntry[]): void {
    const width = this.encoding === UTF16LE || this.isMdd ? 2 : 1;
    let p = 0;
    let count = 0;
    while (p < keyBlock.length && count < ki.numEntries) {
      const recordStart = readBE(keyBlock, p, this.numWidth);
      p += this.numWidth;
      const start = p;
      while (p + width <= keyBlock.length) {
        if (keyBlock[p] === 0 && (width === 1 || keyBlock[p + 1] === 0)) break;
        p += width;
      }
      const keyText = this.decoder.decode(keyBlock.subarray(start, p));
      p += width;
      out.push({ keyText, recordIdx: 0, recordStart, recordEnd: 0 });
      count++;
    }
  }

  lookup(word: string): { keyText: string; definition: string | null } | null {
    const found = this.lookupAll(word);
    return found.length ? found[0] : null;
  }

  /**
   * 精確查詢所有同名詞頭（MDict 允許重複詞頭）。
   * 有索引時走二分 O(log n)，否則退回線性掃描。
   */
  lookupAll(word: string): Array<{ keyText: string; definition: string | null }> {
    const idxs = this.keyIndex ? this.keyIndex.exact(word) : null;
    if (idxs) {
      if (!idxs.length) return [];
      const res: Array<{ keyText: string; definition: string | null }> = [];
      for (const i of idxs) {
        const e = this.entries[i];
        res.push({ keyText: e.keyText, definition: this.followLinks(e) });
      }
      return res;
    }
    const res: Array<{ keyText: string; definition: string | null }> = [];
    for (const e of this.entries) {
      if (e.keyText === word) res.push({ keyText: e.keyText, definition: this.followLinks(e) });
    }
    return res;
  }

  /** 模糊查詢：忽略大小寫與標點。走正規化索引，不再逐條 normalizeKey。 */
  lookupFuzzy(word: string): Array<{ keyText: string; definition: string | null }> {
    const res: Array<{ keyText: string; definition: string | null }> = [];
    const idxs = this.keyIndex ? this.keyIndex.normalized(normalizeKey(word, this.isMdd, this.keyOpts), 8) : null;
    if (idxs) {
      for (const i of idxs) {
        const e = this.entries[i];
        res.push({ keyText: e.keyText, definition: this.followLinks(e) });
      }
      return res;
    }
    const norm = normalizeKey(word, this.isMdd, this.keyOpts);
    for (const e of this.entries) {
      if (normalizeKey(e.keyText, this.isMdd, this.keyOpts) === norm) {
        res.push({ keyText: e.keyText, definition: this.followLinks(e) });
      }
    }
    return res;
  }

  /**
   * 正規化前綴匹配：查 "wellbeing" 命中 "well-being"。
   * 走正規化索引的二分，不再整表掃描。
   */
  prefixNormalized(word: string, limit = 20): string[] {
    const norm = normalizeKey(word, this.isMdd, this.keyOpts);
    if (!norm) return [];
    const idxs = this.keyIndex ? this.keyIndex.normalizedPrefix(norm, limit) : null;
    if (idxs) return idxs.map((i) => this.entries[i].keyText);
    const out: string[] = [];
    for (const e of this.entries) {
      if (normalizeKey(e.keyText, this.isMdd, this.keyOpts).startsWith(norm)) {
        out.push(e.keyText);
        if (out.length >= limit) break;
      }
    }
    return out;
  }

  /**
   * 前綴查詢。二分定位起點後順序取 limit 筆。
   * 注意：舊實作是「按下標順序取前 limit 筆」，改成字典序後回傳順序會不同，
   * 但呼叫端（`prefixAll` / BK 樹）原本就依賴字典序假設，因此這是修正而非變更。
   */
  prefix(word: string, limit = 30): string[] {
    if (this.keyIndex) return this.keyIndex.prefixKeys(word, limit);
    const out: string[] = [];
    const w = word.toLowerCase();
    for (const e of this.entries) {
      if (e.keyText.toLowerCase().startsWith(w)) {
        out.push(e.keyText);
        if (out.length >= limit) break;
      }
    }
    return out;
  }

  readRecord(entry: MdictEntry): string {
    const bytes = this.readRecordBytes(entry);
    return bytes ? this.decoder.decode(bytes) : '';
  }

  /** Raw (undecoded) record bytes — used by .mdd resource lookup */
  readRecordBytes(entry: MdictEntry): Uint8Array | null {
    const ri = this.recordInfos[entry.recordIdx];
    if (!ri) return null;
    const block = this.recordBlock(entry.recordIdx, ri);
    if (!block) return null;
    return block.subarray(entry.recordStart, entry.recordEnd);
  }

  /**
   * record block 取得（帶 LRU 解壓快取）：命中直接回快取視圖，未命中解壓一次後入快取。
   * 單塊 unpacked 超過封頂值時不快取（超大塊只出現於格式異常檔，直接解壓避免快取溢出）。
   */
  private recordBlock(idx: number, ri: RecordBlockInfo): Uint8Array | null {
    const cached = this.recordBlockCache.get(idx);
    if (cached) {
      // 真 LRU：命中移尾（delete＋set 重插）。
      this.recordBlockCache.delete(idx);
      this.recordBlockCache.set(idx, cached);
      return cached;
    }
    const packed = this.buf.subarray(this.recordStart + ri.compAcc, this.recordStart + ri.compAcc + ri.compSize);
    try {
      const block = this.decodeBlock(packed, ri.unpackSize);
      if (ri.unpackSize <= MdictReader.RECORD_BLOCK_CACHE_MAX_BYTES) {
        this.recordBlockCache.set(idx, block);
        this.recordBlockCacheBytes += ri.unpackSize;
        while (this.recordBlockCacheBytes > MdictReader.RECORD_BLOCK_CACHE_MAX_BYTES && this.recordBlockCache.size > 1) {
          const oldest = this.recordBlockCache.keys().next();
          if (oldest.done) break;
          this.recordBlockCache.delete(oldest.value);
          // 淘汰量按該塊 unpacked 實際大小扣減（快取鍵＝recordInfos 索引）。
          const info = this.recordInfos[oldest.value];
          if (info) this.recordBlockCacheBytes -= Math.min(info.unpackSize, this.recordBlockCacheBytes);
        }
      }
      return block;
    } catch {
      return null;
    }
  }

  /** Maximum @@@LINK= redirect chain length (goldendict uses MD5 set; a depth cap suffices) */
  private static MAX_LINK_DEPTH = 8;

  /**
   * Follow `@@@LINK=<word>` redirects (goldendict/mdx.cc pattern): MDX commonly
   * aliases entries to a canonical headword. Returns the final definition text.
   */
  private followLinks(entry: MdictEntry, depth = 0): string {
    const raw = this.readRecordBytes(entry);
    if (!raw) return '';
    const text = this.decoder.decode(raw);
    if (text.startsWith('@@@LINK=') && depth < MdictReader.MAX_LINK_DEPTH) {
      // eslint-disable-next-line no-control-regex -- 字典解析/文本清洗必需的控制字符匹配（\x00 剝除/分隔符），無 ReDoS（無嵌套量詞）——審計批次三。
      const target = text.slice('@@@LINK='.length).trim().replace(/\x00/g, '');
      if (target) {
        const next = this.lookupEntryExact(target);
        if (next) return this.followLinks(next, depth + 1);
        // try fuzzy match (case/strip) before giving up ——走正規化索引
        const norm = normalizeKey(target, this.isMdd, this.keyOpts);
        const idxs = this.keyIndex ? this.keyIndex.normalized(norm, 1) : null;
        if (idxs) {
          if (!idxs.length) return '';
          return this.followLinks(this.entries[idxs[0]], depth + 1);
        }
        for (const e of this.entries) {
          if (normalizeKey(e.keyText, this.isMdd, this.keyOpts) === norm) return this.followLinks(e, depth + 1);
        }
      }
      return '';
    }
    return text;
  }

  private lookupEntryExact(word: string): MdictEntry | null {
    if (this.keyIndex) {
      const i = this.keyIndex.exactFirst(word);
      return i < 0 ? null : this.entries[i];
    }
    for (const e of this.entries) {
      if (e.keyText === word) return e;
    }
    return null;
  }

  // ------------------------------------------------------------ resources (.mdd)

  private resourceMap: Map<string, MdictEntry> | null = null;
  private resourceBaseMap: Map<string, MdictEntry> | null = null;

  private buildResourceMaps(): void {
    this.resourceMap = new Map();
    this.resourceBaseMap = new Map();
    for (const e of this.entries) {
      const norm = e.keyText.replace(/^\\+|^\/+/, '').replace(/\\/g, '/').toLowerCase();
      if (!this.resourceMap.has(norm)) this.resourceMap.set(norm, e);
      const base = norm.split('/').pop() || norm;
      if (!this.resourceBaseMap.has(base)) this.resourceBaseMap.set(base, e);
    }
  }

  /** Resolve a resource referenced from MDX html, e.g. "/apple.png" or "sound://a.mp3" */
  getResource(path: string): Uint8Array | null {
    if (!this.isMdd) return null;
    if (!this.resourceMap) this.buildResourceMaps();
    const norm = path.replace(/^\\+|^\/+/, '').replace(/\\/g, '/').split('?')[0].split('#')[0].toLowerCase();
    const entry = this.resourceMap!.get(norm) || this.resourceBaseMap!.get(norm.split('/').pop() || '');
    if (!entry) return null;
    const bytes = this.readRecordBytes(entry);
    if (bytes && bytes.length > 8) {
      // resource-level @@@LINK= (UTF-8 or UTF-16LE encoded)
      const head8 = Array.from(bytes.subarray(0, 8)).map(b => String.fromCharCode(b)).join('');
      if (head8.startsWith('@@@LINK=')) {
        // eslint-disable-next-line no-control-regex -- 字典解析/文本清洗必需的控制字符匹配（\x00 剝除/分隔符），無 ReDoS（無嵌套量詞）。
        return this.getResource(new TextDecoder('utf-8').decode(bytes).slice(8).trim().replace(/\x00/g, ''));
      }
      if (bytes[0] === 0x40 && bytes[1] === 0x00) {
        // UTF-16LE @@@LINK=
        const text = new TextDecoder('utf-16le').decode(bytes);
        if (text.startsWith('@@@LINK=')) {
          // eslint-disable-next-line no-control-regex -- 字典解析/文本清洗必需的控制字符匹配（\x00 剝除/分隔符），無 ReDoS（無嵌套量詞）。
          return this.getResource(text.slice(8).trim().replace(/\x00/g, ''));
        }
      }
    }
    return bytes;
  }

  // ---------------------------------------------------------- content scanning

  /** Iterate every entry's decoded text, block-by-block (memory-friendly). */
  *iterateContent(): Generator<{ keyText: string; text: string }> {
    if (this.isMdd) return;
    // group entries by record block
    const perBlock = new Map<number, MdictEntry[]>();
    for (const e of this.entries) {
      let arr = perBlock.get(e.recordIdx);
      if (!arr) perBlock.set(e.recordIdx, (arr = []));
      arr.push(e);
    }
    for (const [idx, infos] of perBlock) {
      const ri = this.recordInfos[idx];
      if (!ri) continue;
      // 走帶 LRU 快取的 recordBlock——headwords 全表遍歷與查詢路徑共享解壓成果。
      const block = this.recordBlock(idx, ri);
      if (!block) continue;
      for (const e of infos) {
        yield { keyText: e.keyText, text: this.decoder.decode(block.subarray(e.recordStart, e.recordEnd)) };
      }
    }
  }


  /** P2-1：查詢路徑共用的正規化選項（依 header 旗標）。 */
  private get keyOpts(): NormalizeKeyOpts {
    return { caseSensitive: this.keyCaseSensitive, strip: this.stripKey };
  }

  /** P2-1：依 header 旗標生成詞頭正規化函數（parse 與 restore 共用）。 */
  private normFn(): (k: string) => string {
    const opts = { caseSensitive: this.keyCaseSensitive, strip: this.stripKey };
    return (k: string) => normalizeKey(k, this.isMdd, opts);
  }

  /** Curated header fields for the dictionary info editor */
  getHeaderInfo(): Record<string, string> {
    const keys = ['Title', 'Description', 'Encoding', 'GeneratedByEngineVersion', 'CreationDate', 'Format', 'Encrypted', 'KeyCaseSensitive', 'StripKey'];
    const out: Record<string, string> = {};
    for (const k of keys) if (this.header[k]) out[k] = this.header[k];
    return out;
  }

  /** 大辭典防範：釋放底層 buffer（mdd 提取完成後調用，數百 MB 不再駐留）。冪等（A4）。 */
  private disposed = false;
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.buf = new Uint8Array(0);
    this.entries = [];
    this.keyIndex = null;
    this.recordBlockCache.clear();
    this.recordBlockCacheBytes = 0;
  }
}

/**
 * MDict 詞頭正規化（P2-1）：
 *  - strip（對應 header StripKey）：剝標點與首尾空格；StripKey="false" 時跳過剝除
 *  - 小寫歸一（對應 header KeyCaseSensitive）：僅 header 明確 KeyCaseSensitive="true" 時跳過
 *  - mdd 資源鍵（isMdd）不受此二旗標影響（資源路徑慣例不同，維持原歸一）
 * opts 缺省＝舊行為（剝＋小寫歸一），供未讀 header 的呼叫端（service 模糊鍵）沿用；
 * 傳 caseSensitive:true（header KeyCaseSensitive="true"）時不做小寫歸一，StripKey:"false" 時跳過剝除。
 */
export interface NormalizeKeyOpts {
  /** true＝不做小寫歸一（header KeyCaseSensitive="true"） */
  caseSensitive?: boolean;
  /** false＝不剝標點/空格（header StripKey="false"） */
  strip?: boolean;
}

export function normalizeKey(key: string, isMdd = false, opts: NormalizeKeyOpts = {}): string {
  const strip = opts.strip !== false;
  const caseSensitive = opts.caseSensitive === true;
  let k = key;
  if (isMdd) {
    if (!strip) return caseSensitive ? k : k.toLowerCase();
    k = k.replace(/([.][^.]*$)|[()., '/@]/g, '$1').replace(/_/g, '!');
    return caseSensitive ? k.trim() : k.toLowerCase().trim();
  }
  if (strip) k = k.replace(/[().,\-&、 '/\\@_$!]/g, '');
  k = k.trim();
  return caseSensitive ? k : k.toLowerCase();
}
