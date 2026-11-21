// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry
/**
 * 悉曇體（Siddham，Unicode U+11580–U+115FF）↔ IAST / HK / ITRANS 轉寫器。
 *
 * 【設計決策：復用天城體引擎，不做第二套 abugida 實作】
 *  悉曇體是天城體（Devanagari）之直接前身，二者同屬婆羅米系 abugida，
 *  輔音清單（ka…ha，共 33）、元音 matra、virama 合字模型完全一致，僅碼位不同。
 *  因此本模組**不重寫**拼寫引擎，而是：
 *    1. 用 src/indic.ts 已驗證的「天城體拼寫引擎」把羅馬字 → 天城體碼位；
 *    2. 再用一份嚴格的「天城體碼位 → 悉曇體碼位」對照表（見下方 *_MAP）重映射到
 *       悉曇體；逆向同理。
 *  這樣合字（virama U+115BF）、niggahita sandhi、固有 a 處理等全部繼承 indic.ts
 *  的已驗證行為，不會因重寫而引入回歸。
 *
 * 【悉曇體 Unicode 佈局（依 Unicode 16.0 核心規範 / 最終提案 n4294、L2/12-011r）】
 *  - 獨立元音 LETTER：U+11580( a )…U+1158D( au )，共 14 個（含聲化元音 ṛṝḷḹ）。
 *  - 輔音 LETTER：U+1158E( ka )…U+115AE( ha )，連續 33 個，順序與天城體 0915–0939 一致。
 *  - 依賴元音（matra）VOWEL SIGN：U+115AF( ā )…U+115BB( au )。
 *  - 符號：candrabindu U+115BC、anusvāra U+115BD、visarga U+115BE、virama U+115BF。
 *  - virama 與天城體同義（消固有 a）；合字模型與天城體相同（virama 置於叢集各輔音間）。
 *  - 注意：悉曇體**最終編碼不含** RRA / LLA / FA 等輔音字母（提案版 115C1–115C3 在
 *    正式編碼中改爲 nukta / siddham 頭標 / 標點），故 ISO 15919 的 ṟ/ṉ/ḻ 與巴利 ḷ
 *    在悉曇體無專用字母——本模組僅提供 IAST 主方案（不含 ḷ 等 ISO 專用輔音），
 *    HK / ITRANS 亦只用 33 個標準輔音，故可無損涵蓋。
 *
 * 【蘭札體 / Rañjanā（Lantsa）】
 *  蘭札體尚無標準 Unicode；本插件內嵌的 Nithya Ranjana DU 採 **Devanagari 碼位
 *  （U+0900–U+097F）** 由字型渲染爲蘭札字形（見 src/languages.ts 的 ranjana 檔案）。
 *  專屬方案 ranjana-iast 已註冊（src/indic.ts），與 sanskrit-iast 同構、輸出同碼位，
 *  檢字表歸獨立「ranjana」分組（`SCRIPT_PREFERRED_SCHEME.ranjana = "ranjana-iast"`）。
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
import {
  type IndicOptions,
  iastToDevanagari,
  devanagariToIast,
  iastToHk,
  hkToIast,
  itransToDevanagari,
  devanagariToItrans,
  buildItransCharTable,
  looksLikeIast,
} from "./indic";

const cp = (n: number): string => String.fromCodePoint(n);

/* ---------------- 悉曇體字母表（IAST 鍵 → 悉曇體碼位） ---------------- */
const SIDDHAM_CONSONANT: Record<string, number> = {
  k: 0x1158e, kh: 0x1158f, g: 0x11590, gh: 0x11591, "ṅ": 0x11592,
  c: 0x11593, ch: 0x11594, j: 0x11595, jh: 0x11596, "ñ": 0x11597,
  "ṭ": 0x11598, "ṭh": 0x11599, "ḍ": 0x1159a, "ḍh": 0x1159b, "ṇ": 0x1159c,
  t: 0x1159d, th: 0x1159e, d: 0x1159f, dh: 0x115a0, n: 0x115a1,
  p: 0x115a2, ph: 0x115a3, b: 0x115a4, bh: 0x115a5, m: 0x115a6,
  y: 0x115a7, r: 0x115a8, l: 0x115a9, v: 0x115aa,
  "ś": 0x115ab, "ṣ": 0x115ac, s: 0x115ad, h: 0x115ae,
};
const SIDDHAM_VOWEL_INDEP: Record<string, number> = {
  a: 0x11580, "ā": 0x11581, i: 0x11582, "ī": 0x11583, u: 0x11584, "ū": 0x11585,
  e: 0x1158a, ai: 0x1158b, o: 0x1158c, au: 0x1158d,
};
const SIDDHAM_MATRA: Record<string, number> = {
  a: 0 /* 固有 a，不輸出 */, "ā": 0x115af, i: 0x115b0, "ī": 0x115b1,
  u: 0x115b2, "ū": 0x115b3, e: 0x115b8, ai: 0x115b9, o: 0x115ba, au: 0x115bb,
};
const SIDDHAM_VOCALIC: Record<string, number> = {
  "ṛ": 0x11586, "ṝ": 0x11587, "ḷ": 0x11588, "ḹ": 0x11589,
};
/**
 * 聲化元音的依附符號（matra）。
 *
 * **只有 ṛ / ṝ 有 matra**。悉曇體 Unicode 區（U+11580–U+115FF）在
 * U+115B5（VOCALIC RR）之後直接跳到 U+115B8（VOWEL SIGN E）——U+115B6 / U+115B7
 * 是**保留碼位**，Unicode 並未編碼聲化 ḷ / ḹ 的 matra（對應天城體 ◌ॢ U+0962、
 * ◌ॣ U+0963）。舊表按「ṛ ṝ ḷ ḹ 連續」想當然補成 B4/B5/**B6/B7**，於是檢字表
 * 這兩格在任何字體裡都只能是豆腐塊。
 *
 * 故 ḷ / ḹ 不列 matra：引擎層面讓天城體 ◌ॢ/◌ॣ 原樣透傳（見 devanagariToSiddham
 * 的「未命中原樣透傳」契約），可保往返不失真；檢字表則只列其獨立字母（U+11588
 * / U+11589，這兩個是已分配的），並於 note 說明無依附符號。
 */
