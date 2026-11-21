// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry

/**
 * MDict reader — 純函數單元測試（P1⑥）。
 *
 * fixture：本檔內純腳本生成的最小 .mdx（v2.0 引擎＋zlib 壓縮 key/record blocks，
 * utf-8），不依賴任何外部樣本；生成物寫到 test/build/（臨時路徑，不 commit 二進位）。
 * 容器位元組排布對齊 xwang/mdict-analysis readmdict.py 語義，與 src/dict/mdict.ts
 * 的解析路徑（v2 8-byte 數值、key info zlib、block 8-byte 前綴）一一對應。
 *
 * 覆蓋：
 *  - parse header：Title/Description/GeneratedByEngineVersion、version 判定
 *  - lookupAll 精確查詢（含 HTML 詞條內容）
 *  - @@@LINK= 重定向（別名 → 正條目定義）
 *  - lookupFuzzy 大小寫正規化
 *  - prefix 前綴查詢
 *
 * 用法：node test/dict-mdict.mjs
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const TMP = path.join(ROOT, "test", "build");
fs.mkdirSync(TMP, { recursive: true });
const esbuild = path.join(ROOT, "node_modules", ".bin", "esbuild");

const out = path.join(TMP, "mdict-link.mjs");
execFileSync(esbuild, [path.join(ROOT, "src", "dict", "mdict.ts"), "--bundle", "--format=esm", "--platform=node", `--outfile=${out}`], { stdio: "pipe" });

const { MdictReader } = await import(out);

// -------------------------------------------------- fixture 生成（v2.0 + zlib）

/** BE 無號整數寫入（numWidth 字節；>4 字節用 BigInt）。 */
function writeBE(value, width) {
  const buf = Buffer.alloc(width);
  buf.writeBigUInt64BE(BigInt(value));
  return width === 4 ? buf.subarray(4) : buf;
}

/** MDX 容器 block 前綴（8 字節）：LE u32 低 4 位 comp=2（zlib），高 bits 0。 */
function blockPrefix() {
  const b = Buffer.alloc(8);
  b.writeUInt32LE(2, 0); // comp=2 zlib
  return b;
}

