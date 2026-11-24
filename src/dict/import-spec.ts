// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry
/**
 * lilium 辭典 — 辭典導入規格。
 *
 * 這是「導入辭典文件」功能的**純核心**：
 *   - 各格式的副檔名規格表（必需組 / 可選配套 / accept 字串）
 *   - 副檔名 → 格式 的判定（含複合副檔名 .lex0.xml / .tar.gz）
 *   - 內容嗅探（.mdx / TEI 可低成本確定判定）
 *   - 導入前校驗：單檔 1GB 上限、格式錯配、必需檔缺失、一次混合多格式
 *
 * 鐵律二／五：本檔**不 import obsidian**，不使用任何 Node-only API，
 * 全部邏輯可在 Node 下直接跑測試（test/dict-import.mjs）。
 * UI 層（panels.ts）只負責收集 File 物件並把結果丟給本模組裁決。
 */

export type DictFormat = 'mdict' | 'tei-lex0';

/** 全部支援的格式（順序即 UI 下拉順序）。 */
export const DICT_FORMATS: readonly DictFormat[] = ['mdict', 'tei-lex0'];

/** 單檔上限 1GB MB（硬性約束）。 */
export const MAX_DICT_FILE_BYTES = 1024 * 1024 * 1024; 

/**
 * 必需檔「組」：一組之內任一檔案存在即算滿足；組與組之間必須全部滿足。
 * 例：MDict = [.mdx]（可選 .mdd 配套）。
 */
export type RequiredGroup = readonly string[];

export interface DictFormatSpec {
  format: DictFormat;
  /** i18n key：下拉選單裡的格式名 */
  labelKey: string;
  /** i18n key：一行副檔名／配套說明 */
  hintKey: string;
  /** <input type=file accept>，同時用於拖放的初步過濾 */
  accept: string;
  /** 必需檔組；全部滿足才算一部完整辭典 */
  requiredGroups: readonly RequiredGroup[];
  /** 可選配套檔（資源／同義詞／樣式） */
  optional: readonly string[];
  /** 是否為多檔配套格式（決定導入時是否建立辭典子資料夾） */
  multi: boolean;
}

/** 內部資源資料夾名（與 loader.ts 的 ASSET_FOLDER 一致；此處為純常數，避免引入 obsidian 依賴）。 */
export const ASSET_FOLDER_NAME = '.li-assets';

/**
 * 辭典導入／匯入的根資料夾（固定為 `dictionaries`）。
 *
 * 掃描已改為全庫，不再由設定指定資料夾；導入仍需要一個落點，固定寫在這裡，
 * 避免「掃描全庫、導入卻寫進別的資料夾」這種不一致。
 */
export const DICT_IMPORT_ROOT = 'dictionaries';

export const DICT_IMPORT_SPECS: Record<DictFormat, DictFormatSpec> = {
  mdict: {
    format: 'mdict',
    labelKey: 'dict.import.fmt.mdict',
    hintKey: 'dict.import.hint.mdict',
    accept: '.mdx,.mdd',
    requiredGroups: [['.mdx']],
    optional: ['.mdd', '.css', '.js', '.ttf', '.otf', '.woff', '.woff2', '.eot'],
    multi: true,
  },
  // 模塊③：TEI Lex-0——.lex0.xml 複合副檔名避開一般 .xml 歧義。
  'tei-lex0': {
    format: 'tei-lex0',
    labelKey: 'dict.import.fmt.teiLex0',
    hintKey: 'dict.import.hint.teiLex0',
    accept: '.xml,.lex0.xml,.p5.xml,.tar.gz,.tar.xz,.tgz,.zip',
    requiredGroups: [['.lex0.xml', '.xml', '.p5.xml', '.tar.gz', '.tar.xz', '.tgz', '.zip']],
    optional: [],
    multi: false,
  },
};

