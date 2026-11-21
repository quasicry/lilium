// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry
/**
 * 轉寫方案的 UI 呈現層：檢字表渲染、方案下拉選單填充、文種分組標籤。
 *
 * 獨立成檔的原因：設定頁（全部方案、逐組展開）與閱讀視圖右側欄（單一方案、
 * 折疊顯示）共用同一套渲染邏輯；若放在 settings.ts 會讓 view.ts 反向依賴
 * 設定頁（進而牽連 main.ts，形成循環引用）。本檔案只依賴 translit-common
 * （型別）與 i18n（翻譯函式），不 import obsidian 運行時。
 *
 * DOM 構造使用 Obsidian 提供的 HTMLElement.createEl/createDiv 擴充（全局型別
 * 增補，無需 import），因此在 Obsidian 主程序與測試打包環境中皆可用。
 */

import type { CharTableEntry, TransliterationScheme } from "./translit-common";
import { SCRIPTS, type ScriptId } from "./languages";
import { buildScriptFontStack } from "./font-registry";

/**
 * 文稿文種 → 應預選的轉寫方案 id。右側欄檢字表切換文件時用它自動預選；
 * 用戶一旦手動選過就以用戶選擇為準，不再自動改。
 *
 * 為何直接指到方案 id 而不是分組：同一分組內可能有多個主方案，
 * 只給分組可能預選到同組內的另一個方案。
 * 無對應方案的文種（han / latin / arabic …）不列入 → 沿用上次。
 *
 * 選擇依據（見 docs/IME-USER-HABIT-RESEARCH.md）：一律取該文種最通行的
 * 「輸入法 / 學界習慣」方案——Wylie、IAST、ULY、Möllendorff；
 * 巴利文獻系統（僧伽羅）沿用 -pali 方案。
 */
export const SCRIPT_PREFERRED_SCHEME: Partial<Record<ScriptId, string>> = {
  tibetan: "tibetan-wylie",
  sanskrit: "sanskrit-iast",
  pali: "pali-iast",
  uyghur: "uyghur-uly",
  // 回鶻文（U+10F70–U+10FAF）與現代維吾爾文（阿拉伯字母）是**不同文種、不同區段**：
  // 舊版暫指 uyghur-uly 會把回鶻文送去阿拉伯字母方案。現已註冊獨立方案 olduyghur。
  olduyghur: "olduyghur",
  manchu: "manchu-mollendorff",
  xibe: "manchu-mollendorff",
  sinhala: "sinhala-pali",
  mongolian: "mongolian",
  // 蒙古文 / 錫伯文說明：錫伯文與滿文共用蒙古文 Unicode 區段，暫歸滿文方案；
  // 蒙古文已註冊學術轉寫方案（mongolian），故可預選（Ali Gali 仍無獨立 ScriptId，由用戶手選）。
  siddham: "siddham-iast",
  // 佉盧虱吒文（Kharoṣṭhī）：犍陀羅語文獻轉寫（Glass 2000 約定）
  kharoshthi: "gandhari-iast",
  // 婆羅米文（Brahmi）：阿育王銘文與巴利/梵文文獻轉寫（IAST 約定）
  brahmi: "brahmi-iast",
  phagspa: "phagspa-poppe",
  // 蘭札體 / Rañjanā 尚無標準 Unicode，本插件以 Devanagari 碼位（U+0900–U+097F）由字型渲染爲蘭札字形。
  // 已註冊專屬方案 ranjana-iast（與 sanskrit-iast 同構、輸出同碼位，檢字表歸「蘭札」分組）。
  ranjana: "ranjana-iast",
  // 瑪欽文：Wylie 同構（橫排 LTR）；方形札那巴札爾／索永布：Wylie 擴展（直排）
  marchen: "marchen",
  zanabazar: "zanabazar",
  soyombo: "soyombo",
};

