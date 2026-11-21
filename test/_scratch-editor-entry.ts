import { EditorView } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { buildVerticalPunctExtension } from "../src/vertical-punct";
import { buildVerticalSelectExtension } from "../src/vertical-select";
import { paraHighlightExtension } from "../src/editor-para-highlight";
(window as any).VW = { EditorView, EditorState, buildVerticalPunctExtension, buildVerticalSelectExtension, paraHighlightExtension };
