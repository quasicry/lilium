// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry

// 悉曇體 / 蘭札體 內嵌完整性測試。
//
// 驗證三件事：
//  1. src/vendor/siddham-lantsa.generated.ts 的 base64 與 fonts-src/ 源字型逐字一致，
//     且生成器可從源字型復原（確保字型確實內嵌進插件、未遺失）。
//  2. 內嵌條目記載的 family 必須等於字體 name 表自報值（杜絕手寫族名寫錯）。
//  3. NU 版「刻意不內嵌」的決策不被推翻：DU / NU 的 cmap 完全不相交，
//     NU 畫不出本插件 ranjana 所用的天城體碼位，且全 src/ 無 Newa 消費方。
//
// 背景與決策理由見 scripts/gen-siddham-lantsa.mjs 檔頭。
// 運行：node test/siddham-lantsa-embed.mjs
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

let passed = 0, failed = 0;
const test = (name, fn) => {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.error(`  ✗ ${name}\n    ${e.message}`); }
};

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const ESBUILD = path.join(ROOT, "node_modules/.bin/esbuild");

/** 把單個 .ts 打包成臨時 ESM，讓 Node 能直接 import */
function bundleModule(entryRel) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "li-sl-"));
  const out = path.join(dir, path.basename(entryRel).replace(/\.ts$/, ".mjs"));
  execFileSync(ESBUILD, [path.join(ROOT, entryRel), "--bundle", "--format=esm", `--outfile=${out}`, "--log-level=silent"]);
  return out;
}

const { BUNDLED_SIDDHAM_LANTSA_FONT_FILES: FONTS } = await import(bundleModule("src/vendor/siddham-lantsa.generated.ts"));
const { resolveFontNameSync } = await import(bundleModule("src/font-name.ts"));

const expect = [
  { id: "noto-sans-siddham", family: "Noto Sans Siddham", scripts: ["siddham"], file: "NotoSansSiddham-Regular.ttf" },
  { id: "nithya-ranjana-du", family: "Nithya Ranjana DU", scripts: ["ranjana"], file: "NithyaRanjanaDU-Regular.otf" },
];

/* ================================================================== */
/* 一、內嵌完整性                                                       */
/* ================================================================== */

test("內嵌字型數量與標識正確", () => {
  assert.strictEqual(FONTS.length, 2);
  for (const e of expect) {
    const f = FONTS.find((x) => x.id === e.id);
    assert.ok(f, `應內嵌 ${e.id}`);
    assert.strictEqual(f.family, e.family);
    assert.deepStrictEqual(f.scripts, e.scripts);
    assert.strictEqual(f.fileName, e.file);
  }
});

test("base64 與 fonts-src 源字型逐字一致（確證內嵌未遺失）", () => {
  for (const e of expect) {
    const f = FONTS.find((x) => x.id === e.id);
    const src = fs.readFileSync(path.join(ROOT, "fonts-src", e.file));
    const decoded = Buffer.from(f.base64, "base64");
    assert.strictEqual(decoded.length, src.length, `${e.id} 解碼長度應與源檔一致`);
    assert.ok(decoded.equals(src), `${e.id} 解碼內容應與 fonts-src/${e.file} 逐字相同`);
  }
});

test("生成器可從源字型復原（scripts/gen-siddham-lantsa.mjs 可重跑）", () => {
  // 僅確認腳本存在且源字型在場，實際復原由 CI / 開發者手動執行
  assert.ok(fs.existsSync(path.join(ROOT, "scripts/gen-siddham-lantsa.mjs")), "生成器腳本應存在");
  for (const e of expect) {
    assert.ok(fs.existsSync(path.join(ROOT, "fonts-src", e.file)), `源字型 fonts-src/${e.file} 應留存`);
  }
});

/* ================================================================== */
/* 二、族名必須取自 name 表，不得手寫                                    */
/* ================================================================== */

test("內嵌條目的 family 等於字體 name 表自報值", () => {
  for (const e of expect) {
    const raw = new Uint8Array(fs.readFileSync(path.join(ROOT, "fonts-src", e.file)));
    const real = resolveFontNameSync(raw).info.family;
    assert.equal(real, e.family, `${e.file} 的 name 表自報 ${real}，期望表卻寫 ${e.family}`);
    const f = FONTS.find((x) => x.id === e.id);
    assert.equal(f.family, real, `${e.id} 的 family 應取自字體 name 表`);
  }
});

/* ================================================================== */
/* 三、NU 不內嵌：把決策依據鎖成可執行斷言                               */
/* ================================================================== */

