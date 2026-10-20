# VocabLab

**A local-first English learning platform built around structured courses, practice, and spaced repetition.**

VocabLab brings vocabulary, grammar, listening, speaking, and pronunciation practice into a browser-based study environment. Lessons are organized into numbered course volumes, with a shared **Books Library** for finding content and launching activities in the appropriate learning lab.

The application is built with **HTML, CSS, and vanilla JavaScript**. Learning content is stored in JSON files, and study progress stays in the browser. No account, cloud database, paid API, or frontend build process is required for local use.

**Version:** `1.4.2` · **Status:** Active development

## What you can do

| Area | Features |
| --- | --- |
| **Books Library** | Browse available volumes, search or filter units, follow their original sequence, and open lessons directly. |
| **Vocabulary Lab** | Study words and expressions through examples, audio, recall, recognition, and scheduled reviews. |
| **Grammar Lab** | Read explanations, practise writing, speaking, and listening, and review each skill independently. |
| **Pronunciation Lab** | Listen to model audio, record and compare speech, and check word or sentence recognition. |
| **Custom Packages** | Import and manage additional vocabulary content from JSON packages. |
| **Progress & History** | Track practice and review activity locally, view grammar statistics, and export or import supported progress backups. |

**Current scope:** Books Library provides navigation and progress summaries. Cross-book competency mapping, personalized learning paths, and a unified daily study planner are **not implemented yet**. Browser speech recognition evaluates recognized words, **not phonetic pronunciation quality**.

## Course library

The current curriculum includes **6 available volumes** and **14 planned volumes**. Available content contains **537 units** in total.

| Available volume | Units |
| --- | ---: |
| English Vocabulary 1 | 60 |
| English Vocabulary 2 | 100 |
| English Vocabulary 3 | 101 |
| English Vocabulary 4 | 101 |
| English Grammar 1 | 115 |
| English Collocations 1 | 60 |
| **Total** | **537** |

English Grammar 1 contains **12 writing, 8 speaking, and 8 listening exercises per unit** (3,220 exercises altogether). The other five volumes together provide 422 vocabulary and expression units.

Course names are defined centrally in [`curriculum/books.json`](curriculum/books.json), using VocabLab's consistent naming convention (for example, `English Grammar 1`). Stable internal identifiers and aliases preserve compatibility with existing lesson data and study progress.

The CEFR ranges associated with a volume indicate its intended content level; they do not certify a learner's proficiency.

## Quick start

**Requirements**

- Python 3, or any static HTTP server
- A current desktop browser
- Node.js for generating catalogs and running development tests (not required for everyday study)

From the project root, run:

```powershell
python -m http.server 8085 --bind 127.0.0.1
```

Open **[Books Library](http://127.0.0.1:8085/library.html)** to select a course volume and unit.

You can also open each module directly:

| Module | URL |
| --- | --- |
| Books Library | `http://127.0.0.1:8085/library.html` |
| Vocabulary Lab | `http://127.0.0.1:8085/index.html` |
| Grammar Lab | `http://127.0.0.1:8085/grammar.html` |
| Pronunciation Lab | `http://127.0.0.1:8085/pronunciation.html` |
| Custom Packages | `http://127.0.0.1:8085/packages.html` |

> **Use an HTTP server.** Opening the pages with `file://` can prevent JSON catalogs and JavaScript modules from loading correctly.

Microphone recognition and text-to-speech availability depend on browser, operating system, installed voices, and permissions. Some browser speech features may use provider services.

## Development and validation

Run these commands in the project root:

```powershell
# Rebuild all generated catalogs in dependency order
npm run catalog:all

# Check available books and published units against the registry
npm run audit:books

# Run the automated test suite
npm test
```

Other useful commands:

| Command | Output |
| --- | --- |
| `npm run catalog` | `database/manifest.json` |
| `npm run catalog:grammar` | `database/grammar-manifest.json` |
| `npm run catalog:curriculum` | `curriculum/index.json` |
| `npm run catalog:all` | All three catalogs, in order |
| `npm run audit:books` | Registry and catalog consistency checks |
| `npm test` | Automated unit, integration, and content tests |

Rebuild the catalogs after changing published lesson content, book metadata, or directory structure. Before committing changes, run the audit and test suite, then smoke-test the affected pages in a browser.

## Adding a course volume

1. **Register the volume** in [`curriculum/books.json`](curriculum/books.json) with a stable public ID, neutral title, family, sequence, CEFR coverage, and status.
2. **Add its units** to a matching directory inside `database/`. Existing vocabulary and grammar formats have supported loaders; a new activity format requires its own schema and integration.
3. **Preserve established identifiers.** Do not rename existing unit IDs, exercise IDs, or progress keys. Use registry aliases when historical content identifiers differ from the public volume ID.
4. **Publish the volume** by setting the appropriate supported content provider, manifest, source identifiers, and status in the registry.
5. **Generate and validate** with `npm run catalog:all`, `npm run audit:books`, and `npm test`.
6. **Verify the UI** by opening the volume in Books Library and completing an activity in its learning lab.


## Progress and data

VocabLab currently stores progress in browser-local storage. Existing vocabulary, grammar, and pronunciation records remain independent; Books Library reads progress summaries without migrating or overwriting those records.

- **Back up your progress** before replacing files, changing computers, or clearing browser data.
- **Use the same origin** when returning to your studies: `127.0.0.1:8085` and `localhost:8085` have separate browser storage, as do different ports.
- **Custom packages and older local records** may remain in browser storage even if they are not displayed as published volumes in Books Library.
- **There is no account synchronization** or shared multi-user database in version 1.4.2.

## Roadmap

Development is focused on expanding course coverage while keeping existing data and exercises compatible:

- **Content expansion:** English Grammar 2 and 3, additional collocations, phrasal verbs, and idioms.
- **Pronunciation courses:** structured activities for sound perception, word and sentence stress, connected speech, and intonation.
- **Competency mapping:** relationships between units, learning outcomes, and prerequisites across course volumes.
- **Guided learning:** personalized study plans and daily sessions using course content and review history.
- **Future portability:** improved offline delivery and optional multi-device synchronization.

These are **planned capabilities**, not features included in the current release.
