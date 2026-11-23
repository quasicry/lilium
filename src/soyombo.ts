// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry
/**
 * 索永布文（Soyombo，U+11A50–U+11AAF）↔ Wylie 擴展轉寫
 * （純函數，無 Obsidian 依賴）。
 *
 * 【歷史地位】索永布字母為札那巴扎爾（Zanabazar，1635–1723）所創，
 *  與方形札那巴扎爾文（Zanabazar Square）同構；主要書寫蒙古語、藏語、梵語
 *  佛經。蒙古國旗與國徽上的「索永布符號」即 U+11A9E（head mark之一）。
 *  Unicode 10.0（2017）編碼。
 *
 * 【四態模型】（核心；依據 Unicode 18 §14.7＋NamesList 11A50 節逐碼位）：
 *  - U+11A99 SUBJOINER `+`：疊字顯式連接符——conjunct 每對輔音之間都要 +
 *    （stackModel: explicit-subjoiner，與 Zanabazar 同構、第二個真實消費者）。
 *    本塊**無 virama**：不設 `-` 死輔音態。
 *  - U+11A98 GEMINATION MARK `<gm>`：疊音記號——backing store 中緊隨基字母、
 *    先於其他組合符（§14.7 定讞；roman 端 `<gm>` 裁定鍵，棄 `*`）。
 *  - FINAL CONSONANT SIGNS 11A8A–11A95：蒙古語音節尾輔音＝LETTER A +
 *    final sign（am/ag/ang 型），**Wylie 同構鍵**：
 *    -g 11A8A、-k 11A8B、-ng 11A8C、-d 11A8D、-n 11A8E、-b 11A8F、
 *    -m 11A90、-r 11A91、-l 11A92、-sh 11A93、-s 11A94、-'a 11A95（aang）。
 *
 * 【與 Zanabazar 的差異】三處：
 *  ① 輔音表多 JHA（11A64，Zanabazar 無）且 KSSA 有獨立碼位（11A83，
 *     Zanabazar 亦有 11A32 但此處 roman 鍵同 ksa、與 k+ssa 叢集歧義走歧義面板）；
 *  ② `-` 鍵不再是 virama 而是專用於 final consonant signs 前綴；
 *  ③ anusvara（11A96）/visarga（11A97）各一碼位，無 Zanabazar 11A35/11A38
 *     併碼歧義。
 *
 * 【tshek】空格 ↔ U+11A9A tsheg（=藏文 0F0B）；`|`/`||` ↔ 11A9B/11A9C shad；
 *  pluta 11A9D ↔ `<pluta>`；head marks 11A9E–11AA0 ↔ `<head1|2|3>`；
 *  terminal marks 11AA1/11AA2 ↔ `<term1|2>`。
 *
 * 【cluster 變體】11A86–11A89（cluster-initial R/L/Sh/S 專形）↔
 *  `<ci-r>/<ci-l>/<ci-sh>/<ci-s>`（Zanabazar 先例：碼位往返、渲染交 HarfBuzz）。
 *
 * 【碼位依據】Unicode 18.0.0 NamesList 11A50 節逐碼位核對（2026-11 動工時）。
 * 字體：Noto Sans Soyombo（SIL OFL 1.1，隨插件內嵌）。
 */

import {
  registerScheme,
  type CharTableEntry,
  type TransliterationOptions,
  type TransliterationScheme,
} from "./translit-common";
import { parseEscCp } from "./indic";

const cp = (n: number): string => String.fromCodePoint(n);

/* ---------------- 字母表 ---------------- */

/** 元音符號（附標）：11A51–11A5A ＋ 長音符 11A5B */
const VOWEL_CP: Record<string, number> = {
  "i": 0x11a51, "ue": 0x11a52, "u": 0x11a53, "e": 0x11a54,
  "o": 0x11a55, "oe": 0x11a56, "ai": 0x11a57, "au": 0x11a58,
  // 注意：Soyombo 元音排序為 E(11A54)/O(11A55)/OE(11A56)，與 Zanabazar 的 E/OE/O 不同
  "ri": 0x11a59, // vocalic r（梵語 ṛ）
  "li": 0x11a5a, // vocalic l（梵語 ḷ）
  "aa": 0x11a5b, // vowel length mark
};

