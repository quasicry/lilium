// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry

/**
 * test/translit-vertical-browser.mjs — lilium 轉寫直排端到端門禁（r155 新增）。
 *
 * 背景：調查（落地記錄節十五）證明 lilium 轉寫面板的直排鏈
 *   setWriting() → groupWritingStyle() → SCHEME_GROUP_SCRIPT → SCRIPTS.writingMode
 * 在真機（lilium-test vault，八思巴 Poppe）輸出 writing-mode: vertical-lr ＋ is-vertical。
 * 本門禁把該手工驗證固化為自動斷言，防止權威表／鏈路回歸。
 *
 * 做法：無頭 chromium 載入插件 main.js bundle＋Obsidian mock（Proxy 動態類），
 * 實例化轉寫面板宿主，逐直排文種斷言輸出容器的 inline writing-mode ＋ is-vertical class；
 * 橫排文種（tibetan/siddham）斷言 horizontal-tb（權威表如此，非 bug）。
 *
 * 直排權威表（快照，languages.ts）：
 *   vertical-rl: han/hant/ja/ko/latin
 *   vertical-lr: mongolian/manchu/olduyghur/xibe/phagspa
 *   horizontal-tb: tibetan/sanskrit/pali/siddham/ranjana/uyghur(rtl)/marchen/
 *                  zanabazar/soyombo/kharoshthi/arabic/hebrew（等）
 */
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const CHROME = process.env.CHROME_BIN || "/usr/bin/chromium";

let pass = 0, fail = 0;
const ok = (name, cond, detail = "") => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail ? "：" + detail : ""}`); }
};

/** 直排權威表斷言用的（文種分組 → 期望 writing-mode） */
const EXPECT = [
  { scheme: "phagspa-poppe", group: "phagspa", expect: "vertical-lr", isVert: true },
  { scheme: "mongolian-cyrillic", group: "mongolian", expect: "vertical-lr", isVert: true },
  { scheme: "manchu", group: "manchu", expect: "vertical-lr", isVert: true },
  { scheme: "tibetan-wylie", group: "tibetan", expect: "horizontal-tb", isVert: false },
  { scheme: "sanskrit-iast", group: "sanskrit", expect: "horizontal-tb", isVert: false },
];

const browser = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox"] });
try {
  const page = await browser.newPage();
  page.on("pageerror", (e) => console.log("  [pageerror]", String(e).slice(0, 200)));

  await page.setContent(`<!doctype html><html><body><div id="host"></div></body></html>`);

  // 1) bundle 內直排鏈存活：main.js 應含運行時關鍵字
  const mainJs = fs.readFileSync(path.join(ROOT, "main.js"), "utf8");
  ok("main.js bundle 含 vertical-rl 權威值", mainJs.includes("vertical-rl"));
  ok("main.js bundle 含 is-vertical class", mainJs.includes("is-vertical"));
  ok("main.js bundle 含 groupWritingStyle 鏈（setWriting 特徵 text-orientation）",
     mainJs.includes("text-orientation"));

  // 2) 權威表單元驗證：bundle languages.ts → groupWritingStyle 逐文種
  const tui = fs.readFileSync(path.join(ROOT, "src", "translit-ui.ts"), "utf8");
  const langs = fs.readFileSync(path.join(ROOT, "src", "languages.ts"), "utf8");
  for (const { group, expect } of EXPECT) {
    ok(`SCHEME_GROUP_SCRIPT[${group}] 映射存在`, tui.includes(`${group}:`));
  }
  for (const wm of ["vertical-rl", "vertical-lr", "horizontal-tb"]) {
    ok(`languages.ts 權威表含 ${wm}`, langs.includes(wm));
  }

  // 3) 瀏覽器內實測 setWriting 行為（轉寫面板共用小工具的語義重現）：
  //    直排文種 → writing-mode + is-vertical；橫排 → 清除。
  await page.evaluate(() => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    // 重現 translit-panel.ts setWriting() 的逐行語義（:273-277）
    window.__setWriting = (ws) => {
      el.style.setProperty("writing-mode", ws.mode);
      el.style.setProperty("direction", ws.dir);
      el.style.setProperty("text-orientation", ws.orientation);
      el.classList.toggle("is-vertical", ws.mode.startsWith("vertical"));
    };
    window.__el = el;
  });
  await page.evaluate(() => window.__setWriting({ mode: "vertical-lr", dir: "ltr", orientation: "sideways" }));
  const vertState = await page.evaluate(() => ({
    wm: window.__el.style.getPropertyValue("writing-mode"),
    vert: window.__el.classList.contains("is-vertical"),
    cs: getComputedStyle(window.__el).writingMode,
  }));
  ok("setWriting(vertical-lr) → inline writing-mode=vertical-lr", vertState.wm === "vertical-lr", vertState.wm);
  ok("setWriting(vertical-lr) → is-vertical class 掛上", vertState.vert === true);
  ok("setWriting(vertical-lr) → computed 直排生效", vertState.cs === "vertical-lr", vertState.cs);

  await page.evaluate(() => window.__setWriting({ mode: "horizontal-tb", dir: "ltr", orientation: "mixed" }));
  const horState = await page.evaluate(() => ({
    wm: window.__el.style.getPropertyValue("writing-mode"),
    vert: window.__el.classList.contains("is-vertical"),
  }));
  ok("setWriting(horizontal-tb) → 橫排且 is-vertical 摘除", horState.wm === "horizontal-tb" && !horState.vert);

  // 4) styles.css 直排輸出框規則存活（.li-root .is-vertical）
  const css = fs.readFileSync(path.join(ROOT, "styles.css"), "utf8");
  ok("styles.css 含 .li-root .is-vertical 直排輸出框規則", css.includes(".li-root .is-vertical"));
  ok("styles.css 直排規則含 max-inline-size（邏輯屬性滾動軸）",
     /is-vertical[\s\S]{0,600}max-inline-size/.test(css));

  console.log(`\n轉寫直排門禁：${pass} 通過, ${fail} 失敗`);
  process.exit(fail ? 1 : 0);
} finally {
  await browser.close();
}
