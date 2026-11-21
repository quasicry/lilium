// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry

/* 標點幾何居中像素實證：
 * 只渲染標點密集段落（真實管線 expandMarks forceCenterPunctuation），
 * 截圖後按 .li-punct 盒座標裁切每個標點格，計算墨水質心相對格中心的偏移。
 * 判定：GB 直排標準 = 標點居中於字格（|偏移| ≤ 格寬 15%）。
 * 用法：node scripts/punct-probe.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync, execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const require2 = createRequire(import.meta.url);
const OUT = process.env.SHOT_OUT || ".";
fs.mkdirSync(OUT, { recursive: true });

const TMP = path.resolve(ROOT, "test/build");
execFileSync(path.join(ROOT, "node_modules/.bin/esbuild"), [
  path.join(ROOT, "test/lib-export.ts"), "--bundle", "--format=esm",
  `--outfile=${path.join(TMP, "vwlib.mjs")}`, "--log-level=silent",
]);
const lib = await import(path.join(TMP, "vwlib.mjs").replace(/\\/g, "/"));

const eff = lib.resolveEffective(
  lib.SCRIPTS.han,
  { ...lib.DEFAULT_TYPOGRAPHY, fontSizePt: 22 },
  lib.DEFAULT_PAGE
);

// 兩段：句號串 + 全家桶（每個標點都會被 .li-punct 包裹）
const inner0 = `<p>天。地。玄。黃。宇。宙。</p><p>天，地，玄，黃。天、地、玄、黃。天！地？天：地；</p>`;
const inner = lib.expandMarks(inner0, {
  rubyMode: "explicit", emphasis: true, tcy: true, tcyAutoMax: 2,
  emphasisStyle: "marks", forceCenterPunctuation: true,
});

const stageClass = "li-stage-vertical";
const html = lib.buildStandaloneHtml({
  title: "標點居中實證",
  bodyHtml: `<div class="li-stage ${stageClass}"><div class="li-doc" lang="zh-Hans" dir="ltr">${inner}</div></div>`,
  typesetCss: lib.materializeAutoTheme(lib.buildTypesetCss(eff)),
  pageCss: lib.buildHtmlStageCss(eff),
  fontFaces: "",
  lang: "zh-Hans",
  dir: "ltr",
});
// 去掉長 desc 的干擾無關；僅保留兩段
const hp = path.join(OUT, "punct-probe.html");
fs.writeFileSync(hp, html);

// 探針：給每個 .li-punct 畫紅色外框（同運行測量，避免跨運行座標漂移）
const probe = `
<script>
window.addEventListener('load', () => {
  setTimeout(() => {
    document.querySelectorAll('.li-doc .li-punct').forEach((el) => {
      el.style.outline = '1px solid rgb(255,0,0)';
      el.style.outlineOffset = '-0.5px';
    });
  }, 300);
});
</script>`;
let probeHtml = html.replace("</body>", probe + "</body>");
const php = path.join(OUT, "punct-probe.html");
fs.writeFileSync(php, probeHtml);

// 截圖（紅框與字形同框）
const png = path.join(OUT, "punct-probe.png");
const chromium = ["/usr/local/bin/chromium", "/usr/bin/chromium"].find((p) => fs.existsSync(p));
spawnSync(chromium, ["--headless=new", "--disable-gpu", "--no-sandbox", "--hide-scrollbars",
  `--screenshot=${png}`, "--window-size=700,700", "--virtual-time-budget=8000",
  "--force-device-scale-factor=1", `file://${php.replace(/\\/g, "/")}`], { stdio: "ignore" });

const { PNG } = require2("pngjs");
const pngBuf = PNG.sync.read(fs.readFileSync(png));
const W = pngBuf.width, H = pngBuf.height, D = pngBuf.data;
const isRed = (x, y) => {
  const i = (y * W + x) * 4;
  return D[i + 3] > 100 && D[i] > 180 && D[i + 1] < 90 && D[i + 2] < 90;
};
const isInk = (x, y) => {
  if (isRed(x, y)) return false;
  const i = (y * W + x) * 4;
  return D[i + 3] > 40 && (D[i] < 205 || D[i + 1] < 205 || D[i + 2] < 205);
};

// 找紅色外框（水平紅線段 → 配對成矩形）
const redRows = new Map();
for (let y = 0; y < H; y++) {
  let runStart = -1;
  for (let x = 0; x <= W; x++) {
    const r = x < W && isRed(x, y);
    if (r && runStart < 0) runStart = x;
    if (!r && runStart >= 0) {
      if (x - runStart > 8) {
        if (!redRows.has(y)) redRows.set(y, []);
        redRows.get(y).push([runStart, x]);
      }
      runStart = -1;
    }
  }
}
// 頂邊與底邊配對成框
const tops = [...redRows.entries()].sort((a, b) => a[0] - b[0]);
const boxes = [];
const used = new Set();
for (const [yTop, segs] of tops) {
  for (const [x0, x1] of segs) {
    const key = `${x0}-${x1}`;
    if (used.has(key + "@" + yTop)) continue;
    // 向下找同 x 範圍的底邊
    for (let yB = yTop + 5; yB < Math.min(H, yTop + 60); yB++) {
      const segs2 = redRows.get(yB);
      if (!segs2) continue;
      const match = segs2.find(([a, b]) => Math.abs(a - x0) <= 2 && Math.abs(b - x1) <= 2);
      if (match) {
        boxes.push({ x: x0, y: yTop, w: x1 - x0, h: yB - yTop });
        used.add(key + "@" + yTop);
        used.add(`${x0}-${x1}@` + yB);
        break;
      }
    }
  }
}

console.log(`紅框數: ${boxes.length}`);
const results = [];
for (const b of boxes) {
  let sx = 0, sy = 0, n = 0;
  let minX = 1e9, maxX = -1, minY = 1e9, maxY = -1;
  for (let y = b.y + 2; y < b.y + b.h - 2; y++) {
    for (let x = b.x + 2; x < b.x + b.w - 2; x++) {
      if (isInk(x, y)) {
        sx += x; sy += y; n++;
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
  }
  if (n < 3) { results.push({ note: "框內無墨水", box: b }); continue; }
  const cx = sx / n, cy = sy / n;
  const offX = (cx - (b.x + b.w / 2)) / b.w;
  const offY = (cy - (b.y + b.h / 2)) / b.h;
  results.push({ box: b, ink: n, off: [+(offX).toFixed(3), +(offY).toFixed(3)], inkBox: [minX - b.x, minY - b.y, maxX - b.x, maxY - b.y] });
}
fs.writeFileSync(path.join(OUT, "punct-analysis.json"), JSON.stringify(results, null, 1));

console.log("== 標點格居中實證（紅框=1em 格；偏移以格寬比表示，0=正中）==");
let centered = 0, off = 0;
for (const r of results) {
  if (r.note) { console.log(`  ${r.note}`); continue; }
  const [ox, oy] = r.off;
  const ok = Math.abs(ox) <= 0.15 && Math.abs(oy) <= 0.15;
  if (ok) centered++; else off++;
  console.log(`  格(${r.box.x},${r.box.y}) 質心偏移 (${ox}, ${oy}) ${ok ? "✅ 居中" : "⚠️ 偏移"}`);
}
console.log(`居中 ${centered} / 偏移 ${off}`);
if (off > 0) process.exit(1);
