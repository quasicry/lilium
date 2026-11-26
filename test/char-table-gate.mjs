// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry

/**
 * test/char-table-gate.mjs — 檢字表相關不變量門禁
 *
 * 收口「檢字表搬到轉寫面板」這一輪清理的契約，全部反向可驗證（任一不成立都會轉紅）：
 *
 *   A. 歸宿：檢字表渲染只准在轉寫面板（translit-panel.ts）。
 *      view.ts / settings.ts 不得再 import / 呼叫 renderCharTableInto、fillSchemeSelect。
 *      —— 防止「清理一半」：側欄 / 設定頁又悄悄長出檢字表。
 *
 *   B. 死選擇器不得復活：styles.css 裡 li-(corpus|col|parallel)* 家族選擇器，
 *      凡是 src 不再產出的（死），一律不能出現在 CSS 規則中（註解除外）。
 *      —— 防止 clean_dead_css.py 清掉的 39 個死選擇器被重新加回。
 *
 *   C. 逐方案 roman 列正確：
 *      - siddham-* 方案的 native 必須全為悉曇碼位（U+11580–U+115FF）。
 *
 *   D. 檢字表無重複列：每個方案的 charTable 不得有完全相同的 (native, roman) 重複列。
 *
 * 用法：node test/char-table-gate.mjs
 */
import assert from "node:assert";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "li-ctg-"));

let fails = 0;
const check = (name, cond, detail) => {
  if (cond) console.log(`  ✓ ${name}`);
  else {
    fails++;
    console.error(`  ✗ ${name}${detail ? " — " + detail : ""}`);
  }
};

/* ---------- A. 檢字表歸宿：只准在轉寫面板 ---------- */
// view.ts 已隨電子書閱讀器退役——守衛改為「不得回到 src/」（不需鏡像檔）：
// 若復原 view.ts 而把檢字表 ItemView 帶回 src/，這條斷言立即翻紅。
const readSrc = (rel) => fs.readFileSync(path.join(ROOT, "src", rel), "utf8");
const settingsSrc = readSrc("settings.ts");
const panelSrc = readSrc(path.join("dict", "translit-panel.ts"));

check("view.ts 不應回到 src/（電子書閱讀器已退役）", !fs.existsSync(path.join(ROOT, "src", "view.ts")));
check("src/ 不得出現 renderCharTableInto／fillSchemeSelect 於 translit-panel 以外",
  (() => {
    // 白名單：檢字表 UI 的定義點與面板入口（轉寫面板家族）。
    const allow = new Set([
      path.join(ROOT, "src", "dict", "translit-panel.ts"),
      path.join(ROOT, "src", "translit-ui.ts"),
    ]);
    const walk = (dir) => {
      for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, ent.name);
        if (ent.isDirectory()) { if (walk(p)) return true; continue; }
        if (!/\.ts$/.test(ent.name) || allow.has(p)) continue;
        if (/renderCharTableInto|fillSchemeSelect/.test(fs.readFileSync(p, "utf8"))) return true;
      }
      return false;
    };
    return !walk(path.join(ROOT, "src"));
  })());
