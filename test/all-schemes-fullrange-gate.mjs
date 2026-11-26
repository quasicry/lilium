// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry

/**
 * 全方案 × 全區段門禁（ॐ 回歸排查固化）。
 *
 * 背景教訓：indic.ts 多輪 patch，兩次覆蓋事故；md-corpus-gate 的
 * 「全拉丁化」判定把 \uXXXX 標註視為通過，既有正確轉寫（ॐ→oṃ）若被 patch
 * 事故降級為 \u0950 標註，門禁照樣綠。本門禁三層鎖定：
 *
 *   1. 語義 golden：既有正確映射逐條鎖定（出向值必須逐字相等，\uXXXX 降級即紅）
 *   2. 出向殘留：全方案掃法定區段全碼位，輸出含真實原生碼位字符＝紅
 *      （\uXXXX 標註＝合法全拉丁化，不算殘留；豁免表逐條列政策聲明）
 *   3. 往返閉環：native→roman→native 逐碼位無損（豁免表同上）
 *
 * 豁免表每一條都須附政策依據；新增豁免須在對應 scheme description 聲明。
 * 判定依據：程式化對照 worktree 基準（2026-11-11，新增殘留 0、
 * 修復 103、既有不變 8 類——見落地記錄）。
 */
import assert from "node:assert";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "li-fullrange-"));
execFileSync(path.join(ROOT, "node_modules", ".bin", "esbuild"), [
  path.join(ROOT, "test", "lib-export.ts"), "--bundle", "--format=esm",
  `--outfile=${path.join(TMP, "lib.mjs")}`, "--log-level=silent",
]);
const { getScheme, listSchemes, transliterateLongText } = await import(path.join(TMP, "lib.mjs"));

let pass = 0, fail = 0;
const failures = [];
function check(cond, label, detail) {
  if (cond) { pass++; } else { fail++; failures.push(`${label}${detail ? " — " + detail : ""}`); }
}

/* ---------- 1. 語義 golden（既有正確映射鎖定） ---------- */
const GOLDEN = [
  // [scheme, native, expected roman]
  ["sanskrit-iast", "ॐ", "o\u1E43"],
  ["tibetan-wylie", "\u0F00", "oM"],
  ["tibetan-wylie-ext", "\u0F00", "oM"],
  ["siddham-iast", String.fromCodePoint(0x115C1), "o\u1E43"],
  // esc 雙向代表性樣本（標註體例）
  ["sanskrit-iast", "\u090D", "\u27E8U+090D\u27E9"], // B2/r156：出向體例 ⟨U+XXXX⟩（舊 \uXXXX 僅入向兼容）
  ["siddham-iast", String.fromCodePoint(0x115AF), "\u27E8U+093E\u27E9"], // B2/r156 // 孤立母音符號：出向走天城 matra 對應碼位標註（設計）
];
for (const [id, nat, exp] of GOLDEN) {
  const sc = getScheme(id);
  let got;
  try { got = sc.nativeToRoman(nat); } catch (e) { got = "<throw " + e.message + ">"; }
  check(got === exp, `golden ${id} ${JSON.stringify(nat)}`, `got ${JSON.stringify(got)} exp ${JSON.stringify(exp)}`);
}

/* ---------- 2＋3. 全方案 × 法定區段掃描 ---------- */
// 每方案一組法定區段 [start, end]。區段選定＝該方案文種的 Unicode 方塊。
const RANGES = {
  "sanskrit-iast": [[0x0900, 0x097F], [0x1CD0, 0x1CFF], [0xA8E0, 0xA8FF]],
  "pali-iast": [[0x0900, 0x097F]],
  "pali-iso15919": [[0x0900, 0x097F]],
  "tibetan-wylie": [[0x0F00, 0x0FBC]],
  "tibetan-wylie-ext": [[0x0F00, 0x0FBC]],
  "sinhala-pali": [[0x0D80, 0x0DFF]],
  "sinhala-iso15919": [[0x0D80, 0x0DFF]],
  "siddham-iast": [[0x11580, 0x115FF]],
  "gandhari-iast": [[0x10A00, 0x10A5F]],
  "brahmi-iast": [[0x11000, 0x1107F]],
  "phagspa-poppe": [[0xA840, 0xA87F]],
  "marchen": [[0x11C00, 0x11CBF]],
  "zanabazar": [[0x11A00, 0x11A4F]],
  "soyombo": [[0x11A50, 0x11AAF]],
  "mongolian": [[0x1800, 0x18AF], [0x11660, 0x1167F]],
  "manchu-mollendorff": [[0x1800, 0x18AF]],
  "olduyghur": [[0x10F70, 0x10FAF]], // r73h：舊值 10C00=Old Hungarian 誤區段——回鶻文正確區段 10F70-10FAF（Unicode 14）
  "manichaean": [[0x10AC0, 0x10AFF]], // 摩尼文（Unicode 14）：字母 10AC0-10AE4＋縮寫符/數字/標點至 10AFF
  "uyghur-uly": [[0x0600, 0x06FF]],
  "ranjana-iast": [[0x0900, 0x097F]],
  "aligali-iast": [[0x1800, 0x18AF]],
  // mongolian-ime：hiddenFromPicker 輸入法方案（恆等/字形升級設計，description 已聲明不保證 1:1 可逆）——出向掃描同蒙文區段，往返豁免
  "mongolian-ime": [[0x1800, 0x18AF], [0x11660, 0x1167F]],
};

