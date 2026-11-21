// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry
/**
 * clreq 標點三態表 —— 「不可分離」／「直排右旋 90°」／「不可調整」
 *
 * ⚠️ 本檔是**人工整理**的常數表，不是 machine-generated。之所以仍用 `.gen.ts`
 *    命名，是為了讓它與 vo.gen.ts / lb.gen.ts 同屬 `src/tsdata/` 資料層、
 *    受同一套「改資料要改這裡、不要在排版邏輯裡硬編碼」的約束。修訂本表時
 *    **必須同步**修訂 `LI-CJK排版標準-v1.0.md` 的對應條款，否則標準與實作漂移。
 *
 * 溯源
 * ----
 * · 規範：W3C《Requirements for Chinese Text Layout》clreq
 *   https://www.w3.org/TR/clreq/（附錄「標點符號全表」的「不可分離」「直排時
 *   右旋 90°」兩列、§6.1.2.1 分離禁則、§6.3.2.1 調整空間）
 * · 內部標準：`LI-CJK排版標準-v1.0.md` 條款
 *   LI-TS-101（直排右旋）、LI-TS-102（直排不可調整）、LI-TS-103（不可分離）、
 *   LI-TS-104（U+00B7 顯式覆蓋）、LI-TS-105（SVS 用 VS2）
 * · 調研：`调研/01-规范层-UNICODE-TR50-W3C-clreq.md` A.6.1 / A.6.2 / A.6.3 / §6.3.2.1 / B.4
 * · 整理日期：2026-09-20
 * · 授權：本表為依上述公開規範人工整理的事實性資料，不含 UCD 資料檔的複製內容，
 *   故不適用 Unicode License；爾後若混入 UCD 衍生資料，須比照 vo.gen.ts 補上
 *   Unicode 授權宣告。clreq 本身依 W3C Document License 釋出。
 *
 * 為什麼「不可調整」要分軸向與地區
 * --------------------------------
 * clreq §6.3.2.1 的原文把不可調整者切成兩批，而且**直排規則與橫排相反**：
 *   · 固定 1/2 em：GB 式半字連接號、間隔號、分隔號
 *   · 固定 1 em  ：橫排的港台式問號／驚嘆號；**直排的冒號、分號、問號、驚嘆號**
 *                  （含 GB 偏靠式與港台居中式）
 * `lilium` 過去的 bug（LI-TS-102）就是把橫排的位移量 `-0.28em/-0.16em` 一體套用到
 * 直排的 `：；？！`。若本表只給一個扁平 boolean，等於把這個 bug 的成因再寫一次，
 * 所以這裡保留「軸向 × 地區」的維度，由排版層查詢時帶入。
 */

import type { ScriptId } from "../languages";

/**
 * 地區集群（擴展為四態）。
 * 大陸（GB）/ 港台 / 日本 / 韓國各自為獨立節點；香港經 `languages.ts` 的
 * `LANG_ALIASES` 歸入 `zh-Hant`。clreq 對大陸（GB）與港台的標點寬度有不同規定，
 * 日文（jlreq）/ 韓文（KLREQ）則各有獨立慣例，故不再只以「繁簡」二分。
 */
export type PunctRegion = "zh-Hans" | "zh-Hant" | "ja" | "ko";

/** 書寫系統 → 標點地區集群；非中日韓文種返回 null（不套 CJK 標點規則） */
export function scriptIdToPunctRegion(id: ScriptId): PunctRegion | null {
  switch (id) {
    case "han": return "zh-Hans";
    case "hant": return "zh-Hant"; // 香港（zh-hk）經 LANG_ALIASES 歸入 hant
    case "ja": return "ja";
    case "ko": return "ko";
    default: return null;
  }
}

/** 三態中的每一態都標在這裡；未列在表中的碼位一律視為「可分離、不旋轉、可調整」 */
export interface PunctRule {
  /** 字元名（繁體中文 + 字面，供除錯與 UI 顯示） */
  readonly label: string;

