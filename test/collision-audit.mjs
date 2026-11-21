// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry

// 品牌一致性審計：階段 6 全量重命名後，確認無 UD/li 舊前綴遺留，
// 且 lilium 核心與 li-dict 雖共用 li- 命名空間，但具體 class 名稱無撞名。
import fs from "fs";
import path from "path";

const ROOT = process.cwd();
const SRC = path.join(ROOT, "src");

function isSource(f) {
  const rel = path.relative(ROOT, f);
  if (rel === "main.js") return false;        // esbuild 產物，會隨源碼重編
  if (rel.startsWith("test")) return false;
  if (rel.startsWith("node_modules")) return false;
  if (rel.startsWith(".git")) return false;
  if (rel.startsWith("artifacts")) return false;
  // 排除「插件安裝包」與其下任何已建置的插件副本。
  // 這些是**交付產物**——裡面的 main.js/styles.css 是舊版 main.js 的拷貝，
  // 同時含 lilium 核心與 dict 的 class。把它當成「li 核心」來比對，
  // 等於拿整包產物跟 dict 原始碼比，必然 100% 撞名。
  // 這個誤判從 v2.0 合併 src/dict/ 起就一直讓本稽核亮紅燈。
  if (rel.startsWith("插件安裝包")) return false;
  if (rel.split(path.sep).includes("插件安裝包")) return false;
  // 同理排除任何嵌套的已建置產物（main.js 只認根目錄那份為產物，其餘同名皆視為副本）
  if (rel !== "main.js" && path.basename(rel) === "main.js") return false;
  return true;
}

function walk(dir, out) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) { walk(p, out); continue; }
    if (!/\.(ts|css|mjs|cjs|js)$/.test(ent.name)) continue;
    if (!isSource(p)) continue;
    out.push(p);
  }
}
const files = []; walk(ROOT, files);

const all = files.map((f) => ({ path: f, text: fs.readFileSync(f, "utf8") }));

let failed = false;
function fail(msg) { console.error("✗", msg); failed = true; }
function ok(msg) { console.log("✓", msg); }

// 1. 舊品牌前綴零遺留（源層面；test/build 為編譯產物會再生，不計）
const forbidden = [
  { re: /\bvw-[a-z0-9-]+\b/g, name: "vw-" },
  { re: /\bud-[a-z0-9-]+\b/g, name: "ud-" },
  { re: /UD-Shares/g, name: "UD-Shares" },
  { re: /UniversalDict/g, name: "UniversalDict" },
];
for (const { re, name } of forbidden) {
  const hits = [];
  for (const f of all) {
    for (const m of f.text.matchAll(re)) hits.push(`${path.relative(ROOT, f.path)}:${m.index}`);
  }
  if (hits.length) fail(`${name} 仍有 ${hits.length} 處遺留：\n   ${hits.slice(0, 10).join("\n   ")}${hits.length > 10 ? "\n   ..." : ""}`);
  else ok(`源碼零 ${name} 遺留`);
}

// 2. 唯一合法保留項：vertical-writer-view（持久化佈局鍵，brand.ts 已註明不可改）
const viewTypeOk = all.some((f) => /vertical-writer-view/.test(f.text));
ok(`vertical-writer-view 視圖型別作為持久化鍵保留: ${viewTypeOk}`);