/** 生成最小 .mdx：entries = [{ head, html }]（別名條目 html 以 '@@@LINK=' 開頭）。 */
function buildMdx(entries, extraHeader = "") {
  // --- 詞條內容 → record blocks（單一 zlib 壓縮 record block 足夠）---
  const texts = entries.map((e) => e.html);
  const recordRaw = Buffer.concat(texts.map((t) => Buffer.from(t, "utf-8")));
  const recordBlock = Buffer.concat([blockPrefix(), zlib.deflateSync(recordRaw)]);

  // --- key block：u64 recordStart(BE) + key utf-8 + NUL ---
  const keyBlockParts = [];
  let off = 0;
  entries.forEach((e) => {
    keyBlockParts.push(writeBE(off, 8));
    keyBlockParts.push(Buffer.from(e.head, "utf-8"), Buffer.from([0]));
    off += Buffer.byteLength(e.html, "utf-8");
  });
  const keyBlockRaw = Buffer.concat(keyBlockParts);
  const keyBlock = Buffer.concat([blockPrefix(), zlib.deflateSync(keyBlockRaw)]);

  // --- key block info（v2：整體 zlib 壓縮；每塊 numEntries u64 + firstKey u16len+bytes
  //     + lastKey u16len+bytes + compSize u64 + unpackSize u64）---
  const infoRaw = Buffer.concat([
    writeBE(entries.length, 8),
    (() => { const k = Buffer.from(entries[0].head, "utf-8"); return Buffer.concat([Buffer.from([0, k.length]), k, Buffer.from([0])]); })(),
    (() => { const k = Buffer.from(entries[entries.length - 1].head, "utf-8"); return Buffer.concat([Buffer.from([0, k.length]), k, Buffer.from([0])]); })(),
    writeBE(keyBlock.length, 8),
    writeBE(keyBlockRaw.length, 8),
  ]);
  // comp=2 前綴（LE u32 低 4 位=2）＋ 4 字節佔位 ＋ zlib 流（reader 讀 keyInfo[0..8]）
  const keyInfoPrefix = Buffer.alloc(8);
  keyInfoPrefix.writeUInt32LE(2, 0);
  const keyInfo = Buffer.concat([keyInfoPrefix, zlib.deflateSync(infoRaw)]);

  // --- header（UTF-16LE XML）---
  const headerText = Buffer.from(
    `<Library Title="Test Dict" Description="minimal fixture" ` +
    `Encoding="UTF-8" GeneratedByEngineVersion="2.0"${extraHeader}></Library>`,
    "utf-16le",
  );
  const headerLen = Buffer.alloc(4);
  headerLen.writeUInt32BE(headerText.length); // 讀取器位址：4 + headerLen + adler32
  const adler = Buffer.alloc(4); // reader 跳過 adler32 欄位

  // --- key header（v2：全 u64＋尾部 adler32 4 字節）---
  const keyHeader = Buffer.concat([
    writeBE(1, 8), // numKeyBlocks
    writeBE(entries.length, 8), // numEntriesTotal
    writeBE(infoRaw.length, 8), // keyInfoDecompSize
    writeBE(keyInfo.length, 8), // keyInfoCompSize
    writeBE(keyBlock.length, 8), // keyBlocksTotalSize
    Buffer.alloc(4), // adler32（v2 +4）
  ]);

  // --- record header（全 u64）＋ record block info（compSize/unpackSize 交錯 u64）---
  const recordHeader = Buffer.concat([
    writeBE(1, 8), // numRecordBlocks
    writeBE(entries.length, 8), // totalEntries
    writeBE(16, 8), // recordInfoSize
    writeBE(recordBlock.length, 8), // recordBlocksTotalSize
  ]);
  const recordInfo = Buffer.concat([writeBE(recordBlock.length, 8), writeBE(recordRaw.length, 8)]);

  return Buffer.concat([headerLen, headerText, adler, keyHeader, keyInfo, keyBlock, recordHeader, recordInfo, recordBlock]);
}

// fixture 寫到 test/build（臨時路徑；不 commit 二進位）
const entries = [
  { head: "hello", html: "<b>hello</b> interj. 你好" },
  { head: "helium", html: "helium n. 氦" },
  { head: "world", html: "world n. 世界" },
  { head: "hola", html: "@@@LINK=hello" },
];
const fixturePath = path.join(TMP, "dict-mdict-fixture.mdx");
fs.writeFileSync(fixturePath, buildMdx(entries));
const bytes = new Uint8Array(fs.readFileSync(fixturePath));

let pass = 0, fail = 0;
const ok = (m) => { pass++; console.log("  ✓ " + m); };
async function test(name, fn) {
  try { await fn(); ok(name); } catch (e) { fail++; console.error("  ✗ " + name + " — " + (e?.message ?? e)); }
}

console.log("\nMDict reader（test/dict-mdict.mjs，腳本生成 v2.0+zlib fixture）");

await test("parse header：Title/Description/version 判定", () => {
  const r = new MdictReader(bytes, "mdx");
  assert.equal(r.title, "Test Dict");
  assert.equal(r.description, "minimal fixture");
  assert.equal(r.version, 2.0);
  assert.equal(r.encoding, "utf-8");
  assert.equal(r.entryCount, 4, "entryCount=" + r.entryCount);
  assert.equal(r.supported, true);
});

await test("lookupAll：精確查詢命中 HTML 詞條內容", () => {
  const r = new MdictReader(bytes, "mdx");
  const hits = r.lookupAll("hello");
  assert.equal(hits.length, 1);
  assert.equal(hits[0].keyText, "hello");
  assert.match(hits[0].definition, /<b>hello<\/b>/);
  assert.match(hits[0].definition, /你好/);
});

await test("@@@LINK：別名 hola 重定向到 hello 的定義", () => {
  const r = new MdictReader(bytes, "mdx");
  const hits = r.lookupAll("hola");
  assert.equal(hits.length, 1, "hola hits=" + hits.length);
  assert.match(hits[0].definition, /<b>hello<\/b>/, "應跟隨重定向取到正條目定義");
});

