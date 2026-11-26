// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry
/**
 * lilium 辭典 — MDD resource resolution & asset storage.
 *
 * MDX html references resources like:
 *   <img src="/usr/share/dict/xxx.png">, <img src="apple.png">,
 *   <a href="sound://pron.mp3">, background-image: url(entry:bg:xxx.png)
 * The .mdd companion stores them under keys like "\usr\share\dict\xxx.png".
 *
 * Flow: plugin extracts .mdd assets to a vault folder on import
 * (.lilium-assets/<dictId>/...) so <img>/<audio> can reference them via
 * app://local URLs; CSS/JS from the .mdd are applied to the article iframe.
 */

import { MdictReader, type MdictEntry } from './mdict';

export interface ExtractedAsset {
  /** original mdd key */
  mddKey: string;
  /** vault-relative path where the asset was written */
  vaultPath: string;
  kind: 'image' | 'audio' | 'css' | 'js' | 'font' | 'other';
  size: number;
  /**
   * 字體自報的 CSS family（font-name.ts 解析 name 表，如 koktai.TTF → "Calibri"）。
   * 渲染期 @font-face 用它對齊詞條/CSS 實際引用的字體名；非字體資產或解析失敗留空。
   */
  fontFamily?: string;
}

/** C6：資源 kind 判定的單一來源（loader extractTeiTarAssetMembers 同源引用）。 */
export const ASSET_KIND_RES: Record<'image' | 'audio' | 'css', RegExp> = {
  image: /\.(png|jpe?g|gif|webp|bmp|svg)$/,
  audio: /\.(mp3|wav|ogg|m4a|aac|flac|spx)$/,
  css: /\.css$/,
};

export function classifyAsset(key: string): ExtractedAsset['kind'] {
  const lower = key.toLowerCase();
  if (ASSET_KIND_RES.image.test(lower)) return 'image';
  if (ASSET_KIND_RES.audio.test(lower)) return 'audio';
  if (ASSET_KIND_RES.css.test(lower)) return 'css';
  if (/\.js$/.test(lower)) return 'js';
  if (/\.(ttf|otf|woff2?|eot)$/.test(lower)) return 'font';
  return 'other';
}

/** Rewrite resource references inside MDX html to vault asset paths */
export function rewriteResourceRefs(
  html: string,
  resolver: (path: string) => { vaultPath: string } | null,
  toAppUrl: (vaultPath: string) => string,
): string {
  // <img src="...">, <script src>, <link href>, url(...) in style attrs, sound:// links
  let out = html;

  // sound:// or audio hrefs → data-less anchors become <audio> if resolvable
  out = out.replace(/(src|href)\s*=\s*("([^"]*)"|'([^']*)')/gi, (m: string, attr: string, _q: string, dq?: string, sq?: string) => {
    const url = (dq ?? sq ?? '').trim();
    if (!url) return m;
    if (/^(https?|app|data|blob|vault|capacitor):/i.test(url)) return m;
    const cleaned = url
      // B5：bword 是詞條引用不是資源路徑——剝除清單移除 bword（view.ts:1425 點擊分支
      // 獨立處理 bword: 查詢跳轉，不經此資源 resolver）
      .replace(/^(sound|entry|entrybg|background):\/\//i, '')
      .replace(/^\//, '');
    const resolved = resolver(cleaned);
    if (!resolved) return m;
    // 原位發音根治：音頻連結保留原始資源路徑在 data-li-snd——宿主側點擊分支
    // 直呼與標題 ▶ 同源的管線（resolveAsset→readBinary→spx 解碼→blob 播放），
    // 不再依賴 app:// href 正則還原 vault 路徑（Obsidian 1.14+ requestUrl 對
    // app:// 拋錯、vault 佈局正則時好時壞——歷史「點了沒反應」根因）。
    const isAudio = /\.(mp3|wav|ogg|m4a|aac|flac|spx)$/i.test(cleaned);
    return `${attr}="${toAppUrl(resolved.vaultPath)}"${isAudio ? ` data-li-snd="${cleaned}"` : ''}`;
  });

  // inline style url(...)
  out = out.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (m, _q, url: string) => {
    if (/^(https?|app|data|blob):/i.test(url)) return m;
    const cleaned = url.replace(/^\//, '');
    const resolved = resolver(cleaned);
    if (!resolved) return m;
    return `url(${toAppUrl(resolved.vaultPath)})`;
  });

  return out;
}

