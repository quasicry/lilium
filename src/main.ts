// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry
/**
 * lilium —— 辭典＋轉寫薄殼
 *
 * 本插件只承擔：
 *   1. DictFeature（lilium 辭典全功能：mdx/校勘/hover/全檢/變體標註…）
 *   2. 轉寫文種庫（梵/巴/藏/蒙/滿/回鶻/悉曇/蘭札…）＋選中轉換命令
 *   3. 設置頁（dict 段＋反饋＋贊助）
 *
 * 舊使用者遷移：data.json 的 dict / dictStore / dictLookupCache 命名空間照舊讀寫；
 * vw 命名空間保留不寫不刪（lilium 重新啟用時資料仍在）。
 */
import { Plugin, addIcon } from "obsidian";
import { LILIUM_ICON_ID, LILIUM_ICON_SVG } from "./brand-lilium-icon";
import { registerNumberIcons } from "./command-number-icons";
import { liNotice } from "./ui-hig";
import { guardSync } from "./safety";
import { LangCode, langFromObsidian, t } from "./i18n";
import { listSchemes } from "./translit-common";
import { schemeLabel } from "./translit-ui";
import { MAX_TRANSLIT_CHARS, isTranslitTooLong } from "./dict/translit-run";
import { DictFeature } from "./dict/plugin";
import { attachGlobalKbGate } from "./dict/viewport-fit";
import { DataMutex } from "./shared/data-mutex";
import { VWSettings, DEFAULT_SETTINGS, LiSettingsTabMain } from "./settings";
import { ensureBundledFonts, reattachBundledFontFaces, unloadBundledFontFaces } from "./bundled-fonts";
import { registerSubjoinLineHeight } from "./subjoin-line-height";
import { subjoinLineDecorations } from "./subjoin-cm-decorations";
import { tibSubjoinDisplayDecorations } from "./tib-subjoin-display";
// 轉寫文種庫（registerScheme side-effect）
import "./tibetan";
import "./indic";
import "./aligali";
import "./uyghur";
import "./olduyghur";
import "./brahmic";
import "./siddham";
import "./kharoshthi";
import "./brahmi";
import "./phagspa";
import "./marchen";
import "./zanabazar";
import "./soyombo";
import "./mongolian";
import "./mongolian-ime-scheme";
import { manchuToMollendorff, mollendorffToManchu, looksLikeManchuUnicode } from "./manchu"; // B34：Notice 判定用（pre-B2 原狀）

export default class VerticalWriterPlugin extends Plugin {
  settings!: VWSettings;
  dict?: DictFeature;
  /** 全域鍵盤閘卸載函式（attachGlobalKbGate 返回，onunload 摘除）。 */
  kbGateDetach?: () => void;
  dataMutex!: DataMutex;
  /** 命令 id → 行動工具列序號圖示 id（registerNumberIcons 產物）。 */
  commandIconMap?: Record<string, string>;

