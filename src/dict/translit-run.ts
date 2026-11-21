// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry
/**
 * 轉寫執行層 —— 供轉寫面板「呈現轉寫」使用。
 *
 * 純邏輯能力不能丟——尤其是：
 *   1. 詞邊界判定（什麼算一個待轉寫的音節詞）
 *   2. 逐詞轉換 + 保留句讀標點
 *   3. 拉丁文「能不能轉」的守門
 * 這三項正是「長文本轉寫呈現」的基礎，故遷移到本檔案。
 *
 * 遷移時的重點改造：原邏輯是**游標驅動**（只看游標前那個詞），本檔案改為
 * **文本級**（掃描整段），才能支撐轉寫面板一次處理上千字的底本 / 對校本。
 * CM6 適配層（realtime-translit.ts）未遷移——那是與輸入方式綁定的部分，隨
 * 即時上屏一併從運行時移除。
 *
 * ## 遷移時修正的兩個既有缺陷（非漂移，是修 bug）
 *
 * 缺陷一：全角逗號 U+FF0C 不在觸發字符集裡。
 *   原集合收了 U+3001 頓號、U+3002 句號，卻漏了中文最常用的逗號。後果是
 *   「bod，chos」被視為**一個詞**，`looksLikeRoman` 不匹配 → 整段沉默不轉。
 *   本檔案補齊 U+FF0C，並順帶補 U+3000 表意空格與 U+00A0 不換行空格——
 *   後兩者在長文本掃描裡同樣當分隔符（游標版靠 `\s` 兜著，長文本版沒有）。
 *
 * 缺陷二：`looksLikeRoman` 被當成「能不能轉」的許可閘門，這是類別錯誤。
 *   以梵文為例 `looksLikeIast("karma") === false`——它只認 ā/ī/ṭ/ṃ 這類帶
 *   變音符的特徵字符，純 ASCII 的 karma 一律判為「不像梵文」。該函式的註解
 *   寫的是「是否像該文種羅馬字」，用途是**自動方向判定**，為了避免把英文誤
 *   判成梵文，它刻意對純 ASCII 返回 false。用它做許可閘門的實際效果是：
 *   即時上屏時代用戶鍵入 "karma " 永遠沉默。
 *   長文本呈現是本插件轉寫能力的主場景，不能沿用這個語義，故本檔案改用
 *   `gate` 三態；需要逐字復現舊行為的呼叫端（`convertTrailingWord`）仍可
 *   顯式指定 `"looks"`。
 *
 * 本檔案不依賴 CodeMirror / DOM / obsidian，可在 Node 中直接單測。
 */

import type { TransliterationScheme, TransliterationOptions } from "../translit-common";
import { listSchemes, getScheme } from "../translit-common";
import { parseEscCp } from "../indic";

/**
 * 詞分隔符。
 *  - 空格 / 換行 / 跳格：基礎分隔。
 *  - U+3000 表意空格、U+00A0 不換行空格：中文排版常見空白，長文本掃描必須
 *    認得（游標版有 `\s` 兜底，文本級掃描沒有）。
 *  - ASCII 標點：西文句讀。
 *  - 全角 / CJK 標點（。，、！？；：（）「」『』〈〉《》…—～）：中文用戶的主要
 *    句讀，讓中文正文裡夾的羅馬字詞也能被切出來轉寫。
 */
export const TRIGGER_CHARS = new Set<string>([
  " ", "\n", "\t", "\u3000" /* 表意空格 */, "\u00a0" /* 不換行空格 */, "\u202f" /* NNBSP 窄不換行空格——蒙古文正字法詞間分隔（批量語料實錘） */,
  // ASCII / 通用標點
  // （ [ {：開括號也是詞界——缺收時 "(kāraṇopagāḥ" 整串黏進
  // 詞緩衝，LATIN_SHAPE 對 "(" 判否而整詞略過（真機實錘：括號內首詞殘留拉丁）
  "(", "[", "{",
  ".", ",", "!", "?", ";", ":", ")", "]", "}", '"', "/", "\\",
  "·" /* U+00B7 間隔號：西文與中文都會用，兩處通吃故只宣告一次 */,
  // 西文書名/引號：«» “” 不切詞會把 «eger» 整詞帶標點送 passGate 而 skip；
  // ‘’（U+2018/2019）刻意不加——英文縮寫撇號（don't）在詞中不可切
  "\u00AB", "\u00BB", "\u201C", "\u201D",
  // 全角 / CJK 標點
  "。", "，" /* U+FF0C：遷移時補齊，見檔頭「缺陷一」 */, "、", "！", "？",
  "；", "：", "（", "）", "「", "」", "『", "』", "〈", "〉", "《", "》",
  "…", "—", "～",
  // 豎排呈現形標點（蒙古文直排文本用 ︖︕）＋白星（語料實錘）
  "\uFE15", "\uFE16", "☆",
  "&" /* HTML 實體殘留（&nbsp; 等）黏詞實錘 */,
  // B2/r156：⟨（U+27E8）——⟨U+XXXX⟩ 註記體例的詞界字符（⟨…⟩ 整段含 trigger
  // 字符 ⟨⟩ 與 +，不切詞會整詞黏進詞緩衝、LATIN_SHAPE 判否整詞 skipped
  // （實錘：mongolian "monggol😀😀<birga>n" r2n 全透傳）；切開後註記段由
  // ANN_TOKEN_RE 原子送轉換器（與 esc 同款）。
  "⟨", "⟩",
  // 蒙古文標點（U+1800–U+180A）——蒙文句讀黏詞會讓 roman 詞帶蒙文字符、
  // LATIN_SHAPE 判否整詞 skipped（批量 10,317 詞實錘）。FVS(U+180B-F)/MVS(U+180E)
  // 是詞內字符，刻意不入——切了會破壞標記往返契約。
  "\u1800", "\u1801", "\u1802", "\u1803", "\u1804", "\u1805",
  "\u1806", "\u1807", "\u1808", "\u1809", "\u180A",
]);