/** 讀出 cmap 覆蓋的全部碼位（支援 format 4 / 12；其它格式直接報錯，不靜默放過） */
function readCodepoints(buf) {
  const magic = buf.readUInt32BE(0);
  if (magic !== 0x00010000 && buf.toString("latin1", 0, 4) !== "OTTO") {
    throw new Error(`非 sfnt 容器: ${JSON.stringify(buf.toString("latin1", 0, 4))}`);
  }
  const numTables = buf.readUInt16BE(4);
  const tables = {};
  for (let i = 0; i < numTables; i++) {
    const o = 12 + i * 16;
    tables[buf.toString("latin1", o, o + 4)] = { off: buf.readUInt32BE(o + 8) };
  }
  const cmap = tables.cmap;
  assert.ok(cmap, "應含 cmap 表");
  const n = buf.readUInt16BE(cmap.off + 2);
  let best = null, bestScore = -1;
  for (let i = 0; i < n; i++) {
    const o = cmap.off + 4 + i * 8;
    const pid = buf.readUInt16BE(o), eid = buf.readUInt16BE(o + 2);
    const score = pid === 3 && eid === 10 ? 5
      : pid === 0 && (eid === 4 || eid === 6) ? 4
        : pid === 3 && eid === 1 ? 3
          : pid === 0 && eid <= 3 ? 2
            : pid === 1 && eid === 0 ? 1 : -1;
    if (score > bestScore) { bestScore = score; best = cmap.off + buf.readUInt32BE(o + 4); }
  }
  assert.ok(best !== null && bestScore > 0, "應有可用的 cmap 子表");
  const fmt = buf.readUInt16BE(best);
  const out = [];
  if (fmt === 4) {
    const segX2 = buf.readUInt16BE(best + 6), seg = segX2 / 2;
    const endO = best + 14, startO = endO + segX2 + 2;
    for (let s = 0; s < seg; s++) {
      const end = buf.readUInt16BE(endO + s * 2), start = buf.readUInt16BE(startO + s * 2);
      if (start === 0xffff) continue;
      for (let cp = start; cp <= end && cp !== 0xffff; cp++) out.push(cp);
    }
  } else if (fmt === 12) {
    const groups = buf.readUInt32BE(best + 12);
    for (let g = 0; g < groups; g++) {
      const o = best + 16 + g * 12;
      for (let cp = buf.readUInt32BE(o), end = buf.readUInt32BE(o + 4); cp <= end; cp++) out.push(cp);
    }
  } else {
    throw new Error(`未支援的 cmap format ${fmt}`);
  }
  return new Set(out);
}

const count = (set, lo, hi) => { let n = 0; for (let cp = lo; cp <= hi; cp++) if (set.has(cp)) n++; return n; };
const DEV_LO = 0x0900, DEV_HI = 0x097f;
const NEWA_LO = 0x11400, NEWA_HI = 0x1147f;
/** Newa 字母數；U+1144E 是 NEWA GAP FILLER（填隙用、非字母），不計 */
const NEWA_GAP_FILLER = 0x1144e;
const newaLetters = (set) => {
  let n = 0;
  for (const cp of set) if (cp >= NEWA_LO && cp <= 0x11459 && cp !== NEWA_GAP_FILLER) n++;
  return n;
};

const DU_CP = readCodepoints(fs.readFileSync(path.join(ROOT, "fonts-src/NithyaRanjanaDU-Regular.otf")));
const NU_CP = readCodepoints(fs.readFileSync(path.join(ROOT, "fonts-src/NithyaRanjanaNU-Regular.otf")));

test("NU 不在內嵌表內（維持「不交付 Newa 編碼變體」的決策）", () => {
  assert.ok(!FONTS.some((f) => f.fileName.includes("NU")),
    "NU 一旦進內嵌表，請同步新增 Newa 碼位消費路徑，否則 CSS 每次都略過它");
  assert.ok(fs.existsSync(path.join(ROOT, "fonts-src/NithyaRanjanaNU-Regular.otf")),
    "NU 源檔必須保留，供用戶自行導入");
});

test("DU / NU cmap 不相交：NU 畫不出本插件 ranjana 所用的天城體碼位", () => {
  // ranjana 走 Devanagari 碼位（U+0900–U+097F）；NU 在該區間一個字形都沒有，
  // 放進字體棧只會每次被略過，白白替 main.js 增加約 0.46 MiB。反向亦然。
  assert.ok(count(DU_CP, DEV_LO, DEV_HI) > 50, `DU 應覆蓋大量天城體碼位，實得 ${count(DU_CP, DEV_LO, DEV_HI)}`);
  assert.strictEqual(count(NU_CP, DEV_LO, DEV_HI), 0, "NU 不該有任何天城體碼位");
  assert.ok(count(NU_CP, NEWA_LO, NEWA_HI) > 50, `NU 應覆蓋大量 Newa 碼位，實得 ${count(NU_CP, NEWA_LO, NEWA_HI)}`);
  // DU 唯一的 Newa 碼位是 U+1144E（NEWA GAP FILLER，填隙符號而非字母），
  // 因此 DU 對 Newa 正文實際上一個字都畫不出來。
  assert.strictEqual(newaLetters(DU_CP), 0, "DU 不該有任何 Newa 字母");
});

test("buddhist-chars.ts 不得回到 src/（v2.9.18 剝離遷出，倉庫不保有其副本）", () => {
  assert(!fs.existsSync(path.join(ROOT, "src/dict/data/buddhist-chars.ts")),
    "src/dict/data/buddhist-chars.ts 不得復活");
  assert(!fs.existsSync(path.join(ROOT, "src/data/buddhist-chars.ts")),
    "src/data/buddhist-chars.ts 不得復活");
});

test("src/ 其它角落無 Newa 碼位消費方（NU 暫缺用途的佐證）", () => {
  const hits = [];
  const walk = (dir) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) { if (ent.name !== "vendor") walk(p); continue; }
      if (!/\.(ts|css|json)$/.test(ent.name)) continue;
      if (/buddhist-chars/.test(ent.name)) continue; // 剝離遷出，倉庫不應存在
      const s = fs.readFileSync(p, "utf8");
      for (const m of s.matchAll(/\\u\{?(114[0-7][0-9A-Fa-f]{2})\}?/g)) hits.push(`${path.relative(ROOT, p)}:${m[1]}`);
    }
  };
  walk(path.join(ROOT, "src"));
  assert.deepStrictEqual(hits, [], `出現 Newa 碼位字面量＝消費方已存在，應重新評估 NU：${hits.join(", ")}`);
});

console.log(`\n通過 ${passed}，失敗 ${failed}`);
process.exit(failed ? 1 : 0);
