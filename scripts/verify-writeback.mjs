// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry

/**
 * 交付回寫反查：不信任流水線的自述，直接從 tar.gz 解包驗證「本次改動真的在交付物裡」。
 * 用法：node scripts/verify-writeback.mjs
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ARTIFACTS = path.resolve(ROOT, "..", "artifacts");
let pass = 0;
const fails = [];
const ok = (name, cond, detail = "") => {
  if (cond) { pass++; console.log(`  ✓ ${name}${detail ? "（" + detail + "）" : ""}`); }
  else { fails.push(name + (detail ? "：" + detail : "")); console.log(`  ✗ ${name}${detail ? "（" + detail + "）" : ""}`); }
};
const sha = (p) => createHash("sha256").update(fs.readFileSync(p)).digest("hex");

const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8"));
const version = manifest.version;
const tarPath = path.join(ARTIFACTS, `lilium-handoff-v${version}-hardened.tar.gz`);
const manPath = path.join(ARTIFACTS, `lilium-handoff-v${version}-hardened.manifest.json`);

console.log(`\n═══ 交付回寫反查 · v${version} ═══\n`);
console.log("── 1. 產物存在性 ──");
ok("tar.gz 存在", fs.existsSync(tarPath), `${(fs.statSync(tarPath).size / 1048576).toFixed(1)} MiB`);
ok("manifest 存在", fs.existsSync(manPath));

console.log("\n── 2. manifest 記錄的哈希與實際產物一致 ──");
const dm = JSON.parse(fs.readFileSync(manPath, "utf8"));
const actualSha = sha(tarPath);
ok("sha256 與實際 tar.gz 相符", dm.sha256 === actualSha, dm.sha256?.slice(0, 16) + "…");
ok("sizeBytes 與實際相符", dm.sizeBytes === fs.statSync(tarPath).size || String(dm.size) === String(fs.statSync(tarPath).size),
  `${fs.statSync(tarPath).size} B`);

console.log("\n── 3. 源碼樹 → 插件安裝包 的回寫（逐字節）──");
const installDir = path.join(ROOT, "插件安裝包", "li");
for (const f of ["main.js", "manifest.json", "styles.css"]) {
  const a = path.join(ROOT, f);
  const b = path.join(installDir, f);
  if (!fs.existsSync(b)) { ok(`插件安裝包/lilium/${f}`, false, "缺失"); continue; }
  ok(`插件安裝包/li/${f} 與源碼樹逐字節一致`, sha(a) === sha(b), `${fs.statSync(b).size.toLocaleString()} B`);
}

console.log("\n── 4. 從 tar.gz 解包反查（真正要交付的那一份）──");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "li-verify-"));
execFileSync("tar", ["-xzf", tarPath, "-C", tmp]);
const found = [];
const walk = (d) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else found.push(p);
  }
};
walk(tmp);
ok("tar.gz 解包成功", found.length > 100, `${found.length} 個檔案`);

const pick = (suffix) => found.find((p) => p.endsWith(suffix));
const tarMain = pick("插件安裝包/lilium/main.js") || found.find((p) => p.endsWith("/lilium/main.js"));
const tarCss = pick("插件安裝包/lilium/styles.css") || found.find((p) => p.endsWith("/lilium/styles.css"));
const tarSrc = found.find((p) => p.endsWith("src/reader-paged.ts"));
const tarSettings = found.find((p) => p.endsWith("src/settings.ts"));
const tarI18n = found.find((p) => p.endsWith("src/i18n.ts"));
const tarRpBrowser = found.find((p) => p.endsWith("test/reader-pager-browser.mjs"));

ok("包內含 插件安裝包/lilium/main.js", !!tarMain);
ok("包內 main.js 與源碼樹逐字節一致", tarMain && sha(tarMain) === sha(path.join(ROOT, "main.js")));
ok("包內含 插件安裝包/lilium/styles.css", !!tarCss);
ok("包內 styles.css 與源碼樹逐字節一致", tarCss && sha(tarCss) === sha(path.join(ROOT, "styles.css")),
  tarCss ? `${fs.statSync(tarCss).size.toLocaleString()} B` : "");
ok("包內含源碼 src/reader-paged.ts", !!tarSrc);
ok("包內含源碼 src/settings.ts", !!tarSettings);
ok("包內含源碼 src/i18n.ts", !!tarI18n);
ok("包內含門禁 test/reader-pager-browser.mjs", !!tarRpBrowser);

/* ── 本次兩項改動的實質內容反查 ── */
console.log("\n── 5. 【修復 A】分頁閱讀正文空白：preview 不得 display:none ──");
const css = fs.readFileSync(path.join(ROOT, "styles.css"), "utf8");
const hideRule = css.match(/body\.li-reader-paged\s+[^{]*\.markdown-preview-view\s*\{([^}]*)\}/);
ok("找到 .markdown-preview-view 隱藏規則", !!hideRule);
const body = hideRule ? hideRule[1] : "";
ok("規則為保盒隱藏（position:absolute）", /position:\s*absolute/.test(body));
ok("規則為保盒隱藏（visibility:hidden）", /visibility:\s*hidden/.test(body));
ok("規則不再 display:none（真因已除）", !/display:\s*none/.test(body));
const rp = fs.readFileSync(path.join(ROOT, "src", "reader-paged.ts"), "utf8");
ok("reader-paged.ts 不再寫 display:none", !/setProperty\("display",\s*"none"\)/.test(rp));
const mainJsTxt = fs.readFileSync(path.join(ROOT, "main.js"), "utf8");
ok("打包後的 main.js 無 display:none .hide（回寫確實生效）",
  !/setProperty\("display","none"\)/.test(mainJsTxt) || !/markdown-preview-view/.test(mainJsTxt));

