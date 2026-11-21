import {
  ViewPlugin,
  Decoration,
  type DecorationSet,
  type ViewUpdate,
  type EditorView,
} from "@codemirror/view";
import type { Range } from "@codemirror/state";
import { subjoinLhForText, textHasSubjoinScripts } from "./subjoin-line-height";

/**
 * 編輯器（CodeMirror 6）疊字行距——Decoration.line class 方案。
 *
 * 為什麼不用 MutationObserver 寫 class / inline style：實機實錘（r-fence 輪 CDP 探針）
 * CM 背景繪製系統（HyperMD-codeblock-bg / line 元素複用）會在 update cycle 用
 * `className = "..."` 整體賦值覆寫 .cm-line 的 classList（同一元素、非重建），
 * 任何插件寫入的 class 或 inline style 變數都會被抹掉。Decoration.line 的 class
 * 由 CM 原生裝配進行元素 className，是唯一不被覆寫的通道。
 *
 * 檔位 class li-sj-lh-N 與 styles.css 的編輯器側規則共用（閱讀器 post-processor
 * 仍走 inline style 變數 --li-subjoin-lh，渲染管線無覆寫問題）。
 *
 * 效能：update 時快速短路（文檔無三文種碼位→空 decoration 集，O(n) 每字元但
 * 正文絕大多數文檔首掃即 false）；逐行掃描只在文種文檔發生；ViewPlugin 自動
 * 隨 viewport/文檔變更重建（CM 管理，無需手動 debounce）。
 */

const LJ_CLS_PREFIX = "li-sj-lh-";
const LJ_CLS_MAX = 8;

/**
 * 藏文 run 字體修復——MD 正文的藏文碼位 run 掛文種字體 class。
 *
 * 根因（實機 CDP 實錘）：MD 筆記正文 font-family 首選為使用者設定的中文字體
 * （--font-text-override，如文泉驛）時，部分藏文碼位被該字體搶走渲染（該字體
 * 有零星藏文字形但無 OpenType 藏文 shaping 表）→ 同一 run 被拆到兩款字體、
 * 跨字體 shaping 於組合字符處斷裂 → subjoined（U+0F90–0FBC）以孤立字形並列
 * 顯示，堆疊語義丟失。轉寫面板/詞條正常（掛 .li-font-tibetan 整體文種字體）。
 *
 * 修法（顯示層，不改數據——同 tib-subjoin-display 鐵律體例）：
 *  - 編輯態：Decoration.mark 只包住藏文碼位 run（inline span），class 由 CM
 *    原生裝配（同 line class 不被覆寫的機理）；只影響藏文 run 本身，行內拉丁/
 *    漢字 fallback 不受干擾。
 *  - 閱讀態：post-processor 用 TreeWalker 對含藏文的文本節點 splitText 包 span
 *    （渲染完成後的 DOM 改寫，無覆寫問題）。
 *  - CSS：li-tib-run → font-family 取 SCRIPTS.tibetan.fontStack 前選（Noto
 *    Serif Tibetan 內嵌字體），serif 兜底。
 *
 * 範圍：U+0F00–0F0F（符號）＋0F20–0FFF（字母/數字/標點）；不含 0F10–0F1F
 * （無分配）。chakshu/其他 0F 區符號一併受益。
 */

const TIB_RUN_CLS = "li-tib-run";

function isTibetCodepoint(cp: number): boolean {
  return (cp >= 0x0f00 && cp <= 0x0f0f) || (cp >= 0x0f20 && cp <= 0x0fff);
}

/** 逐行建 mark decoration：連續藏文碼位區間包一個 span（含行內多 run） */
function markDecorations(lineText: string, lineFrom: number): Array<Range<Decoration>> | null {
  let hasTib = false;
  for (const ch of lineText) {
    if (isTibetCodepoint(ch.codePointAt(0) ?? 0)) {
      hasTib = true;
      break;
    }
  }
  if (!hasTib) return null;
  const out: Array<Range<Decoration>> = [];
  const deco = Decoration.mark({ class: TIB_RUN_CLS });
  let runStart = -1;
  let i = 0;
  for (const ch of lineText) {
    const cp = ch.codePointAt(0) ?? 0;
    const inTib = isTibetCodepoint(cp);
    if (inTib && runStart < 0) runStart = i;
    if (!inTib && runStart >= 0) {
      out.push(deco.range(lineFrom + runStart, lineFrom + i));
      runStart = -1;
    }
    i += ch.length;
  }
  if (runStart >= 0) out.push(deco.range(lineFrom + runStart, lineFrom + lineText.length));
  return out;
}

function lineDecoration(lh: number): Decoration | null {
  // 檔位值可為 0.5 步進 float（行距回收後 run=1→2.5 等）——class 名取整桶
  // （ceil），CSS 端整數桶對應實值 N-0.5（styles.css 同步）。
  const bucket = Math.ceil(lh);
  if (bucket < 2 || bucket > LJ_CLS_MAX) return null;
  return Decoration.line({ class: LJ_CLS_PREFIX + bucket });
}

/** code fence 行判定（與 HyperMD 語義一致：```/~~~ 圍欄開閉行與其間所有行） */
function isFenceText(t: string): boolean {
  return t.startsWith("```") || t.startsWith("~~~");
}

function buildDecorations(view: EditorView): DecorationSet {
  const text = view.state.doc.toString();
  if (!textHasSubjoinScripts(text)) return Decoration.none;
  const total = view.state.doc.lines;
  // 逐行需求；code fence block（連續圍欄區間）以 block 為單位取最大需求統一套用到
  // **整個區間的所有行**——否則 fence 內容最後一行的下疊下伸會被 codeblock-end 行
  // （未放大的不透明背景）吃掉下半邊（實機裁切实錘）；begin 行同理保護首行上疊上伸。
  const lhs: Array<number | null> = [];
  for (let i = 1; i <= total; i++) lhs.push(subjoinLhForText(view.state.doc.line(i).text));
  let i = 0;
  while (i < total) {
    if (isFenceText(view.state.doc.line(i + 1).text)) {
      let j = i;
      let maxLh: number | null = null;
      while (j < total) {
        const t = view.state.doc.line(j + 1).text;
        if (j > i && isFenceText(t)) {
          maxLh = maxLh === null ? lhs[j] : lhs[j] === null ? maxLh : Math.max(maxLh, lhs[j]!);
          j++;
          break;
        }
        maxLh = maxLh === null ? lhs[j] : lhs[j] === null ? maxLh : Math.max(maxLh, lhs[j]!);
        j++;
      }
      if (maxLh !== null) {
        for (let k = i; k < j; k++) lhs[k] = maxLh;
      }
      i = j;
      continue;
    }
    i++;
  }
  const builder: Range<Decoration>[] = [];
  for (let n = 0; n < total; n++) {
    const from = view.state.doc.line(n + 1).from;
    const deco = lhs[n] ? lineDecoration(lhs[n]!) : null;
    if (deco) builder.push(deco.range(from));
    // 藏文 run 字體 mark（同輪、同 ViewPlugin 通道）
    const marks = markDecorations(view.state.doc.line(n + 1).text, from);
    if (marks) builder.push(...marks);
  }
  return Decoration.set(builder, true);
}

export const subjoinLineDecorations = ViewPlugin.fromClass(
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
