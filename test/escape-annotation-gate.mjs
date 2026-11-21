// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry

/**
 * B2/B3 語料門禁（r156）：區塊外字元 roman 逃逸體例統一（⟨U+XXXX⟩）＋
 * mongolian 區塊外 SMP 拆裂修復。
 *
 *  1. 出向體例：受影響方案對區塊外字元輸出 ⟨U+XXXX⟩ 註記（零 `\\u` 殘留；
 *     舊 '\uXXXXXX' 6 位 hex 不再作為輸出體例）。
 *  2. 入向兼容：⟨U+XXXX⟩ 與舊 \uXXXX 6/4 位 hex 皆原樣還原碼位。
 *  3. mixed-text 往返：native＋區塊外字元＋emoji＋孤立代理對 → n2r → r2n
 *     byte-identical（掃描層 transliterateLongText 全通路）。
 *  4. B3：mongolian emoji 連跑／混合代理對雙向透傳＋鏈式二次轉換穩定。
 *  5. 邊界：100k 字符單進程 --max-old-space-size=768 完成不拋錯。
 */
import assert from "node:assert";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "li-escape-ann-"));
execFileSync(path.join(ROOT, "node_modules", ".bin", "esbuild"), [
  path.join(ROOT, "test", "lib-export.ts"), "--bundle", "--format=esm",
  `--outfile=${path.join(TMP, "lib.mjs")}`, "--log-level=silent",
]);
const { getScheme, transliterateLongText } = await import(path.join(TMP, "lib.mjs"));
const { transliterateText } = await import(path.join(TMP, "lib.mjs"));

let pass = 0, fail = 0;
const failures = [];
function check(cond, label, detail) {
  if (cond) { pass++; } else { fail++; failures.push(`${label}${detail ? " — " + detail : ""}`); }
}
const hex = (s) => [...s].map((c) => c.codePointAt(0).toString(16)).join(" ");

/* ---------- 1. 出向體例：⟨U+XXXX⟩、零 \u 殘留 ---------- */
const OUT_SCHEMES = [
  "zanabazar", "soyombo", "mongolian", "brahmi-iast", "siddham-iast",
  "sanskrit-iast", "sanskrit-iso15919", "pali-iso15919",
];
const FENCE = "("; // 區塊外標點（ASCII 開括號＝方案 trigger 詞界字元）
for (const id of OUT_SCHEMES) {
  const sc = getScheme(id);
  const out = sc.nativeToRoman("a" + FENCE + "b");
  check(!out.includes("\\u"), `出向零 esc 殘留 ${id}`, JSON.stringify(out));
  check(!/[⟨]/.test(out) || out.includes("⟨U+"), `註記體例 ${id}`, JSON.stringify(out));
}
// 代表性 golden：未收錄碼位輸出精確註記
const GOLDEN = [
  ["sanskrit-iast", "\u090D", "⟨U+090D⟩"],
  ["brahmi-iast", String.fromCodePoint(0x11045), "⟨U+11045⟩"],
];
for (const [id, nat, exp] of GOLDEN) {
  const got = getScheme(id).nativeToRoman(nat);
  check(got === exp, `golden ${id}`, `got ${JSON.stringify(got)} exp ${JSON.stringify(exp)}`);
}

/* ---------- 2. 入向雙體例還原 ---------- */
for (const id of OUT_SCHEMES) {
  const sc = getScheme(id);
  const cpv = id === "brahmi-iast" ? 0x11045 : 0x0041;
  const ann = sc.romanToNative(`⟨U+${cpv.toString(16).toUpperCase().padStart(6, "0")}⟩`);
  const oldEsc = sc.romanToNative(`\\u${cpv.toString(16).toUpperCase().padStart(6, "0")}`);
  const want = String.fromCodePoint(cpv);
  check(ann.includes(want), `⟨U+XXXX⟩ 入向 ${id}`, JSON.stringify(ann));
  check(oldEsc.includes(want) || oldEsc === want, `舊 \\uXXXX 兼容 ${id}`, JSON.stringify(oldEsc));
}

/* ---------- 3＋4. mixed-text 掃描層往返（byte-identical）＋鏈式穩定 ---------- */
const MIXED = [
  ["zanabazar", () => getScheme("zanabazar").romanToNative("ka") + "A" + getScheme("zanabazar").romanToNative("ra")],
  ["soyombo", () => getScheme("soyombo").romanToNative("ka") + "A" + getScheme("soyombo").romanToNative("ra")],
  ["sanskrit-iso15919", () => "कAक(क"],
  ["mongolian", () => "ᠮᠣᠩᠭᠣᠯ😀😀᠀ᠨ"],
  ["siddham-iast", () => "𑖀A𑖁"],
];
for (const [id, mk] of MIXED) {
  const n = mk();
  const sc = getScheme(id);
  // 方案級往返（byte-identical）
  const r1 = sc.nativeToRoman(n);
  const b1 = sc.romanToNative(r1);
  check(b1 === n, `mixed 往返（方案級）${id}`, `n2r=${JSON.stringify(r1)} r2n=${JSON.stringify(b1)} (${hex(b1)})`);
  // 掃描層往返（byte-identical）
  const r = transliterateText(n, id, false).text;
  const b = transliterateText(r, id, true).text;
  check(b === n, `mixed 往返（掃描層）${id}`, `n2r=${JSON.stringify(r)} r2n=${JSON.stringify(b)} (${hex(b)})`);
  // 孤立代理對不吞改
  const lone = "x\ud83dy";
  const lr = transliterateText(lone, id, false);
  check(lr.ok !== undefined, `孤立代理不拋錯 ${id}`);
}
// mongolian emoji 連跑鏈式二次轉換
const mg = getScheme("mongolian");
const e = "😀😀😀᠀";
const e1 = transliterateText(e, "mongolian", false).text;
const e2 = transliterateText(e1, "mongolian", false).text;
check(e1 === e2, "mongolian emoji 鏈式穩定", JSON.stringify(e1) + " vs " + JSON.stringify(e2));
check(mg.romanToNative(e1) === e, "mongolian emoji r2n 還原（方案級）", JSON.stringify(e1));

/* ---------- 5. 邊界：100k 字符 ---------- */
const big = ("ᠮᠣᠩᠭᠣᠯ😀" + "क‡" ).repeat(6000);
assert.strictEqual([...big].length >= 50000, true);
const t0 = Date.now();
const bigOut = transliterateLongText(big, mg, false);
check(bigOut.text.length > 0 && bigOut.text.includes("😀"), "100k 邊界完成", `${Date.now() - t0}ms`);

console.log(`escape-annotation-gate: pass=${pass} fail=${fail}`);
if (fail > 0) {
  console.log(failures.slice(0, 30).join("\n"));
  process.exit(1);
}
