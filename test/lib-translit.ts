// 測試專用導出：轉寫頁籤（W9-B）+ 全部轉寫方案的註冊副作用。
//
// 為什麼需要這個入口：各轉寫方案的 registerScheme() 在模組頂層執行，
// 只 bundle translit-panel.ts 的話註冊表是空的（面板會退化成「沒有已註冊方案」）。
// 這裡刻意用**具名**導出而非 export *，避免多個文種模組撞名。
//
// 沿革：v2.8.37 剝離校勘時，原本同時承載「校勘面板 + 轉寫頁籤」渲染冒煙的
// test/lib-collation.ts 隨校勘凍結進附錄，轉寫頁籤的**動態渲染**覆蓋因而歸零
// （只剩 run.mjs 的靜態斷言）。本檔即該覆蓋的對等重建入口——只導出轉寫相關
// 端子，不碰任何校勘程式碼。
export {
  renderTranslitPanel, getTranslitState,
} from "../src/dict/translit-panel";
// 純邏輯走同名同源：這幾個函式定義在 translit-run.ts，面板只是導入使用
export {
  transliterateText, MAX_TRANSLIT_CHARS, countTranslitChars, isTranslitTooLong,
} from "../src/dict/translit-run";

// 註冊所有方案（副作用 import）
import "../src/tibetan";
import "../src/indic";
import "../src/siddham";
import "../src/brahmic";
import "../src/manchu";
import "../src/mongolian";
import "../src/olduyghur";
import "../src/uyghur";
import "../src/aligali";
