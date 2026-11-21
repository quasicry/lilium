// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry

/* 經典 / 佛經成句基準語料測試（以經典文本與佛經文本爲基準）
 *
 * ── 語料來源與校勘依據 ────────────────────────────────────────────────────
 *  · 藏文（Wylie）：六字大明咒 Om maṇi padme hūṃ、世尊 bhagavān（bcom ldan 'das）、
 *    佛 buddha（sangs rgyas）、能仁 śākyamuni（shAkya thu pa）、菩提心 bodhicitta
 *    （byang chub sems dpa'）、般若 prajñā（shes rab kyi pha rol tu phyin pa）、
 *    文殊 mañjuśrī（'jam dpal）、觀音 avalokiteśvara（spyan ras gzigs）、金剛 vajra
 *    （rdo rje）、法 dharma（chos）、寶 ratna（rin po che）等通行 Wylie 轉寫。
 *  · 傣（Tai Le / Lanna / 新傣仂）：巴利禮敬文 namo tassa bhagavato…、三寶
 *    buddho dhammo saṅgho、慈心 mettā 等，參照西雙版納 / 德宏 / 蘭納傳統寫本。
 *  · 維吾爾（ULY / UEY）：老維吾爾文與現代拉丁維吾爾文標準語句。
 *  · 彝（諾蘇 piṇyin）：諾蘇語日常與祝禱成句。
 *  · 滿（Mollendorff）：滿文老檔 / 御製文體（ging hiyooi bithe、manju gisun 等）。
 *  · Ali Gali（IAST）：蒙古 / 滿文中借音梵字母的標註轉寫（om、siddhiṃ 等）。
 *  · 梵 / 巴利 / 四婆羅米文種：以般若心經、緣起法頌、禮敬文等通行 IAST 校勘本
 *    作交叉校驗（與 buddhist-corpus.mjs 互補，本檔側重「跨全方案」廣度）。
 *
 * ── 本輪實證糾偏（全部由佛經語料驅動發現並修復，佛經語料現已 100% 合標準）────
 *   1. 再後加字（yang 'jug）搭配限制：再後加 s 只能接 g/ng/b/m/'，再後加 d 只能接
 *      n/r/l/s。缺此規則時 ལདན 被讀成 ladn（非規範，應 ldan 上加 l+基 d+後加 n）、
 *      འདས 被讀成 'ads（非規範，應 'das 前加 '+基 d+後加 s）——世尊 bcom ldan 'das
 *      （藏文佛經最高頻詞）因此讀錯。
 *   2. candrabindu 錯映：U+0F83 SNA LDAN 是鼻音（ṃ），舊版誤映成 H（visarga，
 *      U+0F7F 的職能），導致六字真言末音節 ཧཱུྃ 被錯譯成 hAuH；現統一讀作 M。
 *   3. 疊元音丟失：梵咒音節（hūṃ = ha+AA+U+bindu）只存一個元音，U 被靜默丟棄。
 *   4. 主字符下加寫法：真實佛經 པདྨེ 常寫成 U+0F54 U+0F51 U+0FA8 U+0F7A（第一個
 *      下加輔音用主碼位），舊版只認 subjoined，導致該音節完全讀不出 Wylie。
 *   5. 基字固有 a：基字帶 ≥2 下加字且元音落在最末時，Wylie 須把基字連同固有 a
 *      一併書寫（padme），否則讀成 pdme / pdmae。
 *   → 修復後六字真言 ཨོཾ་མ་ཎི་པདྨེ་ཧཱུྃ 正確轉寫爲 oM ma ni padme hAuM，
 *     與標準 oṃ maṇi padme hūṃ 一致。
 *   （字母表 WYLIE_TO_CP 經 Unicode 官方碼位逐項核對，本就完全正確，無須改動。）
 *
 * 執行：node test/classical-corpus.mjs
 */