/** f2-A：esc 標註 token 正則（全方案通用；escAnnotationToken 聲明時啓用）——
 * parseEscCp 同序：先 6 位（出向體例 padStart(6)）後 4 位（舊文本相容）。 */
const ESC_TOKEN_RE = /^(?:\\u[0-9A-Fa-f]{6}|\\u[0-9A-Fa-f]{4})/;

/** 文本是否含 surrogate 區間 code unit（合法 SMP 字或孤立代理皆然；emoji 等非
 * BMP 碼位的 UTF-16 表示即兩個 surrogate cu）。審核體例：不在字符類寫
 * \uD800-\uDFFF 字面（官方審核視為「unexpected combined character」警告），
 * 語義等價改為逐 code unit 檢測（flush 分段體逐 cu 判定，兩路一致）。 */
function hasSurrogateUnit(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdfff) return true;
  }
  return false;
}

/** 天城文主區塊碼位判定（0900–097F 逐碼位掃）——不用字元類：
 *  區間內含組合字符（candrabindu/anusvara/visarga/nukta/元音符號），字元類寫法
 *  會觸發 Obsidian 審核「Unexpected combined character in character class」
 *  警告（r59c）；逐碼位 some 判定語義與原 /\u0900-\u097F/ 字元類逐碼位等價。 */
function hasDevanagariChar(s: string): boolean {
  for (const ch of s) {
    const cp = ch.codePointAt(0) ?? 0;
    if (cp >= 0x0900 && cp <= 0x097f) return true;
  }
  return false;
}

export function isTriggerChar(ch: string): boolean {
  return TRIGGER_CHARS.has(ch);
}

/**
 * 從一段文本尾部取出「待轉寫的羅馬字詞」及其後方保留的標點長度。
 * 保留此函式是為了與遷移前的行為逐字一致（行為不可漂移），
 * 且長文本掃描裡 flush 語義與它同源。
 */
export function extractTrailingWord(before: string): { word: string; punctLen: number } | null {
  let end = before.length;
  while (end > 0 && isTriggerChar(before[end - 1])) end--;
  const punctLen = before.length - end;
  const core = before.slice(0, end);
  const m = /(?:^|\s)([^\s]+)$/.exec(core);
  if (!m) return null;
  return { word: m[1], punctLen };
}

/** 安全轉換：方案實作拋錯時視為不可轉寫，絕不讓異常穿透到 UI */
// 拼式歧義偏好（r44c）：transliterateLongText 生命週期內生效的方案級 opts
let ACTIVE_CONV_OPTS: TransliterationOptions | undefined;

function safeConvert(
  scheme: TransliterationScheme,
  word: string,
  native: boolean,
  _convOpts?: TransliterationOptions,
): string | null {
  try {
    const out = native
      ? scheme.romanToNative(word, ACTIVE_CONV_OPTS)
      : scheme.nativeToRoman(word, ACTIVE_CONV_OPTS);
    return typeof out === "string" ? out : null;
  } catch {
    return null;
  }
}

/** 安全呼叫方案的判定函式：方案沒實作 / 拋錯，一律視為「不確定」 */
function safeLooks(
  fn: ((t: string) => boolean) | undefined,
  word: string,
): boolean {
  if (typeof fn !== "function") return false;
  try {
    return !!fn(word);
  } catch {
    return false;
  }
}

/**
 * 「長得像拉丁系轉寫 token」的形狀判定。
 *
 * 與 `looksLikeRoman` 的差別：這是**許可**判定（能不能餵給轉換器），
 * 不是**方向**判定（這段文本是哪個文種）。故刻意放寬到「只要全由拉丁系字符
 * 組成即可」，把「像不像某個特定文種」的判斷交給方案的 charTable 與 `looksLikeNative`。
 *
 * 覆蓋的碼位區間（夠用且不依賴 `\p{Script=...}`，相容舊 target）：
 *   ASCII 字母 / 拉丁-1 補充 + 擴展 A·B / 擴展附加 / 擴展 C / 組合附加符號
 *   + 數字 + 常見連接符（' ’ . _ -）
 * 漢字、假名、藏文、天城體等一律不在此集合內 → 不會被誤餵。
 */
