// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry
/**
 * 婆羅米文（Brahmi，Unicode U+11000–U+1107F）↔ IAST 轉寫器。
 *
 * 【歷史地位】婆羅米文是印度最古老的文字系統之一，阿育王法敕（公元前 3 世紀）
 *  即以婆羅米文鐫刻；它是天城體、悉曇體、佉盧文等幾乎所有印度系文字的祖先。
 *  橫排 LTR（與佉盧文的 RTL 相對），無複雜 shaping 需求（virama 顯式寫出，
 *  無 GSUB 合字引擎依賴）。
 *
 * 【設計決策：自帶 abugida 組字器（kharoshthi.ts 同款模型）】
 *  與悉曇不同，婆羅米**不能**復用天城體引擎的碼位重映射（悉曇體輔音區與天城體
 *  0915–0939 一一對齊，婆羅米亦連續——但婆羅米有 Unicode 特有的三個 Old Tamil
 *  字母與 LLA/ḷ 的音值衝突，重映射表無法表達），故採 kharoshthi.ts 已驗證的
 *  「極簡 abugida 組字器」模型：
 *    ① 輔音字母自帶固有元音 a —— 輔音後緊跟 'a' 視為固有元音，不寫出；
 *       例：dhamma（阿育王銘文「法」）→ dh·m·m ＝ 𑀥𑀫𑀫（非 𑀥𑀆𑀫…）。
 *    ② 輔音後緊跟其他元音 → 輔音字母 ＋ 對應元音符號（VOWEL SIGN）。
 *    ③ 輔音 + 輔音（無元音間隔）→ 前輔音補 VIRAMA U+11046（顯式 virama，
 *       與天城體同義；詞尾死輔音亦補：dhammaṃ 詞中 dh+m 為 𑀥𑁆𑀫）。
 *       → 與 kharoshthi「寫本省略」不同，此處採 indic.ts 的**精確標寫**：
 *         羅馬字含什麼寫什麼，往返無損（含 'a' 則固有、無 'a' 則 virama）。
 *    ④ 詞首 / 非輔音後的元音 → 獨立元音字母（14 個俱全，婆羅米比佉盧文多）。
 *  逆向（nativeToRoman）為唯一可發音讀法：裸輔音回填固有 'a'，含 virama 則不回填，
 *  全 CV 音節與合字叢集可無損往返。
 *
 * 【映射表數據來源】indic-transliteration/common_maps brahmic/brahmi.toml（MIT，
 *  天城體為鍵），逐條轉為 IAST 鍵；碼位依 Unicode 16.0 NamesList U+11000。
 *  阿育王銘文正字法（Ashokan Prakrit）注意事項：
 *   - LLA 𑀴(U+11034)：婆羅米不分聲化元音 ḷ 與捲舌邊音 ḷ（Prakrit 的 ḷ 即後者），
 *     故正字法鍵 ḷ → LLA（與天城體 IAST ḷ=ऌ 的分歧在表中以專鍵消化；獨立元音
 *     ḷ=U+1100D 仍可由 vowel_indep 表輸入）；
 *   - Old Tamil 三字母（U+11035 LLLA / U+11036 RRA / U+11037 NNNA）：ḻḻ / ṟṟ
 *     以長鍵映射（泰米爾學術轉寫的疊輔音拼法）；ṉ 單鍵映射 NNNA，疊寫 ṉṉ
 *     由貪婪匹配自然拆成 NNNA+NNNA（B-B1）。
 *   - 叢集 kṣ→𑀓𑁆𑀱、jñ→𑀚𑁆𑀜 由「輔音相鄰自動補 virama」規則自然覆蓋（agra→
 *     𑀅𑀕𑁆𑀭 同理），無需合字引擎（Brahmi 顯式 virama，字體無 GSUB 依賴）。
 *  - 數字：Brahmi 有兩套——加法系 NUMBER ONE…ONE THOUSAND（U+11052–U+11065，
 *    學界文獻一律寫阿拉伯數字，不做換算）與十進位 DIGIT ZERO–NINE（U+11066–U+1106F）。
 *    本方案映射 ASCII 0–9 → 位值 DIGIT（𑁦–𑁯），與天城體 ०–९ 的位值系統一致。
 *
 * 【方向注意】婆羅米橫排 LTR（languages.ts 檔案寫 horizontal-tb + ltr）；
 *  本模組輸出碼位序即邏輯序，無雙向演算法干預。
 *
 * 純函數、無 Obsidian 依賴；所有函數不拋未捕獲異常（命令 / 即時上屏層守護）。
 */

import {
  escapeRomanCp,
  registerScheme,
  type CharTableEntry,
  type TransliterationOptions,
  type TransliterationScheme,
} from "./translit-common";
import { parseEscCp } from "./indic";

const cp = (n: number): string => String.fromCodePoint(n);

/* ---------------- 字母表（羅馬字鍵 → 婆羅米碼位） ---------------- */

// 獨立元音 LETTER（U+11005–U+11012，共 14 個：含聲化 ṛṝḷḹ；婆羅米僅 14，
// 無天城體的 candra 短音 ऍ/ऎ/ऒ 對應——梵文音素齊備）
// prettier-ignore
const BRAHMI_VOWEL_INDEP: Record<string, number> = {
  a: 0x11005, "ā": 0x11006, i: 0x11007, "ī": 0x11008,
  u: 0x11009, "ū": 0x1100a, "ṛ": 0x1100b, "ṝ": 0x1100c,
  "ḷ": 0x1100d, "ḹ": 0x1100e, e: 0x1100f, ai: 0x11010,
  o: 0x11011, au: 0x11012,
};

