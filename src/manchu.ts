// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry
/**
 * 滿文 Möllendorff 轉寫 ↔ Unicode 傳統滿文 轉換器（純函數，無 Obsidian 依賴）。
 *
 * Möllendorff 是滿文的標準拉丁轉寫方案之一，映射確定、可正確往返；
 * 滿文轉換採用
 * Möllendorff 方案。
 *
 * 變體選擇符（FVS，U+180B–180D / U+180F）——「同碼位多字形」問題：
 * 蒙古文/滿文是音素字母文字，**沒有彝文式的字根區**（Unicode 全庫無 MONGOLIAN/MANCHU RADICAL），
 * 但有等價的「一碼多形」：同一字母在不同性/位置上靠 FVS 選擇字形。
 * Möllendorff 拉丁方案不編碼字形，故默認策略是**標記保留**（`<f1>`…`<f4>`）——
 * 與彝文字根的 `*` 標記同一哲學：默認往返無損，需要乾淨拉丁文本時再 `fvs:"strip"`。
 * 詳見 docs/MANCHU-MONGOL-VARIANT-RESEARCH.md。
 */

import {
  CharTableEntry,
  TransliterationScheme,
  TransliterationOptions,
  registerScheme,
} from "./translit-common";

const cp = (n: number): string => String.fromCodePoint(n);

/** 蒙古文自由變體選擇符 FVS1–4（U+180E 爲 MVS 元音分隔符，非 FVS） */
export const FVS_CODEPOINTS: Record<string, number> = {
  "1": 0x180b,
  "2": 0x180c,
  "3": 0x180d,
  "4": 0x180f,
};

/** FVS 在拉丁側的標記正則（`<f1>`…`<f4>`） */
const FVS_MARK_RE = /^<f([1-4])>/;

/** 是否自由變體選擇符 FVS1–4 */
export function isMongolianFvs(ch: string): boolean {
  return Object.values(FVS_CODEPOINTS).includes(ch.codePointAt(0) ?? 0);
}

/** 是否含 FVS；統計 FVS 數量；剝離全部 FVS */
export function hasMongolianFvs(text: string): boolean {
  for (const ch of text) if (isMongolianFvs(ch)) return true;
  return false;
}
export function countMongolianFvs(text: string): number {
  let n = 0;
  for (const ch of text) if (isMongolianFvs(ch)) n++;
  return n;
}
export function stripMongolianFvs(text: string): string {
  let out = "";
  for (const ch of text) if (!isMongolianFvs(ch)) out += ch;
  return out;
}

/**
 * Ali Gali 借音字母區（藏 / 梵轉寫用）：Möllendorff 方案不覆蓋，轉寫時原樣保留。
 *
 * 範圍擴充：舊版起於 U+1885，漏掉 U+1880–U+1884 五個「符號類」碼位；
 * 依 Unicode 17 官方圖表（charts/PDF/U1800.pdf）與 NamesList.txt，U+1880 起即爲
 * Ali Gali 區（@ Extensions for Sanskrit and Tibetan），其中：
 *   U+1880 ALI GALI ANUSVARA ONE = 藏文 sna ldan（U+0F83）→ 梵文隨鼻符 ṃ
 *   U+1881 ALI GALI VISARGA ONE  = 藏文 rnam bcad（U+0F7F）→ 梵文止韻 ḥ
 * 二者在真言 / 陀羅尼中高頻（oṃ … hūṃ、oṃ āḥ hūṃ），漏掉會使咒語標註殘缺。
 */
export const ALI_GALI_RANGE = { first: 0x1880, last: 0x18aa };
export function hasAliGali(text: string): boolean {
  for (const ch of text) {
    const c = ch.codePointAt(0) ?? 0;
    if (c >= ALI_GALI_RANGE.first && c <= ALI_GALI_RANGE.last) return true;
  }
  return false;
}

export type ManchuFvsMode = "mark" | "strip" | "keep";
export interface ManchuTranslitOptions {
  /**
   * FVS 處理策略：
   * - `mark`（默認）：FVS → `<f1>`…`<f4>`，反向可還原，**往返無損**
   * - `strip`：剝離 FVS，輸出純拉丁（學界引用常用，但字形信息丟失）
   * - `keep`：FVS 原樣留在拉丁文本中（不推薦：不可見控制符污染文本）
   */
  fvs?: ManchuFvsMode;
}
const fvsModeOf = (opts?: ManchuTranslitOptions): ManchuFvsMode => opts?.fvs ?? "mark";

