// [診斷] 編輯器直排「高度鏈」實驗：忠實還原 Obsidian 包裹層
// .workspace-leaf-content[data-type=markdown] > .view-content > .markdown-source-view > .cm-editor
// 暴露真實 CM6 供 driver 掛載與量測。
import { EditorView } from "@codemirror/view";
import { EditorState } from "@codemirror/state";

(window as any).__cm = { EditorView, EditorState };
