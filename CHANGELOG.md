## 0.3.1

### 修復
- 藏文 Wylie 彎引號透傳：手機輸入法把 ASCII 撇號寫成 `’`（mkha’/mtha’/’das）時整詞原樣透傳；入口正規化為 ASCII 撇號。
- 零寬字符/BOM 黏詞透傳：剪貼板複製文本句首黏 U+200B/U+FEFF 時首詞整詞拒轉（移動端句首 de 透傳實錘）；掃描層剝離零寬字符，詞照常轉換。

## 0.3.0

### 修復
- 八思巴文蒙古標點段三處語義正名＋補收：`<birga>` 實錘修正 1805→1800（U+1805 是 FOUR DOTS 章節之末，birga 是 U+1800）；`<mstop2>`→`<mcomma>`（U+1808 是滿文逗號）、`<mdstop>`→`<mcolon>`（U+1804 是冒號），舊鍵保留相容別名；補收 U+1800/U+1806 sophy（斷詞續行）/U+1809 mfullstop（滿文句號）；A873 candrabindu 註釋補三重對應；檢字表新增單雙卷首符互換語料學註記。
- 藏文半數字註釋筆誤修正（半九=9.5）；蒙古文 MVS 註釋補 Unicode 16.0 起分離後綴職能移回 MVS；天城檢字表新增吠陀吟誦符與 Vedic 聲調／Devanagari Extended-A 說明列。

## 0.2.17

### 修復
- 深度排查 9 條全修：①MDX/TEI-lex0 掃描快取鍵對稱（原 meta.id 與 get 鍵錯位，快取永遠 miss＋TEI 路徑髒回寫 data.json）②translit-run 字元類雙跳脫（連聲黏合錯誤上下文觸發）③active-leaf-change 事件註冊走 registerEvent（插件卸載自動解綁）④hover 彈窗固定提示走 i18n（dict.hover.pinHint 七語言，原簡中硬編碼）⑤LookupCache 接入 lookupAll 讀寫（原死功能；bookmarked 時間敏感不落快取）⑥查詢歷史命中數寫真值（原恆 0）⑦插件卸載 cancel flushCacheDebounced（防殘留寫盤）⑧hover 摘要截斷改碼位級（代理對不裂）⑨inline-suggest 擊鍵路徑改輕量 lookupCount＋快取（棄逐候選全量 lookupAll，輸入更順）。
- 閱讀態疊字下緣被吃：物理預留分檔（--li-subjoin-pad），與編輯態 fence 檔位表逐檔一致。
- Doulos SIL 接入轉寫面板輸入框/輸出框/檢字表 roman 欄字體棧（IAST 拉丁擴展 fallback 兜底）。

## 0.2.16

### 新增
- Ali Gali 同音碼位歧義點按鈕卡：轉寫後逐位置 N 選一按鈕（字形＋U+碼位 label），ḥ×4/c×3/d×3 等全組並列可選；同音異碼取樣面板選項 agBackForm（canonical/todo 專碼位優先，r50d）。

### 修復
- Ali Gali 拉丁往返全鏈修復：ḷ/ḹ/ṛ/ṝ/183D j/18AA lh 檢字表補行＋20 個單字輔音／Xh 組合反向補鍵；vocalic 反向改裸形（ᠠᠯᠢ 而非 ᠠ᠋ᠯᠢ，往返碼位級恒等）。ć/ṃ/ṅ 反向透傳缺口收口。
- 行動工具列序號圖示改造：撤圓底、字號 13px、兩位數字映射天城文數字（toDevanagariDigits fail-loud 確保數字無誤）。
- 移動端軟鍵盤白塊殘留：側欄與主區面板失焦後鍵盤位置白塊——kbOpen=false 短路閘＋focusout 延遲雙查清掃。

## 0.2.15

### 新增
- 內嵌 Doulos SIL Regular（SIL 官網字體，OFL-1.1）：詞條區塊 / 編輯器 / 閱讀器 / 分享圖片四場景渲染 IPA 音標與拼音/轉寫拉丁字元（CDP 實測通過）；授權併入 FONT-LICENSES.md §3。

### 修復
- 詞條發音圖示點擊無聲——雙根因修復：listener 死包裹＋iframe 內 addClass 原型缺失；requestUrl 拒 app:// 改 vault readBinary fallback（3d60b0b）。
- 移動端發音：iframe 內合成事件不可靠——touchend 兼容（先派 fake click 後置旗標防自吞，1d8448b/6ef8f3b）＋詞條標題列宿主 ▶ 按鈕（純三角無框、多發音檔多顆、失敗/播放完復原，ab7b7a3/a0a682c）。
- 匯出 MD 音訊改 data URI 直接內嵌——零落盤零重複（e9ba069）。

