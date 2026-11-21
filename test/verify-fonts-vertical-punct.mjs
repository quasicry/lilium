// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry

/**
 * 直排標點合規性驗證（LI-TS-106）
 *
 * ## 為什麼不用 canvas 量測（重要）
 * Canvas 2D **不支援 `font-feature-settings`** —— 對 canvas 元素設
 * `style.fontFeatureSettings` 只影響元素本身 CSS，完全不作用於 `fillText` 繪出的
 * 字形。結果量到的永遠是「橫排字形」，字體的 `vert` 直排變體根本沒被觸發。
 * 而大陸字體正是靠 `vert` 把句讀點從橫排的左下搬到直排的右上 —— 用橫排 canvas
 * 量測，等於把「符合大陸標準」誤判成「偏移過大」。
 *
 * 本檔改用**真實直排渲染**（`writing-mode: vertical-rl`，由瀏覽器完整跑 UAX #50
 * 朝向判定 + 字體 `vert`/`vrt2` 字形替換）＋**截圖像素分析**取墨跡質心與 bbox。
 *
 * ## 判定標準（依使用者規範）
 *   大陸（GB）：句讀類在直排時位於字身格**右上角**＝合規；**左下角**＝不合規。
 *   臺灣（zh-Hant）：句讀類**居中**＝合規。
 *   旋轉類（括號／引號／破折號／半角符號）：應右旋 90°。
 *   直立類（•）：不旋轉。
 *
 * ## 旋轉判據＝橫排對照（關鍵）
 * 不能用「直排時 bh>bw」這種單邊規則：`（` 橫排是縱向長弧（bw<bh），右旋後變
 * 橫向（bw>bh）；而 `《` 恰好相反。不同括號方向相反，統一規則必然誤判。
 * 嚴謹判據是**轉置對照**：直排 bbox 應等於橫排 bbox 的轉置
 * （bw_v≈bh_h 且 bh_v≈bw_h）；直立類則應與橫排 bbox 相同。
 *
 * 輸出：fonts-src/cn-mainland/vertical-punct-report.{json,md}
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const CHROME = ["/usr/bin/chromium", "/usr/bin/google-chrome"].find((p) => fs.existsSync(p));
const OUT_DIR = path.join(ROOT, "fonts-src", "cn-mainland");

/** 待測字體。std = 該字體的設計規範（cn=大陸／tw=臺灣／jp=日本） */
const FONTS = [
  { family: "ZCOOL KuaiLe",          file: "ZCOOL-KuaiLe.ttf",          std: "cn" },
  { family: "ZCOOL QingKe HuangYou", file: "ZCOOL-QingKe-HuangYou.ttf", std: "cn" },
  { family: "ZCOOL XiaoWei",         file: "ZCOOL-XiaoWei.ttf",         std: "cn" },
  { family: "Liu Jian Mao Cao",      file: "Liu-Jian-Mao-Cao.ttf",      std: "cn" },
  { family: "Long Cang",             file: "Long-Cang.ttf",             std: "cn" },
  { family: "Ma Shan Zheng",         file: "Ma-Shan-Zheng.ttf",         std: "cn" },
  { family: "Zhi Mang Xing",         file: "Zhi-Mang-Xing.ttf",         std: "cn" },
  { family: "Noto Sans SC",          file: "Noto-Sans-SC.ttf",          std: "cn" },
  { family: "Noto Sans CJK SC",      file: null,                        std: "cn" },
  { family: "Noto Serif CJK SC",     file: null,                        std: "cn" },
  { family: "Noto Sans Mono CJK SC", file: null,                        std: "cn" },
  { family: "WenQuanYi Micro Hei",   file: null,                        std: "cn" },
  { family: "WenQuanYi Zen Hei",     file: null,                        std: "cn" },
  { family: "Noto Sans CJK TC",      file: null,                        std: "tw" },
  { family: "Noto Serif CJK TC",     file: null,                        std: "tw" },
  { family: "AR PL UKai CN",         file: null,                        std: "tw" },
  { family: "AR PL UMing CN",        file: null,                        std: "tw" },
  { family: "AR PL UKai TW",         file: null,                        std: "tw" },
  { family: "AR PL UMing TW",        file: null,                        std: "tw" },
  { family: "Noto Sans CJK JP",      file: null,                        std: "jp" },
];

/**
 * 待測字符＝使用者給定的偵測範圍，逐字標注角色：
 *   point   = 句讀類（依規範判定右上／居中）
 *   rot     = 旋轉類（應右旋 90°）
 *   upright = 直立類（不旋轉）
 */