/** 基輔音：11A5C–11A83（梵語全表＋蒙古語補充；含 Zanabazar 沒有的 JHA） */
const BASE_CP: Record<string, number> = {
  "a": 0x11a50, // LETTER A（獨立元音載體；roman 端 a 直鍵，供 a-m 型蒙古語音節尾拼式）
  "ka": 0x11a5c, "kha": 0x11a5d, "ga": 0x11a5e, "gha": 0x11a5f, "nga": 0x11a60,
  "ca": 0x11a61, "cha": 0x11a62, "ja": 0x11a63, "jha": 0x11a64, // Zanabazar 無 JHA
  "nya": 0x11a65,
  "tta": 0x11a66, "ttha": 0x11a67, "dda": 0x11a68, "ddha": 0x11a69, "nna": 0x11a6a,
  "ta": 0x11a6b, "tha": 0x11a6c, "da": 0x11a6d, "dha": 0x11a6e, "na": 0x11a6f,
  "pa": 0x11a70, "pha": 0x11a71, "ba": 0x11a72, "bha": 0x11a73, "ma": 0x11a74,
  "tsa": 0x11a75, "tsha": 0x11a76, "dza": 0x11a77,
  // 0x11A78 是 LETTER ZHA；Soyombo 無 DZHA（原 dzha:0x11A78 為虛構映射，與 zha 同鍵衝突，已刪）
  "zha": 0x11a78, "za": 0x11a79,
  "'a": 0x11a7a, // LETTER -A（a-chung；NamesList 11A7A 實錘）
  "ya": 0x11a7b, "ra": 0x11a7c, "la": 0x11a7d, "va": 0x11a7e,
  "sha": 0x11a7f, "ssa": 0x11a80, "sa": 0x11a81, "ha": 0x11a82,
  "ksa": 0x11a83, // KSSA 原子碼位
};

/** cluster-initial 專形（11A86–11A89）：碼位往返，渲染交字體 rclt */
const CLUSTER_CP: Record<string, number> = {
  "<ci-r>": 0x11a86, "<ci-l>": 0x11a87, "<ci-sh>": 0x11a88, "<ci-s>": 0x11a89,
};

/** final consonant signs（11A8A–11A95）：Wylie 同構鍵（定案） */
const FINAL_CP: Record<string, number> = {
  "-g": 0x11a8a, "-k": 0x11a8b, "-ng": 0x11a8c, "-d": 0x11a8d,
  "-n": 0x11a8e, "-b": 0x11a8f, "-m": 0x11a90, "-r": 0x11a91,
  "-l": 0x11a92, "-sh": 0x11a93, "-s": 0x11a94, "-'a": 0x11a95, // aang / a-chung 尾
};

/** 功能符與組合符：subjoiner／gemination／anusvara／visarga */
const MARK_CP: Record<string, number> = {
  "+": 0x11a99,    // SUBJOINER（疊字顯式連接符；本塊無 virama）
  "<gm>": 0x11a98, // GEMINATION MARK（緊隨基字母、先於其他組合符）
  "ṃ": 0x11a96,    // anusvara（無併碼歧義）
  "ḥ": 0x11a97,    // visarga
};

/** 吠陀專用符：11A84? 非——JIHVAMULIYA/UPADHMANIYA */
const VEDIC_CP: Record<string, number> = {
  "<jh>": 0x11a84, // JIHVAMULIYA（=吠陀 1CF5）
  "<up>": 0x11a85, // UPADHMANIYA（=吠陀 1CF6）
};

/**
 * 獨立元音組合（NamesList 11A50 實錘：「LETTER A used for representing
 * independent vowels in combination with vowel signs」）：11A50 為載體不發音，
 * 11A50+VOWEL SIGN ＝獨立元音。roman 端顯式 token `<a-*>`（與 <gm>/<ci-r> 同構
 * 家族）——直拼「a+i」會撞 diphthong 鍵 ai（往返實錘 𑩐𑩑→ai→𑩗）。
 */
const INDEP_A_CP: Array<[string, number]> = [
  ["i", 0x11a51], ["ue", 0x11a52], ["u", 0x11a53], ["e", 0x11a54],
  ["o", 0x11a55], ["oe", 0x11a56], ["ai", 0x11a57], ["au", 0x11a58],
  ["ri", 0x11a59], ["li", 0x11a5a], ["aa", 0x11a5b],
];
const INDEP_A_TOKENS: Map<number, [string, string]> = new Map(
  INDEP_A_CP.map(([k, v]): [number, [string, string]] => [v, [`<a-${k}>`, cp(0x11a50) + cp(v)]]),
);

