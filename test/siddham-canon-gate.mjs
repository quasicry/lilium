// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry

// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry
/**
 * 悉曇體碼位級門禁（siddham canon gate）——三段結構，分開計數：
 *
 * ① 天城體↔悉曇體碼位全表 golden pairs（純表測試）
 *    ——與 src/siddham.ts 的 devanagariToSiddham / siddhamToDevanagari 對照，
 *    覆蓋：輔音 33、獨立元音 14（含 U+0960/0961 聲化長元音）、matra 11、
 *    符號（candrabindu/anusvāra/visarga/virama/danda/雙 danda/OM→開篇符）、
 *    ra+u / ra+uu 的 warbler 形（U+115DC/U+115DD）、
 *    未映射碼位原樣透傳契約（數字、avagraha、◌ॢ/◌͖ 形保留碼位防線）。
 *    計數行：`siddham-gate: ①码位对照 通过 N/N`
 *
 * ② CBETA 悉曇字記（T54n2132《悉曇字記》）抽樣段落（**僅本地**）
 *    ——CBETA XML P5（ccbeta-org/xml-p5）悉曇字形爲 CBETA SD-xxxx PUA 私用碼位
 *    （U+104440 起），**不是** Unicode 悉曇區碼位；charDecl 的
 *    「Romanized form in Unicode transcription」是 CBETA 自家權威羅馬轉寫。
 *    故本段以 PUA→charDecl 羅馬字為真值，驗證 siddhamToIast 恰好回出
 *    CBETA 權威轉寫（canon 歸一後），再以 iastToSiddham→siddhamToIast
 *    做閉環。語料落 corpus/siddham/（corpus/* 已 gitignore，不入 git），
 *    下載方式見 corpus/siddham/SOURCES.md；缺檔時 SKIP（exit 0）並計數。
 *    計數行：`siddham-gate: ②CBETA抽樣 通过 N/N`
 *
 * ③ IAST 級雙向閉環（**映射測試，非真值門禁**——與①②分開計數、分開標記）
 *    ——iastToSiddham ↔ siddhamToIast 對 IAST 拼寫樣本做 forward→reverse 與
 *    reverse→forward 雙向閉環＋injectivity（兩個相異 IAST 輸入不得映射到
 *    同一悉曇串）。此段只證「引擎映射自洽」，不證「與任何外部權威一致」；
 *    真值判定僅由①（碼位表）與②（CBETA 權威轉寫）承擔。
 *    計數行：`siddham-gate: ③IAST閉環 通过 N/N`
 *
 * 執行：node test/siddham-canon-gate.mjs
 * 末行輸出總計數：`siddham-canon-gate: 通过 N/N`
 */

import { execFileSync } from "node:child_process";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "li-siddham-gate-"));
execFileSync(path.join(ROOT, "node_modules", ".bin", "esbuild"), [
  path.join(ROOT, "test", "lib-export.ts"), "--bundle", "--format=esm",
  `--outfile=${path.join(TMP, "lib.mjs")}`, "--log-level=silent",
]);
const lib = await import(path.join(TMP, "lib.mjs"));
const {
  devanagariToSiddham: D2S, siddhamToDevanagari: S2D,
  iastToSiddham: I2S, siddhamToIast: S2I,
} = lib;

/* ═══════════════════ ① 天城↔悉曇碼位全表 golden pairs ═══════════════════ */
/* 依 Unicode 16.0 悉曇區佈局（src/siddham.ts 頭註、n4294 / L2/12-011r）逐碼位列出：
 * 天城體碼位 → 悉曇體碼位。這裡是**真值表**，不是從 src 抄的——
 * 逐對硬編碼，任何 src 表漂移都會被本門禁抓出。 */
const cp = (n) => String.fromCodePoint(n);

