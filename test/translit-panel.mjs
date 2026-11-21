// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry

/* 轉寫頁籤（W9-B）渲染冒煙測試 —— 對等重建。
 *
 * 為什麼需要這一層：面板的 UI 程式碼只要有 TypeScript 型別通過就能進建置，
 * 但實際渲染時才會暴露的坑（例如事件接線、狀態同步）不會被型別檢查攔到。
 *
 * 沿革（重要，別刪）：本檔原本寄生在 test/collation-translit.mjs 裡——那支腳本
 * 同時測「校勘面板」與「轉寫頁籤」，只因兩者共用同一套方案註冊副作用。
 * 剝離校勘時它隨校勘凍結進附錄，轉寫頁籤的**動態渲染覆蓋因而歸零**
 * （只剩 run.mjs 的靜態斷言）。本檔即該覆蓋的對等重建：原第 3 節（轉寫頁籤）
 * 全數搬來，並補上原本從未測過的「長文本字數上限」與「即時字數計數」。
 *
 * 驗證範圍：
 *   1. 面板能建構完成且不拋錯（一體化工作區 / 連聲區 / 源文本框）
 *   2. 原生 → 羅馬：自動識別並產出結果、套用字體棧
 *   3. 羅馬 → 原生：不指定方案時明確擋下（不靜默轉成別的文種）
 *   4. 連聲合成與查詞按鈕
 *   5. 導出 MD 勾選面板：原文與轉寫輸出可分可合（預設全選）
 *   6. 字數上限以**碼點**計（SMP 文種不再腰斬）、門檻 100,000
 *   7. 輸入框即時字數計數與超限提示（不必等到按下才知道被擋）
 *
 * 用法：node test/translit-panel.mjs
 */
import assert from "node:assert";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BUILD = path.join(ROOT, "test", "build");
fs.mkdirSync(BUILD, { recursive: true });

console.log("[translit-panel] bundling test/lib-translit.ts …");
const outfile = path.join(BUILD, "translit-panel.mjs");
execFileSync(path.join(ROOT, "node_modules", ".bin", "esbuild"), [
  path.join(ROOT, "test", "lib-translit.ts"),
  "--bundle", "--format=esm", "--platform=node",
  `--alias:obsidian=${path.join(ROOT, "test", "obsidian-dict-mock.cjs")}`,
  `--outfile=${outfile}`,
], { stdio: "pipe" });

const lib = await import(outfile + "?v=" + Date.now());

let passed = 0;
const failures = [];
const test = async (name, fn) => {
  try { await fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failures.push({ name, e }); console.error(`  ✗ ${name}\n    ${e.message}`); }
};

/* ---------- 最小 DOM ---------- */
function makeEl(tag) {
  const el = {
    tagName: tag, className: "", textContent: "", value: "", open: false,
    attrs: {}, cssVars: {}, children: [], listeners: {},
  };
  el.style = {
    setProperty: (k, v) => { el.cssVars[k] = String(v); },
    getPropertyValue: (k) => el.cssVars[k] ?? "",
    removeProperty: (k) => { delete el.cssVars[k]; },
  };
  const norm = (o) => (typeof o === "string" ? { cls: o } : o || {});
  // Obsidian 的 createEl 除了 cls / text / attr，還認若干頂層鍵
  // （value / type / placeholder / rows / href / title…）。逐個補進 mock，
  // 同時鏡像進 attrs，方便斷言時用 `.attrs.value` 取值。
  const DIRECT_PROPS = ["value", "type", "placeholder", "rows", "href", "title", "checked", "open"];
  el.createEl = (t, o) => {
    const info = norm(o);
    const child = makeEl(t);
    if (info.cls) child.className = info.cls;
    if (info.text !== undefined) child.textContent = info.text;
    for (const k of DIRECT_PROPS) {
      if (info[k] !== undefined) { child[k] = info[k]; child.attrs[k] = String(info[k]); }
    }
    if (info.attr) Object.assign(child.attrs, info.attr);
    el.children.push(child);
    return child;
  };
  el.createDiv = (o) => el.createEl("div", o);
  el.createSpan = (o) => el.createEl("span", o);
  el.setText = (s) => { el.textContent = s; el.children.length = 0; return el; };
  // Obsidian appendText：附加純文字，保留既有子節點（paintOut 用 pre.appendText 逐段寫入）
  el.appendText = (s) => { el.textContent += s; return el; };
  el.empty = () => { el.children.length = 0; return el; };
  el.appendChild = (c) => { el.children.push(c); return c; };
  el.setAttribute = (k, v) => { el.attrs[k] = v; };
  el.getAttribute = (k) => el.attrs[k] ?? null;
  el.removeAttribute = (k) => { delete el.attrs[k]; };
  el.addClass = (c) => { el.className = (el.className + " " + c).trim(); };
  el.removeClass = (c) => { el.className = el.className.split(/\s+/).filter((x) => x && x !== c).join(" "); };
  el.toggleClass = (c, on) => (on ? el.addClass(c) : el.removeClass(c));
  el.hasClass = (c) => el.className.split(/\s+/).includes(c);
  el.addEventListener = (type, fn) => { (el.listeners[type] ||= []).push(fn); };
  /** 觸發事件（同步執行所有監聽器，測試用） */
  el.fire = (type) => { for (const fn of el.listeners[type] || []) fn(); return el; };
  el.querySelectorAll = (sel) => {
    // 支援 `.class` 與 `tag` 兩種選擇器（產品碼只用這兩種）
    if (sel.startsWith(".")) {
      const want = sel.slice(1);
      return all(el).filter((c) => c.className.split(/\s+/).includes(want));
    }
    return all(el).filter((c) => c.tagName === sel);
  };
  el.querySelector = (sel) => el.querySelectorAll(sel)[0] ?? null;
  const all = (n) => n.children.flatMap((c) => [c, ...all(c)]);
  el.descendants = () => all(el);
  return el;
}

