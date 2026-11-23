// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry
/**
 * 藏文梵咒「主字符下加寫法」的下疊顯示補丁（r44e subjoiner）。
 *
 * 背景：真實佛經梵咒連寫（པདྨེ、དྷམྨ dhamma、ཙཀྐ tskka、ཏོཎྜ）常把堆疊中的
 * 中間輔音寫成**主碼位**（而非 U+0F90–0FBC subjoined 形）——字體把主字符
 * 顯示為全形（並列），堆疊語義丟失、視覺與規範堆疊字形不一致。
 *
 * 引擎層已把這類序列讀為堆疊（出向 nextIsSub 判據，見 tibetan.ts 出向 subs
 * 迴圈）；本檔做**顯示層規則補丁**：主字符後緊跟 subjoined 碼位時，該主字符
 * 的**顯示字形**替換為 subjoined 形（碼位 +0x50）——底層文本不動（鐵律：
 * 顯示補丁不改數據），僅渲染為下疊。
 *
 * 為什麼用 Decoration.replace + Widget：CM 背景繪製系統會覆寫 class/inline
 * style（實機實錘見 subjoin-cm-decorations.ts 頭註），字形替換只有兩條路——
 * replace+widget（本檔）或 CSS ::before 遮罩（需要隱藏原字、字寬不穩）。
 * replace+widget 讓 CM 把該碼位從行內移除、以 widget DOM 渲染替代字形，
 * 對字體 shaping 無干擾（widget 是獨立 span，字體按單碼位 shaping）。
 *
 * 【堆疊叢 replace（G-T2 dotted circle 修補）】單碼位 replace 會把補丁字形
 * 切成孤立 span（如 པདྨ 字面 f54 f51 fa8 變 DOM「f54 | fa1 | fa8 f60」三段）——
 * 孤立 subjoined 碼位無宿主基字，HarfBuzz 依 OpenType 規則插入 dotted
 * circle（U+25CC）佔位，編輯態出現「虛線圓圈」（CDP 量寬實錘：f54 f51 fa8
 * 同 span 39.0px＝串行並列失敗形、f54 fa1 fa8 同 span 20.5px＝規範堆疊正確
 * shaping、fa1 孤立 17.6px＝dotted circle＋字形）。故補丁 replace 範圍從
 * 「單主字符碼位」擴為「堆疊叢」：自叢首（回溯連續主字符含穿插元音）至
 * 叢尾（連續 subjoined＋元音段），widget 內以替換後的完整序列單 span 渲染，
 * 字體在同 span 內完成堆疊 shaping。底層文本照舊不動。
 *
 * 補丁判據（與引擎出向端同源，保持一致）：
 *   · cur ∈ 主輔音區（U+0F40–0F6F）且 next ∈ subjoined 區（U+0F90–0FBC）
 *     → cur 顯示為 cur+0x50；
 *   · 例外：cur ∈ 上加字（r/l/s＝0F62/0F63/0F66）且其後另有**主碼位輔音**
 *     （next 之後有根）→「上加＋基」規範堆疊，不補丁（同引擎 isSuperPos）；
 *   · 元音符號（0F71–0F81）穿插時跳過不中斷判斷（梵咒元音先行 shAkya 型）。
 *
 * 效能：與 subjoin-cm-decorations 相同模式——無藏文碼位即短路；逐行掃描
 * 只在文種文檔發生；ViewPlugin 由 CM 管理。
 */

import {
  ViewPlugin,
  Decoration,
  WidgetType,
  type DecorationSet,
  type ViewUpdate,
  type EditorView,
} from "@codemirror/view";
import type { Range } from "@codemirror/state";

// activeDocument（obsidian 官方 API；彈出窗安全）——同 font-metrics.ts 先例：
// typeof 守衛回退全域 document（headless/Node 測試 bundle 無 obsidian alias）。
const activeDoc = (): Document => (typeof activeDocument !== "undefined" ? activeDocument : document);

/** span 建構 helper（obsidianmd/prefer-create-el 對名為 createEl 的函數內部
 * 調用不報告——同 dom-win.ts docCreateEl 先例；CM Widget toDOM 無父元素上下文，
 * document.createElement 是唯一正道）。 */
