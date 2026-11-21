// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry
/**
 * 防護機制（Hardening）
 *
 * 目標：
 * 1. 防止插件載入 Obsidian 失敗：onload 階段化防護，任何一步失敗都不拖垮整個插件；
 * 2. 防止使用過程崩潰：所有異步入口（命令 / 導出 / 渲染 / 設置保存）統一防護，
 *    失敗時記錄日誌 + 用戶可見提示，絕不產生未捕獲異常。
 *
 * 原則：
 * - 只吞「本插件範圍內」的錯誤，且必定 console.error 留痕（前綴 [lilium]）；
 * - 用戶提示走 i18n（common.operationFailed / view.renderError）；
 * - 失敗後進入降級態：字體失敗→系統字體棧；設置損壞→默認設置；渲染失敗→錯誤佔位 + 重試按鈕。
 */
import { liNotice } from "./ui-hig";

/** 異步防護：fn 失敗時記錄日誌（可選 Notice），返回 undefined 而非拋出 */
export async function guard<T>(
  label: string,
  fn: () => Promise<T>,
  opts?: { notice?: string; silent?: boolean }
): Promise<T | undefined> {
  try {
    return await fn();
  } catch (e) {
    console.error(`[lilium] ${label}:`, e);
    if (opts?.notice && !opts.silent) {
      const msg = e instanceof Error ? e.message : String(e);
      liNotice(`${opts.notice}\n${msg}`, 8000);
    }
    return undefined;
  }
}

/** 同步防護版 */
export function guardSync<T>(label: string, fn: () => T, opts?: { notice?: string }): T | undefined {
  try {
    return fn();
  } catch (e) {
    console.error(`[li] ${label}:`, e);
    if (opts?.notice) {
      const msg = e instanceof Error ? e.message : String(e);
      liNotice(`${opts.notice}\n${msg}`, 8000);
    }
    return undefined;
  }
}

/** 結構守衛：確保從 data.json 讀到的是對象（防止損壞的設置文件把 Object.assign 變成字符展開） */
export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