const LATIN_SHAPE = /^[\u0300-\u036FA-Za-z\u00C0-\u024F\u02B0-\u02FF\u1E00-\u1EFF\u2C60-\u2C7F0-9'\u2019._<>+\u200C-\u200D-]+$/;
/** 至少要有一個拉丁字母，避免純標點 / 純數字 token 被當成詞送去轉 */
const HAS_LATIN_LETTER = /[A-Za-z\u00C0-\u024F\u1E00-\u1EFF\u2C60-\u2C7F]/;

/** 詞是否具備「可被餵給 romanToNative」的形狀（純拉丁詞 / CJK 混排免疫） */
export function looksConvertible(word: string): boolean {
  return !!word && LATIN_SHAPE.test(word) && HAS_LATIN_LETTER.test(word);
}

/**
 * 守門模式。
 *  - `"looks"`：用方案自己的 `looksLikeRoman` / `looksLikeNative`。這等價於
 *    遷移前即時上屏的語義，供需要零漂移的呼叫端使用。注意它同時帶著
 *    「純 ASCII 視為不像」的方向判定副作用（見檔頭「缺陷二」）。
 *  - `"latin"`：**默認**。羅馬方向看形狀（`looksConvertible`），原生方向仍用
 *    方案的 `looksLikeNative`（原生文種有獨立 Unicode 區段，這個判定可靠）。
 *    這樣中文詞不會被誤餵，純 ASCII 的 karma 也不會被冤枉。
 *  - `"none"`：不守門，只靠「轉寫結果與原詞相同則放棄」兜底。
 */
export type RunGate = "looks" | "latin" | "none";

export interface RunOptions {
  /** 守門模式，默認 `"latin"`，詳見 RunGate 說明 */
  gate?: RunGate;
  /** 藏文拼式歧義偏好（r44c）：傳給方案的 opts.tibAmbig（nativeToRoman 出向） */
  tibAmbig?: string;
  /** X-近似歧義偏好（r45c）：傳給方案的 opts.xApprox（nativeToRoman 出向） */
  xApprox?: string;
  /** r50d：Ali Gali 同音異碼取樣（傳給方案的 opts.agBackForm；romanToNative 反向） */
  agBackForm?: string;
  /**
   * 蒙古文輸入法專用的「首字母大寫哨兵」門禁。
   * 開啟時（羅馬方向）額外要求首字母大寫，避免 when / like / time 這類短英文詞
   * 被靜默改寫成蒙古文——即時上屏時代這是數據破壞級缺陷，故保留開關。
   * 長文本呈現場景下用戶是全選後手動轉、結果並排可見，故默認關閉。
   */
  capitalSentinel?: boolean;
}

export interface RunResult {
  /** 轉寫後的文本（標點、換行、未轉寫的詞全部原樣保留） */
  text: string;
  /** 成功轉寫的詞數 */
  converted: number;
  /** 未轉寫的詞數（不符合該方案 / 方案實作返回原值） */
  skipped: number;
  /** 詞數總計 */
  words: number;
}

export interface RunDocLike {
  /** pos 所在行的行首偏移 */
  lineStart(pos: number): number;
  /** 取 [from, to) 文本 */
  slice(from: number, to: number): string;
}

/**
 * 游標前「最後一個詞」的轉寫（游標驅動）。
 *
 * 雖然長文本掃描，但此函式本身不依賴 CM6，且它的語義
 * （轉寫結果與原詞相同就不產生事務）在任何呼叫端都成立。保留它是為了遷移後
 * 行為零漂移——原 附录/realtime-轉寫/realtime-core.ts 的單測可以直接搬到這個檔案上跑，
 * 故默認守門仍走 `"looks"`。
 */
export function convertTrailingWord(
  doc: RunDocLike,
  pos: number,
  scheme: TransliterationScheme,
  opts: RunOptions = {},
): { from: number; to: number; insert: string } | null {
  const { gate = "looks", capitalSentinel } = opts;
  const lineFrom = doc.lineStart(pos);
  const before = doc.slice(lineFrom, pos);
  const res = extractTrailingWord(before);
  if (!res) return null;
  const { word, punctLen } = res;
  if (!passGate(word, scheme, true, gate, capitalSentinel)) return null;
  const converted = safeConvert(scheme, word, true);
  if (converted === null || converted === word) return null;
  const wordStart = pos - punctLen - word.length;
  return { from: wordStart, to: pos - punctLen, insert: converted };
}

/**
 * 長文本轉寫：掃描整段文本，按詞邊界逐詞轉寫。
 *
 * 與遷移前的差異：原邏輯只處理「游標前一個詞」；此處處理整段，
 * 且保持原文本的標點與換行結構完全不變——校勘要拿結果與原文逐字對照，
 * 結構一旦漂移就失去意義。
 *
 * @param native true = 羅馬字 → 原生文字；false = 原生文字 → 羅馬字
 */
export function transliterateLongText(
  text: string,
  scheme: TransliterationScheme,
  native: boolean,
  opts: RunOptions = {},
): RunResult {
  const { gate = "latin", capitalSentinel } = opts;
  // 拼式歧義偏好注入方案調用（藏文組 nativeToRoman 讀 opts.tibAmbig）
  const prevConvOpts = ACTIVE_CONV_OPTS;
  if (opts.tibAmbig && opts.tibAmbig !== "auto") {
    ACTIVE_CONV_OPTS = { tibAmbig: opts.tibAmbig };
  }
  if (opts.xApprox && opts.xApprox !== "auto") {
    ACTIVE_CONV_OPTS = { ...ACTIVE_CONV_OPTS, xApprox: opts.xApprox as import("../translit-common").TransliterationOptions["xApprox"] };
  }
  if (opts.agBackForm && opts.agBackForm !== "auto") {
    ACTIVE_CONV_OPTS = { ...ACTIVE_CONV_OPTS, agBackForm: opts.agBackForm };
  }
  try {
  let out = "";
  let word = "";
  let converted = 0;
  let skipped = 0;
  let words = 0;
  // 梵文連聲黏合：記住上一個已轉換的詞。「空格+'詞」的排版
  //（rāmo'sti）在正字法上是連聲 rāmaḥ+asti，原生形必須黏合（रामोऽस्ति）；
  // 逐詞轉換會把 'sti 當孤詞還原成 अस्ति。flush 時若本詞以 ' 開頭、上一詞
  // 存在且其轉換輸出以字母結尾 → 回退輸出尾空格，把「上一詞＋本詞」整段
  // 重送引擎（引擎詞中 ' 走 avagraha → ऽ 黏合）。
  let prevWord = "";
  let prevLetterTail = false;
  let prevOutLen = 0; // prevWord 轉換前的 out 長度（黏合回退用）

  const flush = (): void => {
    if (!word) return;
    words++;
    let done = false;
    if (
      native &&
      word.startsWith("'") &&
      prevWord &&
      prevLetterTail &&
      // 即時檢查輸出尾（略過剛透傳的詞界空格——那正是要回退的字符）：
      // 中間透傳的句讀（rāmo. 'sti）後不算連聲
      /[^\s.,;:!?]\s*$/.test(out) &&
      passGate(prevWord + word, scheme, native, gate, capitalSentinel)
    ) {
      // 回退上一詞的整段轉換＋其後空格，重送合併段
      out = out.slice(0, prevOutLen);
      words--;
      const c = safeConvert(scheme, prevWord + word, native);
      if (c !== null && c !== prevWord + word) {
        out += c;
        converted++;
        done = true;
      }
      if (!done) {
        out += prevWord + word;
        skipped++;
      }
      word = "";
      prevWord = "";
      prevLetterTail = /[^\s.,;:!?]/.test(out.slice(-1));
      return;
    }
    const outBefore = out.length;
    // B2/r156：註記殘段切詞修復——詞緩衝含區塊外字符（emoji/孤立代理/非拉丁
    // 區碼位）時 LATIN_SHAPE 判否整詞 skipped（"monggol😀😀<birga>n" r2n 全
    // 透傳實錘）。改按段送 passGate：先整詞試（窄路徑），失敗且詞內含「可切
    // 邊界」（emoji 碼位／代理對）則分段送轉換器，段間原樣透傳。往返契約：
    // 每段獨立 n2r 對稱還原，byte-identical。
    if (!passGate(word, scheme, native, gate, capitalSentinel) && (/[\u27E8\u27E9]/.test(word) || hasSurrogateUnit(word)) && (/[A-Za-z\u1800-\u18AF]/.test(word) || hasDevanagariChar(word))) {
      // 按代理對/註記符切邊界重掃（同主迴圈逐段 flush 語義）
      let j = 0;
      let buf = "";
      const flushBuf = () => {
        if (!buf) return;
        if (passGate(buf, scheme, native, gate, capitalSentinel)) {
          const c = safeConvert(scheme, buf, native);
          if (c !== null && c !== buf) { out += c; converted++; }
          else { out += buf; skipped++; }
        } else { out += buf; skipped++; }
        buf = "";
      };
      while (j < word.length) {
        const cu = word.charCodeAt(j);
        if (cu >= 0xd800 && cu <= 0xdfff) { flushBuf(); out += word[j]; j++; continue; }
        buf += word[j]; j++;
      }
      flushBuf();
      prevWord = word;
      prevOutLen = outBefore;
      // r54 排查修復：原 /[^\s.,;:!?] 之外此行誤為雙跳脫（排除反斜線與字母 s
      // 而非空白），末字 's'/'.'/空白皆誤判字母結尾，連聲黏合（'sti）在錯誤
      // 上下文觸發。對齊同檔其餘 5 處（316/390/418/436/463）正確形式。
      prevLetterTail = /[^\s.,;:!?]/.test(out.slice(-1));
      word = "";
      return;
    }
    if (passGate(word, scheme, native, gate, capitalSentinel)) {
      const c = safeConvert(scheme, word, native);
      if (c !== null && c !== word) {
        out += c;
        converted++;
        done = true;
      }
    }
    if (!done) {
      out += word;
      skipped++;
    }
    prevWord = word;
    prevOutLen = outBefore;
    prevLetterTail = done && /[^\s.,;:!?]/.test(out.slice(-1));
    word = "";
  };

  // for..of 改顯式 index 迴圈（r65）：代理對安全（用 codePointAt 前進）＋
  // 原子 token 優先——方案聲明 romanTokenRe 時，從當前位置起對剩餘文本做
  // 「最長前綴命中」測試（正則須自我錨定 ^…$），命中即整體送轉換器並免門禁：
  // 檢字表 token（藏文 <.>/\uXXXX、婆羅米 ;1/;100<jm>;4）含 . ; \ 等詞界
  // trigger 字符，逐詞掃描會切碎、碎片無拉丁字母被 gate 拒 → 真機實錘透傳。
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    // f2-A：esc 標註 token 掃描（native 方向、方案聲明 escAnnotationToken 時）——
    // 放在代理對分支**之前**：\ 是 TRIGGER_CHARS 詞界且 ESC_TOKEN_RE 以 \u 開頭，
    // 若不先行命中，\ 會被逐字符切碎（\ → trigger、u00090D 成詞被 gate 拒），
    // 含 esc 的文本掃描層整體 skipped 原樣透傳（真機實錘 converted:0 skipped:3）。
    // esc 命中即整段原子送轉換器（引擎 parseEscCp 體例原樣：6 位出向、4 位相容）。
    if (native && scheme.escAnnotationToken && ch === "\\") {
      const m = ESC_TOKEN_RE.exec(text.slice(i, i + 8));
      if (m !== null) {
        flush();
        const seg = m[0];
        const c = safeConvert(scheme, seg, true);
        if (c !== null && c !== seg) { out += c; converted++; }
        else { out += seg; skipped++; }
        prevWord = "";
        prevLetterTail = /[^\s.,;:!?]/.test(out.slice(-1));
        i += seg.length;
        continue;
      }
    }
    if (ch >= "\uD800" && ch <= "\uDBFF" && i + 1 < text.length) {
      // 代理對：整碼位處理（回鶻文 U+10F70、悉曇 U+11580）
      const cpCh = text.slice(i, i + 2);
      if (isTriggerChar(cpCh)) { out += cpCh; i += 2; continue; }
      word += cpCh;
      i += 2;
      continue;
    }
    // native 原子 token 檢測（僅原生方向、方案有聲明時）——蒙文標點
    // 1800-180A 是 TRIGGER_CHARS 詞界，掃描層直接透傳（᠀ 不出 <birga> 實錘）。
    if (!native && scheme.nativeAtomRe) {
      const rest = text.slice(i, i + 32);
      let hit: string | null = null;
      for (let end = rest.length; end >= 1; end--) {
        const cand = rest.slice(0, end);
        if (scheme.nativeAtomRe.test(cand)) { hit = cand; break; }
      }
      if (hit !== null) {
        flush();
        const c = safeConvert(scheme, hit, false);
        if (c !== null && c !== hit) { out += c; converted++; }
        else { out += hit; skipped++; }
        prevWord = "";
        prevLetterTail = /[^\s.,;:!?]/.test(out.slice(-1));
        i += hit.length;
        continue;
      }
    }
    // esc 標註優先（native 方向）——\uXXXXXX／⟨U+XXXX⟩（B2/r156 新體例）皆為
    // 方案通用體例；\ 與 ⟨ 是詞界 trigger 字符，逐詞掃描會把標註切碎
    // （\→trigger、u00A8FE 成詞被當 IAST 轉成亂碼實錘）。esc 命中即整段原子
    // 送轉換器（parseEscCp 已雙體例解析）。
    if (native) {
      const esc = parseEscCp(text.slice(i));
      if (esc !== null) {
        flush();
        const seg = text.slice(i, i + esc.width);
        const c = safeConvert(scheme, seg, true);
        if (c !== null && c !== seg) { out += c; converted++; }
        else { out += seg; skipped++; }
        prevWord = "";
        prevLetterTail = /[^\s.,;:!?]/.test(out.slice(-1));
        i += esc.width;
        continue;
      }
    }
    // —— 原子 token 檢測（僅羅馬方向、方案有聲明時）——
    // Wylie a-chung 修復：' 既是孤立符號鍵（檢字表單獨輸入 a-chung）也是詞內
    // 第二後加字標記（pa'i 藏文屬格）。前者是孤立上下文，後者前必貼拉丁字母——
    // 詞內的 ' 不做 token 命中，留在詞緩衝整詞送引擎（否則 pa'i 被切 pa|'|i，
    // 孤立 i 借 ཨ 組合成 པའཨི，往返破碎）。
    if (native && !(ch === "'" && i > 0 && /[A-Za-z\u00C0-\u024F]/.test(text[i - 1])) && scheme.romanTokenRe) {
      // 最長命中限長 32 碼元：token 皆短（;100<jm>;4=10、<..>=4），限長既
      // 防禦病態正則也把每次命中測試成本封頂 O(32²)；超過限長的 candidate
      // 不可能匹配全錨定 token 正則（聲明處註明 token 至多 32 字符）。
      const rest = text.slice(i, i + 32);
      let hit: string | null = null;
      for (let end = rest.length; end >= 1; end--) {
        const cand = rest.slice(0, end);
        if (scheme.romanTokenRe.test(cand)) { hit = cand; break; }
      }
      if (hit !== null) {
        flush();
        const c = safeConvert(scheme, hit, true);
        if (c !== null && c !== hit) {
          out += c;
          converted++;
        } else {
          out += hit;
          skipped++;
        }
        prevWord = "";
        prevLetterTail = /[^\s.,;:!?]/.test(out.slice(-1));
        i += hit.length;
        continue;
      }
    }
    if (isTriggerChar(ch)) {
      flush();
      // 標點映射：羅馬→原生方向時，方案可提供 punctMap
      // （如維吾爾 , → ،、? → ？）把被詞界切開的標點一併轉換——
      // 否則標點原樣透傳，UEY 輸出混入半形逗號/問號（真機實錘）。
      if (native && scheme.punctMap && scheme.punctMap[ch]) out += scheme.punctMap[ch];
      else out += ch;
      // 撇號已從 TRIGGER_CHARS 移除：' 留在詞內交由方案引擎處理
      // （維吾爾隔音撇號通路、梵文 avagraha 詞首補 a），透傳/切分都會黏出裸撇號。
    } else {
      word += ch;
    }
    i += 1;
  }
  flush();
  return { text: out, converted, skipped, words };
  } finally {
    ACTIVE_CONV_OPTS = prevConvOpts;
  }
}

