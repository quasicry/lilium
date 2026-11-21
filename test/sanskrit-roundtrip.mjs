// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry

/* 梵文轉寫方案「原生→羅馬字→原生」往返一致性測試（大量語料 + 大小寫探針）
 *
 * 方法論（native → roman → native 比對前後一致性）：
 *  1. 對每一套梵文方案，先以「該方案自身可表達的音素集合」生成大量天城體語料
 *     （獨立元音 / 輔音 / 輔音×matra / 輔音+尾符號 / 輔音叢集 c1+virama+c2 /
 *     真實梵文偈頌）。可表達性由「nativeToRoman 輸出是否完全羅馬化（不含天城體
 *     殘碼）」判定——這把「方案本就不表達某音素」與「實作 bug」徹底分開：
 *     凡納入語料的字串都應無損往返，失敗即真 bug。
 *  2. 逐方案跑雙向往返：
 *     · native→roman→native 必 === 原串（無損）；
 *     · roman→native→roman 必 === 原羅馬字（冪等 / 規範形穩定）。
 *  3. 大小寫探針：對「大小寫即語義」的方案（HK / ITRANS / WX / SLP1），斷言同字母
 *     大小寫映射到**不同**天城體（如 WX k≠K、t≠T≠w≠W；SLP1 f≠F≠x≠X）。
 *     IAST / ISO / Velthuis / Kolkata 屬變音符號制（ē/ō 是不同字母而非大寫 e/o），
 *     大小寫不具區別性，本測試標註「設計上大小寫無關」並 skipped。
 *
 * 執行：node test/sanskrit-roundtrip.mjs
 */
import assert from "node:assert";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "li-sansrt-"));
execFileSync(path.join(ROOT, "node_modules", ".bin", "esbuild"), [
  path.join(ROOT, "test", "lib-export.ts"), "--bundle", "--format=esm",
  `--outfile=${path.join(TMP, "lib.mjs")}`, "--log-level=silent",
]);
const lib = await import(path.join(TMP, "lib.mjs"));

const cp = (n) => String.fromCodePoint(n);
const isDeva = (s) => [...s].some((ch) => { const c = ch.codePointAt(0) ?? 0; return c >= 0x0900 && c <= 0x097f; });

/* ---- 音素母集 ---- */
// 獨立元音：U+0905–0914（含 ऍ/ऎ 0x090D/E，梵文不用 → 應被判爲「不可表達」）
// 加聲化長元音 ॠ U+0960 / ॡ U+0961（**不在** 0905–0914 區間，極易漏測）。
// 不含 ऑ/ऒ(0x0911/0x0912)
const VOWELS = [0x0905,0x0906,0x0907,0x0908,0x0909,0x090a,0x090b,0x090c,0x090d,0x090e,0x090f,0x0910,0x0913,0x0914,0x0960,0x0961];
const CONS = []; for (let c = 0x0915; c <= 0x0939; c++) CONS.push(c);
// matra：U+093E–094C（含 ◌ॅ/◌ॆ 0x0945/6＝candra/short e，梵文不用）
// 加聲化 ◌ॢ U+0962 / ◌ॣ U+0963（**不在** 093E–094C 區間，極易漏測）。
// 不含 ◌ॊ/◌ो(0x0949/0x094a)
const MATRAS = [0x093e,0x093f,0x0940,0x0941,0x0942,0x0943,0x0944,0x0945,0x0946,0x0947,0x0948,0x094b,0x094c,0x0962,0x0963];
const SIGNS = [0x0902, 0x0903, 0x0901]; // anusvāra / visarga / candrabindu
const VIRAMA = 0x094d;