  /**
   * ①「不可分離」（clreq 附錄 A.6.1 / §6.1.2.1；LI-TS-103）
   * true 表示本碼位本身即為 2 em 的原子單位（目前僅 U+2E3A ⸺）。
   * **雙碼位序列**（`——` `……` `⋯⋯`）不在這裡，見 `UNBREAKABLE_SEQUENCES`
   * ——單一碼位內部沒有可斷之處，序列才是真正需要保護的對象。
   */
  readonly unbreakable: boolean;

  /**
   * ②「直排時右旋 90°」（clreq 附錄 A.6.2；LI-TS-101）
 * true 表示直排下**必須旋轉**，不得強制 `text-orientation: upright`。
 * ⚠️ 歷史註記：早期 `typeset.ts` 曾把整組標點鎖成 upright，現已由
 *   `styles.css` 的 `.li-punct-dash/quote/bracket → sideways` 分類覆蓋實現，
 *   本欄僅作資料標記，旋轉行為由 CSS 消費端落實（故「最大規範違反點」已解除）。

   ⚠️ 資料收斂：`rotateVertical` 表達的是 clreq A.6.2 的**類別級**
   舊讀（引號／括號整類右旋）；實際渲染中，部分全角標點以**逐字**規則強制正立
   （vo=Tr，字體自帶直排字形轉向；法理同 LI-TS-104 的「UAX #50 與實務衝突時顯式
   覆寫」）。這個逐字覆寫以往手抄在 `typeset.ts` 的 `PUNCT_CJK_UPRIGHT`，形成
   第二份漂移真值源（G2 缺口）——現改為在本表標 `uprightOverride:true`，
   `PUNCT_CJK_UPRIGHT` 由本欄導出，單一真值源。`rotateVertical` 與
   `uprightOverride` 同時為 true 是**合法組合**：類別級右旋（A.6.2）＋逐字級
   正立覆寫（vo=Tr）——渲染採後者（逐字特異性高）。
 */
  readonly rotateVertical: boolean;

  /**
   * ②′ 直排**強制正立**覆寫（vo=Tr 逐字規則）。
   * true 表示本碼位在直排下以全角字形**正立**渲染（`.li-pc-*` 逐字
   * `text-orientation: upright` 壓過類別級 sideways）。覆蓋全體原
   * `PUNCT_CJK_UPRIGHT` 成員：直角引號「」『』、彎引號“”‘’、
   * 全角括號／方括號／書名號／單書名號／省略號／尖角括號 < > 等。
   * 未標者維持類別級朝向。
   */
  readonly uprightOverride?: boolean;

  /**
   * ③「不可調整」（clreq §6.3.2.1；LI-TS-102）：固定寬度、禁止擠壓與位移。
   * `vertical` 為 true 時直排一律不可調整（原文明載含 GB 偏靠式與港台居中式）。
   * `horizontal` 列出橫排下不可調整的地區；空陣列 = 橫排可調整。
   */
  readonly nonAdjustable: {
    readonly vertical: boolean;
    readonly horizontal: readonly PunctRegion[];
  };

  /**
   * 不可調整時的固定寬度（em）。未列出的地區表示規範未明訂，
   * 應沿用字體標稱寬度（查表回傳 null，排版層不應再自行猜測）。
   */
  readonly fixedEm?: {
    readonly zhHans?: number;
    readonly zhHant?: number;
  };
}

