// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry
/**
 * lilium 辭典 — Buddhist Canon Module.
 *
 * 佛學主題化能力：漢語系（漢文佛典處理）、巴利語系、藏語系大藏經支持。
 *
 * 巴利語系：
 *  - 巴利拉丁轉寫字元集 tokenization（ā ī ū ṅ ñ ṭ ḍ ṇ ḷ ṃ）
 *  - IAST ↔ 天城體子集映射（從 indic-transliteration iast.toml 提取）
 * 藏語系：
 *  - tsheg（ ་ ）音節分隔 / shad（ ། ）句讀的 tokenize
 *  - Wylie ↔ 藏文 Unicode 基礎映射
 * 失傳語種：
 *  - TransliterationScheme 通用架構（借鑑 Sanscript SchemeMap：方案=分組映射表）
 *
 * Sources:
 *  - tokushige-koyasan/pali-corpus (VRI 羅馬轉寫)
 */
// 巨型資料表改為「JSON 字串 + 首次使用才 JSON.parse」，
// 避免在插件啟動時同步求值約 340ms 的物件字面量（多數使用者根本不會碰到佛典功能）。
// 佛學資料經 buddhist-data.ts 容錯層惰性載入——任一表缺失也不崩潰（原生模式）。
import { loadCbCodeMap, loadCbVariantMap, loadCbGaijiMeta } from './buddhist-data';

// ------------------------------------------------------------------ 漢文佛典

/**
 * CBETA 缺字碼還原：文本中的 CBxxxxx（或 <g ref="#CBxxxxx"> 形式）→ 可顯示字元。
 * 已遷出，本函式依賴的三個
 * loader 現回空表，故實際效果為「原樣保留缺字碼」（設計內降級，不拋錯）。
 */
export function restoreCbCodes(text: string): string {
  return text.replace(/CB(\d{5})/g, (m, num) => {
    const ch = loadCbCodeMap()[`CB${num}`];
    if (ch) return ch;
    // 回落：官方 meta 的歸一字，其次 PUA 碼位（CBETA 補充字型顯示）
    const meta = loadCbGaijiMeta()[`CB${num}`];
    if (meta?.normalized) return meta.normalized;
    if (meta?.pua) {
      const cp = parseInt(meta.pua.slice(2), 16);
      if (Number.isFinite(cp)) return String.fromCodePoint(cp);
    }
    return m;
  });
}

/**
 * 缺字碼完整資訊：CBxxxxx → 顯示字元／組字式／歸一字／Unicode／PUA／教育部異體 ID。
 * 供 UI 顯示「缺字卡片」（組字式描述 + 多重表示），覆蓋官方全量 31,659 條。
 */
export function gaijiInfo(code: string): {
  display?: string;
  composition?: string;
  normalized?: string;
  unicode?: string;
  pua?: string;
  moe?: string;
} | undefined {
  const display = loadCbCodeMap()[code];
  const meta = loadCbGaijiMeta()[code];
  if (!display && !meta) return undefined;
  return {
    display,
    composition: meta?.composition,
    normalized: meta?.normalized,
    unicode: meta?.unicode,
    pua: meta?.pua,
    moe: meta?.moe,
  };
}

/**
 * 佛典異體字歸一化：依 CBETA variants 表把異體字映射到組內主字。
 * 與通用繁簡歸一（corpus.ts 的 ZH_T2S_EXT）正交——先跑異體歸一、再跑繁簡。
 */
export function normalizeBuddhistVariants(text: string): string {
  let out = '';
  for (const ch of text) {
    out += loadCbVariantMap()[ch] || ch;
  }
  return out;
}

/** 漢文佛典全歸一化管線：缺字碼還原 → 異體歸一（繁簡歸一由調用方按需追加） */
export function normalizeBuddhistChinese(text: string): string {
  return normalizeBuddhistVariants(restoreCbCodes(text));
}

// ------------------------------------------------------------------ 巴利語系

/** 巴利語拉丁轉寫字母集（含長音與下標點；ṝ/ḹ＝長 ṛ/ḷ，漏計會切斷含該字母的詞） */
const PALI_LATIN = /[a-zA-ZāīūĀĪŪṅñṇṃṭḍḷṝṜḹḸṬḌṂṄÑḶ]+/g;
/** 巴利文本特徵：長音符 + 下標點輔音出現密度（gu 全局計數） */
const PALI_CHARS = /[āīūṅñṭḍṇḷṃṝṜḹḸṬḌṄÑḶṂ]/gu;

/** 巴利語 tokenize：拉丁轉寫字元集分詞（詞邊界=非字母） */
export function tokenizePali(text: string): string[] {
  return text.match(PALI_LATIN) || [];
}

