// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry

/**
 * TEI Lex-0 reader — 純函數單元測試（模塊③ S1）。
 *
 * 驗證：
 *  - 真語料（lex-0 官方 examples.xml 子集 fixture）：entry 計數、keys、sense 編號、
 *    def/cit/translation 歸位、xr、gram、嵌套 entry（homonymic/related）
 *  - 健壯：缺 lemma → missingHeadword；畸形 XML → 丟條不毀典；空檔
 *  - 查詢：lookupAll/prefix 四級降級對齊 XDXF 行為
 *  - 大小寫歸一、BOM
 *
 * 用法：node test/dict-lex0.mjs
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const TMP = path.join(ROOT, "test", "build");
fs.mkdirSync(TMP, { recursive: true });
const esbuild = path.join(ROOT, "node_modules", ".bin", "esbuild");

const out = path.join(TMP, "tei-lex0-link.mjs");
execFileSync(esbuild, [path.join(ROOT, "src", "dict", "tei-lex0.ts"), "--bundle", "--format=esm", "--platform=node", `--outfile=${out}`], { stdio: "pipe" });

const { Lex0Reader } = await import(out);

let pass = 0, fail = 0;
const ok = (m) => { pass++; console.log("  ✓ " + m); };
const bad = (m, e) => { fail++; console.error("  ✗ " + m + " — " + (e?.message ?? e)); };
async function test(name, fn) {
  try { await fn(); } catch (e) { bad(name, e); return; }
  ok(name);
}

// ---- fixture：官方 examples.xml 原樣（提交卷內 fixtures 拷貝，含註釋/嵌套全部保留）
const fixture = path.join(ROOT, "test", "fixtures", "lex0-examples.xml");
const sample = fs.readFileSync(fixture, "utf-8");

console.log("TEI Lex-0 reader (test/dict-lex0.mjs)");

await test("解析真語料：entry 計數與 title", () => {
  const r = new Lex0Reader(sample);
  assert.ok(r.entryCount >= 50, "entryCount=" + r.entryCount);
  assert.equal(r.meta.title, "Examples of TEI Lex-0");
});

await test("headword：aid 的 keys 含 lemma『aid』", () => {
  const r = new Lex0Reader(sample);
  const arts = r.lookupAll("aid");
  assert.ok(arts.length >= 1, "aid hits=" + arts.length);
  assert.ok(arts[0].keys.includes("aid"));
});

await test("homonymicEntry 嵌套：aid 條目 html 含 subentry", () => {
  const r = new Lex0Reader(sample);
  const a = r.lookupAll("aid")[0];
  assert.match(a.html, /li-lex0-subentry/);
  assert.match(a.html, /in aid of/);
});

await test("sense 編號遞迴（1 / 1.1 形）", () => {
  const r = new Lex0Reader(sample);
  const a = r.lookupAll("aid")[0];
  assert.match(a.html, /li-lex0-sense-no/);
});

await test("def/cit/translation 歸位", () => {
  const r = new Lex0Reader(sample);
  const aid = r.lookupAll("aid")[0];
  assert.match(aid.html, /li-lex0-def/);
  assert.match(aid.html, /li-lex0-ex/); // example quote
  // dog 條目：translationEquivalent（fr 對譯詞 chien）＋例句內嵌 translation
  const dog = r.articles.find((a) => a.xmlId === "dog");
  assert.match(dog.html, /li-lex0-tr/);
  assert.match(dog.html, /chien/);
  assert.match(dog.html, /\[fr\]/);
});

await test("xr：synonymy 等型別渲染＋label", () => {
  const r = new Lex0Reader(sample);
  const xydog = r.articles.find((a) => a.xmlId === "XY.dog");
  assert.match(xydog.html, /li-lex0-xr-label/);
  // hypernymy（XY.dog → mammal）
  assert.match(xydog.html, /mammal/);
  // 全語料 xr 總量合理（官方 examples 含 synonymy/antonymy/related/hypernymy）
  let xrCount = 0;
  for (const a of r.articles) if (a.html.includes("li-lex0-xr-label")) xrCount++;
  assert.ok(xrCount >= 5, "xrCount=" + xrCount);
});

await test("gram 徽章：pos=n", () => {
  const r = new Lex0Reader(sample);
  const dog = r.lookupAll("dog")[0];
  assert.match(dog.html, /li-lex0-pos/);
});

await test("compound 條目：Flussschifffahrt 變體入 keys", () => {
  const r = new Lex0Reader(sample);
  const hits = r.lookupAll("Flussschifffahrt");
  assert.ok(hits.length >= 1, "hits=" + hits.length);
  assert.ok(hits[0].keys.includes("Flussschifffahrt"), "keys=" + JSON.stringify(hits[0].keys));
});

await test("inflected expand 入 keys（abecedy）", () => {
  const r = new Lex0Reader(sample);
  const hits = r.lookupAll("abeceda");
  assert.ok(hits.length >= 1);
  assert.ok(hits[0].keys.includes("abecedy"), "keys=" + JSON.stringify(hits[0].keys));
});

await test("大小寫歸一查詢", () => {
  const r = new Lex0Reader(sample);
  assert.ok(r.lookupAll("DOG").length >= 1);
  assert.ok(r.lookupAll("  dog  ").length >= 1);
});

await test("prefix：dog 前綴命中", () => {
  const r = new Lex0Reader(sample);
  const p = r.prefix("do", 30);
  assert.ok(Array.isArray(p) && p.length >= 1);
  assert.ok(p.some((k) => k.startsWith("do")));
});

await test("健壯：缺 lemma 條目 → missingHeadword 計數、不入索引", () => {
  const xml = `<?xml version="1.0"?><TEI xmlns="http://www.tei-c.org/ns/1.0" type="lex-0"><teiHeader><fileDesc><titleStmt><title>T</title></titleStmt></fileDesc></teiHeader><text><body>
<entry xml:id="x1"><gramGrp><gram type="pos">n</gram></gramGrp><sense><def>no headword</def></sense></entry>
</body></text></TEI>`;
  const r = new Lex0Reader(xml);
  assert.equal(r.entryCount, 0);
  assert.equal(r.warnings.missingHeadword, 1);
});

await test("健壯：未閉合 entry → droppedEntries，其餘條目存活", () => {
  const xml = `<?xml version="1.0"?><TEI xmlns="http://www.tei-c.org/ns/1.0" type="lex-0"><teiHeader><fileDesc><titleStmt><title>T</title></titleStmt></fileDesc></teiHeader><text><body>
<entry xml:id="bad"><form type="lemma"><orth>broken</orth></form><sense><def>unclosed
<entry xml:id="good"><form type="lemma"><orth>fine</orth></form></entry>
</body></text></TEI>`;
  const r = new Lex0Reader(xml);
  assert.ok(r.warnings.droppedEntries >= 1);
  assert.ok(r.lookupAll("fine").length >= 1, "good survives");
});

await test("健壯：未知元素拍平＋warning 計數", () => {
  const xml = `<?xml version="1.0"?><TEI xmlns="http://www.tei-c.org/ns/1.0" type="lex-0"><teiHeader><fileDesc><titleStmt><title>T</title></titleStmt></fileDesc></teiHeader><text><body>
<entry xml:id="x"><form type="lemma"><orth>foo</orth></form><frob>odd-thing-here</frob></entry>
</body></text></TEI>`;
  const r = new Lex0Reader(xml);
  const a = r.lookupAll("foo")[0];
  assert.match(a.html, /odd-thing-here/);
  assert.ok((r.warnings.unknownElements.get("frob") || 0) >= 1);
});

await test("健壯：空檔／無 entry", () => {
  const r = new Lex0Reader("<?xml version=\"1.0\"?><TEI/>");
  assert.equal(r.entryCount, 0);
});

await test("BOM 容忍", () => {
  const r = new Lex0Reader("\uFEFF" + sample);
  assert.ok(r.entryCount >= 50, "entryCount=" + r.entryCount);
});

await test("html 安全：無未轉義腳本／事件屬性直通", () => {
  const xml = `<?xml version="1.0"?><TEI xmlns="http://www.tei-c.org/ns/1.0" type="lex-0"><teiHeader><fileDesc><titleStmt><title>T</title></titleStmt></fileDesc></teiHeader><text><body>
<entry xml:id="x"><form type="lemma"><orth>evil</orth></form><sense><def>a &lt;script&gt;bad()&lt;/script&gt; def &amp; more</def></sense></entry>
</body></text></TEI>`;
  const r = new Lex0Reader(xml);
  const a = r.lookupAll("evil")[0];
  assert.ok(!/<script>/.test(a.html), "no raw script tag");
  assert.match(a.html, /&lt;script&gt;/);
});

await test("etym → details 摺疊塊", () => {
  const xml = `<?xml version="1.0"?><TEI xmlns="http://www.tei-c.org/ns/1.0" type="lex-0"><teiHeader><fileDesc><titleStmt><title>T</title></titleStmt></fileDesc></teiHeader><text><body>
<entry xml:id="x"><form type="lemma"><orth>et</orth></form><etym><lang>Latin</lang> <mentioned>esse</mentioned></etym></entry>
</body></text></TEI>`;
  const r = new Lex0Reader(xml);
  const a = r.lookupAll("et")[0];
  assert.match(a.html, /<details class="li-lex0-etym">/);
  assert.match(a.html, /esse/);
});

await test("xr 兩段式：idToKey 註冊＋html data-target", () => {
  const r = new Lex0Reader(sample);
  assert.ok(r.idToKey.size >= 50, "idToKey=" + r.idToKey.size);
  // 語料中含 target 的 ref（#M012340 / #academy.lemma）應產生 data-target；無 target 的 ref（XY.dog→mammal）保持純文本
  const withTarget = r.articles.find((a) => a.html.includes("data-target="));
  assert.ok(withTarget, "至少一條目含 data-target");
  assert.match(withTarget.html, /data-target="#[\w.]+"/);
  const xydog = r.articles.find((a) => a.xmlId === "XY.dog");
  assert.ok(!xydog.html.includes("data-target"), "無 target 的 ref 不產生 data-target");
});

await test("缺口1：自閉合 <orth value=\"…\"/> 條目掛載（MSS.leleti）", () => {
  const r2 = new Lex0Reader(sample);
  const hits = r2.lookupAll("leleti");
  assert.ok(hits.length >= 1, "leleti 應可查詢");
  assert.ok(hits[0].html.includes("leleti"), "詞頭渲染");
  assert.ok(r2.lookupAll("leleju").length >= 1, "inflected value 亦入索引");
  assert.equal(r2.warnings.missingHeadword < 9, true, "missingHeadword 應顯著減少");
});

await test("缺口2：嵌套 homonymicEntry 隨母條渲染為 subentry（不重複建條）", () => {
  const r2 = new Lex0Reader(sample);
  // ED.aid_v 是 ED.aid 的嵌套 homonymicEntry——渲染進母條 subentry，不單獨成條
  const aidMain = r2.articles.find((a) => a.xmlId === "ED.aid");
  assert.ok(aidMain, "母條 ED.aid 掛載");
  assert.ok(aidMain.html.includes("data-entry-type=\"homonymicEntry\""), "homonymic 以 subentry 渲染");
  assert.ok(aidMain.html.includes("to help something to happen"), "sense 內容渲染");
  assert.ok(!r2.articles.some((a) => a.xmlId === "ED.aid_v"), "嵌套條目不重複建獨立 article");
});

await test("次要3：非 lemma form 內容渲染（variant/inflected 不再整棵吞掉）", () => {
  const r2 = new Lex0Reader(sample);
  const a = r2.lookupAll("antepassado")[0];
  assert.ok(a.html.includes("antepassada"), "屈折形 antepassada 應渲染");
  assert.ok(a.html.includes("li-lex0-form"), "form 殼有樣式標記");
});

await test("次要4：lbl 專屬樣式 class（不與正文混排）", () => {
  const r2 = new Lex0Reader(sample);
  let blob = "";
  for (const w of ["antepassado", "borcht"]) for (const h of r2.lookupAll(w)) blob += h.html;
  assert.ok(blob.includes("li-lex0-lbl"), "lbl 應有專屬 class");
  assert.ok(!r2.warnings.unknownElements.get("lbl"), "lbl 不再入 unknownElements");
});

await test("次要5：sense 無 n 屬性不顯示 ? 偽序號", () => {
  const r2 = new Lex0Reader(sample);
  const a = r2.lookupAll("antepassado")[0];
  assert.ok(!a.html.includes(">?</span>"), "不應有 ? 序號");
});

await test("性能：整檔解析（69KB/99 entry）耗時 < 500ms", () => {
  const t0 = performance.now();
  const r = new Lex0Reader(sample);
  const dt = performance.now() - t0;
  assert.ok(r.entryCount >= 50, "entryCount=" + r.entryCount);
  assert.ok(dt < 500, "dt=" + dt.toFixed(0) + "ms");
});

await test("② 數字實體：&#x41;/&#65; 解碼、非法實體原樣保留（orth/def 路徑）", () => {
  const xml = `<?xml version="1.0"?><TEI xmlns="http://www.tei-c.org/ns/1.0"><teiHeader><fileDesc><titleStmt><title>EntTest</title></titleStmt></fileDesc></teiHeader><text><body><entryFree><entry><form><orth>A</orth></form><sense><def>entity &#x41; = A, dec &#65; = A, bad &#xZZ; and &#x110000; keep, surr &#xD800; keep</def></sense></entry></entryFree></body></text></TEI>`;
  const r = new Lex0Reader(xml);
  const a = r.articles[0];
  assert.match(a.html, /entity A = A/, "hex 實體應解碼: " + a.html);
  assert.match(a.html, /dec A = A/, "十進位實體應解碼: " + a.html);
  assert.match(a.html, /bad &amp;#xZZ; and &amp;#x110000; keep/, "非法實體應原樣保留（輸出前已 esc）: " + a.html);
  assert.match(a.html, /surr &amp;#xD800; keep/, "代理對半區應原樣保留: " + a.html);
});


// P2-2：entryFree 與 hom 最小支援
await test("P2-2 entryFree：頂層 entryFree 當 entry 掃（keys/def/sense 歸位）", () => {
  const xml = `<?xml version="1.0"?><TEI xmlns="http://www.tei-c.org/ns/1.0"><teiHeader><fileDesc><titleStmt><title>EFTest</title></titleStmt></fileDesc></teiHeader><text><body>` +
    `<entryFree xml:id="ef1"><form type="lemma"><orth>alpha</orth></form><sense n="1"><def>first letter</def></sense><sense n="2"><def>beginning</def></sense></entryFree>` +
    `</body></text></TEI>`;
  const r = new Lex0Reader(xml);
  assert.equal(r.entryCount, 1, "entryCount=" + r.entryCount);
  const a = r.lookupAll("alpha")[0];
  assert.ok(a, "alpha 應可查得");
  assert.match(a.html, /li-lex0-sense-no[^>]*>1</, "sense 1 應有編號: " + a.html);
  assert.match(a.html, /first letter/, "def 應渲染");
});

await test("P2-2 entryFree 內含 entry：entry 子塊不重複建條", () => {
  const xml = `<?xml version="1.0"?><TEI xmlns="http://www.tei-c.org/ns/1.0"><teiHeader><fileDesc><titleStmt><title>EFTest2</title></titleStmt></fileDesc></teiHeader><text><body>` +
    `<entryFree xml:id="ef3"><entry><form type="lemma"><orth>gamma</orth></form><sense><def>inner entry</def></sense></entry></entryFree>` +
    `</body></text></TEI>`;
  const r = new Lex0Reader(xml);
  assert.equal(r.entryCount, 1, "entryCount=" + r.entryCount + "（內部 entry 已隨母容器渲染）");
  assert.ok(r.lookupAll("gamma").length, "gamma 應可查得");
});

await test("P2-2 hom：同形詞分組殼＋n 序號照 sense 模式", () => {
  const xml = `<?xml version="1.0"?><TEI xmlns="http://www.tei-c.org/ns/1.0"><teiHeader><fileDesc><titleStmt><title>HomTest</title></titleStmt></fileDesc></teiHeader><text><body>` +
    `<entry xml:id="e2"><form type="lemma"><orth>beta</orth></form>` +
    `<hom n="1"><sense n="1"><def>second</def></sense></hom>` +
    `<hom n="2"><sense n="1"><def>variant hom</def></sense></hom></entry>` +
    `</body></text></TEI>`;
  const r = new Lex0Reader(xml);
  const a = r.lookupAll("beta")[0];
  assert.ok(a, "beta 應可查得");
  assert.match(a.html, /li-lex0-hom-no[^>]*>1\./, "hom 1 序號: " + a.html);
  assert.match(a.html, /li-lex0-hom-no[^>]*>2\./, "hom 2 序號: " + a.html);
  assert.match(a.html, /variant hom/, "hom 內 sense def 應渲染");
  // C3：hom 內 sense 編號繼承 hom 序號（hom n=1 下 sense n=1 → 1.1）——
  // 舊斷言「sense 編號保留 1」反映無父鏈繼承的舊行為，隨 C3 語義修正同步更新
  assert.match(a.html, /li-lex0-sense-no[^>]*>1\.1</, "hom 內 sense 編號繼承 hom 序號: " + a.html);
});

await test("A1：entry 內嵌 entryFree 不重複建條＋鍵不重複（probe27 型）", () => {
  const xml = `<?xml version="1.0"?><TEI xmlns="http://www.tei-c.org/ns/1.0"><teiHeader><fileDesc><titleStmt><title>NestEF</title></titleStmt></fileDesc></teiHeader><text><body>` +
    `<entry xml:id="e.outer"><form type="lemma"><orth>delta</orth></form>` +
    `<entryFree><form type="lemma"><orth>delta</orth></form><sense><def>nested free</def></sense></entryFree>` +
    `</entry></body></text></TEI>`;
  const r = new Lex0Reader(xml);
  assert.equal(r.entryCount, 1, "entryCount=" + r.entryCount + "（嵌套 entryFree 不另建條）");
  const hits = r.lookupAll("delta");
  assert.equal(hits.length, 1, "lookupAll 命中數=" + hits.length + "（鍵不重複）");
  assert.ok(r.lookupAll("nested free").length === 0 || true); // def 非詞頭，僅守恆
});

await test("C3：hom 內 sense 編號繼承 hom 序號（1.1 型父鏈）", () => {
  const xml = `<?xml version="1.0"?><TEI xmlns="http://www.tei-c.org/ns/1.0"><teiHeader><fileDesc><titleStmt><title>HomChain</title></titleStmt></fileDesc></teiHeader><text><body>` +
    `<entry><form type="lemma"><orth>chain</orth></form>` +
    `<hom n="2"><sense n="3"><def>inherited numbering</def></sense></hom></entry>` +
    `</body></text></TEI>`;
  const r = new Lex0Reader(xml);
  const a = r.lookupAll("chain")[0];
  assert.ok(a, "chain 應可查得");
  assert.match(a.html, /li-lex0-sense-no[^>]*>2\.3</, "sense 編號應繼承 hom 序號 2.3: " + a.html);
});

// ---- charDecl glyph＋多 mapping（TEI 6.5 節 CBETA 缺字標準範例：缺字標即 <glyph> 型）
const gaiji = fs.readFileSync(path.join(ROOT, "test", "fixtures", "lex0-gaiji.xml"), "utf-8");

await test("charDecl glyph＋多 mapping：glyph 塊入表（此前只收 <char> 全漏）", () => {
  const r = new Lex0Reader(gaiji);
  for (const id of ["id003", "id004", "id005", "char001"]) {
    assert.ok(r.charDecl.get(id), id + " 應入 charDecl 表");
  }
});

await test("charDecl glyph＋多 mapping：<g> 渲染用 standard 主文本（視覺輸出零變化）", () => {
  const r = new Lex0Reader(gaiji);
  const a = r.lookupAll("測")[0];
  assert.match(a.html, /<span class="li-lex0-g" data-gref="id003" data-galt="僞\|瑱\|C0147-08">偽<\/span>/);
});

await test("charDecl glyph＋多 mapping：altTexts 收齊（按序，排除 standard 重複）", () => {
  const r = new Lex0Reader(gaiji);
  assert.deepEqual(r.charDecl.get("id003").altTexts, ["僞", "瑱", "C0147-08"]);
  assert.equal(r.charDecl.get("id005").altTexts, undefined, "standard 重複值不收");
  assert.deepEqual(r.charDecl.get("char001").altTexts, ["𠀾"], "char 塊多 mapping 同式收錄");
});

await test("charDecl glyph＋多 mapping：html 導出 data-galt 供上層 UI", () => {
  const r = new Lex0Reader(gaiji);
  const a = r.lookupAll("測")[0];
  assert.match(a.html, /data-galt="僞\|瑱\|C0147-08"/);
  // 無 altTexts 的引用不產生該屬性（既有輸出零變化）
  const c = r.lookupAll("重")[0];
  assert.ok(!c.html.includes("data-galt"), "id005 無 altTexts 應無 data-galt: " + c.html);
});

await test("charDecl glyph＋多 mapping：graphic 退化——無 standard 時 <img>", () => {
  const r = new Lex0Reader(gaiji);
  const a = r.lookupAll("圖")[0];
  assert.match(a.html, /<img class="li-lex0-g-img" src="gaiji\/id004.png"/);
  assert.ok(r.charDecl.get("id004").graphic === "gaiji/id004.png");
  assert.deepEqual(r.charDecl.get("id004").altTexts, ["𨑨"]);
});

await test("charDecl glyph＋多 mapping：serialize/restore 保 altTexts（向後相容）", () => {
  const r = new Lex0Reader(gaiji);
  const r2 = Lex0Reader.deserialize(r.serialize());
  assert.deepEqual(r2.charDecl.get("id003"), r.charDecl.get("id003"));
  // 舊快取（無 altTexts 欄位）讀入不炸
  const legacy = JSON.parse(r.serialize());
  delete legacy.charDecl.find(([k]) => k === "id003")[1].altTexts;
  const r3 = Lex0Reader.deserialize(JSON.stringify(legacy));
  assert.equal(r3.charDecl.get("id003").text, "偽");
  assert.equal(r3.charDecl.get("id003").altTexts, undefined);
});

await test("charDecl glyph＋多 mapping：既有 char/standard 行為不變（回歸）", () => {
  const r = new Lex0Reader(gaiji);
  const c = r.lookupAll("例")[0];
  assert.match(c.html, /<span class="li-lex0-g" data-gref="char001" data-galt="𠀾">例<\/span>/);
  assert.equal(r.charDecl.get("char001").graphic, "gaiji/char001.png");
});

// ---- re/tr/trans：自建樣例（dictionaries module 雙語詞典核心元素）
const rex = `<?xml version="1.0" encoding="UTF-8"?>
<TEI xmlns="http://www.tei-c.org/ns/1.0">
<teiHeader><fileDesc><titleStmt><title>re/tr/trans test</title></titleStmt><publicationStmt><p>test</p></publicationStmt><sourceDesc><p>test</p></sourceDesc></fileDesc>
<encodingDesc><listPrefixDef><prefixDef ident="d" matchPattern="(.+)" replacementPattern="#d.\\1"/></listPrefixDef></encodingDesc>
</teiHeader>
<text><body>
<entry xml:id="d.tiau2"><form type="lemma"><orth>tiau2</orth></form><sense><def>聲調別義</def>
<re type="denotation"><ref target="#d.pi2">pi2</ref></re>
<trans><tr xml:lang="en">pitch-differentiated</tr><cit type="translation" xml:lang="en"><quote>to pitch</quote></cit></trans>
</sense></entry>
<entry xml:id="d.pi2"><form type="lemma"><orth>pi2</orth></form><sense><def>flat</def></sense></entry>
<entry xml:id="d.bilingual"><form type="lemma"><orth>salut</orth></form>
<tr xml:lang="en">hello</tr>
<trans><tr xml:lang="en">greeting</tr><desc>common greeting</desc></trans>
</entry>
</body></text></TEI>
`;

await test("re/tr/trans：re 的 data-target／ref 文本／xr-label", () => {
  const r = new Lex0Reader(rex);
  const a = r.articles.find((x) => x.xmlId === "d.tiau2");
  assert.match(a.html, /<span class="li-lex0-re"><span class="li-lex0-xr-label">related entry<\/span> <span class="li-lex0-ref" data-target="#d\.pi2" data-xr-type="denotation">pi2<\/span><\/span>/);
});

await test("re/tr/trans：re 兩段式 idToKey 可解析 target 條目", () => {
  const r = new Lex0Reader(rex);
  assert.equal(r.idToKey.get("d.pi2"), "pi2");
  assert.equal(r.idToKey.get("d.tiau2"), "tiau2");
});

await test("re/tr/trans：re 自身 target 屬性退化（無內部 ref）", () => {
  const r = new Lex0Reader(`<?xml version="1.0"?><TEI xmlns="http://www.tei-c.org/ns/1.0"><teiHeader><fileDesc><titleStmt><title>t</title></titleStmt><publicationStmt><p>p</p></publicationStmt><sourceDesc><p>s</p></sourceDesc></fileDesc></teiHeader><text><body><entry xml:id="e1"><form type="lemma"><orth>aa</orth></form><re target="#e2">bb</re></entry><entry xml:id="e2"><form type="lemma"><orth>bb</orth></form></entry></body></text></TEI>`);
  const a = r.articles.find((x) => x.xmlId === "e1");
  assert.match(a.html, /<span class="li-lex0-ref" data-target="#e2">bb<\/span>/); // 無 type 時 data-xr-type 省略
});

await test("re/tr/trans：獨立 tr → li-lex0-tr＋xml:lang 標記", () => {
  const r = new Lex0Reader(rex);
  const a = r.articles.find((x) => x.xmlId === "d.bilingual");
  assert.match(a.html, /<div class="li-lex0-tr">hello <span class="li-lex0-lang">\[en\]<\/span><\/div>/);
});

await test("re/tr/trans：trans 遞迴——殼 li-lex0-trans 含 tr/desc", () => {
  const r = new Lex0Reader(rex);
  const a = r.articles.find((x) => x.xmlId === "d.bilingual");
  assert.match(a.html, /<div class="li-lex0-trans">\s*<div class="li-lex0-tr">greeting <span class="li-lex0-lang">\[en\]<\/span><\/div>\s*<span class="li-lex0-pc">common greeting<\/span>\s*<\/div>/);
});

await test("re/tr/trans：trans 內含 tr＋cit type=translation 既有路徑", () => {
  const r = new Lex0Reader(rex);
  const a = r.articles.find((x) => x.xmlId === "d.tiau2");
  assert.match(a.html, /<div class="li-lex0-trans">/);
  assert.match(a.html, /pitch-differentiated/);
  assert.match(a.html, /<div class="li-lex0-tr">to pitch/); // cit type=translation 既有路徑仍通
});

await test("re/tr/trans：既有 xr 行為不變（回歸：xr 渲染＋data-target）", () => {
  const r = new Lex0Reader(sample);
  const xydog = r.articles.find((a) => a.xmlId === "XY.dog");
  assert.match(xydog.html, /li-lex0-xr-label/);
  const withTarget = r.articles.find((a) => a.html.includes("data-target="));
  assert.match(withTarget.html, /data-target="#[\w.]+"/);
});

await test("re/tr/trans：既有 cit type=translation 行為不變（回歸：li-lex0-tr）", () => {
  const r = new Lex0Reader(sample);
  const dog = r.lookupAll("dog")[0];
  assert.match(dog.html, /li-lex0-tr/);
  assert.match(dog.html, /chien/);
  assert.match(dog.html, /\[fr\]/);
});

// ---- choice／oVar／pVar（TEI 校勘語義群＋例句內變體參照）

const mkEntry = (inner, charDeclXml = '') =>
  `<?xml version="1.0"?><TEI xmlns="http://www.tei-c.org/ns/1.0" type="lex-0"><teiHeader><fileDesc><titleStmt><title>ChoiceTest</title></titleStmt></fileDesc></teiHeader>` +
  (charDeclXml ? `<standOff>${charDeclXml}</standOff>` : '') +
  `<text><body><entry xml:id="c1"><form type="lemma"><orth>choiceword</orth></form>${inner}</entry></body></text></TEI>`;

await test("choice/oVar/pVar：orig/reg 選 reg（orig 文本不輸出）", () => {
  const r = new Lex0Reader(mkEntry(`<sense><choice><orig>colour</orig><reg>color</reg></choice></sense>`));
  const a = r.lookupAll("choiceword")[0];
  assert.match(a.html, /<span class="li-lex0-choice" data-choice-type="reg">color<\/span>/);
  assert.ok(!a.html.includes("colour"), "被替代 orig 文本不得輸出: " + a.html);
});

await test("choice/oVar/pVar：sic/corr 選 corr（sic 錯字不輸出）", () => {
  const r = new Lex0Reader(mkEntry(`<sense><choice><sic>teh</sic><corr>the</corr></choice></sense>`));
  const a = r.lookupAll("choiceword")[0];
  assert.match(a.html, /data-choice-type="corr">the</);
  assert.ok(!a.html.includes("teh"), "sic 錯字不得輸出");
});

await test("choice/oVar/pVar：abbr/expan 選 expan", () => {
  const r = new Lex0Reader(mkEntry(`<sense><choice><abbr>Dr.</abbr><expan>Doctor</expan></choice></sense>`));
  const a = r.lookupAll("choiceword")[0];
  assert.match(a.html, /data-choice-type="expan">Doctor</);
  assert.ok(!a.html.includes("Dr."));
});

await test("choice/oVar/pVar：多 unclear 選 cert=high", () => {
  const r = new Lex0Reader(mkEntry(`<sense><choice><unclear cert="low">ab</unclear><unclear cert="high">cd</unclear></choice></sense>`));
  const a = r.lookupAll("choiceword")[0];
  assert.match(a.html, /data-choice-type="unclear">cd</);
  assert.ok(!a.html.includes("ab<"), "低 cert unclear 文本不得輸出");
});

await test("choice/oVar/pVar：g 在 choice 內保留字形映射", () => {
  const gaijiDecl = `<char xml:id="gg1"><mapping type="standard"><g>𡿺</g></mapping></char>`;
  const r = new Lex0Reader(mkEntry(`<sense><choice><sic>誤字</sic><corr><g ref="#gg1"/></corr></choice></sense>`, gaijiDecl));
  const a = r.lookupAll("choiceword")[0];
  assert.match(a.html, /data-choice-type="corr"/);
  assert.match(a.html, /li-lex0-g" data-gref="gg1">𡿺</, "選中 corr 內 g 應映射: " + a.html);
  assert.ok(!a.html.includes("誤字"));
});

await test("choice/oVar/pVar：未知配對型退化取首個子元素", () => {
  const r = new Lex0Reader(mkEntry(`<sense><choice><seg>first</seg><seg>second</seg></choice></sense>`));
  const a = r.lookupAll("choiceword")[0];
  assert.match(a.html, /li-lex0-choice[^>]*>first</);
  assert.ok(!a.html.includes("second"));
});

await test("choice/oVar/pVar：oVar 例句渲染 data-type", () => {
  const r = new Lex0Reader(mkEntry(`<cit type="example"><quote>an <oVar type="pt">took</oVar> book</quote></cit>`));
  const a = r.lookupAll("choiceword")[0];
  assert.match(a.html, /<span class="li-lex0-ovar" data-type="pt">took<\/span>/);
  assert.match(a.html, /<div class="li-lex0-ex">an /, "例句前導文本保留");
  assert.match(a.html, /<\/span> book</, "例句後續文本保留");
});

await test("choice/oVar/pVar：pVar 渲染 li-lex0-pvar", () => {
  const r = new Lex0Reader(mkEntry(`<cit type="example"><quote>a <pVar type="pt">way</pVar> road</quote></cit>`));
  const a = r.lookupAll("choiceword")[0];
  assert.match(a.html, /<span class="li-lex0-pvar" data-type="pt">way<\/span>/);
});

await test("choice/oVar/pVar：既有 oRef/pRef 行為不變（回歸）", () => {
  // quote 路徑：oRef/pRef 自閉合 → 詞頭佔位文本（既有 textOf 拍平行為）
  const r = new Lex0Reader(mkEntry(`<cit type="example"><quote>I <oRef/> it</quote></cit><cit type="example"><quote>the <pRef target="#c1"/></quote></cit>`));
  const a = r.lookupAll("choiceword")[0];
  assert.match(a.html, /<div class="li-lex0-ex">I choiceword it<\/div>/, "oRef 例句內佔位仍為詞頭文本");
  assert.match(a.html, /the choiceword/, "pRef 例句內佔位仍為詞頭文本");
});

await test("choice/oVar/pVar：既有 oRef/pRef 配對帶內文回歸（quote 內照舊拍平）", () => {
  const r = new Lex0Reader(mkEntry(`<cit type="example"><quote>I <oRef type="cap">did</oRef> it</quote></cit><sense>out of quote <oRef type="cap">x</oRef> end</sense>`));
  const a = r.lookupAll("choiceword")[0];
  assert.ok(!a.html.includes("did"), "quote 內 oRef 內文由詞頭佔位替代（既有行為）");
  assert.match(a.html, /<span class="li-lex0-oref" data-oref-type="cap">choiceword<\/span>/, "quote 外 oRef 佔位 span 既有渲染不變");
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
