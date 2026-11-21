// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry

/**
 * 設置頁單一原生 tab＋頁內自繪膠囊分頁條。
 * 仿 logancyang/obsidian-copilot SettingsMainV2（頁內 TabItem/TabContent）：
 * - 只佔一個 Obsidian nav 位置，分區切換在頁內完成（桌面/移動同一結構）；
 * - 膠囊排 flex-wrap（窄屏自動換行）＋ aria（role=tab/aria-selected/aria-controls）
 *   ＋鍵盤 Enter/Space；
 * - 樣式全用 Obsidian 原生變量（主題自動跟隨）。
 */

export interface LiSettingsTabDef {
  id: string;
  label: string;
  /** aria-controls 對應內容容器 id */
  panelId: string;
}

/**
 * 渲染頁內膠囊 tab 條。回調 onSelect(id) 由宿主重渲染內容區。
 * activeId 為當前選中分區（宿主持狀態，本函式每次重渲染重建）。
 */
export function renderLiSettingsTabs(
  container: HTMLElement,
  tabs: LiSettingsTabDef[],
  activeId: string,
  onSelect: (id: string) => void,
): void {
  const bar = container.createDiv("li-settings-tabs");
  bar.setAttribute("role", "tablist");
  for (const t of tabs) {
    const btn = bar.createEl("button", {
      cls: "li-settings-tab" + (t.id === activeId ? " is-active" : ""),
      text: t.label,
      attr: {
        type: "button",
        role: "tab",
        "aria-selected": String(t.id === activeId),
        "aria-controls": t.panelId,
      },
    });
    btn.addEventListener("click", () => onSelect(t.id));
    btn.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onSelect(t.id);
      }
    });
  }
}
