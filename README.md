# Lilium

**English** | [繁體中文](README.zh.md)

**Universal dictionary & transliteration for Obsidian** — transliteration for Sanskrit, Pali, Tibetan, Mongolian, Manchu, Uyghur, Siddham, 'Phags-pa and more.

## Features

### Dictionary
- **Formats**: MDict (`.mdx` / `.mdd`) and TEI Lex-0 (`.lex0.xml` / `.p5.xml`) — detected by extension plus content sniffing
- **Lookup**: hover word lookup while reading, full-text search across dictionaries, fuzzy and prefix matching (BK-tree)
- **Styling**: dictionary CSS is isolated inside its own wrapper element — dictionaries can never restyle your notes
- **Management**: drag-and-drop import with visible drop zone, bookmarks, lookup history, cross-entry links (`entry://`, `bword://`, TEI `xr` targets)
- **Export**: current entry as an Obsidian-friendly Markdown note (ruby → annotation, superscript/subscript conventions)

### Transliteration — 17 schemes

| Script | Scheme |
|---|---|
| Sanskrit | IAST |
| Pali | IAST |
| Ranjana (Rañjanā) | IAST |
| Tibetan | Wylie, extended Wylie |
| Manchu | Möllendorff ↔ Unicode |
| Ali-Gali | borrowed-letter IAST (Mongolian/Manchu) |
| Uyghur | ULY ↔ UEY |
| Old Uyghur | Latin ↔ Unicode |
| Mongolian | Academic Latin ↔ Unicode |
| ʼPhags-pa | Poppe ↔ Unicode |
| Marchen | Wylie ↔ Unicode |
| Zanabazar Square | extended Wylie ↔ Unicode |
| Soyombo | extended Wylie ↔ Unicode |
| Brahmi | IAST |
| Gandhari (Kharoshthi) | IAST |
| Sinhala | IAST |
| Siddham | IAST |

**Note: Transliteration is an experimental feature and provides only an approximate mapping.**

Each visible scheme also has three commands: **convert** (smart auto-direction), **to-roman** (→ Latin), **to-native** (→ native script).

Long-input protection applies on every command path (100,000-character gate) — a 1 MB paste can never freeze the UI.

Additional engines: a Pāṇini-based external sandhi engine for IAST composition (Goldman & Sutherland / Whitney rules) and variant-character annotation for dictionary hits.

### Interface languages
Traditional Chinese, Simplified Chinese, English, 日本語, 한국어, Français, Deutsch.

## Installation

### Community plugins browser (recommended)

The recommended installation method is Obsidian's built-in Community Plugins browser.

1. Open Obsidian Settings.
2. Go to `Community plugins`.
3. Select `Browse` and search for `Lilium`.
4. Install and enable `Lilium`.

### Manual installation
1. Download the latest `main.js`, `manifest.json` and `styles.css` from [Releases](https://github.com/quasicry/lilium/releases/latest)
2. Create a `.obsidian/plugins/lilium/` directory in your vault and copy the three files into it
3. Restart Obsidian → Settings → Community plugins → enable `Lilium`

## License

AGPL-3.0-or-later (see [LICENSE](LICENSE)); font licenses in [FONT-LICENSES.md](FONT-LICENSES.md) and [NOTICE.md](NOTICE.md).

## Author

quasicry · [GitHub](https://github.com/quasicry) · [Buy Me a Coffee](https://buymeacoffee.com/quasicry)
