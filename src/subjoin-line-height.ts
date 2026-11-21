import type { Plugin } from "obsidian";

/**
 * 疊字行距適配——正文版（Obsidian 編輯器＋閱讀器）。
 *
 * marchen / zanabazar / soyombo 三疊字文種的下加字（subjoined）向下延伸出基
 * 行框——同一音節疊 2 個以上下加字時，字形會疊到下一行的字上。按文本塊逐行
 * 統計最大連續下加字數 n，line-height 隨 n 加大（n<=1 不動；n=2→3；n=3→4；
 * n>=4→n+1）。直排文種 line-height 同樣作用於列間距，方向自適應。
 * 下加字判定：zanabazar＝顯式 U+11A47 SUBJOINER；soyombo＝顯式 U+11A99；
 * marchen＝隱式模型（subjoined 獨立碼位 U+11C92–U+11CAF，無 subjoiner）。
 *
 * 與 translit-panel.ts 內嵌版同一算法（引擎輸出模型實錘：zanabazar/soyombo＝
 * 顯式 SUBJOINER **前綴**標記其後一個碼位為下加字形；marchen＝subjoined
 * 獨立碼位自足）。
 */
const EXPLICIT_SJ: Record<string, number> = { zanabazar: 0x11a47, soyombo: 0x11a99 };
const MARCHEN_SJ_LO = 0x11c92;
const MARCHEN_SJ_HI = 0x11caf;
const COMBO_KEEP = new Set([0x200d, 0x200c, 0x11a98, 0x11a9f, 0x11a86, 0x11a87]);
/**
 * 上疊碼位：Soyombo CLUSTER-INITIAL（U+11A86–11A89 ra/la/sha/sa）——疊在基字**上方**
 * （藏文 ra-go 疊置對應），字形向上伸出基行框。行內出現時該行需要頭部預留；
 * 且與上一行的下疊下伸共用行距時會互相擠壓（正文行距堆疊實錘）。
 */
const SUPERJOINED: Array<[number, number]> = [[0x11a86, 0x11a89]];
/** 基行框會被疊字穿透的文種碼位區段（偵測用——含主區＋下加區＋組合符） */
const SCRIPT_RANGES: Array<[number, number]> = [
  [0x0f00, 0x0fff], // tibetan（下疊行距適配含藏文）
  [0x11a00, 0x11a4f], // zanabazar
  [0x11a50, 0x11aaf], // soyombo
  [0x11c70, 0x11cb6], // marchen（全區塊至 candrabindu 11CB6；11CB7–11CBF 未分配）
];

function isScriptChar(cp: number): boolean {
  return SCRIPT_RANGES.some(([lo, hi]) => cp >= lo && cp <= hi);
}

/**
 * 藏文：subjoined 獨立碼位 U+0F90–0FBC（隱式模型，同 marchen）；
 * 下加間可穿插元音符號/ anusvara 等 combining（U+0F71–0F81、0F35、0F37），
 * 渲染仍為同一縱列——計 run 時不斷鏈。
 */
const TIB_SJ_LO = 0x0f90;
const TIB_SJ_HI = 0x0fbc;
const isTibSubjoined = (cp: number): boolean => cp >= TIB_SJ_LO && cp <= TIB_SJ_HI;
const isTibCombo = (cp: number): boolean =>
  (cp >= 0x0f71 && cp <= 0x0f81) || cp === 0x0f35 || cp === 0x0f37;

/** 逐行統計最大連續下加字數（算法與 translit-panel applySubjoinLineHeight 一致） */
export function subjoinMaxRun(text: string): number {
  let maxRun = 0;
  for (const line of text.split("\n")) {
    let run = 0;
    let afterSj = false;
    for (const ch of line) {
      const cp = ch.codePointAt(0) ?? 0;
      const isMarchen = cp >= MARCHEN_SJ_LO && cp <= MARCHEN_SJ_HI;
      const isSj = isMarchen || isTibSubjoined(cp) || cp === EXPLICIT_SJ.zanabazar || cp === EXPLICIT_SJ.soyombo;
      if (isSj) {
        run += 1;
        if (run > maxRun) maxRun = run;
        afterSj = true;
        continue;
      }
      if (afterSj) {
        if (!COMBO_KEEP.has(cp) && !isTibCombo(cp)) afterSj = false;
        continue;
      }
      run = 0;
    }
  }
  return maxRun;
}

/**
 * 上疊檢測：行內含 CLUSTER-INITIAL（上疊叢集首字母）→ 該行需要頭部預留。
 * 上疊最多一層（叢集首單層疊置），但為與相鄰下疊行的放大行距協調
 * （下一行上疊上伸 vs 上一行下疊下伸），統一給予 3 倍行距需求（同 sj run=2 檔）。
 */