console.log("\n── 6. 【B】翻頁樣式五檔 ──");
const st = fs.readFileSync(path.join(ROOT, "src", "settings.ts"), "utf8");
for (const v of ["smooth", "fadeFast", "slide", "book", "instant"]) {
  ok(`PAGE_TURN_STYLES 含 ${v}`, new RegExp(`\\["${v}", "set\\.readerPageTurn`).test(st));
}
ok("readerPageTurn 欄位走 PageTurnStyle", /readerPageTurn:\s*PageTurnStyle;/.test(st));
for (const kf of ["li-native-page-in", "li-native-page-slide", "li-native-page-book"]) {
  ok(`styles.css 含 @keyframes ${kf}`, css.includes(`@keyframes ${kf}`));
}
for (const c of ["smooth", "fadeFast", "slide", "book"]) {
  ok(`styles.css 含 body.li-reader-paged-${c} 規則`, new RegExp(`body\\.li-reader-paged-${c}\\b`).test(css));
}
ok("reader-paged.ts 有方向推導 applyTurnDirection", rp.includes("applyTurnDirection"));
ok("方向變數 --li-turn-x 已寫入", rp.includes("--li-turn-x"));
ok("方向變數 --li-turn-rot 已寫入", rp.includes("--li-turn-rot"));
ok("方向依 forwardLeft 推導（非寫死）", /forwardLeft\s*\?\s*-1\s*:\s*1/.test(rp));
// main.js 是壓縮產物，仍應保留字串常量
for (const s of ["--li-turn-x", "--li-turn-rot", "li-reader-paged-", "fadeFast"]) {
  ok(`打包後的 main.js 含字串「${s}」（回寫確實生效）`, mainJsTxt.includes(s));
}
const i18n = fs.readFileSync(path.join(ROOT, "src", "i18n.ts"), "utf8");
for (const k of ["set.readerPageTurnFadeFast", "set.readerPageTurnSlide", "set.readerPageTurnBook"]) {
  ok(`i18n 含 ${k} 且七語齊備`, (() => {
    const i = i18n.indexOf(`"${k}"`);
    if (i < 0) return false;
    const seg = i18n.slice(i, i + 900);
    return ['"zh"', '"zh-TW"', '"ja"', '"ko"', '"en"', '"fr"', '"de"'].every((l) => seg.includes(l));
  })());
}
ok("smooth 文案已由「平滑滑動」改對為「淡入」",
  /"set\.readerPageTurnSmooth"[\s\S]{0,80}"zh-TW":\s*"淡入"/.test(i18n));
const tp = fs.readFileSync(path.join(ROOT, "src", "typeset-popover.ts"), "utf8");
ok("排版調參浮層共用 PAGE_TURN_STYLES", tp.includes("PAGE_TURN_STYLES"));

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n═══ 反查結果：${pass} 通過，${fails.length} 失敗 ═══`);
if (fails.length) {
  for (const f of fails) console.error("  ✗ " + f);
  process.exit(1);
}
console.log("✅ 修改成果已完整回寫並進入交付產物");
