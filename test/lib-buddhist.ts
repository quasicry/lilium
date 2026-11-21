// 測試專用導出：佛學資料存取 + 關鍵函式。
// 藏文詞條／詞根（tibetanLemmaOf/looksLikeTibetan/loadTibetanLemmas）
// 已剝離遷出 → 附录/藏文詞條-tibetan-lexicon/（原 test/tibetan-lemmas.mjs 同步遷出）。
// CBETA 三表（buddhist-chars）已剝離遷出 → 附录/佛學資料-cbeta-gaiji/——
// loadCbVariantMap 保留導出但回空表（穩定降級），還原/歸一斷言走降級語義。
export { restoreCbCodes, normalizeBuddhistChinese } from "../src/dict/buddhist";
export { loadCbVariantMap } from "../src/dict/buddhist-data";