/** 語言猜測：是否巴利語（羅馬轉寫特徵字密度） */
export function looksLikePali(text: string): boolean {
  const latinLetters = text.match(/[a-zA-Z]/g)?.length || 0;
  if (latinLetters < 10) return false;
  const paliChars = text.match(PALI_CHARS)?.length || 0;
  return paliChars / latinLetters > 0.02;
}

// ---- IAST ⊂ 子集：巴利/梵文羅馬↔天城體（indic-transliteration iast.toml 提取）----

/** IAST 天城體映射（元音+常用輔音+符號；完整 65 方案架構見 TransliterationScheme） */
export const IAST_DEVANAGARI: Record<string, string> = {
  // vowels (independent)
  'ā': 'आ', 'ī': 'ई', 'ū': 'ऊ', 'ṛ': 'ऋ', 'ṝ': 'ॠ', 'ḷ': 'ऌ', 'e': 'ए',
  'ai': 'ऐ', 'o': 'ओ', 'au': 'औ', 'a': 'अ', 'i': 'इ', 'u': 'उ',
  // yogavaahas
  'ṃ': 'ं', 'ḥ': 'ः',
  // consonants
  'kh': 'ख', 'gh': 'घ', 'ch': 'छ', 'jh': 'झ', 'ṭh': 'ठ', 'ḍh': 'ढ',
  'th': 'थ', 'dh': 'ध', 'ph': 'फ', 'bh': 'भ',
  'k': 'क', 'g': 'ग', 'ṅ': 'ङ', 'c': 'च', 'j': 'ज', 'ñ': 'ञ',
  'ṭ': 'ट', 'ḍ': 'ड', 'ṇ': 'ण', 't': 'त', 'd': 'द', 'n': 'न',
  'p': 'प', 'b': 'ब', 'm': 'म', 'y': 'य', 'r': 'र', 'l': 'ल', 'v': 'व',
  'ś': 'श', 'ṣ': 'ष', 's': 'स', 'h': 'ह', 'ḻ': 'ळ',
  'kṣ': 'क्ष', 'jñ': 'ज्ञ',
  // symbols
  '।': '।', '॥': '॥', 'oṃ': 'ॐ',
};

/** 天城體 → IAST（反向映射，含元音符號組合） */
export const DEVANAGARI_IAST: Record<string, string> = Object.fromEntries(
  Object.entries(IAST_DEVANAGARI).map(([k, v]) => [v, k]),
);

/**
 * IAST → 天城體轉寫（基礎版，含天城體正字法元音邏輯）。
 * 規則：
 *  - 輔音後的 'a' 爲隱含元音，不產生字元（dha = ध）
 *  - 輔音後其他元音以組合符附加（buddha → ब + ि? 錯：u 是音符 बु）
 *  - 輔音後緊跟輔音 → 前輔音加 virama（dharma → ध र् म）
 *  - 詞首/前一字符非輔音時元音用獨立字形（oṃ → ॐ/ओ…）
 */
export function iastToDevanagari(text: string): string {
  const VOWEL_MARKS: Record<string, string> = {
    'ā': 'ा', 'ī': 'ी', 'ū': 'ू', 'ṛ': 'ृ', 'ṝ': 'ॄ', 'ḷ': 'ॢ',
    'e': 'े', 'ai': 'ै', 'o': 'ो', 'au': 'ौ', 'i': 'ि', 'u': 'ु',
  };
  const VIRAMA = '्';
  const keys = Object.keys(IAST_DEVANAGARI).sort((a, b) => b.length - a.length);
  const isConsDev = (ch: string) => /[क-ह]/.test(ch);

  let out = '';
  let i = 0;
  let lastWasCons = false; // 上一個輸出是否爲裸輔音（未帶元音音符）
  while (i < text.length) {
    let matched = false;
    for (const k of keys) {
      if (!text.startsWith(k, i)) continue;
      const dev = IAST_DEVANAGARI[k];
      i += k.length;
      const isCons = isConsDev(dev) || (dev.length === 2 && isConsDev(dev[0]));
      if (isCons) {
        if (lastWasCons) out += VIRAMA; // 前一輔音接輔音 → virama
        out += dev;
        lastWasCons = true;
      } else if (k === 'a') {
        // 隱含元音：裸輔音後不加任何符號
        lastWasCons = false;
      } else {
        const mk = VOWEL_MARKS[k];
        if (mk && lastWasCons) {
          out += mk; // 輔音後元音符號附加
        } else {
          out += dev; // 獨立元音字形（詞首）
        }
        lastWasCons = false;
      }
      matched = true;
      break;
    }
    if (!matched) {
      if (lastWasCons) out += VIRAMA; // 輔音後接非印度字符 → virama
      out += text[i];
      i++;
      lastWasCons = false;
    }
  }
  return out;
}

