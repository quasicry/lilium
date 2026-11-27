// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry
/**
 * 書寫系統檔案：定義每種文字在直排下的 CSS 書寫模式、斷行規則與字體預設。
 *
 * 依據：
 *  - W3C CSS Writing Modes Level 4
 *  - W3C International: Styling vertical Chinese, Japanese, Korean and Mongolian text
 *  - W3C International: Bidirectional text（UAX #9 / CSS direction + unicode-bidi）
 *  - Unicode 13.0 對 Old Uyghur（回鶻文）的書寫方向定義（直寫、列序自左向右，蒙古文同源）
 */

export type ScriptId =
  | "han" // 漢文（簡體）
  | "hant" // 漢文（繁體）
  | "ja" // 日文
  | "ko" // 韓文
  | "mongolian" // 蒙古文
  | "manchu" // 滿文（與蒙古文共用 Unicode 區段）
  | "olduyghur" // 回鶻文
  | "manichaean" // 摩尼文（U+10AC0–U+10AFF；RTL 連寫，摩尼教東傳文獻主流文字，Unicode 14.0）
  | "arabic" // 阿拉伯文（含波斯語、烏爾都語等用阿拉伯字母書寫的語言）
  | "hebrew" // 希伯來文（含意第緒語）
  | "latin" // 拉丁/其它橫排文種（含希臘、西里爾等）
  | "xibe" // 錫伯文（滿文改型，共用蒙古文 Unicode 區段，直排列序同滿文）
  | "tibetan" // 藏文（Wylie 轉寫）
  | "sanskrit" // 梵文（天城體 / IAST）
  | "pali" // 巴利文（天城體 / IAST）
  | "uyghur" // 維吾爾文（UEY / ULY）
  | "sinhala" // 僧伽羅文（Sinhala，U+0D80–U+0DFF）
  | "siddham" // 悉曇體（Siddham，U+11580–U+115FF，Unicode 7.0 官方編碼）
  | "ranjana" // 蘭札體 / 雷尼扎那（Rañjanā；非標準 Unicode，本插件採 Devanagari 編碼的 Nithya Ranjana DU）
  | "kharoshthi" // 佉盧虱吒文（Kharoṣṭhī，U+10A00–U+10A5F；犍陀羅語文字，唯一 RTL 婆羅米文）
  | "brahmi" // 婆羅米文（Brahmi，U+11000–U+1107F；印度系文字之祖，阿育王法敕）
  | "phagspa" // 八思巴文（'Phags-pa，U+A840–U+A87F；元朝國字，垂直書寫）
  | "marchen" // Marchen（U+11C70–U+11CBF；苯教文字，無 tshek，Unicode 9.0）
  | "zanabazar" // 方形札那巴扎爾文（U+11A00–U+11A4F；顯式 SUBJOINER 疊字，Unicode 7.0）
  | "soyombo"; // 索永布文（U+11A50–U+11AAF；顯式 SUBJOINER＋GEMINATION，Unicode 10.0）

export interface ScriptProfile {
  id: ScriptId;
  /** 各 UI 語言下的顯示名 */
  label: Record<string, string>;
  /** HTML lang 屬性（同時決定瀏覽器斷行詞典與字體選擇） */
  htmlLang: string;
  /**
   * 列序 / 書寫模式：
   *  - vertical-rl  ：中日韓（自右向左）
   *  - vertical-lr  ：蒙古 / 滿 / 回鶻（自左向右）
   *  - horizontal-tb：阿拉伯（RTL 橫排；直排會破壞連寫與詞序）
   */
  writingMode: "vertical-rl" | "vertical-lr" | "horizontal-tb";
  /** 默認字符朝向 */
  textOrientation: "mixed" | "upright" | "sideways";
  /** EPUB spine 的 page-progression-direction */
  pageProgression: "rtl" | "ltr";
  /**
   * 段落基礎方向（HTML dir / CSS direction）。
   * 不可從 htmlLang 推導 —— 必須顯式聲明，否則阿拉伯文整段按 LTR 排版。
   */
  bidi: "ltr" | "rtl";
  /**
   * 字符是否等寬、能否畫「原稿紙」方格。
   * 僅中日韓爲 true：拉丁字母寬度不等、阿拉伯字母連寫，畫方格必然錯位。
   */
  gridAligned: boolean;
  lineBreak: "auto" | "strict" | "loose";
  wordBreak: "normal" | "keep-all" | "break-all";
  /** 是否啓用標點置中（依賴字體的 vert/vrt2 直排字形） */
  centerPunctuation: boolean;
  /** 推薦字體族（按優先級），本地未安裝時由字體管理器下載 */
  fontStack: string[];
  /** 是否開啓縦中橫（tate-chu-yoko）自動處理數字 */
  autoTcy: boolean;
  /** 文字方向說明（展示在設置面板） */
  note: Record<string, string>;
}

