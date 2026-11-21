// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry

/**
 * Pāṇini 連聲規則子集 · 教科書語料測試（IAST）。
 * 執行：node test/sandhi.mjs（exit 0 = 全過）
 * 依據：Goldman《Devavāṇīpraveśikā》Ch.1–3 表；Whitney §120–141；經號見報告 §三。
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "test", "build", "sandhi.cjs");
execFileSync(
  path.join(ROOT, "node_modules", ".bin", "esbuild"),
  [path.join(ROOT, "src", "sandhi.ts"), "--bundle", "--format=cjs", "--platform=node", "--outfile=" + OUT, "--log-level=silent"],
  { stdio: "pipe" },
);
const { sandhiJoin } = await import(OUT);

const canonical = [
  ["deva", "aśvam", "devāśvam"],
  ["rājā", "āsīt", "rājāsīt"],
  ["deva", "indraḥ", "devendraḥ"],
  ["deva", "upaguḥ", "devopaguḥ"],
  ["rājā", "ṛṣiḥ", "rājārṣiḥ"],
  ["deva", "eṣaḥ", "devaiṣaḥ"],
  ["deva", "ojas", "devaujas"],
  ["te", "abravīt", "te'bravīt"],
  ["iti", "ādi", "ityādi"],
  ["su", "āptaḥ", "svāptaḥ"],
  ["kṛ", "ūpāya", "krūpāya"],
  // visarga / -s
  // saḥ/eṣaḥ 例外（Whitney §176）：非 a 前省略 visarga（sa gacchati、eṣa paśyati）
  ["saḥ", "gacchati", "sa gacchati"],
  ["eṣaḥ", "paśyati", "eṣa paśyati"],
  ["saḥ", "icchati", "sa icchati"],
  ["rāmaḥ", "asti", "rāmo'sti"],
  ["devāḥ", "ca", "devāśca"],
  ["devaḥ", "kṛṣṇaḥ", "devaḥ kṛṣṇaḥ"],
  ["sarvas", "asti", "sarvo'sti"],
  ["viṣṇus", "gacchati", "viṣṇurgacchati"],
  ["īśvaras", "kṛṣṇaḥ", "īśvaraḥ kṛṣṇaḥ"],
  ["tas", "cet", "taścet"],
  ["sarvas", "tatra", "sarvastatra"],
  // 鼻音／塞音
  ["tam", "kāraṃ", "taṃkāraṃ"],
  ["tān", "loke", "tālloke"],
  ["tat", "dhanam", "taddhanam"],
  ["tat", "śīlam", "tacchīlam"],
  ["tat", "cintanam", "taccintanam"],
  // 直連（連聲不變）——含示例勘誤版
  ["tat", "asti", "tatasti"],
  ["tat", "eva", "tateva"],
  ["deva", "aśvam", "devāśvam"],
  ["guru", "upadeśaḥ", "gurūpadeśaḥ"],
  ["guru", "īrṣayā", "gurvīrṣayā"],
  ["prati", "ekam", "pratyekam"],
  ["rājā", "ṛṣabhaḥ", "rājārṣabhaḥ"],
  ["rāmā", "aiśvarya", "rāmaiśvarya"],
  ["devāḥ", "āgataḥ", "devo'gataḥ"],  // ā 開頭同屬 6.1.109 avagraha
  ["sītā", "āśramaḥ", "sītāśramaḥ"],
  ["kavi", "indraḥ", "kavīndraḥ"],
  ["sat", "lokāḥ", "sat lokāḥ"],
  ["iha", "iva", "iheva"],
  ["vāk", "ādi", "vākādi"],
  // ---- Whitney §8.4 全族補表語料 ----
  // ḥ/s + ṭ/ṭh → ṣ（8.4.40 系；learnsanskrit.org 全表 aṣ/āṣ/ṣ 行）
  ["duḥ", "ṭīkā", "duṣṭīkā"],
  ["viṣṇus", "ṭīkā", "viṣṇuṣṭīkā"],
  ["devaḥ", "ṭhākur", "devaṣṭhākur"],
  // ḥ/s + t/th → s（8.4.40 系；as/ās/s 行——含糾偏：t/th 前不再誤留 ḥ）
  ["sarvas", "tatra", "sarvastatra"],      // 已有，保留爲迴歸
  // saḥ 非一切前都省略——清輔音前同樣省略（sa tatra），補對照
  ["saḥ", "tatra", "sa tatra"],
  ["rāmaḥ", "tasya", "ramas tasya".replace("ramas tasya", "rāmastasya")],
  ["devāḥ", "thākura", "devāsthākura"],
  // c/ch → ś 已有 tas+cet；補 ḥ 版
  ["devaḥ", "cintayati", "devaścintayati"],
  // 其他清塞音前保留 ḥ（8.3.36 只涵蓋 k/kh/p/ph 的 -as→aḥ；ḥ 本身保留）
  ["devaḥ", "kṛṣṇaḥ", "devaḥ kṛṣṇaḥ"],
  ["īśvaraḥ", "pibati", "īśvaraḥ pibati"],
  // 濁音前 -ḥ（非 a 幹）→ r（8.2.66；duḥ-labha → durlabha 型）
  ["duḥ", "labha", "durlabha"],
  ["duḥ", "labhaḥ", "durlabhaḥ"],
];

let failed = 0;
for (const [a, b, expect] of canonical) {
  const r = sandhiJoin(a, b);
  try {
    assert.equal(r.joined, expect, `sūtra ${r.sūtra} / ${r.rule}`);
    console.log(`  ✓ ${a} + ${b} → ${r.joined}（${r.rule}｜${r.sūtra}）`);
  } catch (e) {
    failed++;
    console.error(`  ✗ ${a} + ${b} → 實得 ${r.joined}，期望 ${expect}（${r.rule}｜${r.sūtra}）`);
  }
}
console.log(`\n结果: ${canonical.length - failed} 通过, ${failed} 失败`);

/* ---- SANDHI_DEMOS 單一真實來源鎖定（UI 示範卡共用此語料） ---- */
// 獨立 bundle sandhi.ts 拿導出（此檔只 bundle src/sandhi.ts，見頂部 execFileSync）
execFileSync(
  path.join(ROOT, "node_modules", ".bin", "esbuild"),
  [path.join(ROOT, "test", "lib-export.ts"), "--bundle", "--format=esm", "--outfile=" + path.join(ROOT, "test", "build", "libtmp.mjs"), "--log-level=silent"],
  { stdio: "pipe" },
);
const lib = await import(path.join(ROOT, "test", "build", "libtmp.mjs"));
console.log("\n=== SANDHI_DEMOS 鎖定（UI 示範卡語料 = 引擎驗證語料）===");
let dFailed = 0;
for (const d of lib.SANDHI_DEMOS) {
  const r = sandhiJoin(d.first, d.second);
  try {
    assert.equal(r.joined, d.expected);
    console.log(`  ✓ DEMO ${d.first} + ${d.second} → ${r.joined}（${r.sūtra}）`);
  } catch (e) {
    dFailed++;
    console.error(`  ✗ DEMO ${d.first} + ${d.second} → 實得 ${r.joined}，期望 ${d.expected}`);
  }
}