// 輔音 LETTER（U+11013–U+11033，連續 33 個，順序與天城體 0915–0939 一致）
// prettier-ignore
const BRAHMI_CONSONANT: Record<string, number> = {
  k: 0x11013, kh: 0x11014, g: 0x11015, gh: 0x11016, "ṅ": 0x11017,
  c: 0x11018, ch: 0x11019, j: 0x1101a, jh: 0x1101b, "ñ": 0x1101c,
  "ṭ": 0x1101d, "ṭh": 0x1101e, "ḍ": 0x1101f, "ḍh": 0x11020, "ṇ": 0x11021,
  t: 0x11022, th: 0x11023, d: 0x11024, dh: 0x11025, n: 0x11026,
  p: 0x11027, ph: 0x11028, b: 0x11029, bh: 0x1102a, m: 0x1102b,
  y: 0x1102c, r: 0x1102d, l: 0x1102e, v: 0x1102f,
  "ś": 0x11030, "ṣ": 0x11031, s: 0x11032, h: 0x11033,
  // LLA（U+11034）：阿育王 Prakrit 的 ḷ（捲舌邊音；婆羅米不把 ḷ 當聲化元音用）。
  // 【P2-3 鍵裁定】IAST 的 ḷ 同時表聲化元音（𑀍 U+1100D，vowel_indep 已收）與
  // 捲舌邊音（ळ）——同形而異碼，故採**上下文消歧**（與婆羅米 abugida 的固有 a
  // 語義一致）：'ḷ' 後接元音 ⇒ 捲舌邊音 LLA（ḷa/ḷā/ḷi…，音節級鍵）；'ḷ' 後不接
  // 元音 ⇒ 聲化元音 𑀍（獨立元音／附標分支接手）。故 LLA 不入單碼位輔音鍵表，
  // 由下方 BRAHMI_LLA 專鍵 + 上下文判定承擔；反查 11034→"ḷa"（裸輔音回填固有 a，
  // 與 n2r(r2n("ḷa"))="ḷa" 雙向一致，檢字表以音節級鍵 "ḷa" 列示）。
  // 未採 ḻ：ḻ 已是 Old Tamil LLA（U+11075）的既定鍵，同形會互撞。
  "ḷḷ": 0x11035,
};

// P2-3：LLA 專鍵——上下文消歧的捲舌邊音（後接元音時取 LLA 11034；裸 'ḷ' 仍為
// 聲化元音 𑀍）。'ḳḷ' 等組合不入：ḷḷ（OT LLLA 11035 疊輔音）由 BRAHMI_CONSONANT
// 長鍵承擔，貪婪匹配 'ḷḷ' 先於本專鍵，無衝突。
const BRAHMI_LLA = 0x11034;

// 叢集長鍵（kṣ / jñ 的慣用拼寫；與 Old Tamil 疊輔音同為「輔音相鄰自動補 virama」
// 的產物，此處僅作檢字表展示；引擎層由 consKeys 貪婪匹配＋virama 規則自然覆蓋）
// prettier-ignore
const BRAHMI_CLUSTER: Record<string, number[]> = {
  "kṣ": [0x11013, 0x11046, 0x11031], // क्ष = KA VIRAMA SSA
  "jñ": [0x1101a, 0x11046, 0x1101c], // ज्ञ = JA VIRAMA NYA
};

// 元音附標 VOWEL SIGN（U+11038–U+11045；固有 a 不輸出，故無 'a' 附標）
// prettier-ignore
const BRAHMI_VOWEL_SIGN: Record<string, number> = {
  "ā": 0x11038, i: 0x1103a, "ī": 0x1103b, u: 0x1103c, "ū": 0x1103d,
  "ṛ": 0x1103e, "ṝ": 0x1103f, "ḷ": 0x11040, "ḹ": 0x11041,
  e: 0x11042, ai: 0x11043, o: 0x11044, au: 0x11045,
};

// 各類符號：anusvāra ṃ（ṁ 爲巴利等價）、visarga ḥ、candrabindu m̐
const BRAHMI_SIGNS: Record<string, number> = {
  "ṃ": 0x11001, "ṁ": 0x11001, "ḥ": 0x11002, "m̐": 0x11000,
};

const BRAHMI_VIRAMA = 0x11046;

// 數字：ASCII 0–9 → BRAHMI DIGIT ZERO–NINE（位值系統，U+11066–U+1106F）
const BRAHMI_DIGITS: Record<string, number> = {
  "0": 0x11066, "1": 0x11067, "2": 0x11068, "3": 0x11069, "4": 0x1106a,
  "5": 0x1106b, "6": 0x1106c, "7": 0x1106d, "8": 0x1106e, "9": 0x1106f,
};

// 標點：danda / double danda ＋ 五個分隔符（r45 B-2，分號前綴鍵一對一雙射）
const BRAHMI_PUNCT: Record<string, number> = {
  "।": 0x11047, "॥": 0x11048, "|": 0x11047, "||": 0x11048,
  ";.": 0x11049, // PUNCTUATION DOT（單點）
  ";:": 0x1104a, // PUNCTUATION DOUBLE DOT（雙點）
  ";-": 0x1104b, // PUNCTUATION LINE（橫線）
  ";(": 0x1104c, // PUNCTUATION CRESCENT BAR（新月＋槓）
  ";*": 0x1104d, // PUNCTUATION LOTUS（蓮花）
};