export const SCRIPTS: Record<ScriptId, ScriptProfile> = {
  han: {
    id: "han",
    label: { zh: "汉文（简体）", "zh-TW": "漢文（簡體）", ja: "漢文（簡體字）", ko: "한문(간체)", en: "Chinese (Simplified)", mn: "Хятад (хялбар)", fr: "Chinois (simplifié)", de: "Chinesisch (vereinfacht)", },
    htmlLang: "zh-Hans",
    writingMode: "vertical-rl",
    textOrientation: "mixed",
    pageProgression: "rtl",
    bidi: "ltr",
    gridAligned: true,
    lineBreak: "strict",
    wordBreak: "keep-all",
    centerPunctuation: true,
    fontStack: ["Noto Serif SC", "Noto Serif CJK SC", "Noto Serif CJK TC", "Source Han Serif SC", "Source Han Serif TC", "Songti SC", "Songti TC", "SimSun", "serif"],
    autoTcy: true,
    note: {
      zh: "列序自右向左。啓用 vert 字形後句號、逗號等標點居中。",
      en: "Columns run right to left. Punctuation is centered via the font's vert glyphs.",
    },
  },
  hant: {
    id: "hant",
    label: { zh: "汉文（繁体）", "zh-TW": "漢文（繁體）", ja: "漢文（繁體字）", ko: "한문(번체)", en: "Chinese (Traditional)", mn: "Хятад (уламжлалт)", fr: "Chinois (traditionnel)", de: "Chinesisch (traditionell)", },
    htmlLang: "zh-Hant",
    writingMode: "vertical-rl",
    textOrientation: "mixed",
    pageProgression: "rtl",
    bidi: "ltr",
    gridAligned: true,
    lineBreak: "strict",
    wordBreak: "keep-all",
    centerPunctuation: true,
    fontStack: ["Noto Serif TC", "Noto Serif CJK TC", "Source Han Serif TC", "Songti TC", "PMingLiU", "serif"],
    autoTcy: true,
    note: { zh: "列序自右向左，適合古籍、詩刊排版。", en: "Columns run right to left." },
  },
  ja: {
    id: "ja",
    label: { zh: "日文", "zh-TW": "日文", ja: "日本語", ko: "일본어", en: "Japanese", mn: "Япон", fr: "Japonais", de: "Japanisch", },
    htmlLang: "ja",
    writingMode: "vertical-rl",
    textOrientation: "mixed",
    pageProgression: "rtl",
    bidi: "ltr",
    gridAligned: true,
    lineBreak: "strict",
    wordBreak: "keep-all",
    centerPunctuation: true,
    fontStack: ["Noto Serif JP", "Source Han Serif", "Hiragino Mincho ProN", "Yu Mincho", "serif"],
    autoTcy: true,
    note: { zh: "列序自右向左，遵循 JIS X 4051 禁則。", en: "Right-to-left columns following JIS X 4051 kinsoku rules." },
  },
  ko: {
    id: "ko",
    label: { zh: "韩文", "zh-TW": "韓文", ja: "韓國語", ko: "한국어", en: "Korean", mn: "Солонгос", fr: "Coréen", de: "Koreanisch", },
    htmlLang: "ko",
    writingMode: "vertical-rl",
    textOrientation: "mixed",
    pageProgression: "rtl",
    bidi: "ltr",
    gridAligned: true,
    lineBreak: "strict",
    wordBreak: "keep-all",
    centerPunctuation: true,
    fontStack: ["Noto Serif KR", "Source Han Serif KR", "Nanum Myeongjo", "Apple SD Gothic Neo", "serif"],
    autoTcy: true,
    note: { zh: "韓文直排時音節塊保持正立。", en: "Hangul syllables stay upright in vertical columns." },
  },
  mongolian: {
    id: "mongolian",
    label: { zh: "蒙古文", "zh-TW": "蒙古文", ja: "モンゴル文字", ko: "몽골 문자", en: "Mongolian", mn: "ᠮᠣᠩᠭᠣᠯ ᠪᠢᠴᠢᠭ", fr: "Mongol", de: "Mongolisch", },
    htmlLang: "mn-Mong",
    writingMode: "vertical-lr",
    textOrientation: "sideways",
    pageProgression: "ltr",
    bidi: "ltr",
    gridAligned: false,
    lineBreak: "auto",
    wordBreak: "normal",
    centerPunctuation: false,
    fontStack: ["Noto Sans Mongolian", "Mongolian Baiti", "MenksoftHara", "Menk Qagan Tig", "OyunHaraTig", "OyunAgulaTig", "Abkai Xanyan", "sans-serif"],
    autoTcy: false,
    note: { zh: "列序自左向右，與中日韓相反；字形順時針旋轉 90°。", en: "Columns run left to right — the opposite of CJK." },
  },
  manchu: {
    id: "manchu",
    label: { zh: "满文", "zh-TW": "滿文", ja: "満州文字", ko: "만주 문자", en: "Manchu", mn: "ᠮᠠᠨᠵᠤ ᠪᠢᠴᠢᠭ", fr: "Mandchou", de: "Mandschu", },
    htmlLang: "mnc",
    writingMode: "vertical-lr",
    textOrientation: "sideways",
    pageProgression: "ltr",
    bidi: "ltr",
    gridAligned: false,
    lineBreak: "auto",
    wordBreak: "normal",
    centerPunctuation: false,
    fontStack: ["Noto Sans Mongolian", "OyunHaraTig", "OyunAgulaTig", "MenksoftHara", "Abkai Xanyan", "Daicing White", "Mongolian Baiti", "sans-serif"],
    autoTcy: false,
    note: { zh: "滿文與蒙古文共用 Unicode 區段，同樣列序自左向右。", en: "Shares the Mongolian Unicode block; columns run left to right." },
  },
  olduyghur: {
    id: "olduyghur",
    label: { zh: "回鹘文", "zh-TW": "回鶻文", ja: "ウイグル文字", ko: "위구르 문자", en: "Old Uyghur", mn: "ᠤᠶᠭᠤᠷ ᠪᠢᠴᠢᠭ", fr: "Vieux ouïghour", de: "Altuyghurisch", },
    htmlLang: "oui",
    writingMode: "vertical-lr",
    textOrientation: "sideways",
    pageProgression: "ltr",
    bidi: "ltr",
    gridAligned: false,
    lineBreak: "auto",
    wordBreak: "normal",
    centerPunctuation: false,
    fontStack: ["Noto Serif Old Uyghur", "Noto Sans Mongolian", "sans-serif"],
    autoTcy: false,
    note: { zh: "回鶻文爲蒙古文之源，直寫列序自左向右（U+10F70–U+10FAF）。", en: "Ancestor of the Mongolian script; vertical columns run left to right." },
  },
  manichaean: {
    id: "manichaean",
    label: { zh: "摩尼文", "zh-TW": "摩尼文", ja: "マニ文字", ko: "마니 문자", en: "Manichaean", fr: "Manichéen", de: "Manichäisch", },
    htmlLang: "xmn",
    // 摩尼文爲 RTL 連寫字母文字（同阿拉伯/希伯來），直排會破壞連寫詞形——必須橫排 + rtl
    writingMode: "horizontal-tb",
    textOrientation: "mixed",
    pageProgression: "rtl",
    bidi: "rtl",
    gridAligned: false,
    lineBreak: "auto",
    wordBreak: "normal",
    centerPunctuation: false,
    fontStack: ["Noto Sans Manichaean", "Noto Sans Syriac Eastern", "Estrangelo Edessa", "serif"],
    autoTcy: false,
    note: {
      zh: "摩尼文爲 RTL 連寫文字（U+10AC0–U+10AFF），橫排 + 從右向左。中古波斯語/帕提亞語/粟特語/回鶻語的摩尼教文獻主流文字。",
      en: "Manichaean is an RTL joining script (U+10AC0–U+10AFF); horizontal RTL is used.",
    },
  },
  arabic: {
    id: "arabic",
    label: { zh: "阿拉伯文", "zh-TW": "阿拉伯文", ja: "アラビア文字", ko: "아랍 문자", en: "Arabic", mn: "Араб", fr: "Arabe", de: "Arabisch", },
    htmlLang: "ar",
    // 阿拉伯字母靠連寫成形，直排會把詞拆成孤立字形 —— 必須橫排 + rtl
    writingMode: "horizontal-tb",
    textOrientation: "mixed",
    pageProgression: "rtl",
    bidi: "rtl",
    gridAligned: false,
    lineBreak: "auto",
    wordBreak: "normal",
    centerPunctuation: false,
    fontStack: ["Noto Naskh Arabic", "Noto Sans Arabic", "Noto Serif Arabic", "Geeza Pro", "Al Bayan", "serif"],
    autoTcy: false,
    note: {
      zh: "阿拉伯字母連寫，直排會破壞詞形，故採用橫排 + 從右向左（dir=rtl）。書頁翻頁方向仍自右向左。",
      en: "Arabic letters join; vertical layout would break word shapes, so horizontal RTL is used.",
    },
  },
  hebrew: {
    id: "hebrew",
    label: { zh: "希伯来文", "zh-TW": "希伯來文", ja: "ヘブライ文字", ko: "히브리 문자", en: "Hebrew", mn: "Еврей", fr: "Hébreu", de: "Hebräisch", },
    htmlLang: "he",
    writingMode: "horizontal-tb",
    textOrientation: "mixed",
    pageProgression: "rtl",
    bidi: "rtl",
    gridAligned: false,
    lineBreak: "auto",
    wordBreak: "normal",
    centerPunctuation: false,
    fontStack: ["Noto Sans Hebrew", "Noto Serif", "Times New Roman", "serif"],
    autoTcy: false,
    note: {
      zh: "希伯來文爲 RTL 文字，同樣採用橫排 + 從右向左（dir=rtl）。",
      en: "Hebrew is RTL; horizontal layout with dir=rtl.",
    },
  },
  latin: {
    id: "latin",
    label: { zh: "拉丁 / 横排", "zh-TW": "拉丁 / 橫排", ja: "ラテン / 橫組み", ko: "라틴 / 가로쓰기", en: "Latin / Horizontal", mn: "Латин / хөндлөн", fr: "Latin / Horizontal", de: "Latein / Horizontal", },
    htmlLang: "en",
    writingMode: "vertical-rl",
    textOrientation: "sideways",
    pageProgression: "rtl",
    bidi: "ltr",
    gridAligned: false,
    lineBreak: "auto",
    wordBreak: "normal",
    centerPunctuation: false,
    fontStack: ["Noto Serif", "Georgia", "serif"],
    autoTcy: false,
    note: { zh: "拉丁字母在直排下整行順時針旋轉 90°（sideways）。", en: "Latin runs are rotated clockwise as a whole (sideways)." },
  },
  xibe: {
    id: "xibe",
    label: { zh: "锡伯文", "zh-TW": "錫伯文", ja: "シべ文字", ko: "시버 문자", en: "Xibe (Sibe)", mn: "ᠰᡞᠪᡝ ᡥᡝᡵᡤᡝ", fr: "Xibe (Sibe)", de: "Xibe (Sibe)", },
    // ISO 639-3 `srx`（Sibe）。錫伯文與滿文共用蒙古文 Unicode 區段 U+1800–U+18AF，
    // 按碼點無法與滿文/蒙古文區分，故只能經 frontmatter `lang: srx` 顯式觸發。
    htmlLang: "srx",
    // 錫伯文爲滿文改型：直寫、列序自左向右（與滿文一致），複用滿文字體渲染
    writingMode: "vertical-lr",
    textOrientation: "sideways",
    pageProgression: "ltr",
    bidi: "ltr",
    gridAligned: false,
    lineBreak: "auto",
    wordBreak: "normal",
    centerPunctuation: false,
    fontStack: ["Noto Sans Mongolian", "OyunHaraTig", "OyunAgulaTig", "MenksoftHara", "Abkai Xanyan", "sans-serif"],
    autoTcy: false,
    note: {
      zh: "錫伯文爲滿文改型，與滿文共用蒙古文 Unicode 區段 U+1800–U+18AF，直排列序自左向右，複用滿文字體渲染；標點用中文標點。",
      en: "Xibe is a Manchu derivative sharing the Mongolian Unicode block; vertical columns run left to right, rendered with the Manchu font.",
    },
  },
  tibetan: {
    id: "tibetan",
    label: { zh: "藏文", "zh-TW": "藏文", ja: "チベット文字", ko: "티베트 문자", en: "Tibetan", bo: "བོད་སྐད།", fr: "Tibétain", de: "Tibetisch", },
    htmlLang: "bo",
    writingMode: "horizontal-tb",
    textOrientation: "mixed",
    pageProgression: "ltr",
    bidi: "ltr",
    gridAligned: false,
    lineBreak: "auto",
    wordBreak: "normal",
    centerPunctuation: false,
    fontStack: ["Noto Serif Tibetan", "Jomolhari", "Noto Sans Tibetan", "Tibetan Machine Uni", "serif"],
    autoTcy: false,
    note: {
      zh: "藏文使用 Wylie 拉丁文轉寫，橫排自左向右（U+0F00–U+0FFF）。",
      en: "Tibetan uses Wylie romanization; horizontal left-to-right.",
    },
  },
  sanskrit: {
    id: "sanskrit",
    label: { zh: "梵文（天城体）", "zh-TW": "梵文（天城體）", ja: "梵字（デーヴァナーガリー）", ko: "범어 문자", en: "Sanskrit (Devanagari)", sa: "संस्कृतम्", fr: "Sanskrit (devanagari)", de: "Sanskrit (Devanagari)", },
    htmlLang: "sa",
    writingMode: "horizontal-tb",
    textOrientation: "mixed",
    pageProgression: "ltr",
    bidi: "ltr",
    gridAligned: false,
    lineBreak: "auto",
    wordBreak: "normal",
    centerPunctuation: false,
    fontStack: ["Noto Sans Devanagari", "Sanskrit 2003", "Mangal", "serif"],
    autoTcy: false,
    note: {
      zh: "梵文使用 IAST 拉丁文與天城體雙向轉寫（U+0900–U+097F）。",
      en: "Sanskrit IAST ↔ Devanagari (U+0900–U+097F).",
    },
  },
  pali: {
    id: "pali",
    label: { zh: "巴利文（天城体）", "zh-TW": "巴利文（天城體）", ja: "パーリ語文字", ko: "팔리 문자", en: "Pali (Devanagari)", fr: "Pali (devanagari)", de: "Pali (Devanagari)", },
    htmlLang: "pi",
    writingMode: "horizontal-tb",
    textOrientation: "mixed",
    pageProgression: "ltr",
    bidi: "ltr",
    gridAligned: false,
    lineBreak: "auto",
    wordBreak: "normal",
    centerPunctuation: false,
    fontStack: ["Noto Sans Devanagari", "Mangal", "serif"],
    autoTcy: false,
    note: {
      zh: "巴利文採用 IAST 受限字符集，與梵文共用天城體字體。",
      en: "Pali uses a restricted IAST set; shares Devanagari font with Sanskrit.",
    },
  },
  uyghur: {
    id: "uyghur",
    label: { zh: "维吾尔文", "zh-TW": "維吾爾文", ja: "ウイグル文字", ko: "위구르 문자", en: "Uyghur", ug: "ئۇيغۇر", fr: "Ouïghour", de: "Uyghurisch", },
    htmlLang: "ug",
    writingMode: "horizontal-tb",
    textOrientation: "mixed",
    pageProgression: "rtl",
    bidi: "rtl",
    gridAligned: false,
    lineBreak: "auto",
    wordBreak: "normal",
    centerPunctuation: false,
    fontStack: ["Noto Naskh Arabic", "Noto Sans Arabic", "Alkatip Tuz Tom", "serif"],
    autoTcy: false,
    note: {
      zh: "維吾爾文使用 UEY（阿拉伯字母）與 ULY（拉丁字母）雙向轉寫，橫排從右向左（dir=rtl）。",
      en: "Uyghur UEY (Arabic script) ↔ ULY (Latin); horizontal RTL.",
    },
  },
  sinhala: {
    id: "sinhala",
    label: { zh: "僧伽罗文", "zh-TW": "僧伽羅文", ja: "シンハラ文字", ko: "신할라 문자", en: "Sinhala", fr: "Sinhala", de: "Singhalesisch", },
    htmlLang: "si",
    writingMode: "horizontal-tb",
    textOrientation: "mixed",
    pageProgression: "ltr",
    bidi: "ltr",
    gridAligned: false,
    lineBreak: "auto",
    wordBreak: "normal",
    centerPunctuation: false,
    fontStack: ["Noto Sans Sinhala", "sans-serif"],
    autoTcy: false,
    note: {
      zh: "僧伽羅文（斯里蘭卡）使用 IAST 風格音位拉丁文轉寫，橫排自左向右（U+0D80–U+0DFF）。",
      en: "Sinhala (Sri Lanka) phonemic romanization (IAST-style); horizontal LTR (U+0D80–U+0DFF).",
    },
  },
  siddham: {
    id: "siddham",
    label: { zh: "悉曇体", "zh-TW": "悉曇體", ja: "悉曇体", ko: "시드담 문자", en: "Siddham", fr: "Siddham", de: "Siddham", },
    htmlLang: "sa",
    // 書寫方向改為從左往右橫向（horizontal-tb / ltr）。
    // 此前 vertical-rl/rtl 為悉曇傳統經卷風格；現代數位編碼（Unicode 官方）視
    // Siddham 為 LTR 文種（Brahmi 系源自左至右），橫向利於與梵文羅馬轉寫對照。
    writingMode: "horizontal-tb",
    textOrientation: "mixed",
    pageProgression: "ltr",
    bidi: "ltr",
    gridAligned: false,
    lineBreak: "auto",
    wordBreak: "normal",
    centerPunctuation: false,
    fontStack: ["Noto Sans Siddham", "serif"],
    autoTcy: false,
    note: {
      zh: "悉曇體（Siddham，U+11580–U+115FF）Unicode 7.0 官方編碼，東亞佛教咒語常用；內嵌 Noto Sans Siddham。",
      en: "Siddham (U+11580–U+115FF), Unicode 7.0; used for East-Asian Buddhist mantras. Bundled: Noto Sans Siddham.",
    },
  },
  ranjana: {
    id: "ranjana",
    label: { zh: "兰札体 / 雷尼扎那", "zh-TW": "蘭札體 / 雷尼扎那", ja: "ランツァ文字 / ランジャナー", ko: "란자 문자 / 란자나", en: "Lantsa / Rañjanā", fr: "Lantsa / Rañjanā", de: "Lantsa / Rañjanā", },
    htmlLang: "sa",
    writingMode: "horizontal-tb",
    textOrientation: "mixed",
    pageProgression: "ltr",
    bidi: "ltr",
    gridAligned: false,
    lineBreak: "auto",
    wordBreak: "normal",
    centerPunctuation: false,
    // 族名改為字體自報的 "Nithya Ranjana DU"（此前是 "Nithya Ranjana"，
    // 與 name 表不符）。舊名仍由 FontDef.aliases 註冊，用戶手寫 CSS 不會失效。
    fontStack: ["Nithya Ranjana DU", "Noto Sans Devanagari", "serif"],
    autoTcy: false,
    note: {
      zh: "蘭札體 / Rañjanā 尚無標準 Unicode；本插件內嵌 Nithya Ranjana DU（採 Devanagari 碼位 U+0900–U+097F，以天城體碼位存梵文、由字型渲染爲蘭札字形）。",
      en: "Lantsa / Rañjanā has no standard Unicode yet; bundled Nithya Ranjana DU uses Devanagari codepoints (U+0900–U+097F) rendered as Ranjana glyphs.",
    },
  },
  brahmi: {
    id: "brahmi",
    label: { zh: "婆罗米文", "zh-TW": "婆羅米文", ja: "ブラーフミー文字", ko: "브라흐미 문자", en: "Brahmi", fr: "Brahmi", de: "Brahmi", },
    htmlLang: "sa",
    // 婆羅米橫排 LTR（顯式 virama，字體無複雜 shaping / GSUB 合字依賴，直排無必要）
    writingMode: "horizontal-tb",
    textOrientation: "mixed",
    pageProgression: "ltr",
    bidi: "ltr",
    gridAligned: false,
    lineBreak: "auto",
    wordBreak: "normal",
    centerPunctuation: false,
    fontStack: ["Noto Sans Brahmi", "serif"],
    autoTcy: false,
    note: {
      zh: "婆羅米文（Brahmi，U+11000–U+1107F），印度系文字之祖，阿育王法敕即用此文；橫排自左向右。內嵌 Noto Sans Brahmi。",
      en: "Brahmi (U+11000–U+1107F), ancestor of nearly all Indic scripts; the edicts of Ashoka. Horizontal LTR. Bundled: Noto Sans Brahmi.",
    },
  },
  phagspa: {
    id: "phagspa",
    label: { zh: "八思巴文", "zh-TW": "八思巴文", ja: "パスパ文字", ko: "파스파 문자", en: "'Phags-pa", fr: "'Phags-pa", de: "'Phags-pa", },
    htmlLang: "sa-Phag",
    // 八思巴文直寫 top-to-bottom、列序自左向右（同蒙古文版式，字形側立）
    writingMode: "vertical-lr",
    textOrientation: "sideways",
    pageProgression: "ltr",
    bidi: "ltr",
    gridAligned: false,
    lineBreak: "auto",
    wordBreak: "normal",
    centerPunctuation: false,
    fontStack: ["Noto Sans PhagsPa", "Lilium Sinological Dot", "serif"],
    autoTcy: false,
    note: {
      zh: "八思巴文（'Phags-pa，U+A840–U+A87F），元朝國字；直寫、列序自左向右（同蒙古文）。內嵌 Noto Sans PhagsPa。",
      en: "'Phags-pa (U+A840–U+A87F), script of the Yuan dynasty; vertical, columns left to right. Bundled: Noto Sans PhagsPa.",
    },
  },
  marchen: {
    id: "marchen",
    label: { zh: "玛钦文", "zh-TW": "瑪欽文", ja: "マルチェン文字", ko: "마르첸 문자", en: "Marchen", bo: "སྨར་ཆེན།", fr: "Marchen", de: "Marchen", },
    htmlLang: "bo-Marc",
    // 與藏文同源，橫排自左向右
    writingMode: "horizontal-tb",
    textOrientation: "mixed",
    pageProgression: "ltr",
    bidi: "ltr",
    gridAligned: false,
    lineBreak: "auto",
    wordBreak: "normal",
    centerPunctuation: false,
    fontStack: ["Noto Sans Marchen", "Noto Serif Tibetan", "serif"],
    autoTcy: false,
    note: {
      zh: "苯教瑪欽文（Marchen，U+11C70–U+11CBF），藏文同源；無 tshek——音節邊界以 ZWSP 顯式化（N4491）。內嵌 Noto Sans Marchen。",
      en: "Bon Marchen script (U+11C70–U+11CBF), derived from Tibetan; no tshek — syllable boundaries via ZWSP (N4491). Bundled: Noto Sans Marchen.",
    },
  },
  zanabazar: {
    id: "zanabazar",
    label: { zh: "方形札那巴扎尔文", "zh-TW": "方形札那巴扎爾文", ja: "ザナバザル方形文字", ko: "자나바자르 방형 문자", en: "Zanabazar Square", mn: "ᠵᠠᠨᠠᠪᠠᠽᠠᠷ ᠪᠢᠴᠢᠭ", fr: "Carré de Zanabazar", de: "Zanabazar-Quadratschrift", },
    htmlLang: "sa-Zanb",
    // 橫排 LTR（Unicode 官方 Bidi_Class=L、horizontal LTR；Zanabazar Unicode 7.0）——
    // 曾比照八思巴直寫，實為橫排文字，更正如是（組字不變：顯式 U+11A47 SUBJOINER）。
    writingMode: "horizontal-tb",
    textOrientation: "mixed",
    pageProgression: "ltr",
    bidi: "ltr",
    gridAligned: false,
    lineBreak: "auto",
    wordBreak: "normal",
    centerPunctuation: false,
    fontStack: ["Noto Sans Zanabazar Square", "serif"],
    autoTcy: false,
    note: {
      zh: "方形札那巴扎爾文（U+11A00–U+11A4F）；疊字用顯式 U+11A47 SUBJOINER（異於藏文隱式模型）。內嵌 Noto Sans Zanabazar Square。",
      en: "Zanabazar Square script (U+11A00–U+11A4F); conjuncts via explicit U+11A47 SUBJOINER (unlike Tibetan's implicit model). Bundled: Noto Sans Zanabazar Square.",
    },
  },
  soyombo: {
    id: "soyombo",
    label: { zh: "索永布文", "zh-TW": "索永布文", ja: "ソヨンボ文字", ko: "소욤보 문자", en: "Soyombo", mn: "Соёмбо бичиг", fr: "Soyombo", de: "Soyombo", },
    htmlLang: "sa-Soyo",
    // 橫排 LTR（Unicode 官方 Bidi_Class=L、horizontal LTR；Soyombo Unicode 10.0）——
    // 曾比照八思巴直寫，實為橫排文字，更正如是（組字不變：顯式 U+11A99 SUBJOINER）。
    writingMode: "horizontal-tb",
    textOrientation: "mixed",
    pageProgression: "ltr",
    bidi: "ltr",
    gridAligned: false,
    lineBreak: "auto",
    wordBreak: "normal",
    centerPunctuation: false,
    fontStack: ["Noto Sans Soyombo", "serif"],
    autoTcy: false,
    note: {
      zh: "索永布文（U+11A50–U+11AAF）；疊字用顯式 U+11A99 SUBJOINER、疊音記號 U+11A98 GEMINATION。內嵌 Noto Sans Soyombo。",
      en: "Soyombo script (U+11A50–U+11AAF); conjuncts via explicit U+11A99 SUBJOINER, gemination via U+11A98. Bundled: Noto Sans Soyombo.",
    },
  },
  kharoshthi: {
    id: "kharoshthi",
    label: { zh: "佉卢虱吒文", "zh-TW": "佉盧虱吒文", ja: "ハロースティー文字", ko: "카로슈티 문자", en: "Kharoshthi", mn: "Харошти", fr: "Kharoshthi", de: "Kharoshthi", },
    htmlLang: "sa",
    // 唯一 RTL 的婆羅米系文字（數字亦 RTL）；字母靠 GSUB cjct 連寫成形，
    // 直排會破壞詞形 —— 同 arabic/hebrew 先例：橫排 + dir=rtl。
    writingMode: "horizontal-tb",
    textOrientation: "mixed",
    pageProgression: "rtl",
    bidi: "rtl",
    gridAligned: false,
    lineBreak: "auto",
    wordBreak: "normal",
    centerPunctuation: false,
    fontStack: ["Noto Sans Kharoshthi", "serif"],
    autoTcy: false,
    note: {
      zh: "佉盧虱吒文（Kharoṣṭhī，U+10A00–U+10A5F），犍陀羅語文字，唯一從右向左書寫的婆羅米系文字；連寫成形，採橫排 + dir=rtl。內嵌 Noto Sans Kharoshthi。",
      en: "Kharoshthi (U+10A00–U+10A5F), script of Gāndhārī; the only RTL Brahmic script. Horizontal RTL. Bundled: Noto Sans Kharoshthi.",
    },
  },
};

