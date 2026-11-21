// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry

/* 轉寫執行層（src/dict/translit-run.ts）單測
 *
 * 本檔案守住「遷移沒有丟能力、行為沒有漂移」，並新增長文本相關斷言。
 *
 * 原 附录/realtime-轉寫/test/realtime.mjs 的 Coverage 在此延續：
 *   1. 詞邊界判定（ASCII / 全角 / CJK 標點）
 *   2. 尾隨詞提取 + 標點剝離
 *   3. 逐詞轉換、標點保留、looksLikeRoman 守門、無變化不產生事務
 *   4. 長文本掃描：結構不漂移、代理對不被切壞、真實方案可用
 *   5. 校勘異文行的羅馬讀數（romanReading）
 * 不在此處者：CM6 的 composing / 用戶事件判定——隨即時上屏一併移除。
 *
 * 用法：node test/translit-run.mjs
 */
import assert from "node:assert";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "li-translit-run-"));
execFileSync(path.join(ROOT, "node_modules/.bin/esbuild"), [
  path.join(ROOT, "test/lib-export.ts"), "--bundle", "--format=esm",
  `--outfile=${path.join(TMP, "lib.mjs")}`, "--log-level=silent",
]);
const lib = await import(path.join(TMP, "lib.mjs"));

let passed = 0;
const failures = [];
const test = (name, fn) => {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failures.push({ name, e }); console.error(`  ✗ ${name}\n    ${e.message}`); }
};

// —— 假方案：小寫詞 → 大寫，行為可預測 ——
const upperScheme = {
  id: "upper",
  label: { zh: "大寫" },
  looksLikeRoman: (w) => /^[a-z]+$/.test(w),
  looksLikeNative: (w) => /^[A-Z]+$/.test(w),
  romanToNative: (w) => w.toUpperCase(),
  nativeToRoman: (w) => w.toLowerCase(),
};
const doc = (text) => ({ lineStart: () => 0, slice: (a, b) => text.slice(a, b) });

console.log("=== 1. 詞邊界判定（遷移自即時上屏） ===");

test("觸發字符：ASCII 標點 . 觸發", () => assert.equal(lib.isTriggerChar("."), true));
test("觸發字符：全角句號 。 觸發", () => assert.equal(lib.isTriggerChar("。"), true));
test("觸發字符：空格 / 換行 / 跳格觸發", () => {
  for (const ch of [" ", "\n", "\t"]) assert.equal(lib.isTriggerChar(ch), true, `${JSON.stringify(ch)} 應觸發`);
});
test("觸發字符：CJK 頓號 、 與逗號 ，觸發", () => {
  assert.equal(lib.isTriggerChar("、"), true);
  assert.equal(lib.isTriggerChar("，".normalize("NFC")), true);
});
test("觸發字符：普通字母 a 不觸發", () => assert.equal(lib.isTriggerChar("a"), false));
test("觸發字符：漢字 漢 不觸發", () => assert.equal(lib.isTriggerChar("漢"), false));

console.log("=== 2. 尾隨詞提取（遷移自即時上屏，行為不得漂移） ===");

test("尾隨詞：bod。 → 詞 bod、標點長 1", () => {
  assert.deepEqual(lib.extractTrailingWord("bod。"), { word: "bod", punctLen: 1 });
});
test("尾隨詞：bod. → 詞 bod、標點長 1", () => {
  assert.deepEqual(lib.extractTrailingWord("bod."), { word: "bod", punctLen: 1 });
});
test("尾隨詞：bod.。 → 詞 bod、標點長 2", () => {
  assert.deepEqual(lib.extractTrailingWord("bod.。"), { word: "bod", punctLen: 2 });
});
test("尾隨詞：純標點 。。。 → null", () => assert.equal(lib.extractTrailingWord("。。。"), null));
test("尾隨詞：空串 → null", () => assert.equal(lib.extractTrailingWord(""), null));

console.log("=== 3. 逐詞轉換（遷移自即時上屏） ===");