function passGate(
  word: string,
  scheme: TransliterationScheme,
  native: boolean,
  gate: RunGate,
  capitalSentinel?: boolean,
): boolean {
  if (capitalSentinel && native) {
    // 首字母大寫哨兵：蒙古文無大小寫，用大寫字母表達轉寫意圖零語義成本
    if (!/^[A-Z]/.test(word)) return false;
    // eslint-disable-next-line @typescript-eslint/unbound-method -- 方法引用經包裝函數調用（this 已由 wrapper 控制），重構風險——審計批次三。
    return gate === "latin" ? looksConvertible(word) : safeLooks(scheme.looksLikeRoman, word);
  }
  switch (gate) {
    case "none":
      return true;
    case "looks":
      return native
        // eslint-disable-next-line @typescript-eslint/unbound-method -- 方法引用經包裝函數調用（this 已由 wrapper 控制），重構風險——審計批次三。
        ? safeLooks(scheme.looksLikeRoman, word)
        // eslint-disable-next-line @typescript-eslint/unbound-method -- 方法引用經包裝函數調用（this 已由 wrapper 控制），重構風險——審計批次三。
        : safeLooks(scheme.looksLikeNative, word);
    case "latin":
    default:
      // 原生方向：原生文種有專屬 Unicode 區段，looksLikeNative 可靠
      return native
        ? looksConvertible(word) || /^[0-9|]+$/.test(word)
        : // eslint-disable-next-line @typescript-eslint/unbound-method -- 方法引用經包裝函數調用（this 已由 wrapper 控制），重構風險——審計批次三。
          safeLooks(scheme.looksLikeNative, word);
  }
}

