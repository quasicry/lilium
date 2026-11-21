// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry
import { App, Modal, Notice, PluginSettingTab, Setting, type SettingDefinitionItem } from "obsidian";
import { renderLiSettingsTabs } from "./settings-tabs";
import { LangCode, LANGS, t } from "./i18n";
import VerticalWriterPlugin from "./main";

/**
 * 重置用：原地深拷貝——把 src 遞歸寫入既有 target 的**同一批子物件**，
 * 不替換頂層或子層引用。如此其它模組捕獲的舊引用（如字體彈層閉包捕獲的
 * settings.typography）在重置後仍有效且讀到新值。供測試直接驗證原地語義。
 */
export function deepAssignInto(
  target: Record<string, unknown>,
  src: Record<string, unknown>,
): void {
  for (const k of Object.keys(src)) {
    const v = src[k];
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      if (!target[k] || typeof target[k] !== "object" || Array.isArray(target[k])) {
        target[k] = JSON.parse(JSON.stringify(v));
      } else {
        deepAssignInto(target[k] as Record<string, unknown>, v as Record<string, unknown>);
      }
    } else {
      target[k] = v;
    }
  }
}
import { renderDictSections } from "./dict/settings";
import { DEFAULT_SETTINGS as DICT_DEFAULT_SETTINGS } from "./dict/plugin";
import { listSchemes } from "./translit-common";
import { translitGroupLabel } from "./translit-ui";

export interface VWSettings {
  uiLang: LangCode | "auto";
  /** 反饋郵箱。點擊「反饋」按鈕合打開郵件客戶端寄給此郵箱。默認 quasicry@gmail.com */
  feedbackEmail: string;
  /** 贊助 */
  sponsorshipUrl: string;
  /** 多文種轉寫方案為常駐功能，恆為 true（欄位保留為兼容舊 data.json；UI 開關已移除） */
  enableTransliteration: boolean;
  /** 檢字表可檢視的文種分組（group 鍵）。空陣列表示顯示所有已註冊文種 */
  translitVisibleGroups: string[];
}

export const DEFAULT_SETTINGS: VWSettings = {
  uiLang: "zh-TW",
  feedbackEmail: "quasicry@gmail.com",
  // 默認贊助連結＝Buy Me a Coffee（可改/清空；空＝按鈕不開連結）
  sponsorshipUrl: "https://buymeacoffee.com/quasicry",
  enableTransliteration: true,
  translitVisibleGroups: [],
};

/* ---------------- S1：設置深鏈接（one-shot 手遞手） ----------------
 * one-shot 消費模式：請求 → setting.open()
 * openLiSettings 直接 openTabById（rAF hack 已退役）。
 * S3 合併後語義升級為「選中分區」；本 API 形狀保持不變。 */
let requestedSettingsSection: string | null = null;
/** B9：請求時戳——設置頁始終未打開時，滯留請求 60s 後過期，不再劫持下次任何
 * 路徑的設置落點（模組級變數無過期的 one-shot 欠帳）。 */
let requestedSettingsAt = 0;
const REQUESTED_SETTINGS_TTL_MS = 60_000;

/** 記下一個一次性請求：下次 lilium 設置頁打開時落到指定分區。 */
export function requestSettingsSection(sectionId: string): void {
  requestedSettingsSection = sectionId;
  requestedSettingsAt = Date.now();
}

/** 取走（消費）一次性請求；普通打開或已過期返回 null。one-shot：取走即失效。 */
export function consumeRequestedSettingsSection(): string | null {
  const expired = requestedSettingsAt > 0 && Date.now() - requestedSettingsAt > REQUESTED_SETTINGS_TTL_MS;
  const r = expired ? null : requestedSettingsSection;
  requestedSettingsSection = null;
  requestedSettingsAt = 0;
  return r;
}

/**
 * 打開 lilium 設置頁並（可選）落到指定分區。
 * 設置頁已原生化為 PluginSettingTab（Obsidian 原生頁籤，
 * 移動端由殼層渲染），sectionId → tabId 映射後 setting.open() ＋
 * openTabById(tabId)（原生 openTabById 在 setting.open() 後同輪可用，
 * 無需 rAF hack；保守保留 try/catch＋Notice 降級）。未帶 sectionId 時
 * 打開主頁籤（lilium）。one-shot requestSettingsSection 管線保留（測試契約）。
 */
