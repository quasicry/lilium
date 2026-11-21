// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry

/* 右側欄折疊檢字表（F 區塊）單元測試。
 *
 * 覆蓋 src/translit-ui.ts 的三個共用件：
 *   - translitGroupLabel：文種分組標籤（有翻譯用翻譯，缺則回退分組鍵）
 *   - schemeLabel：方案顯示名（逐級回退到 id）
 *   - fillSchemeSelect：方案下拉（<optgroup> 分組 + 默認預選）
 *   - renderCharTableInto：檢字表渲染（表頭 3 欄 + section 分組行 + 資料行）
 * 以及 SCRIPT_TO_TRANSLIT_GROUP（文稿文種 → 方案分組）的完整性與契約。
 *
 * 為何單獨測：view.ts 的 buildSideCharTable / syncSideCharTable 依賴 Obsidian
 * ItemView，無法在 Node 側直接實例化；把它們的「純邏輯」抽到 translit-ui.ts
 * 後即可在此回歸，避免日後改 UI 時悄悄破壞預選行為。
 *
 * 用法：node test/side-char-table.mjs
 */
import assert from "node:assert";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "li-ct-"));
execFileSync(path.join(ROOT, "node_modules", ".bin", "esbuild"), [
  path.join(ROOT, "test", "lib-export.ts"), "--bundle", "--format=esm",
  `--outfile=${path.join(TMP, "lib.mjs")}`, "--log-level=silent",
]);
const lib = await import(path.join(TMP, "lib.mjs"));
const {
  listSchemes, getScheme,
  translitGroupLabel, schemeLabel, fillSchemeSelect, renderCharTableInto,
  groupFontStack,
  SCRIPT_PREFERRED_SCHEME,
} = lib;

let passed = 0, failed = 0;
const test = (name, fn) => {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.error(`  ✗ ${name}\n    ${e.message}`); }
};

/* ---------- 最小 DOM（模擬 Obsidian 的 HTMLElement 擴充） ---------- */
function makeEl(tag) {
  const el = {
    tagName: tag,
    className: "",
    textContent: "",
    value: "",
    open: false,
    attrs: {},
    // A 案的檢字表會寫 CSS 變數（--li-ct-font），故 mock 要支援 inline style。
    // 值記在一旁的 cssVars 方便斷言，style 本身也保留 setProperty/getPropertyValue
    // 行為，日後產品碼若改用 getPropertyValue 讀回也一樣能跑。
    cssVars: {},
    style: {
      setProperty: (k, v) => { el.cssVars[k] = String(v); },
      getPropertyValue: (k) => el.cssVars[k] ?? "",
      removeProperty: (k) => { delete el.cssVars[k]; },
    },
    children: [],
    listeners: {},
  };
  const norm = (o) => (typeof o === "string" ? { cls: o } : o || {});
  el.createEl = (t, o) => {
    const info = norm(o);
    const child = makeEl(t);
    if (info.cls) child.className = info.cls;
    if (info.text !== undefined) child.textContent = info.text;
    if (info.attr) Object.assign(child.attrs, info.attr);
    el.children.push(child);
    return child;
  };
  el.createDiv = (o) => el.createEl("div", o);
  el.createSpan = (o) => el.createEl("span", o);
  el.setText = (s) => { el.textContent = s; el.children.length = 0; return el; };
  el.empty = () => { el.children.length = 0; return el; };
  el.appendChild = (c) => { el.children.push(c); return c; };
  el.setAttribute = (k, v) => { el.attrs[k] = v; };
  el.getAttribute = (k) => el.attrs[k] ?? null;
  el.addClass = (c) => { el.className = (el.className + " " + c).trim(); };
  el.removeClass = (c) => { el.className = el.className.split(/\s+/).filter((x) => x && x !== c).join(" "); };
  el.hasClass = (c) => el.className.split(/\s+/).includes(c);
  el.addEventListener = (type, fn) => { (el.listeners[type] ||= []).push(fn); };
  el.dispatch = (type) => { for (const fn of el.listeners[type] || []) fn(); };
  /** 深度收集符合條件的後代（測試斷言用） */
  el.descendants = () => el.children.flatMap((c) => [c, ...c.descendants()]);
  return el;
}

