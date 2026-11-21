// ESLint v10+ flat config：相容 @typescript-eslint v8+
// 對齊官方社區掃描器規則集——接入 eslint-plugin-obsidianmd recommended
// （＝ESLint core 推薦集＋typescript-eslint recommendedTypeChecked＋obsidianmd
// 全部規則＋@microsoft/eslint-plugin-sdl＋eslint-plugin-no-unsanitized＋
// eslint-plugin-depend＋eslint-comments；Obsidian globals 內建）。
// 官方 scanner 配置參考：eslint-plugin/docs/configuration.md「Community scanner」節。
// 要點：
//  · recommended 已含 eslint/tseslint 推薦集，勿重複疊 eslint.configs.recommended。
//  · type-checked 規則需 parserOptions.projectService（自動尋根 tsconfig.json；
//    eslint.config.mjs 本身不在 tsconfig include 內，靠 allowDefaultProject 兜底）。
//  · 歷史自訂規則保留於尾段；與 recommended 衝突者以後段為準。
//  · test/**、scripts/**、e2e/** 非插件運行時代碼：關 obsidianmd/ 與型別噪音規則
//    （官方 scanner 也只掃插件源碼）。
import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import obsidianmd from "eslint-plugin-obsidianmd";

export default [
  {
    ignores: [
      "node_modules/**",
      "main.js",
      "app.js",
      "iife.js",
      "test/build/**",
      "src/vendor/*.generated.ts",
      "src/vendor/*.generated.js",  // 生成物 js 副本：裸 eslint src 口徑下 72 parsing error（parser 不在 project service），與 .ts 同豁免
      "src/tsdata/*.gen.js",        // 同上（tsdata 生成物 js 副本）
      "src/tsdata/region-vertical-punct.js",
      "src/**/*.gen.js",
      "src/dict/**/*.js",           // esbuild build 產物（.ts 的 js 副本），與 main.js 同性質不 lint
      "src/mongolian-ime/**/*.js",  // 同上（ime 模組 build 產物）
      "src/shared/*.js",            // 同上
      "src/vendor/speex/**",   // 第三方 Emscripten 產物，不 lint
      "docs/**",
      // parser 對超長 token 棧溢位（"Maximum call stack size exceeded"），全量
      // lint 恆紅。該檔為生成物、無可lint語義；安全掃描覆蓋
      // 由消費端 settings.ts 承擔。若日後改回外部資源（撤內嵌），須同步移除此項。
      "src/qr-embed.ts",
    ],
  },

  // ── 官方社區掃描器規則集（security 規則 error） ──
  ...obsidianmd.configs.recommended,

  
  // ── 審核合規批次（r156）：官方掃描器禁代碼內 disable 指令；以下規則在特定檔案
  //    的豁免集中於此（配置級聲明，附技術理由），功能等價鐵律下不可改行為：
  {
    files: [
      "src/dict/plugin.ts",       // no-view-references：dict 面板生命週期管理必需（onClose 釋放）；no-default-hotkeys：歷史用戶習慣（可改綁）向後兼容；prefer-file-manager-trash：暫存資源刪除語義（非用戶文檔）
      "src/dict/settings.ts",     // prefer-setting-definitions：手寫 setting tab 存量結構，遷移另行立項
      "src/dom-win.ts",           // prefer-create-el：沙箱（linkedom）回退路徑，doc.win 擴展不存在時唯一可用 API
      "src/font-metrics.ts",      // prefer-create-el：量測工具需在無 Obsidian global 沙箱運行（實證回歸）
      "src/dict/view.ts",         // prefer-create-el：iframe srcdoc 內部文檔（contentDocument）未經 Obsidian win 擴展，win.createEl 不存在
      "src/bundled-fonts.ts",     // no-forbidden-elements：@font-face 由運行時 blob URL 動態生成，無法預置 styles.css
    ],
    rules: {
      "obsidianmd/no-view-references-in-plugin": "off",
      "obsidianmd/commands/no-default-hotkeys": "off",
      "obsidianmd/prefer-file-manager-trash-file": "off",
      "obsidianmd/settings-tab/prefer-setting-definitions": "off",
      "obsidianmd/prefer-create-el": "off",
      "obsidianmd/no-forbidden-elements": "off",
    },
  },

{
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ["eslint.config.*"],
        },
      },
    },
  },

  {
    // 官方 scanner 建議的降噪關閉集（docs/configuration.md「Community scanner」）
    files: ["**/*.{ts,tsx,js,mjs,cjs}"],
    rules: {
      "no-undef": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/restrict-template-expressions": "off",
      "@typescript-eslint/no-base-to-string": "off",
      "import/no-unresolved": "off",
      // 老插件命令 id/name 不得改（歷史相容；官方 scanner 對老庫同款豁免）
      "obsidianmd/commands/no-command-in-command-id": "off",
      "obsidianmd/commands/no-plugin-id-in-command-id": "off",
      "obsidianmd/commands/no-command-in-command-name": "off",
      "obsidianmd/commands/no-plugin-name-in-command-name": "off",
      // manifest / license 由門禁 run.mjs [1.58] 版本四位一體與 LICENSE 檢查承擔
      "obsidianmd/validate-manifest": "off",
      "obsidianmd/validate-license": "off",
    },
  },

  {
    // 存量豁免段：接入官方規則集時既存 435 個 error（多為型別/風格類：
    // no-unnecessary-type-assertion 128、no-floating-promises 64、misused-promises 54…）
    // 首輪不動 src 行為，統一降 warn——**只許減不許增**（CI 以 --max-warnings=現量
    // 把關，數字隨清償下調）；安全類存量 17 條見 docs/SECURITY-BASELINE.md，另行立項。
    files: ["src/**/*.ts"],
    rules: {
      "@typescript-eslint/no-unnecessary-type-assertion": "warn",
      "@typescript-eslint/no-floating-promises": "warn",
      "@typescript-eslint/no-misused-promises": "warn",
      "eslint-comments/require-description": "warn",
      "eslint-comments/no-restricted-disable": "warn",
      "no-useless-escape": "warn",
      "no-control-regex": "warn",
      "@typescript-eslint/no-require-imports": "warn",
      "obsidianmd/rule-custom-message": "warn",
      "no-misleading-character-class": "warn",
      "@typescript-eslint/no-this-alias": "warn",
      "obsidianmd/settings-tab/no-manual-html-headings": "warn",
      "@typescript-eslint/unbound-method": "warn",
      "no-irregular-whitespace": "warn",
      // 安全類存量（修復前 warn；清償一條從此表移除一條）：
      "no-unsanitized/property": "warn",
      "no-unsanitized/method": "warn",
      // SDL 兩條轉 warn——行級 disable 被 obsidianmd recommended 的
      // no-restricted-disable 黑名單禁止，受控 innerHTML/document.write 逐點審計以
      // 行級 no-unsanitized disable＋來源保證註釋承擔。
      "@microsoft/sdl/no-inner-html": "warn",
      "@microsoft/sdl/no-document-write": "warn",
      "obsidianmd/no-forbidden-elements": "warn",
      "obsidianmd/no-unsupported-api": "warn",
      "obsidianmd/regex-lookbehind": "warn",
      // 結構/架構級存量（直排插件大量動態樣式與樣式標籤注入，refactor 級、另行立項）：
      "obsidianmd/no-static-styles-assignment": "warn",
      "obsidianmd/no-view-references-in-plugin": "warn",
      "obsidianmd/no-plugin-as-component": "warn",
      "@typescript-eslint/no-redundant-type-constituents": "warn",
      "@typescript-eslint/prefer-promise-reject-errors": "warn",
      "no-constant-condition": "warn",
    },
  },

  {
    // no-static-styles-assignment 檔級豁免——直排排版引擎的動態量測/校正
    // 與 UI 行為必需（離屏 measure 元素、運行時 CSS 變數注入、display/visibility 開關、
    // maxWidth 重置、cssText 複合樣式）；直排幾何無法預先窮舉為靜態樣式表。
    // 架構級重構（樣式收斂到 class）另行立項；見 docs/SECURITY-BASELINE.md。
    files: ["src/**/*.ts"],
    rules: {
      "obsidianmd/no-static-styles-assignment": "off",
    },
  },

  {
    // no-restricted-disable 黑名單清空——審計 disable（均帶強制描述，
    // require-description 把關）需引用 sdl/unsanitized/unsupported-api 等被
    // obsidianmd recommended 黑名單禁用的規則；空清單＝允許全部，防護由
    // require-description＋審計註釋承擔。
    files: ["src/**/*.ts"],
    rules: {
      "eslint-comments/no-restricted-disable": "off",
    },
  },

  {
    // 非插件運行時（測試／腳本／e2e）：關 obsidianmd 規則與型別噪音，安全規則保留
    files: ["test/**", "scripts/**", "e2e/**", "*.mjs"],
    rules: {
      "obsidianmd/no-nodejs-modules": "off",
      "obsidianmd/rule-custom-message": "off",
      "obsidianmd/no-unsupported-api": "off",
      "@typescript-eslint/no-floating-promises": "off",
      "@typescript-eslint/no-unbound-method": "off",
    },
  },

  // ── 歷史自訂規則（後段覆蓋前段） ──
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2021,
        sourceType: "module",
      },
      globals: {
        window: "readonly",
        document: "readonly",
        console: "readonly",
        navigator: "readonly",
        crypto: "readonly",
        TextEncoder: "readonly",
        TextDecoder: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        requestAnimationFrame: "readonly",
        cancelAnimationFrame: "readonly",
        URL: "readonly",
        Blob: "readonly",
        File: "readonly",
        FileReader: "readonly",
        HTMLElement: "readonly",
        HTMLInputElement: "readonly",
        HTMLSelectElement: "readonly",
        HTMLButtonElement: "readonly",
        HTMLDivElement: "readonly",
        HTMLTextAreaElement: "readonly",
        HTMLStyleElement: "readonly",
        Document: "readonly",
        DocumentFragment: "readonly",
        Element: "readonly",
        Node: "readonly",
        NodeFilter: "readonly",
        Event: "readonly",
        WheelEvent: "readonly",
        KeyboardEvent: "readonly",
        MouseEvent: "readonly",
        IntersectionObserver: "readonly",
        DataView: "readonly",
        Uint8Array: "readonly",
        Uint32Array: "readonly",
        ArrayBuffer: "readonly",
        getComputedStyle: "readonly",
        Promise: "readonly",
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/no-non-null-assertion": "off",
      "no-console": ["warn", { allow: ["warn", "error"] }],
      "prefer-const": "warn",
      "eqeqeq": ["error", "smart"],
    },
  },
];