// 縮表：本插件僅註冊一個原生設置 tab（id＝manifest id "lilium"），

const SECTION_TO_TAB: Record<string, string> = { dict: "lilium" };

export function openLiSettings(app: App, sectionId?: string): void {
  if (sectionId) requestSettingsSection(sectionId);
  const setting = (app as unknown as {
    setting: { open(): void; openTabById(id: string): void };
  }).setting;
  setting.open();
  const tabId = sectionId ? (SECTION_TO_TAB[sectionId] ?? "lilium") : "lilium";
  try {
    setting.openTabById(tabId);
  } catch (e) {
    console.error("[lilium] openTabById failed:", tabId, e);
    new Notice(String((e as Error)?.message ?? e));
  }
}

/**
 * 原生設定 tab 的共享基類。
 * display() 統一做空渲染防禦＋containerEl 準備後，按 sectionId 分支到
 * renderSection 的對應構建段（原 VWSettingTab.display() 的線性渲染代碼
 * 按 data-li-section 邊界原樣搬移，構建簽名/邏輯不變，僅組織方式變）。
 * 公共 helper（confirmReset／T／字體庫拖放等）收斂於本基類。
 */
export abstract class LiSettingsTabBase extends PluginSettingTab {
  plugin: VerticalWriterPlugin;
  /** 本 tab 對應的初始渲染分區。 */
  abstract get sectionId(): LiSectionId;
  /** 頁內膠囊分頁——當前選中分區（宿主持狀態，切換就地重渲染）。 */
  protected activeSection: LiSectionId | null = null;

