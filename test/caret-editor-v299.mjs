// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry

// 直排自繪光標＝已退役功能（凍結源碼存本地 lilium資料/附录/，不入庫）。
// 本檔僅保留「防復活」反向守衛，全部讀活檔（src/＋styles.css）：
// ①verticalCaret 設置鍵不得回到 src/settings.ts；
// ②自繪光標 CSS 產物不得回到 styles.css；
// ③editor-caret.ts 不得回到 src/。
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const settings = readFileSync(join(root, "src/settings.ts"), "utf8");
const styles = readFileSync(join(root, "styles.css"), "utf8");

let n = 0;
const test = (name, fn) => {
  n++;
  try { fn(); console.log("ok", n, "-", name); }
  catch (e) { console.error("not ok", n, "-", name, "\n  ", e.message); process.exitCode = 1; }
};
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

test("自繪光標默認關閉：settings.verticalCaret 已隨功能退役——反向斷言防復活", () => {
  assert(!settings.includes("verticalCaret"), "verticalCaret 已退役，settings 不得復活此鍵");
});

test("styles.css 不得殘留／復活自繪光標 CSS 產物（註釋中的退役說明不算）", () => {
  const cssNoComment = styles.replace(/\/\*[\s\S]*?\*\//g, "");
  assert(!cssNoComment.includes("li-caret-blink"), "閃爍 keyframes li-caret-blink 已退役，不得復活");
  assert(!cssNoComment.includes(".li-cm-caret-layer"), "自繪層類名 .li-cm-caret-layer 已退役，不得復活");
  assert(!cssNoComment.includes("--caret-color"), "--caret-color 變數已退役，不得復活");
});

test("editor-caret.ts 不得回到 src/（功能已退役，凍結源碼僅存本地附錄）", () => {
  assert(!existsSync(join(root, "src", "editor-caret.ts")), "src/editor-caret.ts 不得復活");
});
console.log(`caret-editor-v299: ${n} 項`);
