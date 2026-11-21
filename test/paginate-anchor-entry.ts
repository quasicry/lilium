// 測試入口：分頁 + 真實 typeset CSS + 文種表（錨右回歸用）
import { paginate } from "../src/paginate";
import * as T from "../src/typeset";
import { SCRIPTS } from "../src/languages";
(window as unknown as Record<string, unknown>).LiPaginateAnchor = { paginate, T, SCRIPTS };