export const SCRIPT_IDS = Object.keys(SCRIPTS) as ScriptId[];

/**
 * frontmatter `lang:` / `script:` 的語言標籤 → 書寫系統別名表。
 *
 * 舊版直接把 `fm.lang` 當 ScriptId 用，`lang: en` / `lang: ar` 等不匹配的標籤
 * 會靜默回退成漢文直排 —— 用戶完全無感知。這裏做一次規範化 + 白名單校驗，
 * 未命中時返回 null 由調用方走自動檢測。
 */
const LANG_ALIASES: Record<string, ScriptId> = {
  // 漢文
  zh: "han", cmn: "han", "zh-hans": "han", "zh-cn": "han", "zh-sg": "han", "zh-hans-cn": "han",
  // 繁體
  "zh-hant": "hant", "zh-tw": "hant", "zh-hk": "hant", "zh-mo": "hant", yue: "hant",
  // 日文
  ja: "ja", jpn: "ja", jp: "ja", "ja-jp": "ja",
  // 韓文
  ko: "ko", kor: "ko", kr: "ko", "ko-kr": "ko",
  // 蒙古 / 滿 / 回鶻
  mn: "mongolian", mon: "mongolian", "mn-mong": "mongolian",
  mnc: "manchu", manchu: "manchu",
  oui: "olduyghur", "old-uyghur": "olduyghur", "olduyghur": "olduyghur",
  // 摩尼文（摩尼教東傳文獻主流文字；中古波斯/帕提亞/粟特/回鶻語）
  xmn: "manichaean", manichaean: "manichaean", mani: "manichaean",
  // 阿拉伯字母系（含波斯語、烏爾都語、普什圖語；現代維吾爾語獨立見下）
  ar: "arabic", ara: "arabic", arb: "arabic", "ar-eg": "arabic", "ar-sa": "arabic",
  fa: "arabic", fas: "arabic", per: "arabic", ur: "arabic", urd: "arabic",
  ps: "arabic", sd: "arabic",
  // 希伯來（iw 爲舊標籤；意第緒語 yi/ji 同樣用希伯來字母）
  // 注意：yi 現爲本插件的「彝文」一級 ScriptId（與意第緒語別名衝突），
  // 故意第緒語改用 yid / ji，避免 lang:yi 被誤判爲希伯來。
  he: "hebrew", heb: "hebrew", iw: "hebrew", yid: "hebrew", ji: "hebrew",
  // 錫伯文（滿文改型；ISO 639-3 srx；xbe/sibe 爲常見寫法）
  srx: "xibe", xbe: "xibe", sibe: "xibe", xibe: "xibe",
  // 藏文 / 梵文 / 巴利文
  bo: "tibetan", tibetan: "tibetan", bod: "tibetan",
  sa: "sanskrit", sanskrit: "sanskrit", san: "sanskrit",
  // 婆羅米文（阿育王 Prakrit；inc-bra 为 ISO 15924 Brahma 常见写法变体）
  brahmi: "brahmi", "brahma": "brahmi", "inc-bra": "brahmi", prakrit: "brahmi",
  pi: "pali", pali: "pali", pli: "pali",
  // 維吾爾文（現代維吾爾語獨立 ScriptId；泛阿拉伯字母仍走 arabic）
  ug: "uyghur", uig: "uyghur", uyghur: "uyghur", uyg: "uyghur",
  // 拉丁 / 其它橫排文種（顯式聲明時按橫排處理）
  en: "latin", eng: "latin", la: "latin", lat: "latin",
  de: "latin", fr: "latin", es: "latin", pt: "latin", it: "latin", nl: "latin",
  ru: "latin", el: "latin", tr: "latin", vi: "latin", id: "latin", ms: "latin",
};

