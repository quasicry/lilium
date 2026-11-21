// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry
/**
 * lilium 辭典 — Buddhist external resource links.
 *
 * 外部資源鏈接表的 UI 落實：
 * 佛學模式下，查詢詞自動追加「該語種 → 推薦權威資源」深鏈。
 * 「外部資源鏈接表 data 內建」的一部分。
 */
import type { ExternalSourceLink } from './externals';

interface BuddhistResource {
  label: string;
  url: (term: string) => string;
  icon: string;
  /** 適配的查詢詞形態 */
  match: (term: string) => boolean;
  hint: string;
}

/** 巴利語拉丁詞（含純 ASCII 常見詞）：拉丁字母 ≥3 即視為可能的巴利查詢 */
const LATIN_WORD = /^[a-zA-ZāīūṅñṭḍṇḷṃĀĪŪṄÑṬḌṆḶṂ]{3,}$/;
/** 天城體（梵/巴天城體輸入） */
const DEVANAGARI = /[\u0900-\u097F]/;
/** 藏文 */
const TIBETAN = /[\u0F00-\u0FFF]/;
/** 漢文（佛典常用；默認對漢字查詞提供佛學資源） */
const HAN = /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/;

/**
 * 權威佛學資源（全部為免費開放平台）。
 * SuttaCentral：漢巴梵藏吐火羅平行對照；
 * CBETA Online：漢文大藏經全文；84000：藏傳佛典英譯；SAT：大正在線檢索。
 */
const RESOURCES: BuddhistResource[] = [
  {
    label: '🪷 CBETA',
    url: (t) => `https://cbetaonline.dila.edu.tw/search?q=${encodeURIComponent(t)}`,
    icon: 'book-open',
    match: (t) => HAN.test(t),
    hint: '漢文大藏經全文檢索',
  },
  {
    label: 'SAT 大正藏',
    url: (t) => `https://21dzk.l.u-tokyo.ac.jp/SAT2018/master.php?mode=3&key=${encodeURIComponent(t)}`,
    icon: 'library',
    match: (t) => HAN.test(t),
    hint: '東京大學大正藏數據庫',
  },
  {
    label: 'SuttaCentral',
    url: (t) => `https://suttacentral.net/search?query=${encodeURIComponent(t)}`,
    icon: 'compass',
    match: (t) => LATIN_WORD.test(t) || DEVANAGARI.test(t) || HAN.test(t),
    hint: '巴利/梵/漢/藏平行對照',
  },
  {
    label: '84000',
    // 原寫死空查詢（q=${''}）；84000 官方閱讀室的真實深鏈格式為
    // /search.html?s=（第三方學術出版物引用的正式格式），帶查詢詞直達結果。
    url: (t) => `https://read.84000.co/search.html?s=${encodeURIComponent(t)}`,
    icon: 'mountain',
    match: (t) => TIBETAN.test(t),
    hint: '藏傳佛典英譯（甘珠爾/丹珠爾）',
  },
  {
    label: 'DSBC',
    url: (t) => `https://www.dsbcproject.org/search/node/${encodeURIComponent(t)}`,
    icon: 'library',
    match: (t) => LATIN_WORD.test(t) || DEVANAGARI.test(t),
    hint: '數字梵文佛典（Digital Sanskrit Buddhist Canon）',
  },
  {
    label: 'GRETIL',
    // 原只跳 GRETIL 目錄首頁（官方自述無站內 URL 查詢搜索）。
    // 改鏈 GRETIL 全文搜索介面（社區版，搜索框首屏可見）；即使 SPA 不讀
    // query 參數，用戶落地即見搜索框，體驗遠優於目錄頁。
    url: (t) => `https://claudius-teodorescu.gitlab.io/gretil-corpus-site/?query=${encodeURIComponent(t)}`,
    icon: 'scroll',
    match: (t) => DEVANAGARI.test(t) || /[āīūṅñṭḍṇḷṃĀĪŪṄÑṬḌṆḶṂ]/.test(t),
    hint: '梵語佛教文獻全文搜索（GRETIL）',
  },
];

/**
 * 佛學模式下的外部資源鏈接：在通用詞典鏈接之後追加佛學權威資源。
 * 僅當查詢詞符合對應文字/轉寫形態時出現，避免無關干擾。
 */
export function buildBuddhistAwareLinks(term: string, baseLinks: ExternalSourceLink[]): ExternalSourceLink[] {
  const links: ExternalSourceLink[] = [...baseLinks];
  const t = term.trim();
  if (!t) return links;
  for (const r of RESOURCES) {
    if (r.match(t) && !links.some((l) => l.label === r.label)) {
      links.push({ label: r.label, url: r.url(t), icon: r.icon });
    }
  }
  return links;
}