  constructor(app: App, plugin: VerticalWriterPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  /** 當前選中分區（null＝初始，取本 tab 的 sectionId）。 */
  protected get currentSection(): LiSectionId {
    return this.activeSection ?? this.sectionId;
  }

  /** 本 tab 可切換的分區清單（頁內膠囊條）。 */
  protected get sections(): { id: LiSectionId; label: string }[] {
    return [
      { id: "dict", label: this.T("set.nav.dict") },
    ];
  }

  T(key: string): string {
    return t(this.plugin.uiLang(), key);
  }

  /**
   * display() 內所有控件都在「本次渲染當下」讀 `plugin.settings` 的值；浮層
   * saveSettings 之後，已渲染的舊 DOM 不會自己更新（控件閉包裡的值是渲染時
   * 拍下的快照）。因此浮層的 commit 在落盤後呼叫本入口：設置頁若正開在
   * Obsidian 設置窗口裡，就地重渲染一次，控件重新從 plugin.settings 讀值，
   * 兩處 UI 永遠顯示同一份最新值。設置頁沒開則為無操作。
   *
   * 靜態方法：浮層只為「通知」而來，不該為此 new 一個 SettingTab 實例
   * （PluginSettingTab 建構子會掛 DOM）、更不該新增一顆常駐的 tab。
   */
  static refreshExisting(app: App, plugin: VerticalWriterPlugin): void {
    const setting = (app as unknown as { setting?: { activeTab?: unknown } }).setting;
    const tab = setting?.activeTab;
    // 只有當前打開的設置頁確實是**本插件**的 VWSettingTab 時才重渲染——
    // 否則會把別的插件（或 Obsidian 自身）的設置頁整頁沖掉。本插件任何一個 tab 皆可。
    if (!(tab instanceof LiSettingsTabBase) || tab.plugin !== plugin) return;
    if ((plugin as unknown as { unloaded?: boolean }).unloaded) return;
    (tab as unknown as { display(): void }).display();
  }

  /* 設定頁「不宜直排診斷」按鈕的回調。
     讀目前作用中檔案的 Markdown 源 → 切區塊 → 文件級警示。
     只讀 vault 檔案內容，不渲染、不寫檔 —— 這是諮詢工具，不是行動。 */
  display(): void {
    const { containerEl } = this;
    // 插件已卸載（或正在卸載）時不再重渲染設置頁——
    // 「替換插件檔後重啟 → 設置面板卡死」場景中，殘留的設置 tab 可能對已失效的
    // 實例調用 display()，重入已拆除的 DOM/監聽而凍結 UI；此處直接空渲染防禦。
    if ((this.plugin as unknown as { unloaded?: boolean }).unloaded) {
      containerEl.empty();
      return;
    }
    containerEl.empty();
    containerEl.addClass("li-settings");
    // 頁內膠囊 tab 條＋單一內容容器（桌面/移動同一結構）。
    renderLiSettingsTabs(
      containerEl,
      this.sections.map((sec) => ({ id: sec.id, label: sec.label, panelId: "li-settings-panel" })),
      this.currentSection,
      (id) => {
        this.activeSection = id as LiSectionId;
        (this as unknown as { display(): void }).display();
      },
    );
    // 「重置」按鈕移到膠囊分頁條同一行右側。
    // 反饋／贊助按鈕放在「重置」左邊；「支持」分頁退役，
    // 跳轉動作上移至此（mailto／贊助連結邏輯與原 about 分支一致）。
    {
      const tabBar = containerEl.querySelector<HTMLElement>(".li-settings-tabs");
      if (tabBar) {
        const feedbackBtn = tabBar.createEl("button", {
          text: this.T("set.feedback.open"),
          cls: "li-settings-tab li-settings-feedback-inline",
        });
        feedbackBtn.type = "button";
        feedbackBtn.addEventListener("click", () => {
          const email = this.plugin.settings.feedbackEmail.trim() || "quasicry@gmail.com";
          const subject = encodeURIComponent(this.T("set.feedback.open"));
          window.open(`mailto:${email}?subject=${subject}`, "_blank");
        });
        const sponsorBtn = tabBar.createEl("button", {
          text: this.T("set.sponsorship.open"),
          cls: "li-settings-tab li-settings-sponsor-inline",
        });
        sponsorBtn.type = "button";
        sponsorBtn.addEventListener("click", () => {
          const url = this.plugin.settings.sponsorshipUrl.trim();
          if (url) window.open(url, "_blank");
        });
        const resetBtn = tabBar.createEl("button", {
          text: this.T("set.reset"),
          cls: "li-settings-tab li-settings-reset-inline",
        });
        resetBtn.type = "button";
        resetBtn.addEventListener("click", () => confirmResetShared(this));
      }
    }
    const panel = containerEl.createDiv();
    panel.id = "li-settings-panel";
    this.renderSection(this.currentSection);
  }

  /**
   * 渲染單一 tab 的本頁條目。六個分區共用同一份 Setting 構建代碼
   * （原 display() 線性渲染按 data-li-section 邊界拆段，構建簽名/邏輯逐字不變）。
   * 自繪分頁機制（li-settings-nav／li-set-page／activateSection）已退役刪除：
   * 頁籤切換交由 Obsidian 原生殼層（移動端同樣生效）。
   */
  protected renderSection(section: LiSectionId): void {
    const { containerEl } = this;

    // 深鏈已改走原生 tab 直達（openLiSettings → openTabById），
    // 此處僅消費/清空可能殘留的 one-shot 請求（保持 request/consume 契約存在）。
    consumeRequestedSettingsSection();

    if (section === "dict") {
    // B27：分拆後 lilium 設置頁缺「介面語言」——uiLang 屬主設置
    // （VWSettings，沿 lilith set.lang 同款下拉），dict 分區頂部補渲染。
    {
      new Setting(containerEl)
        .setName(this.T("set.lang"))
        .setDesc(this.T("set.lang.desc"))
        .addDropdown((dd) => {
          dd.addOption("auto", this.T("set.lang.auto"));
          for (const l of LANGS) dd.addOption(l.code, l.label);
          dd.setValue(String(this.plugin.settings.uiLang)).onChange(async (v) => {
            // B8：消除 self2 別名——onChange 回呼以箭頭函數綁定 this，直接引用。
            this.plugin.settings.uiLang = v as LangCode | "auto";
            await this.plugin.saveSettings();
            (this as unknown as { display(): void }).display();
          });
        });
    }
    // 本分區已拆為 li-dict 原生 tab。
    if (this.plugin.dict) {
      renderDictSections(containerEl, this.plugin.dict, () => (this as unknown as { display(): void }).display());
    } else {
      containerEl.createEl("p", { text: this.T("set.dictNotLoaded"), cls: "li-settings-dict-missing" });
    }

    /* ---------------- 反饋與贊助（合規：僅在設定頁自有介面內，由用戶主動操作觸發，非彈窗/通知） ---------------- */
    }

    // 反饋／贊助按鈕上移至膠囊分頁條

  }

  /**
   * 字體庫發生增刪後的固定三步驟。
   *
   * 缺任何一步都會留下「改了但沒改乾淨」的觀感：
   *  1. `syncFontRegistry` —— 新字體的真實 family 要交給字體棧裝配器，才有機會進棧
   *  2. `reloadFontFaces` —— 重新生成 @font-face，瀏覽器才知道有新字可用
   *  3. `refreshAllViews` —— 重跑直排度量 `--li-ls-fix`；它是按**舊字體**的步進算的，不重算就成了「字體換了、字距仍照舊字體微調」
   *
   * 之所以要抽成一個方法：此前四條路徑（安裝 / 解除安裝 × 目錄款 / 自定義款、
   * 重新整理、拖放匯入）各自寫了不同組合。install 有 refreshAllViews、
   * uninstall 沒有 —— 這種不對稱正是「某些操作看起來沒生效」的來源。
   */
  private groupLabel(group: string): string {
    return translitGroupLabel((k) => this.T(k), group);
  }

  /** 去重取得所有已註冊轉寫方案的 group（保持註冊順序），供「可檢視語言」勾選 */
  private translitSchemeGroups(): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const scheme of listSchemes()) {
      if (!seen.has(scheme.group)) { seen.add(scheme.group); out.push(scheme.group); }
    }
    return out;
  }

}
export type LiSectionId = "dict"; // about 分頁已退役，反饋/贊助上移膠囊條