const EXEMPT_SCHEMES_RESIDUE = new Set(["sanskrit-iast", "pali-iast", "pali-iso15919", "ranjana-iast"]);

const NATIVE_RANGES = [
  [0x0900, 0x097F], [0x1CD0, 0x1CFF], [0xA8E0, 0xA8FF], [0x0F00, 0x0FBC],
  [0x0D80, 0x0DFF], [0x11580, 0x115FF], [0x10A00, 0x10A5F], [0x11000, 0x1107F],
  [0xA840, 0xA87F], [0x11C00, 0x11CBF], [0x11A00, 0x11AAF], [0x1800, 0x18AF],
  [0x11660, 0x1167F], [0x10C00, 0x10CFF], [0x0600, 0x06FF],
  [0x10AC0, 0x10AFF], [0x10F70, 0x10FAF],
];
function isNativeCp(cp) { return NATIVE_RANGES.some(([a, b]) => cp >= a && cp <= b); }
const stripEsc = (s) => s.replace(/\\u[0-9A-Fa-f]{4,6}/g, "");

// 豁免表（政策聲明；新增須附依據）：
//  - nukta 0958–095F：出向併流主流字母（記憶裁定：高頻別名寧檢字表註明不加輸入鍵）；
//    0951/0952 組合變音無輸入鍵（IAST 以 combining 重音記錄，v0.1.119 同款）。
//  - 0929/0931/0934：NNN/RR/LL 併流（同 nukta 政策）。
//  - uyghur 0675–0678：hamza 疊合呈現形，NFKC 分解可正確轉寫（非規範碼位）。
//  - manchu ⟨U+181B⟩：Möllendorff 轉寫無對應字母的碼位以 ⟨U+XXXX⟩ 註記（設計）。
const EXEMPT_RESIDUE = new Set([
  // scheme:cp 出向殘留豁免
  "sanskrit-iast:0x951", "sanskrit-iast:0x952",
  "pali-iast:0x951", "pali-iast:0x952", "pali-iso15919:0x951", "pali-iso15919:0x952",
  "ranjana-iast:0x951", "ranjana-iast:0x952",
  "uyghur-uly:0x675", "uyghur-uly:0x676", "uyghur-uly:0x677", "uyghur-uly:0x678",
  "manchu-mollendorff:*",
]);
// nukta 系 0958–095F 出向含 nukta 疊合符（क़ 的 nukta 部分透傳）＝各 ASCII 方案既有：
const NUKTA_CPS = new Set([0x958, 0x959, 0x95A, 0x95B, 0x95C, 0x95D, 0x95E, 0x95F]);
const PALI_EXCLUDED = new Set([0x90C, 0x961, 0x963]); // pali ḷ/ḹ 排除＋ऌ 借音
// sinhala 孤立母音符號/virama 單碼位往返得獨立元音或恆等拉丁（無上下文；逐筆同款既有）
const SINHALA_ORPHAN = new Set([0xD8F,0xDCA,0xDCF,0xDD2,0xDD3,0xDD4,0xDD6,0xDD8,0xDD9,0xDDA,0xDDB,0xDDC,0xDDD,0xDDE,0xDD0,0xDD1,0xDDF,0xDF2,0xDF3]);
// n2737 收錄（ae/aee/nng 系）：孤立 matra ැ/ෑ/ෟ 往返得獨立元音——同上既有政策
// IME 方案（hiddenFromPicker）非全拉丁轉寫：出向為字形升級後蒙文碼位＝設計（description 聲明）
const IME_SCHEMES = new Set(["mongolian-ime"]);
const EXEMPT_RT_LEGACY = new Set([
  // 基準往返敗逐筆固化（既有政策：數字 ASCII 化、詞首 hamza 載體、孤立母音符號、aligali 出向恆等、siddham warbler、tibetan 0F48 政策分解等）
  // aligali r43e 音節級重構後：0x1803（蒙古文句號排版變體）出向與 0x1802 同為 "."，
  // 反向歸 0x1802 正字——非恆等屬政策合併（description 已聲明，同八思巴 ᠃→꡶ 政策）。
  "aligali-iast:0x1803",
  // r43e 音節級重構：裸元音/輔音基字出向為梵音成分（ᠠ→a、ᠢ→i、ᠣ/ᠤ→u），反向歸
  // aksh 正字序第一項（a→ᠠ᠋、i→ᢈ、u→ᠦ）——同一字母的 aligali 標記形與裸形合併，
  // 資訊零損失（description 已聲明同音異碼反向取正字序第一項）。ᠻ（kh 裸形）同類。
  "aligali-iast:0x1820",
  "aligali-iast:0x1822",
  "aligali-iast:0x1823",
  "aligali-iast:0x1824",
  "aligali-iast:0x183b",
  // 輔音裸碼位（借詞體例：ᠨ→n 等）反向無對應（n 為多碼位共用成分），透傳——
  // 音節文字本質不可逆（aksh 同）；完整音節形（ᠨᠠ᠋=na）可逆。
  "aligali-iast:0x1828",
  "aligali-iast:0x182a",
  "aligali-iast:0x182e",
  "aligali-iast:0x182f",
  "aligali-iast:0x1830",
  "aligali-iast:0x1831",
  "aligali-iast:0x1832",
  "aligali-iast:0x1836",
  "aligali-iast:0x1837",
  "aligali-iast:0x1838",
  "aligali-iast:0x1839",
  "aligali-iast:0x183a",
  "aligali-iast:0x183c",
  "aligali-iast:0x183e",
  "aligali-iast:0x1859",
  "aligali-iast:0x1880",
  "aligali-iast:0x1881",
  "aligali-iast:0x1887",
  "aligali-iast:0x1888",
  "aligali-iast:0x1889",
  "aligali-iast:0x188a",
  "aligali-iast:0x188b",
  "aligali-iast:0x188c",
  "aligali-iast:0x188d",
  "aligali-iast:0x188e",
  "aligali-iast:0x188f",
  "aligali-iast:0x1890",
  "aligali-iast:0x1891",
  "aligali-iast:0x1892",
  "aligali-iast:0x1893",
  "aligali-iast:0x1894",
  "aligali-iast:0x1895",
  "aligali-iast:0x1896",
  "aligali-iast:0x1897",
  "aligali-iast:0x1898",
  "aligali-iast:0x1899",
  "aligali-iast:0x189a",
  "aligali-iast:0x189b",
  "aligali-iast:0x189c",
  "aligali-iast:0x189d",
  "aligali-iast:0x189e",
  "aligali-iast:0x189f",
  "aligali-iast:0x18a0",
  "aligali-iast:0x18a1",
  "aligali-iast:0x18a2",
  "aligali-iast:0x18a3",
  "aligali-iast:0x18a4",
  "aligali-iast:0x18a5",
  "aligali-iast:0x18a6",
  "aligali-iast:0x18a7",
  "aligali-iast:0x18a8",
  "aligali-iast:0x18aa",
  "brahmi-iast:0x11034",
  "brahmi-iast:0x11038",
  "brahmi-iast:0x1103a",
  "brahmi-iast:0x1103b",
  "brahmi-iast:0x1103c",
  "brahmi-iast:0x1103d",
  "brahmi-iast:0x1103e",
  "brahmi-iast:0x1103f",
  "brahmi-iast:0x11040",
  "brahmi-iast:0x11041",
  "brahmi-iast:0x11042",
  "brahmi-iast:0x11043",
  "brahmi-iast:0x11044",
  "brahmi-iast:0x11045",
  "manchu-mollendorff:0x181b",
  "manchu-mollendorff:0x181c",
  "manchu-mollendorff:0x181d",
  "manchu-mollendorff:0x181e",
  "manchu-mollendorff:0x181f",
  "manchu-mollendorff:0x1821",
  "manchu-mollendorff:0x1822",
  "manchu-mollendorff:0x1824",
  "manchu-mollendorff:0x1825",
  "manchu-mollendorff:0x1826",
  "manchu-mollendorff:0x1827",
  "manchu-mollendorff:0x182b",
  "manchu-mollendorff:0x182c",
  "manchu-mollendorff:0x182d",
  "manchu-mollendorff:0x1831",
  "manchu-mollendorff:0x1832",
  "manchu-mollendorff:0x1833",
  "manchu-mollendorff:0x1837",
  "manchu-mollendorff:0x1839",
  "manchu-mollendorff:0x183b",
  "manchu-mollendorff:0x183c",
  "manchu-mollendorff:0x183d",
  "manchu-mollendorff:0x183e",
  "manchu-mollendorff:0x183f",
  "manchu-mollendorff:0x1840",
  "manchu-mollendorff:0x1841",
  "manchu-mollendorff:0x1842",
  "manchu-mollendorff:0x1843",
  "manchu-mollendorff:0x1844",
  "manchu-mollendorff:0x1845",
  "manchu-mollendorff:0x1846",
  "manchu-mollendorff:0x1847",
  "manchu-mollendorff:0x1848",
  "manchu-mollendorff:0x1849",
  "manchu-mollendorff:0x184a",
  "manchu-mollendorff:0x184b",
  "manchu-mollendorff:0x184c",
  "manchu-mollendorff:0x184d",
  "manchu-mollendorff:0x184e",
  "manchu-mollendorff:0x184f",
  "manchu-mollendorff:0x1850",
  "manchu-mollendorff:0x1851",
  "manchu-mollendorff:0x1852",
  "manchu-mollendorff:0x1853",
  "manchu-mollendorff:0x1854",
  "manchu-mollendorff:0x1855",
  "manchu-mollendorff:0x1856",
  "manchu-mollendorff:0x1857",
  "manchu-mollendorff:0x1858",
  "manchu-mollendorff:0x1859",
  "manchu-mollendorff:0x185a",
  "manchu-mollendorff:0x185b",
  "manchu-mollendorff:0x185c",
  "manchu-mollendorff:0x185e",
  "manchu-mollendorff:0x185f",
  "manchu-mollendorff:0x1862",
  "manchu-mollendorff:0x1863",
  "manchu-mollendorff:0x186a",
  "manchu-mollendorff:0x186b",
  "manchu-mollendorff:0x1871",
  "manchu-mollendorff:0x1872",
  "manchu-mollendorff:0x1877",
  "manchu-mollendorff:0x1878",
  "manchu-mollendorff:0x1879",
  "manchu-mollendorff:0x187a",
  "manchu-mollendorff:0x187b",
  "manchu-mollendorff:0x187c",
  "manchu-mollendorff:0x187d",
  "manchu-mollendorff:0x187e",
  "manchu-mollendorff:0x187f",
  "manchu-mollendorff:0x1880",
  "manchu-mollendorff:0x1881",
  "manchu-mollendorff:0x1882",
  "manchu-mollendorff:0x1883",
  "manchu-mollendorff:0x1884",
  "manchu-mollendorff:0x1885",
  "manchu-mollendorff:0x1886",
  "manchu-mollendorff:0x1887",
  "manchu-mollendorff:0x1888",
  "manchu-mollendorff:0x1889",
  "manchu-mollendorff:0x188a",
  "manchu-mollendorff:0x188b",
  "manchu-mollendorff:0x188c",
  "manchu-mollendorff:0x188d",
  "manchu-mollendorff:0x188e",
  "manchu-mollendorff:0x188f",
  "manchu-mollendorff:0x1890",
  "manchu-mollendorff:0x1891",
  "manchu-mollendorff:0x1892",
  "manchu-mollendorff:0x1893",
  "manchu-mollendorff:0x1894",
  "manchu-mollendorff:0x1895",
  "manchu-mollendorff:0x1896",
  "manchu-mollendorff:0x1897",
  "manchu-mollendorff:0x1898",
  "manchu-mollendorff:0x1899",
  "manchu-mollendorff:0x189a",
  "manchu-mollendorff:0x189b",
  "manchu-mollendorff:0x189c",
  "manchu-mollendorff:0x189d",
  "manchu-mollendorff:0x189e",
  "manchu-mollendorff:0x189f",
  "manchu-mollendorff:0x18a0",
  "manchu-mollendorff:0x18a1",
  "manchu-mollendorff:0x18a2",
  "manchu-mollendorff:0x18a3",
  "manchu-mollendorff:0x18a4",
  "manchu-mollendorff:0x18a5",
  "manchu-mollendorff:0x18a6",
  "manchu-mollendorff:0x18a7",
  "manchu-mollendorff:0x18a8",
  "manchu-mollendorff:0x18a9",
  "manchu-mollendorff:0x18aa",
  "manchu-mollendorff:0x18ab",
  "manchu-mollendorff:0x18ac",
  "manchu-mollendorff:0x18ad",
  "manchu-mollendorff:0x18ae",
  "manchu-mollendorff:0x18af",
  "mongolian:0x1810",
  "mongolian:0x1811",
  "mongolian:0x1812",
  "mongolian:0x1813",
  "mongolian:0x1814",
  "mongolian:0x1815",
  "mongolian:0x1816",
  "mongolian:0x1817",
  "mongolian:0x1818",
  "mongolian:0x1819",
  "pali-iast:0x90c",
  "pali-iast:0x951",
  "pali-iast:0x952",
  "pali-iast:0x958",
  "pali-iast:0x959",
  "pali-iast:0x95a",
  "pali-iast:0x95b",
  "pali-iast:0x95c",
  "pali-iast:0x95d",
  "pali-iast:0x95e",
  "pali-iast:0x95f",
  "pali-iast:0x961",
  "pali-iso15919:0x951",
  "pali-iso15919:0x952",
  "pali-iso15919:0x958",
  "pali-iso15919:0x959",
  "pali-iso15919:0x95a",
  "pali-iso15919:0x95b",
  "pali-iso15919:0x95e",
  "pali-iso15919:0x95f",
  "ranjana-iast:0x929",
  "ranjana-iast:0x931",
  "ranjana-iast:0x933",
  "ranjana-iast:0x934",
  "ranjana-iast:0x951",
  "ranjana-iast:0x952",
  "ranjana-iast:0x958",
  "ranjana-iast:0x959",
  "ranjana-iast:0x95a",
  "ranjana-iast:0x95b",
  "ranjana-iast:0x95c",
  "ranjana-iast:0x95d",
  "ranjana-iast:0x95e",
  "ranjana-iast:0x95f",
  "sanskrit-iast:0x929",
  "sanskrit-iast:0x931",
  "sanskrit-iast:0x933",
  "sanskrit-iast:0x934",
  "sanskrit-iast:0x951",
  "sanskrit-iast:0x952",
  "sanskrit-iast:0x958",
  "sanskrit-iast:0x959",
  "sanskrit-iast:0x95a",
  "sanskrit-iast:0x95b",
  "sanskrit-iast:0x95c",
  "sanskrit-iast:0x95d",
  "sanskrit-iast:0x95e",
  "sanskrit-iast:0x95f",
  "siddham-iast:0x115dc",
  "siddham-iast:0x115dd",
  "sinhala-iso15919:0xd8f",
  "sinhala-iso15919:0xdca",
  "sinhala-iso15919:0xdcf",
  "sinhala-iso15919:0xdd2",
  "sinhala-iso15919:0xdd3",
  "sinhala-iso15919:0xdd4",
  "sinhala-iso15919:0xdd6",
  "sinhala-iso15919:0xdd8",
  "sinhala-iso15919:0xdd9",
  "sinhala-iso15919:0xdda",
  "sinhala-iso15919:0xddb",
  "sinhala-iso15919:0xddc",
  "sinhala-iso15919:0xddd",
  "sinhala-iso15919:0xdde",
  "sinhala-iso15919:0xdf2",
  "sinhala-pali:0xd8f",
  "sinhala-pali:0xdca",
  "sinhala-pali:0xdcf",
  "sinhala-pali:0xdd2",
  "sinhala-pali:0xdd3",
  "sinhala-pali:0xdd4",
  "sinhala-pali:0xdd6",
  "sinhala-pali:0xdd8",
  "sinhala-pali:0xdd9",
  "sinhala-pali:0xdda",
  "sinhala-pali:0xddb",
  "sinhala-pali:0xddc",
  "sinhala-pali:0xddd",
  "sinhala-pali:0xdde",
  "sinhala-pali:0xdf2",
  "tibetan-wylie:0xf43",
  "tibetan-wylie:0xf48",
  "tibetan-wylie:0xf4d",
  "tibetan-wylie:0xf52",
  "tibetan-wylie:0xf57",
  "tibetan-wylie:0xf5c",
  "tibetan-wylie:0xf73",
  "tibetan-wylie:0xf75",
  "tibetan-wylie:0xf76",
  "tibetan-wylie:0xf77",
  "tibetan-wylie:0xf78",
  "tibetan-wylie:0xf79",
  "tibetan-wylie:0xf81",
  "tibetan-wylie:0xf90",
  "tibetan-wylie:0xf91",
  "tibetan-wylie:0xf92",
  "tibetan-wylie:0xf93",
  "tibetan-wylie:0xf94",
  "tibetan-wylie:0xf95",
  "tibetan-wylie:0xf96",
  "tibetan-wylie:0xf97",
  "tibetan-wylie:0xf98",
  "tibetan-wylie:0xf99",
  "tibetan-wylie:0xf9a",
  "tibetan-wylie:0xf9b",
  "tibetan-wylie:0xf9c",
  "tibetan-wylie:0xf9d",
  "tibetan-wylie:0xf9e",
  "tibetan-wylie:0xf9f",
  "tibetan-wylie:0xfa0",
  "tibetan-wylie:0xfa1",
  "tibetan-wylie:0xfa2",
  "tibetan-wylie:0xfa3",
  "tibetan-wylie:0xfa4",
  "tibetan-wylie:0xfa5",
  "tibetan-wylie:0xfa6",
  "tibetan-wylie:0xfa7",
  "tibetan-wylie:0xfa8",
  "tibetan-wylie:0xfa9",
  "tibetan-wylie:0xfaa",
  "tibetan-wylie:0xfab",
  "tibetan-wylie:0xfac",
  "tibetan-wylie:0xfad",
  "tibetan-wylie:0xfae",
  "tibetan-wylie:0xfaf",
  "tibetan-wylie:0xfb0",
  "tibetan-wylie:0xfb1",
  "tibetan-wylie:0xfb2",
  "tibetan-wylie:0xfb3",
  "tibetan-wylie:0xfb4",
  "tibetan-wylie:0xfb5",
  "tibetan-wylie:0xfb6",
  "tibetan-wylie:0xfb7",
  "tibetan-wylie:0xfb8",
  "tibetan-wylie:0xfb9",
  "tibetan-wylie:0xfba",
  "tibetan-wylie:0xfbb",
  "tibetan-wylie-ext:0xf43",
  "tibetan-wylie-ext:0xf48",
  "tibetan-wylie-ext:0xf4d",
  "tibetan-wylie-ext:0xf52",
  "tibetan-wylie-ext:0xf57",
  "tibetan-wylie-ext:0xf5c",
  "tibetan-wylie-ext:0xf73",
  "tibetan-wylie-ext:0xf75",
  "tibetan-wylie-ext:0xf76",
  "tibetan-wylie-ext:0xf77",
  "tibetan-wylie-ext:0xf78",
  "tibetan-wylie-ext:0xf79",
  "tibetan-wylie-ext:0xf81",
  "tibetan-wylie-ext:0xf90",
  "tibetan-wylie-ext:0xf91",
  "tibetan-wylie-ext:0xf92",
  "tibetan-wylie-ext:0xf93",
  "tibetan-wylie-ext:0xf94",
  "tibetan-wylie-ext:0xf95",
  "tibetan-wylie-ext:0xf96",
  "tibetan-wylie-ext:0xf97",
  "tibetan-wylie-ext:0xf98",
  "tibetan-wylie-ext:0xf99",
  "tibetan-wylie-ext:0xf9a",
  "tibetan-wylie-ext:0xf9b",
  "tibetan-wylie-ext:0xf9c",
  "tibetan-wylie-ext:0xf9d",
  "tibetan-wylie-ext:0xf9e",
  "tibetan-wylie-ext:0xf9f",
  "tibetan-wylie-ext:0xfa0",
  "tibetan-wylie-ext:0xfa1",
  "tibetan-wylie-ext:0xfa2",
  "tibetan-wylie-ext:0xfa3",
  "tibetan-wylie-ext:0xfa4",
  "tibetan-wylie-ext:0xfa5",
  "tibetan-wylie-ext:0xfa6",
  "tibetan-wylie-ext:0xfa7",
  "tibetan-wylie-ext:0xfa8",
  "tibetan-wylie-ext:0xfa9",
  "tibetan-wylie-ext:0xfaa",
  "tibetan-wylie-ext:0xfab",
  "tibetan-wylie-ext:0xfac",
  "tibetan-wylie-ext:0xfad",
  "tibetan-wylie-ext:0xfae",
  "tibetan-wylie-ext:0xfaf",
  "tibetan-wylie-ext:0xfb0",
  "tibetan-wylie-ext:0xfb1",
  "tibetan-wylie-ext:0xfb2",
  "tibetan-wylie-ext:0xfb3",
  "tibetan-wylie-ext:0xfb4",
  "tibetan-wylie-ext:0xfb5",
  "tibetan-wylie-ext:0xfb6",
  "tibetan-wylie-ext:0xfb7",
  "tibetan-wylie-ext:0xfb8",
  "tibetan-wylie-ext:0xfb9",
  "tibetan-wylie-ext:0xfba",
  "tibetan-wylie-ext:0xfbb",
  "uyghur-uly:0x626",
  "uyghur-uly:0x627",
  "uyghur-uly:0x640",
  "uyghur-uly:0x647",
  "uyghur-uly:0x648",
  "uyghur-uly:0x649",
  "uyghur-uly:0x675",
  "uyghur-uly:0x676",
  "uyghur-uly:0x677",
  "uyghur-uly:0x678",
  "uyghur-uly:0x6c6",
  "uyghur-uly:0x6c7",
  "uyghur-uly:0x6c8",
  "uyghur-uly:0x6d0",
  "uyghur-uly:0x6d5",
  "zanabazar:0x11a38",
]);

