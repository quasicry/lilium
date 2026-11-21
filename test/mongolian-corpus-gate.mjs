// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry

/* 蒙古文長文語料雙向閉環門禁（長文語料固化版）。
 *
 * ── 語料來源與許可（test/fixtures/mongolian-*，均為公開網站公開文案）──
 *   fixtures/mongolian-longtext/longtext-words.json
 *     —— 5 站 93 頁長文詞表（5,501 詞，去重）：
 *        mongolian.news.cn（新華社蒙文頻道）、mgl.yuquan.gov.cn、mgl.kulun.gov.cn、
 *        mgl.fengzhen.gov.cn（政府蒙文網，公文公開發布）、burgud.com（BURGUD 蒙古文門戶）。
 *        經 mgl.site 導航抓取。新聞/政府公開發布文本，僅作轉寫引擎校驗用途（合理引用）。
 *   fixtures/mongolian-longtext/corpus.json
 *     —— burgud.com 批次長文全文（63,822 字元），來源同上。
 *   fixtures/mongolian-longtext/residuals.json
 *     —— 往返餘差 24 詞白名單（由 longtext-words.json 逐詞定性導出，見下方分類）。
 *   fixtures/mongolian-mglsite/mglsite-pairs.json
 *     —— 蒙古乐赛特 https://www.mgl.site/ 站點文案 73 詞 + 24 對 Lessing 對照詞。
 *
 * ── 餘差 24 詞逐條定性（依碼位分類，非正字收斂類一律不得入白名單）──────
 *   · ngMerge（23 詞）：源站舊式拼寫 ᠨ(NA)+ᠬ(QA)/ᠭ(GA)，經 IME 正字法
 *     applyNgLigature 合流為 ᠩ(ANG)——Unicode 標準規範形（n4889），
 *     編碼級正字收斂，非轉寫錯誤。涵蓋 qin/gin/ngg/n 前接各型（
 *     ǰagučilagurunqinu、duguyilangunqin、ulaganqada、dünquwang、munggul、
 *     qinggan、fwngǰwn、sinquwa、ünenqü、ǰinqin、ü<nirugu>nqin、ping 等）。
 *   · lhaMerge（1 詞）：ᠯᠾ（LA+HAA）→ ᡀ（LHA）——舊式雙字母 lh 被
 *     正字法合流為單碼位 LHA（U+1840），同屬編碼級正字收斂。
 *   兩類合計恰 24 詞，無「other」類（斷言強制）。
 *
 * ── 組成（比照 manchu-corpus-gate.mjs 的組式結構）────────────────────────
 *   組 1：5,501 詞 native→roman→native 往返，硬斷言 ≥99%；餘差逐一對照
 *         residuals.json 白名單（source+kind 雙欄核對），白名單外餘差即失敗。
 *   組 2：長文全文 token 級雙向閉環：native→roman（剝 FVS、標點 token 剝
 *         <…> 標記）→native，逐 token 全等比對；nirugu/punctuation 收斂後
 *         全等；餘差僅容 ngMerge/lhaMerge 兩類正字收斂（逐碼位定性）。
 *   組 3：mgl.site 73 詞 100% 往返 + 24 對 Lessing known_pairs 對照（嚴格）。
 *
 * 執行：node test/mongolian-corpus-gate.mjs
 * 末行輸出「mongolian-corpus-gate: 通过 N/M」式計數行。
 */

import assert from "node:assert";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

/* 與 test/all-schemes-corpus.mjs 同法：esbuild 現場 bundle lib-export.ts 後 import */
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "li-mglcorpus-"));
execFileSync(path.join(ROOT, "node_modules", ".bin", "esbuild"), [
  path.join(ROOT, "test", "lib-export.ts"), "--bundle", "--format=esm",
  `--outfile=${path.join(TMP, "lib.mjs")}`, "--log-level=silent",
]);
const lib = await import(path.join(TMP, "lib.mjs"));
const { getScheme } = lib;
const w = getScheme("mongolian");
assert.ok(w, "方案 mongolian 應已註冊");

/* 碼位常數（僅供餘差定性） */
const NA = String.fromCodePoint(0x1828);
const ANG = String.fromCodePoint(0x1829);
const LA = String.fromCodePoint(0x182f);
const HAA = String.fromCodePoint(0x183e);
const LHA = String.fromCodePoint(0x1840);
const NIRUGU = String.fromCodePoint(0x180a);

/* FVS 剝離（U+180B–180D/180F）——比對前先剝，同 manchu-corpus-gate 哲學 */
const stripFvs = (s) => s.replace(/[\u180b-\u180d\u180f]/g, "");
/* 剝 nirugu（源站裝飾性詞幹延伸符，語料隨意出現，非轉寫正字組成部分） */
const stripNirugu = (s) => s.split(NIRUGU).join("");
/* 剝蒙古文標點區（U+1800–1809：標點經 <token> 出向後不回進入向，屬
 * 轉寫層有意設計——標點 token 只出向，比對時兩側同步剝除） */
