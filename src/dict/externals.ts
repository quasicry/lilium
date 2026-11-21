// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry
/**
 * lilium 辭典 — external source links（僅 Wiktionary）.
 *
 * 這是預先構建的 URL，用戶點擊才會在瀏覽器打開——插件本身不發網絡請求。
 */

export interface ExternalSourceLink {
  label: string;
  url: string;
  icon: string;
}

export function buildExternalSourceLinks(word: string, _lang = 'en'): ExternalSourceLink[] {
  const term = word.trim();
  if (!term) return [];
  const encoded = encodeURIComponent(term);
  // 僅保留 Wiktionary。
  const links: ExternalSourceLink[] = [
    { label: 'Wiktionary', url: `https://en.wiktionary.org/wiki/${encoded}`, icon: 'book-open' },
  ];
  return links;
}