const DIGIT_CPS = new Set([0x966,0x967,0x968,0x969,0x96A,0x96B,0x96C,0x96D,0x96E,0x96F]);
const EXEMPT_RT = new Set([
  // 回鶻文組合上下標點（10F82-10F85 combining marks）——單碼位出向為空
  // 字串（上下文消歧字符，無獨立 roman），單碼位往返無閉環可言＝同藏文組合符慣例豁免
  "olduyghur:0x10f82", "olduyghur:0x10f83", "olduyghur:0x10f84", "olduyghur:0x10f85",
  // 往返閉環豁免（出向併流／無輸入鍵；同上政策）
  "sanskrit-iast:0x951", "sanskrit-iast:0x952",
  "pali-iast:0x951", "pali-iast:0x952", "pali-iso15919:0x951", "pali-iso15919:0x952",
  "ranjana-iast:0x951", "ranjana-iast:0x952",
  "pali-iast:0x951", "pali-iast:0x952", "pali-iso15919:0x951", "pali-iso15919:0x952",
  "ranjana-iast:0x951", "ranjana-iast:0x952",
  "uyghur-uly:0x675", "uyghur-uly:0x676", "uyghur-uly:0x677", "uyghur-uly:0x678",
  "manchu-mollendorff:*",
  "mongolian-ime:*",
  // aligali-iast 同值多碼位併流（r49t）：出向 e/i/o/u/j 多碼位同值（Todo 段
  // 1844/1845/1846/1849/185C vs Hudum 基字 1827/1888/1823+ᠸᠠ/1826/183D），
  // 反向取碼位序第一項＝正字序政策；單碼位往返無法逐一閉環（同 nukta 併流政策）。
  "aligali-iast:0x1844", "aligali-iast:0x1845", "aligali-iast:0x1846",
  "aligali-iast:0x1849", "aligali-iast:0x185c",
  // r49t 出向端補列的單值碼位（無獨立輸入鍵；romanToAliGali 音節反查架構不
  // 接受單拉丁字——「未命中羅馬字原樣保留」設計聲明於 description）：單碼位
  // 出向 j/m/ŧ/ć/c/y/ñ 無法往返，同 nukta「出向併流無輸入鍵」政策豁免。
  "aligali-iast:0x183d", "aligali-iast:0x184f", "aligali-iast:0x1850",
  "aligali-iast:0x1852", "aligali-iast:0x1853", "aligali-iast:0x1855",
  "aligali-iast:0x185b",
  // r49v：1834 CHA 借音 ch（同值 183c 優先）；1882/1883/1884 visarga 變體 ḥ
  // （同值 1881）——同值多碼位反向取碼位序第一，非借音字形本尊，豁免。
  "aligali-iast:0x1834", "aligali-iast:0x1882", "aligali-iast:0x1883",
  "aligali-iast:0x1884",
]);