/**
 * 把語言 / 文種標籤規範化爲 ScriptId。
 * 命中別名表或本身就是 SCRIPT_IDS 之一時返回，否則 null（交給自動檢測）。
 */
export function resolveScriptAlias(value: unknown): ScriptId | null {
  if (typeof value !== "string") return null;
  const raw = value.trim().toLowerCase().replace(/_/g, "-");
  if (!raw) return null;
  if ((SCRIPT_IDS as string[]).includes(raw)) return raw as ScriptId;
  // 取主標籤：zh-Hans-CN → zh-hans → zh
  const alias = LANG_ALIASES[raw];
  if (alias) return alias;
  const head = raw.split("-")[0];
  return LANG_ALIASES[head] ?? ((SCRIPT_IDS as string[]).includes(head) ? (head as ScriptId) : null);
}

/**
 * 返回文本中各文字系統的字符計數。
 * 滿文（Manchu）雖與蒙古文共用 Mongolian 區段，但其專屬字母位於 U+1860–U+1877，
 * 這裏單獨計數，便於 `suggestFlow` 按閾值區分。
 *
 * `latin` 計數器語義爲「橫排字母」：除基本拉丁外還包含拉丁擴展（重音符）、
 * 希臘字母與西裏爾字母 —— 純俄文 / 純希臘文不應被判成漢文。
 *
 * bidi 控制符（U+200E/200F、U+202A–202E、U+2066–2069、U+061C）不參與計數：
 * 它們是不可見的格式字符，作文種證據會污染判定。
 */
