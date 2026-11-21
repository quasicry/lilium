// 測試入口：CM6 ＋ marks-editor ＋ hanging-editor ＋ 標點擴展（自包含 bundle 供 Chromium 頁面用）
import { EditorView } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { buildMarksEditorExtension } from "../src/marks-editor";
import { buildHangingEditorExtension } from "../src/hanging-editor";
import { buildVerticalPunctExtension } from "../src/vertical-punct";
import { buildEditorIndentExtension } from "../src/editor-indent";
import { applyHangingToContainer } from "../src/hanging-runtime";
(window as unknown as Record<string, unknown>).LiEditorMarks = {
  EditorView,
  EditorState,
  buildMarksEditorExtension,
  buildHangingEditorExtension,
  buildVerticalPunctExtension,
  buildEditorIndentExtension,
  applyHangingToContainer,
};
