// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry
/**
 * 地區直排標點規範（絕對標準表）
 * ============================================================
 * 三個規範源：
 *  1. 中國大陸：GB/T 15834—2011《标点符号用法》§5.2「直排文稿標點符號的位置和書寫形式」
 *     - 5.2.1 句號、問號、嘆號、逗號、頓號、分號、冒號 → 置於相應**文字之下（流內下一格），偏右（格內）**——呈現為字格右上；
 *     - 5.2.2 破折號、省略號、連接號、間隔號、分隔號 → **文字之下居中**（文字之下＝行文流下一格，居中＝格內居中——即現行 center 錨位語義）、上下方向排列；
 *     - 5.2.3 引號改「﹃﹄／﹁﹂」、括號改「︵︶」，標在項目上下；
 *     - 5.2.4 浪線式書名號「﹏」標在相應文字**左側**；
 *     - 5.2.5 着重號標在文字**右側**、专名號標在**左側**；
 *     - 5.2.6 橫排位置禁則（點號不出現行首；引/括號前半不出現行末…）同樣適用直排。
 *  2. 台灣：教育部《重訂標點符號手冊》修訂版（民國 97 年）各符號「直式說明」
 *     - 句號/逗號/頓號/分號/冒號/問號/驚嘆號/間隔號/連接號 → 占一字位、**居正中**；
 *     - 破折號/刪節號 → 占行中**二格**；引號 → 前後各占一字位、居左上/右下角；
 *     - 夾注號甲式（ ）居正中（前半不出現一行之末、後半不出現一行之首）；
 *     - 書名號甲式﹏直行標書名**左旁**、乙式《》標上下；專名號直行標專名**左旁**。
 *  3. 日本：無統一政府國標（維基彙整的慣例）——讀點直式置**右上**；其他居中/旋轉同 clreq。
 *  4. 韓國：**無官方直排標準**——國立國語院《문장 부호 규정》（2015）已刪除直排條文
 *     （官方解說：刪「고리점｡」「모점､」因現今幾乎不做直排；1988《한글 맞춤법》附錄曾規定
 *     直排句讀用 。、，引號用「」，但無格內幾何規範）。ko 欄依 **W3C KLREQ（直排點號用
 *     全角、。＋CJK 符號 U+3008~F）＋日式慣例**（讀點右上）補入。
 *
 * 消費方式：
 *  - `verticalAnchorFor()` 回傳點號在地區規範下的錨位（供 dx/dy 分叉）；
 *  - `assertRegionVerticalSpec()` 由 buildNativePunctCss()/buildTypesetCss() 呼叫，
 *    引擎朝向表與本表矛盾即拋錯（門禁 [1.87] 紅燈）；run.mjs 對表值做靜態斷言。
 *
 * 注意：「標點符號置中」（centerPunctuation，使用者 opt-in）是 clreq §6.3.2.1
 * 認可的排版調整，開啟時**蓋過**地區規範位——本表是「關閉置中時的規範預設位」。
 */

/** 直排錨位語義（相對字身格）：
 *  - `center`      居正中（台灣手冊；破折號/省略號等 GB 亦要求居中）
 *  - （`right-down` 已廢——r80 裁定：GB「之下，偏右」＝格右上，見 right-up）
 *  - `right-up`    之上偏右（日文讀點右上慣例）
 */
export type VertAnchor = "center" | "right-up";

/** 直排字形語義：`vert`（用直排字形/正立）、`upright`（強制正立）、`rotate`（右旋 90°） */
export type VertGlyph = "vert" | "upright" | "rotate";

export interface RegionVertPunctRule {
  readonly anchor: VertAnchor;
  readonly glyph: VertGlyph;
  /** 規範出處（門禁回報用） */
  readonly source: string;
}

/** 碼位類別（與 typeset.ts 的 punctCategoryClass 對齊；此處只列被包裹的碼位） */
const POINTS = [0x3002, 0xff0c, 0x3001] as const;
const FIXED = [0xff1a, 0xff1b, 0xff1f, 0xff01] as const;
// 右旋類（clreq A.6.2 類別級，無逐字覆寫）
const DASHES_ROTATE = [0x2014, 0x2015, 0xff0d, 0x002d, 0x007e] as const;
// 直立類（punct.gen uprightOverride：…、～ 等 r68/r76 逐字裁定）
const DASHES_UPRIGHT = [0x2026, 0x22ef, 0xff5e] as const;
const ASCII_SYMBOLS = [0x0023, 0x0024, 0x0025, 0x0026, 0x002a, 0x002f, 0x0040] as const;
const QUOTES = [0x300c, 0x300d, 0x300e, 0x300f] as const;
const CURLY_QUOTES = [0x201c, 0x201d, 0x2018, 0x2019] as const;
const BRACKETS = [0xff08, 0xff09, 0x3010, 0x3011, 0x3014, 0x3015, 0x300a, 0x300b, 0x3008, 0x3009] as const;
const MIDDOTS = [0x00b7, 0x2022, 0x30fb] as const;

export type RegionKey = "zh-Hans" | "zh-Hant" | "ja" | "ko";

const GB = "GB/T 15834—2011 §5.2";
const MOE = "教育部《重訂標點符號手冊》修訂版（直式說明）";
const JP = "日本慣例（無統一國標；維基彙整）";
const KLREQ_JP = "W3C KLREQ＋日式慣例（韓國無官方直排標準）";