/**
 * 設定頁原生化 —— 原生 PluginSettingTab（Obsidian 原生頁籤，
 * 移動端由殼層原生渲染＝自繪分頁切換失效根除）。每個 tab 只渲染本頁條目；
 * displayName 走 i18n set.nav.* 鍵（由 main.ts addSettingTab 處註冊時提供）。
 */
export class LiSettingsTabMain extends LiSettingsTabBase {
  get sectionId(): LiSectionId { return "dict"; }

  /**
   * 1.13.0+ 聲明式設定 API：刻意返回空陣列。
   * 本頁 UI 含頁內膠囊分頁、辭典表格（增刪/排序/拖放）、格式說明表等非
   * Setting 結構，聲明式 SettingDefinition 無法等價表達；貿然返回非空定義
   * 會令宿主改走聲明式渲染、display() 不再被呼叫（宿主源碼實證：
   * settingItems.length>0 ? 聲明式渲染 : display()），功能面回歸風險不成比例。
   * 返回空陣列 → 宿主 fallback display()（與 1.12 及之前的渲染路徑完全一致）；
   * 同時明示實作消審核器「未實作 getSettingDefinitions」警告。
   */
  getSettingDefinitions(): SettingDefinitionItem[] {
    return [];
  }
}




/** 重置：確認後將 vw／dict 設置還原預設（原地深拷貝，引用不分裂）。 */
function confirmResetShared(self: LiSettingsTabBase): void {
  const modal = new Modal(self.app);
  modal.contentEl.addClass("li-settings");
  modal.contentEl.createEl("p", {
    text: self.T("set.reset.confirm"),
    cls: "li-settings-dict-missing",
  });
  const row = modal.contentEl.createDiv("li-settings-resetbar");
  const cancel = row.createEl("button", {
    text: self.T("common.cancel"),
    cls: "li-settings-reset-btn",
  });
  cancel.addEventListener("click", () => modal.close());
  const ok = row.createEl("button", {
    text: self.T("set.reset"),
    cls: "li-settings-reset-btn li-settings-reset",
  });
  // eslint-disable-next-line @typescript-eslint/no-misused-promises -- fire-and-forget 事件回調（UI 事件無人 await 返回值），行為保持——審計批次三。
  ok.addEventListener("click", async () => {
    // 原地深拷貝（deepAssignInto）：逐欄遞歸寫入既有物件，避免其它模組
    // 捕獲的子物件引用分裂（字體彈層等閉包捕獲 typography 後仍讀到新值）。
    const fresh = JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as unknown as Record<string, unknown>;
    deepAssignInto(self.plugin.settings as unknown as Record<string, unknown>, fresh);
    await self.plugin.saveSettings();
    if (self.plugin.dict) {
      const dfresh = JSON.parse(JSON.stringify(DICT_DEFAULT_SETTINGS)) as unknown as Record<string, unknown>;
      deepAssignInto(self.plugin.dict.settings as unknown as Record<string, unknown>, dfresh);
      await self.plugin.dict.saveSettings();
    }
    (self as unknown as { display(): void }).display();
    modal.close();
    new Notice(self.T("set.reset.done"));
  });
  modal.open();
}

/* ---------- 小工具 ---------- */