/** Möllendorff 拉丁轉寫 → Unicode 滿文字符（含標點） */
const LATIN_TO_MANCHU: Record<string, string> = {
  a: cp(0x1820), e: cp(0x185d), i: cp(0x1873),
  o: cp(0x1823), u: cp(0x1860), "ū": cp(0x1861), n: cp(0x1828),
  N: cp(0x1829),
  k: cp(0x1874), g: cp(0x1864), h: cp(0x1865),
  b: cp(0x182a), p: cp(0x1866), s: cp(0x1830), "š": cp(0x1867),
  t: cp(0x1868), d: cp(0x1869), l: cp(0x182f), m: cp(0x182e),
  c: cp(0x1834), j: cp(0x1835), y: cp(0x1836), r: cp(0x1875),
  f: cp(0x1876), w: cp(0x1838), "k'": cp(0x183a), "g'": cp(0x186c),
  "h'": cp(0x186d),
  // B-M5：I 載體統一為標準 MANCHU I（U+1873）。0x185F 是 SIBE IY（錫伯借形），
  // 非標準滿文 I 載體；ts（ᡮ + ᡳ）改用 ᡮᡳ（0x186E + 0x1873）。c'y/jy/dzi 本就用
  // 0x1873，不變。Möllendorff 對照表：ts' = SIBE TSA、ts = SIBE TSA + I、
  // dz = SIBE ZA、dzi = SIBE ZA + I、ž = MANCHU ŽA、c'y = SIBE CHA + I、
  // jy = MANCHU ZHA + I（碼位實名已以 unicodedata 核對）。
  "ts'": cp(0x186e), ts: cp(0x186e) + cp(0x1873),
  dz: cp(0x186f), dzi: cp(0x186f) + cp(0x1873), "ž": cp(0x1870),
  /**
   * sy：滿文 sy 音節（借詞音譯用）。
   * 標準寫法為 ᠰ（U+1830 SA）+ ᠶ（U+1836 YA）——Unicode 滿文無專用 sy 碼位，
   * 實測真實滿文語料（kaikki 詞庫 1730 條）中 U+1836 出現 190 次，
   * 而舊寫法借用錫伯文 IY（U+185F）者僅 2 次（「四川」sycuwan 兩種寫法並存）。
   * 原上游寫作 ᠰᡟ，導致標準寫法 ᠰᠶᠴᡠᠸᠠᠨ → sycuwan → ᠰᡟᠴᡠᠸᠠᠨ 往返失真；
   * 現改輸出標準寫法，並在反查表中保留 ᠰᡟ → sy 的異體兼容（見 MANCHU_TO_LATIN）。
   */
  sy: cp(0x1830) + cp(0x1836), "c'y": cp(0x1871) + cp(0x1873),
  "jy": cp(0x1877) + cp(0x1873),
  // A1-c 註記：ᡟ/ᡱ/ᡷ 僅在反查表作借形歸一（見 MANCHU_TO_LATIN），不加正向鍵。
  ",": cp(0x1808), "<": cp(0xfe3d), ".": cp(0x1809), ">": cp(0xfe3e),
  "?": cp(0xfe16), "!": cp(0xfe15), ";": cp(0xfe14), ":": cp(0x1804),
  "[": cp(0xfe47), "]": cp(0xfe48), "{": cp(0xfe3f), "}": cp(0xfe40),
  "\\": cp(0x1801), "|": cp(0xfe31),
  // A1-b：詞首連接號輸出 MANCHU NIRUGU（᠊ U+180A）——真實文獻（kaikki 語料）辭典
  // 後綴條目如 '-kū' 均用 ᠊（23 例），U+202F 在真實語料出現 0 次，屬錯誤映射。
  "-": cp(0x180a),
};

