// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry

/* Soyombo 單字表門禁（Aksharamukha syllabary 578 compounds＋34 輔音＋17 元音
 * ＋conjuncts2 八元音符號矩陣，去重後 9074 項逐項 native→roman→native 恆等）
 * 資料：test/data/soyombo-aksharamukha-syllabary.txt（每行一項） */

import assert from "node:assert";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "li-sysyl-"));
execFileSync(path.join(ROOT, "node_modules", ".bin", "esbuild"), [
  path.join(ROOT, "test", "lib-export.ts"), "--bundle", "--format=esm",
  `--outfile=${path.join(TMP, "lib.mjs")}`, "--log-level=silent",
]);
const lib = await import(path.join(TMP, "lib.mjs"));

const lines = fs.readFileSync(path.join(ROOT, "test", "data", "soyombo-aksharamukha-syllabary.txt"), "utf-8")
  .split("\n").filter(l => l.length > 0);
assert.ok(lines.length >= 9000, `單字表行數 ${lines.length} >= 9000`);

const fails = [];
for (const nat of lines) {
  const rom = lib.soyomboNativeToRoman(nat);
  if (lib.soyomboRomanToNative(rom) !== nat) fails.push(nat);
}
if (fails.length > 0) {
  console.error(`soyombo-syllabary-gate: 失敗 ${fails.length}/${lines.length}`);
  for (const f of fails.slice(0, 10)) {
    console.error(`  ${[...f].map(c => c.codePointAt(0).toString(16)).join(" ")}`);
  }
  process.exit(1);
}
console.log(`soyombo-syllabary-gate: 通过 ${lines.length}/${lines.length}`);