/* ---- 真實梵文偈頌（含叢集 / visarga / avagraha / candrabindu） ---- */
const VERSES = [
  "तत्सवितुर्वरेण्यं भर्गो देवस्य धीमहि धियो यो नः प्रचोदयात्",
  "कर्मण्येवाधिकारस्ते मा फलेषु कदाचन मा कर्मफलहेतुर्भूर्मा ते सङ्गोऽस्त्वकर्मणि",
  "नासतो विद्यते भावो नाभावो विद्यते सतः उभयोरपि दृष्टोऽन्तस्त्वनयोस्तत्त्वदर्शिभिः",
  "सर्वधर्मान्परित्यज्य मामेकं शरणं व्रज अहं त्वा सर्वपापेभ्यो मोक्षयिष्यामि मा शुचः",
  "अहिंसा सत्यमस्तेयं शौचं इन्द्रियनिग्रहः आत्मसंदर्शनं शान्तिः साधुरेषा सनातनी",
  "ॐ भूर्भुवः स्वः तत्सवितुर्वरेण्यं",
  "संस्कृतं वेदाः पुराणानि रामायणं महाभारतं",
  "त्रयी वेदाश्चत्वारो मीमांसा न्यायश्च वैशेषिकम्",
  "अथातो ब्रह्मजिज्ञासा जन्माद्यस्य यतः",
  "यो मां पश्यति सर्वत्र सर्वं च मयि पश्यति तस्याहं न प्रणश्यामि स च मे न प्रणश्यति",
  // 用戶實錘句：黏合叢集長句——引擎直呼全過而掃描層切詞破碎（LATIN_SHAPE 缺 ~/'''、
  // velthuis .m/\\" 詞內音標被 TRIGGER_CHARS 切詞），修復後入語料防回歸
  "अध्यात्मरूपसंज्ञी बहिर्धा रूपाणि पश्यति परीत्तानि सुवर्णदुर्वर्णानि तानि खलु रूपाण्यभिभूय जानात्यभिभूय पश्यति एवंसंज्ञि च भवति इदं प्रथममभिभ्वायतनं",
];

/* ---- 大小寫探針（僅對大小寫即語義的方案） ---- */
const CASE_PAIRS = {
  // HK 大小寫：長元音 A/I/U、聲化 R、捲舌 T/D/N、鼻音 G/J、噝音 S/z、
  // anusvāra M、visarga H。（注意 l/L 不是有效 HK token：聲化 ḷ 作 lR）
  "sanskrit-hk": [["a","A"],["i","I"],["u","U"],["r","R"],["t","T"],["d","D"],["n","N"],["g","G"],["j","J"],["s","S"],["s","z"],["m","M"],["h","H"]],
  // ITRANS 的大寫具語義者：捲舌 T/D/N、長元音 A/I/U、ळ L、anusvāra M、
  // visarga H、-ce 送氣（Ch/Th/Dh/Sh）、鼻音 ~N/ñ。
  // 注意：k/K、g/G、j/J、p/P、b/B 在 ITRANS 中**無區別**（送氣寫 kh/gh/jh/ph/bh，
  // 大寫 K/G/J/P/B 不是有效 token）——故不列入探針，免生假失敗。
  "sanskrit-itrans": [["t","T"],["d","D"],["n","N"],["l","L"],["m","M"],["h","H"],["a","A"],["i","I"],["u","U"],["ch","Ch"],["th","Th"],["dh","Dh"],["sh","Sh"],["~n","~N"]],
  "sanskrit-wx": [["k","K"],["g","G"],["c","C"],["j","J"],["t","T"],["w","W"],["x","X"],["d","D"],["n","N"],["p","P"],["b","B"],["s","S"],["s","R"],["l","L"],["i","I"],["u","U"],["a","A"],["e","E"],["o","O"],["q","Q"]],
  "sanskrit-slp1": [["k","K"],["g","G"],["c","C"],["j","J"],["w","W"],["t","T"],["d","D"],["q","Q"],["n","N"],["p","P"],["b","B"],["l","L"],["s","S"],["s","z"],["f","F"],["x","X"],["i","I"],["u","U"],["a","A"],["e","E"],["o","O"]],
};
const CASE_INSENSITIVE_BY_DESIGN = new Set(["sanskrit-iast","sanskrit-iso15919","sanskrit-velthuis","sanskrit-kolkata"]);

/* ---- 已知「表示歧義」（非實作 bug，僅記錄、不計缺陷） ----
 * A 類：C + virāma + ह(0x0939)。梵文字母本身不以此方式書寫「不送氣音+ha」合字
 *       （真實文獻會直接寫成單一送氣字母 ख/घ/छ…），而羅馬字「kha」與 ख 拼寫完全
 *       同形，故 native→roman→native 必然塌縮。這是所有羅馬化方案的固有歧義，
 *       非引擎缺陷。語料中排除，並於報告記載。
 * B 類（Harvard-Kyoto 專有）：ल(0x0932) + ◌ृ/◌ॄ(0x0943/0x0944)。HK 的聲化元音
 *       ḷ/ḹ 寫作 lR / lRR，與「ल + 聲化 R 的 matra」完全同形，故 लृ ⇄ lR ⇄ ऌ
 *       必然塌縮。經參考實作 sanscript 驗證：其 HK 亦同樣往返失敗，故屬方案
 *       固有歧義（非本引擎 bug）。僅影響 HK。
 */