/**
 * 單個字元 / 短語的羅馬轉寫讀數（校勘異文行用）。
 * 拿不到讀數時返回 null，呼叫端應靜默不顯示，不要顯示空括號。
 *
 * 與遊標版的差別：讀數是「讓人看懂這條異文」，不是「替用戶改文」，
 * 故默認 `"latin"` 守門——藏文 Sanskrit IAST 這類方案的 looksLikeNative
 * 對單個帶符號字符同樣可靠，但混排中文時需要形狀判定擋一道。
 */
export function romanReading(
  scheme: TransliterationScheme,
  text: string,
  opts: RunOptions = { gate: "latin" },
): string | null {
  if (!text) return null;
  const t = text.trim();
  if (!t) return null;
  // 整詞先看是否過得了守門：過不了就直接退回逐詞掃描（異文行常夾空格與句讀）
  if (opts.gate !== "none" && passGate(t, scheme, false, opts.gate ?? "latin")) {
    const whole = safeConvert(scheme, t, false);
    if (whole !== null && whole !== t) return whole;
  }
  // 整詞走不通再退回逐詞掃描（長文本：保留中間的空格與標點）
  const r = transliterateLongText(t, scheme, false, opts);
  return r.converted > 0 ? r.text : null;
}

/**
 * 從多個已註冊方案中挑出「真的能轉得動這段文本」的那一個。
 * 校勘面板不知道用戶貼的是藏文還是梵文，靠轉換成功率投票決定，
 * 避免用戶手選錯方案時整段原樣返回的沉默失敗。
 *
 * @returns scheme id，全都轉不動時返回 null
 */
