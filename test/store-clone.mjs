// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry

/**
 * [patch N2] deepClone 降級測試
 * 目標：structuredClone 在 iOS 15.0–15.3 不存在，deepClone 要能產出等價深拷貝。
 * 此測試不依賴 Obsidian，Node 直接可跑。
 */

import assert from "node:assert";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "li-store-clone-"));

execFileSync(path.join(ROOT, "node_modules/.bin/esbuild"), [
  path.join(ROOT, "test/lib-export.ts"), "--bundle", "--format=esm",
  `--outfile=${path.join(TMP, "lib.mjs")}`, "--log-level=silent",
]);
const lib = await import(path.join(TMP, "lib.mjs"));
const { deepClone, DEFAULT_STORE } = lib;

let passed = 0;
const failures = [];

const test = (name, fn) => {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failures.push({ name, e });
    console.error(`  ✗ ${name}\n    ${e.message}`);
  }
};

test("深拷貝純物件，原物件後續修改不影響副本", () => {
  const src = { a: 1, b: { c: [2, 3], d: "x" } };
  const copy = deepClone(src);
  assert.notStrictEqual(copy, src);
  assert.notStrictEqual(copy.b, src.b);
  assert.notStrictEqual(copy.b.c, src.b.c);
  assert.deepStrictEqual(copy, src);
  src.b.c.push(4);
  assert.strictEqual(copy.b.c.length, 2);
});

test("深拷貝陣列，原陣列修改不影響副本", () => {
  const src = [{ a: 1 }, { b: 2 }];
  const copy = deepClone(src);
  assert.notStrictEqual(copy, src);
  assert.notStrictEqual(copy[0], src[0]);
  src[0].a = 99;
  assert.strictEqual(copy[0].a, 1);
});

test("處理 null、undefined、primitive", () => {
  assert.strictEqual(deepClone(null), null);
  assert.strictEqual(deepClone(undefined), undefined);
  assert.strictEqual(deepClone(42), 42);
  assert.strictEqual(deepClone("x"), "x");
  assert.strictEqual(deepClone(true), true);
});

test("DEFAULT_STORE 拷貝後與原始定義等價且獨立", () => {
  const copy = deepClone(DEFAULT_STORE);
  assert.deepStrictEqual(copy, DEFAULT_STORE);
  assert.notStrictEqual(copy.bookmarks, DEFAULT_STORE.bookmarks);
  assert.notStrictEqual(copy.history, DEFAULT_STORE.history);
  assert.notStrictEqual(copy.dictOverrides, DEFAULT_STORE.dictOverrides);
  assert.notStrictEqual(copy.groups, DEFAULT_STORE.groups);
});

console.log(`\n結果: ${passed} 通過, ${failures.length} 失敗`);
if (failures.length) {
  for (const { name, e } of failures) {
    console.error(`\n[${name}]`);
    console.error(e);
  }
  process.exit(1);
}