/* ---------- DictFeature mock ---------- */
function makePlugin() {
  const created = [];
  const contents = [];
  return {
    app: { vault: { getMarkdownFiles: () => [], create: async (p, c) => { created.push(p); contents.push(String(c ?? "")); return p; } } },
    settings: { buddhistMode: false },
    uiLang: () => "zh-TW",
    ensureFolder: async () => {},
    lookupInView: async () => {},
    _created: created,
    _contents: contents,
    T: (k, vars) => {
      let s = ({
        "dict.tab.translit": "轉寫",
        "dict.collation.translit": "長文本轉寫",
        "dict.collation.translitToNative": "羅馬字 → 原生文字",
        "dict.collation.translitToRoman": "原生文字 → 羅馬字",
        "dict.collation.translitAuto": "— 自動識別 —",
        "dict.collation.translitScheme": "方案",
        "dict.collation.translitDir": "方向",
        "dict.collation.translitRun": "轉寫全文",
        "dict.collation.translitCopy": "複製",
        "dict.collation.translitNone": "當前沒有已註冊的轉寫方案",
        "dict.collation.translitEmpty": "沒有轉出任何詞",
        "dict.collation.translitNeedScheme": "請手動指定方案",
        "dict.collation.translitNeedText": "請先貼上要轉寫的文本",
        "dict.collation.translitCopied": "已複製",
        "dict.collation.translitStats": "詞 {w} ｜ 轉 {c} ｜ 跳 {s} ｜ {ms}ms",
        "dict.collation.translitTooLong": "文本超過 {n} 字上限",
        "dict.collation.sandhi": "連聲合成",
        "dict.collation.sandhiHint": "輸入兩個詞，即時合成。",
        "dict.collation.sandhiFirst": "前詞",
        "dict.collation.sandhiSecond": "後詞",
        "dict.collation.sandhiJoin": "合成",
        "dict.collation.sandhiLookup": "查詞",
        "dict.translit.export": "導出 MD",
        "dict.translit.export.includeSrc": "原文（粘貼框）",
        "dict.translit.export.includeOut": "轉寫輸出",
        "dict.translit.export.confirm": "確認匯出",
        "dict.translit.export.cancel": "取消",
        "dict.translit.export.empty": "沒有可匯出的內容",
        "dict.translit.export.pick": "請至少勾選一項",
        "dict.translit.export.secSrc": "原文",
        "dict.translit.export.secOut": "轉寫輸出",
        "dict.translit.saved": "已存 {file}",
      })[k] ?? k;
      if (vars) for (const [a, b] of Object.entries(vars)) s = s.split(`{${a}}`).join(String(b));
      return s;
    },
  };
}

