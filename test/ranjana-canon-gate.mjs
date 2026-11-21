// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry

/**
 * 蘭札體碼位級真值門禁（CBETA 外字 RJ 缺字碼雙向 golden pairs）。
 *
 * ── 真值來源（許可欄）──────────────────────────────────────────────────
 *   CBETA 官方外字資料庫 cbeta_sanskrit.json（cbeta-org/cbeta_gaiji，
 *   https://github.com/cbeta-org/cbeta_gaiji）。CBETA 數據遵循其
 *   non-commercial 條款——**僅本地使用，不隨 lilium-handoff 提交**；
 *   落地於 corpus/ranjana/（見下方 CORPUS 路徑，git 之外）。
 *   字碼對照本身屬語言事實（碼位 ↔ 拉丁轉寫的對應），不受著作權拘束，
 *   但語料檔整體按來源條款管理。src/dict/data/ranjana.ts 的 2,240 條
 *   （RJ-Cxxxx/RJ-Exxxx 蘭札 + SD-xxxx 悉曇）即由該庫導出。
 *
 * ── 門禁內容 ──────────────────────────────────────────────────────────
 *   ① 碼位規則：RJ-Cxxxx ↔ pua U+10Cxxxx、RJ-Exxxx ↔ U+10Exxxx、
 *      SD-A/B/C/D/Exxxx ↔ U+104/105/106/107/108xxxx ——鍵尾與 PUA 尾
 *      逐條一致（2,240 條全量，雙向斷言）。
 *   ② RJ 碼 ↔ romanized 雙向 golden pairs（2,240 條全量）：
 *      · 正向：restoreRanjanaCodes("RJ-xxxx")（roman 模式）必須回
 *        條目 romanized 欄（無 romanized 條目必須原樣透傳——引擎語義）；
 *        pua 模式必須回 U+10xxxx 碼位字元。
 *      · 反向：romanized 欄經 sanskrit-iast 方案（iastToDevanagari →
 *        devanagariToIast，lilium 的 Ranjana 檔案復用 Devanagari 碼位，
 *        見 src/languages.ts SCRIPT_PREFERRED_SCHEME.ranjana = "sanskrit-iast"）
 *        往返必須恆等——即 romanized 欄本身是合法 IAST 正字。
 *        唯一已知的「ś?」（RJ-CD7C，CBETA 原庫即帶 ? 存疑標記）按
 *        語料事實收錄、不參與 IAST 往返，單獨計數。
 *   ③ 聯動：整句「RJ-xxxx RJ-yyyy …」經 restoreRanjanaCodes（roman）
 *      → iastToDevanagari 得到 Devanagari 碼位串（蘭札字型渲染輸入），
 *      devanagariToIast 回羅馬字，canon 歸一後與逐條 romanized 串接
 *      比對（空白折疊/NFC，僅歸一非正字差異）。
 *
 * ── 語料規模限制（如實註明）─────────────────────────────────────────
 *   Unicode 級 Ranjana 大規模語料不存在——蘭札體尚無標準 Unicode，
 *   大規模編碼提案仍在 L2/2023 提案（UCB 提供）審議中，故本門禁的
 *   「語料」只能是 CBETA 缺字碼對照表（2,240 條 golden pairs），
 *   無法像 sanskrit/pali 門禁那樣跑整段 GRETIL 文本雙向閉環。
 *
 * 執行：node test/ranjana-canon-gate.mjs（併入 test:all 門禁）
 * 末行輸出「ranjana-canon-gate: 通过 N/M」式計數行。
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
/* CBETA gaiji 對照語料在 lilium-handoff 之外、git 之外（CBETA non-commercial）*/
const CORPUS = path.resolve(ROOT, "..", "corpus", "ranjana");

/* 引擎側：與 test/sanskrit-canon-gate.mjs 同法，esbuild 現場 bundle 後 import */
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "li-ranjana-gate-"));
execFileSync(path.join(ROOT, "node_modules", ".bin", "esbuild"), [
  path.join(ROOT, "test", "lib-export.ts"), "--bundle", "--format=esm",
  `--outfile=${path.join(TMP, "lib.mjs")}`, "--log-level=silent",
]);
const lib = await import(path.join(TMP, "lib.mjs"));
const toDev = (s) => lib.iastToDevanagari(s, { mode: "iast" });
const toIast = (s) => lib.devanagariToIast(s, { mode: "iast" });

