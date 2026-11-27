## 0.3.11

### 修復

**安全加固**

- **詞條 HTML URL 清洗加固（safeUrl）**：`javascript:`/`vbscript:`/`data:text/html` 危險 scheme 的黑名單判定前先剝除控制字符與空白（C0 區）——瀏覽器解析 URL 時會剝除這些字符，舊實作「jav\tascript:」可繞過黑名單；`srcset` 屬性改為逐候選拆分各自清洗（此前整串判定，混入候選可繞過）。
- **TEI Lex-0 數字實體注入防護**：詞條解碼 `&#1;` 等數字實體時拒解 U+0001–0008（文檔解析哨兵區），實體字符串保留為字面文本。
- **分享卡片圖源縱深防禦（share）**：PNG 分享的 `<img>` 圖源統一經 `safeShareImgSrc` 清洗（decode 失敗保留原字面、限定資產目錄、失敗即丟棄不 push），三處收集點同規。
- **目錄（TOC）iframe 內容同主路徑加固**：詞條「總目錄」入口的 iframe 原始 HTML 兜底路徑補同款 sanitize＋`entry://` 鏈接 decode。

**穩定性**

- **輸出面板填充競態（queueFlatFill）**：共享 cancelled 旗標改為世代 token——關閉面板後舊填充鏈不再污染新面板。
- **懸停查詢 rAF 重試防護**：重試前快照比對查詢序列，序列已推進則放棄過期重試。
- **懸停彈窗離場定時器清理**：leaveTimer 在彈窗復用/關閉時清除，不再殘留觸發。
- **彈窗定位 watcher 生命週期**：每查詢重建 ResizeObserver（舊實作閉包持有死 anchorEl）。
- **分離彈窗上限**：脫離宿主的彈窗 FIFO 上限 5 個，超限自動回收最舊。
- **伴隨詞條去重**：attachCompanions 同 id 重複掛載修復。
- **包導入寫入路徑**：importBundle 二進位寫入改走 `vault.createBinary`/`vault.modifyBinary`（原 adapter 寫入後 vault 索引不可見，rescan 需重啟）。
- **BK-tree 建樹分幀**：大詞典模糊建議樹分幀構建（進度態 Map 管理、部分樹先搜、查詢不凍結 UI）；字典刪除/清空/失效時同步清理建樹進度。
- **詞條填充 dictId 不猜測**：fillFrame 的 keyText 兜底去除——多典同 key 時不再錯配專屬資產。
- **字典刪除快取鍵重算**：deleteDictionary 按 meta.dir＋meta.files 重算 scanCacheMap 鍵（`mdx-<folderKey>-<base>`），刪典後快取正確失效。
- **pendingFrames 去重**：basemap 建立期間同 frame 重複入列以新 HTML 頂替舊項（主題切換/重查詢不再中間態閃爍）。
- **筆記導出 catch**：noteBtn 導出鏈任一步失敗（詞條 HTML 病態、vault 故障）改為提示而非 unhandled rejection。

**轉寫引擎**

- **藏文 U+0F0C（ནམ་ལྟེབ）NFKC 保護**：0F0C 帶兼容分解 \<noBreak> 0F0B，入口 NFKC 正規化會把它吞成 tsheg；入口以 PUA 哨兵繞行保護，往返閉環。哨兵碼位同輪修正為 U+F0FF（私用區）——原 0F80 碼位與 deprecated 碼位（U+0F76–0F79）分解產物碰撞，致真 0F80 被誤還原、出向殘留 ༌。
- **撇號守門字符類擴展**：`translit-run` token 命中守門字符類補齊擴展拉丁區段（U+02B0–02FF/1E00–1EFF/2C60–2C7F，與 HAS_LATIN_LETTER 對齊）——`xṃ'a` 類詞不再被撇號切詞破碎；孤立 `a`（a-chung）路徑不受影響。
- **尾隨空白透傳收緊（G-T1 配套）**：padSpace 補償僅在尾隨空白恰為單一空格時啟用；≥2 空格/tab/換行原樣透傳。
- **`<s-ka>` 文檔鍵對齊**：出向規範為 EWTS 單字母 `<s-k>` 型，入向兼容全名形式；檢字表注釋同步。
- **i18n 插值 `$&` 注入修復**：`t()` 字符串形式替換改函數形式——文案含 `$&`/`$1` 字面時不再被替換語義展開。
- **轉寫面板異常可見（fail-loud）**：`transliterateText` 拋錯不再吞成假成功；顯式 ok:false＋reason:"exception"＋console.error＋操作失敗提示。

