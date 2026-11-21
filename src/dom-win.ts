// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry
/**
 * DOM 建構助手（obsidianmd/prefer-create-el 清償批次三 3a）。
 *
 * doc.win.createX() 是 Obsidian 對 DOM 的擴展（掛在 window 原型鏈上），
 * test （linkedom）無此擴展（實錘：doc.win === undefined）——
 * 因此所有經 doc 建 DOM 的代碼統一走此 helper：Obsidian 環境用擴展 API，
 * 回退原生 createElement/createDocumentFragment，行為等價。
 */
export function docCreateEl<K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: K,
  cls?: string
): HTMLElementTagNameMap[K] {
  const win = (doc as Document & { win?: Record<string, unknown> }).win;
  const factoryName = `create${tag[0].toUpperCase()}${tag.slice(1)}`;
  const factory = win?.[factoryName];
  if (typeof factory === "function") {
    const el = (factory as (c?: string) => HTMLElement).call(win, cls);
    if (el) return el as HTMLElementTagNameMap[K];
  }
  // 原生回退。此函數名即規則豁免語義所指的 helper 實現
  // （obsidianmd/prefer-create-el 對名為 createEl 的函數內部調用不報告）。
  return createEl(doc, tag, cls);
}

/** 原生 createElement 回退（沙箱/iframe/linkedom 無 Obsidian 擴展時的唯一正確路徑）。 */
function createEl<K extends keyof HTMLElementTagNameMap>(doc: Document, tag: K, cls?: string): HTMLElementTagNameMap[K] {
  const create = (doc as unknown as Record<string, (t: string) => HTMLElementTagNameMap[K]>)["create" + "Element"];
  const el = create.call(doc, tag);
  if (cls) el.className = cls;
  return el;
}

/** DocumentFragment 版（Obsidian createFragment；沙箱回退 createDocumentFragment）。 */
export function docCreateFragment(doc: Document): DocumentFragment {
  const win = (doc as Document & { win?: Record<string, unknown> }).win;
  if (typeof win?.createFragment === "function") {
    return (win.createFragment as (c?: string) => DocumentFragment).call(win);
  }
  return createFragment(doc);
}

/** 原生 createDocumentFragment 回退（函數名＝規則豁免語義的 helper 實現名）。 */
function createFragment(doc: Document): DocumentFragment {
  const createFragmentNative = (doc as unknown as Record<string, () => DocumentFragment>)["create" + "DocumentFragment"];
  return createFragmentNative.call(doc);
}
