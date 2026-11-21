# 梵文轉寫方案 —— 測試語料與權威參考資料

本目錄存放 8 套梵文轉寫方案的**測試語料**（本引擎輸出）與**權威參考**（sanscript 輸出），
已逐條對齊並標註狀態，供日後直接取用，不必重新跑 Python 環境。

> ⚠️ **關於「權威」的審計提示**：sanscript 的 **WX / SLP1** 表自帶偏差（已實測證實：
> WX 的 ळ 作 `l̤a` 而非 `lY`、ऎ 作 `è` 而非 `eV`、nukta 漏天城體；SLP1 的 ळ्ह 作 `|a`
> 而 `|` 根本非 SLP1 字元）。故本目錄對 WX/SLP1 的分歧**不盲信 sanscript**，改以原始
> 規範（WX：Bharati/Chaitanya/Sangal 1996 附錄 B；SLP1：Scharf）為準，把 sanscript
> 的這些偏差標為 `wx-spec-deviation` / `slp1-llha`。IAST / ISO / HK / ITRANS / Velthuis /
> Kolkata 的 sanscript 表則經交叉比對證實可信。

## 檔案格式

每個 `sanskrit-<scheme>.json`：

```jsonc
{
  "scheme": "sanskrit-wx",                 // 本引擎方案 id
  "ssScheme": "wx",                        // 對應 sanscript 方案名
  "reference": "indic-transliteration (sanscript) — Python",
  "cases": [
    { "native": "कर्म", "ours": "karma", "golden": "karma", "status": "match" },
    // …
  ]
}
```

| 欄位 | 說明 |
| --- | --- |
| `native` | 天城體原生字串（NFC） |
| `ours` | 本引擎 `nativeToRoman(native)`（NFC） |
| `golden` | 權威參考 sanscript `transliterate(native,'devanagari',ssScheme)`（NFC） |
| `status` | `match`＝完全一致；其餘為已記錄的慣例差異／參考方故障（見下） |

## 語料構成

由 `test/_sanskrit-corpus.mjs` 的 `buildCorpus()` 統一生成（生成器與回歸測試同源，不漂移）：
獨立元音 / 輔音 / 輔音×matra / 輔音×尾符號 / 二合字 / 三合字 / 輔音+matra+尾符號 /
擴展字母（ळ ड़ ढ़ ऱ ऩ ऴ क़）/ avagraha / 真實偈頌 / 詞典風多音節詞，
並以「本引擎 `nativeToRoman` 完全羅馬化（無天城體殘碼）」過濾，確保只比較方案確實表達的音素。

## 規模

| 方案 | sanscript | 語料數 |
| --- | --- | --- |
| sanskrit-iast | iast | 9583 |
| sanskrit-iso15919 | iso | 11767 |
| sanskrit-hk | hk | 9583 |
| sanskrit-itrans | itrans | 10109 |
| sanskrit-velthuis | velthuis | 10109 |
| sanskrit-wx | wx | 9976 |
| sanskrit-kolkata | kolkata_v2 | 10108 |
| sanskrit-slp1 | slp1 | 10108 |
| **合計** | | **81343** |

## 已記錄的分歧（非本引擎缺陷）

| status | 筆數 | 說明 |
| --- | --- | --- |
| `iast-candrabindu` | 1551 | IAST candrabindu：sanscript 作「~」，本引擎作「ṁ」（IAST 家族慣用；嚴格 IAST 亦作 `m̐`，`~` 為 HK 體） |
| `wx-spec-deviation` | 536 | **sanscript 的 WX 表不合規**：ळ `l̤a`→`lY`（522）、ऎ `è`→`eV`（1）、avagraha `'`→`Z`（13，依 WX 原始規範） |
| `itrans-final-virama` | 5 | ITRANS 詞尾死輔音：sanscript 丟 virama，本引擎保留「.h」 |
| `slp1-llha` | 4 | SLP1 ळ्ह：sanscript 漏 h 成「|a」（`|` 非 SLP1 字元），本引擎「Lha」 |
| `sanscript-nukta` | 4 | sanscript 對 क़ 等 nukta 字**回傳天城體殘碼**（未轉寫）；本引擎輸出正規羅馬字 |

其餘 79243 條與權威參考**完全一致**。

## 如何重跑

```bash
# 1. 回歸斷言（不需 Python）——凡出現未記錄分歧即失敗
npm run test:translit-cross-reference
# 等價：node test/sanskrit-cross-reference.mjs

# 2. 重新傾倒本目錄（語料＋權威參考合併檔）
node test/sanskrit-cross-reference.mjs --store test/fixtures/sanskrit-cross
```

## 如何重新生成權威參考（需 Python 環境）

黃金檔 `../sanskrit-cross-golden.json`（`{scheme: {native: goldenRoman}}`）是回歸測試讀取的
固化參考；若要重生成（例如語料擴充後）：

```bash
# 1. 傾倒本引擎語料
node test/sanskrit-cross-corpus.mjs /tmp/crossgen

# 2. 用 sanscript 逐條生成參考（venv 需裝 indic-transliteration）
python gen_golden.py /tmp/crossgen test/fixtures/sanskrit-cross-golden.json
```

> 註：`gen_golden.py` 位於本專案外的工作目錄（`sanskrit-test/`），因 Python 依賴不進交付包；
> 交付包內已固化黃金檔，日常回歸**不需要** Python。