/** 三態表：碼位 → 規則 */
export const PUNCT_RULES: Readonly<Record<number, PunctRule>> = {
  // ── 破折號／連接號類（clreq 附錄 A.6.2：直排右旋 90°）──
  0x2e3a: {
    label: "⸺ TWO-EM DASH（破折號，占 2 em）",
    unbreakable: true, // §6.1.2.1：占 2 em 者視為一體，不得拆至兩行
    rotateVertical: true,
    nonAdjustable: { vertical: false, horizontal: [] },
  },
  0x2014: {
    label: "— EM DASH（破折號）",
    unbreakable: false, // 單個 1 em；成對的「——」才屬不可分離，見 UNBREAKABLE_SEQUENCES
    rotateVertical: true,
    nonAdjustable: { vertical: false, horizontal: [] },
  },
  0x2013: {
    label: "– EN DASH（GB 式半字連接號）",
    unbreakable: false,
    rotateVertical: true, // 附錄 A.6.2 把 EN DASH 歸入破折號類
    nonAdjustable: { vertical: true, horizontal: ["zh-Hans"] },
    fixedEm: { zhHans: 0.5 }, // §6.3.2.1「GB 式半字連接號」固定 1/2 em；港台未明訂
  },
  0x002d: {
    label: "- HYPHEN-MINUS（連接號）",
    unbreakable: false,
    rotateVertical: true,
    nonAdjustable: { vertical: false, horizontal: [] },
  },
  0xff5e: {
    label: "～ FULLWIDTH TILDE（連接號）",
    unbreakable: false,
    rotateVertical: true, uprightOverride: true, // r76（v2.9.82 定案）：直排直立（比照 … U+2026）
    nonAdjustable: { vertical: false, horizontal: [] },
  },

  // ── 省略號類（A.6.2：直排右旋 90°）──
  0x2026: {
    label: "… HORIZONTAL ELLIPSIS（省略號）",
    unbreakable: false, // 成對的「……」才屬不可分離
    rotateVertical: true, uprightOverride: true,
    nonAdjustable: { vertical: false, horizontal: [] },
  },
  0x22ef: {
    label: "⋯ MIDLINE HORIZONTAL ELLIPSIS",
    unbreakable: false, // 成對的「⋯⋯」才屬不可分離
    rotateVertical: true, uprightOverride: true,
    nonAdjustable: { vertical: false, horizontal: [] },
  },

  // ── 分隔號／間隔號（A.6.2 的 U+002F 右旋；A.6.3 的間隔號與全角分隔號不旋轉）──
  0x002f: {
    label: "/ SOLIDUS（分隔號）",
    unbreakable: false,
    rotateVertical: true, // ⚠️ 對照：全角 U+FF0F ／ **不旋轉**
    nonAdjustable: { vertical: true, horizontal: ["zh-Hans"] },
    fixedEm: { zhHans: 0.5 }, // §6.3.2.1「分隔號」固定 1/2 em（GB 式）；港台未明訂
  },
  0xff0f: {
    label: "／ FULLWIDTH SOLIDUS（全角分隔號）",
    unbreakable: false,
    rotateVertical: false, // A.6.3 明列「全角分隔號」屬直排不旋轉
    nonAdjustable: { vertical: false, horizontal: [] },
  },
  0x00b7: {
    label: "· MIDDLE DOT（中文間隔號）",
    unbreakable: false,
    rotateVertical: false, // ⚠️ 衝突條款：UAX #50 給 vo=R（側倒），clreq 要求間隔號直排不旋轉
    //    → LI-TS-104：li 必須**顯式覆蓋 vo**，不得依賴 UCD 預設值。
    nonAdjustable: { vertical: true, horizontal: ["zh-Hans", "zh-Hant"] },
    fixedEm: { zhHans: 0.5, zhHant: 1 }, // 大陸 1/2 em；港台無論直排橫排皆 1 em
  },
  0x30fb: {
    label: "・ KATAKANA MIDDLE DOT",
    unbreakable: false,
    rotateVertical: false,
    nonAdjustable: { vertical: false, horizontal: [] },
    // clreq 建議中文語境**不要用** U+30FB（JIS 來源），應改用 U+00B7。
  },
  0x2027: {
    label: "‧ HYPHENATION POINT（間隔號）",
    unbreakable: false,
    rotateVertical: false,
    nonAdjustable: { vertical: false, horizontal: [] },
  },

  // ── 引號（A.6.2：直排右旋 90°）──
  0x300c: { label: "「 LEFT CORNER BRACKET", unbreakable: false, rotateVertical: true, uprightOverride: true, nonAdjustable: { vertical: false, horizontal: [] } },
  0x300d: { label: "」 RIGHT CORNER BRACKET", unbreakable: false, rotateVertical: true, uprightOverride: true, nonAdjustable: { vertical: false, horizontal: [] } },
  0x300e: { label: "『 LEFT WHITE CORNER BRACKET", unbreakable: false, rotateVertical: true, uprightOverride: true, nonAdjustable: { vertical: false, horizontal: [] } },
  0x300f: { label: "』 RIGHT WHITE CORNER BRACKET", unbreakable: false, rotateVertical: true, uprightOverride: true, nonAdjustable: { vertical: false, horizontal: [] } },
  0x201c: { label: "“ LEFT DOUBLE QUOTATION MARK", unbreakable: false, rotateVertical: true, uprightOverride: true, nonAdjustable: { vertical: false, horizontal: [] } },
  0x201d: { label: "” RIGHT DOUBLE QUOTATION MARK", unbreakable: false, rotateVertical: true, uprightOverride: true, nonAdjustable: { vertical: false, horizontal: [] } },
  0x2018: { label: "‘ LEFT SINGLE QUOTATION MARK", unbreakable: false, rotateVertical: true, uprightOverride: true, nonAdjustable: { vertical: false, horizontal: [] } },
  0x2019: { label: "’ RIGHT SINGLE QUOTATION MARK", unbreakable: false, rotateVertical: true, uprightOverride: true, nonAdjustable: { vertical: false, horizontal: [] } },

  // ── 括號／書名號（A.6.2：直排右旋 90°）──
  0xff08: { label: "（ FULLWIDTH LEFT PARENTHESIS", unbreakable: false, rotateVertical: true, uprightOverride: true, nonAdjustable: { vertical: false, horizontal: [] } },
  0xff09: { label: "） FULLWIDTH RIGHT PARENTHESIS", unbreakable: false, rotateVertical: true, uprightOverride: true, nonAdjustable: { vertical: false, horizontal: [] } },
  0x300a: { label: "《 LEFT DOUBLE ANGLE BRACKET", unbreakable: false, rotateVertical: true, uprightOverride: true, nonAdjustable: { vertical: false, horizontal: [] } },
  0x300b: { label: "》 RIGHT DOUBLE ANGLE BRACKET", unbreakable: false, rotateVertical: true, uprightOverride: true, nonAdjustable: { vertical: false, horizontal: [] } },
  0x3008: { label: "〈 LEFT ANGLE BRACKET", unbreakable: false, rotateVertical: true, uprightOverride: true, nonAdjustable: { vertical: false, horizontal: [] } },
  0x3009: { label: "〉 RIGHT ANGLE BRACKET", unbreakable: false, rotateVertical: true, uprightOverride: true, nonAdjustable: { vertical: false, horizontal: [] } },
  // G2 補錄：< >（U+003C/E）尖角括號：歸 bracket 類包裹後由
  // PUNCT_CJK_UPRIGHT（本表 uprightOverride 導出）覆寫正立；表此前漏此二碼位。
  // UAX #50 給 vo=R（側倒），與「直排以全角字形正立」衝突 → 依 LI-TS-104 法理顯式覆寫。
  0x003c: { label: "< LESS-THAN SIGN（尖角括號）", unbreakable: false, rotateVertical: true, uprightOverride: true, nonAdjustable: { vertical: false, horizontal: [] } },
  0x003e: { label: "> GREATER-THAN SIGN（尖角括號）", unbreakable: false, rotateVertical: true, uprightOverride: true, nonAdjustable: { vertical: false, horizontal: [] } },
  0x3010: { label: "【 LEFT BLACK LENTICULAR BRACKET", unbreakable: false, rotateVertical: true, uprightOverride: true, nonAdjustable: { vertical: false, horizontal: [] } },
  0x3011: { label: "】 RIGHT BLACK LENTICULAR BRACKET", unbreakable: false, rotateVertical: true, uprightOverride: true, nonAdjustable: { vertical: false, horizontal: [] } },
  0x3016: { label: "〖 LEFT WHITE LENTICULAR BRACKET", unbreakable: false, rotateVertical: true, uprightOverride: true, nonAdjustable: { vertical: false, horizontal: [] } },
  0x3017: { label: "〗 RIGHT WHITE LENTICULAR BRACKET", unbreakable: false, rotateVertical: true, uprightOverride: true, nonAdjustable: { vertical: false, horizontal: [] } },
  0x3014: { label: "〔 LEFT TORTOISE SHELL BRACKET", unbreakable: false, rotateVertical: true, uprightOverride: true, nonAdjustable: { vertical: false, horizontal: [] } },
  0x3015: { label: "〕 RIGHT TORTOISE SHELL BRACKET", unbreakable: false, rotateVertical: true, uprightOverride: true, nonAdjustable: { vertical: false, horizontal: [] } },
  // G2 補錄：〘〙〚〛在舊 PUNCT_CJK_UPRIGHT 手抄清單內、
  // 卻漏在 clreq 表外——補錄成表條目（A.6.2 括號類右旋＋vo=Tr 逐字正立覆寫）。
  0x3018: { label: "〘 LEFT WHITE TORTOISE SHELL BRACKET", unbreakable: false, rotateVertical: true, uprightOverride: true, nonAdjustable: { vertical: false, horizontal: [] } },
  0x3019: { label: "〙 RIGHT WHITE TORTOISE SHELL BRACKET", unbreakable: false, rotateVertical: true, uprightOverride: true, nonAdjustable: { vertical: false, horizontal: [] } },
  0x301a: { label: "〚 LEFT WHITE SQUARE BRACKET", unbreakable: false, rotateVertical: true, uprightOverride: true, nonAdjustable: { vertical: false, horizontal: [] } },
  0x301b: { label: "〛 RIGHT WHITE SQUARE BRACKET", unbreakable: false, rotateVertical: true, uprightOverride: true, nonAdjustable: { vertical: false, horizontal: [] } },
  0xff3b: { label: "［ FULLWIDTH LEFT SQUARE BRACKET", unbreakable: false, rotateVertical: true, uprightOverride: true, nonAdjustable: { vertical: false, horizontal: [] } },
  0xff3d: { label: "］ FULLWIDTH RIGHT SQUARE BRACKET", unbreakable: false, rotateVertical: true, uprightOverride: true, nonAdjustable: { vertical: false, horizontal: [] } },
  0xff5b: { label: "｛ FULLWIDTH LEFT CURLY BRACKET", unbreakable: false, rotateVertical: true, nonAdjustable: { vertical: false, horizontal: [] } },
  0xff5d: { label: "｝ FULLWIDTH RIGHT CURLY BRACKET", unbreakable: false, rotateVertical: true, nonAdjustable: { vertical: false, horizontal: [] } },

  // ── 行間線（A.6.2：直排右旋 90°）──
  0xff3f: { label: "＿ FULLWIDTH LOW LINE（專名號）", unbreakable: false, rotateVertical: true, nonAdjustable: { vertical: false, horizontal: [] } },
  0xfe4f: { label: "﹏ WAVY LOW LINE（書名號甲式）", unbreakable: false, rotateVertical: true, nonAdjustable: { vertical: false, horizontal: [] } },

  // ── 點號（A.6.3：直排**不**旋轉）──
  // 個別碼位的空間調整另見 clreq §5.1：大陸置字面右上、港台置字面正中。
  0x3001: { label: "、 IDEOGRAPHIC COMMA（頓號）", unbreakable: false, rotateVertical: false, nonAdjustable: { vertical: false, horizontal: [] } },
  0x3002: { label: "。 IDEOGRAPHIC FULL STOP（句號）", unbreakable: false, rotateVertical: false, nonAdjustable: { vertical: false, horizontal: [] } },
  0xff0c: { label: "， FULLWIDTH COMMA（逗號）", unbreakable: false, rotateVertical: false, nonAdjustable: { vertical: false, horizontal: [] } },
  0xff0e: { label: "． FULLWIDTH FULL STOP", unbreakable: false, rotateVertical: false, nonAdjustable: { vertical: false, horizontal: [] } },
  0xff1a: {
    label: "： FULLWIDTH COLON（冒號）",
    unbreakable: false,
    rotateVertical: false,
    // LI-TS-102：直排的冒號固定 1 em、禁止擠壓（與橫排規則相反）。
    nonAdjustable: { vertical: true, horizontal: [] },
    fixedEm: { zhHans: 1, zhHant: 1 },
  },
  0xff1b: {
    label: "； FULLWIDTH SEMICOLON（分號）",
    unbreakable: false,
    rotateVertical: false,
    nonAdjustable: { vertical: true, horizontal: [] },
    fixedEm: { zhHans: 1, zhHant: 1 },
  },
  0xff1f: {
    label: "？ FULLWIDTH QUESTION MARK（問號）",
    unbreakable: false,
    rotateVertical: false,
    // 直排：兩地區皆固定 1 em（§6.3.2.1「含 GB 偏靠式與港台居中式」）；
    // 橫排：僅港台式為不可調整（§6.3.2.1 明列），大陸橫排可調整。
    nonAdjustable: { vertical: true, horizontal: ["zh-Hant"] },
    fixedEm: { zhHans: 1, zhHant: 1 },
  },
  0xff01: {
    label: "！ FULLWIDTH EXCLAMATION MARK（驚嘆號）",
    unbreakable: false,
    rotateVertical: false,
    nonAdjustable: { vertical: true, horizontal: ["zh-Hant"] },
    fixedEm: { zhHans: 1, zhHant: 1 },
  },
  0x203c: { label: "‼ DOUBLE EXCLAMATION MARK", unbreakable: false, rotateVertical: false, nonAdjustable: { vertical: false, horizontal: [] } },
  0x2047: { label: "⁇ DOUBLE QUESTION MARK", unbreakable: false, rotateVertical: false, nonAdjustable: { vertical: false, horizontal: [] } },

  // ── 著重號（A.6.3：不旋轉）──
  // ⚠️ U+2022 的 UAX #50 vo=R（側倒）。著重號是行間裝飾標記，不應受字元取向控制，
  //    與 U+00B7 同屬「需 li 顯式覆蓋」的一類（見調研 B.3.1）。
  0x25cf: { label: "● BLACK CIRCLE（著重號）", unbreakable: false, rotateVertical: false, nonAdjustable: { vertical: false, horizontal: [] } },
  0x2022: { label: "• BULLET（著重號）", unbreakable: false, rotateVertical: false, nonAdjustable: { vertical: false, horizontal: [] } },
};

