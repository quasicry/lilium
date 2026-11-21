// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry
/**
 * lilium 內嵌字體接線 —— 確保內嵌字體在編輯器與閱讀器渲染、無豆腐塊
 *
 * 背景：src/vendor/noto-fonts.generated.ts 與 siddham-lantsa.generated.ts 隨交接樹
 * 進入 lilium，但原接線（fonts.ts FontManager 827 行）留在 lilium 樹裡
 * 兩個 generated 檔是無消費者死檔，字體從未落盤、@font-face 從未注入＝蒙古文/悉曇/
 * 蘭札/藏文/婆羅米等文種在編輯器與閱讀視圖必然豆腐塊。
 *
 * 本模組做 lilith ensureBundledFonts＋FontManager.faceCss 的最小等價接線：
 *  1. 首次載入把 12 款內嵌字體落盤到 `.lilium/fonts/`（已存在則跳過；OFL-1.1 授權相容）；
 *  2. 對每款生成 @font-face（adapter.getResourcePath 本地 URL，font-display:block——
 *     這些字體承擔「沒有正確字形就等於亂碼」的文種，block 避免先豆腐再閃字）；
 *  3. 注入 document.head（編輯器 / markdown 閱讀視圖 / 預覽共用同一 document，
 *     注入一次全端可用）；提供 reattach() 兜底（layout-change 時 head 被清則重掛）。
 *
 * 與 lilith FontManager 的差異：不含字體下載/導入/覆蓋率探測/字體棧裝配（lilium 無此 UI），
 * 族名直接取 generated 檔自報 family——與 generated 檔 scripts 欄位的文種對應保持原樣。
 */

import { App, Platform, normalizePath } from "obsidian";
import { BUNDLED_NOTO_FONT_FILES } from "./vendor/noto-fonts.generated";
import { BUNDLED_SIDDHAM_LANTSA_FONT_FILES } from "./vendor/siddham-lantsa.generated";
import { BUNDLED_DOULOS_FONT_FILES } from "./vendor/doulos-sil.generated";

/** vault 內字體安裝目錄（. 開頭不索引；與 lilium 品牌一致用 .lilium/fonts） */
export const FONT_DIR = ".lilium/fonts";

let faceStyle: HTMLStyleElement | null = null;
let stackStyle: HTMLStyleElement | null = null;

function formatFor(fileName: string): string {
  if (/\.woff2$/i.test(fileName)) return "woff2";
  if (/\.otf$/i.test(fileName) || /\.otc$/i.test(fileName)) return "opentype";
  if (/\.woff$/i.test(fileName)) return "woff";
  return "truetype";
}

