// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry

/* 梵文 8 套轉寫方案 —— 權威參考（sanscript / indic-transliteration）交叉對比回歸測試
 *
 * 目的：把「本引擎 native→roman」與「權威參考 sanscript 的 native→roman」逐條對比，
 *      凡分歧**不在已記錄慣例差異清單**內者，一律視為新缺陷並令測試失敗（防回歸）。
 *
 * 權威參考：test/fixtures/sanskrit-cross-golden.json
 *   —— 由 Python 套件 indic_transliteration（sanscript）對同一份語料逐條生成後固化的
 *      黃金檔（scheme → { native: sanscriptRoman }）。固化後本測試不再需要 Python 環境。
 *
 * 分歧分類（兩大類，均**已人工核實**、非本引擎缺陷）：
 *   A. 已記錄的「慣例差異」：以精確字串變換判定（ref → 本引擎應有之輸出），
 *      逐字串相等才算該類別，故變換不完全吻合者會掉出類別 → 判為新缺陷。
 *        · iast-candrabindu   IAST candrabindu：sanscript 作「~」，本引擎作「ṁ」
 *                            （IAST 家族慣用寫法；嚴格 IAST 亦作 m̐，sanscript 的 ~ 為 HK 體，不在 IAST 家族）
 *        · itrans-final-viram ITRANS 詞尾死輔音：sanscript 丟棄 virama，本引擎保留「.h」
 *        · wx-spec-deviation  WX 規範偏差（**sanscript 的 WX 表本身不合規**，見下）：
 *                            ळ（l̤→lY）、短 e ऎ（è→eV）、avagraha（'→Z，依 Bharati/Chaitanya/
 *                            Sangal 1996 附錄 B：avagraha＝Z，例 vamawoZnwaH）。
 *                            此類額外要求本引擎輸出經 N→R→N 往返自洽，防真缺陷蒙混。
 *        · slp1-llha          SLP1 ळ्ह：sanscript 漏 h 成「|a」（| 根本非 SLP1 字元），本引擎「Lha」
 *   B. sanscript 側故障（nukta）：sanscript 對 क़ 等 nukta 字**回傳天城體殘碼**（未轉寫），
 *      本引擎輸出正規羅馬字。判定：ref 含殘碼、本引擎輸出全羅馬字，且本引擎輸出
 *      **經 native→roman→native 往返自洽**——以自洽驗證防止真缺陷藉此類別蒙混。
 *
 *  ⚠️ 關於「權威」的自我警示：sanscript 的 WX / SLP1 表自帶偏差（已實測證實：
 *     WX 的 ळ 作 l̤a 而非 lY、ऎ 作 è 而非 eV、nukta 漏天城體；SLP1 的 ळ्ह 作 |a 而
 *     | 非 SLP1 字元）。故本測試對 WX/SLP1 的分歧**不盲信 sanscript**，而改以原始
 *     規範（WX 書、SLP1/Scharf）為準，把 sanscript 的這些偏差歸類為「參考側偏差」。
 *
 * 用法：
 *   node test/sanskrit-cross-reference.mjs               # 斷言模式（CI）
 *   node test/sanskrit-cross-reference.mjs --store <dir> # 額外傾倒「語料＋權威參考」合併檔
 *                                                        #   （存入交付包供日後調用）
 */
import assert from "node:assert";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "li-xref-"));
execFileSync(path.join(ROOT, "node_modules", ".bin", "esbuild"), [
  path.join(ROOT, "test", "lib-export.ts"), "--bundle", "--format=esm",
  `--outfile=${path.join(TMP, "lib.mjs")}`, "--log-level=silent",
]);
const lib = await import(path.join(TMP, "lib.mjs"));
const { SS_SCHEME } = await import(path.join(ROOT, "test", "_sanskrit-corpus.mjs"));

const GOLDEN_PATH = path.join(ROOT, "test", "fixtures", "sanskrit-cross-golden.json");
const golden = JSON.parse(fs.readFileSync(GOLDEN_PATH, "utf8"));

const norm = (s) => s.normalize("NFC");
const hasDeva = (s) => [...s].some((ch) => {
  const c = ch.codePointAt(0) ?? 0;
  return c >= 0x0900 && c <= 0x097f;
});

/* ---- 已記錄慣例差異：sanscript 參考輸出 → 本引擎應有輸出（精確變換） ----
 * 每個方案可有「多條」規則；任一命中即歸類。selfConsistent=true 的規則會額外
 * 要求本引擎輸出經 N→R→N 往返自洽，防止真缺陷藉「參考側偏差」類別蒙混。
 */
const RECORDED = {
  "sanskrit-iast": [
    {
      cat: "iast-candrabindu",
      note: "IAST candrabindu：sanscript「~」，本引擎「ṁ」（IAST 家族慣用；嚴格 IAST 亦作 m̐，~ 為 HK 體）",
      transform: (ref) => ref.replace(/~/g, "\u1E41"), // ~ → ṁ
    },
  ],
};

/* ---- 主對比 ---- */
const schemes = lib.listSchemes().filter((s) => s.id.startsWith("sanskrit-"));
assert.ok(schemes.length === 1, `應有 1 套梵文方案（其餘遷出 lilium資料），實得 ${schemes.length}`);

const storeDir = (() => {
  const i = process.argv.indexOf("--store");
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : null;
})();

const report = [];
let grandNewBugs = 0;
const newBugSamples = [];
const storeFiles = {};

