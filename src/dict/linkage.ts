// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry
/**
 * lilium 辭典 — Feature Linkage Hub.
 *
 * 功能聯動中樞：Hub 保存跨面板的會話狀態，各面板通過 hub 傳遞數據而非互相引用。
 *
 * 目前 Hub 保留為後續聯動（如辭典 ⇄ 轉寫）的掛載點。
 */
import type { DictFeature } from './plugin';

export class FeatureLinkage {
  private plugin: DictFeature;

  constructor(plugin: DictFeature) {
    this.plugin = plugin;
  }
}

/** HTML → 純文本（去標籤/脚本/樣式，解實體，壓空白） */
export function htmlToPlainText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