function knownAmbiguous(id, str) {
  if (/[\u0915-\u0939]\u094d\u0939/.test(str)) return true; // A 類
  if (id === "sanskrit-hk" && /^\u0932[\u0943\u0944]$/.test(str)) return true; // B 類
  return false;
}

/* ---- 語料生成（依方案可表達性過濾） ---- */
function representable(scheme, s) {
  const rom = scheme.nativeToRoman(s);
  return !isDeva(rom); // 完全羅馬化＝該方案可表達此字串
}
function corpusFor(scheme) {
  const out = [];
  const push = (s) => { if (representable(scheme, s)) out.push(s); };
  for (const v of VOWELS) push(cp(v));
  for (const c of CONS) push(cp(c));
  for (const c of CONS) for (const m of MATRAS) push(cp(c) + cp(m));
  for (const c of CONS) for (const sg of SIGNS) push(cp(c) + cp(sg));
  for (const c1 of CONS) for (const c2 of CONS) push(cp(c1) + cp(VIRAMA) + cp(c2));
  for (const v of VERSES) if (representable(scheme, v)) out.push(v);
  return out;
}

/* ---- 主測試 ---- */
const schemes = lib.listSchemes().filter((s) => s.id.startsWith("sanskrit-"));
const order = ["sanskrit-iast","sanskrit-iso15919","sanskrit-hk","sanskrit-itrans","sanskrit-velthuis","sanskrit-wx","sanskrit-kolkata","sanskrit-slp1"];
schemes.sort((a, b) => (order.indexOf(a.id) + 1 || 99) - (order.indexOf(b.id) + 1 || 99));

let totalBugs = 0;
const report = [];

for (const s of schemes) {
  const corpus = corpusFor(s);
  let nPass = 0, nFail = 0, nAmbig = 0;
  const fails = [];
  let rPass = 0, rFail = 0, rAmbig = 0;
  const rfails = [];
  let repChars = 0; // 可表達字元總數（語料規模指標）
  const dump = [];

  for (const str of corpus) {
    if (knownAmbiguous(s.id, str)) { nAmbig++; continue; } // 固有表示歧義：不入語料、不計缺陷
    repChars++;
    const rom = s.nativeToRoman(str);
    if (isDeva(rom)) continue; // 雙重防護：不應發生
    const back = s.romanToNative(rom);
    if (back === str) nPass++;
    else { nFail++; fails.push(`${JSON.stringify(str)} → ${rom} → ${JSON.stringify(back)}`); dump.push({ dir: "NRN", str, rom, back }); }
    const rom2 = s.nativeToRoman(back);
    if (rom2 === rom) rPass++;
    else { rFail++; rfails.push(`${rom} → ${JSON.stringify(back)} → ${rom2}`); dump.push({ dir: "RNR", rom, back, rom2 }); }
  }

  // 大小寫探針
  let cPass = 0, cFail = 0, cSkipped = false;
  const cfails = [];
  if (CASE_INSENSITIVE_BY_DESIGN.has(s.id)) {
    cSkipped = true;
  } else {
    const pairs = CASE_PAIRS[s.id] || [];
    for (const [lo, up] of pairs) {
      const dLo = s.romanToNative(lo), dUp = s.romanToNative(up);
      // 兩者都必須真的轉成天城體（否則是 token 未定義，屬 bug），且彼此不同（大小寫具語義）
      if (isDeva(dLo) && isDeva(dUp) && dLo !== dUp) cPass++;
      else cFail++;
      if (cFail && cfails.length < 40) cfails.push(`「${lo}」=${JSON.stringify(dLo)} 「${up}」=${JSON.stringify(dUp)}`);
    }
  }

  totalBugs += nFail + rFail + cFail;
  report.push({ id: s.id, corpus: corpus.length, repChars, nPass, nFail, nAmbig, rPass, rFail, rAmbig, cPass, cFail, cSkipped, fails, rfails, cfails });
  if (process.env.ROMAN_DUMP) {
    // 傾倒「天城體 → 本引擎羅馬字」對照，供與參考實作（sanscript）逐條交叉比對
    const pairs = [];
    for (const str of corpus) {
      if (knownAmbiguous(s.id, str)) continue;
      pairs.push([str, s.nativeToRoman(str)]);
    }
    fs.mkdirSync(process.env.ROMAN_DUMP, { recursive: true });
    fs.writeFileSync(path.join(process.env.ROMAN_DUMP, `${s.id}.json`), JSON.stringify(pairs));
  }
  if (process.env.DUMP) {
    fs.mkdirSync(process.env.DUMP, { recursive: true });
    fs.writeFileSync(path.join(process.env.DUMP, `${s.id}.json`), JSON.stringify(dump, null, 1));
  }
}