/**
 * 不可分離的**多碼位序列**（clreq 附錄 A.6.1；LI-TS-103）。
 * 全表僅此 4 項：`⸺`（單碼位，已標在 `PUNCT_RULES`）、`——`、`……`、`⋯⋯`。
 * 排版管線應在這些序列上套 `white-space: nowrap` 或等效的不可斷標記。
 */
export const UNBREAKABLE_SEQUENCES: ReadonlyArray<readonly [number, number]> = [
  [0x2014, 0x2014], // ——
  [0x2026, 0x2026], // ……
  [0x22ef, 0x22ef], // ⋯⋯
];

/**
 * 直排引號的變體選擇符：**VS2 = U+FE01**（LI-TS-105 / UAX #50 §3.2.4 Table 2）。
 *
 * ⚠️ 糾偏：**不是 U+FE0E / U+FE0F**——後者是 emoji／文字呈現選擇器，
 * 屬 emoji 與文字的呈現選擇，與取向無關，UAX #50 全文未出現。專案過去的
 * 討論曾誤用 FE0E/FE0F，本表以 FE01 為準。
 * 是否真的換字形，最終取決於字體的 `vert` 特性是否有對應替換。
 */
export const VERTICAL_QUOTE_VS = 0xfe01;

/** SVS 全形直排引號序列：<2018/2019/201C/201D, FE01>（見 UCD StandardizedVariants.txt） */
export const VERTICAL_QUOTE_SVS: ReadonlyArray<readonly [number, number]> = [
  [0x2018, 0xfe01],
  [0x2019, 0xfe01],
  [0x201c, 0xfe01],
  [0x201d, 0xfe01],
];