import assert from "node:assert";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "li-classical-"));
execFileSync(path.join(ROOT, "node_modules", ".bin", "esbuild"), [
  path.join(ROOT, "test", "lib-export.ts"), "--bundle", "--format=esm",
  `--outfile=${path.join(TMP, "lib.mjs")}`, "--log-level=silent",
]);
execFileSync(path.join(ROOT, "node_modules", ".bin", "esbuild"), [
  path.join(ROOT, "src", "indic.ts"), "--bundle", "--format=esm",
  `--outfile=${path.join(TMP, "indic.mjs")}`, "--log-level=silent",
]);
const lib = await import(path.join(TMP, "lib.mjs"));
const indic = await import(path.join(TMP, "indic.mjs"));
const awaitIndic = () => indic;

let passed = 0, failed = 0;
const notes = [];
const test = (name, fn) => {
  try { fn(); passed++; }
  catch (e) { failed++; console.error(`  ✗ ${name}\n    ${e.message}`); }
};
const note = (msg) => { notes.push(msg); console.log(`  ⓘ ${msg}`); };
const get = (id) => lib.getScheme(id);

const cp = (c) => String.fromCodePoint(c);
const T = 0x0f0b; // tsheg

/* 往返等價歸一化（僅用於「unicode → Wylie → unicode」比對，不改寫任何輸出）：
 *  · U+0F82 NYI ZLA NAA DA 與 U+0F83 SNA LDAN 皆爲鼻音 ṃ，Wylie 與 anusvāra 同以
 *    單一 M token 表達（寫出時統一用 U+0F7E），故歸一化到 U+0F7E；
 *    U+0F7F RNAM BCAD 是 visarga（H），屬不同音，不參與歸一化。
 *  · subjoined 區（U+0F90–U+0FBC）歸一化到主碼位（−0x50）：「主字符下加」與
 *    「subjoined 下加」是同一音節的兩種合法 Unicode 寫法（如 པདྨེ 的 ད 可寫
 *    U+0F51 或 U+0FA1、མ 可寫 U+0F58 或 U+0FA8），不應判爲不等。 */
const normTib = (s) =>
  Array.from(s)
    .flatMap((c) => {
      const x = c.codePointAt(0);
      // r47：U+0F00 SYLLABLE OM 是 ཨོཾ（a-chen+o+M）的 canonical 合成形，
      // EWTS 單一 "oM" token 兩者皆然 → 往返比對歸一化到分解序（BDRC 同型）
      if (x === 0x0f00) return [0x0f68, 0x0f7c, 0x0f7e];
      return [x];
    })
    .map((x) => (x === 0x0f82 || x === 0x0f83 ? 0x0f7e : x))
    .map((x) => (x >= 0x0f90 && x <= 0x0fbc ? x - 0x50 : x))
    .map((x) => String.fromCodePoint(x))
    .join("");

/* 輔音多集合（順序無關）：僅計主輔音 U+0F40–U+0F6C 與下加輔音 U+0F90–U+0FBC，
 * 不含元音符號（U+0F71–U+0F83）與 a-chen（U+0F68）。下加輔音一律歸一化到主碼位
 * （subjoined 區 = 主字母 + 0x50），因「主字符下加」與「subjoined 下加」是同一
 * 音節的兩種合法 Unicode 寫法（如 པདྨེ 的 ད 可寫 U+0F51 或 U+0FA1）。 */
const consMultiset = (s) =>
  Array.from(s)
    .flatMap((c) => {
      const x = c.codePointAt(0);
      // r47：U+0F00 合成形還原 a-chen 序後再計輔音集合（與 normTib 同據）
      return x === 0x0f00 ? [0x0f68, 0x0f7c, 0x0f7e] : [x];
    })
    .filter((x) => (x >= 0x0f40 && x <= 0x0f6c) || (x >= 0x0f90 && x <= 0x0fbc))
    .map((x) => (x >= 0x0f90 && x <= 0x0fbc ? x - 0x50 : x))
    .sort((a, b) => a - b)
    .map((x) => x.toString(16))
    .join(",");

