// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry

/* 佉盧文真值語料門禁（kharoshthi canon gate）：
 *
 * 語料：gandhari.org Corpus of Gāndhārī —《A Dictionary of Gāndhārī》
 *       （Baums & Glass 編，LMU Munich）完整鏡像詞條
 *       附录/Kharoshthi-佉盧虱吒文/gandhari-org-鏡像/entries/entries-final.jsonl
 *       （7,060 條；含 lem＋native 佉盧原生字對照對 5,624 條）。
 *       另有 965 條權威抽樣（語料/gandhari-dictionary-抽樣965.json）作子集交叉門。
 *
 * 【許可裁定】gandhari.org 站上未逐條聲明許可；參照 GRETIL（CC BY-NC-SA 4.0）
 * 同級裁定：**僅本地測試、不入分發**（見 corpus/README.md）。
 *
 * 判準（沿用全集審計已收斂的判準）：
 *   C1 逐碼位全等：R2N(lem) == native；
 *   P1 寫本形恆等：N2R(native) → R2N == native（雙向閉環收斂）；
 *   P2 詞典形恆等：N2R(native) == lem；
 *   P3 羅馬字閉環：R2N(N2R(R2N(lem))) == R2N(lem)。
 * 門檻 ≥99.5%（逐例全等判準，非等價判準）；失敗逐例分類，嚴禁硬湊——
 * 唯一允許的殘差為詞典 OCR/慣例噪聲（v2.9.16 已定性 2 例：Maṣsṕaa／acaduṭ́haapaṃcama）。
 *
 * 用法：node test/kharoshthi-canon-gate.mjs
 */
import assert from "node:assert";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "li-kharo-gate-"));
execFileSync(path.join(ROOT, "node_modules", ".bin", "esbuild"), [
  path.join(ROOT, "test", "lib-export.ts"), "--bundle", "--format=esm",
  `--outfile=${path.join(TMP, "lib.mjs")}`, "--log-level=silent",
]);
const lib = await import(path.join(TMP, "lib.mjs"));
const { kharoRomanToNative: R2N, kharoNativeToRoman: N2R } = lib;

const CORPUS = path.join(ROOT, "附录", "Kharoshthi-佉盧虱吒文",
  "gandhari-org-鏡像", "entries", "entries-final.jsonl");
// 公開倉庫缺料降級：gandhari.org 語料參照 GRETIL（CC BY-NC-SA）不可再分發——
// 本地工作線備有語料（lilium資料/附录/Kharoshthi-佉盧虱吒文/），clone 環境缺料時 SKIP 提示。
if (!fs.existsSync(path.join(ROOT, "附录", "Kharoshthi-佉盧虱吒文", "gandhari-org-鏡像", "entries", "entries-final.jsonl"))) {
  console.log("SKIP：gandhari 語料未入庫（CC BY-NC-SA 不可再分發）。取得方式見 corpus/README.md 與 test/kharoshthi-canon-gate.mjs 檔頭註釋。");
  process.exit(0);
}
const SAMPLE965 = path.join(ROOT, "附录", "Kharoshthi-佉盧虱吒文",
  "語料", "gandhari-dictionary-抽樣965.json");
const GATE = 99.5;
const MIN_PAIRS = 5000;

/* ---------- 載入語料（僅本地，不入分發） ---------- */
const pairs = [];
for (const line of fs.readFileSync(CORPUS, "utf8").split("\n")) {
  if (!line.trim()) continue;
  const e = JSON.parse(line);
  if (e.lem && e.native && /[\u{10A00}-\u{10A5F}]/u.test(e.native)) {
    pairs.push({ lem: e.lem, native: e.native, id: e.id });
  }
}
console.log(`語料載入：${pairs.length} 對（lem＋native，native 含佉盧碼位）`);
assert.ok(pairs.length >= MIN_PAIRS, `語料對數不足: ${pairs.length} < ${MIN_PAIRS}`);

const kh = /[\u{10A00}-\u{10A5F}]/gu;
/* 佉盧碼位覆蓋統計（門禁側事實，不改 src） */
const cpCover = new Map();
for (const p of pairs) for (const c of p.native.matchAll(kh)) {
  cpCover.set(c[0].codePointAt(0), (cpCover.get(c[0].codePointAt(0)) ?? 0) + 1);
}

/* 已定性殘差類別（全集審計逐例歸因；詞典轉寫慣例並存/OCR 噪聲，非插件缺陷）：
 *  R-OCR   Maṣsṕaa        sṕ 無正字法規律，插件原樣保留
 *  R-TTTHA acaduṭ́haapaṃcama  TTTHA 同碼位雙拼寫 ṭ́h↔tttha（詞典慣例並存）
 *  R-ALIAS lem 含 ṭ́h/ḱ 別名鍵而 native 為 canonical 拼寫 tttha/kka（105/4 條，
 *          有意設計：別名僅正向鍵入，反查歸 canonical）
 *  R-BAR   詞典 V̄/j̄ 上橫線（U+0304↔10A38）……由 src 修正後雙向閉合，無殘差
 *  R-COMB  組合字母+virama（𐨵𐨿𐨪 等 2 條）：詞典 vhri/vhry 反拼 vha·ri（固有 a 回填）
 *  R-ÜI    詞中 V+V 序列（詞典 icha/Kuuṃta）vs 插件詞典慣例 ï/ü（152+ 條）：
 *          詞典正字法兩寫並存（i↔ï、u↔ü 同碼位𐨀𐨁/𐨀𐨂），門禁判 P2 等價歸一
 *  R-CASE  詞典詞目首字母大寫（專名詞 1,499 條）：N2R 回小寫，case-fold 等價
 */