test("轉換：bod。 → 區間 [0,3) 爲 BOD、標點保留原位", () => {
  const r = lib.convertTrailingWord(doc("bod。"), 4, upperScheme);
  assert.ok(r, "應返回轉寫結果");
  assert.deepEqual({ from: r.from, to: r.to, insert: r.insert }, { from: 0, to: 3, insert: "BOD" });
});
test("轉換：bod（空格）觸發 → 同樣替換 [0,3)", () => {
  const r = lib.convertTrailingWord(doc("bod "), 4, upperScheme);
  assert.deepEqual({ from: r.from, to: r.to, insert: r.insert }, { from: 0, to: 3, insert: "BOD" });
});
test("轉換：漢字不誤轉（looksLikeRoman 守門）", () => {
  assert.equal(lib.convertTrailingWord(doc("漢字。"), 3, upperScheme), null);
});
test("轉換：轉寫無變化（a→a）時返回 null，不產生多餘事務", () => {
  const same = { looksLikeRoman: () => true, looksLikeNative: () => true, romanToNative: (w) => w };
  assert.equal(lib.convertTrailingWord(doc("aa。"), 3, same), null);
});
test("轉換：方案 romanToNative 拋錯 → 捕獲不拋出", () => {
  const boom = { looksLikeRoman: () => true, looksLikeNative: () => true, romanToNative: () => { throw new Error("boom"); } };
  assert.doesNotThrow(() => lib.convertTrailingWord(doc("aa。"), 3, boom));
  assert.equal(lib.convertTrailingWord(doc("aa。"), 3, boom), null);
});

console.log("=== 4. 長文本轉寫（v2.7.0 新增，校勘面板用） ===");

test("長文本：多詞逐詞轉換，詞數統計正確", () => {
  const r = lib.transliterateLongText("bod chos yid", upperScheme, true);
  assert.equal(r.text, "BOD CHOS YID");
  assert.equal(r.converted, 3);
  assert.equal(r.words, 3);
  assert.equal(r.skipped, 0);
});
test("長文本：標點、換行、空白結構完全保留（校勘要逐字對照）", () => {
  const src = "bod，chos。\nyid！";
  const r = lib.transliterateLongText(src, upperScheme, true);
  assert.equal(r.text, "BOD，CHOS。\nYID！");
});
test("長文本：不合方案的詞原樣保留並計入 skipped", () => {
  const r = lib.transliterateLongText("bod 漢字 chos", upperScheme, true);
  assert.equal(r.text, "BOD 漢字 CHOS");
  assert.equal(r.converted, 2);
  assert.equal(r.skipped, 1);
});
test("長文本：反方向（原生 → 羅馬）同樣可用", () => {
  const r = lib.transliterateLongText("BOD CHOS", upperScheme, false);
  assert.equal(r.text, "bod chos");
  assert.equal(r.converted, 2);
});
test("長文本：代理對（悉曇 U+11580）不被逐字切壞", () => {
  // 輸入側是代理對 + 拉丁詞混排，確保 for..of 按 code point 迭代
  const src = "𑖀 sid 𑖁";
  const r = lib.transliterateLongText(src, upperScheme, true);
  assert.equal(r.text, "𑖀 SID 𑖁", "代理對應完整保留");
  assert.ok(r.text.includes("𑖀") && r.text.includes("𑖁"));
});
test("長文本：空串 / 純標點不崩潰", () => {
  assert.equal(lib.transliterateLongText("", upperScheme, true).text, "");
  const r = lib.transliterateLongText("。。。", upperScheme, true);
  assert.equal(r.words, 0);
  assert.equal(r.text, "。。。");
});
test("長文本：capitalSentinel 關閉時 like 會被轉（默認行為）", () => {
  const r = lib.transliterateLongText("like", upperScheme, true);
  assert.equal(r.converted, 1);
});
test("長文本：capitalSentinel 開啟時小寫 like 不轉（避免誤傷英文）", () => {
  const r = lib.transliterateLongText("like", upperScheme, true, { capitalSentinel: true });
  assert.equal(r.converted, 0);
  assert.equal(r.text, "like");
});

console.log("=== 5. 校勘異文行的羅馬讀數（v2.7.0 新增） ===");

test("romanReading：能轉則返回讀數", () => {
  assert.equal(lib.romanReading(upperScheme, "BOD"), "bod");
});
test("romanReading：轉不動返回 null（呼叫端靜默，不顯示空括號）", () => {
  const same = { looksLikeNative: () => true, nativeToRoman: (w) => w };
  assert.equal(lib.romanReading(same, "XYZ"), null);
});
test("romanReading：空串返回 null", () => assert.equal(lib.romanReading(upperScheme, ""), null));

console.log("=== 6. 真實方案冒煙（藏文 Wylie） ===");