/**
 * 轉寫方案分組 → 文種 id。檢字表第 1 列（原生文字）靠它取到該文種的字體棧。
 *
 * 背景：以前第 1 列完全沒有 font-family，直接繼承 Obsidian 的系統字體
 * 棧；用戶電腦沒裝蒙古文 / 藏文 / 悉曇等字體時就整列豆腐塊，而插件實際已
 * 把這些字體內嵌好了（見 fonts.ts 的 ensureBundledFonts）——缺的只是「誰去用它」。
 *
 * 為何用 group 而不是在 scheme 上加 script 欄位：20 個方案只有 10 個分組，
 * 改一張表的成本遠低於改 20 處註冊處，且不會遺漏。分組與文種基本 1:1，
 * 唯一的例外是 aligali（阿禮嘎禮以蒙古文字母轉寫梵文，故用蒙古文字體棧）。
 *
 * ⚠️ 新增轉寫方案分組時必須同步補此表，否則該組檢字表仍會是豆腐塊。
 *    test/run.mjs 的「轉寫分組 → 文種映射完整」斷言會攔住遺漏。
 */
export const SCHEME_GROUP_SCRIPT: Record<string, ScriptId> = {
  tibetan: "tibetan",
  sanskrit: "sanskrit",
  // 蘭札體：Devanagari 碼位承載，字型用內嵌 Nithya Ranjana DU（SCRIPTS.ranjana.fontStack）
  ranjana: "ranjana",
  pali: "pali",
  siddham: "siddham",
  // 佉盧虱吒文（Kharoṣṭhī）：犍陀羅語文字，唯一 RTL 婆羅米文
  kharoshthi: "kharoshthi",
  // 婆羅米文（Brahmi）：印度系文字之祖，橫排 LTR
  brahmi: "brahmi",
  // 八思巴文（'Phags-pa）：元朝國字，垂直書寫
  phagspa: "phagspa",
  // 阿禮嘎禮：蒙古文字母轉寫梵文咒音，字形落在蒙古文區段
  aligali: "mongolian",
  sinhala: "sinhala",
  uyghur: "uyghur",
  // 回鶻文（U+10F70–U+10FAF）與現代維吾爾文（阿拉伯字母）是不同文種，勿合併
  olduyghur: "olduyghur",
  mongolian: "mongolian",
  manchu: "manchu",
  // Marchen：Wylie 同構，橫排 LTR
  marchen: "marchen",
  // 札那巴札爾方體字：Wylie 擴展三態疊字，直排
  zanabazar: "zanabazar",
  // 索永布文：Wylie 擴展四態（+ subjoiner／<gm> gemination／- 音節尾），直排
  soyombo: "soyombo",
};

/**
 * 依「轉寫方案分組」取該文種的 CSS font-family 值；查不到返回 null。
 *
 * 與修檢字表豆腐塊走同一張表（SCHEME_GROUP_SCRIPT）——校勘面板的長文本
 * 轉寫輸出複用此函式，避免「檢字表有字體、輸出區是豆腐」的漂移。
 *
 * @param group `TransliterationScheme.group`，如 tibetan / sanskrit
 * @returns 可直接寫進 CSS 變數的字體棧字串，或 null（此時呼叫端應不設變數，
 *          讓 CSS fallback 到 inherit）
 */
export function groupFontStack(group: string): string | null {
  const scriptId = SCHEME_GROUP_SCRIPT[group];
  if (!scriptId) return null;
  // 走 buildScriptFontStack 讓用戶導入的字體也能參與檢字表渲染
  const stack = buildScriptFontStack(scriptId);
  if (!stack || !stack.length) return null;
  return cssFontStack(stack);
}

/**
 * 字體棧 → CSS font-family 值。
 * 含空格的族名必須加引號（`Noto Sans Mongolian`），泛用族（serif / sans-serif）
 * 反而不能加引號——加了會被當成具體字體名去找，找不到就掉回預設。
 */
