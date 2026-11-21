// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry

/* 碼位級真值門禁（olduyghur-phagspa canon gate）：
 * 以外部權威逐碼位為真值，驗證兩方案的映射表——與引擎自身的往返測試
 * （all-schemes-corpus.mjs / authoritative-corpus.mjs）互補：本檔不信任引擎
 * 導出的期望值，每個碼位的期望直接取自權威來源 fixture。
 *
 * ① olduyghur：Pandey L2/20-191 §6.6 字母表（18 字母，Latin 欄）逐碼位為真值，
 *    驗證 LATIN_TO_LETTER / LETTER_TO_LATIN（含調研裁定 l→LESH、δ→LAMEDH）。
 *    fixture：test/fixtures/olduyghur-l2-20-191.json（來源註明於檔內）。
 * ② phagspa：Unicode NamesList U+A840..A877（52 字母 + candrabindu + 4 標點，
 *    共 57 個已賦碼位）逐碼位為真值，驗證雙向映射 N2R/R2N。
 *    fixture：test/fixtures/phagspa-nameslist.json（Unicode 16.0.0 NamesList.txt）。
 *
 * 失敗逐碼位定性輸出（碼位、權威值、引擎值），嚴禁白名單硬湊；
 * 若映射表與權威源衝突，本檔如實報紅，不動 src/（待裁定）。
 *
 * 執行：node test/olduyghur-phagspa-canon-gate.mjs（併入 test:all 門禁）
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import * as path from "node:path";
import * as os from "node:os";
import { execFileSync } from "node:child_process";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");

let pass = 0, fail = 0;
const failures = [];
function ok(cond, name, detail) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail ? " — " + detail : ""}`); failures.push(`✗ ${name}${detail ? " — " + detail : ""}`); }
}
const norm = (s) => s.normalize("NFC").replace(/\s+/g, " ").trim();

// ---- 引擎載入（經 lib-export 統一出口，與 authoritative-corpus.mjs 同法）----
const lib = await (async () => {
  const fs = await import("node:fs");
  const { execFileSync: ex } = await import("node:child_process");
  const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "li-canon-gate-"));
  ex(path.join(ROOT, "node_modules", ".bin", "esbuild"), [
    path.join(ROOT, "test", "lib-export.ts"), "--bundle", "--format=esm",
    `--outfile=${path.join(TMP, "lib.mjs")}`, "--log-level=silent",
  ]);
  return import(path.join(TMP, "lib.mjs"));
})();

const OU = lib.getScheme("olduyghur");
const PH = lib.getScheme("phagspa-poppe");
if (!OU) { console.error("✗ 方案 olduyghur 無法從 lib-export 取得"); process.exit(1); }
if (!PH) { console.error("✗ 方案 phagspa-poppe 無法從 lib-export 取得"); process.exit(1); }

// ============================================================
// ① olduyghur：Pandey L2/20-191 §6.6 Latin 欄逐碼位
// ============================================================
console.log("\n[① olduyghur — Pandey L2/20-191 §6.6 字母表逐碼位]");
try {
  const auth = JSON.parse(readFileSync(join(HERE, "fixtures", "olduyghur-l2-20-191.json"), "utf8"));
  // 權威單一 Latin token（§6.6 Latin 欄）；多讀法字母（GIMEL-HETH γ/x/q、
  // ZAYIN z/ž、FINAL HETH -x/-q）取首 token 為基礎讀法，與 §8.1/§8.2 一致：
  //   GIMEL-HETH 無點基礎讀 γ（加點區分見引擎 DOTTED_READ 哲學）、
  //   ZAYIN 無點 z（加兩點 ž）、FINAL HETH 詞尾 -x（加點 -q）。
  const CANON = { "GIMEL-HETH": "γ", "ZAYIN": "z", "FINAL HETH": "x" };
  // 引擎側的 l→LESH、δ→LAMEDH 裁定即期望：LESH 碼位 U+10F81 ↔ l、LAMEDH U+10F78 ↔ δ
  let p1 = 0, f1 = 0;
  const engineR2N = OU.romanToNative, engineN2R = OU.nativeToRoman;
  for (const [name, { cp: cphex, latin }] of Object.entries(auth.letters)) {
    const cpNum = parseInt(cphex, 16);
    const ch = String.fromCodePoint(cpNum);
    const canon = CANON[name] ?? latin;
    // 正向：權威 Latin token → 引擎 R2N 必須落到該碼位（單碼位字母）
    const fwd = engineR2N(canon);
    if (fwd === ch) p1++;
    else {
      f1++;
      failures.push(`✗ L1 olduyghur ${name} U+${cphex}: 權威 Latin=${JSON.stringify(canon)} 應為碼位 U+${cphex}，引擎 R2N=${[...fwd].map(c => "U+" + c.codePointAt(0).toString(16)).join(" ") || JSON.stringify(fwd)}`);
    }
    // 反向：碼位 → 引擎 N2R 必須回權威 Latin。
    // ALEPH：§6.6 Latin 欄 ʾ 為輔音讀法，§8.1 另規定詞首單 aleph 讀 ä——
    //   引擎依 §8.1 於詞首輸出 ä；此為權威內部兩節讀法分工，非衝突，故
    //   ALEPH 逐碼位斷言比對 §8.1 的 ä（其餘 17 字母比對 §6.6 Latin 欄）。
    const back = engineN2R(ch).normalize("NFC");
    const expected = name === "ALEPH" ? "ä" : canon;
    if (back === expected) p1++;
    else {
      f1++;
      failures.push(`✗ L1 olduyghur U+${cphex} ${name}: 權威 Latin=${JSON.stringify(expected)} 引擎 N2R=${JSON.stringify(backCanon)}`);
    }
  }
  // l→LESH 裁定專項：引擎 R2N("l") 必須恰為 U+10F81 LESH（不得為 LAMEDH U+10F78），
  // 且 R2N("δ") 必須恰為 U+10F78 LAMEDH（r 裁定：l 與 LAMEDH 不互換）
  const lFwd = engineR2N("l"), deltaFwd = engineR2N("δ");
  if (lFwd === String.fromCodePoint(0x10f81)) p1++;
  else { f1++; failures.push(`✗ L1 olduyghur 裁定 l→LESH 失守：引擎 R2N("l")=${[...lFwd].map(c=>"U+"+c.codePointAt(0).toString(16)).join(" ")}，應為 U+10f81 LESH`); }
  if (deltaFwd === String.fromCodePoint(0x10f78)) p1++;
  else { f1++; failures.push(`✗ L1 olduyghur 裁定 δ→LAMEDH 失守：引擎 R2N("δ")=${[...deltaFwd].map(c=>"U+"+c.codePointAt(0).toString(16)).join(" ")}，應為 U+10f78 LAMEDH`); }
  ok(f1 === 0, `L1 olduyghur L2/20-191 §6.6 逐碼位（18 字母 × 雙向 + l/δ 裁定專項）：${p1}/${p1 + f1}`,
    f1 ? `${f1} 項失敗（見明細）` : "");
} catch (e) { ok(false, "L1 olduyghur fixture 載入", String(e)); }

// ============================================================
// ② phagspa：Unicode NamesList U+A840..A877 逐碼位雙向映射
// ============================================================
console.log("\n[② phagspa — Unicode NamesList U+A840..A872 逐碼位]");
try {
  const nl = JSON.parse(readFileSync(join(HERE, "fixtures", "phagspa-nameslist.json"), "utf8"));
  const S = PH;
  const letters = Object.entries(nl.letters); // 57 個已賦碼位（A840–A873 符號 + A874–A877 標點）
  let p2 = 0, f2 = 0, p3 = 0, f3 = 0;
  // NamesList 只給碼位與名稱，不給羅馬轉寫；逐碼位真值 = 「碼位在引擎 N2R 下有
  // 互異、可往返的 token 且 R2N(token) 回到原碼位」。單射 + 逆射逐碼位驗證：
  const tokenOf = new Map(); // token → cp（查引擎映射唯一性）
  for (const [cphex, name] of letters) {
    const cpNum = parseInt(cphex, 16);
    const ch = String.fromCodePoint(cpNum);
    // 反向：N2R 必須認得每個已賦碼位（不得原樣透傳——透傳即映射缺失）
    const rom = norm(S.nativeToRoman(ch));
    if (rom === ch) {
      f3++;
      failures.push(`✗ L3 phagspa U+${cphex} ${name}: 引擎 N2R 原樣透傳（映射缺失）`);
    } else { p3++; tokenOf.set(rom, cpNum); }
    // 逆射：R2N(rom) 必須回到原碼位
    const back = S.romanToNative(rom);
    if (back === ch) p2++;
    else { f2++; failures.push(`✗ L2 phagspa U+${cphex} ${name}: token=${JSON.stringify(rom)} R2N 回=${[...back].map(c=>"U+"+c.codePointAt(0).toString(16)).join(" ")}，應回 U+${cphex}`); }
  }
  ok(f3 === 0, `L3 phagspa NamesList 逐碼位覆蓋（${letters.length} 已賦碼位皆有 token）：${p3}/${p3 + f3}`, f3 ? `${f3} 項缺失` : "");
  ok(f2 === 0, `L2 phagspa R2N 逆射逐碼位：${p2}/${p2 + f2}`, f2 ? `${f2} 項失敗` : "");
  // 單射：不同碼位不得共享同一 token
  const seenTok = new Map();
  const dupes = [];
  for (const [cphex] of letters) {
    const cpNum = parseInt(cphex, 16);
    const rom = norm(S.nativeToRoman(String.fromCodePoint(cpNum)));
    if (seenTok.has(rom) && seenTok.get(rom) !== cpNum) dupes.push([rom, seenTok.get(rom), cpNum]);
    else seenTok.set(rom, cpNum);
  }
  ok(dupes.length === 0, `L2 phagspa token 單射性（52 字母 + 5 符號/標點 token 互異）`,
    dupes.length ? `碰撞：${dupes.map(([t, a, b]) => `${JSON.stringify(t)}(U+${a.toString(16)},U+${b.toString(16)})`).join(", ")}` : "");
} catch (e) { ok(false, "② phagspa fixture 載入", String(e)); }

console.log(`\nolduyghur-phagspa-canon-gate: 通过 ${pass}/${pass + fail}`);
if (failures.length) {
  console.log(`[失敗明細 ${failures.length} 條]`);
  console.log(failures.slice(0, 60).join("\n"));
  process.exit(1);
}
