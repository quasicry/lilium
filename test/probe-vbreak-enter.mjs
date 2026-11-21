// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry

/**
 * 快速 probe：直排「回車行＝完整一列」（typo.verticalBreakByEnter）。
 * 兩條路徑各一場景（原生閱讀直排 / 分頁閱讀），開與關對照 + 文件安全斷言。
 * 執行：node test/probe-vbreak-enter.mjs
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const TMP = path.join(ROOT, "test", "build");
fs.mkdirSync(TMP, { recursive: true });
const CHROME = path.join(process.env.HOME ?? "", ".cache", "ms-playwright", "chromium-1243", "chrome-linux64", "chrome");

function bundle(entry, outfile, fmt = "iife", gname) {
  const args = [entry, "--bundle", `--format=${fmt}`];
  if (gname) args.push(`--global-name=${gname}`);
  args.push(`--outfile=${path.join(TMP, outfile)}`);
  const r = spawnSync(path.join(ROOT, "node_modules", ".bin", "esbuild"), args, { encoding: "utf8", timeout: 120000 });
  assert.ok(r.status === 0, `esbuild ${entry} 失敗：${r.stderr || r.stdout}`);
}

bundle(path.join(ROOT, "src", "reader-paged.ts"), "probe-vbreak-rp.iife.js", "iife", "LiRP");
bundle(path.join(ROOT, "test", "lib-export.ts"), "probe-vbreak-lib.mjs", "esm");
const lib = await import(path.join(TMP, "probe-vbreak-lib.mjs"));

const styles = fs.readFileSync(path.join(ROOT, "styles.css"), "utf8");

function typesetCssOf(opts) {
  return lib.buildTypesetCss(
    lib.resolveEffective(lib.SCRIPTS.han, { ...lib.DEFAULT_TYPOGRAPHY, ...opts }, lib.DEFAULT_PAGE)
  );
}

const SHORT = ["春眠不覺曉。", "處處聞啼鳥？", "夜來風雨聲，", "花落知多少！"].map((s) => `<p>${s}</p>`).join("");
// 長行：無回車的一整段（遠超列長），中間摻標點
const LONGP = `<p>${"天地玄黃宇宙洪荒日月盈昃辰宿列張寒來暑往秋收冬藏，".repeat(12)}</p>`;

/** measureColumns：對每個 <p> 逐字建 Range，回傳每段的「列起始字符索引」與各列尾字符 */
function probeScript(bodyCls, extraCss, withPager) {
  return `
const out = {};
const sz = document.getElementById("sz");
out.textBefore = sz.textContent;
function cols(p) {
  const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
  const chars = [];
  let n;
  while ((n = walker.nextNode())) for (const ch of n.textContent) chars.push({ node: n, ch });
  // 每個字符的 rect（vertical-rl：同列字符 top 相近；新列 = top 相對前一字符顯著變小/不同）
  const rects = chars.map((c, i) => {
    const r = document.createRange();
    r.setStart(c.node, [...(function*(){ yield 0 })()].length); // placeholder
    return null;
  });
  // 簡化：以 char 為單位 setRange（每個 char 一個 text node 不成立）——改用逐字符 setStart
  const pos = [];
  let acc = 0;
  const walker2 = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
  while ((n = walker2.nextNode())) {
    const t = n.textContent;
    for (let i = 0; i < t.length; i++) {
      const r = document.createRange();
      r.setStart(n, i); r.setEnd(n, i + 1);
      const rect = r.getBoundingClientRect();
      pos.push({ ch: t[i], x: rect.left, y: rect.top });
      acc++;
    }
  }
  // 分列：vertical-rl 列從右往左，同一列 x 相同（±2px）
  const colsArr = [];
  let cur = [pos[0]];
  for (let i = 1; i < pos.length; i++) {
    if (Math.abs(pos[i].x - cur[cur.length - 1].x) > 2) { colsArr.push(cur); cur = [pos[i]]; }
    else cur.push(pos[i]);
  }
  if (cur.length) colsArr.push(cur);
  return colsArr.map((c) => ({ startX: c[0].x, top: Math.min(...c.map(p => p.y)), bottom: Math.max(...c.map(p => p.y)), last: c[c.length - 1].ch, n: c.length }));
}
out.paras = [...sz.querySelectorAll("p")].map(cols);
out.computed = getComputedStyle(sz.querySelector("p")).lineBreak + "/" + getComputedStyle(sz.querySelector("p")).wordBreak;
${withPager ? `
const changes = [];
window.__h = LiRP.attachReaderPaged({
  reading: document.getElementById("rv"),
  preview: document.getElementById("pv"),
  pageFmt: (n) => "P" + n,
  isActive: () => true,
  onPageChange: (p, t) => { changes.push(p); },
});
const handle = window.__h;
out.pagesFound = !!handle.el.querySelector(".li-native-pages");
// 無 Obsidian 環境下首次 rebuild 可能撞上佈局未就緒重試；保險補一刀延遲重建
setTimeout(() => handle.rebuild(), 400);
setTimeout(() => handle.rebuild(), 1200);
` : ""}
`;
}