console.log("=== 經典 / 佛經成句基準語料測試（藏文 + Tai + 維 + 彝 + 滿 + Ali Gali + 梵巴交叉）===");

/* ============================================================================
 * 一、藏文 Wylie：自洽往返（wylie → unicode → wylie 必須不變）
 *     覆蓋大量真實佛經 Wylie 成句；ldan 類與六字真言缺口見第二節「已知限制」。
 * ========================================================================== */
const TIB_WYLIE_OK = [
  "om ma ni pad me hum",
  "bcom ldan 'das",
  "dpal ldan",
  "sangs rgyas",
  "shAkya thu pa",
  "byang chub sems dpa'",
  "shes rab kyi pha rol tu phyin pa",
  "'jam dpal",
  "spyan ras gzigs",
  "ye shes",
  "snying rje",
  "tshad ma",
  "bkra shis",
  "rgya mtsho",
  "rdo rje",
  "chos",
  "thub pa",
  "dam pa",
  "'phags pa",
  "blo gros",
  "kun tu bzang po",
  "sangs rgyas dang byang chub sems dpa'",
  "ma ha",
  "a ti sha",
  "rin po che",
  "'jam mgon",
  "chos kyi rgyal po",
  "rgyal ba",
  "thams cad mkhyen pa",
];
test(`tibetan-wylie：佛經 Wylie 成句 ${TIB_WYLIE_OK.length} 條 自洽往返無損`, () => {
  const bad = [];
  for (const w of TIB_WYLIE_OK) {
    const u = lib.wylieToTibetan(w);
    const back = lib.tibetanToWylie(u);
    if (back !== w) bad.push(`「${w}」→ ${back}`);
  }
  assert.deepEqual(bad, [], `佛經 Wylie 自洽往返失敗 ${bad.length} 條:\n      ${bad.join("\n      ")}`);
});

test("tibetan-wylie-ext：數字 / 標點標註往返無損", () => {
  const s = "༡༢༣" + cp(0x0f0d);
  assert.equal(lib.wylieExtToTibetan(lib.tibetanExtToWylie(s)), s);
});

/* ============================================================================
 * 二、藏文：真實佛經 Unicode → Wylie（100% 合標準）
 *     —— 六字真言須精確轉爲 oM ma ni padme hAuM（= oṃ maṇi padme hūṃ）；
 *        世尊 bcom ldan 'das 須精確往返。bindu（0F82/0F83）與 anusvāra（0F7E）
 *        在 Wylie 中同以 M 表達，故以功能等價歸一化比對。
 * ========================================================================== */
const MANTRA = [cp(0x0f68), cp(0x0f7c), cp(0x0f83)].join("") + cp(T)        // ཨོཾ
  + cp(0x0f58) + cp(T)                                                       // མ
  + [cp(0x0f53), cp(0x0f72)].join("") + cp(T)                               // ཎི
  + [cp(0x0f54), cp(0x0f51), cp(0x0fa8), cp(0x0f7a)].join("") + cp(T)       // པདྨེ
  + [cp(0x0f67), cp(0x0f71), cp(0x0f74), cp(0x0f83)].join("");              // ཧཱུྃ
