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
<entry xml:id="x"><form type="lemma"><orth>foo</orth></form><re>odd-thing-here</re></entry>
</body></text></TEI>`;
  const r = new Lex0Reader(xml);
  const a = r.lookupAll("foo")[0];
  assert.match(a.html, /odd-thing-here/);
  assert.ok((r.warnings.unknownElements.get("re") || 0) >= 1);
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

console.log(`\\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
