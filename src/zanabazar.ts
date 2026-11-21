// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry
/**
 * 方形札那巴扎爾文（Zanabazar Square，U+11A00–U+11A4F）↔ Wylie 擴展轉寫
 * （純函數，無 Obsidian 依賴）。
 *
 * 【歷史地位】札那巴扎爾（1635–1723，第一世哲布尊丹巴呼圖克圖）為書寫
 *  蒙古語佛經所創的方形文字，受天城體與蘭札體影響；亦用於藏語、梵語。
 *  Unicode 7.0（2014）編碼。與 Soyombo 同為其發明，塊結構同構（後者
 *  U+11A50 起）。
 *
 * 【三態疊字模型】（依據 Unicode 18 §14.6＋NamesList 逐碼位＋
 *  L2/18132r N4945R「ordinary letter SA + subjoiner」措辭）：
 *  - U+11A47 SUBJOINER `+`：疊字（conjunct）顯式連接符——mstu＝
 *    ⟨ma, subjoiner, sa, subjoiner, ta, ue⟩（Ch.14 定讞例）。
 *    **與藏文/marchen 的隱式模型相反**，疊字必須顯式聲明
 *    （stackModel: explicit-subjoiner，開關第一個真實消費者）。
 *  - U+11A34 VIRAMA `-`：死輔音（bare consonant）——rsa/msta 型；
 *    NamesList 明文「not used for conjunct formation」（2015 舊提案曾以
 *    virama 表疊字，UTC 評審後 N4945R 改正；**以 Ch.14/NamesList 為準**）。
 *  - U+11A33 FINAL CONSONANT MARK `'`：蒙古語音節尾輔音＋音節邊界。
 *  roman 語法 `+`/`-`/`'` 與藏文 Wylie 慣例同構（Wylie 中 `+` 亦是顯式
 *  疊字、`-` 亦表非疊前綴情形），零學習成本。
 *
 * 【tshek】**有**——U+11A41 MARK TSHEG（=藏文 0F0B），roman 端空格 ↔ tsheg
 *  （Wylie 慣例），與藏文方案一致；11A42/11A43 shad/nyis-shad ↔ `|`/`||`。
 *
 * 【其他】11A29 LETTER -A＝藏文 a-chung（Wylie `'a`，NamesList x 0F60）；
 *  11A0A VOWEL LENGTH MARK ↔ `ཱ`（Wylie 慣例 `A`? 不——藏文 ext 用 ི 系；
 *  此處取 `aa`）；cluster 變體 11A3A–11A3E ↔ 藏文 ra-mgo/ra-btags 等
 *  （`r+`/`+y`…；lilium 首版按正則碼位往返：cluster 變體輸出為其
 *  對應組合的變體標記 `<v-...>`，無損不美化——首版規範化留待語料校準）。
 *
 * 【碼位依據】Unicode 18.0.0 NamesList 11A00 節逐碼位核對（2026-11 動工時）。
 * 字體：Noto Sans Zanabazar Square（SIL OFL 1.1，隨插件內嵌）。
 */

import {
  registerScheme,
  type CharTableEntry,
  type TransliterationOptions,
  type TransliterationScheme,
} from "./translit-common";
import { escapeRomanCp } from "./translit-common";
import { parseEscCp } from "./indic";

const cp = (n: number): string => String.fromCodePoint(n);

/* ---------------- 字母表 ---------------- */

/** 元音符號（附標）：11A01–11A0A。
 *  Zanabazar 排序為 E(11A04)/OE(11A05)/O(11A06)，與 Soyombo 的 E/O/OE 不同（已核對正確）。 */
const VOWEL_CP: Record<string, number> = {
  "i": 0x11a01, "ue": 0x11a02, "u": 0x11a03, "e": 0x11a04,
  "oe": 0x11a05, "o": 0x11a06, "ai": 0x11a07, "au": 0x11a08,
  "ri": 0x11a09, // reversed i（梵語 ṛ）
  "aa": 0x11a0a, // vowel length mark
};