test("tibetan-wylie 已註冊，長文本可轉", () => {
  const s = lib.getScheme("tibetan-wylie");
  assert.ok(s, "tibetan-wylie 應已註冊");
  assert.equal(typeof s.romanToNative, "function");
  const r = lib.transliterateLongText("a.", s, true);
  assert.ok(r.converted >= 1, "至少轉出一個詞");
});
test("Wylie 'a' → ཨ (U+0F68 a-chen)，游標版行為與遷移前一致", () => {
  const s = lib.getScheme("tibetan-wylie");
  const r = lib.convertTrailingWord(doc("a。"), 2, s);
  assert.ok(r, "應返回轉寫結果");
  assert.equal(r.insert, "ཨ");
  assert.deepEqual({ from: r.from, to: r.to }, { from: 0, to: 1 });
});
test("真實方案：梵文 IAST karma → कर्म 長文本可用", () => {
  const s = lib.getScheme("sanskrit-iast");
  const r = lib.transliterateLongText("karma.", s, true);
  assert.ok(r.converted >= 1);
  assert.ok(r.text.includes("कर्म"), `實際輸出：${r.text}`);
});

console.log("=== 7. 遷移時修正的兩個既有缺陷（回歸鎖） ===");

test("缺陷一：全角逗號 U+FF0C 是分隔符（原集合漏了它，bod，chos 轉不動）", () => {
  assert.equal(lib.isTriggerChar("，"), true, "全角逗號必須觸發");
  // 對照：原先就有的兄弟字符不能被改壞
  assert.equal(lib.isTriggerChar("、"), true, "頓號");
  assert.equal(lib.isTriggerChar("。"), true, "句號");
  assert.equal(lib.isTriggerChar("."), true, "ASCII 句點");
});
test("缺陷一：U+3000 表意空格 / U+00A0 不換行空格也算分隔（長文本掃描無 \\s 兜底）", () => {
  for (const ch of ["\u3000", "\u00a0"]) {
    assert.equal(lib.isTriggerChar(ch), true, `U+${ch.codePointAt(0).toString(16).toUpperCase()} 應為分隔符`);
  }
  const r = lib.transliterateLongText("bod　chos", upperScheme, true);
  assert.equal(r.text, "BOD　CHOS", "表意空格分隔的兩詞各自獨立轉寫");
});
test("缺陷一：中文逗號後的詞能被切出來（真實中文佛學文本寫法）", () => {
  const r = lib.transliterateLongText("bod，chos", upperScheme, true);
  assert.equal(r.text, "BOD，CHOS");
  assert.equal(r.converted, 2);
});
test("缺陷二：looksLikeIast('karma')===false —— 純 ASCII IAST 被方向判定誤殺", () => {
  const s = lib.getScheme("sanskrit-iast");
  assert.equal(s.looksLikeRoman("karma"), false, "這正是原缺陷的成因");
});
test("缺陷二：默認 latin 守門下 karma 能轉（Gate 模式的方向判定不再當許可）", () => {
  const s = lib.getScheme("sanskrit-iast");
  const r = lib.transliterateLongText("karma dharma.", s, true);
  assert.ok(r.text.includes("कर्म"), `實際輸出：${r.text}`);
  assert.ok(r.text.includes("धर्म"), `實際輸出：${r.text}`);
  assert.equal(r.converted, 2);
});
test("缺陷二：顯式 gate='looks' 仍能復現舊的沉默行為（零漂移通道保留）", () => {
  const s = lib.getScheme("sanskrit-iast");
  const r = lib.transliterateLongText("karma.", s, true, { gate: "looks" });
  assert.equal(r.converted, 0, "looks 模式下 karma 依舊不轉");
});

console.log("=== 8. 守門三態與形狀判定 ===");

test("looksConvertible：拉丁詞通過，漢字 / 藏文 / 天城體 / 純數字不通過", () => {
  for (const w of ["karma", "bod", "KarMa", "bod-chos", "r̥", "ṣa"]) {
    assert.equal(lib.looksConvertible(w), true, `${w} 應通過`);
  }
  for (const w of ["漢字", "བོད", "कर्म", "ひらがな", "2025", ""]) {
    assert.equal(lib.looksConvertible(w), false, `${w} 不應通過`);
  }
});
test("長文本：中文混排時只有拉丁詞被轉，漢字原樣（真實校勘文本）", () => {
  const r = lib.transliterateLongText("如是我聞，bod chos 二者。", upperScheme, true);
  assert.equal(r.text, "如是我聞，BOD CHOS 二者。");
  assert.equal(r.converted, 2);
  assert.equal(r.skipped, 2);
});
test("gate='none'：不守門，全丟給轉換器（只看有沒有變化）", () => {
  const r = lib.transliterateLongText("漢字", upperScheme, true, { gate: "none" });
  assert.equal(r.text, "漢字", "upper 方案對漢字返回原值 → 放棄");
  assert.equal(r.skipped, 1);
});

console.log("=== 9. 原生方向與自動挑方案（校勘面板用） ===");