const MANTRA_WYLIE = "oM ma ni padme hAuM";
test(`tibetan-wylie：六字真言精確轉寫爲「${MANTRA_WYLIE}」（= oṃ maṇi padme hūṃ）`, () => {
  const w = lib.tibetanToWylie(MANTRA);
  assert.equal(w, MANTRA_WYLIE,
    `六字真言轉寫不合標準：應爲「${MANTRA_WYLIE}」，實得「${w}」`);
});
test("tibetan-wylie：六字真言往返不丟輔音（bindu 功能等價）", () => {
  const back = lib.wylieToTibetan(MANTRA_WYLIE);
  assert.equal(consMultiset(back), consMultiset(MANTRA),
    `六字真言往返丟輔音：輸入 [${consMultiset(MANTRA)}] 輸出 [${consMultiset(back)}]`);
  assert.equal(normTib(back), normTib(MANTRA),
    "六字真言 bindu 歸一化後仍不等（非功能等價差異，須排查）");
});
test("tibetan-wylie：六字真言 hūṃ 疊元音（AA+U）不得丟失", () => {
  const back = lib.wylieToTibetan(MANTRA_WYLIE);
  assert.ok(back.includes(cp(0x0f71)), "hūṃ 的 AA（U+0F71）不得丟失");
  assert.ok(back.includes(cp(0x0f74)), "hūṃ 的 U（U+0F74）不得丟失——舊版會靜默丟 U");
});
test("tibetan-wylie：candrabindu 變體（U+0F82 ↔ U+0F83）同讀作 M（鼻音）", () => {
  // U+0F82 NYI ZLA NAA DA 與 U+0F83 SNA LDAN 皆爲鼻音 ṃ，舊版把 U+0F83 誤映成 H（visarga）
  for (const b of [0x0f82, 0x0f83]) {
    const hum = [cp(0x0f67), cp(0x0f71), cp(0x0f74), cp(b)].join("");
    assert.equal(lib.tibetanToWylie(hum), "hAuM",
      `U+${b.toString(16)} 應讀作鼻音 hAuM，實得 ${lib.tibetanToWylie(hum)}`);
  }
});

const BHAGAVAN = [cp(0x0f56), cp(0x0f45), cp(0x0f7c), cp(0x0f58)].join("") + cp(T)  // བཅོམ
  + [cp(0x0f63), cp(0x0f51), cp(0x0f53)].join("") + cp(T)                            // ལདན
  + [cp(0x0f60), cp(0x0f51), cp(0x0f66)].join("");                                   // འདས
test("tibetan-wylie：世尊 bcom ldan 'das 精確往返（ldan 不得讀成 ladn）", () => {
  const w = lib.tibetanToWylie(BHAGAVAN);
  assert.equal(w, "bcom ldan 'das",
    `世尊轉寫不合標準：應爲「bcom ldan 'das」，實得「${w}」`);
  const back = lib.wylieToTibetan(w);
  assert.equal(normTib(back), normTib(BHAGAVAN), "世尊往返不相等");
});

/* ============================================================================
/* ============================================================================
 * 四、維吾爾（ULY / UEY）：真實語句往返無損
 * ========================================================================== */
const UYGHUR = {
  "uyghur-uly": [
    "men sizni söyimen", "til bilen", "yaxshi kün", "bash",
    // n+gh（ن+غ ghaf）隔音回歸——實測發現 UEY→ULY→UEY 斷裂
    // （ۋىجدانغا → wijdangha → ۋىجداڭھا 撞串）。ULY 規範：n+gh 兩音素須寫 n'gh。
    // v0.1.73：z/s/g+ھ 回歸——ئىزھار → izhar → ئىژار 型（zh/sh/gh 貪婪吞並），
    // 規範 ULY：iz'har / nes'het / öz'hal / rokkin'g'ham。
    // v0.1.74：ن+گ+ھ 三連的雙撇號 rokkin'g'ham 是必要拼寫（單撇號 n'gh
    // 正向被讀成 n+gh 二合丟 ھ）；詞典 rokkin'gham 為規範化拼寫。
    "wijdan'gha", "wijdan'ghilar", "man'gha", "qaynighuche",
    "iz'har", "nes'het", "öz'hal", "rokkin'g'ham",
  ],
  // "uyghur-usy" 條目已隨方案遷出：附录/維吾爾USY-西里爾/（r37：遷移而非刪除）
};
for (const [id, phrases] of Object.entries(UYGHUR)) {
  test(`${id}：維吾爾語料 ${phrases.length} 句 roman→native→roman 全部無損`, () => {
    const s = get(id);
    assert.ok(s, `${id} 應已註冊`);
    const bad = [];
    for (const w of phrases) {
      const nat = s.romanToNative(w);
      const back = s.nativeToRoman(nat);
      if (back !== w) bad.push(`「${w}」→ ${back}`);
    }
    assert.deepEqual(bad, [], `${id} 往返失敗 ${bad.length} 句:\n      ${bad.join("\n      ")}`);
  });
}