  async onload(): Promise<void> {
    // 階段化防護原則：loadSettings（data.json 讀取/解析）失敗不得拖垮整個插件載入——
    // 降級為默認設置繼續（命令註冊、dict 模組等後續階段照常），僅 console 留痕。
    this.dataMutex = new DataMutex(this);
    try {
      await this.loadSettings();
    } catch (e) {
      console.error("[lilium] 設置讀取失敗（data.json 損壞？），降級為默認設置:", e);
      this.settings = Object.assign({}, DEFAULT_SETTINGS);
    }

    // 行動版工具列序號圖示：命令註冊順序即序號（01 起）。
    // dict 模組命令在 dict.init() 內註冊，序號延續（見 commandIconMap 傳入）。
    const translitCommandIds: string[] = [];
    for (const scheme of listSchemes()) {
      if (scheme.skipAutoCommands || scheme.hiddenFromPicker) continue;
      translitCommandIds.push(`${scheme.id}-convert`, `${scheme.id}-to-roman`, `${scheme.id}-to-native`);
    }
    translitCommandIds.push("manchu-mollendorff-to-unicode", "manchu-unicode-to-mollendorff");
    // dict 模組 6 個命令（plugin.ts 註冊）——序號延續：
    translitCommandIds.push("open-dictionary-view", "lookup-selection", "rescan-dictionaries", "open-bookmarks", "open-history", "fulltext-search");
    this.commandIconMap = registerNumberIcons(translitCommandIds);

    // 全域鍵盤閘：鍵盤開啟 → body.li-kb-open（CSS 藏官方白底三件）。全域生效——
    // 編輯器場景不豁免（官方輔助列鍵盤開啟期間藏，kh 歸零恢復）。
    this.kbGateDetach = attachGlobalKbGate(window);


    // 轉寫命令（選中轉換：→拉丁文 / →原文字；逐 scheme 註冊）
    // r49：命令名走 {scheme} 變數——T 透傳 vars 給 t()（i18n 層代換）。
    const T = (k: string, vars?: Record<string, string | number>) => t(this.uiLang(), k, vars);
    for (const scheme of listSchemes()) {
      if (scheme.skipAutoCommands) continue; // 蒙文 IME：下方專命令接管
      if (scheme.hiddenFromPicker) continue; // 隱藏方案不出命令面板（功能保留）
      // 命令名跟隨介面語言（r49）：schemeLabel 依 uiLang 取 label（zh-TW 全鍵備齊），
      // 後綴走 cmd.translitConvert/ToRoman/ToNative i18n——撤簡中硬編碼。
      const label = schemeLabel(scheme, this.uiLang());
      // 補回逐方案「自動互轉」命令
      this.addCommand({
        id: `${scheme.id}-convert`,
        icon: this.commandIconMap?.[`${scheme.id}-convert`],
        name: T("cmd.translitConvert", { scheme: label }),
        editorCallback: (editor) => {
          // 軟閘控：轉寫實驗關閉時，命令仍註冊（Obsidian 不支援運行時反註冊），
          // 但回調直接提示去開啟，保證「關實驗即零誤操作入口」。
          if (!this.settings.enableTransliteration) {
            liNotice(T("cmd.translitDisabled"));
            return;
          }
          try {
            const sel = editor.getSelection();
            const input = sel || editor.getValue();
            // A7：命令路徑與 translit-run.ts 面板路徑同閘——超長輸入提示分段，不轉
            //（面板探針實測 1MB 輸入即秒級凍結，防護必須對稱）。
            if (isTranslitTooLong(input)) {
              liNotice(T("dict.collation.translitTooLong").replace("{n}", MAX_TRANSLIT_CHARS.toLocaleString()), 6000);
              return;
            }
            const out = scheme.convert(input);
            if (sel) editor.replaceSelection(out);
            else editor.setValue(out);
            liNotice(out === input ? T("cmd.translitNoChange") : T("cmd.translitConverted"));
          } catch (e) {
            console.error(`[lilium] ${scheme.id}-convert:`, e);
            liNotice(T("common.operationFailed"));
          }
        },
      });
      this.addCommand({
        id: `${scheme.id}-to-roman`,
        icon: this.commandIconMap?.[`${scheme.id}-to-roman`],
        name: T("cmd.translitToRoman", { scheme: label }),
        editorCallback: (editor) => {
          try {
            const sel = editor.getSelection();
            const input = sel || editor.getValue();
            // A7 對稱閘：與 -convert 同閘，nativeToRoman 1MB 級輸入同樣可凍結 UI。
            if (isTranslitTooLong(input)) {
              liNotice(T("dict.collation.translitTooLong").replace("{n}", MAX_TRANSLIT_CHARS.toLocaleString()), 6000);
              return;
            }
            const out = scheme.nativeToRoman(input);
            if (sel) editor.replaceSelection(out);
            else editor.setValue(out);
            liNotice(T("cmd.translitConverted"));
          } catch (e) {
            console.error(`[lilium] ${scheme.id}-to-roman:`, e);
            liNotice(T("common.operationFailed"));
          }
        },
      });
      this.addCommand({
        id: `${scheme.id}-to-native`,
        icon: this.commandIconMap?.[`${scheme.id}-to-native`],
        name: T("cmd.translitToNative", { scheme: label }),
        editorCallback: (editor) => {
          try {
            const sel = editor.getSelection();
            const input = sel || editor.getValue();
            // A7 對稱閘：與 -convert 同閘。
            if (isTranslitTooLong(input)) {
              liNotice(T("dict.collation.translitTooLong").replace("{n}", MAX_TRANSLIT_CHARS.toLocaleString()), 6000);
              return;
            }
            const out = scheme.romanToNative(input);
            if (sel) editor.replaceSelection(out);
            else editor.setValue(out);
            liNotice(T("cmd.translitConverted"));
          } catch (e) {
            console.error(`[lilium] ${scheme.id}-to-native:`, e);
            liNotice(T("common.operationFailed"));
          }
        },
      });
    }
    // —— 蒙古文輸入法（自研）——
    // 將拉丁輸入轉為標準蒙古文 Unicode（U+1820–U+183D + FVS），
    // 由 Noto Sans Mongolian（OFL-1.1）渲染，無需任何商業字型。
    // 三個蒙文 IME 專命令撤除（能力休眠保留於
    // mongolian-ime-scheme.ts 註冊面——面板／檢字表通路不受影響；
    // 恢復＝還原本檔 git 歷史中的三個 addCommand 塊）。

    // —— 滿文：Möllendorff 轉寫 ↔ Unicode 傳統滿文 ——
    // 命令名回 i18n（cmd.manchuMolToUni/cmd.manchuUniToMol）＋
    // 轉換結果 Notice。
    this.addCommand({
      id: "manchu-mollendorff-to-unicode",
      icon: this.commandIconMap?.["manchu-mollendorff-to-unicode"],
      name: T("cmd.manchuMolToUni"),
      editorCallback: (editor) => {
        // B2：try/catch——與同檔其他命令一致，mollendorffToManchu 對畸形輸入
        // 拋錯時不得成為未捕獲異常（safety.ts「絕不產生未捕獲異常」原則）。
        try {
          const sel = editor.getSelection();
          const input = sel || editor.getValue();
          // A7 對稱閘：滿文引擎 1MB 實測 m2r 5s/r2m 0.5s，與面板同閘擋超長。
          if (isTranslitTooLong(input)) {
            liNotice(T("dict.collation.translitTooLong").replace("{n}", MAX_TRANSLIT_CHARS.toLocaleString()), 6000);
            return;
          }
          const out = mollendorffToManchu(input);
          if (sel) editor.replaceSelection(out);
          else editor.setValue(out);
          liNotice(out === input || !looksLikeManchuUnicode(out) ? T("cmd.manchuNoChange") : T("cmd.manchuConverted"));
        } catch (e) {
          console.error("[lilium] manchu mollendorff→unicode:", e);
          liNotice(T("common.operationFailed"));
        }
      },
    });
    this.addCommand({
      id: "manchu-unicode-to-mollendorff",
      icon: this.commandIconMap?.["manchu-unicode-to-mollendorff"],
      name: T("cmd.manchuUniToMol"),
      editorCallback: (editor) => {
        // B2：try/catch——同上。
        try {
          const sel = editor.getSelection();
          const input = sel || editor.getValue();
          // A7 對稱閘：同上。
          if (isTranslitTooLong(input)) {
            liNotice(T("dict.collation.translitTooLong").replace("{n}", MAX_TRANSLIT_CHARS.toLocaleString()), 6000);
            return;
          }
          const out = manchuToMollendorff(input);
          if (sel) editor.replaceSelection(out);
          else editor.setValue(out);
          liNotice(looksLikeManchuUnicode(input) ? T("cmd.manchuConverted") : T("cmd.manchuNoChange"));
        } catch (e) {
          console.error("[lilium] manchu unicode→mollendorff:", e);
          liNotice(T("common.operationFailed"));
        }
      },
    });

    // 設置頁（dict 段＋反饋＋贊助）
    // 單一原生 tab，dict/about 改頁內膠囊分頁切換
    // （renderLiSettingsTabs；桌面/移動同一結構，窄屏 flex-wrap 換行）。
    const mainTab = new LiSettingsTabMain(this.app, this);
    // B12：強寫內部欄位保留（排查裁定：無安全公開替代——PluginSettingTab 無
    // 顯示名 API），補 try/catch＋保護性判斷：Obsidian 版本變動使欄位消失或
    // 只讀時靜默跳過，不得讓 onload 崩潰。
    try {
      const desc = Object.getOwnPropertyDescriptor(mainTab, "name")
        ?? Object.getOwnPropertyDescriptor(Object.getPrototypeOf(mainTab), "name");
      if (!desc || desc.writable !== false) {
        (mainTab as unknown as { name: string }).name = "lilium";
      }
    } catch (e) {
      console.warn("[lilium] settings tab rename skipped:", e);
    }
    this.addSettingTab(mainTab);

    // 內嵌字體：落盤＋@font-face 注入 document.head——
    // 編輯器與閱讀視圖共用同一 document，注入一次全端可用；失敗降級系統字體不阻斷。
    try {
      await ensureBundledFonts(this.app);
      this.registerEvent(this.app.workspace.on("layout-change", () => reattachBundledFontFaces()));
    } catch (e) {
      console.error("[lilium] 內嵌字體初始化失敗（已隔離）:", e);
    }

    // 正文疊字行距適配（編輯器＋閱讀器）：marchen/zanabazar/soyombo 下加字
    // 疊 2 個以上時 line-height 隨最大連續下加字數放大。隔離初始化，失敗不阻斷。
    try {
      registerSubjoinLineHeight(this);
      this.registerEditorExtension(subjoinLineDecorations);
      this.registerEditorExtension(tibSubjoinDisplayDecorations);
    } catch (e) {
      console.error("[lilium] 正文疊字行距初始化失敗（已隔離）:", e);
    }

    // 辭典模組（隔離初始化：失敗不拖垮載入——階段化降級原則）
    try {
      // 蘭札體品牌 icon 註冊——ribbon/面板統一走此 id。
      addIcon(LILIUM_ICON_ID, LILIUM_ICON_SVG);
      this.dict = new DictFeature(this);
      await this.dict.init();
      this.addRibbonIcon(LILIUM_ICON_ID, "Lilium", () => this.openLilium());
    } catch (e) {
      console.error("[lilium] 辭典模組初始化失敗（已隔離）:", e);
    }
  }

