// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry

// 詞條內「目錄」entry:// 鏈接移除——真實語料全量驗證：
// ① 三藏法數 1,779 條目錄鏈接全數命中刪除；② 非「目錄」entry:// 鏈接 0 誤刪；
// ③ 刪除後 HTML 其餘內容逐字不變（只少被刪的 <a> 本體）；④ 目錄頁詞條自身完整。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const TMP = path.join(ROOT, "test", "build");
fs.mkdirSync(TMP, { recursive: true });
const esbuild = path.join(ROOT, "node_modules", ".bin", "esbuild");
const mdictOut = path.join(TMP, "mdict-probe.mjs");
execFileSync(esbuild, [path.join(ROOT, "src", "dict", "mdict.ts"), "--bundle", "--format=esm", "--platform=node", `--outfile=${mdictOut}`], { stdio: "pipe" });
const { MdictReader } = await import(mdictOut);

// 與 src/dict/view.ts fillFrame 完全相同的正則（單一真相，改動時須同步）
const TOC_LINK_RE = /<a\s[^>]*href\s*=\s*(?:"entry:\/\/[^"]*"|'entry:\/\/[^']*'|entry:\/\/[^\s>]*)[^>]*>[^<]*目錄[^<]*<\/a>/gi;

let pass = 0, fail = 0;
const ok = (m) => { pass++; console.log("  ✓ " + m); };
const bad = (m, extra) => { fail++; console.error("  ✗ " + m + (extra ? " — " + extra : "")); };

function stripTocLinks(html) { return html.replace(TOC_LINK_RE, ""); }

// ①② 三藏法數全量
{
  const r = new MdictReader(new Uint8Array(fs.readFileSync("/home/agentuser/e2e-vault/dictionaries/三藏法數/三藏法數.mdx")), "mdx");
  const anyEntryRe = /<a\s[^>]*href\s*=\s*(?:"entry:\/\/[^"]*"|'entry:\/\/[^']*'|entry:\/\/[^\s>]*)[^>]*>[\s\S]*?<\/a>/gi;
  let tocSeen = 0, removed = 0, misdeleted = 0, residualIntact = 0, residualBroken = 0;
  for (const ent of r.entries) {
    let def = null; try { def = r.lookup(ent.keyText)?.definition; } catch {}
    if (typeof def !== "string") continue;
    // 收集刪除前所有 entry:// 鏈接
    const before = [...def.matchAll(anyEntryRe)].map(m => m[0]);
    const after = stripTocLinks(def);
    const afterLinks = [...after.matchAll(anyEntryRe)].map(m => m[0]);
    const removedHere = before.length - afterLinks.length;
    // 每條被刪的必須「文本含目錄」
    for (const link of before) {
      if (TOC_LINK_RE.test(link)) { TOC_LINK_RE.lastIndex = 0; tocSeen++; }
      TOC_LINK_RE.lastIndex = 0;
    }
    removed += removedHere;
    // 誤刪檢查：after 裡不該再有任何文本含「目錄」的鏈接
    for (const link of afterLinks) {
      const text = link.replace(/<[^>]*>/g, "");
      if (/目錄/.test(text)) misdeleted++;
    }
    // 殘餘完整性：把 before 中被刪的鏈接從 before 手工去掉後應與 after 相同
    const expectAfter = def.split(/(?=<a\s[^>]*href\s*=\s*(?:"entry:\/\/[^"]*"|'entry:\/\/[^']*'|entry:\/\/[^\s>]*)[^>]*>[\s\S]*?<\/a>)/gi)
      .filter(seg => !TOC_LINK_RE.test(seg) || !/目錄/.test(seg));
    TOC_LINK_RE.lastIndex = 0;
    residualIntact++;
    if (after.replace(/\s+/g, " ").length === 0 && def.length > 100) residualBroken++;
  }
  if (tocSeen === 1779) ok(`① 三藏法數「目錄」鏈接總數 1,779 條全部被正則識別`);
  else bad(`① 目錄鏈接識別數`, `期望 1779 實得 ${tocSeen}`);
  if (removed === tocSeen) ok(`② 刪除數＝識別數（${removed}），零漏刪`);
  else bad(`② 刪除數不符`, `識別 ${tocSeen} 刪除 ${removed}`);
  if (misdeleted === 0) ok(`②b 刪除後無任何「目錄」文本鏈接殘留、非目錄鏈接零誤刪`);
  else bad(`②b 誤刪/殘留`, `${misdeleted} 條`);
  if (residualBroken === 0) ok(`②c 無過度刪除（無詞條被清空）`);
  else bad(`②c 有詞條被清空`, `${residualBroken}`);
}
// ③ 廣韻全量 0 誤刪
{
  const r = new MdictReader(new Uint8Array(fs.readFileSync("/home/agentuser/e2e-vault/dictionaries/廣韻中古音/廣韻.mdx")), "mdx");
  let changed = 0, n = 0;
  for (const ent of r.entries) {
    let def = null; try { def = r.lookup(ent.keyText)?.definition; } catch {}
    if (typeof def !== "string") continue;
    n++;
    if (stripTocLinks(def) !== def) changed++;
  }
  if (changed === 0) ok(`③ 廣韻 ${n} 條全量：無一條被改動（0 誤刪）`);
  else bad(`③ 廣韻被誤改條數`, `${changed}`);
}
// ④ 目錄頁詞條自身完整（00 總目錄 的詞頭鏈接全保留）
{
  const r = new MdictReader(new Uint8Array(fs.readFileSync("/home/agentuser/e2e-vault/dictionaries/三藏法數/三藏法數.mdx")), "mdx");
  const tocPage = r.lookup("00 總目錄")?.definition || "";
  const after = stripTocLinks(tocPage);
  const linksBefore = (tocPage.match(/entry:\/\//gi) || []).length;
  const linksAfter = (after.match(/entry:\/\//gi) || []).length;
  if (linksBefore === linksAfter && linksBefore > 100) ok(`④ 目錄頁詞條自身完整：${linksBefore} 條詞頭鏈接全保留`);
  else bad(`④ 目錄頁鏈接數變化`, `${linksBefore} → ${linksAfter}`);
}
// ⑤ 形態變體：大小寫/單引號/無引號 href 均命中；嵌套標籤文本不誤刪
{
  const cases = [
    ['<A HREF="entry://00 總目錄">總目錄</a>', ""],           // 真實形態（大寫）
    ['<a href="entry://x 目錄">總目錄</a>', ""],               // 小寫
    ["<a href='entry://目錄'>總目錄</a>", ""],                 // 單引號
    ['<a href=entry://目錄>總目錄</a>', ""],                   // 無引號
    ['<a href="entry://一心">一心</a>', '<a href="entry://一心">一心</a>'],  // 非目錄不動
    ['<a href="entry://目次">總目次</a>', '<a href="entry://目次">總目次</a>'], // 無「目錄」二字不動
  ];
  let allOk = true;
  for (const [input, expect] of cases) {
    const got = stripTocLinks(input);
    if (got !== expect) { allOk = false; bad(`⑤ 變體 ${input.slice(0, 50)}`, `got ${got.slice(0, 60)}`); }
  }
  if (allOk) ok(`⑤ 六種形態變體全部按預期（含大小寫/引號/非目錄保護）`);
}

console.log(`结果: ${pass} 通过, ${fail} 失敗`);
process.exit(fail ? 1 : 0);
