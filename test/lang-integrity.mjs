// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry

/* 語言完整性測試（介面語言精簡為 7 語）
 * 保留：繁體中文 zh-TW / 簡體中文 zh / 日語 ja / 韓語 ko / 英語 en / 法語 fr / 德語 de
 * 門禁：
 *   1. LANGS 恰為 7 語，且已移除的 13 語（mn/bo/ug/es/it/pt/ru/nl/pl/sv/cs/hu/el）不得殘留
 *   2. 每一鍵均有 zh-TW（用戶要求的「遺漏繁體」修復的回歸門禁）
 *   3. 全部鍵（含 dict.* 命名空間）7 語完整，無「只填 zh/zh-TW/en 靠 en 回退」的條目
 *   4. zh-TW 值不含高頻簡體專用字
 *   5. ja 條目的日語漢字（縦）未被誤轉（縱/竪 不得出現在 ja 值）
 *   6. zh 條目保持簡體（直排 等簡體用字不得被繁化）
 *   7. langFromObsidian 別名：zh-Hant*→zh-TW、zh-Hans*→zh；未支援語言→en
 *   8. 所有 T() 引用鍵均存在於 DICT
 */
import assert from "node:assert";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "li-lang-"));
execFileSync(path.join(ROOT, "node_modules/.bin/esbuild"), [
  path.join(ROOT, "src/i18n.ts"), "--bundle", "--format=cjs", "--platform=node",
  `--outfile=${path.join(TMP, "i18n.cjs")}`,
  "--alias:obsidian=" + path.join(ROOT, "test/obsidian-mock-hardening.cjs"),
  "--log-level=silent",
]);
const require2 = createRequire(import.meta.url);
const mod = require2(path.join(TMP, "i18n.cjs"));
const { DICT, LANGS, langFromObsidian, t } = mod;

let passed = 0, failed = 0;
const test = (name, fn) => {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.error(`  ✗ ${name}\n    ${e.message}`); }
};

/* 高頻簡體專用字樣本（OpenCC s2t 會改變的字） */
const SIMPLIFIED_ONLY = "书体关击划则别办动区单发号后围国图块处复实宽对导尽层帧并应开归当录态户托护换无旧时显杂来构标栏样档横测渐滚满点状盘码确种竖简级纵纸组经继绪续维缩联范装规视让记设语误读转载进选错闭阅页项题";

/** 保留的 7 語 */
const KEEP = ["zh", "zh-TW", "ja", "ko", "en", "fr", "de"];
/** 已移除的 13 語 */
const REMOVED = ["mn", "bo", "ug", "es", "it", "pt", "ru", "nl", "pl", "sv", "cs", "hu", "el"];

console.log("=== 語言完整性測試（7 語：繁／簡／日／韓／英／法／德）===");

test("LANGS 恰為 7 語（繁簡日韓英法德）", () => {
  assert.deepEqual(LANGS.map((l) => l.code), ["zh", "zh-TW", "ja", "ko", "en", "fr", "de"]);
});

test("已移除的 13 語不得殘留於任何條目", () => {
  const bad = [];
  for (const [k, entry] of Object.entries(DICT)) {
    for (const lg of REMOVED) if (entry[lg]) bad.push(`${k}.${lg}`);
  }
  assert.equal(bad.length, 0, `殘留 ${bad.length}: ${bad.slice(0, 8).join(", ")}`);
});

test("條目不得含 7 語以外的語言碼", () => {
  const bad = [];
  for (const [k, entry] of Object.entries(DICT)) {
    for (const lg of Object.keys(entry)) if (!KEEP.includes(lg)) bad.push(`${k}.${lg}`);
  }
  assert.equal(bad.length, 0, `未知語言碼 ${bad.length}: ${bad.slice(0, 8).join(", ")}`);
});

test("回鶻 錯字防護：不得出現 回鹻（鶻/鹻 形近誤字）", () => {
  for (const [k, entry] of Object.entries(DICT)) {
    for (const [lg, v] of Object.entries(entry)) {
      assert.ok(!v.includes("回鹻"), `${k}.${lg} 含錯字 回鹻`);
    }
  }
});

/**
 * T() 引用完整性：原始碼中所有 T("...") 引用的鍵必須存在於 DICT。
 *
 * 為何需要此門禁：i18n.ts 由腳本機械插入鍵時，縮排異常（多 2 空格 / 頂格）
 * 或插入點誤判都可能造成鍵靜默消失。此時 UI 不會崩潰，而是直接顯示原始
 * key 名（如 "set.translit"），測試與型別檢查都無法捕獲——本項填補此盲區。
 */