// ------------------------------------------------------------------ 藏語系

/** 藏文 tokenize：tsheg（ ་ ）分隔音節，shad（ ། ）切句；返回音節流 */
export function tokenizeTibetan(text: string): string[] {
  return text
    .split(/[\s་།༌༏༐༑]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** 藏文句讀切分（shad 為界） */
export function splitTibetanSentences(text: string): string[] {
  return text
    .split(/།/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// ------------------------------------------------------------------ 失傳語種框架

/**
 * 轉寫方案通用架構（借鑑 Sanscript SchemeMap：
 * 方案 = 分組映射表 {vowels, consonants, vowelMarks, virama, symbols, alternates}）。
 * 失傳語種（犍陀羅/吐火羅/于闐/回鶻/西夏/栗特）的轉寫表可作為同構方案掛載。
 */
export interface TransliterationScheme {
  /** 方案 id（如 iast、gandhari-iast、tangut-pinyin） */
  id: string;
  /** 語言/文字名 */
  label: string;
  /** 獨立元音映射 */
  vowels: Record<string, string>;
  /** 輔音映射 */
  consonants: Record<string, string>;
  /** 元音符號（組合附加） */
  vowelMarks?: Record<string, string>;
  /** virama/隔音符 */
  virama?: Record<string, string>;
  /** 標點/數字/特殊符號 */
  symbols?: Record<string, string>;
  /** 同義異寫 */
  alternates?: Record<string, string[]>;
}

/**
 * 失傳語種現狀速查：
 * 每種列出：文字系統、主要文獻藏地、數字化平台、插件支援層級。
 */
export interface LostLanguageInfo {
  id: string;
  label: string;
  script: string;
  corpusSource: string;
  digitization: string;
  /** none=僅資源鏈接 / scheme=轉寫方案掛載 / full=完整支持 */
  supportLevel: 'none' | 'scheme' | 'full';
}

export const LOST_LANGUAGES: LostLanguageInfo[] = [
  {
    id: 'gandhari',
    label: '犍陀羅語 Gāndhārī',
    script: 'Kharoṣṭhī 佉盧虱吒文（U+10A00–U+10A5F）',
    corpusSource: 'Gandhāran Buddhist Texts（大英圖書館桦樹皮寫本，公元前 1 世紀）',
    digitization: '華盛頓大學 Early Buddhist Manuscripts Project 已數字化',
    // 已交付文種級完整支持（四要件齊備），supportLevel 由 scheme 升 full——
    //  ① 內嵌字體 Noto Sans Kharoshthi（fonts.ts 第 8 套，SIL OFL 1.1）
    //  ② languages.ts 獨立文種檔 kharoshthi（horizontal-tb + rtl，RTL 傘）
    //  ③ 轉寫方案 gandhari-iast 已註冊（kharoshthi.ts，Glass 2000 約定，abugida 組字器）
    //  ④ 轉寫面板預選掛接（translit-ui.ts SCHEME_FOR_SCRIPT / GROUP_FOR_SCHEME）
    supportLevel: 'full',
  },
  {
    id: 'brahmi',
    label: '婆羅米語（阿育王 Prakrit）',
    script: '婆羅米文（U+11000–U+1107F）',
    corpusSource: '阿育王法敕（公元前 3 世紀石刻銘文）',
    digitization: 'Unicode 6.0 Brahmi 區塊（U+11000–U+1107F）；盆德爾銘文集成 Corpus Inscriptionum Indicarum',
    // 四要件齊備，supportLevel 升 full：
    //  ① 內嵌字體 Noto Sans Brahmi（fonts.ts FONT_CATALOG，SIL OFL 1.1，46,972 B，cmap 123 鍵 100% 覆蓋）
    //  ② languages.ts 獨立文種檔 brahmi（horizontal-tb + ltr，橫排 LTR）
    //  ③ 轉寫方案 brahmi-iast 已註冊（brahmi.ts，indic-transliteration brahmi.toml，abugida 組字器）
    //  ④ 轉寫面板預選掛接（translit-ui.ts SCRIPT_PREFERRED_SCHEME / SCHEME_GROUP_SCRIPT）
    supportLevel: 'full',
  },
  {
    id: 'tocharian',
    label: '吐火羅語 A/B',
    script: '婆羅米變體（龟茲/焉耆）',
    corpusSource: '柏林 Turfan Collection / 巴黎',
    digitization: 'Tocharian B Online / CeTOC（德法合作）',
    supportLevel: 'scheme',
  },
  {
    id: 'khotanese',
    label: '于闐語（于闐塞語）',
    script: '婆羅米變體',
    corpusSource: 'British Library / IDP 敦煌和田文書',
    digitization: 'International Dunhuang Programme (idp.bl.uk)',
    supportLevel: 'scheme',
  },
  {
    id: 'uyghur',
    label: '回鶻語（Old Uyghur）',
    script: '回鶻文（U+10C00–）／摩尼文',
    corpusSource: '柏林 Turfanforschung',
    digitization: 'Akademie der Wissenschaften digital collection',
    supportLevel: 'none',
  },
  {
    id: 'tangut',
    label: '西夏語 Tangut',
    script: '西夏文方塊字（U+17000–U+187FF 已入 Unicode 13.0）',
    corpusSource: '俄藏黑水城文獻 / 寧夏',
    digitization: 'Tangut Unicode 已編碼 6,136 字；李範文《夏漢字典》',
    supportLevel: 'scheme',
  },
  {
    id: 'sogdian',
    label: '慄特語 Sogdian',
    script: '慄特文（U+10F30–U+10F6F 已入 Unicode）',
    corpusSource: '敦煌吐魯番書信/佛經殘卷',
    digitization: 'IDP / TITUS Frankfurt',
    supportLevel: 'scheme',
  },
  {
    id: 'siddham',
    label: '悉曇體 Siddham',
    script: '悉曇/梵字（漢傳密宗音譯咒語用）',
    corpusSource: '漢譯佛典咒語音譯段',
    digitization: 'common_maps 有 siddham.toml 轉寫表（indic-transliteration）',
    supportLevel: 'scheme',
  },
];

/**
 * 悉曇體（Siddham）轉寫方案。
 * 數據：indic-transliteration/common_maps brahmic/siddham.toml（MIT）。
 * 鍵為天城體（經 IAST 中介），值為悉曇 Unicode（U+11580–U+115FF）。
 */
export const SIDDHAM_SCHEME: TransliterationScheme = {
  id: 'siddham',
  label: '悉曇體 Siddham（漢傳密教音譯用）',
  vowels: { "अ": "𑖀", "आ": "𑖁", "इ": "𑖂", "ई": "𑖃", "उ": "𑖄", "ऊ": "𑖅", "ऋ": "𑖆", "ॠ": "𑖇", "ऌ": "𑖈", "ॡ": "𑖉", "ऎ": "𑖊", "ए": "𑖊", "ऐ": "𑖋", "ऒ": "𑖌", "ओ": "𑖌", "औ": "𑖍" },
  consonants: { "क": "𑖎", "ख": "𑖏", "ग": "𑖐", "घ": "𑖑", "ङ": "𑖒", "च": "𑖓", "छ": "𑖔", "ज": "𑖕", "झ": "𑖖", "ञ": "𑖗", "ट": "𑖘", "ठ": "𑖙", "ड": "𑖚", "ढ": "𑖛", "ण": "𑖜", "त": "𑖝", "थ": "𑖞", "द": "𑖟", "ध": "𑖠", "न": "𑖡", "प": "𑖢", "फ": "𑖣", "ब": "𑖤", "भ": "𑖥", "म": "𑖦", "य": "𑖧", "र": "𑖨", "ल": "𑖩", "व": "𑖪", "श": "𑖫", "ष": "𑖬", "स": "𑖭", "ह": "𑖮", "ळ": "𑖩𑗀", "क्ष": "𑖎𑖿𑖬", "ज्ञ": "𑖕𑖿𑖗" },
  vowelMarks: { "ा": "𑖯", "ि": "𑖰", "ी": "𑖱", "ु": "𑖲", "ू": "𑖳", "ृ": "𑖴", "ॄ": "𑖵", "ॢ": "𑖿𑖩𑖰", "ॣ": "𑖿𑖩𑖱", "ॆ": "𑖸", "े": "𑖸", "ै": "𑖹", "ॊ": "𑖺", "ो": "𑖺", "ौ": "𑖻", "ं": "𑖽", "ः": "𑖾", "ँ": "𑖼" },
  virama: { "्": "𑖿" },
  symbols: { "०": "0", "१": "1", "२": "2", "३": "3", "४": "4", "५": "5", "६": "6", "७": "7", "८": "8", "९": "9", "ॐ": "𑖌𑖼", "।": "𑗂", "॥": "𑗃" },
};


// ------------------------------------------------------------------ 轉寫引擎（SchemeMap 通用驅動）

/** 載入 SchemeMap 為「源文字→目標文字」平面映射（長鍵優先在運行時排序） */
function flattenScheme(scheme: TransliterationScheme): Record<string, string> {
  const flat: Record<string, string> = {};
  for (const [k, v] of Object.entries(scheme.vowels)) flat[k] = v;
  for (const [k, v] of Object.entries(scheme.consonants)) flat[k] = v;
  if (scheme.vowelMarks) for (const [k, v] of Object.entries(scheme.vowelMarks)) flat[k] = v;
  if (scheme.virama) for (const [k, v] of Object.entries(scheme.virama)) flat[k] = v;
  if (scheme.symbols) for (const [k, v] of Object.entries(scheme.symbols)) flat[k] = v;
  return flat;
}

/**
 * 通用 SchemeMap 轉寫：任一新語種＝一張映射表（data-driven，零邏輯改動）。
 * 適用於悉曇、佉盧文等「單向碼表」方案；貪婪最長鍵匹配，未命中原樣保留。
 */
export function transiterate(text: string, scheme: TransliterationScheme): string {
  const flat = flattenScheme(scheme);
  const keys = Object.keys(flat).sort((a, b) => b.length - a.length);
  let out = '';
  let i = 0;
  while (i < text.length) {
    let matched = false;
    for (const k of keys) {
      if (k && text.startsWith(k, i)) {
        out += flat[k];
        i += k.length;
        matched = true;
        break;
      }
    }
    if (!matched) {
      out += text[i];
      i++;
    }
  }
  return out;
}

/** 天城體 → 悉曇體（咒語音譯對照；buddhistMode 下可在詞條渲染旁路顯示） */
export function devanagariToSiddham(text: string): string {
  return transiterate(text, SIDDHAM_SCHEME);
}

/** 悉曇體 → 天城體（反向平面映射，供查詢輸入歸一） */
export function siddhamToDevanagari(text: string): string {
  const rev: Record<string, string> = {};
  for (const [k, v] of Object.entries(flattenScheme(SIDDHAM_SCHEME))) {
    if (v && !rev[v]) rev[v] = k; // 保留首個映射（長鍵生成的複合值不衝突短路）
  }
  const keys = Object.keys(rev).sort((a, b) => b.length - a.length);
  let out = '';
  let i = 0;
  while (i < text.length) {
    let matched = false;
    for (const k of keys) {
      if (text.startsWith(k, i)) {
        out += rev[k];
        i += k.length;
        matched = true;
        break;
      }
    }
    if (!matched) {
      out += text[i];
      i++;
    }
  }
  return out;
}

// ------------------------------------------------------------------ 四語系深化（梵/巴/藏對照與轉寫）

// 佛學資料經 buddhist-data.ts 容錯層惰性載入（缺資料 → 安全預設，不崩）
import { loadPaliSanskritMap, loadRanjanaMap } from './buddhist-data';
import { SLP1_IAST } from './data/iast-slp1';

/** 巴利詞 → 梵文對應（DPD 48,921 條；kamma→karman、dhamma→dharma）。查無返回 undefined */
export function paliToSanskrit(word: string): string | undefined {
  const m = loadPaliSanskritMap();
  return m[word.trim()] ?? m[word.trim().toLowerCase()];
}

/**
 * 蘭札體缺字碼還原（RJ-C943…）：→ 拉丁轉寫優先，其次 PUA 碼位顯示。
 * 漢譯密教咒語段的蘭札音譯字對照（CBETA 官方外字庫 2,240 條）。
 */
export function restoreRanjanaCodes(text: string, mode: 'roman' | 'pua' = 'roman'): string {
  return text.replace(/RJ-([0-9A-F]+)/g, (m, hex) => {
    const e = loadRanjanaMap()[`RJ-${hex}`];
    if (!e) return m;
    if (mode === 'roman' && e.romanized) return e.romanized;
    if (mode === 'pua' && e.pua) {
      const cp = parseInt(e.pua.slice(2), 16);
      return Number.isFinite(cp) ? String.fromCodePoint(cp) : m;
    }
    return m;
  });
}

/** SLP1 → IAST（Cologne 辭典生態編碼 → 學術標準轉寫，84 條長鍵優先） */
export function slp1ToIast(text: string): string {
  const keys = Object.keys(SLP1_IAST).sort((a, b) => b.length - a.length);
  let out = '';
  let i = 0;
  while (i < text.length) {
    let matched = false;
    for (const k of keys) {
      if (text.startsWith(k, i)) {
        out += SLP1_IAST[k];
        i += k.length;
        matched = true;
        break;
      }
    }
    if (!matched) {
      out += text[i];
      i++;
    }
  }
  return out;
}
