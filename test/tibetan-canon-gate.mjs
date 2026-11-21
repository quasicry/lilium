// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry

/* 藏文大規模真值語料門禁（corpus gate）— v2
 *
 * 語料：Esukhia Corpora (2021)，Zenodo DOI 10.5281/zenodo.5598435，
 * GitHub github.com/Esukhia/Corpora（tag 2021），許可 CC-BY-4.0。
 *   · 84000 平行語料藏文側（Parallel/84000/*.tmx → 84000-bo-sentences.txt，34,850 句）
 *   · Nanhai Corpus（Nanhai/CORPUS_TEXT_UTF8SIG/* → nanhai-bo-sentences.txt，121,890 句）
 * 規模：156,740 句 / ≈821 萬藏文碼位 / ≈136 萬音節（≥1 萬句、≥5 萬音節門檻的十倍以上）。
 *
 * 判準（v2，無白名單）：
 *   G1 嚴式雙向閉環：tibetanExtToWylie → wylieExtToTibetan，逐句碼位比對
 *      （唯一語義歸一：已定性的 bindu 0F82/0F83 ≡ 0F7E）。失配不設檻，
 *      以「首個分歧碼位」定性分類逐項報告。
 *   G2 出向不動點：w1 = extToWylie(s)；b = toTibetan(w1)；w2 = extToWylie(b)；
 *      規範空白後 w1 === w2。這是「閉環中丟失資訊」的偵測器：NO_TSHEG 分段歧義、
 *      梵咒連寫切分歧義、deprecated 預分解、打分制歧義等任何失真都會在此現形。
 *   主檻：G2 ≥99%。
 *
 * 交叉驗證：pyewts（Apache-2.0，OpenPecha/pyewts v1.0.0）對同一藏文句轉出
 * EWTS Wylie，與 lilium 出向比對（token 慣例不同：tsheg 用 /、堆疊用 +、
 * anusvara 用 ~M`）；統計僅供定性，不設檻。
 *
 * 教訓掛鉤：所有失配以「首個分歧碼位」定性分類（deprecated-0F76-79 預分解、
 * reversed-i-0F80、halanta-0F84、super-vs-subjoined、bindu 變體、打分制歧義），
 * 嚴禁硬湊白名單——本檔只報分類計數與樣本，不做 skip / whitelist。
 *
 * 執行：node test/tibetan-canon-gate.mjs
 */
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const CORPUS = path.join(ROOT, "corpus", "tibetan");
// 公開倉庫缺料降級：84000/nanhai 句庫體積大且許可未明，不入庫（同 corpus/ 慣例）。
// 本地工作線備有語料；clone 環境缺料時 SKIP 提示（取得方式見 corpus/README.md）。
if (!fs.existsSync(path.join(CORPUS, "84000-bo-sentences.txt")) || !fs.existsSync(path.join(CORPUS, "nanhai-bo-sentences.txt"))) {
  console.log("SKIP：藏文句庫語料未入庫（體積大/許可未明）。取得方式見 corpus/README.md 與 test/tibetan-canon-gate.mjs 檔頭註釋。");
  process.exit(0);
}

function loadSentences() {
  const files = [
    path.join(CORPUS, "84000-bo-sentences.txt"),
    path.join(CORPUS, "nanhai-bo-sentences.txt"),
  ];
  const sents = [];
  for (const f of files) {
    if (!fs.existsSync(f)) continue;
    for (const line of fs.readFileSync(f, "utf8").split("\n")) {
      const s = line.trim();
      if (s) sents.push(s);
    }
  }
  return sents;
}

// 語義歸一（僅 已定性的 bindu 多對一：0F82/0F83 語義 = anusvara 0F7E）；
// 其餘任何差異都算失配。
const CP_CLASS = (c) => (c === 0x0f82 || c === 0x0f83 ? 0x0f7e : c);
const normKey = (s) =>
  Array.from(s).map((ch) => CP_CLASS(ch.codePointAt(0) ?? 0)).join(",");

// ── 載入 lilium 引擎（esbuild bundle，慣例同 classical-corpus.mjs）────────
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "li-tibgate-"));
execFileSync(path.join(ROOT, "node_modules", ".bin", "esbuild"), [
  path.join(ROOT, "test", "lib-export.ts"), "--bundle", "--format=esm",
  `--outfile=${path.join(TMP, "lib.mjs")}`, "--log-level=silent",
]);
const lib = await import(path.join(TMP, "lib.mjs"));