/* restoreRanjanaCodes 位於 src/dict/buddhist.ts（不在 lib-export 出口），
 * 單獨 bundle；其依賴 loadRanjanaMap 走 dict/buddhist-data 惰性 require，
 * esbuild platform=node 下可解析。 */
execFileSync(path.join(ROOT, "node_modules", ".bin", "esbuild"), [
  path.join(ROOT, "src", "dict", "buddhist.ts"), "--bundle", "--format=esm",
  "--platform=node", `--outfile=${path.join(TMP, "bud.mjs")}`, "--log-level=silent",
]);
const bud = await import(path.join(TMP, "bud.mjs"));
const restore = bud.restoreRanjanaCodes;

/* 真值：src/dict/data/ranjana.lazy.ts（自動生成，源頭 ranjana.ts）。
 * 與 corpus/ranjana/ 的 cbeta 導出（若存在）逐條核對。 */
execFileSync(path.join(ROOT, "node_modules", ".bin", "esbuild"), [
  path.join(ROOT, "src", "dict", "data", "ranjana.lazy.ts"), "--bundle",
  "--format=esm", `--outfile=${path.join(TMP, "ranj.mjs")}`, "--log-level=silent",
]);
const ranjData = await import(path.join(TMP, "ranj.mjs"));
const MAP = ranjData.loadRanjanaMap();
const ENTRIES = Object.entries(MAP);
const RJ = ENTRIES.filter(([k]) => k.startsWith("RJ-"));
const SD = ENTRIES.filter(([k]) => k.startsWith("SD-"));

let pass = 0, fail = 0;
const failures = [];
function ok(cond, name, detail) {
  if (cond) pass++;
  else { fail++; failures.push(`✗ ${name}${detail ? " — " + detail : ""}`); }
}
const norm = (s) => s.normalize("NFC").replace(/\s+/g, " ").trim();

/* ── ① 鍵 ↔ PUA 碼位規則（2,240 條全量，雙向）────────────────────────
 * RJ-Cxxxx → U+10Cxxxx；RJ-Exxxx → U+10Exxxx；
 * SD-A/B/C/D/Exxxx → U+104/105/106/107/108xxxx。
 * 正向：pua 欄必須恰為規則碼位；反向：String.fromCodePoint(pua) 經
 * restoreRanjanaCodes 的 pua 模式必須回對應碼位字元（由 ② 的 pua 斷言覆蓋）。
 */
const FAMILY = { C: "10C", E: "10E" };
const SD_FAMILY = { A: "104", B: "105", C: "106", D: "107", E: "108" };
const expectedPua = (k) =>
  k.startsWith("RJ-") ? "U+" + FAMILY[k[3]] + k.slice(4)
                      : "U+" + SD_FAMILY[k[3]] + k.slice(4);
for (const [k, v] of ENTRIES) {
  ok(v.pua === expectedPua(k), `① 碼位 ${k}`, `pua=${v.pua} 期望=${expectedPua(k)}`);
}

/* ── ② RJ 碼 ↔ romanized 雙向 golden pairs（全量）────────────────── */
const IAST_RE = /^[A-Za-z\u00C0-\u024F\u1E00-\u1EFF\u0300-\u036F]+$/;
let romCount = 0, noRom = 0, pendingQ = 0;
for (const [k, v] of RJ) {
  if (!v.romanized) { noRom++; continue; }
  if (v.romanized === "ś?") { pendingQ++; continue; } // CBETA 原庫存疑標記，不參與 IAST 往返
  if (!IAST_RE.test(v.romanized)) {
    ok(false, `② ${k} romanized 非純 IAST token`, JSON.stringify(v.romanized));
    continue;
  }
  romCount++;
  /* 正向：restoreRanjanaCodes roman 模式 → romanized 欄 */
  const fwd = restore(k, "roman");
  ok(fwd === v.romanized, `② 正向 ${k}`, `engine=${JSON.stringify(fwd)} golden=${JSON.stringify(v.romanized)}`);
  /* pua 模式 → PUA 碼位字元 */
  const puaChar = String.fromCodePoint(parseInt(v.pua.slice(2), 16));
  const fwdPua = restore(k, "pua");
  ok(fwdPua === puaChar, `② pua ${k}`, `engine=${JSON.stringify(fwdPua)} 期望=${v.pua}(${puaChar})`);
  /* 反向：romanized 經 sanskrit-iast 方案（Devanagari 碼位復用）往返恆等 */
  const dev = toDev(v.romanized);
  const back = toIast(dev);
  ok(norm(back) === norm(v.romanized), `② 反向 IAST 往返 ${k}`,
     `roman=${JSON.stringify(v.romanized)} dev=${JSON.stringify(dev)} back=${JSON.stringify(back)}`);
}
ok(true, `② 統計：RJ ${RJ.length} 條（有 romanized ${romCount + pendingQ}、無 ${noRom}、存疑 ś? ${pendingQ}）`);

