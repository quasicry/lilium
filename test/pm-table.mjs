// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry

/**
 * 試點門禁：LI-PM 聲明表完整性與行為等價斷言。
 * 跑法：node test/pm-table.mjs（已併入 test:all 由 run.mjs 呼叫者可單獨執行）。
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const SRC = readFileSync(join(ROOT, "src", "ts", "pm-table.ts"), "utf8");
const ANNOTATE = readFileSync(join(ROOT, "src", "annotate.ts"), "utf8");
const MARKS_DOM = readFileSync(join(ROOT, "src", "marks-dom.ts"), "utf8");

let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; console.log(`  ok  ${name}`); }
  else { fail++; console.error(`FAIL  ${name}`); }
}

// [PM-1] 表項完整：10 個行為鍵全部存在
const EXPECT = ["ruby","warichu","emphasis-dots","tcy","punct-wrap","punct-center","hanging","pangu","rtl-isolate","note-inline"];
for (const b of EXPECT) ok(SRC.includes(`"${b}"`), `[PM-1] behaviour 定義存在：${b}`);

// [PM-2] 執行序鎖定：LI_PM_ORDER 與 expandMarks 註釋中的既定次序一致
const ORDER_RE = /LI_PM_ORDER[^=]*=\s*\[([^\]]+)\]/s;
ok(ORDER_RE.test(SRC), "[PM-2a] LI_PM_ORDER 存在");
if (ORDER_RE.test(SRC)) {
  const order = ORDER_RE.exec(SRC)[1].match(/"([a-z-]+)"/g).map(s => s.replaceAll('"', ""));
  const idx = b => order.indexOf(b);
  ok(idx("rtl-isolate") < idx("pangu"), "[PM-2b] RTL 先於 pangu");
  ok(idx("pangu") < idx("punct-wrap"), "[PM-2c] pangu 先於標點包裹（①b 順序依賴）");
  ok(idx("warichu") < idx("emphasis-dots"), "[PM-2d] warichu 先於 emphasis（N2 前置）");
  ok(idx("warichu") < idx("tcy"), "[PM-2e] warichu 先於 tcy（N2 前置）");
  ok(idx("hanging") === order.length - 1, "[PM-2f] hanging 最後（LI-TS-404）");
}

// [PM-3] 類名鐵證：表內類名與兩實現器源碼中的類名逐字一致
const CLASS_PAIRS = [
  ["li-warichu-2col", ANNOTATE], ["li-ruby-solo", ANNOTATE],
  ["li-em", ANNOTATE], ["li-tcy", ANNOTATE],
  ["li-warichu", MARKS_DOM], ["li-tcy", MARKS_DOM],
];
for (const [cls, src] of CLASS_PAIRS) {
  ok(SRC.includes(`"${cls}`) && src.includes(cls), `[PM-3] 類名兩面一致：${cls}`);
}

// [PM-4] 管線白名單：注音/TCY 全管線、RTL 僅 reading+export
ok(/"rtl-isolate":[\s\S]{0,400}?pipelines:\s*\["reading",\s*"export"\]/.test(SRC), "[PM-4a] rtl-isolate 管線白名單");
ok(!/"ruby":[\s\S]{0,400}?pipelines:/.test(SRC.split('"emphasis-dots"')[0].split('"warichu"')[1] ?? ""), "[PM-4b] ruby 無白名單（全管線）");

// [PM-5] direction 三值完備：vertical/any
ok((SRC.match(/direction:\s*"(vertical|any)"/g) || []).length >= 10, "[PM-5] 每表項有 direction");

console.log(`\npm-table 門禁：${pass} 通過 / ${fail} 失敗`);
process.exit(fail ? 1 : 0);
