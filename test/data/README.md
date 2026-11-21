# test/data 語料與審計產物

審計/測試過程中產生的權威語料與比對證據，落盤固化（2026-11-10）。

## 審計比對證據（七方案檢字表審計）
- `audit7-schemes-2026-11.json` — 梵文/巴利/維吾爾/僧伽羅/犍陀羅/八思巴/Ali Gali 499 列逐列引擎實轉比對原始結果
- `audit7b-contextual-2026-11.json` — 裸鍵敗語境化重跑（k+key／key+a 拼寫規則判定）

## 三文種權威語料（Wikipedia 條目全文掃實文 token）
- `wiki-soyombo-tokens.json` / `wiki-zanabazar-tokens.json` / `wiki-marchen-tokens.json` — 各文種 uniq token 全量（138/112/69）
- `tri-script-corpus-full.json` — 全量語料合併檔（tri-script-corpus.mjs 之 TRI_CORPUS 環境變數輸入）

## 藏文符號往返
- `tibetan-assigned-cps.json` — 0F00–0FBC 全賦值碼位清單（183 個；tibetan-symbols-gate.mjs 碼位枚舉依據）

## 蒙古文長文語料
- `mongolian-longtext-corpus.json` — 5 站 93 頁 5,501 詞長文往返語料

## 維吾爾文／梵文 IAST／itrans 語料
- `uey-corpus*.txt` — Uyghur UEY 語料 5 檔
- `iast-corpus6.txt`、`itrans-corpus.log` — 梵文 IAST 語料與 itrans 門禁紀錄

注意：語料為測試用事實性字例與自產比對結果；GRETIL/Esukhia 等外部授權大語料不入庫（見 corpus/README.md）。

## 大型對照語料（2026-11-11 落盤固化）
- `uyghur-uey-pairs.json`（4.6MB）＋`uyghur-uey-core.json.gz`（2.2MB，gzip JSON）— 維吾爾文 UEY 對照語料（10-30 蒙文/維文審計輪真值）
- `tibetan-sanskrit-pairs.json`（7.5MB）— 藏文梵咒堆疊全對照語料（梵咒「主字符下加」寫法規則的真值依據）
- `mongolian-all-words.json`（1.0MB）— 蒙古文長文往返語料（5 站 93 頁）
- `manchu-pairs.json`（77KB）— 滿文對照語料
