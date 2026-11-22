// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry
/**
 * lilium 辭典 — 轉寫頁籤。
 *
 * 「長文本轉寫」（renderTranslit）與「連聲合成」
 * （renderSandhiLab）併到一個**平級的頁籤「轉寫」**。
 *
 * 樣式：本頁籤的 CSS 走 JS 內聯 <style> 注入（首次渲染 append 到 document.head），
 * 並與 styles.css 的同名規則同步。class 名沿用 li-col-translit / li-col-sandhi 等。
 *
 *   ① 佈局一體化——「長文本轉寫」不再是折疊 <details>。本頁籤即長文本轉寫本體，
 *      源文本 → 方向/方案 → 執行 → 輸出同區流轉（折疊標題與頁籤語義重複）。
 *   ② 匯出 MD 升級——點「匯出 MD」展開勾選面板，「原文（粘貼框）」與「轉寫輸出」
 *      可分別勾選、一起匯出（預設能匯的全勾上；兩者皆空時明確提示）。
 *   （連聲合成本質是輔助計算器，維持折疊，不搶主流程。）
 */
import { liNotice } from '../ui-hig';
import type { DictFeature } from './plugin';
import type { LiDictView } from './view';
import { getScheme, listPickerSchemes, type TransliterationScheme } from '../translit-common';
import { detectRomanToNativeAmbiguities, applyAmbiguitiesAuto, detectUyghurAposAmbiguities, detectMongolianAmbiguities, detectKharoshthiCaudaAmbiguities, detectZanabazarNasalAmbiguities, detectAliGaliHomophoneAmbiguities, type TranslitAmbiguity } from '../indic';
import { detectTibetanWylieAmbiguities } from '../tibetan';
import { detectUyghurHehAmbiguities } from '../uyghur';
import { phagsPaContextMirror } from '../phagspa';
import {
  groupFontStack, translitGroupLabel, schemeLabel as schemeDisplayName, renderCharTableInto,
  groupWritingStyle,
} from '../translit-ui';
import {
  transliterateText, MAX_TRANSLIT_CHARS, countTranslitChars,
  type RunResult, type TranslitRunResult,
} from './translit-run';
import { sandhiJoin, SANDHI_DEMOS } from '../sandhi';
import { exportMarkdownToVault, fileTimestamp } from './export';

/** 轉寫頁籤的會話狀態（模組級，跨重繪保留）。 */
interface TranslitPanelState {
  /** 長文本轉寫的源文本（自有 textarea） */
  src: string;
  /** 方向：true = 羅馬字 → 原生文字；false = 原生文字 → 羅馬字 */
  toNative: boolean;
  /** 方案 id；空字串 = 自動識別 */
  schemeId: string;
  /** 上次轉寫輸出 */
  out: string;
  /** 上次自動選中的方案 id（字體棧取值用） */
  usedSchemeId: string;
  /** 上次統計 */
  stats: RunResult | null;
  /** 上次耗時（ms） */
  ms: number;
  /** 上次「羅馬字 → 原生文字」歧義位置（送氣單輔音 / 基輔音＋ha 合字） */
  amb: TranslitAmbiguity[];
  /** 每個歧義位置的用戶選擇（0＝送氣單輔音，1＝基輔音＋ha 合字） */
  ambChoices: number[];
  /** 藏文拼式歧義偏好：引擎 opts.tibAmbig，auto＝引擎打分默認 */
  tibAmbig?: string;
  /** X-近似歧義偏好：引擎 opts.xApprox，auto＝引擎默認 */
  xApprox?: string;
  /** Ali Gali 同音異碼取樣偏好：引擎 opts.agBackForm，auto＝正字序第一 */
  agBackForm?: string;
  /** 連聲合成輸入暫存 */
  sa: string;
  sb: string;
  sOut: string;
  sRule: string;
  sSutra: string;
  /** 檢字表目前選取的方案 id（全外掛唯一的檢字表入口） */
  ctSchemeId: string;
}

const st: TranslitPanelState = {
  src: '', toNative: true, schemeId: '', out: '', usedSchemeId: '', stats: null, ms: 0,
  amb: [], ambChoices: [], tibAmbig: 'auto', xApprox: 'auto',
  sa: '', sb: '', sOut: '', sRule: '', sSutra: '',
  ctSchemeId: '',
};

/** 方案顯示名（依介面語言取 label；缺 i18n 時退回 id） */
function schemeName(scheme: TransliterationScheme, fallback: string, lang?: string): string {
  try {
    return schemeDisplayName(scheme, lang) || fallback;
  } catch {
    return fallback;
  }
}

/** DictFeature 語言解析：主 plugin.uiLang() 優先；測試 mock 可直接掛 uiLang */
function panelLang(plugin: { uiLang?: () => string; plugin?: { uiLang?: () => string } }): string | undefined {
  try {
    return plugin.plugin?.uiLang?.() ?? plugin.uiLang?.();
  } catch {
    return undefined;
  }
}

// ------------------------------------------------------------------ 樣式注入

let styleInjected = false;
function injectStyle(): void {
  if (styleInjected) return;
  styleInjected = true;
  // 測試環境（node）無 document，跳過注入；真實 Obsidian 才會落地樣式。
  if (typeof document === 'undefined' || !document.head) return;
  const css = `
.li-root .li-col-translit {
  border: 1px solid var(--background-modifier-border);
  border-radius: var(--radius-s, 4px);
  padding: 6px 10px 8px;
  background: var(--background-secondary);
}
.li-root .li-col-translit .li-col-area { margin-bottom: 6px; }
.li-root .li-col-translit-count {
  margin: -2px 0 6px; font-size: 11px; color: var(--text-faint);
  font-variant-numeric: tabular-nums;
}
.li-root .li-col-translit-count.is-over { color: var(--text-error); font-weight: 600; }
.li-root .li-translit-export {
  display: flex; flex-wrap: wrap; gap: 10px; align-items: center;
  margin-top: 8px; padding: 6px 8px;
  border: 1px dashed var(--background-modifier-border);
  border-radius: var(--radius-s, 4px);
}
.li-root .li-translit-export-item {
  display: flex; align-items: center; gap: 5px;
  font-size: 12px; color: var(--text-normal);
}
.li-root .li-translit-export-item input { margin: 0; }
.li-root .li-col-translit-inner { padding-top: 6px; }
.li-root .li-col-translit-ctl {
  display: flex; flex-wrap: wrap; gap: 8px; align-items: flex-end;
}
.li-root .li-col-translit-field {
  display: flex; flex-direction: column; gap: 2px;
  font-size: 11px; color: var(--text-faint);
}
.li-root .li-col-translit-label { white-space: nowrap; }
.li-root .li-col-translit-stats {
  margin: 6px 0 0; font-size: 11px; color: var(--text-faint); min-height: 1em;
}
.li-root .li-col-translit-out { margin-top: 6px; }
.li-root .li-col-translit-amb {
  margin-top: 8px; padding: 8px 10px;
  border: 1px solid var(--background-modifier-border); border-radius: var(--radius-s, 4px);
  background: var(--background-primary-alt, var(--background-secondary));
}
.li-root .li-col-translit-amb-title {
  font-size: 11px; font-weight: 600; color: var(--text-accent); margin-bottom: 6px;
}
.li-root .li-col-translit-amb-card {
  padding: 6px 0; border-top: 1px dashed var(--background-modifier-border);
}
.li-root .li-col-translit-amb-card:first-of-type { border-top: none; }
.li-root .li-col-translit-amb-q {
  font-size: 11px; color: var(--text-normal); margin-bottom: 5px;
  /* 問題文案內嵌原生字形（「{primary}」「{alt}」）——與檢字表備註欄
     同一缺陷面。範例字落文種棧（ambBox 已寫 --li-ct-font），說明文字落正文棧。 */
  font-family: var(--li-ct-font, inherit), var(--font-text, inherit);
}
.li-root .li-col-translit-amb-opts { display: flex; flex-wrap: wrap; gap: 6px; }
.li-root .li-col-translit-amb-opts button {
  font-family: var(--li-ct-font, var(--font-monospace, monospace));
}
.li-root .li-col-translit-pre {
  margin: 0; padding: 8px 10px; max-height: 320px; overflow: auto;
  white-space: pre-wrap; overflow-wrap: anywhere;
  border: 1px solid var(--background-modifier-border); border-radius: var(--radius-s, 4px);
  /* Doulos SIL 兜 IAST 拉丁擴展字形（輸出框常含 ḷ/ṛ/ṣ/ḥ 等）。 */
  font-family: var(--li-ct-font, var(--font-monospace, monospace)), "Doulos SIL";
}
.li-root .li-col-ctable {
  border: 1px solid var(--li-ui-line); border-radius: var(--li-ui-radius-md);
  padding: var(--li-ui-space-2) var(--li-ui-space-3);
}
.li-root .li-col-ctable-title {
  font-size: var(--font-ui-small); font-weight: 600; color: var(--text-normal);
  cursor: pointer; list-style: none;
}
.li-root .li-col-ctable-title::-webkit-details-marker { display: none; }
.li-root .li-col-ctable-title::before {
  content: "▸"; display: inline-block; margin-inline-end: 6px; color: var(--text-muted);
}
.li-root .li-col-ctable[open] .li-col-ctable-title::before { content: "▾"; }
.li-root .li-col-ctable-ctl {
  display: flex; align-items: center; gap: var(--li-ui-space-2); margin: var(--li-ui-space-2) 0;
}
.li-root .li-col-ctable-ctl .li-input { flex: 0 1 auto; min-width: 0; max-width: 70%; }
.li-root .li-col-ctable-host {
  max-height: 46vh; overflow: auto;
  border-radius: var(--li-ui-radius-md); background: transparent;
}
.li-root .li-col-sandhi { border: 1px solid var(--li-ui-line); border-radius: var(--li-ui-radius-md); padding: var(--li-ui-space-3); }
.li-root .li-col-sandhi-row { display: flex; align-items: center; gap: var(--li-ui-space-2); margin-bottom: var(--li-ui-space-2); }
.li-root .li-col-sandhi-label { min-width: 90px; color: var(--text-muted); font-size: var(--font-ui-small); }
.li-root .li-col-sandhi-out { margin-top: var(--li-ui-space-2); }
.li-root .li-col-sandhi-result { font-family: var(--font-monospace); font-size: var(--font-ui-small); color: var(--text-normal); }
.li-root .li-col-sandhi-actions { display: flex; gap: var(--li-ui-space-2); margin-top: var(--li-ui-space-2); }
.li-root .li-col-sandhi-demo-box { margin: var(--li-ui-space-2) 0; }
.li-root .li-col-sandhi-demo-box > summary { cursor: pointer; color: var(--text-muted); font-size: var(--font-ui-small); user-select: none; list-style: none; }
.li-root .li-col-sandhi-demo-box > summary::-webkit-details-marker { display: none; }
.li-root .li-col-sandhi-demo-box > summary::before { content: "▸"; display: inline-block; margin-inline-end: 6px; color: var(--text-muted); }
.li-root .li-col-sandhi-demo-box[open] > summary::before { content: "▾"; }
`;
  const el = createEl('style');
  el.id = 'li-translit-panel-style';
  // 去重：面板可能逐次掛載，同名 id 的 style 累積多份——先移除舊份再掛，
  // 保證頁面永遠恰一份。
  document.getElementById('li-translit-panel-style')?.remove();
  el.textContent = css;
  document.head.appendChild(el);
}

