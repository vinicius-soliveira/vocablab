# VocabLab

**A local-first English learning platform for vocabulary, grammar, listening, speaking, pronunciation, and spaced practice.**

VocabLab 1.4.1 uses HTML, CSS, and JavaScript modules. It runs without a paid API, external account, or backend. Content is stored in JSON files, and progress remains on the user's device.

## Learning modules

| Module | Capabilities |
| --- | --- |
| **Vocabulary Lab** | Definitions, translations, IPA, sentence examples, listening, active recall, and spaced review. |
| **Grammar Lab** | Teaching notes, writing, speaking, listening, deterministic feedback, and skill-specific spaced review. |
| **Pronunciation Lab** | Reference audio, recording, playback, recognition checks, and independent practice history. |
| **Content Packages** | Import and manage personal vocabulary packages in JSON format. |
| **Book Registry (1.4 foundation)** | Stable, publisher-neutral identities for current and planned course volumes. No new study UI yet. |

### Content available

The bundled vocabulary and collocations catalog contains **422 units** across five volumes (English Vocabulary 1–4 and English Collocations 1). The grammar catalog contains **115 units** of English Grammar 1, with **12 writing, 8 speaking, and 8 listening exercises per unit** (3,220 grammar exercises).

The new book registry lists **20 volumes: 6 available and 14 planned**. Planned volumes are metadata entries **without exercises or placeholder units**. Public-facing book titles use platform names such as `English Grammar 1` and `English Collocations 1`. Existing source identifiers are retained internally as compatibility aliases.

## Getting started

Use a local HTTP server; do not open pages with `file://`.

```powershell
python -m http.server 8085 --bind 127.0.0.1
```

Open:

| Page | URL |
| --- | --- |
| Vocabulary Lab | http://127.0.0.1:8085/index.html |
| Grammar Lab | http://127.0.0.1:8085/grammar.html |
| Pronunciation Lab | http://127.0.0.1:8085/pronunciation.html |
| Content Packages | http://127.0.0.1:8085/packages.html |

The book registry is a **data/API foundation**, not yet an additional page or a guided study planner. Existing study screens continue to operate as before.

## Updating catalogs and validating books

Node.js is required for development commands, but not for browser study:

```bash
npm run catalog
node scripts/build-grammar-catalog.mjs
npm run audit:books
npm test
```

| Component | Source | Generated or curated data |
| --- | --- | --- |
| Vocabulary and collocations | `database/**/*.json` | `database/manifest.json` |
| Grammar | `database/English_Grammar_N/*.json` | `database/grammar-manifest.json` |
| Books | `curriculum/books.json` | Curated; do not regenerate from source titles |
| Registry validation and browser loading | `js/curriculum/books.js` | Pure ESM module |
| Cross-catalog audit | `scripts/audit-books.mjs` | Checks all current manifest units |

See [Book registry contract](curriculum/README.md) for adding a future volume and preserving stable IDs.

## Progress and backups

Existing vocabulary, grammar, and pronunciation progress use separate local-storage keys and backups. **Version 1.4 does not migrate, merge, clear, or overwrite any existing progress.** Keep the application on the same browser origin (for example `127.0.0.1:8085`) and export your backups before resetting browser storage or moving machines.

A content item's identity is defined by its existing ID; do not rename published units, exercises, items, or historical source `bookId` values. A public book title can change independently of those IDs.

## Project structure

```text
VocabLab/
├── index.html, grammar.html, pronunciation.html, packages.html
├── curriculum/
│   ├── books.json             # Six available and fourteen planned volumes
│   └── README.md
├── css/
├── js/
│   ├── curriculum/books.js    # Book registry validation and browser loader
│   ├── grammar/
│   └── pronunciation/
├── database/                  # All learning content: vocabulary, grammar, collocations
│   ├── manifest.json          # Vocabulary and expressions manifest
│   ├── grammar-manifest.json  # Grammar manifest
│   └── English_Grammar_1/     # Published grammar units
├── scripts/                   # Catalog generation and audits
└── tests/                     # Unit and integration tests
```

## Limitations and content policy

The curriculum foundation provides a book registry but not yet learning paths, cross-book competencies, or a unified progress adapter. These will be separate, tested changes. Browser speech recognition is **not a reliable phonetic pronunciation grade**. Some features depend on the browser's audio support and installed voices.

Only distribute content and audio that you have the rights to share. The public book naming scheme is independent of any outside publisher or textbook series, and no endorsement or affiliation is implied.

### Unified content directory (1.4.1)

All learning materials now live under `database/`, including `database/English_Grammar_1/eg1-uNNN.json`.
The vocabulary and grammar manifests remain independent **formats** to preserve compatibility with their exercise engines, but both are now in the same directory: `database/manifest.json` and `database/grammar-manifest.json`.
The Grammar Lab JavaScript code is still in `js/grammar/`; that is application logic, not a second content database.
To regenerate both catalogs, run `npm run catalog:all`. No exercise IDs or browser-progress storage keys have changed.
**In-place updates:** an old `grammar/` directory may remain after extracting over an older installation. It is ignored by catalog generation and reading, and no longer causes a test failure. You may remove it later only after verifying the new database and backing up any unique files. Do not remove `js/grammar/`, which contains application code.