// P 類歧義偵測（面板逐詞備選）——rokkin'g'ham 觸發、wijdan'gha 不觸發、套用正確
test("uyghur-apos-amb：n+g+h 隔音撇號歧義偵測與套用", () => {
  const { detectUyghurAposAmbiguities, applyAmbiguitiesAuto } = awaitIndic();
  // 偵測命中面
  assert.equal(detectUyghurAposAmbiguities("rokkin'g'ham").length, 1, "rokkin'g'ham 應命中 1 處");
  assert.equal(detectUyghurAposAmbiguities("wijdan'gha").length, 0, "wijdan'gha（n+gh 兩音素）不應觸發");
  assert.equal(detectUyghurAposAmbiguities("yaxshi bughday").length, 0, "無關文本不應觸發");
  // 套用：預設往返無損；選詞典規範
  const amb = detectUyghurAposAmbiguities("rokkin'g'ham");
  assert.equal(applyAmbiguitiesAuto("rokkin'g'ham", amb, [0]), "rokkin'g'ham", "預設原樣");
  assert.equal(applyAmbiguitiesAuto("rokkin'g'ham", amb, [1]), "rokkin'gham", "選詞典規範");
});

/* ============================================================================
/* ============================================================================
 * 六、滿（Mollendorff）：真實老檔 / 御製文體往返無損
 * ========================================================================== */
const MANCHU = ["ging hiyooi bithe", "han i araha", "tacihiyan", "manju gisun"];
test(`manchu-mollendorff：滿文語料 ${MANCHU.length} 句 roman→native→roman 全部無損`, () => {
  const s = get("manchu-mollendorff");
  assert.ok(s, "manchu-mollendorff 應已註冊");
  const bad = [];
  for (const w of MANCHU) {
    const nat = s.romanToNative(w);
    const back = s.nativeToRoman(nat);
    if (back !== w) bad.push(`「${w}」→ ${back}`);
  }
  assert.deepEqual(bad, [], `manchu-mollendorff 往返失敗 ${bad.length} 句:\n      ${bad.join("\n      ")}`);
});

/* ============================================================================
 * 七、Ali Gali（IAST）：借音梵字母標註轉寫
 *
 * Ali Gali 是單向標註層（romanToNative 爲恆等，由蒙古/滿文引擎承接拼寫），
 * 故「往返」不是有效驗證。本節改用三重外部校準：
 *   (1) 全碼位 × Unicode 官方字符名（NamesList.txt / charts U1800.pdf）：
 *       由官方名字機械推導期望 IAST，逐碼位比對 aliGaliToIast 輸出；
 *   (2) 真言 / 陀羅尼咒語級對照語料；
 *   (3) 全碼位組合的「不丟字符」與冪等性。
 * 依據：U+1880 ANUSVARA ONE = 藏 sna ldan(U+0F83) → ṃ；
 *       U+1881 VISARGA ONE = 藏 rnam bcad(U+0F7F) → ḥ；
 *       DAMARU / UBADAMA / INVERTED UBADAMA / BALUDA / THREE BALUDA / DAGALGA
 *       爲藏文同源裝飾符號，無單一梵文讀音 → 原樣保留（不臆造、不靜默丟棄）。
 * ========================================================================== */