/** 複合副檔名（最長匹配優先，避免 .gz 吃掉 .idx.gz）。 */
const COMPOUND_EXTS: readonly string[] = ['.lex0.xml', '.p5.xml', '.tar.gz', '.tar.xz', '.tgz'];

/**
 * 逐字剔除控制字元（C0 + DEL）。
 * 刻意不用正則：字面控制位元組會讓原始檔被工具當成二進位檔，也難以目視檢查。
 */
function stripControlChars(input: string): string {
  let out = '';
  const s = String(input ?? '');
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x20 || c === 0x7f) continue;
    out += s[i];
  }
  return out;
}

/**
 * 取副檔名（小寫）。優先匹配複合副檔名。
 * `'a.dict.dz' → '.dict.dz'`；`'a.IDX.GZ' → '.idx.gz'`；`'a' → ''`。
 */
export function normalizeExt(fileName: string): string {
  const lower = String(fileName || '').toLowerCase();
  for (const ext of COMPOUND_EXTS) {
    if (lower.endsWith(ext)) return ext;
  }
  const dot = lower.lastIndexOf('.');
  // 隱藏檔（.gitignore）不視為副檔名
  if (dot <= 0 || dot === lower.length - 1) return '';
  return lower.slice(dot);
}

/** 去掉副檔名，取「辭典基名」。'foo.dict.dz' → 'foo'。 */
export function dictBaseName(fileName: string): string {
  const raw = String(fileName || '');
  const lower = raw.toLowerCase();
  for (const ext of COMPOUND_EXTS) {
    if (lower.endsWith(ext)) return raw.slice(0, raw.length - ext.length);
  }
  const dot = raw.lastIndexOf('.');
  return dot > 0 ? raw.slice(0, dot) : raw;
}

/** 副檔名 → 格式；不屬於任何格式回 null。 */
export function extToFormat(ext: string): DictFormat | null {
  const e = String(ext || '').toLowerCase();
  if (!e) return null;
  for (const f of DICT_FORMATS) {
    if (specAcceptsExt(f, e)) return f;
  }
  return null;
}

/** 該格式是否接受此副檔名（必需組 + 可選配套）。 */
export function specAcceptsExt(format: DictFormat, ext: string): boolean {
  const spec = DICT_IMPORT_SPECS[format];
  if (!spec) return false;
  const e = String(ext || '').toLowerCase();
  if (spec.optional.includes(e)) return true;
  return spec.requiredGroups.some((g) => g.includes(e));
}

/**
 * 資料夾名清洗：導入時以詞典基名建立子資料夾，必須跨平台安全。
 *  - 去掉路徑分隔符與 Windows 保留字元（鐵律二：三端可用）
 *  - 去掉控制字元、首尾空白與點
 *  - 避免與內部資源資料夾 `.li-assets` 同名
 *  - 空結果回 'untitled'
 */
export function sanitizeDictFolderName(raw: string, maxLen = 64): string {
  // 先擋內部資源資料夾同名：後面的清洗會把前導點去掉（'.li-assets' → 'li-assets'），
  // 若放在清洗之後比對就永遠擋不到。
  if (String(raw || '').trim().toLowerCase() === ASSET_FOLDER_NAME) return 'assets-dict';
  let s = stripControlChars(String(raw || ''))
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    // 先去掉首尾的點（`...` 這類純點名稱要退化成 untitled），
    // 再折疊中間殘留的 `..`（`../../x` → `.._.._x` → `__x`），
    // 確保資料夾名在任何平台都不會被當成上層路徑。
    .replace(/^[.\s]+/, '')
    .replace(/[.\s]+$/, '')
    .replace(/\.{2,}/g, '_');
  if (!s) s = 'untitled';
  if (s.length > maxLen) s = s.slice(0, maxLen).replace(/[.\s]+$/, '') || 'untitled';
  return s;
}

/**
 * 檔名清洗：只保留最後一段（杜絕路徑穿越），去掉控制字元。
 * 拖放／檔案選擇器給的 name 理論上已是純檔名，但不同平台（尤其行動端的
 * 檔案選擇器）可能回傳帶路徑的字串，這裡一律收斂。
 */