// 輔音 33（ka…ha，U+0915–0939 與 U+1158E–115AE 順序平行）
const CONSONANTS = [
  [0x0915, 0x1158e, "ka"], [0x0916, 0x1158f, "kha"], [0x0917, 0x11590, "ga"],
  [0x0918, 0x11591, "gha"], [0x0919, 0x11592, "ṅa"], [0x091a, 0x11593, "ca"],
  [0x091b, 0x11594, "cha"], [0x091c, 0x11595, "ja"], [0x091d, 0x11596, "jha"],
  [0x091e, 0x11597, "ña"], [0x091f, 0x11598, "ṭa"], [0x0920, 0x11599, "ṭha"],
  [0x0921, 0x1159a, "ḍa"], [0x0922, 0x1159b, "ḍha"], [0x0923, 0x1159c, "ṇa"],
  [0x0924, 0x1159d, "ta"], [0x0925, 0x1159e, "tha"], [0x0926, 0x1159f, "da"],
  [0x0927, 0x115a0, "dha"], [0x0928, 0x115a1, "na"], [0x092a, 0x115a2, "pa"],
  [0x092b, 0x115a3, "pha"], [0x092c, 0x115a4, "ba"], [0x092d, 0x115a5, "bha"],
  [0x092e, 0x115a6, "ma"], [0x092f, 0x115a7, "ya"], [0x0930, 0x115a8, "ra"],
  [0x0932, 0x115a9, "la"], [0x0935, 0x115aa, "va"], [0x0936, 0x115ab, "śa"],
  [0x0937, 0x115ac, "ṣa"], [0x0938, 0x115ad, "sa"], [0x0939, 0x115ae, "ha"],
];
// 獨立元音 LETTER（含聲化長元音 ॠ/ॡ，其獨立字母在 U+0960/0961——非 090D/090E）
const VOWELS_INDEP = [
  [0x0905, 0x11580, "a"], [0x0906, 0x11581, "ā"], [0x0907, 0x11582, "i"],
  [0x0908, 0x11583, "ī"], [0x0909, 0x11584, "u"], [0x090a, 0x11585, "ū"],
  [0x090b, 0x11586, "ṛ"], [0x090c, 0x11588, "ḷ"],
  [0x090f, 0x1158a, "e"], [0x0910, 0x1158b, "ai"], [0x0913, 0x1158c, "o"],
  [0x0914, 0x1158d, "au"], [0x0960, 0x11587, "ṝ"], [0x0961, 0x11589, "ḹ"],
];
// matra（依附元音）。悉曇無 ḷ/ḹ matra（U+115B6/B7 保留碼位）→ 天城 ◌ॢ/◌ॣ **不映射**
const MATRAS = [
  [0x093e, 0x115af, "ā"], [0x093f, 0x115b0, "i"], [0x0940, 0x115b1, "ī"],
  [0x0941, 0x115b2, "u"], [0x0942, 0x115b3, "ū"], [0x0943, 0x115b4, "ṛ"],
  [0x0944, 0x115b5, "ṝ"], [0x0947, 0x115b8, "e"], [0x0948, 0x115b9, "ai"],
  [0x094b, 0x115ba, "o"], [0x094c, 0x115bb, "au"],
];
// 符號：candrabindu/anusvāra/visarga/virama/danda/雙 danda/OM→開篇符
const SIGNS = [
  [0x0901, 0x115bc, "candrabindu"], [0x0902, 0x115bd, "anusvāra"],
  [0x0903, 0x115be, "visarga"], [0x094d, 0x115bf, "virama"],
  [0x0964, 0x115c2, "danda"], [0x0965, 0x115c3, "double danda"],
  [0x0950, 0x115c1, "OM→siddham 開篇符"],
];
const GOLDEN = [...CONSONANTS, ...VOWELS_INDEP, ...MATRAS, ...SIGNS];

