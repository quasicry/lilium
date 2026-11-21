// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry

// 生成漢文直排截圖（與 gen-shots-yi-xibe 同構，供字距對比）
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
const lib = await import(path.resolve("test/build/vwlib.mjs"));
const TMP = path.resolve("test/build");
const OUT = process.env.SHOT_OUT || ".";
fs.mkdirSync(OUT, { recursive: true });
const hanFont = null; // 漢文用系統 CJK 字體（Noto Serif CJK），與插件字體棧一致
const face = (fam, f) =>
  `@font-face{font-family:"${fam}";src:url(data:font/ttf;base64,${f.base64}) format("truetype");font-display:swap;}`;
const baseTypo = { ...lib.DEFAULT_TYPOGRAPHY, fontSizePt: 24 }; // 演示字號 ≈32px，走 .li-doc 規則
const eff = lib.resolveEffective(lib.SCRIPTS.han, baseTypo, lib.DEFAULT_PAGE);
const css = lib.buildTypesetCss(eff);
const fam = hanFont ? hanFont.family : "serif";
const inner = "<p>天地玄黃，宇宙洪荒。日月盈昃，辰宿列張。</p><p>寒來暑往，秋收冬藏。閏餘成歲，律呂調陽。</p>";
const html = `<!doctype html><html lang="zh-Hans"><head><meta charset="utf-8"><style>

${css}
body{background:#fff;padding:32px;margin:0}
#doc{font-family:"${fam}",serif}
</style></head><body>
<div class="li-scope"><div class="li-doc" lang="zh-Hans">${inner}</div></div>
</body></html>`;
const hp = path.join(TMP, "shot-han.html");
fs.writeFileSync(hp, html);
const png = path.join(TMP, "shot-han.png");
spawnSync("chromium", ["--headless", "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
  `--screenshot=${png}`, "--window-size=760,620", "--virtual-time-budget=5000", `file://${hp}`]);
const out = path.join(OUT, "shot-han.png");
fs.copyFileSync(png, out);
console.log(`wrote ${out} (${fs.statSync(out).size} B) · font=${hanFont?.id ?? "system"}`);