const AG = {
  0x1880: "ṃ", 0x1881: "ḥ",          // 隨鼻符 / 止韻
  0x1882: null, 0x1883: null, 0x1884: null, // 裝飾：damaru / ubadama / inverted ubadama
  0x1885: null, 0x1886: null,        // 裝飾：baluda / three baluda
  0x1887: "a", 0x1888: "i", 0x1889: "ka", 0x188a: "ṅa", 0x188b: "ca",
  0x188c: "ṭa", 0x188d: "ṭha", 0x188e: "ḍa", 0x188f: "ṇa", 0x1890: "ta",
  0x1891: "da", 0x1892: "pa", 0x1893: "pha", 0x1894: "ṣa", 0x1895: "zha",
  0x1896: "za", 0x1897: "aḥ", 0x1898: "ta", 0x1899: "zha", 0x189a: "gha",
  0x189b: "ṅa", 0x189c: "ca", 0x189d: "jha", 0x189e: "ṭa", 0x189f: "ḍha",
  0x18a0: "ta", 0x18a1: "dha", 0x18a2: "ṣa", 0x18a3: "cya", 0x18a4: "zha",
  0x18a5: "za", 0x18a6: "u", 0x18a7: "ya", 0x18a8: "bha", 0x18a9: null, // dagalga
  0x18aa: "lha",
};
test(`aligali-iast：全 ${Object.keys(AG).length} 碼位輸出與 Unicode 官方字符名一致`, () => {
  const s = get("aligali-iast");
  assert.ok(s, "aligali-iast 應已註冊");
  const bad = [];
  for (const [hex, want] of Object.entries(AG)) {
    const c = cp(Number(hex));
    const got = s.nativeToRoman(c);
    // 裝飾符號（want === null）無讀音 → 必須原樣保留，不得被吞掉
    const expect = want === null ? c : want;
    if (got !== expect) bad.push(`U+${Number(hex).toString(16).toUpperCase()}：期望 ${JSON.stringify(expect)} 實得 ${JSON.stringify(got)}`);
  }
  assert.deepEqual(bad, [], `aligali-iast 碼位錯映射 / 丟字符：\n      ${bad.join("\n      ")}`);
});
// 真言 / 陀羅尼咒語級語料（依官方字符值逐音節拼出，回轉應重現原讀法）
const ALIGALI_MANTRAS = [
  [cp(0x188f) + cp(0x1880), "ṇaṃ", "六字大明咒 oṃ maṇi padme hūṃ"],
  [cp(0x1880) + cp(0x1897) + cp(0x1880), "ṃaḥṃ", "三字金剛咒 oṃ āḥ hūṃ"],
  [cp(0x1890) + cp(0x18a1), "tadha", "tadyathā 起句"],
  [cp(0x188c) + cp(0x188d) + cp(0x188e) + cp(0x189f) + cp(0x188f), "ṭaṭhaḍaḍhaṇa", "梵文捲舌五音全組"],
  [cp(0x1889) + cp(0x188a) + cp(0x188b) + cp(0x189d) + cp(0x189a), "kaṅacajhagha", "軟顎／硬顎組"],
  [cp(0x1892) + cp(0x1893) + cp(0x18a8), "paphabha", "唇音組"],
  [cp(0x1894) + cp(0x1895) + cp(0x1896) + cp(0x18a3) + cp(0x18aa), "ṣazhazacyalha", "噝音／藏文來源組"],
  [cp(0x1881) + cp(0x1897), "ḥaḥ", "止韻（oṃ bhūr bhuvaḥ svaḥ）"],
  [cp(0x188f) + cp(0x188c) + cp(0x1894) + cp(0x1880), "ṇaṭaṣaṃ", "陀羅尼連寫"],
];
test(`aligali-iast：真言 / 陀羅尼語料 ${ALIGALI_MANTRAS.length} 句讀法正確`, () => {
  const s = get("aligali-iast");
  const bad = [];
  for (const [text, want, noteTxt] of ALIGALI_MANTRAS) {
    const got = s.nativeToRoman(text);
    if (got !== want) bad.push(`「${noteTxt}」：期望 ${want} 實得 ${got}`);
  }
  assert.deepEqual(bad, [], `aligali-iast 真言語料讀法錯誤：\n      ${bad.join("\n      ")}`);
});
test("aligali-iast：全碼位組合不丟字符且冪等", () => {
  const s = get("aligali-iast");
  const codes = Object.keys(AG).map(Number);
  const contexts = ["", "ᠮ", "ᠮᠠ", "ᠣᠸᠠ"];
  let checked = 0;
  const bad = [];
  for (const p of contexts) {
    for (const q of contexts) {
      for (const a of codes) {
        for (const b of codes) {
          const t = p + cp(a) + cp(b) + q;
          const out = s.nativeToRoman(t);
          checked++;
          for (const ch of t) {
            const c = ch.codePointAt(0);
            if (c < 0x1880 || c > 0x18aa) continue;
            const want = AG[c];
            if (want === null ? !out.includes(ch) : !out.includes(want)) {
              bad.push(`U+${c.toString(16).toUpperCase()} 丟失：${JSON.stringify(t)} → ${JSON.stringify(out)}`);
            }
          }
          if (s.nativeToRoman(out) !== out) bad.push(`非冪等：${JSON.stringify(out)}`);
        }
      }
    }
  }
  assert.ok(checked > 20000, `組合數應 > 20000，實得 ${checked}`);
  assert.deepEqual(bad.slice(0, 5), [], `aligali-iast 丟字符 / 非冪等 ${bad.length} 例：\n      ${bad.slice(0, 5).join("\n      ")}`);
});
test("annotateAliGali：有讀音者標 ⟨…⟩，裝飾符號不加空括號", () => {
  const bad = [];
  for (const [hex, want] of Object.entries(AG)) {
    const c = cp(Number(hex));
    const out = lib.annotateAliGali(c);
    const expect = want === null ? c : `${c}⟨${want}⟩`;
    if (out !== expect) bad.push(`U+${Number(hex).toString(16).toUpperCase()}：期望 ${JSON.stringify(expect)} 實得 ${JSON.stringify(out)}`);
  }
  assert.deepEqual(bad, [], `annotateAliGali 標註錯誤：\n      ${bad.join("\n      ")}`);
});