/**
 * 獨立元音組合（NamesList 11A00 實錘：「LETTER A used for representing
 * independent vowels in combination with vowel signs」）：11A00 為載體不發音。
 * 舊行為＝11A00 原樣透傳（往返無損但 roman 端含原生字符）；升級為顯式 token
 * `<a-*>`（與 <gm> 同構家族）——全羅馬化且入向統一。
 */
const INDEP_A_CP: Array<[string, number]> = [
  ["i", 0x11a01], ["ue", 0x11a02], ["u", 0x11a03], ["e", 0x11a04],
  ["oe", 0x11a05], ["o", 0x11a06], ["ai", 0x11a07], ["au", 0x11a08],
  ["ri", 0x11a09], ["aa", 0x11a0a],
];
const INDEP_A_TOKENS: Map<number, [string, string]> = new Map(
  INDEP_A_CP.map(([k, v]): [number, [string, string]] => [v, [`<a-${k}>`, cp(0x11a00) + cp(v)]]),
);

/** 基輔音：11A0B–11A32（梵語全表＋蒙古語補充） */
const BASE_CP: Record<string, number> = {
  "ka": 0x11a0b, "kha": 0x11a0c, "ga": 0x11a0d, "gha": 0x11a0e, "nga": 0x11a0f,
  "ca": 0x11a10, "cha": 0x11a11, "ja": 0x11a12, // JHA 未編碼（11A13 是 NYA；梵語 JHA 此文字無專碼位）
  "nya": 0x11a13,
  "tta": 0x11a14, "ttha": 0x11a15, "dda": 0x11a16, "ddha": 0x11a17, "nna": 0x11a18,
  "ta": 0x11a19, "tha": 0x11a1a, "da": 0x11a1b, "dha": 0x11a1c, "na": 0x11a1d,
  "pa": 0x11a1e, "pha": 0x11a1f, "ba": 0x11a20, "bha": 0x11a21, "ma": 0x11a22,
  "tsa": 0x11a23, "tsha": 0x11a24, "dza": 0x11a25, "dzha": 0x11a26,
  "zha": 0x11a27, "za": 0x11a28,
  "'a": 0x11a29, // a-chung（=藏文 0F60）
  "ya": 0x11a2a, "ra": 0x11a2b, "la": 0x11a2c, "va": 0x11a2d,
  "sha": 0x11a2e, "ssa": 0x11a2f, "sa": 0x11a30, "ha": 0x11a31,
  "ksa": 0x11a32,
};

/** 專門變體：cluster-initial/final（11A3A–11A3E）；往返用 `<ci>`/`<cf>` 標記 */
const CLUSTER_CP: Record<string, number> = {
  "<ci-r>": 0x11a3a, // cluster-initial RA（ra-mgo 位置）
  "<cf-y>": 0x11a3b, "<cf-r>": 0x11a3c, "<cf-l>": 0x11a3d, "<cf-v>": 0x11a3e,
};

/** 功能符：11A33 final consonant mark、11A34 virama、11A47 subjoiner */
const MARK_CP: Record<string, number> = {
  "'": 0x11a33,   // final consonant mark（蒙古語音節尾）
  "-": 0x11a34,   // virama（死輔音；非疊字）
  "+": 0x11a47,   // SUBJOINER（疊字顯式連接符）
};

/** 各種符號：11A35–11A39 */
const SIGN_CP: Record<string, number> = {
  "ṃ": 0x11a35, // candrabindu（sna ldan）
  "<cb-o>": 0x11a36, "<ca-o>": 0x11a37, // ornament 變體
  "<an>": 0x11a38, // r71：anusvara 專鍵——11A35/11A38 藏文慣例均 ṃ，併碼往返有損（wiki 語料 11A38 三筆實錘歸一 11A35）；出向改顯式 token 後雙向無損；roman "ṃ" 入向仍歸 candrabindu（正字法主流），11A38 經 <an> 輸入
  "ḥ": 0x11a39, // visarga
};