const SIDDHAM_VOCALIC_MATRA: Record<string, number> = {
  "ṛ": 0x115b4, "ṝ": 0x115b5,
};

/* ---------------- 天城體 → 悉曇體 嚴格對照表（remap 用） ---------------- */
const DEVA_TO_SIDDHA_CONSONANT: Record<number, number> = {
  0x0915: 0x1158e, 0x0916: 0x1158f, 0x0917: 0x11590, 0x0918: 0x11591, 0x0919: 0x11592,
  0x091a: 0x11593, 0x091b: 0x11594, 0x091c: 0x11595, 0x091d: 0x11596, 0x091e: 0x11597,
  0x091f: 0x11598, 0x0920: 0x11599, 0x0921: 0x1159a, 0x0922: 0x1159b, 0x0923: 0x1159c,
  0x0924: 0x1159d, 0x0925: 0x1159e, 0x0926: 0x1159f, 0x0927: 0x115a0, 0x0928: 0x115a1,
  0x092a: 0x115a2, 0x092b: 0x115a3, 0x092c: 0x115a4, 0x092d: 0x115a5, 0x092e: 0x115a6,
  0x092f: 0x115a7, 0x0930: 0x115a8, 0x0932: 0x115a9, 0x0935: 0x115aa,
  0x0936: 0x115ab, 0x0937: 0x115ac, 0x0938: 0x115ad, 0x0939: 0x115ae,
};
const DEVA_TO_SIDDHA_VOWEL_INDEP: Record<number, number> = {
  0x0905: 0x11580, 0x0906: 0x11581, 0x0907: 0x11582, 0x0908: 0x11583,
  0x0909: 0x11584, 0x090a: 0x11585, 0x090b: 0x11586, 0x090c: 0x11588,
  0x090f: 0x1158a, 0x0910: 0x1158b, 0x0913: 0x1158c, 0x0914: 0x1158d,
  // 聲化長元音的獨立字母**不在** U+0905–0914 區間：ॠ U+0960、ॡ U+0961
  // （舊表誤用 090C/D/E，與 indic.ts 同批糾偏；U+090D/E 實爲 ऍ/ऎ，非梵文音素）
  0x0960: 0x11587, 0x0961: 0x11589,
};
const DEVA_TO_SIDDHA_MATRA: Record<number, number> = {
  0x093e: 0x115af, 0x093f: 0x115b0, 0x0940: 0x115b1, 0x0941: 0x115b2, 0x0942: 0x115b3,
  0x0943: 0x115b4, 0x0944: 0x115b5, 0x0947: 0x115b8, 0x0948: 0x115b9,
  0x094b: 0x115ba, 0x094c: 0x115bb,
  // 聲化 ◌ॢ/◌ॣ（U+0962/U+0963）**不再**映射至悉曇——悉曇體未編碼這兩個
  // matra，舊表指到的 U+115B6/U+115B7 是 Unicode 保留碼位，轉寫輸出會是豆腐塊。
  // 不映射＝走 devanagariToSiddham 的「未命中原樣透傳」：天城體碼位原樣保留，
  // 往返（siddhamToIast）仍然正確，且不會產出無字形碼位。
};
const DEVA_TO_SIDDHA_SIGN: Record<number, number> = {
  0x0901: 0x115bc, // candrabindu
  0x0902: 0x115bd, // anusvāra
  0x0903: 0x115be, // visarga
  0x094d: 0x115bf, // virama
  // S-3，Ch.15 §15.5 Table 15-3：句讀——danda/雙 danda 有悉曇對應碼位，
  // 經引擎既有 danda 管線（IAST「|」/「||」）雙向閉環。
  0x0964: 0x115c2, // SIDDHAM DANDA（句末）
  0x0965: 0x115c3, // SIDDHAM DOUBLE DANDA（段末）
  // C-S1：悉曇體未編碼 ॐ（U+0950 OM）——悉曇文本以開篇符 siddham（U+115C1，
  // SIDDHAM SIGN SIDDHAM，代表 siddham / siddhir astu）開篇，故天城體 OM 映射至此，
  // 不再原樣透傳（透傳會在天城體碼位區殘留 ॐ，悉曇字體無字形）。
  0x0950: 0x115c1,
};