// 加法系數字符號（r45 B-1：U+11052–11065，No 類；高值在前組合成序列）。
// 與位值 DIGIT 11066–F（BRAHMI_DIGITS）是兩套系統：鍵前綴 N 防衝突。
// 鍵用分號前綴（romanToNative 會 toLowerCase，大寫 N 會被摧毀成輔音 n——r45 教訓）
const BRAHMI_NUM: Record<string, number> = {
  ";1": 0x11052, ";2": 0x11053, ";3": 0x11054, ";4": 0x11055,
  ";5": 0x11056, ";6": 0x11057, ";7": 0x11058, ";8": 0x11059,
  ";9": 0x1105a, ";10": 0x1105b, ";20": 0x1105c, ";30": 0x1105d,
  ";40": 0x1105e, ";50": 0x1105f, ";60": 0x11060, ";70": 0x11061,
  ";80": 0x11062, ";90": 0x11063, ";100": 0x11064, ";1000": 0x11065,
};
// 乘法連接符 NUMBER JOINER（11064|11065 + 1107F + N ⇒ 100N/1000N；
// 無 joiner 即加法。往返必須顯式保留，否則 400 與 104 混淆）
const BRAHMI_NUM_JOINER = 0x1107f;

// upadhmaniya（後接同部位清塞音成簇連字，字母性質不經 virama）
const BRAHMI_UPADHMANIYA = 0x11004;
// Old Tamil virama / 原子元音 / 專有輔音
const BRAHMI_OT_VIRAMA = 0x11070;
const BRAHMI_OT_VOWELS: Record<string, number> = {
  "ĕ": 0x11071, "ŏ": 0x11072, ".e": 0x11073, ".o": 0x11074,
};
const BRAHMI_OT_EXTRA: Record<string, number> = {
  "ḻ": 0x11075,
  "ṉ": 0x11037, // OLD TAMIL NNNA（B-B1：單鍵 ṉ → NNNA，反查亦歸 ṉ，單鍵往返閉環；
                //  疊寫輸入 "ṉṉ" 由貪婪匹配拆成 NNNA+NNNA——銘文疊輔音本以疊字母書寫，
                //  反向還原 "ṉṉ" 仍成立。舊作法 ṉṉ/ṉ 同碼位、反查先到先得恆還原 ṉṉ，
                //  ṉ 單鍵往返破損，且「ṉ 已在輔音表則反查對齊」註釋不實，一併修正）
  "ṟṟ": 0x11036, // OLD TAMIL RRA
};


// 單次比對用：鍵依長度降序（最長鍵優先：ṉṉ/kṣ/jñ/ṭh 不會被單字母拆散）
const consKeys = Object.keys(BRAHMI_CONSONANT).sort((a, b) => b.length - a.length);
const signKeys = Object.keys(BRAHMI_SIGNS).sort((a, b) => b.length - a.length);
const digitKeys = Object.keys(BRAHMI_DIGITS).sort((a, b) => b.length - a.length);
const punctKeys = Object.keys(BRAHMI_PUNCT).sort((a, b) => b.length - a.length);
const numKeys = Object.keys(BRAHMI_NUM).sort((a, b) => b.length - a.length);
const otVowelKeys = Object.keys(BRAHMI_OT_VOWELS).sort((a, b) => b.length - a.length);
const otExtraKeys = Object.keys(BRAHMI_OT_EXTRA).sort((a, b) => b.length - a.length);
// 詞首元音比對用：長鍵 ai/au 先於單鍵（否則 "a" 先被單鍵命中、隨後 "i"/"u" 掉成
// 獨立元音 —— kai→𑀅𑀇 之類的錯拆）
const indepKeys = Object.keys(BRAHMI_VOWEL_INDEP).sort((a, b) => b.length - a.length);

/* ---------------- 反查表（婆羅米碼位 → 羅馬字） ---------------- */

function buildReverse(map: Record<string, number>): Map<number, string> {
  const m = new Map<number, string>();
  for (const [roman, code] of Object.entries(map)) {
    // ṃ/ṁ 同碼：反查統一歸 ṃ；ḷ 輔音鍵「ळ」與獨立元音 ḷ 分屬兩表，不衝突
    if (roman === "ṁ") continue;
    if (!m.has(code)) m.set(code, roman);
  }
  return m;
}
const REV_CONSONANT = buildReverse(BRAHMI_CONSONANT);
// P2-3：LLA（11034）反查 "ḷa"——裸輔音回填固有 a 語義與其餘輔音一致；
// r2n("ḷa")=𑀴 ↔ n2r(𑀴)="ḷa" 雙向閉環。裸 'ḷ'（不接元音）歸聲化元音 𑀍。
REV_CONSONANT.set(BRAHMI_LLA, "ḷa");
const REV_VOWEL_INDEP = buildReverse(BRAHMI_VOWEL_INDEP);
const REV_VOWEL_SIGN = buildReverse(BRAHMI_VOWEL_SIGN);
const REV_SIGNS = buildReverse(BRAHMI_SIGNS);
const REV_DIGITS = buildReverse(BRAHMI_DIGITS);
const REV_PUNCT = buildReverse(BRAHMI_PUNCT);
// danda 反查統一 ASCII "|"/"||"（"।" 同碼鍵不搶首鍵；出向全拉丁化）
REV_PUNCT.set(0x11047, "|");
REV_PUNCT.set(0x11048, "||");
const REV_NUM = buildReverse(BRAHMI_NUM);
// Old Tamil 專有字母反查：只補輔音表未覆蓋的碼位（11035/36 已有 ḻḻ/ṟṟ）
for (const [roman, c] of Object.entries(BRAHMI_OT_EXTRA)) {
  if (!REV_CONSONANT.has(c)) REV_CONSONANT.set(c, roman);
}
// Old Tamil 原子短元音反查（B-3：11071/72 獨立字母、11073/74 附標）
for (const [roman, c] of Object.entries(BRAHMI_OT_VOWELS)) {
  if (!REV_VOWEL_INDEP.has(c)) REV_VOWEL_INDEP.set(c, roman);
  if (!REV_VOWEL_SIGN.has(c)) REV_VOWEL_SIGN.set(c, roman);
}
// Old Tamil 裸輔音正字：11075（ḻa）不回填固有 a（old-tamil 慣例裸輔音即裸輔音）
const OT_BARE_CONS = new Set([0x11075]);
// 叢集長鍵（羅馬字鍵集合，供 nativeToRoman 判定「鍵已完整、不回填固有 a」；
// kṣ/jñ 由 virama 鏈自然拼出，Old Tamil 疊輔音同理）
const REV_CLUSTER_ROMAN = new Set(Object.keys(BRAHMI_CLUSTER));

