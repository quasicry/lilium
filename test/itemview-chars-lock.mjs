// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry

/**
 * test/itemview-chars-lock.mjs — ItemView 手動「每列字數」真的生效嗎？
 *
 * 這是一條**量測型**門禁（不是「字串有沒有出現在 CSS 裡」那種紙面檢查）。
 *
 * 背景：使用者回報「排版中每列字數的手動調整是失靈的」。根因在
 * `styles.css` 的這條規則——
 *
 *     .li-stage.li-stage-vertical .li-doc { height: 100%; }
 *
 * 在 `writing-mode: vertical-rl` 下，**實體 height 就是 inline-size（＝列長方向）**。
 * 這條的 specificity 是 (0,3,0)，會壓過 typeset.ts 注入的
 * `.li-doc { inline-size: calc(var(--li-chars) * ...) }`（(0,1,0)），
 * 於是不管使用者把每列字數設成 8 還是 20，列長都被 `height:100%` 钉死在容器高度。
 *
 * 修法：把這條收進 `body:not(.li-chars-locked)` ——
 *   - 未鎖定（charsPerColumn = 0，預設）：維持「版心佔滿可用高度」
 *     ＝每列字數自適應跟隨視圖邊框，這是使用者要的預設行為；
 *   - 鎖定（charsPerColumn > 0，body.li-chars-locked）：讓位給注入規則的公式。
 *
 * 做法：把真實的 styles.css 餵給 chromium，量 .li-doc 的實體寬度
 * （直排下＝列長）。三種情境都要符合預期。
 */
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const pluginCss = fs.readFileSync(path.join(ROOT, "styles.css"), "utf8");
const CHROME = process.env.CHROME_BIN || "/usr/bin/chromium";

/** Obsidian 環境變數（只給量測需要的那幾個） */
const OBSIDIAN_VARS = `
:root {
  --background-primary: #ffffff;
  --text-normal: #222222;
  --li-bg: var(--background-primary);
  --li-fg: var(--text-normal);
  --li-ui-space-5: 12px;
  --li-ui-space-6: 16px;
}
`;

/**
 * typeset.ts 注入的鎖定規則（見 typeset.ts 的 charsPerCol）：
 * charsPerColumn > 0 → inline-size 用公式；= 0 → inline-size:100%。
 */
const injectedLocked = `
.li-doc {
  writing-mode: vertical-rl;
  font-size: 14px;
  --li-chars: 20;
  --li-ls: 0em;
  --li-ls-fix: 0em;
  inline-size: calc(var(--li-chars) * (1em + var(--li-ls, 0em)));
}
`;

const injectedUnlocked = `
.li-doc {
  writing-mode: vertical-rl;
  font-size: 14px;
  --li-chars: auto;
  --li-ls: 0em;
  inline-size: 100%;
}
`;

const HTML = (bodyClass, injected) => `<!doctype html>
<html><head><meta charset="utf-8"><style>${OBSIDIAN_VARS}</style>
<style>${pluginCss}</style><style>${injected}</style></head>
<body class="${bodyClass}">
  <div class="li-stage li-stage-vertical" style="height:700px;width:900px;">
    <div class="li-scope">
      <div class="li-doc"><p>天地玄黃宇宙洪荒日月盈昃辰宿列張</p></div>
    </div>
  </div>
</body></html>`;

let pass = 0;
let fail = 0;
function ok(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ""}`);
  } else {
    fail++;
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

/**
 * 量 `.li-doc` 的**實體高度**。
 *
 * 直排（`writing-mode: vertical-rl`）下軸向會互換：
 *   inline 軸 = 垂直（physical height）→ 文字走的方向 ＝ **列長**
 *   block  軸 = 水平（physical width） → 堆列的方向   ＝ 列數
 * 所以 `inline-size` 與 `height` 在這裡都落在同一個物理量：**列長**。
 * （一度把這裡寫成量 width，五條全紅——width 是列數方向，量錯軸。）
 */
async function measure(page, html) {
  await page.setContent(html, { waitUntil: "load" });
  return page.evaluate(() => {
    const d = document.querySelector(".li-doc");
    const cs = getComputedStyle(d);
    const r = d.getBoundingClientRect();
    // 扣掉 padding 得到「內容列長」：padding 是固定的裝飾量，不該算進
    // 「每列幾個字」的量測裡，否則期望值要隨樣式常數漂移。
    const content =
      r.height - parseFloat(cs.paddingTop || "0") - parseFloat(cs.paddingBottom || "0");
    return {
      w: Math.round(r.width),
      h: Math.round(content),
      raw: Math.round(r.height),
    };
  });
}

const browser = await chromium.launch({
  executablePath: CHROME,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });

console.log("\n== ItemView 每列字數（直排列長）==");

// 1) 鎖定 chars=20：列長應 ≈ 20 × 14px = 280px（不是容器的 700px）
const locked20 = await measure(page, HTML("li-editor-vertical-active li-chars-locked", injectedLocked));
ok(
  "鎖定每列 20 字：列長≈280px，未被 height:100% 釘在 700px",
  locked20.h > 240 && locked20.h < 320,
  `實測 ${locked20.h}px`
);

// 2) 鎖定 chars=8 → 112px：證明拉桿真的有反應（這是原本失靈的地方）
const locked8 = await measure(
  page,
  HTML("li-editor-vertical-active li-chars-locked", injectedLocked.replace("--li-chars: 20", "--li-chars: 8"))
);
ok("鎖定每列 8 字：列長≈112px，手動調整有反應", locked8.h > 90 && locked8.h < 140, `實測 ${locked8.h}px`);

// 3) 未鎖定（預設）：佔滿 stage 高度 700px ＝ 每列字數自適應跟隨視圖邊框
const auto = await measure(page, HTML("li-editor-vertical-active", injectedUnlocked));
ok("未鎖定（預設）：列長填滿容器 700px（自適應）", auto.h > 650, `實測 ${auto.h}px`);

// 4) 鎖定值必須真的比自適應小，否則「手動調整」等於沒做
ok("鎖定值顯著小於自適應值", locked20.h < auto.h - 200, `${locked20.h}px < ${auto.h}px`);

// 5) 不同值之間必須有差異（回歸：以前 8 與 20 量出來一樣寬）
ok("8 字與 20 字量出不同列長（非固定）", Math.abs(locked20.h - locked8.h) > 100, `20字=${locked20.h}px, 8字=${locked8.h}px`);

await browser.close();

console.log(`\n結果: ${pass} 通過, ${fail} 失敗`);
process.exit(fail === 0 ? 0 : 1);
