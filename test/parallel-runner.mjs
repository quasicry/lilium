#!/usr/bin/env node

// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry


/**
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (C) 2026 quasicry
 */

// [1.68]：test:all 並行基建——分段抗殺 runner
// 用法：node test/parallel-runner.mjs <pool-file.json> <state-file>
// pool-file: {"groups": [["test/a.mjs", ...], [...]]}  每組內串行、組間並行
// 狀態檔記錄已完成套件（重跑續傳）；套件失敗記名不中止他組
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const [poolFile, stateFile] = process.argv.slice(2);
if (!poolFile || !stateFile) { console.error("usage: parallel-runner <pool.json> <state>"); process.exit(2); }
const ROOT = path.resolve(import.meta.dirname, "..");
const pool = JSON.parse(fs.readFileSync(poolFile, "utf8"));
const done = fs.existsSync(stateFile) ? new Set(JSON.parse(fs.readFileSync(stateFile, "utf8"))) : new Set();

async function runGroup(gi, tests) {
  for (const t of tests) {
    if (done.has(t)) { console.log(`SKIP ${t}（續傳）`); continue; }
    const t0 = Date.now();
    const r = spawnSync("node", [t], { cwd: ROOT, encoding: "utf8",
      timeout: 15 * 60 * 1000, env: process.env });
    const ok = r.status === 0;
    console.log(`${ok ? "✓" : "✗ RED"} ${t}（${((Date.now()-t0)/1000).toFixed(1)}s）`);
    if (!ok) { console.log((r.stdout||"").split("\n").slice(-6).join("\n")); console.log((r.stderr||"").split("\n").slice(-12).join("\n")); }
    else { done.add(t); fs.writeFileSync(stateFile, JSON.stringify([...done], null, 1)); }
    if (!ok) process.exitCode = 1;
  }
}
await Promise.all(pool.groups.map((g, i) => runGroup(i, g)));
console.log(`PARALLEL-RUNNER: ${done.size} done, exit=${process.exitCode ?? 0}`);