const isBrahmiCode = (n: number): boolean => n >= 0x11000 && n <= 0x110ff;

/** 是否像婆羅米文原生文字（U+11000–U+110FF 任一碼位） */
export function looksLikeBrahmi(text: string): boolean {
  for (const ch of text) if (isBrahmiCode(ch.codePointAt(0)!)) return true;
  return false;
}

/** 是否像婆羅米文羅馬字（含 IAST 特徵字母或元音鍵） */
export function looksLikeBrahmiRoman(text: string): boolean {
  if (looksLikeBrahmi(text)) return false;
  for (const ch of text) {
    if (/[a-zāīūṛṝḷḹṅñṭḍṇśṣḥṃṁ]/.test(ch)) return true;
  }
  return false;
}

/** 在 position 嘗試最長鍵匹配，回傳 [鍵, 碼位] 或 null */
function matchAt(input: string, pos: number, keys: string[], map: Record<string, number>): [string, number] | null {
  for (const k of keys) if (k.length && input.startsWith(k, pos)) return [k, map[k]];
  return null;
}

/**
 * 羅馬字 → 婆羅米文（abugida 精確標寫，對齊 indic.ts 拼寫層）。
 *  - 輔音 + 'a' → 只寫輔音（固有元音省略）；
 *  - 輔音 + 其他元音 → 輔音 + 元音符號；
 *  - 輔音 + 輔音（無元音間隔）→ 前輔音補 VIRAMA（agra→𑀅𑀕𑁆𑀭）；
 *    詞尾死輔音補 VIRAMA（arhat→𑀅𑀭𑁆𑀳𑀢𑁆）；
 *  - 輔音後的 ṃ/ḥ/m̐ 為音節尾加成分，不取消固有 a（bhagavaṃ→𑀪𑀕𑀯𑀁）；
 *  - 詞首/非輔音後的元音 → 獨立元音字母（14 個俱全）；
 *  - 叢集長鍵 kṣ/jñ 及 Old Tamil 疊輔音 ḻḻ/ṟṟ/ṉṉ 貪婪優先；
 *  - 大寫拉丁詞首（專名）歸一為小寫匹配。
 * 未命中原樣保留。
 */
