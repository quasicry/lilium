# 第三方字型授權與出處（Font Licenses & Attribution）

本插件內嵌並分發以下字型。各字型之著作權歸原作者所有，依其各自授權條款使用與再分發。

> **本插件授權**：`lilium` 以 **AGPL-3.0-or-later** 發佈（見 `LICENSE`）。下列內嵌字型均為
> **SIL OFL-1.1**，該授權明確允許與 GPL／AGPL 共同使用（字型不被視為 GPL 衍生作品），故相容。

> 說明：內嵌字型以 base64 形式寫入 `src/vendor/*.generated.ts`，屬 `main.js` 發行包的一部分；
> 首次載入時落盤至 vault 隱藏字體目錄（`.obsidian/plugins/li/fonts/`）供 `@font-face` 使用。

## 1. Google Noto 系列（SIL Open Font License 1.1）

以下字型採用 **SIL Open Font License 1.1（OFL-1.1）**：可自由使用、修改、商業使用與再分發，
惟須保留著作權聲明，且不得單獨販售字型本身。

### 1.1 當前版本隨插件內嵌分發

| 字型 | 覆蓋文種 | 版權所有者 |
|---|---|---|
| Noto Sans Mongolian | 蒙古文 / 滿文 | Google LLC |
| Noto Serif Old Uyghur | 回鶻文 | Google LLC |
| Noto Serif Tibetan | 藏文 | Google LLC |
| Noto Sans Devanagari | 天城文（梵文 / 巴利文） | Google LLC |
| Noto Sans Siddham | 悉曇文 | Google LLC |
| Noto Sans Sinhala | 僧伽羅文 | Google LLC |
| Noto Naskh Arabic | 阿拉伯文 | Google LLC |
| Noto Sans Brahmi | 婆羅米文 | Google LLC |
| Noto Sans Kharoshthi | 佉盧虱吒文 | Google LLC |
| Noto Sans PhagsPa | 八思巴文 | Google LLC |
| Noto Sans Marchen | 瑪欽文 | Google LLC |
| Noto Sans Zanabazar Square | 方形札那巴扎爾文 | Google LLC |
| Noto Sans Soyombo | 索永布文 | Google LLC |
| Noto Sans Manichaean | 摩尼文 | Google LLC |

- 字型內嵌之著作權聲明（nameID 0）與授權條款（nameID 13/14）**完整保留 Noto 原始資訊**；
- 依 OFL-1.1 §1，此處如實標註其真實出處。

- 授權全文：https://scripts.sil.org/OFL
- 取得來源：https://fonts.google.com/noto

### 1.2 補位子集字型

**Lilium Sinological Dot**（3.2 KB）：以 Noto Sans（variable）instancer 實例化後 subset
僅保留 U+A78F（八思巴隔音號）單字形，family 更名為 `Lilium Sinological Dot`；OFL-1.1 §1
派生標註如實，nameID 0 著作權聲明（The Noto Project Authors）完整保留。族名未使用
OFL Reserved Font Name（"Noto"），**合規**。

**Lilium Vedic Bengali**（6.0 KB）與 **Lilium Vedic Nandinagari**（6.2 KB）：

- 出處：分別 subset 自 **Noto Sans Bengali**（Copyright 2025 The Noto Project Authors，
  github.com/notofonts/bengali）與 **Noto Sans Nandinagari**（Copyright 2022 The Noto
  Project Authors，github.com/notofonts/nandinagari），皆 SIL OFL-1.1。
- 為何存在：吠陀擴充區兩碼位依 Unicode 17 `ScriptExtensions.txt` 歸屬——
  **U+1CF7 → Beng**、**U+1CFA → Nand**，Noto Sans Devanagari（最新版實測）不含此二碼位；
  此二字型即其法定歸屬字型，為 MD 吠陀符號全覆蓋的唯一補位來源。
- 子集合規（與 Lilium Sinological Dot 同體例）：
  - cmap 僅保留目標碼位（實測各 2 glyphs）；
  - nameID 0 著作權聲明（The Noto Project Authors）與 nameID 13/14 授權資訊完整保留；
  - family 更名未使用 OFL Reserved Font Name（"Noto"），**合規**；
  - 依 OFL-1.1 §1 於本檔如實標註真實出處。
- 子集工具：fontTools subset（pyftsubset）。

## 2. Nithya Ranjana（蘭札體）

| 字型 | 是否內嵌 | 編碼 / 覆蓋文種 | 版權所有者 | 授權 |
|---|---|---|---|---|
| Nithya Ranjana **DU** | ✅ 內嵌（`NithyaRanjanaDU-Regular.otf`） | 蘭札文（Rañjanā / Lantsa），以天城碼位 U+0900–U+097F 渲染 | EkType | SIL Open Font License 1.1 |
| Nithya Ranjana **NU** | ❌ 不內嵌，隨交付包 `fonts-src/` 提供 | Newa 碼位 U+11400–U+1147F | EkType | SIL Open Font License 1.1 |

- 授權全文：https://scripts.sil.org/OFL
- 取得來源：https://github.com/EkType/Nithya-Ranjana

> **NU 版為何不內嵌**：實測兩版 cmap 完全不相交（NU 無任何天城體碼位、DU 無 Newa 字母），
> 而本插件的蘭札走天城體碼位 —— 內嵌 NU 只會每次都被 CSS 略過，白增約 0.46 MiB。
> NU 源檔仍在 `fonts-src/` 並隨交付包分發。

> **族名更正**：字體 `name` 表自報為 `Nithya Ranjana DU`（非 "Nithya Ranjana"），
> `@font-face` 依其自報族名註冊；未使用 OFL Reserved Font Name，合規。

## 3. Doulos SIL

| 字型 | 是否內嵌 | 覆蓋文種 | 版本 | 版權所有者 | 授權 |
|---|---|---|---|---|---|
| Doulos SIL **Regular** | ✅ 內嵌（`DoulosSIL-Regular.woff2`，`src/vendor/doulos-sil.generated.ts`） | 拉丁 / IPA 國際音標（U+0250–02AF、Phonetic Extensions、組合變音符等）、拼音/轉寫 | 7.000 | SIL Global | SIL Open Font License 1.1 |

- 著作權聲明：Copyright © 1994-2025 SIL Global（https://www.sil.org/）。
- 授權全文：https://openfontlicense.org ；隨下載包分發之 `OFL.txt` 與 `OFL-FAQ.txt` 條款原文
  以 SIL 官網發佈者為準。
- 取得來源：SIL 官網字體下載頁（https://www.sil.org/resources/software/fonts/doulos-sil）。
- 依 OFL-1.1 §1 如實標註真實出處；本插件未修改字體檔、未使用其 Reserved Font Names
  （"Doulos"、"SIL"）命名任何派生作品，**合規**。

## 4. 其他第三方代碼

- 本插件所有執行時邏輯均為自研（`dependencies` 為空）；構建期工具鏈（esbuild / TypeScript 等）
  僅為 `devDependencies`，不隨插件分發，其授權見各自 `package.json`。
- 蒙古文輸入法 ZCode 位置變體表移植自 **zmongol/mongol_editor_package**（MIT License，Copyright (c) 2025 Zmongol Editor Contributors）——碼位表機械提取、語義與上游一致；MIT 授權全文與聲明隨附於 `NOTICE.md`。
