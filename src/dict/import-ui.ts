// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry
/**
 * lilium 辭典 — 導入 UI 區塊。
 *
 * 仿照「導入字體到字體庫」的互動（拖放區 + 隱藏 file input + 按鈕），
 * 在辭典管理面板提供**明確可見**的導入入口：
 *   - 拖入檔案 或 點按鈕開本地檔案選擇器（鐵律二：三端都有可點入口）
 *   - 格式下拉選單（預設「自動偵測」）+ 覆蓋更新開關
 *   - 匯入後自動重掃
 *
 * 同一個區塊可切換成「補錄模式」——指定既有辭典的資料夾與格式，
 * 為該辭典追加它自己格式的資料檔（寫回該辭典的目錄）。
 *
 * 所有裁決（格式判定／錯配／1GB／必需檔）都在 import-spec.ts，
 * 這裡只負責收集 File、呼叫 importDictFiles、把結果翻成使用者看得懂的提示。
 */

import { liNotice } from '../ui-hig';
import { convertCbetaToLex0 } from './cbeta-convert';
import type { DictFeature } from './plugin';
import type { LiDict } from './service';
import {
  DictFormat,
  DICT_FORMATS,
  DICT_IMPORT_ROOT,
  DICT_IMPORT_SPECS,
  MAX_DICT_FILE_BYTES,
  ImportIssue,
} from './import-spec';

export interface DictImportZoneOptions {
  /** 補錄模式：指定目標資料夾（B5）。給值即鎖定格式、不顯示下拉。 */
  targetDir?: string;
  /** 補錄模式鎖定的格式 */
  fixedFormat?: DictFormat;
  /** 補錄對象的顯示名（只影響提示文案） */
  dictName?: string;
  /** 導入成功後的重繪回呼 */
  onDone?: () => void;
}

const MB = 1024 * 1024;

function fmtSize(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '?';
  if (n >= MB) return `${(n / MB).toFixed(1)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${n} B`;
}

/** 把 import-spec 的 issue 翻成在地化提示。 */
export function describeIssue(T: (k: string, v?: Record<string, string | number>) => string, issue: ImportIssue): string {
  switch (issue.code) {
    case 'empty':
      return T('dict.import.err.empty');
    case 'tooLarge':
      return T('dict.import.err.tooLarge', issue.params);
    case 'unknownExt':
      return T('dict.import.err.unknownExt', issue.params);
    case 'wrongFormat':
      return T('dict.import.err.wrongFormat', issue.params);
    case 'unreadable':
      return T('dict.import.err.unreadable', issue.params);
    case 'contentInvalid':
      return T('dict.import.err.contentInvalid', issue.params);
    case 'contentMismatch':
      return T('dict.import.err.contentMismatch', issue.params);
    case 'missingRequired':
      return T('dict.import.err.missingRequired', issue.params);
    case 'mixedFormat':
      return T('dict.import.err.mixedFormat', issue.params);
    case 'noFormat':
      return T('dict.import.err.unknownExt', issue.params);
    default:
      return T('dict.import.err.unknownExt', issue.params);
  }
}

/**
 * 建立導入區塊。
 *
 * 兩條路徑共用同一個 handleFiles：
 *  - 拖放（桌面）
 *  - `<input type=file>`（三端通用，行動端唯一可用路徑）
 */
