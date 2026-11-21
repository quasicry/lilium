// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry

/**
 * 梵文語料真值門禁（GRETIL bulk archive 雙向閉環）——sanskrit-iast 方案。
 *
 * ── 語料來源（在 lilium-handoff 之外，僅讀取不提交）────────────────────
 *   ../corpus/sanskrit/gretil/1_sanskr/tei/transformations/plaintext/*.txt
 *   —— GRETIL（SUB Göttingen）梵文全量包 1_sanskr.zip 的 TEI plaintext 轉換，
 *   逐檔許可標頭明確（800 檔 CC BY-NC-SA 4.0、1 檔 CC BY-SA 4.0，見
 *   ../corpus/sanskrit/SOURCES.md）。羅馬轉寫（IAST 慣例）梵文文本，
 *   空行分段（段落＝非空連續行合併）。
 *
 * ── 門禁內容：雙向閉環 ────────────────────────────────────────────────
 *   每段 roman --iastToDevanagari(sanskrit)--> 天城體
 *        --devanagariToIast(sanskrit)--> 羅馬字，
 *   與原文經 canon 歸一後比對（兩側同一函式）。
 *   canon 規則（僅歸一非正字差異）：
 *   · 空白 collapse＋trim（語料行尾/連續空白隨意）；
 * · 大小寫折疊（天城體無大小寫概念，toLowerCase 兜底避免誤報）；
 *   · NFC 正規化（變音組合字兩種編碼序等價）；
 *   · 連字符隔音號剝除（tadvacanir-mitau 型排版隔音，非正字差異；
 *     avagraha 縮約 ' 不剝——引擎明文正字映射 ऽ）。
 *   語料過濾（雜訊段，跳過並計數）：僅允許 IAST 字母（含變音符）＋
 *   空白＋常規標點（. , ; : ? ! … — - ' ’ / | - ＋ || 段號）原樣透傳；
 *   數字、底線連字（bbs_1,1.5 段號）、括弧補注、< > 標籤、天城體等一律視雜訊跳過。
 *
 * 執行：node test/sanskrit-canon-gate.mjs
 * 末行輸出「sanskrit-canon-gate: 通过 N/M」式計數行。
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
/* 語料目錄在 lilium-handoff 之外（../corpus/sanskrit/gretil/），絕對路徑引用、不拷入 R */
const CORPUS = path.resolve(
  ROOT, "..", "corpus", "sanskrit", "gretil", "1_sanskr", "tei", "transformations", "plaintext",
);

/* 與 test/pali-canon-gate.mjs 同法：esbuild 現場 bundle lib-export.ts 後 import */
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "li-sancorpus-"));
execFileSync(path.join(ROOT, "node_modules", ".bin", "esbuild"), [
  path.join(ROOT, "test", "lib-export.ts"), "--bundle", "--format=esm",
  `--outfile=${path.join(TMP, "lib.mjs")}`, "--log-level=silent",
]);
const lib = await import(path.join(TMP, "lib.mjs"));
const { iastToDevanagari, devanagariToIast } = lib;

const toNative = (s) => iastToDevanagari(s, { mode: "iast" });
const toRoman = (s) => devanagariToIast(s, { mode: "iast" });

/* ── canon 歸一（兩側同一函式）────────────────────────────────────────
 * · NFC 正規化；空白 collapse；trim。
 * · 大小寫折疊（天城體無大小寫概念；句首大寫經引擎往返本應恆等，
 *   toLowerCase 僅兜底避免誤報）。
 */
const canon = (s) =>
  s.normalize("NFC").replace(/\u2019/g, "'").toLowerCase().replace(/(?<=[a-z\u0100-\u024f\u1e00-\u1eff])-(?=[a-z\u0100-\u024f\u1e00-\u1eff])/g, "").replace(/\s+/g, " ").trim();

/* ── 雜訊過濾：僅接受 IAST 字母（含變音符）＋空白＋常規標點 ───────────── */
const IAST_CHARS = "a-zA-Z\\u0100-\\u0105\\u012a-\\u012f\\u016a-\\u016f\\u1e00-\\u1e4f\\u1e5a-\\u1e5f\\u1e60-\\u1e6f\\u00f1\\u015a-\\u0161";
const NOISE_RE = new RegExp(
  `[^${IAST_CHARS}\\s.,;:!?…—'’/|-]`,
);

/* ── 語料收集：GRETIL TEI plaintext，# Header 前的標題＋# Text 後的正文 ── */
function* segments() {
  const files = fs.readdirSync(CORPUS).filter((f) => f.endsWith(".txt")).sort();
  for (const f of files) {
    const full = path.join(CORPUS, f);
    let raw;
    try {
      raw = fs.readFileSync(full, "utf8");
    } catch {
      continue;
    }
    /* 只取「# Text」標記之後的正文（標頭含許可/元資料，非梵文） */
    const m = raw.indexOf("# Text");
    if (m < 0) continue;
    const body = raw.slice(m + "# Text".length);
    /* 空行分段：非空連續行合併為一段 */
    let para = [];
    let n = 0;
    const flush = function* () {
      if (para.length) {
        n++;
        yield { id: `${f}#${n}`, file: f, text: para.join(" ") };
        para = [];
      }
    };
    for (const line of body.split("\n")) {
      const t = line.trim();
      if (!t) yield* flush();
      else if (t.startsWith("#")) yield* flush(); /* 子標題跳過 */
      else para.push(t);
    }
    yield* flush();
  }
}

