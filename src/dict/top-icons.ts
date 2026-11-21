// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry

/**
 * 標題行兩枚切換圖示：
 * 學習左面板 ribbon（brand-lilium-icon.ts→addIcon→addRibbonIcon，移動端有效）與
 * lilith 直排切換鈕（brand.ts→addIcon→setIcon，移動端有效）的官方通路——
 * inline innerHTML 在移動端塌純色塊（原因不明，兩輪 CSS 修無效），改走 obsidian
 * 官方 icon 註冊庫：addIcon 註冊 → setIcon 引用。SVG 取 lucide 官方
 * （library / languages，lucide-icons/lucide main，ISC 授權）。
 *
 * 【退役】移動端 svg 三通路全敗後，標題行改字元圖示（view.ts textContent）。
 * 本檔保留作 svg 通路備援（如日後找到移動端 svg 根因可復用），目前無消費者。
 */
import { addIcon } from "obsidian";

export const LILIUM_TOP_DICT_ICON_ID = "lilium-top-dict";
export const LILIUM_TOP_TRANSLIT_ICON_ID = "lilium-top-translit";

const LUCIDE_LIBRARY =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m16 6 4 14"/><path d="M12 6v14"/><path d="M8 8v12"/><path d="M4 4v16"/></svg>';

const LUCIDE_LANGUAGES =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 8 6 6"/><path d="m4 14 6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/><path d="m22 22-5-10-5 10"/><path d="M14 18h6"/></svg>';

let registered = false;

/** 冪等註冊進 obsidian 官方 icon 庫（插件 onload 調一次即可）。 */
export function registerTopIcons(): void {
  if (registered) return;
  addIcon(LILIUM_TOP_DICT_ICON_ID, LUCIDE_LIBRARY);
  addIcon(LILIUM_TOP_TRANSLIT_ICON_ID, LUCIDE_LANGUAGES);
  registered = true;
}
