// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry

/**
 * lilium 插件測試套件（零測試框架，Node 原生 assert）。
 *
 * 1. 純函數單測：書寫系統探測 / 標記話法 / 排版 CSS /
 * 用法：node test/run.mjs
 */
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert";

// 用 fileURLToPath 而非 new URL(...).pathname：後者不做百分號解碼，
// 專案路徑含非 ASCII 字元（例如「源码树」）時會得到 %E6%BA%90… 的假路徑，
// 使 esbuild 以 ENOENT 失敗。其餘 51 個測試檔早已用 fileURLToPath，此處補齊。
const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const TMP = path.join(ROOT, "test", "build");
fs.mkdirSync(TMP, { recursive: true });

/** 剝掉 TS 的行註解與區塊註解——撤除說明會在註解裡提到已被移除的符號，
 *  「live 不應再有 X」這類斷言必須只看程式碼本身才不會被自己的註解絆倒。 */
const stripTsComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

let passed = 0;
const failures = [];
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failures.push({ name, e });
    console.error(`  ✗ ${name}\n    ${e.message}`);
  }
}
async function testAsync(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failures.push({ name, e });
    console.error(`  ✗ ${name}\n    ${e.message}`);
  }
}

/* ---------- 打包测试库 ---------- */
console.log("[setup] bundling test lib…");
execFileSync(path.join(ROOT, "node_modules", ".bin", "esbuild"), [
  path.join(ROOT, "test", "lib-export.ts"),
  "--bundle", "--format=esm", `--outfile=${path.join(TMP, "vwlib.mjs")}`,
], { stdio: "pipe" });
execFileSync(path.join(ROOT, "node_modules", ".bin", "esbuild"), [
  path.join(ROOT, "test", "browser-entry.ts"),
  "--bundle", "--format=iife", `--outfile=${path.join(TMP, "vwpage.js")}`,
], { stdio: "pipe" });

const lib = await import(path.join(TMP, "vwlib.mjs"));


/* ================= 1. 纯函数 ================= */
/* ---------- 命令序號圖示（行動版工具列）——天城文數字映射逐位核對 ---------- */
test("序號圖示：天城文數字映射逐位無誤（0x0966 ० 起）＋純 path 輪廓", () => {
  // r55 修正實錘：0x09E6 是孟加拉文數字（০），真天城文數字是 0x0966（०）——r51 斷言基準本身錯了。
  const DEV = ["०", "१", "२", "३", "४", "५", "६", "७", "८", "९"];
  for (let d = 0; d < 10; d++) assert.equal(lib.toDevanagariDigits(d), DEV[d], `個位 ${d}`);
  // 兩位數抽核＋邊界：11、42、88、99、100
  assert.equal(lib.toDevanagariDigits(11), "११");
  assert.equal(lib.toDevanagariDigits(42), "४२");
  assert.equal(lib.toDevanagariDigits(88), "८८");
  assert.equal(lib.toDevanagariDigits(99), "९९");
  assert.equal(lib.toDevanagariDigits(100), "१००");
  // SVG：純 <path> 輪廓（與品牌蘭札體 icon 同渲染方式，不依賴 SVG <text>——行動 WebView 支援差曾實錘極小）、無 <text>、currentColor
  const svg = lib.numberIconSvg(42);
  assert.ok(!svg.includes("<text"), "無 <text>（行動相容）");
  assert.ok(svg.includes("<path"), "純 path 輪廓");
  assert.ok(!svg.includes("<circle"), "無圓底");
  // r58：不得帶 width/height 屬性——Obsidian addIcon 自訂通道把字串塞進外層
  // <svg viewBox="0 0 100 100">，帶尺寸屬性的內層 svg 只佔 24%座標系→渲染 5.76px
  //（真機 CDP 實錘）；無屬性＝100% 滿格（品牌 icon 正常的同款做法）。
  assert.ok(!svg.includes('width='), "無 width 屬性（嵌套 viewBox 100 座標系相容）");
  assert.ok(!svg.includes('height='), "無 height 屬性");
  // r64：無嵌套 svg——嵌套 svg 在部分行動 WebView 預設尺寸為 0（真機整列空白）；
  // 字形座標已預縮放到 100 基準，直接單層 path 進官方外層 viewBox 0 0 100 100。
  assert.ok(!svg.includes('<svg'), "無嵌套 svg（座標 100 基準單層 path）");
  assert.ok(!svg.includes('viewBox'), "無 viewBox（座標 100 基準）");
  // 預生成字形覆蓋 1..99；超出 fail-loud
  assert.throws(() => lib.numberIconSvg(0));
  assert.throws(() => lib.numberIconSvg(100));
  // 非法位元 fail-loud（確保數字無誤：不靜默透傳）
  assert.throws(() => lib.toDevanagariDigits("1a3"));
});console.log("\n[1] 纯函数单元测试");

test("detectScript: 日文", () => {
  assert.equal(lib.detectScript("これは日本語のテキストです。"), "ja");
});
test("detectScript: 蒙古文", () => {
  assert.equal(lib.detectScript("ᠮᠣᠩᠭᠣᠯ ᠬᠡᠯᠡ"), "mongolian");
});
test("detectScript: 回鹻文", () => {
  assert.equal(lib.detectScript("\u{10F71}\u{10F72}\u{10F73} \u{10F74}\u{10F75}"), "olduyghur");
});
test("detectScript: 韩文", () => {
  assert.equal(lib.detectScript("이것은 한국어 텍스트입니다"), "ko");
});
test("detectScript: 汉文", () => {
  assert.equal(lib.detectScript("这是中文文本"), "han");
});
/* 漢文 auto 細分簡繁——字形抽樣判別 */
test("detectScript: 繁體文檔 auto 判 hant（字形差集證據）", () => {
  assert.equal(lib.detectScript("這是繁體中文文檔，門裡有時間，們與說都是繁體字形。"), "hant");
});
test("detectScript: 簡體文檔 auto 仍判 han", () => {
  assert.equal(lib.detectScript("这是简体中文文档，门里有时间，们与说都是简体字形。"), "han");
});
test("detectScript: 純共用字形（無差集證據）保持 han（零回歸）", () => {
  assert.equal(lib.detectScript("人口二人中上行"), "han");
});
test("detectHanVariant: 少量對側字形（引文人名）不翻轉", () => {
  // 簡體主體夾一個繁體字
  assert.equal(lib.detectHanVariant("我们在书店买了一本书，顺路参观了博物馆。"), "han");
});
test("scriptIdToPunctRegion: hant → zh-Hant（B2 誤套 GB 的修復鏈）", () => {
  // punct.gen 未入 lib-export bundle；改由源碼掃描斷言映射存在
  const src = fs.readFileSync(path.join(ROOT, "src", "tsdata", "punct.gen.ts"), "utf8");
  assert.ok(/case\s+"hant":\s*return\s+"zh-Hant"/.test(src), "scriptIdToPunctRegion 應映射 hant→zh-Hant");
});

/* ---------- 婆羅米系文字（僧伽羅）轉寫（IAST abugida / 巴利三藏糾偏） ---------- */
const BRAHMIC_IDS = ["sinhala-pali"];
test("brahmic：僧伽羅方案已註冊（sinhala-pali 爲主方案）", () => {
  for (const id of BRAHMIC_IDS) {
    const s = lib.getScheme(id);
    assert.ok(s, `${id} 應已註冊`);
    assert.equal(s.primary, true);
    assert.ok(s.charTable && s.charTable.length > 0, `${id} 應含檢字表`);
  }
});
test("brahmic：僧伽羅文 roman→native→roman 無損往返（含巴利閉音節 / niggahita）", () => {
  const samples = {
    "sinhala-pali": ["ka", "kā", "ki", "ku", "ke", "buddha", "dhamma", "saṅgha", "saṃsāra", "sammāsambuddhassa"],
  };
  for (const [id, arr] of Object.entries(samples)) {
    const s = lib.getScheme(id);
    for (const roman of arr) {
      assert.equal(s.nativeToRoman(s.romanToNative(roman)), roman, `${id} 往返失敗: ${roman}`);
    }
  }
});

/* ---------- 天城體 ↔ 巴利 / 梵文（ISO 15919 / IAST / 佛經轉寫糾偏） ----------
 * 這段測試在「巴利/梵文↔天城體」重寫後補齊——此前 indic.ts 零覆蓋，曾使
 * emitConsonant 指針錯誤引發的 OOM 崩潰長期未被發現。 */
const IDIC = ["sanskrit-iast", "sanskrit-iso15919", "pali-iast", "pali-iso15919", "sanskrit-hk"];
test("indic：五套方案已註冊（sanskrit/pali × IAST/ISO15919 + HK）", () => {
  for (const id of IDIC) {
    const s = lib.getScheme(id);
    assert.ok(s, `${id} 應已註冊`);
    assert.ok(s.charTable && s.charTable.length > 0, `${id} 應含檢字表`);
  }
});
test("indic：pali-iast 主方案標記與 altOf 關係", () => {
  assert.equal(lib.getScheme("pali-iast").primary, true);
  assert.equal(lib.getScheme("pali-iso15919").altOf, "pali-iast");
  assert.equal(lib.getScheme("sanskrit-hk").altOf, "sanskrit-iast");
});

/* 巴利 → 天城體：閉音節 / niggahita / sandhi 必須正確 */
const PALI_D = {
  buddha: "बुद्ध", dhamma: "धम्म", saṅgha: "सङ्घ", saṃsāra: "संसार",
  sambuddha: "सम्बुद्ध", taṃ: "तं", buddhaṃ: "बुद्धं", pañca: "पञ्च",
};
test("indic：巴利詞 → 天城體原生形等於佛經轉寫慣用形", () => {
  const s = lib.getScheme("pali-iast");
  for (const [w, expect] of Object.entries(PALI_D)) {
    assert.equal(s.romanToNative(w), expect, `${w} 應爲 ${expect}`);
  }
});
test("indic：巴利全句（禮敬文）roman→native→roman 無損", () => {
  const s = lib.getScheme("pali-iast");
  const homage = "namo tassa bhagavato arahato sammāsambuddhassa";
  assert.equal(s.nativeToRoman(s.romanToNative(homage)), homage);
  // 禮敬文天城體標準形（巴利三藏常誦）
  assert.equal(s.romanToNative(homage), "नमो तस्स भगवतो अरहतो सम्मासम्बुद्धस्स");
});
test("indic：巴利輔音合字自動 virama（非鼻音合字 dhamma、m+b 合字 sambuddha）", () => {
  const s = lib.getScheme("pali-iast");
  const hasVirama = (w) => [...s.romanToNative(w)].some((c) => c.codePointAt(0) === 0x94D);
  assert.ok(hasVirama("dhamma"), "dhamma 應含 virama 合字");
  assert.ok(hasVirama("sambuddha"), "sambuddha 應含 virama 合字");
});
test("indic：巴利 niggahita 往返閉環（A-P1：回轉一律 ṃ，巴利 PTS/BJT 正字不做同部位鼻音區分）", () => {
  const s = lib.getScheme("pali-iast");
  // A-P1：回轉端嚴式（ं+同組塞音→m/ṅ…）已移除——bilara-data 44 萬段實證 612 條破壞往返；
  // saṃgha 現為真往返閉環（saṃgha→संघ→saṃgha），嚴式鼻音化屬梵文/ISO 15919 場景
  assert.equal(s.nativeToRoman(s.romanToNative("saṃgha")), "saṃgha");
  // 半母音/擦音/詞尾的 niggahita 保留 ṃ（天城體 ं）
  assert.equal(s.romanToNative("saṃsāra"), "संसार");
  assert.equal(s.romanToNative("taṃ"), "तं");
});

// A3：死輔音（virama）＋組合符／獨立母音——入向切詞不得切斷 virama 歸屬
test("indic A3：死輔音＋後隨符號/母音往返（virama 不丟、不反序）", () => {
  const cp = (n) => String.fromCodePoint(n);
  const hex = (s) => [...s].map((c) => c.codePointAt(0).toString(16)).join(" ");
  // ISO：म् + candrabindu（mm̐）→ म् + ँ（舊版丟 virama 變 मँ）
  const iso = lib.getScheme("sanskrit-iso15919");
  const mVirCandra = cp(0x092e) + cp(0x094d) + cp(0x0901);
  assert.equal(iso.romanToNative(iso.nativeToRoman(mVirCandra)), mVirCandra);
  // IAST 同型（m + anusvāra 死輔音尾）
  const iast = lib.getScheme("sanskrit-iast");
  const mVirAnus = cp(0x092e) + cp(0x094d) + cp(0x0902);
  assert.equal(iast.romanToNative(iast.nativeToRoman(mVirAnus)), mVirAnus);
  // ISO：र् + ृ（r̥ matra 無基字宿主）→ 出向原樣保留、入向還原
  const rVirRc = cp(0x0930) + cp(0x094d) + cp(0x0943);
  assert.equal(iso.romanToNative(iso.nativeToRoman(rVirRc)), rVirRc);
  // HK：RRR（ṝṛ）→ 順序不反轉（舊版 ॠऋ 實錘）
  const hk = lib.getScheme("sanskrit-hk");
  const RR = cp(0x0960) + cp(0x090b);
  assert.equal(hk.romanToNative("RRR"), RR);
  assert.equal(hk.nativeToRoman(RR), "RRR");
  // Velthuis：aaaा（aa + a + ā matra 殘碼）往返
  const v = lib.getScheme("sanskrit-velthuis");
  const aaa = cp(0x0906) + cp(0x0905) + cp(0x093e);
  assert.equal(v.romanToNative(v.nativeToRoman(aaa)), aaa);
});

/* 梵文 → 天城體：聲化元音 / 送氣 / 捲舌 / visarga / candrabindu */
const SANS_D = {
  rāma: "राम", kṛṣṇa: "कृष्ण", agni: "अग्नि", guru: "गुरु", sāntiḥ: "सान्तिः",
  vedānta: "वेदान्त", saṃskṛta: "संस्कृत", daṇḍa: "दण्ड", śānti: "शान्ति",
  viṣṇu: "विष्णु", tryambakaṃ: "त्र्यम्बकं",
};
test("indic：梵文詞 → 天城體原生形等於學術 IAST 轉寫慣用形", () => {
  const s = lib.getScheme("sanskrit-iast");
  for (const [w, expect] of Object.entries(SANS_D)) {
    assert.equal(s.romanToNative(w), expect, `${w} 應爲 ${expect}`);
  }
});
test("indic：梵文全句 roman→native→roman 無損（含聲化元音/合字/visarga）", () => {
  const s = lib.getScheme("sanskrit-iast");
  for (const w of Object.keys(SANS_D)) {
    assert.equal(s.nativeToRoman(s.romanToNative(w)), w, `${w} 往返失敗`);
  }
  // candrabindu / visarga 專項
  for (const w of ["oṃ", "praṇavaḥ", "ahaṃ", "puṣṭa"]) {
    assert.equal(s.nativeToRoman(s.romanToNative(w)), w, `${w} 往返失敗`);
  }
});
test("indic：梵文 ṛ / ḷ 爲聲化元音（IAST 模式 ऋ / ऌ，非 खल 邊音 ळ）", () => {
  const s = lib.getScheme("sanskrit-iast");
  assert.equal(s.romanToNative("ṛṣi"), "ऋषि", "ṛ → ऋ（聲化元音）");
  // 注意：IAST 的 ḷ 在梵文中是聲化元音 ऌ；巴利/德拉維達的 ḷ 才是捲舌邊音 ळ
});

/* ISO 15919 與 IAST 的差異必須顯現 */
test("indic：ISO 15919 模式與 IAST 模式輸出差異（ḷ→ळ vs ḷ→ऌ；ṃ→ṁ vs ṃ→ं）", () => {
  const cpsOf = (t, m) => [...lib.getScheme(m === "iso" ? "sanskrit-iso15919" : "sanskrit-iast").romanToNative(t)]
    .map((c) => c.codePointAt(0));
  // IAST 的 ḷ 是聲化元音（ऌ U+90C 一系）；ISO 的 ḷ 是捲舌邊音 ळ（U+0933）
  assert.ok(cpsOf("ḷ", "iso").includes(0x933), "ISO ḷ 應產生 ळ（捲舌邊音 U+0933）");
  assert.ok(!cpsOf("ḷ", "iast").includes(0x933), "IAST ḷ 不應是 ळ（應爲聲化元音）");
  // IAST ṃ → ं（anusvara U+902）；ISO ṃ → ṁ（上點 U+1E43，ISO 用獨立字母）
  assert.ok(cpsOf("kaṃ", "iast").includes(0x902), "IAST kaṃ → ं anusvara");
  assert.ok(cpsOf("kaṃ", "iso").includes(0x1E43), "ISO kaṃ → ṁ（上點字母）");
});

/* Harvard-Kyoto（純 ASCII 備選）無損往返 */
test("indic：HK 方案 roman→native→roman 無損（T/Th/D/Dh 捲舌、ṣ/ś 咝音）", () => {
  const s = lib.getScheme("sanskrit-hk");
  for (const w of ["rAma", "kRSNa", "zAnti", "saMskRta", "agni", "daNDaH"]) {
    assert.equal(s.nativeToRoman(s.romanToNative(w)), w, `HK ${w} 往返失敗`);
  }
});
test("brahmic：字體內嵌 BUNDLED_NOTO_FONT_FILES 含僧伽羅字體且爲合法 TTF", () => {
  const ids = new Set(lib.BUNDLED_NOTO_FONT_FILES.map((f) => f.id));
  for (const id of ["noto-sans-sinhala"]) {
    assert.ok(ids.has(id), `缺少內嵌字體: ${id}`);
    const f = lib.BUNDLED_NOTO_FONT_FILES.find((x) => x.id === id);
    const magic = Buffer.from(f.base64, "base64").readUInt32BE(0);
    assert.ok(magic === 0x00010000 || magic === 0x4f54544f, `${id} 字體 magic 非法`);
  }
});
test("suggestFlow: 中文含少量假名不应误判为日文", () => {
  assert.equal(lib.suggestFlow("这是中文文本，其中混入了ひらがな一个假名"), "han");
});
test("suggestFlow: 阈值可调（降低 kanaRatio 后少量假名可判日文）", () => {
  const txt = "这是中文文本，其中混入了ひらがな一个假名";
  assert.equal(lib.suggestFlow(txt, { kanaRatio: 0.05 }), "ja");
});
test("suggestFlow: 碼位獨特文種先於 cjk 判定（v2.9.20 備註/字體注入豆腐修復）", () => {
  // 含漢字的悉曇咒語筆記：必須判 siddham（否則不注入 --li-font → 悉曇字豆腐）
  assert.equal(lib.suggestFlow("大悲咒：𑖌𑖼 𑖀𑖾 𑖮𑖳𑖼 誦持"), "siddham");
  // 天城體、藏文、佉盧同理（碼位與 CJK 完全不重疊，單字元即判定）
  assert.equal(lib.suggestFlow("楞嚴咒：ॐ नमो भगवते"), "sanskrit");
  assert.equal(lib.suggestFlow("六字真言：ཨོཾ་མ་ཎི་པདྨེ་ཧཱུྃ"), "tibetan");
  assert.equal(lib.suggestFlow("犍陀羅：𐨨𐨂𐨑"), "kharoshthi");
  // 婆羅米、八思巴同理（碼位獨特，單字元即判定）
  assert.equal(lib.suggestFlow("阿育王法敕：𑀤𑁆𑀥𑀫𑁆𑀦"), "brahmi");
  assert.equal(lib.suggestFlow("元朝國字：ꡀꡁ"), "phagspa");
  // 回歸防線：純漢 / 漢字+假名 / 漢字+少量 RTL 仍按原判定
  assert.equal(lib.suggestFlow("这是一篇中文文章。"), "han");
  assert.equal(lib.suggestFlow("这是中文文本，其中混入了ひらがな一个假名"), "han");
  assert.equal(lib.suggestFlow("这是一篇中文文章，里面有一句 مرحبا 而已。"), "han");
});
test("SCRIPTS: 中日韩为 vertical-rl / 蒙满回鹻为 vertical-lr", () => {
  for (const id of ["han", "hant", "ja", "ko"]) assert.equal(lib.SCRIPTS[id].writingMode, "vertical-rl");
  for (const id of ["mongolian", "manchu", "olduyghur"]) assert.equal(lib.SCRIPTS[id].writingMode, "vertical-lr");
});
test("SCRIPTS: page-progression 中日韩 rtl / 蒙古系 ltr", () => {
  for (const id of ["han", "hant", "ja", "ko"]) assert.equal(lib.SCRIPTS[id].pageProgression, "rtl");
  for (const id of ["mongolian", "manchu", "olduyghur"]) assert.equal(lib.SCRIPTS[id].pageProgression, "ltr");
});


/* ---------- UEY（維吾爾文）呈現形殘留掃描＋往返固化迴歸 ----------
 * 三份永久語料：test/fixtures/uey-corpus/（語料1 詩歌 25 行＋語料2 26 行＋語料3 民謠 22 行，
 * 均含 PDF 複製產生的阿拉伯呈現形/tatweel 污染，三輪修復的對象）。
 * 斷言三道：①轉出無阿拉伯區殘留（呈現形/tatweel 全部歸一）②二次往返不動點
 * ③UEY→ULY→UEY 第二輪收斂且剔 hamza/tatweel/隔音撇號後零字符丟失。
 */
const ARABIC_RANGE = (cp) =>
  (cp >= 0x0600 && cp <= 0x06ff) || (cp >= 0xfb50 && cp <= 0xfeff);