/* ---------------- 悉曇體 → 天城體 反向對照表 ---------------- */
const SIDDHA_TO_DEVA_CONSONANT: Record<number, number> = inv(DEVA_TO_SIDDHA_CONSONANT);
const SIDDHA_TO_DEVA_VOWEL_INDEP: Record<number, number> = inv(DEVA_TO_SIDDHA_VOWEL_INDEP);
const SIDDHA_TO_DEVA_MATRA: Record<number, number> = inv(DEVA_TO_SIDDHA_MATRA);
const SIDDHA_TO_DEVA_SIGN: Record<number, number> = inv(DEVA_TO_SIDDHA_SIGN);

function inv(map: Record<number, number>): Record<number, number> {
  const m: Record<number, number> = {};
  for (const [k, v] of Object.entries(map)) m[v] = Number(k);
  return m;
}

/* ---------------- remap：天城體碼位 ⇄ 悉曇體碼位 ---------------- */
/** 天城體（indic.ts 引擎輸出）→ 悉曇體。未命中對照表的碼位原樣透傳（如 avagraha / 數字）；
 *  OM（U+0950）映射至悉曇開篇符 U+115C1（C-S1：悉曇無 ॐ，以開篇符替代）。 */
export function devanagariToSiddham(input: string): string {
  let out = "";
  for (const ch of input) {
    const c = ch.codePointAt(0) ?? 0;
    const s =
      DEVA_TO_SIDDHA_CONSONANT[c] ??
      DEVA_TO_SIDDHA_VOWEL_INDEP[c] ??
      DEVA_TO_SIDDHA_MATRA[c] ??
      DEVA_TO_SIDDHA_SIGN[c];
    out += s !== undefined ? cp(s) : ch;
  }
  // S-1，Ch.15 §15.5：ra＋u/uu 須用 warbler 形——「For the combination ra
  // and u should be written with the sequence <U+115A8, U+115DC> … For ra and uu,
  // the form <U+115A8, U+115DD>」。其他輔音維持 cloud 形（115B2/115B3）。
  const RA = cp(0x115a8), CU = cp(0x115b2), CUU = cp(0x115b3);
  const WU = cp(0x115dc), WUU = cp(0x115dd);
  return out
    .split(RA + CU).join(RA + WU)
    .split(RA + CUU).join(RA + WUU);
}
/** 悉曇體 → 天城體（供 indic.ts 引擎做 native→roman）。未命中原樣透傳。 */
export function siddhamToDevanagari(input: string, keepSpecialCodepoints = false): string {
  // S-1：warbler 形（115DC/115DD）歸一回 u/uu matra，供 indic 引擎轉寫
  input = input
    .split(cp(0x115dc)).join(cp(0x115b2))
    .split(cp(0x115dd)).join(cp(0x115b3));
  let out = "";
  for (const ch of input) {
    const c = ch.codePointAt(0) ?? 0;
    // C-S1 反向：開篇符 115C1 → 天城 OM 0950（r45c X-近似歧義：n2r 出 oṃ 拼出形；
    // 修復前無反向映射，孤代理拆壞「ᅜ1」實錘）。xApprox=codepoint 時保留 115C1 原碼位。
    if (c === 0x115c1) {
      out += keepSpecialCodepoints ? ch : cp(0x0950);
      continue;
    }
    const d =
      SIDDHA_TO_DEVA_CONSONANT[c] ??
      SIDDHA_TO_DEVA_VOWEL_INDEP[c] ??
      SIDDHA_TO_DEVA_MATRA[c] ??
      SIDDHA_TO_DEVA_SIGN[c];
    out += d !== undefined ? cp(d) : ch;
  }
  return out;
}