/**
 * 直角引號等價映射（地區集群）。
 *
 * 中文嵌套慣例（clreq §5.2：大陸/港台直排用直角引號，外雙內單）：
 *   雙引號 " " → 「 」；單引號 ' ' → 『 』。
 * 即 U+201C/U+201D → U+300C/U+300D、U+2018/U+2019 → U+300E/U+300F（mapping B）。
 *
 * ⚠️ 與字面 UAX #50 §3.2.4 **相反**：UAX #50 依**日文字體直排字形**慣例，把
 *   單引號 ' ' 對應到 「 」、雙引號 " " 對應到 『 』（mapping A）。本插件對
 *   中文（zh-Hans/zh-Hant/ko）採 mapping B（符合中文語義嵌套），對日文（ja）
 *   採 mapping A（嚴格符合 UAX #50）。兩者不可混為一談。
 */
export const VERTICAL_QUOTE_CN_EQUIVALENT: Readonly<Record<number, number>> = {
  0x2018: 0x300e, // ‘ → 『（U+300E 左白直角括號）
  0x2019: 0x300f, // ’ → 』（U+300F 右白直角括號）
  0x201c: 0x300c, // “ → 「（U+300C 左直角括號）
  0x201d: 0x300d, // ” → 」（U+300D 右直角括號）
};

