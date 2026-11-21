// SPDX-License-Identifier: AGPL-3.0-or-later
/* viewport-fit 純函式單元測試（軟鍵盤適配，接口） */
import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "lilium-vv-"));
execFileSync(path.join(ROOT, "node_modules", ".bin", "esbuild"),
  [path.join(ROOT, "src", "dict", "viewport-fit.ts"), "--bundle", "--format=esm",
   `--outfile=${path.join(TMP, "vf.mjs")}`, "--log-level=silent"], { stdio: "pipe" });
const { computeVvFit, computeKbFitHeight, KB_MIN_INSET_PX, KB_MIN_PANEL_PX } = await import(path.join(TMP, "vf.mjs"));

let passed = 0, failed = 0;
const test = (name, fn) => {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.error(`  ✗ ${name}: ${e.message}`); }
};

console.log("=== viewport-fit（軟鍵盤適配 r48）===");
test("桌面：vv == innerHeight → 不打閘", () => {
  assert.deepEqual(computeVvFit(800, 800), { shrunk: false, height: null, hostHandled: false });
});
test("覆蓋式鍵盤：vv 縮到 400/800 → 打閘 height=400、宿主未處理", () => {
  assert.deepEqual(computeVvFit(400, 800), { shrunk: true, height: 400, hostHandled: false });
});
test("宿主已處理（--keyboard-height>0）→ 仍回報 shrunk（接線層據 hostHandled 跳過）", () => {
  assert.deepEqual(computeVvFit(400, 800, 2, true), { shrunk: true, height: 400, hostHandled: true });
});
test("容差 2px 內不觸發（縮放抖動）", () => {
  assert.deepEqual(computeVvFit(798.5, 800), { shrunk: false, height: null, hostHandled: false });
});
test("Android adjustResize（vv≈inner）不打閘——不會縮兩次", () => {
  assert.deepEqual(computeVvFit(799.9, 800), { shrunk: false, height: null, hostHandled: false });
});
test("非數值防禦 → 不打閘", () => {
  assert.deepEqual(computeVvFit(NaN, 800), { shrunk: false, height: null, hostHandled: false });
  assert.deepEqual(computeVvFit(400, Infinity), { shrunk: false, height: null, hostHandled: false });
});
test("vv 比佈局視窗更大（外接屏熱插拔瞬態）→ 不打閘", () => {
  assert.deepEqual(computeVvFit(900, 800), { shrunk: false, height: null, hostHandled: false });
});
test("NaN tolerance 防禦：diff=NaN → 不打閘", () => {
  assert.deepEqual(computeVvFit(800, 800, NaN), { shrunk: false, height: null, hostHandled: false });
});


/* ---------- 自算高度（computeKbFitHeight，v3） ---------- */
test("kb-fit：kh=300 鍵盤開 → 面板高=min(vv底, innerH-kh)-面板頂", () => {
  assert.equal(computeKbFitHeight(500, 0, 800, 300, 100), 400);
});
test("kb-fit：kh=0 但 vv 差值訊號 → 同樣接管", () => {
  assert.equal(computeKbFitHeight(500, 0, 800, 0, 100), 400);
});
test("kb-fit：vv.offsetTop 補償（vv 上移場景）", () => {
  assert.equal(computeKbFitHeight(450, 50, 800, 0, 100), 400);
});
test(`kb-fit：inset<${KB_MIN_INSET_PX} 誤觸防護 → null（鍵盤未開）`, () => {
  assert.equal(computeKbFitHeight(760, 0, 800, 0, 100), null);
});
test(`kb-fit：算出高度<${KB_MIN_PANEL_PX} 底線保護 → null（不壓成一條縫）`, () => {
  assert.equal(computeKbFitHeight(300, 0, 800, 300, 500), null);
});
test("kb-fit：非數值防禦 → null", () => {
  assert.equal(computeKbFitHeight(NaN, 0, 800, 300, 100), null);
  assert.equal(computeKbFitHeight(500, 0, Infinity, 300, 100), null);
});

console.log(`\n结果: ${passed} 通过, ${failed} 失败`);
if (failed) process.exit(1);

/* ---------- r52 白塊殘留：kbOpen=false 閘（呼叫端 apply() 層） ---------- */
/* 修復在 attachVvFit.apply()（非匯出純函式）：kbOpen=false 時不調 computeKbFitHeight
   直接清 li-kb-fit。源碼掃描斷言閘存在＋延遲雙查兜底掛接： */
test("r52：apply() 內 kbOpen=false → fitH=null 閘存在（源碼掃描）", () => {
  const src = fs.readFileSync(path.join(ROOT, "src", "dict", "viewport-fit.ts"), "utf8");
  assert.ok(src.includes("const fitH = !kbOpen"), "kbOpen=false 短路閘");
  assert.ok(src.includes("onFocusOutDeferred"), "focusout 延遲雙查兜底");
  assert.ok(src.includes("setTimeout(apply, 300)"), "300ms 殘留清掃");
});