/** 標點：head marks＋tshek/shad */
const PUNCT_CP: Record<string, number> = {
  "<": 0x11a3f, ">": 0x11a40,       // initial/closing head mark（0FD3/0FD4 對應）
  "<||>": 0x11a45, "<//>": 0x11a46, // double-lined 變體
  "<ts>": 0x11a41, // tshek（r-e：出向顯式 token <ts>——舊「空格↔tshek」與 Aksharamukha
                   // 語料慣例（0x20 分詞）互撞，native(0x20)→" "→11A41 往返有損實錘；
                   // <ts> 與 <lts> 對稱，雙向無損。Wylie 藏文空格慣例不適用此語料域）
  "|": 0x11a42, "||": 0x11a43, // shad / double shad
  "<lts>": 0x11a44, // long tsheg（gter tsheg）
};

/** 全部 native→roman 反向索引（一次建成；最長鍵優先） */
function buildNativeRev(): Map<number, string> {
  const m = new Map<number, string>();
  const push = (rec: Record<string, number>) => {
    for (const [k, v] of Object.entries(rec)) m.set(v, k);
  };
  push(VOWEL_CP); push(BASE_CP); push(CLUSTER_CP); push(MARK_CP); push(SIGN_CP); push(PUNCT_CP);
  return m;
}
const NATIVE_REV = buildNativeRev();

// 11A38 anusvara 出向改顯式 token <an>（SIGN_CP 已入 NATIVE_REV）；舊「出向併 ṃ」裁定移除——往返有損實錘（wiki 語料 11A38 三筆歸一 11A35）

/* ---------------- roman → native ---------------- */

/**
 * Wylie 擴展羅馬字 → Zanabazar Square Unicode。
 * 語法（Wylie 同構）：`+`＝11A47 SUBJOINER 疊字、`-`＝11A34 VIRAMA 死輔音、
 * `'`＝11A33 音節尾；`'a`＝a-chung（最長匹配優先於 `'`）；空格＝tshek；
 * `|`/`||`＝shad；`<...>` 標記（head marks/cluster 變體）；未知透傳。
 */