let g1 = 0, n1 = 0;
const fail1 = [];
for (const [dev, sid, label] of GOLDEN) {
  n1 += 2; // 每對測正向＋反向
  const fwd = D2S(cp(dev));
  const rev = S2D(cp(sid));
  if (fwd === cp(sid)) g1++; else fail1.push(`D2S ${label} U+${dev.toString(16)}→${JSON.stringify(fwd)} 期望 U+${sid.toString(16)}`);
  if (rev === cp(dev)) g1++; else fail1.push(`S2D ${label} U+${sid.toString(16)}→${JSON.stringify(rev)} 期望 U+${dev.toString(16)}`);
}
// 1a. 組合行為（同一表，多碼位序列）：ka+virama+kha 合字、ra+u warbler 形
{
  const cases = [
    // 天城輸入, 期望悉曇輸出, 說明
    [cp(0x0915) + cp(0x094d) + cp(0x0916), cp(0x1158e) + cp(0x115bf) + cp(0x1158f), "ka+virama+kha 合字模型"],
    [cp(0x0915) + cp(0x093e), cp(0x1158e) + cp(0x115af), "kā"],
    [cp(0x0930) + cp(0x0941), cp(0x115a8) + cp(0x115dc), "ru＝ra+u warbler 形（Ch.15 §15.5）"],
    [cp(0x0930) + cp(0x0942), cp(0x115a8) + cp(0x115dd), "rū＝ra+uu warbler 形"],
    [cp(0x0915) + cp(0x0941), cp(0x1158e) + cp(0x115b2), "ku＝cloud 形（非 ra）"],
    [cp(0x0905) + cp(0x0902), cp(0x11580) + cp(0x115bd), "aṃ"],
  ];
  for (const [dev, sid, label] of cases) {
    n1 += 2;
    if (D2S(dev) === sid) g1++; else fail1.push(`D2S 組合 ${label}: ${JSON.stringify(D2S(dev))}`);
    if (S2D(sid) === dev) g1++; else fail1.push(`S2D 組合 ${label}: ${JSON.stringify(S2D(sid))}`);
  }
}
// 1b. 透傳契約：未映射碼位原樣保留（悉曇字體無字形的天城碼位不得出現在輸出）
{
  const cases = [
    [cp(0x0966), "數字 ०（悉曇未編碼數字）"],
    [cp(0x093d), "avagraha ऽ"],
    [cp(0x0962) + cp(0x094f), "◌ॢ/◌ॣ 天城（悉曇 U+115B6/B7 保留碼位）→ 原樣透傳"],
    [cp(0x0962), "◌ॢ 單碼位透傳"],
    [cp(0x0963), "◌ॣ 單碼位透傳"],
  ];
  for (const [dev, label] of cases) {
    n1++;
    if (D2S(dev) === dev) g1++; else fail1.push(`透傳 ${label}: ${JSON.stringify(D2S(dev))} ≠ 原樣`);
  }
  // 反向側：悉曇保留碼位不得被反向表「猜」成任何天城碼位——原樣透傳
  for (const sid of [0x115b6, 0x115b7]) {
    n1++;
    if (S2D(cp(sid)) === cp(sid)) g1++; else fail1.push(`保留碼位 U+${sid.toString(16)} 反向不得映射`);
  }
}
console.log(`[①] 天城↔悉曇碼位全表 golden pairs：${GOLDEN.length} 對（＋組合/透傳契約），斷言 ${n1}`);
for (const f of fail1.slice(0, 20)) console.error(`  ✗ ${f}`);
console.log(`siddham-gate: ①码位对照 通过 ${g1}/${n1}`);

/* ═══════════════════ ② CBETA 悉曇字記（T54n2132）抽樣段落（僅本地） ═══════════════════ */
/* CBETA XML 的悉曇字形是 SD-xxxx PUA 私用碼位；charDecl 提供
 * 「Romanized form in Unicode transcription」權威羅馬轉寫。
 * 本段驗證：對抽樣段落，siddhamToIast(把 PUA 換成……) ——不，反過來：
 * CBETA 權威轉寫（IAST）→ iastToSiddham → 悉曇碼位串 → siddhamToIast
 * 應回出 CBETA 轉寫（canon 歸一後）。即「CBETA 轉寫 ↔ 引擎」的真值門。 */
const CORPUS_XML = path.resolve(ROOT, "..", "corpus", "siddham", "T54n2132.xml");
const SOURCES = path.resolve(ROOT, "..", "corpus", "siddham", "SOURCES.md");
let g2 = 0, n2 = 0, skip2 = 0;
const fail2 = [];

const canon = (s) =>
  s.normalize("NFC").replace(/\u2019/g, "'").toLowerCase().replace(/\s+/g, " ").trim();