export function brahmiRomanToNative(input: string, _opts?: TransliterationOptions): string {
  const src = input.replace(/^\*+/, "").toLowerCase();
  let out = "";
  let i = 0;
  let lastWasConsonant = false; // 上一輸出是否為輔音字母（供 virama 判定）
  while (i < src.length) {
    // <jm>（NUMBER JOINER U+1107F）：檢字表已列、出向有鍵，入向補獨立分支——
    // 否則孤立 <jm>（非 ;100/;1000 乘法語境）透傳破損（'<'+JA+VIRAMA+MA+VIRAMA+'>' 實錘）。
    // 下方 numKeys 命中後的情境補寫保留：先於數字消費 <jm> 與語境補寫互不干擾
    // （;100<jm>;4 序列——;100 先命中，其後 <jm> 走本分支，語境補寫不再觸發，結果相同）。
    if (src.startsWith("<jm>", i)) { out += cp(BRAHMI_NUM_JOINER); i += 4; lastWasConsonant = false; continue; }
    // \uXXXX／⟨U+XXXX⟩ 標註還原（未收錄碼位的顯式標註，往返無損）
    // esc 解析改共用 parseEscCp（{4,6} 貪婪吞後續 a-f 拉丁字母——真機實錘）
    // B2/r156：本分支**先於**任何單鍵匹配（數字/元音/輔音）——⟨U+11045⟩ 若先走
    // digitKeys 會被逐鍵拆成 𑁧𑁧𑁦𑁪𑁫（體例整段原子性實錘）。
    const escB = parseEscCp(src.slice(i));
    if (escB !== null) {
      if (lastWasConsonant) out += cp(BRAHMI_VIRAMA);
      out += String.fromCodePoint(escB.cp);
      i += escB.width;
      lastWasConsonant = false;
      continue;
    }
    // upadhmaniya "~h"（U+11004，後接同部位清塞音）——charTable 已列、
    // 引擎補專鍵（否則 ~ 透傳＋h 誤轉 HA+尾 virama，語料覆蓋率暴露缺口）
    if (src.startsWith("~h", i)) { out += cp(BRAHMI_UPADHMANIYA); i += 2; lastWasConsonant = false; continue; }
    // P2-3：LLA 捲舌邊音（上下文消歧）——'ḷ' 後接元音（固有 a 或附標）時取
    // LLA 11034（音節級）；裸 'ḷ' 落到下方獨立元音分支＝聲化元音 𑀍。
    // 天城體直引「ळ」一律為捲舌邊音（無聲化元音歧義）。ḷḷ（OT LLLA）由
    // BRAHMI_CONSONANT 長鍵貪婪匹配先於此分支，不受影響。
    if (src[i] === "ḷ" && !src.startsWith("ḷḷ", i)) {
      const dvL = src.slice(i + 1, i + 3);
      const isLLA = src[i + 1] === "a" || BRAHMI_VOWEL_SIGN[dvL] !== undefined ||
        BRAHMI_VOWEL_SIGN[src[i + 1]] !== undefined;
      if (isLLA) {
        if (lastWasConsonant) out += cp(BRAHMI_VIRAMA);
        out += cp(BRAHMI_LLA);
        i += 1;
        if (BRAHMI_VOWEL_SIGN[dvL] !== undefined) { out += cp(BRAHMI_VOWEL_SIGN[dvL]); i += 2; lastWasConsonant = false; }
        else if (src[i] === "a") { i += 1; lastWasConsonant = false; }
        else lastWasConsonant = true;
        continue;
      }
    }
    if (src.startsWith("ळ", i)) {
      if (lastWasConsonant) out += cp(BRAHMI_VIRAMA);
      out += cp(BRAHMI_LLA);
      i += 1;
      const dvA = src.slice(i, i + 2);
      if (BRAHMI_VOWEL_SIGN[dvA] !== undefined) { out += cp(BRAHMI_VOWEL_SIGN[dvA]); i += 2; lastWasConsonant = false; }
      else if (src[i] === "a") { i += 1; lastWasConsonant = false; }
      else lastWasConsonant = true;
      continue;
    }
    // candrabindu m̐（m+U+0310，2 碼元）須先於輔音 m 比對，否則 m 被輔音分支吞掉
    // （檢字表審計實錘：m̐ 全域輸出 1102b,11046,310 錯誤序列）
    const preS = matchAt(src, i, signKeys, BRAHMI_SIGNS);
    if (preS) { out += cp(preS[1]); i += preS[0].length; lastWasConsonant = false; continue; }
    const c = matchAt(src, i, consKeys, BRAHMI_CONSONANT);
    if (c) {
      // 輔音直接接輔音（或叢集）：前輔音補 VIRAMA（agra、kṣetra、jñāna 皆此規則）
      if (lastWasConsonant) out += cp(BRAHMI_VIRAMA);
      out += cp(c[1]);
      i += c[0].length;
      // 消費緊隨的元音：長鍵 ai/au 先比對（否則 "a" 先被固有元音吞掉），
      // 'a' 為固有（不寫），其他元音寫符號
      const dv = src.slice(i, i + 2);
      if (BRAHMI_VOWEL_SIGN[dv] !== undefined) {
        out += cp(BRAHMI_VOWEL_SIGN[dv]);
        i += 2;
        lastWasConsonant = false;
      } else {
        const v = src[i];
        if (v === "a") {
          i += 1;
          lastWasConsonant = false;
        } else if (v !== undefined && BRAHMI_VOWEL_SIGN[v] !== undefined) {
          out += cp(BRAHMI_VOWEL_SIGN[v]);
          i += 1;
          lastWasConsonant = false;
        } else {
          // 無元音（死輔音 / 叢集中間件）：留在 lastWasConsonant，由下一輪補 virama
          lastWasConsonant = true;
        }
      }
      // 音節尾加成分（ṃ/ḥ/m̐）：不取消固有 a（天城體編碼事實同款）
      // 音節尾加成分消費改 signKeys matchAt（長鍵優先）——m̐ 為 2 碼元鍵，
      // 舊單字符查表吃不到，殘尾落入輔音分支誤轉（實錘）
      let tailSign: [string, number] | null;
      while ((tailSign = matchAt(src, i, signKeys, BRAHMI_SIGNS))) {
        out += cp(tailSign[1]);
        i += tailSign[0].length;
        // 音節尾加成分（ṃ/ḥ/m̐）已消費：詞尾不再視為死輔音，否則出口誤補
        // virama（kṣaṃ/jñaḥ 叢集＋尾加成分組合實錘：kṣṃ→𑀓𑁆𑀱𑀁𑁆）
        lastWasConsonant = false;
      }
      continue;
    }
    // 詞首/非輔音後的元音 → 獨立元音字母（indepKeys 長鍵優先，ai/au 不會被拆散）
    const iv = matchAt(src, i, indepKeys, BRAHMI_VOWEL_INDEP);
    if (iv) {
      out += cp(iv[1]);
      i += iv[0].length;
      lastWasConsonant = false;
      continue;
    }
    const s = matchAt(src, i, signKeys, BRAHMI_SIGNS);
    if (s) { out += cp(s[1]); i += s[0].length; lastWasConsonant = false; continue; }
    const d = matchAt(src, i, digitKeys, BRAHMI_DIGITS);
    if (d) { out += cp(d[1]); i += d[0].length; lastWasConsonant = false; continue; }
    const p = matchAt(src, i, punctKeys, BRAHMI_PUNCT);
    if (p) { out += cp(p[1]); i += p[0].length; lastWasConsonant = false; continue; }
    const nm = matchAt(src, i, numKeys, BRAHMI_NUM);
    if (nm) {
      out += cp(nm[1]);
      i += nm[0].length;
      // 乘法：100/1000 後接 <jm>（顯式 NUMBER JOINER 鍵）＋ 乘數 ⇒ joiner 顯式往返
      if (src.slice(i, i + 4) === "<jm>" && (nm[1] === 0x11064 || nm[1] === 0x11065)) {
        out += cp(BRAHMI_NUM_JOINER);
        i += 4;
      }
      lastWasConsonant = false;
      continue;
    }
    const ov = matchAt(src, i, otVowelKeys, BRAHMI_OT_VOWELS);
    if (ov) { out += cp(ov[1]); i += ov[0].length; lastWasConsonant = false; continue; }
    const oe = matchAt(src, i, otExtraKeys, BRAHMI_OT_EXTRA);
    if (oe) {
      // B-B1 配套：ṉṉ 疊寫貪婪成對輸出（NNNA+NNNA）；ṉ/ṟṟ 等鍵尾含固有 a，
      // 其後 'a' 消費不寫、其他元音寫附標（同輔音分支語義，否則 kaṉa→𑀓𑀷𑀅 破往返）
      if (oe[0] === "ṉ" && src.startsWith("ṉṉ", i)) {
        out += cp(0x11037) + cp(0x11037);
        i += 2;
      } else {
        out += cp(oe[1]);
        i += oe[0].length;
      }
      const ov2 = src[i];
      if (ov2 === "a") i += 1;
      else if (ov2 !== undefined && BRAHMI_VOWEL_SIGN[ov2] !== undefined) { out += cp(BRAHMI_VOWEL_SIGN[ov2]); i += 1; }
      lastWasConsonant = false;
      continue;
    }
    // ".a" avagraha（11003）入向
    if (src.startsWith(".a", i)) { if (lastWasConsonant) out += cp(BRAHMI_VIRAMA); out += cp(0x11003); i += 2; lastWasConsonant = false; continue; }
    // 未命中原樣保留；輸出前若上一是死輔音（詞尾裸輔音如 arhat 的 t）補 virama：
    // 此處的「下一字元非輔音/元音」即詞尾死輔音情境
    if (lastWasConsonant) out += cp(BRAHMI_VIRAMA);
    out += src[i];
    i += 1;
    lastWasConsonant = false;
  }
  // 字串結束仍掛著死輔音：補 virama（arhat→𑀅𑀭𑁆𑀳𑀢𑁆；bhagavat→…𑀢𑁆）
  if (lastWasConsonant) out += cp(BRAHMI_VIRAMA);
  return out;
}