const CHARS = [
  ["。", "point"], ["、", "point"], ["，", "point"],
  ["：", "point"], ["；", "point"], ["？", "point"], ["！", "point"],
  ["（", "rot"], ["）", "rot"], ["《", "rot"], ["》", "rot"],
  ["〈", "rot"], ["〉", "rot"], ["〔", "rot"], ["〕", "rot"],
  ["［", "rot"], ["］", "rot"], ["「", "rot"], ["」", "rot"],
  ["『", "rot"], ["』", "rot"], ["——", "rot"], ["……", "rot"],
  ["-", "rot"], ["/", "rot"], ["$", "rot"], ["&", "rot"],
  ["@", "rot"], ["*", "rot"], ["#", "rot"], ["%", "rot"],
  ["•", "upright"],
];

const CELL = 80, PAD = 10, STEP = CELL + PAD * 2;
const COLS = CHARS.length;
const WIDTH = COLS * STEP;
const HEIGHT = FONTS.length * STEP + 400; // 緩衝：headless 可繪製高度小於 --window-size

const faceCss = FONTS.filter((f) => f.file).map((f) =>
  `@font-face{font-family:'${f.family}';src:url('file://${path.join(OUT_DIR, f.file)}') format('truetype');font-display:block;}`
).join("\n");

/** 生成網格 HTML；mode=v 直排、mode=h 橫排（對照組） */
function buildHtml(mode) {
  const wm = mode === "v" ? "vertical-rl" : "horizontal-tb";
  let h = `<!doctype html><meta charset="utf-8"><style>
@page{margin:0}
html,body{margin:0;padding:0;background:#fff;color:#000;width:${WIDTH}px}
${faceCss}
.row{display:flex;flex-wrap:nowrap;width:${WIDTH}px;height:${STEP}px}
.cell{width:${CELL}px;height:${CELL}px;margin:${PAD}px;overflow:hidden;background:#fff}
.cell>span{display:block;width:${CELL}px;height:${CELL}px;line-height:${CELL}px;
  writing-mode:${wm};text-orientation:mixed;font-size:${CELL}px;
  text-align:center;color:#000;background:#fff}
</style>`;
  for (const f of FONTS) {
    h += `<div class="row">`;
    for (const [ch] of CHARS)
      h += `<div class="cell"><span style="font-family:'${f.family}'">${ch}</span></div>`;
    h += `</div>`;
  }
  return h;
}

function shoot(mode) {
  const htmlPath = path.join(OUT_DIR, `_grid-${mode}.html`);
  const png = path.join(OUT_DIR, `_grid-${mode}.png`);
  fs.writeFileSync(htmlPath, buildHtml(mode));
  const r = spawnSync(CHROME, [
    "--headless", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage",
    "--force-device-scale-factor=1", "--hide-scrollbars",
    "--virtual-time-budget=20000", `--window-size=${WIDTH},${HEIGHT}`,
    `--screenshot=${png}`, "file://" + htmlPath,
  ], { stdio: "pipe", timeout: 180_000 });
  if (!fs.existsSync(png)) {
    console.error(`[${mode}] 截圖失敗：`, (r.stderr || "").toString().slice(0, 600));
    process.exit(1);
  }
  console.log(`[${mode}] 截圖 ${WIDTH}x${HEIGHT} → ${fs.statSync(png).size} bytes`);
  return png;
}

const pngV = shoot("v");
const pngH = shoot("h");

// ── 像素分析（PIL）：同時輸出直排與橫排的量測 ────────────────────────────
const metaPath = path.join(OUT_DIR, "_grid-meta.json");
fs.writeFileSync(metaPath, JSON.stringify({ CELL, PAD, STEP, COLS, FONTS, CHARS }));