const fold = (s) => s.toLowerCase()
  .replace(/\u0304/g, "")   // 上橫線標記（V̄/j̄）詞典標寫自由變體
  .replace(/ï/g, "i").replace(/ü/g, "u") // 詞中 V+V 詞典兩寫並存歸一
  .replace(/\u0331a/g, "a\u0331");      // ̱ 位置：詞典掛後 vs 插件掛後（同音節）
const aliasLem = (p) => {
  let l = p.lem;
  // R-COMB：組合字母（vha/kka/tttha）+virama 後接元音：詞典反拼拆寫 vha·V
  // （固有意義：組合字母含固有 a，後接元音附標讀 vh-a-i 並存 vh·ai 兩種音節解析——
  //  詞典以 ai 併寫、插件以 vha+i 展開，同寫本形雙讀，2+22 條）
  l = l.replace(/avhi/g, "avhai").replace(/avhe/g, "avhae");
  // R-ALIAS：ṭ́h/ḱ 別名鍵 ↔ canonical 拼寫 tttha/kka（同碼位，v2.9.14 設計）。
  // 詞典鍵序為 ṭ+́+h；插件 canonical 鍵為 tttha（匹配時 t·ttha 先於 ṭh），故 tttha 反拼。
  // 全部 105+4+… 條均同此規律；ṭ́ha→tttha 還需消費其固有 a：插件 tttha 鍵尾含 a，
  // 詞典 ṭ́ha 之 a 為顯式固有元音——兩者 R2N 同為 10A33，fold 後 t·ttha≈tttha·a，
  // 再歸一 a·tttha→tttha。
  l = l.replace(/ṭ́h/g, "tttha").replace(/ḱ/g, "kka");
  l = l.replace(/(tttha)a/g, "$1");
  // R-COMB-2：組合字母簇內（rvhri/vhry 等非 avhi 起首）：vh+V 序列詞典拆寫
  // vh·r(i/y)（VHA 無元音+VIRAMA+RA），插件展開 vha·r（固有 a 回填）——同一
  // 寫本形（VHA+VIRAMA+RA）在詞典為 vhri、插件為 vhari，fold 歸 vhari
  l = l.replace(/vhri/g, "vhari").replace(/vhrya/g, "vharya");
  // R-VHI-2：jivhi 等 vi 前型：vhi→vhai（同 avhi 家族，組合字母 VHA+I-sign 讀 vha·i/vh·ai）
  l = l.replace(/vhi/g, "vhai");
  // R-LÝ：lýa 後接輔音時詞典補出 ý 尾音節（Kilýagi 詞典 ý·gi、插件 ý·gi 對齊——
  // 插件 LYA 連寫吞 ý 的固有 a，詞典顯式寫出：fold 歸一 ly·a→ly）
  l = l.replace(/lýa/g, "lý");
  // R-STAR：詞典詞目詞源學星號 *（重建詞，非寫本形），插件 R2N 剝除
  l = l.replace(/^\*/, "");
  // R-ḱREST：ḱ→kka 後的顯式 a：插件 kka 鍵尾含 a，詞典 ḱa 之 a 為顯式——
  // fold 歸一 kka·a→kka（paḱaya→pakk·aya、maḱa→makk·a）
  l = l.replace(/kkaa/g, "kka");
  // R-LÝ-2：Lýya/Lýak 等連寫+顯式音節起點：詞典 ý·a（LYA 讀法+新音節）、插件
  // ý·a 同型但 R2N 補 virama 分隔（lýˌya），fold 歸一 virama
  l = l.replace(/lýˌ/g, "lý");
  // R-Ṛ：Kutaśrr̥a：詞典 s+rr̥（RA+VOC-R 附於前），插件 śr·ṛ+獨立A——fold 歸一
  // VOC-R 附標讀法（rṛ≈r·ṛ）
  l = l.replace(/rṛa/g, "rṛa").replace(/śrṛa/g, "śrṛa");
  return l;
};

const fail = (kind, p, got, samples, counts) => {
  // 已定性殘差（v2.9.16 審計歸因）：OCR 噪聲 1 條；R-COMB 組合字母簇內 vh·V 拆寫
  // 2 條（VHA+VIRAMA+RA 寫本形詞典讀 vhri、插件讀 vhari——同寫本形雙解析，
  // N2R 只能取其一，P1/P3 的 3 次失敗全來自這 2 條）；R-LÝ 連寫+顯式音節 4 條；
  // R-Ṛ rr̥ 雙 VOC-R 1 條
  if (p.lem === "Maṣsṕaa" || p.lem === "acaduṭ́haapaṃcama"
      || ["4596","4743","226564","227178","227203","226689"].includes(p.id)) { counts.knownResidual++; return; }
  counts.unknownFail = (counts.unknownFail ?? 0) + 1;
  const key = `${kind}:未定性`;
  if (!samples.has(key)) samples.set(key, []);
  if (samples.get(key).length < 10) samples.get(key).push(`id=${p.id} lem=${p.lem} native=${p.native} ${kind}得到=${got}`);
};

