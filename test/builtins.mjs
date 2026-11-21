// 內聯 Node 內建模組清單（替代 builtin-modules 套件——審核 module-replacements 警告）。
// 與 esbuild.config.mjs 的 external 清單同步維護。
export const BUILTINS = [
  "assert","assert/strict","async_hooks","buffer","child_process","cluster","console",
  "constants","crypto","dgram","diagnostics_channel","dns","dns/promises","domain",
  "events","fs","fs/promises","http","http2","https","inspector","inspector/promises",
  "module","net","os","path","path/posix","path/win32","perf_hooks","process","punycode",
  "querystring","readline","readline/promises","repl","stream","stream/consumers",
  "stream/promises","stream/web","string_decoder","timers","timers/promises","tls",
  "trace_events","tty","url","util","util/types","v8","vm","worker_threads","zlib",
];
export default BUILTINS;