check("renderCharTableInto 不應出現在 settings.ts", !/renderCharTableInto/.test(settingsSrc));
check("fillSchemeSelect 不應出現在 settings.ts", !/fillSchemeSelect/.test(settingsSrc));
check("renderCharTableInto 應出現在 translit-panel.ts", /renderCharTableInto/.test(panelSrc));
check("translit-panel 應含下拉式檢字表（<select> + optgroup）", /<select|<optgroup|createEl\(.select|createEl\(.optgroup/.test(panelSrc));

/* ---------- B. 死選擇器不得復活 ---------- */
const cssRaw = fs.readFileSync(path.join(ROOT, "styles.css"), "utf8");
const cssNoComment = cssRaw.replace(/\/\*[\s\S]*?\*\//g, ""); // 註解裡的歷史提及不算
const fam = new Set(
  [...cssNoComment.matchAll(/\.((?:li-(?:corpus|col|parallel)[\w-]*))/g)].map((m) => m[1]),
);
// 掃 src 實際產出的 class 字面量（cls: 字串 + .li-xxx 字面量），遞迴子目錄
const live = new Set();
function walk(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === "node_modules") continue;
      walk(p);
    } else if (ent.name.endsWith(".ts")) {
      const s = fs.readFileSync(p, "utf8");
      for (const m of s.matchAll(/cls:\s*['"`]([^'"`]*)/g)) {
        for (const t of m[1].split(/\s+/)) if (t) live.add(t);
      }
      for (const m of s.matchAll(/li-(?:corpus|col|parallel)[\w-]*/g)) live.add(m[0]);
    }
  }
}
walk(path.join(ROOT, "src"));
const dead = [...fam].filter((c) => !live.has(c)).sort();
check(
  `styles.css 不得含死選擇器（家族 ${fam.size} / live ${live.size}）`,
  dead.length === 0,
  dead.length ? `仍出現 ${dead.length} 個：${dead.join(", ")}` : "",
);

/* ---------- C / D. 逐方案檢字表正確性（需打包 translit 模組） ---------- */
execFileSync(
  path.join(ROOT, "node_modules", ".bin", "esbuild"),
  [
    path.join(ROOT, "test", "lib-export.ts"), "--bundle", "--format=esm",
    `--outfile=${path.join(TMP, "lib.mjs")}`, "--log-level=silent",
  ],
);
const { listSchemes } = await import(path.join(TMP, "lib.mjs"));

const IAST_DIAC = /[āīūṛṝḷḹṃḥḻṅñṇṭḍśṣǰ]/;
const isSiddham = (s) =>
  [...s].every((c) => {
    const cp = c.codePointAt(0);
    return cp >= 0x11580 && cp <= 0x115ff;
  });

const schemes = listSchemes();
let checked = 0;
for (const sc of schemes) {
  const ct = sc.charTable || [];
  if (ct.length === 0) continue;
  checked++;
  const pairs = ct.map((e) => e.native + "" + e.roman);
  const dup = pairs.length - new Set(pairs).size;
  check(`${sc.id}（${ct.length} 筆）檢字表無重複列`, dup === 0, `重複 ${dup} 列`);

  if (sc.id.endsWith("-hk")) {
    const d = ct.filter((e) => IAST_DIAC.test(e.roman)).length;
    check(`${sc.id}（HK）roman 無 IAST 變音符`, d === 0, `${d} 筆仍含 IAST 變音符`);
  }
  if (sc.id.startsWith("siddham")) {
    // r68：native「—」＝說明列（無固定單鍵輸出），豁免悉曇碼位斷言
    const bad = ct.filter((e) => e.native !== "—" && !isSiddham(e.native)).length;
    check(`${sc.id} native 全為悉曇碼位`, bad === 0, `${bad} 筆非悉曇碼位`);
  }
}
check("至少檢查到一個帶檢字表的方案", checked > 0, `實際 ${checked}`);

/* ---------- E. 覆蓋審計固化：引擎有鍵 ⇒ 檢字表必列 ---------- */
{
  const digitRows = (id, lo, hi, label) => {
    const t = listSchemes().find((x) => x.id === id).charTable;
    const cps = new Set(t.flatMap((r) => [...r.native].map((c) => c.codePointAt(0))));
    let miss = 0;
    for (let d = lo; d <= hi; d++) if (!cps.has(d)) miss++;
    check(`${id} ${label} 實列覆蓋`, miss === 0, `${miss} 碼位缺列`);
  };
  digitRows("sanskrit-iast", 0x0966, 0x096f, "天城數字 ०-९");
  digitRows("pali-iast", 0x0966, 0x096f, "天城數字 ०-९");
  digitRows("mongolian", 0x1810, 0x1819, "蒙文數字 ᠐-᠙");
  digitRows("mongolian", 0x1800, 0x180a, "蒙文標點");
  const zc = listSchemes().find((x) => x.id === "zanabazar").charTable;
  check("zanabazar 11A00 載體單形列", zc.some((r) => r.native.codePointAt(0) === 0x11a00));

}

console.log(fails === 0 ? "\nCHAR-TABLE GATE: ALL OK" : `\nCHAR-TABLE GATE: ${fails} 項異常`);
process.exit(fails === 0 ? 0 : 1);