/**
 * bidi 控制符（ALM / LRM / RLM / LRE–RLO / LRI–PDI）。
 * 這些是不可見的格式字符，若作文種證據會污染判定（例如一條 RLM 就能把
 * 整段拉丁文推成阿拉伯文），統計時一律跳過。
 */
function isBidiControl(cp: number): boolean {
  return (
    cp === 0x061c ||
    cp === 0x200e ||
    cp === 0x200f ||
    (cp >= 0x202a && cp <= 0x202e) ||
    (cp >= 0x2066 && cp <= 0x2069)
  );
}

export function countScripts(text: string): Record<string, number> {
  const counts: Record<string, number> = {
    cjk: 0,
    kana: 0,
    hangul: 0,
    mongolian: 0,
    manchu: 0,
    olduyghur: 0,
    manichaean: 0,
    arabic: 0,
    hebrew: 0,
    latin: 0,
    tibetan: 0,
    sanskrit: 0,
    uyghur: 0,
    sinhala: 0,
    siddham: 0,
    kharoshthi: 0,
    brahmi: 0,
    phagspa: 0,
    marchen: 0,
    zanabazar: 0,
    soyombo: 0,
  };
  // 維吾爾文專用阿拉伯字母（UEY），與通用阿拉伯文區分
  const UYGHUR_SPECIFIC = new Set([
    0x0626, 0x067e, 0x0686, 0x0698, 0x06af, 0x06ad,
    0x06c6, 0x06c7, 0x06c8, 0x06cb, 0x06d0, 0x06d5,
  ]);
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0;
    if (isBidiControl(cp)) continue;
    if (cp >= 0x10f70 && cp <= 0x10faf) counts.olduyghur++;
    else if (cp >= 0x10ac0 && cp <= 0x10aff) counts.manichaean++;
    else if (cp >= 0x1860 && cp <= 0x1877) counts.manchu++;
    else if (cp >= 0x1800 && cp <= 0x18af) counts.mongolian++;
    else if ((cp >= 0x3040 && cp <= 0x30ff) || (cp >= 0xff66 && cp <= 0xff9f)) counts.kana++;
    else if (cp >= 0xac00 && cp <= 0xd7af) counts.hangul++;
    else if ((cp >= 0x3400 && cp <= 0x9fff) || (cp >= 0xf900 && cp <= 0xfaff)) counts.cjk++;
    // 彝文（涼山規範）U+A000–U+A4CF、傣仂/傣擔/傣繃 U+1950–U+19DF/U+1A20–U+1AAF、
    // 高棉 U+1780–U+17FF、緬甸 U+1000–U+109F、泰文 U+0E00–U+0E7F
    // 均已移除（方案與字體一併下架）；對應碼位不再計入文種判定，
    // 會落到後續分支或計爲未識別字符。
    // 藏文：U+0F00–U+0FFF
    else if (cp >= 0x0f00 && cp <= 0x0fff) counts.tibetan++;
    // 梵文/巴利文（天城體）：U+0900–U+097F（兩者碼位重疊，由 frontmatter lang 區分）
    else if (cp >= 0x0900 && cp <= 0x097f) counts.sanskrit++;
    // 婆羅米系（本插件支援的文種）：碼位獨特，與上述不重疊
    else if (cp >= 0x0d80 && cp <= 0x0dff) counts.sinhala++;       // 僧伽羅文（斯里蘭卡）
    // 悉曇體（Siddham，Unicode 7.0 官方編碼 U+11580–U+115FF；與上述各文種碼位不重疊）
    else if (cp >= 0x11580 && cp <= 0x115ff) counts.siddham++;
    // 佉盧虱吒文（Kharoṣṭhī，U+10A00–U+10A5F，含數字 10A40–10A47 與標點 10A50–10A58；
    // 碼位獨特，單字元即判定）
    else if (cp >= 0x10a00 && cp <= 0x10a5f) counts.kharoshthi++;
    // 婆羅米文（Brahmi，U+11000–U+1107F，含數字 11066–1106F 與標點 11047–11048；
    // 碼位獨特，單字元即判定）
    else if (cp >= 0x11000 && cp <= 0x1107f) counts.brahmi++;
    // 八思巴文（'Phags-pa，U+A840–U+A87F，元朝國字；碼位獨特，單字元即判定）
    else if (cp >= 0xa840 && cp <= 0xa87f) counts.phagspa++;
    else if (cp >= 0x11c70 && cp <= 0x11cbf) counts.marchen++;
    else if (cp >= 0x11a00 && cp <= 0x11a4f) counts.zanabazar++;
    else if (cp >= 0x11a50 && cp <= 0x11aaf) counts.soyombo++;
    // 希伯來：基本區段 + 呈現形 / 帶點輔音
    else if ((cp >= 0x0590 && cp <= 0x05ff) || (cp >= 0xfb1d && cp <= 0xfb4f)) counts.hebrew++;
    // 維吾爾文專用字母優先計數
    else if (UYGHUR_SPECIFIC.has(cp)) counts.uyghur++;
    // 阿拉伯：主區段 + 補充 + 擴展-A/B + 呈現形-A/B
    else if (
      (cp >= 0x0600 && cp <= 0x06ff) ||
      (cp >= 0x0750 && cp <= 0x077f) ||
      (cp >= 0x0870 && cp <= 0x089f) ||
      (cp >= 0x08a0 && cp <= 0x08ff) ||
      (cp >= 0xfb50 && cp <= 0xfdfd) ||
      (cp >= 0xfe70 && cp <= 0xfefc)
    ) counts.arabic++;
    // 基本拉丁 + 拉丁擴展（café / naïve / äöü / ł）+ 希臘 + 西里爾
    else if (
      (cp >= 0x41 && cp <= 0x5a) ||
      (cp >= 0x61 && cp <= 0x7a) ||
      (cp >= 0x00c0 && cp <= 0x024f) ||
      (cp >= 0x1e00 && cp <= 0x1eff) ||
      (cp >= 0x0370 && cp <= 0x03ff) ||
      (cp >= 0x0400 && cp <= 0x04ff)
    ) counts.latin++;
  }
  return counts;
}