const PY = `
import json, sys
from PIL import Image
import numpy as np
m = json.load(open(sys.argv[1]))
CELL, PAD, STEP = m["CELL"], m["PAD"], m["STEP"]

def measure(png):
    a = np.array(Image.open(png).convert("L"))
    out = []
    for ri, f in enumerate(m["FONTS"]):
        rec = {"family": f["family"], "std": f["std"],
               "source": "download" if f["file"] else "system", "chars": {}}
        for ci, (ch, role) in enumerate(m["CHARS"]):
            x0, y0 = ci*STEP + PAD, ri*STEP + PAD
            sub = a[y0:y0+CELL, x0:x0+CELL]
            if sub.size == 0:
                rec["chars"][ch] = None; continue
            mk = sub < 128
            n = int(mk.sum())
            if n == 0:
                rec["chars"][ch] = {"n": 0}; continue
            ys, xs = np.nonzero(mk)
            rec["chars"][ch] = {"n": n,
                "ox": (float(xs.mean()) - CELL/2)/CELL,
                "oy": (float(ys.mean()) - CELL/2)/CELL,
                "bw": float(xs.max()-xs.min()+1)/CELL,
                "bh": float(ys.max()-ys.min()+1)/CELL}
        out.append(rec)
    return out

v = measure(sys.argv[2]); h = measure(sys.argv[3])
json.dump({"v": v, "h": h}, open(sys.argv[4], "w"), ensure_ascii=False)
print("analyzed", len(v), "fonts x2 modes")
`;
const pyPath = path.join(OUT_DIR, "_analyze.py");
fs.writeFileSync(pyPath, PY);
const an = spawnSync("python3.11", [pyPath, metaPath, pngV, pngH, path.join(OUT_DIR, "_ink.json")],
  { stdio: "pipe", timeout: 240_000 });
if (an.status !== 0) { console.error("分析失敗：", (an.stderr || "").toString().slice(0, 800)); process.exit(1); }
console.log((an.stdout || "").toString().trim());

const { v: V, h: H } = JSON.parse(fs.readFileSync(path.join(OUT_DIR, "_ink.json"), "utf8"));

// ── 判定 ─────────────────────────────────────────────────────────────────
const Q = 0.05;          // 象限閾值（em）
const TOL = 0.25;        // 轉置對照容差（相對比例）
const STD = { cn: "大陸(GB)", tw: "臺灣", jp: "日本" };

function quadrant(v) {
  if (v.ox > Q && v.oy < -Q) return "右上";
  if (v.ox < -Q && v.oy < -Q) return "左上";
  if (v.ox < -Q && v.oy > Q) return "左下";
  if (v.ox > Q && v.oy > Q) return "右下";
  return "居中";
}
/** 句讀類：cn/jp 規範＝右上合規；tw 規範＝居中合規 */
function judgePoint(v, std) {
  const dev = +Math.max(Math.abs(v.ox), Math.abs(v.oy)).toFixed(3);
  if (std === "tw") return { pass: dev <= 0.06, want: "居中", got: quadrant(v), dev };
  const q = quadrant(v);
  return { pass: q === "右上", want: "右上", got: q, dev };
}
/**
 * 旋轉類：直排 bbox 應＝橫排 bbox 的轉置（bw_v≈bh_h 且 bh_v≈bw_h）。
 * 直立類：直排 bbox 應與橫排相同。
 */
function judgeOrientation(vc, hc, wantRotate) {
  if (!hc || hc.n === 0) return { pass: false, want: wantRotate ? "已右旋" : "直立", got: "橫排缺字", dev: null };
  const scale = Math.max(hc.bw, hc.bh, 0.01);
  const errT = Math.max(Math.abs(vc.bw - hc.bh), Math.abs(vc.bh - hc.bw)) / scale; // 轉置誤差
  const errS = Math.max(Math.abs(vc.bw - hc.bw), Math.abs(vc.bh - hc.bh)) / scale; // 相同誤差
  const got = `直排 ${vc.bw.toFixed(2)}×${vc.bh.toFixed(2)} / 橫排 ${hc.bw.toFixed(2)}×${hc.bh.toFixed(2)}`;
  if (wantRotate) {
    // 轉置誤差明顯小於「未旋轉」誤差，才算真的右旋
    const rotated = errT <= TOL && errT < errS;
    return { pass: rotated, want: "已右旋(轉置)", got, dev: +errT.toFixed(3) };
  }
  return { pass: errS <= TOL, want: "直立(不旋轉)", got, dev: +errS.toFixed(3) };
}