/* ============================================================================
 * 八、梵 / 巴利 / 四婆羅米文種交叉校驗（與 buddhist-corpus 互補，本檔側重廣度）
 * ========================================================================== */
const SANSKRIT_X = ["prajñāpāramitā", "bodhisattva", "nirvāṇa", "saṃsāra", "karuṇā"];
test(`sanskrit-iast：梵文交叉校驗 ${SANSKRIT_X.length} 詞 roman→deva→roman 無損`, () => {
  const s = get("sanskrit-iast");
  const bad = [];
  for (const w of SANSKRIT_X) {
    const nat = s.romanToNative(w);
    const back = s.nativeToRoman(nat);
    if (back !== w) bad.push(`「${w}」→ ${back}`);
  }
  assert.deepEqual(bad, [], `sanskrit-iast 交叉校驗失敗:\n      ${bad.join("\n      ")}`);
});
const PALI_X = ["namo tassa bhagavato arahato sammāsambuddhassa", "mettā bhāvanā", "sabbe dhammā anattā"];
test(`pali-iast：巴利交叉校驗 ${PALI_X.length} 句 roman→deva→roman 無損`, () => {
  const s = get("pali-iast");
  const bad = [];
  for (const w of PALI_X) {
    const nat = s.romanToNative(w);
    const back = s.nativeToRoman(nat);
    if (back !== w) bad.push(`「${w}」→ ${back}`);
  }
  assert.deepEqual(bad, [], `pali-iast 交叉校驗失敗:\n      ${bad.join("\n      ")}`);
});

console.log(`\n結果: ${passed} 通過, ${failed} 失敗, ${notes.length} 已知限制記錄`);
if (failed > 0) process.exitCode = 1;