const T = (k) => ({ "set.translitNative": "原文", "set.translitRoman": "羅馬字", "set.translitNote": "備註", "set.translitOther": "其他", "set.translitAlt": "備選", "set.translitTableEmpty": "此方案暫無檢字表" }[k] ?? k);

console.log("\n右側欄折疊檢字表：");

/* ---------- 1. 分組標籤 / 方案名 ---------- */

test("translitGroupLabel：已本地化分組取翻譯，未本地化回退鍵名", () => {
  assert.strictEqual(translitGroupLabel(() => "藏文", "tibetan"), "藏文");
  assert.strictEqual(translitGroupLabel(T, "nonexistent-group"), "nonexistent-group");
});

test("schemeLabel：優先用指定語系，缺失逐級回退到 id", () => {
  const s = getScheme("tibetan-wylie");
  assert.ok(s, "tibetan-wylie 應已註冊");
  assert.strictEqual(schemeLabel(s), s.label.zh || s.label["zh-TW"] || s.label.en || s.id);
  assert.strictEqual(schemeLabel({ id: "x", label: {}, group: "g", primary: true }), "x");
});

/* ---------- 2. 方案下拉 ---------- */

test("fillSchemeSelect：optgroup 數 = 分組數，option 數 = 方案數", () => {
  const sel = makeEl("select");
  const all = listSchemes();
  const groups = new Set(all.map((s) => s.group));
  fillSchemeSelect(sel, all, T, null);
  const ogs = sel.children.filter((c) => c.tagName === "optgroup");
  const opts = sel.descendants().filter((c) => c.tagName === "option");
  assert.strictEqual(ogs.length, groups.size, `optgroup 應為 ${groups.size}`);
  assert.strictEqual(opts.length, all.length, `option 應為 ${all.length}`);
});

test("fillSchemeSelect：無 preferredId 時回退到註冊序第一個主方案，且該方案確為主方案", () => {
  const sel = makeEl("select");
  const picked = fillSchemeSelect(sel, listSchemes(), T, null);
  const scheme = getScheme(sel.value);
  assert.strictEqual(picked, sel.value);
  assert.ok(scheme?.primary, "預選應為主方案");
  assert.strictEqual(picked, listSchemes().find((s) => s.primary).id);
});

test("fillSchemeSelect：preferredId 有效則採用，無效則回退（防髒數據寫爆下拉）", () => {
  const a = makeEl("select");
  assert.strictEqual(fillSchemeSelect(a, listSchemes(), T, "sanskrit-iast"), "sanskrit-iast");
  assert.strictEqual(a.value, "sanskrit-iast");
  const b = makeEl("select");
  const firstPrimary = listSchemes().find((s) => s.primary).id;
  assert.strictEqual(fillSchemeSelect(b, listSchemes(), T, "no-such-scheme"), firstPrimary);
});

/* ---------- 3. 檢字表渲染 ---------- */

test("renderCharTableInto：表頭 3 欄，資料行數 = 條目數 + 分組數", () => {
  const host = makeEl("div");
  const scheme = getScheme("tibetan-wylie");
  renderCharTableInto(host, scheme, T);
  const table = host.children.find((c) => c.tagName === "table");
  assert.ok(table, "應渲染出 table");
  assert.strictEqual(table.className, "li-char-table");
  const ths = table.descendants().filter((c) => c.tagName === "th");
  assert.strictEqual(ths.length, 3, "表頭應為 原文/羅馬字/備註 3 欄");
  const sections = new Set(scheme.charTable.map((r) => r.section || T("set.translitOther")));
  const bodyRows = table.children.find((c) => c.tagName === "tbody").children;
  assert.strictEqual(bodyRows.length, scheme.charTable.length + sections.size);
  const dataRows = bodyRows.filter((r) => !r.className.includes("li-char-table-section"));
  for (const r of dataRows) assert.strictEqual(r.children.length, 3, "每列 3 個 td");
});

