#!/usr/bin/env python3

# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 quasicry

# -*- coding: utf-8 -*-
"""把 li 的直排座標服務接入 Universal Dictionary 的懸停彈窗定位。

背景
────
UD `src/hover-lookup.ts` 的 `position()` 是純水平邏輯（below-anchor + viewport flip），
在直排（vertical-rl / vertical-lr）下會把彈窗壓在同列後續文字上。
本腳本把它替換為 `src/shared/vertical-anchor.ts` 的 `applyPopupPosition()`：
  - 橫排：座標與 UD 原邏輯逐像素一致（見 test/vertical-anchor.mjs 零回歸門禁）
  - 直排：彈窗置於換列方向側，不遮擋閱讀流
  - 錨點溢出視口時額外鉗制（修正 UD 既有缺陷）
  - **直排↔橫排切換後自動重新定位；錨點失效則隱藏**（li 兩種排版皆可寫）

改動（皆可重複執行、冪等，支持從任何歷史版本升級）
──────────────────────────────────────────────────
1. src/word-detection-dom.ts
   - `DomWordHit` 介面新增 `element?: HTMLElement | null`
   - 回傳值新增 `element: (textNode.parentElement as HTMLElement) ?? null`
   （直排上下文需由真實 DOM 元素判定，不能只看矩形）
2. src/hover-lookup.ts
   - import `applyPopupPosition` / `observeWritingModeChanges`
   - 新增欄位 `anchorEl`、`layoutWatcher`；`triggerAt()` 保存元素並註冊切換監聽
   - `position()` 整個函式體 → 一行呼叫；回傳 null（錨點失效）時隱藏彈窗
   - `detach()` / `hide()` 清理監聽
3. src/vertical-anchor.ts
   - 由 `--va-src` 複製而來（A1 合併單插件路線：最終與 dict 模組同目錄）

用法
────
  python3 scripts/patch-ud-hover-lookup.py --ud-root <UD源碼目錄> [--check] [--dry-run]

  --check    只報告哪些檔案需要打補丁（退出碼 0=已打過，1=待打）
  --dry-run  顯示將做的改動但不寫入
"""
from __future__ import annotations

import argparse
import re
import shutil
import sys
from pathlib import Path

# ── 1. word-detection-dom.ts ────────────────────────────────────────────

WDD_IFACE_OLD = """export interface DomWordHit {
  word: string;
  rect: { left: number; right: number; top: number; bottom: number; width: number; height: number };
}"""

WDD_IFACE_NEW = """export interface DomWordHit {
  word: string;
  rect: { left: number; right: number; top: number; bottom: number; width: number; height: number };
  /** 詞所在的 DOM 元素；供直排上下文判定（li 座標服務接入，見 vertical-anchor.ts） */
  element?: HTMLElement | null;
}"""

WDD_RETURN_OLD = """  return {
    word,
    rect: { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height },
  };"""

WDD_RETURN_NEW = """  return {
    word,
    rect: { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height },
    // li: 直排上下文判定需要真實元素（writing-mode 可能宣告在任何祖先層）
    element: (textNode.parentElement as HTMLElement) ?? null,
  };"""

WDD_ENTRIES = [
    (WDD_IFACE_OLD, WDD_IFACE_NEW, "DomWordHit 新增 element 欄位"),
    (WDD_RETURN_OLD, WDD_RETURN_NEW, "回傳值帶出 element"),
]

# ── 2. hover-lookup.ts ─────────────────────────────────────────────────

HL_IMPORT_ANCHOR = "import { getWordAtOffsetFromPoint } from './word-detection-dom';"
HL_IMPORT_V1 = (
    HL_IMPORT_ANCHOR
    + "\n// li: 直排座標服務（階段 3）——取代原本純水平的 position() 邏輯\n"
    + "import { applyPopupPosition } from './vertical-anchor';"
)
HL_IMPORT_V2 = (
    HL_IMPORT_ANCHOR
    + "\n// li: 直排座標服務（階段 3）——取代原本純水平的 position() 邏輯\n"
    + "import { applyPopupPosition, observeWritingModeChanges } from './vertical-anchor';"
)

