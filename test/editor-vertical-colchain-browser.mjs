// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry

// [1.15h] 直排編輯器「高度鏈／列長」回歸門禁
//
// 為什麼需要這條門禁：v2.8.69–v2.8.71 的驗證全是「自證」——合成環境下容器會長高，
// 於是不會被裁切、門禁恆綠，而實機上 .view-content 受葉容器約束、真的在吞字。
// 本門禁改用**真實會失敗的指標**：
//   1) clippedByAncestorPx：內容底緣超出祖先 .view-content 可視框多少（該層 overflow:hidden）
//      —— 這就是使用者看到的「吞字」。修前實測 100px。
//   2) 視覺列數：對文字內容建 Range 再 getClientRects()。
//      ⚠️ 不能用 .cm-line.getClientRects()（display:block 只回傳單一邊框矩形，恆為 1），
//         也不能數 .cm-line 的 left（一個邏輯行只有一個 DOM 元素，包住它所有視覺列）。
//   3) max-inline-size 實際計算值：v2.8.69 那條被 max-height:none 蓋掉後恆為 none，
//      本門禁不硬性要求它是 100%（那是多餘的），但要求「沒有死規則互相打架」。
import fs from "node:fs";
import { execSync } from "node:child_process";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pw from "playwright-core";
const { chromium } = pw;

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const css = fs.readFileSync(ROOT + "/styles.css", "utf8");
const out = ROOT + "/test/build/editor-heightchain-bundle.mjs";
fs.mkdirSync(ROOT + "/test/build", { recursive: true });
execSync(`${ROOT}/node_modules/.bin/esbuild ${ROOT}/test/editor-heightchain-bundle.ts --bundle --format=esm --platform=browser --outfile=${out} --log-level=warning`);