export function safeFileName(raw: string): string {
  const s = stripControlChars(String(raw || '').replace(/^.*[\\/]/, '')).trim();
  return s && s !== '.' && s !== '..' ? s : 'unnamed';
}

// --------------------------------------------------------------- 內容嗅探

/**
 * 嗅探結果：
 *  - `DictFormat`：內容確定屬於該格式
 *  - `'other'`：內容確定**不是**任何已知格式（錯配，應拒絕）
 *  - `null`：無法判定（壓縮檔、或格式天生有歧義如 .dict.dz）→ 交由副檔名裁決
 */
export type SniffResult = DictFormat | 'other' | null;

/** 需要幾個位元組才夠嗅探。UI 層據此讀檔頭。 */
export const SNIFF_BYTES = 4096;

function decodeUtf8(head: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: false }).decode(head);
  } catch {
    return '';
  }
}


/**
 * MDict .mdx/.mdd：前 4 位元組是 big-endian 的 UTF-16LE 頭部位元組數，
 * 之後是 `Key="Value"` 形式的頭部文字（UTF-16LE）。
 */
export function sniffMdx(head: Uint8Array): SniffResult {
  if (!head || head.length < 12) return null;
  const dv = new DataView(head.buffer, head.byteOffset, head.byteLength);
  const headerLen = dv.getUint32(0, false);
  // 頭部文字至少要能塞下 `A="B"`，也不可能大到離譜
  if (headerLen < 12 || headerLen > 256 * 1024) return 'other';
  const avail = head.length - 4;
  if (avail < 16) return null; // 取樣不足，交給副檔名
  const take = Math.min(headerLen - 2, avail);
  if (take < 12) return null;
  const even = take - (take % 2);
  if (even < 12) return null;
  let text: string;
  try {
    text = new TextDecoder('utf-16le', { fatal: false }).decode(head.subarray(4, 4 + even));
  } catch {
    return null;
  }
  if (!/\w+="/ .test(text)) return 'other';
  let printable = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c === 10 || c === 13 || c === 9 || (c >= 0x20 && c <= 0x7e)) printable++;
  }
  return printable / text.length >= 0.9 ? 'mdict' : 'other';
}


/**
 * TEI Lex-0：根元素 <TEI ... type="lex-0">（或 xmlns TEI 命名空間）＋ 內含 <entry>。
 * 一般 .xml 只有在頭 4KB 內同時見到 TEI 根與 entry 才判定（歧義歸 'other' 由 checkFile 處理）。
 */
export function sniffLex0(text: string): SniffResult {
  const t = String(text || '').slice(0, 4096);
  if (!t.trim()) return null;
  const isTei = /<TEI\b[^>]*xmlns="http:\/\/www\.tei-c\.org\/ns\/1\.0"/i.test(t) || /<TEI\b[^>]*type="lex-0"/i.test(t)
    // 裸 <TEI>（無 xmlns/type）＋ teiHeader 即判 TEI（koktai.xml 實錘——
    // 條目在數萬行之外，頭 4KB 嗅不到 <entry>，不能拿 entry 當必要特徵）
    || /<TEI\b/i.test(t) && /<teiHeader\b/i.test(t);
  if (isTei && /<entry\b/i.test(t)) return 'tei-lex0';
  if (isTei) return 'tei-lex0';
  return 'other';
}


function isGzip(head: Uint8Array): boolean {
  return !!head && head.length > 2 && head[0] === 0x1f && head[1] === 0x8b;
}

/**
 * 依「副檔名 + 檔頭取樣」判定格式。
 * 只對能低成本確定的情形給結論，其餘回 null（不阻擋）。
 */
