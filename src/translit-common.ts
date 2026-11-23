// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry
/**
 * 轉寫方案共享層：集中管理所有文種的轉寫方案註冊表、檢字表數據接口，
 * 以及「罕見 / 擴展字符」三態處理策略（透傳 / 擴展 token / 報錯）。
 *
 * 設計原則（見 docs/RARE-EXTENDED-CHARS-RESEARCH.md）：
 *  - 每個文種的轉寫方案以一條 `TransliterationScheme` 註冊進 TRANSLIT_REGISTRY，
 *    命令、設定 UI 的「檢字表」、即時上屏都從同一註冊表取數，避免重複與漂移。
 *  - 推薦方案（primary）與備選方案（altOf 指向 primary）共存；用戶操作層以
 *    顯式命令 id 隔離，絕不讓兩套方案自動互轉時撞名（docs/INDIC-ALIGALI-RESEARCH.md 衝突矩陣）。
 *  - 罕見字符預設優雅透傳（不丟失、不亂碼）；擴展模式用「前綴 token」無損標記；報錯模式顯式提示。
 *
 * 本檔案不依賴 Obsidian，且不得拋出未捕獲異常（被命令 / 即時上屏層 try/catch 守護）。
 */

export type RarePolicy = "passthrough" | "extended" | "error";

export interface TransliterationOptions {
  /** 罕見字符策略；命令層從設置讀取後傳入 */
  rarePolicy?: RarePolicy;
  /**
   * X-近似歧義偏好（r45c）：出向對「Aksharamukha 自標 Approximate equivalent」
   * 多值點的取樣。auto＝引擎默認（拼出形/短式統一）；"spelled"＝強制拼出形；
   * "codepoint"＝缺項/專用碼位以 \uXXXX esc 標註保留（可逆）；
   * "longvowel"＝長式優先（sinhala ඒ/ඕ 出 ē/ō，非短式統一）。
   */
  xApprox?: "auto" | "spelled" | "codepoint" | "longvowel";
  /** 文種自定義開關（如傣文寄存器標記、IAST↔HK 備選等） */
  [key: string]: unknown;
}

/** 檢字表單元：原生字符 ↔ 羅馬字，供設定 UI 渲染與即時上屏參照 */
export interface CharTableEntry {
  /** 原生文字字符（可多字符，如梵文合字） */
  native: string;
  /** 羅馬字 token */
  roman: string;
  /** 備註（高/低聲母、送氣、借詞來源等） */
  note?: string;
  /** 分組（子表，如「輔音 / 元音 / 韻尾 / 聲調」），UI 用於分段 */
  section?: string;
  /** 分組級說明：只渲染一次於節首（r117），行級 note 留給逐字差異 */
  sectionNote?: string;
}

