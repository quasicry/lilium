// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * UI 工具
 * ---------------------------------------------------------------------------
 * 與 styles.css 的設計系統配套的小工具層：目前提供 liNotice()，用來發出帶
 * .li-notice 標記的通知，讓 CSS 能精準套用 Apple 形制而不外溢到其他插件的
 * 通知（全域 .notice 一律不碰，那是別人的地盤）。
 *
 * 只做「加標記」這類無副作用的事，不改變任何既有行為。
 */

import { Notice } from "obsidian";

/**
 * 發出一則通知，並在元素上掛 `.li-notice`。
 * 簽名與 `new Notice()` 完全一致，可直接平替。
 */
export function liNotice(message: string | DocumentFragment, timeout?: number): Notice {
  // Notice(message) 不帶 timeout 時 Obsidian 官方語義＝常駐不消失
  //（須手動點掉）——本插件 59 處呼叫中 36 處未傳 timeout，通知因此堆積。
  // 統一缺省 5s；顯式傳 0 仍保留常駐語義（呼叫方明確要求時不被覆蓋）。
  const effective = timeout === undefined ? 5000 : timeout;
  const n = new Notice(message, effective);
  // 掛 class 而不改內容：訊息文字、顯示時長、Obsidian 自己的移除邏輯都不動。
  // 可選鏈是刻意的防護：headless / 模擬環境（如 test/obsidian-mock.cjs）的 Notice
  // 可能沒有 noticeEl；那時只發通知、不打標記，絕不因「打個標記」而讓通知本身失敗。
  (n as unknown as { noticeEl?: HTMLElement }).noticeEl?.addClass("li-notice");
  return n;
}