/** 渲染一次轉寫頁籤；可選帶入源文本（寫入 textarea 並觸發 input 同步到狀態）。 */
function renderOnce(srcText) {
  const body = makeEl("div");
  const plugin = makePlugin();
  const view = makeEl("div");
  lib.renderTranslitPanel(body, view, plugin);
  if (srcText !== undefined) {
    const ta = body.querySelectorAll("textarea")[0];
    ta.value = srcText;
    ta.fire("input");
  }
  return { body, plugin };
}

/** 取工作區（.li-col-translit）裡的「轉寫全文」按鈕 */
function goButton(work) {
  return work.querySelectorAll("button").find((b) => b.textContent === "轉寫全文");
}

/* ================================================================== */
console.log("\n=== 1. 面板建構（一體化工作區，不再折疊） ===");

await test("renderTranslitPanel：空狀態不拋錯，工作區 + 連聲區 + 源文本框就位", () => {
  const { body } = renderOnce();
  const work = body.querySelectorAll(".li-col-translit")[0];
  assert.ok(work, "應有一體化轉寫工作區");
  assert.equal(work.tagName, "div", "工作區應為平鋪 div（v2.8.30 去折疊）");
  assert.equal(work.querySelectorAll("summary").length, 0, "工作區內不應再有折疊 summary");
  const sandhi = body.querySelectorAll(".li-col-sandhi")[0];
  assert.ok(sandhi, "應有連聲合成區");
  assert.equal(sandhi.tagName, "details", "連聲（輔助工具）維持折疊");
  assert.ok(body.querySelectorAll("textarea").length >= 1, "應有自有源文本框");
  const opts = work.querySelectorAll("option").filter((o) => o.attrs.value);
  assert.ok(opts.length >= 10, `方案下拉應填滿，實得 ${opts.length} 個`);
  assert.ok(work.querySelectorAll("optgroup").length >= 8, "應按分組用 optgroup 收攏");
});

console.log("\n=== 2. 轉寫全文：原生 → 羅馬 ===");

await test("原生 → 羅馬：自動識別藏文 Wylie 並產出結果", () => {
  const { body } = renderOnce("བོད་ཆོས་ཡིད།");
  const work = body.querySelectorAll(".li-col-translit")[0];
  const dirSel = work.querySelectorAll("select").find((s) => s.children.some((o) => o.attrs.value === "roman"));
  assert.ok(dirSel, "應有方向下拉");
  dirSel.value = "roman";
  dirSel.fire("change");
  goButton(work).fire("click");
  const st = lib.getTranslitState();
  assert.ok(st.out, "應產出轉寫結果");
  assert.ok(st.out.includes("bod"), `輸出應含 bod，實際：${st.out}`);
  assert.equal(st.usedSchemeId, "tibetan-wylie", "自動識別應選到藏文 Wylie");
  assert.equal(st.toNative, false, "方向應為原生 → 羅馬");
});

console.log("\n=== 3. 轉寫全文：羅馬 → 原生（不得靜默猜錯文種） ===");

await test("羅馬 → 原生：切方向自動補上具體方案（不停在「自動識別」）", () => {
  const { body } = renderOnce("bod chos yid.");
  const work = body.querySelectorAll(".li-col-translit")[0];
  const dirSel = work.querySelectorAll("select").find((s) => s.children.some((o) => o.attrs.value === "native"));
  dirSel.value = "native";
  dirSel.fire("change");
  assert.ok(lib.getTranslitState().schemeId, "切到羅馬→原生應自動補上一個具體方案");
});

await test("羅馬 → 原生：指定藏文後轉出藏文，不混進蒙古/滿文字形", () => {
  const { body } = renderOnce("bod chos yid.");
  const work = body.querySelectorAll(".li-col-translit")[0];
  const dirSel = work.querySelectorAll("select").find((s) => s.children.some((o) => o.attrs.value === "native"));
  dirSel.value = "native";
  dirSel.fire("change");
  // 注意：方案下拉的 option 掛在 <optgroup> 底下，不能只看 select.children
  const schemeSel = work.querySelectorAll("select")
    .find((s) => s.descendants().some((o) => o.attrs.value === "tibetan-wylie"));
  assert.ok(schemeSel, "應有方案下拉（option 掛在 optgroup 底下）");
  schemeSel.value = "tibetan-wylie";
  schemeSel.fire("change");
  goButton(work).fire("click");
  const st = lib.getTranslitState();
  assert.ok(st.out, "應產出結果");
  assert.ok(st.out.includes("བོད"), `輸出應含藏文字形，實際：${st.out}`);
  assert.equal(/[᠀-᡿]/.test(st.out), false, "不該混進蒙古/滿文字形");
});