/** Unicode 滿文 → Möllendorff 拉丁轉寫（反向映射，長鍵優先） */
const MANCHU_TO_LATIN: Record<string, string> = (() => {
  const rev: Record<string, string> = {};
  for (const [k, v] of Object.entries(LATIN_TO_MANCHU)) rev[v] = k;
  // B-M4：ᠩ（U+1829）反向直接輸出 "ng"——原依賴尾部 result.replace(/N/g,"ng")
  // 間接達成，現該尾部替換已移除（避免誤改透傳大寫 N），故在反表鍵值處正本清源。
  rev[cp(0x1829)] = "ng";
  /**
   * 異體兼容：滿文 sy 音節的舊寫法借錫伯文 IY（U+185F），作 ᠰᡟ；
   * 標準寫法爲 ᠰᠶ（U+1830 + U+1836）。真實文獻兩者並存（如「四川」sycuwan）。
   * 統一讀作 sy，轉回時輸出標準寫法 ᠰᠶ（異體歸一，讀音信息不丟失）。
   * B-M5：I 載體統一為標準 MANCHU I（U+1873）後，此兼容僅涵蓋
   * sy 舊寫法 ᠰᡟ；ts 的 I 載體不再用 0x185F（反表值已隨 ts 鍵同步更新）。
   */
  rev[cp(0x1830) + cp(0x185f)] = "sy";
  // A1-c：SIBE 碼位借形反向歸一——真實文獻（kaikki 語料）以錫伯文/單獨碼位書寫滿文音節，
  // 只加反查鍵（讀出歸一），不加正向鍵（教訓：輸入別名會破壞最長匹配切分）。
  // 單獨 ᡟ（U+185E SIBE I）讀作 y（真實文獻借形歸一）。
  rev[cp(0x185e)] = "y";
  // 單獨 ᡱ（U+1871 SIBE CHA）讀作 c'（真實文獻借形歸一）。
  rev[cp(0x1871)] = "c'";
  // 單獨 ᡷ（U+1877 MANCHU ZHA）讀作 jy——jy 複合鍵（0x1877+0x1873）更長，
  // 反查迴圈長鍵優先，不衝突；單獨出現（非後隨 ᡳ）時歸 jy（真實文獻借形歸一）。
  rev[cp(0x1877)] = "jy";
  // 注：上游曾在此硬編碼 t/d + FVS1 → t/d，會把 FVS 靜默吃掉（往返丟字形）。
  // 現由 manchuToMollendorff 的統一 FVS 策略處理（mark/strip/keep），不再需要特例。
  return rev;
})();

const SPECIAL_REPL: Record<string, string> = { zv: "ž", sv: "š", uv: "ū" };
const VOWELS = new Set(["a", "e", "i", "o", "u", "ū"]);

function replaceSpecial(s: string): string {
  let out = s;
  for (const [pat, rep] of Object.entries(SPECIAL_REPL)) {
    out = out.split(pat).join(rep);
  }
  return out;
}