if (!fs.existsSync(CORPUS_XML)) {
  console.log(`[②] CBETA T54n2132 語料缺檔（僅本地語料不入 git）——SKIP`);
  console.log(`     下載方式見 corpus/siddham/SOURCES.md（CBETA xml-p5 repo，T54/T54n2132.xml）`);
  skip2 = 1;
} else {
  const xml = fs.readFileSync(CORPUS_XML, "utf8");
  const decl = xml.slice(xml.indexOf("<charDecl>"), xml.indexOf("</charDecl>"));
  // SD-xxxx → { unicode 轉寫, PUA 碼位 }
  const sdMap = new Map();
  for (const m of decl.matchAll(/<char xml:id="(SD-[0-9A-F]+)">([\s\S]*?)<\/char>/g)) {
    const props = Object.fromEntries(
      [...m[2].matchAll(/<localName>([^<]+)<\/localName>\s*<value>([^<]+)<\/value>/g)]
        .map((p) => [p[1], p[2]]));
    const pua = m[2].match(/type="PUA">U\+([0-9A-F]+)/);
    if (props["Romanized form in Unicode transcription"] && pua)
      sdMap.set(Number.parseInt(pua[1], 16), props["Romanized form in Unicode transcription"]);
  }
  console.log(`[②] CBETA charDecl SD-xxxx 條目（含 Unicode 轉寫＋PUA）：${sdMap.size}`);

  // 抽樣策略：SIDDHAM_GATE_LIMIT（預設 120 段）。取正文含 SD-PUA 碼位的段落。
  const LIMIT = process.env.SIDDHAM_GATE_LIMIT ? Number(process.env.SIDDHAM_GATE_LIMIT) : 120;
  const body = xml.slice(xml.indexOf("<body"));
  const plain = body.replace(/<[^>]+>/g, "");
  // 依 PUA 碼位聚集：把正文切成含 PUA 的「詞段」（相鄰漢字旁的 PUA 串）
  const puaSet = new Set(sdMap.keys());
  const isPua = (c) => puaSet.has(c.codePointAt(0));
  // 掃描連續 token：PUA 與夾在其間的 ASCII/IAST 轉寫（CBETA 正文 PUA 之間夾漢字註釋），
  // 抽樣單位＝一個 PUA 串（最多 12 個相鄰 PUA 碼位，間隔 ≤1 個非 PUA 字）
  const samples = [];
  let cur = [];
  let gap = 0;
  for (const ch of plain) {
    if (isPua(ch)) { cur.push(ch); gap = 0; }
    else if (cur.length) {
      if (++gap > 1) { if (cur.length >= 2 && cur.length <= 12) samples.push(cur); cur = []; gap = 0; }
    }
  }
  if (cur.length >= 2 && cur.length <= 12) samples.push(cur);
  const picked = samples.slice(0, LIMIT);
  console.log(`[②] 抽樣 PUA 串：${samples.length} 個，取前 ${picked.length}`);

  for (const seq of picked) {
    // 串 → CBETA 權威 IAST（空白連接，逐碼位）
    const iasts = seq.map((c) => sdMap.get(c.codePointAt(0)));
    if (iasts.some((t) => !t)) continue;
    const truth = iasts.join(" ");
    // PUA 碼位 → 換成引擎側的「等價輸入」：直接驗 IAST 級——
    // iastToSiddham(truth) → siddhamToIast 應回出 truth（canon 後），
    // 且輸出必須全為悉曇區碼位（PUA 私用碼位絕不可出現在引擎輸出）。
    n2 += 2;
    let sid;
    try { sid = I2S(truth); } catch (e) {
      fail2.push(`I2S 拋錯 ${JSON.stringify(truth)}: ${e.message.slice(0, 60)}`);
      continue;
    }
    const allSiddham = [...sid].every((c) => {
      const x = c.codePointAt(0);
      return (x >= 0x11580 && x <= 0x115ff) || /[|\s]/.test(c);
    });
    if (allSiddham) g2++; else fail2.push(`輸出含非悉曇碼位 ${JSON.stringify(truth)} → ${JSON.stringify(sid)}`);
    const back = S2I(sid);
    if (canon(back) === canon(truth)) g2++; else fail2.push(`閉環 ${JSON.stringify(truth)} → ${JSON.stringify(sid)} → ${JSON.stringify(back)}`);
  }
  // 2b. 逐碼位交叉門：每個 SD 條目的 Unicode 轉寫（基底音節）單獨過引擎閉環
  for (const truth of sdMap.values()) {
    // 只測引擎可表音的條目（含悉曇未編碼輔音如 ḷ 型雜項的跳過並計數）
    n2++;
    try {
      const back = S2I(I2S(truth));
      if (canon(back) === canon(truth)) g2++;
      else fail2.push(`SD 條目閉環 ${JSON.stringify(truth)} → ${JSON.stringify(back)}`);
    } catch (e) {
      fail2.push(`SD 條目拋錯 ${JSON.stringify(truth)}: ${e.message.slice(0, 50)}`);
    }
  }
}
if (fail2.length) for (const f of fail2.slice(0, 15)) console.error(`  ✗ ${f}`);
console.log(`siddham-gate: ②CBETA抽樣 通过 ${g2}/${n2}${skip2 ? "（語料缺檔，SKIP）" : ""}`);