export function pickWorkingScheme(
  sample: string,
  schemes: { id: string; impl: TransliterationScheme }[],
  native: boolean,
  opts: RunOptions = {},
): string | null {
  let bestId: string | null = null;
  let bestScore = 0;
  for (const s of schemes) {
    try {
      const r = transliterateLongText(sample, s.impl, native, opts);
      if (r.words === 0) continue;
      const score = r.converted / r.words;
      if (score > bestScore) {
        bestScore = score;
        bestId = s.id;
      }
    } catch {
      /* 單一方案失敗不影響其餘 */
    }
  }
  return bestScore > 0 ? bestId : null;
}

// ------------------------------------------------------------------ 異文讀數

/**
 * 「值得試著轉寫」的快速篩選：文本裡至少有一個字符落在下列集合之外——
 *   ASCII / CJK 標點 / 漢字（含擴展 A、兼容表意文字）/ 全角區
 * 換言之：純中文句得到的異文（如「如」vs「是」）當場略過，不必跑 19 個方案。
 *
 * 這是**性能與誤報的雙重守門**：藏文 U+0F00、梵文 U+0900、蒙古文 U+1800、
 * 僧伽羅 U+0D80、維吾爾阿拉伯字母 U+0600、悉曇 U+11580、回鶻文 U+10F70
 * 全部落在捕獲範圍內。
 */
