// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry
/**
 * Chinese character conversion tables (Simplified <-> Traditional) — data
 * shared with collation-chars (single source of truth, no duplicated 100KB
 * literal). ZH_T2S/ZH_S2T are EXT-superset aliases; see collation-chars.ts
 * for provenance (OpenCC Apache-2.0 + book-proofreading bp additions MIT).
 * r153: tables unified — zh-convert keeps the view-conversion API surface,
 * collation-chars keeps variant normalization; both read the same EXT tables.
 */
import { ZH_T2S_EXT, ZH_S2T_EXT } from './collation-chars';

export const ZH_T2S: Record<string, string> = ZH_T2S_EXT;
export const ZH_S2T: Record<string, string> = ZH_S2T_EXT;