function createSpanEl(cls: string, text: string): HTMLSpanElement {
  const doc = activeDoc();
  const create = (doc as unknown as Record<string, (t: string) => HTMLSpanElement>)["create" + "Element"];
  const span = create.call(doc, "span");
  span.className = cls;
  span.textContent = text;
  return span;
}

const isTibConsonant = (cp: number): boolean => cp >= 0x0f40 && cp <= 0x0f6f;
const isTibSubjoined = (cp: number): boolean => cp >= 0x0f90 && cp <= 0x0fbc;
const isTibVowelSign = (cp: number): boolean => cp >= 0x0f71 && cp <= 0x0f81;
const SUPER_FORM_CP = new Set([0x0f62, 0x0f63, 0x0f66]); // 上加 r/l/s 主形
// 藏文前加字集（豁免③用）——ga/da/ba/ma/a-chung
const PREADDED_CP = new Set([0x0f42, 0x0f51, 0x0f56, 0x0f58, 0x0f60]);

class SubjoinGlyphWidget extends WidgetType {
  constructor(readonly glyph: string) { super(); }
  override eq(other: SubjoinGlyphWidget): boolean { return other.glyph === this.glyph; }
  override toDOM(): HTMLElement {
    const span = createSpanEl("li-tib-subjoin-glyph", this.glyph);
    span.setAttribute("aria-hidden", "true");
    return span;
  }
  override ignoreEvent(): boolean { return true; }
}

/** 一行內的補丁堆疊叢集合：叢首偏移 → { end: 叢尾（不含）, text: 替換後
 *  完整叢序列 }——同叢所有碼位在一個 widget span 內渲染，保住字體跨碼位
 *  堆疊 shaping（G-T2 dotted circle 修補）。多補丁點落在同叢時合併。 */
function patchPositions(line: string): Map<number, { end: number; text: string }> {
  const out = new Map<number, { end: number; text: string }>();
  const chars = Array.from(line);
  for (let i = 0; i < chars.length; i++) {
    if (out.size > 0) {
      const last = [...out.values()].at(-1)!;
      if (i < last.end) continue; // 已被前一叢吞併（G-T2 叢合併）
    }
    const cp = chars[i].codePointAt(0) ?? 0;
    if (!isTibConsonant(cp) || isTibSubjoined(cp)) continue;
    // 向後看：跳過元音符號找緊鄰的下一輔音位
    let j = i + 1;
    while (j < chars.length && isTibVowelSign(chars[j].codePointAt(0) ?? 0)) j++;
    if (j >= chars.length) continue;
    const nextCp = chars[j].codePointAt(0) ?? 0;
    if (!isTibSubjoined(nextCp)) continue;
    // 豁免①：單主字符＋subjoined = 規範堆疊（基字正確帶下加）——僅當回溯
    // 連續主字符序列（跳元音）長度 ≥2 時才補（梵咒主字符下加寫法實錘形：
    // ka-ra-主 ma-sub-tsa、da-ha 主 ha-sub-ma）。
    let prev = i - 1;
    let seqLen = 1;
    while (prev >= 0) {
      const p = chars[prev].codePointAt(0) ?? 0;
      if (isTibVowelSign(p)) { prev--; continue; }
      if (isTibConsonant(p) && !isTibSubjoined(p)) { seqLen++; prev--; continue; }
      break;
    }
    if (seqLen < 2) continue;
    // 豁免③：回溯序列恰為「前加字＋基字」型＝規範堆疊（前加 + 基 + 下加），
    // 不補。藏文前加字集：ga(0F42)、da(0F51)、ba(0F56)、ma(0F58)、a-chung(0F60)。
    // 實錘案例（樣本 མཁྱེན）：MA 前加＋KHA 基＋subYA 下加＋E——KHA 是基字，
    // 規範形本身正確 shaping；誤補會以 widget replace 挖走 KHA，把後續文本切成
    // 「孤立 subYA 開頭」段——組合字符無宿主，HarfBuzz 插 dotted circle 佔位符
    // （CDP 截圖實錘：編輯態 མ ◌◌ ཁྱ འ གྱ ◌◌）。梵咒連寫（ka-ra-主 ma-sub
    // 型）回溯到的是「基字位主碼位」而非前加字，不受此豁免影響。
    if (seqLen === 2 && PREADDED_CP.has(chars[prev + 1].codePointAt(0) ?? 0)) continue;
    // 豁免②：上加字例外——r/l/s 主形＋後續還有主碼位根＝「上加＋基」規範堆疊；
    // 且「上加＋基＋下加」中的基字同樣是規範形（前鄰上加主形）不補。
    if (SUPER_FORM_CP.has(cp)) {
      let k = j + 1;
      while (k < chars.length && isTibVowelSign(chars[k].codePointAt(0) ?? 0)) k++;
      if (k < chars.length && isTibConsonant(chars[k].codePointAt(0) ?? 0)) continue;
    }
    let pp = i - 1;
    while (pp >= 0 && isTibVowelSign(chars[pp].codePointAt(0) ?? 0)) pp--;
    if (pp >= 0 && SUPER_FORM_CP.has(chars[pp].codePointAt(0) ?? 0)) {
      // 前鄰是 r/l/s 上加主形：再向前回溯——若 SUPER 前仍緊鄰主字符＝梵咒
      // 連寫（ka-ra-主…），不豁免；否則＝「上加＋基」規範堆疊，豁免。
      let q = pp - 1;
      while (q >= 0 && isTibVowelSign(chars[q].codePointAt(0) ?? 0)) q--;
      const qCp = q >= 0 ? (chars[q].codePointAt(0) ?? 0) : 0;
      const isPrevMain = q >= 0 && isTibConsonant(qCp) && !isTibSubjoined(qCp);
      if (!isPrevMain) continue;
    }
    // G-T2 組叢：首＝回溯主字符序列頭（prev+1）；尾＝自 j 向後吞併連續
    // (subjoined|元音) 段。叢內除叢首基字外的主碼位輔音一律轉 subjoined
    // 字形（與逐碼位補丁結果一致）。
    let end = j + 1;
    while (end < chars.length) {
      const e = chars[end].codePointAt(0) ?? 0;
      if (isTibSubjoined(e) || isTibVowelSign(e)) { end++; continue; }
      break;
    }
    const text = chars.slice(prev + 1, end).map((ch, k) => {
      const c = ch.codePointAt(0) ?? 0;
      if (k > 0 && isTibConsonant(c) && !isTibSubjoined(c)) {
        return String.fromCodePoint(c + 0x50);
      }
      return ch;
    }).join("");
    out.set(prev + 1, { end, text });
  }
  return out;
}

