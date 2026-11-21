// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry

/**
 * UI 實測截圖：桌面 / 平板 / 手機 × 淺色 / 深色
 * ---------------------------------------------------------------------------
 * 目的：把 theme-compat / ui-surfaces 的量化結論變成「看得見的證據」。
 * 用法：node test/ui-shots.mjs
 * 產出：test/build/shots/*.png
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import {
  THEMES,
  themeCss,
  BASE_CSS,
  TOUCH_CSS,
  SETTINGS_HTML,
  VIEW_HTML,
} from "./ui-fixtures.mjs";

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const OUT = path.join(ROOT, "test", "build", "shots");
fs.mkdirSync(OUT, { recursive: true });
const pluginCss = fs.readFileSync(path.join(ROOT, "styles.css"), "utf8");
const CHROME = process.env.CHROME_BIN || "/usr/bin/chromium";

/** 模擬 Obsidian 設定視窗外殼：內容區可捲動、有最大寬度 */
const SHELL = `
.workspace-leaf-content,.view-content{position:relative;overflow:auto;height:100%;}
.vertical-tab-content{height:100%;overflow:auto;padding:0;}
`;

const ENVS = [
  { key: "desktop", w: 1280, h: 900, touch: false, label: "桌面 1280×900" },
  { key: "tablet", w: 834, h: 900, touch: true, label: "平板 834×1112（觸控）" },
  { key: "phone", w: 390, h: 780, touch: true, label: "手機 390×844（觸控）" },
  { key: "phoneSmall", w: 360, h: 700, touch: true, label: "小機 360×640（觸控）" },
];

const browser = await chromium.launch({
  executablePath: CHROME,
  args: ["--no-sandbox", "--font-render-hinting=none"],
});

async function shoot(env, theme, kind) {
  const page = await browser.newPage({ viewport: { width: env.w, height: env.h }, deviceScaleFactor: 2 });
  // SETTINGS_HTML 自帶 .li-settings 包裹（照 settings.ts），外面只需套一層 Obsidian 內容容器
  const body = kind === "settings"
    ? `<div class="vertical-tab-content">${SETTINGS_HTML}</div>`
    : VIEW_HTML;
  await page.setContent(`<!doctype html><html><head><style>
${BASE_CSS}
${themeCss(theme)}
${SHELL}
${pluginCss}
${env.touch ? TOUCH_CSS : ""}
</style></head><body>${body}</body></html>`, { waitUntil: "load" });
  await page.waitForTimeout(120);
  const name = `${kind}-${env.key}-${theme.id}.png`;
  await page.screenshot({ path: path.join(OUT, name) });
  await page.close();
  return name;
}

const made = [];
for (const env of ENVS) {
  for (const id of ["light", "dark"]) {
    const t = { ...THEMES[id], id };
    made.push(await shoot(env, t, "settings"));
    console.log(`  ✓ ${env.label} · ${t.label} → ${made[made.length - 1]}`);
  }
}
// 視圖（工具列 + 側欄）另截一組
for (const env of [ENVS[0], ENVS[2]]) {
  made.push(await shoot(env, { ...THEMES.dark, id: "dark" }, "view"));
  console.log(`  ✓ 視圖 ${env.label} → ${made[made.length - 1]}`);
}

await browser.close();
fs.writeFileSync(path.join(OUT, "index.json"), JSON.stringify(made, null, 2));
console.log(`\n截圖完成：${made.length} 張 → ${OUT}`);
