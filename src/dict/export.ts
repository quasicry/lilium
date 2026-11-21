// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry
/**
 * 統一「導出 Markdown 到 Vault」通道。
 *
 * 轉寫、語料 KWIC 落在 lilium/Shares/，且共用同一個落點與同一段
 * 「建資料夾 → 寫檔 → 提示」邏輯，避免各自實作、各自炸。
 *
 * 落點沿用既有慣例：lilium/Shares/（不在本檔硬寫整個路徑，交由呼叫方決定檔名，
 * 例如 轉写-<ts>.md）。
 */
import { normalizePath } from 'obsidian';
import { liNotice } from '../ui-hig';
import type { DictFeature } from './plugin';

/** 導出成功後的提示 i18n key（預設轉寫，可由呼叫方覆寫成校勘/語料的 key）。 */
/** 檔名時間戳（本地時區精確到秒；冒號換 - 保檔名跨平台合法）——取代 Date.now() 毫秒串。 */
export function fileTimestamp(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

export async function exportMarkdownToVault(
  plugin: DictFeature,
  filename: string,
  lines: string[],
  i18nKey: string = 'dict.translit.saved',
): Promise<void> {
  const folder = 'lilium/Shares';
  await plugin.ensureFolder(`${folder}/x.md`);
  let file = `${folder}/${filename}`;
  const content = lines.join('\n');
  // A2：vault.create 對既有路徑拋 File already exists——秒級時間戳檔名同一秒
  // 兩次匯出（或重試）即碰撞。這裡 create 失敗時升級檔名（-2、-3…）重試，收斂
  // 原 nextAvailablePath 的防碰撞訴求且無 TOCTOU（create 本身是原子判定點）。
  for (let attempt = 1; ; attempt++) {
    try {
      await plugin.app.vault.create(normalizePath(file), content);
      break;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (attempt >= 10 || !/already exists/i.test(msg)) throw e;
      const dot = file.lastIndexOf('.');
      const stem = dot > 0 ? file.slice(0, dot) : file;
      const ext = dot > 0 ? file.slice(dot) : '';
      file = `${stem} ${attempt}${ext}`;
    }
  }
  liNotice(plugin.T(i18nKey, { file }));
}