/** 標點：pluta＋head marks＋terminal marks＋tshek/shad */
const PUNCT_CP: Record<string, number> = {
  "<ts>": 0x11a9a,     // tshek 顯式 token（r-e 比照 Zanabazar 先例：舊「空格↔tshek」
                       // 與語料 0x20 分詞慣例互撞、且 Unicode 提案 N4142 定義 tshek
                       // 僅標記藏文借詞音節尾，非通用分詞符——空格改透傳）
  "|": 0x11a9b, "||": 0x11a9c, // shad / double shad
  "<pluta>": 0x11a9d,  // 長音記號（pluta）
  "<head1>": 0x11a9e, "<head2>": 0x11a9f, "<head3>": 0x11aa0,
  "<term1>": 0x11aa1, "<term2>": 0x11aa2,
};

/** 全部 native→roman 反向索引（一次建成） */
function buildNativeRev(): Map<number, string> {
  const m = new Map<number, string>();
  const push = (rec: Record<string, number>) => {
    for (const [k, v] of Object.entries(rec)) m.set(v, k);
  };
  push(VOWEL_CP); push(BASE_CP); push(CLUSTER_CP); push(FINAL_CP);
  push(MARK_CP); push(VEDIC_CP); push(PUNCT_CP);
  return m;
}
const NATIVE_REV = buildNativeRev();

/* ---------------- roman → native ---------------- */

/**
 * Wylie 擴展羅馬字 → Soyombo Unicode。
 * 語法：`+`＝11A99 SUBJOINER、`<gm>`＝11A98 gemination（緊隨基字母）、
 * final consonant signs＝Wylie 同構 `-g/-k/-ng/…/-'a`；`'a`＝a-chung
 * （最長匹配優先）；空格＝tshek；`|`/`||`＝shad；`<...>` 標記；未知透傳。
 */