/** 日文（ja）：嚴格依字面 UAX #50 §3.2.4（mapping A，日文字體直排字形慣例） */
export const VERTICAL_QUOTE_JA_EQUIVALENT: Readonly<Record<number, number>> = {
  0x2018: 0x300c, // ‘ → 「（U+300C）
  0x2019: 0x300d, // ’ → 」（U+300D）
  0x201c: 0x300e, // “ → 『（U+300E）
  0x201d: 0x300f, // ” → 』（U+300F）
};

/** 舊名稱別名（既有測試 `verticalQuoteHansEquivalent` 依賴 CN 映射） */
export const VERTICAL_QUOTE_HANS_EQUIVALENT = VERTICAL_QUOTE_CN_EQUIVALENT;

/** 依地區分派直角引號等價物：ja 走 UAX #50 mapping A，其餘走中文嵌套 mapping B */
export function verticalQuoteEquivalent(cp: number, region: PunctRegion): number | undefined {
  return region === "ja"
    ? VERTICAL_QUOTE_JA_EQUIVALENT[cp]
    : VERTICAL_QUOTE_CN_EQUIVALENT[cp];
}

/** 日文直角引號等價物（mapping A），供測試直接引用 */
export function verticalQuoteJaEquivalent(cp: number): number | undefined {
  return VERTICAL_QUOTE_JA_EQUIVALENT[cp];
}