export interface TransliterationScheme {
  /** 全局唯一 id（同時作命令後綴，如 tibetan-wylie） */
  id: string;
  /** 顯示名（多語；鍵用 DICT 的 LangCode，UI 依當前 uiLang 取，回退 en） */
  label: Record<string, string>;
  /** 歸組（折疊 UI 的分組鍵）：tibetan / sanskrit / pali / siddham / aligali / sinhala / uyghur / mongolian / manchu */
  group: string;
  /** 是否為該文種的推薦（主）方案 */
  primary: boolean;
  /** 若是備選方案，指向其主方案 id */
  altOf?: string;
  /**
   * 從用戶選擇面（方案下拉／檢字表下拉／命令面板）隱藏，但保留功能：
   * 轉寫引擎、自動識別、程序內部互轉照常
   * （梵文 HK/ITRANS/Velthuis/WX/Kolkata/SLP1＋悉曇 ITRANS 不再提供選擇）。
   */
  hiddenFromPicker?: boolean;
  /** 方案說明（設定 UI 副標題） */
  description?: string;
  /** 羅馬字 → 原生文字 */
  romanToNative(input: string, opts?: TransliterationOptions): string;
  /** 原生文字 → 羅馬字 */
  nativeToRoman(input: string, opts?: TransliterationOptions): string;
  /** 是否像該文種原生文字（用於自動方向判定 / 自動互轉作用域） */
  looksLikeNative(text: string): boolean;
  /** 是否像該文種羅馬字 */
  looksLikeRoman(text: string): boolean;
  /** 自動互轉（依輸入方向判定） */
  convert(input: string, opts?: TransliterationOptions): string;
  /** 檢字表（由映射表導出；缺失時 UI 退化為不顯示該方案表格） */
  charTable?: CharTableEntry[];
  /**
   * 長文本詞界標點映射（羅馬→原生方向）：transliterateLongText 的
   * flush 會把標點當詞界原樣透傳，繞過方案內部的標點轉換邏輯；
   * 需要輸出側標點正字法（如維吾爾 , → ،、? → ؟）的方案提供本表。
   */
  punctMap?: Record<string, string>;
  /**
   * 原生→羅馬方向「原生真空格」顯式 token（G-T1c）：transliterateLongText
   * 對方案聲明本欄位時，原生文字中的 U+0020 空格輸出為該 token（而非裸
   * 空格）——裸空格在入向會被恰 1 空格→分隔符規則（G-T1）誤轉（往返有損）。
   * 未聲明方案的空格維持透傳。
   */
  nativeSpaceToken?: string;
  /**
   * 羅馬方向「原子 token」正則（r65）：transliterateLongText 的詞界掃描
   * 對命中本正則的整段**不分詞、整體送轉換器**，且 gate 直接放行。
   * 背景：檢字表列出的標註 token（藏文 `<.>`／`\uXXXX`、婆羅米 `;1`／
   * `;100<jm>;4`）含詞界 trigger 字符（. ; \ < >），逐詞掃描會把它們切碎、
   * 碎片無拉丁字母被 gate 拒 → 真機實錘原樣透傳（引擎單測全通、面板全敗）。
   * 注意：正則須自我錨定（^…$ 或含 .*），掃描層從每個位置做整段測試。
   */
  romanTokenRe?: RegExp;
  /** native→roman 方向的原生原子 token 正則（^…$ 錨定）——蒙文標點 1800-180A
   * 是 TRIGGER_CHARS 詞界，掃描層直接透傳不出 <birga> token；聲明後掃描層在 trigger
   * 判定前先試最長前綴命中，命中即整體送 nativeToRoman。 */
  nativeAtomRe?: RegExp;
  /**
   * 全方案通用 esc 標註 token（f2-A）：`\uXXXXXX`／`\uXXXX` 顯式標註體例是引擎級
   * 慣例（parseEscCp 出向統一 6 位大寫 hex、入向 6 位無效回退 4 位），但 \\ 是詞界
   * trigger 字符——romanTokenRe 不覆蓋 esc 的方案，面板長文掃描會把標註切碎
   * （\\ → trigger 透傳、u00090D 成詞被 gate 拒），含 esc 的文本在掃描層整體
   * skipped 原樣透傳（真機實錘：sanskrit-itrans converted:0 skipped:3）。掃描層在
   * 方案 romanTokenRe 之後追加本正則的最長前綴測試（先 6 位後 4 位，與 parseEscCp
   * 同序），命中即整段原子送 romanToNative（引擎的 parseEscCp 原樣還原）。
   * esc 體例本身即「顯式標註」語義：文本作者用 \uXXXX 寫碼位，掃描層保其原子性
   * 不改變體例；不含 esc 的既有文本行為零變化。
   */
  escAnnotationToken?: boolean;
  /**
   * romanKeepChars: 方案羅馬字輸出中的「方案專屬標點」字符集（字面串）。
   * 長文本掃描的詞界判定（TRIGGER_CHARS）把 . " ; 等視作句讀切詞，
   * 但 Velthuis 的 .m/.n（鼻音化/virama 標記）與 "（ś）是詞內音標——
   * 被切詞則整詞破碎（sa.mj~nii -> sa | mj~nii 各自轉錯）。聲明後，
   * roman->native 方向掃描遇這些字符不作詞界、黏進詞緩衝整詞送引擎。
   * 安全性：latin gate 的形狀判定＋「轉換結果與原詞相同則 skip」兜底，
   * 一般西文正文不受影響（方案未聲明即行為零變化）。
   */
  romanKeepChars?: string;
  /**
   * 跳過「自動生成命令」。用於已有等價手寫命令的文種（滿文 / 蒙古文
   * 的歷史命令 id 已沿用），僅為補齊檢字表而註冊，避免命令面板出現
   * 功能重複的兩條同名命令。
   */
  skipAutoCommands?: boolean;
  /**
   * 疊字（consonant stack / conjunct）編碼模型聲明（r44a）。
   * 未聲明＝引擎按各方案自有的隱式判定（現狀，零行為變化）。
   *  - "implicit"：下加字靠語序規則＋專碼位（subjoined 區）判定——藏文、Marchen。
   *  - "explicit-subjoiner"：疊字必須顯式寫 subjoiner 字符——Zanabazar U+11A47、
   *    Soyombo U+11A99（Unicode 18 Ch.14 §14.6：virama 11A34 明文
   *    "not used for conjunct formation"，兩者互斥分工）。
   */
  stackModel?: {
    mode: "implicit" | "explicit-subjoiner";
    /** explicit 模式的 subjoiner 碼位（11A47 / 11A99） */
    subjoinerCp?: number;
    /** 梵/藏叢字形以獨立碼位存在（Zanabazar 11A3A–11A3E 的 r-/-ya/-ra/-la/-va） */
    contextualCluster?: boolean;
  };
}