  onunload(): void {
    guardSync("onunload.kbgate", () => this.kbGateDetach?.());
    guardSync("onunload.dict", () => this.dict?.unload());
    guardSync("onunload.fontfaces", () => unloadBundledFontFaces());
  }

  openLilium(): void {
    if (this.dict) {
      void this.dict.activateView();
      return;
    }
    liNotice(t(this.uiLang(), "LI_PLUS_DICT_NOT_READY"), 6000);
  }

  async loadSettings(): Promise<void> {
    let raw: Record<string, unknown> = {};
    // A1：第二參數 save=false——loadSettings 只讀快照，不得回寫 data.json
    //（舊行為每次啟動無謂落盤，且 loadData 暫態故障返回 {} 時會把空物件寫回、有抹資料風險）。
    await this.dataMutex.mutate((r) => {
      raw = r;
    }, false);
    // vw 命名空間淺合併回填：saveSettings 把 settings 寫進 raw.vw（磁碟已證），
    // 載入端必須把 raw.vw 內鍵合併回來覆蓋預設，否則重載後 uiLang 等回退為預設值。
    // 舊資料保護：raw.vw 非物件（或不存在）時跳過合併，保持原頂層淺合併行為。
    const vw = (raw ?? {})["vw"];
    const base = Object.assign({}, DEFAULT_SETTINGS, raw ?? {});
    this.settings = typeof vw === "object" && vw !== null && !Array.isArray(vw)
      ? Object.assign(base, vw as Record<string, unknown>)
      : base;
  }