let residueBad = 0, rtBad = 0;
for (const [id, ranges] of Object.entries(RANGES)) {
  const sc = getScheme(id);
  for (const [a, b] of ranges) {
    for (let cpv = a; cpv <= b; cpv++) {
      const ch = String.fromCodePoint(cpv);
      let rom;
      try { rom = sc.nativeToRoman(ch); } catch (e) { continue; }
      if (rom === ch) continue;
      const key = `${id}:0x${cpv.toString(16)}`;
      const exemptAll = EXEMPT_RESIDUE.has(`${id}:*`) || EXEMPT_RESIDUE.has(key);
      const nuktaWaived = NUKTA_CPS.has(cpv) && EXEMPT_SCHEMES_RESIDUE.has(id);
      // 2. 出向殘留：剥除 \uXXXX 標註後仍含原生碼位字符＝紅
      const residue = stripEsc(rom).split("").some((c) => isNativeCp(c.codePointAt(0)));
      if (residue && !exemptAll && !nuktaWaived && !IME_SCHEMES.has(id)) { residueBad++; failures.push(`殘留 ${key} → ${JSON.stringify(rom)}`); }
      else if (residue) { pass++; }
      // 3. 往返閉環
      let back;
      try { back = sc.romanToNative(rom); } catch (e) { back = null; }
      const rtExempt = EXEMPT_RT.has(`${id}:*`) || EXEMPT_RT.has(key) || EXEMPT_RT_LEGACY.has(key) || nuktaWaived || (DIGIT_CPS.has(cpv) && back === rom) || (PALI_EXCLUDED.has(cpv) && (id === "pali-iast" || id === "pali-iso15919")) || (SINHALA_ORPHAN.has(cpv) && id.startsWith("sinhala"));
      // 藏文政策分解序判等：合成碼位 ↔ 分解串等價；NFD 覆蓋多數，
      // 0F48 等 composition exclusion 碼位以政策分解表展開。
      const TIB_DECOMP = {
        0xF43:[0xF42,0xFB7],0xF48:[0xF47,0xFB9],0xF4D:[0xF4C,0xFB7],0xF52:[0xF51,0xFB7],
        0xF57:[0xF56,0xFB7],0xF5C:[0xF5B,0xFB9],0xF73:[0xF71,0xF72],0xF75:[0xF71,0xF74],
        0xF76:[0xFB2,0xF80],0xF77:[0xFB2,0xF71,0xF80],0xF78:[0xFB3,0xF80],0xF79:[0xFB3,0xF71,0xF80],
        0xF81:[0xF71,0xF80],0xF93:[0xF92,0xFB7],0xF9D:[0xF9C,0xFB9],0xFA2:[0xFA1,0xFB7],
        0xFA7:[0xFA6,0xFB7],0xFAC:[0xFAB,0xFB9],0xFB9:[0xF90,0xFB9],
      };
      const policyExpand = (str) => [...str].flatMap((c) => {
        const d = TIB_DECOMP[c.codePointAt(0)];
        return d ? d.map((x) => String.fromCodePoint(x)) : [c];
      }).join("");
      const tibNfdOk = id.startsWith("tibetan") && typeof back === "string" &&
        (back.normalize("NFD") === ch.normalize("NFD") ||
         policyExpand(back).normalize("NFD") === policyExpand(ch).normalize("NFD"));
      const tibDep = id.startsWith("tibetan") && (cpv === 0xf77 || cpv === 0xf79); // deprecated composition exclusion 政策
      if (!rtExempt && !tibNfdOk && !tibDep && back !== ch) { rtBad++; failures.push(`往返 ${key} ${JSON.stringify(rom)} → ${JSON.stringify(back)}`); }
      else if (back === ch) { pass++; }
    }
  }
}
check(residueBad === 0, "出向殘留掃描", `${residueBad} 筆`);
check(rtBad === 0, "往返閉環掃描", `${rtBad} 筆`);