test("renderCharTableInto：把文種字體棧寫進 --li-ct-font（A 案：第 1 列不顯示豆腐塊）", () => {
  // 這是 v2.7.0 A 案的落點：字體資料本來就在 plugins 裡，缺的只是 CSS 引用。
  // 每個方案分組都必須寫得出字體棧，漏寫就還是豆腐塊。
  for (const s of listSchemes()) {
    const host = makeEl("div");
    renderCharTableInto(host, s, T);
    const table = host.children.find((c) => c.tagName === "table");
    if (!table) continue; // 無檢字表的方案走空態
    const vars = table.cssVars["--li-ct-font"];
    assert.ok(vars && vars.length > 0, `${s.id} 的表格應設定 --li-ct-font，實際=${JSON.stringify(vars)}`);
    // 值已在 groupFontStack 裡處理妥：含空格的族名加引號、泛用族不加
    const G = groupFontStack(s.group);
    assert.strictEqual(vars, G, `${s.id} 的字體棧應與 groupFontStack() 一致（不許各自硬寫一份）`);
  }
});

test("renderCharTableInto：無檢字表時退化為空態提示（不拋錯、不渲染 table）", () => {
  const host = makeEl("div");
  renderCharTableInto(host, { id: "empty-scheme", label: {}, group: "g", primary: true }, T);
  assert.strictEqual(host.children.length, 1);
  assert.strictEqual(host.children[0].className, "li-char-table-empty");
  assert.strictEqual(host.children[0].textContent, "此方案暫無檢字表");
});

test("18 個方案全部可渲染（無一拋錯，且非空方案皆產出表格）", () => {
  let withTable = 0, empty = 0;
  for (const s of listSchemes()) {
    const host = makeEl("div");
    renderCharTableInto(host, s, T);
    const hasTable = host.children.some((c) => c.tagName === "table");
    if (hasTable) withTable++; else empty++;
  }
  assert.strictEqual(withTable + empty, listSchemes().length);
  assert.ok(withTable >= 16, `應有 ≥16 個方案帶檢字表，實得 ${withTable}`);
});

/* ---------- 4. 文稿文種 → 預選方案 映射 ---------- */

test("SCRIPT_PREFERRED_SCHEME：指向的方案 id 全部已註冊（防拼寫錯誤導致預選失效）", () => {
  for (const [script, id] of Object.entries(SCRIPT_PREFERRED_SCHEME)) {
    assert.ok(getScheme(id), `文種 ${script} 指向未註冊的方案 ${id}`);
  }
});

test("預選契約：藏文→Wylie、梵文→IAST、維吾爾→ULY、滿文→Möllendorff", () => {
  assert.strictEqual(SCRIPT_PREFERRED_SCHEME.tibetan, "tibetan-wylie");
  assert.strictEqual(SCRIPT_PREFERRED_SCHEME.sanskrit, "sanskrit-iast");
  assert.strictEqual(SCRIPT_PREFERRED_SCHEME.pali, "pali-iast");
  assert.strictEqual(SCRIPT_PREFERRED_SCHEME.uyghur, "uyghur-uly");
  // 回鶻文（U+10F70–U+10FAF）自有獨立方案，不再借現代維吾爾方案
  assert.strictEqual(SCRIPT_PREFERRED_SCHEME.olduyghur, "olduyghur");
  assert.strictEqual(SCRIPT_PREFERRED_SCHEME.manchu, "manchu-mollendorff");
  assert.strictEqual(SCRIPT_PREFERRED_SCHEME.xibe, "manchu-mollendorff");
  assert.strictEqual(SCRIPT_PREFERRED_SCHEME.mongolian, "mongolian");
  assert.strictEqual(SCRIPT_PREFERRED_SCHEME.han, undefined, "漢文無轉寫方案，不應列入映射");
});

test("文種覆蓋：除 aligali 外，每個方案分組皆有文種可預選（無漏網分組）", () => {
  // Ali Gali 無獨立 ScriptId（梵咒於藏 / 蒙文本中混寫），只能由用戶手選
  const EXEMPT = new Set(["aligali"]);
  const reachable = new Set(
    Object.values(SCRIPT_PREFERRED_SCHEME).map((id) => getScheme(id).group)
  );
  const groups = new Set(listSchemes().map((s) => s.group));
  const unreachable = [...groups].filter((g) => !reachable.has(g) && !EXEMPT.has(g));
  assert.deepStrictEqual(unreachable, [], `無文種可預選的分組：${unreachable.join(", ")}`);
});

fs.rmSync(TMP, { recursive: true, force: true });
console.log(`\n結果: ${passed} 通過, ${failed} 失敗\n`);
process.exit(failed ? 1 : 0);