export function zanabazarRomanToNative(input: string, _opts?: TransliterationOptions): string {
  const TOKENS: Array<[string, string]> = [];
  for (const [k, v] of Object.entries(BASE_CP)) TOKENS.push([k, cp(v)]);
  for (const [k, v] of Object.entries(VOWEL_CP)) TOKENS.push([k, cp(v)]);
  for (const [k, v] of Object.entries(CLUSTER_CP)) TOKENS.push([k, cp(v)]);
  for (const [k, v] of Object.entries(SIGN_CP)) TOKENS.push([k, cp(v)]);
  TOKENS.push(["<||>", cp(0x11a45)], ["<//>", cp(0x11a46)], ["<lts>", cp(0x11a44)],
    ["<ts>", cp(0x11a41)], // r-e：tshek 顯式 token（出向對稱；空格已改透傳）
    ["||", cp(0x11a43)], ["<", cp(0x11a3f)], [">", cp(0x11a40)], ["|", cp(0x11a42)]);
  for (const [tok, nat] of INDEP_A_TOKENS.values()) TOKENS.push([tok, nat]);
  TOKENS.sort((a, b) => b[0].length - a[0].length);
  const lookup = new Map(TOKENS);

  let out = "";
  let i = 0;
  while (i < input.length) {
    const ch = input[i];
    // 空格透傳（r-e：語料 0x20 分詞慣例；tshek 用 <ts> 顯式輸入）
    if (ch === "\n" || ch === "\t" || ch === "\r") { out += ch; i++; continue; }
    // 單鍵 "a" → 11A00 LETTER A（載體模型單形；出向孤立 11A00→"a" 對稱）
    // \uXXXX 標註還原（未收錄碼位的顯式標註，往返無損；4–6 位十六進位）
    // esc 解析改共用 parseEscCp（{4,6} 貪婪吞後續 a-f 拉丁字母——真機實錘）
    const escZ = parseEscCp(input.slice(i));
    if (escZ !== null) { out += String.fromCodePoint(escZ.cp); i += escZ.width; continue; }
    if (input.startsWith("a", i) && !(/[aiueo]/.test(input[i + 1] ?? ""))) { out += cp(0x11a00); i += 1; continue; }
    if (ch === "'" && input[i + 1] === "a") { out += cp(0x11a29); i += 2; continue; } // 'a a-chung
    if (ch === "'" || ch === "-" || ch === "+") {
      // r-b：SUBJOINER 只前綴「輔音」——Ch.14 定讞例 ⟨ma, SUBJ, sa, SUBJ, ta, ue⟩ 中
      // ue 前無 SUBJ（11A02 本身即下加形態，直附基輔音）。字體 GSUB 也只收錄
      // SUBJ+輔音 ligature；SUBJ+元音會被判 broken cluster（dotted circle＋元音平鋪，
      // 尾部 SUBJ 殘留顯示「+」原形——真機渲染實錘）。故 "+<元音>" 吞 '+' 直出元音。
      if (ch === "+") {
        const rest = input.slice(i + 1);
        // r-h：SUBJOINER 吞除擴及修飾符＋獨立元音組合——Pandey 提案 §4.10.2 定讞
        // 「conjunct 中元音與其他附標只附最後字母」：SUBJ 後接元音/修飾符（anusvara
        // 11A38、candrabindu 11A35-37、visarga 11A39）或 <a-*> 組合均為畸形序列
        // （subjoiner 後非輔音，字體判 broken cluster）。吞 '+' 直出後續 token。
        const MOD_KEYS = ["ṃ", "<cb-o>", "<ca-o>", "<an>", "ḥ"];
        let swallow: string | undefined;
        const vTok = Object.keys(VOWEL_CP)
          .filter((k) => rest.startsWith(k))
          .sort((a, b) => b.length - a.length)[0];
        if (vTok) swallow = vTok;
        else {
          const mTok = MOD_KEYS.filter((k) => rest.startsWith(k))
            .sort((a, b) => b.length - a.length)[0];
          if (mTok) swallow = mTok;
          else {
            for (const [tok] of INDEP_A_TOKENS.values()) {
              if (rest.startsWith(tok)) { swallow = tok; break; }
            }
          }
        }
        if (swallow) { out += rest.startsWith(swallow) && vTok ? cp(VOWEL_CP[swallow]) : ""; if (vTok) { i += 1 + swallow.length; continue; } }
        if (swallow && !vTok) {
          // 修飾符/<a-*>：交回主 lookup 逐 token 消化（其 native 已在 TOKENS 表）
          i += 1; continue;
        }
      }
      out += cp(MARK_CP[ch]); i++; continue;
    }
    let matched = false;
    for (let L = Math.min(8, input.length - i); L >= 1; L--) {
      const t = lookup.get(input.slice(i, i + L));
      if (t !== undefined) { out += t; i += L; matched = true; break; }
    }
    if (!matched) { out += ch; i++; }
  }
  return out;
}

/* ---------------- native → roman ---------------- */

/**
 * Zanabazar Square Unicode → Wylie 擴展羅馬字。
 * 逐碼位映射；tshek → 空格；shad → |；subjoiner → +；virama → -；
 * final consonant mark → '；區塊外透傳。
 */
