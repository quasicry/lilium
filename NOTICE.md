# NOTICE

Lilium — universal dictionary & transliteration for Obsidian.

Copyright (C) 2026 quasicry

This program is free software: you can redistribute it and/or modify it under
the terms of the **GNU Affero General Public License** as published by the Free
Software Foundation, either version 3 of the License, or (at your option) any
later version (AGPL-3.0-or-later). See [LICENSE](LICENSE).

## Third-party components

### Fonts

Bundled fonts are distributed under the **SIL Open Font License 1.1** and remain
the property of their respective authors. Full attribution table, derivation
notes and version history: [FONT-LICENSES.md](FONT-LICENSES.md).

- Google Noto series (Mongolian, Old Uyghur, Tibetan, Devanagari, Siddham,
  Sinhala, Naskh Arabic, Hebrew, Brahmi, Kharoshthi, PhagsPa, Marchen,
  Zanabazar Square, Soyombo) — Copyright Google LLC, SIL OFL 1.1
- Nithya Ranjana DU (Rañjanā / Lantsa) — Copyright EkType, SIL OFL 1.1
- Lilium Sinological Dot — single-glyph subset derived from Noto Sans
  (instancer + subset, U+A78F only); original copyright notice ("The Noto
  Project Authors") preserved in the font's name table; family renamed without
  using the OFL Reserved Font Name "Noto"
- Lilium Vedic Bengali — single-codepoint subset derived from Noto Sans Bengali
  (U+1CF7 VEDIC SIGN ATIKRAMA only); original copyright notice ("The Noto
  Project Authors", github.com/notofonts/bengali) preserved; family renamed
  without using the OFL Reserved Font Name "Noto"
- Lilium Vedic Nandinagari — single-codepoint subset derived from
  Noto Sans Nandinagari (U+1CFA VEDIC SIGN DOUBLE ANUSVARA ANTARGOMUKHA only);
  original copyright notice ("The Noto Project Authors",
  github.com/notofonts/nandinagari) preserved; family renamed without using the
  OFL Reserved Font Name "Noto"

The `src/vendor/*.generated.ts` files embed these fonts as base64; they are
written to a vault font directory on first launch and registered via
`@font-face`.

### Third-party code

- **ZCode Mongolian input method tables** (`src/mongolian-ime/zcode-tables.generated.ts`,
  `src/mongolian-ime/zcode-engine.ts`) — positional-variant rules ported from
  [zmongol/mongol_editor_package](https://github.com/zmongol/mongol_editor_package)
  (`lib/src/utils/zcode_logic.dart`), **MIT License**, Copyright (c) 2025 Zmongol
  Editor Contributors. The upstream MIT license text and copyright notice are
  reproduced in [FONT-LICENSES.md](FONT-LICENSES.md); the tables themselves are
  mechanically extracted and semantically identical to upstream. MIT is compatible
  with this project's AGPL-3.0-or-later.

### Test corpora

Corpora used for gates and tests are **not** distributed with the plugin
repository; sources and their licenses are documented in the project workspace.
The kaikki.org material used by the Manchu corpus gate is CC-BY-SA.


The MIT license text for the above:

```
MIT License

Copyright (c) 2025 Zmongol Editor Contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
