// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry

/* 梵文轉寫語料生成器（共享模組）。
 *
 * 供 `sanskrit-cross-corpus.mjs`（傾倒 JSON 給 Python sanscript 交叉比對）與
 * `sanskrit-cross-reference.mjs`（加載黃金參考做節點內斷言）共用，避免語料漂移。
 *
 * 語料構成（覆蓋邊界）：獨立元音 / 輔音 / 輔音×matra / 輔音×尾符號 /
 * 二合字 / 三合字 / 輔音+matra+尾符號 / 叢集+尾符號 / 擴展字母（ळ ड़ ढ़ ऱ ऩ ऴ क़）/
 * avagraha / 真實偈頌 / 詞典風多音節詞。
 * 可表達性過濾：僅收「方案 nativeToRoman 完全羅馬化（無天城體殘碼）」者。
 */
const cp = (n) => String.fromCodePoint(n);
const isDeva = (s) => [...s].some((ch) => { const c = ch.codePointAt(0) ?? 0; return c >= 0x0900 && c <= 0x097f; });
const norm = (s) => s.normalize("NFC");

/** 方案 id → sanscript 方案名（權威參考映射） */
export const SS_SCHEME = {
  "sanskrit-iast": "iast",
  "sanskrit-iso15919": "iso",
  "sanskrit-hk": "hk",
  "sanskrit-itrans": "itrans",
  "sanskrit-velthuis": "velthuis",
  "sanskrit-wx": "wx",
  "sanskrit-kolkata": "kolkata_v2",
  "sanskrit-slp1": "slp1",
};

const VOWELS = [0x0905,0x0906,0x0907,0x0908,0x0909,0x090a,0x090b,0x090c,0x090d,0x090e,0x090f,0x0910,0x0913,0x0914,0x0960,0x0961];
const CONS = []; for (let c = 0x0915; c <= 0x0939; c++) CONS.push(c);
const MATRAS = [0x093e,0x093f,0x0940,0x0941,0x0942,0x0943,0x0944,0x0947,0x0948,0x094b,0x094c,0x0962,0x0963];
const SIGNS = [0x0902, 0x0903, 0x0901];
const VIRAMA = 0x094d;
const AVAGRAHA = 0x093d;
const EXT = [0x0933 /*ळ*/, 0x095c /*ड़*/, 0x095d /*ढ़*/, 0x0931 /*ऱ*/, 0x0929 /*ऩ*/, 0x0934 /*ऴ*/, 0x0958 /*क़*/];

const VERSES = [
  "तत्सवितुर्वरेण्यं भर्गो देवस्य धीमहि धियो यो नः प्रचोदयात्",
  "कर्मण्येवाधिकारस्ते मा फलेषु कदाचन मा कर्मफलहेतुर्भूर्मा ते सङ्गोऽस्त्वकर्मणि",
  "नासतो विद्यते भावो नाभावो विद्यते सतः",
  "सर्वधर्मान्परित्यज्य मामेकं शरणं व्रज",
  "अहिंसा सत्यमस्तेयं शौचं इन्द्रियनिग्रहः",
  "ॐ भूर्भुवः स्वः तत्सवितुर्वरेण्यं",
  "संस्कृतं वेदाः पुराणानि रामायणं महाभारतं",
  "यो मां पश्यति सर्वत्र सर्वं च मयि पश्यति",
  "बुद्धं शरणं गच्छामि धम्मं शरणं गच्छामि संघं शरणं गच्छामि",
  "सब्बे सत्ता भवन्तु सुखितत्ता",
  "तेऽपि बुद्धा भगवन्तो",
  "किं नाम ते कथयिष्यामि",
];
const WORDS = [
  "कर्म","धर्म","संस्कृत","वेदान्त","योग","बोधि","निर्वाण","संसार","करुणा","प्रज्ञा",
  "गन्धर्व","चन्द्र","इन्द्र","कृष्ण","राम","लक्ष्मण","हनुमन्त्","भगवन्त्","अर्हन्त्","बुद्ध",
  "धम्म","कम्म","सङ्घ","अरहन्त्","पच्चय","विपस्सना","मेत्ता","करुणा","पञ्ञा","निब्बान",
  "अथ","तथागत","सुगत","लोकनाथ","सर्वज्ञ","विश्व","प्रकृति","संख्या","गणित","व्याकरण",
  "क्षत्रिय","ब्राह्मण","वैश्य","शूद्र","आर्य","अनार्य","स्वर","व्यञ्जन","नाद","विसर्ग",
  "शान्तिः","सान्तिः","अहिंसा","सत्य","अस्तेय","ब्रह्मचर्य","अपरिग्रह",
  "त्र्यम्बक","षण्मुख","सप्तर्षि","अष्टाङ्ग","नवग्रह","द्वादश",
  "गङ्गा","यमुना","सरस्वती","कावेरी","नर्मदा","गोदावरी",
  "अग्नि","वायु","आकाश","पृथिवी","आप","तेज","जल","वायु",
];

export function representable(scheme, s) {
  return !isDeva(scheme.nativeToRoman(s));
}

export function buildCorpus(scheme) {
  const out = new Set();
  const add = (s) => { s = norm(s); if (representable(scheme, s)) out.add(s); };
  for (const v of VOWELS) add(cp(v));
  for (const c of CONS) add(cp(c));
  for (const c of CONS) for (const m of MATRAS) add(cp(c) + cp(m));
  for (const c of CONS) for (const sg of SIGNS) add(cp(c) + cp(sg));
  for (const c of CONS) for (const m of MATRAS) for (const sg of SIGNS) add(cp(c) + cp(m) + cp(sg));
  for (const c1 of CONS) for (const c2 of CONS) add(cp(c1) + cp(VIRAMA) + cp(c2));
  for (const c1 of CONS) for (const c2 of CONS) for (const sg of SIGNS) add(cp(c1) + cp(VIRAMA) + cp(c2) + cp(sg));
  for (const c1 of CONS) for (const mid of [0x0930, 0x0935, 0x092f]) for (const c2 of CONS)
    add(cp(c1) + cp(VIRAMA) + cp(mid) + cp(VIRAMA) + cp(c2));
  for (const e of EXT) {
    add(cp(e));
    for (const m of [0x0940, 0x0942, 0x0946]) add(cp(e) + cp(m));
    for (const sg of SIGNS) add(cp(e) + cp(sg));
    for (const c of CONS) add(cp(e) + cp(VIRAMA) + cp(c));
  }
  for (const c of [0x0915, 0x0924, 0x092f]) for (const v of [0x0905, 0x0906, 0x090f, 0x0910])
    add(cp(c) + cp(AVAGRAHA) + cp(v));
  for (const v0 of VERSES) { const v = norm(v0); if (representable(scheme, v)) out.add(v); }
  for (const w0 of WORDS) { const w = norm(w0); if (representable(scheme, w)) out.add(w); }
  return [...out];
}