for (const s of schemes) {
  const g = golden[s.id];
  assert.ok(g, `黃金參考缺少方案 ${s.id}`);
  const recRules = RECORDED[s.id] || [];
  const byCat = {};
  let nMatch = 0, nRecorded = 0, nSanscriptBug = 0, nNew = 0;
  const cases = [];

  for (const nativeRaw of Object.keys(g)) {
    const native = norm(nativeRaw);
    const ours = norm(s.nativeToRoman(native));
    const ref = norm(g[nativeRaw]);

    let status = "match";
    if (ours === ref) {
      nMatch++;
    } else {
      // 逐條嘗試已記錄規則；selfConsistent 規則須通過 N→R→N 往返自洽。
      let hit = null;
      for (const rule of recRules) {
        if (rule.transform(ref) !== ours) continue;
        if (rule.selfConsistent) {
          const back = norm(s.romanToNative(ours));
          if (back !== native) continue; // 不自洽 → 不歸類，視為新缺陷
        }
        hit = rule;
        break;
      }
      if (hit) {
        status = hit.cat;
        nRecorded++;
        byCat[hit.cat] = (byCat[hit.cat] || 0) + 1;
      } else if (hasDeva(ref) && !hasDeva(ours)) {
        // sanscript 側故障：回傳天城體殘碼。以「本引擎輸出往返自洽」確認我方正確。
        const back = norm(s.romanToNative(ours));
        if (back === native) {
          status = "sanscript-nukta";
          nSanscriptBug++;
          byCat["sanscript-nukta"] = (byCat["sanscript-nukta"] || 0) + 1;
        } else {
          status = "NEW-BUG";
          nNew++;
          if (newBugSamples.length < 40) {
            newBugSamples.push(`${s.id} ${JSON.stringify(native)} ours=${JSON.stringify(ours)} ref=${JSON.stringify(ref)} back=${JSON.stringify(back)}`);
          }
        }
      } else {
        status = "NEW-BUG";
        nNew++;
        if (newBugSamples.length < 40) {
          newBugSamples.push(`${s.id} ${JSON.stringify(native)} ours=${JSON.stringify(ours)} ref=${JSON.stringify(ref)}`);
        }
      }
    }
    if (storeDir) cases.push({ native, ours, golden: ref, status });
  }
  grandNewBugs += nNew;

  report.push({
    id: s.id, ss: SS_SCHEME[s.id], cases: Object.keys(g).length,
    nMatch, nRecorded, nSanscriptBug, nNew, byCat,
  });
  if (storeDir) {
    storeFiles[s.id] = {
      scheme: s.id,
      ssScheme: SS_SCHEME[s.id],
      reference: "indic-transliteration (sanscript) — Python",
      cases,
    };
  }
}

/* ---- 輸出 ---- */
const pad = (s, n) => String(s).padEnd(n);
const padS = (s, n) => String(s).padStart(n);
console.log("梵文轉寫方案 權威參考（sanscript）交叉對比");
console.log("=".repeat(96));
console.log(`${pad("方案", 22)}${pad("sanscript", 12)}${padS("語料", 8)}${padS("完全一致", 10)}${padS("慣例差異", 10)}${padS("參考方故障", 12)}${padS("新缺陷", 8)}`);
console.log("-".repeat(96));
for (const r of report) {
  console.log(
    `${pad(r.id, 22)}${pad(r.ss, 12)}${padS(r.cases, 8)}${padS(r.nMatch, 10)}${padS(r.nRecorded, 10)}${padS(r.nSanscriptBug, 12)}${padS(r.nNew === 0 ? "0✓" : r.nNew + "✗", 8)}`
  );
}
console.log("-".repeat(96));
const sum = (k) => report.reduce((a, r) => a + r[k], 0);
console.log(`${pad("合計", 22)}${pad("", 12)}${padS(sum("cases"), 8)}${padS(sum("nMatch"), 10)}${padS(sum("nRecorded"), 10)}${padS(sum("nSanscriptBug"), 12)}${padS(sum("nNew"), 8)}`);

console.log("\n已記錄慣例差異明細：");
const catTotals = {};
for (const r of report) for (const [c, n] of Object.entries(r.byCat)) catTotals[c] = (catTotals[c] || 0) + n;
for (const [c, n] of Object.entries(catTotals)) console.log(`  · ${pad(c, 22)} ${n}`);

if (storeDir) {
  fs.mkdirSync(storeDir, { recursive: true });
  for (const [id, obj] of Object.entries(storeFiles)) {
    fs.writeFileSync(path.join(storeDir, `${id}.json`), JSON.stringify(obj));
  }
  console.log(`\n已傾倒「語料＋權威參考」合併檔 ${Object.keys(storeFiles).length} 份 → ${storeDir}`);
}

if (grandNewBugs > 0) {
  console.log(`\n✗ 發現 ${grandNewBugs} 處**未記錄**的分歧（視為新缺陷，前 40 條）：`);
  for (const b of newBugSamples) console.log("    " + b);
  console.log("\n  若確認為新的慣例差異，請於 RECORDED 補上精確變換後再跑。");
  process.exit(1);
}
console.log(`\n✅ 梵文方案對齊權威參考：無未記錄分歧（${sum("nMatch")} 完全一致 / ${sum("nRecorded")} 慣例差異 / ${sum("nSanscriptBug")} 參考方故障）`);