/**
 * 文種覆蓋率探測用樣本字
 *
 * 用途：判斷「某款用戶導入的字體到底能不能渲染這個文種」。
 * 每個樣本必須取自該文種**獨佔碼位**，否則會誤判：
 *  - han 用「永」而非「一」：「一」在日文字體裡也有，會把日文字體算進簡中棧
 *  - hant 用「龍」：繁體特異字形
 *  - ja  用「あ」：假名是日文獨佔，任何純漢字字體都渲染不出
 *  - manchu / xibe 與 mongolian 共用 U+1800–18AF 區段，
 *    故取 U+1873 起的 ali gali 擴展字符（通用蒙古文字體通常不含）
 *
 * ⚠️ ranjana（蘭札）無 Unicode 獨立編碼，實務上以 Devanagari 碼位 +
 *    Nithya Ranjana 系列字體承載，故樣本與 sanskrit 相同。副作用是
 *    「任一天城體字體都會被判為可渲染 ranjana」—— 已知誤配，
 *    但優於蘭札正文顯示成豆腐；用戶可用「文種字體指定」手動覆蓋。
 */
export const SCRIPT_SAMPLE_CHAR: Record<ScriptId, string> = {
  han: "永",
  hant: "龍",
  ja: "あ",
  ko: "한",
  mongolian: "ᠠ", // U+1820
  manchu: "ᡳ", // U+1873 滿文 ali gali i
  xibe: "ᡦ", // U+1866 滿文／錫伯文共用
  olduyghur: "𐽰", // U+10F70
  manichaean: "𐫀", // U+10AC0（Manichaean Aleph；摩尼教東傳文獻主流文字，RTL）
  arabic: "ا", // U+0627
  hebrew: "א", // U+05D0
  latin: "A",
  tibetan: "ཀ", // U+0F40
  sanskrit: "क", // U+0915
  pali: "क", // U+0915 巴利天城體同源
  uyghur: "ە", // U+06D5 UEY 専用 oe，區別於阿拉伯文
  sinhala: "ක", // U+0D9A
  siddham: "𑖀", // U+11580
  ranjana: "क", // U+0915，見上方說明
  kharoshthi: "𐨐", // U+10A10（佉盧 Ka；RTL 婆羅米文，犍陀羅語）
  brahmi: "𑀅", // U+11005（婆羅米 A；印度系文字之祖）
  phagspa: "ꡀ", // U+A840（八思巴 KA；元朝國字）
  marchen: "𑱀", // U+11C70（Marchen head mark）
  zanabazar: "𑨀", // U+11A00（Zanabazar head mark）
  soyombo: "𑪞", // U+11A9E（Soyombo head mark＝蒙古國徽索永布符號）
};

