// 測試入口：把 CM6 與盤古編輯器擴展打成自包含 bundle（供 Chromium 頁面用）
import { EditorView } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { buildPanguExtension } from "../src/pangu-editor";
import { planPanguSpacing } from "../src/ts/pangu";
(window as unknown as Record<string, unknown>).LiPanguEditor = {
  EditorView,
  EditorState,
  buildPanguExtension,
  planPanguSpacing,
};