export function soyomboRomanToNative(input: string, _opts?: TransliterationOptions): string {
  const TOKENS: Array<[string, string]> = [];
  for (const [k, v] of Object.entries(BASE_CP)) TOKENS.push([k, cp(v)]);
  for (const [k, v] of Object.entries(VOWEL_CP)) TOKENS.push([k, cp(v)]);
  for (const [k, v] of Object.entries(CLUSTER_CP)) TOKENS.push([k, cp(v)]);
  for (const [k, v] of Object.entries(FINAL_CP)) TOKENS.push([k, cp(v)]);
  for (const [k, v] of Object.entries(MARK_CP)) TOKENS.push([k, cp(v)]);
  for (const [k, v] of Object.entries(VEDIC_CP)) TOKENS.push([k, cp(v)]);
  for (const [k, v] of Object.entries(PUNCT_CP)) TOKENS.push([k, cp(v)]);
  for (const [tok, nat] of INDEP_A_TOKENS.values()) TOKENS.push([tok, nat]);
  // 最長鍵優先：<pluta>/<head1>/<term1>/<gm>/<ci-sh>/jha/gha/-ng/-'a/ue/ai… 先於單字母
  TOKENS.sort((a, b) => b[0].length - a[0].length);
  const lookup = new Map(TOKENS);

  let out = "";
  let i = 0;
  while (i < input.length) {
    const ch = input[i];
    if (ch === " ") { out += ch; i++; continue; } // 空格透傳（r-e：tshek 用 <ts> 顯式輸入）
    if (ch === "\n" || ch === "\t" || ch === "\r") { out += ch; i++; continue; }
    if (ch === "+") { out += cp(0x11a99); i++; continue; }
    // B2/r156：\uXXXX／⟨U+XXXX⟩ 標註還原（未收錄碼位的顯式標註，往返無損）——
    // 先於 token 最長匹配，防 hex 內字母被逐鍵拆散。
    const escSo = parseEscCp(input.slice(i));
    if (escSo !== null) { out += String.fromCodePoint(escSo.cp); i += escSo.width; continue; }
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
 * Soyombo Unicode → Wylie 擴展羅馬字。
 * 逐碼位映射；tshek → <ts>（顯式 token）；空格透傳；shad → |；subjoiner → +；gemination → <gm>；
 * final consonant signs → Wylie 同構鍵；區塊外透傳。
 */
export function soyomboNativeToRoman(input: string, _opts?: TransliterationOptions): string {
  const chars = Array.from(input);
  const cps = chars.map((ch) => ch.codePointAt(0) ?? 0);
  let out = "";
  for (let i = 0; i < chars.length; i++) {
    const c = cps[i];
    // 獨立元音組合：11A50 + VOWEL SIGN/length mark（11A51–11A5B）→ <a-*> 顯式 token
    if (c === 0x11a50 && i + 1 < cps.length && cps[i + 1] >= 0x11a51 && cps[i + 1] <= 0x11a5b) {
      const ent = INDEP_A_TOKENS.get(cps[i + 1]);
      if (ent) { out += ent[0]; i++; continue; }
    }
    const t = NATIVE_REV.get(c);
    out += t ?? chars[i];
  }
  return out;
}

/* ---------------- 自動方向判定 ---------------- */

/** 是否像 Soyombo 原生文字（11A50 區塊任一碼位） */
export function looksLikeSoyombo(text: string): boolean {
  for (const ch of text) {
    const c = ch.codePointAt(0) ?? 0;
    if (c >= 0x11a50 && c <= 0x11aaf) return true;
  }
  return false;
}

/** Soyombo 特有鍵（與 Zanabazar roman 判定共存時的區分特徵） */
const SY_ROMAN_RE = /(\bjha\b|<gm>|-[gkdnbmrls]\b|-ng\b|-sh\b|-'a\b|\+)/;

/** 是否像 Soyombo/Wylie 擴展羅馬字（`<gm>`/final signs/`+` 為強證據） */
export function looksLikeSoyomboRoman(text: string): boolean {
  if (!/[a-z'+<>|-]/i.test(text)) return false;
  return SY_ROMAN_RE.test(text.toLowerCase());
}

/* ---------------- 轉寫總入口 ---------------- */

export function convertSoyombo(text: string, opts?: TransliterationOptions): string {
  return looksLikeSoyombo(text) ? soyomboNativeToRoman(text, opts) : soyomboRomanToNative(text, opts);
}

/* ---------------- 檢字表 ---------------- */

function buildSoyomboCharTable(): CharTableEntry[] {
  const rows: CharTableEntry[] = [];
  const sections: Array<[string, Record<string, number>]> = [
    ["元音符號", VOWEL_CP],
    ["輔音", BASE_CP],
    ["專門變體", CLUSTER_CP],
    ["音節尾輔音", FINAL_CP],
    ["功能符", MARK_CP],
    ["吠陀符", VEDIC_CP],
    ["標點", PUNCT_CP],
  ];
  const notes: Record<string, string> = {
    "元音符號": "11A51–11A5A 附標元音（ri/li＝vocalic r/l，梵語 ṛ/ḷ）；11A5B 長音符 aa",
    "輔音": "11A5C–11A84 梵語全表＋蒙古語補充；jha（11A64）為 Zanabazar 沒有的碼位；ksa＝11A83 KSSA 原子；'a＝a-chung（11A7B）",
    "專門變體": "11A86–11A89 cluster-initial R/L/Sh/S 專形；碼位往返、疊字/前字形交字體 rclt",
    "音節尾輔音": "11A8A–11A95 final consonant signs（Wylie 同構鍵）：蒙古語音節尾＝LETTER A + final sign（am/ag/ang 型）；-'a（11A95）＝aang",
    "功能符": "+（11A99 SUBJOINER，疊字顯式）、<gm>（11A98 GEMINATION，緊隨基字母先於其他組合符）、ṃ（11A96）、ḥ（11A97）；本塊無 virama",
    "吠陀符": "11A84 JIHVAMULIYA、11A85 UPADHMANIYA（=吠陀 1CF5/1CF6）",
    "標點": "11A9A tsheg（=藏文 0F0B；roman 端空格）、11A9B/11A9C shad、11A9D pluta、11A9E–11AA0 head marks（11A9E 即蒙古國徽索永布符號）、11AA1/11AA2 terminal marks",
  };
  for (const [sec, map] of sections) {
    let first = true;
    for (const [k, v] of Object.entries(map)) {
      // 檢字表審計：空格鍵（tsheg）面板無法以「空格」列呈現輸入語義——
      // 顯示 ␣ 並附說明（引擎行為正確：面板空格分詞即轉 tsheg）
      const shown = k === " " ? "\u2423" : k;
      const spaceNote = k === " " ? "面板輸入空格即轉 tsheg（空格＝分詞符）" : undefined;
      rows.push({ native: k === " " ? "—" : cp(v), roman: shown, note: [first ? notes[sec] : undefined, spaceNote].filter(Boolean).join("；") || undefined, section: sec });
      first = false;
    }
  }
  // <gm>/+ 補列刪除（MARK_CP 功能符區已列，補列＝重複）；
  // backing-store 細節併入功能符 note。
  notes["功能符"] = notes["功能符"] + "；backing store：<gm> 緊隨基字母、先於其他組合符；+ 置於每對輔音之間（§14.7）";
  // 獨立元音組合 <a-*> 說明列（NamesList 11A50 載體模型；引擎實鍵如實列示）
  rows.push({
    native: "\u2014",
    roman: "<a-i|ue|u|e|o|oe|ai|au|ri|li|aa>",
    note: "獨立元音組合：11A50 LETTER A（載體，不發音）+ VOWEL SIGN → 顯式 token <a-*>（NamesList：used for representing independent vowels in combination with vowel signs）",
    section: "獨立元音組合",
  });
  rows.push({
    native: "\u2014",
    roman: "-n / -g / -ng / …（音節尾輔音）",
    note: "音節尾輔音＝Wylie 同構 -鍵（-g/-k/-ng/-d/-n/-b/-m/-r/-l/-sh/-s/-'a，11A8A–11A95）：am/ag/ang 型＝LETTER A + final sign。裸 CVC 尾輔音（如 ran）非合法鍵——尾輔音須寫 -n 形，否則透傳",
    section: "拼寫規則",
  });
  return rows;
}

/* ---------------- 註冊到 TRANSLIT_REGISTRY ---------------- */

const soyombo: TransliterationScheme = {
  id: "soyombo",
  label: {
    zh: "索永布文（Wylie 扩展 ↔ Unicode）",
    "zh-TW": "索永布文（Wylie 擴展 ↔ Unicode）",
    en: "Soyombo (Wylie ext. ↔ Unicode)",
    bo: "སོ་ཡམ་བོ་(Wylie རྒྱས་པ།↔Unicode)",
    ug: "Soyombo (Wylie ext.↔Unicode)",
    mn: "Соёмбо (Wylie ext.↔Unicode)",
    ja: "ソヨンボ文字（Wylie 拡張 ↔ Unicode）",
    ko: "소욤보 문자(Wylie 확장 ↔ Unicode)",
    sa: "सोयम्बो(Wylie ext.↔Unicode)",
    hi: "सोयम्बो (Wylie ext.↔Unicode)",
  fr: "Soyombo (Wylie ext. ↔ Unicode)", de: "Soyombo (Wylie erw. ↔ Unicode)", },
  group: "soyombo",
  primary: true,
  description:
    "索永布文（U+11A50–U+11AAF）↔ Wylie 擴展轉寫；四態模型（+ subjoiner／<gm> gemination／- 音節尾輔音 Wylie 同構鍵／無 virama）——顯式疊字，與 Zanabazar 同構",
  romanToNative: (input: string, _opts?: TransliterationOptions) => soyomboRomanToNative(input),
  nativeToRoman: (input: string, _opts?: TransliterationOptions) => soyomboNativeToRoman(input),
  looksLikeNative: looksLikeSoyombo,
  looksLikeRoman: looksLikeSoyomboRoman,
  convert: (input: string, _opts?: TransliterationOptions) => convertSoyombo(input),
  charTable: buildSoyomboCharTable(),
  // 檢字表審計：面板長文掃描層原子 token（〈ci-/cf-/-X/+/<gm>〉等鍵含詞界
  // trigger 字符 < + - '，不聲明 tokenRe 會被切詞拆散原樣透傳）。鍵集與
  // charTable 同源動態生成（最長優先、^…$ 自我錨定）。
  romanTokenRe: new RegExp(
    "^(?:" +
      buildSoyomboCharTable().map((r) => r.roman)
        .filter((r) => /^[+\-'<>]/.test(r))
        .sort((a, b) => b.length - a.length)
        .map((r) => r.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
        .join("|") +
      ")$"
  ),
  // 顯式疊字第二真實消費者——11A99 SUBJOINER 必須顯式出現
  stackModel: { mode: "explicit-subjoiner", subjoinerCp: 0x11a99, contextualCluster: true },
};

registerScheme(soyombo);