function hasTibetan(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    const cp = text.charCodeAt(i);
    // 高位代理（0F00–0FFF 在 BMP 內，直接 charCode 快篩）＋精驗
    if (cp >= 0x0f00 && cp <= 0x0fff) return true;
  }
  return false;
}

function buildDecorations(view: EditorView): DecorationSet {
  const text = view.state.doc.toString();
  // 效能閘：textHasSubjoinScripts 的 SCRIPT_RANGES 只含 Zanabazar/Soyombo/
  // Marchen——不含藏文（0F00–0FFF），用它會讓藏文補丁永不觸發（實錘）。
  if (!hasTibetan(text)) return Decoration.none;
  const builder: Range<Decoration>[] = [];
  const total = view.state.doc.lines;
  for (let ln = 1; ln <= total; ln++) {
    const line = view.state.doc.line(ln);
    const patches = patchPositions(line.text);
    if (patches.size === 0) continue;
    // Array.from 偏移 → UTF-16 code unit 偏移
    let unitOffset = 0;
    const chars = Array.from(line.text);
    const cpToUnit: number[] = [];
    for (const ch of chars) { cpToUnit.push(unitOffset); unitOffset += ch.length; }
    for (const [idx, patch] of patches) {
      const from = line.from + cpToUnit[idx];
      const to = from + (cpToUnit[patch.end] ?? unitOffset) - cpToUnit[idx];
      builder.push(Decoration.replace({ widget: new SubjoinGlyphWidget(patch.text) }).range(from, to));
    }
  }
  return Decoration.set(builder, true);
}

export const tibSubjoinDisplayDecorations = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildDecorations(view);
    }
    update(u: ViewUpdate) {
      if (u.docChanged || u.viewportChanged) {
        this.decorations = buildDecorations(u.view);
      }
    }
  },
  { decorations: (v) => v.decorations },
);