const report = { summary: { total: 0, pass: 0, fail: 0, byStd: {} }, fonts: [] };
for (let i = 0; i < V.length; i++) {
  const rv = V[i], rh = H[i];
  const out = { family: rv.family, std: rv.std, source: rv.source, chars: {}, pass: 0, fail: 0, missing: 0 };
  for (const [ch, role] of CHARS) {
    const vc = rv.chars[ch], hc = rh.chars[ch];
    if (!vc || vc.n === 0) {
      out.chars[ch] = { role, verdict: "缺字", pass: false };
      out.missing++; report.summary.total++; report.summary.fail++;
      continue;
    }
    let j;
    if (role === "point") {
      j = judgePoint(vc, rv.std);
    } else {
      j = judgeOrientation(vc, hc, role === "rot");
    }
    out.chars[ch] = { role, ox: +vc.ox.toFixed(3), oy: +vc.oy.toFixed(3),
      bw: +vc.bw.toFixed(2), bh: +vc.bh.toFixed(2), ...j };
    if (j.pass) out.pass++; else out.fail++;
    report.summary.total++;
    report.summary.pass += j.pass ? 1 : 0;
    report.summary.fail += j.pass ? 0 : 1;
  }
  const b = (report.summary.byStd[rv.std] ||= { pass: 0, fail: 0 });
  b.pass += out.pass; b.fail += out.fail;
  report.fonts.push(out);
}
fs.writeFileSync(path.join(OUT_DIR, "vertical-punct-report.json"), JSON.stringify(report, null, 1));

// ── Markdown 報告 ────────────────────────────────────────────────────────
let md = `# 直排標點合規性驗證報告（v2.8.42 / LI-TS-106）

量測通道：**真實直排渲染**（\`writing-mode: vertical-rl\`）＋截圖像素分析。
不用 canvas：Canvas 2D 不支援 \`font-feature-settings\`，無法觸發字體 \`vert\` 直排字形，
量到的只會是橫排形態，會把「符合大陸標準的右上」誤判成偏移過大。

## 判定標準

| 規範 | 句讀類（。、，：；？！）合規位置 |
|---|---|
| 大陸 GB | 字身格**右上角**；落左下角＝不合規 |
| 臺灣 zh-Hant | 字身格**居中** |
| 日本 | 字身格**右上角** |

旋轉類採**橫排對照轉置判據**：直排 bbox 應等於橫排 bbox 的轉置
（\`bw_v≈bh_h\` 且 \`bh_v≈bw_h\`）。不用「直排 bh>bw」這種單邊規則 ——
\`（\` 與 \`《\` 的長軸方向相反，統一規則必誤判。

## 總覽

- 字體 ${report.fonts.length} 款 × 字符 ${CHARS.length} 個 = ${report.summary.total} 槽
- 合規 **${report.summary.pass}** ／ 不合規 **${report.summary.fail}**
${Object.entries(report.summary.byStd).map(([k, v]) => `- ${STD[k] || k}：合規 ${v.pass} ／ 不合規 ${v.fail}`).join("\n")}

## 逐字體（句讀類實測象限）

| 字體 | 規範 | 來源 | 。 | 、 | ， | ： | ？ | 合規/總 |
|---|---|---|---|---|---|---|---|---|
`;
for (const f of report.fonts) {
  const g = (ch) => {
    const c = f.chars[ch];
    if (!c) return "—";
    if (c.verdict === "缺字") return "缺";
    return c.role === "point" ? `${c.got}${c.pass ? "✓" : "✗"}` : (c.pass ? "✓" : "✗");
  };
  md += `| ${f.family} | ${STD[f.std] || f.std} | ${f.source} | ${g("。")} | ${g("、")} | ${g("，")} | ${g("：")} | ${g("？")} | ${f.pass}/${f.pass + f.fail + f.missing} |\n`;
}

md += `\n## 不合規明細\n\n`;
for (const f of report.fonts) {
  const bad = Object.entries(f.chars).filter(([, c]) => !c.pass);
  if (!bad.length) continue;
  md += `### ${f.family}（${STD[f.std] || f.std}）— ${bad.length} 項\n\n`;
  md += `| 字符 | 角色 | 實測 | 應為 | 誤差 |\n|---|---|---|---|---|\n`;
  for (const [ch, c] of bad.slice(0, 40)) {
    if (c.verdict === "缺字") { md += `| ${ch} | ${c.role} | 缺字 | — | — |\n`; continue; }
    md += `| ${ch} | ${c.role} | ${c.got} | ${c.want} | ${c.dev ?? "—"} |\n`;
  }
  md += `\n`;
}
fs.writeFileSync(path.join(OUT_DIR, "vertical-punct-report.md"), md);

console.log(`\n字體 ${report.fonts.length} × 字符 ${CHARS.length} = ${report.summary.total} 槽`);
console.log(`合規 ${report.summary.pass} ／ 不合規 ${report.summary.fail}`);
for (const [k, v] of Object.entries(report.summary.byStd)) console.log(`  ${STD[k] || k}: 合規 ${v.pass} ／ 不合規 ${v.fail}`);
console.log(`\n報告：fonts-src/cn-mainland/vertical-punct-report.{md,json}`);