/** 三地直排規範絕對標準表：碼位 → 地區 → 規則 */
export const REGION_VERT_PUNCT_SPEC: Readonly<
  Record<number, Readonly<Record<RegionKey, RegionVertPunctRule>>>
> = (() => {
  const table: Record<number, Record<RegionKey, RegionVertPunctRule>> = {};
  const put = (cps: readonly number[], mk: (k: RegionKey) => RegionVertPunctRule): void => {
    // ko 依 KLREQ＋日式慣例——預設同 ja，個別類別覆寫
    for (const cp of cps)
      table[cp] = { "zh-Hans": mk("zh-Hans"), "zh-Hant": mk("zh-Hant"), ja: mk("ja"), ko: mk("ko") };
  };

  // 點號：GB「（置於相應）文字之下，偏右」——「下」＝直排行文流向的下一格、
  //   「偏右」＝格內偏右；呈現結果＝字格**右上**（「文字之下偏右」為 right-down 單一錨位）
  // ／台灣「居正中」／日本讀點「右上」
  put([...POINTS, ...FIXED], (k) =>
    k === "zh-Hans"
      ? { anchor: "right-up", glyph: "upright", source: `${GB} 5.2.1（文字之下，偏右＝格右上）` }
      : k === "zh-Hant"
        ? { anchor: "center", glyph: "upright", source: MOE }
        : k === "ja"
          ? { anchor: "right-up", glyph: "upright", source: JP }
          : { anchor: "right-up", glyph: "upright", source: KLREQ_JP },
  );

  // 破折號／連接號右旋類：三地皆「居中」＋右旋（GB 5.2.2；台灣居中、行中二格；日本旋轉）
  put([...DASHES_ROTATE, ...ASCII_SYMBOLS], () => ({ anchor: "center", glyph: "rotate", source: `${GB} 5.2.2 / ${MOE} / ${JP} / ${KLREQ_JP}` }));
  // 省略號／浪線／間隔號：居中＋直立（引擎 uprightOverride / LI-TS-104 直排不旋轉）
  put([...DASHES_UPRIGHT, ...MIDDOTS], () => ({ anchor: "center", glyph: "upright", source: `${GB} 5.2.2 / LI-TS-104 / r76 定案 / ${KLREQ_JP}` }));

  // 直角引號：三地直排形（﹁﹂﹃﹄）＝正立
  // 直角引號：韓國 1988 舊規定直排即用「『（낫표）——ko 有官方依據
  put([...QUOTES], (k) =>
    k === "ko"
      ? { anchor: "center", glyph: "upright", source: "1988 한글 맞춤법 부록（直排引號＝낫표）" }
      : { anchor: "center", glyph: "upright", source: `${GB} 5.2.3 / ${MOE} / ${JP}` });

  // 彎引號：GB 直排改 ﹃﹄／﹁﹂（upright）；台灣手冊以「」『』為主（upright）；日本同台灣
  put([...CURLY_QUOTES], (k) =>
    k === "zh-Hans"
      ? { anchor: "center", glyph: "upright", source: `${GB} 5.2.3` }
      : k === "ko"
        ? { anchor: "center", glyph: "upright", source: KLREQ_JP }
        : { anchor: "center", glyph: "upright", source: `${MOE} / ${JP}` },
  );

  // 括號：GB 改 ︵︶（直排縱向形＝upright）；台灣/日本直排（ ）隨 vert 正立
  put([...BRACKETS], () => ({ anchor: "center", glyph: "upright", source: `${GB} 5.2.3 / ${MOE} / KLREQ（全角開括號字形置格下端＝居中語義）` }));

  return table;
})();

/** 引擎朝向判定 vs 本表一致性自審：矛盾即拋錯（門禁紅燈）。 */
export function assertRegionVerticalSpec(
  engineGlyph: (cp: number) => "upright" | "rotate",
): void {
  for (const [cpStr, byRegion] of Object.entries(REGION_VERT_PUNCT_SPEC)) {
    const cp = Number(cpStr);
    const engine = engineGlyph(cp);
    // 大陸點號規範 upright、dash 類 rotate——引擎須與**全部地區**的 glyph 欄一致
    //（glyph 欄對同一碼位三地皆同值，故取任一地區比對即可）
    for (const rule of Object.values(byRegion)) {
      if (rule.glyph !== engine) {
        throw new Error(
          `[lilium] 地區直排標點規範違反：U+${cp.toString(16).toUpperCase().padStart(4, "0")} ` +
            `規範 glyph=${rule.glyph}（${rule.source}），引擎判定=${engine}`,
        );
      }
    }
  }
}

/** 點號直排規範錨位（dx/dy 分叉用）。未列碼位回 center（不動既有行為）。 */
export function verticalAnchorFor(cp: number, region: RegionKey): VertAnchor {
  return REGION_VERT_PUNCT_SPEC[cp]?.[region]?.anchor ?? "center";
}

/** 位置禁則（GB 5.2.6）：點號不出現行首——橫排禁則同樣適用直排。供斷行層查詢。 */
export const REGION_VERT_POSITION_RULES = {
  /** 點號（。，、：；？！）禁行首 */
  noLineStart: [...POINTS, ...FIXED],
  /** 引號/括號前半禁行末、後半禁行首 */
  openNoLineEnd: [...QUOTES, ...CURLY_QUOTES, ...BRACKETS],
} as const;