/* ---------------- 方案函數（包裝 indic.ts 引擎 + remap） ---------------- */
/** IAST → 悉曇體（拼寫層，可無損往返） */
export function iastToSiddham(input: string, opts?: IndicOptions): string {
  return devanagariToSiddham(iastToDevanagari(input, { ...opts, mode: "iast" }));
}
/** 悉曇體 → IAST */
export function siddhamToIast(input: string, opts?: IndicOptions): string {
  // X-近似歧義（r45c）：xApprox="codepoint" 時開篇符 115C1 以 \uXXXX esc 標註保留原碼位
  // （可逆；入向 esc 對稱還原）；其餘（auto/spelled）出 oṃ 拼出形（IAST 慣例）
  const codepointMode = opts?.xApprox === "codepoint";
  let out = devanagariToIast(siddhamToDevanagari(input, codepointMode), { ...opts, mode: "iast" });
  if (codepointMode) out = out.split(cp(0x115c1)).join("\\u0115C1");
  // 悉曇區段未收錄碼位（護符/分隔/重複記號 115C0+ 等，檢字表聲明「無拉丁輸入鍵」者）
  // → \uXXXX 顯式標註（全拉丁化；入向 esc 對稱還原，見 iastToSiddham）
  out = out.replace(/[\u{11580}-\u{115FF}]/gu, (ch) => escapeRomanCp(ch.codePointAt(0) ?? 0)); // B2/r156
  return out;
}

/** 悉曇體碼位特徵（U+11580–U+115FF） */
export function looksLikeSiddham(text: string): boolean {
  for (const ch of text) {
    const c = ch.codePointAt(0) ?? 0;
    if (c >= 0x11580 && c <= 0x115ff) return true;
  }
  return false;
}