export function sniffFormat(ext: string, head: Uint8Array | null): SniffResult {
  const e = String(ext || '').toLowerCase();
  if (!head || head.length < 8) return null;
  switch (e) {
    case '.mdx':
    case '.mdd':
      return sniffMdx(head);
    case '.lex0.xml':
    case '.p5.xml':
    case '.xml':
      return sniffLex0(decodeUtf8(head));
    case '.tar.gz':
    case '.tar.xz':
    case '.tgz':
      return isGzip(head) ? null : 'other';
    case '.zip':
      // PK 魔數即放行（內容成員嗅探在 loader 層抽最大 .xml 後進行）
      return head[0] === 0x50 && head[1] === 0x4b ? null : 'other';
    default:
      return null;
  }
}

// --------------------------------------------------------------- 導入校驗

export type ImportMode = 'create' | 'supplement';

export type ImportIssueCode =
  | 'empty'
  | 'tooLarge'
  | 'unknownExt'
  | 'wrongFormat'
  | 'contentMismatch'
  | 'contentInvalid'
  | 'unreadable'
  | 'missingRequired'
  | 'mixedFormat'
  | 'noFormat';

export interface ImportIssue {
  code: ImportIssueCode;
  /** 觸發問題的檔名（部分 issue 無單一歸屬檔時為 undefined） */
  file?: string;
  /** i18n 參數 */
  params?: Record<string, string | number>;
}

export interface ImportFileRef {
  name: string;
  size: number;
  /** 檔頭取樣（最多 SNIFF_BYTES 位元組）；未提供則只做副檔名校驗 */
  head?: Uint8Array | null;
}

export interface ImportPlanFile extends ImportFileRef {
  ext: string;
}

export interface ImportPlan {
  ok: boolean;
  /** 裁定的格式；auto 失敗時為 null */
  format: DictFormat | null;
  /** 辭典基名（取必需檔／首個檔案的基名） */
  baseName: string;
  files: ImportPlanFile[];
  issues: ImportIssue[];
}

function fmtLabel(format: DictFormat): string {
  return format.toUpperCase();
}

/** 單檔校驗：回傳 null 表示通過。 */
export function checkFile(
  file: ImportFileRef,
  format: DictFormat,
  _mode: ImportMode,
): ImportIssue | null {
  const name = String(file?.name || '');
  if (!name) return { code: 'empty' };
  if (typeof file.size === 'number' && file.size > MAX_DICT_FILE_BYTES) {
    return { code: 'tooLarge', file: name, params: { name, max: '1GB' } };
  }
  const ext = normalizeExt(name);
  if (!ext) return { code: 'unknownExt', file: name, params: { name } };
  const extFmt = extToFormat(ext);
  if (!extFmt) return { code: 'unknownExt', file: name, params: { name } };
  if (extFmt !== format && !specAcceptsExt(format, ext)) {
    return { code: 'wrongFormat', file: name, params: { name, format: fmtLabel(format) } };
  }
  const sniffed = sniffFormat(ext, file.head ?? null);
  // A6：檔頭讀不到（readFileHead 失敗 → head===null）時舊實作會靜默放行——
  // 嗅探被跳過等於繞過內容校驗。改報 unreadable，由 UI（describeIssue）接住提示重選。
  if (file.head === null) return { code: 'unreadable', file: name, params: { name } };
  if (sniffed === 'other') {
    return { code: 'contentInvalid', file: name, params: { name, format: fmtLabel(format) } };
  }
  if (sniffed && sniffed !== format) {
    return { code: 'contentMismatch', file: name, params: { name, format: fmtLabel(format), actual: fmtLabel(sniffed) } };
  }
  return null;
}

/** 從一組檔案自動偵測格式；無法統一時回 null。 */
export function detectFormat(files: readonly ImportFileRef[]): DictFormat | null {
  const fmts = new Set<DictFormat>();
  let head: DictFormat | null = null;
  for (const f of files) {
    const ext = normalizeExt(f?.name || '');
    const fmt = extToFormat(ext);
    if (!fmt) continue;
    fmts.add(fmt);
    // 頭檔（必需組第一組）優先：.mdx / .lex0.xml
    const groups = DICT_IMPORT_SPECS[fmt].requiredGroups;
    if (groups.length && groups[0].includes(ext)) head = fmt;
  }
  if (fmts.size === 0) return null;
  if (fmts.size === 1) return [...fmts][0];
  if (head) return head;
  return null;
}