export function zanabazarNativeToRoman(input: string, _opts?: TransliterationOptions): string {
  const chars = Array.from(input);
  const cps = chars.map((ch) => ch.codePointAt(0) ?? 0);
  let out = "";
  for (let i = 0; i < chars.length; i++) {
    const c = cps[i];
    // 獨立元音組合：11A00 + VOWEL SIGN/length mark（11A01–11A0A）→ <a-*> 顯式 token
    if (c === 0x11a00 && i + 1 < cps.length && cps[i + 1] >= 0x11a01 && cps[i + 1] <= 0x11a0a) {
      const ent = INDEP_A_TOKENS.get(cps[i + 1]);
      if (ent) { out += ent[0]; i++; continue; }
    }
    // 孤立 11A00（LETTER A，無後隨元音符號）→ "a"（載體模型單形；入向 a↔11A00 對稱）
    if (c === 0x11a00) { out += "a"; continue; }
    const t = NATIVE_REV.get(c);
    const tok = t ?? escapeRomanCp(c); // B2/r156：⟨U+XXXX⟩ 註記體例（入向 parseEscCp 原樣還原）
    // r-i：出向往返語法還原（Pandey §4.10.2 對稱）——
    // ① subjoiner 後接元音/修飾符 → 吞 '+'（入向「吞 +」鏡像；疊字尾部附標直屬疊字）
    // ② 元音/修飾符前補 '+' 分界：a. 前一碼位＝SUBJ（⟨…,SUBJ,da,i⟩→na+da+i 規範形式，
    //    SUBJ 已吞、'+' 移掛元音前）；b. ci-r（11A3A）後疊字尾元音同形（§4.17.3 rki）；
    //    c. 前一碼位＝元音/修飾符（連續附標：i+ai、ue+ṃ——防入向最長匹配黏連）
    const prev = i > 0 ? cps[i - 1] : 0;
    const next = i + 1 < cps.length ? cps[i + 1] : 0;
    const curVMod = isZbVowelOrModCp(c);
    if (c === 0x11a47 && isZbVowelOrModCp(next)) continue;
    if (curVMod) {
      const before = i >= 2 ? cps[i - 2] : 0;
      if (prev === 0x11a47 || isZbVowelOrModCp(prev)
        || (isZbConsonantCp(prev) && (before === 0x11a47 || before === 0x11a3a))) out += "+";
    }
    out += tok;
  }
  return out;
}

/** 元音附標＋修飾符（出向分界判定用）：11A01–11A0A、11A35–11A39 */
function isZbVowelOrModCp(c: number): boolean {
  return (c >= 0x11a01 && c <= 0x11a0a) || (c >= 0x11a35 && c <= 0x11a39);
}

/** 基輔音判定（出向分界回溯用）：11A0B–11A32＋cluster 變體 11A3A–11A3E */
function isZbConsonantCp(c: number): boolean {
  return (c >= 0x11a0b && c <= 0x11a32) || (c >= 0x11a3a && c <= 0x11a3e);
}

/* ---------------- 自動方向判定 ---------------- */

/** 是否像 Zanabazar 原生文字（11A00 區塊任一碼位） */
export function looksLikeZanabazar(text: string): boolean {
  for (const ch of text) {
    const c = ch.codePointAt(0) ?? 0;
    if (c >= 0x11a00 && c <= 0x11a4f) return true;
  }
  return false;
}

const ZB_ROMAN_RE = /(gha|jha|ddha|ttha|tsha|dzha|kha|nga|nya|nna|dha|bha|ssa|'a|ksa|[a-z'])(\+|-)/;