### 移除
- 撤除 Noto Serif Hebrew 內嵌（本輪裁定希伯來文種不需要；hebrew 文種註冊保留）。

## 0.2.14

### 修復
- 疊字行距整體回收 0.5 全週期定案：檔位 run=1→2.5、run≥2→n+1.5、min 行距 1.75（修復成果保留、過度放大回收）。
- 編輯態 Code fence 疊字改物理預留路線：z-index 提層對文字塊字形證偽無效，改 padding 物理預留。
- 閱讀態正文/h1–h6/pre 疊字物理預留，提層規則併入同一路線（葉塊跳過清單補 pre、註釋檔位實值 1.75）。
- 撤除官方輔助列隱藏：移動端編輯態官方輔助編輯列恢復顯示（裁定反轉，不干預官方 UI）。
- B1 uiLang 設定重載回退修復：loadSettings 淺合併回填 raw.vw（舊資料非物件跳過）。
- B4 panel 副本疊字行距檔位三文種統一：run=1→lh=2.5 與正文版裁定同步。
- B6 panel style 掛載去重：li-translit-panel-style 頁面恰一份。
- B2 羅馬出向逃逸體例統一 ⟨U+XXXX⟩（往返無損）。
- B3 蒙文區塊外 SMP 拆裂修復（孤立代理透傳）。
- sinhala ṁ 複核定案：文檔化正規化 exempt。
- eslint 生成物 js 口徑收編：ignores 收編全部生成/產物 js，裸 eslint src 口徑 parsing error 72→0。

## 0.2.13

### 修復
- 移動端軟鍵盤白塊根因修復（v7）：真機診斷鏈（幾何快照 v1→v9）實錘白塊本體＝官方通用規則 `.workspace-leaf-content .view-content{padding-bottom:max(var(--safe-area-inset-bottom),32px)}` 命中辭典面板（面板 data-type 不在官方 `padding:0` 豁免名單），而該機 native 層把 `--safe-area-inset-bottom` 動態寫成鍵盤高度——root 自帶 `padding-bottom` 與宿主 `app-container` 讓位鏈構成雙重讓位，面板內容區被吃掉一個鍵盤高度（li-body 塌陷、root 下方露白底）。修法：`.li-root.view-content` 塊向 padding 清零（`padding-bottom` 用 `!important` 對抗變數鏈，僅 `.li-root` 範圍零波及），鍵盤讓位由宿主鏈單獨完成。

### 清理
- 撤除臨時診斷命令「【診斷】鍵盤視口幾何快照」與 focusin/focusout 自動快照探針（白塊定位已完成）。

## 0.2.12

### 修復
- 移動端軟鍵盤去白塊 v3：路線改為面板自身收縮——訊號合併取大（`--keyboard-height` 與 visualViewport 差值含 offsetTop 補償），面板高度算至可視區底部寫入 `--li-kb-fit-height`（`li-kb-fit`）；不隱藏官方白底三件（白塊落在面板已讓位的空處，時序賽跑根因消除），官方輸入輔助列鍵盤開啟期間照常。80px 誤觸防護＋160px 最小面板高度兩道底線保護。CSS 端鏡像官方 `.workspace-tabs .workspace-leaf .view-content` 選擇路徑對抗官方 `height:100%` 特異性。
- 下疊字行距適配改為真加大：單層（run=1）起放 lh=2（Zanabazar/Soyombo/Marchen 三文種統一——單層下加垂串 1.5 裝不下＝吃下緣根源）；run=2→3、run=3→4 不變。編輯態 `li-sj-lh-N` 由恆 N 改 `max(N, 1.5)`，與閱讀態 `max(--li-subjoin-lh, 1.5)` 同構——兩態向行距大的同步。z-index 提層規則保留互補。

## 0.2.11

### 修復
- 移動端軟鍵盤去白塊 v2 三通道掛閘：`--keyboard-height` 單點依賴補強為 kh>0 OR visualViewport 差值 OR lilium 面板輸入 focusin 防禦閘（失焦且無訊號解除）；官方輸入輔助列動態插入時序不再漏網，編輯器場景官方輔助列照常。
- 編輯態 Code fence 內下疊字（Zanabazar/Soyombo/Marchen）下緣被逐行不透明背景切平：`.cm-line[class*="li-sj-lh"]` 提層修復。
- 閱讀態正文中下疊字下緣被相鄰塊覆蓋：`[style*="--li-subjoin-lh"]` 塊級提層鏡像修復。
- Marchen 轉寫：字體注入與疊字行距偵測範圍擴至全區塊（11CB1→11CB6，Noto Sans Marchen cmap 實測涵蓋）；script-matrix 語料補 head mark（11C70）；畸形 `+` 序列（如 `ka+i+ra`）吞 `+` 不透傳，native 文本不再殘留 ASCII 加號（出向補 `+` 分界鏡像，正字往返恆等不變）。

