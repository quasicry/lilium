// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry
/**
 * 懶載入（r153 共享數據改造）：zh-convert 與 collation-chars 共用同一份
 * EXT 表（單一數據源），本檔不再內嵌 RAW JSON，直接委派 collation-chars.lazy
 * 的 loader，避免 100KB 級重複字面量。
 */
import { loadZhT2sExt, loadZhS2tExt } from './collation-chars.lazy';

export const loadZhT2s = loadZhT2sExt;
export const loadZhS2t = loadZhS2tExt;