/** Extract selected asset kinds from an mdd reader into the vault. */
export async function extractMddAssets(
  mdd: MdictReader,
  opts: {
    writeBinary: (vaultPath: string, data: Uint8Array) => Promise<void>;
    vaultFolder: string;
    dictId: string;
    /** limit total extracted bytes to keep vaults lean (default 48MB) */
    maxTotalBytes?: number;
    kinds?: ExtractedAsset['kind'][];
    onProgress?: (done: number, total: number) => void;
  },
): Promise<{ assets: ExtractedAsset[]; skipped: number }> {
  const kinds = opts.kinds || ['image', 'audio', 'css', 'font'];
  let budget = opts.maxTotalBytes ?? 800 * 1024 * 1024; // 800MB（大辭典資源全量抽取）
  const assets: ExtractedAsset[] = [];
  let skipped = 0;
  const total = mdd.entryCount;

  // 小檔優先：按資源大小升序抽取——防止前期大檔（長音訊）吃光預算後，
  // 排在後面的小圖片/樣式/字體全部被掐掉（廣韻詞典實測：48MB 預算被大 wav
  // 用滿，4 張 png 只抽到 2 張、219 個 wav 只抽到 149 個）。
  const wanted = mdd.entries.filter((entry) => kinds.includes(classifyAsset(entry.keyText)));
  const sized: { entry: MdictEntry; size: number }[] = [];
  for (const entry of wanted) {
    try {
      const data = mdd.getResource(entry.keyText);
      if (data && data.length) sized.push({ entry, size: data.length });
      else skipped++;
    } catch {
      skipped++;
    }
  }
  sized.sort((a, b) => a.size - b.size);

  let done = 0;
  for (const { entry, size } of sized) {
    done++;
    // 大辭典卡頓防範：每 64 條讓出主線程一幀——數百 MB mdd 數千條提取
    // 同步循環會凍結 UI（移動端尤甚）。
    if (done % 64 === 0) {
      opts.onProgress?.(done, total);
      await new Promise<void>((r) => window.setTimeout(r, 0)); // B6：popout window 相容（obsidianmd/prefer-window-timers）
    }
    const kind = classifyAsset(entry.keyText);
    // 小檔（≤256KB）不受預算限制——圖片/樣式/小音檔優先保全
    if (budget <= 0 && size > 256 * 1024) { // 後備：預算盡時仍放行 ≤256KB 小檔
      skipped++;
      continue;
    }
    try {
      const data = mdd.getResource(entry.keyText);
      if (!data || !data.length) {
        skipped++;
        continue;
      }
      const safeName = entry.keyText
        .replace(/^[\\/]+/, '')
        .replace(/[\\/:*?"<>|]/g, '_');
      const vaultPath = `${opts.vaultFolder}/${opts.dictId}/${safeName}`;
      await opts.writeBinary(vaultPath, data);
      budget -= size;
      assets.push({ mddKey: entry.keyText, vaultPath, kind, size });
    } catch {
      skipped++;
    }
  }
  opts.onProgress?.(total, total);
  return { assets, skipped };
}

/** Build a resolver that maps resource paths to extracted assets.
 *  medict's FindFromDir pattern: a caller-supplied "loose file" probe runs
 *  FIRST (dictionary folder often ships bare resources next to the .mdx), then
 *  the extracted .mdd assets by full path, then by base name. */
export function createAssetResolver(
  assets: ExtractedAsset[],
  looseFileProbe?: (relativePath: string) => ExtractedAsset | null,
): (path: string) => ExtractedAsset | null {
  const byFull = new Map<string, ExtractedAsset>();
  const byName = new Map<string, ExtractedAsset>();
  for (const a of assets) {
    const norm = a.mddKey.replace(/^[\\/]+/, '').replace(/[\\/]/g, '/').toLowerCase();
    if (!byFull.has(norm)) byFull.set(norm, a);
    const base = norm.split('/').pop() || norm;
    if (!byName.has(base)) byName.set(base, a);
  }
  return (path: string) => {
    const norm = path.replace(/^[\\/]+/, '').replace(/[\\/]/g, '/').split('?')[0].toLowerCase();
    // 1) loose file in the dictionary folder wins (medict FindFromDir)
    if (looseFileProbe) {
      const loose = looseFileProbe(norm);
      if (loose) return loose;
    }
    return byFull.get(norm) || byName.get(norm.split('/').pop() || '') || null;
  };
}
