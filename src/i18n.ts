// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry
export type LangCode = "zh" | "zh-TW" | "ja" | "ko" | "en" | "fr" | "de";

export const LANGS: { code: LangCode; label: string }[] = [
  { code: "zh", label: "簡體中文" },
  { code: "zh-TW", label: "繁體中文" },
  { code: "ja", label: "日本語" },
  { code: "ko", label: "한국어" },
  { code: "en", label: "English" },
  { code: "fr", label: "Français" },
  { code: "de", label: "Deutsch" },
];

type Entry = Partial<Record<LangCode, string>>;

/**
 * 界面文案。未提供的語言自動回退到 en，再回退到 key 本身。
 * 新增文案時至少補 zh-TW 與 en 兩項。
 */
export const DICT: Record<string, Entry> = {
  "dict.audio.missing": {
    "zh": "「{word}」没有对应的发音文件",
    "zh-TW": "「{word}」沒有對應的發音檔",
    "ja": "「{word}」に対応する発音ファイルがありません",
    "ko": "'{word}'에 해당하는 발음 파일이 없습니다",
    "en": "No pronunciation file found for \"{word}\"",
    "fr": "Aucun fichier de prononciation trouvé pour « {word} »",
    "de": "Keine Aussprachedatei für \"{word}\" gefunden",
    },
  "dict.store.restored": {
    "zh": "已从备份恢复辞典数据：书签 {b} 条、历史 {h} 条、分组 {g} 组、辞典配置 {o} 项",
    "zh-TW": "已從備份恢復辭典資料：書籤 {b} 條、歷史 {h} 條、分組 {g} 組、辭典配置 {o} 項",
    "ja": "バックアップから辞書データを復元しました：しおり {b} 件、履歴 {h} 件、グループ {g} 件、辞書設定 {o} 件",
    "ko": "백업에서 사전 데이터를 복원했습니다: 책갈피 {b}개, 기록 {h}개, 그룹 {g}개, 사전 설정 {o}개",
    "en": "Restored dictionary data from backup: {b} bookmarks, {h} history entries, {g} groups, {o} dictionary settings",
    "fr": "Données du dictionnaire restaurées depuis la sauvegarde : {b} favoris, {h} entrées d'historique, {g} groupes, {o} paramètres de dictionnaire",
    "de": "Wörterbuchdaten aus dem Backup wiederhergestellt: {b} Lesezeichen, {h} Verlaufseinträge, {g} Gruppen, {o} Wörterbucheinstellungen",
    },
  "common.operationFailed": {
    "zh": "操作失败，详情见控制台（Ctrl+Shift+I）",
    "zh-TW": "操作失敗，詳情請見控制檯（Ctrl+Shift+I）",
    "ja": "操作に失敗しました。詳細はコンソールを確認してください（Ctrl+Shift+I）",
    "ko": "작업 실패. 콘솔(Ctrl+Shift+I)을 확인하세요",
    "en": "Operation failed — see console for details (Ctrl+Shift+I)",
    "fr": "Échec de l'opération — voir la console",
    "de": "Vorgang fehlgeschlagen – Details in der Konsole",
    },
  "common.cancel": {
    "zh": "取消",
    "ja": "キャンセル",
    "ko": "취소",
    "en": "Cancel",
    "fr": "Annuler",
    "de": "Abbrechen",
    "zh-TW": "取消",
    },
  "cmd.manchuMolToUni": {
    "zh": "满文：Möllendorff 转写 → Unicode",
    "ja": "満州文：Möllendorff 翻字 → Unicode",
    "ko": "만주문: Möllendorff 표기 → Unicode",
    "en": "Manchu: Möllendorff → Unicode",
    "zh-TW": "滿文：Möllendorff 轉寫 → Unicode",
    "fr": "Mandchou : Möllendorff → Unicode",
    "de": "Mandschu: Möllendorff → Unicode",
    },
  "cmd.manchuUniToMol": {
    "zh": "满文：Unicode → Möllendorff 转写",
    "ja": "満州文：Unicode → Möllendorff 翻字",
    "ko": "만주문: Unicode → Möllendorff 표기",
    "en": "Manchu: Unicode → Möllendorff",
    "zh-TW": "滿文：Unicode → Möllendorff 轉寫",
    "fr": "Mandchou : Unicode → Möllendorff",
    "de": "Mandschu: Unicode → Möllendorff",
    },
  "cmd.manchuConverted": {
    "zh": "满文已转换（落盘保存）",
    "ja": "満州文を変換しました（保存済み）",
    "ko": "만주문 변환 완료(저장됨)",
    "en": "Manchu converted (saved to file)",
    "zh-TW": "滿文已轉換（已寫入檔案）",
    "fr": "Mandchou converti (enregistré dans le fichier)",
    "de": "Mandschu konvertiert (in der Datei gespeichert)",
    },
  "cmd.manchuNoChange": {
    "zh": "未检测到可转换的满文",
    "ja": "変換可能な満州文が見つかりません",
    "ko": "변환 가능한 만주문 없음",
    "en": "No convertible Manchu detected",
    "zh-TW": "未偵測到可轉換的滿文",
    "fr": "Aucun mandchou convertible détecté",
    "de": "Kein konvertierbares Mandschu erkannt",
    },
  "cmd.translitDisabled": {
    "zh": "转写实验功能未开启：请在设置 → 多语言转写方案 中启用「启用转写方案」",
    "zh-TW": "轉寫實驗功能未開啟：請在設定 → 多語言轉寫方案 中啟用「啟用轉寫方案」",
    "ja": "転写の実験機能がオフです：設定 → 多言語転写スキーム で「転写スキームを有効化」をオンにしてください",
    "ko": "변환 실험 기능이 꺼져 있습니다: 설정 → 다언어 변환 스킴에서 '변환 스킴 사용'을 켜세요",
    "en": "Transliteration experiment is off: enable “Enable transliteration schemes” in Settings → Multi-script transliteration",
    "fr": "L'expérience de translittération est désactivée : activez « Activer les schémas de translittération » dans Paramètres → Translittération multilingue",
    "de": "Das Transliterations-Experiment ist aus: aktivieren Sie „Transliterationsschemata aktivieren“ unter Einstellungen → Mehrskript-Transliteration",
  },
  "cmd.translitConverted": {
    "zh": "已转换（落盘保存）",
    "ja": "変換しました（保存済み）",
    "ko": "변환 완료(저장됨)",
    "en": "Converted (saved to file)",
    "zh-TW": "已轉換（已寫入檔案）",
    "fr": "Converti (enregistré dans le fichier)",
    "de": "Konvertiert (in der Datei gespeichert)",
    },
  "cmd.translitNoChange": {
    "zh": "未检测到可转换的内容",
    "ja": "変換可能な内容が見つかりません",
    "ko": "변환 가능한 내용 없음",
    "en": "No convertible text detected",
    "zh-TW": "未偵測到可轉換的內容",
    "fr": "Aucun texte convertible détecté",
    "de": "Kein konvertierbarer Text erkannt",
    },
  /* 命令面板逐方案命令名：名稱跟隨介面語言——scheme 名走 {scheme} 變數
     （schemeLabel 依 uiLang 取 label），後綴用語與面板 set.translitRoman/Native 對齊。 */
  "cmd.translitConvert": {
    "zh": "{scheme}：转换",
    "zh-TW": "{scheme}：轉換",
    "ja": "{scheme}：変換",
    "ko": "{scheme}: 변환",
    "en": "{scheme}: Convert",
    "fr": "{scheme} : convertir",
    "de": "{scheme}: Konvertieren",
  },
  "cmd.translitToRoman": {
    "zh": "{scheme}：→ 拉丁文",
    "zh-TW": "{scheme}：→ 拉丁轉寫",
    "ja": "{scheme}：→ ローマ字",
    "ko": "{scheme}: → 로마자",
    "en": "{scheme}: → Romanization",
    "fr": "{scheme} : → romanisation",
    "de": "{scheme}: → Romanisierung",
  },
  "cmd.translitToNative": {
    "zh": "{scheme}：→ 原文字",
    "zh-TW": "{scheme}：→ 原生文字",
    "ja": "{scheme}：→ 原文字",
    "ko": "{scheme}: → 원문자",
    "en": "{scheme}: → Native",
    "fr": "{scheme} : → écriture native",
    "de": "{scheme}: → Originalschrift",
  },

  /* 註：字距 / 首行縮排 / 每列字數 / 標點居中 沿用既有 set.letterGap、set.indent、
     set.charsPerColumn、set.centerPunctuation 鍵 —— 側欄與設定頁共用同一份文案，
     避免兩處各寫一份而後漂移。 */
  "set.nav.dict": {
    "zh": "辞典",
    "ja": "辞書",
    "ko": "사전",
    "en": "Dictionary",
    "fr": "Dictionnaire",
    "de": "Wörterbuch",
    "zh-TW": "辭典",
    },
  "set.dictNotLoaded": {
    "zh": "辞典模块未加载",
    "ja": "辞書モジュール未読込",
    "ko": "사전 모듈 미로딩",
    "en": "Dictionary module not loaded",
    "fr": "Module dictionnaire non chargé",
    "de": "Wörterbuchmodul nicht geladen",
    "zh-TW": "辭典模組未載入",
    },
  "dict.onboard.empty": {
    "zh": "尚未加载任何辞典——把 .mdx/.lex0.xml 等辞典文件放进「辞典文件夹」（设置 → 辞典；留空＝扫描整个仓库），或打开设置添加来源后即可查词。",
    "ja": "辞書が未読込です——.mdx／.lex0.xml などの辞書ファイルを「辞書フォルダー」（設定 → 辞書。空欄＝保管庫全体を走査）に置くか、設定でソースを追加すると検索できます。",
    "ko": "사전이 없습니다——.mdx/.lex0.xml 등 사전 파일을 '사전 폴더'(설정 → 사전; 비움＝전체 보관함 스캔)에 넣거나 설정에서 소스를 추가하면 조회할 수 있습니다.",
    "en": "No dictionaries loaded yet — put .mdx/.lex0.xml files into the “Dictionary folder” (Settings → Dictionary; empty ＝ whole vault), or open settings to add sources, then look up words here.",
    "fr": "Aucun dictionnaire chargé — placez des fichiers .mdx/.lex0.xml dans le « Dossier de dictionnaires » (Réglages → Dictionnaire ; vide ＝ tout le coffre), ou ajoutez des sources dans les réglages pour lancer des recherches.",
    "de": "Noch keine Wörterbücher geladen — .mdx/.lex0.xml-Dateien in den „Wörterbuchordner“ legen (Einstellungen → Wörterbuch; leer ＝ gesamter Vault) oder in den Einstellungen Quellen hinzufügen, dann hier nachschlagen.",
    "zh-TW": "尚未載入任何辭典——把 .mdx/.lex0.xml 等辭典檔放進「辭典檔案夾」（設定 → 辭典；留空＝掃描整個倉庫），或打開設定新增來源後即可查詞。",
    },
  "dict.onboard.add": {
    "zh": "打开辞典设置",
    "ja": "辞書設定を開く",
    "ko": "사전 설정 열기",
    "en": "Open dictionary settings",
    "fr": "Ouvrir les réglages du dictionnaire",
    "de": "Wörterbuch-Einstellungen öffnen",
    "zh-TW": "打開辭典設定",
    },
  "set.reset": {
    "zh": "重置",
    "ja": "リセット",
    "ko": "초기화",
    "en": "Reset",
    "fr": "Réinitialiser",
    "de": "Zurücksetzen",
    "zh-TW": "重置",
    },
  "set.reset.confirm": {
    "zh": "将所有设置还原为默认？书签／历史／语料与已加载辞典不受影响；辞典文件夹会重置为默认，需重新扫描。此操作不可复原。",
    "ja": "すべての設定を既定に戻しますか？しおり・履歴・コーパスと読込済み辞書は影響しません。辞書フォルダは既定に戻るため再スキャンが必要です。この操作は元に戻せません。",
    "ko": "모든 설정을 기본값으로 되돌릴까요? 책갈피·역사·코퍼스와 불러온 사전은 영향을 받지 않습니다. 사전 폴더는 기본값으로 초기화되어 다시 스캔이 필요합니다. 이 작업은 되돌릴 수 없습니다.",
    "en": "Restore all settings to defaults? Bookmarks, history, corpus and loaded dictionaries are unaffected; dictionary folders reset to default and a rescan is required. This cannot be undone.",
    "fr": "Restaurer tous les réglages par défaut ? Marque-pages, historique, corpus et dictionnaires chargés ne sont pas affectés ; les dossiers de dictionnaires reviennent aux valeurs par défaut (rescan requis). Action irréversible.",
    "de": "Alle Einstellungen auf Standardwerte zurücksetzen? Lesezeichen, Verlauf, Korpus und geladene Wörterbücher bleiben unberührt; Wörterbuch-Ordner werden zurückgesetzt (erneuter Scan nötig). Dies kann nicht rückgängig gemacht werden.",
    "zh-TW": "將所有設定還原為預設？書籤／歷史／語料與已載入辭典不受影響；辭典資料夾會重置為預設，需重新掃描。此操作不可復原。",
    },
  "set.reset.done": {
    "zh": "已还原为默认设置",
    "ja": "設定を既定に戻しました",
    "ko": "설정이 기본값으로 복원되었습니다",
    "en": "Settings restored to defaults",
    "fr": "Réglages restaurés par défaut",
    "de": "Einstellungen auf Standardwerte zurückgesetzt",
    "zh-TW": "已還原為預設設定",
    },
  "set.feedback.open": {
    "zh": "反馈",
    "zh-TW": "反饋",
    "ja": "フィードバック",
    "ko": "피드백",
    "en": "Feedback",
    "fr": "Retour",
    "de": "Feedback",
    },
  "set.sponsorship.open": {
    "zh": "赞助",
    "zh-TW": "贊助",
    "ja": "スポンサー",
    "ko": "후원",
    "en": "Sponsor",
    "fr": "Parrainer",
    "de": "Sponsoring",
    },
  "set.lang": {
    "zh": "界面语言",
    "zh-TW": "介面語言",
    "ja": "表示言語",
    "ko": "표시 언어",
    "en": "UI language",
    "fr": "Langue de l'interface",
    "de": "Oberflächensprache",
    },
  "set.lang.desc": {
    "zh": "插件菜单与设置面板的语言。",
    "zh-TW": "外掛選單與設定面板的語言。",
    "ja": "プラグイン UI の言語です。",
    "ko": "플러그인 메뉴와 설정 패널의 언어입니다.",
    "en": "Language for the plugin UI.",
    "fr": "Langue des menus et panneaux.",
    "de": "Sprache für Plugin-Menüs und Einstellungen.",
    },
  "set.lang.auto": {
    "zh": "自动（跟随 Obsidian）",
    "zh-TW": "自動（跟隨 Obsidian）",
    "ja": "自動（Obsidian に従う）",
    "ko": "자동 (Obsidian 따르기)",
    "en": "Auto (follow Obsidian)",
    "fr": "Auto (suivre Obsidian)",
    "de": "Automatisch (Obsidian folgen)",
    },
  /* 直排字體健全性審計提醒文案 */
  /* 直排字體自動防護——剔除通知＋開關文案 */
  // LI-TS-301：開關語義糾偏。此前「標點擠壓」開啓時發的是
  // text-spacing-trim: space-all，而 space-all ＝保留全部字身空間＝**不**擠壓，
  // 名實相反。現在開啓＝真的擠壓，關閉（預設）＝保留全角標點的完整字身空間。
  // LI-TS-102·104：CLReq「不可調整」規則的最小渲染接線（灰度導入，默認關）。
  // 資料層（vertical-punct.ts）早已備妥三件事——不可調整判定、固定 em 寬、
  // 禁止位移——但一直沒有人消費；本開關就是那條消費端。
  // 地區集群：標點地區選擇（與 zhHansCornerQuote 解耦）。
  // LI-TS-601：OpenType 特性開關最小集。
  // halt（橫排）/ vhal（直排）共用一個開關：LI-TS-601 的表格裡兩者分屬不同軸，
  // 讓使用者自己記「直排要換開另一個」只會關錯一個；lnum / tnum 是灰度導入的
  // 數字形態開關。三者默認關（＝沿用字形與版面）。
  // 不宜直排降級。
  // 留下來的版式慣例，不是 lilium 發明的。默認關（灰度導入）。
  /* 直排記法速查（設置頁）——記法符號在這裡向使用者明示。
     選符準則見 src/annotate.ts「記法符號」區註（NFKC 不落 ASCII ＋ 不在標點包裹集）。 */
  //「舊記法已停用」設定頁說明已撤（速查表只列現行記法）——
  // set.notation.deprecated / .desc 兩鍵保留在 i18n（TS 類型為全量鍵集，
  // 刪鍵會牽動 TranslationKey 推導），僅 UI 不再引用。

  /* Electron 靜默管線不可用時的「叫系統面板」提示 */
  "rdr.openInMain": {
    "zh": "在主区打开",
    "zh-TW": "在主區打開",
    "ja": "メイン領域で開く",
    "ko": "메인 영역에서 열기",
    "en": "Open in main area",
    "fr": "Ouvrir dans la zone principale",
    "de": "Im Hauptbereich öffnen",
    },
  /* ---- 閱讀器工具列：書寫方向三態 + 頁面佈局三態 ---- */
  /* ---- 行序（右起／左起／自动） ---- */
  /* ---- 設置頁「閱讀」分區 ---- */
  
  "set.translitTable": {
    "zh": "检字表",
    "zh-TW": "檢字表",
    "ja": "文字表",
    "ko": "문자표",
    "en": "Char table",
    "fr": "Table des caractères",
    "de": "Zeichentabelle",
  },
  "set.translitTableScheme": {
    "zh": "方案",
    "zh-TW": "方案",
    "ja": "方式",
    "ko": "방식",
    "en": "Scheme",
    "fr": "Schéma",
    "de": "Schema",
  },
  "set.translitTableEmpty": {
    "zh": "此方案暂无检字表",
    "zh-TW": "此方案暫無檢字表",
    "ja": "この方式に文字表はありません",
    "ko": "이 방식에는 문자표가 없습니다",
    "en": "No char table for this scheme",
    "fr": "Pas de table pour ce schéma",
    "de": "Keine Tabelle für dieses Schema",
  },
  "set.translitAlt": {
    "zh": "备选",
    "zh-TW": "備選",
    "ja": "別表記",
    "ko": "대체",
    "en": "Alternative",
    "fr": "Variante",
    "de": "Variante",
  },
  "set.translitNative": {
    "zh": "原文字",
    "zh-TW": "原生文字",
    "ja": "原文字",
    "ko": "원문자",
    "en": "Native",
    "fr": "Écriture native",
    "de": "Originalschrift",
  },
  "set.translitRoman": {
    "zh": "拉丁文",
    "zh-TW": "拉丁轉寫",
    "ja": "ローマ字",
    "ko": "로마자",
    "en": "Romanization",
    "fr": "Romanisation",
    "de": "Romanisierung",
  },
  "set.translitNote": {
    "zh": "备注",
    "zh-TW": "備註",
    "ja": "備考",
    "ko": "비고",
    "en": "Note",
    "fr": "Remarque",
    "de": "Hinweis",
  },
  "set.translitSection.vowel": {
    "zh": "元音",
    "zh-TW": "元音",
    "ja": "母音",
    "ko": "모음",
    "en": "Vowels",
    "fr": "Voyelles",
    "de": "Vokale",
  },
  "set.translitSection.consonant": {
    "zh": "辅音",
    "zh-TW": "輔音",
    "ja": "子音",
    "ko": "자음",
    "en": "Consonants",
    "fr": "Consonnes",
    "de": "Konsonanten",
  },
  "set.translitSection.symbol": {
    "zh": "符号",
    "zh-TW": "符號",
    "ja": "記号",
    "ko": "기호",
    "en": "Symbols",
    "fr": "Symboles",
    "de": "Symbole",
  },
  "set.translitSection.digit": {
    "zh": "数字",
    "zh-TW": "數字",
    "ja": "数字",
    "ko": "숫자",
    "en": "Digits",
    "fr": "Chiffres",
    "de": "Ziffern",
  },
  "set.translitSection.punct": {
    "zh": "标点",
    "zh-TW": "標點",
    "ja": "句読点",
    "ko": "문장 부호",
    "en": "Punctuation",
    "fr": "Ponctuation",
    "de": "Satzzeichen",
  },
  "set.translitSection.spelling": {
    "zh": "拼写规则",
    "zh-TW": "拼寫規則",
    "ja": "綴り規則",
    "ko": "철자 규칙",
    "en": "Spelling rules",
    "fr": "Règles d'orthographe",
    "de": "Rechtschreibregeln",
  },
  "set.translitOther": {
    "zh": "其他",
    "zh-TW": "其他",
    "ja": "その他",
    "ko": "기타",
    "en": "Other",
    "fr": "Autre",
    "de": "Sonstiges",
  },
  "set.translitGroup.tibetan": {
    "zh": "藏文",
    "zh-TW": "藏文",
    "ja": "Tibetan",
    "ko": "Tibetan",
    "en": "Tibetan",
    "fr": "Tibetan",
    "de": "Tibetan",
  },
  "set.translitGroup.sanskrit": {
    "zh": "梵文",
    "zh-TW": "梵文",
    "ja": "Sanskrit",
    "ko": "Sanskrit",
    "en": "Sanskrit",
    "fr": "Sanskrit",
    "de": "Sanskrit",
  },
  "set.translitGroup.ranjana": {
    "zh": "兰札体",
    "zh-TW": "蘭札體",
    "ja": "ランジャー体",
    "ko": "란자체",
    "en": "Lantsa / Rañjanā",
    "fr": "Rañjanā",
    "de": "Rañjanā",
  },

  "set.translitGroup.pali": {
    "zh": "巴利文",
    "zh-TW": "巴利文",
    "ja": "Pali",
    "ko": "Pali",
    "en": "Pali",
    "fr": "Pali",
    "de": "Pali",
  },
  "set.translitGroup.uyghur": {
    "zh": "维吾尔文",
    "zh-TW": "維吾爾文",
    "ja": "Uyghur",
    "ko": "Uyghur",
    "en": "Uyghur",
    "fr": "Uyghur",
    "de": "Uyghur",
  },
  "set.translitGroup.aligali": {
    "zh": "Ali Gali",
    "zh-TW": "Ali Gali",
    "ja": "Ali Gali",
    "ko": "Ali Gali",
    "en": "Ali Gali",
    "fr": "Ali Gali",
    "de": "Ali Gali",
  },
  "set.translitGroup.mongolian": {
    "zh": "蒙古文",
    "zh-TW": "蒙古文",
    "ja": "Mongolian",
    "ko": "Mongolian",
    "en": "Mongolian",
    "fr": "Mongolian",
    "de": "Mongolian",
  },
  "set.translitGroup.manchu": {
    "zh": "满文",
    "zh-TW": "滿文",
    "ja": "Manchu",
    "ko": "Manchu",
    "en": "Manchu",
    "fr": "Manchu",
    "de": "Manchu",
  },
  "set.translitGroup.sinhala": {
    "zh": "僧伽罗文",
    "zh-TW": "僧伽羅文",
    "ja": "Sinhala",
    "ko": "Sinhala",
    "en": "Sinhala",
    "fr": "Sinhala",
    "de": "Sinhala",
  },
  "set.translitGroup.siddham": {
    "zh": "悉昙体",
    "zh-TW": "悉曇體",
    "ja": "悉曇体",
    "ko": "Siddham",
    "en": "Siddham",
    "fr": "Siddham",
    "de": "Siddham",
  },

  "set.translitGroup.brahmi": {
    "zh": "婆罗米文",
    "zh-TW": "婆羅米文",
    "ja": "ブラーフミー文字",
    "ko": "브라흐미 문자",
    "en": "Brahmi",
    "fr": "Brahmi",
    "de": "Brahmi",
  },
  "set.translitGroup.phagspa": {
    "zh": "八思巴文",
    "zh-TW": "八思巴文",
    "ja": "パスパ文字",
    "ko": "파스파 문자",
    "en": "'Phags-pa",
    "fr": "'Phags-pa",
    "de": "'Phags-pa",
  },

  "set.translitGroup.kharoshthi": {
    "zh": "佉卢虱吒文",
    "zh-TW": "佉盧虱吒文",
    "ja": "ハロースティー文字",
    "ko": "카로슈티 문자",
    "en": "Kharoshthi",
    "fr": "Kharoshthi",
    "de": "Kharoshthi",
  },

  "dict.tab.lookup": {
    "zh": "查询",
    "zh-TW": "查詢",
    "en": "Lookup",
    "ja": "検索",
    "ko": "검색",
    "fr": "Recherche",
    "de": "Suche"
  },
  "dict.tab.bookmarks": {
    "zh": "书签",
    "zh-TW": "書籤",
    "en": "Bookmarks",
    "ja": "ブックマーク",
    "ko": "북마크",
    "fr": "Favoris",
    "de": "Lesezeichen"
  },
  "dict.tab.history": {
    "zh": "历史",
    "zh-TW": "歷史",
    "en": "History",
    "ja": "履歴",
    "ko": "기록",
    "fr": "Historique",
    "de": "Verlauf"
  },
  "dict.tab.manage": {
    "zh": "管理",
    "zh-TW": "管理",
    "en": "Manage",
    "ja": "管理",
    "ko": "관리",
    "fr": "Gérer",
    "de": "Verwalten"
  },
  "dict.search.placeholder": {
    "zh": "输入单词查询…",
    "zh-TW": "輸入單詞查詢…",
    "en": "Type a word to look up…",
    "ja": "単語を入力して検索…",
    "ko": "검색할 단어 입력…",
    "fr": "Saisissez un mot à rechercher…",
    "de": "Wort zum Nachschlagen eingeben…"
  },
  "dict.ft.placeholder": {
    "zh": "全文/内容搜索…",
    "zh-TW": "全文/內容搜尋…",
    "en": "Full-text / content search…",
    "ja": "全文/内容検索…",
    "ko": "전문/내용 검색…",
    "fr": "Recherche plein texte / contenu…",
    "de": "Volltext-/Inhaltssuche…"
  },
  "dict.ft.matchCase": {
    "zh": "Aa 大小写",
    "zh-TW": "Aa 大小寫",
    "en": "Aa Case",
    "ja": "Aa 大文字/小文字",
    "ko": "Aa 대소문자",
    "fr": "Aa Casse",
    "de": "Aa Groß/Klein"
  },
  "dict.ft.wholeWords": {
    "zh": "⌐ 整词",
    "zh-TW": "⌐ 整詞",
    "en": "⌐ Whole words",
    "ja": "⌐ 単語全体",
    "ko": "⌐ 전체 단어",
    "fr": "⌐ Mots entiers",
    "de": "⌐ Ganze Wörter"
  },
  "dict.ft.regex": {
    "zh": ".* 正则",
    "zh-TW": ".* 正則",
    "en": ".* Regex",
    "ja": ".* 正規表現",
    "ko": ".* 정규식",
    "fr": ".* Regex",
    "de": ".* RegEx"
  },
  "dict.ft.sep": {
    "zh": "多词用 | 分隔",
    "zh-TW": "多詞用 | 分隔",
    "en": "Separate words with |",
    "ja": "複数の語は | で区切る",
    "ko": "여러 단어는 | 로 구분",
    "fr": "Séparez les mots par |",
    "de": "Wörter mit | trennen"
  },
  "dict.ft.search": {
    "zh": "搜索",
    "zh-TW": "搜尋",
    "en": "Search",
    "ja": "検索",
    "ko": "검색",
    "fr": "Rechercher",
    "de": "Suchen"
  },
  "dict.all": {
    "zh": "全部",
    "zh-TW": "全部",
    "en": "All",
    "ja": "すべて",
    "ko": "전체",
    "fr": "Tous",
    "de": "Alle"
  },
  "dict.chip.onlyThis": {
    "zh": "仅查此辞典",
    "zh-TW": "僅查此辭典",
    "en": "Only this dictionary",
    "ja": "この辞書のみ",
    "ko": "이 사전만",
    "fr": "Ce dictionnaire uniquement",
    "de": "Nur dieses Wörterbuch"
  },
  "dict.chip.info": {
    "zh": "辞典信息",
    "zh-TW": "辭典訊息",
    "en": "Dictionary info",
    "ja": "辞書情報",
    "ko": "사전 정보",
    "fr": "Infos du dictionnaire",
    "de": "Wörterbuch-Info"
  },
  "dict.chip.moveUp": {
    "zh": "上移",
    "zh-TW": "上移",
    "en": "Move up",
    "ja": "上へ移動",
    "ko": "위로 이동",
    "fr": "Monter",
    "de": "Nach oben"
  },
  "dict.chip.disable": {
    "zh": "禁用",
    "zh-TW": "禁用",
    "en": "Disable",
    "ja": "無効化",
    "ko": "사용 안 함",
    "fr": "Désactiver",
    "de": "Deaktivieren"
  },
  "dict.chip.enable": {
    "zh": "启用",
    "zh-TW": "啓用",
    "en": "Enable",
    "ja": "有効化",
    "ko": "사용함",
    "fr": "Activer",
    "de": "Aktivieren"
  },
  "dict.chip.delete": {
    "zh": "删除",
    "zh-TW": "刪除",
    "en": "Delete",
    "ja": "削除",
    "ko": "삭제",
    "fr": "Supprimer",
    "de": "Löschen"
  },
  "dict.empty.title": {
    "zh": "还没有导入辞典",
    "zh-TW": "還沒有匯入辭典",
    "en": "No dictionaries imported yet",
    "ja": "辞書がまだインポートされていません",
    "ko": "아직 가져온 사전이 없습니다",
    "fr": "Aucun dictionnaire importé",
    "de": "Noch keine Wörterbücher importiert"
  },
  "dict.empty.desc": {
    "zh": "支持 MDict (.mdx/.mdd) 与 TEI Lex-0 (.lex0.xml)。",
    "zh-TW": "支援 MDict (.mdx/.mdd) 與 TEI Lex-0 (.lex0.xml)。",
    "en": "Supports MDict (.mdx/.mdd) and TEI Lex-0 (.lex0.xml).",
    "ja": "MDict (.mdx/.mdd)、TEI Lex-0 (.lex0.xml) に対応します。",
    "ko": "MDict(.mdx/.mdd), TEI Lex-0(.lex0.xml) 지원.",
    "fr": "Prend en charge MDict (.mdx/.mdd) et TEI Lex-0 (.lex0.xml).",
    "de": "Unterstützt MDict (.mdx/.mdd) und TEI Lex-0 (.lex0.xml)."
  },
  "dict.empty.hint": {
    "zh": "将辞典文件放入仓库任意文件夹（建议 dictionaries/），然后在管理页扫描导入。",
    "zh-TW": "將辭典檔案放入倉庫任意檔案夾（建議 dictionaries/），然後在管理頁掃描匯入。",
    "en": "Put dictionary files in any vault folder (dictionaries/ recommended), then scan and import from the Manage page.",
    "ja": "辞書ファイルを vault 内の任意フォルダー（推奨 dictionaries/）に入れ、管理ページからスキャンして取り込みます。",
    "ko": "사전 파일을 vault 임의 폴더(권장 dictionaries/)에 넣고 관리 페이지에서 스캔해 가져오세요.",
    "fr": "Placez les fichiers dans un dossier du coffre (dictionaries/ conseillé), puis scannez et importez depuis la page Gérer.",
    "de": "Legen Sie die Dateien in einen Vault-Ordner (empfohlen: dictionaries/) und importieren Sie sie über „Verwalten“."
  },
  "dict.empty.btn": {
    "zh": "打开管理面板",
    "zh-TW": "打開管理面板",
    "en": "Open manage panel",
    "ja": "管理パネルを開く",
    "ko": "관리 패널 열기",
    "fr": "Ouvrir le panneau de gestion",
    "de": "Verwaltungsbereich öffnen"
  },
  "dict.ready": {
    "zh": "准备就绪",
    "zh-TW": "準備就緒",
    "en": "Ready",
    "ja": "準備完了",
    "ko": "준비 완료",
    "fr": "Prêt",
    "de": "Bereit"
  },
  "dict.ready.desc": {
    "zh": "已加载 {n} 部辞典。输入单词查询，或在编辑器中选词后按 Ctrl/Cmd+Shift+D。点击辞典 chips 可多选搜索范围。",
    "zh-TW": "已載入 {n} 部辭典。輸入單詞查詢，或在編輯器中選詞後按 Ctrl/Cmd+Shift+D。點選辭典 chips 可多選搜尋範圍。",
    "en": "Loaded {n} dictionaries. Type a word to look up, or select text in the editor and press Ctrl/Cmd+Shift+D. Click dictionary chips to multi-select the search scope.",
    "ja": "{n} 件の辞書を読み込みました。単語を入力して検索、またはエディターで選択して Ctrl/Cmd+Shift+D。辞書チップをクリックすると検索範囲を複数選択できます。",
    "ko": "{n}개 사전 로드됨. 단어 입력 검색 또는 편집기 선택 후 Ctrl/Cmd+Shift+D. 사전 칩 클릭으로 검색 범위 다중 선택.",
    "fr": "{n} dictionnaires chargés. Saisissez un mot, ou sélectionnez du texte puis Ctrl/Cmd+Maj+D. Cliquez les pastilles pour multi-sélectionner.",
    "de": "{n} Wörterbücher geladen. Wort eingeben oder Text markieren und Strg/Cmd+Umschalt+D. Chips für Mehrfachauswahl anklicken."
  },
  "dict.recent": {
    "zh": "最近查询",
    "zh-TW": "最近查詢",
    "en": "Recent lookups",
    "ja": "最近の検索",
    "ko": "최근 검색",
    "fr": "Recherches récentes",
    "de": "Letzte Suchen"
  },
  "dict.addBookmark": {
    "zh": "加入书签",
    "zh-TW": "加入書籤",
    "en": "Add bookmark",
    "ja": "ブックマークに追加",
    "ko": "북마크 추가",
    "fr": "Ajouter aux favoris",
    "de": "Lesezeichen hinzufügen"
  },
  "dict.removeBookmark": {
    "zh": "移除书签",
    "zh-TW": "移除書籤",
    "en": "Remove bookmark",
    "ja": "ブックマークを削除",
    "ko": "북마크 제거",
    "fr": "Retirer des favoris",
    "de": "Lesezeichen entfernen"
  },
  "dict.share.png": {
    "zh": "分享为图片",
    "zh-TW": "分享爲圖片",
    "en": "Share as PNG",
    "ja": "PNG で共有",
    "ko": "PNG로 공유",
    "fr": "Partager en PNG",
    "de": "Als PNG teilen"
  },
  "dict.share.generating": {
    "zh": "正在生成分享图片…",
    "zh-TW": "正在生成分享圖片…",
    "en": "Generating share image…",
    "ja": "共有画像を生成中…",
    "ko": "공유 이미지 생성 중…",
    "fr": "Génération de l'image de partage…",
    "de": "Teilbild wird erstellt…"
  },
  "dict.share.failed": {
    "zh": "生成失败: {err}",
    "zh-TW": "生成失敗: {err}",
    "en": "Generation failed: {err}",
    "ja": "生成に失敗: {err}",
    "ko": "생성 실패: {err}",
    "fr": "Échec de la génération : {err}",
    "de": "Erstellung fehlgeschlagen: {err}"
  },
  "dict.noResults": {
    "zh": "未找到",
    "zh-TW": "未找到",
    "en": "Not found",
    "ja": "見つかりません",
    "ko": "찾을 수 없음",
    "fr": "Introuvable",
    "de": "Nicht gefunden"
  },
  "dict.extlinks": {
    "zh": "在线来源:",
    "zh-TW": "在線來源:",
    "en": "Online sources:",
    "ja": "オンライン情報源:",
    "ko": "온라인 출처:",
    "fr": "Sources en ligne :",
    "de": "Online-Quellen:"
  },
  "dict.paliSanskrit": {
    "zh": "巴利/梵文:",
    "zh-TW": "巴利/梵文:",
    "en": "Pali/Sanskrit:",
    "ja": "パーリ語/サンスクリット:",
    "ko": "팔리어/산스크리트어:",
    "fr": "Pali/Sanskrit :",
    "de": "Pali/Sanskrit:"
  },
  "dict.paliSanskrit.map": {
    "zh": "梵文对应：{sk}",
    "zh-TW": "梵文對應：{sk}",
    "en": "Sanskrit equivalent: {sk}",
    "ja": "サンスクリット対応: {sk}",
    "ko": "산스크리트어 대응: {sk}",
    "fr": "Équivalent sanskrit : {sk}",
    "de": "Sanskrit-Entsprechung: {sk}"
  },
  "dict.didYouMean": {
    "zh": "你是不是要找：",
    "zh-TW": "你是不是要找：",
    "en": "Did you mean:",
    "ja": "もしかして:",
    "ko": "혹시 찾으신 것:",
    "fr": "Vouliez-vous dire :",
    "de": "Meinten Sie:"
  },
  "dict.tryFulltext": {
    "zh": "试试全文搜索（管理页）或更短的形式。",
    "zh-TW": "試試全文搜尋（管理頁）或更短的形式。",
    "en": "Try full-text search (Manage page) or a shorter form.",
    "ja": "全文検索（管理ページ）または短い形をお試しください。",
    "ko": "전문 검색(관리 페이지) 또는 더 짧은 형식을 시도하세요.",
    "fr": "Essayez la recherche plein texte (page Gérer) ou une forme plus courte.",
    "de": "Versuchen Sie die Volltextsuche (Seite „Verwalten“) oder eine kürzere Form."
  },
  "dict.expandAll": {
    "zh": "全部展开",
    "zh-TW": "全部展開",
    "en": "Expand all",
    "ja": "すべて展開",
    "ko": "모두 펼치기",
    "fr": "Tout déplier",
    "de": "Alle aufklappen"
  },
  "dict.collapseAll": {
    "zh": "全部收起",
    "zh-TW": "全部收起",
    "en": "Collapse all",
    "ja": "すべて折りたたむ",
    "ko": "모두 접기",
    "fr": "Tout replier",
    "de": "Alle zuklappen"
  },
  "dict.copy": {
    "zh": "复制",
    "zh-TW": "複製",
    "en": "Copy",
    "ja": "コピー",
    "ko": "복사",
    "fr": "Copier",
    "de": "Kopieren"
  },
  "dict.copyDone": {
    "zh": "已复制 HTML 到剪贴板",
    "zh-TW": "已複製 HTML 到剪貼簿",
    "en": "Copied HTML to clipboard",
    "ja": "HTML をクリップボードにコピーしました",
    "ko": "HTML을 클립보드에 복사함",
    "fr": "HTML copié dans le presse-papiers",
    "de": "HTML in die Zwischenablage kopiert"
  },
  "dict.copyFail": {
    "zh": "复制失败，剪贴板不可用",
    "zh-TW": "複製失敗，剪貼簿不可用",
    "en": "Copy failed; clipboard unavailable",
    "ja": "コピーに失敗しました（クリップボードが利用できません）",
    "ko": "복사 실패 (클립보드를 사용할 수 없음)",
    "fr": "Échec de la copie ; presse-papiers indisponible",
    "de": "Kopieren fehlgeschlagen; Zwischenablage nicht verfügbar"
  },
  "dict.mdSaved": {
    "zh": "已保存笔记到 lilium/筆記/notes",
    "zh-TW": "已儲存筆記到 lilium/筆記/notes",
    "en": "Note saved to lilium/筆記/notes",
    "ja": "ノートを lilium/筆記/notes に保存しました",
    "ko": "노트를 lilium/筆記/notes에 저장함",
    "fr": "Note enregistrée dans lilium/筆記/notes",
    "de": "Notiz in lilium/筆記/notes gespeichert"
  },
  "dict.mdSaveFail": {
    "zh": "笔记保存失败",
    "zh-TW": "筆記儲存失敗",
    "en": "Failed to save note",
    "ja": "ノートの保存に失敗しました",
    "ko": "노트 저장 실패",
    "fr": "Échec de l'enregistrement de la note",
    "de": "Speichern der Notiz fehlgeschlagen"
  },

  "dict.bookmarks.hint": {
    "zh": "查询结果页点击 ★ 收藏词条。",
    "zh-TW": "查詢結果頁點選 ★ 收藏詞條。",
    "en": "Click ★ on a result page to bookmark an entry.",
    "ja": "検索結果ページの ★ をクリックして項目を收藏します。",
    "ko": "검색 결과 페이지에서 ★를 클릭해 항목을 북마크하세요.",
    "fr": "Cliquez sur ★ dans une page de résultat pour ajouter l'entrée aux favoris.",
    "de": "Klicken Sie auf ★ in der Ergebnisseite, um den Eintrag zu merken."
  },
  "dict.bookmarks.clear": {
    "zh": "清空书签",
    "zh-TW": "清空書籤",
    "en": "Clear bookmarks",
    "ja": "ブックマークをクリア",
    "ko": "북마크 비우기",
    "fr": "Vider les favoris",
    "de": "Lesezeichen leeren"
  },
  "dict.history.title": {
    "zh": "查询历史",
    "zh-TW": "查詢歷史",
    "en": "Lookup history",
    "ja": "検索履歴",
    "ko": "검색 기록",
    "fr": "Historique des recherches",
    "de": "Suchverlauf"
  },
  "dict.set.folders": {
    "zh": "辞典文件夹",
    "zh-TW": "辭典檔案夾",
    "en": "Dictionary folder",
    "ja": "辞書フォルダー",
    "ko": "사전 폴더",
    "fr": "Dossiers de dictionnaires",
    "de": "Wörterbuchordner"
  },
  "dict.set.foldersDesc": {
    "zh": "逗号分隔的仓库内文件夹路径；留空＝扫描整个仓库。插件会递归扫描 .mdx/.mdd、TEI Lex-0 (.lex0.xml)，以及同名配套的 .css/.js/字体文件。",
    "zh-TW": "逗號分隔的倉庫內檔案夾路徑；留空＝掃描整個倉庫。插件會遞迴掃描 .mdx/.mdd、TEI Lex-0 (.lex0.xml)，以及同名配套的 .css/.js/字體檔案。",
    "en": "Comma-separated vault folder paths; leave empty to scan the whole vault. The plugin recursively scans .mdx/.mdd, TEI Lex-0 (.lex0.xml), plus same-named companion .css/.js/font files.",
    "ja": "カンマ区切りの vault 内フォルダーパス。空欄＝保管庫全体を走査。.mdx/.mdd、TEI Lex-0 (.lex0.xml) と同名の .css/.js/フォントを再帰的に走査します。",
    "ko": "쉼표로 구분된 vault 폴더 경로. 비움＝전체 보관함 스캔. .mdx/.mdd, TEI Lex-0(.lex0.xml) 및 동명 .css/.js/글꼴 재귀 스캔.",
    "fr": "Chemins de dossiers séparés par des virgules ; vide ＝ analyse du coffre entier. Analyse récursive de .mdx/.mdd, TEI Lex-0 et des .css/.js/polices homonymes.",
    "de": "Komma-getrennte Vault-Ordnerpfade; leer ＝ gesamten Vault scannen. Rekursiver Scan von .mdx/.mdd, TEI Lex-0 sowie gleichnamigen .css/.js-/Schriftdateien."
  },
  "dict.set.crossNavMain": {
    "zh": "直排写作系统设置",
    "zh-TW": "直排寫作系統設定",
    "en": "Vertical writing system settings",
    "ja": "縦書き執筆システムの設定",
    "ko": "세로쓰기 작성 시스템 설정",
    "fr": "Paramètres du système d'écriture verticale",
    "de": "Einstellungen des vertikalen Schreibsystems"
  },
  "dict.set.crossNavMainDesc": {
    "zh": "排版、字体、转写、直排/横排切换等主功能在此设置。一键返回。",
    "zh-TW": "排版、字體、轉寫、直排/橫排切換等主功能在此設定。一鍵返回。",
    "en": "Layout, fonts, transliteration, vertical/horizontal toggle and other main features live here. One tap to return.",
    "ja": "組版・フォント・転写・縦横切替などの主要機能はこちら。ワンタップで戻る。",
    "ko": "조판·글꼴·전사·세로/가로 전환 등 주요 기능은 여기서. 한 번에 돌아가기.",
    "fr": "Mise en page, polices, translittération, bascule vertical/horizontal et autres fonctions principales. Un clic pour revenir.",
    "de": "Layout, Schriften, Transliteration, Umschaltung vertikal/horizontal und weitere Hauptfunktionen. Ein Tippen zum Zurückkehren."
  },
  "dict.set.crossNavMainBtn": {
    "zh": "打开直排写作设置",
    "zh-TW": "打開直排寫作設定",
    "en": "Open vertical writing settings",
    "ja": "縦書き設定を開く",
    "ko": "세로쓰기 설정 열기",
    "fr": "Ouvrir les paramètres d'écriture verticale",
    "de": "Einstellungen für vertikales Schreiben öffnen"
  },
  "dict.set.scanCache": {
    "zh": "扫描缓存",
    "zh-TW": "掃描快取",
    "en": "Scan cache",
    "ja": "スキャンキャッシュ",
    "ko": "스캔 캐시",
    "fr": "Cache de numérisation",
    "de": "Scan-Cache"
  },
  "dict.set.scanCacheDesc": {
    "zh": "首次扫描解析过的辞典，在文件未改动时直接复用，不再重复扫描；缓存跨重启生效（改动文件或关闭后重新扫描会重新解析）。",
    "zh-TW": "首次掃描解析過的辭典，在檔案未改動時直接復用，不再重複掃描；快取跨重啟生效（改動檔案或關閉後重新掃描會重新解析）。",
    "en": "Dictionaries parsed in a previous scan are reused as long as their files are unchanged (changing a file or turning this off forces a fresh parse).",
    "ja": "前回のスキャンで解析済みの辞書は、ファイルが変更されていなければ再利用します（変更や無効化時は再解析）。",
    "ko": "이전 스캔에서 파싱한 사전은 파일이 변경되지 않은 경우 재사용합니다(변경 또는 비활성화 시 재파싱).",
    "fr": "Les dictionnaires déjà analysés sont réutilisés si leurs fichiers n'ont pas changé (toute modification ou désactivation force une nouvelle analyse).",
    "de": "Bereits gescannte Wörterbücher werden wiederverwendet, solange ihre Dateien unverändert sind (bei Änderung oder Deaktivierung wird neu geparst)."
  },
  "dict.set.scan": {
    "zh": "立即扫描",
    "zh-TW": "立即掃描",
    "en": "Scan now",
    "ja": "今すぐスキャン",
    "ko": "지금 스캔",
    "fr": "Analyser maintenant",
    "de": "Jetzt scannen"
  },
  "dict.set.scanDesc": {
    "zh": "重新扫描并加载辞典（扫描范围依「辞典文件夹」；留空＝整个仓库）。",
    "zh-TW": "重新掃描並載入辭典（掃描範圍依「辭典檔案夾」；留空＝整個倉庫）。",
    "en": "Rescan and load dictionaries (scoped by “Dictionary folder”; empty ＝ whole vault).",
    "ja": "再走査して辞書を読み込みます（範囲は「辞書フォルダー」設定に従う。空欄＝保管庫全体）。",
    "ko": "다시 스캔하여 사전을 불러옵니다(범위는 '사전 폴더' 설정 기준; 비움＝전체 보관함).",
    "fr": "Réanalyse et charge les dictionnaires (portée selon « Dossier de dictionnaires » ; vide ＝ tout le coffre).",
    "de": "Scannt und lädt Wörterbücher (Umfang gemäß „Wörterbuchordner“; leer ＝ gesamter Vault)."
  },
  "dict.set.scanBtn": {
    "zh": "扫描并加载",
    "zh-TW": "掃描並載入",
    "en": "Scan & load",
    "ja": "スキャンして読み込む",
    "ko": "스캔 후 불러오기",
    "fr": "Analyser et charger",
    "de": "Scannen & laden"
  },
  "dict.set.extractMdd": {
    "zh": "提取 MDD 资源",
    "zh-TW": "提取 MDD 資源",
    "en": "Extract .mdd assets",
    "ja": ".mdd リソースを抽出",
    "ko": ".mdd 리소스 추출",
    "fr": "Extraire les ressources .mdd",
    "de": ".mdd-Ressourcen extrahieren"
  },
  "dict.set.extractMddDesc": {
    "zh": "导入 MDict 辞典时把 .mdd 中的图片/音频/字体/CSS 提取到仓库（lilium/assets/），供词条内显示。",
    "zh-TW": "匯入 MDict 辭典時把 .mdd 中的圖片/音頻/字體/CSS 提取到倉庫（lilium/assets/），供詞條內顯示。",
    "en": "When importing MDict dictionaries, extract images/audio/fonts/CSS from .mdd into the vault (lilium/assets/) for in-entry display.",
    "ja": "MDict 辞書の取り込み時、.mdd 内の画像/音声/フォント/CSS を vault（lilium/assets/）へ抽出し項目内に表示します。",
    "ko": "MDict 사전 가져오기 시 .mdd의 이미지/오디오/글꼴/CSS를 vault(lilium/assets/)에 추출해 항목에 표시.",
    "fr": "Lors de l'import MDict, extrait images/audio/polices/CSS du .mdd vers le coffre (lilium/assets/) pour affichage dans l'entrée.",
    "de": "Beim MDict-Import Bilder/Audio/Schriften/CSS aus .mdd in den Vault (lilium/assets/) extrahieren und im Eintrag anzeigen."
  },
  "dict.set.mddBudget": {
    "zh": "MDD 资源预算 (MB)",
    "zh-TW": "MDD 資源預算 (MB)",
    "en": "MDD asset budget (MB)",
    "ja": "MDD リソース上限 (MB)",
    "ko": "MDD 리소스 한도 (MB)",
    "fr": "Budget de ressources MDD (Mo)",
    "de": "MDD-Ressourcenbudget (MB)"
  },
  "dict.set.mddBudgetDesc": {
    "zh": "每部辞典最多提取的资源总大小，防止仓库膨胀。",
    "zh-TW": "每部辭典最多提取的資源總大小，防止倉庫膨脹。",
    "en": "Maximum total size of extracted assets per dictionary, to prevent vault bloat.",
    "ja": "辞書ごとに抽出するリソース総量の上限（vault 肥大化を防止）。",
    "ko": "사전별 추출 리소스 총량 상한(vault 비대화 방지).",
    "fr": "Taille totale maximale des ressources extraites par dictionnaire, pour éviter de gonfler le coffre.",
    "de": "Maximale Gesamtgröße der pro Wörterbuch extrahierten Ressourcen (verhindert das Aufblähen des Vaults)."
  },
  "dict.set.fullTextLimit": {
    "zh": "全文搜索结果上限",
    "zh-TW": "全文搜尋結果上限",
    "en": "Full-text result limit",
    "ja": "全文検索の結果上限",
    "ko": "전문 검색 결과 한도",
    "fr": "Limite de résultats plein texte",
    "de": "Limit für Volltextergebnisse"
  },
  "dict.set.fullTextLimitDesc": {
    "zh": "每部辞典的全文/内容搜索最多返回条数。",
    "zh-TW": "每部辭典的全文/內容搜尋最多返回條數。",
    "en": "Maximum results returned per dictionary for full-text/content search.",
    "ja": "全文/内容検索で辞書ごとに返す最大件数。",
    "ko": "전문/내용 검색에서 사전별 최대 반환 건수.",
    "fr": "Nombre maximal de résultats renvoyés par dictionnaire pour la recherche plein texte.",
    "de": "Maximale Anzahl Ergebnisse pro Wörterbuch bei der Volltext-/Inhaltssuche."
  },
  "dict.set.inlineSuggest": {
    "zh": "行内编辑器建议",
    "zh-TW": "行內編輯器建議",
    "en": "Inline editor suggest",
    "ja": "インライン候補表示",
    "ko": "인라인 제안",
    "fr": "Suggestion en ligne dans l'éditeur",
    "de": "Inline-Vorschlag im Editor"
  },
  "dict.set.inlineSuggestDesc": {
    "zh": "在编辑器中输入 \"lilium <query>\" 触发行内辞典建议。",
    "zh-TW": "在編輯器中輸入 \"lilium <query>\" 觸發行內辭典建議。",
    "en": "Type \"lilium <query>\" in the editor to trigger inline dictionary suggestions.",
    "ja": "エディターで \"lilium <query>\" と入力するとインライン辞書候補が出ます。",
    "ko": "편집기에서 \"lilium <query>\" 입력 시 인라인 사전 제안.",
    "fr": "Tapez « lilium <requête> » dans l'éditeur pour déclencher les suggestions.",
    "de": "Geben Sie „lilium <Abfrage>“ im Editor ein, um Inline-Vorschläge auszulösen."
  },
  "dict.set.inlineTrigger": {
    "zh": "行内建议触发词",
    "zh-TW": "行內建議觸發詞",
    "en": "Inline suggest trigger word",
    "ja": "インライン候補のトリガー語",
    "ko": "인라인 제안 트리거 단어",
    "fr": "Mot déclencheur des suggestions en ligne",
    "de": "Triggerwort für Inline-Vorschläge"
  },
  "dict.set.inlineTriggerDesc": {
    "zh": "在编辑器中输入该词后跟查询即触发建议（须以空格结尾）。",
    "zh-TW": "在編輯器中輸入該詞後跟查詢即觸發建議（須以空格結尾）。",
    "en": "Type this word followed by a query in the editor to trigger suggestions (must end with a space).",
    "ja": "エディターでこの語＋検索語を入力すると候補が出ます（語尾に空白が必要）。",
    "ko": "편집기에서 이 단어 뒤에 검색어를 입력하면 제안이 나타납니다(끝에 공백 필요).",
    "fr": "Tapez ce mot suivi d'une requête dans l'éditeur pour déclencher les suggestions (doit se terminer par une espace).",
    "de": "Geben Sie dieses Wort plus eine Abfrage im Editor ein, um Vorschläge auszulösen (muss mit Leerzeichen enden)."
  },
  "dict.set.lemmaFallback": {
    "zh": "词形还原回退",
    "zh-TW": "詞形還原回退",
    "en": "Lemma fallback",
    "ja": "見出し語化フォールバック",
    "ko": "표제어 복원 폴백",
    "fr": "Repli sur le lemme",
    "de": "Lemma-Rückfall"
  },
  "dict.set.lemmaFallbackDesc": {
    "zh": "查询失败时自动尝试词形还原候选（ran→run、studies→study 等，英语）。",
    "zh-TW": "查詢失敗時自動嘗試詞形還原候選（ran→run、studies→study 等，英語）。",
    "en": "On lookup failure, automatically try lemmatized candidates (ran→run, studies→study, etc., English).",
    "ja": "検索失敗時に自動で見出し語化候補（ran→run、studies→study など、英語）を試します。",
    "ko": "검색 실패 시 표제어 후보(ran→run, studies→study 등, 영어)를 자동 시도.",
    "fr": "En cas d'échec, essaie automatiquement les candidats lemmatisés (ran→run, studies→study ; anglais).",
    "de": "Versucht bei Fehlschlag automatisch lemmatisierte Kandidaten (ran→run, studies→study; Englisch)."
  },
  "dict.set.zhConvert": {
    "zh": "中文转换",
    "zh-TW": "中文轉換",
    "en": "Chinese conversion",
    "ja": "中国語変換",
    "ko": "중국어 변환",
    "fr": "Conversion chinois",
    "de": "Chinesische Umwandlung"
  },
  "dict.set.zhConvertDesc": {
    "zh": "词条显示时在繁/简之间转换（OpenCC 单字表，Apache-2.0）。",
    "zh-TW": "詞條顯示時在繁/簡之間轉換（OpenCC 單字表，Apache-2.0）。",
    "en": "Convert between Traditional/Simplified when displaying entries (OpenCC glyph table, Apache-2.0).",
    "ja": "項目表示時に繁体字/簡体字を相互変換（OpenCC 字形表、Apache-2.0）。",
    "ko": "항목 표시 시 번체/간체 상호 변환(OpenCC 자형표, Apache-2.0).",
    "fr": "Convertit entre traditionnel et simplifié à l'affichage (table OpenCC, Apache-2.0).",
    "de": "Wandelt bei der Anzeige zwischen Traditionell und Vereinfacht um (OpenCC-Tabelle, Apache-2.0)."
  },
  "dict.set.zhConvert.none": {
    "zh": "不转换",
    "zh-TW": "不轉換",
    "en": "No conversion",
    "ja": "変換しない",
    "ko": "변환 안 함",
    "fr": "Aucune conversion",
    "de": "Keine Umwandlung"
  },
  "dict.set.zhConvert.t2s": {
    "zh": "繁→简",
    "zh-TW": "繁→簡",
    "en": "Traditional → Simplified",
    "ja": "繁体→簡体",
    "ko": "번체→간체",
    "fr": "Traditionnel → Simplifié",
    "de": "Traditionell → Vereinfacht"
  },
  "dict.set.zhConvert.s2t": {
    "zh": "简→繁",
    "zh-TW": "簡→繁",
    "en": "Simplified → Traditional",
    "ja": "簡体→繁体",
    "ko": "간체→번체",
    "fr": "Simplifié → Traditionnel",
    "de": "Vereinfacht → Traditionell"
  },
  "dict.set.fixZhWrap": {
    "zh": "修复中文断行",
    "zh-TW": "修復中文斷行",
    "en": "Fix Chinese line wrap",
    "ja": "中国語の折り返しを修正",
    "ko": "중국어 줄바꿈 수정",
    "fr": "Corriger les retours à la ligne chinois",
    "de": "Chinesischen Zeilenumbruch korrigieren"
  },
  "dict.set.fixZhWrapDesc": {
    "zh": "合并词条内被硬换行切断的中文句子（句号/冒号后不断行）。",
    "zh-TW": "合併詞條內被硬換行切斷的中文句子（句號/冒號後不斷行）。",
    "en": "Merge Chinese sentences broken by hard line breaks inside entries (no break after period/colon).",
    "ja": "項目内で強制改行により分断された中国語文を結合します（句点/コロン後は改行しない）。",
    "ko": "항목 내 강제 줄바꿈으로 끊긴 중국어 문장 병합(마침표/콜론 뒤 줄바꿈 없음).",
    "fr": "Fusionne les phrases chinoises coupées par des retours à la ligne durs (pas de coupure après point ou deux-points).",
    "de": "Verbindet chinesische Sätze, die durch harte Umbrüche getrennt wurden (kein Umbruch nach Punkt/Doppelpunkt)."
  },
  "dict.set.hover": {
    "zh": "悬停查询",
    "zh-TW": "懸停查詢",
    "en": "Hover lookup",
    "ja": "ホバー検索",
    "ko": "호버 검색",
    "fr": "Recherche au survol",
    "de": "Suche beim Überfahren"
  },
  "dict.set.hoverDesc": {
    "zh": "按住修饰键（默认 Ctrl）悬停在单词上弹出释义浮窗，点击浮窗可固定。支持中日韩文（Intl.Segmenter）。",
    "zh-TW": "按住修飾鍵（預設 Ctrl）懸停在單詞上彈出釋義浮窗，點選浮窗可固定。支援中日韓文（Intl.Segmenter）。",
    "en": "Hold a modifier key (default Ctrl) and hover over a word to pop up a definition; click to pin. Supports CJK (Intl.Segmenter).",
    "ja": "修飾キー（既定 Ctrl）を押しながら単語にホバーすると釈義がポップアップ。クリックで固定。CJK 対応（Intl.Segmenter）。",
    "ko": "수정키(기본 Ctrl)를 누른 채 단어에 호버하면 뜻풀이 팝업. 클릭 시 고정. CJK 지원(Intl.Segmenter).",
    "fr": "Maintenez une touche modificatrice (Ctrl par défaut) et survolez un mot pour afficher une fenêtre de définition ; cliquez pour épingler. Prend en charge CJK (Intl.Segmenter).",
    "de": "Modifikatortaste (Standard: Strg) gedrückt halten und über ein Wort fahren, um ein Popup zu öffnen; Klick fixiert es. Unterstützt CJK (Intl.Segmenter)."
  },
  "dict.set.hoverTrigger": {
    "zh": "悬停触发键",
    "zh-TW": "懸停觸發鍵",
    "en": "Hover trigger key",
    "ja": "ホバー発火キー",
    "ko": "호버 트리거 키",
    "fr": "Touche de déclenchement du survol",
    "de": "Auslösetaste für Hover"
  },
  "dict.set.hoverTriggerDesc": {
    "zh": "悬浮查词的修饰键。",
    "zh-TW": "懸浮查詞的修飾鍵。",
    "en": "Modifier key for hover lookup.",
    "ja": "ホバー検索に使う修飾キー。",
    "ko": "호버 검색에 사용할 수정키.",
    "fr": "Touche modificatrice pour la recherche au survol.",
    "de": "Modifikatortaste für die Hover-Suche."
  },
  "dict.set.hoverTrigger.ctrl": {
    "zh": "Ctrl / ⌘",
    "zh-TW": "Ctrl / ⌘",
    "en": "Ctrl / ⌘",
    "ja": "Ctrl / ⌘",
    "ko": "Ctrl / ⌘",
    "fr": "Ctrl / ⌘",
    "de": "Strg / ⌘"
  },
  "dict.set.hoverTrigger.alt": {
    "zh": "Alt / Option",
    "zh-TW": "Alt / Option",
    "en": "Alt / Option",
    "ja": "Alt / Option",
    "ko": "Alt / Option",
    "fr": "Alt / Option",
    "de": "Alt / Option"
  },
  "dict.set.hoverTrigger.shift": {
    "zh": "Shift",
    "zh-TW": "Shift",
    "en": "Shift",
    "ja": "Shift",
    "ko": "Shift",
    "fr": "Maj",
    "de": "Umschalt"
  },
  "dict.set.hoverTrigger.meta": {
    "zh": "Meta / Win",
    "zh-TW": "Meta / Win",
    "en": "Meta / Win",
    "ja": "Meta / Win",
    "ko": "Meta / Win",
    "fr": "Meta / Win",
    "de": "Meta / Win"
  },
  "dict.set.selectionClean": {
    "zh": "选区清洗",
    "zh-TW": "選區清洗",
    "en": "Selection cleaning",
    "ja": "選択範囲の整形",
    "ko": "선택 영역 정리",
    "fr": "Nettoyage de la sélection",
    "de": "Auswahlbereinigung"
  },
  "dict.set.selectionCleanDesc": {
    "zh": "清理来自 PDF/高亮的选区：软连字符跨行去连字、合字归一（用 Unicode NFKC 標準化，ﬁ→fi）、零宽字符移除。",
    "zh-TW": "清理來自 PDF/高亮的選區：軟連字號跨行去連字、合字歸一（用 Unicode NFKC 標準化，ﬁ→fi）、零寬字元移除。",
    "en": "Clean selections from PDF/highlights: soft-hyphen de-ligature across lines, ligature normalization (Unicode NFKC, ﬁ→fi), zero-width removal.",
    "ja": "PDF/ハイライト由来の選択を整形：行を跨ぐソフトハイフンの解除、合字正規化（Unicode NFKC で、ﬁ→fi）、ゼロ幅文字の除去。",
    "ko": "PDF/형광펜 선택 정리: 행간 소프트 하이픈 해제, 합자 정규화(Unicode NFKC, ﬁ→fi), 폭0 문자 제거.",
    "fr": "Nettoie les sélections issues de PDF/surlignages : suppression des césures sur plusieurs lignes, normalisation des ligatures (Unicode NFKC, ﬁ→fi), retrait des caractères de largeur nulle.",
    "de": "Bereinigt aus PDF/Markierungen stammende Auswahlen: Trennstriche über Zeilen hinweg auflösen, Ligaturen normalisieren (Unicode NFKC, ﬁ→fi), Nullbreite-Zeichen entfernen."
  },
  "dict.set.fuzzy": {
    "zh": "模糊回退",
    "zh-TW": "模糊回退",
    "en": "Fuzzy fallback",
    "ja": "あいまい検索フォールバック",
    "ko": "유사 검색 대체",
    "fr": "Repli approximatif",
    "de": "Unscharfe Suche (Fallback)"
  },
  "dict.set.fuzzyDesc": {
    "zh": "精确匹配失败时，尝试忽略大小写与标点的模糊匹配，并展开前缀候选。",
    "zh-TW": "精確匹配失敗時，嘗試忽略大小寫與標點的模糊匹配，並展開前綴候選。",
    "en": "On exact-match failure, try case- and punctuation-insensitive matching, then prefix expansion.",
    "ja": "完全一致に失敗した場合、大文字小文字と句読点を無視したあいまい一致を試し、続いて前綴展開を行います。",
    "ko": "정확히 일치하지 않을 때 대소문자와 문장부호를 무시한 유사 일치를 시도한 뒤 접두어 확장을 합니다.",
    "fr": "En cas d'échec de la correspondance exacte, essayer une correspondance ignorant casse et ponctuation, puis une expansion par préfixe.",
    "de": "Bei fehlgeschlagener exakter Übereinstimmung zuerst unscharfe Suche ohne Beachtung von Groß-/Kleinschreibung und Satzzeichen, dann Präfix-Erweiterung."
  },
  "dict.set.autoScan": {
    "zh": "启动时自动扫描辞典",
    "zh-TW": "啟動時自動掃描辭典",
    "en": "Auto-scan dictionaries on startup",
    "ja": "起動時に辞書を自動スキャン",
    "ko": "시작 시 사전 자동 스캔",
    "fr": "Analyser les dictionnaires au démarrage",
    "de": "Wörterbücher beim Start automatisch scannen"
  },
  "dict.set.autoScanDesc": {
    "zh": "关闭后只在手动执行「重新扫描辞典文件夹」命令时加载辞典。辞典体量大时能显著加快启动。",
    "zh-TW": "關閉後只在手動執行「重新掃描辭典檔案夾」命令時載入辭典。辭典體量大時能顯著加快啟動。",
    "en": "When off, dictionaries load only via the \"Rescan dictionary folders\" command. Noticeably faster startup with large dictionary collections.",
    "ja": "オフにすると「辞書フォルダを再スキャン」コマンドを実行したときだけ辞書を読み込みます。辞書が大規模な場合、起動が大幅に速くなります。",
    "ko": "끄면 '사전 폴더 다시 스캔' 명령을 실행할 때만 사전을 불러옵니다. 사전 규모가 클 때 시작 속도가 크게 빨라집니다.",
    "fr": "Si désactivé, les dictionnaires ne sont chargés que via la commande « Réanalyser les dossiers de dictionnaires ». Démarrage nettement plus rapide avec de grandes collections.",
    "de": "Wenn aus, werden Wörterbücher nur über den Befehl „Wörterbuchordner erneut scannen“ geladen. Deutlich schnellerer Start bei großen Sammlungen."
  },
  "dict.set.deferScan": {
    "zh": "延后启动扫描",
    "zh-TW": "延後啟動掃描",
    "en": "Defer startup scan",
    "ja": "起動スキャンを遅延",
    "ko": "시작 스캔 지연",
    "fr": "Différer l'analyse au démarrage",
    "de": "Startscan verzögern"
  },
  "dict.set.deferScanDesc": {
    "zh": "让 Obsidian 先完成版面渲染，辞典在空闲时后台加载，不再卡住启动画面。",
    "zh-TW": "讓 Obsidian 先完成版面渲染，辭典在空閒時背景載入，不再卡住啟動畫面。",
    "en": "Lets Obsidian finish rendering first; dictionaries load in the background during idle time instead of blocking the startup screen.",
    "ja": "Obsidian の描画完了を待ってから、空き時間に辞書をバックグラウンドで読み込みます。起動画面がブロックされません。",
    "ko": "Obsidian이 먼저 렌더링을 마치고, 사전은 유휴 시간에 백그라운드로 불러옵니다. 시작 화면이 멈추지 않습니다.",
    "fr": "Laisse Obsidian terminer le rendu ; les dictionnaires se chargent en arrière-plan pendant les temps libres au lieu de bloquer l'écran de démarrage.",
    "de": "Obsidian rendert zuerst fertig; Wörterbücher werden in Leerlaufzeiten im Hintergrund geladen, statt den Startbildschirm zu blockieren."
  },
  "dict.set.groups": {
    "zh": "分组",
    "zh-TW": "分組",
    "en": "Groups",
    "ja": "グループ",
    "ko": "그룹",
    "fr": "Groupes",
    "de": "Gruppen"
  },
  "dict.set.newGroupPlaceholder": {
    "zh": "新分组名，如：英语 / 医学 / 计算机",
    "zh-TW": "新分組名，如：英語 / 醫學 / 計算機",
    "en": "New group name, e.g. English / Medicine / Computer",
    "ja": "新しいグループ名（例：英語 / 医学 / コンピュータ）",
    "ko": "새 그룹 이름 (예: 영어 / 의학 / 컴퓨터)",
    "fr": "Nom du nouveau groupe, ex. Anglais / Médecine / Informatique",
    "de": "Name der neuen Gruppe, z. B. Englisch / Medizin / Informatik"
  },
  "dict.set.addGroup": {
    "zh": "添加分组",
    "zh-TW": "添加分組",
    "en": "Add group",
    "ja": "グループを追加",
    "ko": "그룹 추가",
    "fr": "Ajouter un groupe",
    "de": "Gruppe hinzufügen"
  },
  "dict.set.delGroup": {
    "zh": "删除",
    "zh-TW": "刪除",
    "en": "Delete",
    "ja": "削除",
    "ko": "삭제",
    "fr": "Supprimer",
    "de": "Löschen"
  },
  "dict.set.loaded": {
    "zh": "已加载辞典",
    "zh-TW": "已載入辭典",
    "en": "Loaded dictionaries",
    "ja": "読み込み済みの辞書",
    "ko": "불러온 사전",
    "fr": "Dictionnaires chargés",
    "de": "Geladene Wörterbücher"
  },
  "dict.set.noDicts": {
    "zh": "尚未加载辞典。请将辞典文件放入上面的文件夹后点击「扫描并加载」。",
    "zh-TW": "尚未載入辭典。請將辭典檔案放入上面的檔案夾後點選「掃描並載入」。",
    "en": "No dictionaries loaded yet. Put dictionary files in the folder above, then click \"Scan & load\".",
    "ja": "辞書がまだ読み込まれていません。辞書ファイルを上記のフォルダに入れてから「スキャンして読み込む」をクリックしてください。",
    "ko": "아직 불러온 사전이 없습니다. 사전 파일을 위 폴더에 넣은 뒤 '스캔하여 불러오기'를 클릭하세요.",
    "fr": "Aucun dictionnaire chargé. Placez les fichiers de dictionnaire dans le dossier ci-dessus, puis cliquez sur « Analyser et charger ».",
    "de": "Noch keine Wörterbücher geladen. Legen Sie die Wörterbuchdateien in den obigen Ordner und klicken Sie dann auf „Scannen und laden“."
  },
  "dict.set.formats": {
    "zh": "支持的格式",
    "zh-TW": "支援的格式",
    "en": "Supported formats",
    "ja": "対応フォーマット",
    "ko": "지원 형식",
    "fr": "Formats pris en charge",
    "de": "Unterstützte Formate"
  },
  "dict.set.moveUp": {
    "zh": "↑ 上移",
    "zh-TW": "↑ 上移",
    "en": "Move up",
    "ja": "↑ 上へ",
    "ko": "↑ 위로",
    "fr": "↑ Monter",
    "de": "↑ Nach oben"
  },
  "dict.set.remove": {
    "zh": "移除",
    "zh-TW": "移除",
    "en": "Remove",
    "ja": "削除",
    "ko": "제거",
    "fr": "Retirer",
    "de": "Entfernen"
  },
  "dict.set.fmt.mdict": {
    "zh": "MDict",
    "zh-TW": "MDict",
    "en": "MDict",
    "ja": "MDict",
    "ko": "MDict",
    "fr": "MDict",
    "de": "MDict"
  },
  "LI_PLUS_DICT_NOT_READY": {
    "zh": "辞典尚未载入，请先导入辞典后重试",
    "zh-TW": "辭典尚未載入，請先匯入辭典後重試",
    "en": "Dictionary not loaded yet. Import a dictionary first, then retry.",
    "ja": "辞書がまだ読み込まれていません。まず辞書を取り込んでから再試行してください。",
    "ko": "사전이 아직 로드되지 않았습니다. 먼저 사전을 가져온 후 다시 시도하세요.",
    "fr": "Dictionnaire pas encore chargé. Importez d'abord un dictionnaire, puis réessayez.",
    "de": "Wörterbuch noch nicht geladen. Bitte zuerst ein Wörterbuch importieren und es erneut versuchen."
  },
  "dict.set.fmt.mdictNote": {
    "zh": "v1.2 / v2.0，zlib 与 LZO 压缩；MDD 资源自动提取；加密辞典不支持",
    "zh-TW": "v1.2 / v2.0，zlib 與 LZO 壓縮；MDD 資源自動提取；加密辭典不支援",
    "en": "v1.2 / v2.0, zlib and LZO compression; MDD assets auto-extracted; encrypted dictionaries unsupported",
    "ja": "v1.2 / v2.0、zlib および LZO 圧縮；MDD リソースは自動抽出；暗号化辞書は非対応",
    "ko": "v1.2 / v2.0, zlib 및 LZO 압축; MDD 리소스 자동 추출; 암호화 사전은 지원하지 않음",
    "fr": "v1.2 / v2.0, compression zlib et LZO ; ressources MDD extraites automatiquement ; dictionnaires chiffrés non pris en charge",
    "de": "v1.2 / v2.0, zlib- und LZO-Kompression; MDD-Ressourcen automatisch extrahiert; verschlüsselte Wörterbücher nicht unterstützt"
  },
  "dict.set.fmt.teiLex0": {
    "zh": "TEI Lex-0",
    "zh-TW": "TEI Lex-0",
    "ja": "TEI Lex-0",
    "ko": "TEI Lex-0",
    "en": "TEI Lex-0",
    "fr": "TEI Lex-0",
    "de": "TEI Lex-0"
  },
  "dict.set.fmt.optMdd": {
    "zh": "（可选）",
    "zh-TW": "（選用）",
    "en": " (optional)",
    "ja": "（任意）",
    "ko": "(선택)",
    "fr": " (facultatif)",
    "de": " (optional)"
  },
  "dict.set.fmt.sameName": {
    "zh": "同名",
    "zh-TW": "同名",
    "en": "same-named",
    "ja": "同名の",
    "ko": "같은 이름의",
    "fr": "du même nom",
    "de": "gleichnamige"
  },
  "dict.set.fmt.assets": {
    "zh": "字体",
    "zh-TW": "字體",
    "en": "fonts",
    "ja": "フォント",
    "ko": "글꼴",
    "fr": "polices",
    "de": "Schriften"
  },
  "dict.set.fmt.teiLex0Note": {
    "zh": "标准 TEI Lex-0 XML 辞典文件，命名建议 <名称>.lex0.xml",
    "zh-TW": "標準 TEI Lex-0 XML 辭典檔，命名建議 <名稱>.lex0.xml",
    "ja": "標準 TEI Lex-0 XML 辞書ファイル、命名推奨 <名前>.lex0.xml",
    "ko": "표준 TEI Lex-0 XML 사전 파일, 명명 권장 <이름>.lex0.xml",
    "en": "Standard TEI Lex-0 XML dictionary file, recommended naming <name>.lex0.xml",
    "fr": "Fichier de dictionnaire TEI Lex-0 XML standard, nommage conseillé <nom>.lex0.xml",
    "de": "Standardmäßige TEI-Lex-0-XML-Wörterbuchdatei, empfohlene Benennung <name>.lex0.xml"
  },
  "dict.cmd.openDictionaryView": {
    "zh": "打开辞典视图",
    "zh-TW": "打開辭典視圖",
    "en": "Open dictionary view",
    "ja": "辞書ビューを開く",
    "ko": "사전 뷰 열기",
    "fr": "Ouvrir la vue dictionnaire",
    "de": "Wörterbuchansicht öffnen"
  },
  "dict.cmd.lookupSelection": {
    "zh": "查询选中文本",
    "zh-TW": "查詢選中文本",
    "en": "Look up selection",
    "ja": "選択範囲を検索",
    "ko": "선택 영역 검색",
    "fr": "Rechercher la sélection",
    "de": "Auswahl nachschlagen"
  },
  "dict.cmd.lookupSelectionNone": {
    "zh": "没有选中文本",
    "zh-TW": "沒有選中文本",
    "en": "No text selected",
    "ja": "テキストが選択されていません",
    "ko": "선택된 텍스트가 없습니다",
    "fr": "Aucun texte sélectionné",
    "de": "Kein Text ausgewählt"
  },
  "dict.cmd.rescan": {
    "zh": "重新扫描辞典文件夹",
    "zh-TW": "重新掃描辭典檔案夾",
    "en": "Rescan dictionary folders",
    "ja": "辞書フォルダを再スキャン",
    "ko": "사전 폴더 다시 스캔",
    "fr": "Réanalyser les dossiers de dictionnaires",
    "de": "Wörterbuchordner erneut scannen"
  },
  "dict.cmd.openBookmarks": {
    "zh": "打开书签列表",
    "zh-TW": "打開書籤列表",
    "en": "Open bookmarks",
    "ja": "ブックマークを開く",
    "ko": "북마크 열기",
    "fr": "Ouvrir les favoris",
    "de": "Lesezeichen öffnen"
  },
  "dict.cmd.openHistory": {
    "zh": "打开查询历史",
    "zh-TW": "打開查詢歷史",
    "en": "Open lookup history",
    "ja": "検索履歴を開く",
    "ko": "검색 기록 열기",
    "fr": "Ouvrir l'historique des recherches",
    "de": "Suchverlauf öffnen"
  },
  "dict.cmd.fulltext": {
    "zh": "辞典全文搜索",
    "zh-TW": "辭典全文搜尋",
    "en": "Full-text search in dictionaries",
    "ja": "辞書内全文検索",
    "ko": "사전 전문 검색",
    "fr": "Recherche plein texte dans les dictionnaires",
    "de": "Volltextsuche in Wörterbüchern"
  },
    "dict.hover.pinHint": {
    "zh": "点击弹窗固定 · esc 关闭",
    "zh-TW": "點選彈窗固定 · esc 關閉",
    "en": "Click to pin · esc to close",
    "ja": "クリックで固定 · esc で閉じる",
    "ko": "클릭하여 고정 · esc로 닫기",
    "fr": "Clic pour épingler · esc pour fermer",
    "de": "Klicken zum Anheften · esc zum Schließen"
  },
"dict.hover.notFound": {
    "zh": "未找到「{word}」",
    "zh-TW": "未找到「{word}」",
    "en": "Not found: \"{word}\"",
    "ja": "見つかりません: 「{word}」",
    "ko": "찾을 수 없음: \"{word}\"",
    "fr": "Introuvable : « {word} »",
    "de": "Nicht gefunden: „{word}“"
  },
  "dict.menu.lookup": {
    "zh": "lilium: 查询「{short}」",
    "zh-TW": "lilium: 查詢「{short}」",
    "en": "lilium: look up \"{short}\"",
    "ja": "lilium: 「{short}」を検索",
    "ko": "lilium: \"{short}\" 검색",
    "fr": "lilium : rechercher « {short} »",
    "de": "lilium: „{short}“ nachschlagen"
  },
  "dict.inline.count": {
    "zh": "{n} 条结果",
    "zh-TW": "{n} 條結果",
    "en": "{n} results",
    "ja": "{n} 件の結果",
    "ko": "{n}개 결과",
    "fr": "{n} résultats",
    "de": "{n} Ergebnisse"
  },
  "dict.bookmark.added": {
    "zh": "已加入书签",
    "zh-TW": "已加入書籤",
    "en": "Bookmarked",
    "ja": "ブックマークに追加しました",
    "ko": "북마크에 추가됨",
    "fr": "Ajouté aux favoris",
    "de": "Als Lesezeichen gespeichert"
  },
  "dict.bookmark.removed": {
    "zh": "已移除书签",
    "zh-TW": "已移除書籤",
    "en": "Bookmark removed",
    "ja": "ブックマークを削除しました",
    "ko": "북마크가 제거됨",
    "fr": "Favori retiré",
    "de": "Lesezeichen entfernt"
  },
  "dict.aria.clear": {
    "zh": "清空",
    "zh-TW": "清空",
    "en": "Clear",
    "ja": "クリア",
    "ko": "지우기",
    "fr": "Effacer",
    "de": "Leeren"
  },
  "dict.note.tab": {
    "zh": "📄 笔记",
    "zh-TW": "📄 筆記",
    "en": "📄 Note",
    "ja": "📄 ノート",
    "ko": "📄 노트",
    "fr": "📄 Note",
    "de": "📄 Notiz"
  },
  "dict.note.gen": {
    "zh": "生成查询笔记",
    "zh-TW": "生成查詢筆記",
    "en": "Generate note",
    "ja": "検索ノートを生成",
    "ko": "검색 노트 생성",
    "fr": "Générer une note",
    "de": "Notiz erzeugen"
  },
  "dict.history.filterPlaceholder": {
    "zh": "筛选历史…",
    "zh-TW": "篩選歷史…",
    "en": "Filter history…",
    "ja": "履歴を絞り込み…",
    "ko": "기록 필터링…",
    "fr": "Filtrer l'historique…",
    "de": "Verlauf filtern…"
  },
  "dict.history.empty": {
    "zh": "暂无记录",
    "zh-TW": "暫無記錄",
    "en": "No records yet",
    "ja": "まだ記録がありません",
    "ko": "아직 기록이 없습니다",
    "fr": "Aucun enregistrement",
    "de": "Noch keine Einträge"
  },
  "dict.history.clear": {
    "zh": "清空历史",
    "zh-TW": "清空歷史",
    "en": "Clear history",
    "ja": "履歴をクリア",
    "ko": "기록 지우기",
    "fr": "Effacer l'historique",
    "de": "Verlauf leeren"
  },
  "dict.manage.title": {
    "zh": "辞典管理 Manage dictionaries",
    "zh-TW": "辭典管理 Manage dictionaries",
    "en": "Manage dictionaries",
    "ja": "辞書管理 Manage dictionaries",
    "ko": "사전 관리 Manage dictionaries",
    "fr": "Gérer les dictionnaires",
    "de": "Wörterbücher verwalten"
  },
  "dict.manage.rescan": {
    "zh": "重新扫描 Rescan",
    "zh-TW": "重新掃描 Rescan",
    "en": "Rescan",
    "ja": "再スキャン Rescan",
    "ko": "다시 스캔 Rescan",
    "fr": "Réanalyser",
    "de": "Erneut scannen"
  },
  "dict.manage.scanning": {
    "zh": "扫描中…",
    "zh-TW": "掃描中…",
    "en": "Scanning…",
    "ja": "スキャン中…",
    "ko": "스캔 중…",
    "fr": "Analyse…",
    "de": "Scanne…"
  },
  "dict.manage.setFolders": {
    "zh": "辞典设置",
    "zh-TW": "辭典設定",
    "en": "Dictionary settings",
    "ja": "辞書設定",
    "ko": "사전 설정",
    "fr": "Paramètres du dictionnaire",
    "de": "Wörterbucheinstellungen"
  },
  "dict.manage.empty": {
    "zh": "尚未加载辞典。请用下方「导入辞典」导入，或把辞典文件放进仓库的 dictionaries/ 后点击「重新扫描」。",
    "zh-TW": "尚未載入辭典。請用下方「匯入辭典」匯入，或把辭典檔案放進倉庫的 dictionaries/ 後點選「重新掃描」。",
    "en": "No dictionaries loaded. Use \"Import dictionary\" below, or put files into dictionaries/ in your vault and click \"Rescan\".",
    "ja": "辞書が読み込まれていません。下の「辞書をインポート」を使うか、保管庫の dictionaries/ にファイルを入れてから「再スキャン」をクリックしてください。",
    "ko": "불러온 사전이 없습니다. 아래 '사전 가져오기'를 사용하거나 보관함의 dictionaries/ 에 파일을 넣은 뒤 '다시 스캔'을 클릭하세요.",
    "fr": "Aucun dictionnaire chargé. Utilisez « Importer un dictionnaire » ci-dessous, ou placez les fichiers dans dictionaries/ du coffre puis cliquez sur « Réanalyser ».",
    "de": "Keine Wörterbücher geladen. Nutzen Sie „Wörterbuch importieren“ unten, oder legen Sie Dateien in dictionaries/ im Vault ab und klicken Sie auf „Erneut scannen“."
  },
  "dict.import.title": {
    "zh": "导入辞典文件",
    "zh-TW": "匯入辭典檔案",
    "ja": "辞書ファイルを取り込む",
    "ko": "사전 파일 가져오기",
    "en": "Import dictionary files",
    "fr": "Importer des fichiers de dictionnaire",
    "de": "Wörterbuchdateien importieren"
  },
  "dict.import.drop": {
    "zh": "把辞典文件拖到这里，或",
    "zh-TW": "把辭典檔案拖到這裡，或",
    "ja": "辞書ファイルをここにドラッグ、または",
    "ko": "사전 파일을 여기에 끌어다 놓거나",
    "en": "Drop dictionary files here, or",
    "fr": "Déposez les fichiers ici, ou",
    "de": "Dateien hierher ziehen oder"
  },
  "dict.import.browseFolder": {
    "zh": "选择文件夹",
    "zh-TW": "選擇資料夾",
    "ja": "フォルダーを選択",
    "ko": "폴더 선택",
    "en": "Browse folder",
    "fr": "Choisir un dossier",
    "de": "Ordner wählen"
  },
  "dict.import.browse": {
    "zh": "选择本地文件",
    "zh-TW": "選擇本機檔案",
    "ja": "ファイルを選択",
    "ko": "파일 선택",
    "en": "Browse files",
    "fr": "Choisir des fichiers",
    "de": "Dateien auswählen"
  },
  "dict.import.hint": {
    "zh": "支持 MDict(.mdx/.mdd)、TEI Lex-0(.lex0.xml)。配套文件请一次全部选中；单文件上限 1 GB，导入后自动扫描。",
    "zh-TW": "支援 MDict(.mdx/.mdd)、TEI Lex-0(.lex0.xml)。配套檔案請一次全部選取；單檔上限 1 GB，匯入後自動掃描。",
    "ja": "MDict(.mdx/.mdd)、TEI Lex-0(.lex0.xml) に対応。セットのファイルはまとめて選択してください。1 ファイル 1 GB まで。取り込み後に自動スキャンします。",
    "ko": "MDict(.mdx/.mdd), TEI Lex-0(.lex0.xml) 지원. 구성 파일은 한 번에 모두 선택하세요. 파일당 최대 1 GB. 가져온 후 자동으로 스캔합니다.",
    "en": "Supports MDict (.mdx/.mdd) and TEI Lex-0 (.lex0.xml). Select all companion files at once; 1 GB per file. A rescan runs automatically after import.",
    "fr": "Prend en charge MDict (.mdx/.mdd) et TEI Lex-0 (.lex0.xml). Sélectionnez tous les fichiers associés en une fois ; 1 Go par fichier. Une analyse automatique suit l'import.",
    "de": "Unterstützt MDict (.mdx/.mdd) und TEI Lex-0 (.lex0.xml). Zusammengehörige Dateien gemeinsam auswählen; 1 GB pro Datei. Nach dem Import wird automatisch gescannt."
  },
  "dict.import.format": {
    "zh": "格式",
    "zh-TW": "格式",
    "ja": "形式",
    "ko": "형식",
    "en": "Format",
    "fr": "Format",
    "de": "Format"
  },
  "dict.import.auto": {
    "zh": "自动检测",
    "zh-TW": "自動偵測",
    "ja": "自動検出",
    "ko": "자동 감지",
    "en": "Auto-detect",
    "fr": "Détection auto",
    "de": "Automatisch erkennen"
  },
  "dict.import.overwrite": {
    "zh": "允许覆盖同名文件",
    "zh-TW": "允許覆蓋同名檔案",
    "ja": "同名ファイルを上書きする",
    "ko": "같은 이름의 파일 덮어쓰기 허용",
    "en": "Allow overwriting existing files",
    "fr": "Autoriser l'écrasement des fichiers existants",
    "de": "Vorhandene Dateien überschreiben"
  },
  "dict.import.run": {
    "zh": "导入并扫描",
    "zh-TW": "匯入並掃描",
    "ja": "取り込んでスキャン",
    "ko": "가져오기 후 스캔",
    "en": "Import & scan",
    "fr": "Importer et analyser",
    "de": "Importieren & scannen"
  },
  "dict.import.running": {
    "zh": "导入中…",
    "zh-TW": "匯入中…",
    "ja": "取り込み中…",
    "ko": "가져오는 중…",
    "en": "Importing…",
    "fr": "Import…",
    "de": "Importiere…"
  },
  "dict.import.done": {
    "zh": "已导入 {n} 个文件 → {dir}",
    "zh-TW": "已匯入 {n} 個檔案 → {dir}",
    "ja": "{n} 個のファイルを取り込みました → {dir}",
    "ko": "파일 {n}개를 가져왔습니다 → {dir}",
    "en": "Imported {n} file(s) → {dir}",
    "fr": "{n} fichier(s) importé(s) → {dir}",
    "de": "{n} Datei(en) importiert → {dir}"
  },
  "dict.import.partial": {
    "zh": "导入完成：{n} 个成功，{m} 个失败",
    "zh-TW": "匯入完成：{n} 個成功，{m} 個失敗",
    "ja": "取り込み完了：{n} 件成功、{m} 件失敗",
    "ko": "가져오기 완료: {n}개 성공, {m}개 실패",
    "en": "Import finished: {n} succeeded, {m} failed",
    "fr": "Import terminé : {n} réussite(s), {m} échec(s)",
    "de": "Import beendet: {n} erfolgreich, {m} fehlgeschlagen"
  },
  "dict.import.skipped": {
    "zh": "已跳过 {n} 个同名文件（未勾选覆盖）",
    "zh-TW": "已跳過 {n} 個同名檔案（未勾選覆蓋）",
    "ja": "同名ファイル {n} 件をスキップしました（上書き未選択）",
    "ko": "같은 이름의 파일 {n}개를 건너뛰었습니다(덮어쓰기 미선택)",
    "en": "Skipped {n} existing file(s) (overwrite not enabled)",
    "fr": "{n} fichier(s) existant(s) ignoré(s) (écrasement désactivé)",
    "de": "{n} vorhandene Datei(en) übersprungen (Überschreiben deaktiviert)"
  },
  "dict.import.err.empty": {
    "zh": "请先选择要导入的辞典文件。",
    "zh-TW": "請先選擇要匯入的辭典檔案。",
    "ja": "取り込む辞書ファイルを選択してください。",
    "ko": "가져올 사전 파일을 먼저 선택하세요.",
    "en": "Please choose dictionary files to import first.",
    "fr": "Veuillez d'abord choisir les fichiers à importer.",
    "de": "Bitte zuerst Wörterbuchdateien auswählen."
  },
  "dict.import.err.tooLarge": {
    "zh": "「{name}」超过 {max} 上限，已拒绝导入。",
    "zh-TW": "「{name}」超過 {max} 上限，已拒絕匯入。",
    "ja": "「{name}」は {max} の上限を超えています。取り込みを拒否しました。",
    "ko": "「{name}」이 {max} 제한을 초과하여 가져오기를 거부했습니다.",
    "en": "“{name}” exceeds the {max} limit — import rejected.",
    "fr": "« {name} » dépasse la limite de {max} — import refusé.",
    "de": "„{name}“ überschreitet das Limit von {max} — Import abgelehnt."
  },
  "dict.import.err.unknownExt": {
    "zh": "「{name}」不是可识别的辞典文件（副档名不符）。",
    "zh-TW": "「{name}」不是可辨識的辭典檔案（副檔名不符）。",
    "ja": "「{name}」は辞書ファイルとして認識できません（拡張子が不正）。",
    "ko": "「{name}」은 인식할 수 있는 사전 파일이 아닙니다(확장자 불일치).",
    "en": "“{name}” is not a recognized dictionary file (unknown extension).",
    "fr": "« {name} » n'est pas un fichier de dictionnaire reconnu (extension inconnue).",
    "de": "„{name}“ ist keine erkannte Wörterbuchdatei (unbekannte Erweiterung)."
  },
  "dict.import.err.wrongFormat": {
    "zh": "「{name}」不属于 {format} 格式，已禁止导入。请改用对应的导入入口。",
    "zh-TW": "「{name}」不屬於 {format} 格式，已禁止匯入。請改用對應的匯入入口。",
    "ja": "「{name}」は {format} 形式ではないため取り込みを禁止しました。正しい入口を使用してください。",
    "ko": "「{name}」은 {format} 형식이 아니므로 가져오기가 금지되었습니다. 해당 가져오기 항목을 사용하세요.",
    "en": "“{name}” is not a {format} file — import blocked. Use the matching import entry.",
    "fr": "« {name} » n'est pas un fichier {format} — import bloqué. Utilisez l'entrée correspondante.",
    "de": "„{name}“ ist keine {format}-Datei — Import blockiert. Bitte den passenden Eintrag nutzen."
  },
  "dict.import.err.unreadable": {
    "zh": "「{name}」无法读取文件内容，已拒绝导入。请重新选择该文件再试。",
    "zh-TW": "「{name}」無法讀取檔案內容，已拒絕匯入。請重新選取該檔案再試。",
    "ja": "「{name}」のファイル内容を読み取れず、取り込みを拒否しました。ファイルを選び直してください。",
    "ko": "「{name}」파일 내용을 읽을 수 없어 가져오기를 거부했습니다. 파일을 다시 선택하세요.",
    "en": "“{name}” could not be read — import rejected. Re-select the file and try again.",
    "fr": "« {name} » n'a pas pu être lu — import refusé. Resélectionnez le fichier et réessayez.",
    "de": "„{name}“ konnte nicht gelesen werden — Import abgelehnt. Datei neu auswählen und erneut versuchen."
  },
  "dict.import.err.contentInvalid": {
    "zh": "「{name}」的内容不是有效的 {format} 辞典文件，已禁止导入。",
    "zh-TW": "「{name}」的內容不是有效的 {format} 辭典檔案，已禁止匯入。",
    "ja": "「{name}」の内容は {format} の辞書ファイルとして無効なため、取り込みを禁止しました。",
    "ko": "「{name}」의 내용이 유효한 {format} 사전 파일이 아니므로 가져오기가 금지되었습니다.",
    "en": "“{name}” is not a valid {format} dictionary file — import blocked.",
    "fr": "Le contenu de « {name} » n'est pas un fichier {format} valide — import bloqué.",
    "de": "Der Inhalt von „{name}“ ist keine gültige {format}-Datei — Import blockiert."
  },
  "dict.import.err.contentMismatch": {
    "zh": "「{name}」的实际内容是 {actual} 格式，与你选择的 {format} 不符，已禁止导入。",
    "zh-TW": "「{name}」的實際內容是 {actual} 格式，與你選擇的 {format} 不符，已禁止匯入。",
    "ja": "「{name}」の実際の内容は {actual} 形式で、選択した {format} と一致しません。取り込みを禁止しました。",
    "ko": "「{name}」의 실제 내용은 {actual} 형식으로, 선택한 {format}과 일치하지 않아 가져오기가 금지되었습니다.",
    "en": "“{name}” is actually {actual}, not {format} — import blocked.",
    "fr": "« {name} » est en réalité {actual}, pas {format} — import bloqué.",
    "de": "„{name}“ ist tatsächlich {actual}, nicht {format} — Import blockiert."
  },
  "dict.import.err.missingRequired": {
    "zh": "{format} 辞典缺少必需文件：{exts}。请把配套文件一起选中。",
    "zh-TW": "{format} 辭典缺少必需檔案：{exts}。請把配套檔案一起選取。",
    "ja": "{format} 辞書に必須ファイルがありません：{exts}。セットのファイルをまとめて選択してください。",
    "ko": "{format} 사전에 필수 파일이 없습니다: {exts}. 구성 파일을 함께 선택하세요.",
    "en": "{format} dictionary is missing required file(s): {exts}. Select the companion files together.",
    "fr": "Il manque des fichiers requis au dictionnaire {format} : {exts}. Sélectionnez les fichiers associés.",
    "de": "Dem {format}-Wörterbuch fehlen erforderliche Dateien: {exts}. Bitte zusammengehörige Dateien auswählen."
  },
  "dict.import.err.mixedFormat": {
    "zh": "一次只能导入一种格式（检测到 {formats}）。请分批导入。",
    "zh-TW": "一次只能匯入一種格式（偵測到 {formats}）。請分批匯入。",
    "ja": "一度に取り込めるのは 1 形式のみです（{formats} を検出）。分割して取り込んでください。",
    "ko": "한 번에 한 형식만 가져올 수 있습니다(감지됨: {formats}). 나누어 가져오세요.",
    "en": "Only one format per import (detected {formats}). Please import them separately.",
    "fr": "Un seul format par import (détecté : {formats}). Importez-les séparément.",
    "de": "Nur ein Format pro Import (erkannt: {formats}). Bitte getrennt importieren."
  },
  "dict.import.err.failed": {
    "zh": "写入失败：{name}（{err}）",
    "zh-TW": "寫入失敗：{name}（{err}）",
    "ja": "書き込み失敗：{name}（{err}）",
    "ko": "쓰기 실패: {name} ({err})",
    "en": "Write failed: {name} ({err})",
    "fr": "Échec d'écriture : {name} ({err})",
    "de": "Schreiben fehlgeschlagen: {name} ({err})"
  },
  "dict.import.fmt.mdict": {
    "zh": "MDict（.mdx ＋ .mdd）",
    "zh-TW": "MDict（.mdx ＋ .mdd）",
    "ja": "MDict（.mdx ＋ .mdd）",
    "ko": "MDict(.mdx + .mdd)",
    "en": "MDict (.mdx + .mdd)",
    "fr": "MDict (.mdx + .mdd)",
    "de": "MDict (.mdx + .mdd)"
  },
  "dict.import.hint.mdict": {
    "zh": "必需 .mdx；.mdd 为可选资源包",
    "zh-TW": "必需 .mdx；.mdd 為可選資源包",
    "ja": ".mdx が必須、.mdd は任意のリソース",
    "ko": ".mdx 필수, .mdd 는 선택 리소스",
    "en": "Requires .mdx; .mdd is an optional resource bundle",
    "fr": ".mdx requis ; .mdd est un paquet de ressources optionnel",
    "de": ".mdx erforderlich; .mdd ist ein optionales Ressourcenpaket"
  },
  "dict.import.fmt.teiLex0": {
    "zh": "TEI Lex-0（.lex0.xml）",
    "zh-TW": "TEI Lex-0（.lex0.xml）",
    "ja": "TEI Lex-0（.lex0.xml）",
    "ko": "TEI Lex-0(.lex0.xml)",
    "en": "TEI Lex-0 (.lex0.xml)",
    "fr": "TEI Lex-0 (.lex0.xml)",
    "de": "TEI Lex-0 (.lex0.xml)"
  },
  "dict.import.hint.teiLex0": {
    "zh": "TEI Lex-0 辞典 XML（重命名为 .lex0.xml 后扫描自动挂载）",
    "zh-TW": "TEI Lex-0 辭典 XML（重新命名為 .lex0.xml 後掃描自動掛載）",
    "ja": "TEI Lex-0 辞書 XML（.lex0.xml にリネームするとスキャンで自動マウント）",
    "ko": "TEI Lex-0 사전 XML(.lex0.xml로 이름 변경 후 자동 스캔)",
    "en": "TEI Lex-0 dictionary XML (rename to .lex0.xml for auto-scan)",
    "fr": "XML de dictionnaire TEI Lex-0 (renommer en .lex0.xml pour le scan auto)",
    "de": "TEI Lex-0 Wörterbuch-XML (zu .lex0.xml umbenennen für Auto-Scan)"
  },
  "dict.import.supplement": {
    "zh": "资料管理（补录）",
    "zh-TW": "資料管理（補錄）",
    "ja": "データ管理（追加取り込み）",
    "ko": "자료 관리(추가 가져오기)",
    "en": "Manage data (add files)",
    "fr": "Gérer les données (ajouter)",
    "de": "Daten verwalten (hinzufügen)"
  },
  "dict.import.supplementHint": {
    "zh": "为「{name}」补录 {format} 格式的资料文件，写入 {dir}",
    "zh-TW": "為「{name}」補錄 {format} 格式的資料檔案，寫入 {dir}",
    "ja": "「{name}」に {format} 形式のファイルを追加します（保存先 {dir}）",
    "ko": "「{name}」에 {format} 형식 파일을 추가합니다(저장 위치 {dir})",
    "en": "Add {format} data files for “{name}” — written to {dir}",
    "fr": "Ajouter des fichiers {format} pour « {name} » — dans {dir}",
    "de": "{format}-Dateien für „{name}“ hinzufügen — nach {dir}"
  },
  "dict.manage.ungrouped": {
    "zh": "（未分组）",
    "zh-TW": "（未分組）",
    "en": "(ungrouped)",
    "ja": "（未分類）",
    "ko": "(미분류)",
    "fr": "(non groupé)",
    "de": "(nicht gruppiert)"
  },
  "dict.manage.renameGroup": {
    "zh": "重命名组 Rename group",
    "zh-TW": "重命名組 Rename group",
    "en": "Rename group",
    "ja": "グループ名を変更 Rename group",
    "ko": "그룹 이름 변경 Rename group",
    "fr": "Renommer le groupe",
    "de": "Gruppe umbenennen"
  },
  "dict.manage.deleteGroup": {
    "zh": "删除组 Remove group",
    "zh-TW": "刪除組 Remove group",
    "en": "Delete group",
    "ja": "グループを削除 Remove group",
    "ko": "그룹 삭제 Remove group",
    "fr": "Supprimer le groupe",
    "de": "Gruppe löschen"
  },
  "dict.manage.selected": {
    "zh": "✓ 已选",
    "zh-TW": "✓ 已選",
    "en": "✓ Selected",
    "ja": "✓ 選択済み",
    "ko": "✓ 선택됨",
    "fr": "✓ Sélectionné",
    "de": "✓ Ausgewählt"
  },
  "dict.manage.select": {
    "zh": "选择",
    "zh-TW": "選擇",
    "en": "Select",
    "ja": "選択",
    "ko": "선택",
    "fr": "Sélectionner",
    "de": "Auswählen"
  },
  "dict.manage.moveDown": {
    "zh": "下移 Move down",
    "zh-TW": "下移 Move down",
    "en": "Move down",
    "ja": "下へ Move down",
    "ko": "아래로 Move down",
    "fr": "Descendre",
    "de": "Nach unten"
  },
  "dict.manage.deleteDict": {
    "zh": "删除辞典 Delete…",
    "zh-TW": "刪除辭典 Delete…",
    "en": "Delete dictionary…",
    "ja": "辞書を削除…",
    "ko": "사전 삭제…",
    "fr": "Supprimer le dictionnaire…",
    "de": "Wörterbuch löschen…"
  },
  "dict.manage.deleteConfirm": {
    "zh": "删除辞典「{name}」",
    "zh-TW": "刪除辭典「{name}」",
    "en": "Delete dictionary “{name}”",
    "ja": "辞書「{name}」を削除",
    "ko": "사전 “{name}” 삭제",
    "fr": "Supprimer le dictionnaire « {name} »",
    "de": "Wörterbuch „{name}“ löschen"
  },
  "dict.manage.deleteConfirmNote": {
    "zh": "将把 {n} 个文件移到系统回收站，并移除该辞典的条目；可在回收站中还原。",
    "zh-TW": "這會把 {n} 個檔案移到系統回收站，並移除該辭典的條目；可在回收站中還原。",
    "en": "This moves {n} files to the system trash and removes this dictionary's entries; you can restore them from the trash.",
    "ja": "{n} 個のファイルをゴミ箱に移動し、この辞書の項目も削除します。ゴミ箱から復元できます。",
    "ko": "{n}개 파일을 시스템 휴지통으로 이동하고 이 사전의 항목도 삭제합니다. 휴지통에서 복원할 수 있습니다.",
    "fr": "Cela déplacera {n} fichiers vers la corbeille et supprimera les entrées de ce dictionnaire ; vous pouvez les restaurer depuis la corbeille.",
    "de": "Dadurch werden {n} Dateien in den Papierkorb verschoben und die Einträge dieses Wörterbuchs entfernt; sie können aus dem Papierkorb wiederhergestellt werden."
  },
  "dict.manage.deleteBtn": {
    "zh": "删除",
    "zh-TW": "刪除",
    "en": "Delete",
    "ja": "削除",
    "ko": "삭제",
    "fr": "Supprimer",
    "de": "Löschen"
  },
  "dict.manage.displayName": {
    "zh": "显示名 Display name",
    "zh-TW": "顯示名 Display name",
    "en": "Display name",
    "ja": "表示名 Display name",
    "ko": "표시 이름 Display name",
    "fr": "Nom d'affichage",
    "de": "Anzeigename"
  },
  "dict.manage.group": {
    "zh": "分组 Group",
    "zh-TW": "分組 Group",
    "en": "Group",
    "ja": "グループ Group",
    "ko": "그룹 Group",
    "fr": "Groupe",
    "de": "Gruppe"
  },
  "dict.manage.groupPlaceholder": {
    "zh": "输入或选择分组",
    "zh-TW": "輸入或選擇分組",
    "en": "Type or pick a group",
    "ja": "グループを入力または選択",
    "ko": "그룹을 입력하거나 선택",
    "fr": "Saisissez ou choisissez un groupe",
    "de": "Gruppe eingeben oder auswählen"
  },
  "dict.manage.savedGroup": {
    "zh": "已保存分组",
    "zh-TW": "已儲存分組",
    "en": "Group saved",
    "ja": "グループを保存しました",
    "ko": "그룹을 저장했습니다",
    "fr": "Groupe enregistré",
    "de": "Gruppe gespeichert"
  },
  "dict.manage.info.id": {
    "zh": "内部 ID",
    "zh-TW": "內部 ID",
    "en": "Internal ID",
    "ja": "内部 ID",
    "ko": "내부 ID",
    "fr": "Identifiant interne",
    "de": "Interne ID"
  },
  "dict.manage.info.format": {
    "zh": "格式",
    "zh-TW": "格式",
    "en": "Format",
    "ja": "形式",
    "ko": "형식",
    "fr": "Format",
    "de": "Format"
  },
  "dict.manage.info.entries": {
    "zh": "词条数",
    "zh-TW": "詞條數",
    "en": "Entries",
    "ja": "項目数",
    "ko": "항목 수",
    "fr": "Entrées",
    "de": "Einträge"
  },
  "dict.manage.info.mdd": {
    "zh": "MDD 资源条目",
    "zh-TW": "MDD 資源條目",
    "en": "MDD assets",
    "ja": "MDD リソース項目",
    "ko": "MDD 리소스 항목",
    "fr": "Ressources MDD",
    "de": "MDD-Ressourcen"
  },
  "dict.manage.info.source": {
    "zh": "源文件",
    "zh-TW": "來源檔案",
    "en": "Source files",
    "ja": "ソースファイル",
    "ko": "원본 파일",
    "fr": "Fichiers sources",
    "de": "Quelldateien"
  },
  "dict.manage.info.desc": {
    "zh": "描述 Description",
    "zh-TW": "描述 Description",
    "en": "Description",
    "ja": "説明 Description",
    "ko": "설명 Description",
    "fr": "Description",
    "de": "Beschreibung"
  },
  "dict.manage.mdxHeader": {
    "zh": "MDX 头信息（只读）",
    "zh-TW": "MDX 標頭資訊（唯讀）",
    "en": "MDX header (read-only)",
    "ja": "MDX ヘッダ情報（読み取り専用）",
    "ko": "MDX 헤더 정보(읽기 전용)",
    "fr": "En-tête MDX (lecture seule)",
    "de": "MDX-Kopf (schreibgeschützt)"
  },
  "dict.manage.back": {
    "zh": "← 返回管理",
    "zh-TW": "← 返回管理",
    "en": "← Back to manage",
    "ja": "← 管理に戻る",
    "ko": "← 관리로 돌아가기",
    "fr": "← Retour à la gestion",
    "de": "← Zurück zur Verwaltung"
  },
  "dict.manage.searching": {
    "zh": "搜索中…",
    "zh-TW": "搜尋中…",
    "en": "Searching…",
    "ja": "検索中…",
    "ko": "검색 중…",
    "fr": "Recherche…",
    "de": "Suche…"
  },
  "dict.manage.cancel": {
    "zh": "取消 Cancel",
    "zh-TW": "取消 Cancel",
    "en": "Cancel",
    "ja": "キャンセル Cancel",
    "ko": "취소 Cancel",
    "fr": "Annuler",
    "de": "Abbrechen"
  },
  "dict.manage.sample50": {
    "zh": "🎲 抽样 50",
    "zh-TW": "🎲 抽樣 50",
    "en": "🎲 Sample 50",
    "ja": "🎲 50 件抽出",
    "ko": "🎲 50개 추출",
    "fr": "🎲 Échantillon 50",
    "de": "🎲 50 Stichproben"
  },
  "dict.ft.tag.match": {
    "zh": "词条匹配",
    "zh-TW": "詞條匹配",
    "en": "Entry match",
    "ja": "項目一致",
    "ko": "항목 일치",
    "fr": "Correspondance d'entrée",
    "de": "Eintragstreffer"
  },
  "dict.tab.dict": {
    "zh": "辞典",
    "zh-TW": "辭典",
    "en": "Dictionary",
    "ja": "辞書",
    "ko": "사전",
    "fr": "Dictionnaire",
    "de": "Wörterbuch"
  },
  "dict.entryJump.miss": {
    "zh": "本辞典中找不到词条「{word}」",
    "zh-TW": "本辭典中找不到詞條「{word}」",
    "en": "Entry \"{word}\" not found in this dictionary",
    "ja": "この辞書に項目「{word}」が見つかりません",
    "ko": "이 사전에서 항목 \"{word}\"을(를) 찾을 수 없습니다",
    "fr": "Entrée « {word} » introuvable dans ce dictionnaire",
    "de": "Eintrag \"{word}\" in diesem Wörterbuch nicht gefunden"
  },
  "dict.results": {
    "zh": "{n} 条结果 · {d} 部辞典",
    "zh-TW": "{n} 條結果 · {d} 部辭典",
    "en": "{n} results · {d} dictionaries",
    "ja": "{n} 件の結果 · {d} 辞書",
    "ko": "{n}개 결과 · {d}개 사전",
    "fr": "{n} résultats · {d} dictionnaires",
    "de": "{n} Ergebnisse · {d} Wörterbücher"
  },
  "dict.lookup.noneInDict": {
    "zh": "在已启用的辞典中找不到「{word}」",
    "zh-TW": "在已啟用的辭典中找不到「{word}」",
    "en": "Not found in enabled dictionaries: \"{word}\"",
    "ja": "有効な辞書に見つかりません: 「{word}」",
    "ko": "활성화된 사전에서 찾을 수 없음: \"{word}\"",
    "fr": "Introuvable dans les dictionnaires activés : « {word} »",
    "de": "In aktivierten Wörterbüchern nicht gefunden: „{word}“"
  },
  "dict.share.saved": {
    "zh": "已保存分享图片 {file}",
    "zh-TW": "已儲存分享圖片 {file}",
    "en": "Saved share image {file}",
    "ja": "共有画像を保存しました {file}",
    "ko": "공유 이미지를 저장했습니다 {file}",
    "fr": "Image de partage enregistrée {file}",
    "de": "Freigabebild gespeichert {file}"
  },
  "dict.note.saved": {
    "zh": "已保存笔记 {file}",
    "zh-TW": "已儲存筆記 {file}",
    "en": "Saved note {file}",
    "ja": "ノートを保存しました {file}",
    "ko": "노트를 저장했습니다 {file}",
    "fr": "Note enregistrée {file}",
    "de": "Notiz gespeichert {file}"
  },
  /* 語料——勾選檔案夾中的指定檔案載入 */
  "dict.ft.resultsTotal": {
    "zh": "共 {n} 条匹配",
    "zh-TW": "共 {n} 條匹配",
    "en": "Total {n} matches",
    "ja": "合計 {n} 件の一致",
    "ko": "총 {n}개 일치",
    "fr": "Total {n} correspondances",
    "de": "Insgesamt {n} Treffer"
  },
  "dict.ft.showAll": {
    "zh": "显示全部 {n} 条",
    "zh-TW": "顯示全部 {n} 條",
    "en": "Show all {n}",
    "ja": "すべて表示（{n} 件）",
    "ko": "전체 {n}개 표시",
    "fr": "Afficher les {n} résultats",
    "de": "Alle {n} anzeigen"
  },
  "dict.ft.badRegex": {
    "zh": "正则表达式语法错误：{err}",
    "zh-TW": "正規表達式語法錯誤：{err}",
    "en": "Invalid regular expression: {err}",
    "ja": "正規表現の構文エラー：{err}",
    "ko": "정규식 구문 오류: {err}",
    "fr": "Expression régulière invalide : {err}",
    "de": "Ungültiger regulärer Ausdruck: {err}"
  },
  "dict.ft.unsafeRegex": {
    "zh": "正则含嵌套量词等高危结构，可能导致搜索卡死，已拒绝执行；请简化表达式",
    "zh-TW": "正規式含巢狀量詞等高危結構，可能導致搜尋卡死，已拒絕執行；請簡化表達式",
    "en": "Regex contains nested quantifiers or similar high-risk structures that could freeze the search — rejected. Please simplify it.",
    "ja": "正規表現にネストした量詞などの危険な構造があり検索が停止する恐れがあるため、実行を拒否しました。式を簡略化してください。",
    "ko": "정규식에 중첩 수량자 등 위험한 구조가 있어 검색이 멈출 수 있습니다. 실행을 거부했으니 식을 단순화하세요.",
    "fr": "L'expression régulière contient des quantificateurs imbriqués ou d'autres structures à risque pouvant bloquer la recherche — rejetée. Veuillez la simplifier.",
    "de": "Der reguläre Ausdruck enthält verschachtelte Quantifikatoren oder ähnliche riskante Strukturen, die die Suche einfrieren könnten — abgelehnt. Bitte vereinfachen Sie ihn."
  },
  "dict.ft.regexTooLong": {
    "zh": "正则表达式过长（上限 500 字符）",
    "zh-TW": "正規表達式過長（上限 500 字元）",
    "en": "Regular expression too long (limit 500 characters)",
    "ja": "正規表現が長すぎます（上限 500 文字）",
    "ko": "정규식이 너무 깁니다(최대 500자)",
    "fr": "Expression régulière trop longue (limite de 500 caractères)",
    "de": "Regulärer Ausdruck zu lang (Grenze 500 Zeichen)"
  },
  "dict.ft.exportCsv": {
    "zh": "导出 CSV",
    "zh-TW": "匯出 CSV",
    "en": "Export CSV",
    "ja": "CSV をエクスポート",
    "ko": "CSV 내보내기",
    "fr": "Exporter CSV",
    "de": "CSV exportieren"
  },
  "dict.ft.exportMd": {
    "zh": "导出 Markdown",
    "zh-TW": "匯出 Markdown",
    "en": "Export Markdown",
    "ja": "Markdown をエクスポート",
    "ko": "Markdown 내보내기",
    "fr": "Exporter Markdown",
    "de": "Markdown exportieren"
  },
  "dict.ft.noMatch": {
    "zh": "在当前搜索范围的辞典中没有找到「{query}」",
    "zh-TW": "在當前搜尋範圍的辭典中沒有找到「{query}」",
    "en": "No matches in the current search scope: \"{query}\"",
    "ja": "現在の検索範囲の辞書に一致なし: 「{query}」",
    "ko": "현재 검색 범위의 사전에서 일치 없음: \"{query}\"",
    "fr": "Aucune correspondance dans le périmètre de recherche actuel : « {query} »",
    "de": "Keine Treffer im aktuellen Suchbereich: „{query}“"
  },
  "dict.manage.sampled": {
    "zh": "已随机抽样 {n} 条",
    "zh-TW": "已隨機抽樣 {n} 條",
    "en": "Randomly sampled {n} entries",
    "ja": "{n} 項目をランダム抽出しました",
    "ko": "{n}개 항목을 무작위 추출했습니다",
    "fr": "{n} entrées échantillonnées aléatoirement",
    "de": "{n} Einträge zufällig entnommen"
  },
  "dict.manage.exportCsv": {
    "zh": "已导出 CSV {file}",
    "zh-TW": "已匯出 CSV {file}",
    "en": "Exported CSV {file}",
    "ja": "CSV を書き出しました {file}",
    "ko": "CSV를 내보냈습니다 {file}",
    "fr": "CSV exporté {file}",
    "de": "CSV exportiert {file}"
  },
  "dict.manage.exportMd": {
    "zh": "已导出 Markdown {file}",
    "zh-TW": "已匯出 Markdown {file}",
    "en": "Exported Markdown {file}",
    "ja": "Markdown を書き出しました {file}",
    "ko": "Markdown을 내보냈습니다 {file}",
    "fr": "Markdown exporté {file}",
    "de": "Markdown exportiert {file}"
  },
  "dict.manage.infoTitle": {
    "zh": "辞典信息 · {name}",
    "zh-TW": "辭典訊息 · {name}",
    "en": "Dictionary info · {name}",
    "ja": "辞書情報 · {name}",
    "ko": "사전 정보 · {name}",
    "fr": "Informations du dictionnaire · {name}",
    "de": "Wörterbuch-Info · {name}"
  },
  "dict.manage.assetsExtracted": {
    "zh": "已提取资源 ({n})",
    "zh-TW": "已提取資源 ({n})",
    "en": "Extracted assets ({n})",
    "ja": "リソースを抽出しました ({n})",
    "ko": "리소스를 추출했습니다 ({n})",
    "fr": "Ressources extraites ({n})",
    "de": "Ressourcen extrahiert ({n})"
  },
  "dict.manage.fulltextTitle": {
    "zh": "全文搜索: {query}",
    "zh-TW": "全文搜尋: {query}",
    "en": "Full-text search: {query}",
    "ja": "全文検索: {query}",
    "ko": "전문 검색: {query}",
    "fr": "Recherche plein texte : {query}",
    "de": "Volltextsuche: {query}"
  },
  "dict.unit.entries": {
    "zh": "词条",
    "zh-TW": "詞條",
    "en": "entries",
    "ja": "項目",
    "ko": "항목",
    "fr": "entrées",
    "de": "Einträge"
  },
  "dict.unit.assets": {
    "zh": "资源",
    "zh-TW": "資源",
    "en": "assets",
    "ja": "リソース",
    "ko": "리소스",
    "fr": "ressources",
    "de": "Ressourcen"
  },
  "dict.unit.dicts": {
    "zh": "部",
    "zh-TW": "部",
    "en": "dicts",
    "ja": "辞書",
    "ko": "사전",
    "fr": "dictionnaires",
    "de": "Wörterbücher"
  },
  "dict.chip.title": {
    "zh": "{format} · {n} 词条\n点击切换选中；长按/右键菜单可管理",
    "zh-TW": "{format} · {n} 詞條\n點選切換選取；長按/右鍵選單可管理",
    "en": "{format} · {n} entries\nClick to toggle selection; long-press/right-click to manage",
    "ja": "{format} · {n} 項目\nクリックで選択を切替；長押し/右クリックで管理",
    "ko": "{format} · {n}개 항목\n클릭해 선택 전환; 길게 누르기/오른쪽 클릭으로 관리",
    "fr": "{format} · {n} entrées\nCliquez pour basculer la sélection ; appui long/clic droit pour gérer",
    "de": "{format} · {n} Einträge\nKlicken zum Umschalten der Auswahl; lange drücken/rechtsklicken zum Verwalten"
  },
  "dict.scan.loaded": {
    "zh": "已加载 {n} 部辞典 · {n} dictionaries loaded",
    "zh-TW": "已載入 {n} 部辭典 · {n} dictionaries loaded",
    "en": "Loaded {n} dictionaries · {n} dictionaries loaded",
    "ja": "{n} 件の辞書を読み込みました · {n} dictionaries loaded",
    "ko": "사전 {n}개 불러옴 · {n} dictionaries loaded",
    "fr": "{n} dictionnaires chargés · {n} dictionaries loaded",
    "de": "{n} Wörterbücher geladen · {n} dictionaries loaded"
  },
  "dict.scan.largeMdd": {
    "zh": "「{name}」资源文件较大（{mb} MB），导入中请稍候…",
    "zh-TW": "「{name}」資源檔較大（{mb} MB），導入中請稍候…",
    "en": "\"{name}\" resource file is large ({mb} MB), importing…",
    "ja": "「{name}」のリソースは大きいです（{mb} MB）、読み込み中…",
    "ko": "\"{name}\" 리소스 파일이 큽니다({mb} MB), 가져오는 중…",
    "fr": "« {name} » : fichier de ressources volumineux ({mb} Mo), import…",
    "de": "„{name}“: große Ressourcendatei ({mb} MB), Import läuft…"
  },
  "dict.scan.loadProgress": {
    "zh": "正在加载「{name}」：{phase} {done}/{total}…",
    "zh-TW": "正在載入「{name}」：{phase} {done}/{total}…",
    "en": "Loading \"{name}\": {phase} {done}/{total}…",
    "ja": "「{name}」を読み込み中：{phase} {done}/{total}…",
    "ko": "\"{name}\" 불러오는 중: {phase} {done}/{total}…",
    "fr": "Chargement de « {name} » : {phase} {done}/{total}…",
    "de": "„{name}“ wird geladen: {phase} {done}/{total}…"
  },
  "dict.scan.failed": {
    "zh": "导入失败 {name}: {err}",
    "zh-TW": "匯入失敗 {name}: {err}",
    "en": "Import failed {name}: {err}",
    "ja": "読み込み失敗 {name}: {err}",
    "ko": "가져오기 실패 {name}: {err}",
    "fr": "Échec de l'import {name} : {err}",
    "de": "Import fehlgeschlagen {name}: {err}"
  },
  "dict.removed": {
    "zh": "已移除辞典 {name}",
    "zh-TW": "已移除辭典 {name}",
    "en": "Removed dictionary {name}",
    "ja": "辞書 {name} を削除しました",
    "ko": "사전 {name}을(를) 제거했습니다",
    "fr": "Dictionnaire {name} supprimé",
    "de": "Wörterbuch {name} entfernt"
  },
  "dict.set.fmt.colFormat": {
    "zh": "格式",
    "zh-TW": "格式",
    "en": "Format",
    "ja": "形式",
    "ko": "형식",
    "fr": "Format",
    "de": "Format"
  },
  "dict.set.fmt.colFiles": {
    "zh": "所需文件",
    "zh-TW": "所需檔案",
    "en": "Required files",
    "ja": "必要なファイル",
    "ko": "필요한 파일",
    "fr": "Fichiers requis",
    "de": "Erforderliche Dateien"
  },
  "dict.set.fmt.colNote": {
    "zh": "说明",
    "zh-TW": "說明",
    "en": "Notes",
    "ja": "備考",
    "ko": "비고",
    "fr": "Remarques",
    "de": "Hinweise"
  },

  // ---------------------------------------------------------------- 辭典面板
  "dict.tab.translit": {
    "zh": "转写",
    "zh-TW": "轉寫",
    "en": "Transliteration",
    "ja": "転写",
    "ko": "전사",
    "fr": "Translittération",
    "de": "Transkription"
  },
  "dict.translit.experimentalNote": {
    "zh": "实验性功能，近似值映射，待完善…",
    "zh-TW": "實驗性功能，近似映射，待完善⋯",
    "en": "Experimental feature — approximate mapping, work in progress…",
    "ja": "実験的機能（近似マッピング、改善中…）",
    "ko": "실험적 기능 (근사 매핑, 개선 중…)",
    "fr": "Fonction expérimentale — correspondance approximative, en cours…",
    "de": "Experimentelle Funktion – Näherungsmapping, in Arbeit…"
  },
  "dict.collation.translit": {
    "zh": "仅供参考",
    "zh-TW": "僅供參考",
    "en": "For reference only",
    "ja": "参考用",
    "ko": "참고용",
    "fr": "Pour référence",
    "de": "Nur zur Referenz"
  },
  "dict.collation.sandhi": {
    "zh": "连声合成（Pāṇini 子集）",
    "zh-TW": "連聲合成（Pāṇini 子集）",
    "en": "Sandhi composer (Pāṇini subset)",
    "ja": "サンディ合成（Pāṇini 部分集合）",
    "ko": "산디 합성(Pāṇini 부분집합)",
    "fr": "Composition sandhi (sous-ensemble Pāṇini)",
    "de": "Sandhi-Komposition (Pāṇini-Teilmenge)"
    },
  // 辭典管理・分組操作路徑（重命名／移動到分組）
  "dict.chip.close": {
    "zh": "取消",
    "zh-TW": "取消",
    "ja": "キャンセル",
    "ko": "취소",
    "en": "Cancel",
    "fr": "Annuler",
    "de": "Abbrechen",
    },
  "dict.manage.renameGroupPrompt": {
    "zh": "输入新的分组名称",
    "zh-TW": "輸入新的分組名稱",
    "ja": "新しいグループ名を入力",
    "ko": "새 그룹 이름 입력",
    "en": "Enter a new group name",
    "fr": "Saisir le nouveau nom de groupe",
    "de": "Neuen Gruppennamen eingeben",
    },
  "dict.manage.moveToGroup": {
    "zh": "移动到分组",
    "zh-TW": "移動到分組",
    "ja": "グループへ移動",
    "ko": "그룹으로 이동",
    "en": "Move to group",
    "fr": "Déplacer vers le groupe",
    "de": "In Gruppe verschieben",
    },
  "dict.collation.sandhiFirst": {
    "zh": "前词（IAST）",
    "zh-TW": "前詞（IAST）",
    "en": "First word (IAST)",
    "ja": "前語（IAST）",
    "ko": "앞 낱말(IAST)",
    "fr": "Premier mot (IAST)",
    "de": "Erstes Wort (IAST)"
    },
  "dict.collation.sandhiSecond": {
    "zh": "后词（IAST）",
    "zh-TW": "後詞（IAST）",
    "en": "Second word (IAST)",
    "ja": "後語（IAST）",
    "ko": "뒤 낱말(IAST)",
    "fr": "Second mot (IAST)",
    "de": "Zweites Wort (IAST)"
    },
  "dict.collation.sandhiJoin": {
    "zh": "合成",
    "zh-TW": "合成",
    "en": "Join",
    "ja": "合成",
    "ko": "합성",
    "fr": "Composer",
    "de": "Verbinden"
    },
  "dict.collation.sandhiCopy": {
    "zh": "复制合成结果",
    "zh-TW": "複製合成結果",
    "en": "Copy result",
    "ja": "結果をコピー",
    "ko": "결과 복사",
    "fr": "Copier le résultat",
    "de": "Ergebnis kopieren"
  },
  "dict.collation.sandhiLookup": {
    "zh": "查询合成结果",
    "zh-TW": "查詢合成結果",
    "en": "Look up result",
    "ja": "合成結果を検索",
    "ko": "합성 결과 조회",
    "fr": "Rechercher le résultat",
    "de": "Ergebnis nachschlagen"
    },
  "dict.collation.sandhiHint": {
    "zh": "输入两词即时合成外部连声；未命中规则时保守拼接",
    "zh-TW": "輸入兩詞即時合成外部連聲；未命中規則時保守拼接",
    "en": "Join two words with external sandhi; falls back to plain concatenation when no rule matches",
    "ja": "2語を入力すると外部サンディを合成します。規則が一致しない場合は単純連結",
    "ko": "두 단어를 입력하면 외부 산디를 합성합니다. 규칙이 없으면 단순 연결",
    "fr": "Compose le sandhi externe de deux mots ; concaténation simple si aucune règle",
    "de": "Verbindet zwei Wörter mit externem Sandhi; ohne Regel einfache Verkettung"
    },
  "dict.collation.sandhiDemoTitle": {
    "zh": "示范（点卡填入）",
    "zh-TW": "示範（點卡填入）",
    "en": "Examples (click a card to fill)",
    "ja": "例（カードで入力）",
    "ko": "예시(카드로 입력)",
    "fr": "Exemples (cliquer pour remplir)",
    "de": "Beispiele (Klicken zum Einfügen)"
    },
  "dict.collation.translitDir": {
    "zh": "方向",
    "zh-TW": "方向",
    "en": "Direction",
    "ja": "方向",
    "ko": "방향",
    "fr": "Direction",
    "de": "Richtung"
  },
  "dict.collation.translitToNative": {
    "zh": "拉丁文 → 原生文字",
    "zh-TW": "拉丁文 → 原生文字",
    "en": "Roman → native script",
    "ja": "ローマ字 → 原文字",
    "ko": "로마자 → 원문자",
    "fr": "Latin → écriture d'origine",
    "de": "Lateinisch → Originalschrift"
  },
  "dict.collation.translitToRoman": {
    "zh": "原生文字 → 拉丁文",
    "zh-TW": "原生文字 → 拉丁文",
    "en": "Native script → roman",
    "ja": "原文字 → ローマ字",
    "ko": "원문자 → 로마자",
    "fr": "Écriture d'origine → latin",
    "de": "Originalschrift → Lateinisch"
  },
  "dict.collation.translitScheme": {
    "zh": "方案",
    "zh-TW": "方案",
    "en": "Scheme",
    "ja": "方式",
    "ko": "방식",
    "fr": "Schéma",
    "de": "Schema"
  },
  "dict.collation.translitAuto": {
    "zh": "— 自动识别 —",
    "zh-TW": "— 自動辨識 —",
    "en": "— Detect automatically —",
    "ja": "— 自動判別 —",
    "ko": "— 자동 감지 —",
    "fr": "— Détection automatique —",
    "de": "— Automatisch erkennen —"
  },
  "dict.collation.translitRun": {
    "zh": "转写全文",
    "zh-TW": "轉寫全文",
    "en": "Transliterate all",
    "ja": "全文を転写",
    "ko": "전문 전사",
    "fr": "Translitérer tout",
    "de": "Alles transliterieren"
  },
  "dict.collation.translitStats": {
    "zh": "{w} 词 · 转写 {c} · 略过 {s} · {ms}ms",
    "zh-TW": "{w} 詞 · 轉寫 {c} · 略過 {s} · {ms}ms",
    "en": "{w} words · {c} transliterated · {s} skipped · {ms}ms",
    "ja": "{w} 語 · 転写 {c} · スキップ {s} · {ms}ms",
    "ko": "{w}단어 · 전사 {c} · 건너뜀 {s} · {ms}ms",
    "fr": "{w} mots · {c} translittérés · {s} ignorés · {ms}ms",
    "de": "{w} Wörter · {c} transliteriert · {s} übersprungen · {ms}ms"
  },
  "dict.collation.translitCopy": {
    "zh": "复制",
    "zh-TW": "複製",
    "en": "Copy",
    "ja": "コピー",
    "ko": "복사",
    "fr": "Copier",
    "de": "Kopieren"
  },
  "dict.translit.pickFirst": {
    "zh": "请先选择转写方案",
    "zh-TW": "請先選擇轉寫方案",
    "en": "Pick a transliteration scheme first",
    "ja": "先に転写方式を選択してください",
    "ko": "먼저 전사 방식을 선택하세요",
    "fr": "Choisissez d'abord un schéma de translittération",
    "de": "Bitte zuerst ein Transliterationsschema wählen"
  },
  "dict.translit.export": {
    "zh": "导出 MD",
    "zh-TW": "匯出 MD",
    "en": "Export MD",
    "ja": "MD書き出し",
    "ko": "MD 내보내기",
    "fr": "Exporter MD",
    "de": "Als MD exportieren"
  },
  "dict.translit.saved": {
    "zh": "转写已保存 {file}",
    "zh-TW": "轉寫已儲存 {file}",
    "en": "Transliteration saved {file}",
    "ja": "転写を保存しました {file}",
    "ko": "전사를 저장했습니다 {file}",
    "fr": "Translittération enregistrée {file}",
    "de": "Transkription gespeichert {file}"
  },
  /* 轉寫匯出勾選面板（原文/輸出可分可合） */
  "dict.translit.export.includeSrc": {
    "zh": "原文（粘贴框）",
    "zh-TW": "原文（粘貼區）",
    "en": "Source text (paste box)",
    "ja": "原文（貼り付け欄）",
    "ko": "원문(붙여넣기 상자)",
    "fr": "Texte source (zone de collage)",
    "de": "Quelltext (Einfügefeld)"
  },
  "dict.translit.export.includeOut": {
    "zh": "转写输出",
    "zh-TW": "轉寫輸出",
    "en": "Transliteration output",
    "ja": "転写出力",
    "ko": "전사 출력",
    "fr": "Sortie de translittération",
    "de": "Transliterationsausgabe"
  },
  "dict.translit.export.confirm": {
    "zh": "确认导出",
    "zh-TW": "確認匯出",
    "en": "Export",
    "ja": "書き出す",
    "ko": "내보내기",
    "fr": "Exporter",
    "de": "Exportieren"
  },
  "dict.translit.export.cancel": {
    "zh": "取消",
    "zh-TW": "取消",
    "en": "Cancel",
    "ja": "キャンセル",
    "ko": "취소",
    "fr": "Annuler",
    "de": "Abbrechen"
  },
  "dict.translit.export.empty": {
    "zh": "还没有可导出的内容——先填入文本或完成一次转写",
    "zh-TW": "還沒有可匯出的內容——先填入文本或完成一次轉寫",
    "en": "Nothing to export yet — enter some text or run a transliteration first.",
    "ja": "まだ書き出せる内容がありません。先にテキストを入力するか転写を実行してください。",
    "ko": "아직 내보낼 내용이 없습니다. 먼저 텍스트를 입력하거나 전사를 실행하세요.",
    "fr": "Rien à exporter pour l'instant — saisissez du texte ou lancez une translittération.",
    "de": "Noch nichts zu exportieren — geben Sie zuerst Text ein oder starten Sie eine Transliteration."
  },
  "dict.translit.export.pick": {
    "zh": "请至少勾选一项内容再导出",
    "zh-TW": "請至少勾選一項內容再匯出",
    "en": "Select at least one item to export",
    "ja": "書き出す項目を少なくとも1つ選んでください",
    "ko": "내보낼 항목을 최소 하나 선택하세요",
    "fr": "Sélectionnez au moins un élément à exporter",
    "de": "Bitte mindestens einen Eintrag zum Export auswählen"
  },
  "dict.translit.export.secSrc": {
    "zh": "原文",
    "zh-TW": "原文",
    "en": "Source text",
    "ja": "原文",
    "ko": "원문",
    "fr": "Texte source",
    "de": "Quelltext"
  },
  "dict.translit.export.secOut": {
    "zh": "转写输出",
    "zh-TW": "轉寫輸出",
    "en": "Transliteration output",
    "ja": "転写出力",
    "ko": "전사 출력",
    "fr": "Sortie de translittération",
    "de": "Transliterationsausgabe"
  },
  "dict.translit.ambTitle": {
    "zh": "转写歧义（{n} 处，请选择）",
    "zh-TW": "轉寫歧義（{n} 處，請選擇）",
    "en": "Transliteration ambiguity ({n}; please choose)",
    "ja": "転写の曖昧さ（{n} 箇所、選択してください）",
    "ko": "전사 중의성({n}곳, 선택하세요)",
    "fr": "Ambiguïté de translittération ({n} ; à choisir)",
    "de": "Transliterationsmehrdeutigkeit ({n}; bitte wählen)"
  },
  "dict.translit.ambQuestion": {
    "zh": "歧义 {n}/{total}：「{primary}」（{roman}）与「{alt}」（{altRoman}）在拉丁文下易混淆，请选其一",
    "zh-TW": "歧義 {n}/{total}：「{primary}」（{roman}）與「{alt}」（{altRoman}）在拉丁文下易混淆，請擇一",
    "en": "Ambiguity {n}/{total}: \"{primary}\" ({roman}) and \"{alt}\" ({altRoman}) are easily confused in roman — pick one",
    "ja": "曖昧さ {n}/{total}：「{primary}」({roman}) と「{alt}」({altRoman}) はローマ字化で混同されやすいです。いずれかを選択",
    "ko": "중의성 {n}/{total}: 「{primary}」({roman})과 「{alt}」({altRoman})은 로마자 표기에서 혼동되기 쉽습니다. 하나 선택",
    "fr": "Ambiguïté {n}/{total} : « {primary} » ({roman}) et « {alt} » ({altRoman}) se confondent facilement en romain — choisissez",
    "de": "Mehrdeutigkeit {n}/{total}: »{primary}« ({roman}) und »{alt}« ({altRoman}) werden in lateinischer Schrift leicht verwechselt — wählen Sie"
  },
  "dict.translit.tibUnresolved": {
    "zh": "部分梵咒连写无自洽切分，已原样保留。可用下方「拼式歧义」选项重试，或在输入中以 + 显式指定下叠（详见检字表「结构说明」节）",
    "zh-TW": "部分梵咒連寫無自洽切分，已原樣保留。可用下方「拼式歧義」選項重試，或在輸入中以 + 顯式指定下疊（詳見檢字表「結構說明」節）",
    "en": "Some mantra conjuncts have no self-consistent split and were kept as-is. Try a 'Spelling ambiguity' option below, or mark subjunction explicitly with + (see Char Table > Structure)",
    "ja": "一部のマントラ連綿は自己整合的な分割がなく原形保持。下の「表記曖昧性」で再試行するか、+ で下加字を明示（見字表「構造」節参照）",
    "ko": "일부 만다라 연서는 자기일치 분절이 없어 원형 보존. 아래 '표기 모호성' 옵션으로 재시도하거나 + 로 하가자 명시(검자표 '구조' 절 참조)",
    "fr": "Certains conjoints de mantra n'ont pas de découpage auto-cohérent et sont conservés. Essayez une option « Ambiguïté d'orthographe » ou marquez la souscription avec + (voir Table des caractères > Structure)",
    "de": "Manche Mantra-Konjunkte haben keine selbstkonsistente Segmentierung und blieben unverändert. Option 'Schreibungs-Mehrdeutigkeit' probieren oder Subjoin mit + explizit markieren (siehe Zeichentabelle > Struktur)"
  },
  "dict.translit.ambTibQuestion": {
    "zh": "拼式歧义 {n}/{total}：「{a}」与「{b}」均能往返还原同一藏文音节，请选其一",
    "zh-TW": "拼式歧義 {n}/{total}：「{a}」與「{b}」均能往返還原同一藏文音節，請擇一",
    "en": "Spelling ambiguity {n}/{total}: both \"{a}\" and \"{b}\" round-trip to the same Tibetan syllable — pick one",
    "ja": "表記曖昧さ {n}/{total}：「{a}」と「{b}」は同じチベット音節へ往復可能 — いずれかを選択",
    "ko": "표기 중의성 {n}/{total}: 「{a}」과 「{b}」는 같은 티베트 음절로 왕복 가능 — 하나 선택",
    "fr": "Ambiguïté d'orthographe {n}/{total} : « {a} » et « {b} » correspondent en aller-retour à la même syllabe tibétaine — choisissez",
    "de": "Schreibungs-Mehrdeutigkeit {n}/{total}: Sowohl »{a}« als auch »{b}« ergeben im Hin-und-Her dieselbe tibetische Silbe — wählen Sie"
  },
  "dict.translit.ambTibBtn0": {
    "zh": "{w}（默认）",
    "zh-TW": "{w}（預設）",
    "en": "{w} (default)",
    "ja": "{w}（既定）",
    "ko": "{w} (기본)",
    "fr": "{w} (défaut)",
    "de": "{w} (Standard)"
  },
  "dict.translit.ambTibBtn1": {
    "zh": "改用 {w}",
    "zh-TW": "改用 {w}",
    "en": "Use {w} instead",
    "ja": "{w} を使用",
    "ko": "{w} 사용",
    "fr": "Utiliser {w}",
    "de": "{w} verwenden"
  },
  "dict.translit.tibAmbigLabel": {
    "zh": "拼式歧义",
    "zh-TW": "拼式歧義",
    "en": "Spelling ambiguity",
    "ja": "表記曖昧性",
    "ko": "표기 모호성",
    "fr": "Ambiguïté d'orthographe",
    "de": "Schreibungs-Mehrdeutigkeit"
  },
  "dict.translit.tibAmbigAuto": {
    "zh": "自动（引擎默认）",
    "zh-TW": "自動（引擎預設）",
    "en": "Auto (engine default)",
    "ja": "自動（エンジン既定）",
    "ko": "자동(엔진 기본)",
    "fr": "Auto (défaut moteur)",
    "de": "Auto (Engine-Standard)"
  },
  "dict.translit.agBackFormLabel": {
    "zh": "同音异码取样",
    "zh-TW": "同音異碼取樣",
    "en": "Homophone codepoint sampling",
    "ja": "同音異字コードポイント選択",
    "ko": "동음이자 코드포인트 선택",
    "fr": "Échantillonnage des homophones (points de code)",
    "de": "Homophon-Codepunkt-Auswahl"
  },
  "dict.translit.agBackFormAuto": {
    "zh": "正字（蒙古借音体例，21244）",
    "zh-TW": "正字（蒙古借音體例，21244）",
    "en": "Canonical (Mongolian borrowing form, 21244)",
    "ja": "正字（モンゴル借音体例、21244）",
    "ko": "정자(몽골 차음 체계, 21244)",
    "fr": "Canonique (forme d'emprunt mongole, 21244)",
    "de": "Kanonisch (mongolische Lehnform, 21244)"
  },
  "dict.translit.agBackFormTodo": {
    "zh": "专码位优先（Todo/AG 字典形）",
    "zh-TW": "專碼位優先（Todo/AG 字典形）",
    "en": "Todo/codepoint first (dictionary forms)",
    "ja": "専用符号優先（Todo/AG 辞書形）",
    "ko": "전용 코드 우선(Todo/AG 사전형)",
    "fr": "Points de code dédiés d'abord (formes de dictionnaire)",
    "de": "Dedizierte Codepunkte zuerst (Wörterbuchformen)"
  },
  "dict.translit.ambAgHomophoneBtn": {
    "zh": "{glyph}（U+{cp}）",
    "zh-TW": "{glyph}（U+{cp}）",
    "en": "{glyph} (U+{cp})",
    "ja": "{glyph}（U+{cp}）",
    "ko": "{glyph}(U+{cp})",
    "fr": "{glyph} (U+{cp})",
    "de": "{glyph} (U+{cp})"
  },
  "dict.translit.xApproxLabel": {
    "zh": "近似映射歧义",
    "zh-TW": "近似映射歧義",
    "en": "Approximate mapping",
    "ja": "近似マッピング曖昧性",
    "ko": "근사 매핑 모호성",
    "fr": "Ambiguïté de correspondance approximative",
    "de": "Approximations-Mehrdeutigkeit"
  },
  "dict.translit.xApproxAuto": {
    "zh": "自动（引擎默认）",
    "zh-TW": "自動（引擎預設）",
    "en": "Auto (engine default)",
    "ja": "自動（エンジン既定）",
    "ko": "자동(엔진 기본)",
    "fr": "Auto (défaut moteur)",
    "de": "Auto (Engine-Standard)"
  },
  "dict.translit.xApproxSpelled": {
    "zh": "拼出形（近似音位拼写）",
    "zh-TW": "拼出形（近似音位拼寫）",
    "en": "Spelled out (approximate phonemic spelling)",
    "ja": "綴り字形（近似音位表記）",
    "ko": "철자형(근사 음위 표기)",
    "fr": "Forme épelée (orthographe phonémique approchée)",
    "de": "Ausbuchstabiert (approximative phonemische Schreibung)"
  },
  "dict.translit.xApproxCodepoint": {
    "zh": "码位保留（\\uXXXX 标注，可逆）",
    "zh-TW": "碼位保留（\\uXXXX 標註，可逆）",
    "en": "Codepoint preserved (\\uXXXX annotation, reversible)",
    "ja": "コードポイント保持（\\uXXXX 注記、可逆）",
    "ko": "코드포인트 보존(\\uXXXX 주석, 가역)",
    "fr": "Point de code préservé (annotation \\uXXXX, réversible)",
    "de": "Codepoint erhalten (\\uXXXX-Notation, reversibel)"
  },
  "dict.translit.xApproxLongvowel": {
    "zh": "长式优先（僧伽罗 ē/ō）",
    "zh-TW": "長式優先（僧伽羅 ē/ō）",
    "en": "Long vowels first (Sinhala ē/ō)",
    "ja": "長母音優先（シンハラ ē/ō）",
    "ko": "장모음 우선(싱할라 ē/ō)",
    "fr": "Voyelles longues d'abord (singhalais ē/ō)",
    "de": "Langvokale zuerst (Sinhala ē/ō)"
  },
  "dict.translit.tibAmbigVowelRoot": {
    "zh": "元音归基字",
    "zh-TW": "元音歸基字",
    "en": "Vowel on base letter",
    "ja": "母音を基字に",
    "ko": "모음 기자 귀속",
    "fr": "Voyelle sur la base",
    "de": "Vokal am Basisbuchstaben"
  },
  "dict.translit.tibAmbigVowelLeft": {
    "zh": "元音归前段",
    "zh-TW": "元音歸前段",
    "en": "Vowel on preceding syllable",
    "ja": "母音を前音節に",
    "ko": "모음 전음절 귀속",
    "fr": "Voyelle sur la syllabe précédente",
    "de": "Vokal zur vorderen Silbe"
  },
  "dict.translit.tibAmbigStacked": {
    "zh": "堆叠（下加字）",
    "zh-TW": "堆疊（下加字）",
    "en": "Stacked (subjoined)",
    "ja": "重ね字（下加字）",
    "ko": "겹자(하가자)",
    "fr": "Empilé (souscrit)",
    "de": "Gestapelt (Subjoin)"
  },
  "dict.translit.tibAmbigParallel": {
    "zh": "并列（主字符连写）",
    "zh-TW": "並列（主字符連寫）",
    "en": "Parallel (full-form conjunct)",
    "ja": "並列（主文字連綿）",
    "ko": "병렬(주자 연서)",
    "fr": "Parallèle (conjoint plein)",
    "de": "Nebeneinander (Vollform)"
  },
  "dict.translit.tibAmbigLongCompact": {
    "zh": "长音紧凑（A）",
    "zh-TW": "長音緊湊（A）",
    "en": "Long vowel compact (A)",
    "ja": "長母音コンパクト（A）",
    "ko": "장모음 축약(A)",
    "fr": "Voyelle longue compacte (A)",
    "de": "Langer Vokal kompakt (A)"
  },
  "dict.translit.tibAmbigLongSplit": {
    "zh": "长音分解（a+A 标注）",
    "zh-TW": "長音分解（a＋A 標註）",
    "en": "Long vowel split (a+A markup)",
    "ja": "長母音分解（a+A 記法）",
    "ko": "장모음 분해(a+A 표기)",
    "fr": "Voyelle longue décomposée (a+A)",
    "de": "Langer Vokal zerlegt (a+A)"
  },
  "dict.translit.ambAspirated": {
    "zh": "送气单辅音 {glyph}",
    "zh-TW": "送氣單輔音 {glyph}",
    "en": "Aspirated single consonant {glyph}",
    "ja": "有気音単子音 {glyph}",
    "ko": "유기 단자음 {glyph}",
    "fr": "Consonne aspirée simple {glyph}",
    "de": "Aspirierter Einzelkonsonant {glyph}"
  },
  "dict.translit.ambConjunct": {
    "zh": "基辅音＋ha 合字 {glyph}",
    "zh-TW": "基輔音＋ha 合字 {glyph}",
    "en": "Base consonant + ha conjunct {glyph}",
    "ja": "基子音＋ha 結合文字 {glyph}",
    "ko": "기자음＋ha 결합자 {glyph}",
    "fr": "Consonne de base + conjoint ha {glyph}",
    "de": "Basiskonsonant + ha-Konjunkt {glyph}"
  },
  "dict.translit.ambNasalAnus": {
    "zh": "anusvāra 鼻音 {glyph}",
    "zh-TW": "anusvāra 鼻音 {glyph}",
    "en": "anusvāra nasal {glyph}",
    "ja": "anusvāra 鼻音 {glyph}",
    "ko": "anusvāra 비음 {glyph}",
    "fr": "anusvāra nasal {glyph}",
    "de": "anusvāra Nasal {glyph}"
  },
  "dict.translit.ambNasalCandra": {
    "zh": "candrabindu 鼻音 {glyph}",
    "zh-TW": "candrabindu 鼻音 {glyph}",
    "en": "candrabindu nasal {glyph}",
    "ja": "candrabindu 鼻音 {glyph}",
    "ko": "candrabindu 비음 {glyph}",
    "fr": "candrabindu nasal {glyph}",
    "de": "candrabindu Nasal {glyph}"
  },
  "dict.translit.ambZhDigraph": {
    "zh": "zh 合读音素（ژ）",
    "zh-TW": "zh 合讀音素（ژ）",
    "en": "zh digraph phoneme (ژ)",
    "ja": "zh 二重子音（ژ）",
    "ko": "zh 이중 자음（ژ）",
    "fr": "phonème zh digraphe（ژ）",
    "de": "zh-Digraph Phonem（ژ）"
  },
  "dict.translit.ambZhSplit": {
    "zh": "z＋h 两音素（زھ）",
    "zh-TW": "z＋h 兩音素（زھ）",
    "en": "z + h two phonemes (زھ)",
    "ja": "z＋h 二音素（زھ）",
    "ko": "z＋h 이음소（زھ）",
    "fr": "deux phonèmes z + h（زھ）",
    "de": "z + h zwei Phoneme（زھ）"
  },
  "dict.translit.ambHehBtn0": {
    "zh": "辅音 h（默认读法，zhipu 型）",
    "zh-TW": "輔音 h（預設讀法，zhipu 型）",
    "en": "Consonant h (default reading, zhipu type)",
    "ja": "子音 h（デフォルト読み、zhipu 型）",
    "ko": "자음 h（기본 읽기, zhipu형）",
    "fr": "Consonne h (lecture par défaut, type zhipu)",
    "de": "Konsonant h (Standardlesung, zhipu-Typ)"
  },
  "dict.translit.ambHehBtn1": {
    "zh": "元音 ë＋隔音符（zë'ipu 型）",
    "zh-TW": "元音 ë＋隔音符（zë'ipu 型）",
    "en": "Vowel ë + separator (zë'ipu type)",
    "ja": "母音 ë＋分離符（zë'ipu 型）",
    "ko": "모음 ë＋분리 기호（zë'ipu형）",
    "fr": "Voyelle ë + séparateur (type zë'ipu)",
    "de": "Vokal ë + Trennzeichen (zë'ipu-Typ)"
  },
  "dict.translit.ambMnglLhaBtn0": {
    "zh": "LHA 藏语借词写法（默认，lhasa 型）",
    "zh-TW": "LHA 藏語借詞寫法（預設，lhasa 型）",
    "en": "LHA Tibetan loanword form (default, lhasa type)",
    "ja": "LHA チベット語借用形（デフォルト、lhasa 型）",
    "ko": "LHA 티베트어 차용 형태（기본, lhasa형）",
    "fr": "Forme d'emprunt tibétain LHA (par défaut, type lhasa)",
    "de": "LHA tibetische Lehnwortform (Standard, lhasa-Typ)"
  },
  "dict.translit.ambMnglLhaBtn1": {
    "zh": "LA＋HAA 两字母（汉语借词，ᠯᠾᠬᠠᠪᠠ 型）",
    "zh-TW": "LA＋HAA 兩字母（漢語借詞，ᠯᠾᠬᠠᠪᠠ 型）",
    "en": "LA + HAA two letters (Chinese loanword, ᠯᠾᠬᠠᠪᠠ type)",
    "ja": "LA＋HAA 二文字（漢語借用、ᠯᠾᠬᠠᠪᠠ 型）",
    "ko": "LA＋HAA 두 글자（한어 차용, ᠯᠾᠬᠠᠪᠠ형）",
    "fr": "Deux lettres LA + HAA (emprunt chinois, type ᠯᠾᠬᠠᠪᠠ)",
    "de": "Zwei Buchstaben LA + HAA (chinesisches Lehnwort, ᠯᠾᠬᠠᠪᠠ-Typ)"
  },
  "dict.translit.ambMnglNgBtn0": {
    "zh": "规范连写 ᠩ",
    "zh-TW": "規範連寫 ᠩ",
    "en": "Standard ligature ᠩ",
    "ja": "規範連寫 ᠩ",
    "ko": "규범 연서 ᠩ",
    "fr": "Ligature standard ᠩ",
    "de": "Standard-Ligatur ᠩ"
  },
  "dict.translit.ambMnglNgBtn1": {
    "zh": "旧式两字母 ᠨᠭ",
    "zh-TW": "舊式兩字母 ᠨᠭ",
    "en": "Old-style two letters ᠨᠭ",
    "ja": "旧式二文字 ᠨᠭ",
    "ko": "구식 두 글자 ᠨᠭ",
    "fr": "Ancienne forme à deux lettres ᠨᠭ",
    "de": "Alte Schreibweise mit zwei Buchstaben ᠨᠭ"
  },
  "dict.translit.ambMnglGalikBtn0": {
    "zh": "学术读法",
    "zh-TW": "學術讀法",
    "en": "Academic reading",
    "ja": "学術読み",
    "ko": "학술 읽기",
    "fr": "Lecture académique",
    "de": "Akademische Lesung"
  },
  "dict.translit.ambMnglGalikBtn1": {
    "zh": "蒙科立传统读法",
    "zh-TW": "Menksoft 傳統讀法",
    "en": "Menksoft traditional reading",
    "ja": "蒙科立伝統読み",
    "ko": "멩커쉬 전통 읽기",
    "fr": "Lecture traditionnelle Menksoft",
    "de": "Menksoft traditionelle Lesung"
  },
  "dict.translit.ambAposQuestion": {
    "zh": "歧义 {n}/{total}：「{a}」与「{b}」在拉丁文下易混淆，请选其一",
    "zh-TW": "歧義 {n}/{total}：「{a}」與「{b}」在拉丁文下易混淆，請擇一",
    "en": "Ambiguity {n}/{total}: \"{a}\" and \"{b}\" are easily confused in roman — pick one",
    "ja": "曖昧さ {n}/{total}：「{a}」と「{b}」はローマ字化で混同されやすいです。いずれかを選択",
    "ko": "중의성 {n}/{total}: 「{a}」와 「{b}」은 로마자 표기에서 혼동되기 쉽습니다. 하나 선택",
    "fr": "Ambiguïté {n}/{total} : « {a} » et « {b} » se confondent facilement en romain — choisissez",
    "de": "Mehrdeutigkeit {n}/{total}: »{a}« und »{b}« werden im Roman leicht verwechselt — wählen Sie"
  },
  "dict.translit.ambAposBtn0": {
    "zh": "双隔音符，无损往返",
    "zh-TW": "雙隔音符，無損往返",
    "en": "Double apostrophe — lossless roundtrip",
    "ja": "二重アポストロフィ、無損往復",
    "ko": "이중 아포스트로피, 무손실 왕복",
    "fr": "Apostrophe double — aller-retour sans perte",
    "de": "Doppelapostroph — verlustfreier Rundtrip"
  },
  "dict.translit.ambAposBtn1": {
    "zh": "单隔音符，转回 UEY 有损",
    "zh-TW": "單隔音符，轉回 UEY 有損",
    "en": "Single apostrophe — lossy back to UEY",
    "ja": "一重アポストロフィ、UEY 復帰時は損失あり",
    "ko": "단일 아포스트로피, UEY 역변환 시 손실",
    "fr": "Apostrophe simple — reconversion UEY avec perte",
    "de": "Einfacher Apostroph — Rückkonvertierung nach UEY verlustbehaftet"
  },
  "dict.translit.ambVocalic": {
    "zh": "声化元音 {glyph}",
    "zh-TW": "聲化元音 {glyph}",
    "en": "Vocalic vowel {glyph}",
    "ja": "音節主音母音 {glyph}",
    "ko": "성모음 {glyph}",
    "fr": "Voyelle vocalique {glyph}",
    "de": "Vokalischer Vokal {glyph}"
  },
  "dict.translit.ambRetroflex": {
    "zh": "卷舌辅音 {glyph}",
    "zh-TW": "卷舌輔音 {glyph}",
    "en": "Retroflex consonant {glyph}",
    "ja": "反舌尖子音 {glyph}",
    "ko": "권설 자음 {glyph}",
    "fr": "Consonne rétroflexe {glyph}",
    "de": "Retroflexer Konsonant {glyph}"
  },
  "dict.translit.ambConfirm": {
    "zh": "确认定稿",
    "zh-TW": "確認定稿",
    "en": "Confirm",
    "ja": "確定",
    "ko": "확정",
    "fr": "Confirmer",
    "de": "Bestätigen"
  },
  "dict.translit.ambConfirmed": {
    "zh": "已定稿：选择已套用，输出为完整行文",
    "zh-TW": "已定稿：選擇已套用，輸出為完整行文",
    "en": "Finalized: choices applied, output is clean text",
    "ja": "確定しました：選択を適用し、出力は完全な文です",
    "ko": "확정됨: 선택 적용, 출력은 완전한 텍스트입니다",
    "fr": "Finalisé : choix appliqués, texte complet",
    "de": "Finalisiert: Auswahl angewendet, vollständiger Text"
  },
  "dict.collation.translitCopied": {
    "zh": "已复制到剪贴板",
    "zh-TW": "已複製到剪貼簿",
    "en": "Copied to clipboard",
    "ja": "クリップボードにコピーしました",
    "ko": "클립보드에 복사했습니다",
    "fr": "Copié dans le presse-papiers",
    "de": "In die Zwischenablage kopiert"
  },
  "dict.collation.translitEmpty": {
    "zh": "没有转出任何词——可能没有选到对应这一文本的转写方案，或文本中没有该文种的词",
    "zh-TW": "沒有轉出任何詞——可能沒有選到對應這一文本的轉寫方案，或文本中沒有該文種的詞",
    "en": "Nothing was transliterated — the scheme may not match this text, or the text contains no words in that script.",
    "ja": "転写できた語がありません。方式がこのテキストに合っていないか、該当文字種の語が含まれていない可能性があります。",
    "ko": "전사된 단어가 없습니다. 이 텍스트에 맞는 방식이 아니거나 해당 문자종의 단어가 없을 수 있습니다.",
    "fr": "Rien n'a été transcrit — le schéma ne correspond peut-être pas à ce texte, ou le texte ne contient aucun mot dans cette écriture.",
    "de": "Nichts wurde transliteriert — das Schema passt möglicherweise nicht zu diesem Text, oder der Text enthält keine Wörter in dieser Schrift."
  },
  "dict.collation.translitTooLong": {
    "zh": "文本超过 {n} 字，请先分段再转写",
    "zh-TW": "文本超過 {n} 字，請先分段再轉寫",
    "en": "Text exceeds {n} characters — please split it before transliterating.",
    "ja": "テキストが {n} 字を超えています。分割してから転写してください。",
    "ko": "텍스트가 {n}자를 넘었습니다. 나눈 뒤 전사하세요.",
    "fr": "Le texte dépasse {n} caractères — divisez-le avant de translitérer.",
    "de": "Der Text überschreitet {n} Zeichen — bitte vor der Transliteration aufteilen."
  },
  "dict.collation.translitNeedText": {
    "zh": "先填入要转写的文本",
    "zh-TW": "先填入要轉寫的文本",
    "en": "Enter the text to transliterate first",
    "ja": "先に転写するテキストを入力してください",
    "ko": "먼저 전사할 텍스트를 입력하세요",
    "fr": "Saisissez d'abord le texte à translitérer",
    "de": "Geben Sie zuerst den zu transliterierenden Text ein"
  },
  "dict.collation.translitNone": {
    "zh": "当前没有已注册的转写方案",
    "zh-TW": "目前沒有已註冊的轉寫方案",
    "en": "No transliteration schemes are registered",
    "ja": "登録されている転写方式がありません",
    "ko": "등록된 전사 방식이 없습니다",
    "fr": "Aucun schéma de translittération n'est enregistré",
    "de": "Keine Transliterationsschemata registriert"
  },
  "dict.collation.translitUnknownScheme": {
    "zh": "指定的转写方案不存在（id 无效），未做任何转换",
    "zh-TW": "指定的轉寫方案不存在（id 無效），未做任何轉換",
    "en": "The specified transliteration scheme does not exist (invalid id) — nothing was converted.",
    "ja": "指定された転写方式が存在しません（無効な id）。変換は行われていません。",
    "ko": "지정한 전사 방식이 존재하지 않습니다(잘못된 id). 변환되지 않았습니다.",
    "fr": "Le schéma de translittération spécifié n'existe pas (identifiant invalide) — rien n'a été converti.",
    "de": "Das angegebene Transliterationsschema existiert nicht (ungültige ID) — es wurde nichts konvertiert."
  },
  "dict.collation.translitNeedScheme": {
    "zh": "「拉丁文 → 原生文字」方向无法自动识别——同一串拉丁字母往往同时是多个方案的合法输入，请手动指定方案",
    "zh-TW": "「拉丁轉寫 → 原生文字」方向無法自動辨識——同一串拉丁字母往往同時是多個方案的合法輸入，請手動指定方案",
    "en": "The \"roman → native\" direction cannot be auto-detected: the same Latin string is often valid input for several schemes. Please pick a scheme manually.",
    "ja": "「ローマ字 → 原文字」方向は自動判別できません。同じラテン文字列が複数の方式で有効な入力になり得るため、方式を手動で選んでください。",
    "ko": "「로마자 → 원문자」방향은 자동 감지할 수 없습니다. 같은 라틴 문자열이 여러 방식에서 유효한 입력일 수 있으니 방식을 직접 지정하세요.",
    "fr": "La direction « latin → écriture d'origine » ne peut pas être détectée automatiquement : une même chaîne latine est souvent une entrée valide pour plusieurs schémas. Veuillez choisir un schéma manuellement.",
    "de": "Die Richtung „Lateinisch → Originalschrift“ kann nicht automatisch erkannt werden: Dieselbe lateinische Zeichenfolge ist oft für mehrere Schemata gültig. Bitte wählen Sie ein Schema manuell."
  },
  "dict.set.annotateVariants": {
    "zh": "标注词条中的异体字",
    "zh-TW": "標註詞條中的異體字",
    "en": "Mark variant characters in entries",
    "ja": "見出し語内の異体字を標示",
    "ko": "표제어의 이체자 표시",
    "fr": "Marquer les variantes dans les entrées",
    "de": "Variantenzeichen in Einträgen markieren"
  },
  "dict.set.annotateVariantsDesc": {
    "zh": "用校勘字表（1,003 笔）把词条正文里的异体字轻轻标出来，悬停可看对应的通行字。只读词条的 DOM，不会改写原文。",
    "zh-TW": "用校勘字表（1,003 筆）把詞條正文裡的異體字輕輕標出來，懸停可看對應的通行字。只讀詞條的 DOM，不會改寫原文。",
    "en": "Uses the collation variant table (1,003 entries) to lightly mark variant characters in entry text; hover to see the standard form. Reads the entry DOM only — the original text is never rewritten.",
    "ja": "校勘字表（1,003 件）で見出し語本文の異体字を淡く標示し、ホバーで通用字を表示します。DOM を読むだけで本文は書き換えません。",
    "ko": "교감 자표(1,003건)로 표제어 본문의 이체자를 옅게 표시하고, 호버로 통용자를 보여줍니다. DOM만 읽고 원문은 바꾸지 않습니다.",
    "fr": "Utilise la table de variantes de collation (1 003 entrées) pour marquer discrètement les variantes dans le texte des entrées ; survolez pour voir la forme standard. Lit uniquement le DOM — le texte d'origine n'est jamais réécrit.",
    "de": "Markiert Variantenzeichen im Eintragstext anhand der Kollations-Variantentabelle (1.003 Einträge); beim Hovern erscheint die Standardform. Liest nur das DOM — der Originaltext wird nie umgeschrieben."
  },

  "dict.set.variantFallback": {
    "zh": "异体／繁简容错查询",
    "zh-TW": "異體／繁簡容錯查詢",
    "en": "Variant / traditional-simplified tolerant lookup",
    "ja": "異体字・繁簡のゆらぎ検索",
    "ko": "이체/번간 관용 검색",
    "fr": "Recherche tolérante aux variantes / traditionnel-simplifié",
    "de": "Tolerante Suche nach Varianten / Lang-Kurz-Zeichen"
  },
  "dict.set.variantFallbackDesc": {
    "zh": "查不到时，先用校勘字表把查询词换成可能的词头写法（异体字、繁简）再查一次。命中会标为「异体 → 实际词头」。",
    "zh-TW": "查不到時，先用校勘字表把查詢詞換成可能的詞頭寫法（異體字、繁簡）再查一次。命中會標為「異體 → 實際詞頭」。",
    "en": "When an exact lookup fails, rewrite the query into likely headword forms (variant characters, traditional/simplified) using the collation tables and retry. Hits are labelled \"variant → actual headword\".",
    "ja": "完全一致しない場合、校勘字表で検索語を考えられる見出し形（異体字・繁簡）に置き換えて再検索します。該当は「異体 → 実際の見出し」と表示されます。",
    "ko": "정확히 찾지 못하면 교감 자표로 검색어를 가능한 표제형(이체자·번간)으로 바꿔 다시 찾습니다. 결과는 '이체 → 실제 표제'로 표시됩니다.",
    "fr": "En cas d'échec exact, réécrit la requête en formes probables d'entrée (variantes, traditionnel/simplifié) à l'aide des tables de collation, puis réessaie. Les résultats sont marqués « variante → entrée réelle ».",
    "de": "Schlägt die exakte Suche fehl, wird die Anfrage mit den Kollationstabellen in wahrscheinliche Lemmata (Varianten, Lang-/Kurzzeichen) umgeschrieben und erneut gesucht. Treffer werden als „Variante → tatsächliches Lemma“ markiert."
  },

  "dict.bookmarks.title": {
    "zh": "书签",
    "zh-TW": "書籤",
    "en": "Bookmarks",
    "ja": "ブックマーク",
    "ko": "북마크",
    "fr": "Signets",
    "de": "Lesezeichen"
  },
};

export function t(lang: LangCode, key: string, vars?: Record<string, string | number>): string {
  const entry = DICT[key];
  let str = entry?.[lang] ?? entry?.en ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      str = str.replace(new RegExp(`{${k}}`, "g"), String(v));
    }
  }
  return str;
}

/** 與 Obsidian 界面語言自動匹配（僅 7 種介面語言；其餘一律回退 en） */
export function langFromObsidian(locale: string): LangCode {
  const l = (locale || "").toLowerCase().replace(/_/g, "-");
  // 繁體別名優先：zh-Hant / zh-CHT（含 zh-Hant-TW 等）→ zh-TW
  if (/^zh-(hant|cht)/.test(l) || l.startsWith("zh-tw") || l.startsWith("zh-hk") || l.startsWith("zh-mo")) return "zh-TW";
  // 簡體別名：zh-Hans / zh-CHS → zh；其餘 zh-* 默認簡體
  if (/^zh-(hans|chs)/.test(l)) return "zh";
  if (l.startsWith("zh")) return "zh";
  if (l.startsWith("ja")) return "ja";
  if (l.startsWith("ko")) return "ko";
  if (l.startsWith("fr")) return "fr";
  if (l.startsWith("de")) return "de";
  return "en";
}