HL_FIELD_V1 = (
    "  private anchorRect: RectLike | null = null;\n"
    "  /** li: 詞所在元素，供直排上下文判定；無則退化為橫排行為 */\n"
    "  private anchorEl: HTMLElement | null = null;"
)
HL_FIELD_V2 = HL_FIELD_V1 + (
    "\n  /** li: 直排↔橫排切換監聽的取消函式 */\n"
    "  private layoutWatcher: (() => void) | null = null;"
)

HL_TRIGGER_V1 = "    this.anchorRect = hit.rect;\n    this.anchorEl = hit.element ?? null;"
HL_TRIGGER_V2 = HL_TRIGGER_V1 + (
    "\n    // li: 直排↔橫排切換後重新量測並重定位（li 兩種排版皆可寫，切換會改變佈局）\n"
    "    if (this.anchorEl && !this.layoutWatcher) {\n"
    "      this.layoutWatcher = observeWritingModeChanges(this.anchorEl, (a) => {\n"
    "        // 切換後詞的位置會變，必須用新矩形而非快取的舊值\n"
    "        if (a) {\n"
    "          this.anchorRect = {\n"
    "            left: a.rect.left, right: a.rect.right, top: a.rect.top, bottom: a.rect.bottom,\n"
    "            width: a.rect.right - a.rect.left, height: a.rect.bottom - a.rect.top,\n"
    "          };\n"
    "        }\n"
    "        this.position();\n"
    "      });\n"
    "    }"
)

HL_POSITION_OLD = """  /** below-anchor with viewport flip (ntsiris popup.ts:216-245 pattern) */
  private position(): void {
    const el = this.popupEl;
    const anchor = this.anchorRect;
    if (!el || !anchor) return;
    const doc = this.doc || document;
    const win = doc.defaultView || window;
    const vw = win.innerWidth;
    const vh = win.innerHeight;
    const rect = el.getBoundingClientRect();
    const pw = rect.width || 300;
    const ph = rect.height || 80;

    let left = anchor.left;
    if (left + pw > vw - 8) left = Math.max(8, anchor.right - pw);
    if (left < 8) left = 8;

    let top = anchor.bottom + POPUP_OFFSET;
    if (top + ph > vh - 8) top = anchor.top - ph - POPUP_OFFSET; // flip above
    if (top < 8) top = Math.max(8, vh - ph - 8); // clamp bottom

    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
    el.style.visibility = 'visible';
  }"""

_HL_POSITION_DOC = """  /**
   * li: 交由直排座標服務計算（階段 3）。
   *
   * 原邏輯（below-anchor + viewport flip，ntsiris popup.ts:216-245）為純水平設計，
   * 在直排下會把彈窗壓在同列後續文字上。新邏輯：
   *   - 橫排：座標與原邏輯逐像素一致（test/vertical-anchor.mjs 零回歸門禁）
   *   - 直排：置於換列方向側（vertical-rl → 左，vertical-lr → 右），不遮閱讀流
   *   - 錨點溢出視口時額外鉗制（修正原邏輯的溢出缺陷）
   *   - 直排↔橫排切換後自動重新定位（body 類 / CSS 變數 / resize 監聽）
   * `POPUP_OFFSET` 常數已由 vertical-anchor.ts 的 POPUP_GAP 承接，此處不再使用。
   */
  private position(): void {
    if (!this.popupEl || !this.anchorRect) return;
    // 錨點失效（切換佈局後 DOM 重建、元素被移除）→ 隱藏而非錯位顯示
    if (!applyPopupPosition(this.popupEl, this.anchorRect, this.anchorEl)) {
      this.hide();
    }
  }
"""

# position() 版本無關定位：抓「可選 doc 註解 + private position(): void { … }」整塊。
# 內部區塊縮排 ≥4，故 `\n  }\n` 只會出現在函式尾，可安全非貪婪截斷。
POS_RE = re.compile(
    r"[ ]{2}(?:/\*\*(?:(?!\*/).)*?\*/\n[ ]{2})?"
    r"private position\(\): void \{(?:(?!\n[ ]{2}\}\n).)*?\n[ ]{2}\}\n",
    re.S,  # 註解跨行，需 DOTALL
)