// ------------------------------------------------------------------ 渲染

/**
 * 渲染「轉寫」頁籤。
 * @param body 辭典面板的 .li-body 容器
 * @param view  LiDictView（本頁籤自包含，僅保留以便未來聯動；目前不使用）
 * @param plugin DictFeature
 */
export function renderTranslitPanel(body: HTMLElement, _view: LiDictView, plugin: DictFeature): void {
  injectStyle();
  const el = body.createDiv({ cls: 'li-articles li-translit' });
  el.createEl('h3', { cls: 'li-panel-title', text: plugin.T('dict.tab.translit') });
  // 標題下實驗性功能注釋一行（i18n 化隨 UI 語言）
  el.createDiv({ cls: 'li-panel-subtitle', text: plugin.T('dict.translit.experimentalNote') });

  // 一體化工作區——源文本 → 控制 → 輸出同區流轉，不再折疊。
  const work = el.createDiv({ cls: 'li-col-translit' });

  // ---------- 源文本 ----------
  // **先選文種、未選則禁用輸入框**。
  // 「羅馬字 → 原生文字」時必須先定方案才能轉（見 goBtn 的 need-scheme 擋截），
  // 但以前用戶可以先貼一大段字、按下去才被擋；現在直接在入口禁用：
  //   ①「羅馬 → 原生」且停在「自動識別」→ disabled（無法自動識別是硬約束）
  //   ②「原生 → 羅馬」→ 自動識別可行，不禁用
  // 選定方案後，輸入框書寫規範跟隨：**羅馬字輸入恆為橫排 LTR**
  // （拉丁字母沒有直排書寫傳統），原生文種輸入則跟隨該文種規範
  // （悉曇 ltr、蒙古系 vertical-lr、維吾爾 rtl…，查 SCRIPTS 權威表）。
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion -- 斷言為 CM6 動態型別窄化防護（批次一實錘 auto 刪除破壞型別），保留——審計批次四。
  const srcArea = work.createEl('textarea', {
    cls: 'li-col-area li-input',
    attr: { rows: '12', placeholder: plugin.T('dict.collation.translit'), spellcheck: 'false' }, // B34：高度加大
  }) as HTMLTextAreaElement;
  srcArea.value = st.src;

  /** 依當前方向＋方案刷新輸入框的禁用態與書寫規範 */
  const applySrcWriting = (): void => {
    const scheme = st.schemeId ? getScheme(st.schemeId) : null;
    // ① 禁用規則：羅馬→原生 且 未選方案（自動識別在此方向不可行）
    const locked = st.toNative && !st.schemeId;
    srcArea.disabled = locked;
    srcArea.toggleClass('is-locked', locked);
    if (locked) {
      srcArea.setAttribute('placeholder', plugin.T('dict.translit.pickFirst'));
      return;
    }
    srcArea.setAttribute('placeholder', plugin.T('dict.collation.translit'));
    // ② 書寫規範：羅馬字輸入恆橫排 LTR；原生輸入跟隨文種
    if (!st.toNative || !scheme) {
      // 原生→羅馬：輸入的是原生文字。方案選了就跟隨方案文種；自動識別無從預知，
      // 恆為橫排 LTR 兜底（輸出端才有足夠信息跟隨）。
      const ws = (!st.toNative && scheme) ? groupWritingStyle(scheme.group)
        : { mode: 'horizontal-tb' as const, dir: 'ltr' as const, orientation: 'mixed' as const };
      setWriting(srcArea, ws);
      // 原生輸入掛文種字體——疊字文種（Zanabazar U+11A47 / Soyombo U+11A99 顯式
      // SUBJOINER）的 subjoiner 碼位只有文種字體有字形，回落等寬體即豆腐。
      const ff = (!st.toNative && scheme) ? groupFontStack(scheme.group) : null;
      if (ff) srcArea.style.setProperty('--li-ct-font', ff);
      else srcArea.style.removeProperty('--li-ct-font');
      // 疊字行距適配——輸入端（原生方向，輸入框同樣疊行）
      applySubjoinLineHeight(srcArea, srcArea.value, scheme ? scheme.group : null);
      return;
    }
    // 羅馬→原生：輸入的是羅馬字 → 恆橫排 LTR（字體回落接口體，清殘留）
    setWriting(srcArea, { mode: 'horizontal-tb', dir: 'ltr', orientation: 'mixed' });
    srcArea.style.removeProperty('--li-ct-font');
    srcArea.style.removeProperty('line-height');
  };

  /** 把書寫規範套到元素上（共用小工具） */
  const setWriting = (el: HTMLElement, ws: { mode: string; dir: string; orientation: string }): void => {
    el.style.setProperty('writing-mode', ws.mode);
    el.style.setProperty('direction', ws.dir);
    el.style.setProperty('text-orientation', ws.orientation);
    el.toggleClass('is-vertical', ws.mode.startsWith('vertical'));
  };

  /**
   * 疊字行距適配：marchen / zanabazar / soyombo 三疊字文種和藏文的
   * 下加字（subjoined）向下延伸出基行框——同一音節疊 2 個以上下加字時，
   * 字形會疊到下一行/下一列的字上。按文本逐行統計最大連續下加字數 n，
   * line-height 隨 n 加大（n=1→2.5，三文種統一起放；n>=2→n+1.5；
   * 無下加回落樣式表 line-height:2），直排文種 line-height 同樣作用於列間距，方向自適應。
   * 下加字判定：zanabazar＝顯式 U+11A47 SUBJOINER；soyombo＝顯式 U+11A99；
   * marchen＝隱式模型（subjoined 獨立碼位 U+11C92–U+11CAF，無 subjoiner）。
   */
  const applySubjoinLineHeight = (el: HTMLElement, text: string, group: string | null): void => {
    const explicit: Record<string, number> = { zanabazar: 0x11a47, soyombo: 0x11a99 };
    // 自動辨識／未選方案（group=null）時按文本碼位自探——否則粘貼原生文字後行距恆回落
    // 樣式表值（輸入框行距不夠的首要場景）。自探與正文版 SCRIPT_RANGES 同構。
    const detectGroup = (t: string): string | null => {
      for (const ch of t) {
        const cp = ch.codePointAt(0) ?? 0;
        if (cp === 0x11a47) return 'zanabazar';
        if (cp === 0x11a99) return 'soyombo';
        if (cp >= 0x11c92 && cp <= 0x11caf) return 'marchen';
        if (cp >= 0x0f90 && cp <= 0x0fbc) return 'tibetan';
      }
      return null;
    };
    const effGroup = group ?? detectGroup(text);
    const isMarchen = effGroup === 'marchen';
    const isTibetan = effGroup === 'tibetan';
    const sjCp = effGroup ? explicit[effGroup] : undefined;
    if (!sjCp && !isMarchen && !isTibetan) {
      el.style.removeProperty('line-height');
      return;
    }
    const isSj = (cp: number): boolean =>
      isMarchen ? cp >= 0x11c92 && cp <= 0x11caf
        : isTibetan ? cp >= 0x0f90 && cp <= 0x0fbc
        : cp === sjCp;
    // 引擎輸出模型（實錘）：zanabazar/soyombo＝顯式 SUBJOINER **前綴**標記其後
    // 一個碼位為下加字形（ma+sa+ta → ma SUBJOINER sa SUBJOINER ta）；marchen＝
    // subjoined 獨立碼位自足。故計數規則：遇 subjoiner → run+1；其後緊隨的
    // 組合成員（字形本體／ZWJ/ZWNJ／GEMINATION 11A98／geminator 11A9F／
    // upadhmaniya 11A86/11A87）維持現值；其它字符重置。
    const COMBO_KEEP = new Set([0x200d, 0x200c, 0x11a98, 0x11a9f, 0x11a86, 0x11a87]);
    let maxRun = 0;
    for (const line of text.split('\n')) {
      let run = 0;
      let afterSj = false;
      for (const ch of line) {
        const cp = ch.codePointAt(0) ?? 0;
        if (isSj(cp)) {
          run += 1;
          if (run > maxRun) maxRun = run;
          afterSj = true;
          continue;
        }
        if (afterSj) {
          // 藏文：下加間可穿插元音/anusvara 等 combining（0F71–0F81、0F35、0F37），
          // 渲染仍為同一縱列——計 run 時不斷鏈（與正文版 isTibCombo 同構）。
          const isTibCombo = (cp >= 0x0f71 && cp <= 0x0f81) || cp === 0x0f35 || cp === 0x0f37;
          if (!COMBO_KEEP.has(cp) && !isTibCombo) afterSj = false;
          continue;
        }
        run = 0;
      }
    }
    // 檔位值經變數管道寫入（obsidianmd/no-static-styles-assignment 審核要求：禁靜態字面量直寫 style）。
    // 檔位表：maxRun>=2→n+1.5；單層（run=1）三文種統一→2.5（與正文版
    // subjoin-line-height.ts 裁定同步：marchen/藏文隱式下加同構同深度，
    // Noto 字形深度伸出基行框，單層起放對齊）。
    const lhValue = maxRun >= 2
      ? String(maxRun + 1.5)
      : maxRun === 1 ? '2.5' : null;
    if (lhValue) el.style.setProperty('line-height', lhValue);
    else el.style.removeProperty('line-height');
  };

  /**
   * 輸出文本追加：僅八思巴上下文把「。」（U+3002）包居中 span。
   * 依據 Unicode 18 Core Spec §14.4 Punctuation：八思巴文本的表意句號應
   * **居中**（傳統中文排版做法），不偏列側。中日韓語境不受影響——判斷條件
   * 為「當前方案是八思巴」而非文本中出現「。」。
   * 複製/匯出仍取純文字（textContent），span 不進數據。
   */
  const appendWithCenteredIdeographStop = (pre: HTMLElement, text: string): void => {
    const isPhagspa = st.usedSchemeId != null && getScheme(st.usedSchemeId)?.group === 'phagspa';
    if (!isPhagspa) {
      pre.appendText(text);
      return;
    }
    const cps = Array.from(text, (ch) => ch.codePointAt(0) ?? 0);
    for (let i = 0; i < cps.length; i++) {
      const ch = String.fromCodePoint(cps[i]);
      // 「。」居中（Unicode 18 §14.4 Punctuation）
      if (ch === '。') {
        pre.createSpan({ cls: 'li-translit-ideographic-stop', text: ch });
        continue;
      }
      // 上下文自動鏡像（Unicode 18 §14.4 Mirrored Variants）：純字形提示，
      // 數據不加碼位，複製/匯出仍為原字符。
      if (phagsPaContextMirror(cps, i)) {
        pre.createSpan({ cls: 'li-translit-context-mirror', text: ch });
        continue;
      }
      pre.appendText(ch);
    }
  };

  // 即時字數計數 + 超限提示。
  // 為什麼需要：上限原本只在按下「轉寫全文」後才以通知告知，使用者貼了 3 萬字
  // 卻要等到按下去才知道被擋（體驗上是「按了沒反應」）。這裡把門檻前移到輸入當下。
  // 文字純為「n / max」兩個數字，無須 i18n（七語系一致）。
  const countRow = work.createDiv({ cls: 'li-col-translit-count' });
  const paintCount = (): void => {
    const n = countTranslitChars(st.src);
    const over = n > MAX_TRANSLIT_CHARS;
    countRow.setText(`${n.toLocaleString()} / ${MAX_TRANSLIT_CHARS.toLocaleString()}`);
    countRow.toggleClass('is-over', over);
    // 超限時補一句人話提示（沿用既有 i18n 鍵，不新增翻譯負擔）
    if (over) {
      countRow.setText(`${n.toLocaleString()} / ${MAX_TRANSLIT_CHARS.toLocaleString()} · ${plugin.T('dict.collation.translitTooLong', { n: MAX_TRANSLIT_CHARS.toLocaleString() })}`);
    }
  };
  srcArea.addEventListener('input', () => {
    st.src = srcArea.value;
    paintCount();
    // 原生方向輸入即時跟隨疊字行距（羅馬方向輸入不會產生下加字，交由 updateSrcWriting 清殘留）
    if (!st.toNative) {
      // 修：原用 st.usedSchemeId（僅轉寫後更新）——粘貼原生文字但尚未轉寫時為空，
      // 行距恆回落樣式表值、不隨顯式下疊字數變化。改用當前所選方案，
      // 未選時回落 usedSchemeId（自動識別已有結果的場景）。
      const scheme = getScheme(st.schemeId || st.usedSchemeId);
      applySubjoinLineHeight(srcArea, srcArea.value, scheme ? scheme.group : null);
    }
  });
  paintCount();

  const schemes = listPickerSchemes();
  if (!schemes.length) {
    work.createEl('p', { cls: 'li-col-hint', text: plugin.T('dict.collation.translitNone') });
    renderSandhiLab(el, plugin);
    return;
  }

  // ---------- 控制列 ----------
  const ctl = work.createDiv({ cls: 'li-col-translit-ctl' });

  const mkSelect = (label: string) => {
    const l = ctl.createEl('label', { cls: 'li-col-translit-field' });
    l.createSpan({ cls: 'li-col-translit-label', text: label });
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion -- 斷言為 CM6 動態型別窄化防護（批次一實錘 auto 刪除破壞型別），保留——審計批次四。
    return l.createEl('select', { cls: 'li-input' }) as HTMLSelectElement;
  };

  // ---- 方向 ----
  const dirSel = mkSelect(plugin.T('dict.collation.translitDir'));
  dirSel.createEl('option', { value: 'native', text: plugin.T('dict.collation.translitToNative') });
  dirSel.createEl('option', { value: 'roman', text: plugin.T('dict.collation.translitToRoman') });
  dirSel.value = st.toNative ? 'native' : 'roman';
  dirSel.addEventListener('change', () => {
    st.toNative = dirSel.value === 'native';
    // 「羅馬 → 原生」方向無法自動識別（同一串 ASCII 同時是多個方案的合法輸入，
    // 實測 bod chos yid 在藏文與滿文都是 3/3 平手）。故切到該方向時若還停在
    // 「自動識別」就直接幫用戶選第一個方案，避免按下去才被擋一次的糟糕體驗。
    if (st.toNative && !st.schemeId) {
      st.schemeId = schemes[0].id;
      schemeSel.value = st.schemeId;
    }
    // 方向/方案變動都會影響輸入框的禁用態與書寫規範
    applySrcWriting();
    ensureAmbigSelect();
  });

  // ---- 方案 ----
  const schemeSel = mkSelect(plugin.T('dict.collation.translitScheme'));
  schemeSel.createEl('option', { value: '', text: plugin.T('dict.collation.translitAuto') });
  const byGroup = new Map<string, TransliterationScheme[]>();
  for (const s of schemes) {
    const arr = byGroup.get(s.group) ?? [];
    arr.push(s);
    byGroup.set(s.group, arr);
  }
  for (const [group, arr] of byGroup) {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion -- 斷言為 CM6 動態型別窄化防護（批次一實錘 auto 刪除破壞型別），保留——審計批次四。
    const og = schemeSel.createEl('optgroup') as HTMLOptGroupElement;
    og.setAttribute('label', translitGroupLabel((k) => plugin.T(k), group));
    for (const s of arr) og.createEl('option', { value: s.id, text: schemeName(s, s.id, panelLang(plugin)) });
  }
  schemeSel.value = st.schemeId;
  schemeSel.addEventListener('change', () => {
    st.schemeId = schemeSel.value;
    // 選定文種後解鎖輸入框並套用書寫規範
    applySrcWriting();
    ensureAmbigSelect();
  });
  // 初始套用（復原上次會話的方向/方案狀態）
  applySrcWriting();

  // ---- 拼式歧義偏好：僅藏文組＋「原生 → 羅馬字」方向顯示 ----
  // 無 tsheg 梵咒連寫的四類拼式歧義（元音歸屬、長音分解序、並列 vs 堆疊、
  // 連寫切分）由引擎屬性級雙讀，出向單選依用戶風格取捨（引擎 opts.tibAmbig）。
  let ambigSel: HTMLSelectElement | null = null;
  let ambigField: HTMLLabelElement | null = null;
  // X-近似歧義偏好：X-近似方案組＋「原生 → 羅馬字」方向顯示（opts.xApprox）
  let xApproxSel: HTMLSelectElement | null = null;
  let xApproxField: HTMLLabelElement | null = null;
  // Ali Gali 同音異碼取樣 select（agBackForm）
  let agBackSel: HTMLSelectElement | null = null;
  let agBackField: HTMLLabelElement | null = null;
  const X_APPROX_GROUPS = new Set(['siddham', 'sinhala', 'ranjana', 'sanskrit', 'brahmi', 'kharoshthi']);
  const ensureAmbigSelect = (): void => {
    const sid = st.schemeId || st.usedSchemeId;
    const grp = sid ? getScheme(sid)?.group : undefined;
    const isTib = grp === 'tibetan';
    if (isTib && !ambigSel) {
      ambigField = ctl.createEl('label', { cls: 'li-col-translit-field' });
      ambigField.createSpan({ cls: 'li-col-translit-label', text: plugin.T('dict.translit.tibAmbigLabel') });
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion -- CM6 動態型別窄化防護（批次一實錘），審計批次四
      ambigSel = ambigField.createEl('select', { cls: 'li-input' }) as HTMLSelectElement;
      const opts: Array<[string, string]> = [
        ['auto', plugin.T('dict.translit.tibAmbigAuto')],
        ['vowel-root', plugin.T('dict.translit.tibAmbigVowelRoot')],
        ['vowel-left', plugin.T('dict.translit.tibAmbigVowelLeft')],
        ['stacked', plugin.T('dict.translit.tibAmbigStacked')],
        ['parallel', plugin.T('dict.translit.tibAmbigParallel')],
        ['long-compact', plugin.T('dict.translit.tibAmbigLongCompact')],
        ['long-split', plugin.T('dict.translit.tibAmbigLongSplit')],
      ];
      for (const [v, t] of opts) ambigSel.createEl('option', { value: v, text: t });
      ambigSel.value = st.tibAmbig ?? 'auto';
      ambigSel.addEventListener('change', () => {
        st.tibAmbig = ambigSel!.value;
      });
    } else if (!isTib && ambigField) {
      ambigField.remove();
      ambigField = null;
      ambigSel = null;
    }
    // r50d：Ali Gali 同音異碼取樣 select（「羅馬字 → 原生文字」方向顯示；opts.agBackForm）
    if (grp === 'aligali' && st.toNative && !agBackSel) {
      agBackField = ctl.createEl('label', { cls: 'li-col-translit-field' });
      agBackField.createSpan({ cls: 'li-col-translit-label', text: plugin.T('dict.translit.agBackFormLabel') });
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion -- CM6 動態型別窄化防護
      agBackSel = agBackField.createEl('select', { cls: 'li-input' }) as HTMLSelectElement;
      const abo: Array<[string, string]> = [
        ['auto', plugin.T('dict.translit.agBackFormAuto')],
        ['todo', plugin.T('dict.translit.agBackFormTodo')],
      ];
      for (const [v, t] of abo) agBackSel.createEl('option', { value: v, text: t });
      agBackSel.value = st.agBackForm ?? 'auto';
      agBackSel.addEventListener('change', () => {
        st.agBackForm = agBackSel!.value;
      });
    } else if ((grp !== 'aligali' || st.toNative) && agBackField) {
      agBackField.remove();
      agBackField = null;
      agBackSel = null;
    }
    // X-近似歧義 select（全套）：悉曇 oṃ 專用碼位 vs 拼出、sinhala 長式 ē/ō、
    // 缺項 esc 可逆 vs 近似拼出（不提供選項＝轉寫有問題）
    if (sid && grp && X_APPROX_GROUPS.has(grp) && !xApproxSel) {
      xApproxField = ctl.createEl('label', { cls: 'li-col-translit-field' });
      xApproxField.createSpan({ cls: 'li-col-translit-label', text: plugin.T('dict.translit.xApproxLabel') });
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion -- CM6 動態型別窄化防護
      xApproxSel = xApproxField.createEl('select', { cls: 'li-input' }) as HTMLSelectElement;
      const xo: Array<[string, string]> = [
        ['auto', plugin.T('dict.translit.xApproxAuto')],
        ['spelled', plugin.T('dict.translit.xApproxSpelled')],
        ['codepoint', plugin.T('dict.translit.xApproxCodepoint')],
        ['longvowel', plugin.T('dict.translit.xApproxLongvowel')],
      ];
      for (const [v, t] of xo) xApproxSel.createEl('option', { value: v, text: t });
      xApproxSel.value = st.xApprox ?? 'auto';
      xApproxSel.addEventListener('change', () => {
        st.xApprox = xApproxSel!.value;
      });
    } else if ((!sid || !grp || !X_APPROX_GROUPS.has(grp)) && xApproxField) {
      xApproxField.remove();
      xApproxField = null;
      xApproxSel = null;
    }
  };
  ensureAmbigSelect();

  // ---- 動作按鈕 ----
  const goBtn = ctl.createEl('button', { cls: 'mod-cta', text: plugin.T('dict.collation.translitRun') });
  const copyBtn = ctl.createEl('button', { cls: 'li-mini-btn', text: plugin.T('dict.collation.translitCopy') });
  const exportBtn = ctl.createEl('button', { cls: 'li-mini-btn', text: plugin.T('dict.translit.export') });

  // ---- 匯出勾選面板（原文與輸出可分可合） ----
  const expPanel = work.createDiv({ cls: 'li-translit-export' });
  expPanel.addClass('li-u-hidden');
  const mkCheck = (labelText: string): HTMLInputElement => {
    const l = expPanel.createEl('label', { cls: 'li-translit-export-item' });
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion -- 斷言為 CM6 動態型別窄化防護（批次一實錘 auto 刪除破壞型別），保留——審計批次四。
    const inp = l.createEl('input', { attr: { type: 'checkbox' } }) as HTMLInputElement;
    inp.checked = true;
    l.createSpan({ text: labelText });
    return inp;
  };
  const chkSrc = mkCheck(plugin.T('dict.translit.export.includeSrc'));
  const chkOut = mkCheck(plugin.T('dict.translit.export.includeOut'));
  const confirmBtn = expPanel.createEl('button', { cls: 'mod-cta li-mini-btn', text: plugin.T('dict.translit.export.confirm') });
  const cancelBtn = expPanel.createEl('button', { cls: 'li-mini-btn', text: plugin.T('dict.translit.export.cancel') });
  const closeExport = (): void => { expPanel.addClass('li-u-hidden'); };
  exportBtn.addEventListener('click', () => {
    if (!expPanel.hasClass('li-u-hidden')) { closeExport(); return; }
    const hasSrc = !!st.src.trim();
    const hasOut = !!st.out;
    if (!hasSrc && !hasOut) { liNotice(plugin.T('dict.translit.export.empty')); return; }
    // 每次展開按現況重設：能匯的就預設勾上（「一起匯出」是預設態）。
    chkSrc.disabled = !hasSrc;
    chkOut.disabled = !hasOut;
    chkSrc.checked = hasSrc;
    chkOut.checked = hasOut;
    expPanel.removeClass('li-u-hidden');
  });
  cancelBtn.addEventListener('click', closeExport);
  confirmBtn.addEventListener('click', () => {
    const useSrc = chkSrc.checked && !chkSrc.disabled;
    const useOut = chkOut.checked && !chkOut.disabled;
    if (!useSrc && !useOut) { liNotice(plugin.T('dict.translit.export.pick')); return; }
    closeExport();
    // A2：exportMd 內部含 vault 寫入，可能拋錯——catch 後提示，不留 unhandled rejection。
    exportMd(plugin, { src: useSrc, out: useOut }).catch((e) => {
      console.error('[lilium] translit export:', e);
      liNotice(plugin.T('common.operationFailed'), 8000);
    });
  });

  // ---- 統計 / 輸出 ----
  const statRow = work.createDiv({ cls: 'li-col-translit-stats' });
  const outBox = work.createDiv({ cls: 'li-col-translit-out' });
  // 歧義備選盒（「羅馬字 → 原生文字」方向、偵測到歧義時才顯示）
  const ambBox = work.createDiv({ cls: 'li-col-translit-amb' });
  ambBox.addClass('li-u-hidden');

  const paintOut = (text: string, fontFamily: string | null): void => {
    outBox.empty();
    if (!text) return;
    // 歧義位置輸出框高亮——把 st.out（未套用備選的原輸出）
    // 依 amb[].index（碼位序）切段，歧義碼位包 <mark class="li-translit-amb-mark">。
    // 關鍵點：text 可能是「套用備選後」的展示文字（displayedOut()），套用會改變
    // A 類的碼位數（ख 1 碼位 → क्ह 3 碼位），故切段一律以**未套用的 st.out** 為座標，
    // 顯示文字按同一切段座標從 text 對應取段（套用只替換 amb 覆蓋的碼位區間，
    // 區間外的碼位序列兩邊完全一致，可直接按段序對應）。複製/匯出仍取純文字。
    const pre = outBox.createEl('pre', { cls: 'li-col-translit-pre' });
    // W 類（tibSpelling）是字串級替換（index 未填、非碼點座標），定位方式與
    // applyStringAmbiguities 一致：在輸出中 indexOf(primary) 首現定位
    // （同形同歧義一起改）。先算出 W 類的碼點位置，再統一走碼點座標切段。
    const wSpans = new Map<TranslitAmbiguity, number>();
    {
      let searchFrom = 0;
      for (const a of st.amb) {
        if (a.kind !== 'tibSpelling') continue;
        const at = text.indexOf(a.primary, searchFrom);
        if (at < 0) continue;
        wSpans.set(a, at);
        searchFrom = at + a.primary.length;
      }
    }
    const ambSorted = st.amb.length
      ? [...st.amb]
          .map((a) => ({ a, idx: a.kind === 'tibSpelling' ? (wSpans.get(a) ?? -1) : a.index }))
          .filter((e) => e.idx >= 0)
          .sort((x, y) => x.idx - y.idx)
      : [];
    if (ambSorted.length) {
      const baseCps = Array.from(st.out);
      const dispCps = Array.from(text);
      // 每個 amb 佔 baseCps 中 [index, index+1) 一個碼位；計算其套用後在
      // dispCps 中的顯示寬度（primary=1 碼位；alternative 長度可能 >1）。
      let baseOff = 0;   // baseCps 中已消費的碼位數
      let dispOff = 0;   // dispCps 中已消費的碼位數
      const segs: Array<{ dispStart: number; dispEnd: number; marked: boolean }> = [];
      for (const { a, idx } of ambSorted) {
        // 歧義前的普通段：base [baseOff, idx) → disp 對應同長度
        const plainLen = idx - baseOff;
        if (plainLen > 0) {
          segs.push({ dispStart: dispOff, dispEnd: dispOff + plainLen, marked: false });
          dispOff += plainLen;
        }
        // 歧義碼位段：顯示寬度＝套用後該位的碼位數
        const choice = st.ambChoices[st.amb.indexOf(a)] === 1;
        const markedLen = choice ? Array.from(a.alternative).length : 1;
        segs.push({ dispStart: dispOff, dispEnd: dispOff + markedLen, marked: true });
        dispOff += markedLen;
        baseOff = idx + (a.kind === 'tibSpelling' ? Array.from(a.primary).length : 1);
      }
      // 尾段
      if (baseOff < baseCps.length) {
        segs.push({ dispStart: dispOff, dispEnd: dispCps.length, marked: false });
      }
      for (const s of segs) {
        const segText = dispCps.slice(s.dispStart, s.dispEnd).join('');
        if (!segText) continue;
        if (s.marked) pre.createEl('mark', { cls: 'li-translit-amb-mark', text: segText });
        else appendWithCenteredIdeographStop(pre, segText);
      }
    } else {
      appendWithCenteredIdeographStop(pre, text);
    }
    if (fontFamily) pre.style.setProperty('--li-ct-font', fontFamily);
    // 輸出框書寫規範跟隨文種——
    //   · 「原生 → 羅馬」輸出是羅馬字 → **恆橫排 LTR**（拉丁字母無直排傳統）
    //   · 「羅馬 → 原生」輸出是原生文字 → 跟隨該文種規範
    //     （悉曇橫排 ltr、蒙古系 vertical-lr 左起、維吾爾橫排 rtl）
    // 滾動軸：直排的溢出軸是水平的，CSS 端用 max-inline-size（邏輯屬性，
    // 隨 writing-mode 自動翻到正確物理軸），不再用 max-height（直排下失效）。
    const used = getScheme(st.usedSchemeId);
    const ws = (st.toNative && used)
      ? groupWritingStyle(used.group)
      : { mode: 'horizontal-tb' as const, dir: 'ltr' as const, orientation: 'mixed' as const };
    setWriting(pre, ws);
    // 疊字行距適配——輸出端（僅疊字三文種和藏語）
    applySubjoinLineHeight(pre, text, st.toNative && used ? used.group : null);
  };

  /** 套用用戶歧義選擇後的展示文字（無歧義時即 st.out 原值）。
   *  P 類（apos）字串級替換，其餘碼點索引級（applyAmbiguitiesAuto 判別）。 */
  const displayedOut = (): string => applyAmbiguitiesAuto(st.out, st.amb, st.ambChoices);

  /** 渲染歧義備選盒：每個位置給「送氣單輔音 / 基輔音＋ha 合字」兩個備選，由用戶點選 */
  const drawAmbig = (): void => {
    ambBox.empty();
    if (!st.amb.length) { ambBox.addClass('li-u-hidden'); return; }
    ambBox.removeClass('li-u-hidden');
    const used = getScheme(st.usedSchemeId);
    const ff = st.toNative && used ? groupFontStack(used.group) : null;
    ambBox.createDiv({ cls: 'li-col-translit-amb-title', text: plugin.T('dict.translit.ambTitle', { n: st.amb.length }) });
    st.amb.forEach((a, k) => {
      const card = ambBox.createDiv({ cls: 'li-col-translit-amb-card' });
      const reading = used ? used.nativeToRoman(a.primary) : '';
      const altReading = used ? used.nativeToRoman(a.alternative) : '';
      // tibSpelling（W 類）：primary/alternative 已是 Wylie 串，nativeToRoman 不適用——
      // 專用問句（兩拼式直接展示，附藏文回轉形供對照）。
      const qText = a.kind === 'tibSpelling'
        ? plugin.T('dict.translit.ambTibQuestion', { n: k + 1, total: st.amb.length, a: a.primary, b: a.alternative })
        : (a.kind === 'apos' || a.kind === 'heh')
        ? plugin.T('dict.translit.ambAposQuestion', { n: k + 1, total: st.amb.length, a: a.primary, b: a.alternative })
        : plugin.T('dict.translit.ambQuestion', { n: k + 1, total: st.amb.length, primary: a.primary, alt: a.alternative, roman: reading, altRoman: altReading });
      card.createDiv({
        cls: 'li-col-translit-amb-q',
        text: qText,
      });
      const opts = card.createDiv({ cls: 'li-col-translit-amb-opts' });
      // 依歧義類別選用備選標籤（A 類送氣 / N 類鼻音 / V 類聲化⇄捩舌）
      let priKey = 'dict.translit.ambAspirated';
      let altKey = 'dict.translit.ambConjunct';
      if (a.kind === 'nasal') {
        const isAnus = a.primary === 'ं';
        priKey = isAnus ? 'dict.translit.ambNasalAnus' : 'dict.translit.ambNasalCandra';
        altKey = isAnus ? 'dict.translit.ambNasalCandra' : 'dict.translit.ambNasalAnus';
      } else if (a.kind === 'vocalic') {
        priKey = 'dict.translit.ambVocalic';
        altKey = 'dict.translit.ambRetroflex';
      } else if (a.kind === 'apos') {
        priKey = 'dict.translit.ambAposBtn0';
        altKey = 'dict.translit.ambAposBtn1';
      } else if (a.kind === 'zh') {
        priKey = 'dict.translit.ambZhDigraph';
        altKey = 'dict.translit.ambZhSplit';
      } else if (a.kind === 'heh') {
        // H 類（UEY→ULY 詞中 0647+ئ）——專用問句（h/ë 兩讀）
        priKey = 'dict.translit.ambHehBtn0';
        altKey = 'dict.translit.ambHehBtn1';
      } else if (a.kind === 'agHomophone') {
        priKey = 'dict.translit.ambAgHomophoneBtn0';
        altKey = 'dict.translit.ambAgHomophoneBtn1';
      } else if (a.kind === 'mnglLha') {
        // M 類：蒙古文 LHA ⇄ LA+HAA（藏語借詞 vs 漢語借詞兩讀）
        priKey = 'dict.translit.ambMnglLhaBtn0';
        altKey = 'dict.translit.ambMnglLhaBtn1';
      } else if (a.kind === 'mnglNg') {
        priKey = 'dict.translit.ambMnglNgBtn0';
        altKey = 'dict.translit.ambMnglNgBtn1';
      } else if (a.kind === 'mnglGalik') {
        priKey = 'dict.translit.ambMnglGalikBtn0';
        altKey = 'dict.translit.ambMnglGalikBtn1';
      } else if (a.kind === 'tibSpelling') {
        // W 類：按鈕 label＝拼式本身（ambTibBtn0/1 含 {w} 佔位）
        priKey = 'dict.translit.ambTibBtn0';
        altKey = 'dict.translit.ambTibBtn1';
      }
      const mkOpt = (choice: number, labelKey: string, glyph: string): void => {
        // apos 類按鈕文案不含 {glyph}（專用鍵 ambAposBtn0/1）；
        // tibSpelling 類佔位是 {w}（拼式本身）
        const text = a.kind === 'apos'
          ? plugin.T(labelKey)
          : a.kind === 'tibSpelling'
          ? plugin.T(labelKey, { w: glyph })
          : plugin.T(labelKey, { glyph });
        const b = opts.createEl('button', {
          cls: 'li-mini-btn' + (st.ambChoices[k] === choice ? ' mod-cta' : ''),
          text,
        });
        b.addEventListener('click', () => {
          st.ambChoices[k] = choice;
          redraw();
        });
      };
      if (a.kind === 'agHomophone' && a.variants) {
        // N 選一（同音組全候選）——逐 variant 一顆按鈕，label＝字形＋碼位（hex）
        a.variants.forEach((v, n) => {
          const cp = v.codePointAt(0) ?? 0;
          const b = opts.createEl('button', {
            cls: 'li-mini-btn' + (st.ambChoices[k] === n ? ' mod-cta' : ''),
            text: plugin.T('dict.translit.ambAgHomophoneBtn', { glyph: v, cp: cp.toString(16).toUpperCase() }),
          });
          b.addEventListener('click', () => {
            st.ambChoices[k] = n;
            redraw();
          });
        });
      } else {
        mkOpt(0, priKey, a.primary);
        mkOpt(1, altKey, a.alternative);
      }
    });
    // 字體棧同步到備選盒內原生字形（原生字體對合字渲染更準確）
    if (ff) ambBox.style.setProperty('--li-ct-font', ff);

    // 確認定稿——點選備選只是預覽（高亮跟隨），確認後才把
    // 選擇烘焙進 st.out：套用的 alternative 是正確碼位序（如 基輔音＋virama＋ha），
    // shaping 自動成合字連寫；隨後清空 amb/choices → 高亮消失、輸出成完整行文，
    // 複製/匯出直接取純淨 st.out。
    const confirmRow = ambBox.createDiv({ cls: 'li-col-translit-amb-confirm' });
    const confirmBtn = confirmRow.createEl('button', {
      cls: 'li-mini-btn mod-cta',
      text: plugin.T('dict.translit.ambConfirm'),
    });
    confirmBtn.addEventListener('click', () => {
    //applyAmbiguitiesAuto 依歧義類別自動選字串級/碼點級套用
      st.out = applyAmbiguitiesAuto(st.out, st.amb, st.ambChoices);
      st.amb = [];
      st.ambChoices = [];
      redraw();
      liNotice(plugin.T('dict.translit.ambConfirmed'));
    });
  };

  /** 重繪輸出與歧義盒（點選備選時呼叫） */
  const redraw = (): void => {
    if (!st.out) { copyBtn.addClass('li-u-hidden'); return; }
    const used = getScheme(st.usedSchemeId);
    const ff = st.toNative && used ? groupFontStack(used.group) : null;
    paintOut(displayedOut(), ff);
    copyBtn.removeClass('li-u-hidden');
    if (st.stats) {
      statRow.setText(plugin.T('dict.collation.translitStats', {
        w: st.stats.words, c: st.stats.converted, s: st.stats.skipped, ms: st.ms,
      }));
    }
    drawAmbig();
  };
  redraw();

  copyBtn.addEventListener('click', () => {
    if (!st.out) { liNotice(plugin.T('dict.collation.translitNeedText')); return; }
    const api = typeof navigator !== 'undefined' ? navigator.clipboard : undefined;
    if (!api?.writeText) { liNotice(plugin.T('dict.collation.translitNone')); return; }
    void api.writeText(displayedOut())
      .then(() => liNotice(plugin.T('dict.collation.translitCopied')))
      .catch(() => liNotice(plugin.T('dict.collation.translitNone')));
  });

  goBtn.addEventListener('click', () => {
    statRow.setText('');
    const src = st.src;
    if (!src.trim()) { liNotice(plugin.T('dict.collation.translitNeedText')); return; }
    const t0 = Date.now();
    let res: TranslitRunResult;
    try {
      res = transliterateText(src, st.schemeId, st.toNative,
        (!st.toNative && st.tibAmbig && st.tibAmbig !== 'auto') ? st.tibAmbig : undefined,
        (!st.toNative && st.xApprox && st.xApprox !== 'auto') ? st.xApprox : undefined,
        (st.toNative && st.agBackForm && st.agBackForm !== 'auto') ? st.agBackForm : undefined);
    } catch (e) {
      res = { ok: true, text: src, stats: null, schemeId: '', ms: 0 };
      void e;
    }
    if (!res.ok) {
      if (res.reason === 'too-long') {
        liNotice(plugin.T('dict.collation.translitTooLong', { n: MAX_TRANSLIT_CHARS.toLocaleString() }), 6000);
      } else if (res.reason === 'no-text') {
        liNotice(plugin.T('dict.collation.translitNeedText'));
      } else if (res.reason === 'unknown-scheme') {
        // B6：方案 id 無效不再靜默透傳——明確提示（6000ms，與 too-long 同級）。
        liNotice(plugin.T('dict.collation.translitUnknownScheme'), 6000);
      } else {
        liNotice(plugin.T('dict.collation.translitNeedScheme'), 6000);
      }
      return;
    }
    st.out = res.text;
    st.stats = res.stats;
    st.usedSchemeId = res.schemeId;
    st.ms = res.ms || Date.now() - t0;
    // 藏文 native→roman 後檢測輸出殘留藏文字符＝引擎判定無自洽切分
    // 的梵咒連寫（透傳安全網）。提示用戶可用「拼式歧義」選項或 `+` 顯式下疊
    // 標註手動指定拼式（檢字表「結構說明」節有用法行）。
    if (!st.toNative && getScheme(st.usedSchemeId)?.group === 'tibetan' && /[\u0F00-\u0FFF]/.test(st.out)) {
      liNotice(plugin.T('dict.translit.tibUnresolved'), 8000);
    }
    // 「羅馬字 → 原生文字」方向掃描歧義，交由用戶選擇；反方向（原生 → 羅馬）無此歧義。
    // 啓用範圍：A 類（送氣）/ N 類（鼻音）貫穿全部八套；V 類（聲化⇄捩舌）僅
    // ISO 15919 與巴利（能表達 ड़/ढ़/ळ 的方案）啓用。
    // P 類（維吾爾 n+g+h 隔音撇號寫法）僅「原生 → 羅馬字」方向＋
    // 維吾爾方案啓用——ULY 輸出含 g'h（rokkin'g'ham 型）時提供詞典規範備選。
    const usedScheme = getScheme(st.usedSchemeId);
    const enableVocalic = !!usedScheme && (usedScheme.id === "sanskrit-iso15919" || usedScheme.group === "pali");
    st.amb = st.toNative
      ? (detectRomanToNativeAmbiguities(st.out, { enableVocalic }).concat(
          // M 類：蒙古文方案下的三類兩讀（lh/ng/Galik 同形）——
          // detectMongolianAmbiguities 自身按蒙古文區段門控，非蒙古文輸出返回空。
          detectMongolianAmbiguities(st.out),
          // G 類：Ali Gali 同音碼位取樣（正字 vs 專碼位，按鈕逐位選）——
          // 自按 Ali Gali 專碼位區段門控，非 Ali Gali 輸出返回空。
          detectAliGaliHomophoneAmbiguities(st.out),
          // Z 類：Zanabazar 鼻音符號併碼（11A35/11A38 均寫 ṃ）——
          // 需 roman 源串判含 ṃ、native 輸出逐 11A35 提供備選。
          detectZanabazarNasalAmbiguities(st.src, st.out)))
      : (!!usedScheme && usedScheme.group === "uyghur"
        // H 類（詞中 0647+ئ，zë'ipu/zhipu 型）— 需 UEY 源串偵測
        ? detectUyghurHehAmbiguities(st.src, st.out).concat(detectUyghurAposAmbiguities(st.out))
        // K 類：Kharoshthi CAUDA roman 反查主鍵（⟒ vs 詞典慣例 ̱）——
        // 作用在 native→roman 的羅馬字輸出（字串級替換）。
        : (!!usedScheme && usedScheme.group === "kharoshthi"
          ? detectKharoshthiCaudaAmbiguities(st.out)
          // W 類：藏文出向（藏文→Wylie）拼式歧義——多自洽讀法的音節出按鈕
          : (!!usedScheme && usedScheme.group === "tibetan"
            ? detectTibetanWylieAmbiguities(st.src)
            : [])));
    st.ambChoices = st.amb.map(() => 0);
    redraw();
    if (!res.stats || res.stats.converted === 0) {
      liNotice(plugin.T('dict.collation.translitEmpty'), 6000);
    }
  });

  // ---------- 檢字表（全外掛唯一入口，下拉式選方案） ----------
  renderCharTableBox(el, plugin, schemes, schemeSel);

  // ---------- 連聲合成（輔助工具，維持折疊） ----------
  renderSandhiLab(el, plugin);
}

