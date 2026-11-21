#!/usr/bin/env node
/**
 * 版本號同步（npm version 鈎子）。
 *
 * `npm version patch|minor|major` 會先把 package.json 的 version 改好，再觸發本脚本：
 *  - 讀 package.json 的 version；
 *  - 回寫 manifest.json 的 "version"；
 *  - 確保 versions.json 含該版本鍵（minAppVersion 取自 manifest.json）。
 * 之後由 package.json 的鈎子 `git add manifest.json versions.json` 納入提交。
 *
 * 設計：只做「文件同步」，不自行 bump 版本（bump 交給 npm version）。
 * 幂等：重複運行不會改變已一致的版本；versions.json 保留既有鍵順序。
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const version = pkg.version;
if (!version) {
  console.error("✗ package.json 缺少 version 字段");
  process.exit(1);
}

// 1) manifest.json
const mfPath = join(root, "manifest.json");
const mf = JSON.parse(readFileSync(mfPath, "utf8"));
mf.version = version;
writeFileSync(mfPath, JSON.stringify(mf, null, 2) + "\n");

// 2) versions.json（保留現有鍵順序，缺則追加）
const vPath = join(root, "versions.json");
const vs = JSON.parse(readFileSync(vPath, "utf8"));
if (!(version in vs)) vs[version] = mf.minAppVersion || "1.5.0";
writeFileSync(vPath, JSON.stringify(vs, null, 2) + "\n");

console.log(`✓ 版本同步 → ${version}（manifest.json / versions.json）`);