/* ---------- 4. 面板通路門禁（單碼位成詞不得被 gate 冤枉 skipped） ---------- */
// 教訓：looksLikeNative 窄判定（只認輔音/母音字母）把「引擎已能轉換」的符號/數字/
// 標點單字符詞整詞 skipped——逐字符清單真機實錘（梵文 15/25 行透傳）。修復後
// 各方案 looksLikeNative 須覆蓋文種全區段；本層鎖定「引擎 direct 有轉換 ⇒ 面板
// 必須也轉出」的不變式（蒙文標點 1800-180A 為 TRIGGER_CHARS 詞界設計，豁免）。
const PANEL_EXEMPT = new Set([
  "mongolian:0x1800","mongolian:0x1801","mongolian:0x1802","mongolian:0x1803",
  "mongolian:0x1804","mongolian:0x1805","mongolian:0x1806","mongolian:0x1807",
  "mongolian:0x1808","mongolian:0x1809","mongolian:0x180a",
  "manchu-mollendorff:0x1801","manchu-mollendorff:0x1804","manchu-mollendorff:0x1808",
  "manchu-mollendorff:0x1809","manchu-mollendorff:0x180a",
  // aligali r43e：᠂/᠃（1802/1803）出向為 "."——蒙文標點屬 TRIGGER_CHARS 詞界設計，
  // 與 mongolian 同類豁免（1802/1803 的映射屬音節句讀非字母）。
  "aligali-iast:0x1802","aligali-iast:0x1803",
]);
let panelBad = 0;
for (const [id, ranges] of Object.entries(RANGES)) {
  const sc = getScheme(id);
  for (const [a, b] of ranges) {
    for (let cpv = a; cpv <= b; cpv++) {
      const ch = String.fromCodePoint(cpv);
      let direct;
      try { direct = sc.nativeToRoman(ch); } catch (e) { continue; }
      if (direct === ch) continue;
      const key = `${id}:0x${cpv.toString(16)}`;
      if (PANEL_EXEMPT.has(key)) continue;
      let res;
      try { res = transliterateLongText(ch, sc, false); } catch (e) { continue; }
      if (res.text === ch && res.converted === 0) { panelBad++; failures.push(`面板 skipped ${key} 引擎=${JSON.stringify(direct)}`); }
      else pass++;
    }
  }
}
check(panelBad === 0, "面板通路掃描", `${panelBad} 筆`);