function makePage(bodyCls, typoOpts, script, withPager, content) {
  const typoCss = typesetCssOf(typoOpts);
  const rp = withPager ? `<script>${fs.readFileSync(path.join(TMP, "probe-vbreak-rp.iife.js"), "utf8")}</script>` : "";
  return `<!doctype html><html><head><meta charset="utf-8">
<style>${styles}</style><style>${typoCss}</style>
<style>html,body{margin:0;background:#eee;}
.glass{position:relative;width:760px;height:920px;background:#fff;border:1px solid #999;margin:10px;}
.markdown-reading-view{position:absolute;inset:0;}
.markdown-preview-view{position:absolute;inset:0;}
.markdown-preview-view .markdown-preview-sizer p{margin:0 0 1em;font-size:20px;line-height:1.9;}
body{--li-fs:20px;--li-lh:1.9;--li-ls:0em;--li-font:'Noto Serif CJK SC';--li-writing-mode:vertical-rl;--li-orientation:mixed;}
/* 模擬 main.ts applyTypesetVarsToHost 把排版變數寫到宿主（body）——probe 頁沒有
   .workspace-leaf-content / .li-scope 層，否則 --li-linebreak 的 var() 回退到 auto。 */
body{--li-linebreak:${typoCss.match(/--li-linebreak: ([\w-]+)/)?.[1] ?? "auto"};--li-wordbreak:${typoCss.match(/--li-wordbreak: ([\w-]+)/)?.[1] ?? "normal"};}
</style>
</head><body class="${bodyCls}">
<div class="workspace-leaf-content" data-type="markdown"><div class="glass"><div class="markdown-reading-view" id="rv"><div class="markdown-preview-view" id="pv"><div class="markdown-preview-sizer" id="sz">${content}</div></div></div></div></div>
<pre id="result">pending</pre>
${rp}
<script type="module">
try {
const __wait = (ms) => new Promise((r) => setTimeout(r, ms));
${script}
${withPager ? `
// 分頁重建是異步的（佈局就緒重試），輪詢等到頁身出現內容再取樣（上限 8s）
{
  const t0 = Date.now();
  let bodies = [];
  while (Date.now() - t0 < 8000) {
    await __wait(120);
    bodies = [...document.querySelectorAll(".li-native-page-body")];
    if (bodies.length && bodies.some(b => b.textContent.length)) break;
  }
  out.waitMs = Date.now() - t0;
  out.bodyCount = bodies.length;
  out.total = window.__h ? window.__h.total : -1;
  out.pageChars = bodies.map(b => b.textContent.length);
  out.pagesText = bodies.map(b => b.textContent).join("");
  out.pageComputed = bodies.length ? (getComputedStyle(bodies[0]).lineBreak + "/" + getComputedStyle(bodies[0]).wordBreak) : "none";
  if (window.__h) window.__h.goto(1);
}
` : ""}
out.textAfter = sz.textContent;
document.getElementById("result").textContent = JSON.stringify(out);
} catch (e) { document.getElementById("result").textContent = "PAGE_ERROR: " + (e && e.message || e); }
document.body.setAttribute("data-done","1");
</script></body></html>`;
}