const TRANSLIT_WORTHY =
  // eslint-disable-next-line no-control-regex -- 字典解析/文本清洗必需的控制字符匹配（\x00 剝除/分隔符），無 ReDoS（無嵌套量詞）——審計批次三。
  /[^\u0000-\u007F\u3000-\u303F\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\uFF00-\uFFEF]/;

/** 讀數快取。異文常有重複組合（同一組字在全書反覆出現），且不以渲染次數成長。 */
const readingCache = new Map<string, VariantReading | null>();
const READING_CACHE_MAX = 512;

export interface VariantReading {
  schemeId: string;
  base: string;
  target: string;
}

/**
 * 算出一對異文的羅馬轉寫讀數。
 *
 * 這是「校勘呈現轉寫（解釋一）」的核心：藏文 ཀ 與 ཁ 的差別寫出來看不出送氣與否，
 * 轉成 ka / kha 才一目了然。方案由「轉換成功率投票」自動選，用戶不必先知道
 * 這是藏文還是梵文。
 *
 * 兩側都要拿到讀數才返回——只有一側成功通常是誤配（例如漢字碰巧被某方案改動），
 * 此時寧可不顯示，也不要給使用者一條半吊子讀數。
 *
 * @returns null = 這組異文不需要 / 拿不到讀數，呼叫端應靜默不顯示
 */
export function variantReading(base: string, target: string): VariantReading | null {
  const a = (base || "").trim();
  const b = (target || "").trim();
  if (!a || !b) return null; // 脫文 / 衍文沒有對照讀數可言
  if (a === b) return null;
  const key = `${a}\u0000${b}`;
  if (!TRANSLIT_WORTHY.test(key)) return null; // 純中文 → 與轉寫無關

  const cached = readingCache.get(key);
  if (cached !== undefined) return cached;

  const out = computeReading(a, b);
  if (readingCache.size >= READING_CACHE_MAX) readingCache.clear();
  readingCache.set(key, out);
  return out;
}

function computeReading(a: string, b: string): VariantReading | null {
  const pool = schemePool();
  if (!pool.length) return null;
  const id = pickWorkingScheme(`${a} ${b}`, pool, false);
  if (!id) return null;
  const scheme = getScheme(id);
  if (!scheme) return null;
  const rb = romanReading(scheme, a);
  const rt = romanReading(scheme, b);
  if (rb === null || rt === null) return null;
  if (rb === a && rt === b) return null; // 已經是羅馬字，讀數無意義
  return { schemeId: id, base: rb, target: rt };
}

/** 清空讀數快取（設定改變 / 面板關閉時避免長駐） */
export function clearReadingCache(): void {
  readingCache.clear();
}

// ------------------------------------------------------------------ 長文本轉寫

/**
 * 長文本轉寫的單側上限（Myers 不在這裡，但 UI 主執行緒仍要保護）。
 *
 * 20,000 → 100,000，且計量單位由「UTF-16 碼元」改為「碼點」。
 *   ① 碼元計量對 SMP 文種不公平：悉曇（U+11580–U+115FF）、阿利伽利等一字佔
 *      2 碼元，同樣 20,000 的門檻實得配額只剩 10,000 字，等於變相腰斬。
 *   ② 門檻本身過於保守：實測最慢路徑（藏文 → 羅馬）20,000 字 82ms、
 *      100,000 字 223ms（線性），距卡住 UI 主執行緒仍有量級餘裕。
 * 100,000 約當一部中型經典的一整卷，超過者多屬誤貼全文，擋下仍屬正確。
 */
export const MAX_TRANSLIT_CHARS = 100000;

/**
 * 以**碼點**計字數（非 UTF-16 碼元）。
 *
 * 為什麼不直接 `[...s].length`：那會為 100 萬字的輸入配置一個 100 萬元素的陣列，
 * 在「使用者誤貼整部大藏經」這種最需要快速擋下的場景反而最慢。這裡走單趟掃描、
 * 只跳過代理對的高半個，零配置。
 *
 * 呼叫端務必先用 `s.length` 短路（碼點數 ≤ 碼元數，`s.length <= MAX` 時必然合格），
 * 只有超長輸入才真的走這一趟。
 */