export function cssFontStack(stack: string[]): string {
  return stack.map((f) => {
    const t = f.trim();
    // 純 [A-Za-z0-9_-] 視為泛用族或單詞族，原樣輸出
    return /^[A-Za-z0-9_-]+$/.test(t) ? t : `"${t.replace(/"/g, "")}"`;
  }).join(", ");
}

/**
 * 轉寫方案分組 → 書寫規範（排版模式＋行內方向）。
 *
 * 右面板轉寫規範化：用戶**先選文種**、未選則禁用輸入框；
 * 選定後輸入框與輸出框跟隨該文種的書寫規範（直排/橫排、行進方向）。
 * **羅馬字一方恆為橫排 LTR**——無論轉寫方向，羅馬字輸入/輸出框一律
 * horizontal-tb + ltr（拉丁字母不存在直排書寫傳統）。
 *
 * 單一真源：不另維護第二份方向表，直接查 SCHEME_GROUP_SCRIPT →
 * SCRIPTS（languages.ts 的權威文種表）的 writingMode / bidi / textOrientation。
 * 新增分組時補 SCHEME_GROUP_SCRIPT 即可，此函式自動跟上。
 *
 * 滾動軸注意：直排（vertical-*）容器的溢出軸是**水平的**——
 * max-height/縱向捲動在直排下無效，呼叫端必須改用 max-inline-size
 * （邏輯屬性會隨 writing-mode 自動翻轉到正確的物理軸）。
 */
export interface WritingStyle {
  /** CSS writing-mode 值 */
  mode: "vertical-rl" | "vertical-lr" | "horizontal-tb";
  /** CSS direction 值（行內方向） */
  dir: "ltr" | "rtl";
  /** CSS text-orientation 值（直排字形立放/旋轉） */
  orientation: "mixed" | "upright" | "sideways";
}

export function groupWritingStyle(group: string): WritingStyle {
  const scriptId = SCHEME_GROUP_SCRIPT[group];
  // 查不到分組 → 橫排 LTR 兜底（與未規範化前的行為一致，不會更糟）
  if (!scriptId) return { mode: "horizontal-tb", dir: "ltr", orientation: "mixed" };
  const spec = SCRIPTS[scriptId];
  if (!spec) return { mode: "horizontal-tb", dir: "ltr", orientation: "mixed" };
  return {
    mode: spec.writingMode,
    dir: spec.bidi,
    orientation: spec.textOrientation,
  };
}

/**
 * 文種分組標籤：取 `set.translitGroup.<group>` 翻譯，缺失時回退分組鍵名 */
export function translitGroupLabel(T: (key: string) => string, group: string): string {
  const key = `set.translitGroup.${group}`;
  const raw = T(key);
  return raw === key ? group : raw;
}

/** 方案顯示名：依當前語系取 label，逐級回退到 id */
export function schemeLabel(scheme: TransliterationScheme, lang?: string): string {
  const L = scheme.label;
  const order = lang ? [lang, "zh", "zh-TW", "en"] : ["zh", "zh-TW", "en"];
  for (const k of order) {
    const v = L[k];
    if (v) return v;
  }
  return scheme.id;
}

/**
 * 共用的檢字表渲染：把單一轉寫方案的 charTable 渲染成表格。
 * 設定頁（全部方案）與閱讀視圖右側欄（單一方案、折疊）共用此函式，
 * 避免兩處邏輯漂移。按 section 分組顯示。
 */
