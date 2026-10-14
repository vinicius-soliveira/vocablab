# VocabLab

**A local-first English learning platform for vocabulary, grammar, and spaced practice.**

VocabLab is built with **HTML, CSS, and vanilla JavaScript**. It runs in your browser without a framework, account, API key, or paid service. Learning content is stored in JSON files, and study progress stays on your device.

## Learning modules

| Module | Features |
| --- | --- |
| **Vocabulary Lab** | Word meanings and translations, IPA, examples, listening, pronunciation practice, active recall, and adaptive review. |
| **Grammar Lab** | Grammar explanations, comparisons, contextual examples, common mistakes, exercises with feedback, and spaced review. |

### Vocabulary Lab

The built-in catalog contains four collections, **English Vocabulary 1–4**, covering **362 units** across levels A1–C2. Units are loaded on demand rather than copied into browser storage.

You can study through several activities:

- **Learn:** explore meanings, examples, pronunciation, and usage notes.
- **Listen:** practise recognizing spoken words and dictation.
- **Pronunciation Lab:** listen, record, replay, and practise minimal pairs.
- **Use & Recall:** retrieve words and expressions from prompts.
- **Adaptive Review:** revisit items according to your previous performance.

You can also import custom vocabulary packages in JSON format.

### Grammar Lab

The current pilot includes **10 lessons at B1–B2 level**, with **120 exercises** on tenses, articles, verb patterns, conditionals, modal verbs, relative clauses, passive voice, reported speech, and prepositions.

Each lesson combines teaching material with practice: explanations, side-by-side comparisons, annotated examples, common mistakes, and study tips. Exercises support:

- Multiple choice
- Gap-fill
- Error correction

Answers are evaluated deterministically against the solutions specified in each exercise, including explicitly accepted alternatives. Review sessions can combine due exercises from different lessons. Grammar progress is tracked separately from vocabulary progress.

## Getting started

**Requirements:** a modern web browser and Python 3 for the local HTTP server. Node.js is needed only for development tasks such as tests and catalog generation.

From the repository root, start the server:

**Windows (PowerShell)**

```powershell
python -m http.server 8085 --bind 127.0.0.1
```

**Linux / macOS**

```bash
python3 -m http.server 8085 --bind 127.0.0.1
```

Then open:

| Page | Local address |
| --- | --- |
| Vocabulary Lab | http://127.0.0.1:8085/index.html |
| Grammar Lab | http://127.0.0.1:8085/grammar.html |
| Vocabulary package manager | http://127.0.0.1:8085/packages.html |

Use an HTTP server instead of opening files through `file://`: VocabLab loads JavaScript modules and JSON content using browser requests. Stop the server with `Ctrl+C`.

## Content and JSON catalogs

| Module | Content location | Generated catalog |
| --- | --- | --- |
| Vocabulary | `database/` | `database/manifest.json` |
| Grammar | `grammar/units/` | `grammar/manifest.json` |

Both catalogs support **on-demand loading**. When you add or change files, rebuild the corresponding catalog:

```bash
npm run catalog
node scripts/build-grammar-catalog.mjs
```

The formats are intentionally separate:

- **Vocabulary:** `vocablab-content-package` (version 1), containing units with words, translations, examples, and optional audio metadata.
- **Grammar:** `vocablab-grammar-unit` (version 1), containing explanations, optional teaching sections, exercises, accepted answers, and feedback.

Existing files provide examples of both formats. To add personal vocabulary, open **Content Packages** to download a template, import a JSON file, review the entries, and publish selected units into your local library. Grammar content is currently added as lesson JSON files and registered by rebuilding its manifest.

**Keep unit, item, and exercise IDs stable.** Changing an ID may disconnect previously saved progress from that content.

## Progress and backups

VocabLab uses browser `localStorage` to retain learning progress and preferences. Vocabulary and grammar have **separate progress records and backup/restore options**. The provided catalogs remain in JSON files rather than being installed wholesale into browser storage.

There is no account or cross-device synchronization. Browser data is specific to the site origin: for example, `localhost:8085` and `127.0.0.1:8085` do not share the same `localStorage`. Export a backup before clearing browser data or changing your setup.

## Project structure

```text
VocabLab/
├── index.html                   # Vocabulary Lab
├── grammar.html                 # Grammar Lab
├── packages.html                # Vocabulary package manager
├── css/                         # Shared and module styles
├── js/                          # Vocabulary and shared logic
│   └── grammar/                  # Grammar engine, catalog, UI, progress
├── database/                    # Vocabulary JSON files and manifest
├── grammar/                     # Grammar lessons and manifest
├── scripts/                     # Catalog generators
└── tests/                       # Automated tests
```

## Development and limitations

Run the existing automated tests with:

```bash
npm test
```

The application does not require a build step. Some features depend on browser support, especially speech synthesis, microphone recording, and speech recognition. **Speech recognition is not a validated phonetic assessment**, and Grammar Lab does not automatically judge arbitrary free-form answers beyond its defined accepted solutions. Browser interactions still benefit from manual testing.

## Contributing

Contributions to code, accessibility, testing, documentation, and **original learning content** are welcome. Keep changes lightweight, write code and documentation in English, preserve stable content IDs, and contribute only material you have the right to share.