HL_DETACH_OLD = """  detach(): void {
    for (const off of this.listeners) off();"""
HL_DETACH_NEW = """  detach(): void {
    // li: 先撤掉排版切換監聽，避免在 detach 後仍觸發 position()
    if (this.layoutWatcher) { this.layoutWatcher(); this.layoutWatcher = null; }
    for (const off of this.listeners) off();"""

HL_HIDE_OLD = """    this.popupEl?.remove();
    this.popupEl = null;"""
HL_HIDE_NEW = """    if (this.layoutWatcher) { this.layoutWatcher(); this.layoutWatcher = null; }
    this.popupEl?.remove();
    this.popupEl = null;"""

HL_CONST_OLD = "const POPUP_OFFSET = 6;\n"
HL_CONST_NEW = "// li: POPUP_OFFSET 已由 vertical-anchor.ts 的 POPUP_GAP(=6) 承接\n"

# 每條目：(舊文本候選 list, 新文本, 說明)
# patch_text 會依序嘗試候選，第一個命中者被替換 —— 讓腳本能從任何歷史版本升級
HL_ENTRIES = [
    ([HL_IMPORT_ANCHOR, HL_IMPORT_V1], HL_IMPORT_V2, "import 座標服務"),
    ([
        "  private anchorRect: RectLike | null = null;",
        HL_FIELD_V1,
     ], HL_FIELD_V2, "新增 anchorEl / layoutWatcher 欄位"),
    ([
        "    this.anchorRect = hit.rect;",
        HL_TRIGGER_V1,
     ], HL_TRIGGER_V2, "triggerAt 保存 anchorEl 並註冊切換監聽"),
    (HL_DETACH_OLD, HL_DETACH_NEW, "detach() 清理監聽"),
    (HL_HIDE_OLD, HL_HIDE_NEW, "hide() 清理監聽"),
    (HL_CONST_OLD, HL_CONST_NEW, "移除不再使用的 POPUP_OFFSET"),
]


def patch_position(text: str) -> tuple[str, bool]:
    """把 position() 換成座標服務版本（版本無關）。回傳 (新文字, 是否改動)。"""
    m = POS_RE.search(text)
    if not m:
        raise SystemExit("[錯誤] 在 hover-lookup.ts 找不到 position() 方法")
    block = m.group(0)
    # 已是目標版本：同時具備座標服務呼叫與失效隱藏
    if "applyPopupPosition(this.popupEl" in block and "this.hide()" in block:
        return text, False
    return text[: m.start()] + _HL_POSITION_DOC + text[m.end() :], True


def patch_text(text: str, entries: list) -> tuple[str, list[str]]:
    """套用 (候選 list, new, 說明) 列表；回傳 (新文字, 已套用說明)。冪等。"""
    applied = []
    for olds, new, desc in entries:
        if new in text:
            continue  # 已是目標版本
        olds = [olds] if isinstance(olds, str) else olds
        hit = next((o for o in olds if o in text), None)
        if hit is None:
            raise SystemExit(
                f"[錯誤] 找不到待替換片段：{desc}\n  首選片段：{olds[0][:100]}…"
            )
        text = text.replace(hit, new, 1)
        applied.append(desc)
    return text, applied


def check_pending(text: str, entries: list) -> list[str]:
    """回傳尚未套用的條目說明列表（不改動文字）。"""
    pending = []
    for olds, new, desc in entries:
        if new in text:
            continue
        olds = [olds] if isinstance(olds, str) else olds
        if not any(o in text for o in olds):
            raise SystemExit(f"[錯誤] 找不到待替換片段：{desc}")
        pending.append(desc)
    return pending