await test("lookupFuzzy：大小寫正規化（HELLO 命中 hello）", () => {
  const r = new MdictReader(bytes, "mdx");
  const hits = r.lookupFuzzy("HELLO");
  assert.ok(hits.length >= 1, "fuzzy hits=" + hits.length);
  assert.equal(hits[0].keyText, "hello");
});

await test("prefix：'hel' 前綴命中 hello/helium", () => {
  const r = new MdictReader(bytes, "mdx");
  const keys = r.prefix("hel", 10);
  assert.ok(keys.includes("hello"), "應含 hello，實得 " + JSON.stringify(keys));
  assert.ok(keys.includes("helium"), "應含 helium");
  assert.ok(!keys.includes("world"), "不應含 world");
});


// P2-1：KeyCaseSensitive/StripKey header 旗標生效
await test("P2-1 KeyCaseSensitive=1：區分大小寫（Hello ≠ hello）", () => {
  const p2 = path.join(TMP, "dict-mdict-fixture-cs.mdx");
  fs.writeFileSync(p2, buildMdx([
    { head: "Hello", html: "capital Hello" },
    { head: "hello", html: "lower hello" },
  ], ' KeyCaseSensitive="1"'));
  const r = new MdictReader(new Uint8Array(fs.readFileSync(p2)));
  assert.equal(r.keyCaseSensitive, true, "keyCaseSensitive 應為 true");
  const lower = r.lookupAll("hello");
  const upper = r.lookupAll("Hello");
  assert.equal(lower.length, 1, "lower hits=" + lower.length);
  assert.equal(upper.length, 1, "upper hits=" + upper.length);
  assert.equal(lower[0].definition, "lower hello");
  assert.equal(upper[0].definition, "capital Hello");
  // 模糊路徑同樣不做小寫歸一：HELLO 在區分大小寫詞典不應命中 hello
  assert.equal(r.lookupFuzzy("HELLO").length, 0, "HELLO 不應命中");
});

await test("P2-1 缺省 header：沿用小寫歸一（HELLO 命中 hello）＋StripKey=false 不剝", () => {
  // 缺省（無 KeyCaseSensitive）＝小寫歸一，主 fixture 的 HELLO 命中已驗；此處驗 StripKey=false
  const p3 = path.join(TMP, "dict-mdict-fixture-nostrip.mdx");
  fs.writeFileSync(p3, buildMdx([
    { head: "hello world", html: "keep space" },
  ], ' StripKey="false"'));
  const r = new MdictReader(new Uint8Array(fs.readFileSync(p3)));
  assert.equal(r.stripKey, false, "stripKey 應為 false");
  assert.equal(r.lookupAll("hello world").length, 1, "空格保留：原樣鍵應命中");
  assert.equal(r.lookupAll("helloworld").length, 0, "不剝時拼合鍵不應命中");
});

await test("B3：restore 缺省 keyCaseSensitive（undefined）＝小寫歸一語義一致", () => {
  // 主 fixture 無 KeyCaseSensitive header → serialize 欄 undefined；
  // restore 時不得顯示 true 而實際走小寫歸一（B3 前的矛盾行為）
  const r = new MdictReader(bytes, "mdx");
  const saved = r.serialize();
  const restored = MdictReader.restore(new Uint8Array(fs.readFileSync(fixturePath)), "mdx", saved);
  assert.equal(restored.keyCaseSensitive, false, "缺省 header 應還原為 false（小寫歸一）");
  assert.ok(restored.lookupFuzzy("HELLO").length >= 1, "restore 後仍小寫歸一：HELLO 應命中 hello");
  // KeyCaseSensitive=1 詞典 restore 後語義不變
  const p2cs = path.join(TMP, "dict-mdict-fixture-cs.mdx"); const rcs = new MdictReader(new Uint8Array(fs.readFileSync(p2cs)), "mdx");
  const restoredCs = MdictReader.restore(new Uint8Array(fs.readFileSync(p2cs)), "mdx", rcs.serialize());
  assert.equal(restoredCs.keyCaseSensitive, true, "KeyCaseSensitive=1 restore 後仍 true");
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