// ── pyewts 交叉驗證（批量 JSONL 子進程）───────────────────────────────────
const PY = "/home/agentuser/.venv-pyewts/bin/python";
const crossAvailable = fs.existsSync(PY);
function pyewtsBatch(sents) {
  const script = `
import sys, json
sys.path.insert(0, "/home/agentuser/.venv-pyewts/lib/python3.11/site-packages")
import pyewts
c = pyewts.pyewts()
for line in sys.stdin:
    line = line.rstrip("\\n")
    try:
        sys.stdout.write(json.dumps(c.toWylie(line)) + "\\n")
    except Exception:
        sys.stdout.write(json.dumps("") + "\\n")
`;
  const sp = spawnSync(PY, ["-c", script], {
    input: sents.join("\n") + "\n",
    maxBuffer: 1 << 28,
    timeout: 560_000,
  });
  if (sp.status !== 0) throw new Error("pyewts failed: " + (sp.stderr || "").slice(0, 500));
  return sp.stdout.toString("utf8").split("\n").filter((x) => x !== "").map((x) => JSON.parse(x));
}

// ── 主流程 ────────────────────────────────────────────────────────────────
const sentences = loadSentences();
if (sentences.length < 10_000) {
  console.error(`✗ 語料句數不足：${sentences.length} < 10000`);
  process.exit(1);
}
let cpTotal = 0;
for (const s of sentences) cpTotal += s.length;
console.log(`corpus: ${sentences.length} sentences, ${cpTotal} codepoints`);

const total = sentences.length;
let g1 = 0, g2 = 0;
const g1Fails = [], g2Fails = [];
const wylieOut = crossAvailable ? [] : null;
const normSpace = (s) => s.replace(/\s+/g, " ").trim();

const t0 = Date.now();
for (let i = 0; i < sentences.length; i++) {
  const s = sentences[i];
  const w1 = lib.tibetanExtToWylie(s);
  if (wylieOut) wylieOut.push(w1);
  const b1 = lib.wylieExtToTibetan(w1);
  if (normKey(b1) === normKey(s)) g1++;
  else g1Fails.push({ i, s, w1, back: b1 });
  const w2 = lib.tibetanExtToWylie(b1);
  if (normSpace(w1) === normSpace(w2)) g2++;
  else g2Fails.push({ i, s, w1, back: b1, w2 });
}
const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

const r1 = (g1 / total) * 100;
const r2 = (g2 / total) * 100;
console.log(`G1 strict round-trip : ${g1}/${total} = ${r1.toFixed(3)}%`);
console.log(`G2 outbound fixpoint : ${g2}/${total} = ${r2.toFixed(3)}%  (${elapsed}s)`);
console.log(`cross-check: ${crossAvailable ? "pyewts available" : "unavailable (closed-loop only)"}`);

// ── 失配定性（首分歧碼位；不做白名單）────────────────────────────────────
function classify(a, b, normFn) {
  const A = Array.from(a), B = Array.from(b);
  let diffCp = null;
  for (let k = 0; k < Math.max(A.length, B.length); k++) {
    const ca = normFn(A[k]?.codePointAt(0) ?? -1);
    const cb = normFn(B[k]?.codePointAt(0) ?? -1);
    if (ca !== cb) { diffCp = ca !== -1 ? ca : cb; break; }
  }
  if (diffCp === null) return "equal-after-norm";
  if (diffCp >= 0x0f76 && diffCp <= 0x0f79) return "deprecated-0F76-79";
  if (diffCp === 0x0f81) return "deprecated-0F76-79";
  if (diffCp === 0x0f80) return "reversed-i-0F80";
  if (diffCp === 0x0f84) return "halanta-0F84";
  if (diffCp >= 0x0f90 && diffCp <= 0x0fbc) return "super-vs-subjoined";
  if (diffCp === 0x0f82 || diffCp === 0x0f83 || diffCp === 0x0f7e) return "bindu-variants";
  if (diffCp >= 0x0f20 && diffCp <= 0x0f3f) return "digit-symbol";
  if (diffCp === 0x0f00) return "oM-0F00";
  if (diffCp === 0x0f39) return "tsaphru-0F39";
  if (diffCp >= 0x0f00 && diffCp <= 0x0fff) {
    if (diffCp === 0x0f0b || diffCp === 0x0f0c || diffCp === 0x20 || diffCp === 0x0f0d)
      return "separator-convention";
    return "tib-cp-0x" + diffCp.toString(16).toUpperCase().padStart(4, "0");
  }
  if (diffCp === 0x20) return "separator-convention";
  if (diffCp >= 0x30 && diffCp <= 0x39) return "ascii-digit-context";
  return "non-tib-0x" + diffCp.toString(16).toUpperCase().padStart(4, "0");
}