## 0.2.10

- 移動端軟鍵盤去白塊：鍵盤彈出期間隱藏官方白底 mobile-navbar／mobile-toolbar／spacer（`li-kb-open` 閘，kh 歸零自動恢復）；側欄 drawer 場景面板自讓位至鍵盤上緣（`li-in-drawer` ＋ `--keyboard-height`）。
- 審核修復 obsidianmd/no-static-styles-assignment（translit-panel.ts）：疊字行距檔位值改經變數管道寫入，行為零變更。

## 0.2.9

### 修復
- Zanabazar/Soyombo 疊字行距適配：顯式 SUBJOINER 單層（run=1）也向下伸出基行框——起放檔位從 run>=2 降為出現即 lh=2，與轉寫面板輸出框樣式表基準一致；正文版（閱讀器＋編輯器）與面板內嵌版同步；編輯器新增 li-sj-lh-2 檔位。雙層疊字維持 n+1 檔位（run=2→3）。
- 藏文檢字表補列 8 個裝飾/占卜符號（U+0FCE、U+0FD0–0FD4、U+0FD9、U+0FDA）：TIB_PUNCT 配碼位鍵（svasti 體例）出向 token、檢字表 8 行，雙向閉環。

## 0.2.8

### 修復
- 移動端：軟鍵盤白色遮罩塊**架構級**根因修復——lilium 自繪視覺視窗收縮
  （固定 px 高度＋translateY 補償）與宿主 `--keyboard-height` 容器縮放競態，三輪補償式
  修復均無解；改佈局零干預：`.li-root` 恆 100% 跟隨宿主容器、撤 transform 補償，
  focusin 時輸入框 scrollIntoView 保輸入位置可見；`li-vv-shrunk` 降級為覆蓋式鍵盤且
  宿主未處理時的底部 padding 提示
- 轉寫：Zanabazar 方案比照 Pandey 2014 編碼提案（L2/14-104）全面校正——
  入向 SUBJOINER 吞除擴及修飾符（ṃ/ḥ/<an>/<a-*>，消除 broken cluster）；
  出向疊字尾元音補 `+` 分界（規範形式 na+da+i）；面板掃描層補複合 token；
  檢字表補複元音（§4.4.1）與 vocalic r̥/l̥（§4.4.2）；新增 PDF 規範案例單測 9 條
- 檢字表：aligali-iast 補「音節基底（蒙古基字＋FVS1）」三列（ᠠ᠋/ᠦ/FVS1），
  覆蓋率 gate 紅燈清零

### 語料門禁
- run.mjs 118/0（新增 PDF 規範案例）、all-schemes-corpus 1,969/0、
  conjuncts1 26,994、fullrange 6,179、zana-phags 4/4

## 0.2.7

### 修復
- 移動端：辭典／轉寫面板呼出軟鍵盤時的白色遮罩塊根因修復——視覺視窗平移補償符號
  反了（向上推把收縮後底部縫加倍到 2s 且隨鍵盤上移）；改向下補償拉回貼住鍵盤頂。
  另加 rAF 合併＋120ms 落定確認（鍵盤動畫中間態不落地）與底部 16px 底色兜底
- 轉寫面板：疊字行距適配補口——自動辨識模式（未選方案）按文本碼位自探文種
  （zanabazar/soyombo/marchen/tibetan），粘貼原生文字當下即掛行距；內嵌版補藏文
  subjoined（U+0F90–0FBC）與組合符不斷鏈，與正文版同構

## 0.2.6

### 新增
- 轉寫：sinhala-pali 收編獨立長母音字母 ඒ=ē／ඕ=ō（ivowel）＋長式組合符 ේ=ē／ෝ=ō
  輸入變體；e/o 短式輸出慣例不變（僅擴輸入端表達力）

### 語料門禁
- 新增六文種語料往返門禁：蘭札體 292／悉曇體 284／婆羅米 306／維吾爾 4,448／僧伽羅 138／
  天城體 146 項往返全綠、原樣透傳 0
- 深度排查通過：30 方案邊角輸入矩陣 0 崩潰、8 方案大文本多輪收斂全穩定、
  效能 203–18,527 ch/ms

## 0.2.5

### 修復
- 辭典：詞條 iframe 內嵌字體——srcdoc iframe 是獨立文檔，主文檔 @font-face 不可見；
  現按詞條文本實際碼位以 data: URL 內聯所需文種族（普通詞條零膨脹，
  文種詞條僅注入所需族，避免每次查詢 3.2MB 全量內聯的卡頓）