test("原生方向：藏文 Unicode → Wylie 羅馬，長文本可用", () => {
  const s = lib.getScheme("tibetan-wylie");
  const r = lib.transliterateLongText("བོད་ ", s, false);
  assert.ok(r.converted >= 1, `實際輸出：${r.text} converted=${r.converted}`);
});
test("原生方向：漢字不會被誤餵給藏文方案", () => {
  const s = lib.getScheme("tibetan-wylie");
  const r = lib.transliterateLongText("如是我聞", s, false);
  assert.equal(r.text, "如是我聞");
  assert.equal(r.converted, 0);
});
test("pickWorkingScheme：投票選出轉得動的那一個，全轉不動返回 null", () => {
  const tib = lib.getScheme("tibetan-wylie");
  const skt = lib.getScheme("sanskrit-iast");
  const nonsense = {
    id: "nope", label: { zh: "廢案" }, group: "x", primary: true,
    looksLikeNative: () => false, looksLikeRoman: () => false,
    romanToNative: (w) => w, nativeToRoman: (w) => w, convert: (w) => w,
  };
  const pool = [{ id: "sanskrit-iast", impl: skt }, { id: "tibetan-wylie", impl: tib },
                { id: "nope", impl: nonsense }];
  assert.equal(lib.pickWorkingScheme("karma dharma", pool, true), "sanskrit-iast");
  assert.equal(lib.pickWorkingScheme("如是我聞", pool, true), null, "全都轉不動 → null");
});
test("pickWorkingScheme：單一方案拋錯不拖垮其餘", () => {
  const tib = lib.getScheme("tibetan-wylie");
  const boom = {
    id: "boom", label: { zh: "炸" }, group: "x", primary: true,
    looksLikeNative: () => { throw new Error("boom"); }, looksLikeRoman: () => { throw new Error("boom"); },
    romanToNative: () => { throw new Error("boom"); }, nativeToRoman: () => { throw new Error("boom"); },
    convert: () => { throw new Error("boom"); },
  };
  assert.equal(lib.pickWorkingScheme("karma", [{ id: "boom", impl: boom },
                                               { id: "sanskrit-iast", impl: lib.getScheme("sanskrit-iast") }], true),
               "sanskrit-iast");
  assert.ok(tib);
});

console.log("=== 10. 校勘：異文轉寫讀數（解釋一） ===");

test("異文讀數：藏文 ཀ / ཁ → ka ↔ kha（字形上看不出送氣，讀數才看得出）", () => {
  const r = lib.variantReading("ཀ", "ཁ");
  assert.ok(r, "應拿到讀數");
  assert.equal(r.schemeId, "tibetan-wylie");
  assert.equal(r.base, "ka");
  assert.equal(r.target, "kha");
});
test("異文讀數：梵文 क / ख → ka ↔ kha（自動選到梵文方案）", () => {
  const r = lib.variantReading("क", "ख");
  assert.ok(r, "應拿到讀數");
  assert.equal(r.schemeId, "sanskrit-iast");
  assert.deepEqual([r.base, r.target], ["ka", "kha"]);
});
test("異文讀數：悉曇代理對 𑖀 / 𑖁 → a ↔ ā", () => {
  const r = lib.variantReading("𑖀", "𑖁");
  assert.ok(r, "應拿到讀數");
  assert.equal(r.schemeId, "siddham-iast");
  assert.deepEqual([r.base, r.target], ["a", "ā"]);
});
test("異文讀數：純中文異文不顯示（如 / 是 沒有羅馬轉寫）", () => {
  for (const [a, b] of [["如", "是"], ["如是我聞", "如是我聞二"], ["玄", "妙"]]) {
    assert.equal(lib.variantReading(a, b), null, `${a}/${b} 不應產生讀數`);
  }
});
test("異文讀數：空值 / 相同 / 已是羅馬字 → null（呼叫端靜默）", () => {
  assert.equal(lib.variantReading("", "ཁ"), null, "脫文");
  assert.equal(lib.variantReading("ཀ", ""), null, "衍文");
  assert.equal(lib.variantReading("a", "a"), null, "相同");
  assert.equal(lib.variantReading("ka", "kha"), null, "已經是羅馬字");
});
test("異文讀數：快取不影響結果（同一組合重複呼叫一致）", () => {
  const a = lib.variantReading("བོད", "ཆོས");
  const b = lib.variantReading("བོད", "ཆོས");
  assert.deepEqual(a, b);
  const c = lib.variantReading("བོད", "ཆོས");
  assert.deepEqual(a, c);
});

