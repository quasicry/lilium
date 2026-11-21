// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry

// 模擬「使用者刪除佛學資料」：任何對佛學資料模組的 require 都會在求值期拋錯。
// 測試透過 esbuild --alias 將 src/dict/data/{buddhist-chars,pali-sanskrit,ranjana}.lazy
// 重新導向本檔，從而模擬「模組不存在 / 解析失敗」的場景，驗證插件不崩潰。
throw new Error(
  "SIMULATED: Buddhist data module missing (user deleted it) — this must NOT crash the plugin.",
);
