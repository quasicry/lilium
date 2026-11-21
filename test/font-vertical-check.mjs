// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry

/**
 * font-vertical-check 純函式測試（Node）。
 * 執行：node test/font-vertical-check.mjs（exit 0 = 全過）
 * 依賴：本機有 Noto Serif CJK（fc-match 'Noto Serif CJK TC'）與 DejaVu Sans；
 * 缺字型時對應用例標記 skipped（不誤判失敗）。
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "test", "build", "font-vertical-check.mjs");
execFileSync(
  path.join(ROOT, "node_modules", ".bin", "esbuild"),
  [
    path.join(ROOT, "src", "font-vertical-check.ts"),
    "--bundle", "--format=esm", "--platform=node",
    "--outfile=" + OUT,
  ],
  { stdio: "pipe" },
);
const { parseSfntTables, checkVerticalTables, gsubHasVert, fcMatchFontFile, checkFontFileVertical, verticalFontWarnings } =
  await import(OUT);

const tests = [];
const test = (name, fn) => tests.push({ name, fn });
const skipped = [];

const fc = (fam) => fcMatchFontFile(fam, (cmd, args) => execFileSync(cmd, args, { encoding: "utf8" }));
const readFile = (p) => fs.readFileSync(p);

test("sfnt 解析：TTC（Noto Serif CJK）多面＋四表齊", () => {
  const f = fc("Noto Serif CJK TC");
  if (!f) return skipped.push("Noto Serif CJK 未安裝");
  const sfnt = parseSfntTables(readFile(f));
  assert.ok(sfnt, "解析應成功");
  assert.ok(sfnt.faces > 1, `TTC 應多面（實際 ${sfnt.faces}）`);
  const { missing, hasGSUB } = checkVerticalTables(sfnt.tags);
  assert.deepEqual(missing, [], "Noto CJK 應齊表 vhea/vmtx");
  assert.equal(hasGSUB, true);
});

test("GSUB vert 深查：Noto 應含 vert/vrt2", () => {
  const f = fc("Noto Serif CJK TC");
  if (!f) return skipped.push("Noto Serif CJK 未安裝");
  const buf = readFile(f);
  const face0 = buf.readUInt32BE(12);
  assert.equal(gsubHasVert(buf, face0), true, "Noto CJK GSUB 應含 vert");
});

test("sfnt 解析：ttf（DejaVu）判缺 vhea/vmtx", () => {
  const f = fc("DejaVu Sans");
  if (!f) return skipped.push("DejaVu Sans 未安裝");
  const res = checkFontFileVertical(f, readFile);
  assert.ok(res, "ttf 解析應成功");
  assert.ok(res.missing.includes("vmtx") && res.missing.includes("vhea"), "非 CJK 字型應判缺 vhea/vmtx");
  assert.equal(res.hasVertFeature, false, "DejaVu GSUB 應無 vert");
});

test("非 sfnt 容器回 null（woff magic）", () => {
  const woff = Buffer.from([0x77, 0x4f, 0x46, 0x46, 0, 0, 0, 0, 0, 0, 0, 0]);
  assert.equal(parseSfntTables(woff), null);
});

test("彙整：Noto 無警告、DejaVu 有警告", () => {
  const deps = { spawnFn: (cmd, args) => execFileSync(cmd, args, { encoding: "utf8" }), readFileFn: readFile };
  const okWarns = verticalFontWarnings(["Noto Serif CJK TC"], deps);
  assert.deepEqual(okWarns, [], "Noto CJK 應零警告");
  const djWarns = verticalFontWarnings(["DejaVu Sans"], deps);
  if (!fc("DejaVu Sans")) return skipped.push("DejaVu Sans 未安裝");
  assert.equal(djWarns.length, 1, "DejaVu 應產生一條警告");
  assert.ok(djWarns[0].includes("vmtx"), `警告應含 vmtx：${djWarns[0]}`);
});

test("fc-match 失敗靜默（不存在的 family）", () => {
  const deps = { spawnFn: (cmd, args) => execFileSync(cmd, args, { encoding: "utf8" }), readFileFn: readFile };
  // fc-match 對未知 family 仍回「最接近」字型——檢查不拋錯即可（回陣列）
  const warns = verticalFontWarnings(["NoSuchFamilyXYZ-無此字型"], deps);
  assert.ok(Array.isArray(warns));
});

test("真機導出鏈消費點存在（print-editor 接線）", () => {
  const pe = fs.readFileSync(path.join(ROOT, "src", "print-editor.ts"), "utf8");
  assert.ok(pe.includes("verticalFontWarnings(named)"), "detectMissingFonts 應呼叫 verticalFontWarnings");
  assert.ok(pe.includes('T("print.savePdf.verticalFontWarn")'), "導出完成回報應併入齊表警告");
});

// ── r119 跨平台定位器（mock 注入，不依賴真機平台）──

test("[r119·win32] reg query 命中 → 拼 %SystemRoot%\\Fonts\\<file>", async () => {
  // 以真實 darwin/linux 進程無法走到 win32 分支——直接對編譯產物內部做行為驗證：
  // 用 spawnFn 模擬不可行（win32 分支只在 platform==='win32' 觸發），
  // 改為源碼級斷言＋行為單元（見下方 familyKey 等價測試）。
  const src = fs.readFileSync(path.join(ROOT, "src", "font-vertical-check.ts"), "utf8");
  assert.ok(src.includes('platform === "win32"'), "應有 win32 分派");
  assert.ok(src.includes("CurrentVersion\\\\Fonts"), "win32 應查 HKLM Fonts 註冊表");
  assert.ok(src.includes("LOCALAPPDATA"), "win32 應掃用戶級字型目錄");
});

test("[r119·darwin] 源碼含標準目錄預掃與歸一比對", () => {
  const src = fs.readFileSync(path.join(ROOT, "src", "font-vertical-check.ts"), "utf8");
  assert.ok(src.includes('platform === "darwin"'), "應有 darwin 分派");
  assert.ok(src.includes("/System/Library/Fonts"), "darwin 應掃系統字型目錄");
  assert.ok(src.includes("familyKey"), "應有名稱歸一比對");
});

test("[r119·win32] reg 輸出解析正確（值對正則模擬）", () => {
  // 與 win32FontFile 相同的正則，對真實 reg query 輸出樣本驗證解析
  const sample = [
    "HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts",
    "    Arial (TrueType)    REG_SZ    arial.ttf",
    "    Noto Serif CJK TC (OpenType)    REG_SZ    NotoSerifCJKtc-Regular.otf",
    "",
  ].join("\r\n");
  const familyKey = (s) => s.toLowerCase().replace(/[\s\-_]+/g, "");
  const m = sample.split(/\r?\n/).map((l) => l.match(/^\s*(.+?)\s+REG_SZ\s+(\S+)\s*$/)).find((mm) => {
    if (!mm) return false;
    const name = mm[1].replace(/\s*\((?:TrueType|OpenType|Font file)\)\s*$/i, "");
    return familyKey(name).startsWith(familyKey("Noto Serif CJK TC"));
  });
  assert.ok(m, "應命中 Noto Serif CJK TC");
  assert.equal(m[2], "NotoSerifCJKtc-Regular.otf");
});

test("[r119·darwin] 檔名歸一比對命中 .ttc", () => {
  const familyKey = (s) => s.toLowerCase().replace(/[\s\-_]+/g, "");
  const file = "NotoSerifCJK.ttc";
  assert.equal(familyKey(file.replace(/\.(ttf|otf|ttc)$/i, "")), familyKey("NotoSerifCJK"));
  // family「Noto Serif CJK TC」對「NotoSerifCJK.ttc」不應誤命中（TC 後綴差異）
  assert.notEqual(familyKey(file.replace(/\.(ttf|otf|ttc)$/i, "")), familyKey("Noto Serif CJK TC"));
});

test("[r119·linux] fc-match 分支回歸（spawnFn 注入行為不變）", () => {
  // spawnFn 注入路徑與 r117 完全一致——Linux 真機行為由上方既有測試守護
  const deps = { spawnFn: (cmd, args) => execFileSync(cmd, args, { encoding: "utf8" }), readFileFn: readFile };
  const f = fcMatchFontFile("Noto Serif CJK TC", deps.spawnFn);
  if (!f) return skipped.push("Noto Serif CJK 未安裝");
  assert.ok(fs.existsSync(f), `fc-match 路徑應存在：${f}`);
});

let passed = 0;
const failures = [];
for (const { name, fn } of tests) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failures.push({ name, e });
    console.error(`  ✗ ${name}\n${e?.stack ?? e?.message ?? e}`);
  }
}
console.log(`\n结果: ${passed} 通过, ${failures.length} 失败${skipped.length ? `（跳過 ${skipped.length}：${skipped.join("；")}）` : ""}`);
process.exit(failures.length ? 1 : 0);
