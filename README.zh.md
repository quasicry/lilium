# Lilium

[English](README.md) | **繁體中文**

**為 Obsidian 設計的通用辭典與轉寫外掛**——支持梵語、巴利語、藏語、蒙古語、滿語、維吾爾語、悉曇體、八思巴字等語種的轉寫。

## 功能

### 辭典
- **格式**：MDict（`.mdx` / `.mdd`）與 TEI Lex-0（`.lex0.xml` / `.p5.xml`）——副檔名＋內容嗅探雙重判定
- **查詢**：閱讀時劃詞 hover 即時查詞、跨辭典全文檢索、模糊／前綴匹配（BK-tree）
- **樣式**：辭典 CSS 隔離在自己的包裹元素內，辭典永遠不會污染你的筆記樣式
- **管理**：拖放導入辭典（虛線框可見提示）、書籤、查詞歷史、跨條目跳轉（`entry://`、`bword://`、TEI `xr` 目標）
- **導出**：當前條目導出為 Obsidian 慣例 Markdown 筆記（ruby→注音標註、上下標慣例）

### 轉寫——17 套方案

| 文種 | 方案 |
|---|---|
| 梵文 Sanskrit | IAST |
| 巴利文 Pali | IAST |
| 蘭札體 Rañjanā | IAST |
| 藏文 Tibetan | Wylie、Wylie 擴展 |
| 滿文 Manchu | Möllendorff ↔ Unicode |
| 阿禮嘎禮 Ali-Gali | 蒙/滿借音字母 IAST |
| 維吾爾文 Uyghur | ULY ↔ UEY |
| 回鶻文 Old Uyghur | 拉丁 ↔ Unicode |
| 蒙古文 Mongolian | 學術拉丁 ↔ Unicode |
| 八思巴字 ʼPhags-pa | Poppe ↔ Unicode |
| 瑪欽文 Marchen | Wylie ↔ Unicode |
| 方形札那巴扎爾文 Zanabazar Square | Wylie 擴展 ↔ Unicode |
| 索永布文 Soyombo | Wylie 擴展 ↔ Unicode |
| 婆羅米文 Brahmi | IAST |
| 犍陀羅語 Gandhari（佉盧虱吒文） | IAST |
| 僧伽羅文 Sinhala | IAST |
| 悉曇體 Siddham | IAST |

**注意：轉寫為實驗性功能，近似映射！**

每個可見方案另有三向命令：**convert**（互轉）、**to-roman**（→羅馬字）、**to-native**（→原生文字）。
所有命令路徑均有長輸入防護閘（100,000 字元），貼上 1 MB 文本不會凍結 UI。

額外引擎：波你尼（Pāṇini）外部連聲（sandhi）IAST 合成引擎（Goldman & Sutherland／Whitney 規則）、辭典命中結果的異體字標註。

### 介面語言
繁體中文、簡體中文、English、日本語、한국어、Français、Deutsch。

## 安裝

### 協助第三方外掛瀏覽器（推薦）

推薦的安裝方式是使用 Obsidian 內建的社群外掛瀏覽器。

1. 開啟 Obsidian 設定。
2. 前往 `第三方外掛程式`（Community plugins）。
3. 點選 `瀏覽`（Browse）並搜尋 `Lilium`。
4. 安裝並啟用 `Lilium`。

### 手動安裝
1. 前往 [Releases](https://github.com/quasicry/lilium/releases/latest) 下載最新版三件套：`main.js`、`manifest.json`、`styles.css`
2. 在您的 vault 建立 `.obsidian/plugins/lilium/` 目錄，將三個檔案放入
3. 重啟 Obsidian → 設定 → 第三方外掛程式 → 已安裝外掛中啟用 `Lilium`

桌面與行動端皆可（`isDesktopOnly: false`）；構建有行動端相容檢查（禁止裸 Node require）。

## 授權

AGPL-3.0-or-later（見 [LICENSE](LICENSE)）；字體授權見 [FONT-LICENSES.md](FONT-LICENSES.md)、[NOTICE.md](NOTICE.md)。

## 作者

quasicry · [GitHub](https://github.com/quasicry) · [Buy Me a Coffee](https://buymeacoffee.com/quasicry)