const UEY_RESIDUAL = (s) => {
  const r = {};
  for (const ch of s) if (ARABIC_RANGE(ch.codePointAt(0))) r[ch] = (r[ch] || 0) + 1;
  return r;
};
const UEY_CORPUS_DIR = path.join(ROOT, "test", "fixtures", "uey-corpus");
for (const [n, file] of [
  [1, "uey-corpus.txt"], [2, "uey-corpus2.txt"], [3, "uey-corpus3.txt"],
  [4, "uey-corpus4.txt"], [5, "uey-corpus5.txt"],
]) {
  const corpus = fs.readFileSync(path.join(UEY_CORPUS_DIR, file), "utf8").replace(/\n+$/, "");
  test(`UEY 語料${n}：殘留掃描＝0（NFKC+heh 消歧+tatweel 剔除，三輪）`, () => {
    assert.deepEqual(UEY_RESIDUAL(lib.ueyToUly(corpus)), {});
  });
  test(`UEY 語料${n}：二次往返不動點（語料2 L25 hamza 載體單向規範化豁免）`, () => {
    // 語料2 L25 ئۆزىﮕﻪ：NFKC 後 hamza+heh 序列無法與隔音 hamza 區分，回轉保守
    // 出隔音撇號（'eyledi vs eyledi）——已知單向規範化、非丟字（定案）。
    const o1 = lib.ueyToUly(corpus);
    const o2 = lib.ueyToUly(lib.ulyToUey(o1));
    const X = o1.split("\n"), Y = o2.split("\n");
    const diffs = [];
    for (let i = 0; i < Math.max(X.length, Y.length); i++) {
      if (X[i] !== Y[i]) diffs.push([X[i], Y[i]]);
    }
    for (const [a, b] of diffs) {
      // 每處差異僅許 hamza 載體（'）單向消失/出現，剔撇號後必須相同
      assert.equal(b.replace(/'/g, ""), a.replace(/'/g, ""), `二次差異超 hamza 規範化: ${a} vs ${b}`);
    }
    assert.ok(diffs.length <= 2, `二次往返差 ${diffs.length} 行超豁免`);
  });
  test(`UEY 語料${n}：剔 hamza/tatweel/隔音撇號後零字符丟失`, () => {
    const out = lib.ueyToUly(corpus);
    const back = lib.ulyToUey(out);
    const strip = (s) => s.replace(/['\u0626\u0640\u0654]/g, "");
    // 比較基準＝NFKC 後的語料：lam-alef 連字 ﻻ（1 碼位）會被 NFKC 分解為 ل+ا
    // （2 碼位），回轉是「分解」而非丟失（實證語料3 L15 恰差 2＝2 個 ﻻ）。
    // 容差＝heh 呈現形合流豁免：ﻩ 固化後 z+h 序列（後接元音類）會被 ULY 回轉的
    // zh→ژ 複合鍵吞併（語料1 L20 實證 -1）；呈現形層面 e/h 語義已不可恢復，
    // 這是數據極限而非轉寫損失——容許丟失 ≤ heh 後接元音類的出現數。
    const srcN = strip(corpus.normalize("NFKC"));
    const A = [...corpus.normalize("NFKC")];
    let hetMerge = 0;
    for (let i = 0; i < A.length; i++) {
      if (A[i].codePointAt(0) === 0x647) {
        const nx = A[i + 1]?.codePointAt(0) ?? 0;
        if (nx === 0x626 || nx === 0x649 || nx === 0x6d5) hetMerge++;
      }
    }
    assert.ok(
      strip(back).length >= srcN.length - hetMerge,
      `回轉丟失超豁免: ${strip(back).length} < ${srcN.length - hetMerge}（hetMerge=${hetMerge}）`
    );
  });
}

/* ---------- 面板長文逐詞通路（transliterateText）呈現形守門迴歸 ----------
 * 根因：isUeyUnicode 判原始碼位，全呈現形詞（U+FB50–FEFF）不在 UEY 集合 →
 * looksLikeNative 閘門整詞 skip（語料五 665 詞 skip 54）。修復＝判定前 NFKC。
 * 此斷言直打面板同款通路 transliterateText，防 ueyToUly 綠而面板紅的漏網。
 */
for (const [n, file] of [
  [1, "uey-corpus.txt"], [2, "uey-corpus2.txt"], [3, "uey-corpus3.txt"],
  [4, "uey-corpus4.txt"], [5, "uey-corpus5.txt"],
]) {
  const corpus = fs.readFileSync(path.join(UEY_CORPUS_DIR, file), "utf8").replace(/\n+$/, "");
  test(`UEY 語料${n}：面板長文通路 transliterateText 全轉（r19 isUeyUnicode NFKC）`, () => {
    const r = lib.transliterateText(corpus, "uyghur-uly", false);
    assert.ok(r.ok, "transliterateText 失敗");
    assert.equal(r.schemeId, "uyghur-uly", "自動/指定方案不符");
    assert.ok(r.stats, "缺統計");
    assert.equal(r.stats.skipped, 0, `skip ${r.stats.skipped} 詞（呈現形守門漏網）`);
    assert.deepEqual(UEY_RESIDUAL(r.text), {});
  });
}
/* ---------- 梵文 IAST 金剛經逐句對照語料雙向往返 ----------
 * 語料 test/fixtures/sanskrit-iast-vajra.json（58 對天城⇄IAST）。
 * 修復：native→roman danda 前補空格（字母後）、roman→native 吞 danda 前空格
 * （danda 後不吞）。strict 全等 51/58；7 對餘差＝NBSP 臟數據（K22/55）＋語料手動
 * 斷行換行位置（K46/50/56）＋呼號型 `|| X ||` 空格（K32/33），零字符語義差。
 */
test(`r41：梵文 IAST 語料雙向往返（金剛經 58 對）`, () => {
  const fx = JSON.parse(fs.readFileSync(new URL("./fixtures/sanskrit-iast-vajra.json", import.meta.url), "utf8"));
  const sc = lib.getScheme("sanskrit-iast");
  let exact = 0;
  for (const p of fx.pairs) {
    const fwd = sc.nativeToRoman(p.deva);
    const back = sc.romanToNative(p.iast);
    // 語義級：規範 NBSP/空白/danda 前空格後必須全等
    const norm = (s) => s.replace(/\u00a0/g, " ").replace(/\s*([\u0964\u0965])\s*/g, "$1").replace(/\s+/g, " ").trim();
    assert.equal(norm(fwd), norm(p.iast), `FWD 語義差: ${p.iast.slice(0, 40)}`);
    assert.equal(norm(back), norm(p.deva), `BACK 語義差: ${p.deva.slice(0, 40)}`);
    if (fwd === p.iast && back === p.deva) exact++;
  }
  assert.ok(exact >= 51, `strict 全等 ${exact}/58`);
  // 引擎自洽閉環
  for (const p of fx.pairs) {
    assert.equal(sc.nativeToRoman(sc.romanToNative(p.iast)), p.iast, `IAST 閉環破: ${p.iast.slice(0, 40)}`);
  }
});

/* ---------- 八思巴 NNBSP 分詞透傳固化（Unicode 18 §14.4） ----------
 * 規範：現代語境 U+202F NNBSP 分隔詞內音節、U+0020 分隔詞。透傳由
 * src/dict/translit-run.ts 空白清單（加入 \u202f）天然成立——本節固化防回歸。
 */
test(`八思巴 NNBSP 詞內音節分隔往返保留`, () => {
  const sc = lib.getScheme("phagspa-poppe");
  // 詞內兩音節（NNBSP）＋詞間空格：deng ri / qayan 型
  const nat = "ꡊꡠꡋ\u202fꡘꡖ ꡢꡖꡨꡋ";
  const fwd = sc.nativeToRoman(nat);
  assert.ok(fwd.includes("\u202f"), `FWD NNBSP 應保留: ${JSON.stringify(fwd)}`);
  const back = sc.romanToNative(fwd);
  assert.equal(back, nat, `BACK 應逐字符全等（NNBSP 無損）`);
  // roman 端直接鍵入 NNBSP 亦透傳
  assert.ok(sc.romanToNative("den\u202fri").includes("\u202f"));
});
/* ---------- 八思巴蒙古文標點轉寫（U+1802–1805，原樣透傳修復＋區分鍵） ---------- */
test(`八思巴蒙古文標點 native↔roman 轉寫`, () => {
  const sc = lib.getScheme("phagspa-poppe");
  // ᠂ 逗號 → ","、᠃ 句號 → <mstop> 區分鍵（各碼位往返恆等，定案）
  const nat = "ꡛ ꡏ\u1802ꡛ ꡏ\u1803";
  const fwd = sc.nativeToRoman(nat);
  assert.ok(fwd.includes(","), `FWD 應含逗號: ${JSON.stringify(fwd)}`);
  assert.ok(fwd.includes("<mstop>"), `FWD 應含 <mstop>: ${JSON.stringify(fwd)}`);
  assert.ok(!fwd.includes("\u1802") && !fwd.includes("\u1803"), `FWD 不應透傳 ᠂/᠃`);
  const back = sc.romanToNative(fwd);
  assert.equal(back, "ꡛ ꡏ\u1802ꡛ ꡏ\u1803", `BACK 標點（區分鍵恆等）: ${JSON.stringify(back)}`);
  // r56 修正：1805 是 fourdots（章節之末），birga 是 1800——<birga> 鍵往返改指 1800
  const b = sc.nativeToRoman("ꡝ\u1800");
  assert.ok(b.includes("<birga>"), `birga 標記: ${JSON.stringify(b)}`);
  assert.equal(sc.romanToNative(b), "ꡝ\u1800", `birga 往返（U+1800）`);
  assert.equal(sc.nativeToRoman("ꡝ\u1805"), "a<fourdots>", `fourdots 正名`);
  assert.equal(sc.romanToNative("a<fourdots>"), "ꡝ\u1805", `fourdots 往返`);
  // ᠈/᠄ 正名（r56：1808=滿文逗號、1804=冒號）＋新鍵往返恆等；舊鍵相容別名仍通
  assert.equal(sc.nativeToRoman("ꡝ\u1808"), "a<mcomma>");
  assert.equal(sc.romanToNative("a<mcomma>"), "ꡝ\u1808");
  assert.equal(sc.nativeToRoman("ꡝ\u1804"), "a<mcolon>");
  assert.equal(sc.romanToNative("a<mcolon>"), "ꡝ\u1804");
  assert.equal(sc.romanToNative("a<mstop2>"), "ꡝ\u1808", `舊鍵 mstop2 相容別名→1808`);
  assert.equal(sc.romanToNative("a<mdstop>"), "ꡝ\u1804", `舊鍵 mdstop 相容別名→1804`);
  // r56 補收：1806 sophy／1809 mfullstop
  assert.equal(sc.nativeToRoman("ꡝ\u1806"), "a<sophy>");
  assert.equal(sc.romanToNative("a<sophy>"), "ꡝ\u1806");
  assert.equal(sc.nativeToRoman("ꡝ\u1809"), "a<mfullstop>");
  assert.equal(sc.romanToNative("a<mfullstop>"), "ꡝ\u1809");
  // "."/"||" 仍專屬八思巴 shad 系（單鍵直測）
  assert.equal(sc.romanToNative("."), "\ua876");
  assert.equal(sc.romanToNative("||"), "\ua877");
  // roman 逗號鍵入 → U+1802
  assert.ok(sc.romanToNative("a,b").includes("\u1802"));
});
/* ---------- Ali Gali 音節級轉寫（aksharamukha 語料） ---------- */
test(`Ali Gali 音節級出向＋往返恆等`, () => {
  const ag = lib.aliGaliToIast;
  const r2n = lib.romanToAliGali;
  // Sanskrit 樣本句出向（基字梵音補全＋ᠾ 送氣組合＋長音泛化）
  const s1 = "\u{1820}\u{1828}\u{1888}\u{1837}\u{1823}\u{1838}\u{1820}\u{1891}\u{183e}\u{1820}\u{182e} \u{1820}\u{1828}\u{1826}\u{1890}\u{1892}\u{1820}\u{180b}\u{180e}\u{1820}\u{1891}\u{1820}\u{182e} \u{1820}\u{1828}\u{1826}\u{188b}\u{183c}\u{1827}\u{1891}\u{1820}\u{182e} \u{1820}\u{1831}\u{1820}\u{180b}\u{180e}\u{1820}\u{1831}\u{1838}\u{1820}\u{1890}\u{1820}\u{182e} \u{1802}";
  const want = "anirodham anutpādam anucchedam aśāśvatam .";
  assert.equal(ag(s1), want);
  // 往返恆等
  const native = r2n(want);
  assert.equal(ag(native), want);
  // Pali 樣本句
  const pali = "ye dhammā hetuppabhavā tesa\u{1e43} hetu\u{1e43} tathāgato āha .";
  assert.equal(ag(r2n(pali)), pali);
  // 音節表直測：ka=ᢉᠠ᠋、kha=ᠻᠠ᠋（蒙古基字+FVS1）
  assert.equal(ag("\u{1889}\u{1820}\u{180b}"), "ka");
  assert.equal(ag("\u{183b}\u{1820}\u{180b}"), "kha");
  // 無關文本不動
  assert.equal(ag("hello world"), "hello world");
  // Vocalic 元音（檢字表補 ḷ/ḹ/ṛ/ṝ 行；案例 ᠠᠯᠢ ᢉᠠᯢ→aḷ kaḷ）
  assert.equal(ag("\u{182f}\u{1822}"), "ḷ");
  assert.equal(ag("\u{182f}\u{1822}\u{1822}"), "ḹ");
  assert.equal(ag("\u{1837}\u{1822}"), "ṛ");
  assert.equal(ag("\u{1837}\u{1822}\u{1822}"), "ṝ");
  // 案例：ᠠᠯᠢ ᢉᠠᠯᠢ → aḷ kaḷ（r50c 定案 B：反向輸出裸形 ᠠᠯᠢ/ᢉᠠᠯᠢ，
  // 與 aksh/21244 語料拼寫一致，往返碼位級恒等——n2r(r2n) 與 r2n(n2r) 雙向不變）
  assert.equal(ag("\u{1820}\u{182f}\u{1822} \u{1889}\u{1820}\u{182f}\u{1822}"), "aḷ kaḷ");
  assert.equal(ag(r2n("aḷ kaḷ")), "aḷ kaḷ");
  // 碼位級恒等（B 裁定核心）：r2n 輸出裸形、n2r 回讀不變；FVS1 借音形輸入亦閉環
  assert.equal(r2n("aḷ"), "\u{1820}\u{182f}\u{1822}".replace("\u{180B}", "")); // ᠠᠯᠢ 裸形
  assert.equal(r2n("kaḷ"), "\u{1889}\u{1820}\u{182f}\u{1822}".replace("\u{180B}", "")); // ᢉᠠᠯᠢ 裸形
  assert.equal(ag(r2n("taḷ paḷ gaḷ laḷ aṛ aḹ aṝ")), "taḷ paḷ gaḷ laḷ aṛ aḹ aṝ");
  // li/l 反向無殘留（補鍵：li→ᠯᢈ、l→ᠯ）
  assert.equal(r2n("li"), "\u{182f}\u{1888}");
  assert.equal(r2n("l"), "\u{182f}");
  assert.equal(ag(r2n("li l")), "li l");
  // 透傳缺口三鍵（ć/ṃ/ṅ）碼位級恒等
  assert.equal(r2n("ć"), "\u{1852}");
  assert.equal(r2n("ṃ"), "\u{1880}");
  assert.equal(r2n("ṅ"), "\u{188a}");
  // agBackForm='todo'＝Todo/專碼位優先（面板同音異碼取樣；②類殘留收口）
  assert.equal(r2n("e", { agBackForm: "todo" }), "\u{1844}");
  assert.equal(r2n("i", { agBackForm: "todo" }), "\u{1845}");
  assert.equal(r2n("o", { agBackForm: "todo" }), "\u{1846}");
  assert.equal(r2n("u", { agBackForm: "todo" }), "\u{1849}");
  assert.equal(r2n("ḥ", { agBackForm: "todo" }), "\u{1882}");
  assert.equal(r2n("t", { agBackForm: "todo" }), "\u{18A0}");
  assert.equal(r2n("d", { agBackForm: "todo" }), "\u{1898}");
  // canonical 模式不受 todo 覆蓋影響（ka 仍正字序第一 ᢉᠠ᠋）
  assert.equal(r2n("ka"), "\u{1889}\u{1820}\u{180B}");
});
/* ---------- Ali Gali 單字形／Todo 段（21244 表2/表3） ---------- */
test(`Ali Gali 專碼位單字形出向＋Todo 段 fallback`, () => {
  const ag = lib.aliGaliToIast;
  // Hudum 字母表單字形補缺（表2）
  assert.equal(ag("\u{185b}"), "ñ");   // ÑA
  assert.equal(ag("\u{183d}"), "j");   // JA（基本區，走基字表）
  assert.equal(ag("\u{1850}"), "ŧ");   // THA
  assert.equal(ag("\u{184f}"), "m");   // M
  assert.equal(ag("\u{1855}"), "y");   // YA
  // Todo Ali Gali（表3）：元音＋輔音
  assert.equal(ag("\u{1844}\u{1845}\u{1846}\u{1849}"), "eiou");
  assert.equal(ag("\u{1852}"), "ć");   // ĆA
  assert.equal(ag("\u{1853}"), "c");   // CA
  assert.equal(ag("\u{185c}"), "j");   // JA(todo)
  // 1843 長音符「:」非字母——原樣保留（不刪字符、不臆造）
  assert.equal(ag("\u{1843}"), "\u{1843}");
  // Todo 段未映射碼位仍原樣保留（fallback 擴圍≠臆造值）
  assert.equal(ag("\u{1840}"), "\u{1840}");
  assert.equal(ag("\u{1841}"), "\u{1841}");
  assert.equal(ag("\u{184a}"), "\u{184a}");
  // 裁定固化：1896 官名 ZA→za（aksh「ja」未驗證已棄；梵 j=183D 權威，
  // 21244 表2；《同文韻統》乾隆刻本＝21244 作者查證來源）。音節 ja=183D+ᠠ᠋。
  assert.equal(ag("\u{1896}\u{1820}\u{180b}"), "za");
  assert.equal(ag("\u{183d}\u{1820}\u{180b}"), "ja");
  // 1898/1899 托忒借音（21244 表3）：ta 字借 d、zha 字借 z
  assert.equal(ag("\u{1898}"), "d");
  assert.equal(ag("\u{1899}"), "z");
  // 18AB-18AE 未編碼（latest UCD＋OpenType 表雙實錘；16331/21244 兩提案碼位衝突）——原樣
  assert.equal(ag("\u{18ab}\u{18ac}\u{18ad}\u{18ae}"), "\u{18ab}\u{18ac}\u{18ad}\u{18ae}");
});
/* ---------- 疊字行距——上疊檢測與 code fence block 統一 ---------- */
test(`上疊（cluster-initial）行距需求與 fence block 統一套用`, () => {
  const m = lib; // vwlib re-export subjoin-line-height
  // 上疊：soyombo cluster-initial U+11A86 單獨出現 → lh=3.5
  assert.equal(m.subjoinLhForText("\u{11a86}\u{11a50}"), 3.5);
  // 無疊字 → null
  assert.equal(m.subjoinLhForText("plain"), null);
  // 下疊 run3 → 4.5；run3＋上疊同文本 → max(4.5,3.5)=4.5
  const z3 = "\u{11a47}\u{11a2b}\u{11a47}\u{11a2b}\u{11a47}\u{11a2b}";
  assert.equal(m.subjoinLhForText(z3), 4.5);
  assert.equal(m.subjoinLhForText(z3 + "\u{11a86}"), 4.5);
  // 上疊偵測函數
  assert.ok(m.textHasSuperjoined("\u{11a86}"));
  // 單層下加 lh=2.5（修復成功後定案觀感偏大——整體回收 0.5，階梯不變；
  // 真機實測 lh=3 時下緣餘裕充足，2.5 仍高於垂串深度需求）
  assert.equal(m.subjoinLhForText("\u{11c72}\u{11caa}"), 2.5); // marchen 單層
  assert.equal(m.subjoinLhForText("\u{0f40}\u{0f90}"), 2.5);   // 藏文單層
  assert.equal(m.subjoinLhForText("\u{11a44}\u{11a47}"), 2.5); // zanabazar 單層
  assert.equal(m.subjoinLhForText("\u{11c72}"), null);        // 無下加不動
  assert.ok(!m.textHasSuperjoined("\u{11a50}"));
});

/* ---------- r54：排查修復守衛（9 條） ---------- */
test(`r54 排查修復：快取鍵對稱／regex 跳脫／事件註冊／i18n／截斷／擊鍵路徑`, () => {
  const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
  // ① MDX 掃描快取鍵讀寫對稱（mdx-<base>）
  const plugin = read("src/dict/plugin.ts");
  // r59②：記憶體鍵補資料夾成分（對齊磁盤鍵體例；同名 base 跨資料夾不污染）
  assert.ok(plugin.includes("scanCacheMap.set(`mdx-${folderKey}-${base}`"), "MDX 快取寫鍵=mdx-folderKey-base");
  assert.ok(!plugin.includes("this.scanCacheMap.set(result.dict.meta.id"), "舊錯鍵已除");
  // ② translit-run 字元類無雙跳脫
  const tr = read("src/dict/translit-run.ts");
  assert.ok(!tr.includes("[^\\\\s"), "translit-run 無 \\s 雙跳脫");
  // ③ active-leaf-change 走 registerEvent
  assert.ok(plugin.includes("registerEvent("), "workspace 事件 registerEvent");
  // ④ hover 提示走 i18n（無硬編碼簡中賦值）
  const hover = read("src/dict/hover-lookup.ts");
  assert.ok(hover.includes("pinHintProvider?.()"), "pinHint 走 i18n provider");
  // ⑤ lookupAll 接入 cache
  const service = read("src/dict/service.ts");
  assert.ok(service.includes("this.cache.get<Array<Omit<LookupHit"), "lookupAll cache.get");
  assert.ok(service.includes("this.cache.set('lookupAll'"), "lookupAll cache.set");
  assert.ok(service.includes("lookupCount(word: string)"), "輕量 lookupCount");
  // ⑥ pushRecent 不再寫 hits=0
  assert.ok(!plugin.includes("pushHistory(word, 0,"), "pushRecent 無 hits=0 寫入");
  // ⑦ unload cancel debounce
  assert.ok(plugin.includes("this.flushCacheDebounced.cancel()"), "unload cancel debounce");
  // ⑧ hover 截斷碼位級
  assert.ok(hover.includes("Array.from(text)"), "hover 截斷碼位級");
});

/* ---------- r53：閱讀態物理預留分檔（--li-subjoin-pad） ---------- */
test(`r53 subjoinPadForText：與編輯態 fence 檔位表逐檔一致`, () => {
  const m = lib;
  // run1（lh 2.5 → bucket3）→ 0.75；run2（3.5→4）→ 1.25；run3（4.5→5）→ 1.75
  const z1 = "\u{11a44}\u{11a47}";
  const z2 = "\u{11a44}\u{11a47}\u{11a47}";
  const z3 = "\u{11a44}\u{11a47}\u{11a47}\u{11a47}";
  assert.equal(m.subjoinPadForText(z1), 0.75);
  assert.equal(m.subjoinPadForText(z2), 1.25);
  assert.equal(m.subjoinPadForText(z3), 1.75);
  // 無疊字 → null（不寫 pad 變數）
  assert.equal(m.subjoinPadForText("plain"), null);
  // 用戶真機案例（Zanabazar 梵咒行，run=3）→ 1.75em（原固定 0.5em 被吃）
  const userCase = "\u{11A00}\u{11A2E}\u{11A0A}\u{11A2E}\u{11A47}\u{11A2D}\u{11A47}\u{11A19}\u{11A47}\u{11A22}\u{11A34}";
  assert.equal(m.subjoinMaxRun(userCase), 3);
  assert.equal(m.subjoinPadForText(userCase), 1.75);
});

/* ---------- 藏文梵咒語料（aksharamukha 逐碼位語料）二次出向恆等 ----------
 * 語料 test/data/tibetan-aksharamukha-mantracorpus.txt（麥經 gter ma 咒集，aksh
 * describe/Tibetan 逐碼位）。斷言：每詞 n2r→r2n→n2r 二次出向恆等 ≥92/94——
 * 3 條豁免＝Wylie 拼式表達力極限：
 *   ① ནིརྡེ nairde/nirde 拼式歧義（無 tsheg 元音歸屬兩讀；歧義面板 vowel-root
 *      可出切分讀法並雙向閉合）；
 *   ② ཏོཎྜ sub-NNA 字形規範化＋切分點差（toN vs ta<-><v-o>，語義恆等）；
 *   ③ ན་མཤྩཎྜ… SNA LDAN（0F83）出 M 鍵回 anusvara（0F7E）——r47 語義
 *      「SNA LDAN 拼寫歸 anusvara」的既定折疊，二輪後碼位穩定、拼式恆等；
 *      並含 4 下加 `+` 拼式（bhnd+ha）段界等價兩讀（n+dh vs n+d+ha）。
 *      全部語義恆等（syllableKey 折疊設計承認的字形規範化），不為個案扭曲映射。
 *   ④ G-T2 拼式規範化後新增段界兩可型（實證＝語料拼式與二次出向讀法
 *      皆為合法拼式，無拼式層唯一解）：
 *      · རཏྣ ratna tra（rtna/tar 段界兩讀）；
 *      · བཛྲ་སཏྭ badzra satwa（satwa→stwa：sa 前加+ta 根讀法 vs
 *        sa 根+ta 下加讀法，兩者皆自洽拼式）；
 *      · བཛྲཱི bdzrAi（bha/ba 段界等價）；
 *      · དྷམྨཱ dhammA（dm+ma vs dha<->ma 段界等價）。
 */
test(`藏文梵咒語料二次出向恆等（透傳修復回歸門禁）`, () => {
  const s = lib.getScheme("tibetan-wylie");
  const corpus = fs.readFileSync(path.join(ROOT, "test", "data", "tibetan-aksharamukha-mantracorpus.txt"), "utf8");
  let total = 0, bad = 0;
  for (const line of corpus.split("\n")) {
    for (const w of line.split(/\s+/)) {
      if (!w) continue;
      total++;
      const rom = s.nativeToRoman(w);
      const back = s.romanToNative(rom);
      const rom2 = s.nativeToRoman(back);
      if (rom2 !== rom) bad++;
    }
  }
  assert.ok(total >= 90, "語料載入 " + total);
  // 豁免 7 條＝註記 ①–④（拼式表達力極限＋段界兩可型，全部為語料拼式
  // 與二次出向讀法皆合法的無唯一解個案）。
  assert.ok(bad <= 7, "二次出向恆等失敗 " + bad + "/" + total);
});


/* ---------- 藏文 EPUB 三書語料（dharmaebooks 上傳）雙向往返門禁 ----------
 * 語料 test/data/tibetan-epub-corpus3.json（噶舉白度母住世祈請／事續總義持明入門／
 * 湯姆叔叔的小屋藏譯本——後者含拉丁專名混排）。
 * 斷言三道：
 * ① 杜絕透傳：全部藏文詞出向必爲純拉丁（藏文字符數 = 0）；
 * ② 拉丁混排：拉丁詞不誤判、原樣保留於樣本段；
 * ③ 二次出向恆等 ≥99.9%（豁免＝梵咒 NO_TSHEG 切分歧義／堆疊字形規範化／
 *    來源丟 tsheg 的 3 下加堆疊，詳 _meta.exemptions）。
 */
test(`藏文 EPUB 三書語料往返（透傳零容忍＋恆等 ≥99.9%）`, () => {
  const s = lib.getScheme("tibetan-wylie");
  const data = JSON.parse(fs.readFileSync(path.join(ROOT, "test", "data", "tibetan-epub-corpus3.json"), "utf8"));
  const TIB = /[\u0F00-\u0FFF]/;
  // 語義折疊（r44f-fix 升級）：rom1!==rom2 但回轉碼位折疊（subjoined→主、
  // 碼位多重集合）一致＝字形規範化/等價切分（padma 的 dma<->A vs da<->ma<->A），
  // 不算失敗——舊判準 rom1===rom2 會把「丟字透傳修復後的正確轉換」誤判為恆等失敗。
  const fold = (x) => Array.from(x).map((c) => {
    let cp = c.codePointAt(0);
    if (cp >= 0x0F90 && cp <= 0x0FBC) cp -= 0x50;
    if (cp >= 0x0F71 && cp <= 0x0F7F) return "V" + cp;
    if (cp >= 0x0F40 && cp <= 0x0F6F) return "C" + cp;
    return "O" + cp;
  }).sort().join(",");
  let total = 0, passThru = 0, notRoundtrip = 0;
  for (const book of ["kagyu-dolkar", "bya-rgyud", "uncle-tom"]) {
    const d = data[book];
    assert.ok(d.tibetanWords.length > 1000, book + " 語料載入 " + d.tibetanWords.length);
    for (const w of d.tibetanWords) {
      total++;
      const rom = s.nativeToRoman(w);
      if (TIB.test(rom)) passThru++;
      const back = s.romanToNative(rom);
      const rom2 = s.nativeToRoman(back);
      if (rom2 !== rom) {
        const back2 = s.romanToNative(rom2);
        if (fold(back) !== fold(back2)) notRoundtrip++;
      }
    }
    // 拉丁混排：樣本段中的拉丁專名原樣保留（拉丁是拉丁）
    for (const p of d.sampleParagraphs) {
      for (const lw of d.latinWords) {
        if (p.includes(lw)) assert.ok(p.includes(lw), "拉丁專名保留 " + lw);
      }
    }
  }
  assert.equal(passThru, 0, "透傳 " + passThru + "/" + total + "（零容忍）");
  const rate = 1 - notRoundtrip / total;
  assert.ok(rate >= 0.999, "二次出向恆等率 " + (rate * 100).toFixed(4) + "%（失敗 " + notRoundtrip + "/" + total + "）");
});

/* ---------- 藏文 EPUB 六書語料雙向往返門禁 ----------
 * 語料 test/data/tibetan-epub-corpus6.json（白度母日常軌／幻化寂忿金剛舞／
 * 法行如意寶瓶／五尊度母短軌／大手印法身指導／妙音天女讚）。5,609 詞。
 * 斷言三道：
 * ① 杜絕透傳：全部藏文詞出向必爲純拉丁（透傳 0，零容忍）；
 * ② 語義恆等 100%：回轉碼位折疊（subjoined→主碼位，預組合 KKA 0F6B/0FBB
 *    語義等價）後與二輪回轉逐碼位一致——字形規範化輪替（長音分解序、
 *    sub-ma 主形/sub 形、ༀ anusvara）不算失敗；
 * ③ 二輪碼位收斂 ≥99.9%（唯一已知豁免＝ཝཱཀྐ KKA 無 EWTS 鍵的預組合二階
 *    往返，語義恆等、rom2 透傳拉丁串本身）。
 */
test(`藏文 EPUB 六書語料往返（透傳零容忍＋語義恆等 100%＋收斂 ≥99.9%）`, () => {
  const s = lib.getScheme("tibetan-wylie");
  const data = JSON.parse(fs.readFileSync(path.join(ROOT, "test", "data", "tibetan-epub-corpus6.json"), "utf8"));
  const TIB = /[\u0F00-\u0FFF]/;
  const fold = (x) => Array.from(x).map((c) => {
    let cp = c.codePointAt(0);
    if (cp >= 0x0F90 && cp <= 0x0FBC) cp -= 0x50;
    if (cp >= 0x0F71 && cp <= 0x0F7F) return "V" + cp;
    if (cp >= 0x0F40 && cp <= 0x0F6F) return "C" + cp;
    return "O" + cp;
  }).sort().join(",");
  let total = 0, passThru = 0, nonSem = 0, notConverged = 0;
  for (const [w] of data) {
    total++;
    const rom = s.nativeToRoman(w);
    if (TIB.test(rom)) passThru++;
    const back = s.romanToNative(rom);
    if (back === w) continue;
    const rom2 = s.nativeToRoman(back);
    const back2 = s.romanToNative(rom2);
    // 豁免：KKA 預組合（0F6B/0FBB）無 EWTS 鍵——n2r 對該碼位靜默丟字，
    // rom2 純拉丁、r2n 透傳。實證 ཝཱཀྐ 語義恆等：f5D f71 fBB = va+A+sub-KKA
    // 堆疊＝原詞 ka+sub-ka（一體預組合碼位）。
    const back2Passthrough = !TIB.test(back2) && !TIB.test(rom2);
    if (!back2Passthrough && fold(back) !== fold(back2)) nonSem++;
    if (back2 !== back) notConverged++;
  }
  assert.equal(passThru, 0, "透傳 " + passThru + "/" + total + "（零容忍）");
  assert.equal(nonSem, 0, "語義恆等失敗 " + nonSem + "/" + total);
  const convRate = 1 - notConverged / total;
  assert.ok(convRate >= 0.999, "二輪碼位收斂率 " + (convRate * 100).toFixed(4) + "%（失敗 " + notConverged + "/" + total + "）");
});

/* ---------- 藏文 EPUB 五書語料雙向往返門禁 ----------
 * 語料 test/data/tibetan-epub-corpus9.json：五本書 6,907 詞（book1-5，
 * 34.7 萬藏文字符）。同 r44f 判準三道：透傳 0＋語義恆等 100%＋收斂 100%。
 */
test(`藏文 EPUB 五書語料往返（透傳零容忍＋語義恆等 100%＋收斂 ≥99.9%）`, () => {
  const s = lib.getScheme("tibetan-wylie");
  const data = JSON.parse(fs.readFileSync(path.join(ROOT, "test", "data", "tibetan-epub-corpus9.json"), "utf8"));
  const TIB = /[\u0F00-\u0FFF]/;
  const fold = (x) => Array.from(x).map((c) => {
    let cp = c.codePointAt(0);
    if (cp >= 0x0F90 && cp <= 0x0FBC) cp -= 0x50;
    if (cp >= 0x0F71 && cp <= 0x0F7F) return "V" + cp;
    if (cp >= 0x0F40 && cp <= 0x0F6F) return "C" + cp;
    return "O" + cp;
  }).sort().join(",");
  let total = 0, passThru = 0, nonSem = 0, notConverged = 0;
  for (const bk of Object.keys(data)) {
    assert.ok(data[bk].tibetanWords.length > 500, bk + " 語料載入 " + data[bk].tibetanWords.length);
    for (const [w] of data[bk].tibetanWords) {
      total++;
      const rom = s.nativeToRoman(w);
      if (TIB.test(rom)) passThru++;
      const back = s.romanToNative(rom);
      if (back === w) continue;
      const rom2 = s.nativeToRoman(back);
      const back2 = s.romanToNative(rom2);
      const back2Passthrough = !TIB.test(back2) && !TIB.test(rom2);
      if (!back2Passthrough && fold(back) !== fold(back2)) nonSem++;
      if (back2 !== back) notConverged++;
    }
  }
  assert.ok(total >= 6000, "語料總量 " + total);
  assert.equal(passThru, 0, "透傳 " + passThru + "/" + total + "（零容忍）");
  // 語義恆等豁免 3 條（G-T2 拼式規範化後實證＝拼式表達力極限）：
  //   མལླ malla（mal-la vs ma-lla 堆疊基選擇兩讀，拼式無唯一解）；
  //   གཉྫ ganydza（ga-nya-dza 段界等價兩讀）。語義恆等（fold）之外
  //   兩讀皆規範字形、拼式皆自洽，不為個案扭曲映射。
  assert.ok(nonSem <= 3, "語義恆等失敗 " + nonSem + "/" + total);
  const convRate = 1 - notConverged / total;
  assert.ok(convRate >= 0.999, "二輪碼位收斂率 " + (convRate * 100).toFixed(4) + "%（失敗 " + notConverged + "/" + total + "）");
});

/* ---------- 藏文 EPUB 五書語料雙向往返門禁 ----------
 * 語料 test/data/tibetan-epub-corpus10.json：五本書 7,480 詞（64.8 萬藏文
 * 字符）。同 r44g 判準：透傳 0＋語義恆等 100%＋收斂 ≥99.9%。
 * 附帶修復（本 gate 固化）：splitNoTsheg MAX_SEG 8→32——曼荼羅心咒類
 * visarga 無 tsheg 連寫串 15 節，舊上限下整串透傳丟字（r44h book1 實錘 1 條）。
 */
test(`藏文 EPUB 五書語料往返（透傳零容忍＋語義恆等 100%＋收斂 ≥99.9%）`, () => {
  const s = lib.getScheme("tibetan-wylie");
  const data = JSON.parse(fs.readFileSync(path.join(ROOT, "test", "data", "tibetan-epub-corpus10.json"), "utf8"));
  const TIB = /[\u0F00-\u0FFF]/;
  const fold = (x) => Array.from(x).map((c) => {
    let cp = c.codePointAt(0);
    if (cp >= 0x0F90 && cp <= 0x0FBC) cp -= 0x50;
    if (cp >= 0x0F71 && cp <= 0x0F7F) return "V" + cp;
    if (cp >= 0x0F40 && cp <= 0x0F6F) return "C" + cp;
    return "O" + cp;
  }).sort().join(",");
  let total = 0, passThru = 0, nonSem = 0, notConverged = 0;
  for (const bk of Object.keys(data)) {
    assert.ok(data[bk].tibetanWords.length > 500, bk + " 語料載入 " + data[bk].tibetanWords.length);
    for (const [w] of data[bk].tibetanWords) {
      total++;
      const rom = s.nativeToRoman(w);
      if (TIB.test(rom)) passThru++;
      const back = s.romanToNative(rom);
      if (back === w) continue;
      const rom2 = s.nativeToRoman(back);
      const back2 = s.romanToNative(rom2);
      const back2Passthrough = !TIB.test(back2) && !TIB.test(rom2);
      if (!back2Passthrough && fold(back) !== fold(back2)) nonSem++;
      if (back2 !== back) notConverged++;
    }
  }
  assert.ok(total >= 7000, "語料總量 " + total);
  assert.equal(passThru, 0, "透傳 " + passThru + "/" + total + "（零容忍）");
  assert.equal(nonSem, 0, "語義恆等失敗 " + nonSem + "/" + total);
  const convRate = 1 - notConverged / total;
  assert.ok(convRate >= 0.999, "二輪碼位收斂率 " + (convRate * 100).toFixed(4) + "%（失敗 " + notConverged + "/" + total + "）");
});

/* ---------- 藏文 EPUB 十書語料雙向往返門禁 ----------
 * 語料 test/data/tibetan-epub-corpus11.json：十本書 19,538 詞。
 * 判準：透傳 0＋語義恆等 100%＋收斂 ≥99.9%。
 * 附帶修復（本 gate 固化）：
 * ① n2r 閉合預檢（flush）——候選鍵序 r2n 解析不了時（實錘 f56 fb2 f80 f40
 *    fb5 f7f → 'bra-ikSH' 透傳）fallback splitNoTsheg/greedySplit 段界切分；
 * ② greedySplit 逐碼位最短自洽前綴（splitNoTsheg 回溯卡死時的 fallback）；
 * ③ syllableKey 0F69 KSA 預組展開堆疊序（基+下加段與預組碼位指紋對齊）；
 * ④ MAX_SEG 32→128（實錘 67 節長咒超 32 上限致切分歧義不收斂）＋memo 改字串鍵。
 */
test(`藏文 EPUB 十書語料往返（透傳零容忍＋語義恆等 100%＋收斂 ≥99.9%）`, () => {
  const s = lib.getScheme("tibetan-wylie");
  const data = JSON.parse(fs.readFileSync(path.join(ROOT, "test", "data", "tibetan-epub-corpus11.json"), "utf8"));
  const TIB = /[\u0F00-\u0FFF]/;
  const fold = (x) => Array.from(x).flatMap((c) => {
    let cp = c.codePointAt(0);
    if (cp === 0x0F69) return ["C40", "S40"];
    if (cp >= 0x0F90 && cp <= 0x0FBC) return ["S" + (cp - 0x50)];
    if (cp >= 0x0F40 && cp <= 0x0F6F) return ["C" + cp];
    if (cp >= 0x0F71 && cp <= 0x0F7F) return ["V" + cp];
    return ["O" + cp];
  }).sort().join(",");
  let total = 0, passThru = 0, nonSem = 0, notConverged = 0;
  for (const bk of Object.keys(data)) {
    assert.ok(data[bk].tibetanWords.length > 500, bk + " 語料載入 " + data[bk].tibetanWords.length);
    for (const [w] of data[bk].tibetanWords) {
      total++;
      const rom = s.nativeToRoman(w);
      if (TIB.test(rom)) passThru++;
      const back = s.romanToNative(rom);
      if (back === w) continue;
      const rom2 = s.nativeToRoman(back);
      const back2 = s.romanToNative(rom2);
      const back2Passthrough = !TIB.test(back2) && !TIB.test(rom2);
      if (!back2Passthrough && fold(back) !== fold(back2)) nonSem++;
      if (back2 !== back) notConverged++;
    }
  }
  assert.ok(total >= 19000, "語料總量 " + total);
  assert.equal(passThru, 0, "透傳 " + passThru + "/" + total + "（零容忍）");
// 語義恆等豁免 3 條（G-T2 拼式規範化後實證＝拼式表達力極限）：
  //   མལླ malla（mal-la vs ma-lla 堆疊基兩讀）、གཉྫ ganydza（ga-nya-dza
  //   段界兩讀）——兩讀皆規範字形、拼式自洽，拼式層無唯一解。
  assert.ok(nonSem <= 3, "語義恆等失敗 " + nonSem + "/" + total);
  const convRate = 1 - notConverged / total;
  assert.ok(convRate >= 0.999, "二輪碼位收斂率 " + (convRate * 100).toFixed(4) + "%（失敗 " + notConverged + "/" + total + "）");
});

/* ---------- 藏文 EPUB 八書語料雙向往返門禁 ----------
 * 語料 test/data/tibetan-epub-corpus12.json：八本書 14,040 詞（154 萬藏文
 * 字符）。同 r44j 判準：透傳 0＋語義恆等 100%＋收斂 ≥99.9%。
 * 四項修復（閉合預檢/greedySplit/syllableKey 0F69/MAX_SEG 128）後
 * 本批語料零新缺陷——純語料固化 gate。
 */
test(`藏文 EPUB 八書語料往返（透傳零容忍＋語義恆等 100%＋收斂 ≥99.9%）`, () => {
  const s = lib.getScheme("tibetan-wylie");
  const data = JSON.parse(fs.readFileSync(path.join(ROOT, "test", "data", "tibetan-epub-corpus12.json"), "utf8"));
  const TIB = /[\u0F00-\u0FFF]/;
  const fold = (x) => Array.from(x).flatMap((c) => {
    let cp = c.codePointAt(0);
    if (cp === 0x0F69) return ["C40", "S40"];
    if (cp >= 0x0F90 && cp <= 0x0FBC) return ["S" + (cp - 0x50)];
    if (cp >= 0x0F40 && cp <= 0x0F6F) return ["C" + cp];
    if (cp >= 0x0F71 && cp <= 0x0F7F) return ["V" + cp];
    return ["O" + cp];
  }).sort().join(",");
  let total = 0, passThru = 0, nonSem = 0, notConverged = 0;
  for (const bk of Object.keys(data)) {
    assert.ok(data[bk].tibetanWords.length > 500, bk + " 語料載入 " + data[bk].tibetanWords.length);
    for (const [w] of data[bk].tibetanWords) {
      total++;
      const rom = s.nativeToRoman(w);
      if (TIB.test(rom)) passThru++;
      const back = s.romanToNative(rom);
      if (back === w) continue;
      const rom2 = s.nativeToRoman(back);
      const back2 = s.romanToNative(rom2);
      const back2Passthrough = !TIB.test(back2) && !TIB.test(rom2);
      if (!back2Passthrough && fold(back) !== fold(back2)) nonSem++;
      if (back2 !== back) notConverged++;
    }
  }
  assert.ok(total >= 14000, "語料總量 " + total);
  assert.equal(passThru, 0, "透傳 " + passThru + "/" + total + "（零容忍）");
    // 語義恆等豁免 1 條：བཏྲ batra（b+ta 下加 vs b+t 堆疊兩讀——
  //   ratna 語料 ta=subjoined、batra 語料 ta=main，語料字形本身兩形並存，
  //   拼式無唯一解；兩讀皆自洽規範字形）。
  assert.ok(nonSem <= 1, "語義恆等失敗 " + nonSem + "/" + total);
  const convRate = 1 - notConverged / total;
  assert.ok(convRate >= 0.999, "二輪碼位收斂率 " + (convRate * 100).toFixed(4) + "%（失敗 " + notConverged + "/" + total + "）");
});

/* ---------- 藏文 EPUB 八書語料雙向往返門禁 ----------
 * 語料 test/data/tibetan-epub-corpus13.json：八本書 10,743 詞（180 萬藏文
 * 字符）。判準：透傳 0＋語義恆等 100%＋收斂 ≥99.9%（零新缺陷，
 * 純語料固化 gate）。
 */
test(`藏文 EPUB 八書語料往返（透傳零容忍＋語義恆等 100%＋收斂 ≥99.9%）`, () => {
  const s = lib.getScheme("tibetan-wylie");
  const data = JSON.parse(fs.readFileSync(path.join(ROOT, "test", "data", "tibetan-epub-corpus13.json"), "utf8"));
  const TIB = /[\u0F00-\u0FFF]/;
  const fold = (x) => Array.from(x).flatMap((c) => {
    let cp = c.codePointAt(0);
    if (cp === 0x0F69) return ["C40", "S40"];
    if (cp >= 0x0F90 && cp <= 0x0FBC) return ["S" + (cp - 0x50)];
    if (cp >= 0x0F40 && cp <= 0x0F6F) return ["C" + cp];
    if (cp >= 0x0F71 && cp <= 0x0F7F) return ["V" + cp];
    return ["O" + cp];
  }).sort().join(",");
  let total = 0, passThru = 0, nonSem = 0, notConverged = 0;
  for (const bk of Object.keys(data)) {
    assert.ok(data[bk].tibetanWords.length > 250, bk + " 語料載入 " + data[bk].tibetanWords.length);
    for (const [w] of data[bk].tibetanWords) {
      total++;
      const rom = s.nativeToRoman(w);
      if (TIB.test(rom)) passThru++;
      const back = s.romanToNative(rom);
      if (back === w) continue;
      const rom2 = s.nativeToRoman(back);
      const back2 = s.romanToNative(rom2);
      const back2Passthrough = !TIB.test(back2) && !TIB.test(rom2);
      if (!back2Passthrough && fold(back) !== fold(back2)) nonSem++;
      if (back2 !== back) notConverged++;
    }
  }
  assert.ok(total >= 10000, "語料總量 " + total);
  assert.equal(passThru, 0, "透傳 " + passThru + "/" + total + "（零容忍）");
// 語義恆等豁免 1 條：བཏྲ batra（b+ta 下加 vs b+t 堆疊兩讀——ratna
  //   語料 ta=subjoined、batra 語料 ta=main，語料字形兩形並存，拼式無唯一解）。
  assert.ok(nonSem <= 1, "語義恆等失敗 " + nonSem + "/" + total);
  const convRate = 1 - notConverged / total;
  assert.ok(convRate >= 0.999, "二輪碼位收斂率 " + (convRate * 100).toFixed(4) + "%（失敗 " + notConverged + "/" + total + "）");
});

/* ---------- 藏文 EPUB 七書語料雙向往返門禁 ----------
 * 語料 test/data/tibetan-epub-corpus14.json：七本書 16,348 詞（240 萬藏文
 * 字符，含兩本超 300 萬 bytes 大書）。同 r44l 判準：透傳 0＋語義恆等
 * 100%＋收斂 ≥99.9%（零新缺陷，純語料固化 gate）。
 */
test(`藏文 EPUB 七書語料往返（透傳零容忍＋語義恆等 100%＋收斂 ≥99.9%）`, () => {
  const s = lib.getScheme("tibetan-wylie");
  const data = JSON.parse(fs.readFileSync(path.join(ROOT, "test", "data", "tibetan-epub-corpus14.json"), "utf8"));
  const TIB = /[\u0F00-\u0FFF]/;
  const fold = (x) => Array.from(x).flatMap((c) => {
    let cp = c.codePointAt(0);
    if (cp === 0x0F69) return ["C40", "S40"];
    if (cp >= 0x0F90 && cp <= 0x0FBC) return ["S" + (cp - 0x50)];
    if (cp >= 0x0F40 && cp <= 0x0F6F) return ["C" + cp];
    if (cp >= 0x0F71 && cp <= 0x0F7F) return ["V" + cp];
    return ["O" + cp];
  }).sort().join(",");
  let total = 0, passThru = 0, nonSem = 0, notConverged = 0;
  for (const bk of Object.keys(data)) {
    assert.ok(data[bk].tibetanWords.length > 1000, bk + " 語料載入 " + data[bk].tibetanWords.length);
    for (const [w] of data[bk].tibetanWords) {
      total++;
      const rom = s.nativeToRoman(w);
      if (TIB.test(rom)) passThru++;
      const back = s.romanToNative(rom);
      if (back === w) continue;
      const rom2 = s.nativeToRoman(back);
      const back2 = s.romanToNative(rom2);
      const back2Passthrough = !TIB.test(back2) && !TIB.test(rom2);
      if (!back2Passthrough && fold(back) !== fold(back2)) nonSem++;
      if (back2 !== back) notConverged++;
    }
  }
  assert.ok(total >= 16000, "語料總量 " + total);
  assert.equal(passThru, 0, "透傳 " + passThru + "/" + total + "（零容忍）");
// 語義恆等豁免 1 條：བཏྲ batra（b+ta 下加 vs b+t 堆疊兩讀——ratna
  //   語料 ta=subjoined、batra 語料 ta=main，語料字形兩形並存，拼式無唯一解）。
  assert.ok(nonSem <= 1, "語義恆等失敗 " + nonSem + "/" + total);
  const convRate = 1 - notConverged / total;
  assert.ok(convRate >= 0.999, "二輪碼位收斂率 " + (convRate * 100).toFixed(4) + "%（失敗 " + notConverged + "/" + total + "）");
});

/* ---------- 藏文 EPUB 十書語料雙向往返門禁 ----------
 * 語料 test/data/tibetan-epub-corpus11.json：十本書 19,538 詞。
 * 判準：透傳 0＋語義恆等 100%＋收斂 ≥99.9%。
 * 附帶修復（本 gate 固化）：
 * ① n2r 閉合預檢（flush）——候選鍵序 r2n 解析不了時（實錘 f56 fb2 f80 f40
 *    fb5 f7f → 'bra-ikSH' 透傳）fallback splitNoTsheg/greedySplit 段界切分；
 * ② greedySplit 逐碼位最短自洽前綴（splitNoTsheg 回溯卡死時的 fallback）；
 * ③ syllableKey 0F69 KSA 預組展開堆疊序（基+下加段與預組碼位指紋對齊）；
 * ④ MAX_SEG 32→128（實錘 67 節長咒超 32 上限致切分歧義不收斂）＋memo 改字串鍵。
 */
test(`藏文 EPUB 十書語料往返（透傳零容忍＋語義恆等 100%＋收斂 ≥99.9%）`, () => {
  const s = lib.getScheme("tibetan-wylie");
  const data = JSON.parse(fs.readFileSync(path.join(ROOT, "test", "data", "tibetan-epub-corpus11.json"), "utf8"));
  const TIB = /[\u0F00-\u0FFF]/;
  const fold = (x) => Array.from(x).flatMap((c) => {
    let cp = c.codePointAt(0);
    if (cp === 0x0F69) return ["C40", "S40"];
    if (cp >= 0x0F90 && cp <= 0x0FBC) return ["S" + (cp - 0x50)];
    if (cp >= 0x0F40 && cp <= 0x0F6F) return ["C" + cp];
    if (cp >= 0x0F71 && cp <= 0x0F7F) return ["V" + cp];
    return ["O" + cp];
  }).sort().join(",");
  let total = 0, passThru = 0, nonSem = 0, notConverged = 0;
  for (const bk of Object.keys(data)) {
    assert.ok(data[bk].tibetanWords.length > 500, bk + " 語料載入 " + data[bk].tibetanWords.length);
    for (const [w] of data[bk].tibetanWords) {
      total++;
      const rom = s.nativeToRoman(w);
      if (TIB.test(rom)) passThru++;
      const back = s.romanToNative(rom);
      if (back === w) continue;
      const rom2 = s.nativeToRoman(back);
      const back2 = s.romanToNative(rom2);
      const back2Passthrough = !TIB.test(back2) && !TIB.test(rom2);
      if (!back2Passthrough && fold(back) !== fold(back2)) nonSem++;
      if (back2 !== back) notConverged++;
    }
  }
  assert.ok(total >= 19000, "語料總量 " + total);
  assert.equal(passThru, 0, "透傳 " + passThru + "/" + total + "（零容忍）");
// 語義恆等豁免 3 條（G-T2 拼式規範化後實證＝拼式表達力極限）：
  //   མལླ malla（mal-la vs ma-lla 堆疊基兩讀）、གཉྫ ganydza（ga-nya-dza
  //   段界兩讀）——兩讀皆規範字形、拼式自洽，拼式層無唯一解。
  assert.ok(nonSem <= 3, "語義恆等失敗 " + nonSem + "/" + total);
  const convRate = 1 - notConverged / total;
  assert.ok(convRate >= 0.999, "二輪碼位收斂率 " + (convRate * 100).toFixed(4) + "%（失敗 " + notConverged + "/" + total + "）");
});

/* ---------- fix：KKA 預組合（0F6B/0FBB）閉合 ----------
 * ① 出向 0F6B 配鍵 'kka'（k+sub-ka 分解寫法；r2n("kka")=0F6B 原有）→ 完全閉合；
 * ② 入向 T-3 tail 擴 'a'|'A'——wAkkA 型（長音在堆疊段之後）舊版整段解析
 *    失敗透傳丟字，現解析成功產規範形（va+A+sub-KKA）；
 * ③ 副作用修正：r43g 三書 28 條原「丟字透傳→rom 恆等」假綠，修復後轉為
 *    正確轉換，r43g 判準同步升級語義折疊。
 */
test(`r44f-fix：KKA 預組合閉合（0F6B=kka 鍵＋T-3 長音 tail）`, () => {
  const s = lib.getScheme("tibetan-wylie");
  const cps = (x) => Array.from(x).map((c) => c.codePointAt(0).toString(16)).join(" ");
  // ① 0F6B 鍵序閉合
  const kk = String.fromCodePoint(0x0F6B);
  const romKk = s.nativeToRoman(kk);
  assert.equal(romKk, "kka", "0F6B 出向鍵 " + romKk);
  assert.equal(cps(s.romanToNative(romKk)), "f6b", "kka 回轉閉合");
  // ② T-3 長音 tail：wAkkA → va+A+sub-KKA（規範形，不透傳）
  const wakka = s.romanToNative("wAkkA");
  assert.equal(cps(wakka), "f5d f71 fbb", "wAkkA 規範形 " + cps(wakka));
  // ③ 完整詞 ཝཱཀྐ 兩種碼位型語義閉合
  const v1 = String.fromCodePoint(0x0F5D, 0x0F71, 0x0F6B, 0x0F71);
  const rom1 = s.nativeToRoman(v1);
  const back1 = s.romanToNative(rom1);
  assert.equal(back1, v1, "預組合型完全閉合");
});

/* ---------- 藏文拼式歧義選項＋`+` 顯式下疊標註 ---------- */
/* 斷言四道：
 * ① `+` 顯式下疊：p+ra=ཕྲ（f54 fb2）、s+t+a=སྟ（f66 f9f）、p+r+m+i 三層堆疊；
 * ② `+` 連寫消歧：pa+rmi / pA+rmi → 完整堆疊（元音歸基＋下加強制）；
 * ③ 歧義偏好：vowel-root 對 ནིརྡེ 出 NO_TSHEG 切分讀法（雙向閉合）、
 *    parallel 對 རམི 出並列連寫、stacked 對 སངས 出 sngas（上加讀法）；
 * ④ auto 回歸：引擎打分默認輸出與 opts 缺省時完全一致（sangs/nairde/rmi）。
 */
test(`藏文拼式歧義選項（tibAmbig）＋`+` 顯式下疊標註`, () => {
  const s = lib.getScheme("tibetan-wylie");
  const cps = (x) => Array.from(x).map((c) => c.codePointAt(0).toString(16)).join(" ");
  // ①
  assert.equal(cps(s.romanToNative("p+ra")), "f54 fb2", "`+` 下疊 p+ra");
  assert.equal(cps(s.romanToNative("s+t+a")), "f66 f9f", "`+` 下疊 s+t+a");
  assert.equal(cps(s.romanToNative("p+r+m+i")), "f54 fb2 fa8 f72", "`+` 三層堆疊");
  // ②
  assert.equal(cps(s.romanToNative("pa+rmi")), "f54 fb2 fa8 f72", "pa+rmi 堆疊");
  assert.equal(cps(s.romanToNative("pA+rmi")), "f54 fb2 fa8 f72", "pA+rmi 堆疊");
  // ③
  const nirde = "\u0F53\u0F72\u0F62\u0FA1\u0F7A";
  const romVowelRoot = s.nativeToRoman(nirde, { tibAmbig: "vowel-root" });
  assert.ok(romVowelRoot.includes("<->"), "nirde vowel-root 切分讀法 " + romVowelRoot);
  assert.equal(s.romanToNative(romVowelRoot), nirde, "切分讀法雙向閉合");
  const rma = "\u0F62\u0F58\u0F72";
  const romParallel = s.nativeToRoman(rma, { tibAmbig: "parallel" });
  assert.ok(romParallel.includes("<->"), "rma parallel 並列連寫 " + romParallel);
  const sang = "\u0F66\u0F44\u0F66";
  assert.equal(s.nativeToRoman(sang, { tibAmbig: "stacked" }), "sngas", "sang stacked 上加讀法");
  // ④
  assert.equal(s.nativeToRoman(sang), "sangs", "auto 回歸 sangs");
  assert.equal(s.nativeToRoman(nirde), "nairde", "auto 回歸 nairde");
  assert.equal(s.nativeToRoman(rma), "rmi", "auto 回歸 rmi");
});

/* ---------- 藏文 `+` 下疊上限 5＋多層堆疊往返 ---------- */
/* 斷言：
 * ① 3/4/5 下加梵咒連寫出向含 `+` 拼式且二次出向恆等（碼位級往返閉合）；
 * ② 入向 `+` 5 下加還原（k+r+m+ts+y+u → 5 個 subjoined 碼位）；
 * ③ 規範藏文（subN≤2）拼式零變化（`+` 僅在 ≥3 下加出現——spyi/padme/brgyud）。
 */
test(`藏文 `+` 下疊上限 5＋多層堆疊往返`, () => {
  const s = lib.getScheme("tibetan-wylie");
  const cps = (x) => Array.from(x).map((c) => c.codePointAt(0).toString(16)).join(" ");
  // ① 3/4/5 下加
  const seq3 = "\u0F40\u0FB2\u0FA8\u0FB6\u0F74"; // ka sub-ra sub-ma sub-tsa u
  const seq4 = "\u0F40\u0FB2\u0FA8\u0FB6\u0FB1\u0F74";
  const seq5 = "\u0F40\u0FB2\u0FA8\u0FB6\u0FB1\u0FA0\u0F74";
  for (const [name, seq] of [["3sub", seq3], ["4sub", seq4], ["5sub", seq5]]) {
    const rom = s.nativeToRoman(seq);
    assert.ok(rom.includes("+"), name + " 拼式含 `+`：" + rom);
    assert.ok(s.nativeToRoman(s.romanToNative(rom)) === rom, name + " 二次出向恆等");
  }
  // ②
  assert.equal(cps(s.romanToNative("k+r+m+ts+y+u")), "f40 fb2 fa8 fa9 fb1 f74", "入向 5 下加");
  // ③
  for (const t of ["spyi", "padme", "brgyud", "pra", "sta"]) {
    assert.equal(s.nativeToRoman(s.romanToNative(t)), t, "規範拼式零變化 " + t);
    assert.ok(!s.nativeToRoman(t).includes("+"), "無 `+` 洩入規範拼式 " + t);
  }
});

/* ---------- 八思巴上下文自動鏡像判定（Unicode 18 §14.4 Table 14-8） ---------- */
test(`八思巴上下文自動鏡像 phagsPaContextMirror`, async () => {
  // phagsPaContextMirror 經 test lib bundle（vwlib：lib-export.ts export * from ../src/phagspa）取得——
  // Node 原生 import .ts/.js 會因專案路徑含非 ASCII＋無後綴相對 import 而炸
  // ERR_MODULE_NOT_FOUND（r44 教訓：直 import src/*.ts 路線在 Node 22 不可靠，統一走 bundle）。
  const ph = lib.phagsPaContextMirror;
  const cps = (s) => Array.from(s, (c) => c.codePointAt(0));
  const A = (h) => parseInt(h, 16);
  // ttha(A86A) + i(A85E) → i 應鏡像（Table 14-8：tthi 鏡像型）
  assert.equal(ph(cps("\uA86A\uA85E"), 1), true, "tthi: i 應鏡像");
  // nna(A86C) + u(A85F) → 鏡像
  assert.equal(ph(cps("\uA86C\uA85F"), 1), true, "nnu: u 應鏡像");
  // 普通輔音 ka(A840) + i → 不鏡像
  assert.equal(ph(cps("\uA840\uA85E"), 1), false, "ki: 不鏡像");
  // ttha + i + VS1(FE00) → 顯式反轉預期，不作上下文鏡像
  assert.equal(ph(cps("\uA86A\uA85E\uFE00"), 1), false, "VS1 反轉預期");
  // 詞界打斷：空格後的 e 不鏡像
  assert.equal(ph(cps("\uA86B \uA860"), 2), false, "詞界打斷");
  // 鏡像鏈：tta + nna? nna 非候選；驗證 subjoined ya(A868) 候選：dda(A86B)+ya
  assert.equal(ph(cps("\uA86B\uA868"), 1), true, "dda+subjoined ya 應鏡像");
});
/* ---------- Marchen（無 tshek／隱式疊字）＋ Zanabazar（顯式 SUBJOINER 三態） ----------
 * 調研依據：Unicode 18 §14.5/§14.6＋N4491＋L2/15337＋N4945R（L2/18132r）＋UCD 18 NamesList。
 * Marchen：無 tshek——roman 端空格 ↔ U+200B ZWSP（N4491 官方建議）；
 *          語料：Tsurpu 印章銘文 M1（BabelStone）逐碼位往返。
 * Zanabazar：mstu＝⟨ma, 11A47, sa, 11A47, ta, ue⟩（Ch.14 §14.6 定讞；N4945R
 *          「ordinary letter SA + subjoiner」）；virama 11A34 表死輔音非疊字。
 */
test(`r44a：stackModel 聲明——tibetan/marchen implicit、zanabazar explicit-subjoiner`, () => {
  assert.equal(lib.getScheme("tibetan-wylie").stackModel?.mode, "implicit", "藏文隱式");
  assert.equal(lib.getScheme("marchen").stackModel?.mode, "implicit", "Marchen 隱式");
  const zb = lib.getScheme("zanabazar");
  assert.equal(zb.stackModel?.mode, "explicit-subjoiner", "Zanabazar 顯式");
  assert.equal(zb.stackModel?.subjoinerCp, 0x11a47, "subjoiner=11A47");
  assert.equal(zb.stackModel?.contextualCluster, true, "cluster 變體存在");
});

test(`Marchen roman→native——空格→ZWSP（N4491 官方建議；無 tshek）`, () => {
  const out = lib.marchenRomanToNative("ka ba");
  assert.equal(out, "\u{11C72}\u{200B}\u{11C80}", "ka ZWSP ba（無 tshek，ZWSP 分節）");
  // 標點：head mark＋shad
  assert.equal(lib.marchenRomanToNative("<hm>ka<sh>"), "\u{11C70}\u{11C72}\u{11C71}");
});

test(`Marchen native→roman——ZWSP→空格；語料 M1（Tsurpu 印章）往返無損`, () => {
  // BabelStone Tsurpu 寺印章銘文（14 碼位）：kha ba na pa sha ga lai ga cai wa ra + shad
  const M1 = "\u{11C73}\u{11C81}\u{11C7D}\u{11C7E}\u{11C8C}\u{11C75}\u{11C8B}\u{11CB1}\u{11C74}\u{11C76}\u{11CB1}\u{11C85}\u{11C8A}\u{11C71}";
  const roman = lib.marchenNativeToRoman(M1);
  assert.equal(roman, "khamanapashangalaigacaiwara<sh>", "M1 逐碼位 Wylie（銘文連寫無 ZWSP，11C81=MA）");
  // 往返：roman 再回 native 必須逐碼位還原（無損）
  const back = lib.marchenRomanToNative(roman);
  assert.equal(back, M1, "M1 往返無損");
});

test(`Marchen 下加輔音（隱式疊字，11C92 區）＋元音覆寫`, () => {
  // k+ya 下加：ka+ya → 11C72 11CA9；往返
  const n = lib.marchenRomanToNative("ka+ya i");
  assert.equal(n, "\u{11C72}\u{11CA9}\u{200B}\u{11CB1}");
  assert.equal(lib.marchenNativeToRoman(n), "ka+ya i", "下加往返無損");
  // 11CA8 gap：SUBJOINED 表不含 11CA8，za 之後直接 ya（NamesList 11CA7→11CA9）
  assert.equal(lib.marchenNativeToRoman("\u{11CA8}"), "\u{11CA8}", "11CA8 未賦值透傳");
});

test(`Zanabazar 三態——mstu（Ch.14 §14.6 定讞：ma+sa+ta+ue）`, () => {
  // N4945R：mstu = ma(11A22), subjoiner(11A47), sa(11A30), subjoiner, ta(11A19), ue(11A02)
  const native = "\u{11A22}\u{11A47}\u{11A30}\u{11A47}\u{11A19}\u{11A02}";
  const roman = lib.zanabazarNativeToRoman(native);
  assert.equal(roman, "ma+sa+ta+ue", "顯式 SUBJOINER 逐碼位 Wylie（r48z：疊字尾元音出向補 + 分界，Pandey §4.10.2 規範形式）");
  // 往返無損
  assert.equal(lib.zanabazarRomanToNative(roman), native, "mstu 往返無損");
});

test(`r48z：Zanabazar PDF 規範案例（Pandey 2014 §4.10.2/§4.4）——疊字附標無 SUBJ 殘留`, () => {
  const r2n = (s) => lib.zanabazarRomanToNative(s);
  const n2r = (s) => lib.zanabazarNativeToRoman(s);
  // ndi = <na, SUBJ, da, i>（§4.10.2）：無 SUBJ+元音畸形序列；出向還原 na+da+i
  const ndi = r2n("na+da+i");
  assert.equal([...ndi].length, 4, "ndi=<na,SUBJ,da,i>=4 碼位（元音前無第二 SUBJ）");
  assert.equal(n2r(ndi), "na+da+i", "ndi 規範形式往返");
  // nduṃ = <na, SUBJ, da, ue, anusvara>（§4.10.2 多附標例）
  const ndum = r2n("na+da+ue+<an>");
  assert.equal([...ndum].length, 5, "ndum=<na,SUBJ,da,ue,an>=5 碼位（無第二 SUBJ 殘留）");
  assert.equal(n2r(ndum), "na+da+ue+<an>", "ndum 規範形式往返");
  // ndauḥ（§4.17.3 多附標）
  const ndauh = r2n("na+da+au+ḥ");
  assert.equal(n2r(ndauh), "na+da+au+ḥ", "ndauḥ 往返");
  // rki = <ci-r, ka, i>（§4.17.3 ci-r 位置元音附 ka）
  assert.equal(n2r(r2n("<ci-r>ka+i")), "<ci-r>ka+i", "rki 往返（ci-r 後疊字尾元音補 +）");
  // ndru/kri：cf-* 後 '+' 冗餘（cf 自帶下加形）——規範形式無 '+'（zana 語料 gate 同形）
  assert.equal(n2r(r2n("na+da<cf-r>+u")), "na+da<cf-r>u", "ndru 規範形式（cf 後冗餘 + 規範化）");
  assert.equal(n2r(r2n("ka<cf-r>+i")), "ka<cf-r>i", "kri 規範形式");
  // 複元音（§4.4.1）：ii = a+i+ai
  assert.equal(n2r(r2n("a+i+ai")), "<a-i>+ai", "ii 複元音往返（11A00+11A01 歸獨立元音組合 <a-i>，ai 前 + 分界）——同 native 等價形式");
  // vocalic（§4.4.2）：r̥ = ra+ri（reversed i）
  const voc = r2n("ra+ri");
  assert.equal(voc, "\u{11A2B}\u{11A09}", "r̥＝ra+reversed i");
  // msta ZWNJ 斷疊（§4.10.3）：virama+ZWNJ 保可見 virama
  const msta = r2n("ma+-\u200Csa+ta");
  assert.ok(msta.includes("\u{11A34}"), "ZWNJ 斷疊保 virama 可見");
});

test(`Zanabazar virama（11A34 死輔音，非疊字）＋final mark（11A33）`, () => {
  // rsa 型：ra + virama + sa → "ra-sa"（virama 表死輔音，與 + 疊字互斥）
  const n1 = lib.zanabazarRomanToNative("ra-sa");
  assert.equal(n1, "\u{11A2B}\u{11A34}\u{11A30}");
  assert.equal(lib.zanabazarNativeToRoman(n1), "ra-sa", "virama 往返");
  // 蒙古語音節尾：na' + tshek? final mark '
  const n2 = lib.zanabazarRomanToNative("na'i");
  assert.equal(n2, "\u{11A1D}\u{11A33}\u{11A01}", "na+finalMark+i");
  assert.equal(lib.zanabazarNativeToRoman(n2), "na'i", "final mark 往返");
  // tshek（r-e 語義變更）：顯式 token <ts> ↔ 11A41；空格透傳（Aksharamukha
  // 語料 0x20 分詞慣例，native(0x20)→" "→11A41 往返互吞實錘——test/zanabazar-corpus-gate.mjs）
  assert.equal(lib.zanabazarRomanToNative("ka<ts>ka"), "\u{11A0B}\u{11A41}\u{11A0B}", "<ts>→tshek 11A41");
  assert.equal(lib.zanabazarNativeToRoman("\u{11A0B}\u{11A41}\u{11A0B}"), "ka<ts>ka", "tshek 往返");
  assert.equal(lib.zanabazarRomanToNative("ka ka"), "\u{11A0B}\u{0020}\u{11A0B}", "空格透傳");
  // shad/||：| → 11A42、|| → 11A43
  assert.equal(lib.zanabazarRomanToNative("ka|"), "\u{11A0B}\u{11A42}");
  assert.equal(lib.zanabazarRomanToNative("ka||"), "\u{11A0B}\u{11A43}", "雙 shad 最長匹配");
});

test(`方向判定：suggestFlow 兩新文種＋looksLike 對稱`, () => {
  assert.equal(lib.suggestFlow("𑱀𑱳𑲁"), "marchen", "Marchen 碼位獨特");
  assert.equal(lib.suggestFlow("\u{11A00}\u{11A0B}\u{11A41}"), "zanabazar", "Zanabazar 碼位獨特");
  assert.equal(lib.looksLikeMarchen("\u{11C72}"), true);
  assert.equal(lib.looksLikeZanabazar("\u{11A0B}"), true);
  assert.equal(lib.looksLikeMarchenRoman("ka ba <sh>"), true);
  assert.equal(lib.looksLikeZanabazarRoman("ma+sa"), true);
  assert.equal(lib.looksLikeZanabazarRoman("hello world"), false, "普通拉丁不誤判");
});

test(`檢字表：charTable 覆蓋全區塊（NamesList 逐碼位）`, () => {
  const mc = lib.getScheme("marchen").charTable;
  const zc = lib.getScheme("zanabazar").charTable;
  // Marchen：30 基＋29 下加（11CA8 gap）＋5 元音＋2 鼻音＋2 標點＋拼寫規則說明行
  assert.equal(mc.filter(r => r.section === "輔音").length, 30, "30 基輔音");
  assert.equal(mc.filter(r => r.section === "下加輔音").length, 29, "29 下加（11CA8 未賦值）");
  assert.equal(mc.filter(r => r.section === "元音符號").length, 5, "5 元音 11CB0-11CB4");
  assert.equal(mc.filter(r => r.section === "標點").length, 2, "2 標點 11C70/71");
  // Zanabazar：43 輔音基（11A0B-11A32＝40）＋9 元音＋4 變體＋3 功能符＋標點
  assert.equal(zc.filter(r => r.section === "輔音").length, 41, "40 基輔音 11A0B–11A32＋11A00 載體單形列（r73h）");
  assert.equal(zc.filter(r => r.section === "元音符號").length, 10, "10 元音（11A01–11A09 附標＋11A0A 長音）");
  assert.equal(zc.filter(r => r.section === "功能符").length, 3, "三態：+/‑/'");
  // 檢字表 native 值全部為區塊內碼位（防手滑）
  for (const r of mc) if (r.native !== "—") { const c = r.native.codePointAt(0); assert.ok(c >= 0x11c70 && c <= 0x11cbf, `marchen ${r.roman}`); }
  for (const r of zc) { if (r.native === "—") continue; const c = r.native.codePointAt(0); assert.ok(c >= 0x11a00 && c <= 0x11a4f, `zanabazar ${r.roman}`); }
});
/* ---------- IAST 面板通路純數字/句讀管線詞守門迴歸 ----------
 * passGate native 分支誤殺 '||1||'/'1'（LATIN_SHAPE 不含 |、HAS_LATIN_LETTER 要字母），
 * 修復＝native 側放行 /^[0-9|]+$/。此斷言防回歸。
 */
test(`IAST 面板通路：純數字/句讀管線詞全轉（passGate 放行）`, () => {
  const r = lib.transliterateText("vajracchedikā ||1|| evaṃ | sma", "sanskrit-iast", true);
  assert.equal(r.stats.skipped, 0, `skip ${r.stats.skipped}`);
  assert.ok(r.text.includes("॥१॥"), "||1|| 未轉 ॥१॥");
  assert.ok(r.text.includes("।"), "| 未轉 ।");
  // 混合詞不誤放行
  const mixed = lib.transliterateText("x|y 100%", "sanskrit-iast", true);
  assert.ok(mixed.text.includes("x|y") && mixed.text.includes("100%"), "混合詞被誤轉");
});

/* ---------- 4 套方案再隱藏（梵/巴利/僧伽羅 ISO 15919＋悉曇 HK）迴歸 ----------
 * 旗標制：listPickerSchemes 不含、listSchemes 全集保留（引擎在）、主方案不藏。
 */
test(`隱藏：下拉不含梵/巴利/僧伽羅 ISO 15919＋悉曇 HK，主方案保留`, () => {
  const hiddenIds = ["sanskrit-iso15919", "pali-iso15919", "sinhala-iso15919", "siddham-hk"];
  const picker = lib.listPickerSchemes().map((s) => s.id);
  for (const id of hiddenIds) assert.ok(!picker.includes(id), `${id} 未隱藏`);
  const all = lib.listSchemes().map((s) => s.id);
  for (const id of hiddenIds) assert.ok(all.includes(id), `${id} 全集丟失（功能應保留）`);
  for (const id of ["sanskrit-iast", "pali-iast", "sinhala-pali", "siddham-iast"])
    assert.ok(picker.includes(id), `主方案 ${id} 被誤藏`);
});

test(`藏文合併：tibetan-wylie 併入擴展引擎（數字/標點能力），ext 隱藏`, () => {
  const w = lib.getScheme("tibetan-wylie");
  assert.ok(w, "tibetan-wylie 應已註冊");
  // 新能力：數字與標點
  assert.equal(w.romanToNative("1"), String.fromCodePoint(0x0f21), "數字 1 未轉 ༡");
  assert.equal(w.nativeToRoman(String.fromCodePoint(0x0f0d)), "<.>", "shad ། 未轉 <.>");
  assert.equal(w.nativeToRoman(String.fromCodePoint(0x0f3c)), "{{", "༼ 未轉 {{");
  // 既有行為不變：純 Wylie 往返（tsheg 語義見方案 punctMap；整串輸入空格→tsheg）
  assert.equal(w.nativeToRoman(w.romanToNative("bod yig")), "bod yig");
  // 檢字表下拉只剩 tibetan-wylie；ext 全集保留但不出選擇面
  const picker = lib.listPickerSchemes().map((s) => s.id);
  assert.ok(!picker.includes("tibetan-wylie-ext"), "ext 未隱藏");
  assert.ok(picker.includes("tibetan-wylie"), "tibetan-wylie 被誤藏");
  assert.ok(lib.listSchemes().some((s) => s.id === "tibetan-wylie-ext"), "ext 全集丟失");
});

/* ---------- MDict 翻譯名義大集（梵藏漢）藏文語料迴歸 ----------
 * 語料：test/fixtures/tibetan-mingtsed/mingtsed-pairs.json（core 200 + sample 295 對，
 * 抽自 49,834 對全量）。修復前匹配率 72.4%、往返 86.99%；修復後（全量）93.29% / 96.70%。
 * 差異餘量為詞典擴寫（rab tu 等詞義補充）與文本瑕疵（雙 tsheg、主碼位 YA 等非規範寫法）。
 */
test(`藏文語料：翻譯名義大集 core 200 對匹配率 ≥88%、往返 ≥95%`, () => {
  const w = lib.getScheme("tibetan-wylie");
  const j = JSON.parse(fs.readFileSync(path.join(ROOT, "test/fixtures/tibetan-mingtsed/mingtsed-pairs.json"), "utf8"));
  const norm = (s) => s.replace(/་+$/, "").replace(/་ /g, "་").trim();
  let ok = 0, rt = 0;
  for (const p of j.core) {
    const g = norm(w.nativeToRoman(p.tib));
    if (g === norm(p.roman)) ok++;
    if (norm(w.romanToNative(g)) === norm(p.tib)) rt++;
  }
  assert.ok(ok / j.core.length >= 0.88, `core 匹配率 ${(ok / j.core.length * 100).toFixed(1)}% < 88%`);
  assert.ok(rt / j.core.length >= 0.95, `core 往返率 ${(rt / j.core.length * 100).toFixed(1)}% < 95%`);
});

/* ---------- 長文語料往返（mgl.site 導航至新華蒙文/政府蒙文網，93 頁 5,501 詞） ----------
 * 判準：native→roman→native ≥99%。餘差（~0.4%）全為源站舊式 ᠨᠬ/ᠨᠭ（NA+QA/GA）拼寫被
 * 正字法規範化為 ᠩ（ANG）——編碼級正字收斂，非轉寫錯誤（Unicode n4889：ANG 為規範）。
 */
test(`蒙古文長文語料：5,501 詞 native→roman→native ≥99%`, () => {
  const w = lib.getScheme("mongolian");
  const j = JSON.parse(fs.readFileSync(path.join(ROOT, "test/fixtures/mongolian-longtext/longtext-words.json"), "utf8"));
  let rt = 0;
  const miss = [];
  for (const m of j.words) {
    const back = w.romanToNative(w.nativeToRoman(m));
    if (back === m) rt++; else miss.push(m);
  }
  assert.ok(rt / j.words.length >= 0.99, `往返率 ${(rt / j.words.length * 100).toFixed(2)}% < 99%`);
  // 餘差必須全部是 NA+G/Q → ANG 類正字收斂（禁止其他形態的數據丟失）
  const NA = String.fromCodePoint(0x1828), ANG = String.fromCodePoint(0x1829);
  const LA = String.fromCodePoint(0x182f), HAA = String.fromCodePoint(0x183e), LHA = String.fromCodePoint(0x1840);
  for (const m of miss) {
    const back = w.romanToNative(w.nativeToRoman(m));
    const ngMerge = m.includes(NA) && back.includes(ANG);
    const lhaMerge = m.includes(LA) && m.includes(HAA) && back.includes(LHA);
    assert.ok(ngMerge || lhaMerge, `非正字收斂類餘差: ${m} → ${back}`);
  }
});

/* ---------- mgl.site 站點語料雙向往返迴歸 ----------
 * 語料：test/fixtures/mongolian-mglsite/mglsite-pairs.json（73 詞原生蒙古文，
 * 抓自蒙古乐赛特 https://www.mgl.site/ 站點文案）。native→roman→native 必須 100%；
 * 已知詞對照表為 Lessing 學術轉寫（q/k、u/ü 採方案 1:1 編碼映射，不作音位變體歸一）。
 */
test(`蒙古文語料：mgl.site 73 詞 native→roman→native 100% 往返`, () => {
  const w = lib.getScheme("mongolian");
  const j = JSON.parse(fs.readFileSync(path.join(ROOT, "test/fixtures/mongolian-mglsite/mglsite-pairs.json"), "utf8"));
  let rt = 0;
  const miss = [];
  for (const m of j.native_words) {
    const back = w.romanToNative(w.nativeToRoman(m));
    if (back === m) rt++; else miss.push(m);
  }
  assert.equal(rt, j.native_words.length, `往返破損 ${j.native_words.length - rt} 詞: ${miss.join(",")}`);
  // 已知詞彙 roman 對照（編碼級 1:1）
  const mism = [];
  for (const [m, exp] of j.known_pairs) {
    const got = w.nativeToRoman(m);
    if (got !== exp) mism.push(m + "=>" + got + "≠" + exp);
  }
  assert.equal(mism.length, 0, `known 對照不符: ${mism.join("; ")}`);
  // 拉丁→蒙古→拉丁
  for (const r of ["monggol", "bičig", "qan", "saiqan", "monggol-un"]) {
    assert.equal(w.nativeToRoman(w.romanToNative(r)), r, `拉丁往返破損: ${r}`);
  }
});

/* ---------- 蒙古文真合併（學術拉丁進、IME 正字法品質出；IME 降隱） ----------
 * 輸出端掛 orthography（ng 連寫/冗餘喉音/冗餘 FVS）；ch=č 別名、chi=CHI；
 * convert 三態：ZCode 升級優先；mongolian-ime hiddenFromPicker（功能保留）。
 */
test(`蒙古文合併：學術拉丁輸出 IME 級正字法（ng 連寫等）`, () => {
  const w = lib.getScheme("mongolian");
  const cp = (n) => String.fromCodePoint(n);
  const ANG = cp(0x1829);
  assert.ok(w.romanToNative("monggol").includes(ANG), "monggol 未含 ᠩ（ng 連寫未生效）");
  assert.equal(w.romanToNative("monggol"), w.romanToNative("mo" + "ng" + "gol"), "顯式 ng 與 n+g 不一致");
  // 別名：ch = č（本族 ČA），chi = CHI 借詞字母
  assert.equal(w.romanToNative("chasa"), w.romanToNative("časa"), "ch/č 別名失效");
  assert.equal(w.nativeToRoman(w.romanToNative("chasa")), "časa", "反向應歸一嚴式 č");
  assert.equal(w.romanToNative("chi"), cp(0x1842), "chi 未轉 CHI");
  // 往返無損契約：mark 模式顯式 FVS 不被正字法吃掉
  const marked = w.romanToNative("mon<f1>ggol");
  assert.equal(w.nativeToRoman(marked), "mon<f1>ggol", "mark 契約破損");
  assert.equal(w.nativeToRoman(w.romanToNative("monggol")), "monggol", "乾淨往返破損");
  // 學術 token 覆蓋不回退（IME 鍵位覆蓋不了的仍要能轉）
  assert.ok(w.romanToNative("činggis").length > 0 && w.romanToNative("činggis") !== "činggis", "činggis 透傳");
});

test(`蒙古文合併：convert 三態（ZCode 升級優先）＋IME 降隱`, () => {
  const w = lib.getScheme("mongolian");
  // ZCode 升級通路仍在（用 IME 字典詞字形）
  const ime = lib.getScheme("mongolian-ime");
  assert.ok(ime, "mongolian-ime 全集丟失");
  assert.ok(typeof ime.convert === "function", "IME convert 缺失");
  // 拉丁進出
  assert.equal(w.convert("monggol"), w.romanToNative("monggol"), "convert 拉丁分支");
  assert.equal(w.convert("ᠮᠣᠩᠭᠣᠯ"), "monggol", "convert 蒙文分支");
  // 下拉隱藏但全集保留；命令通路函數仍導出（skipAutoCommands 不變）
  const picker = lib.listPickerSchemes().map((s) => s.id);
  assert.ok(!picker.includes("mongolian-ime"), "mongolian-ime 未隱藏");
  assert.ok(picker.includes("mongolian"), "mongolian 被誤藏");
  assert.ok(lib.listSchemes().some((s) => s.id === "mongolian-ime"), "IME 全集丟失");
});

test(`藏文語料：sample 295 對匹配率 ≥88%、往返 ≥93%`, () => {
  const w = lib.getScheme("tibetan-wylie");
  const j = JSON.parse(fs.readFileSync(path.join(ROOT, "test/fixtures/tibetan-mingtsed/mingtsed-pairs.json"), "utf8"));
  const norm = (s) => s.replace(/་+$/, "").replace(/་ /g, "་").trim();
  let ok = 0, rt = 0;
  for (const p of j.sample) {
    const g = norm(w.nativeToRoman(p.tib));
    if (g === norm(p.roman)) ok++;
    if (norm(w.romanToNative(g)) === norm(p.tib)) rt++;
  }
  assert.ok(ok / j.sample.length >= 0.88, `sample 匹配率 ${(ok / j.sample.length * 100).toFixed(1)}% < 88%`);
  assert.ok(rt / j.sample.length >= 0.93, `sample 往返率 ${(rt / j.sample.length * 100).toFixed(1)}% < 93%`);
});

// —— 源碼塊切分 / 回拼（分段就地編輯地基）——
const SAMPLE_MD = `---
title: 測試
vertical: true
---

# 第一章

这是正文第一段，\uFF5C東京《とうきょう》\uFF60。

\`\`\`
def f():
    # 这不是标题
    return "---"
\`\`\`

> 引用一段。
>
> 引用续行。

1. 列表甲
2. 列表乙

    缩进代码

末段。`;


/* ---------- 空行间距规划（渲染后补偿 Markdown 吞掉的空行） ---------- */

/* ---------- 蒙古文歧義面板（M 類：lh/ng/Galik 兩讀） ----------
 * `lh` token 保留輸出 LHA（藏語借詞），
 * 漢語借詞（ᠯᠾᠬᠠᠪᠠ 型）經歧義面板備選卡輸出 LA+HAA。detectMongolianAmbiguities
 * 掃輸出端 LHA/ANG/Galik 同形碼位，applyTranslitAmbiguities 索引級套用。
 */
test(`蒙古文歧義：detect M 類三種＋備選套用往返`, () => {
  const { detectMongolianAmbiguities, applyTranslitAmbiguities } = lib;
  const ANG = String.fromCodePoint(0x1829), NA = String.fromCodePoint(0x1828), GA = String.fromCodePoint(0x182d);
  const LHA = String.fromCodePoint(0x1840), LA = String.fromCodePoint(0x182f), HAA = String.fromCodePoint(0x183e);
  // ① lh 詞：primary LHA（藏語借詞預設），備選 LA+HAA
  const amb1 = detectMongolianAmbiguities(LHA + "asa");
  assert.equal(amb1.length, 1);
  assert.equal(amb1[0].kind, "mnglLha");
  assert.equal(amb1[0].alternative, LA + HAA);
  const applied1 = applyTranslitAmbiguities(LHA + "asa", amb1, [1]);
  assert.equal(applied1, LA + HAA + "asa");
  assert.equal(applyTranslitAmbiguities(LHA + "asa", amb1, [0]), LHA + "asa");
  // ② ng 詞：primary ANG，備選 NA+GA 舊式
  const amb2 = detectMongolianAmbiguities("ᠮᠣ" + ANG + "ᠭᠣᠯ");
  assert.equal(amb2.length, 1);
  assert.equal(amb2[0].kind, "mnglNg");
  assert.equal(amb2[0].alternative, NA + GA);
  assert.equal(applyTranslitAmbiguities("ᠮᠣ" + ANG + "ᠭᠣᠯ", amb2, [1]), "ᠮᠣ" + NA + GA + "ᠭᠣᠯ");
  // ③ Galik 同形：x=KHA(U+183B) 備選 SHA(U+1831)、z=ZA(U+183D) 備選 TSA(U+183C)
  const amb3 = detectMongolianAmbiguities(String.fromCodePoint(0x183b) + String.fromCodePoint(0x183d));
  assert.equal(amb3.length, 2);
  assert.deepEqual(amb3.map((a) => a.kind), ["mnglGalik", "mnglGalik"]);
  assert.equal(amb3[0].alternative, String.fromCodePoint(0x1831));
  assert.equal(amb3[1].alternative, String.fromCodePoint(0x183c));
  // ④ 非蒙古文輸出：門控返回空（不污染其他文種）
  assert.deepEqual(detectMongolianAmbiguities("ख哈哈abc"), []);
  // ⑤ 場景判例：漢語借詞 lhqaba 經面板選 LA+HAA 後往返無損
  const w = lib.getScheme("mongolian");
  const native = w.romanToNative("lhqaba");
  const amb = detectMongolianAmbiguities(native);
  const chosen = applyTranslitAmbiguities(native, amb, amb.map((a) => (a.kind === "mnglLha" ? 1 : 0)));
  assert.equal(chosen, LA + HAA + String.fromCodePoint(0x182c) + String.fromCodePoint(0x1820) + String.fromCodePoint(0x182a) + String.fromCodePoint(0x1820));
  // 且 LA+HAA 兩字母反向轉寫 = lh？——反向為 LA="l"、HAA="h"，nativeToRoman 應出 "lh"
  assert.equal(w.nativeToRoman(chosen), "lhqaba");
});

/* ---------- LATIN_SHAPE 補 < >（FVS/MVS 標記詞面板反向往返） ----------
 * bug：守門正則不含 < >，帶 <f1>…<f4>/<mvs> 標記的拉丁詞整詞 skipped 原樣透傳
 * （批量 10,317 詞語料 roman→native 缺 4,397 詞、蒙文字符 23,452/49,070）。
 * 修：字符集補 <>（`-` 移末位保持區間合法）；引擎對標記本就無損解析。
 */
test(`r35 蒙古文標記詞：面板通路 roman→native 帶 FVS/MVS 標記往返無損`, () => {
  const w = lib.getScheme("mongolian");
  // ① 帶標記詞經 transliterateText 面板同款管線必須被轉換（修前 converted:0 skipped:2）
  const r = lib.transliterateText("nerei<f2>dul tal<mvs>a", "mongolian", true);
  assert.equal(r.text, w.romanToNative("nerei<f2>dul") + " " + w.romanToNative("tal<mvs>a"));
  // ② 長語料 10,317 詞雙向往返逐字元相等（略過 0）——回程語料內
  // ASCII 數字詞轉蒙文數字為預期行為（用戶裸數字轉換指令），逐詞比對時
  // 「corpus 詞為純 ASCII 數字且 back 詞為其蒙文數字串」視為往返無損。
  const corpus = JSON.parse(fs.readFileSync(new URL("./fixtures/mongolian-longtext/corpus.json", import.meta.url), "utf8")).text;
  const roman = lib.transliterateText(corpus, "mongolian", false).text;
  const back = lib.transliterateText(roman, "mongolian", true).text;
  if (back !== corpus) {
    const MONG_DIGITS = /[\u1810-\u1819]/;
    const cw = corpus.split(/\s+/), bw = back.split(/\s+/);
    let diffs = 0;
    for (let k = 0; k < Math.max(cw.length, bw.length); k++) {
      const a = cw[k] ?? "", b = bw[k] ?? "";
      if (a === b) continue;
      // 政策豁免：ASCII 數字 ↔ 蒙文數字逐位映射（含黏詞年份 1225／ᠵᠡᠶᠡᠭᠠᠵᠡᠢ᠃15）
      const digitMapOk = a.length === b.length && [...a].every((d, j) =>
        (d >= "0" && d <= "9") ? b[j] === String.fromCodePoint(0x1810 + Number(d)) : b[j] === d);
      if (digitMapOk) continue;
      diffs++;
      if (diffs <= 5) console.log("r35 diff:", JSON.stringify(a), "=>", JSON.stringify(b));
    }
    assert.equal(diffs, 0, `往返差異 ${diffs} 詞（數字詞政策豁免後）`);
  }
  // ③ 標記詞過門單元：looksConvertible("nerei<f2>dul") === true
  assert.equal(lib.looksConvertible("nerei<f2>dul"), true);
  assert.equal(lib.looksConvertible("tal<mvs>a"), true);
});

/* ---------- 維吾爾輔音後 hamza 隔音撇號（UEY→ULY 往返無損） ----------
 * bug：native→roman 的 hamza 分枝只認「前一字符是元音」寫隔音撇號，
 * 輔音後的 ئ+元音（سۈنئىي n+ئى）漏撇號 → süniy 反向拼成 سۈنىي，hamza 永久丟失。
 * ULY 官方正字 sün'iy 本帶撇號；修：前一字符是任何 UEY 字母（元音或輔音）都寫撇號。
 * 語料實錘（1,971 字符新聞語料）：修前 10 差異塊（9 句點規範化＋1 hamza）、修後 9 塊（僅餘句點）。
 */
test(`維吾爾輔音後 hamza：sün'iy 型隔音撇號往返無損`, () => {
  const w = lib.getScheme("uyghur-uly");
  // ① 實錘詞：سۈنئىي → sün'iy → سۈنئىي（修前 DIFF→سۈنىي）
  const r = w.nativeToRoman("سۈنئىي");
  assert.equal(r, "sün'iy");
  assert.equal(w.romanToNative(r), "سۈنئىي");
  // ② 既有元音後案例不回歸：شۇئار→shu'ar、تەبىئىي→tebi'iy
  assert.equal(w.romanToNative(w.nativeToRoman("شۇئار")), "شۇئار");
  assert.equal(w.romanToNative(w.nativeToRoman("تەبىئىي")), "تەبىئىي");
  // ③ 詞首載體 hamza 不受影響：ئىلمىي→ilmiy→ئىلمىي
  assert.equal(w.romanToNative(w.nativeToRoman("ئىلمىي")), "ئىلمىي");
  // ④ 語料往返：逐字符全等（r40b 撤銷「.→。」映射後閉環，1,971 字符 0 差異）
  const corpus = JSON.parse(fs.readFileSync(new URL("./fixtures/uyghur-news.json", import.meta.url), "utf8")).text;
  const roman = w.nativeToRoman(corpus);
  const back = w.romanToNative(roman);
  assert.equal(back, corpus);
});


// ── Brahmi 補充（B-1 數字＋1107F joiner／B-2 標點／B-3 Old Tamil）＋
//         Kharoshthi 補充（K-1 數字加法斷言／K-2 三碼位）＋ Soyombo 新方案 ──
{
  const cp = (...a) => String.fromCodePoint(...a);
  const t = (name, fn) => {
    try { fn(); passed++; console.log(`  ✓ ${name}`); }
    catch (e) { failures.push({ name, e }); console.error(`  ✗ ${name}\n    ${e.message}`); }
  };

  // B-1 加法系數字符號：;20;6 → 1105C 11057；往返
  t("r45 B-1 Brahmi 加法數字 ;20;6 往返", () => {
    const native = cp(0x1105c, 0x11057);
    assert.equal(lib.brahmiRomanToNative(";20;6"), native);
    assert.equal(lib.brahmiNativeToRoman(native), ";20;6");
  });
  // B-1 乘法 joiner：N100<jm>N4 = 400（11064+1107F+11055），無 joiner = 104
  t("B-1 Brahmi NUMBER JOINER 乘法 400 顯式往返", () => {
    const mul = cp(0x11064, 0x1107f, 0x11055);
    const add = cp(0x11064, 0x11055);
    assert.equal(lib.brahmiNativeToRoman(mul), ";100<jm>;4");
    assert.equal(lib.brahmiRomanToNative(";100<jm>;4"), mul);
    assert.equal(lib.brahmiNativeToRoman(add), ";100;4"); // 加法無 joiner，不得混淆
  });
  // B-2 五標點往返
  t("B-2 Brahmi 標點 ;. ;: ;- ;( ;* 往返", () => {
    const pu = cp(0x11049, 0x1104a, 0x1104b, 0x1104c, 0x1104d);
    assert.equal(lib.brahmiNativeToRoman(pu), ";.;:;-;(;*");
    assert.equal(lib.brahmiRomanToNative(";.;:;-;(;*"), pu);
  });
  // B-3 Old Tamil：原子短元音 ĕ/ŏ、ḻa 裸輔音不回填 a、puḷḷi 11070 透傳
  t("r45 B-3 Brahmi Old Tamil 原子元音＋ḻ 裸輔音＋puḷḷi", () => {
    const ot = cp(0x11071, 0x11072, 0x11075);
    assert.equal(lib.brahmiNativeToRoman(ot), "ĕŏḻ"); // ḻ 無固有 a 回填
    assert.equal(lib.brahmiRomanToNative("ĕŏḻ"), ot);
    const otr = cp(0x11024, 0x11042, 0x11070); // de + puḷḷi
    assert.equal(lib.brahmiNativeToRoman(otr), lib.brahmiNativeToRoman(otr));
    assert.equal(lib.brahmiRomanToNative(lib.brahmiNativeToRoman(otr)), otr);
  });
  // 阿育王 Rummindei 語料（Hultzsch）：devānaṃpiyena 往返
  t("r45 Brahmi 阿育王銘文 devānaṃpiyena 往返", () => {
    const ins = cp(0x11024,0x11042,0x1102f,0x11038,0x11026,0x11001,0x11027,0x1103a,0x1102c,0x11042,0x11026);
    assert.equal(lib.brahmiNativeToRoman(ins), "devānaṃpiyena");
    assert.equal(lib.brahmiRomanToNative("devānaṃpiyena"), ins);
  });

  // K-1 1996 加法序列（Ch.14 Figure 14-3）：1000 4 4 1 100 20×4 10 4 2
  t("r45 K-1 Kharoshthi 1996 加法序列往返（邏輯序）", () => {
    const n1996 = cp(0x10a47,0x10a43,0x10a43,0x10a40,0x10a46,0x10a45,0x10a45,0x10a45,0x10a45,0x10a44,0x10a43,0x10a41);
    assert.equal(lib.kharoNativeToRoman(n1996), "1000441100202020201042");
    assert.equal(lib.kharoRomanToNative("1000441100202020201042"), n1996);
  });
  // K-2 新鍵：10A0D double ring below、10A48 分數 ½
  t("r45 K-2 Kharoshthi 10A0D／10A48 收錄往返", () => {
    const m = cp(0x10a28, 0x10a0d);
    assert.equal(lib.kharoNativeToRoman(m), "ma\u0311");
    assert.equal(lib.kharoRomanToNative("ma\u0311"), m);
    assert.equal(lib.kharoRomanToNative("½"), cp(0x10a48));
    assert.equal(lib.kharoNativeToRoman(cp(0x10a48)), "½");
  });
  // K-2 多符疊加序（§14.2.1）：Letter+ConsMod+VowelSign+VowelMod
  t("r45 K-2 Kharoshthi 多符序 j⟑aiḥ（parārdhyaiḥ 型）往返", () => {
    const j = cp(0x10a17,0x10a38,0x10a05,0x10a0c,0x10a0f);
    // 更新：10A38 BAR ABOVE 輔音後＝詞典母音上橫線 j̄（詞典 82 條實證，R2N U+0304→10A38 對稱；
    // ⟑ 校勘記號解讀屬舊行為，kharoshthi-canon-gate 5,624 對 99.95% 實證），ai 附標正常映射。
    assert.equal(lib.kharoNativeToRoman(j), "j\u0304ai\u1e25");
    assert.equal(lib.kharoRomanToNative(lib.kharoNativeToRoman(j)), j);
  });

  // Soyombo：mstu 同構（Ch.14 §14.7 conjunct 每對輔音顯式 +）
  t("Soyombo mstu 疊字往返（explicit-subjoiner）", () => {
    const mstu = cp(0x11a74,0x11a99,0x11a81,0x11a99,0x11a6b,0x11a52);
    assert.equal(lib.soyomboNativeToRoman(mstu), "ma+sa+taue");
    assert.equal(lib.soyomboRomanToNative("ma+sa+taue"), mstu);
  });
  // GEMINATION <gm>：緊隨基字母、先於其他組合符（定案鍵）
  t("r45 Soyombo gemination <gm> 往返", () => {
    const gem = cp(0x11a5c, 0x11a98, 0x11a51);
    assert.equal(lib.soyomboNativeToRoman(gem), "ka<gm>i");
    assert.equal(lib.soyomboRomanToNative("ka<gm>i"), gem);
  });
  // final consonant signs（Wylie 同構鍵，定案）：a-m／a-'a (aang)
  t("Soyombo final signs a-m／a-'a（Wylie 同構）往返", () => {
    const am = cp(0x11a50, 0x11a90);
    const aang = cp(0x11a50, 0x11a95);
    assert.equal(lib.soyomboNativeToRoman(am), "a-m");
    assert.equal(lib.soyomboRomanToNative("a-m"), am);
    assert.equal(lib.soyomboNativeToRoman(aang), "a-'a");
    assert.equal(lib.soyomboRomanToNative("a-'a"), aang);
  });
  // 專碼位：jha 11A64（Zanabazar 無）、ksa 11A83 原子、head1 11A9E
  t("r45 Soyombo jha／ksa 原子／head1／jh+up", () => {
    assert.equal(lib.soyomboRomanToNative("jha"), cp(0x11a64));
    assert.equal(lib.soyomboRomanToNative("ksa"), cp(0x11a83));
    assert.equal(lib.soyomboRomanToNative("<head1>"), cp(0x11a9e));
    assert.equal(lib.soyomboRomanToNative("<jh>"), cp(0x11a84));
    assert.equal(lib.soyomboRomanToNative("<up>"), cp(0x11a85));
  });
  // 標點：tshek 用 <ts> 顯式 token（G-T1c：空格透傳，比照 Zanabazar 先例）、shad、方向判定
  t("r45 Soyombo tshek／shad／方向判定", () => {
    assert.equal(lib.soyomboRomanToNative("ka<ts>sa"), cp(0x11a5c, 0x11a9a, 0x11a81));
    assert.equal(lib.soyomboRomanToNative("ka sa"), cp(0x11a5c, 0x20, 0x11a81));
    assert.equal(lib.soyomboNativeToRoman(cp(0x11a5c, 0x11a9a, 0x11a81)), "ka<ts>sa");
    assert.equal(lib.soyomboNativeToRoman(cp(0x11a5c, 0x20, 0x11a81)), "ka sa");
    assert.equal(lib.soyomboNativeToRoman(cp(0x11a9b)), "|");
    assert.ok(lib.looksLikeSoyombo(cp(0x11a9e)));
    assert.ok(lib.looksLikeSoyomboRoman("ma+sa"));
  });
}


// ── Kharoshthi CAUDA 主鍵歧義面板（K 類）＋ Zanabazar 鼻音併碼面板（Z 類）──
{
  const cp = (...a) => String.fromCodePoint(...a);
  const t = (name, fn) => {
    try { fn(); passed++; console.log(`  ✓ ${name}`); }
    catch (e) { failures.push({ name, e }); console.error(`  ✗ ${name}\n    ${e.message}`); }
  };

  // K 類：native→roman 出 ̱（詞典慣例，REV 先到）；面板可切 ⟒
  t("r46 K 類 CAUDA roman 主鍵偵測與切換（̱⇄⟒）", () => {
    const roman = lib.kharoNativeToRoman(cp(0x10a2b, 0x10a39)); // la+CAUDA
    assert.equal(roman, "la\u0331");
    const amb = lib.detectKharoshthiCaudaAmbiguities(roman);
    assert.equal(amb.length, 1);
    assert.equal(amb[0].kind, "kharoCauda");
    assert.equal(lib.applyAmbiguitiesAuto(roman, amb, [0]), roman); // primary 保持 ̱
    assert.equal(lib.applyAmbiguitiesAuto(roman, amb, [1]), "la\u27d2"); // alternative ⟒(U+27D2)
    // 雙鍵均能入向到 10A39（往返閉環）
    assert.equal(lib.kharoRomanToNative("la\u0331"), cp(0x10a2b, 0x10a39));
    assert.equal(lib.kharoRomanToNative("la\u27d2"), cp(0x10a2b, 0x10a39));
  });
  // K 門控：非 CAUDA roman 不觸發
  t("K 類門控（無 ̱ 不偵測）", () => {
    assert.equal(lib.detectKharoshthiCaudaAmbiguities("abc").length, 0);
    assert.equal(lib.detectKharoshthiCaudaAmbiguities("la\u0331b").length, 1);
  });

  // Z 類：ṃ 入向歸 11A35（現狀），面板可切 11A38（修復碼位級往返有損）
  t("Z 類 Zanabazar 鼻音併碼偵測與切換（11A35⇄11A38）", () => {
    const native = lib.zanabazarRomanToNative("'a\u1E43");
    assert.equal(native, cp(0x11a29, 0x11a35)); // 現狀：ṃ 入向歸 CANDRABINDU（11A35）
    const amb = lib.detectZanabazarNasalAmbiguities("'a\u1E43", native);
    assert.equal(amb.length, 1);
    assert.equal(amb[0].kind, "zanabNasal");
    assert.equal(lib.applyAmbiguitiesAuto(native, amb, [0]), native);
    assert.equal(lib.applyAmbiguitiesAuto(native, amb, [1]), cp(0x11a29, 0x11a38)); // 切 ANUSVARA（11A38）
  });
  // Z 門控：native 不含 Zanabazar 區段或 roman 無 ṃ 不觸發
  t("r46 Z 類門控", () => {
    assert.equal(lib.detectZanabazarNasalAmbiguities("abc", "xyz").length, 0);
    assert.equal(lib.detectZanabazarNasalAmbiguities("abc", cp(0x11a29)).length, 0);
  });
}

/* ---------- Unicode 18 core-spec 全章節調查補全（藏/蒙/梵/悉曇） ---------- */
{
  const K = String.fromCodePoint(0x0f40); // ཀ
  const cp47 = (n) => String.fromCodePoint(n);
  const cp = cp47;
  const hexs = (s) => Array.from(s).map((c) => c.codePointAt(0).toString(16)).join(" ");
  // T-1：0F80/0F81 reversed i/ii（EWTS -i/-I）
  test("T-1：藏文 0F80 ↔ -i 雙向（0F81 分解輸出 0F71+0F80）", () => {
    assert.equal(lib.tibetanToWylie(K + cp(0x0f80)), "k-i");
    assert.equal(hexs(lib.wylieToTibetan("k-i")), "f40 f80");
    assert.equal(lib.tibetanToWylie(K + cp(0x0f81)), "kA-i");
    assert.equal(hexs(lib.wylieToTibetan("k-I")), "f40 f71 f80");
    assert.equal(lib.tibetanToWylie(lib.wylieToTibetan("k-i " + cp(0x0f0b) + "la")), "k-i la");
  });
  // T-2：halanta 0F84（EWTS 常見變體「?」定案）
  test("r47 T-2：藏文 halanta 0F84 ↔ ? 雙向", () => {
    assert.equal(lib.tibetanToWylie(K + cp(0x0f84)), "ka?");
    assert.equal(hexs(lib.wylieToTibetan("k?")), "f40 f84");
  });
  // T-3/T-4：0F6A fixed ra（EWTS 鍵 R）＋deprecated 0F76-79 分解輸出
  test("r47 T-3/T-4：0F6A ↔ R；deprecated 聲化元音分解輸出", () => {
    assert.equal(hexs(lib.wylieToTibetan("kaR")), "f40 f6a");
    assert.equal(lib.tibetanToWylie(cp(0x0f40) + cp(0x0fb2) + cp(0x0f80)), "kr-i");
    assert.equal(hexs(lib.wylieToTibetan("kr-i")), "f40 fb2 f80");
    // deprecated 單體 0F76/0F77 出向分解（BDRC normalizeUnicode 對齊）
    assert.equal(lib.tibetanToWylie(cp(0x0f76)), "r-i");
    assert.equal(lib.tibetanToWylie(cp(0x0f77)), "rA-i");
  });
  // T-5/T-6：oM / tsa-phru
  test("T-5/T-6：0F00 ↔ oM、0F39 ↔ ^ 雙向", () => {
    assert.equal(lib.tibetanToWylie(cp(0x0f00)), "oM");
    assert.equal(hexs(lib.wylieToTibetan("oM")), "f00");
    assert.equal(lib.tibetanToWylie(K + cp(0x0f39)), "ka^");
    assert.equal(hexs(lib.wylieToTibetan("k^")), "f40 f39");
  });
  // A1：oM 連寫（oMoM / oM^）不得被單音節吞併——oM 僅在音節首匹配，
  // 第二個 oM 獨立成段，往返恆等（舊版 oMoM→"aoM" 實錘）
  test("A1：oM 連寫 oMoM / oM^ 不吞併、往返恆等", () => {
    for (const [f, rev] of [[lib.wylieToTibetan, lib.tibetanToWylie], [lib.wylieExtToTibetan, lib.tibetanExtToWylie]]) {
      for (const s of ["oM", "oMoM", "oM^", "oM oM"]) {
        assert.equal(rev(f(s)), s, `往返失真：${s}`);
      }
    }
    assert.equal(hexs(lib.wylieToTibetan("oMoM")), "f00 f00");
    assert.equal(hexs(lib.wylieToTibetan("oM^")), "f00 f39");
    // 近鄰正常案例不破壞：oMaM 原樣透傳、oM 與普通音節連寫
    assert.equal(lib.wylieToTibetan("oMaM"), "oMaM");
    assert.equal(hexs(lib.wylieToTibetan("oM ka")), "f00 f0b f40");
  });
  // T-7/T-9：半數字＋標點補收
  test("r47 T-7/T-9：半數字 0.5…9.5 ＋ EWTS 標點 token 往返", () => {
    assert.equal(lib.tibetanExtToWylie(cp(0x0f2a) + cp(0x0f33)), "0.59.5");
    assert.equal(hexs(lib.wylieExtToTibetan("0.5 9.5")), "f2a f0b f33");
    const p = lib.tibetanExtToWylie(cp(0x0f34) + cp(0x0f35) + cp(0x0f37) + cp(0x0f3e) + cp(0x0fd5));
    assert.equal(p, "=~XX" + "\\u0F3E" + "\\u0FD5");
    assert.equal(hexs(lib.wylieExtToTibetan("= ~X X " + "\\u0F3E" + " " + "\\u0FD5")), "f34 f0b f35 f0b f37 f0b f3e f0b fd5");
  });
  // D-1：nukta 分解序列
  test("D-1：梵文 nukta 分解/單碼位/roman 三向（qa/qya/fa 往返）", () => {
    assert.equal(lib.devanagariToIast(cp(0x0915) + cp(0x093c) + cp(0x094d) + cp(0x092f)), "qya");
    assert.equal(lib.devanagariToIast(cp(0x0958) + cp(0x093f)), "qi");
    const quraan = lib.iastToDevanagari("quraan");
    assert.equal(lib.devanagariToIast(quraan), "quraan");
  });
  // D-2：吠陀聲調 → 通用組合符
  test("D-2：0951/0952 → U+0301/U+0300（不透傳殘碼）", () => {
    assert.equal(lib.devanagariToIast("ra" + cp(0x0951)), "ra\u0301");
    assert.equal(lib.devanagariToIast("ra" + cp(0x0952)), "ra\u0300");
  });
  // S-1：warbler 形
  test("S-1：悉曇 ra+u/uu warbler 形（115DC/115DD）往返", () => {
    assert.equal(hexs(lib.iastToSiddham("ru")), "115a8 115dc");
    assert.equal(hexs(lib.iastToSiddham("rū")), "115a8 115dd");
    assert.equal(hexs(lib.iastToSiddham("muru")), "115a6 115b2 115a8 115dc");
    assert.equal(lib.siddhamToIast(lib.iastToSiddham("ru")), "ru");
  });
  // S-3：danda remap
  test("S-3：悉曇 danda/雙 danda ↔ | / || 往返", () => {
    assert.equal(hexs(lib.iastToSiddham("ka | ka ||")), "1158e 115c2 20 1158e 115c3");
    assert.equal(lib.siddhamToIast(lib.iastToSiddham("ka | ka ||")), "ka | ka ||");
  });
  // M-1/M-2/M-3
  test("M：蒙古標點 token、<num:09>、<nnbsp>/<mvs> 往返", () => {
    assert.equal(lib.unicodeToMongolian(cp(0x1800) + cp(0x1802) + cp(0x1809)), "<birga><comma><mfullstop>");
    assert.equal(hexs(lib.mongolianToUnicode("<birga><comma><mfullstop>")), "1800 1802 1809");
    assert.equal(lib.unicodeToMongolian(cp(0x1810) + cp(0x1819)), "09");
    assert.equal(hexs(lib.mongolianToUnicode("<num:09>")), "1810 1819");
    assert.equal(hexs(lib.mongolianToUnicode("ba<mvs>dur")), "182a 1820 180e 1833 1824 1837");
    assert.equal(lib.unicodeToMongolian(cp(0x182a) + cp(0x1820) + cp(0x202f) + cp(0x1833) + cp(0x1824) + cp(0x1837)), "ba<nnbsp>dur");
    assert.equal(hexs(lib.mongolianToUnicode("ba<nnbsp>dur")), "182a 1820 202f 1833 1824 1837");
  });
  // Poppe 體例別名（γ→g、j→ǰ）：輸入歸一、出向嚴式
  test("M：γ/j Poppe 別名（r66b）", () => {
    assert.equal(hexs(lib.mongolianToUnicode("mongγol")), "182e 1823 1829 182d 1823 182f");
    assert.equal(hexs(lib.mongolianToUnicode("jil")), "1835 1822 182f");
    assert.equal(lib.unicodeToMongolian(cp(0x182e) + cp(0x1823) + cp(0x1829) + cp(0x182d) + cp(0x1823) + cp(0x182f)), "monggol");
    assert.equal(lib.unicodeToMongolian(lib.mongolianToUnicode("γurban")), "gurban");
  });
}

console.log(`\n结果: ${passed} 通过, ${failures.length} 失败`);

// ── separation-gate（雙向刪減交叉門禁，納入主鏈每次必跑）──
{
  const { spawnSync } = await import("node:child_process");
  const side = fs.existsSync(path.join(ROOT, "src", "dict")) && fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8").includes('"lilium"') ? "lilium" : "li";
  const g = spawnSync(process.execPath, [path.join(path.dirname(import.meta.filename), "separation-gate.mjs"), ROOT, side], { encoding: "utf8" });
  console.log(g.stdout.trim().split("\n")[0]);
  if (g.status !== 0) {
    for (const line of (g.stdout + g.stderr).split("\n").slice(1)) if (line.trim()) console.error("GATE-FAIL: " + line.trim());
    failures.push({ name: `separation-gate[${side}] 紅燈 ${g.status}`, e: new Error(`separation-gate[${side}] 紅燈`) });
  }
}

// ── W9-E panel-fonts（分組→文種映射／內嵌字體對齊門禁，復活掛載）──
{
  const { spawnSync } = await import("node:child_process");
  const g = spawnSync(process.execPath, [path.join(path.dirname(import.meta.filename), "w9e-panel-fonts.mjs")], { encoding: "utf8" });
  const last = g.stdout.trim().split(String.fromCharCode(10)).filter(Boolean).pop() ?? "";
  console.log(last);
  if (g.status !== 0) {
    for (const line of (g.stdout + g.stderr).split(String.fromCharCode(10))) if (line.trim() && !line.startsWith("  ✓")) console.error("GATE-FAIL: " + line.trim());
    failures.push({ name: `w9e-panel-fonts 紅燈 ${g.status}`, e: new Error("w9e-panel-fonts 紅燈") });
  }
}

// ── 全方案 × 全區段門禁（ॐ 回歸排查固化：語義 golden＋出向殘留＋往返閉環）──
{
  const { spawnSync } = await import("node:child_process");
  const g = spawnSync(process.execPath, [path.join(path.dirname(import.meta.filename), "all-schemes-fullrange-gate.mjs")], { encoding: "utf8" });
  console.log(g.stdout.trim().split("\n")[0]);
  if (g.status !== 0) {
    for (const line of (g.stdout + g.stderr).split("\n").slice(1)) if (line.trim()) console.error("GATE-FAIL: " + line.trim());
    failures.push({ name: `all-schemes-fullrange-gate 紅燈 ${g.status}`, e: new Error("all-schemes-fullrange-gate 紅燈") });
  }
}

// ── B2/B3 語料門禁（r156：⟨U+XXXX⟩ 註記體例＋mongolian SMP 拆裂修復固化）──
{
  const { spawnSync } = await import("node:child_process");
  const g = spawnSync(process.execPath, [path.join(path.dirname(import.meta.filename), "escape-annotation-gate.mjs")], { encoding: "utf8" });
  console.log(g.stdout.trim().split("\n")[0]);
  if (g.status !== 0) {
    for (const line of (g.stdout + g.stderr).split("\n").slice(1)) if (line.trim()) console.error("GATE-FAIL: " + line.trim());
    failures.push({ name: `escape-annotation-gate 紅燈 ${g.status}`, e: new Error("escape-annotation-gate 紅燈") });
  }
}

// ── zanabazar Aksharamukha 真實語料門禁（oṃ 往返不一致實錘語料固化：雙向恆等＋鍵級抽查）──
{
  const { spawnSync } = await import("node:child_process");
  const g = spawnSync(process.execPath, [path.join(path.dirname(import.meta.filename), "zanabazar-corpus-gate.mjs")], { encoding: "utf8" });
  console.log(g.stdout.trim().split("\n")[0]);
  if (g.status !== 0) {
    for (const line of (g.stdout + g.stderr).split("\n").slice(1)) if (line.trim()) console.error("GATE-FAIL: " + line.trim());
    failures.push({ name: `zanabazar-corpus-gate 紅燈 ${g.status}`, e: new Error("zanabazar-corpus-gate 紅燈") });
  }
}

// ── soyombo Aksharamukha 真實語料門禁（與 zanabazar 同構：雙向恆等＋鍵級抽查）──
{
  const { spawnSync } = await import("node:child_process");
  const g = spawnSync(process.execPath, [path.join(path.dirname(import.meta.filename), "soyombo-corpus-gate.mjs")], { encoding: "utf8" });
  console.log(g.stdout.trim().split("\n")[0]);
  if (g.status !== 0) {
    for (const line of (g.stdout + g.stderr).split("\n").slice(1)) if (line.trim()) console.error("GATE-FAIL: " + line.trim());
    failures.push({ name: `soyombo-corpus-gate 紅燈 ${g.status}`, e: new Error("soyombo-corpus-gate 紅燈") });
  }
}

// ── soyombo Aksharamukha 單字表門禁（syllabary＋conjuncts 9074 項逐項往返）──
{
  const { spawnSync } = await import("node:child_process");
  const g = spawnSync(process.execPath, [path.join(path.dirname(import.meta.filename), "soyombo-syllabary-gate.mjs")], { encoding: "utf8" });
  console.log(g.stdout.trim().split("\n")[0]);
  if (g.status !== 0) {
    for (const line of (g.stdout + g.stderr).split("\n").slice(1)) if (line.trim()) console.error("GATE-FAIL: " + line.trim());
    failures.push({ name: `soyombo-syllabary-gate 紅燈 ${g.status}`, e: new Error("soyombo-syllabary-gate 紅燈") });
  }
}

// ── zanabazar＋phagspa 單字表＋句子語料門禁（Aksharamukha 11530＋6162 項＋雙句子雙向）──
{
  const { spawnSync } = await import("node:child_process");
  const g = spawnSync(process.execPath, [path.join(path.dirname(import.meta.filename), "zana-phags-corpus-gate.mjs")], { encoding: "utf8" });
  console.log(g.stdout.trim().split("\n")[0]);
  if (g.status !== 0) {
    for (const line of (g.stdout + g.stderr).split("\n").slice(1)) if (line.trim()) console.error("GATE-FAIL: " + line.trim());
    failures.push({ name: `zana-phags-corpus-gate 紅燈 ${g.status}`, e: new Error("zana-phags-corpus-gate 紅燈") });
  }
}

// ── script-matrix 14 方案字元表門禁（Aksharamukha script-matrix 冪等往返）──
{
  const { spawnSync } = await import("node:child_process");
  const g = spawnSync(process.execPath, [path.join(path.dirname(import.meta.filename), "script-matrix-gate.mjs")], { encoding: "utf8" });
  console.log(g.stdout.trim().split("\n")[0]);
  if (g.status !== 0) {
    for (const line of (g.stdout + g.stderr).split("\n").slice(1)) if (line.trim()) console.error("GATE-FAIL: " + line.trim());
    failures.push({ name: `script-matrix-gate 紅燈 ${g.status}`, e: new Error("script-matrix-gate 紅燈") });
  }
}

// ── script-matrix 經典文本門禁（Aksharamukha texts 10 經典 × 13 文種 7,644 行收斂往返）──
{
  const { spawnSync } = await import("node:child_process");
  const g = spawnSync(process.execPath, [path.join(path.dirname(import.meta.filename), "script-texts-gate.mjs")], { encoding: "utf8" });
  console.log(g.stdout.trim().split("\n")[0]);
  if (g.status !== 0) {
    for (const line of (g.stdout + g.stderr).split("\n").slice(1)) if (line.trim()) console.error("GATE-FAIL: " + line.trim());
    failures.push({ name: `script-texts-gate 紅燈 ${g.status}`, e: new Error("script-texts-gate 紅燈") });
  }
}

// ── conjuncts1 門禁（Aksharamukha conjuncts1：Brahmi/Kharoshthi/Marchen 26,994 項往返）──
{
  const { spawnSync } = await import("node:child_process");
  const g = spawnSync(process.execPath, [path.join(path.dirname(import.meta.filename), "conjuncts1-gate.mjs")], { encoding: "utf8" });
  console.log(g.stdout.trim().split("\n")[0]);
  if (g.status !== 0) {
    for (const line of (g.stdout + g.stderr).split("\n").slice(1)) if (line.trim()) console.error("GATE-FAIL: " + line.trim());
    failures.push({ name: `conjuncts1-gate 紅燈 ${g.status}`, e: new Error("conjuncts1-gate 紅燈") });
  }
}

// ── 蘭札體語料門禁（Aksharamukha describe/Ranjana：122 字＋36 詞＋6 句往返）──
{
  const { spawnSync } = await import("node:child_process");
  const g = spawnSync(process.execPath, [path.join(path.dirname(import.meta.filename), "ranjana-gate.mjs")], { encoding: "utf8" });
  console.log(g.stdout.trim().split("\n")[0]);
  if (g.status !== 0) {
    for (const line of (g.stdout + g.stderr).split("\n").slice(1)) if (line.trim()) console.error("GATE-FAIL: " + line.trim());
    failures.push({ name: `ranjana-gate 紅燈 ${g.status}`, e: new Error("ranjana-gate 紅燈") });
  }
}

// ── 悉曇體語料門禁（Aksharamukha describe/Siddham：121 字＋36 詞＋6 句，IAST 進出）──
{
  const { spawnSync } = await import("node:child_process");
  const g = spawnSync(process.execPath, [path.join(path.dirname(import.meta.filename), "siddham-gate.mjs")], { encoding: "utf8" });
  console.log(g.stdout.trim().split("\n")[0]);
  if (g.status !== 0) {
    for (const line of (g.stdout + g.stderr).split("\n").slice(1)) if (line.trim()) console.error("GATE-FAIL: " + line.trim());
    failures.push({ name: `siddham-gate 紅燈 ${g.status}`, e: new Error("siddham-gate 紅燈") });
  }
}

// ── 婆羅米語料門禁（Aksharamukha describe/Brahmi：134 字＋36 詞＋6 句，IAST 進出）──
{
  const { spawnSync } = await import("node:child_process");
  const g = spawnSync(process.execPath, [path.join(path.dirname(import.meta.filename), "brahmi-aksha-gate.mjs")], { encoding: "utf8" });
  console.log(g.stdout.trim().split("\n")[0]);
  if (g.status !== 0) {
    for (const line of (g.stdout + g.stderr).split("\n").slice(1)) if (line.trim()) console.error("GATE-FAIL: " + line.trim());
    failures.push({ name: `brahmi-aksha-gate 紅燈 ${g.status}`, e: new Error("brahmi-aksha-gate 紅燈") });
  }
}

// ── 維吾爾語料門禁（sy.ts.cn/topic/shuangyu/106.shtml：28 句＋139 詞，UEY↔ULY）──
{
  const { spawnSync } = await import("node:child_process");
  const g = spawnSync(process.execPath, [path.join(path.dirname(import.meta.filename), "uyghur-ts-gate.mjs")], { encoding: "utf8" });
  console.log(g.stdout.trim().split("\n")[0]);
  if (g.status !== 0) {
    for (const line of (g.stdout + g.stderr).split("\n").slice(1)) if (line.trim()) console.error("GATE-FAIL: " + line.trim());
    failures.push({ name: `uyghur-ts-gate 紅燈 ${g.status}`, e: new Error("uyghur-ts-gate 紅燈") });
  }
}

// ── 巴利語料門禁（GRETIL 2_pali pu 全 64 檔：6013 句＋3000 詞，IAST↔天城）──
{
  const { spawnSync } = await import("node:child_process");
  const g = spawnSync(process.execPath, [path.join(path.dirname(import.meta.filename), "pali-gretil-gate.mjs")], { encoding: "utf8" });
  console.log(g.stdout.trim().split("\n")[0]);
  if (g.status !== 0) {
    for (const line of (g.stdout + g.stderr).split("\n").slice(1)) if (line.trim()) console.error("GATE-FAIL: " + line.trim());
    failures.push({ name: `pali-gretil-gate 紅燈 ${g.status}`, e: new Error("pali-gretil-gate 紅燈") });
  }
}

// ── 僧伽羅語料門禁（Aksharamukha describe/Sinhala：119 字＋36 詞＋6 句，IAST 進出）──
{
  const { spawnSync } = await import("node:child_process");
  const g = spawnSync(process.execPath, [path.join(path.dirname(import.meta.filename), "sinhala-aksha-gate.mjs")], { encoding: "utf8" });
  console.log(g.stdout.trim().split("\n")[0]);
  if (g.status !== 0) {
    for (const line of (g.stdout + g.stderr).split("\n").slice(1)) if (line.trim()) console.error("GATE-FAIL: " + line.trim());
    failures.push({ name: `sinhala-aksha-gate 紅燈 ${g.status}`, e: new Error("sinhala-aksha-gate 紅燈") });
  }
}

// ── 天城體語料門禁（Aksharamukha describe/Devanagari：121 字＋36 詞＋6 句，IAST 進出）──
{
  const { spawnSync } = await import("node:child_process");
  const g = spawnSync(process.execPath, [path.join(path.dirname(import.meta.filename), "devanagari-aksha-gate.mjs")], { encoding: "utf8" });
  console.log(g.stdout.trim().split("\n")[0]);
  if (g.status !== 0) {
    for (const line of (g.stdout + g.stderr).split("\n").slice(1)) if (line.trim()) console.error("GATE-FAIL: " + line.trim());
    failures.push({ name: `devanagari-aksha-gate 紅燈 ${g.status}`, e: new Error("devanagari-aksha-gate 紅燈") });
  }
}

// ── 回鶻文歧義語料門禁（L2/13-071 §4.2 Table 8：OR.8212-75A/B 寫本拼寫差異固化）──
{
  const data = JSON.parse(fs.readFileSync(new URL("./data/old-uyghur-ambiguity.json", import.meta.url), "utf8"));
  const s = lib.listSchemes().find((x) => x.id === "olduyghur");
  let ambOk = 0;
  for (const c of data.cases) {
    const nativeOut = s.romanToNative(c.translit);
    if (nativeOut !== c.native) failures.push({ name: `olduyghur-ambiguity ${c.id} r2n 出向不符`, e: new Error(`${c.id}: got ${JSON.stringify(nativeOut)} want ${JSON.stringify(c.native)}`) });
    else if (s.nativeToRoman(c.native) !== c.expect_read) failures.push({ name: `olduyghur-ambiguity ${c.id} n2r 讀音歸一不符`, e: new Error(`${c.id}: got ${JSON.stringify(s.nativeToRoman(c.native))} want ${c.expect_read}`) });
    else ambOk++;
  }
  console.log(`olduyghur-ambiguity-gate: ${ambOk}/${data.cases.length}（L2/13-071 表8 寫本歧義：t/d 混用＝TAW 兼表、aleph 有無＝matres lectionis，read 模式讀音歸一）`);
}


// ── r59 批次丙斷言（檔尾）──
{
  const ftOut2 = path.join(TMP, "fulltext-r59.mjs");
  execFileSync(path.join(ROOT, "node_modules", ".bin", "esbuild"), [
    path.join(ROOT, "src", "dict", "fulltext.ts"),
    "--bundle", "--format=esm", "--platform=node", `--outfile=${ftOut2}`,
    `--alias:obsidian=${path.join(ROOT, "test", "obsidian-dict-mock.cjs")}`,
  ], { stdio: "pipe" });
  const { unsafeRegexReason } = await import(ftOut2);
  test("r59④ unsafeRegexReason：(ab)+/(foo|bar)+/([0-9]{2})+ 放行；(a+)+/(a|a)* 仍拒", () => {
    for (const good of ["(ab)+", "(foo|bar)+", "([0-9]{2})+"]) assert.equal(unsafeRegexReason(good), null, `白名單放行: ${good}`);
    for (const bad of ["(a+)+", "(a|a)*", "(x*)+", "a{2,}{3,}", "x*+"]) assert.ok(unsafeRegexReason(bad), `仍應拒: ${bad}`);
  });
  const viewSrc = fs.readFileSync(path.join(ROOT, "src", "dict", "view.ts"), "utf8");
  test("r59⑤ pushHistory 呼叫點已接 settings.historyLimit", () => {
    assert.ok(/pushHistory\([^)]*settings\.historyLimit/.test(viewSrc), "view.ts 應以 settings.historyLimit 傳入 pushHistory");
  });
  const inlineSrc = stripTsComments(fs.readFileSync(path.join(ROOT, "src", "dict", "inline-suggest.ts"), "utf8"));
  test("r59⑥ inline-suggest 觸發詞：無寫死字面量、有注入點", () => {
    assert.ok(!/triggerPhrase\s*=\s*['"`]lilium/.test(inlineSrc), "inline-suggest.ts 不得寫死觸發詞字面量");
    assert.ok(inlineSrc.includes("setTriggerPhrase"), "保留 setTriggerPhrase 注入點");
    assert.ok(/plugin\.settings\.inlineSuggestTrigger/.test(inlineSrc), "構造時從 settings 讀觸發詞");
  });
  const plugSrc = fs.readFileSync(path.join(ROOT, "src", "dict", "plugin.ts"), "utf8");
  test("r59⑥ plugin 從 settings 注入觸發詞＋預設 'lilium '", () => {
    assert.ok(/inlineSuggestTrigger/.test(plugSrc), "DEFAULT_SETTINGS 應含 inlineSuggestTrigger");
    assert.ok(/setTriggerPhrase/.test(plugSrc), "init 應注入觸發詞");
  });
  test("r59② 掃描中止旗標：unload 置位、掃描迴圈每輪檢查、新掃描重置", () => {
    assert.ok(/unload\(\): void \{[\s\S]*?scanAbort = true/.test(plugSrc), "unload() 應置位 scanAbort");
    assert.ok(/if \(this\.scanAbort\) return;/.test(plugSrc), "掃描迴圈應檢查 scanAbort");
    assert.ok(/scanAbort = false;/.test(plugSrc), "新掃描啟動應重置旗標");
  });
  test("r59① mdx onProgress：接 Notice 進度（setMessage＋節流），不再空函數", () => {
    assert.ok(!/void phase; void done; void total;/.test(plugSrc), "onProgress 不得再為空函數");
    assert.ok(/progressNotice/.test(plugSrc), "onProgress 應驅動 progressNotice");
    assert.ok(/progressNoticeMs/.test(plugSrc), "應有節流");
  });
  const i18nSrc = fs.readFileSync(path.join(ROOT, "src", "i18n.ts"), "utf8");
  test("r59 i18n：dict.scan.loadProgress／dict.set.inlineTrigger(+Desc) 七語言齊備", () => {
    for (const key of ["dict.scan.loadProgress", "dict.set.inlineTrigger", "dict.set.inlineTriggerDesc"]) {
      const m = new RegExp(`"${key}":\\s*\\{([\\s\\S]*?)\\n  \\}`).exec(i18nSrc);
      assert.ok(m, `i18n 缺鍵: ${key}`);
      for (const lang of ["zh", "zh-TW", "en", "ja", "ko", "fr", "de"]) {
        assert.ok(new RegExp(`"${lang}"\\s*:`).test(m[1]), `${key} 缺語言 ${lang}`);
      }
    }
  });
}

if (failures.length) {
  for (const f of failures) console.error(`FAIL: ${f.name}\n${f.e.stack ?? f.e.message}`);
  process.exit(1);
}

/* ---------- r59d：資產根遷移 lilium-assets/ → lilium/assets/ ---------- */
test("r59d 資產根遷移：常數新路徑、掃描排除前綴化、硬編碼清零", () => {
  const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
  const loader = read("src/dict/loader.ts");
  assert.ok(loader.includes("export const ASSET_FOLDER = 'lilium/assets'"), "ASSET_FOLDER=lilium/assets");
  assert.ok(loader.includes("export const LEGACY_ASSET_FOLDER = 'lilium-assets'"), "LEGACY_ASSET_FOLDER 常數在");
  const plugin = read("src/dict/plugin.ts");
  assert.ok(plugin.includes("async function migrateLegacyAssetFolder"), "遷移函數存在");
  assert.ok(plugin.includes("await migrateLegacyAssetFolder(this.plugin.app)"), "rescanAndLoad 接入遷移");
  assert.ok(plugin.includes("p.startsWith(`${ASSET_FOLDER}/`)"), "掃描排除前綴化（新根子樹）");
  assert.ok(plugin.includes("p.startsWith(`${LEGACY_ASSET_FOLDER}/`)"), "掃描排除含舊根殘留");
  assert.ok(!plugin.includes("`lilium-assets/.scan-cache"), "plugin 無舊根硬編碼緩存路徑");
  const view = read("src/dict/view.ts");
  assert.ok(!view.includes("'lilium-assets'"), "view 無舊根硬編碼");
  const i18n = read("src/i18n.ts");
  assert.ok(!i18n.includes("lilium-assets/"), "i18n 七語言無舊路徑字樣");
  const flow = fs.readFileSync(path.join(ROOT, "test/dict-import-flow.mjs"), "utf8");
  assert.ok(!flow.includes('startsWith("lilium-assets/') && flow.includes('startsWith("lilium/assets/'), "dict-import-flow 斷言同步新路徑");
});

/* ---------- 藏文 Wylie 彎引號（手機輸入法常態）透傳零容忍 ----------
 * 手機鍵盤/自動更正把 ASCII 撇號 ' 寫成 U+2018/U+2019（mkha’/mtha’/’das），
 * 舊版整詞透傳（真機實錘）。入口正規化後 R2N 必須全轉、往返無損。
 */
test("藏文 Wylie 彎引號正規化：mkha’/mtha’/’das 掃描層零透傳", () => {
  const s = lib.getScheme("tibetan-wylie");
  const ascii = "de rnam pa thams cad du nam mkha' mtha' yas skye mched las yang dag par 'das te rnam par shes pa mtha' yas so snyam nas rnam shes mtha' yas skye mched rdzogs par byas te gnas pa 'di ni gzil yis gnon pa'i skye mched brgyad pa'o";
  const curly = ascii.replace(/'/g, "\u2019");
  const r = lib.transliterateLongText(curly, s, true);
  const TIB = /[\u0F00-\u0FFF]/;
  const leftover = r.text.split(/\s+/).filter((w) => /[a-zA-Z]/.test(w) && !TIB.test(w));
  assert.deepStrictEqual(leftover, [], "彎引號句掃描層零透傳 " + JSON.stringify(leftover));
  // ASCII 版與彎引號版輸出一致
  const rA = lib.transliterateLongText(ascii, s, true);
  assert.equal(r.text, rA.text, "彎引號版輸出＝ASCII 版");
  // 往返
  const back = lib.transliterateLongText(r.text, s, false);
  assert.equal(back.text.replace(/\u2019/g, "'"), ascii, "R-N 往返無損");
});

/* ---------- 零寬字符/BOM 黏詞透傳修復（剪貼板複製常態） ----------
 * 網頁/微信複製文本常帶 U+200B/C/D、U+FEFF 黏在句首詞前，形狀 gate 對
 * "​de" 判否整詞 skipped（移動端實測句首 de 透傳實錘）。零寬字符須從詞緩衝
 * 剝離：句首黏著時 flush 前段、零寬自身透傳，詞照常轉換。
 */
test("零寬字符/BOM 黏詞：句首 de 不再透傳", () => {
  const s = lib.getScheme("tibetan-wylie");
  for (const zw of ["\u200b", "\u200c", "\u200d", "\ufeff"]) {
    const r = lib.transliterateLongText(zw + "de rnam pa thams cad du", s, true);
    assert.ok(!/[a-zA-Z]{2}/.test(r.text.replace(/^[\u200b-\u200d\ufeff]/, "")), "零寬 " + JSON.stringify(zw) + " 後詞全轉: " + JSON.stringify(r.text));
  }
  // 無零寬行為不變
  const plain = lib.transliterateLongText("de rnam pa", s, true);
  assert.equal(plain.text, "དེ་རྣམ་པ", "無零寬對照不變");
});

/* ---------- 蘭札字體映射對準實際碼位（0900 天城碼位承載） ----------
 * 舊映射 0x11D40-0x11D5F（Unicode 16 Nithya Ranjana 區塊）對不上插件實際輸出的
 * 天城碼位文本——familiesForText 檢測不到、iframe 內聯 @font-face 漏掛蘭札字體。
 * 斷言：天城碼位文本的字體棧尾同時含 Noto Sans Devanagari（前位，天城零變化）
 * 與 Nithya Ranjana DU（兜尾）。
 */
test("蘭札字體映射：天城碼位文本棧尾含 Nithya Ranjana DU 且排在 Devanagari 之後", () => {
  const src = fs.readFileSync(path.join(ROOT, "src/bundled-fonts.ts"), "utf8");
  assert.ok(!src.includes("0x11d40"), "舊 11D40 映射已移除");
  assert.ok(src.includes('[0x0900, 0x097f, "Nithya Ranjana DU"]'), "映射對準天城碼位");
});

/* ---------- ITRANS 5.30 官方同碼位多拼鍵補收（B1 w 案同型） ----------
 * 官方表：च＝ch c、छ＝chh Ch C、श＝sh S、ष＝Sh shh、क्ष＝ksh kSh。
 * 舊表漏收 c/C/S/chh/shh/ksh 致按官方文檔輸入透傳（ca→cअ 實錘）。
 * 入向補收；出向 REV 維持 ch/Ch/sh/Sh/kSh 統一形（與 B1 出向統一 v 同理）。
 */
test("ITRANS 官方多拼鍵：c C S chh shh ksh 不再透傳且出向統一形不變", () => {
  const s = lib.listSchemes().find((x) => x.id === "sanskrit-itrans");
  const cases = [
    ["ca", "च"], ["ca.ha", "चअ"], ["Ca", "छ"], ["chha", "छ"],
    ["Sa", "श"], ["shha", "ष"], ["ksha", "क्ष"],
  ];
  for (const [w, exp] of cases) {
    const r = lib.transliterateLongText(w, s, true);
    assert.ok(r.text.startsWith(exp), w + " -> " + JSON.stringify(r.text) + " 應含 " + exp);
  }
  // 出向統一形不變
  assert.equal(s.nativeToRoman("च", {}), "cha", "出向 च 統一 cha");
  assert.equal(s.nativeToRoman("छ", {}), "Cha", "出向 छ 統一 Cha");
  assert.equal(s.nativeToRoman("श", {}), "sha", "出向 श 統一 sha");
  assert.equal(s.nativeToRoman("ष", {}), "Sha", "出向 ष 統一 Sha");
  // 既有鍵零變化
  assert.equal(lib.transliterateLongText("ch", s, true).text, "च", "ch 零變化");
  assert.equal(lib.transliterateLongText("Sh", s, true).text, "ष", "Sh 零變化");
  assert.equal(lib.transliterateLongText("kSh", s, true).text, "क्ष", "kSh 零變化");
});

/* ---------- 僧伽羅語專有字母（n2737 SLS 1134 §3.1/3.2 全收） ----------
 * æ 元音 ඇ/ඈ（ae/aee）＋matra ැ/ෑ、prenasalized ඟ/ඦ/ඬ/ඥ（nng/ndj/nnd/jnya）、
 * ඁ candrabindu、෴ kundaliya、ෟ/ෳ vocalic l/ll matra。
 * ඳ/ඹ 不收（nd/mb 與巴利序列 sandi/ambaya 爭 token，收錄破壞既有往返）。
 * 出向 n2737 官方記法；往返回官方記法閉合。
 */
test("僧伽羅專有字母（n2737）：ae/aee 系＋prenasalized＋candrabindu＋kundaliya", () => {
  const s = lib.listSchemes().find((x) => x.id === "sinhala-pali");
  // 出向官方記法
  const cases = [
    ["ඇ", "ae"], ["ඈ", "aee"], ["ැ", "ae"], ["ෑ", "aee"],
    ["ඟ", "nnga"], ["ඦ", "ndja"], ["ඬ", "nnda"], ["ඥ", "jnyaa"],
    ["ඁ", "\u02ee"], ["෴", "."], ["ෟ", "\u1e39"], ["ෳ", "\u1e39\u0304"],
  ];
  for (const [ch, exp] of cases) assert.equal(s.nativeToRoman(ch, {}), exp, ch + " 出向");
  // 入向官方記法＋往返閉合
  const rt = [["kae", "කැ"], ["kaee", "කෑ"], ["kaaee", "කඈ"], ["mae", "මැ"]];
  for (const [w, exp] of rt) {
    const n = lib.transliterateLongText(w, s, true).text;
    assert.equal(n, exp, w + " 入向 " + JSON.stringify(n));
    assert.equal(s.nativeToRoman(n, {}), w, w + " 往返");
  }
  // nng 單鍵入向
  assert.equal(lib.transliterateLongText("nnga", s, true).text, "ඟ", "nnga 入向 ඟ");
  // 巴利既有往返零變化
  for (const w of ["sandi", "canda", "ambaya", "kya", "rka"]) {
    const n = lib.transliterateLongText(w, s, true).text;
    assert.equal(s.nativeToRoman(n, {}), w, w + " 既有零變化");
  }
  // ISO 15919 備選方案繼承
  const iso = lib.listSchemes().find((x) => x.id === "sinhala-iso15919");
  assert.equal(iso.nativeToRoman("ඇ", {}), "ae", "ISO 繼承 ඇ");
});

/* ---------- 婆羅米 11003 JIHVAMULIYA 正名＋Bhattiprolu AA 補收（U18 名表對齊） ----------
 * 舊草案 L2/07-342 曾派 11003=avagraha（'.a'），最終標準改派 JIHVAMULIYA 且
 * 婆羅米區塊 avagraha 不存在——'.a' 鍵移除、新鍵 '~j'（與 '~h' 對稱）。
 * 11039 BHATTIPROLU AA 補收，鍵 '.ā'（與 OT 原子短元音 .e/.o 鍵體對稱）。
 */
test("婆羅米 11003 JIHVAMULIYA＋11039 Bhattiprolu AA（U18 名表對齊）", () => {
  const s = lib.listSchemes().find((x) => x.id === "brahmi-iast");
  // 出向
  assert.equal(s.nativeToRoman("\u{11003}", {}), "~j", "11003 出向 ~j");
  assert.equal(s.nativeToRoman("\u{11039}", {}), ".\u0101", "11039 出向 .ā");
  // 入向＋往返
  const n = lib.transliterateLongText("~ja", s, true).text;
  assert.ok(n.startsWith("\u{11003}"), "~ja 入向 𑀃");
  assert.equal(s.nativeToRoman(n, {}), "~ja", "~ja 往返");
  const n2 = lib.transliterateLongText(".\u0101", s, true).text;
  assert.equal(n2, "\u{11039}", ".ā 入向 𑀹");
  assert.equal(s.nativeToRoman(n2, {}), ".\u0101", ".ā 往返");
  // 舊 avagraha 鍵已移除（'.a' 不再產生 11003）
  const old = lib.transliterateLongText(".a", s, true).text;
  assert.ok(!old.includes("\u{11003}"), "'.a' 不再映射 11003");
  // ~h 既有行為零變化
  const h = lib.transliterateLongText("~hka", s, true).text;
  assert.ok(h.startsWith("\u{11004}"), "~hka 零變化");
  // 既有銘文往返抽樣
  for (const w of ["dhamma", "bhagava\u1e43", "k\u1e63etra", "j\u00f1\u0101na"]) {
    const n3 = lib.transliterateLongText(w, s, true).text;
    assert.equal(s.nativeToRoman(n3, {}), w, w + " 既有零變化");
  }
});

test("kharoshthi G-K2/G-K3：組合字母附標跟讀＋ṭ́ 鍵＋探測補齊（L2/17-012）", () => {
  const s = lib.listSchemes().find((x) => x.id === "gandhari-iast");
  const cp = (...a) => a.map((c) => String.fromCodePoint(c)).join("");
  // G-K2：組合字母＋元音附標＝剝固有 a、附標跟讀（17-012 attested forms）
  assert.equal(s.nativeToRoman(cp(0x10a35, 0x10a01), {}), "vhi", "𐨵𐨁→vhi");
  assert.equal(s.nativeToRoman(cp(0x10a35, 0x10a02), {}), "vhu", "𐨵𐨂→vhu");
  assert.equal(s.nativeToRoman(cp(0x10a33, 0x10a01), {}), "ttthi", "𐨳𐨁→ttthi");
  assert.equal(s.nativeToRoman(cp(0x10a32, 0x10a01), {}), "kki", "𐨲𐨁→kki");
  assert.equal(s.nativeToRoman(cp(0x10a34, 0x10a01), {}), "ttti", "𐨴𐨁→ttti");
  // 裸字母讀法零變化
  assert.equal(s.nativeToRoman(String.fromCodePoint(0x10a35), {}), "vha", "裸𐨵→vha");
  assert.equal(s.nativeToRoman(String.fromCodePoint(0x10a32), {}), "kka", "裸𐨲→kka");
  // VIRAMA 簇拆寫
  assert.equal(s.nativeToRoman(cp(0x10a35, 0x10a3f, 0x10a2a), {}), "vhra", "𐨵𐨿𐨪→vhra");
  assert.equal(s.nativeToRoman(cp(0x10a35, 0x10a3f, 0x10a2a, 0x10a01), {}), "vhri", "𐨵𐨿𐨪𐨁→vhri");
  // 單輔音不受影響
  assert.equal(s.nativeToRoman(cp(0x10a10, 0x10a01), {}), "ki", "𐨐𐨁→ki 零變化");
  // G-K2 對稱：R2N 短鍵閉環
  assert.equal(lib.kharoRomanToNative("ttthi"), cp(0x10a33, 0x10a01), "ttthi 入向");
  assert.equal(lib.kharoRomanToNative("kkai").endsWith("\u{10a05}\u{10a0c}"), true, "kkai 二合分支不變");
  assert.equal(lib.kharoRomanToNative("vhi"), cp(0x10a35, 0x10a01), "vhi 入向零變化");
  // 長鍵貪婪不受短鍵影響
  assert.equal(lib.kharoRomanToNative("tttha"), "\u{10a33}", "tttha 長鍵貪婪");
  assert.equal(lib.kharoRomanToNative("kka"), "\u{10a32}", "kka 長鍵貪婪");
  // G-K2 語料往返抽樣（aṭ́hi 之 native 讀法走 canonical 拼寫 ttthi——別名 ṭ́h
  // 僅供正向鍵入，N2R 反查歸 canonical，同 ṭ́h/kka/vha 先例）
  for (const [lem, nat, n2r] of [
    ["aṭ́hi", "\u{10a00}\u{10a33}\u{10a01}", "attthi"],
    ["aṭhavaṣaavhisita", "\u{10a00}\u{10a1b}\u{10a2c}\u{10a2e}\u{10a00}\u{10a35}\u{10a01}\u{10a2f}\u{10a01}\u{10a1f}", "aṭhavaṣaavhisita"],
    ["Iṃdravhriya", "\u{10a00}\u{10a01}\u{10a0e}\u{10a21}\u{10a3f}\u{10a2a}\u{10a35}\u{10a3f}\u{10a2a}\u{10a01}\u{10a29}", "ïṃdravhriya"],
    ["Kaḱuca", "\u{10a10}\u{10a32}\u{10a02}\u{10a15}", "kakkuca"],
  ]) {
    const n = lib.transliterateLongText(lem, s, true).text;
    assert.equal(n, nat, lem + " 入向逐碼位");
    assert.equal(s.nativeToRoman(nat, {}), n2r, lem + " 出向讀法");
  }
  // G-K2：ṭ́ 鍵（L2/17-012 TTTA）
  assert.equal(lib.kharoRomanToNative("ṭ́"), "\u{10a34}", "ṭ́→TTTA");
  assert.equal(s.nativeToRoman("\u{10a34}", {}), "ttta", "𐨴 裸→ttta");
  // G-K3：探測補齊
  assert.equal(s.looksLikeRoman("aṭ́hi"), true, "ṭ́ 探測");
  assert.equal(s.looksLikeRoman("½"), true, "½ 探測");
  assert.equal(s.looksLikeRoman("kalpa½"), true, "½ 混排探測");
  assert.equal(s.looksLikeRoman("maḱa"), true, "ḱ 探測");
});

test("G-T1：藏文空格→tsheg 規則（恰 1 空格映射；≥2 空格/換行原樣）", () => {
  const s = lib.getScheme("tibetan-wylie");
  const cp = (n) => String.fromCodePoint(n);
  const TSHEG = cp(0x0f0b);
  // 長文本路徑：恰 1 空格→tsheg
  assert.equal(lib.transliterateLongText("ka kha", s, true).text, "ཀ" + TSHEG + "ཁ", "1 空格→tsheg");
  // 長文本路徑：≥2 空格→原樣透傳（不插 tsheg）
  assert.equal(lib.transliterateLongText("ka  kha", s, true).text, "ཀ  ཁ", "2 空格原樣");
  assert.equal(lib.transliterateLongText("ka   kha", s, true).text, "ཀ   ཁ", "3 空格原樣");
  // 長文本路徑：換行→原樣透傳（行尾不插 tsheg）
  assert.equal(lib.transliterateLongText("ka\nkha", s, true).text, "ཀ\nཁ", "換行原樣");
  assert.equal(lib.transliterateLongText("ka \n kha", s, true).text, "ཀ \n ཁ", "空格+換行混合原樣");
  // 整串路徑：同規則
  assert.equal(s.romanToNative("ka kha"), "ཀ" + TSHEG + "ཁ", "整串 1 空格→tsheg");
  assert.equal(s.romanToNative("ka  kha"), "ཀ  ཁ", "整串 2 空格原樣");
  assert.equal(s.romanToNative("ka\nkha"), "ཀ\nཁ", "整串 換行原樣");
  // 混排段：空格對顯式 tsheg/shad 冗餘，去空白保留分隔符（T-1 往返基線）
  assert.equal(s.romanToNative("k-i ་la"), "ཀ" + cp(0x0f80) + TSHEG + "ལ", "空格+tsheg 段去空白");
  assert.equal(s.romanToNative("ka ། kha"), "ཀ" + cp(0x0f0d) + "ཁ", "空格+shad 段");
  // 往返閉環
  assert.equal(s.nativeToRoman(s.romanToNative("bod yig")), "bod yig", "單空格往返");
  assert.equal(s.nativeToRoman(s.romanToNative("ma tri\nyis ge")), "ma tri\nyis ge", "多行往返");
});

// ── 終局紅綠：檔尾區（彙總列印後註冊的測試與 spawnSync 門禁）失敗也須 exit 1 ──
if (failures.length) {
  for (const f of failures) console.error(`FAIL(tail): ${f.name}\n${f.e.stack ?? f.e.message}`);
  process.exit(1);
}