const stripPunct = (s) => s.replace(/[\u1800-\u1809]/g, "");
/* 全文比對用正字形式：剝 FVS + nirugu + 標點區 */
const canon = (s) => stripPunct(stripNirugu(stripFvs(s)));

/* 出向標記剝離：nativeToRoman 產出的 <f1>/<mvs>/<birga>… token 標記，
 * 回程送 romanToNative 前剝除（標點/FVS 均以 token 形式出向，回程剝除後
 * 與剝除後的原文碼位序列等價比對） */
const stripTokens = (s) => s.replace(/<[a-z0-9:]+>/g, "");
/* 單詞雙向閉環：native→roman（strip）→native（strip） */
const roundTrip = (m) => {
  const back = stripFvs(w.romanToNative(stripTokens(w.nativeToRoman(m, { fvs: "strip" })), { fvs: "strip" }));
  // 政策：蒙文語料內 ASCII 數字詞回程轉蒙文數字（用戶裸數字轉換指令）——
  // 往返無損判等改雙向：back≠m 但 nativeToRoman(back)===m 即無損。
  if (back !== m && /[0-9]/.test(m)) {
    // ASCII 數字 ↔ 蒙文數字逐位映射（含黏詞年份）＝新政策預期；
    // 無損性以出向恆等驗證（nativeToRoman(back) === nativeToRoman(m)）。
    // 與 canon 同口徑先剝標點區（1800-1809，token 切分剝除）再逐位比對
    const stripPunct = (s) => [...s].filter((d) => { const x = d.codePointAt(0); return !(x >= 0x1800 && x <= 0x1809); }).join("");
    const ms = stripPunct(m), bs = stripPunct(back);
    const digitMapOk = ms.length === bs.length && [...ms].every((d, j) =>
      (d >= "0" && d <= "9") ? bs[j] === String.fromCodePoint(0x1810 + Number(d)) : bs[j] === d);
    if (digitMapOk && stripTokens(w.nativeToRoman(back, { fvs: "strip" })) === stripTokens(w.nativeToRoman(m, { fvs: "strip" }))) return m;
  }
  return back;
};
/* 單詞往返比對正字形：剝 FVS＋nirugu＋蒙古文標點區（U+1800–1809）——
 * 標點 token（᠄ colon 等）出向為 <token>、回程剝除不還原，與 whitespace
 * 切詞口徑一致，屬語料正字等價，非數據丟失 */
const roundTripCanon = (m) => canon(roundTrip(m));
/* 語料側正字形（比對基準）：同樣剝 FVS＋nirugu＋標點區 */
const canonSource = (m) => canon(m);

const results = [];

/* ── 組 1：5,501 詞長文詞表往返（≥99%）＋ 24 餘差白名單逐條核對 ─────────── */
const wordsJson = JSON.parse(fs.readFileSync(
  path.join(ROOT, "test/fixtures/mongolian-longtext/longtext-words.json"), "utf8"));
const residualJson = JSON.parse(fs.readFileSync(
  path.join(ROOT, "test/fixtures/mongolian-longtext/residuals.json"), "utf8"));
/* 白名單健全性：導出的 24 條必須全部屬 ngMerge/lhaMerge 兩類（無 other 混入） */
assert.strictEqual(residualJson.length, 24, `白名單應恰 24 條，實得 ${residualJson.length}`);
for (const e of residualJson) {
  assert.ok(e.kind === "ngMerge" || e.kind === "lhaMerge",
    `白名單含非正字收斂類條目：${e.source}（kind=${e.kind}）`);
}
/* 白名單雙欄核對表：source → kind */
const whitelist = new Map(residualJson.map((e) => [e.source, e.kind]));

let rt = 0;
const miss = [];
for (const m of wordsJson.words) {
  const back = roundTripCanon(m);
  if (back === canonSource(m)) rt++; else miss.push([m, back]);
}
const rate = (rt / wordsJson.words.length) * 100;
console.log(`[長文詞表] ${wordsJson.words.length} 詞往返全等 ${rt}（${rate.toFixed(2)}%），餘差 ${miss.length}`);
assert.ok(rate >= 99, `長文詞表往返率 ${rate.toFixed(2)}% < 99%`);

/* 餘差逐條定性：必須 ①在白名單內 ②程式化重導出的 kind 與白名單一致
 * ③無白名單外餘差（硬斷言，禁止硬湊） */
