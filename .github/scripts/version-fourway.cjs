// CI：版本四位一體檢查（[1.58]）——manifest.json / package.json / versions.json /
// CHANGELOG.md 頂節點版本同步（CHANGELOG-本次.md 是 gitignore 的本地工作檔）。退出碼 1＝不同步。
const fs = require("fs");
const path = require("path");
const root = path.resolve(__dirname, "..", "..");
const m = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
const p = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const v = JSON.parse(fs.readFileSync(path.join(root, "versions.json"), "utf8"));
const cl = fs.readFileSync(path.join(root, "CHANGELOG.md"), "utf8");
const t = cl.match(/^## v?([0-9.]+)\s*$/m) || cl.match(/^# 最新交付節點 · v([0-9.]+)/m);
const report = {
  manifest: m.version,
  pkg: p.version,
  versions_has_current: !!v[m.version],
  changelog_top: t ? t[1] : null,
};
if (!(m.version === p.version && v[m.version] && t && t[1] === m.version)) {
  console.error("版本四位一體不同步：", JSON.stringify(report));
  process.exit(1);
}
console.log("version four-way sync OK:", m.version);