/* ---------------- 檢字表數據（設定 UI 用） ---------------- */
function buildSiddhamCharTable(): CharTableEntry[] {
  const rows: CharTableEntry[] = [];
  for (const [k, v] of Object.entries(SIDDHAM_CONSONANT)) {
    // 檢字表審計誠實化：輔音單鍵詞尾補 virama（天城體同款拼寫規則，引擎實輸）
    rows.push({ native: cp(v) + cp(0x115bf), roman: k,
      note: "輔音基底（ka＝𑖎）；詞尾補 virama（合字中 k 不帶 a）；後接元音＝固有 a 或附標", section: "輔音" });
  }
  for (const [k, v] of Object.entries(SIDDHAM_VOWEL_INDEP)) {
    const matra = SIDDHAM_MATRA[k];
    // 檢字表審計誠實化：native＝引擎單鍵實輸（獨立元音字母）；表列原「獨立+matra」
    // 為展示組合——附標形僅在輔音後出現，碼位移入 note。
    rows.push({
      native: cp(v),
      roman: k,
      note: matra ? `詞首單鍵輸出獨立形；音節內輔音後輸出附標 U+${matra.toString(16).toUpperCase()}` : "元音 a（固有 a，不輸出 matra）",
      section: "元音",
    });
  }
  for (const [k, v] of Object.entries(SIDDHAM_VOCALIC)) {
    // ḷ / ṃ…（無 matra 者）只列獨立字母，不再拼上不存在的依附符號
    //（舊碼 cp(SIDDHAM_VOCALIC_MATRA[k]) 會拿到 U+115B6/B7 保留碼位 → 豆腐塊）。
    const matra = SIDDHAM_VOCALIC_MATRA[k];
    rows.push({
      native: cp(v),
      roman: k,
      note: matra
        ? `聲化元音：詞首單鍵輸出獨立形；音節內輔音後輸出附標 U+${matra.toString(16).toUpperCase()}`
        : "聲化元音：悉曇體未編碼此依附符號（Unicode 保留碼位），故僅列獨立字母",
      section: "元音",
    });
  }
  rows.push({ native: cp(0x115bd), roman: "ṃ", note: "anusvāra（niggahita；不取消固有 a）", section: "符號" });
  rows.push({ native: cp(0x115be), roman: "ḥ", note: "visarga 止聲", section: "符號" });
  rows.push({ native: cp(0x115bc), roman: "m̐", note: "candrabindu", section: "符號" });
  rows.push({ native: "—", roman: "（合字）", note: "說明列（非獨立輸入鍵）：virama U+115BF 去除固有 a，由叢集長鍵或詞尾規則產生", section: "符號" });
  // 標點/頭標/重複號（Ch.15 §15.5；danda 雙向經引擎「|」「||」）
  rows.push({ native: "—", roman: "（開篇）", note: "說明列（無拉丁輸入鍵）：SIDDHAM SIGN SIDDHAM U+115C1，寫於文本開頭，代表 siddham / siddhir astu；OM（ॐ，U+0950）亦以此開篇符替代（悉曇體無 ॐ 碼位）", section: "符號" });
  rows.push({ native: cp(0x115c2), roman: "|", note: "SIDDHAM DANDA：句末", section: "符號" });
  rows.push({ native: cp(0x115c3), roman: "||", note: "SIDDHAM DOUBLE DANDA：段末", section: "符號" });
  rows.push({ native: "—", roman: "（點隔）", note: "說明列（無拉丁輸入鍵）：U+115C4，SEPARATOR DOT：音節/詞/短語邊界（頭高）", section: "符號" });
  rows.push({ native: "—", roman: "（線隔）", note: "說明列（無拉丁輸入鍵）：U+115C5，SEPARATOR BAR：音節/詞/短語邊界", section: "符號" });
  rows.push({ native: "—", roman: "（重複1）", note: "說明列（無拉丁輸入鍵）：U+115C6，REPETITION MARK-1：寫於被重複文本之後", section: "符號" });
  rows.push({ native: "—", roman: "（重複2）", note: "說明列（無拉丁輸入鍵）：U+115C7，REPETITION MARK-2", section: "符號" });
  rows.push({ native: "—", roman: "（重複3）", note: "說明列（無拉丁輸入鍵）：U+115C8，REPETITION MARK-3", section: "符號" });
  rows.push({ native: "—", roman: "（文末）", note: "說明列（無拉丁輸入鍵）：U+115C9，END OF TEXT MARK：文本完成", section: "符號" });
  rows.push({ native: "—", roman: "（外來音）", note: "說明列（無拉丁輸入鍵）：U+115C0，NUKTA：轉寫非原生音（日語/英語等外來音用）", section: "符號" });
  // 檢字表審計：真鍵 ru/rū（引擎輸入即自動輸出 warbler 形）——舊鍵列「ru（warbler）」
// 混中文說明非可輸入鍵（B 類）；說明挪 note（HK 派生經 iastToHk 自動映射 rU/RU）。
rows.push({ native: cp(0x115dc), roman: "ru", note: "ra+u 須用 warbler 形（115A8+115DC），異於其他輔音的 cloud 形；輸入 ru 自動輸出 warbler 形", section: "符號" });
  rows.push({ native: cp(0x115dd), roman: "rū", note: "ra+uu 須用 warbler 形（115A8+115DD）；輸入 rū 自動輸出 warbler 形", section: "符號" });
  return rows;
}