**判定與文種**

- **短假名句判定**：無漢字時 2 個假名即判日文（「はい」級最短寒暄此前掉進漢文兜底）；1 假名維持不判。
- **漢文簡繁抽樣判別去共享字**：HANS/HANT 抽樣串嚴格互斥（交集 11 字剔除）——共享碼位字兩側同形零證據，入表會雙計數灌水證據。
- **直排輸入框書寫規範自探**：原生→羅馬方向的自動識別模式下，輸入框按輸入文本碼位自探文種書寫規範（粘貼蒙古文/維吾爾文即時直排，不再恆橫排兜底）。
- **模式滾動同步 null 續等**：視圖模式偵測返回 null（過渡中）時繼續輪詢等待，不再誤判為「非目標模式」放棄恢復。
- **巴利語長 ṛ/ḷ 補收**：巴利分詞/密度字符類補 ṝ/Ṝ/ḹ/Ḹ——含該字母的詞不再被切碎漏計。
- **搜索框條件焦點**：重繪僅還原焦點（preventScroll），初掛載才主動搶焦點——移動端鍵盤亂彈/滾動跳動消除。

**導入與設定**

- **Windows 保留名資料夾擋截**：辭典資料夾名清洗補 CON/PRN/AUX/NUL/COM¹⁻⁹/LPT¹⁻⁹（含「保留名.副檔名」形態）——Windows 建這類資料夾直接失敗。
- **vw 設定寫入白名單**：主設定僅寫 VWSettings 五鍵——整包複製致 dict 合併鍵重複進 `vw` 命名空間（兩處並存、讀取語義漂移）。

**界面**

- **模態/面板焦點與動畫細節**：TOC 模態 entry:// decode；面板重建後焦點還原不搶捲動。

**測試基建**

- **轉寫引擎修復固化**：native-anchor-roundtrip-gate 補 15 條斷言（0F0C 哨兵保護雙向、padSpace、`<s-ka>`、i18n t()、撇號守門等）至 1,904。
- **導入流 mock vault 補齊**：`vault.createBinary`/`vault.modifyBinary` 對齊 Obsidian API（17 條導入流斷言回綠）。
- **lint 基線回位**：0 errors/32 warnings（批修新碼漂移 +4 全數消除）。

## 0.3.10

### 修復
- **摩尼文強制連字 śy/śn**：依 L2/11-123R §4.2，拉丁 `śy`/`śn` 現雙向映射至 YODH+SADHE／NUN+SADHE 連字組合（此前誤拼為 SSHIN+YODH/NUN 序列），雙向往返閉環；檢字表補兩條連字條目。
- **摩尼文專字 UD 出向斷鏈**：U+10AC8（SIGN UD）此前出向原樣透傳（入向 `<ud>` 有、出向無映射）＝檢字表條目往返不閉環；補 `SPECIAL_SEQUENCES` 反查映射後雙向閉環。
- **摩尼文學界記法別名透傳**：ẅ（w＋縮寫符，n3378 §4.2）與 ṯ（taw 記法異體，EDBMT 體例）此前入向原樣透傳；現別名入向正規化至主記法 `w<abv>`／`t`（出向主鍵不被遮蔽），EDBMT 體例語料（如 ʿspwrgʾʾrn ẅ rʾsṯʾn）可完整轉寫。
- **摩尼文分解式輸入透傳**：ṭ/ž/ẅ/ṯ/š/ś 等預組合記法的 NFD 分解式輸入（t+U+0323、z+U+030C 等）尾隨透傳組合符；入向統一 NFC 正規化後匹配（無預組合碼位的 k̇/k̈/j̈/q̇/q̈ 組合序列鍵不受影響）。

## 0.3.9

### 新增
- **面板切換動畫過渡**：辭典子分頁（查詢/歷史/書籤/管理）與頂層頁籤（辭典/轉寫）切換時內容淡入＋方向滑入（前進左滑、後退右滑，200ms）；`prefers-reduced-motion` 下自動歸零，無障礙合規。