/**
 * 婆羅米文 → 羅馬字（裸輔音回填固有 'a'）。
 * 輔音字母後若緊跟 virama 則併入叢集（不回填 'a'），緊跟元音符號則併寫，
 * 否則補固有 'a'。叢集長鍵（kṣ/jñ、Old Tamil 疊輔音）反查還原慣用拼寫。
 * 未命中原樣保留。
 */
export function brahmiNativeToRoman(input: string, _opts?: TransliterationOptions): string {
  const codes = [...input].map((ch) => ch.codePointAt(0)!);
  let out = "";
  let i = 0;
  while (i < codes.length) {
    const n = codes[i];
    // B-B1：NNNA（11037）連續段——前 run-1 枚直接還原 ṉ（不回填固有 a，對應疊寫鍵
    // ṉṉ），最後一枚交下方主輔音路徑（virama 鏈／元音符／固有 a 語義一致），
    // 故 "ṉṉ"→NNNA×2、單 ṉ→NNNA 皆閉環。
    if (n === 0x11037) {
      let run = 0;
      while (codes[i] === 0x11037) { run += 1; i += 1; }
      if (run > 1) out += "ṉ".repeat(run - 1);
      i -= 1; // 最後一枚交由主輔音路徑處理
    }
    // review：upadhmaniya（U+11004）反查 "~h"（與 charTable 展示鍵一致）
    if (n === BRAHMI_UPADHMANIYA) { out += "~h"; i += 1; continue; }
    const cons = REV_CONSONANT.get(n);
    if (cons !== undefined) {
      let roman = cons;
      let deadEnd = false; // 鏈尾孤立 virama：輔音無固有元音（詞尾死輔音 / 畸形叢集）
      let orphanVirama = false; // B-B2：孤立 virama 透傳標記
      i += 1;
      // 收集 virama 鏈：cons + virama + cons …（agra、kṣetra、jñāna 皆此結構）
      while (codes[i] === BRAHMI_VIRAMA) {
        i += 1;
        const nx = i < codes.length ? codes[i] : undefined;
        const nxCons = nx !== undefined ? REV_CONSONANT.get(nx) : undefined;
        // B-B2：鏈尾孤立 virama（後非輔音）原靜默丟棄——改透傳碼位（orphanVirama
        // 標記，roman 發出後補透傳），與「未命中原樣保留」契約一致
        if (nxCons === undefined) { deadEnd = true; orphanVirama = true; break; }
        roman += nxCons;
        i += 1;
      }
      out += roman;
      // deadEnd（詞尾孤立 virama）不透傳 virama 字符——IAST/學術
      // 拉丁語法中詞尾裸輔音即表達死輔音（romanToNative 會補回詞尾 virama），透傳
      // 𑁆 字符反而破壞權威語料往返（devanam↔𑀤𑁂𑀯𑀦𑀫𑁆 等 7 條）；原「未命中
      // 保留」契約由 romanToNative 的詞尾補 virama 規則對稱承擔
      void orphanVirama;
      // 叢集末件承接後隨元音符號；無附標且非死輔音、非叢集長鍵時回填固有 'a'
      const nextCode = i < codes.length ? codes[i] : undefined;
      const sign = nextCode !== undefined ? REV_VOWEL_SIGN.get(nextCode) : undefined;
      if (sign !== undefined) { out += sign; i += 1; }
      else if (!deadEnd && !REV_CLUSTER_ROMAN.has(roman) && !OT_BARE_CONS.has(codes[i - 1]) && !roman.endsWith("a")) out += "a";
      // 音節尾加成分（ṃ/ḥ/m̐ 不取消固有 a）
      while (i < codes.length && REV_SIGNS.get(codes[i]) !== undefined) {
        out += REV_SIGNS.get(codes[i])!;
        i += 1;
      }
      continue;
    }
    const vi = REV_VOWEL_INDEP.get(n);
    if (vi !== undefined) { out += vi; i += 1; continue; }
    const sg = REV_SIGNS.get(n);
    if (sg !== undefined) { out += sg; i += 1; continue; }
    // 孤立元音符號（前無輔音宿主，異常序列）——原「按鍵還原」往返成獨立形
    //（matra↔indep 不對稱）→ \uXXXX 標註保位（全拉丁化；入向 esc 對稱還原）
    const vs = REV_VOWEL_SIGN.get(n);
    if (vs !== undefined) { out += escapeRomanCp(n); i += 1; continue; } // B2/r156
    const dg = REV_DIGITS.get(n);
    if (dg !== undefined) { out += dg; i += 1; continue; }
    const pu = REV_PUNCT.get(n);
    if (pu !== undefined) { out += pu; i += 1; continue; }
    // Old Tamil virama（11070：不形成連字，取消固有元音而已）——r73 改 \uXXXX 標註（全拉丁化；入向 esc 對稱還原）
    if (n === BRAHMI_OT_VIRAMA) { out += escapeRomanCp(n); i += 1; continue; } // B2/r156
    // upadhmaniya（11004）——透傳（r45 B-4）
    if (n === BRAHMI_UPADHMANIYA) { out += String.fromCodePoint(n); i += 1; continue; }
    // NUMBER JOINER（1107F）：只能是乘法序列中繼——還原為 <jm> 鍵（r45 B-1 顯式往返）
    if (n === BRAHMI_NUM_JOINER) { out += "<jm>"; i += 1; continue; }
    // 加法系數字符號（11052–11065）：N 鍵還原；100/1000 後若接 joiner 一併輸出
    const rn = REV_NUM.get(n);
    if (rn !== undefined) {
      out += rn;
      i += 1;
      if (codes[i] === BRAHMI_NUM_JOINER && (n === 0x11064 || n === 0x11065)) continue; // <jm> 由 joiner 分支輸出
      continue;
    }
    // 11003 avagraha → ".a"（IAST 連聲慣例；入向 ".a"↔11003 對稱）
    if (n === 0x11003) { out += ".a"; i += 1; continue; }
    // 其餘未收錄碼位（11039 Bhattiprolu aa、孤立 11046 virama、11070 OT virama
    // 等舊「透傳」位）→ \uXXXX 顯式標註（全拉丁化；入向 esc 對稱還原）。
    // 鐵律：esc 出向僅限方案法定區段（11000-1107F）——區段外（如 25CC
    // DOTTED CIRCLE 展示用前綴、其他文種字符）一律原樣透傳（實機實錘：
    // "◌𑀀"→"\u0025CCm̐" 誤標註 25CC）
    if (n >= 0x11000 && n <= 0x1107f) {
      out += escapeRomanCp(n); // B2/r156
    } else {
      out += String.fromCodePoint(n);
    }
    i += 1;
  }
  return out;
}