const REGISTRY = new Map<string, TransliterationScheme>();

/** 註冊一個轉寫方案（重複 id 覆寫） */
export function registerScheme(scheme: TransliterationScheme): void {
  REGISTRY.set(scheme.id, scheme);
}

/** 取方案（未知返回 undefined） */
export function getScheme(id: string): TransliterationScheme | undefined {
  return REGISTRY.get(id);
}

/** 所有已註冊方案（按註冊順序） */
export function listSchemes(): TransliterationScheme[] {
  return Array.from(REGISTRY.values());
}

/** 所有已註冊方案中「可提供給用戶選擇」的子集——隱藏功能旗標（hiddenFromPicker）只收選擇面，不收引擎 */
export function listPickerSchemes(): TransliterationScheme[] {
  return listSchemes().filter((s) => !s.hiddenFromPicker);
}

/** 按歸組取方案（先主後備） */
export function schemesByGroup(group: string): TransliterationScheme[] {
  return listSchemes()
    .filter((s) => s.group === group)
    .sort((a, b) => Number(b.primary) - Number(a.primary));
}

/** 取某文種的主方案 */
export function primaryScheme(group: string): TransliterationScheme | undefined {
  return listSchemes().find((s) => s.group === group && s.primary);
}

/**
 * 跨文字轉換（星形拓撲）：native A → roman（樞紐）→ native B。
 *
 * 統一在此處做 NFC 正規化與選項傳遞，避免呼叫方各自為政（詳見
 * docs/PALI-CROSS-SCRIPT-RESEARCH.md §6.2 / §6.3）。NFC 很關鍵：NFD 輸入
 * （如 macOS 檔案系統或 PDF 複製出的分解形）會把組合字拆成基底+組合標記，
 * 例如僧伽羅 o(U+0DDC) 拆成 U+0DD9+U+0DCA，若不在入口正規化，基準句會靜默
 * 錯轉（namo → nameo）。
 */