export function buildDictImportZone(
  host: HTMLElement,
  plugin: DictFeature,
  opts: DictImportZoneOptions = {},
): HTMLElement {
  const T: (k: string, v?: Record<string, string | number>) => string = plugin.T.bind(plugin);
  const isSupplement = Boolean(opts.targetDir);

  const wrap = host.createDiv({ cls: 'li-dict-import' });
  const drop = wrap.createDiv({ cls: 'li-font-drop li-dict-drop' });

  // ── 標題列
  const titleRow = drop.createDiv({ cls: 'li-dict-import-row' });
  titleRow.createSpan({
    cls: 'li-dict-import-title',
    text: isSupplement ? T('dict.import.supplement') : T('dict.import.title'),
  });

  // ── 控制列：格式下拉 ＋ 覆蓋開關
  const ctrlRow = drop.createDiv({ cls: 'li-dict-import-row' });

  let formatSel: HTMLSelectElement | null = null;
  if (!isSupplement) {
    ctrlRow.createSpan({ cls: 'li-dict-import-label', text: T('dict.import.format') });
    formatSel = ctrlRow.createEl('select', { cls: 'dropdown li-dict-format' });
    formatSel.createEl('option', { value: 'auto', text: T('dict.import.auto') });
    for (const f of DICT_FORMATS) {
      formatSel.createEl('option', { value: f, text: T(DICT_IMPORT_SPECS[f].labelKey) });
    }
  }

  const overwriteLabel = ctrlRow.createEl('label', { cls: 'li-dict-import-check' });
  const overwriteBox = overwriteLabel.createEl('input', { type: 'checkbox' });
  overwriteBox.checked = true; // 允許覆蓋更新（預設開）
  overwriteLabel.appendText(' ' + T('dict.import.overwrite'));

  // ── 動作列：拖放提示 ＋ 選擇檔案按鈕 ＋ 導入按鈕
  const actionRow = drop.createDiv({ cls: 'li-dict-import-row' });
  actionRow.createSpan({
    cls: 'li-dict-import-drophint',
    text: T('dict.import.drop'),
  });
  const browseBtn = actionRow.createEl('button', { cls: 'li-mini-btn', text: T('dict.import.browse') });
  const runBtn = actionRow.createEl('button', { cls: 'mod-cta li-dict-import-run', text: T('dict.import.run') });
  runBtn.disabled = true;

  const fileInput = drop.createEl('input', {
    type: 'file',
    attr: { multiple: 'multiple', accept: isSupplement && opts.fixedFormat ? DICT_IMPORT_SPECS[opts.fixedFormat].accept : '' },
  });
  fileInput.addClass('li-u-hidden');

  // 資料夾整批匯入（webkitdirectory）：TEI 辭典常以資料夾分發（xml＋gaiji 圖片＋配套），
  // 整夾選取後檔案走同一 acceptFiles 通路——匯入落盤同夾、掃描靠同資料夾配套圖片通路命中。
  // 行動端不支援 webkitdirectory 時按鈕隱藏（檔案選擇仍可用）。
  const folderInput = drop.createEl('input', { type: 'file' });
  folderInput.addClass('li-u-hidden');
  folderInput.setAttribute('webkitdirectory', '');
  folderInput.setAttribute('directory', '');
  folderInput.setAttribute('multiple', '');
  const browseFolderBtn = actionRow.createEl('button', { cls: 'li-mini-btn', text: T('dict.import.browseFolder') });
  browseFolderBtn.addEventListener('click', () => folderInput.click());
  if (typeof (folderInput as unknown as { webkitdirectory?: string }).webkitdirectory !== 'string') {
    browseFolderBtn.addClass('li-u-hidden');
  }
  folderInput.addEventListener('change', () => {
    const files = Array.from(folderInput.files ?? []);
    if (files.length) acceptFiles(files);
    folderInput.value = '';
  });

  // ── 說明與狀態
  const hint = drop.createEl('p', { cls: 'setting-item-description li-dict-import-hint' });
  const status = drop.createDiv({ cls: 'li-dict-import-status' });
  const fileList = drop.createEl('ul', { cls: 'li-dict-file-list' });

  // ── CBETA 經文轉辭典（摺疊段，默認收起——不干擾普通辭典導入主流；補錄模式不顯示）
  let cbetaTeiFile: File | null = null;
  let cbetaAbort = false;
  if (!isSupplement) {
    const cbetaWrap = drop.createEl('details', { cls: 'li-dict-cbeta' });
    const cbetaSummary = cbetaWrap.createEl('summary', { cls: 'li-dict-cbeta-summary', text: T('dict.cbeta.title') });
    void cbetaSummary;
    const cbetaRow1 = cbetaWrap.createDiv({ cls: 'li-dict-import-row' });
    cbetaRow1.createSpan({ cls: 'li-dict-import-label', text: T('dict.cbeta.file') });
    const cbetaBtn = cbetaRow1.createEl('button', { cls: 'li-mini-btn', text: T('dict.import.browse') });
    const cbetaName = cbetaRow1.createSpan({ cls: 'li-dict-file-name' });
    const cbetaInput = cbetaWrap.createEl('input', { type: 'file' });
    cbetaInput.addClass('li-u-hidden');
    cbetaInput.setAttribute('accept', '.xml');
    const cbetaRow2 = cbetaWrap.createDiv({ cls: 'li-dict-import-row' });
    cbetaRow2.createSpan({ cls: 'li-dict-import-label', text: T('dict.cbeta.levels') });
    const lv1 = cbetaRow2.createEl('label', { cls: 'li-dict-import-check' });
    const lv1Box = lv1.createEl('input', { type: 'checkbox' });
    lv1Box.checked = true;
    lv1.appendText(' ' + T('dict.cbeta.level1'));
    const lv2 = cbetaRow2.createEl('label', { cls: 'li-dict-import-check' });
    const lv2Box = lv2.createEl('input', { type: 'checkbox' });
    lv2Box.checked = true;
    lv2.appendText(' ' + T('dict.cbeta.level2'));
    const lv3 = cbetaRow2.createEl('label', { cls: 'li-dict-import-check' });
    const lv3Box = lv3.createEl('input', { type: 'checkbox' });
    lv3Box.checked = false;
    lv3.appendText(' ' + T('dict.cbeta.level3'));
    const cbetaRow3 = cbetaWrap.createDiv({ cls: 'li-dict-import-row' });
    const cbetaRunBtn = cbetaRow3.createEl('button', { cls: 'li-mini-btn', text: T('dict.cbeta.run') });
    cbetaRunBtn.disabled = true;
    const cbetaCancelBtn = cbetaRow3.createEl('button', { cls: 'li-mini-btn', text: T('dict.cbeta.cancel') });
    cbetaCancelBtn.addClass('li-u-hidden');
    const cbetaStatus = cbetaWrap.createDiv({ cls: 'li-dict-import-status' });
    const cbetaSetStatus = (msg: string, isError = false): void => {
      cbetaStatus.empty();
      if (!msg) return;
      cbetaStatus.createEl('p', { cls: 'li-dict-import-msg' + (isError ? ' is-error' : ''), text: msg });
    };
    cbetaBtn.addEventListener('click', () => cbetaInput.click());
    cbetaInput.addEventListener('change', () => {
      cbetaTeiFile = Array.from(cbetaInput.files ?? [])[0] ?? null;
      cbetaInput.value = '';
      cbetaName.setText(cbetaTeiFile?.name ?? '');
      cbetaRunBtn.disabled = !cbetaTeiFile;
      cbetaSetStatus('');
    });
    cbetaRunBtn.addEventListener('click', () => {
      void (async () => {
        if (busy || !cbetaTeiFile) return;
        busy = true;
        cbetaAbort = false;
        cbetaRunBtn.disabled = true;
        cbetaCancelBtn.removeClass('li-u-hidden');
        const levels: (1 | 2 | 3)[] = [];
        if (lv1Box.checked) levels.push(1);
        if (lv2Box.checked) levels.push(2);
        if (lv3Box.checked) levels.push(3);
        if (!levels.length) levels.push(1, 2);
        try {
          const teiXml = await cbetaTeiFile.text();
          const result = await convertCbetaToLex0(teiXml, {
            levels,
            yieldFn: () => new Promise<void>((r) => window.setTimeout(r, 0)),
            onProgress: (done, total) => cbetaSetStatus(T('dict.cbeta.progress', { done, total })),
            shouldAbort: () => cbetaAbort,
          });
          if (result.aborted) {
            cbetaSetStatus(T('dict.cbeta.aborted'), true);
            return;
          }
          if (!result.entryCount) {
            cbetaSetStatus(T('dict.cbeta.err.noEntry'), true);
            return;
          }
          cbetaSetStatus(T('dict.cbeta.converted', { n: result.entryCount }));
          const dictName = result.title;
          const fname = `${dictName}.lex0.xml`;
          const lex0File = new File([new TextEncoder().encode(result.xml)], fname, { type: 'text/xml' });
          const report = await plugin.importDictFiles([lex0File], {
            format: 'tei-lex0',
            dictName,
            overwrite: overwriteBox.checked,
          });
          if (!report.ok) {
            const first = report.issues[0] ? describeIssue(T, report.issues[0]) : '';
            for (const issue of report.issues) liNotice(describeIssue(T, issue), 10000);
            cbetaSetStatus(first, true);
            return;
          }
          liNotice(T('dict.import.done', { n: report.imported.length, dir: report.targetDir }), 8000);
          cbetaSetStatus('');
          cbetaTeiFile = null;
          cbetaName.setText('');
          cbetaRunBtn.disabled = true;
          opts.onDone?.();
        } catch (e) {
          cbetaSetStatus(e instanceof Error ? e.message : String(e), true);
        } finally {
          busy = false;
          cbetaCancelBtn.addClass('li-u-hidden');
          cbetaRunBtn.disabled = !cbetaTeiFile;
        }
      })();
    });
    cbetaCancelBtn.addEventListener('click', () => {
      cbetaAbort = true;
    });
  }

  const currentFormat = (): DictFormat | 'auto' => {
    if (isSupplement) return opts.fixedFormat ?? 'auto';
    const v = formatSel?.value;
    return v && v !== 'auto' ? (v as DictFormat) : 'auto';
  };

  const syncAccept = (): void => {
    const f = currentFormat();
    fileInput.setAttribute('accept', f === 'auto' ? '' : DICT_IMPORT_SPECS[f].accept);
    if (isSupplement) {
      hint.setText(
        T('dict.import.supplementHint', {
          name: opts.dictName ?? '',
          format: (opts.fixedFormat ?? '').toUpperCase(),
          dir: opts.targetDir ?? '',
        }),
      );
    } else if (f === 'auto') {
      hint.setText(T('dict.import.hint'));
    } else {
      hint.setText(`${T(DICT_IMPORT_SPECS[f].labelKey)} — ${T(DICT_IMPORT_SPECS[f].hintKey)}（≤ 1 GB）`);
    }
  };

  let pending: File[] = [];
  let busy = false;

  const renderFiles = (): void => {
    fileList.empty();
    for (const f of pending) {
      const li = fileList.createEl('li', { cls: 'li-dict-file-item' });
      const over = f.size > MAX_DICT_FILE_BYTES;
      li.createSpan({ cls: 'li-dict-file-name', text: f.name });
      li.createSpan({
        cls: 'li-dict-file-size' + (over ? ' is-over' : ''),
        text: fmtSize(f.size) + (over ? ' ⚠' : ''),
      });
    }
    runBtn.disabled = busy || pending.length === 0;
  };

  const setStatus = (msg: string, isError = false): void => {
    status.empty();
    if (!msg) return;
    status.createEl('p', { cls: 'li-dict-import-msg' + (isError ? ' is-error' : ''), text: msg });
  };

  const acceptFiles = (files: File[]): void => {
    pending = files.filter(Boolean);
    renderFiles();
    setStatus(pending.length ? '' : T('dict.import.err.empty'), !pending.length);
  };

  const run = async (): Promise<void> => {
    if (busy || !pending.length) return;
    busy = true;
    runBtn.disabled = true;
    setStatus(T('dict.import.running'));
    try {
      const report = await plugin.importDictFiles(pending, {
        format: currentFormat(),
        overwrite: overwriteBox.checked,
        targetDir: opts.targetDir,
        dictName: opts.dictName,
      });
      if (!report.ok) {
        // 錯配 / 超限 / 缺必需檔 → 全部擋下並逐條提示
        for (const issue of report.issues) liNotice(describeIssue(T, issue), 10000);
        for (const f of report.failed) {
          liNotice(T('dict.import.err.failed', { name: f.name, err: f.error }), 10000);
        }
        const first = report.issues[0] ? describeIssue(T, report.issues[0]) : '';
        setStatus(first, true);
        return;
      }
      if (report.failed.length) {
        for (const f of report.failed) {
          liNotice(T('dict.import.err.failed', { name: f.name, err: f.error }), 10000);
        }
        liNotice(T('dict.import.partial', { n: report.imported.length, m: report.failed.length }), 8000);
      } else {
        liNotice(T('dict.import.done', { n: report.imported.length, dir: report.targetDir }), 8000);
      }
      if (report.skipped.length) {
        liNotice(T('dict.import.skipped', { n: report.skipped.length }), 6000);
      }
      pending = [];
      renderFiles();
      setStatus('');
      opts.onDone?.();
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e), true);
    } finally {
      busy = false;
      runBtn.disabled = pending.length === 0;
    }
  };

  // ── 事件接線
  browseBtn.addEventListener('click', () => fileInput.click());
  runBtn.addEventListener('click', () => void run());
  formatSel?.addEventListener('change', syncAccept);
  fileInput.addEventListener('change', () => {
    const files = Array.from(fileInput.files ?? []);
    fileInput.value = ''; // 允許重複選同一個檔
    acceptFiles(files);
  });
  drop.addEventListener('dragover', (ev: DragEvent) => {
    ev.preventDefault();
    if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'copy';
    drop.addClass('is-dragover');
  });
  drop.addEventListener('dragleave', () => drop.removeClass('is-dragover'));
  drop.addEventListener('drop', (ev: DragEvent) => {
    ev.preventDefault();
    drop.removeClass('is-dragover');
    acceptFiles(Array.from(ev.dataTransfer?.files ?? []));
  });

  syncAccept();
  renderFiles();
  return wrap;
}

/** 辭典的補錄目標資料夾：優先用載入時記下的目錄，退回「根/格式/基名」。 */
export function supplementDirOf(plugin: DictFeature, d: LiDict): string {
  if (d.meta.dir) return d.meta.dir;
  // 掃描改為全庫，導入/補錄的根目錄固定為 dictionaries（不再讀 settings.folders）
  const root = DICT_IMPORT_ROOT;
  return `${root}/${d.meta.format}/${d.meta.name}`;
}