/* ---------------- 檢字表 ---------------- */

function buildBrahmiCharTable(): CharTableEntry[] {
  const rows: CharTableEntry[] = [];
  const push = (roman: string, native: string, section: string, note?: string, sectionNote?: string): void => {
    rows.push({ roman, native, section, ...(note ? { note } : {}), ...(sectionNote ? { sectionNote } : {}) });
  };
  // 檢字表審計誠實化：native 欄＝引擎單鍵實跑輸出。
  //  - 輔音單鍵詞尾補 virama（阿育王銘文正字法：無後續元音的輔音寫死輔音形）；
  //  - 元音單鍵詞首輸出獨立元音字母（表列附標形僅在音節內出現，由輔音+元音組合產生）。
  for (const [r, c] of Object.entries(BRAHMI_VOWEL_INDEP))
    push(r, cp(c), "獨立元音", "詞首單鍵輸出獨立元音字母；音節內（輔音後）輸出對應附標元音符號");
  for (const [r, c] of Object.entries(BRAHMI_CONSONANT)) {
    push(r, cp(c) + cp(BRAHMI_VIRAMA), "輔音",
      (r === "ḷḷ" ? "OLD TAMIL LLLA（疊輔音）；" : "") + "詞尾補 virama（阿育王銘文正字法）；後接元音＝固有 a 或附標");
  }
  // P2-3：LLA 檢字表列音節級鍵 "ḷa"（與引擎反查 n2r(𑀴)="ḷa" 一致）；
  // 裸 'ḷ' 為聲化元音 𑀍（獨立元音區已列），故捲舌邊音以 "ḷa" 為鍵展示。
  push("ḷa", cp(BRAHMI_LLA), "輔音", "LLA（Prakrit 捲舌邊音 ḷ；上下文消歧：ḷ+元音＝捲舌邊音、裸 ḷ＝聲化元音 𑀍）");
  push("ळa", cp(BRAHMI_LLA), "輔音", "LLA 之天城體直引別名鍵（＝ḷa，僅正向鍵入；反查歸 ḷa）");
  for (const [r, cs] of Object.entries(BRAHMI_CLUSTER)) {
    push(r, cs.map(cp).join("") + cp(BRAHMI_VIRAMA), "輔音", "叢集長鍵（顯式 virama）；詞尾補 virama");
  }
  push("a（固有）", "", "元音符號", "輔音自帶固有 a，不寫出");
  // 檢字表審計誠實化：單鍵 ā 等詞首輸出獨立元音字母（引擎實輸）；表列附標形
  // 僅在輔音後出現——native 改引擎實輸、note 註附標形碼位。
  // 檢字表審計：VOWEL_SIGN 鍵多與 VOWEL_INDEP 重疊（ā/i/u…）——
  // 獨立元音區已列者不再重複列（char-table-gate dup=0），僅列附標專有鍵；
  // 表列附標形 native＋note 說明詞首單鍵輸出獨立形（ḹ 教訓：native＝引擎實況）
  for (const [r, c] of Object.entries(BRAHMI_VOWEL_SIGN)) {
    if (BRAHMI_VOWEL_INDEP[r] !== undefined) continue;
    push(r, cp(c), "元音符號");
  }
  push("ṃ", cp(0x11001), "符號", "anusvāra（巴利 niggahita；不取消固有 a）");
  push("ḥ", cp(0x11002), "符號", "visarga 止聲");
  push("m̐", cp(0x11000), "符號", "candrabindu");
  push("（virama）", "—", "符號", "說明列（非獨立輸入鍵）：由叢集長鍵 kṣ/jñ 或詞尾規則產生，去除固有 a（附標 U+11046）");
  for (const [r, c] of Object.entries(BRAHMI_DIGITS)) push(r, cp(c), "數字");
  for (const [r, c] of Object.entries(BRAHMI_PUNCT)) {
    push(r, cp(c), "標點");
  }
  for (const [r, c] of Object.entries(BRAHMI_NUM)) push(r, cp(c), "數字（加法系）", "高值在前組合；;100/;1000 後接 <jm> 為乘法");
  push("<jm>", cp(BRAHMI_NUM_JOINER), "數字（加法系）", "NUMBER JOINER 乘法連接符（;100<jm>;4＝400）");
  push("_.", "—", "符號", "Old Tamil puḷḷi（不形成連字）；入向 _. 透傳原樣，出向 U+11070 → _.；表列鍵僅供反查");
  for (const [r, c] of Object.entries(BRAHMI_OT_VOWELS)) push(r, cp(c), "獨立元音", "Old Tamil 原子短元音");
  for (const [r, c] of Object.entries(BRAHMI_OT_EXTRA)) push(r, cp(c), "輔音", "Old Tamil 專有字母");
  push("~h", cp(BRAHMI_UPADHMANIYA), "符號", "upadhmaniya（後接同部位清塞音）");
  return rows;
}