/** CSS family 轉義：字體自報族名理論上可含 `"` 或 `\\`，不轉義整條規則失效 */
function cssEscape(family: string): string {
  // 引號/反斜線走正則；控制字符以碼點動態判定（避免控制字符正則字面）
  const out = family.replace(/["\\]/g, (c) => `\\${c}`);
  let needsCtl = false;
  for (const ch of out) {
    const code = ch.charCodeAt(0);
    if (code < 0x20) { needsCtl = true; break; }
  }
  if (!needsCtl) return out;
  let out2 = "";
  for (const ch of out) {
    const code = ch.charCodeAt(0);
    out2 += code < 0x20 ? `\\${ch}` : ch;
  }
  return out2;
}

/**
 * 內嵌字體落盤＋@font-face 注入。冪等：字體檔已存在則只重建注入樣式。
 * 失敗（只讀 vault / 權限受限）降級為靜默——插件照常載入，文種回退系統字體。
 */
/** 全部內嵌字體（Noto + 悉曇蘭札 + Doulos SIL） */
function allBundledFonts() {
  return [...BUNDLED_NOTO_FONT_FILES, ...BUNDLED_SIDDHAM_LANTSA_FONT_FILES, ...BUNDLED_DOULOS_FONT_FILES];
}

export async function ensureBundledFonts(app: App): Promise<void> {
  try {
    // 路徑一律過 normalizePath（跨端統一分隔符／前導斜線），exists 失敗視為不存在（.catch→false）。
    // 寫入路徑固定 `.lilium/fonts`。
    const fontDir = normalizePath(FONT_DIR);
    if (!(await app.vault.adapter.exists(fontDir).catch(() => false))) {
      await app.vault.adapter.mkdir(fontDir);
    }
  } catch (e) {
    console.error("[lilium] 字體目錄創建失敗（vault 只讀？），降級為系統字體:", e);
    return;
  }

  const all = allBundledFonts();
  // 移動端啟動卡頓防範：內嵌字體 exists 檢查並行（串行 flash IO 在移動端明顯慢）。
  let existResults: boolean[];
  try {
    existResults = await Promise.all(all.map((f) => app.vault.adapter.exists(`${FONT_DIR}/${f.fileName}`).catch(() => false)));
  } catch { existResults = all.map(() => false); }
  const rules: string[] = [];
  for (let fi = 0; fi < all.length; fi++) {
    const f = all[fi];
    const target = `${FONT_DIR}/${f.fileName}`;
    try {
      if (!existResults[fi]) {
        const bin = Uint8Array.from(atob(f.base64), (c) => c.charCodeAt(0));
        await app.vault.adapter.writeBinary(target, bin.buffer);
      }
    } catch (e) {
      console.error(`[lilium] 內嵌字體寫入失敗 ${f.fileName}:`, e);
      continue;
    }
    try {
      const url = app.vault.adapter.getResourcePath(target);
      rules.push(
        `@font-face{font-family:"${cssEscape(f.family)}";src:url("${url}") format("${formatFor(f.fileName)}");font-weight:400;font-style:normal;font-display:block;}`,
      );
    } catch (e) {
      console.error(`[lilium] 內嵌字體 URL 生成失敗 ${f.fileName}:`, e);
    }
  }
  if (!rules.length) return;

  // 正文字體棧兜底：@font-face 只「註冊」族名，瀏覽器在元素 font-family 棧
  // 找不到該族時不會用它。Obsidian 正文的 font-family 實測不引用 var(--font-text)
  // （app.css 用 override/text-theme/text-default 組合直寫，注入 --font-text 變數
  // 不會被 font-family 消費——實機 CDP 實錘 computed fontFamily 不含注入族）。
  // 故直接在正文容器級追加：font-family: var(--font-text), <13 族>——主題族優先
  // 不變（var(--font-text) 展開即用戶主題/設定族鏈），文種字元在主題族中缺字形時
  // 逐族 fallback 到內嵌字體。覆蓋閱讀器（.markdown-preview-view/.markdown-rendered）
  // 與編輯器（.cm-content）兩路。
  try {
    const families = [...new Set(all.map((f) => `"${cssEscape(f.family)}"`))];
    const tail = families.join(", ");
    stackStyle?.remove();
    stackStyle = createEl("style");
    stackStyle.id = "lilium-fontstack";
    stackStyle.textContent =
      `body, .markdown-preview-view, .markdown-rendered, .cm-editor .cm-content, .cm-editor .cm-scroller ` +
      `{ font-family: var(--font-text), ${tail}, sans-serif !important; }` +
      // 匯出 MD／代碼塊：code 元素走 --font-monospace（無文種字形），等寬主族保留、
      // 文種字元 fallback 到內嵌族（translit 匯出把原文/輸出放 code fence——實機實錘豆腐）。
      // 覆蓋閱讀模式（pre/code）與編輯模式（.cm-hmd-codeblock 等含 code 字樣的 span）。
      `.markdown-rendered code, .markdown-rendered pre, ` +
      `.cm-editor span[class*="code"] ` +
      `{ font-family: var(--font-monospace), ${tail}, monospace !important; }`;
    document.head.appendChild(stackStyle);
  } catch (e) {
    console.warn("[lilium] 正文字體棧追加失敗（正文文種回退系統字體）:", e);
  }

  faceStyle?.remove();
  faceStyle = createEl("style");
  faceStyle.id = "lilium-fontfaces";
  faceStyle.textContent = rules.join("\n");
  document.head.appendChild(faceStyle);
}

/**
 * 兜底：任何版面重排把 head 樣式清掉時重新掛回（冪等、便宜）。
 * 僅桌面端 layout-change 調用（Platform.isMobile 上 head 生命週期不同，未測先不開）。
 */
export function reattachBundledFontFaces(): void {
  if (Platform.isMobile) return;
  if (faceStyle && document.head && !document.head.contains(faceStyle)) {
    document.head.appendChild(faceStyle);
  }
  if (stackStyle && document.head && !document.head.contains(stackStyle)) {
    document.head.appendChild(stackStyle);
  }
}

export function unloadBundledFontFaces(): void {
  faceStyle?.remove();
  faceStyle = null;
  stackStyle?.remove();
  stackStyle = null;
}

/**
 * 辭典詞條 srcdoc iframe 內嵌字體支持。
 * iframe 是獨立文檔：主文檔 head 注入的 @font-face 在其中不可見；且 srcdoc 內
 * app:// 資源 URL 載入一律失敗（Obsidian 1.14 跨 origin 阻擋）——字體須以
 * data: URL 內聯。此處直接從 base64 內嵌數據生成（不依賴 vault 落盤狀態）。
 *
 * text 過濾（效能修復）：全量 16 款字體 base64 約 3.2MB——每個詞條 iframe 的
 * srcdoc 都內聯全量會使每次查詞 parse 增加數十至數百 ms（移動端尤甚，實機
 * 量測桌面單次 63ms）。按詞條文本實際出現的碼位只注入所需文種族：
 * 無文種碼位的詞條注入 0 條規則，srcdoc 體積不膨脹。
 */
const FRAME_SCRIPT_RANGES: Array<[number, number, string]> = [
  [0x11a00, 0x11a4f, "Noto Sans Zanabazar Square"],
  [0x11a50, 0x11aaf, "Noto Sans Soyombo"],
  [0x11c70, 0x11cb6, "Noto Sans Marchen"],
  [0x10a00, 0x10a5f, "Noto Sans Kharoshthi"], // Kharoshthi U+10A00–U+10A5F
  [0x11000, 0x1107f, "Noto Sans Brahmi"], // Brahmi U+11000–U+1107F
  [0xa840, 0xa87f, "Noto Sans PhagsPa"],
  [0x0f00, 0x0f47, "Noto Serif Tibetan"],
  [0x0900, 0x094f, "Noto Sans Devanagari"],
  [0x0d80, 0x0dff, "Noto Sans Sinhala"],
  [0x1800, 0x18af, "Noto Sans Mongolian"],
  [0x0600, 0x06ff, "Noto Naskh Arabic"],
  [0x10c00, 0x10c4f, "Noto Serif Old Uyghur"],
  [0x11580, 0x115ff, "Noto Sans Siddham"], // Siddham U+11580–U+115FF
  [0x11d40, 0x11d5f, "Nithya Ranjana DU"],
  // Doulos SIL：IPA 擴展音標與拼音/轉寫用拉丁擴展（編輯器主棧已全量覆蓋，此處供詞條 iframe 按需內聯）
  [0x0250, 0x02af, "Doulos SIL"], // IPA Extensions
  [0x1d00, 0x1d7f, "Doulos SIL"], // Phonetic Extensions
  [0x1d80, 0x1dbf, "Doulos SIL"], // Phonetic Extensions Supplement
  [0x0300, 0x036f, "Doulos SIL"], // Combining Diacritical Marks（拼音聲調）
  [0x1dc0, 0x1dff, "Doulos SIL"], // Combining Diacritical Marks Supplement
];

function familiesForText(text: string): Set<string> {
  const need = new Set<string>();
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0;
    for (const [lo, hi, fam] of FRAME_SCRIPT_RANGES) {
      if (cp >= lo && cp <= hi) need.add(fam);
    }
  }
  return need;
}

export function bundledFontFaceCssForFrame(text: string): string {
  const need = familiesForText(text);
  const all = allBundledFonts();
  return all
    .filter((f) => need.has(f.family))
    .map(
      (f) =>
        `@font-face{font-family:"${cssEscape(f.family)}";src:url(data:font/${formatFor(f.fileName)};base64,${f.base64}) format("${formatFor(f.fileName)}");font-weight:400;font-style:normal;font-display:block;}`,
    )
    .join("\n");
}

/** iframe 內正文字體棧兜尾：主題族優先不變、文種字元逐族 fallback 到內嵌族（按文本過濾）。 */
export function bundledFontFamilyTail(text: string): string {
  const need = familiesForText(text);
  const all = allBundledFonts();
  return [...new Set(all.filter((f) => need.has(f.family)).map((f) => `"${cssEscape(f.family)}"`))].join(", ");
}