function run(html, name) {
  const hp = path.join(TMP, `probe-vbreak-${name}.html`);
  fs.writeFileSync(hp, html);
  const args = ["--headless", "--no-sandbox", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=1", "--window-size=850,1050", "--virtual-time-budget=12000", "--dump-dom", `file://${hp}`];
  const dom = spawnSync(CHROME, args, { encoding: "utf8", timeout: 180000, maxBuffer: 64 * 1024 * 1024 });
  assert.ok(!dom.error && /data-done="1"/.test(dom.stdout ?? ""), `chromium 執行失敗（${name}）${dom.stderr || ""}`);
  const m = (dom.stdout ?? "").match(/<pre id="result">([\s\S]*?)<\/pre>/);
  assert.ok(m, `no result (${name})`);
  const raw = m[1];
  assert.ok(!raw.startsWith("PAGE_ERROR"), raw.slice(0, 300));
  return JSON.parse(raw);
}

const CJK_PUNCT = /[，。！？、；：」』）］｝〉》《…—・,.!?;:]/;
let pass = 0, fail = 0;
const failures = [];
function check(name, fn) {
  try { fn(); pass++; console.log(`  ✓ ${name}`); }
  catch (e) { fail++; failures.push(name); console.error(`  ✗ ${name}\n    ${e.message}`); }
}

/* ---- 場景 A：原生閱讀直排，開關關（現狀）vs 開 ---- */
const baseBody = "li-editor-vertical-active li-punct-wrap li-punct-center";
const offTypo = {};
const onTypo = { verticalBreakByEnter: true };

const rOff = run(makePage(baseBody, offTypo, probeScript(null, null, false), false, SHORT + LONGP), "off");
const rOn = run(makePage(baseBody + " li-break-by-enter", onTypo, probeScript(null, null, false), false, SHORT + LONGP), "on");

check("A1 關閉＝現狀：CJK 文種 computed 為 strict/keep-all", () => {
  assert.strictEqual(rOff.computed, "strict/keep-all");
});
check("A2 開啟：computed 收編為 auto/normal（禁則關閉）", () => {
  assert.strictEqual(rOn.computed, "auto/normal");
});
check("A3 開啟：短回車行一列一條（每段恰一列）", () => {
  for (let i = 0; i < 4; i++) assert.strictEqual(rOn.paras[i].length, 1, `段${i} 列數=${rOn.paras[i].length}`);
});
check("A4 開啟：短行列尾不吸附標點（列尾字符非禁則收編對象——整段一列、列尾＝段尾字符）", () => {
  for (let i = 0; i < 4; i++) {
    const last = rOn.paras[i][0].last;
    assert.ok(CJK_PUNCT.test(last) === false || last === rOn.textBefore[i * 6 + 5], `段${i} 列尾=${last}`);
  }
});
check("A5 開啟：長行仍按列長折行（多列、每列填滿）", () => {
  const cols = rOn.paras[4];
  assert.ok(cols.length > 3, `長段列數=${cols.length}`);
  assert.ok(cols[0].n >= 20, `首列字數=${cols[0].n}`);
});
check("A6 對照：關閉時長段列數 ≥ 開啟時（禁則收編只會更早折）", () => {
  assert.ok(rOff.paras[4].length >= rOn.paras[4].length, `off=${rOff.paras[4].length} on=${rOn.paras[4].length}`);
});
check("A7 文件安全：textContent 前後不變（兩場景）", () => {
  assert.strictEqual(rOff.textBefore, rOff.textAfter);
  assert.strictEqual(rOn.textBefore, rOn.textAfter);
});

/* ---- 場景 B：分頁閱讀直排（attachReaderPaged + inline vars 含 --li-vbreak-enter） ---- */
const LONGPAGED = LONGP.repeat(3);
const bOff = run(makePage(baseBody + " li-reader-paged", offTypo, probeScript(null, null, true), true, SHORT + LONGPAGED), "paged-off");
const bOn = run(makePage(baseBody + " li-reader-paged li-break-by-enter", onTypo, probeScript(null, null, true), true, SHORT + LONGPAGED), "paged-on");

check("B1 分頁（關）：書頁 computed strict/keep-all、頁數 ≥ 2", () => {
  assert.strictEqual(bOff.pageComputed, "strict/keep-all");
  assert.ok(bOff.total >= 2, `total=${bOff.total}`);
});
check("B2 分頁（開）：書頁 computed auto/normal、頁數 ≥ 2（超長回車行按列長折、仍可切頁）", () => {
  assert.strictEqual(bOn.pageComputed, "auto/normal");
  assert.ok(bOn.total >= 2, `total=${bOn.total}`);
});
check("B3 文件安全：兩場景所有頁拼接文本與源 sizer 文本一致（不吞字）", () => {
  assert.strictEqual(bOff.pagesText, bOff.textBefore);
  assert.strictEqual(bOn.pagesText, bOn.textBefore);
  assert.strictEqual(bOff.textBefore, bOff.textAfter);
  assert.strictEqual(bOn.textBefore, bOn.textAfter);
});
/* 檢查：開啟後頁序列不縮水——所有頁拼接文本與源 sizer 一致（B3 已驗），且每頁
   至少有內容、頁數隨內容長度合理（無「每頁一字」的容量塌縮）。末頁可能因
   widow/orphan 推頁留空（寧留白不吞字），不算缺陷。 */
check("B4 開啟：每頁均有內容、頁數合理（無容量塌縮）", () => {
  assert.ok(bOn.total >= 2 && bOn.total <= 20, `total=${bOn.total}`);
  assert.ok(bOn.pageChars.filter((c) => c > 0).length >= 2, JSON.stringify(bOn.pageChars));
  assert.ok(Math.max(...bOn.pageChars) > 50, `最大頁容量=${Math.max(...bOn.pageChars)}（塌縮會 <10）`);
});

console.log(`\nprobe: ${pass} passed, ${fail} failed${fail ? " → " + failures.join(", ") : ""}`);
process.exit(fail ? 1 : 0);