export function convertScript(
  from: TransliterationScheme,
  to: TransliterationScheme,
  text: string,
  opts?: TransliterationOptions
): string {
  // P3-6：入口型別守衛——null/undefined/數字等非字串輸入不拋 TypeError，
  // 軟返回空串（與 transliterateText 的 no-text 慣例對齊：本檔案不得拋未捕獲異常）。
  if (typeof text !== "string") return "";
  const roman = from.nativeToRoman(text.normalize("NFC"), opts);
  return to.romanToNative(roman, opts);
}

/**
 * 【B2】區塊外字元 roman 輸出共用註記體例：⟨U+XXXX⟩（4 位大寫 hex）。
 * 取代舊 `'\uXXXXXX'` 6 位 hex 字面輸出（與掃描層 annotateUncovered／manchu
 * ⟨U+XXXX⟩ 註記慣例統一；`\` 是詞界 trigger 字符，輸出含 `\u` 會被長文掃描
 * 切碎且人讀有損）。入向由 parseEscCp（indic.ts）新增 ⟨U+XXXX⟩ 分支原樣還原，
 * 往返無損；舊 `\uXXXX` 6/4 位 hex 輸入體例仍兼容（不臆造，僅不再作輸出體例）。
 */
export function escapeRomanCp(cpValue: number): string {
  return `⟨U+${cpValue.toString(16).toUpperCase().padStart(4, "0")}⟩`;
}
/** 【B2/r156】⟨U+XXXX⟩ 註記解析正則（4–8 位 hex，值域 ≤0x10FFFF；parseEscCp 消費） */
// i 旗標：brahmi r2n 等入向入口先 toLowerCase()（⟨U+…⟩ 會被降成 ⟨u+…⟩），正則須雙大小寫匹配。
export const ANN_RE = /^⟨[Uu]\+([0-9A-Fa-f]{4,8})⟩/;

/**
 * 罕見字符「優雅透傳」：對文本中無法由方案表達的字符，依策略處理。
 * - passthrough（默認）：原樣保留，並在旁以 ⟨U+XXXX⟩ 註記標出（便於人工補全，往返不損）。
 * - extended：若方案提供擴展映射則用之；否則退回透傳。
 * - error：拋錯（由命令層 catch 後改爲 Notice，不崩潰）。
 *
 * 此函數本身不拋錯；error 模式由調用方在確認「存在未覆蓋字符」後決定是否報錯。
 */
export function annotateUncovered(
  nativeText: string,
  isCovered: (ch: string) => boolean,
  policy: RarePolicy = "passthrough"
): string {
  // P3-6：入口型別守衛（軟返回空串，見 convertScript 同款註記）
  if (typeof nativeText !== "string") return "";
  if (policy === "error") return nativeText; // 報錯由調用方處理
  let out = "";
  for (const ch of nativeText) {
    if (isCovered(ch)) {
      out += ch;
    } else if (policy === "extended") {
      out += ch; // 擴展映射在方案層處理，此處保守透傳
    } else {
      const cp = ch.codePointAt(0) ?? 0;
      out += `${ch}⟨U+${cp.toString(16).toUpperCase().padStart(4, "0")}⟩`;
    }
  }
  return out;
}

/** 計算文本中「未覆蓋」字符集合（用於 error 模式判斷與提示） */
export function uncoveredChars(
  text: string,
  isCovered: (ch: string) => boolean
): string[] {
  // P3-6：入口型別守衛（非字串輸入返回空集）
  if (typeof text !== "string") return [];
  const set = new Set<string>();
  for (const ch of text) if (!isCovered(ch)) set.add(ch);
  return Array.from(set);
}

/** 當前是否啓用某方案的自動互轉（依據文本同時像原生又像羅馬時的優先級） */
export function bestSchemeFor(text: string, group?: string): TransliterationScheme | undefined {
  // P3-6：入口型別守衛（非字串輸入不判定）
  if (typeof text !== "string") return undefined;
  const candidates = group ? schemesByGroup(group) : listSchemes();
  for (const s of candidates) {
    if (s.looksLikeNative(text)) return s;
  }
  return undefined;
}