/* ── 抽樣策略：環境變數 SANSKRIT_GATE_LIMIT 可設掃描上限，預設全量 ────── */
const LIMIT = process.env.SANSKRIT_GATE_LIMIT ? Number(process.env.SANSKRIT_GATE_LIMIT) : Infinity;

const stats = { total: 0, noise: 0, pass: 0, fail: 0 };
const failSamples = [];
const failClass = { niggahita: 0, visarga: 0, candrabindu: 0, sandhi: 0, avagraha: 0, case: 0, unmapped: 0, other: 0 };

const classifyFail = (orig, back) => {
  const o = orig.toLowerCase(), b = back.toLowerCase();
  if (o === b) return "case";
  /* anusvāra 字形差異（ṁ/ṃ 兩字形）——canon 未涵蓋的 niggahita 型差 */
  if (o.replace(/[\u1e41\u1e43]/g, "m") === b.replace(/[\u1e41\u1e43]/g, "m")) return "niggahita";
  /* candrabindu：candra m̐（o 帶 m̐ 組合符）與 anusvāra 回轉字形差 */
  if (o.replace(/m\u0307|\u1e41/g, "m") === b.replace(/m\u0307|\u1e41/g, "m")) return "candrabindu";
  /* visarga ḥ：兩側剝除 ḥ 後相等（引擎 visarga 回轉差異） */
  if (o.replace(/ḥ/g, "") === b.replace(/ḥ/g, "")) return "visarga";
  /* avagraha：縮約 '（x'y → ऽy）往返移位/增刪一個 a——'xy → axy'、
   * x'y → xy'a 型差異（引擎 ऽ 回轉的已知行為）；兩側剝除 ' 與
   * 鄰接 a 後相等者歸此類（字中 'g → a'g 移位型同歸此類——同一
   * ऽ 映射往返漂移，非正字差） */
  const strip = (s) => s.replace(/['’]/g, "").replace(/^a/, "").replace(/a$/, "");
  if (/['’]/.test(orig) && strip(o) === strip(b)) return "avagraha";
  /* 連聲：原文含連字符合寫（sandhi 標記） */
  if (/-(?=[a-z\u0100-\u024f\u1e00-\u1eff])/i.test(orig)) return "sandhi";
  /* 回轉含未映射的拉丁殘留（非空白、非原標點）→ 未映射字符 */
  if (/[a-zA-Z]/.test(back) && !/[a-zA-Z]/.test(orig.replace(/['’-]/g, ""))) return "unmapped";
  return "other";
};

for (const seg of segments()) {
  if (stats.total + stats.noise >= LIMIT) break;
  stats.total++;
  const orig = seg.text;
  if (NOISE_RE.test(orig)) {
    stats.noise++;
    continue;
  }
  let native, back;
  try {
    native = toNative(orig);
    back = toRoman(native);
  } catch (e) {
    stats.fail++;
    if (failSamples.length < 20)
      failSamples.push({ id: seg.id, roman: orig, native: "<拋錯>", back: e.message.slice(0, 60), diff: "拋錯" });
    failClass.other++;
    continue;
  }
  if (canon(orig) === canon(back)) {
    stats.pass++;
  } else {
    stats.fail++;
    const cls = classifyFail(orig, back);
    failClass[cls]++;
    if (failSamples.length < 20)
      failSamples.push({
        id: seg.id, roman: orig, native,
        back, diff: `canon(${JSON.stringify(canon(orig))}) != canon(${JSON.stringify(canon(back))})`,
        cls,
      });
  }
}

const tested = stats.pass + stats.fail;
const rate = tested ? (stats.pass / tested) * 100 : 0;

/* ── 報表 ───────────────────────────────────────────────────────────── */
console.log("[sanskrit-canon-gate] GRETIL TEI plaintext（sanskrit-iast）雙向閉環");
console.log(`[sanskrit-canon-gate] 掃描段數（含雜訊）：${stats.total + stats.noise}`);
console.log(`[sanskrit-canon-gate] 雜訊跳過：${stats.noise}`);
console.log(`[sanskrit-canon-gate] 參與測試：${tested}`);
console.log(`[sanskrit-canon-gate] 雙向通過：${stats.pass}（${rate.toFixed(4)}%）`);
console.log(`[sanskrit-canon-gate] 失敗分類：${Object.entries(failClass).map(([k, v]) => `${k}=${v}`).join("、")}`);
for (const s of failSamples) {
  console.log(`[失敗樣例] ${s.id}\n  roman : ${JSON.stringify(s.roman)}\n  native: ${JSON.stringify(s.native)}\n  back  : ${JSON.stringify(s.back)}\n  diff  : ${s.diff}`);
}
console.log(`sanskrit-canon-gate: 通过 ${stats.pass}/${tested}`);