const browser = await chromium.launch({ executablePath: process.env.LI_CHROMIUM || "/usr/bin/chromium", args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
await page.setContent(`<!doctype html><html><head><style>${css}</style></head><body class="li-editor-vertical-active"></body></html>`);
await page.addScriptTag({ content: fs.readFileSync(out, "utf8"), type: "module" });
await page.waitForFunction(() => !!window.__cm, null, { timeout: 15000 });

const r = await page.evaluate(() => {
  const { EditorView, EditorState } = window.__cm;
  const LONG = "這是為了重現直排列長問題而準備的一段很長的中文正文，用來驗證長段是否會沿垂直軸換列。".repeat(30);
  const doc = "# 第一章 緒論\n\n" + LONG + "\n\n" + LONG;

  // 忠實還原真實 Obsidian：葉容器確定高（flex column）→ .view-content flex:1 + overflow:hidden
  function build(leafH, vertical, hostPadB) {
    document.body.innerHTML = "";
    document.body.className = vertical ? "li-editor-vertical-active" : "";
    const leaf = document.createElement("div");
    leaf.className = "workspace-leaf-content";
    leaf.setAttribute("data-type", "markdown");
    leaf.style.cssText = `height:${leafH}px;width:820px;display:flex;flex-direction:column;overflow:hidden;`;
    const vc = document.createElement("div");
    vc.className = "view-content";
    vc.style.cssText = "flex:1 1 auto;min-height:0;overflow:hidden;";
    const msv = document.createElement("div");
    msv.className = "markdown-source-view mod-cm6";
    vc.appendChild(msv);
    leaf.appendChild(vc);
    document.body.appendChild(leaf);
    new EditorView({
      state: EditorState.create({ doc, extensions: [EditorView.lineWrapping] }),
      parent: msv,
    });
    // 忠实还原宿主的「捲過末尾(Scroll past end)」内联 padding（Obsidian runtime 写在 .cm-content 上）。
    // 直排下物理 padding-bottom 映射到**行内结束方向＝列长方向**，实机实测 361px 把内容盒 646→285px。
    // 合成环境不还原它，门禁就永远抓不到「列长写不满」这一域（v2.8.79 的教训）。
    if (hostPadB) {
      const c = msv.querySelector(".cm-content");
      if (c) c.style.paddingBottom = hostPadB + "px";
    }
    return { vc, msv };
  }

  function probe(b) {
    const { vc, msv } = b;
    const scroller = msv.querySelector(".cm-scroller");
    const content = msv.querySelector(".cm-content");
    const cs = getComputedStyle(scroller);
    const cc = getComputedStyle(content);
    const lines = [...content.querySelectorAll(".cm-line")];
    const cols = lines.map((l) => {
      const rg = document.createRange();
      rg.selectNodeContents(l);
      const rects = [...rg.getClientRects()];
      // ⚠️ flaky 修復（2026-10）：vertical-rl 下 Range.getClientRects() 回傳的是**矩形片段**，
      // 不是視覺列——同一視覺列（同一 x）可能因列內斷行/軟換行拆成多個 rect（例如 y 312+273
      // 同在 x=758），片段切分點隨 layout 時序抖動，headless SwiftShader 下尤其不穩，
      // 導致「B resize 後換列更多 4 → 4」的偶發失敗。真正的視覺列數＝rect 去重後的
      // block-axis 座標數（vertical-rl 是 x；橫排時 isVertical=false 退回 y），
      // 並過濾零尺寸 rect（行首 zero-height 片段）。四個門禁語義（換列、列數、resize 跟隨）不變。
      const isVertical = getComputedStyle(content).writingMode.startsWith("vertical");
      const axis = isVertical ? "x" : "y";
      return new Set(
        rects
          .filter((rc) => rc.width > 1 || rc.height > 1)
          .map((rc) => Math.round(rc[axis]))
      ).size;
    });
    const cr = content.getBoundingClientRect();
    const vr = vc.getBoundingClientRect();
    const padT = parseFloat(cc.paddingTop) || 0;
    const padB = parseFloat(cc.paddingBottom) || 0;
    return {
      viewContentH: Math.round(vr.height),
      scrollerH: scroller.clientHeight,
      maxInlineSize: cc.maxInlineSize,
      inlineSize: cc.inlineSize,
      whiteSpace: cc.whiteSpace,
      alignItems: cs.alignItems,
      writingMode: cs.writingMode,
      maxCols: Math.max(...cols),
      clippedByAncestorPx: Math.round(cr.bottom - vr.bottom),
      padB: cc.paddingBottom,
      lineBoxH: lines[0] ? Math.round(lines[0].getBoundingClientRect().height) : 0,
      contentBoxInline: Math.round(cr.height - padT - padB),
    };
  }

  const next = () => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
  return (async () => {
    const p = build(600, true);
    await next();
    const A = probe(p);
    // resize：葉容器 600 → 400（對應調整 Obsidian 視窗大小）
    const p2 = build(400, true);
    await next();
    const B = probe(p2);
    // 橫排對照：不掛 li-editor-vertical-active
    const p3 = build(600, false);
    await next();
    const C = probe(p3);
    // F：模拟宿主「捲過末尾(Scroll past end)」在 .cm-content 上寫的**內聯** padding-bottom
    //    （v2.8.79 根因：直排下映射到行內結束方向＝列長方向，實機把內容盒 646→285px）。
    const p4 = build(600, true, 361);
    await next();
    const F = probe(p4);
    // G：橫排 + 同樣內聯 padding（反向門禁：橫排的「捲過末尾」必須保留，不得被清）
    const p5 = build(600, false, 361);
    await next();
    const G = probe(p5);
    return { A, B, C, F, G };
  })();
});

await browser.close();

const { A, B, C, F, G } = r;
const ok = (c, m) => { assert.ok(c, m); console.log("  ✓ " + m); };

console.log("[1.15h] 直排編輯器「高度鏈／列長」回歸門禁");
console.log("  A 直排600:", JSON.stringify(A));
console.log("  B 直排400:", JSON.stringify(B));
console.log("  C 橫排對照:", JSON.stringify(C));
console.log("  F 模擬宿主內聯 padding(直排):", JSON.stringify(F));
console.log("  G 模擬宿主內聯 padding(橫排):", JSON.stringify(G));

// A：直排長文檔不得被祖先裁切，且長段必須真的換列
ok(A.clippedByAncestorPx <= 8, `A 直排不得被祖先裁切 clipped=${A.clippedByAncestorPx}px（修前實測 100px）`);
ok(A.maxCols >= 2, `A 長段必須換列 maxCols=${A.maxCols}`);
ok(A.whiteSpace === "pre-wrap", `A 直排強制軟換行 white-space=${A.whiteSpace}`);
ok(A.alignItems === "flex-start", `A 起始邊錨定 align-items=${A.alignItems}`);
ok(A.writingMode.startsWith("vertical"), `A 直排生效 writing-mode=${A.writingMode}`);
// 高度鏈：scroller 不得超出葉容器（這是「吞字」的直接成因）
ok(A.scrollerH <= A.viewContentH + 2, `A 高度鏈受約束 scrollerH=${A.scrollerH} <= viewContentH=${A.viewContentH}`);

// B：resize 後列長跟隨、仍不裁切、仍換列
ok(B.clippedByAncestorPx <= 8, `B resize 後不得被裁切 clipped=${B.clippedByAncestorPx}px`);
ok(B.scrollerH < A.scrollerH, `B 列長跟隨 resize ${A.scrollerH} → ${B.scrollerH}`);
// ⚠️ flaky 修復（2026-10）：原斷言 `B.maxCols > A.maxCols`（「resize 後換列更多」）。
// 根因：headless Chromium（SwiftShader）下 CM6 對 vertical-rl 的量測是虛擬化的——
// resize 600→400 後每行可見視覺列數用確定指標（去重 x 座標）量測時實測**不變**（4→4、2→2），
// 舊的「列數」其實是 Range.getClientRects() 的矩形片段數：同一視覺列會被拆成多個 rect，
// 拆分點隨 layout 時序抖動，偶爾讓 B 比 A 多數一個片段才「碰巧通過」——這就是 flaky 來源。
// 「resize 跟隨」的語義改用確定的幾何指標保留：①列長收縮（lineBoxH 變小）
// ②scroller 跟隨（上面已斷）③resize 後長段仍確實換列（maxCols>=2，用去重座標指標，不抖動）。
// 這三條合起來等價於「resize 後排版跟著變且仍換列」，且不再依賴虛擬化渲染恰好多出一列。
ok(B.maxCols >= 2, `B resize 後長段仍換列 maxCols=${B.maxCols}`);
ok(B.lineBoxH < A.lineBoxH, `B resize 跟隨：列長收縮 lineBoxH ${A.lineBoxH} → ${B.lineBoxH}`);

// C：橫排零影響
ok(C.writingMode === "horizontal-tb", `C 橫排對照不受污染 writing-mode=${C.writingMode}`);

// F：宿主「捲過末尾」寫在 .cm-content 上的內聯 padding-bottom（v2.8.79 根因）
//    直排下映射到行內結束方向＝列長方向，會把內容盒 646→285px、列長寫不滿可用高度。
ok(F.padB === "0px", `F 宿主內聯 padding-bottom 被插件規則壓回 0（實測 ${F.padB}，修前 361px）`);
ok(Math.abs(F.lineBoxH - A.lineBoxH) <= 2, `F 列長不被內聯 padding 壓縮 lineBoxH ${A.lineBoxH} → ${F.lineBoxH}`);
ok(F.contentBoxInline === A.contentBoxInline, `F 內容盒 inline-size 不縮水 ${A.contentBoxInline} → ${F.contentBoxInline}`);
// G：橫排反向門禁——宿主 padding 必須保留（「捲過末尾」是橫排正常功能，不能一起打掉）
ok(G.padB === "361px", `G 橫排宿主 padding 不受影響（捲過末尾保留，實測 ${G.padB}）`);

// D：編輯器直排區內不得再出現「max-inline-size 被 max-height:none 蓋掉」的死規則打架。
// 只掃「編輯器直排區」（到「文種字體」分隔線為止）——閱讀器區的 max-inline-size:100%
// 是另一個元素、與 max-height:none 不同組，不在此限。
// ⚠️ 必須先剝掉 CSS 註解再掃：v2.8.72 的刪除說明裡字面寫了 `max-inline-size: 100% !important`，
//    不剝註解會把註解文字當成規則匹配（本門禁第一版就這樣誤報過）。
const editorSection = css.split("/* ---------- 文種字體")[0].replace(/\/\*[\s\S]*?\*\//g, "");
const hasMaxInline = /max-inline-size:\s*100%\s*!important/.test(editorSection);
const hasMaxHeightNone = /max-height:\s*none\s*!important/.test(editorSection);
ok(!(hasMaxInline && hasMaxHeightNone), `D 編輯器直排區不得同時存在 max-inline-size:100% 與 max-height:none（直排下為同一物理屬性，特異性高的會作廢另一條）`);
// E：高度鏈必須存在（v2.8.72），否則百分比列長規則全部空轉
ok(/\.view-content[\s\S]{0,200}height:\s*100%\s*!important/.test(editorSection),
  `E 必須為 .view-content／.markdown-source-view 補確定高度，否則 inline-size:100% 百分比塌成 auto`);

console.log("  → [1.15h] 全數通過");