### 修復
- **MDX 詞條加載提速**：record block LRU 解壓快取（48MB 封頂）——每次查詢每條命中（含 @@@LINK 別名跟讀每跳）不再重複整塊 zlib/lzo 解壓，同塊重複查詢 ~250 倍、別名跳轉 ~777 倍提速；大詞典多典連查的秒級卡頓消除。
- **彈窗拖拽定位走官方 API**：懸停彈窗拖拽與記憶位置的樣式設定改走 `setCssStyles`（官方審核規範 no-static-styles-assignment 合規），行為不變。

## 0.3.8

### 新增
- **移動端發音熱點覆蓋層**：Capacitor WebView 對 srcdoc iframe 內 click/touch 透傳不可靠，詞條音頻（sound://）改為宿主 DOM 熱點覆蓋層——平台無關的可靠點擊面，桌面端不受影響。
- **詞條發音兜底 ▶**：詞條 HTML 含音頻但非可點連結形態（純文字引用/變體寫法）時，行動列自動放置 ▶ 按鈕，點擊走與內嵌播放器同管線（resolveAsset→readBinary→spx 解碼→blob 播放）。
- **詞條目錄入口宿主按鈕**：詞條含 entry:// 目錄鏈接（鏈接文本含「目錄」）時在行動列提供宿主側入口（移動端 WebView 內 click 透傳不可靠的同類根治）。
- **懸停彈窗位置記憶與拖拽**：固定（pinned）狀態下拖拽移動彈窗，位置跨彈窗記憶；多彈窗同時開啟時 Esc 一鍵全收。
- **書籤卡片「複製」鈕**：與「筆記」並列，純樣式無框按鈕跟隨主題色。
- **摩尼文 Wiktionary 語料**：62 詞條雙向對照語料入測試錨。

### 修復
- **原位發音根治**：音頻連結保留原始資源路徑（data-li-snd），點擊直接走 resolveAsset→readBinary→spx 解碼→blob 播放管線，不再依賴 app:// href 正則還原 vault 路徑（Obsidian 1.14+ 對 app:// 的限制致移動端發音失效的根因）；data-li-snd 補入 sanitize 白名單。
- **發音按鈕播放回饋**：播放中顯示 ‖，結束復原 ▶。
- **行動列按鈕無框化**：li-mini-btn / li-bm-plain-btn 去背景框跟隨主題色（與無框視覺規範統一）。
- **摩尼文轉寫改進**：EDBMT-12 碑銘逐句對照（145 句級對齊），縮寫雙點「,」規範化映射 <blw>（U+10AE6）。
- **梵文引擎收編**：indic.ts/siddham.ts 獨立梵文棧撤除（462 行），梵文轉寫全量走 brahmic 通用棧，行為以既有語料門禁固化（雙向 1,876 斷言全綠）。
- **Doulos SIL 字體子集化**：woff2 306KB→186KB（-39%），按聲明的 IPA/音標區段＋IAST 拉丁擴展＋修飾字母全段保留 1,614 碼位；GSUB/GPOS/name 表完整保留（OFL 合規）；main.js 瘦身約 164KB。
- **命名統一**：蒙古文「學術拉丁」、摩尼文「學界拉丁」統一為「拉丁/Latin」（7 語言欄＋兩份 README）；README 轉寫方案補摩尼文行（17→18 套）；FONT-LICENSES 補 Noto Sans Manichaean。
- **測試基建清理**：8 個死測試/死 gate 退場（font-glyph-box、column-fill-vertical、editor-vertical 家族、clreq-em——所測場景已拆除或 mock 漂移恆紅）；.gitignore 補簡體「附录」目錄與 /fonts-subset/。

## 0.3.7

### 新增
- **摩尼文（Manichaean）轉寫方案**：U+10AC0–10AFF 全區塊（31 字母＋2 縮寫符＋5 數字＋7 標點）、`<v1>` 變體選擇子（DALETH/HE/MEM/NUN/RESH 五字母，依 UCD StandardizedVariants）、RTL 連寫 profile、檢字表；依據 L2/11-123R 並經核心規範 Ch.10 §10.5 精讀復核（連寫整形四表、ZWNJ 斷連、TATWEEL 延伸、標點語義；18.0 本區塊無碼位變更）；內嵌 Noto Sans Manichaean 字體，渲染已實證（真字形量寬＋VS-1 變體生效）。
- **舊回鶻文 gabain 記法雙向兼容**：新 style 選項 `"gabain"`（von Gabain 學術記法出向：q→q̈、ž→z̤、w→v、δ→d）與 `gabainNormalize` 入向預規範（變音符剝除還原 canonical）；canonical 默認輸出逐字不變。
- **書籤匯出 MD**：書籤面板新增「匯出 MD」按鈕——逐書籤詞即時查詢取回詞條 styled 內容（圖片 data URI 內嵌，離線可渲染），合併為單一 Markdown 寫入 `lilium/Shares/`；詞條缺失的書籤如實標記，部分匯出時提示統計。
- **懸停查詢與主面板繁簡轉換對齊**：設置 zhConvert 後懸停彈窗摘要同步轉換（此前僅主面板生效）。