/**
 * 通用族關鍵字（不代表具體字形）。
 * 用戶字體必須插在它們**之前**：CSS 一旦命中通用族就停止匹配後續。
 */
export const GENERIC_FAMILY_KEYWORDS: readonly string[] = [
  "serif",
  "sans-serif",
  "monospace",
  "system-ui",
  "cursive",
  "fantasy",
  "math",
  "ui-serif",
  "ui-sans-serif",
  "ui-monospace",
  "ui-rounded",
];

/** 文種判定閾值；可通過設置面板或 frontmatter 覆蓋。 */
export interface ScriptThresholds {
  /** 日文判定：假名最少字符數 */
  kanaMin: number;
  /** 日文判定：假名佔漢字的比例閾值（無漢字時只要滿足 kanaMin 即判日文） */
  kanaRatio: number;
  /** 蒙古文最少字符數 */
  mongolianMin: number;
  /** 滿文最少字符數 */
  manchuMin: number;
  /** 回鶻文最少字符數（其 Unicode 塊獨特，少量即可優先） */
  oldUyghurMin: number;
  /** 彝文最少字符數（音節方塊字，直排同 CJK） */
  yiMin: number;
  /** RTL（阿拉伯 / 希伯來）最少字符數 */
  rtlMin: number;
  /** RTL 相對橫排字母的佔比閾值（拉丁多於此時判爲拉丁文種） */
  rtlRatio: number;
}

const DEFAULT_THRESHOLDS: ScriptThresholds = {
  kanaMin: 3,
  kanaRatio: 0.4,
  mongolianMin: 2,
  manchuMin: 2,
  oldUyghurMin: 1,
  yiMin: 3,
  rtlMin: 3,
  rtlRatio: 0.5,
};

/** 漢文簡繁字形抽樣判別：
 *  兩組「專屬字形差集」抽樣——同一漢字在另一體系中是不同碼位，
 *  故出現哪一側的字形即可作為該側證據。取高頻常用字，避免生僻字誤導。
 *  兩串嚴格互斥（交集為空斷言）：共用碼位字（如「人」「中」）兩側同形，
 *  不入表＝零證據，正確地不參與判定（共享字會雙計數灌水證據）。 */
const HANS_ONLY_SAMPLE = "这们说时语门为发后无动经进见开问间关联书写点张东车马马义动员设变见饭馆飞农钱听说体验状态买卖运输东风当国实际现问题发经济会组织业务艺术";
const HANT_ONLY_SAMPLE = "這們說時語門為發後無動經進見開問間關聯書寫點張東車馬馬義動員設變見飯館飛農錢聽說體驗狀態買賣運輸東風當國實際現問題發經濟會組織業務藝術";

/** 依簡繁專屬字形抽樣統計，判別漢文文檔應歸 han（簡）還是 hant（繁）。
 *  任何一側無證據（差集字零出現或兩側打平）→ 保持 han（既有行為，零回歸）。
 *  閾值＝多者嚴格佔優（>），少量對側字形（引文、人名）不翻轉整體判定。 */
export function detectHanVariant(text: string): "han" | "hant" {
  let hans = 0;
  let hant = 0;
  for (const ch of text) {
    if (HANS_ONLY_SAMPLE.includes(ch)) hans++;
    else if (HANT_ONLY_SAMPLE.includes(ch)) hant++;
  }
  if (hant > hans) return "hant";
  return "han";
}

/**
 * 依據字符統計與閾值推薦書寫系統。
 *
 * 優先級：回鶻 > 滿 > 蒙古 > 日文（需滿足閾值） > 韓文 > 漢文
 *        > 【RTL：阿拉伯 / 希伯來】 > 拉丁 > 漢文兜底。
 *
 * RTL 判定必須排在 CJK 之後 —— 否則「日文正文裏嵌一句阿拉伯引文」會被
 * 整體判成橫排阿拉伯文，把用戶的直排筆記徹底改向。
 */