  async saveSettings(): Promise<void> {
    // lilium 不再寫 vw 命名空間（settings 頁的 dict/反饋/贊助寫入走 dict.saveSettings
    // 與本方法的折衷：uiLang/feedbackEmail/sponsorshipUrl 仍屬 VWSettings，寫 vw 鍵以延續）
    await this.dataMutex.mutate((raw) => {
      raw.vw = this.settings;
    });
  }

  uiLang(): LangCode {
    if (this.settings.uiLang !== "auto") return this.settings.uiLang;
    // obsidianmd/prefer-get-language：觀察（window as any）.getLanguage() 為未公開 API，
    // localStorage 為既有行為；離散規則關閉如下。
        // 優先官方 i18n.getLanguage()（1.7.2+ 公開），守衛式呼叫；舊環境回退 localStorage。
    const i18n = (this.app as unknown as { i18n?: { getLanguage?: () => string } }).i18n;
    const lang = typeof i18n?.getLanguage === "function" ? i18n.getLanguage() : null;
    const lsLang = "language";
    const ls = lang ?? window.localStorage?.getItem(lsLang) ?? null;
    if (ls) return langFromObsidian(ls);
    // C4：行動端/capacitor 環境可能無 localStorage「language」鍵（或存取拋錯）
    // ——退回 navigator.language（langFromObsidian 自行處理 zh-Hant 等地區別名），再不行才 en。
    try {
      const nav = (typeof navigator !== "undefined" && navigator.language) || "";
      if (nav) return langFromObsidian(nav);
    } catch { /* 環境異常一律 en */ }
    return "en";
  }

  getVaultRoot(): string {
    const adapter = this.app.vault.adapter as unknown as { basePath?: string };
    const vault = this.app.vault as unknown as { configDir?: string };
    return adapter.basePath ?? vault.configDir ?? "";
  }

  // B3：原 nextAvailablePath 已刪除——全樹零引用死代碼，且其
  // exists→create 檢查本身是 TOCTOU 模式；匯出通路的落點唯一化見 dict/export.ts
  //（exportMarkdownToVault create 失敗即升級檔名重試，收斂了原「要用它防碰撞」的訴求）。
}
