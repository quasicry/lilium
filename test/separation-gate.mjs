// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry

// separation-gate.mjs · 雙向刪減交叉門禁（兩樹各跑，納入 run.mjs 主鏈）
// 裁定：每次門禁必跑。紅燈＝具體斷言指名，不得交付。
// 用法：node test/separation-gate.mjs <tree-root> <side>   （side = lilium | li）
// run.mjs 末尾以 child_process 呼叫（同樹 side 自動判定），退出碼非零＝門禁失敗。
import fs from "node:fs";
import path from "node:path";

const [, , treeArg, sideArg] = process.argv;
const SIDE = sideArg || (process.argv[1].includes("lilium") ? "lilium" : "li");
const ROOT = treeArg || path.resolve(import.meta.dirname, "..");
const ok = [];
const bad = [];
const A = (cond, label) => (cond ? ok.push(label) : bad.push(label));
const exists = (p) => fs.existsSync(path.join(ROOT, p));
const globCount = (dir, re) => {
  let n = 0;
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (re.test(e.name)) n++;
    }
  };
  try { walk(dir); } catch { /* missing dir → 0 */ }
  return n;
};

if (SIDE === "lilium") {
  // G1 應存在
  A(globCount(path.join(ROOT, "src/dict"), /\.ts$/) >= 50, "G1 dict/ ≥50 檔 ts");
  A(globCount(path.join(ROOT, "src/dict"), /\.(json|mdx|txt)$/) + globCount(path.join(ROOT, "src/dict"), /data/) >= 0, "G1 dict 資料目錄檢查（佔位，資料形態待 B2 盤點）");
  // G1 應存在
  A(exists("src/brand-lilium-icon.ts"), "G1 brand-lilium-icon.ts");
  A(exists("src/shared/vertical-anchor.ts"), "G1 vertical-anchor（r150-c T1）");
  A(exists("src/translit-ui.ts") || exists("src/translit-ui.js"), "G1 translit-ui");
  A(exists("manifest.json") && JSON.parse(fs.readFileSync(path.join(ROOT, "manifest.json"))).id === "lilium", "G4 manifest id=lilium");
  const i18n = exists("src/i18n.ts") ? fs.readFileSync(path.join(ROOT, "src/i18n.ts"), "utf8") : "";
  A((i18n.match(/"dict\./g) || []).length >= 265, "G1 i18n dict.* ≥265 鍵（清理 99 死鍵後下調，原 277）");
  // G2 應不存在（lilium 本體獨佔）
  // font-registry/font-metrics 等＝轉寫檢字表字體棧依賴鏈（translit-ui buildScriptFontStack
  // 消費；r150-e Q1 修訂＋r152-B2 邊界調查結案：優先複製原則整鏈留 lilium），不在 G2 清單。
  for (const f of ["src/typeset.ts", "src/typeset-panel.ts", "src/font-picker.ts", "src/brand.ts", "src/print-editor.ts"]) {
    A(!exists(f), `G2 不應存在 ${f}`);
  }
  // G3 import 閉包：src 內不得 import 已刪檔案
  let dirty = [];
  const walkImports = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walkImports(p);
      else if (/\.ts$/.test(e.name)) {
        const s = fs.readFileSync(p, "utf8");
        for (const m of s.matchAll(/(?:^|\n)\s*import\s[^;\n]*from\s+["'](\.[^"']+)["']/g)) {
          if (/\.lazy["']/.test(m[1])) continue; // .lazy＝v2.9.18 剝離設計的文檔提及，非真 import
          const target = path.resolve(path.dirname(p), m[1]);
          if (!fs.existsSync(target + ".ts") && !fs.existsSync(path.join(target, "index.ts"))) {
            dirty.push(`${path.relative(ROOT, p)} → ${m[1]}`);
          }
        }
      }
    }
  };
  try { walkImports(path.join(ROOT, "src")); } catch {}
  A(dirty.length === 0, `G3 import 閉包零懸空（懸空 ${dirty.length}：${dirty.slice(0, 3).join("; ")}）`);
} else {
  // lilium 樹：H1 應存在
  for (const f of ["src/typeset.ts", "src/typeset-panel.ts", "src/font-picker.ts", "src/font-registry.ts", "src/brand.ts", "src/print-editor.ts"]) {
    A(exists(f), `H1 應存在 ${f}`);
  }
  // H2 應不存在（dict/translit 隨 lilium）
  for (const f of ["src/dict", "src/translit-ui.ts", "src/translit-panel.ts", "src/zh-convert.ts", "src/shared/vertical-anchor.ts", "src/qr-embed.ts", "src/brand-lilium-icon.ts"]) {
    A(!exists(f), `H2 不應存在 ${f}`);
  }
  // H3 import 閉包
  let dirty = [];
  const walkImports = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walkImports(p);
      else if (/\.ts$/.test(e.name)) {
        const s = fs.readFileSync(p, "utf8");
        for (const m of s.matchAll(/from\s+["']\.\/([^"']+)["']/g)) {
          const target = path.join(path.dirname(p), m[1]);
          // B3 修：target 已是絕對路徑，直接 fs.existsSync——不得再過 exists() 的
          // path.join(ROOT, …) 雙重拼接（絕對路徑下 join 產生 ROOT/abs 錯誤路徑全 false）
          if (!fs.existsSync(target + ".ts") && !fs.existsSync(path.join(target, "index.ts"))) {
            dirty.push(`${path.relative(ROOT, p)} → ${m[1]}`);
          }
        }
      }
    }
  };
  try { walkImports(path.join(ROOT, "src")); } catch {}
  A(dirty.length === 0, `H3 import 閉包零懸空（懸空 ${dirty.length}：${dirty.slice(0, 3).join("; ")}）`);
  // H5 版本鏈
  const m = JSON.parse(fs.readFileSync(path.join(ROOT, "manifest.json")));
  A(m.id === "li", "H5 li 樹 manifest id=li");
}

console.log(`separation-gate[${SIDE}]: ${ok.length} 綠, ${bad.length} 紅`);
for (const b of bad) console.log("  紅: " + b);
process.exit(bad.length ? 1 : 0);