await test("translit-run：羅馬 → 原生不指定方案直接呼叫會回 need-scheme", () => {
  const r = lib.transliterateText("bod chos yid.", "", true);
  assert.equal(r.ok, false);
  assert.equal(r.reason, "need-scheme", "方向有歧義時必須明確失敗，不能猜");
});

console.log("\n=== 4. 連聲合成 ===");

await test("連聲兩詞產出結果並附查詞按鈕", () => {
  const { body } = renderOnce();
  const box = body.querySelectorAll(".li-col-sandhi")[0];
  const inputs = box.querySelectorAll("input");
  const inA = inputs[0], inB = inputs[1];
  inA.value = "rāmaḥ"; inA.fire("input");
  inB.value = "asti"; inB.fire("input");
  const res = box.querySelectorAll(".li-col-sandhi-result")[0];
  assert.ok(res, "應產出連聲結果");
  assert.ok(res.textContent.includes("→"), "結果應為 A + B → joined 形式");
  assert.ok(box.querySelectorAll("button").find((b) => b.textContent === "查詞"), "應有查詞按鈕");
});

console.log("\n=== 5. 導出 MD 勾選面板（原文 / 輸出可分可合） ===");

await test("導出：預設全勾，原文與輸出一起進同一份 md", async () => {
  const { body, plugin } = renderOnce("བོད་ཆོས་ཡིད།");
  const work = body.querySelectorAll(".li-col-translit")[0];
  const dirSel = work.querySelectorAll("select").find((s) => s.children.some((o) => o.attrs.value === "roman"));
  dirSel.value = "roman";
  dirSel.fire("change");
  goButton(work).fire("click");
  const exportBtn = body.querySelectorAll("button").find((b) => b.textContent.includes("導出") || b.textContent.includes("导出"));
  assert.ok(exportBtn, "應有「導出 MD」按鈕");
  const before = plugin._created.length;
  exportBtn.fire("click");
  const exp = body.querySelectorAll(".li-translit-export")[0];
  assert.ok(exp, "應有匯出勾選面板");
  assert.notEqual(exp.style.display, "none", "點擊後應展開勾選面板");
  const checks = exp.querySelectorAll("input");
  assert.equal(checks.length, 2, "應有「原文 / 轉寫輸出」兩個勾選");
  assert.ok(checks.every((c) => c.checked), "能匯的內容應預設全勾（一起匯出）");
  exp.querySelectorAll("button").find((b) => b.textContent === "確認匯出").fire("click");
  // exportMarkdownToVault 為非同步（ensureFolder → vault.create），等兩個 tick 讓寫入落地
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
  assert.ok(plugin._created.length > before, "應寫入 li-Shares 一個 md 檔");
  const name = plugin._created[plugin._created.length - 1];
  assert.ok(/轉寫-[\d-]+\.md$/.test(name), `檔名應為 轉寫-<ts>.md，實際 ${name}`);
  const md = plugin._contents[plugin._contents.length - 1];
  assert.ok(md.includes("## 原文"), "勾選原文時應含原文段");
  assert.ok(md.includes("བོད་ཆོས་ཡིད"), "原文段應包含粘貼框文字");
  assert.ok(md.includes("## 轉寫輸出"), "勾選輸出時應含轉寫輸出段");
  assert.ok(md.includes("bod"), "轉寫輸出段應含羅馬轉寫");
  assert.ok(exp.hasClass("li-u-hidden"), "匯出後面板應收起");
});

await test("導出：無輸出時輸出項停用，僅原文也可匯出", async () => {
  const st = lib.getTranslitState();
  st.src = ''; st.out = '';
  const { body, plugin } = renderOnce("如是我聞");
  const exportBtn = body.querySelectorAll("button").find((b) => b.textContent.includes("導出") || b.textContent.includes("导出"));
  const before = plugin._created.length;
  exportBtn.fire("click");
  const exp = body.querySelectorAll(".li-translit-export")[0];
  const checks = exp.querySelectorAll("input");
  assert.ok(checks[0].checked && !checks[0].disabled, "原文可勾且預設已勾");
  assert.ok(checks[1].disabled, "無輸出時輸出項應停用");
  exp.querySelectorAll("button").find((b) => b.textContent === "確認匯出").fire("click");
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
  assert.ok(plugin._created.length > before, "僅原文也應能匯出");
  const md = plugin._contents[plugin._contents.length - 1];
  assert.ok(md.includes("如是我聞"), "應含原文");
  assert.ok(!md.includes("## 轉寫輸出"), "不應含未勾選的輸出段");
});