/** 處理 ng → N（小舌鼻音 ᠩ），與上游 deal_special_Latin 對齊 */
function dealSpecialLatin(word: string): string {
  // 撇號正規化：把「空格＋撇號」的隔音寫法（abkai 'haha）收成
  // 連寫 abkai'haha——隔音撇號只是提示，滿文正字不寫撇號；隨後引擎丟棄
  // 撇號即得正字連寫形 ᠠᠪᡴᠠᡳᡥᠠᡥᠠ（與輸入者意圖一致：撇號標隔音不分詞）。
  // 無撇號的 abkai haha 維持分寫不變。
  const chars = word.replace(/\s*'\s*/g, "'").split("");
  for (let i = 0; i < chars.length; i++) {
    if (chars[i] !== "g") continue;
    const isFinal = i === chars.length - 1;
    const next = chars[i + 1];
    const prev = chars[i - 1] ?? "";
    if (!isFinal && next !== undefined && !VOWELS.has(next) && prev === "n") {
      chars[i - 1] = "N";
      chars.splice(i, 1);
      i -= 1;
    } else if (isFinal && prev === "n") {
      chars[i - 1] = "N";
      chars.splice(i, 1);
      i -= 1;
    }
  }
  return chars.join("");
}

/** Möllendorff 轉寫 → Unicode 傳統滿文（`<f1>` 標記還原爲 FVS1） */
export function mollendorffToManchu(latin: string, opts?: ManchuTranslitOptions): string {
  const mode = fvsModeOf(opts);
  const word = dealSpecialLatin(replaceSpecial(latin));
  let result = "";
  let i = 0;
  while (i < word.length) {
    // 拉丁側的 FVS 標記：<f1> … <f4>（僅 mark 模式解析）
    if (mode === "mark" && word[i] === "<") {
      const m = FVS_MARK_RE.exec(word.slice(i));
      if (m) {
        result += cp(FVS_CODEPOINTS[m[1]]);
        i += m[0].length;
        continue;
      }
    }
    let found = false;
    for (let len = 3; len >= 1; len--) {
      const sub = word.slice(i, i + len);
      // B-M4：大寫 N 僅在「dealSpecialLatin 產出的 N token」語境
      //（後隨非元音或詞尾，見 dealSpecialLatin）才映射 ᠩ 並輸出 "ng"；
      // 後隨元音的 N（專名 Nurhaci 等）透傳原樣，走下方 !found 路徑。
      if (sub === "N" && VOWELS.has(word[i + 1] ?? "")) break;
      if (sub in LATIN_TO_MANCHU) {
        const tok = LATIN_TO_MANCHU[sub];
        // A1-a 回歸修復：此處必須輸出滿文字符 tok（ᠩ U+1829）——r28 B-M4 曾誤植為
        // 字面拉丁 "ng"，把 ASCII 混入滿文輸出（wang → ᠸᠠng）。「嚴式輸出 ng」是
        // 反查表 MANCHU_TO_LATIN 的 rev[0x1829]="ng" 職責，正向只管字形。
        result += tok;
        i += len;
        found = true;
        break;
      }
    }
    if (!found) {
      // 撇號：Möllendorff 轉寫的隔音撇號非滿文字符——丟棄不透傳
      //（同 mongolian，真機實錘 ᠠᠪᡴᠠᡳ'ᡥᠠᡥᠠ 裸撇號）。
      if (word[i] === "'") { i += 1; continue; }
      result += word[i];
      i += 1;
    }
  }
  /**
   * 滿文標點 ᠈/᠉ 直接連寫在詞後，不加空格：
   * 實測真實滿文語料（kaikki 詞庫 5864 條）中 170 條含 ᠈/᠉，
   * **170 條全部緊貼前詞、0 條前置空格**（如 ᠨᡳᠣ᠉／ᡩᡝ᠈）。
   * 上游曾在標點前補空格，導致 ᠨᡳᠣ᠉ → nio. → ᠨᡳᠣ ᠉ 往返失真，故移除。
   */
  return result;
}

/** Unicode 傳統滿文 → Möllendorff 轉寫（FVS 按 fvs 選項處理） */
export function manchuToMollendorff(manchu: string, opts?: ManchuTranslitOptions): string {
  const mode = fvsModeOf(opts);
  let result = "";
  let i = 0;
  while (i < manchu.length) {
    // FVS 本身不在轉寫表內：先按策略處理，避免不可見控制符泄漏進拉丁文本
    if (isMongolianFvs(manchu[i])) {
      if (mode !== "strip") {
        const n = Object.entries(FVS_CODEPOINTS).find(([, c]) => c === manchu[i].codePointAt(0))?.[0];
        result += mode === "mark" ? `<f${n}>` : manchu[i];
      }
      i += 1;
      continue;
    }
    let found = false;
    // 下一位是 FVS 時不做 2 字符匹配，交給上面的統一 FVS 策略（避免靜默吞掉變體選擇符）
    const maxLen = isMongolianFvs(manchu[i + 1] ?? "") ? 1 : 2;
    for (let len = maxLen; len >= 1; len--) {
      const sub = manchu.slice(i, i + len);
      if (sub in MANCHU_TO_LATIN) {
        result += MANCHU_TO_LATIN[sub];
        i += len;
        found = true;
        break;
      }
    }
    if (!found) {
      // C2：孤立代理對先行守衛——codePointAt 對孤立代理對返回其代理碼位值，
      // 舊邏輯會把它錯標 ⟨U+D800⟩ 並連字符一起雙寫（ch＋註記皆取自同一代理
      // 半元）。孤立代理對本就是無效 Unicode：一律原樣透傳、不註記，與其餘
      // 29 方案的 passthrough 行為一致（probe 實測對齊）。
      const cu = manchu.charCodeAt(i);
      if (cu >= 0xd800 && cu <= 0xdfff) {
        result += manchu[i];
        i += 1;
        continue;
      }
      // P2-5（滿文輪「讀出已歸一」原則的邊界收緊）：滿文反查對蒙古文
      // 專屬碼位（U+1820–1842 中滿文不用的字母，如 182D GA、1829 ANG 等在
      // 反表無鍵者）不再原樣透傳進拉丁輸出——舊行爲會產出 'mongᠭol' 這類
      // 混碼文本。這些碼位本就屬蒙古文，正確路由是 bestSchemeFor 送
      // mongolian（looksLikeManchuUnicode 已收窄，純蒙古文不再判滿文）；
      // 若用戶顯式對蒙古文文本跑滿文命令，裸字母（非標點/數字/分隔符）
      // 依 annotateUncovered 的哲學以 ⟨U+XXXX⟩ 註記標出，便於人工補全、
      // 往返不損；區段標點/數字/分隔符（U+1800–181A/202F）仍原樣透傳。
      const c = manchu.codePointAt(i) ?? 0;
      const ch = manchu[i];
      // 區段外的字符（空格、拉丁字母等本就不在反表）維持原樣透傳；
      // 區段內標點/數字/分隔符（U+1800–181A/202F）也原樣透傳；
      // 只對區段內反表不識的裸字母註記。
      const isSegPunctOrDigit = (c >= 0x1800 && c <= 0x181a) || c === 0x202f;
      result += c < 0x1800 || isSegPunctOrDigit
        ? ch
        : `${ch}⟨U+${c.toString(16).toUpperCase().padStart(4, "0")}⟩`;
      i += ch.length;
    }
  }
  // B-M4：移除尾部 result.replace(/N/g, "ng")——其無作用域，會把透傳的
  // 大寫 N（專名 Nurhaci 等）誤改為 ng；N token 已在主循環內統一輸出 "ng"。
  return result;
}

/** 自動判定輸入是傳統滿文還是拉丁轉寫 */
export function detectManchuScript(text: string): "manscript" | "mulinde" {
  const letters = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
  for (const ch of text.slice(0, 5)) {
    if (letters.includes(ch)) return "mulinde";
  }
  return "manscript";
}

/** 自動轉換：傳統滿文 ⇄ Möllendorff */
export function convertManchu(text: string, opts?: ManchuTranslitOptions): string {
  const t = replaceSpecial(text);
  return detectManchuScript(t) === "manscript"
    ? manchuToMollendorff(t, opts)
    : mollendorffToManchu(t, opts);
}

/**
 * 滿文專屬碼位（Mongolian 區段內滿文/錫伯獨用、蒙古文不用的字母）：
 * U+185E–U+1877。逐一以 unicodedata 實名核對（Python unicodedata.name）：
 *  - 185E SIBE E（滿文 e 實際書寫的借形碼位，manchu.ts e→0x185D 舊鏈條與
 *    真實文獻並存，屬滿文借形集中區，計入專屬判定）；
 *  - 1860–1872 名帶 SIBE（滿文文本借形，含滿文專屬 k/g/h/t/d 的 1864/1865/
 *    1868/1869），1873–1877 名帶 MANCHU（i/k/r/f/ž）；
 *  - 蒙古文獨用核心 U+1820–1842 全不在此列；1843–185D 爲 Todo 區（衛拉特文），
 *    非滿文證據，不入判定（185D SIBE IY 之前的 185A-185D 也非滿文獨證）。
 * 注意：滿文 k/g/h/t/d 專屬碼位 1864-1869、1874 與蒙古文共用字母（182C/182D/
 * 1832/1833）的界綫即「SIBE/MANCHU 實名區 vs 蒙古文核心 1820–1842」。
 */
const MANCHU_EXCLUSIVE_RE = /[\u185e-\u1877]/;

/**
 * 是否含有 Unicode 滿文區段字符（滿文專屬碼位判定）。
 *
 * P2-5 修正：舊實現對整個 U+1800–U+18AF 返 true，而滿文方案註冊序先於
 * mongolian，bestSchemeFor 對蒙古文正文（ᠮᠣᠩᠭᠣᠯ 等純 U+1820–1842 核心字母）
 * 恆偏滿文。現改爲要求出現滿文專屬碼位（U+185E–U+1877：滿文 k/g/h/t/d、
 * MANCHU I 等 SIBE/MANCHU 專屬字母）；蒙古文核心字母（U+1820–1842）＋
 * 區段標點（U+1800–1809）＋FVS/MVS/NNBSP（U+180B–180F）不再判滿文——
 * 純蒙古文文本由 looksLikeMongolianUnicode 接住（註冊序 manchu 在 mongolian
 * 之後，故此函數必須收窄才能讓 bestSchemeFor 路由到 mongolian）。
 * 判定真值表（改前→改後）：蒙古文正文 T→F；滿文正文 T→T（滿文必有專屬碼位）；
 * 混合 T→T；空串 F→F；拉丁 F→F。
 */
export function looksLikeManchuUnicode(text: string): boolean {
  // 加寬——滿蒙共用 U+1800–U+18AF 全區段任一字符即認（含標點/數字/呈現形）。
  // 舊 exclusive 判定把共用區單字符詞（᠛ 等）整詞 skipped，引擎實可轉（⟨U+XXXX⟩ 註記）。
  // 方向歧義（蒙文混入）無妨：本判定僅在用戶明確選滿文方案＋native→roman 時 gate。
  if (MANCHU_EXCLUSIVE_RE.test(text)) return true;
  for (const ch of text) {
    const c = ch.codePointAt(0) ?? 0;
    if (c >= 0x1800 && c <= 0x18AF) return true;
  }
  return false;
}

/** 是否像 Möllendorff 拉丁轉寫（含字母，且非純 ASCII 標點） */
export function looksLikeMollendorff(text: string): boolean {
  return /[a-z]/i.test(text) && /[a-zūšž]/.test(text);
}

/* ---------------- 註冊到 TRANSLIT_REGISTRY（僅補檢字表，命令沿用既有 id） ---------------- */

/** 拉丁側被視為標點的鍵（轉寫表中與字母混排） */
const MANCHU_PUNCT_KEYS = new Set([
  ",", ".", "?", "!", ";", ":", "[", "]", "{", "}", "\\", "|", "-", "<", ">",
]);

function buildManchuCharTable(): CharTableEntry[] {
  const rows: CharTableEntry[] = [];
  for (const [k, v] of Object.entries(LATIN_TO_MANCHU)) {
    // 複合鍵（ts/dz/sy/jy 等）單列為「複合字母」，便於用戶查表拼寫
    const section = MANCHU_PUNCT_KEYS.has(k)
      ? "標點"
      : VOWELS.has(k)
        ? "元音"
        : k.length > 1
          ? "複合字母"
          : "輔音";
    // Möllendorff 大寫 N 與 ng 同指 ᠩ（U+1829）——引擎反表嚴式輸出 "ng"，
    // charTable roman 欄同步嚴式，note 註明可鍵入 N（詞尾/非元音前語境），保語料校驗雙向一致
    const romanLabel = k === "N" ? "ng" : k;
    // 標點列補滿文名說明（與蒙古文表說明列體例對齊）——᠈/᠉/᠄/᠁ 均為
    // 蒙古文區段共用碼位，滿文方案以 ASCII 直鍵承載，防「滿文方案不支持滿文標點」誤解
    const punctNote: Record<string, string> = {
      ",": "滿文逗號（蒙古文區共用碼位 U+1808）",
      ".": "滿文句號（蒙古文區共用碼位 U+1809）",
      ":": "蒙古文冒號（U+1804）",
      "\\": "蒙古文省略號（U+1801）",
    };
    rows.push({ native: v, roman: romanLabel, section, note: k === "N" ? "Möllendorff 大寫 N（詞尾/非元音前小舌鼻音）；嚴式輸出 ng，鍵入 N 或 ng 均可" : (punctNote[k] ?? undefined) });
  }
  rows.push({ native: "—", roman: "ng → N", note: "詞尾 / 非元音前的 ng 寫作 N（小舌鼻音 ᠩ）", section: "拼寫規則" });
  rows.push({ native: "—", roman: "<f1>…<f4>", note: "變體選擇符 FVS 標記（往返無損，strip 模式可剝離）", section: "拼寫規則" });
  rows.push({ native: "—", roman: "ū / š / ž", note: "長音符與Caron字母，亦可鍵入 uv / sv / zv", section: "拼寫規則" });
  rows.push({
    native: "—", roman: "? / ! / ; / | / [ / ]",
    note: "映射至 U+FE15/FE16/FE14/FE31/FE47/FE48——**豎排 presentation forms**（傳統滿文/蒙古文垂直書寫的專用豎形標點，供豎排排版層選形；非語義碼位）",
    section: "標點",
  });
  rows.push({
    native: "—", roman: "sy → ᠰᠶ",
    note: "sy 音節標準寫法為 ᠰ（U+1830）+ ᠶ（U+1836）；舊寫法借用錫伯文 IY（U+185F）的 ᠰᡟ 亦讀 sy",
    section: "拼寫規則",
  });
  rows.push({
    native: "—", roman: ", / .",
    note: "滿文標點 ᠈/᠉ 緊貼前詞連寫、不加空格（實測真實語料 170 例全部連寫）",
    section: "拼寫規則",
  });
  // A1-d：真實文獻拼寫規則補註（kaikki 語料實證）
  rows.push({
    native: "—", roman: "t / d + <f1>",
    note: "真實文獻中詞首 t/d 帶 FVS1（ᡨ᠋/ᡩ᠋）區分字形；本方案以 <f1> 標記鍵入並往返（strip 模式可剝離）",
    section: "拼寫規則",
  });
  rows.push({
    native: "—", roman: "- → ᠊",
    note: "詞首連接號以 '-' 鍵入，輸出 MANCHU NIRUGU（᠊ U+180A）；辭典後綴條目（如 -kū）均用此形",
    section: "拼寫規則",
  });
  rows.push({
    native: "—", roman: "y / c' / j 借形",
    note: "部分文獻以錫伯碼位借形書寫：ᡟ（U+185E）讀 y、ᡱ（U+1871）讀 c'、單獨 ᡷ（U+1877）讀 jy；讀出已歸一，不加正向鍵",
    section: "拼寫規則",
  });
  return rows;
}

const manchuMollendorff: TransliterationScheme = {
  id: "manchu-mollendorff",
  label: {
    zh: "满文（Möllendorff ↔ Unicode）",
    "zh-TW": "滿文（Möllendorff ↔ Unicode）",
    en: "Manchu (Möllendorff ↔ Unicode)",
    bo: "མན་ཇུ།(Möllendorff↔Unicode)",
    ug: "Manju (Möllendorff↔Unicode)",
    mn: "Манж (Möllendorff↔Unicode)",
    ja: "満州文字（Möllendorff ↔ Unicode）",
    ko: "만주 문자(Möllendorff ↔ Unicode)",
  fr: "Mandchou (Möllendorff ↔ Unicode)", de: "Mandschu (Möllendorff ↔ Unicode)", },
  group: "manchu",
  primary: true,
  description: "Möllendorff 拉丁轉寫 ↔ 傳統滿文 Unicode；FVS 字形選擇符以 <f1>…<f4> 標記，往返無損",
  romanToNative: (input: string, opts?: TransliterationOptions) =>
    mollendorffToManchu(input, (opts as { fvs?: "mark" | "strip" | "keep" } | undefined) ?? undefined),
  nativeToRoman: (input: string, opts?: TransliterationOptions) =>
    manchuToMollendorff(input, (opts as { fvs?: "mark" | "strip" | "keep" } | undefined) ?? undefined),
  looksLikeNative: looksLikeManchuUnicode,
  looksLikeRoman: looksLikeMollendorff,
  convert: (input: string, opts?: TransliterationOptions) =>
    convertManchu(input, (opts as { fvs?: "mark" | "strip" | "keep" } | undefined) ?? undefined),
  charTable: buildManchuCharTable(),
  // 檢字表審計：標點鍵（, . < > ? ! ; : [ ] { } \\ - |）皆為 ASCII 詞界
  // trigger 字符，面板長文掃描會拆散透傳——charTable 同源動態生成原子 token。
  romanTokenRe: new RegExp(
    "^(?:" +
      buildManchuCharTable()
        .map((r) => r.roman)
        .filter((r) => /^[^A-Za-z\u00C0-\u024F]/.test(r))
        .sort((a, b) => b.length - a.length)
        .map((r) => r.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
        .join("|") +
      ")$"
  ),
  skipAutoCommands: true, // 既有命令 manchu-mollendorff-to-unicode / manchu-unicode-to-mollendorff
};

registerScheme(manchuMollendorff);