/**
 * 檢字表（下拉式）。
 *
 * 這是全外掛**唯一**的檢字表入口：側欄（view.ts F 區塊）與設定頁
 * （settings.ts 的 renderTransliterationTables）兩份重複渲染都已移除——三處
 * 各畫一份的代價是「改了這處忘了那處」，且使用者得記住「同一張表在三個地方」。
 * 表格本體仍走共用的 renderCharTableInto，只是**入口只剩一個**。
 *
 * 為什麼用 <details> 收合：檢字表是「查了就走」的參照物，常駐會把轉寫工作區
 * 擠到螢幕外；折疊標題則與頁籤語義不重複（頁籤是「轉寫」，這是「檢字表」）。
 *
 * @param syncFrom 工作區的方案下拉；使用者在那邊換方案時，檢字表跟著跳到同一
 *                 方案（兩邊都是「方案的兩個視圖」，各自為政會變成對不上的兩份）。
 */
function renderCharTableBox(
  root: HTMLElement,
  plugin: DictFeature,
  schemes: TransliterationScheme[],
  syncFrom?: HTMLSelectElement
): void {
  // 「檢字表可檢視語言」設定（主插件設定；空陣列 = 全部開啟）
  const visible: string[] = plugin.plugin?.settings?.translitVisibleGroups ?? [];
  const selectable = visible.length ? schemes.filter((s) => visible.includes(s.group)) : schemes;
  if (!selectable.length) return;

  const box = root.createEl('details', { cls: 'li-col-ctable' });
  box.createEl('summary', { cls: 'li-col-ctable-title', text: plugin.T('set.translitTable') });

  const ctl = box.createDiv({ cls: 'li-col-ctable-ctl' });
  ctl.createSpan({ cls: 'li-col-translit-label', text: plugin.T('set.translitTableScheme') });
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion -- 斷言為 CM6 動態型別窄化防護（批次一實錘 auto 刪除破壞型別），保留——審計批次四。
  const sel = ctl.createEl('select', { cls: 'li-input' }) as HTMLSelectElement;
  const host = box.createDiv('li-col-ctable-host');

  const byGroup = new Map<string, TransliterationScheme[]>();
  for (const s of selectable) {
    const arr = byGroup.get(s.group) ?? [];
    arr.push(s);
    byGroup.set(s.group, arr);
  }
  for (const [group, arr] of byGroup) {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion -- 斷言為 CM6 動態型別窄化防護（批次一實錘 auto 刪除破壞型別），保留——審計批次四。
    const og = sel.createEl('optgroup') as HTMLOptGroupElement;
    og.setAttribute('label', translitGroupLabel((k) => plugin.T(k), group));
    for (const s of arr) og.createEl('option', { value: s.id, text: schemeName(s, s.id, panelLang(plugin)) });
  }

  const paint = (): void => {
    const sc = getScheme(sel.value);
    if (!sc) return;
    host.empty();
    renderCharTableInto(host, sc, (k) => plugin.T(k));
  };
  /** 首次展開才畫：24 套方案的表格全部展開會拖慢頁籤切換 */
  let painted = false;
  const ensurePainted = (): void => { if (!painted) { painted = true; paint(); } };

  const pick = st.ctSchemeId && selectable.some((s) => s.id === st.ctSchemeId)
    ? st.ctSchemeId
    : selectable[0].id;
  sel.value = pick;
  st.ctSchemeId = pick;

  sel.addEventListener('change', () => { st.ctSchemeId = sel.value; paint(); });
  box.addEventListener('toggle', () => { if (box.open) ensurePainted(); });
  if (syncFrom) {
    syncFrom.addEventListener('change', () => {
      const id = syncFrom.value;
      if (!id || !selectable.some((s) => s.id === id)) return;
      sel.value = id;
      st.ctSchemeId = id;
      if (box.open) paint();
    });
  }
}