console.log(`\n结果: ${canonical.length - failed + lib.SANDHI_DEMOS.length - dFailed} 通过, ${failed + dFailed} 失败`);

/* ---- 確認定稿連寫鎖定——套用 alternative 後碼位序正確（virama 連寫）、重掃歧義下降 ---- */
{
  const ambCases = [
    { roman: "kha", altIdx: 0 },
    { roman: "dha", altIdx: 0 },
    { roman: "gandharva", altIdx: 0 },
  ];
  let aFailed = 0;
  console.log("\n=== 確認定稿連寫鎖定（套用後 virama 連寫、重掃歧義下降）===");
  for (const c of ambCases) {
    const native = lib.transliterateText(c.roman, "sanskrit-hk", true);
    if (!native.ok || !native.text) { console.error(`  ✗ ${c.roman}: 轉寫失敗`); aFailed++; continue; }
    const ambs2 = lib.detectRomanToNativeAmbiguities(native.text);
    if (!ambs2.length) { console.error(`  ✗ ${c.roman}: 未偵測到歧義`); aFailed++; continue; }
    const choices2 = ambs2.map((_, i) => (i === c.altIdx ? 1 : 0));
    const applied2 = lib.applyTranslitAmbiguities(native.text, ambs2, choices2);
    const hasVirama = Array.from(applied2).includes(String.fromCodePoint(0x094d));
    const reScan = lib.detectRomanToNativeAmbiguities(applied2);
    const ok = hasVirama && reScan.length < ambs2.length;
    try {
      assert.ok(ok, `${c.roman}: virama=${hasVirama}, reScan ${reScan.length}/${ambs2.length}`);
      console.log(`  ✓ ${c.roman} → ${applied2}（virama ✓、重掃 ${ambs2.length}→${reScan.length}）`);
    } catch (e) {
      aFailed++;
      console.error(`  ✗ ${c.roman}: ${e.message}`);
    }
  }
  console.log(`\n结果: ${canonical.length - failed + lib.SANDHI_DEMOS.length - dFailed + ambCases.length - aFailed} 通过, ${failed + dFailed + aFailed} 失败`);
  if (failed || dFailed || aFailed) process.exit(1);
}