/** 查表；未列出的碼位回傳 undefined（＝可分離、不旋轉、可調整） */
export function punctRule(codePoint: number): PunctRule | undefined {
  return Object.prototype.hasOwnProperty.call(PUNCT_RULES, codePoint)
    ? PUNCT_RULES[codePoint]
    : undefined;
}

/**
 * 該碼位在此書寫軸向 × 地區下是否「不可調整」（禁止擠壓／位移）。
 * 軸向與地區必須由呼叫方帶入——扁平 boolean 會重蹈 LI-TS-102 的覆轍。
 */
export function isPunctNonAdjustable(codePoint: number, vertical: boolean, region: PunctRegion): boolean {
  const rule = punctRule(codePoint);
  if (rule === undefined) return false;
  return vertical
    ? rule.nonAdjustable.vertical
    : rule.nonAdjustable.horizontal.includes(region);
}

/** 不可調整者的固定寬度（em）；未明訂或可調整者回傳 null */
export function punctFixedEm(codePoint: number, vertical: boolean, region: PunctRegion): number | null {
  const rule = punctRule(codePoint);
  if (rule === undefined || !isPunctNonAdjustable(codePoint, vertical, region)) return null;
  // 地區集群：ja/ko 全寬＝1em，與 zh-Hant 同源；故 ja/ko 回落讀取 zhHant 的值。
  const key: "zhHans" | "zhHant" = region === "zh-Hans" ? "zhHans" : "zhHant";
  return rule.fixedEm?.[key] ?? null;
}