### 修復
- **辭典音頻播放生命週期紀律**：單一活躍播放面——連點不同詞不再疊音（新聲音開、舊聲音停）；切詞/關閉面板自動停播並回收全部 blob URL（此前 WeakMap 不可枚舉、視圖關閉後永不回收）；播放被打斷時 ▶ 按鈕正確復原。
- **懸停彈窗正文欄夾逼**：彈窗水平位置嚴格夾進當前筆記正文欄（編輯態/閱讀態），行尾/行首詞不再壓到側欄與邊距；直排模式下換列方向側放置同樣夾逼；偵測不到容器時安全降級為原視口夾逼（行為零變化）。
- 筆記匯出（「筆記」按鈕）檔名補時間戳（`詞-YYYYMMDD-HHMMSS.md`），同詞多次匯出各存一檔不再覆蓋舊筆記。
- 詞條卡片的「↓ md」重複按鈕移除（匯出能力由「筆記」與「複製」承擔）。

### 語料與測試
- 四大語料錨門禁：VATEC（14,787 行）、UWB 回鶻語料（7,134 行，Uigurisches Wörterbuch 全量清洗）、婆羅米/僧伽羅/回鶻 native 錨；native-anchor gate 合併 1,589 案、full-range gate 6,303 案、摩尼文 36 字母往返＋VS-1＋縮寫符＋音頻會話 11 斷言。

## 0.3.6

### 修復
- 查詢快取三處修復與詞條空白防禦：①查詢快取記憶體值保留完整詞條內容（此前落盤瘦身同步污染記憶體值——同 session 快取永不命中、每次查詢全量重建，快取反成純開銷）；瘦身改在落盤序列化時執行，data.json 瘦身目標不變，重啟後讀回仍自動重建；②快取掛載不再以歷史快取存在為前提（首次安裝/新 vault 此前查詢快取整體失效）；③詞條區塊載入保險——部分移動端 WebView 對 srcdoc iframe 的 load 事件不出/遲到，資源內聯與高度跟隨全跳＝區塊內容顯示空白（圖片不內聯、高度恆 0），現 300ms 未觸發且內容已渲染即手動補跑，觀察器重入先斷舊例。
- 設定 `mddAssetBudgetMb` 真正生效（此前安慰劑——僅存不讀，現透傳到 mdd 資產抽取預算）；掃描快取清理補 `.gz`（TEI 快取此前成孤兒）＋TEI 快取落盤登記（刪辭典時一併清理）；`folders` 設定註釋與實際行為矛盾修正；TEI P5 `.p5.xml` 補入設置頁「所需檔案」格式表。
- TEI Lex-0 條目九處 eslint 豁免補行內說明（官方審核「directive 須附描述」規則；純註釋，行為零變化）。

## 0.3.5