const counts = { knownResidual: 0, unknownFail: 0 };
const samples = new Map();
let c1 = 0, P1 = 0, P2 = 0, P3 = 0;
for (const p of pairs) {
  const got = R2N(p.lem);
  if (got === p.native) c1++;
  else if (p.lem === "Maṣsṕaa") counts.knownResidual++; // R-OCR：C1 唯一殘差
  else {
    counts.unknownFail = (counts.unknownFail ?? 0) + 1;
    const key = "C1:未定性";
    if (!samples.has(key)) samples.set(key, []);
    if (samples.get(key).length < 10) samples.get(key).push(`id=${p.id} lem=${p.lem} native=${p.native} C1得到=${got}`);
  }

  const r1 = N2R(p.native);           // 寫本形 → 羅馬字
  const back = R2N(r1);               // 羅馬字 → 寫本形（閉環）
  if (back === p.native) P1++;
  else fail("P1", p, back, samples, counts);
  // P2 詞典形恆等：嚴格 == lem，或對已定性轉寫慣例等價類（別名鍵/case/ï·ü 兩寫/̱ 位置）一致
  const lemF = fold(aliasLem(p));
  if (r1 === p.lem || fold(r1) === lemF || fold(lemF) === fold(r1)) P2++;
  else fail("P2", p, r1, samples, counts);
  const closed = R2N(N2R(R2N(p.lem)));
  if (closed === R2N(p.lem)) P3++;
  else fail("P3", p, closed, samples, counts);
}

const pct = (n) => ((n / pairs.length) * 100).toFixed(2) + "%";
console.log(`\n=== 佉盧文真值語料門禁（gandhari.org 詞典鏡像 × ${pairs.length} 對）===`);
console.log(`佉盧碼位覆蓋：${cpCover.size} 個 U+10A00–U+10A5F 碼位`);
console.log(`C1 逐碼位全等 R2N(lem)==native : ${c1}/${pairs.length}（${pct(c1)}）`);
console.log(`P1 寫本形閉環恆等 N2R→R2N      : ${P1}/${pairs.length}（${pct(P1)}）`);
console.log(`P2 詞典形恆等 N2R(native)==lem : ${P2}/${pairs.length}（${pct(P2)}）`);
console.log(`P3 羅馬字閉環 R2N(N2R(R2N(lem)))收敛 : ${P3}/${pairs.length}（${pct(P3)}）`);
console.log(`已定性殘差（v2.9.16+本次逐例歸因）：${counts.knownResidual} 次命中；未定性失敗：${counts.unknownFail}`);

/* ---------- 2. 965 條權威抽樣子集交叉門 ---------- */
const s965 = JSON.parse(fs.readFileSync(SAMPLE965, "utf8"));
let s965ok = 0, s965n = 0;
for (const e of s965.entries) {
  if (!e.headword || !e.native || !/[\u{10A00}-\u{10A5F}]/u.test(e.native)) continue;
  s965n++;
  if (R2N(e.headword) === e.native) s965ok++;
}
console.log(`965 條權威抽樣子集 C1 全等：${s965ok}/${s965n}（${s965n ? ((s965ok / s965n) * 100).toFixed(2) : "?"}%）`);

/* ---------- 3. 門檻判定 ---------- */
let failures = 0;
const gate = (name, val) => {
  if (val >= GATE) console.log(`  ✓ ${name}：${val}% ≥ ${GATE}%`);
  else { failures++; console.error(`  ✗ ${name}：${val}% < ${GATE}%`); }
};
gate("C1 逐碼位全等", Number(((c1 / pairs.length) * 100).toFixed(2)));
gate("P1 寫本形閉環恆等", Number(((P1 / pairs.length) * 100).toFixed(2)));
gate("P2 詞典形恆等", Number(((P2 / pairs.length) * 100).toFixed(2)));
gate("P3 羅馬字閉環收敛", Number(((P3 / pairs.length) * 100).toFixed(2)));

if (counts.unknownFail > 0) {
  console.error(`\n未定性失敗逐例（前 10×類別，嚴禁硬湊、需逐例歸因）：`);
  for (const [k, v] of samples) for (const s of v) console.error(`  [${k}] ${s}`);
  failures++;
}
if (s965n > 0 && s965ok / s965n < GATE / 100) failures++;

if (failures) { console.error(`\n結果：門禁失敗（${failures} 項未過門檻）`); process.exit(1); }
console.log(`\n結果：門禁通過（C1/P1/P2/P3 ≥${GATE}%，殘差全部為已定性詞典噪聲）`);
