#!/usr/bin/env node

// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry

/**
 * lilium 插件安裝包白名單打包（v0.1.75-r1 紀律固化）。
 *
 * 規則（落地記錄 v0.1.75-r1：打包污染勘誤）：
 *  1. 白名單逐檔打包，絕不整目錄 tar——杜絕鄰工作線（lilith）殘留混入；
 *  2. 打包前三項核對：manifest version/id、main.js md5 對工作線根目錄正本、
 *     icon.svg md5 對工作線根目錄正本（交接卷 snapshot 固有污染實錄）；
 *  3. 打包後 tar tzf 清單覆核（輸出供人工核對）。
 *
 * 用法：node scripts/package-plugin.mjs [輸出目錄，預設 交付成果/]
 * 產出：<輸出目錄>/lilium-<version>-插件安裝包.tar.gz（檔案平鋪，解壓即插件目錄內容）
 */
import { existsSync, readFileSync, writeFileSync, statSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

const root = resolve(import.meta.dirname, ".."); // 本檔在 scripts/ 下，root＝倉庫根
const pkgDir = join(root, "插件安裝包", "lilium");
const WHITELIST = ["main.js", "styles.css", "manifest.json", "versions.json", "icon.svg", "NOTICE.md", "FONT-LICENSES.md", "assets"];

const md5 = (p) => createHash("md5").update(readFileSync(p)).digest("hex");

// ---------- 1. 安裝包與工作線正本同步核對 ----------
// 插件安裝包/ 目錄已隨內部資產移出倉庫（GitHub 準備線裁定）；目錄不存在時跳過同步核對，
// 直接以工作線正本打包（GitHub 模式由 CI release.yml 構建三件套）。
let syncIssues = 0;
const pkgDirExists = existsSync(pkgDir);
for (const item of ["manifest.json", "main.js", "styles.css", "versions.json", "icon.svg", "NOTICE.md", "FONT-LICENSES.md"]) {
  const pkg = join(pkgDir, item);
  const src = join(root, item);
  if (!pkgDirExists) {
    try { statSync(src); } catch {
      console.error(`✗ 缺檔：${item}（工作線根目錄）`);
      syncIssues++;
    }
    continue;
  }
  try {
    statSync(pkg);
    statSync(src);
  } catch {
    console.error(`✗ 缺檔：${item}（安裝包或工作線根目錄）`);
    syncIssues++;
    continue;
  }
  const a = md5(pkg), b = md5(src);
  if (a !== b) {
    // icon 允許安裝包落後 → 直接以正本覆蓋；其餘不一致即中止（須先跑 build/deploy）
    if (item === "icon.svg") {
      writeFileSync(pkg, readFileSync(src));
      console.log(`↻ icon.svg 已用工作線正本覆蓋（安裝包落後：${a.slice(0, 8)} → ${b.slice(0, 8)}）`);
    } else {
      console.error(`✗ ${item} 安裝包（${a.slice(0, 8)}）≠ 工作線正本（${b.slice(0, 8)}）——先 npm run build 並 cp 同步後再打包`);
      syncIssues++;
    }
  }
}
if (syncIssues) process.exit(1);

// ---------- 2. manifest 規範核對 ----------
const man = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"));
if (man.id !== "lilium") { console.error(`✗ manifest id=${man.id}，應為 lilium`); process.exit(1); }
if (!/^\d+\.\d+\.\d+$/.test(man.version)) { console.error("✗ version 非 semver"); process.exit(1); }
console.log(`✓ manifest 核對：id=${man.id} version=${man.version}`);

// ---------- 3. 白名單打包（平鋪）----------
const outDir = resolve(process.argv[2] ?? join(root, "交付成果")); // 交付包不入 /tmp（易失），落工作線 交付成果/
mkdirSync(outDir, { recursive: true });
const tarName = `lilium-${man.version}-插件安裝包.tar.gz`;
const tarPath = join(outDir, tarName);
// 打包來源：pkgDir 存在＝安裝包目錄（平鋪）；否則＝工作線根（assets 不在時剔除）。
const tarCwd = pkgDirExists ? pkgDir : root;
const items = pkgDirExists || existsSync(join(root, "assets")) ? WHITELIST : WHITELIST.filter((x) => x !== "assets");
const args = ["czf", tarPath, ...items];
execFileSync("tar", args, { cwd: tarCwd });

// ---------- 4. tar tzf 清單覆核 ----------
const listing = execFileSync("tar", ["tzf", tarPath], { encoding: "utf8" }).trim().split("\n");
console.log(`✓ 打包完成：${tarPath}`);
console.log(`  內容 ${listing.length} 項：`);
for (const l of listing) console.log("   " + l);
const digest = md5(tarPath);
console.log(`  md5: ${digest}`);
console.log(`  size: ${statSync(tarPath).size} bytes`);
// 收據落檔（供交付記錄引用）
writeFileSync(tarPath + ".md5.txt", `${digest}  ${tarName}\n`);
console.log(`  收據：${tarPath}.md5.txt`);