/* ---------- 5. romanTokenRe 標註鍵原子性（鍵缺失→最長前綴掃描命中短鍵切碎標註） ---------- */
// 教訓："<v--i>" 被切出尾段 "-i" 命中分解序元音鍵（標註鍵 <v-*>/<s-*> 未入
// TIB_ATOM_TOKENS 實錘）——本層鎖定：方案聲明的每一個標註鍵在面板通路整段原子
// 送轉換器（skipped=0 且輸出不含 ASCII 尖括號殘留）。
let atomBad = 0;
const ATOM_KEYS = {
  "tibetan-wylie": [
    "<v-A>","<v-i>","<v-u>","<v-e>","<v-E>","<v-o>","<v-O>","<v-M>","<v-Mc>","<v-Ms>",
    "<v-H>","<v--i>","<v-r-i>","<v-r-A-i>","<v-l-i>","<v-l-A-i>",
    "<s-r>","<s-l>","<s-w>","<s-W>","<s-Y>","<s-R>","<s-y>",
  ],
};
for (const [id, keys] of Object.entries(ATOM_KEYS)) {
  const sc = getScheme(id);
  for (const k of keys) {
    const res = transliterateLongText(k, sc, true);
    if (res.skipped > 0 || (res.text.includes("<v-") || res.text.includes("<s-"))) {
      atomBad++; failures.push(`原子鍵切碎 ${id} ${k} => ${JSON.stringify(res.text)} skipped=${res.skipped}`);
    } else pass++;
  }
}
check(atomBad === 0, "標註鍵原子性", `${atomBad} 筆`);

// 確認清單完整（新增方案未列入 RANGES 即紅，防止未來漏掃）
const listed = new Set(Object.keys(RANGES));
for (const s of listSchemes()) {
  if (!listed.has(s.id)) check(false, "RANGES 缺方案", s.id);
}

console.log(`all-schemes-fullrange-gate: pass=${pass} fail=${fail}`);
if (fail > 0) {
  console.log(failures.slice(0, 30).join("\n"));
  process.exit(1);
}
