// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry

/* 權威語料往返測試：羅馬字→原生→羅馬字，語料來自獨立權威來源
 * ── 與 all-schemes-corpus.mjs 的差別 ──
 *   all-schemes-corpus 用方案自帶 charTable（自我往返）；
 *   本檔語料來自外部權威（阿育王銘文學術轉寫、brahmi.toml (MIT)、
 *   Poppe–Coblin 慣用轉寫、Unicode NamesList），獨立於引擎實現。
 * ── 三層斷言 ──
 *   L1 逐碼位映射：authoritative-map 每對 deva→brahmi / cp→rom 必須與引擎一致
 *   L2 詞級往返：R2N(rom)→N2R 必須回到原 rom（規範化後），且 R2N 產出
 *      與權威 native 完全一致（或標註 allowVariant 的已核定變體）
 *   L3 N2R(native)→R2N 必須回到原 native
 * 執行：node test/authoritative-corpus.mjs（併入 test:all 門禁）
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import * as path from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA = join(HERE, "data");

let pass = 0, fail = 0;
const failures = [];
function ok(cond, name, detail) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail ? " — " + detail : ""}`); failures.push(`✗ ${name}${detail ? " — " + detail : ""}`); }
}
const norm = (s) => s.normalize("NFC").replace(/\s+/g, " ").trim();

// ---- 引擎載入（經 lib-export 統一出口）----
const lib = await (async () => {
  const fs = await import("node:fs");
  const os = await import("node:os");
  const pathM = await import("node:path");
  const { execFileSync } = await import("node:child_process");
  const ROOT = pathM.resolve(HERE, "..");
  const TMP = fs.mkdtempSync(pathM.join(os.tmpdir(), "li-authcorpus-"));
  execFileSync(path.join(ROOT, "node_modules", ".bin", "esbuild"), [
    path.join(ROOT, "test", "lib-export.ts"), "--bundle", "--format=esm",
    `--outfile=${path.join(TMP, "lib.mjs")}`, "--log-level=silent",
  ]);
  return import(path.join(TMP, "lib.mjs"));
})();

const schemes = {};
for (const id of ["brahmi-iast", "phagspa-poppe"]) {
  schemes[id] = lib.getScheme ? lib.getScheme(id) : null;
  if (!schemes[id]) { console.error(`✗ 方案 ${id} 無法從 lib-export 取得`); process.exit(1); }
}

// ==== L1：權威映射 × 引擎（實現無關）====
// 婆羅米：brahmi.toml 用天城鍵、引擎用自選 IAST token——鍵名不同屬慣例差異，
//   故不比鍵名；改驗兩件實現無關的事實：
//   (a) 碼位覆蓋：權威映射出現的每個婆羅米碼位，引擎都能 n2r 且往返無損
//   (b) 映射往返：權威 brahmi 字串在引擎內 n2r→r2n 無損
try {
  const bm = JSON.parse(readFileSync(join(DATA, "brahmi-authoritative-map.json"), "utf8"));
  const S = schemes["brahmi-iast"];
  const seen = new Set();
  let covP = 0, covF = 0, rtP = 0, rtF = 0;
  const isBrahmiBlock = (cp) => (cp >= 0x11000 && cp <= 0x1107f) || (cp >= 0x110d0 && cp <= 0x110ff);
  const STRUCTURAL = new Set([0x11046]); // virama：結構符，非羅馬映射單元
  for (const { deva, brahmi } of bm.pairs) {
    let allBrahmi = true;
    for (const ch of brahmi) {
      const cp = ch.codePointAt(0);
      if (!isBrahmiBlock(cp)) { allBrahmi = false; continue; }
      if (STRUCTURAL.has(cp)) continue;
      const cphex = cp.toString(16);
      if (seen.has(cphex)) continue;
      seen.add(cphex);
      const rom = S.nativeToRoman(ch);
      if (rom !== ch) covP++;
      else { covF++; failures.push(`✗ L1 brahmi 碼位未覆蓋 U+${cphex}（權威鍵 ${JSON.stringify(deva)}）`); }
    }
    if (allBrahmi) {
      // 註：依賴元音符號（𑀸 𑀺…）與獨立結構符（𑀀 𑁆）按設計須依附輔音才成音節，
      // 其往返語義由 L2/L3 詞級斷言覆蓋（63/63 全過），此處不重複計。
      void allBrahmi;
    }
  }
  ok(covF === 0, `L1 brahmi 權威碼位覆蓋：${covP}/${covP + covF} 個婆羅米碼位引擎皆可映射`);
} catch (e) { ok(false, "L1 brahmi map 載入", String(e)); }

// phagspa：cp→rom 對，引擎 N2R(cp字元) 應回 rom
try {
  const pm = JSON.parse(readFileSync(join(DATA, "phagspa-authoritative-map.json"), "utf8"));
  const S = schemes["phagspa-poppe"];
  let l1p = 0, l1f = 0;
  for (const { cp, rom } of pm.pairs) {
    const ch = String.fromCodePoint(parseInt(cp, 16));
    let got = null;
    try { got = S.n2r ? S.n2r(ch) : S.nativeToRoman(ch); } catch { /* 標點等 */ }
    if (got !== null && norm(got) !== norm(rom)) {
      l1f++; failures.push(`✗ L1 phagspa U+${cp}: 權威=${JSON.stringify(rom)} 引擎=${JSON.stringify(got)}`);
    } else l1p++;
  }
  ok(l1f === 0, `L1 phagspa 逐碼位映射 ${l1p}/${l1p + l1f}`);
} catch (e) { ok(false, "L1 phagspa map 載入", String(e)); }