def main() -> int:
    ap = argparse.ArgumentParser(description="將 li 直排座標服務接入 UD 懸停彈窗")
    ap.add_argument("--ud-root", required=True, help="Universal Dictionary 源碼根目錄（含 src/）")
    ap.add_argument("--va-src", default=None,
                    help="vertical-anchor.ts 來源路徑（預設：<本專案>/src/shared/vertical-anchor.ts）")
    ap.add_argument("--check", action="store_true", help="只檢查是否已打補丁")
    ap.add_argument("--dry-run", action="store_true", help="顯示改動但不寫入")
    args = ap.parse_args()

    root = Path(__file__).resolve().parent.parent
    ud = Path(args.ud_root).resolve()
    va_src = Path(args.va_src).resolve() if args.va_src else root / "src" / "shared" / "vertical-anchor.ts"

    if not (ud / "src" / "hover-lookup.ts").is_file():
        raise SystemExit(f"[錯誤] 找不到 {ud}/src/hover-lookup.ts，--ud-root 有誤？")
    if not va_src.is_file():
        raise SystemExit(f"[錯誤] 找不到座標服務原始檔：{va_src}")

    wdd = ud / "src" / "word-detection-dom.ts"
    wdd_text = wdd.read_text(encoding="utf-8")
    wdd_new, wdd_applied = patch_text(wdd_text, WDD_ENTRIES)

    hl = ud / "src" / "hover-lookup.ts"
    hl_text = hl.read_text(encoding="utf-8")
    hl_new, hl_applied = patch_text(hl_text, HL_ENTRIES)

    va_dst = ud / "src" / "vertical-anchor.ts"
    va_needed = not va_dst.is_file() or va_dst.read_text(encoding="utf-8") != va_src.read_text(encoding="utf-8")

    pending = bool(wdd_applied or hl_applied or va_needed)

    if args.check:
        for path, text, entries in (
            (wdd, wdd_text, WDD_ENTRIES),
            (hl, hl_text, HL_ENTRIES),
        ):
            pend = check_pending(text, entries)
            if path is hl:
                m = POS_RE.search(text)
                if m and not (
                    "applyPopupPosition(this.popupEl" in m.group(0)
                    and "this.hide()" in m.group(0)
                ):
                    pend = pend + ["position() 改用座標服務（含失效隱藏）"]
            print(f"  {'待打' if pend else '已打'}  {path.name}（{len(pend)} 處）")
        print(f"  {'待複製' if va_needed else '已存在'}  vertical-anchor.ts")
        return 1 if (wdd_applied or hl_applied or va_needed) else 0

    if args.dry_run:
        for path, text, entries in (
            (wdd, wdd_text, WDD_ENTRIES),
            (hl, hl_text, HL_ENTRIES),
        ):
            pend = check_pending(text, entries)
            if path is hl:
                m = POS_RE.search(text)
                if m and not (
                    "applyPopupPosition(this.popupEl" in m.group(0)
                    and "this.hide()" in m.group(0)
                ):
                    pend = pend + ["position() 改用座標服務（含失效隱藏）"]
            if pend:
                print(f"  ~ 將修改 {path.name}：{len(pend)} 處 → {', '.join(pend)}")
            else:
                print(f"  = 跳過（已是目標版本）  {path.name}")
        if va_needed:
            print(f"  ~ 將複製 vertical-anchor.ts → {va_dst}")
        return 0

    # 實際寫入
    if wdd_applied:
        wdd.write_text(wdd_new, encoding="utf-8")
        print(f"  ✓ 已修改 {wdd.name}：{', '.join(wdd_applied)}")
    else:
        print(f"  = 跳過（已是目標版本）  {wdd.name}")

    hl_new, pos_changed = patch_position(hl_new)
    if hl_applied or pos_changed:
        hl.write_text(hl_new, encoding="utf-8")
        what = hl_applied + (["position() 改用座標服務（含失效隱藏）"] if pos_changed else [])
        print(f"  ✓ 已修改 {hl.name}：{', '.join(what)}")
    else:
        print(f"  = 跳過（已是目標版本）  {hl.name}")

    if va_needed:
        shutil.copyfile(va_src, va_dst)
        print(f"  ✓ 已複製 vertical-anchor.ts → {va_dst}")
    else:
        print("  = 跳過（內容一致）  vertical-anchor.ts")

    print("\n完成。後續：在 UD 專案執行 tsc / eslint 驗證。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