export function countTranslitChars(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    n++;
    const c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) i++; // 代理對：低半個不計
  }
  return n;
}

/** 是否超過長文本轉寫上限（先以碼元短路，避免不必要的掃描）。 */
export function isTranslitTooLong(s: string): boolean {
  return s.length > MAX_TRANSLIT_CHARS && countTranslitChars(s) > MAX_TRANSLIT_CHARS;
}

export interface TranslitRunResult {
  ok: boolean;
  text: string;
  stats: RunResult | null;
  schemeId: string;
  ms: number;
  reason?: "too-long" | "no-text" | "need-scheme" | "unknown-scheme";
}

/** 方案池：主方案排前，讓轉換率打平時由主方案勝出（非決定性，只是加一道偏好） */
function schemePool(): { id: string; impl: TransliterationScheme }[] {
  return listSchemes()
    .map((s) => ({ id: s.id, impl: s, _p: s.primary ? 0 : 1 }))
    .sort((a, b) => a._p - b._p)
    .map((s) => ({ id: s.id, impl: s.impl }));
}

/**
 * 長文本轉寫：把整份底本一次轉寫出來。
 *
 * 與上面的單詞讀數差別在這裡是真的處理上千字，故：
 *  - 先用 MAX_TRANSLIT_CHARS 守住 UI 主執行緒；
 *  - 自動識別**只在原生 → 羅馬方向可用**，理由見下；
 *  - 自動挑中時要把 id 回傳，UI 才能拿它去套正確的字體棧（否則輸出區是豆腐塊）。
 *
 * ## 為什麼「羅馬 → 原生」不能自動識別
 *
 * 這個方向本質上是有歧義的：同一串 ASCII 同時是多個方案的合法輸入。
 * 實測 `bod chos yid` 轉寫成功率在藏文 Wylie 與滿文 Möllendorff 都是 3/3 平手，
 * 投票結果取決於模組註冊順序 → 使用者想轉藏文卻拿到滿文 ᠪᠣᡩ ᠴᡥᠣᠰ ᠶᡳᡩ。
 * 這種靜默猜錯比明確失敗更糟，故一律要求使用者指定方案（reason: 'need-scheme'）。
 *
 * 反方向（原生 → 羅馬）沒有這個問題：各原生文種佔據互不重疊的 Unicode 區段，
 * 方案的 `looksLikeNative` 守門本身就是可靠的二分判定。
 *
 * 標點、換行、空格結構原樣保留——校勘要拿輸出與原文逐行對照，結構一漂移就失去意義。
 *
 * @param schemeId 空字串 = 自動識別（僅 toNative === false 時有效）
 * @param toNative true = 羅馬字 → 原生文字
 */
export function transliterateText(
  text: string,
  schemeId: string,
  toNative: boolean,
  tibAmbig?: string,
  xApprox?: string,
  agBackForm?: string,
): TranslitRunResult {
  const src = (text || "").trim();
  const bail = (reason: TranslitRunResult["reason"]) =>
    ({ ok: false, text: "", stats: null, schemeId: "", ms: 0, reason });
  if (!src) return bail("no-text");
  // 改以碼點計量（SMP 文種不再被代理對吃掉一半配額）
  if (isTranslitTooLong(src)) return bail("too-long");
  if (!schemeId && toNative) return bail("need-scheme");

  const pool = schemePool();
  let usedId = schemeId;
  if (!usedId) {
    // 先抽稀取樣投票，無須把整篇餵給 19 個方案各跑一次
    const sample = [...src].filter((_, i) => i % 37 === 0).join("").slice(0, 600);
    const picked =
      pickWorkingScheme(sample, pool, toNative) ??
      // 稀取樣沒命中不代表全文沒得轉（可能該文種在文中很稀疏），用開頭再試一次
      pickWorkingScheme(src.slice(0, 3000), pool, toNative);
    if (!picked) return { ok: true, text: src, stats: null, schemeId: "", ms: 0 };
    usedId = picked;
  }
  const scheme = getScheme(usedId);
  // B6：未知 schemeId 不再靜默「成功」（ok:true＋原樣透傳，與 need-scheme 無從
  // 區分——id 打錯 UI 零提示）。改 fail-loud：ok:false＋reason 'unknown-scheme'。
  if (!scheme) return bail("unknown-scheme");
  const t0 = Date.now();
  // 段落尾空格修復：trim 只用於判空與長度計量，轉換餵 trim 後文本＋把原文尾部的
  // 空白（空格/換行/縮排）補回——否則面板「ka ga 」尾空格被 trim 吃掉，轉出後
  // 段尾音節缺 tsheg（用戶主訴：詞尾/段落尾空格不轉 tsheg）。頭部縮進不補：
  // 行首 tsheg 非藏文正字法。
  const trailingWs = text.slice(src.length).match(/\s+$/)?.[0] ?? "";
  const stats = transliterateLongText(src + (toNative && trailingWs ? " " : trailingWs), scheme, toNative, { tibAmbig, xApprox, agBackForm });
  return { ok: true, text: stats.text, stats, schemeId: usedId, ms: Date.now() - t0 };
}