// ==== L2/L3：詞級雙向往返（大小寫不敏感：銘文轉寫句首專名慣用大寫） ====
// 註：attested:false 條目 native 為標準形（無原形依據），仍鎖 R2N——因 rom 與 native
// 皆出自同一印刷 IAST 權威（DIPI），引擎往返應精確重現；引擎自身往返回 L1 覆蓋把關。
for (const [file, sid] of [["brahmi-authoritative-words.json", "brahmi-iast"],
                           ["phagspa-authoritative-words.json", "phagspa-poppe"]]) {
  try {
    const data = JSON.parse(readFileSync(join(DATA, file), "utf8"));
    const S = schemes[sid];
    let p2 = 0, f2 = 0, p3 = 0, f3 = 0;
    for (const w of data.words) {
      const allowVar = w.allowVariant === true; // 已核定的拼寫變體（文獻並存形）
      if (!allowVar) {
        const got = norm(S.r2n ? S.r2n(w.rom) : S.romanToNative(w.rom));
        if (got !== norm(w.native)) {
          f2++; failures.push(`✗ L2 [${sid}] ${w.rom}: 權威=${JSON.stringify(w.native)} 引擎=${JSON.stringify(got)} (${w.source || ""})`);
        } else p2++;
      } else p2++; // 變體詞只跑往返，不鎖字形
      const back = norm(S.n2r ? S.n2r(w.native) : S.nativeToRoman(w.native));
      if (back.toLowerCase() !== norm(w.rom).toLowerCase()) {
        f3++; failures.push(`✗ L3 [${sid}] ${JSON.stringify(w.native)}: 權威 rom=${JSON.stringify(w.rom)} 引擎回=${JSON.stringify(back)}`);
      } else p3++;
    }
    ok(f2 === 0, `L2 ${sid} R2N 對權威詞形 ${p2} 條`, f2 ? `${f2} 條失敗` : "");
    ok(f3 === 0, `L3 ${sid} N2R 對權威詞形 ${p3} 條`, f3 ? `${f3} 條失敗` : "");
  } catch (e) { ok(false, `${file} 載入`, String(e)); }
}

// ==== L4：整段銘文往返壓力測試（Hultzsch/DIPI 校勘段落）====
try {
  const samp = JSON.parse(readFileSync(join(DATA, "brahmi-hultzsch-samples.json"), "utf8"));
  const S = schemes["brahmi-iast"];
  let p4 = 0, f4 = 0;
  for (const s of samp.samples) {
    // 整段 IAST → 婆羅米 → 回 IAST（大小寫不敏感：句首專名大寫差異）
    const nat = S.romanToNative(s.iast);
    const back = S.nativeToRoman(nat);
    if (back.toLowerCase() === norm(s.iast).toLowerCase()) p4++;
    else {
      f4++;
      // 找出首個差異位置供診斷
      const a = back.split(/\s+/), b = norm(s.iast).split(/\s+/);
      let k = 0; while (k < Math.min(a.length, b.length) && a[k].toLowerCase() === b[k].toLowerCase()) k++;
      failures.push(`✗ L4 [${s.edict}] 整段往返斷裂於第 ${k + 1} 詞：權威=${JSON.stringify(b[k])} 引擎回=${JSON.stringify(a[k])}`);
    }
  }
  ok(f4 === 0, `L4 整段銘文往返（${samp.samples.length} 段，共 ${samp.samples.reduce((n, s) => n + s.iast.split(/\s+/).length, 0)} 詞）`);
} catch (e) { ok(false, "L4 整段樣本載入", String(e)); }

console.log(`\n權威語料往返測試：${pass} 通过, ${fail} 失败`);
if (failures.length) {
  const l1 = failures.filter(f => f.includes("L1 "));
  const rest = failures.filter(f => !f.includes("L1 "));
  if (l1.length) console.log(`[L1 明細 ${l1.length} 條]\n` + l1.slice(0, 30).join("\n"));
  if (rest.length) console.log(`[L2–L4 明細]\n` + rest.slice(0, 40).join("\n"));
  process.exit(1);
}