/* ---------------- 註冊到 TRANSLIT_REGISTRY ---------------- */
const siddhamCharTable = buildSiddhamCharTable();
// HK / ITRANS 檢字表不再共用 IAST 表（否則 roman 列是 IAST 拼寫，對該方案錯誤）。
// 悉曇字形不變，僅重映射 roman 列：HK 過 iastToHk。
const siddhamCharTableHk = siddhamCharTable.map((e) => ({ ...e, roman: iastToHk(e.roman) }));
// ITRANS：改從權威的 buildItransCharTable（正確的 ITRANS 裸 token）出發，把天城體字形轉成悉曇體；
// 悉曇體不表記 ॐ / ऽ / ळ 等字形（siddhamCharTable 亦不含），故過濾掉無悉曇對應的少數列。
const isSiddhamStr = (s: string): boolean =>
  [...s].every((c) => { const cp = c.codePointAt(0)!; return cp >= 0x11580 && cp <= 0x115ff; });
// 檢字表審計誠實化：native＝引擎實跑輸出（iastToSiddham∘itransToDevanagari）——
// 舊表叢集列（kSh/j~na/GY/dny）為無 virama 連寫展示、單輔音列缺詞尾 virama，
// 表列即虛構引擎能力（ḹ 教訓）；（合字）/空輸出列過濾。
const siddhamCharTableItrans = buildItransCharTable()
  .map((e) => ({ ...e, native: iastToSiddham(itransToDevanagari(e.roman)) }))
  .filter((e) => isSiddhamStr(e.native) && e.native !== "");
const asIndic = (o?: TransliterationOptions): IndicOptions => (o as IndicOptions) ?? {};

const siddhamIast: TransliterationScheme = {
  id: "siddham-iast",

  // f2-A：\uXXXX esc 標註 token 掃描層原子化（\ 是詞界 trigger，逐詞掃描切碎標註實錘）
  escAnnotationToken: true,
  label: {
    zh: "悉曇体 IAST",
    "zh-TW": "悉曇體 IAST",
    ko: "시드담 IAST",
    en: "Siddham (IAST)",
    ja: "悉曇 IAST",
    bo: "སིདྡྷཾ་(IAST)",
    sa: "सिद्धं",
  fr: "Siddham (IAST)", de: "Siddham (IAST)", },
  group: "siddham",
  primary: true,
  description:
    "悉曇體（Unicode U+11580–U+115FF）↔ IAST：復用天城體拼寫引擎，輸出悉曇碼位；梵咒真言可用 IAST 鍵入，可無損往返。OM（ॐ）以開篇符 U+115C1 替代（悉曇體無 ॐ 碼位，悉曇文本以 siddham 開篇符開篇）。",
  romanToNative: (i, o) => iastToSiddham(i, asIndic(o)),
  nativeToRoman: (i, o) => siddhamToIast(i, asIndic(o)),
  looksLikeNative: looksLikeSiddham,
  looksLikeRoman: looksLikeIast,
  convert: (i, o) => (looksLikeSiddham(i) ? siddhamToIast(i, asIndic(o)) : iastToSiddham(i, asIndic(o))),
  charTable: siddhamCharTable,
};