/**
 * 導入計畫：給定待導入檔案與目標格式（或 'auto'），回傳可否導入與全部問題。
 *
 * - `create`：必須湊齊該格式的必需檔組（一次導入一部完整辭典）
 * - `supplement`：只要求每個檔案屬於該格式（為既有辭典補錄）
 */
export function planImport(
  files: readonly ImportFileRef[],
  opts: { format?: DictFormat | 'auto'; mode?: ImportMode } = {},
): ImportPlan {
  const mode: ImportMode = opts.mode || 'create';
  const list = (files || []).filter((f) => f && String(f.name || ''));
  const issues: ImportIssue[] = [];

  if (!list.length) {
    return { ok: false, format: null, baseName: '', files: [], issues: [{ code: 'empty' }] };
  }

  const wanted = opts.format && opts.format !== 'auto' ? opts.format : null;
  let format: DictFormat | null = wanted;

  if (!format) {
    format = detectFormat(list);
    if (!format) {
      return {
        ok: false,
        format: null,
        baseName: '',
        files: [],
        issues: [{ code: wanted ? 'noFormat' : 'unknownExt', params: { name: list[0].name } }],
      };
    }
  }

  // 混合格式檢查：任兩檔分屬不同格式且都能被唯一歸類 → 拒絕
  if (mode === 'create' && !wanted) {
    const set = new Set<DictFormat>();
    for (const f of list) {
      const fm = extToFormat(normalizeExt(f.name));
      if (fm) set.add(fm);
    }
    if (set.size > 1) {
      const real = [...set];
      return {
        ok: false,
        format,
        baseName: '',
        files: [],
        issues: [{ code: 'mixedFormat', params: { formats: real.map(fmtLabel).join(' / ') } }],
      };
    }
  }

  const planned: ImportPlanFile[] = [];
  for (const f of list) {
    const ext = normalizeExt(f.name);
    planned.push({ name: f.name, size: f.size, head: f.head, ext });
    const issue = checkFile(f, format, mode);
    if (issue) issues.push(issue);
  }

  // 必需檔組檢查（僅 create 模式）
  if (mode === 'create' && !issues.length) {
    const have = new Set(planned.map((p) => p.ext));
    for (const group of DICT_IMPORT_SPECS[format].requiredGroups) {
      if (!group.some((ext) => have.has(ext))) {
        issues.push({
          code: 'missingRequired',
          params: { format: fmtLabel(format), exts: group.join(' / ') },
        });
      }
    }
  }

  // 辭典基名：優先用頭檔（必需組第一組）的基名
  const headGroup = DICT_IMPORT_SPECS[format].requiredGroups[0] || [];
  const headFile =
    planned.find((p) => headGroup.includes(p.ext)) ||
    planned.find((p) => DICT_IMPORT_SPECS[format].requiredGroups.some((g) => g.includes(p.ext))) ||
    planned[0];
  const baseName = dictBaseName(headFile ? headFile.name : '');

  return { ok: issues.length === 0, format, baseName, files: planned, issues };
}

/**
 * 目標 vault 相對路徑：`<根>/<格式>/<辭典名>/<檔名>`。
 * 分類子資料夾讓使用者能按格式瀏覽，也讓「每部辭典一個資料夾」成立多檔層級。
 */
export function targetRelPath(
  rootFolder: string,
  format: DictFormat,
  dictName: string,
  fileName: string,
): string {
  const root = String(rootFolder || '').replace(/^\/+|\/+$/g, '');
  const name = sanitizeDictFolderName(dictName);
  const file = safeFileName(fileName);
  return [root, format, name, file].filter(Boolean).join('/');
}