- 轉寫：zanabazar/soyombo/marchen 粘貼區行距適配改用當前所選方案（粘貼原生文字
  當下即正確套用下疊字行距，不再需要先轉寫一次）
- 移動端：軟鍵盤彈出的白色遮罩與面板滑動修復——`--li-vv-offset` 反向補償
  visualViewport offsetTop 平移，面板底部貼鍵盤頂、內部滾動
- 閱讀器：閱讀模式與匯出 MD 的 code fence 內嵌字體渲染（元素級 font-family 覆蓋）

### 新功能
- 正文疊字行距適配：編輯器（.cm-line）與閱讀器（段落級）正文中的方形札那巴扎爾文、
  索永布文、瑪欽文下疊字 ≥2 個時行距隨最大連續下加字數放大（與轉寫面板同算法），
  無文種碼位的筆記經 O(n) 快篩短路、零額外 DOM 成本

### 雜項
- versions.json 修復（0.2.4 發版時寫入損壞）；font-registry 註釋目錄名更正

## 0.2.4

### 修復
- 轉寫：內嵌字體在編輯器與閱讀器正文中不再顯示豆腐塊——13 款內嵌字體族追加至
  `--font-text` 字體棧尾端，主題字體優先不變、內嵌字體作逐字元字形兜底
- 轉寫：Marchen 數字鍵補上（藏文數字 U+0F20–0F29 ↔ ASCII 0-9 雙向）
- 轉寫：Brahmi romanToNative 輔音叢集尾加成分（ṃ/ḥ/m̐）不再誤補 virama

### 轉寫引擎改進
- LATIN_SHAPE 擴區（U+02B0–02FF 修飾字母）、藏文預組字元往返正規化、
  札那巴扎爾文三項往返缺陷修復（連字號轉義、組合字符運行時構造）
- 語料門禁大幅擴充：conjuncts1（Brahmi/Kharoshthi/Marchen 26,994 項）入門禁；
  script-texts/matrix 加「轉換確實發生」透傳斷言＋雜訊清理（354 行）＋白名單固化

## 0.2.3

### 修復
- 辭典：未載入任何辭典時不再渲染空的範圍膠囊列（查詢分頁搜尋框下方曾出現一條空心長線條）
- 轉寫：札那巴扎爾文 subjoiner＋VOWEL SIGN UE（ma+sa+ta+ue 的 +ue）疊字定位修復——
  內嵌字體 Noto Sans Zanabazar Square v2.006 上游 GPOS 錨點缺陷（uni25CC class1 Y=-12），
  補丁移至疊字底部（Y=-887，scripts/patch-zanabazar-ue.py 冪等補丁），ue 正確疊附不再浮出

## 0.2.2

### 審核修復
- 動態樣式賦值改走官方 `setCssStyles` API（iframe 高度、進度條寬度、彈窗定位）
- 升版 0.2.2 重新觸發社區外掛審核（代碼層面無行為變動）

## 0.2.1

### 修復
- 藏文 Wylie：oM 連寫（oMoM/oM^）不再吞併，往返恆等（std/ext 兩方案）
- 梵文諸方案：死輔音＋後隨 anusvāra/candrabindu 不再丟 virama（iso15919/iast/hk/velthuis）
- 掃描層（面板）：\uXXXX esc token 全方案原子處理，含 esc 文本不再整體透傳
- 梵文 nukta 0959/095A/095F 出向改走 esc 標註，往返無損
- 滿文 ⟨U+XXXX⟩ 標註往返達不動點，不再自我增殖
- 辭典導入：讀檔頭失敗回 unreadable（不再靜默放行）；store.setOverride 丟設定修復
- loadSettings 降級防護（data.json 損壞不再炸 onload）；三鍵覆寫改首次遷移式
- bundled-fonts 遷移路徑 normalizePath＋exists 容錯

### 性能
- zh-convert 併入 collation-chars 共享 EXT 表：ZH_T2S/ZH_S2T 改為 EXT 別名再導出，
  消除約 100KB 重複字面量；zh-utils 多覆蓋 10 個 bp 增補字；兩表結構性同步不再漂移

### 測試
- hardening/dict-import-flow 腐化重寫（25/25、15/15）；leaf-scope-browser 改退役鎖定；translit-panel mock 修復 18/18

## 0.2.0

- 轉寫方案顯示名 i18n 補齊：全部方案補齊日文（ja）與韓文（ko）顯示名。
- 品牌與文檔文案清理：README／LICENSE／SECURITY／manifest description 更新。

# Changelog

All notable changes to this project will be documented in this file.