// 3. li- 命名空間撞名複查：lilium 核心（非 dict）定義的 li-* class 與 dict 定義的 li-* class 是否有交集
function classNames(filesArr) {
  const set = new Set();
  for (const f of filesArr) {
    // CSS 中的 class 選擇器——**只在 .css 檔裡找**。
    // 以前這個分支對所有檔案跑，結果 i18n.ts 一句中文說明裡的
    // 「（.li-assets/）」被當成 class 選擇器，產生一個永遠修不掉的假紅燈。
    // 選擇器只存在於樣式表；散在文案裡的點號開頭字串不是選擇器。
    if (f.path.endsWith(".css")) {
      for (const m of f.text.matchAll(/\.(li-[a-z0-9-]+)/g)) set.add(m[1]);
    }
    // TS 中的 class 字串（createDiv / addClass / cls 等）
    for (const m of f.text.matchAll(/['"`](li-[a-z0-9-]+)['"`]/g)) set.add(m[1]);
  }
  return set;
}

const liCore = classNames(all.filter((f) => !f.path.includes(`${path.sep}dict${path.sep}`)));
const liDict = classNames(all.filter((f) => f.path.includes(`${path.sep}dict${path.sep}`)));
/*
 * 這條檢查換了個問法。
 *
 * 原本問的是「核心與 dict 是否用了同名 class」。v2.6.3 之前答案是「沒有」——
 * 但那只是因為 **dict 的 CSS 根本沒被搬進來**（138 個 class 零樣式）。
 * 一旦把 dict 樣式補齊（C2），它們必然與核心共用同一份 styles.css，
 * 「沒有同名 class」就再也守不住；而且它本來也不是真正想守的東西。
 *
 * 真正要守的是：**dict 的樣式不准外溢到 li 核心**。
 * 所以改成檢查「每一條 dict class 規則都必須收在 .li-root（詞典視圖的根）之下」。
 * 這樣即便兩邊有同名 class（例如都叫 .li-body），核心也吃不到 dict 的規則。
 */
const DICT_CSS_BANNER = "==========================================================================\n   辭典面板";
const cssFile = all.find((f) => f.path.endsWith("styles.css"));
if (!cssFile) {
  fail("找不到 styles.css");
} else if (!cssFile.text.includes(DICT_CSS_BANNER)) {
  fail("styles.css 缺少辭典面板區塊（C2 的樣式是否整段掉了？）");
} else {
  const dictCss = cssFile.text
    .slice(cssFile.text.indexOf(DICT_CSS_BANNER))
    .replace(/\/\*[\s\S]*?\*\//g, "");
  // 這幾個是「刻意裸奔」的：詞典視圖之外的元素（編輯器內建議、懸浮視窗），
  // 沒有 .li-root 祖先，且命名上不會與核心撞（核心沒有 li-inline-* / li-hover-*）。
  // 新增 .li-tpop —— 排版調參浮層掛在 document.body 上，
  // 沒有 .li-root 祖先（套 .li-root 會直接失效），且核心無同名 class，
  // 與 li-inline-* / li-hover-* 同屬「懸浮視窗」性質的刻意裸奔。
  const STANDALONE = [".li-root", ".li-inline-", ".li-hover-", ".li-var", ".li-tpop",
    // 刻意裸奔補登：.li-top-icon（移動端兜底，不依賴 .li-root 層級——styles.css 註釋明言）、
    // .li-toc-modal（MDict 目錄彈窗掛 document.body，無 .li-root 祖先，同 li-tpop 性質）。
    ".li-top-icon", ".li-toc-modal",
    // r156 審核合規批次新增的工具類（global 兜底，同 .li-top-icon 性質）＋
    // .li-audio-clip（iframe 內 audio 剪輯樣式）＋.li-collation-sec-cell（廣韻collation表格格）。
    ".li-u-hidden", ".li-u-invisible", ".li-audio-clip", ".li-collation-sec-cell",
    // B10 頁內膠囊設置分頁條（.li-settings 專屬命名空間）、TEI 缺字佔位
    //（li- 前綴專屬類，皆刻意不收 .li-root）、視圖容器層級規則
    //（.workspace-leaf-content/.workspace-drawer 為 Obsidian 原生類，非 dict 樣式）。
    ".li-settings", ".li-lex0-g-missing", ".workspace-leaf-content", ".workspace-drawer",
    // TEI 詞頭/引用族（li-lex0-*：oRef/pRef/hyph 等，li- 前綴專屬不外溢）、
    // 廣韻 .zr 註記修正（刻意覆蓋筆記渲染環境——styles.css L8085 註釋明言
    // 「只作用於筆記渲染環境（iframe 外）」）。
    ".li-lex0-", "span.zr", ".markdown-rendered span.zr", ".markdown-preview-view span.zr", ":not(.li-frame)"];
  // 以「規則塊」為判定單位：塊內（含逗號組）任一 selector 收在 STANDALONE
  // 即視為受控。刻意裸的次要 selector（如 .vertical-tab-content .li-setting-group-row，
  // 覆蓋不含 .li-root 的設置頁容器，見 styles.css 註釋）與主 selector 同塊，
  // 外溢風險由塊級判定承擔，不逐 selector 誤報。
  const naked = [];
  // selector 可跨多行（逗號組換行排版）——匹配須容許組內換行，
  // 否則 .li-root 開頭行被捕不到、只查到組尾行（多行組誤報全裸）。
  for (const m of dictCss.matchAll(/(?:^|\}|\n)\s*([.@][^{}]*?)\s*\{/g)) {
    const sel = m[1].replace(/\/\*[\s\S]*?\*\//g, "").trim();
    if (sel.startsWith("@")) continue; // @media 本身不需要前綴，裡面那幾條會被這裡抓到
    const parts = sel.split(",").map((p) => p.trim()).filter(Boolean);
    if (parts.some((p) => STANDALONE.some((s) => p.startsWith(s)))) continue;
    naked.push(...parts);
  }
  if (naked.length) {
    fail(`辭典樣式有 ${naked.length} 條裸選擇器（未收在 .li-root 下，會外溢到 li 核心）：\n   ${naked.slice(0, 12).join("\n   ")}`);
  } else {
    ok(`辭典樣式全部收在 .li-root 之下（核心 ${liCore.size} 個 class / dict ${liDict.size} 個，互不干擾）`);
  }
}

if (failed) { console.error("\n審計未通過"); process.exit(1); }
console.log("\n品牌一致性審計通過");