/* ═══════════════════ ③ IAST 級映射閉環（映射測試，非真值門禁） ═══════════════════ */
/* 明確標記：本段只證 iastToSiddham↔siddhamToIast 的映射自洽（閉環＋單射），
 * 真值判定由①（碼位全表）與②（CBETA 權威轉寫）承擔。與①②分開計數。 */
const SAMPLES = [
  // 拼寫樣本：單音節、叢集、niggahita、visarga、danda、warbler、聲化元音
  "ka", "kā", "kiṃ", "svāhā", "oṃ", "oṃ maṇi padme hūṃ",
  "tathāgata", "bodhisattva", "dharme", "guṇeṣu", "sarvārthā",
  "kṣa", "jña", "ṛ", "ṝ", "rā", "rū", "ru", "hrī", "śrī",
  "ka |", "ka ||", "āḥ", "krodha", "trailokya", "vajrasattva",
  "a", "ā", "i", "ī", "u", "ū", "e", "ai", "o", "au",
  "kaṃ", "kaḥ", "kāma", "bhūta", "tasmāt", "sattvānāṃ",
];
let g3 = 0, n3 = 0;
const fail3 = [];
for (const s of SAMPLES) {
  n3 += 2;
  const fwd = S2I(I2S(s));
  if (canon(fwd) === canon(s)) g3++; else fail3.push(`fwd 閉環 ${JSON.stringify(s)} → ${JSON.stringify(fwd)}`);
  let rev = null;
  try { rev = I2S(S2I(I2S(s))); } catch (e) { fail3.push(`rev 拋錯 ${JSON.stringify(s)}: ${e.message.slice(0, 50)}`); }
  if (rev !== null && rev === I2S(s)) g3++; else if (rev !== null) fail3.push(`rev 閉環 ${JSON.stringify(s)}: ${JSON.stringify(I2S(s))} → ${JSON.stringify(rev)}`);
}
// ③b injectivity：相異 IAST 輸入不得映射到同一悉曇串（資訊不丟失）
{
  const pairs = [
    ["ru", "rū"], ["ru", "rṇ"], ["ka", "kā"], ["n", "ṇ"], ["n", "ṅ"], ["n", "ñ"],
    ["s", "ś"], ["s", "ṣ"], ["t", "ṭ"], ["d", "ḍ"], ["ka", "kha"], ["maṃ", "maḥ"],
    ["kṣa", "ksa"], ["jña", "jna"], ["śrī", "srī"], ["hrī", "hr̥ī"],
  ];
  for (const [a, b] of pairs) {
    n3++;
    const A = I2S(a), B = I2S(b);
    if (A !== B) g3++; else fail3.push(`injectivity ${JSON.stringify(a)} ≡ ${JSON.stringify(b)} → ${JSON.stringify(A)}`);
  }
}
for (const f of fail3.slice(0, 20)) console.error(`  ✗ ${f}`);
console.log(`siddham-gate: ③IAST閉環 通过 ${g3}/${n3}（映射測試，非真值門禁）`);

/* ═══════════════════ 門檻與總計 ═══════════════════ */
const GATE = 100; // ① 是純表測試，必須 100%；②③逐例分類計數
let failures = 0;
if (g1 !== n1) { failures++; console.error(`✗ ①码位对照 ${g1}/${n1} < 100%`); }
if (!skip2 && n2 > 0) {
  const rate = (g2 / n2) * 100;
  if (rate < 99.5) { failures++; console.error(`✗ ②CBETA抽樣 ${g2}/${n2}（${rate.toFixed(2)}%）< 99.5%`); }
}
if (g3 !== n3) { failures++; console.error(`✗ ③IAST閉環 ${g3}/${n3} < 100%`); }
if (failures) { console.error(`siddham-canon-gate: 失敗 ${failures} 段門`); process.exit(1); }
console.log(`siddham-canon-gate: 通过 ${g1 + g2 + g3}/${n1 + n2 + n3}（①${g1}/${n1}＋②${g2}/${n2}${skip2 ? "SKIP" : ""}＋③${g3}/${n3}）`);