### 修復
- 藏文轉寫保真（G-T1e）：雙 tsheg／行尾 tsheg／EOF tsheg 納入 `<ts>` 顯式 token 透傳（此前被靜默吞掉或還原成錯誤個數）；轉寫緩衝尾隨換行原樣還原（`bod\n` 此前輸出丟 `\n`），G-T1d 正字場景不回歸。
- 轉寫面板狀態列／歧義按鈕顯隱條件五處修正（方向門控布爾缺 `!` 實錘）；面板狀態由模組級單例改為每面板實例，多面板不再互相串狀態；導出 Markdown 蘭札 span 補 `&`/`<`/`>` 跳脫。
- 辭典掃描重掃時剔除已 dispose 的辭典殘留實例（防內存屍體累積）；MDX/TEI 磁盤快取加 `srcSig`（mtime:size）——源檔變更後舊快取自動棄用重建（此前永不失效）。
- TEI 缺字圖資產（gaiji）恢復：`.zip`/`.tar.gz` 分發的辭典 mdd 資產此前從容器重載路徑丟失（實測丁福保 zip 155 資產恢復）；資料夾/裸 XML 舊路徑零變化。
- 查詢結果 HTML 快取剝離大欄位（data.json 膨脹主因）；快取落盤 debounce 1.5s→10s 合併寫；TEI 快取 gzip 改 worker 異步（主執行緒數百 ms 卡頓消除）＋落盤登記（刪辭典時一併清理，此前 `.gz` 成孤兒）。
- 設定 `mddAssetBudgetMb` 真正生效（此前安慰劑——僅存不讀，現透傳到 mdd 資產抽取預算）；`folders` 設定註釋與實際行為矛盾修正。
- 詞典視圖：iframe 每幀獨立 ResizeObserver（popout 多視窗洩漏）；lazy 載入契約恢復（`dataset.filled` 守衛）；PNG 分享連點防護；音頻播放失敗靜默；搜尋重繪 O(n²)→O(n)；inline 圖片快取 FIFO→真 LRU；sanitize 必剝 `onerror` 死代碼清理。
- 引擎效能：brahmic 字表建構加 WeakMap memo（梵語系方案 native↔roman 1000 次 2,566ms→150ms）；藏文歧義比較器加 memo。轉寫長文本 10KB 實測 53ms（用戶無感，面板極限 100KB 一次性按鈕觸發不構成卡頓——性能項結案留檔）。
- TEI P5 分發慣例 `.p5.xml` 補入設置頁「所需檔案」格式表。

## 0.3.4

### 新增
- TEI Lex-0 詞典模組大幅擴展：`<re>` 相關條目（兩段式連結）、`<tr>`/`<trans>` 翻譯等價、`<choice>` 語義群（優取規範形，防校勘字並排錯誤文本）、`<oVar>`/`<pVar>` 例句內變體參照（斜體渲染）、charDecl 收錄 `<glyph>` 塊與多 mapping type 備選——雙語詞典與校勘型詞典核心元素不再拍平。
- TEI 詞典匯入格式擴展：支持 `.p5.xml` 複合副檔名（TEI P5 分發慣例）、`.zip` 包裝（PK 魔數抽最大 xml 成員）；匯入面板新增「選擇資料夾」整批匯入（TEI 詞典常以資料夾分發：xml＋gaiji 圖片＋配套；行動端不支援時按鈕自動隱藏）；副檔名說明文案同步（七語）。
- CBETA 缺字慣例兼容：charDecl 無 standard mapping 也無 graphic 時，唯一 `mapping type="normalized"` 提升為顯示文本，皆無時退回組字式（`[(牙*ㄉ)/里]` 型）渲染——實測 CBETA 淵源 DILA 詞典（正法華經詞典 3,356 條、比丘威儀法詞典等），缺字不再空拍平。
- DILA 佛學詞典裸 form 格式兼容：`<form>` 帶裸文本無 `<orth>`（丁福保/Soothill/南山律學詞典實際格式）——詞頭列與索引鍵生成補頂層純文本 form 通路；三典 3 萬餘條全部可查。
- 巴利文 GRETIL 語料門禁：2_pali pu 全 64 檔（三藏＋Milinda＋註釋，PTS/CC BY-SA 4.0）——6,073 句分層抽樣＋3,000 高頻詞；全量 20.6 萬行完整復核，真引擎 bug 0。
- 蘭札方案轉寫複製按鈕改 HTML 格式：剪貼簿同放 text/html（span 自帶 font-family Nithya Ranjana DU）與 text/plain 雙 flavor，HTML 寫入失敗退純文字不劣化；其他方案複製行為不變。

### 修復
- 藏文 tsheg 後接標點往返閉合（G-T1d）：tsheg 緊跟標點碼位時輸出 `<ts>` 顯式 token（裸空格入向被混排段規則吃掉、tsheg 永久丟失，EPUB 語料 26,085 處正字場景實錘）；後跟字母的 tsheg 維持空格（Wylie 正字慣例不變）；Ext 路徑 buf 切段致 lookahead 失效處補 tsheg 摘除輸出；`<ts>` 納入面板原子 token。
- TEI 詞典 quote 內 oVar/pVar 佔位符還原前剝除 C0 控制字元：原文含 U+0001–U+0008 時曾被誤還原為 span 破壞條目結構（質量復核實錘的注入面）。

## 0.3.3