await test("導出：兩者皆空時僅提示，不展開也不建檔", () => {
  const st = lib.getTranslitState();
  st.src = ''; st.out = '';
  const { body, plugin } = renderOnce();
  const exportBtn = body.querySelectorAll("button").find((b) => b.textContent.includes("導出") || b.textContent.includes("导出"));
  const before = plugin._created.length;
  exportBtn.fire("click");
  const exp = body.querySelectorAll(".li-translit-export")[0];
  assert.ok(exp.hasClass("li-u-hidden"), "無內容時面板不展開");
  assert.equal(plugin._created.length, before, "不應建檔");
});

/* ================================================================== */
console.log("\n=== 6.長文本字數上限（碼點計量，門檻 100,000） ===");

const MAX = lib.MAX_TRANSLIT_CHARS;

await test(`上限值為 ${100000}（並有合理下限，不得被誤調回萬字級）`, () => {
  assert.equal(MAX, 100000, `MAX_TRANSLIT_CHARS 應為 100000，實為 ${MAX}`);
  assert.ok(MAX >= 50000, "上限不得低於 50,000（否則回到萬字級的保守門檻）");
});

/** 造一段正好 n 碼點的藏文樣本（末字不落在空白上，避免 trim 吃掉配額） */
const mkTibetan = (n) => "བོད་ཆོས་".repeat(Math.ceil(n / 8) + 1).slice(0, n);

await test("邊界：正好上限可轉，上限 +1 碼點即擋下 too-long", () => {
  const at = mkTibetan(MAX);
  assert.equal(lib.countTranslitChars(at), MAX, `樣本應正好 ${MAX} 碼點`);
  assert.ok(lib.transliterateText(at, "tibetan-wylie", false).ok, "正好上限應可轉");
  const over = at + "བ";
  assert.equal(lib.countTranslitChars(over), MAX + 1);
  const r = lib.transliterateText(over, "tibetan-wylie", false);
  assert.equal(r.ok, false);
  assert.equal(r.reason, "too-long", "超過上限必須擋下（保護 UI 主執行緒）");
});

await test("碼點計量：悉曇（SMP，一字兩碼元）不再被腰斬一半配額", () => {
  // 悉曇 U+11580–U+115FF 落在補充平面：一個碼點 = 兩個 UTF-16 碼元。
  // 舊制以 src.length（碼元）計量，這裡的 MAX 個碼點 = 2×MAX 碼元，會被誤判 too-long。
  const ch = "𑖒𑖺"; // 2 個碼點 / 4 個碼元
  assert.equal(ch.length, 4, "前置條件：一字兩碼元");
  assert.equal(lib.countTranslitChars(ch), 2, "碼點計量應得 2");
  const siddham = ch.repeat(MAX / 2);
  assert.equal(lib.countTranslitChars(siddham), MAX, `樣本應正好 ${MAX} 碼點`);
  assert.equal(siddham.length, MAX * 2, `但碼元數是 ${MAX * 2}（舊制會在此誤擋）`);
  const r = lib.transliterateText(siddham, "", false);
  assert.notEqual(r.reason, "too-long", "SMP 文種應拿到與 BMP 文種相同的字數配額");
});

await test("上限量級輸入能在 UI 主執行緒可容忍的時間內完成", () => {
  const big = mkTibetan(MAX);
  assert.equal(lib.countTranslitChars(big), MAX);
  const t0 = Date.now();
  const r = lib.transliterateText(big, "tibetan-wylie", false);
  const ms = Date.now() - t0;
  assert.ok(r.ok && r.stats && r.stats.converted > 0, "應有實際轉換");
  // 實測最慢路徑約 220ms（桌機）；給行動端留約 9 倍餘裕
  assert.ok(ms < 2000, `滿載 ${MAX} 字耗時 ${ms}ms 過長`);
  console.log(`      （滿載 ${MAX} 字實測 ${ms}ms）`);
});

