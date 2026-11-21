// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry

/**
 * UI 測試共用素材
 * ---------------------------------------------------------------------------
 * 供 `theme-compat.mjs`（主題共存）與 `ui-surfaces.mjs`（桌面 / 移動可行性）
 * 共用：模擬主題變數、介面 DOM 範本、觸屏等價 CSS。
 * 只要插件 UI 在這些極端值下都不破版、不產生低對比，就不會跟使用者的主題打架。
 */

/** 各套模擬主題：只給 Obsidian 的標準 CSS 變數，完全不碰插件自己的變數。 */
export const THEMES = {
  light: {
    label: "預設淺色",
    vars: {
      "--background-primary": "#ffffff",
      "--background-primary-alt": "#fafafa",
      "--background-secondary": "#f3f3f3",
      "--background-modifier-border": "#e0e0e0",
      "--background-modifier-border-hover": "#c8c8c8",
      "--background-modifier-hover": "rgba(0,0,0,0.06)",
      "--background-modifier-form-field": "#ffffff",
      "--text-normal": "#222222",
      "--text-muted": "#777777",
      "--text-faint": "#999999",
      "--text-accent": "#6a4fd8",
      "--interactive-accent": "#6a4fd8",
      "--interactive-accent-hover": "#7d66e0",
      "--text-on-accent": "#ffffff",
    },
  },
  dark: {
    label: "預設深色",
    vars: {
      "--background-primary": "#1e1e1e",
      "--background-primary-alt": "#1a1a1a",
      "--background-secondary": "#262626",
      "--background-modifier-border": "#3a3a3a",
      "--background-modifier-border-hover": "#555555",
      "--background-modifier-hover": "rgba(255,255,255,0.08)",
      "--background-modifier-form-field": "#2a2a2a",
      "--text-normal": "#dcddde",
      "--text-muted": "#999999",
      "--text-faint": "#7a7a7a",
      "--text-accent": "#8f7ff5",
      "--interactive-accent": "#7f6df2",
      "--interactive-accent-hover": "#8f7ff5",
      "--text-on-accent": "#ffffff",
    },
  },
  /** OLED 純黑 + 高對比文字：最容易暴露「硬編淺色」的主題 */
  highContrast: {
    label: "OLED 純黑高對比",
    vars: {
      "--background-primary": "#000000",
      "--background-primary-alt": "#000000",
      "--background-secondary": "#0d0d0d",
      "--background-modifier-border": "#4a4a4a",
      "--background-modifier-border-hover": "#6a6a6a",
      "--background-modifier-hover": "rgba(255,255,255,0.12)",
      "--background-modifier-form-field": "#111111",
      "--text-normal": "#ffffff",
      "--text-muted": "#c8c8c8",
      "--text-faint": "#a0a0a0",
      "--text-accent": "#ffcc00",
      "--interactive-accent": "#ffcc00",
      "--interactive-accent-hover": "#ffd633",
      "--text-on-accent": "#000000",
    },
  },
  /** 半透明（玻璃感社群主題）：背景帶 alpha，最容易讓毛玻璃透出奇怪內容 */
  glass: {
    label: "半透明玻璃主題",
    vars: {
      "--background-primary": "rgba(40,42,54,0.72)",
      "--background-primary-alt": "rgba(40,42,54,0.66)",
      "--background-secondary": "rgba(68,71,90,0.55)",
      "--background-modifier-border": "rgba(255,255,255,0.16)",
      "--background-modifier-border-hover": "rgba(255,255,255,0.28)",
      "--background-modifier-hover": "rgba(255,255,255,0.10)",
      "--background-modifier-form-field": "rgba(68,71,90,0.5)",
      "--text-normal": "#f8f8f2",
      "--text-muted": "#b9bcae",
      "--text-faint": "#8d907f",
      "--text-accent": "#bd93f9",
      "--interactive-accent": "#bd93f9",
      "--interactive-accent-hover": "#caa9fa",
      "--text-on-accent": "#1e1f29",
    },
    /** 半透明主題需要一張底圖，否則合成結果無意義 */
    wallpaper: "linear-gradient(135deg,#3b3f58,#22303f 60%,#4a3b58)",
  },
  /** 使用者把強調色改成高彩度暖色（社群主題常見） */
  warmAccent: {
    label: "自訂暖色強調",
    vars: {
      "--background-primary": "#fdf6e3",
      "--background-primary-alt": "#faf3dd",
      "--background-secondary": "#f2ead6",
      "--background-modifier-border": "#ddd3b8",
      "--background-modifier-border-hover": "#c8bd9d",
      "--background-modifier-hover": "rgba(0,0,0,0.07)",
      "--background-modifier-form-field": "#fffdf5",
      "--text-normal": "#3b3228",
      "--text-muted": "#7a6f5d",
      "--text-faint": "#9c9081",
      "--text-accent": "#d14b2a",
      "--interactive-accent": "#d14b2a",
      "--interactive-accent-hover": "#e05c39",
      "--text-on-accent": "#ffffff",
    },
  },
  /** 緊湊主題：字級與內距被社群主題壓小，用來驗證插件沒寫死尺寸 */
  compact: {
    label: "緊湊排版主題",
    vars: {
      "--background-primary": "#ffffff",
      "--background-primary-alt": "#fbfbfb",
      "--background-secondary": "#eeeeee",
      "--background-modifier-border": "#dcdcdc",
      "--background-modifier-border-hover": "#c0c0c0",
      "--background-modifier-hover": "rgba(0,0,0,0.05)",
      "--background-modifier-form-field": "#ffffff",
      "--text-normal": "#1a1a1a",
      "--text-muted": "#666666",
      "--text-faint": "#888888",
      "--text-accent": "#2b7a78",
      "--interactive-accent": "#2b7a78",
      "--interactive-accent-hover": "#358f8d",
      "--text-on-accent": "#ffffff",
    },
    extraCss: `body{font-size:13px;} .li-settings .setting-item-description{font-size:11px;}`,
  },
};