export function renderCharTableInto(
  host: HTMLElement,
  scheme: TransliterationScheme,
  T: (key: string) => string
): void {
  if (!scheme.charTable || scheme.charTable.length === 0) {
    host.createDiv("li-char-table-empty").setText(T("set.translitTableEmpty"));
    return;
  }
  const table = host.createEl("table", { cls: "li-char-table" });
  // 第 1 列是各文種原生文字：把該文種的字體棧寫成 CSS 變數，交由 styles.css 套用。
  // 走 CSS 變數而非 inline style，是為了保留主題 / 用戶覆寫的空間，也避免行內
  // 樣式在三個呼叫點各長一份。group 未登錄時不設值，CSS 的 fallback 會保底。
  const tableScript = SCHEME_GROUP_SCRIPT[scheme.group];
  if (tableScript) {
    const stack = buildScriptFontStack(tableScript);
    if (stack && stack.length) table.style.setProperty("--li-ct-font", cssFontStack(stack));
  }
  const thead = table.createEl("thead");
  const headerRow = thead.createEl("tr");
  headerRow.createEl("th", { text: T("set.translitNative") });
  headerRow.createEl("th", { text: T("set.translitRoman") });
  headerRow.createEl("th", { text: T("set.translitNote") });

  // 按 section 分組顯示
  const sections = new Map<string, CharTableEntry[]>();
  for (const row of scheme.charTable) {
    const sec = row.section || T("set.translitOther");
    const list = sections.get(sec) ?? [];
    list.push(row);
    sections.set(sec, list);
  }

  // section 標題直出中文 → 常用類目走 i18n 鍵映射；未映射者原樣透傳。
  const SECTION_I18N: Record<string, string> = {
    "元音": "set.translitSection.vowel",
    "輔音": "set.translitSection.consonant",
    "符號": "set.translitSection.symbol",
    "數字": "set.translitSection.digit",
    "標點": "set.translitSection.punct",
    "拼寫規則": "set.translitSection.spelling",
  };

  const tbody = table.createEl("tbody");
  for (const [section, rows] of sections) {
    const sectionText = SECTION_I18N[section] ? T(SECTION_I18N[section]) : section;
    const secRow = tbody.createEl("tr", { cls: "li-char-table-section" });
    const secCell = secRow.createEl("td", { attr: { colspan: "3" }, text: sectionText });
        secCell.addClass("li-collation-sec-cell");
    // 分組級說明只渲染一次於節首（rows[0].sectionNote），行級 note 留給逐字差異。
    const secNote = rows[0]?.sectionNote;
    if (secNote) {
      const noteRow = tbody.createEl("tr", { cls: "li-char-table-secnote" });
      noteRow.createEl("td", { attr: { colspan: "3" }, text: secNote });
    }
    for (const row of rows) {
      const tr = tbody.createEl("tr");
      tr.createEl("td", { text: row.native });
      tr.createEl("td", { text: row.roman });
      tr.createEl("td", { text: row.note || "" });
    }
  }
}

/**
 * 把已註冊方案按分組填進 <select>（用 <optgroup> 分組）。
 * @returns 方案中選後應預設選中的 id（preferredId 存在則用之，否則第一個主方案 / 第一個）
 */
export function fillSchemeSelect(
  select: HTMLSelectElement,
  schemes: TransliterationScheme[],
  T: (key: string) => string,
  preferredId?: string | null
): string | null {
  select.empty();
  // 收集 group，保持註冊順序
  const groups = new Map<string, TransliterationScheme[]>();
  for (const scheme of schemes) {
    const list = groups.get(scheme.group) ?? [];
    list.push(scheme);
    groups.set(scheme.group, list);
  }
  for (const [group, list] of groups) {
    const og = select.createEl("optgroup", { attr: { label: translitGroupLabel(T, group) } });
    for (const scheme of list) {
      og.createEl("option", {
        text: schemeLabel(scheme) + (scheme.primary ? "" : `（${T("set.translitAlt")}）`),
        attr: { value: scheme.id },
      });
    }
  }
  // 預設選中：優先用 preferredId，否則該文種主方案，再否則第一個
  const fallback = (schemes.find((s) => s.primary) ?? schemes[0])?.id ?? null;
  const wanted = preferredId && schemes.some((s) => s.id === preferredId) ? preferredId : fallback;
  if (wanted) select.value = wanted;
  return wanted;
}