export function textHasSuperjoined(text: string): boolean {
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0;
    if (SUPERJOINED.some(([lo, hi]) => cp >= lo && cp <= hi)) return true;
  }
  return false;
}

export function subjoinLineHeightFor(run: number): number | null {
  // 行距演化：+1 全檔位加大修復下緣（run=1→3、n+2）→ 真機確認修復成功後
  // 觀感偏大——整體回收 0.5（run=1→2.5、run>=2→n+1.5），階梯（檔間差 1）
  // 與修復成果保持：2.5 仍高於垂串深度需求（真機實測 lh=3 時下緣餘裕充足）。
  return run >= 2 ? run + 1.5 : null;
}

/** 行距需求合計：下疊 run 檔位與上疊檔位取較大者（null＝無需求）。 */
export function subjoinLhForText(text: string): number | null {
  const run = subjoinMaxRun(text);
  const lh = subjoinLineHeightFor(run);
  const sup = textHasSuperjoined(text) ? 3.5 : null;
  if (lh && sup) return Math.max(lh, sup);
  if (lh) return lh;
  // 單層下加（run=1）也向下伸出基行框——Noto 字形疊置深度實機實錘（正文
  // line-height 1.5~1.6 裝不下；面板輸出框 line-height:2 樣式表基準可容納＝
  // 對照「輸出框過、其餘面沒過」的差異來源）。起放檔位：三文種統一——
  // 下加出現即 lh=2（Zanabazar/Soyombo 顯式 SUBJOINER 原有基準，marchen/藏文
  // 隱式模型下加同構同深度，單層起放對齊＝閱讀態/編輯態行距同步裁定）。
  if (run === 1) return 2.5;
  return sup;
}

const LJ_PROP = "--li-subjoin-lh";
const PAD_PROP = "--li-subjoin-pad";
/**
 * 閱讀態物理預留深度（em）：與編輯態 fence 檔位表同構（styles.css
 * .cm-line.li-sj-lh-N.HyperMD-codeblock padding-bottom 對照）——
 * bucket=ceil(lh)：3→0.75、4→1.25、5→1.75、6→2.25、7→2.75、8→3.25（每檔＋0.5）。
 * 修復：閱讀態原一律 0.5em，run>=2 時垂串深度遞增、缺口越檔越大，
 * Zanabazar 正文末行下疊下緣仍被後繼塊吃（用戶真機實錘，編輯態不受影響——
 * 編輯態 fence 檔位表早已分檔）。線性式 0.25+0.5×bucket 與表值逐檔核對一致。
 */
export function subjoinPadForText(text: string): number | null {
  const lh = subjoinLhForText(text);
  if (!lh) return null;
  const bucket = Math.min(Math.ceil(lh), 8);
  // 與編輯態 fence 檔位表逐檔一致：3→0.75、4→1.25、…、8→3.25（0.75+(bucket-3)*0.5）。
  return bucket <= 3 ? 0.75 : 0.75 + (bucket - 3) * 0.5;
}
/**
 * 對元素套用（閱讀器 post-processor 路徑）：有疊字需求設 CSS 變數，否則移除。
 * 同時寫 --li-subjoin-pad（物理預留深度），CSS 端 padding-bottom 讀它——
 * 深度隨檔位增長（原固定 0.5em 對 run>=2 不足）。
 * 編輯器路徑不走此函數——CM 會以 className 整體賦值覆寫行元素 class/inline style
 * （實機實錘），編輯器由 subjoin-cm-decorations.ts 的 Decoration.line class 接管。
 */
export function applySubjoinLhToEl(el: HTMLElement): void {
  const lh = subjoinLhForText(el.textContent || "");
  if (lh) {
    el.style.setProperty(LJ_PROP, String(lh));
    const pad = subjoinPadForText(el.textContent || "");
    if (pad) el.style.setProperty(PAD_PROP, `${pad}em`);
    else el.style.removeProperty(PAD_PROP);
  } else {
    el.style.removeProperty(LJ_PROP);
    el.style.removeProperty(PAD_PROP);
  }
}

/**
 * 文本塊（閱讀器 post-processor 的 p/li/td/blockquote 等）快速篩選：
 * 無三文種碼位直接跳過（O(1) 每字元，正文絕大多數段落零成本）。
 */
export function textHasSubjoinScripts(text: string): boolean {
  for (const ch of text) {
    if (isScriptChar(ch.codePointAt(0) ?? 0)) return true;
  }
  return false;
}