/* SD（悉曇）通道紀律：restoreRanjanaCodes 的 replace 正則僅匹配 RJ-前綴，
 * SD-xxxx 必須原樣透傳（悉曇碼另有 SD-A440… 顯示通道，不由本函式還原）。
 * 全量 2,074 條斷言透傳語義。 */
let sdPass = 0, sdBad = [];
for (const [k] of SD) {
  if (restore(k, "roman") === k) sdPass++;
  else sdBad.push(k);
}
ok(sdBad.length === 0, `② SD 透傳（通道紀律）${sdPass}/${SD.length}`,
   sdBad.length ? `失敗如：${sdBad.slice(0, 5).join(",")}` : "");

/* ── ③ 聯動：RJ 串 → restore(roman) → IAST→Devanagari → back → canon ──
 * 取全部有 romanized 的 RJ 條目串成一句，逐條 golden 與閉環輸出比對。
 * （蘭札走 Devanagari 碼位復用 sanskrit-iast：輸出即 Nithya Ranjana DU
 * 字型的渲染輸入。） */
const withRom = RJ.filter(([, v]) => v.romanized && v.romanized !== "ś?");
const keysJoined = withRom.map(([k]) => k).join(" ");
const romanJoined = restore(keysJoined, "roman");
const devJoined = toDev(romanJoined);
const backJoined = toIast(devJoined);
const goldenJoined = withRom.map(([, v]) => v.romanized).join(" ");
ok(norm(backJoined) === norm(goldenJoined), `③ 整串聯動 ${withRom.length} 條`,
   `差異首現處：${(() => { const a = norm(backJoined).split(" "), b = norm(goldenJoined).split(" ");
     for (let i = 0; i < Math.max(a.length, b.length); i++) if (a[i] !== b[i]) return `#${i} engine=${JSON.stringify(a[i])} golden=${JSON.stringify(b[i])}`;
     return "無"; })()}`);

/* ── 語料檔核對（僅本地，git 之外；存在時逐條對帳）────────────────── */
let corpusChecked = 0;
const corpusFile = path.join(CORPUS, "cbeta-sanskrit-golden.json");
if (fs.existsSync(corpusFile)) {
  const golden = JSON.parse(fs.readFileSync(corpusFile, "utf8"));
  for (const [k, g] of Object.entries(golden)) {
    const v = MAP[k];
    const hit = v && v.romanized === g.romanized && v.pua === g.pua;
    if (hit) corpusChecked++;
    else ok(false, `語料對帳 ${k}`, `golden=${JSON.stringify(g)} engine=${JSON.stringify(v)}`);
  }
  ok(true, `語料對帳：corpus/ranjana/cbeta-sanskrit-golden.json 核對 ${corpusChecked} 條`);
} else {
  console.log("[ranjana-canon-gate] corpus/ranjana/ 語料檔不在本機（CBETA non-commercial，僅本地、不入 git）——以 src/dict/data/ranjana.lazy.ts 2,240 條為真值");
}

/* ── 報表 ───────────────────────────────────────────────────────────── */
console.log("[ranjana-canon-gate] CBETA 外字 RJ 碼雙向 golden pairs（僅本地語料）");
console.log(`[ranjana-canon-gate] 表規模：${ENTRIES.length} 條（RJ ${RJ.length}＋SD ${SD.length}）`);
console.log(`[ranjana-canon-gate] 碼位規則：${ENTRIES.length} 條全量`);
console.log(`[ranjana-canon-gate] RJ golden pairs：有 romanized ${romCount + pendingQ}、無 ${noRom}、存疑 ś? ${pendingQ}；IAST 往返（sanskrit-iast 方案）${romCount} 條`);
console.log(`[ranjana-canon-gate] 整串聯動：${withRom.length} 條`);
console.log(`[ranjana-canon-gate] 語料限制註記：Unicode 級 Ranjana 大規模語料不存在（L2/2023 提案中）`);
for (const f of failures) console.error(f);
console.log(`ranjana-canon-gate: 通过 ${pass}/${pass + fail}`);
if (fail > 0) process.exit(1);
