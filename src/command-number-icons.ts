// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry
/**
 * 命令序號圖示（行動版工具列）——
 * Obsidian 行動版工具列對未配 icon 的命令顯示「帶圈問號」，不可辨識。
 * 本模組為每個 lilium 命令生成序號 lucide 風格 SVG（去圓底、數字映射
 * 天城文數字 U+09E6–09EF、放大字號），經 addIcon 註冊為 `lilium-num-<NN>`，
 * 命令以 icon 欄位引用。序號＝命令註冊順序（10 起），與命令面板排序一致。
 * 天城文映射由 toDevanagariDigits 單一函式承擔（run.mjs 斷言逐位核對）。
 */
import { addIcon } from "obsidian";
import { numberIconSvg } from "./command-number-digits";

export { toDevanagariDigits, numberIconSvg } from "./command-number-digits";

/**
 * 依序為命令清單註冊序號圖示；回傳「命令 id → icon id」映射。
 * 在 onload 的命令註冊之前呼叫一次。
 */
export function registerNumberIcons(ids: string[]): Record<string, string> {
  // 序號從 10 起：1—9 在真機持續空白（嵌套 svg 修復後仍未解），
  // 改用兩位數字形區段避開——機制同一、僅換字形。
  const BASE = 9;
  const map: Record<string, string> = {};
  ids.forEach((id, i) => {
    const n = BASE + i + 1;
    const iconId = `lilium-num-${String(n).padStart(2, "0")}`;
    try {
      addIcon(iconId, numberIconSvg(n)); // 重複註冊同 id 為冪等覆蓋
    } catch (e) {
      console.error(`[lilium] 序號圖示註冊失敗（${iconId}，已隔離）:`, e);
    }
    map[id] = iconId;
  });
  return map;
}
