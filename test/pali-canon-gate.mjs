// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry

/**
 * 巴利語料真值門禁（SuttaCentral bilara-data 雙向閉環）——pali-iast 方案。
 *
 * ── 語料來源（在 R 之外，僅讀取不提交）────────────────────────────────
 *   ../bilara-data/root/pli/ms/…/*.json—— SuttaCentral bilara-data 巴利三藏
 *   羅馬字根文本（CC0 公有領域，7,288 檔、約 44 萬段）。JSON 物件＝
 *   段id → 巴利羅馬字串（IAST）。
 *
 * ── 門禁內容：雙向閉環 ────────────────────────────────────────────────
 *   每段 roman --iastToDevanagari(pali)--> 天城體 --devanagariToIast(pali)-->
 *   羅馬字，與原文經 canon 歸一後比對（兩側同一函式）。
 *   canon 規則（僅歸一非正字差異）：
 *   · niggahita ṁ/ṃ 等價（引擎明文支持兩字形）；
 *   · 空白 collapse（語料行尾/連續空白隨意）；
 *   · 大小寫折疊成「句首大寫保留」不採——天城體無大小寫，引擎回轉保留
 *     原大寫字母（實測往返恆等），故 canon 兩側統一 toLowerCase 兜底。
 *   語料過濾（雜訊段，跳過並計數）：
 *   · 含 HTML 標籤（<b> 等）、注釋/引號（「」“”‘’«»）、數字、
 *     連字線以外的外文標記者跳過；僅允許 IAST 字母 + 空白 + 常規標點
 *     （. , ; : ? ! … — - '）原樣透傳。
 *
 * 執行：node test/pali-canon-gate.mjs
 * 末行輸出「pali-canon-gate: 通过 N/M」式計數行。
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
/* 語料目錄在 lilium-handoff 之外（../bilara-data/），絕對路徑引用、不拷入 R */
const CORPUS = path.resolve(ROOT, "..", "bilara-data", "root", "pli", "ms");
// 公開倉庫缺料降級：bilara-data（SuttaCentral）外部語料不入庫——本地工作線備有（../bilara-data/），
// clone 環境缺料時 SKIP 提示（取得方式見 test/pali-canon-gate.mjs 檔頭註釋）。
if (!fs.existsSync(CORPUS)) {
  console.log("SKIP：bilara-data 巴利三藏語料未入庫（外部語料 ../bilara-data/）。git clone https://github.com/suttacentral/bilara-data 後置於倉庫上層。");
  process.exit(0);
}

/* 與 test/manchu-corpus-gate.mjs 同法：esbuild 現場 bundle lib-export.ts 後 import */
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "li-palicorpus-"));
execFileSync(path.join(ROOT, "node_modules", ".bin", "esbuild"), [
  path.join(ROOT, "test", "lib-export.ts"), "--bundle", "--format=esm",
  `--outfile=${path.join(TMP, "lib.mjs")}`, "--log-level=silent",
]);
const lib = await import(path.join(TMP, "lib.mjs"));
const { iastToDevanagari, devanagariToIast, getScheme } = lib;

const scheme = getScheme("pali-iast");
const toNative = (s) => iastToDevanagari(s, { mode: "iast", pali: true });
const toRoman = (s) => devanagariToIast(s, { mode: "iast", pali: true });

/* ── canon 歸一（兩側同一函式）────────────────────────────────────────
 * · 空白 collapse；行首行尾剝除（語料段常帶行尾空白）。
 * · niggahita ṁ(U+1E41) ≡ ṃ(U+1E43)——巴利兩字形等價，引擎 pali 模式明文支持。
 * · 大小寫折疊（天城體無大小寫概念；句首大寫經引擎往返本應恆等，
 *   toLowerCase 僅兜底避免誤報）。
 */
const canon = (s) =>
  s
    .replace(/\u1e41/g, "\u1e43")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

/* ── 雜訊過濾：僅接受 IAST 字母（含變音符）＋空白＋常規標點 ───────────── */
const IAST_CHARS = "a-zA-Z\\u0100-\\u0105\\u012a-\\u012f\\u016a-\\u016f\\u1e00-\\u1e4f\\u1e5a-\\u1e5f\\u1e60-\\u1e6f\\u00f1\\u015a-\\u0161";
const NOISE_RE = new RegExp(
  `[^${IAST_CHARS}\\s.,;:!?\\u2026\\u2014'\\u2019-]`,
);

/* ── 語料收集 ───────────────────────────────────────────────────────── */
function* segments() {
  const files = fs.readdirSync(CORPUS, { recursive: true })
    .filter((f) => f.endsWith(".json"))
    .sort();
  for (const f of files) {
    const full = path.join(CORPUS, f);
    let doc;
    try {
      doc = JSON.parse(fs.readFileSync(full, "utf8"));
    } catch {
      continue;
    }
    if (!doc || typeof doc !== "object") continue;
    for (const [id, v] of Object.entries(doc)) {
      if (typeof v === "string" && v.trim()) yield { id, file: f, text: v };
    }
  }
}

/* ── 抽樣策略：先試跑量測；本檔支援環境變數 PALI_GATE_LIMIT 設上限，
 *    預設全量（44 萬段 × 2 次轉換，實測耗時可控）──────────────────────── */
const LIMIT = process.env.PALI_GATE_LIMIT ? Number(process.env.PALI_GATE_LIMIT) : Infinity;

const stats = { total: 0, noise: 0, pass: 0, fail: 0 };
const failSamples = [];
const failClass = { niggahita: 0, case: 0, quote: 0, unmapped: 0, other: 0 };

const classifyFail = (orig, back) => {
  const o = orig.toLowerCase(), b = back.toLowerCase();
  if (o.replace(/[\u1e41\u1e43]/g, "m") === b.replace(/[\u1e41\u1e43]/g, "m")) return "niggahita";
  if (o === b) return "case";
  if (/[\u201c\u201d\u2018\u2019\u300c\u300d\u00ab\u00bb]/.test(orig)) return "quote";
  /* 回轉含未映射的拉丁殘留（非空白、非原標點）→ 未映射字符 */
  if (/[a-zA-Z]/.test(back) && !/[a-zA-Z]/.test(orig.replace(/[A-Z]/g, ""))) return "unmapped";
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
console.log("[pali-canon-gate] SuttaCentral bilara-data root/pli/ms 雙向閉環（pali-iast）");
console.log(`[pali-canon-gate] 掃描段數（含雜訊）：${stats.total + stats.noise}`);
console.log(`[pali-canon-gate] 雜訊跳過：${stats.noise}`);
console.log(`[pali-canon-gate] 參與測試：${tested}`);
console.log(`[pali-canon-gate] 雙向通過：${stats.pass}（${rate.toFixed(4)}%）`);
console.log(`[pali-canon-gate] 失敗分類：${Object.entries(failClass).map(([k, v]) => `${k}=${v}`).join("、")}`);
for (const s of failSamples) {
  console.log(`[失敗樣例] ${s.id}\n  roman : ${JSON.stringify(s.roman)}\n  native: ${JSON.stringify(s.native)}\n  back  : ${JSON.stringify(s.back)}\n  diff  : ${s.diff}`);
}
console.log(`pali-canon-gate: 通过 ${stats.pass}/${tested}`);