/**
 * 閱讀態藏文 run 字體包 span。
 * 對葉塊內含藏文碼位的文本節點逐段 splitText，連續藏文 run 包上
 * span.li-tib-run（styles.css 指定文種字體棧）。不改文本數據，只包 DOM。
 */
export function wrapTibetanRuns(root: HTMLElement): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const targets: Array<{ node: Text; ranges: Array<[number, number]> }> = [];
  let node: Text | null;
  while ((node = walker.nextNode() as Text | null)) {
    const text = node.data;
    let hasTib = false;
    for (const ch of text) {
      const cp = ch.codePointAt(0) ?? 0;
      if ((cp >= 0x0f00 && cp <= 0x0f0f) || (cp >= 0x0f20 && cp <= 0x0fff)) {
        hasTib = true;
        break;
      }
    }
    if (!hasTib) continue;
    const ranges: Array<[number, number]> = [];
    let runStart = -1;
    let i = 0;
    for (const ch of text) {
      const cp = ch.codePointAt(0) ?? 0;
      const inTib = (cp >= 0x0f00 && cp <= 0x0f0f) || (cp >= 0x0f20 && cp <= 0x0fff);
      if (inTib && runStart < 0) runStart = i;
      if (!inTib && runStart >= 0) {
        ranges.push([runStart, i]);
        runStart = -1;
      }
      i += ch.length;
    }
    if (runStart >= 0) ranges.push([runStart, text.length]);
    targets.push({ node, ranges });
  }
  for (const { node, ranges } of targets) {
    // 從後往前切，保持前面的偏移不失效
    for (let k = ranges.length - 1; k >= 0; k--) {
      const [s, e] = ranges[k];
      if (e < node.data.length) node.splitText(e);
      const runNode = s > 0 ? node.splitText(s) : node;
      const span = document.createElement("span");
      span.className = "li-tib-run";
      runNode.parentNode?.insertBefore(span, runNode);
      span.appendChild(runNode);
    }
  }
}

/**
 * 註冊正文疊字行距適配。閱讀器走 registerMarkdownPostProcessor（渲染完成後
 * 對每個段落級元素偵測套用）；編輯器走 MutationObserver（.cm-content 內容
 * 變更＋初次掃描；編輯模式無 post-processor 管線）。生命周期由插件統一管理。
 */
export function registerSubjoinLineHeight(plugin: Plugin): void {
  // 閱讀器：markdown 渲染管線
  plugin.registerMarkdownPostProcessor((el) => {
    // 效能閘：絕大多數筆記無三文種碼位——一次 O(n) 文本掃（0.7MB 實測 8ms）
    // 短路整段 DOM 查詢（逐塊 querySelectorAll＋嵌套判定才是大頭）。
    if (!textHasSubjoinScripts(el.textContent || "")) return;
    const blocks = el.querySelectorAll<HTMLElement>("p, li, td, th, blockquote, h1, h2, h3, h4, h5, h6, div, pre");
    if (blocks.length === 0) {
      applySubjoinLhToEl(el);
      return;
    }
    for (const b of blocks) {
      // 葉塊優先：含嵌套時 deepest 先命中，父層 textContent 重複套用無害
      // （line-height 疊加不對立——同一變數，父值被子層覆蓋或反之，取較大者
      // 由 CSS 繼承自然解決）。此處僅對**無子塊**的葉元素套用，避免重複。
      // pre 也在跳過清單：pre 是整塊內容（fence 碼塊），父層（blockquote/div/li）
      // 的 textContent 已含 pre 疊字——父層再套會把 pre 的行距需求放大到父層
      // 全部行框（雙重套用），故父層含 pre 時只讓 pre 自身承接。
      if (b.querySelector("p, li, td, blockquote, h1, h2, h3, h4, h5, h6, div, pre")) continue;
      if (!textHasSubjoinScripts(b.textContent || "")) continue;
      applySubjoinLhToEl(b);
      // 藏文 run 字體包 span（閱讀態）——跨字體 shaping 斷裂修復，
      // 機理與編輯態 mark decoration 同源（見 subjoin-cm-decorations.ts 頭註）。
      wrapTibetanRuns(b);
    }
  });

  // 編輯器側改由 subjoin-cm-decorations.ts 的 CM6 ViewPlugin Decoration.line 接管
  // （MutationObserver 寫 class/inline style 會被 CM update cycle 的 className 整體
  // 賦值覆寫——實機實錘：同一 .cm-line 元素、classList 被重寫；decoration 是唯一
  // 原生不被覆寫的通道）。fence block 合併語義由該檔註釋與 buildDecorations 承接。
}