/* ---------------- 註冊 ---------------- */

const brahmiCharTable = buildBrahmiCharTable();

const brahmiIast: TransliterationScheme = {
  id: "brahmi-iast",
  label: {
    zh: "婆罗米文 IAST",
    "zh-TW": "婆羅米文 IAST",
    en: "Brahmi (IAST)",
    ja: "ブラーフミー文字（IAST）",
    ko: "브라흐미 문자(IAST)",
  fr: "Brahmi (IAST)", de: "Brahmi (IAST)", },
  group: "brahmi",
  primary: true,
  description:
    "婆羅米文（Brahmi，U+11000–U+1107F）↔ IAST：阿育王銘文與巴利/梵文文獻轉寫。" +
    "輔音自帶固有元音 a，叢集以顯式 virama 標寫（kṣ/jñ 為長鍵）；含 Old Tamil 三字母。",
  romanToNative: (i, o) => brahmiRomanToNative(i, o),
  nativeToRoman: (i, o) => brahmiNativeToRoman(i, o),
  looksLikeNative: looksLikeBrahmi,
  looksLikeRoman: looksLikeBrahmiRoman,
  convert: (i, o) => (looksLikeBrahmi(i) ? brahmiNativeToRoman(i, o) : brahmiRomanToNative(i, o)),
  charTable: brahmiCharTable,
  // 檢字表 token（; 前綴標點/加法系數字 ;1…;1000、<jm> 乘法連接符、
  // ;100<jm>;4 乘法組合）整體免切詞——; < > 是詞界 trigger 字符，逐詞掃描
  // 會把前綴切丟且碎片被 gate 拒（真機實錘透傳）。
  // 檢字表審計擴集：;/<jm> 之外，天城直引「ळa」、danda「।॥」、Old Tamil
  // puḷḷi「_.」/原子短元音「.e .o」、upadhmaniya「~h」、加法系「;-」皆含詞界
  // trigger 字符（; _ . ~ ळ），逐詞掃描會拆散透傳——併入原子 token。
  romanTokenRe: /^(?:⟨U\+[0-9A-Fa-f]{4,8}⟩|\\u[0-9A-Fa-f]{4,6}|;[.;:*()*0-9]{1,6}(?:<jm>;[.;:*()*0-9]{1,6})*|<jm>|ळa|।|॥|;-|_\.|\.a|\.e|\.o|~h)$/,
  // B2/r156：⟨U+XXXX⟩ 註記＋舊 \uXXXX esc 體例原子化（escAnnotationToken 同款）——
  // ⟨ 與 \ 皆會被長文掃描切詞拆散成逐鍵碎片（11045→<jm>… 實錘），整體送轉換器。
};

registerScheme(brahmiIast);