test("所有 T() 引用鍵均存在於 DICT（防靜默缺鍵）", () => {
  const files = ["src/main.ts", "src/settings.ts", "src/translit-ui.ts", "src/view.ts"];
  const missing = [];
  for (const f of files) {
    const full = path.join(ROOT, f);
    if (!fs.existsSync(full)) continue;
    const text = fs.readFileSync(full, "utf8");
    for (const m of text.matchAll(/T\(\s*["']([^"']+)["']\s*\)/g)) {
      if (!DICT[m[1]]) missing.push(`${f}: ${m[1]}`);
    }
  }
  assert.equal(missing.length, 0, `缺失引用 ${missing.length} 項:\n    ${missing.join("\n    ")}`);
});

test("i18n.ts 鍵縮排規範化（不得有 4+ 空格或頂格鍵名）", () => {
  const src = fs.readFileSync(path.join(ROOT, "src/i18n.ts"), "utf8");
  const bad = [];
  for (const line of src.split("\n")) {
    // 合法的頂層鍵必須恰好縮排 2 空格
    if (/^\s{4,}"[A-Za-z][\w.]*":\s*\{$/.test(line)) bad.push(line.trim());
    if (/^"[A-Za-z][\w.]*":\s*\{$/.test(line)) bad.push(line.trim());
  }
  assert.equal(bad.length, 0, `縮排異常 ${bad.length} 行: ${bad.slice(0, 5).join(" | ")}`);
});

/**
 * 核心 UI（非 dict.*）必須 7 語完整 —— v2.5.0 起 dict.* 亦已全面本地化，
 * 故本項改為「全部鍵 7 語完整」，dict.* 不再豁免。
 */
test("全部鍵（含 dict.*）7 語完整無遺漏", () => {
  const gaps = [];
  for (const [k, entry] of Object.entries(DICT)) {
    for (const lg of KEEP) if (!entry[lg]) gaps.push(`${k}.${lg}`);
  }
  assert.equal(gaps.length, 0, `缺 ${gaps.length}: ${gaps.slice(0, 8).join(", ")}`);
});

test("dict.* 命名空間具備 zh / zh-TW / en（向後相容）", () => {
  const bad = [];
  for (const [k, entry] of Object.entries(DICT)) {
    if (!k.startsWith("dict.")) continue;
    for (const lg of ["zh", "zh-TW", "en"]) if (!entry[lg]) bad.push(`${k}.${lg}`);
  }
  assert.equal(bad.length, 0, `dict.* 缺 ${bad.length}: ${bad.slice(0, 8).join(", ")}`);
});

test("每一鍵均有 zh-TW（無遺漏）", () => {
  const missing = Object.keys(DICT).filter((k) => !DICT[k]["zh-TW"]);
  assert.equal(missing.length, 0, `缺 zh-TW: ${missing.slice(0, 10).join(", ")}`);
});

test("zh-TW 值不含簡體專用字", () => {
  const bad = [];
  for (const [k, entry] of Object.entries(DICT)) {
    const v = entry["zh-TW"] ?? "";
    for (const ch of SIMPLIFIED_ONLY) {
      if (v.includes(ch)) { bad.push(`${k}: '${ch}' in '${v.slice(0, 30)}'`); break; }
    }
  }
  assert.equal(bad.length, 0, bad.slice(0, 6).join(" | "));
});

test("ja 值的日語漢字未被誤轉（縦 保留、無 縱/竪）", () => {
  // notice.autoSwitchVertical 死鍵已隨 G2 清理刪除；改查 live 鍵之 ja 文案
  const tcy = DICT["dict.set.crossNavMain"];
  assert.ok(tcy && tcy.ja && tcy.ja.includes("縦"), `ja tcy='${tcy?.ja}'`);
  for (const [k, entry] of Object.entries(DICT)) {
    const v = entry.ja ?? "";
    assert.ok(!v.includes("縱"), `ja ${k} 誤含 縱`);
    assert.ok(!v.includes("竪"), `ja ${k} 誤含 竪`);
  }
});

test("zh 值保持簡體（直排 不被繁化）", () => {
  const hits = Object.entries(DICT).filter(([, e]) => (e.zh ?? "").includes("直排"));
  assert.ok(hits.length > 0, "zh 條目應仍含簡體「直排」（保護不被轉換）");
  for (const [k, entry] of Object.entries(DICT)) {
    const v = entry.zh ?? "";
    assert.ok(!v.includes("竪"), `zh ${k} 誤含繁體 竪`);
    assert.ok(!v.includes("縱"), `zh ${k} 誤含繁體 縱`);
  }
});

test("zh-TW 與 zh 用字對比：直排/縱 對應正確", () => {
  // notice.autoSwitchVertical 死鍵已隨 G2 清理刪除；改查 live 鍵
  const e = DICT["dict.set.crossNavMain"];
  assert.ok(e.zh.includes("直排"), `zh='${e.zh}'`);
  assert.ok(e["zh-TW"].includes("直排"), `zh-TW='${e["zh-TW"]}'`);
});

test("langFromObsidian：zh-Hant/zh-Hans/地區別名", () => {
  assert.equal(langFromObsidian("zh-TW"), "zh-TW");
  assert.equal(langFromObsidian("zh_TW"), "zh-TW");
  assert.equal(langFromObsidian("zh-HK"), "zh-TW");
  assert.equal(langFromObsidian("zh-Hant-TW"), "zh-TW");
  assert.equal(langFromObsidian("zh-Hant"), "zh-TW");
  assert.equal(langFromObsidian("zh-CN"), "zh");
  assert.equal(langFromObsidian("zh-Hans"), "zh");
  assert.equal(langFromObsidian("zh-SG"), "zh");
  assert.equal(langFromObsidian("ja-JP"), "ja");
  assert.equal(langFromObsidian("ko-KR"), "ko");
  assert.equal(langFromObsidian("fr-FR"), "fr");
  assert.equal(langFromObsidian("de-DE"), "de");
});

test("langFromObsidian：未支援語言一律回退 en（含已移除的 bo/ug/mn/es）", () => {
  for (const loc of ["es", "es-ES", "bo", "bo-CN", "ug", "ug-CN", "mn", "it", "pt-BR", "ru", "nl", "pl", "sv", "cs", "hu", "el", ""]) {
    assert.equal(langFromObsidian(loc), "en", `langFromObsidian('${loc}') 應回退 en`);
  }
});

test("t() 回退鏈：zh-TW → en → key", () => {
  assert.equal(t("zh-TW", "__no_such_key__"), "__no_such_key__");
  assert.equal(typeof t("zh-TW", "common.operationFailed"), "string");
  assert.ok(t("zh-TW", "common.operationFailed").includes("操作失敗"));
  // 未在地化的語言應回退到 en 而非裸 key（v2.5.0 起 dict.* 已全語在地化）
  // 品牌名「lilium Dict」七語不翻譯（定案，原「li Dict」）→ 另用 dict.set.folders 驗在地化
  assert.notEqual(t("de", "dict.set.folders"), "dict.set.folders");
  assert.ok(t("de", "dict.set.folders").includes("Wörterbuch"), `de='${t("de", "dict.set.folders")}'`);
  assert.ok(t("ja", "dict.set.folders").includes("辞書"), `ja='${t("ja", "dict.set.folders")}'`);
  assert.ok(t("ko", "dict.set.folders").includes("사전"), `ko='${t("ko", "dict.set.folders")}'`);
  assert.ok(t("fr", "dict.set.folders").toLowerCase().includes("dictionnaire"), `fr='${t("fr", "dict.set.folders")}'`);
  // dict.panel.title 死鍵已隨 G2 清理刪除；品牌名不翻譯改由 kharoshthi 專名同形驗證
  assert.equal(t("fr", "set.translitGroup.kharoshthi"), t("en", "set.translitGroup.kharoshthi"));
  assert.equal(t("de", "set.translitGroup.kharoshthi"), t("en", "set.translitGroup.kharoshthi"));
});

/**
 * 防止「整批複製 en 充數」：dict.* 的 ja/ko/fr/de 至少 90% 與 en 不同
 * （MDict / LogDice / MI 等專有名詞本就同形，故留 10% 容差）。
 */
test("dict.* 的 ja/ko/fr/de 非 en 複製貼上（>90% 相異）", () => {
  const dict = Object.entries(DICT).filter(([k]) => k.startsWith("dict."));
  for (const lg of ["ja", "ko", "fr", "de"]) {
    const same = dict.filter(([, e]) => e[lg] === e.en).length;
    const ratio = 1 - same / dict.length;
    assert.ok(ratio > 0.9, `${lg}: 僅 ${(ratio * 100).toFixed(1)}% 與 en 不同（${same}/${dict.length} 相同）`);
  }
});

console.log(`\n結果: ${passed} 通過, ${failed} 失敗`);
if (failed) process.exit(1);