console.log("=== 11. 校勘：長文本轉寫（transliterateText） ===");

test("長文本：原生 → 羅馬可自動識別（各文種 Unicode 區段不重疊）", () => {
  const r = lib.transliterateText("བོད་ཆོས་ཡིད།", "", false);
  assert.ok(r.ok);
  assert.equal(r.schemeId, "tibetan-wylie");
  assert.ok(r.text.includes("bod"), `實際輸出：${r.text}`);
  assert.ok(r.text.includes("chos"), `實際輸出：${r.text}`);
});
test("長文本：梵文段落自動選到 IAST", () => {
  const r = lib.transliterateText("कर्म धर्म", "", false);
  assert.equal(r.schemeId, "sanskrit-iast");
  assert.equal(r.text, "karma dharma");
});
test("長文本：換行結構保留（校勘要逐行對照）", () => {
  const r = lib.transliterateText("སྒྲ་བླ་མ།\nབོད་ཆོས།", "tibetan-wylie", false);
  // r24 併入擴展引擎後：། 無 ASCII Wylie 對應，無損往返設計輸出標註鍵 <.>（0.1.114/115 檢字表同口徑）
  assert.equal(r.text, "sgra bla ma<.>\nbod chos<.>");
  const back = lib.transliterateLongText(r.text, lib.getScheme("tibetan-wylie"), true);
  assert.equal(back.text, "སྒྲ་བླ་མ།\nབོད་ཆོས།", "標註鍵應往返還原 །");
});
test("長文本：羅馬 → 原生拒絕自動識別（否則會靜默轉成滿文）", () => {
  // 這條是本遷移最重要的回歸鎖：bod chos yid 同時是藏文 Wylie 與滿文
  // Möllendorff 的合法輸入，轉換率 3/3 平手，投票結果取決於註冊順序。
  const r = lib.transliterateText("bod chos yid.", "", true);
  assert.equal(r.ok, false, "必須明確失敗，不能猜");
  assert.equal(r.reason, "need-scheme");
});
test("長文本：羅馬 → 原生指定方案後可用且不再誤選滿文", () => {
  const r = lib.transliterateText("bod chos yid.", "tibetan-wylie", true);
  assert.ok(r.ok);
  assert.ok(r.text.includes("བོད"), `實際輸出：${r.text}`);
  assert.equal(/[᠀-᡿]/.test(r.text), false, "不該出現蒙古/滿文區段字形");
});
test("長文本：空文本 → no-text；超長 → too-long", () => {
  assert.equal(lib.transliterateText("", "tibetan-wylie", false).reason, "no-text");
  assert.equal(lib.transliterateText("   ", "tibetan-wylie", false).reason, "no-text");
  const long = "བོད།".repeat(lib.MAX_TRANSLIT_CHARS);
  assert.equal(lib.transliterateText(long, "tibetan-wylie", false).reason, "too-long");
});
test("長文本：中文段落沒有可匹配方案時原樣返回（不亂改字）", () => {
  const src = "如是我聞，一時佛在。";
  const r = lib.transliterateText(src, "", false);
  assert.ok(r.ok);
  assert.equal(r.text, src);
  assert.equal(r.stats, null);
});
test("長文本：萬字級輸入能在合理時間內完成（UI 主執行緒保護）", () => {
  const big = Array.from({ length: 1200 }, (_, i) => (i % 7 === 0 ? "。" : "བོད་ཆོས་ ")).join("");
  assert.ok(big.length > 5000, `樣本長度 ${big.length}`);
  const t0 = Date.now();
  const r = lib.transliterateText(big, "tibetan-wylie", false);
  const ms = Date.now() - t0;
  assert.ok(r.ok && r.stats && r.stats.converted > 0, "應有轉換");
  assert.ok(ms < 3000, `耗時 ${ms}ms 過長`);
});

test("B6：未知 schemeId fail-loud（不再靜默透傳假成功）", () => {
  const r = lib.transliterateText("ka", "no-such-scheme-id", true);
  assert.equal(r.ok, false, "未知 id 應 ok:false");
  assert.equal(r.reason, "unknown-scheme", "應帶 unknown-scheme 原因");
  assert.equal(r.text, "", "不得回傳原樣文本假裝成功");
  const r2 = lib.transliterateText("ka", "tibetan-wylie", true);
  assert.equal(r2.ok, true, "有效 id 不受影響");
});

console.log(`\n結果: ${passed} 通過, ${failures.length} 失敗`);
if (failures.length) {
  for (const f of failures) console.error(`FAIL: ${f.name}\n${f.e.stack ?? f.e.message}`);
  process.exit(1);
}