export function suggestFlow(text: string, thresholds: Partial<ScriptThresholds> = {}): ScriptId {
  const t = { ...DEFAULT_THRESHOLDS, ...thresholds };
  const c = countScripts(text);

  if (c.olduyghur >= t.oldUyghurMin) return "olduyghur";
  // 摩尼文：碼位獨特（U+10AC0–U+10AFF），單字元即判定（同回鶻/佉盧的「少量即可優先」）
  if (c.manichaean > 0) return "manichaean";
  if (c.manchu >= t.manchuMin) return "manchu";
  if (c.mongolian >= t.mongolianMin) return "mongolian";

  // 短句保護：無漢字時假名只可能來自日文——2 假名（「はい」「そう」級最短寒暄）
  // 即足證，不必等 kanaMin=3（實錘：2 假名短句掉進 han 兜底）；1 假名維持不判
  //（單字符號如「〜」周邊誤證保護）。有漢字時仍走 kanaMin＋佔比門檻。
  const kanaOk = c.kana >= t.kanaMin || (c.cjk === 0 && c.kana >= 2);
  // 有漢字時：假名相對漢字佔比；純假名時：只要達到最小假名數即可
  const ratio = c.cjk > 0 ? c.kana / c.cjk : 1;
  if (kanaOk && ratio >= t.kanaRatio) {
    return "ja";
  }
  if (c.hangul > 0 && c.hangul > c.cjk) return "ko";
  // 彝文：音節方塊字，直排同 CJK。僅當彝文字佔優（≥ 漢字數）且達最小字符數時判彝文，
  // 漢文細分簡繁——字形抽樣判別（詳見 detectHanVariant）。
  // 修正「繁體文檔在 auto 下被判 han → 標點地區誤套 zh-Hans（GB 表）」的偏差；
  // 無差集字形證據時保持 han（零回歸）。

  // 碼位獨特文種（藏 / 梵 / 婆羅米系四文種）的判定**先於** cjk 優先返還。
  // 舊序 `if (c.cjk > 0) return detectHanVariant(text)` 會讓「含漢字的悉曇咒語筆記」
  // 整篇被判 han → 落入 OS_PROVIDED_SCRIPTS → 不注入 --li-font → 筆記裡的悉曇 /
  // 佉盧 / 藏 / 梵字掉進 CJK 系統字體 → 豆腐塊（這些碼位 CJK 字體一律沒有）。
  // 這些文種碼位與 CJK 完全不重疊、單字元即判定（原註釋自述「單字元即判定」），
  // 卻被排在 cjk 之後自相矛盾；提到 cjk 之前與其語義一致。回歸面：
  // 漢字假名混排（ja）、RTL 佔比判定（arabic/hebrew/uyghur）、latin 兜底全部不受影響
  // ——它們的碼位仍按原順序在 cjk 分支之後處理。
  if (c.tibetan >= 1) return "tibetan";
  if (c.sanskrit >= 1) return "sanskrit";
  if (c.sinhala >= 1) return "sinhala";
  // 悉曇體（Siddham）：碼位獨特（U+11580–U+115FF），單字元即判定，與其它婆羅米系同優先級
  if (c.siddham >= 1) return "siddham";
  // 佉盧虱吒文（Kharoṣṭhī）：碼位獨特（U+10A00–U+10A5F），單字元即判定（同上）
  if (c.kharoshthi >= 1) return "kharoshthi";
  // 婆羅米文（Brahmi）：碼位獨特（U+11000–U+1107F），單字元即判定（同上）
  if (c.brahmi >= 1) return "brahmi";
  // 八思巴文（'Phags-pa）：碼位獨特（U+A840–U+A87F），單字元即判定（同上）
  if (c.phagspa >= 1) return "phagspa";
  // Marchen：碼位獨特（U+11C70–U+11CBF），單字元即判定（同上）
  if (c.marchen >= 1) return "marchen";
  // 方形札那巴扎爾文：碼位獨特（U+11A00–U+11A4F），單字元即判定（同上）
  if (c.zanabazar >= 1) return "zanabazar";
  if (c.soyombo >= 1) return "soyombo";

  if (c.cjk > 0) return detectHanVariant(text);

  // RTL 與 latin 兜底維持原位（碼位可能與漢字混排，漢字主體仍優先）

  const rtl = c.arabic + c.hebrew + c.uyghur;
  if (rtl > 0) {
    let rtlScript: ScriptId = "arabic";
    if (c.uyghur > 0) rtlScript = "uyghur";
    else if (c.hebrew > c.arabic) rtlScript = "hebrew";
    // 純 RTL（沒有可比的橫排字母）直接判定；否則需同時滿足最小字符數與佔比
    if (c.latin === 0 || (rtl >= t.rtlMin && rtl >= t.rtlRatio * c.latin)) return rtlScript;
  }
  if (c.latin > 0) return "latin";
  // 無任何可識別字母（純 emoji / 純數字 / 純標點）→ 沿用漢文直排
  return "han";
}

/**
 * 剝離 YAML frontmatter，避免 frontmatter 裏的 ASCII 鍵名/標籤把 `latin`
 * 計數灌水，導致正文是阿拉伯文卻被判成拉丁。
 * 純函數版（不依賴 obsidian API），便於 Node 單測。
 */
export function stripFrontmatter(md: string): string {
  if (!md.startsWith("---")) return md;
  const firstNl = md.indexOf("\n");
  if (firstNl < 0) return md;
  // 首行必須恰爲 ---（允許行尾空白），否則不是 frontmatter
  if (md.slice(0, firstNl).trim() !== "---") return md;
  const rest = md.slice(firstNl + 1);
  const m = /(^|\n)(---|\.\.\.)[ \t]*(\r?\n|$)/.exec(rest);
  if (!m) return md;
  const endIdx = m.index + m[1].length + m[2].length;
  return rest.slice(endIdx).replace(/^\r?\n/, "");
}

/** 舊接口保留：默認閾值自動探測（先剝 frontmatter 再統計）。 */
export function detectScript(text: string): ScriptId {
  return suggestFlow(stripFrontmatter(text));
}

/** 取回一個書寫系統檔案，未知 id 回退到漢文 */
export function getScript(id: ScriptId): ScriptProfile {
  return SCRIPTS[id] ?? SCRIPTS.han;
}

/**
 * 辭典懸停查詞時，Intl.Segmenter 應使用的 BCP47 locale。
 *
 * 僅對「詞界依賴語言詞典」的文種返回具體 locale —— 這些文種的斷詞必須靠
 * 語言專屬詞表才能切對（CJK / 日 / 韓 / 阿拉伯 / 希伯來 / 天城體 / 巴利 /
 * 維吾爾 / 僧伽羅）。其餘文種（蒙古 / 滿 / 回鶻 / 錫伯 / 藏 / 悉曇 / 蘭札 /
 * 拉丁）由顯式分隔符（空格 / tsheg）或連寫決定詞界，locale 不影響結果，
 * 故返回 undefined 沿用運行時默認 Segmenter（與舊行爲一致）。
 *
 * 這是「寫作系統 ⇄ 辭典」聯動的關鍵：在蒙古文筆記裡查蒙古詞、在漢文筆記裡
 * 查漢詞，詞界都按當前筆記文種切，不再誤用默認 locale。
 */
export function segmenterLocaleFor(id: ScriptId): string | undefined {
  switch (id) {
    case "han": return "zh-Hans";
    case "hant": return "zh-Hant";
    case "ja": return "ja";
    case "ko": return "ko";
    case "arabic": return "ar";
    case "hebrew": return "he";
    case "sanskrit": return "sa";
    case "pali": return "pi";
    case "uyghur": return "ug";
    case "sinhala": return "si";
    default: return undefined;
  }
}

/**
 * 文種 → 用於「辭典優先匹配」的簡短語言碼。
 * 懸停查詞時，相同語言的辭典結果會被優先排到最前（見 DictFeature.reorderHitsByScript）。
 */
export function scriptLangCode(id: ScriptId): string {
  switch (id) {
    case "han":
    case "hant": return "zh";
    case "ja": return "ja";
    case "ko": return "ko";
    case "mongolian":
    case "manchu":
    case "olduyghur":
    case "xibe": return "mn";
    case "arabic": return "ar";
    case "hebrew": return "he";
    case "tibetan": return "bo";
    case "marchen": return "bo"; // 與藏文同源，語言歸 bo
    case "zanabazar": case "soyombo": return "mn"; // 蒙古文字，語言歸 mn
    case "sanskrit": return "sa";
    case "pali": return "pi";
    case "uyghur": return "ug";
    case "sinhala": return "si";
    case "latin": return "en";
    default: return "";
  }
}