let ok1 = true;
try {
  for (const [m, back] of miss) {
    const kind = whitelist.get(m);
    assert.ok(kind, `白名單外餘差（禁止硬湊）：${JSON.stringify(m)} → ${JSON.stringify(back)}`);
    /* 程式化重新定性，須與白名單 kind 一致 */
    let recomputed;
    if ([...m].some((c) => c === NA) && [...back].some((c) => c === ANG)) recomputed = "ngMerge";
    else if ([...m].includes(LA) && [...m].includes(HAA) && [...back].includes(LHA)) recomputed = "lhaMerge";
    else recomputed = "other";
    assert.strictEqual(recomputed, kind,
      `餘差定性不一致：${JSON.stringify(m)} 白名單=${kind} 重導出=${recomputed}`);
  }
  assert.strictEqual(miss.length, 24, `餘差數應恰 24（白名單全量命中），實得 ${miss.length}`);
  results.push(["長文詞表 5,501 詞往返 ≥99%＋24 餘差白名單核對", true]);
} catch (e) { ok1 = false; console.error(`[長文詞表] ${e.message}`); results.push(["長文詞表 5,501 詞往返 ≥99%＋24 餘差白名單核對", false]); }

/* ── 組 2：長文全文 token 級雙向閉環 ─────────────────────────────────── */
const corpusJson = JSON.parse(fs.readFileSync(
  path.join(ROOT, "test/fixtures/mongolian-longtext/corpus.json"), "utf8"));
/* 源站文本以 NNBSP（U+202F）/MVS（U+180E）作詞間分隔（源站排版習慣），
 * 切 token 時與空白一併視作分隔符 */
const toks = corpusJson.text.split(/[\s\u202f\u00a0\u180e]+/).filter(Boolean);
let tokOk = 0, tokBad = 0;
const tokCls = { ngMerge: 0, lhaMerge: 0, other: 0 };
const tokOtherSamples = [];
for (const tok of toks) {
  const back = roundTrip(tok);
  if (canon(tok) === canon(back)) { tokOk++; continue; }
  /* 餘差逐碼位定性（與組 1 同一組規則）：僅容 ngMerge / lhaMerge 正字收斂 */
  const a = canon(tok), b = canon(back);
  if ([...a].some((c) => c === NA) && [...b].some((c) => c === ANG)) tokCls.ngMerge++;
  else if ([...a].includes(LA) && [...a].includes(HAA) && [...b].includes(LHA)) tokCls.lhaMerge++;
  else {
    tokCls.other++;
    if (tokOtherSamples.length < 10) tokOtherSamples.push([tok, back]);
  }
  tokBad++;
}
console.log(`[r35 全文] ${toks.length} token 閉環全等 ${tokOk}，餘差 ${tokBad}（ngMerge ${tokCls.ngMerge}／lhaMerge ${tokCls.lhaMerge}／other ${tokCls.other}）`);
for (const [a, b] of tokOtherSamples) console.error(`[r35 全文] 非正字收斂餘差：${JSON.stringify(a)} → ${JSON.stringify(b)}`);
const ok2 = tokCls.other === 0;
results.push(["r35 全文 token 級雙向閉環（餘差僅容正字收斂）", ok2]);

/* ── 組 3：mgl.site 站點語料 100% 往返 ＋ 24 對 Lessing 對照 ────────────── */
const siteJson = JSON.parse(fs.readFileSync(
  path.join(ROOT, "test/fixtures/mongolian-mglsite/mglsite-pairs.json"), "utf8"));
let ok3 = true;
try {
  let siteRt = 0;
  const siteMiss = [];
  for (const m of siteJson.native_words) {
    const back = roundTrip(m);
    /* 比對用正字形：᠊（nirugu）屬字型拉伸裝飾（如詞首連寫線 ᠊ᠢ），
     * 出向為 <nirugu> token、回程剝除不還原——比對前兩側同步剝除 */
    if (canon(back) === canon(m)) siteRt++; else siteMiss.push(m);
  }
  assert.strictEqual(siteRt, siteJson.native_words.length,
    `mgl.site 往返破損 ${siteJson.native_words.length - siteRt} 詞: ${siteMiss.join(",")}`);
  const mism = [];
  for (const [m, exp] of siteJson.known_pairs) {
    const got = w.nativeToRoman(m, { fvs: "strip" });
    if (got !== exp) mism.push(`${m}=>${got}≠${exp}`);
  }
  assert.strictEqual(mism.length, 0, `known 對照不符: ${mism.join("; ")}`);
  /* 拉丁→蒙古→拉丁 抽查 */
  for (const r of ["monggol", "bičig", "qan", "saiqan", "monggol-un"]) {
    assert.strictEqual(w.nativeToRoman(w.romanToNative(r)), r, `拉丁往返破損: ${r}`);
  }
  console.log(`[mgl.site] ${siteJson.native_words.length} 詞 100% 往返＋${siteJson.known_pairs.length} 對 Lessing 對照全通`);
  results.push(["mgl.site 站點語料往返＋known 對照", true]);
} catch (e) { ok3 = false; console.error(`[mgl.site] ${e.message}`); results.push(["mgl.site 站點語料往返＋known 對照", false]); }

/* ── 彙總計數行 ───────────────────────────────────────────────────────── */
const passed = results.filter(([, ok]) => ok).length;
const total = results.length;
console.log(`mongolian-corpus-gate: 通过 ${passed}/${total}`);
process.exit(passed === total ? 0 : 1);
