// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry
/**
 * 辭典音頻播放會話——生命週期紀律中樞（B3）。
 *
 * ## 為什麼需要
 *
 * lilium 詞條的音頻播放面原本分散三處、各自為政：
 *   ① headRow ▶ 鈕：一次性 `new Audio(blobUrl)`，onended/onerror 才 revoke——
 *      切詞/重查/關視圖時舊音頻**繼續播放**，連點不同詞會疊音；
 *   ② iframe 內 sound:// 原位 `<audio controls>`：A3 只在「同連結重擊」時 revoke
 *      前次 URL（WeakMap 不可枚舉）——視圖關閉後 blob URL 永不回收；
 *   ③ iframe 內 `<audio controls src=app://…>`：src 非 blob，無洩漏，但播放中
 *      面板刷新/關閉時無人喊停。
 *
 * 本模組收斂為**單一活躍播放面**紀律：任何時刻至多一個音頻在響；切詞/關視圖/
 * 面板刷新一律 stopAll()——停播＋revoke 全部登記的 blob URL。
 *
 * ## 設計要點
 *
 * - 播放面登記制：一次性 Audio() 與 iframe `<audio>` 都登記進來，stopAll 統一
 *   停止；blob URL 同冊管理，停止即回收。
 * - WeakMap 換成顯式 Map（需要可枚舉才能全域回收）；條目 DOM 移除時的殘留
 *   登記由 stopAll 統一清——登記表本身隨播放面短暫存在，無長期駐留。
 * - 全函式容錯：任何媒體 API 異常不得打斷查詢主流程（catch 吞，Notice 由呼叫方）。
 */

/** 單一登記項：播放元素＋其 blob URL（可為 null＝src 非 blob，如 data:/app://） */
interface AudioSessionEntry {
  el: HTMLAudioElement;
  blobUrl: string | null;
}

/** 當前活躍播放（模組級——面板只有一個實例，模組級狀態等價實例狀態） */
let current: AudioSessionEntry | null = null;

/** 播放結束/出錯時的復原回調（▶鈕 ▮▮→▶ 用）；stopAll 時亦觸發 */
let onStopped: (() => void) | null = null;

/**
 * 播放一段音頻（接管此前 live 舉措）。
 * @param blobUrl 已建立的 blob URL（本函式擁有其生命週期——停止/結束時 revoke）
 * @param onEnded 結束/出錯/被 stopAll 打斷時的復原回調（▶鈕復原；可為 null）
 * @returns play() 的 Promise（呼叫方 catch 處理 play 拒絕）
 */
export function playAudioSession(blobUrl: string, onEnded?: () => void): Promise<void> {
  stopAll();
  const el = new Audio(blobUrl);
  current = { el, blobUrl };
  onStopped = onEnded ?? null;
  const finish = () => {
    // 結束/出錯：僅當仍是當前播放面時回收（被 stopAll 頂掉後不重入）
    if (current?.el === el) {
      current = null;
      onStopped = null;
      try { URL.revokeObjectURL(blobUrl); } catch { /* 已 revoke */ }
      onEnded?.();
    } else {
      // 被 stopAll 頂掉：URL 已由 stopAll 回收，只補 UI 復原
      onEnded?.();
    }
  };
  el.onended = finish;
  el.onerror = finish;
  return el.play();
}

/**
 * 登記 iframe 內原位播放器（`<audio controls>`）：可暫停/重播的長驻播放面。
 * stopAll 時 pause＋（有 blob URL 時）revoke。
 * @param el 播放器元素
 * @param blobUrl 其 src 為 blob 時登記 URL 供回收；data:/app:// 傳 null
 */
export function registerAudioPlayer(el: HTMLAudioElement, blobUrl: string | null): void {
  // 單活躍紀律：登記新播放器前，停掉此前的一次性播放（同時響兩個＝疊音）
  if (current) stopAll();
  current = { el, blobUrl };
}

/**
 * 停止全部活躍音頻並回收 blob URL。
 * 接線點：doLookup（切詞）、onClose（視圖關閉）、renderResults 重繪前（面板刷新）。
 */
export function stopAll(): void {
  if (current) {
    try { current.el.pause(); } catch { /* 已銷毀 */ }
    if (current.blobUrl) {
      try { URL.revokeObjectURL(current.blobUrl); } catch { /* 已 revoke */ }
    }
    // 原位播放器（iframe 內）隨條目 DOM 存亡，不在此移除 DOM——只停聲。
    current = null;
  }
  if (onStopped) {
    const cb = onStopped;
    onStopped = null;
    try { cb(); } catch { /* 復原回調異常不打斷 */ }
  }
}

/** 測試探針：當前是否仍有活躍播放（僅 lib-export 測試面使用） */
export function hasActiveAudio(): boolean {
  return current !== null;
}