/** 把主題物件轉成 CSS（掛在 :root，另外可選壁紙 / 額外樣式） */
export function themeCss(theme) {
  const vars = Object.entries(theme.vars)
    .map(([k, v]) => `  ${k}: ${v};`)
    .join("\n");
  const wall = theme.wallpaper
    ? `\nhtml{background:${theme.wallpaper};background-attachment:fixed;}`
    : "";
  return `:root{\n${vars}\n}${wall}\n${theme.extraCss || ""}`;
}

/** 與 styles.css 中 @media (pointer: coarse) 等價的規則（headless 無法模擬該媒體特性） */
export const TOUCH_CSS = `
.li-btn, .li-seg-btn { padding: 8px 14px; font-size: 13px; min-height: 44px; min-width: 44px; }
.li-seg-btn { min-width: 48px; }
.li-toolbar { gap: 8px; padding: 6px 10px; }
.li-side-toggle, .li-side-btn { min-width: 44px; min-height: 44px; }
.li-side-toggle { width: 44px; }
.li-side-group-title { min-height: 44px; }
.li-side-slider { height: 32px; }
.li-stage, .li-editor-textarea { touch-action: pan-x; }
/* v2.6.2：只抬 min-height，不再動 padding（padding 會把原生滑桿軌道擠歪）。
   開關的偽元素擴展區也一併移除——外觀與可點區都交回 Obsidian 原生。 */
.li-settings .setting-item-control button,
.li-settings .setting-item-control select,
.li-settings .setting-item-control input:not([type="checkbox"]):not([type="range"]) { min-height: 44px; }
/* 彈窗按鈕：選擇器與 styles.css 的 @media(pointer:coarse) 規則同源（對齊
   現役 PrintEditorModal——舊 .li-print-modal 類已凍結進快照，實際 DOM 是
   .li-print-editor-modal .li-print-editor-print）。本檔在 styles.css 之後注入。 */
.li-print-editor-modal button:not(.mod-cta):not(.mod-warning),
.li-print-editor-modal button.mod-cta { min-height: 44px; padding: 0 16px; }
`;

/**
 * Obsidian 原生控制項殼層（依 app.css 近似重建）
 * ---------------------------------------------------------------------------
 * 設定頁的開關 / 滑桿 / 下拉 / 輸入框 / 按鈕外觀全部交回 Obsidian。
 * 這意味著 ui-surfaces 不能再只餵 BASE_CSS + 插件 CSS 就量幾何——那等於量
 * 「沒有任何樣式的裸控制項」，量到的不是使用者看到的東西。所以這裡補上
 * Obsidian 自己畫控制項的那幾條。
 *
 * 兩個關鍵尺寸是真實 app.css 的值，測試斷言直接釘它們：
 *   · .checkbox-container 40×22（膠囊形開關；自繪的是 51×31 的 iOS 款）
 *   · input[type=range] width:100%（滑桿撐滿控制區；百分比遇上「寬度由內容
 *     決定」的父層會退化，這正是滑桿被壓成 129px 的機制）
 */