const g1Class = {};
for (const f of g1Fails) {
  const tag = classify(f.s, f.back, CP_CLASS);
  (g1Class[tag] ??= []).push(f);
}
console.log("\nG1 fail-classification (first-divergent codepoint, no whitelist):");
for (const [tag, arr] of Object.entries(g1Class).sort((a, b) => b[1].length - a[1].length)) {
  console.log(`  ${tag}: ${arr.length}`);
  for (const ex of arr.slice(0, 2)) {
    console.log(`    [${ex.i}] ${JSON.stringify(ex.s.slice(0, 36))} -> ${JSON.stringify(ex.w1.slice(0, 36))} -> ${JSON.stringify(ex.back.slice(0, 36))}`);
  }
}

const g2Class = {};
for (const f of g2Fails) {
  const tag = classify(f.w1, f.w2, (c) => c);
  (g2Class[tag] ??= []).push(f);
}
console.log("\nG2 fail-classification (outbound fixpoint):");
for (const [tag, arr] of Object.entries(g2Class).sort((a, b) => b[1].length - a[1].length)) {
  console.log(`  ${tag}: ${arr.length}`);
  for (const ex of arr.slice(0, 2)) {
    console.log(`    [${ex.i}] w1=${JSON.stringify(ex.w1.slice(0, 44))} w2=${JSON.stringify(ex.w2.slice(0, 44))}`);
  }
}

// ── pyewts 交叉驗證（前 20000 句；僅定性不設檻）───────────────────────────
if (crossAvailable) {
  const N = Math.min(sentences.length, 20000);
  const py = pyewtsBatch(sentences.slice(0, N));
  let agree = 0, disagree = 0;
  const disSamples = [];
  // 慣例差異歸一：pyewts 的 /（tsheg/shad）、+（堆疊顯式）、`、~M`（anusvara 組合序）。
  // 口徑 A（原樣字串，僅規範空白）＋ 口徑 B（只比音節序列：兩側各自剝離標註/標點 token
  // 之後逐 token 比對）——shad 慣例差（lilium `<.>` ↔ pyewts `/`）不計入口徑 B。
  const normP = (pw) => pw.replace(/~M`?/g, "M").replace(/\+/g, "").replace(/`/g, "").replace(/\//g, " ").replace(/\s+/g, " ").trim();
  const normL = (lw) => lw.replace(/\s+/g, " ").trim();
  const syllP = (pw) => pw.replace(/~M`?/g, "M").replace(/`/g, "").replace(/_/g, "").split(/[\s/]+/).filter((t) => t && /[a-zA-Z'?]/.test(t));
  const syllL = (lw) => lw.split(/\s+/).filter((t) => t && !/^<[^>]*>$/.test(t) && /[a-zA-Z'?]/.test(t.replace(/<[^>]*>/g, "")));
  let agreeB = 0, disagreeB = 0;
  const disB = [];
  for (let i = 0; i < N; i++) {
    const pw = py[i];
    if (typeof pw !== "string") { disagree++; continue; }
    if (normP(pw) === normL(wylieOut[i])) agree++;
    else {
      disagree++;
      if (disSamples.length < 6) disSamples.push({ i, lilium: normL(wylieOut[i]).slice(0, 60), pyewts: normP(pw).slice(0, 60) });
    }
    const sp = syllP(pw).join(" "), sl = syllL(wylieOut[i]).map((t) => t.replace(/~M`?/g, "M").replace(/`/g, "").replace(/<[^>]*>/g, "")).filter((t) => t && /[a-zA-Z'?]/.test(t)).join(" ");
    if (sp === sl) agreeB++;
    else {
      disagreeB++;
      if (disB.length < 6) disB.push({ i, lilium: sl.slice(0, 60), pyewts: sp.slice(0, 60) });
    }
  }
  console.log(`\npyewts cross-check (${N} sentences, token conventions differ): agree=${agree} disagree=${disagree} (${((agree / N) * 100).toFixed(2)}%)`);
  for (const d of disSamples) console.log(`  diff [${d.i}] lilium=${JSON.stringify(d.lilium)} pyewts=${JSON.stringify(d.pyewts)}`);
  console.log(`  syllable-only口径B: agree=${agreeB} disagree=${disagreeB} (${((agreeB / N) * 100).toFixed(2)}%)`);
  for (const d of disB.slice(0, 4)) console.log(`  Bdiff [${d.i}] lilium=${JSON.stringify(d.lilium)} pyewts=${JSON.stringify(d.pyewts)}`);
}

console.log(`\nGATE: ${r2 >= 99 ? "PASS" : "FAIL"} (G2 outbound-fixpoint ≥99%, actual ${r2.toFixed(3)}%; G1 strict ${r1.toFixed(3)}%)`);
process.exit(r2 >= 99 ? 0 : 1);