const siddhamHk: TransliterationScheme = {
  id: "siddham-hk",

  // f2-A：\uXXXX esc 標註 token 掃描層原子化（\ 是詞界 trigger，逐詞掃描切碎標註實錘）
  escAnnotationToken: true,
  label: {
    zh: "悉曇体 HK（ASCII 備選）",
    "zh-TW": "悉曇體 HK（ASCII 備選）",
    ko: "시드담 HK(ASCII)",
    en: "Siddham (Harvard-Kyoto)",
    ja: "悉曇 HK",
  fr: "Siddham (Harvard-Kyoto)", de: "Siddham (Harvard-Kyoto)", },
  group: "siddham",
  primary: false,
  hiddenFromPicker: true, // 只收選擇面不收引擎（功能保留）
  altOf: "siddham-iast",
  description: "Harvard-Kyoto：IAST 的純 ASCII 替代（一對一），鍵入悉曇體（T/Th/D/Dh/N 爲捲舌）。",
  romanToNative: (i, o) => iastToSiddham(hkToIast(i), asIndic(o)),
  nativeToRoman: (i, o) => iastToHk(siddhamToIast(i, asIndic(o))),
  looksLikeNative: looksLikeSiddham,
  looksLikeRoman: (t) => /[A-Z]/.test(t) && !looksLikeSiddham(t),
  convert: (i, o) =>
    looksLikeSiddham(i) ? iastToHk(siddhamToIast(i, asIndic(o))) : iastToSiddham(hkToIast(i), asIndic(o)),
  charTable: siddhamCharTableHk,
};

/** ITRANS 專屬「像羅馬字」偵測（與 HK 大寫方案區隔；不含悉曇碼位） */
function looksLikeItransForSiddham(text: string): boolean {
  return /RRi|RRI|LLi|LLI|kSh|j~na|dny|~N|~n|Ch|Th|Dh|Sh|\.h|\.N|\.a/.test(text) && !looksLikeSiddham(text);
}

const siddhamItrans: TransliterationScheme = {
  id: "siddham-itrans",

  // f2-A：\uXXXX esc 標註 token 掃描層原子化（\ 是詞界 trigger，逐詞掃描切碎標註實錘）
  escAnnotationToken: true,
  label: {
    zh: "悉曇体 ITRANS（鍵盤輸入）",
    "zh-TW": "悉曇體 ITRANS（鍵盤輸入）",
    en: "Siddham (ITRANS)",
    ja: "悉曇 ITRANS", ko: "시드담 ITRANS(입력용)",
  fr: "Siddham (ITRANS)", de: "Siddham (ITRANS)", },
  group: "siddham",
  primary: false,
  hiddenFromPicker: true, // 不再提供給用戶選擇（功能保留）
  altOf: "siddham-iast",
  description:
    "ITRANS 5.30：梵咒鍵盤輸入事實標準（ASCII）。OM maNi padme huM 風格鍵入悉曇真言；T/Th/D/Dh/N 爲捲舌、sh/Sh 爲 ś/ṣ、kSh（क्ष）、M/H/.N/.h/OM。",
  romanToNative: (i, o) => iastToSiddham(itransToDevanagari(i), asIndic(o)),
  nativeToRoman: (i, _o) => devanagariToItrans(siddhamToDevanagari(i)),
  looksLikeNative: looksLikeSiddham,
  looksLikeRoman: looksLikeItransForSiddham,
  convert: (i, o) =>
    looksLikeSiddham(i) ? devanagariToItrans(siddhamToDevanagari(i)) : iastToSiddham(itransToDevanagari(i), asIndic(o)),
  charTable: siddhamCharTableItrans,
  // 檢字表審計：ITRANS 鍵含 ASCII 詞界 trigger 字符（~ . 及複合鍵 kSh/j~na/GY/dny），
  // 面板長文掃描會拆散透傳——charTable 同源動態生成原子 token（^…$ 自我錨定）。
  romanTokenRe: new RegExp(
    "^(?:" +
      siddhamCharTableItrans
        .map((r) => r.roman)
        .filter((r) => /[^A-Za-z\u00C0-\u024F]/.test(r))
        .sort((a, b) => b.length - a.length)
        .map((r) => r.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
        .join("|") +
      ")$"
  ),
};

registerScheme(siddhamIast);
registerScheme(siddhamHk);
registerScheme(siddhamItrans);