export const OBSIDIAN_CONTROLS = `
.setting-item{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 0;border-top:1px solid var(--background-modifier-border,var(--background-modifier-border,#ddd));}
.setting-item-info{flex:1 1 auto;min-width:0;}
.setting-item-name{font-size:var(--font-ui-small,13px);color:var(--text-normal);}
.setting-item-description{font-size:var(--font-ui-smaller,12px);color:var(--text-muted);}
.setting-item-control{flex:1 1 auto;display:flex;align-items:center;justify-content:flex-end;gap:8px;min-width:0;}
.checkbox-container{position:relative;flex-shrink:0;width:40px;height:22px;border-radius:1em;background:var(--background-modifier-border,#ddd);cursor:pointer;transition:background .15s ease-in-out;}
.checkbox-container::after{content:"";position:absolute;top:2px;left:2px;width:18px;height:18px;border-radius:50%;background:#fff;transition:transform .15s ease-in-out;}
.checkbox-container.is-enabled{background:var(--interactive-accent,#2b7a78);}
.checkbox-container.is-enabled::after{transform:translateX(18px);}
.checkbox-container input[type="checkbox"]{position:absolute;inset:0;width:100%;height:100%;margin:0;opacity:0;cursor:pointer;}
input[type="range"]{width:100%;height:32px;margin:0;}
select{height:30px;min-width:96px;}
input[type="text"],input[type="number"]{height:30px;padding:0 6px;}
button{height:30px;padding:0 10px;cursor:pointer;font-size:var(--font-ui-small,13px);}
`;

/** 基礎排版：字型與歸零，不含任何主題色。
 *  box-sizing: border-box 是 Obsidian 套用在全域的前提（它的 app.css 有
 *  `*{box-sizing:border-box}`）。不補這條，任何 width:100% + padding 的
 *  面板在測試裡都會假性溢出，得到與真實環境不符的結果。 */
export const BASE_CSS = `
*, *::before, *::after { box-sizing: border-box; }
html,body{margin:0;padding:0;font-family:-apple-system,"Segoe UI","PingFang SC","Noto Sans CJK SC",sans-serif;}
body{background:var(--background-primary);color:var(--text-normal);}
`;

/** 設定頁 DOM：完全照 settings.ts 的 Obsidian 原生結構模擬 */
export const SETTINGS_HTML = `
<div class="li-settings">
  <h3>內容書寫系統</h3>
  <p class="li-settings-intro">先選這裡：決定正文的書寫系統與直排方案。</p>
  <div class="setting-item">
    <div class="setting-item-info">
      <div class="setting-item-name">介面語言</div>
      <div class="setting-item-description">跟隨 Obsidian 語言，或手動指定</div>
    </div>
    <div class="setting-item-control"><select><option>繁體中文</option></select></div>
  </div>
  <div class="setting-item">
    <div class="setting-item-info">
      <div class="setting-item-name">自動偵測</div>
      <div class="setting-item-description">依筆記內容自動判斷文種</div>
    </div>
    <div class="setting-item-control"><div class="checkbox-container is-enabled"><input type="checkbox" checked></div></div>
  </div>
  <div class="setting-item">
    <div class="setting-item-info">
      <div class="setting-item-name">多文種轉寫</div>
      <div class="setting-item-description">啟用拉丁／原生雙向轉寫命令與檢字表</div>
    </div>
    <div class="setting-item-control"><div class="checkbox-container"><input type="checkbox"></div></div>
  </div>
  <div class="setting-item setting-item-heading">
    <div class="setting-item-info"><div class="setting-item-name">字體與排版</div></div>
  </div>
  <div class="setting-item">
    <div class="setting-item-info">
      <div class="setting-item-name">字號</div>
      <div class="setting-item-description">正文基準字號（px）</div>
    </div>
    <div class="setting-item-control"><input type="range" min="12" max="32" value="18"></div>
  </div>
  <div class="setting-item">
    <div class="setting-item-info">
      <div class="setting-item-name">自訂字體</div>
      <div class="setting-item-description">留空則使用內嵌 Noto 字體</div>
    </div>
    <div class="setting-item-control"><input type="text" placeholder="例如 Noto Serif CJK SC"></div>
  </div>
  <div class="setting-item">
    <div class="setting-item-info">
      <div class="setting-item-name">字體庫</div>
      <div class="setting-item-description">已內嵌 Noto 字體，可另行匯入</div>
    </div>
    <div class="setting-item-control"><button class="mod-cta">開啟詞典設定</button><button>重新掃描</button></div>
  </div>
  <table class="li-char-table"><thead><tr><th>字形</th><th>羅馬</th><th>說明</th></tr></thead><tbody>
    <tr class="li-char-table-section"><td colspan="3">Ali Gali 符號</td></tr>
    <tr><td>ᢁ</td><td>ṃ</td><td>隨鼻符</td></tr>
    <tr><td>ᢄ</td><td>ka</td><td>借音字母</td></tr>
  </tbody></table>
</div>`;

