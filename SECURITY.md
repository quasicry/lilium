---
plugin-id: lilium
version: 0.2.1
last-updated: 2026-11-14
---

# Security

Lilium is a local-first Obsidian plugin for dictionary lookup (MDict /
TEI Lex-0) and script transliteration (Sanskrit, Pali, Tibetan, Mongolian,
Manchu, Uyghur, Siddham, ʼPhags-pa and more). It works entirely on the
user's own vault and local files. There is no telemetry, no analytics, and no
remote code execution.

## Network Activity

The plugin makes **no outbound network requests of its own**. Fonts are
embedded in the plugin bundle (base64 in `src/vendor/*.generated.ts`, 16
typefaces) and written to the vault font directory on first launch — no font
download from any CDN exists. All transliteration, dictionary lookup,
collation and sandhi processing runs entirely offline.

The only `requestUrl` calls fetch **local vault resources** (`app://local`
URLs) to render dictionary assets: entry audio (`.spx` decoded via an embedded
Speex-to-WASM decoder), MDD images/stylesheets, and gaiji images. These never
leave the device.

The dictionary panel renders **user-clicked** external search links (e.g.
CBETA Online, SuttaCentral, SAT Daizōkyō, 84000, DSBC, GRETIL). These are
ordinary `<a href>` links that open in the user's browser only after an
explicit click; the plugin itself does not contact these hosts.

| Host | Purpose | Data Sent | Direction |
| --- | --- | --- | --- |
| (none) | No plugin-initiated network traffic | — | — |
| app://local | Local vault resource fetch for dictionary assets (audio/images/CSS) via Obsidian `requestUrl` | None (local) | local only |

## Data Collection

| Data Type | Scope | Purpose |
| --- | --- | --- |
| Markdown note content | Active file being edited/viewed | Hover word lookup, transliteration of selections, variant annotation |
| Dictionary data files | User-configurable dictionary scan scope (default `dictionaries/` folder) — MDict (`.mdx`/`.mdd`) and TEI Lex-0 (`.lex0.xml` and tar archives) | Local word lookup, bookmarks, history, collation |
| Font files | Fonts bundled with the plugin | `@font-face` registration for scripts with low system availability |

Nothing is collected beyond the user's own vault. The plugin does not read
files outside the vault, and does not send any data anywhere.

## Third-Party Services

None. All functionality (dictionaries, transliteration, collation, sandhi,
lemmatization) runs entirely offline; offline use is fully supported.

## Permissions

- **Node `fs` (desktop + mobile via adapter)**: dictionary files are read from
  the user-configured scan scope inside the vault; `dictStore` mirror backups
  are written inside the vault (plugin directory excluded from the backup path
  so plugin updates never delete dictionary data). The plugin never reads or
  writes files outside the vault.
- **Clipboard (write only)**: `navigator.clipboard.writeText` is used for
  user-initiated "copy result / copy HTML" actions in the dictionary and
  transliteration panels. The clipboard is never read.
- **Dictionary content rendering**: entry HTML is rendered inside a sandboxed
  `srcdoc` iframe with a restrictive CSP
  (`default-src 'none'; style-src 'unsafe-inline'; img-src data: blob: asset: app://local …`),
  so dictionary content is isolated from the note editor and cannot restyle or
  script the vault UI.
- **WebAssembly (embedded)**: a Speex decoder compiled to WASM is embedded to
  play `.spx` dictionary audio; it processes local bytes only.
- Everything else uses standard Obsidian plugin APIs. No `child_process`, no
  shell execution, no filesystem access outside the vault.

## Data Storage

| What | Where | Encrypted |
| --- | --- | --- |
| Plugin settings | `data.json` in the vault's `.obsidian` folder (legacy `dict` / `dictStore` / `dictLookupCache` namespaces from lilium are preserved) | No (local file in the user's vault) |
| `dictStore` mirror backup | Inside the vault, outside the plugin directory | No |
| Installed/embedded fonts | Vault folder `.lilium/fonts` | No (standard font binaries) |
| Imported dictionary data | Inside the vault (`dictionaries/` scan scope) | No |

All storage is local to the user's vault/device. Nothing is uploaded.

## Security engineering notes

- The codebase is continuously linted against the official Obsidian scanner
  rule set (`eslint-plugin-obsidianmd` recommended config including
  `@microsoft/eslint-plugin-sdl` and `eslint-plugin-no-unsanitized`), with a
  baseline of 0 errors; audited residual exceptions are documented
  file-by-file in `docs/SECURITY-BASELINE.md` in the plugin source tree.
- The commit gate (`scripts/gate.mjs`, enforced by the commit-msg hook)
  scans staged changes for DOM-injection (`SEC-DOM`), network, and
  mobile-compatibility (no lookbehind regex for iOS < 16.4, no bare Node
  `require`) violations; every commit carries gate evidence.
- Long-input protection: a 100,000-character gate on every transliteration
  command path prevents UI freezes from oversized pastes.
- Remote code execution: none. No `eval` on network-derived input; no
  auto-updating code outside normal releases; no hidden telemetry.
