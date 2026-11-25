#!/usr/bin/env python3

# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 quasicry

# -*- coding: utf-8 -*-
"""
字體子集化（P2 瘦身）。

對 fonts-src/ 內「隨插件內嵌」的字體，按各文種所需 Unicode 碼位做子集，
輸出到 fonts-subset/，**不覆蓋原始字體**（原檔是可再生子集的上游）。

原則：
  - 保留全部 OpenType 版面特性（--layout-features='*'），天城體 / 僧伽羅 /
    阿拉伯 / 藏文的整形（GSUB/GPOS）依賴這些 lookup，pyftsubset 會做閉包
    保留被保留碼位所參照到的替換字形。
  - 保留全部 name 表記錄（--name-IDs='*'）：SIL OFL 要求保留著作權與授權聲明。
  - 每個字體除了文種區段，另加通用標點/數字/空白，避免混排（羅馬字、括號、
    ZWJ/ZWNJ、方向標記）在導出 PDF 時掉字。

用法：
    python3.11 scripts/subset-fonts.py            # 子集化（保留 hinting）
    python3.11 scripts/subset-fonts.py --no-hinting
"""
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "fonts-src")
DST = os.path.join(ROOT, "fonts-subset")

# 通用碼位：ASCII 可見字符、Latin-1 補充、一般標點（含 ZWJ/ZWNJ/方向符）、CJK 標點
COMMON = "U+0020-007E,U+00A0-00FF,U+2000-206F,U+3000-303F"

# 文種 → 碼位區段（依 src/languages.ts 與各方案實際使用範圍）
SCRIPT_RANGES = {
    "mongolian":  "U+1800-18AF,U+11660-1167F",          # 蒙古 / 滿 / 錫伯
    "olduyghur":  "U+10F70-10FAF",                       # 回鶻
    "manichaean": "U+10AC0-10AFF",                       # 摩尼文
    "arabic":     "U+0600-06FF,U+0750-077F,U+0870-089F,U+FB50-FDFF,U+FE70-FEFF",
    "hebrew":     "U+0590-05FF,U+FB1D-FB4F",
    "sinhala":    "U+0D80-0DFF",
    "devanagari": "U+0900-097F,U+A8E0-A8FF,U+1CD0-1CFF",  # 梵 / 巴利 / 蘭札(DU)
    "tibetan":    "U+0F00-0FFF",
    "siddham":    "U+11580-115FF",
}

# 實際隨插件內嵌的字體 → 所屬文種（見 scripts/gen-noto-fonts.mjs / gen-siddham-lantsa.mjs）
FONTS = [
    ("NotoSansMongolian-Regular.ttf",   "mongolian"),
    ("NotoNaskhArabic-Regular.ttf",     "arabic"),
    ("NotoSerifHebrew-Regular.ttf",     "hebrew"),
    ("NotoSerifOldUyghur-Regular.ttf",  "olduyghur"),
    ("NotoSansManichaean-Regular.ttf",  "manichaean"),
    ("NotoSansSinhala-Regular.ttf",     "sinhala"),
    ("NotoSansDevanagari-Regular.ttf",  "devanagari"),
    ("NotoSerifTibetan-Regular.ttf",    "tibetan"),
    ("NotoSansSiddham-Regular.ttf",     "siddham"),
    ("NithyaRanjanaDU-Regular.otf",     "devanagari"),  # 蘭札體採天城體碼位
]


def main() -> int:
    no_hinting = "--no-hinting" in sys.argv
    os.makedirs(DST, exist_ok=True)

    total_before = total_after = 0
    print(f"{'字體':<36}{'文種':<12}{'原始':>10}{'子集後':>10}{'縮減':>9}")
    print("-" * 80)

    for fname, script in FONTS:
        src_path = os.path.join(SRC, fname)
        if not os.path.exists(src_path):
            print(f"!! 缺源字體：{src_path}")
            return 1
        dst_path = os.path.join(DST, fname)
        unicodes = f"{SCRIPT_RANGES[script]},{COMMON}"

        cmd = [
            "pyftsubset", src_path,
            f"--unicodes={unicodes}",
            "--output-file=" + dst_path,
            "--layout-features=*",       # 保留全部整形特性（複雜文種必需）
            "--name-IDs=*",              # 保留 OFL 著作權 / 授權聲明
            "--glyph-names",
            "--notdef-outline",
            "--drop-tables+=DSIG",
        ]
        if no_hinting:
            cmd.append("--no-hinting")
        r = subprocess.run(cmd, capture_output=True, text=True)
        if r.returncode != 0:
            print(f"!! pyftsubset 失敗 {fname}:\n{r.stderr}")
            return 1

        b = os.path.getsize(src_path)
        a = os.path.getsize(dst_path)
        total_before += b
        total_after += a
        pct = (1 - a / b) * 100 if b else 0.0
        print(f"{fname:<36}{script:<12}{b/1024:9.1f}K{a/1024:9.1f}K{pct:8.1f}%")

    print("-" * 80)
    print(f"{'合計':<48}{total_before/1024:9.1f}K{total_after/1024:9.1f}K"
          f"{(1-total_after/total_before)*100:8.1f}%")
    # base64 後約再膨脹 4/3
    print(f"\nbase64 後體積：{total_before*4/3/1024/1024:.2f} MiB → "
          f"{total_after*4/3/1024/1024:.2f} MiB"
          f"（節省 {(total_before-total_after)*4/3/1024/1024:.2f} MiB）")
    print(f"輸出目錄：{DST}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