/** 視圖：工具列（毛玻璃 + 分段控件）+ 側欄 + 通知 */
export const VIEW_HTML = `
<!-- .li-view-host 模擬 Obsidian 的 .view-content：定位上下文 + 裁切。
     真實環境由 Obsidian 提供；測試裡必須自己補，否則收合狀態的側欄
     （translateX(100%)）會把頁面撐寬，產生假的水平溢出。 -->
<div class="li-view-host" style="position:relative;overflow:hidden;height:420px">
<div class="li-view">
  <div class="li-toolbar">
    <div class="li-seg"><button class="li-seg-btn">閱讀</button><button class="li-seg-btn is-active">編輯</button><button class="li-seg-btn">分頁</button></div>
    <button class="li-btn li-btn-aa">A-</button>
    <button class="li-btn li-btn-accent">檢字表</button>
    <button class="li-side-toggle">☰</button>
  </div>
  <div class="li-stage li-stage-vertical"><div class="li-doc">牀前明月光，疑是地上霜。</div></div>
  <div class="li-side-panel">
    <div class="li-side-handle" aria-hidden="true"></div>
    <details class="li-side-group" open>
      <summary class="li-side-group-title">排版</summary>
      <div class="li-side-group-body">
        <div class="li-side-row li-side-num">
          <div class="li-side-num-head"><span class="li-side-label">字級</span><span class="li-side-val">18pt</span></div>
          <input class="li-side-slider" type="range" min="6" max="36" step="0.5" value="18">
        </div>
        <div class="li-side-row li-side-toggle-row"><span class="li-side-label">列間線</span><input type="checkbox"></div>
      </div>
    </details>
    <details class="li-side-group" open>
      <summary class="li-side-group-title">方向</summary>
      <div class="li-side-group-body">
        <div class="li-side-row"><span class="li-side-label">排列</span><select class="li-side-select"><option>直排</option></select></div>
        <div class="li-side-row"><span class="li-side-label">起筆</span><select class="li-side-select"><option>由右往左</option></select></div>
        <div class="li-side-row li-side-toggle-row"><span class="li-side-label">跟隨文種</span><input type="checkbox" checked></div>
      </div>
    </details>
    <div class="li-side-row"><span class="li-side-label">方案</span><select class="li-side-select"><option>tibetan-wylie</option></select></div>
  </div>
</div>
</div>
<div class="notice-container"><div class="li-notice notice">已切換為直排（vertical-rl）</div></div>`;

/** 列印版面彈窗 */
/* MODAL_HTML 對齊現役 PrintEditorModal（print-editor.ts onOpen）——
   探針已改量 .li-print-editor-modal .li-print-editor-print，但 fixture
   未同步（仍是凍結的 .li-print-modal 結構），致「彈窗按鈕找不到元素」16 失敗。
   結構按 onOpen 實際建的 DOM：modalEl.li-print-editor-modal > contentEl >
   grid(params+preview) + actions(print 鈕)。 */
export const MODAL_HTML = `
<div class="modal-container"><div class="modal li-print-editor-modal">
  <div class="modal-content li-print-editor-content">
    <div class="li-print-editor-grid">
      <div class="li-print-editor-params">
        <div class="li-print-editor-params-title">列印參數</div>
        <div class="setting-item"><div class="setting-item-info"><div class="setting-item-name">紙張</div><div class="setting-item-description">A4 / B5 / 自訂</div></div><div class="setting-item-control"><select><option>A4</option></select></div></div>
        <div class="setting-item"><div class="setting-item-info"><div class="setting-item-name">邊界</div></div><div class="setting-item-control"><input type="number" value="20"></div></div>
      </div>
      <div class="li-print-editor-preview">
        <div class="li-print-editor-preview-bar"><div class="li-print-editor-preview-title">預覽</div></div>
        <div class="li-print-editor-preview-stage"><div class="li-print-editor-pagebox"><div class="li-print-editor-page"><div class="li-print-sample">樣張</div></div></div></div>
      </div>
    </div>
    <div class="li-print-editor-actions"><button class="mod-cta li-print-editor-print">列印</button></div>
  </div>
</div></div>`;