await test("面板層：超限文本按下「轉寫全文」不產出輸出（且狀態不被污染）", () => {
  const st = lib.getTranslitState();
  st.out = ''; st.stats = null; st.ms = 0;
  const over = mkTibetan(MAX + 10);
  const { body } = renderOnce(over);
  const work = body.querySelectorAll(".li-col-translit")[0];
  const dirSel = work.querySelectorAll("select").find((s) => s.children.some((o) => o.attrs.value === "roman"));
  dirSel.value = "roman";
  dirSel.fire("change");
  goButton(work).fire("click");
  assert.equal(lib.getTranslitState().out, '', "超限時不應產出任何輸出");
  assert.equal(work.querySelectorAll(".li-col-translit-pre").length, 0, "輸出區不應有內容");
});

console.log("\n=== 7. v2.8.38：輸入框即時字數計數與超限提示 ===");

await test("計數器：空輸入顯示 0 / 上限；輸入後即時更新", () => {
  const maxStr = MAX.toLocaleString();
  // 面板狀態是模組級（跨重繪保留），先清乾淨再測，避免前一個用例的超限文本殘留
  const st0 = lib.getTranslitState();
  st0.src = ''; st0.out = '';
  const { body } = renderOnce();
  const cnt = body.querySelectorAll(".li-col-translit-count")[0];
  assert.ok(cnt, "應有字數計數元素");
  assert.equal(cnt.textContent, `0 / ${maxStr}`, `空輸入應為 0 / ${maxStr}，實為 ${cnt.textContent}`);
  assert.equal(cnt.hasClass("is-over"), false, "未超限不應標紅");
  const ta = body.querySelectorAll("textarea")[0];
  ta.value = "བོད་ཆོས་ཡིད།";
  ta.fire("input");
  // 「བོད་ཆོས་ཡིད།」= 12 碼點（含組合符號與藏文句點，逐碼點計）
  assert.equal(cnt.textContent, `12 / ${maxStr}`, `輸入後應更新，實為 ${cnt.textContent}`);
  assert.equal(cnt.hasClass("is-over"), false);
});

await test("計數器：超限立即轉紅並帶上限提示（不必等到按下才知道）", () => {
  const maxStr = MAX.toLocaleString();
  const over = mkTibetan(MAX + 5);
  const { body } = renderOnce(over);
  const cnt = body.querySelectorAll(".li-col-translit-count")[0];
  assert.ok(cnt.hasClass("is-over"), "超限時計數器應帶 is-over（轉紅）");
  assert.ok(cnt.textContent.includes(maxStr), `超限提示應帶上限數字，實為 ${cnt.textContent}`);
  assert.ok(cnt.textContent.includes((MAX + 5).toLocaleString()), "應顯示實際字數");
});

await test("計數器：以碼點計（悉曇一字算一字，不算兩字）", () => {
  const { body } = renderOnce();
  const ta = body.querySelectorAll("textarea")[0];
  ta.value = "𑖒𑖺𑖒"; // 3 碼點 / 5 碼元
  ta.fire("input");
  const cnt = body.querySelectorAll(".li-col-translit-count")[0];
  assert.equal(cnt.textContent, `3 / ${MAX.toLocaleString()}`, `應計 3 字，實為 ${cnt.textContent}`);
});

await test("計數器樣式：注入樣式與 styles.css 雙邊都有 .li-col-translit-count / .is-over", () => {
  const panelSrc = fs.readFileSync(path.join(ROOT, "src", "dict", "translit-panel.ts"), "utf8");
  const css = fs.readFileSync(path.join(ROOT, "styles.css"), "utf8");
  assert.ok(panelSrc.includes(".li-col-translit-count"), "面板注入樣式應含計數器規則");
  assert.ok(panelSrc.includes("is-over"), "面板注入樣式應含超限規則");
  assert.ok(css.includes(".li-col-translit-count"), "styles.css 應同步計數器規則");
  assert.ok(css.includes("li-col-translit-count.is-over"), "styles.css 應同步超限規則");
});

console.log(`\n結果: ${passed} 通過, ${failures.length} 失敗`);
if (failures.length) {
  for (const f of failures) console.error(`FAIL: ${f.name}\n${f.e.stack ?? f.e.message}`);
  process.exit(1);
}