/** 是否像 Zanabazar/Wylie 擴展羅馬字（`+`/`-` 疊字語法為強證據） */
export function looksLikeZanabazarRoman(text: string): boolean {
  if (!/[a-z'+<>|-]/i.test(text)) return false;
  return ZB_ROMAN_RE.test(text.toLowerCase());
}

/* ---------------- 轉寫總入口 ---------------- */

export function convertZanabazar(text: string, opts?: TransliterationOptions): string {
  return looksLikeZanabazar(text) ? zanabazarNativeToRoman(text, opts) : zanabazarRomanToNative(text, opts);
}

/* ---------------- 檢字表 ---------------- */

function buildZanabazarCharTable(): CharTableEntry[] {
  const rows: CharTableEntry[] = [];
  const sections: Array<[string, Record<string, number>]> = [
    ["元音符號", VOWEL_CP],
    ["輔音", BASE_CP],
    ["專門變體", CLUSTER_CP],
    ["功能符", MARK_CP],
    ["各種符號", SIGN_CP],
    ["標點", PUNCT_CP],
  ];
  const notes: Record<string, string> = {
    "元音符號": "11A01–11A09 附標元音（ri＝reversed i，梵語 ṛ）；11A0A 長音符 aa；複元音組合（Pandey §4.4.1）：āi=a+aa+ai、ii=a+i+ai、ui=a+u+ai、oi=a+o+ai、au=a+au 等——出向以 + 分界（往返無損）",
    "輔音": "11A0B–11A32 梵語全表＋蒙古語補充（tsa/dza 系）；'a＝a-chung（=藏文 0F60）；vocalic r̥/l̥（Pandey §4.4.2）＝ra/la+ri 組合（r̥̄ 加 aa）——reversed i 區分 kr̥ 與 kri",
    "專門變體": "11A3A cluster-initial RA、11A3B–11A3E cluster-final y/r/l/v（藏文 conjunct 變體位置）；往返標記化",
    "功能符": "三態疊字模型：+（11A47 SUBJOINER 疊字顯式連接符）、-（11A34 VIRAMA 死輔音，非疊字）、'（11A33 音節尾輔音）——與藏文隱式模型的根本差異（N4945R）",
    "各種符號": "11A35 candrabindu ṃ、11A38 anusvara <an>（專鍵，雙向無損；roman ṃ 入向歸 candrabindu）、11A39 visarga ḥ",
    "標點": "11A3F/11A40 head marks、11A41 tshek（=藏文 0F0B；roman 端空格）、11A42/11A43 shad、11A44 long tsheg",
  };
  for (const [sec, map] of sections) {
    let first = true;
    for (const [k, v] of Object.entries(map)) {
      // 檢字表審計：空格鍵（tshek）顯示 ␣ 並附說明（引擎行為正確：面板空格即轉 tshek）
      const shown = k === " " ? "\u2423" : k;
      const spaceNote = k === " " ? "面板輸入空格即轉 tshek（空格＝分詞符）" : undefined;
      rows.push({ native: k === " " ? "—" : cp(v), roman: shown, note: [first ? notes[sec] : undefined, spaceNote].filter(Boolean).join("；") || undefined, section: sec });
      first = false;
    }
  }
  // 檢字表覆蓋審計：11A00 LETTER A 載體單形（引擎 "a" 鍵對稱輸出）補實列
  rows.push({ native: cp(0x11a00), roman: "a", note: "LETTER A 載體單形：不發音，獨立元音須接元音符號（組合鍵 <a-*>）；roman a 單鍵即輸出此碼位", section: "輔音" });
  // 獨立元音組合 <a-*> 說明列（NamesList 11A00 載體模型；引擎實鍵如實列示）
  rows.push({
    native: "\u2014",
    roman: "<a-i|ue|u|e|oe|o|ai|au|ri|aa>",
    note: "獨立元音組合：11A00 LETTER A（載體，不發音）+ VOWEL SIGN → 顯式 token <a-*>（NamesList：used for representing independent vowels in combination with vowel signs）",
    section: "獨立元音組合",
  });
  // + 補列刪除（功能符區 MARK_CP 已列，補列＝重複）；疊字示例併入功能符 note。
  notes["功能符"] = notes["功能符"] + "；疊字示例 ma+sa+ta+ue（Ch.14 §14.6 定讞）";
  rows.push({
    native: "\u2014",
    roman: "'（音節尾）/ -（virama）",
    note: "蒙古語音節尾輔音＝'（11A33 final mark，如 na'i）＋字母；死輔音＝-（11A34 virama，如 ra-n）。裸 CVC 尾輔音（如 ran）非合法鍵——須寫 ra-n 或 na'n 形，否則透傳",
    section: "拼寫規則",
  });
  return rows;
}

/* ---------------- 註冊到 TRANSLIT_REGISTRY ---------------- */

const zanabazar: TransliterationScheme = {
  id: "zanabazar",
  label: {
    zh: "方形札那巴扎尔文（Wylie 扩展 ↔ Unicode）",
    "zh-TW": "方形札那巴扎爾文（Wylie 擴展 ↔ Unicode）",
    en: "Zanabazar Square (Wylie ext. ↔ Unicode)",
    bo: "ཛ་ན་བཛྲ་ཡིག(Wylie རྒྱས་པ།↔Unicode)",
    ug: "Zanabazar (Wylie ext.↔Unicode)",
    mn: "Занабазар (Wylie ext.↔Unicode)",
    ja: "ザナバザル方形文字（Wylie 拡張 ↔ Unicode）",
    ko: "자나바자르 방형 문자(Wylie 확장 ↔ Unicode)",
    sa: "जनबज्र(Wylie ext.↔Unicode)",
    hi: "ज़नबाज़र (Wylie ext.↔Unicode)",
  fr: "Carré de Zanabazar (Wylie ext. ↔ Unicode)", de: "Zanabazar-Quadratschrift (Wylie erw. ↔ Unicode)", },
  group: "zanabazar",
  primary: true,
  description:
    "方形札那巴扎爾文（U+11A00–U+11A4F）↔ Wylie 擴展轉寫；三態疊字模型（+ subjoiner／- virama／' 音節尾）——顯式疊字，異於藏文隱式模型",
  romanToNative: (input: string, _opts?: TransliterationOptions) => zanabazarRomanToNative(input),
  nativeToRoman: (input: string, _opts?: TransliterationOptions) => zanabazarNativeToRoman(input),
  looksLikeNative: looksLikeZanabazar,
  looksLikeRoman: looksLikeZanabazarRoman,
  convert: (input: string, _opts?: TransliterationOptions) => convertZanabazar(input),
  charTable: buildZanabazarCharTable(),
  // 檢字表審計：面板長文掃描層原子 token（〈ci-/cf-/cb-/ca-/-X/+/'〉等鍵含詞界
  // trigger 字符 < + - '，不聲明 tokenRe 會被切詞拆散原樣透傳）。鍵集與
  // charTable 同源動態生成（最長優先、^…$ 自我錨定）。
  romanTokenRe: new RegExp(
    "^(?:" +
      [
        // r-b：SUBJOINER 只前綴輔音——「+<元音>」複合 token（+ue/+i/+u/…）整體送
        // 轉換器，使 parser 的「吞 + 直出元音」修復在掃描層生效；否則 '+' 單鍵
        // 原子命中會把 SUBJ 透傳成字面「+」再接元音（真機渲染實錘 broken cluster）。
        ...Object.keys(VOWEL_CP).map((v) => "+" + v),
        // r-h 對稱：「+修飾符」「+<a-*>」複合 token（parser 吞 '+' 修復的掃描層版）——
        // 否則 '+' 單鍵原子命中把 SUBJ 透傳成字面「+」再接修飾符（zana 語料 gate 實錘）
        ...["ṃ", "<cb-o>", "<ca-o>", "<an>", "ḥ"].map((m) => "+" + m),
        ...[...INDEP_A_TOKENS.values()].map(([tok]) => "+" + tok),
        // r-c：獨立元音組合 <a-*>（INDEP_A_TOKENS：oṃ=<a-o>ṃ 實錘）——不收進來
        // 則 "<a-o>" 被詞界切碎成 "<"+"a"+"o"，逐鍵轉出 head mark+virama 亂序（
        // 語料往返實錘 broken）。
        ...[...INDEP_A_TOKENS.values()].map(([tok]) => tok),
        ...buildZanabazarCharTable().map((r) => r.roman)
          .filter((r) => /^[+\-'<>]/.test(r)),
      ]
        .sort((a, b) => b.length - a.length)
        .map((r) => r.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
        .join("|") +
      ")$"
  ),
  // 顯式疊字——11A47 SUBJOINER 必須顯式出現（stackModel 開關首個真實消費者）
  stackModel: { mode: "explicit-subjoiner", subjoinerCp: 0x11a47, contextualCluster: true },
};

registerScheme(zanabazar);