// ------------------------------------------------------------------ 連聲合成

function renderSandhiLab(root: HTMLElement, plugin: DictFeature): void {
  const box = root.createEl('details', { cls: 'li-col-sandhi' });
  box.createEl('summary', { text: plugin.T('dict.collation.sandhi') });
  const inner = box.createDiv({ cls: 'li-col-translit-inner' });
  inner.createEl('p', { cls: 'li-col-hint', text: plugin.T('dict.collation.sandhiHint') });

  // 連聲示範卡為**第二級折疊下拉**（details/summary）——
  // 第一級「連聲合成」展開後，示範卡預設收合、點「示範」才展開，不佔常駐空間。
  // 卡片語料仍單一來源＝SANDHI_DEMOS（test/sandhi.mjs 鎖定）。
  const demoBox = inner.createEl('details', { cls: 'li-col-sandhi-demo-box' });
  demoBox.createEl('summary', { text: plugin.T('dict.collation.sandhiDemoTitle') });
  const demoWrap = demoBox.createDiv({ cls: 'li-col-sandhi-demos' });
  for (const d of SANDHI_DEMOS) {
    const card = demoWrap.createEl('button', {
      cls: 'li-col-sandhi-demo li-mini-btn',
      attr: { type: 'button' },
    });
    card.createSpan({ cls: 'li-col-sandhi-demo-io', text: `${d.first} + ${d.second} → ${d.expected}` });
    card.addEventListener('click', () => {
      // 填入後手動派發 input 事件觸發 renderOut（與用戶鍵入同一通路）
      inA.value = d.first;
      inA.dispatchEvent(new Event('input', { bubbles: true }));
      inB.value = d.second;
      inB.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }

  // UI 重排：兩輸入＋「合成」併單行
  //（[前詞] + [後詞] [合成]），結果行右側併「複製／查詢」——
  // 舊版五行垂直堆疊（輸入×2、結果、動作×2、合成孤行）鬆散。
  const inputRow = inner.createDiv({ cls: 'li-col-sandhi-inputrow' });
  const mkInput = (labelKey: string, value: string, ph: string): HTMLInputElement => {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion -- 斷言為 CM6 動態型別窄化防護（批次一實錘 auto 刪除破壞型別），保留——審計批次四。
    const inp = inputRow.createEl('input', {
      cls: 'li-search li-col-sandhi-input',
      attr: {
        type: 'text', spellcheck: 'false',
        placeholder: plugin.T(labelKey) + ' ' + ph,
        'aria-label': plugin.T(labelKey),
      },
    }) as HTMLInputElement;
    inp.value = value;
    return inp;
  };
  const inA = mkInput('dict.collation.sandhiFirst', st.sa || 'rāmaḥ', 'rāmaḥ');
  inputRow.createSpan({ cls: 'li-col-sandhi-op', text: '+' });
  const inB = mkInput('dict.collation.sandhiSecond', st.sb || 'asti', 'asti');
  const runBtn = inputRow.createEl('button', {
    cls: 'li-mini-btn mod-cta li-col-sandhi-run',
    text: plugin.T('dict.collation.sandhiJoin'),
    attr: { type: 'button' },
  });
  const outBox = inner.createDiv({ cls: 'li-col-sandhi-out' });

  const renderOut = (): void => {
    outBox.empty();
    const a = inA.value.trim();
    const b = inB.value.trim();
    if (!a || !b) return;
    try {
      const r = sandhiJoin(a, b);
      st.sa = a; st.sb = b; st.sOut = r.joined; st.sRule = r.rule; st.sSutra = r.sūtra;
      const row = outBox.createDiv({ cls: 'li-col-sandhi-outrow' });
      const line = row.createDiv({ cls: 'li-col-sandhi-result', text: `${a} + ${b} → ${r.joined}` });
      line.setAttribute('data-rule', `${r.rule}（${r.sūtra}）`);
      const acts = row.createDiv({ cls: 'li-col-sandhi-actions' });
      /* 合成結果新增「複製」按鈕——沿用轉寫輸出的 clipboard 通路＋notice。 */
      const copy = acts.createEl('button', { cls: 'li-mini-btn', text: plugin.T('dict.collation.sandhiCopy') });
      copy.addEventListener('click', () => {
        const api = typeof navigator !== 'undefined' ? navigator.clipboard : undefined;
        if (!api?.writeText) { liNotice(plugin.T('dict.collation.translitNone')); return; }
        void api.writeText(r.joined)
          .then(() => liNotice(plugin.T('dict.collation.translitCopied')))
          .catch(() => liNotice(plugin.T('dict.collation.translitNone')));
      });
      const lookup = acts.createEl('button', { cls: 'li-mini-btn mod-cta', text: plugin.T('dict.collation.sandhiLookup') });
      lookup.addEventListener('click', () => {
        const word = r.joined.replace(/\s+/g, ' ').trim();
        void plugin.lookupInView(word);
      });
    } catch (e) {
      console.error('[li] sandhi:', e);
      outBox.createEl('p', { cls: 'li-none-hint', text: String((e as Error)?.message ?? e) });
    }
  };
  inA.addEventListener('input', () => { st.sa = inA.value; renderOut(); });
  inB.addEventListener('input', () => { st.sb = inB.value; renderOut(); });

  runBtn.addEventListener('click', renderOut);
  if (st.sOut) renderOut();
}

// ------------------------------------------------------------------ 測試鉤子

/** 暴露模組級狀態給冒煙測試斷言（僅讀取，不污染生產邏輯）。 */
export function getTranslitState(): TranslitPanelState {
  return st;
}

/** B11：插件 unload／面板關閉時清模組級會話狀態——上限 10 萬碼點的 src/out
 * 大文本不再跨插件生命週期駐留（reload 後舊文本重現＋記憶體常駐）。 */
export function resetTranslitSessionState(): void {
  st.src = ''; st.out = ''; st.usedSchemeId = ''; st.stats = null; st.ms = 0;
  st.amb = []; st.ambChoices = [];
  st.sa = ''; st.sb = ''; st.sOut = ''; st.sRule = ''; st.sSutra = '';
}

// ------------------------------------------------------------------ 導出

async function exportMd(plugin: DictFeature, sel: { src: boolean; out: boolean }): Promise<void> {
  const used = getScheme(st.usedSchemeId);
  const dirText = st.toNative ? plugin.T('dict.collation.translitToNative') : plugin.T('dict.collation.translitToRoman');
  const schemeText = used ? schemeName(used, st.usedSchemeId, panelLang(plugin)) : plugin.T('dict.collation.translitAuto');
  // 匯出採用「套用歧義選擇後」的展示文字（與面板所見一致；P 類字串級）
  const out = applyAmbiguitiesAuto(st.out, st.amb, st.ambChoices);
  const lines: string[] = [
    '# ' + plugin.T('dict.tab.translit'),
    '',
    `**日期**: ${new Date().toLocaleDateString()} ｜ **引擎**: lilium · translit`, // 去「辭典面板」
    `**方向**: ${dirText} ｜ **方案**: ${schemeText}`,
    '',
  ];
  // 勾選決定段落——原文（粘貼框）與轉寫輸出可分可合（預設全選）。
  let added = 0;
  if (sel.src && st.src.trim()) {
    // 蘭札方案的原文（粘貼框）同為天城碼位——正文字體棧不含蘭札族即回落天城字形；
    // 與輸出段同款行內 span 自帶 font-family（雙視圖存活載體），其他文種維持 code fence。
    if (used?.group === 'ranjana') {
      const span = `<span style="font-family: 'Nithya Ranjana DU'">${st.src.trim()}</span>`;
      lines.push('## ' + plugin.T('dict.translit.export.secSrc'), '', span, '');
    } else {
      lines.push('## ' + plugin.T('dict.translit.export.secSrc'), '', '```', st.src.trim(), '```', '');
    }
    added++;
  }
  if (sel.out && out) {
    // 蘭朒體字形依賴內嵌 Nithya Ranjana DU，碼位與天城相同（U+0900–097F），
    // 正文字體棧不含蘭朒族即回落天城字形。匯出 MD 用行內 HTML span 自帶
    // font-family（note-builder 體例：inline style 是唯一雙視圖存活載體），
    // 閱讀態與 Live Preview 編輯態都直接顯示蘭朒字形；其他文種維持 code fence。
    if (used?.group === 'ranjana') {
      const span = `<span style="font-family: 'Nithya Ranjana DU'">${out}</span>`;
      lines.push('## ' + plugin.T('dict.translit.export.secOut'), '', span, '');
    } else {
      lines.push('## ' + plugin.T('dict.translit.export.secOut'), '', '```', out, '```', '');
    }
    added++;
  }
  if (!added) { liNotice(plugin.T('dict.translit.export.empty')); return; }
  await exportMarkdownToVault(plugin, `轉寫-${fileTimestamp()}.md`, lines, 'dict.translit.saved');
}