### 新增
- 藏文原生空格顯式標註（G-T1c）：原生→拉丁方向，藏文真空格（U+0020，非 tsheg）輸出 `<sp>` 顯式 token，防止裸空格在反向轉寫時被誤轉為 tsheg；`<sp>` 入向經前置切分精確還原 U+0020，面板級完整往返閉合。拉丁端恰 1 空格→tsheg、≥2 空格原樣透傳的既有規則不變。
- 索永布文 tshek 顯式 token：比照 Zanabazar Square 先例，撤「空格↔tshek」映射（與語料 0x20 分詞慣例互撞、且 Unicode 提案 N4142 定義 tshek 僅標記藏文借詞音節尾），tshek 改用 `<ts>` 顯式 token 雙向輸入輸出，空格一律原樣透傳。
- 藏文混排段空格透傳（G-T1b）：空格與顯式 tsheg/shad 並存時，≥2 連續空格按排版間距語義原樣透傳（與純空白段一致），恰 1 個空格維持冗餘去除基線。

### 修復
- 編輯態藏文堆疊叢渲染停用：字體層排查實錘 Noto Serif Tibetan GSUB 自帶主字符上下文變體替換（uni0F51→uni0F51.2/.3），原始碼位序列單 span 排版正確且無虛線圓圈；此前的顯示補丁改寫碼位反而造成字形變體等級差異（པདྨ 與 པྡྨ 之類），整體停用（補丁短路保留，以備缺 GSUB 變體的 fallback 字體場景）。編輯態堆疊叢 widget 補 font-family（Noto Serif Tibetan），與閱讀態字形一致。
- 深度排查五項修復：藏文「?＋元音」連寫段入向還原（段首連續 halanta 標註剝離後剩段重入引擎）；蘭札映射 require 移入容錯層（辭典資料模組缺失場景不再拋錯穿透）；插件卸載後掃描復活競態（disposed 旗標，移動端後台切換可感）；測試基建三修（debounce stub 補 cancel、孤兒測試移除、CSS 掃描邊界誤傷收窄）。
- 面板長文本路徑空格契約補全：`<sp>` 標註此前僅底層函數生效、面板逐詞掃描繞過（真機實錘），現於掃描層原生→拉丁方向同步輸出。

### 界面
- 辭典設置頁選項重排：掃描快取、啟動時自動掃描辭典、延後啟動掃描三項集中至「立即掃描」按鈕之後，掃描相關設定同區可見。

## 0.3.2

### 新增
- 僧伽羅專有字母全收（n2737 SLS 1134 官方記法）：æ 元音 ඇ/ඈ（ae/aee）與 matra ැ/ෑ；prenasalized ඟ/ඦ/ඬ/ඥ（nng/ndj/nnd/jnya）；ඁ candrabindu、෴ kundaliya、ෟ/ෳ vocalic l matra；ISO 15919 備選方案同步繼承。ඳ/ඹ 不收——nd/mb 與巴利常用序列（sandi/ambaya）爭同一輸入 token，收錄必破壞既有往返。
- 婆羅米 Bhattiprolu 長 a 附標補收（U+11039，鍵 `.ā`，與 Old Tamil `.e`/`.o` 鍵體對稱）。
- ITRANS 官方同碼位多拼鍵補收（5.30 編碼表）：c/C/S/chh/shh/ksh 入向收錄（舊表漏收致官方文檔拼寫透傳）；出向維持 ch/Ch/sh/Sh/kSh 統一形，既有鍵行為零變化。
- 轉寫面板匯出 MD：蘭札方案輸出改行內 HTML span 自帶 font-family Nithya Ranjana DU，閱讀態與編輯態直顯蘭札字形（複製按鈕為純文字剪貼簿、無法攜樣式，帶樣式者為匯出 MD）。

### 修復
- 婆羅米 U+11003 正名 JIHVAMULIYA（新鍵 `~j`，與 `~h` 對稱）：原沿用 2007 舊草案 L2/07-342 誤派 avagraha（鍵 `.a`），Unicode 18.0 名表該碼位為 JIHVAMULIYA 且婆羅米區塊無 avagraha——糾錯，`.a` 鍵移除。
- 蘭札字體映射對準實際碼位：0x11D40 改 0x0900-0x097F 天城碼位（字體 cmap 實證），檢字表內聯與兜尾不再漏掛 Nithya Ranjana DU；Noto 前位命中保天城渲染零變化。
- 藏文拼式歧義（W 類）輸出高亮錯位：原全部高亮擠在輸出開頭，改為 indexOf 首現定位＋碼點座標切段，高亮落在實際歧義詞位置。

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
