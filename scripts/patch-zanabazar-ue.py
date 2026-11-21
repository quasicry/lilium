#!/usr/bin/env python3

# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 quasicry

# -*- coding: utf-8 -*-
"""修復 Noto Sans Zanabazar Square 的 ue 元音符號疊字定位缺陷。

背景
────
Noto Sans Zanabazar Square v2.006（上游最新，截至 2026-11 仍未修）的 GPOS
lookup 7（MarkToMark/attaching marks 到 DOTTED CIRCLE 的 fallback 定位表）
中，uni25CC 的 class1 錨點（服務 VOWEL SIGN UE U+11A02）Y 坐標為 -12——
幾乎與基線水平。subjoiner（U+11A47）後接 ue 的序列在 shaping 時 fallback
attach 到 dotted circle，導致 ue 以 y=+108 浮在疊字右上，呈現「疊字失敗」。
同表的 i（class0, y=640 上元音）、u（class2, y=-15）錨點正確，唯 ue 錯。

修法
────
把 uni25CC class1 錨點 Y 改為 -887（取自同字體 GPOS lookup 5 中
ta_zanb.sub 的疊字底部錨點幾何），使 ue fallback attach 落於疊字底端，
與其他 subjoined 元音視覺一致。只改一個錨點坐標，零其它行為變化。

用法
────
  python3 scripts/patch-zanabazar-ue.py [--check]

  --check  只檢查是否已打過補丁（退出碼 0=已打過，1=待打）
冪等：重複執行無副作用。打完後跑 node scripts/gen-noto-fonts.mjs 重生成
內嵌字體，再 npm run build。
"""
from __future__ import annotations

import sys
from fontTools.ttLib import TTFont

FONT = "fonts-src/NotoSansZanabazarSquare-Regular.ttf"
OLD_Y = -12
NEW_Y = -887


def main() -> int:
    check = "--check" in sys.argv
    f = TTFont(FONT)
    st = f["GPOS"].table.LookupList.Lookup[7].SubTable[0]
    bi = st.BaseCoverage.glyphs.index("uni25CC")
    anc = st.BaseArray.BaseRecord[bi].BaseAnchor[1]
    if anc.YCoordinate == NEW_Y:
        print("already patched")
        return 0
    if check:
        print("needs patch")
        return 1
    anc.YCoordinate = NEW_Y
    f.save(FONT)
    print(f"patched: uni25CC class1 anchor Y {OLD_Y} -> {NEW_Y}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