/* ---- 輸出 ---- */
console.log("梵文轉寫方案 原生→羅馬字→原生 往返一致性測試");
console.log("=".repeat(78));
console.log(`${"方案".padEnd(22)} ${"語料".padStart(6)} ${"歧義排除".padStart(8)} ${"N→R→N".padStart(8)} ${"R→N→R".padStart(8)} ${"大小寫".padStart(7)}`);
console.log("-".repeat(78));
for (const r of report) {
  const nr = r.nFail === 0 ? `${r.nPass}✓` : `${r.nPass}/${r.nFail}✗`;
  const rr = r.rFail === 0 ? `${r.rPass}✓` : `${r.rPass}/${r.rFail}✗`;
  const cs = r.cSkipped ? "設計無關" : (r.cFail === 0 ? `${r.cPass}✓` : `${r.cPass}/${r.cFail}✗`);
  console.log(`${r.id.padEnd(22)} ${String(r.corpus).padStart(6)} ${String(r.nAmbig).padStart(8)} ${nr.padStart(8)} ${rr.padStart(8)} ${cs.padStart(7)}`);
}
console.log("-".repeat(78));

let anyFail = false;
for (const r of report) {
  if (r.nFail > 0 || r.rFail > 0 || (!r.cSkipped && r.cFail > 0)) anyFail = true;
  if (r.nFail > 0) {
    console.log(`\n✗ ${r.id}  native→roman→native 失敗 ${r.nFail} 例（前 15）：`);
    for (const f of r.fails) console.log("    " + f);
  }
  if (r.rFail > 0) {
    console.log(`\n✗ ${r.id}  roman→native→roman 失敗 ${r.rFail} 例（前 15）：`);
    for (const f of r.rfails) console.log("    " + f);
  }
  if (!r.cSkipped && r.cFail > 0) {
    console.log(`\n✗ ${r.id}  大小寫探針失敗 ${r.cFail} 例（前 15）：`);
    for (const f of r.cfails) console.log("    " + f);
  }
}

// ---- 掃描層（transliterateLongText 逐詞路徑＝面板實際管線）雙向檢查 ----
// 引擎直呼全過不等於面板逐詞掃描過：TRIGGER_CHARS 切詞會把方案專屬詞內標點
// （velthuis .m、\"；ITRANS ~n）切開致整詞破碎（用戶實錘）。VERSES 全句走掃描層。
let scanBugs = 0;
for (const s of schemes) {
  for (const v of VERSES) {
    if (!representable(s, v)) continue;
    const nr = lib.transliterateLongText(v, s, false);
    const back = lib.transliterateLongText(nr.text, s, true);
    if (back.text !== v) {
      scanBugs++;
      console.log(`\u2717 ${s.id} 掃描層 N-R-N 失敗：${JSON.stringify(nr.text.slice(0, 60))} -> ${JSON.stringify(back.text.slice(0, 60))}`);
    }
    const rn = lib.transliterateLongText(nr.text, s, true);
    const back2 = lib.transliterateLongText(rn.text, s, false);
    if (back2.text !== nr.text) {
      scanBugs++;
      console.log(`\u2717 ${s.id} 掃描層 R-N-R 失敗：${JSON.stringify(rn.text.slice(0, 60))} -> ${JSON.stringify(back2.text.slice(0, 60))}`);
    }
    // NFD 輸入（macOS 剪貼板/網頁複製常態）——tokenizeIast 須 NFC 規範化（實錘：a+U+0304 拆裂亂碼）
    const nfdBack = lib.transliterateLongText(nr.text.normalize("NFD"), s, true);
    if (nfdBack.text !== v) {
      scanBugs++;
      console.log(`\u2717 ${s.id} 掃描層 NFD R-N 失敗：${JSON.stringify(nfdBack.text.slice(0, 60))}`);
    }
  }
}
if (scanBugs > 0) { totalBugs += scanBugs; anyFail = true; }

if (anyFail) {
  console.log(`\n=== 發現 ${totalBugs} 處缺陷 ===`);
  process.exit(1);
} else {
  console.log("\n\u2705 全部梵文轉寫方案：雙向無損往返 + 大小寫敏感性 + 掃描層全綠");
}
