# VocabLab

**A modular language-learning platform for vocabulary acquisition, listening comprehension, pronunciation practice, and adaptive spaced repetition.**

VocabLab is a browser-based language-learning application built with **HTML, CSS, and JavaScript**. Its core features work without a frontend framework, user accounts, paid APIs, or a cloud backend. The learning engine is independent of the content: you can study vocabulary from books, courses, professional topics, or personal collections by importing **JSON content packages** without changing the application code.

Knowing a word's translation is not the same as recognizing it in speech, pronouncing it intelligibly, or using it spontaneously. VocabLab therefore tracks learning activity **by skill**, helping learners focus on the abilities that need more practice.


## Table of contents

- [Features](#features)
- [Getting started](#getting-started)
- [Study workflow](#study-workflow)
- [Content management](#content-management)
- [JSON content package format](#json-content-package-format)
- [Audio and pronunciation](#audio-and-pronunciation)
- [Learning progress and backups](#learning-progress-and-backups)
- [Experimental PDF import](#experimental-pdf-import)
- [Project structure](#project-structure)
- [Testing](#testing)
- [Known limitations](#known-limitations)
- [Contributing](#contributing)

## Features

| Module | What it does |
| --- | --- |
| **Learn** | Introduces words and expressions with translations, IPA, example sentences, and usage notes. |
| **Listen** | Trains auditory word recognition through multiple-choice exercises and open dictation. |
| **Pronunciation Lab** | Plays reference audio, records your voice for self-comparison, and offers speech recognition where supported. |
| **Minimal Pairs** | Practices sound contrasts such as *ship/sheep*, *thin/sin*, and *fan/van*. |
| **Use & Recall** | Prompts active vocabulary recall from Portuguese-language clues. |
| **Adaptive Review** | Schedules skill-specific revision based on attempts, accuracy, streaks, and review dates. |
| **Unit Library** | Organizes learning units and supports searching, selecting, exporting, and removing content. |
| **Content Packages** | Imports multiple units, supports review and editing before publication, and handles unit conflicts. |
| **Progress & Backup** | Displays skill-specific progress and exports/restores the library and learning history. |
| **Audio Settings** | Configures the browser voice, rate, pitch, volume, recognition language, and MP3/TTS preferences. |

### Design principles

- **Content-independent:** the same learning engine can use book-derived, personal, or original technical vocabulary.
- **Skill-aware:** meaning, listening, pronunciation practice, and active use are tracked separately.
- **Local-first:** study data stays in your browser unless you explicitly export it.
- **Reviewable content:** content packages can be inspected and edited before publication.
- **Portable:** JSON packages and backups can be moved between installations.
- **Transparent about limitations:** speech recognition is not presented as a validated phonetic assessment.

## Getting started

### Requirements

- A modern browser with support for JavaScript modules. **Chrome** or **Edge** are recommended when testing speech-recognition features; other browsers may provide only partial support.
- **Python 3** for a simple local HTTP server. No Python packages are needed for normal application usage.
- Microphone permission **only** if you want to use recording or speech-recognition features.

### Windows (PowerShell)

Open PowerShell in the project root (the folder containing `index.html`) and run:

```powershell
python -m http.server 8085 --bind 127.0.0.1
```

Open **http://127.0.0.1:8085** in your browser.

### Linux and macOS

```bash
python3 -m http.server 8085 --bind 127.0.0.1
```

Open **http://127.0.0.1:8085** in your browser.

Press **Ctrl+C** in the terminal to stop the server. If the port is unavailable, select another available port and change the browser address accordingly.

> **Important:** Do not open `index.html` directly through `file://`. The application loads JSON files using `fetch()` and should be served over HTTP, including a local HTTP server.

### Available pages

| Path | Purpose |
| --- | --- |
| `/` or `/index.html` | Main application and learning modes. |
| `/packages.html` | JSON package import, review, and publication. |
| `/import.html` | Experimental PDF importer; requires its dedicated Python server. |

## Study workflow

1. Open **Unit Library** and select a learning unit.
2. Start with **Learn** to understand meanings, IPA, and example sentences in context.
3. Use **Listen** to practice recognizing spoken words, first with choices and then through dictation.
4. Open **Pronunciation Lab** to hear a reference, record yourself, and compare the recordings. Try speech recognition if your browser supports it.
5. Use **Use & Recall** to retrieve vocabulary without seeing the English answer.
6. Return to **Adaptive Review** for material that is due for practice.
7. Review **Progress & Backup** to inspect your learning history and export a backup.

The application records performance separately across **meaning, listening, pronunciation practice, and use**. A correct translation response does not automatically imply strong listening or speaking performance.

## Content management

The recommended workflow is **prepare → import → review → approve → publish**.

1. Open **Content Packages** at `/packages.html`.
2. Select **Import JSON**, or download the **template** to create a new package.
3. Choose the units to install and inspect their words, translations, IPA, and examples.
4. Correct or remove inaccurate entries.
5. Mark each reviewed unit as **approved**.
6. Choose a conflict policy and publish the approved units.
7. Return to **Unit Library** to study the imported content.

### Conflict policies

| Policy | Behavior |
| --- | --- |
| **Merge** | Updates entries that have matching IDs and keeps older entries missing from the incoming unit. |
| **Replace** | Replaces an installed unit's content with its incoming version. |
| **Skip** | Imports only units whose IDs are not already present. |

Learning progress is keyed by **`<unit-id>::<item-id>`**. Keep both IDs stable when revising a unit so existing progress can be preserved. The same English word may appear in different units; those occurrences are currently tracked as **separate learning records**.

**Before replacing a large number of units, export a backup.**

### Bundled example content

The VocabLab 1.1 distribution contains the following example data:

| File | Description |
| --- | --- |
| `data/unit-03.json` | Body-parts vocabulary demonstration. |
| `data/workplace-original.json` | Original professional-English vocabulary examples. |
| `data/minimal-pairs.json` | Six sound-contrast pairs. |
| `packages/english-vocabulary-in-use-elementary-starter.json` | Initial, partially curated collection. |
| `packages/english-vocabulary-in-use-elementary-expanded.json` | Expanded but **still partial** collection covering the book's 60 unit headings. |

**Content coverage warning:** The expanded Elementary package is **not** a complete, editorially verified conversion of the book. Its number of entries includes repeated vocabulary and thematic additions. See `COVERAGE_REPORT.md` for details.

Separately curated and audited unit packages can be imported to replace preliminary content. A unit being present in the expanded package **does not mean** that every learning objective or expression from the original unit has been verified. Always check its accompanying audit notes.

## JSON content package format

The batch importer uses the **`vocablab-content-package`** format, version `1`.

A minimal multi-unit package looks like this:

```json
{
  "format": "vocablab-content-package",
  "version": 1,
  "id": "technical-english-01",
  "title": "Technical English — Embedded Systems",
  "description": "Original vocabulary and examples for embedded-systems topics.",
  "units": [
    {
      "id": "technical-english-u01",
      "number": 1,
      "title": "Unit 01 — Hardware and Firmware",
      "bookId": "technical-english",
      "bookTitle": "Technical English",
      "level": "B1–B2",
      "category": "Engineering",
      "items": [
        {
          "id": "latency",
          "word": "latency",
          "pt": "latência",
          "ipa": "/ˈleɪtənsi/",
          "section": "System performance",
          "example": "The controller has lower latency now.",
          "note": "In this context, latency refers to a delay before a system responds.",
          "audio": ""
        }
      ]
    }
  ]
}
```

### Main fields

| Field | Purpose |
| --- | --- |
| `format`, `version` | Identify the content package format and version. |
| Package-level `id` | Identifies the logical collection. |
| `units` | Array of learning units to import. |
| `units[].id`, `units[].title` | Required stable unit ID and displayed title. |
| `units[].number`, `bookId`, `bookTitle`, `category`, `level` | Organize learning material by source, topic, and level. |
| `items[].id`, `items[].word`, `items[].pt` | **Required** item ID, word/expression, and Portuguese translation. |
| `ipa` | Phonetic transcription; use a consistent convention, such as UK IPA for British-English collections. |
| `section`, `example`, `note` | Topic, original example sentence, and pedagogical notes. |
| `audio` | Optional relative path to a local MP3 file. |

Unit and item IDs must contain only **letters, digits, hyphens, and underscores**. Extra editorial fields such as `audit`, `learningObjectives`, and `contentOrigin` may be present in curated source packages. **Not all extra metadata is retained by the current library importer**, so preserve the original JSON and any audit report.

### Current import limits

The current package manager enforces these limits:

- **1.8 MB** maximum input JSON file size.
- Up to **200 units** per package.
- Up to **12,000 items** in a package.
- **1–2,000 items** per individual unit.
- Approximately **4 MB** for the library's serialized data, in addition to the browser's own `localStorage` quota.

Split larger collections into smaller packages as needed.

### Editorial guidelines for book-based packages

When preparing a unit derived from a textbook:

1. Examine both its **teaching pages and exercise pages**.
2. Include relevant vocabulary, phrases, collocations, phrasal verbs, usage distinctions, and common mistakes.
3. Write natural Brazilian Portuguese translations, consistent IPA, and **original example sentences**.
4. Distinguish vocabulary explicitly verified in the source from **additional pedagogical material**.
5. Document what is covered and what remains incomplete in an audit report.
6. Never label an item as source-reviewed unless the underlying material was actually checked.
7. Do not reproduce entire copyrighted exercises, extended passages, illustrations, or licensed recordings.

The goal is **pedagogically consistent units**, not maximizing the number of imported words.

## Audio and pronunciation

VocabLab follows a **hybrid audio approach**:

- **Browser TTS:** speech synthesis through the Web Speech API using voices available in your browser or operating system.
- **Local MP3:** optional prerecorded audio files, with an automatic TTS fallback when a recording is unavailable.
- **Voice recording:** `getUserMedia` and `MediaRecorder` allow learners to record and replay their speech.
- **Speech recognition:** browser-dependent recognition for checking the detected words or phrases, when available.

The **Audio Settings** dialog allows you to select an available voice, adjust playback rate, pitch and volume, select a recognition language, and choose **Automatic**, **TTS only**, or **MP3 only**.

### Providing local MP3 audio

Set an item's `audio` property to an existing relative MP3 path, for example:

```text
assets/audio/technical-english-u01/latency.mp3
```

The file must be provided separately in the project's `assets/audio/` directory. **A JSON package does not embed or transfer MP3 files automatically.** The main application also has an ID-based default audio path for items without an explicit `audio` value. Example sentences currently use TTS.

> **Speech recognition is not phonetic scoring.** Correct transcription does not prove perfect pronunciation, and failed recognition does not prove unintelligible speech. The current Pronunciation Lab provides listening-based comparison and practice tracking; it does not provide a validated acoustic pronunciation score.

Available voices, browser permissions, and speech-recognition behavior differ by device and browser. Some speech-recognition implementations may send audio to the browser provider's external service.

## Learning progress and backups

VocabLab stores library and progress data in the browser's **`localStorage`**, scoped to the application's origin (**protocol + host + port**). The adaptive review scheduler uses per-skill history, attempts, success streaks, and review dates. It is a practical learning heuristic, **not** a validated language-proficiency assessment model.

### Back up your data

1. Open **Progress & Backup**.
2. Select **Full Backup** to export a JSON file containing the library and progress history.
3. Store that file somewhere safe, particularly before replacing existing content.
4. Use **Restore Backup** when necessary. **Restoring replaces the current library and progress data.**

> `http://127.0.0.1:8085` and `http://localhost:8085` are **different origins**. Changing the port also creates a different storage origin. For consistent access to existing progress, use the same address and port or export/import a backup.

The current full backup covers **learning units and progress**. Audio preferences are stored separately in the browser and should not be assumed to be part of the exported backup.

## Experimental PDF import

VocabLab 1.1 includes a **heuristic PDF vocabulary extractor** at `/import.html`. It can identify potential content in PDFs containing selectable text, but **it cannot replace human content review**. Text extraction may omit words, join unrelated material, or misclassify vocabulary. Built-in OCR is not included.

This importer requires its **dedicated Python server**, rather than the simple static server described above.

Install its dependency and start it from the project root:

```bash
python -m pip install pymupdf
python server.py 8085
```

Then open **http://127.0.0.1:8085/import.html**.

The PDF importer generates candidate material for inspection. You still need to check vocabulary, translations, pronunciation, and examples before publishing. For reviewed content prepared separately, **Content Packages is the recommended import path**.

## Project structure

```text
VocabLab/
├── index.html                   # Main learning application
├── packages.html                # JSON content package manager
├── import.html                  # Experimental PDF importer
├── server.py                    # Local PDF-analysis server
├── css/
│   ├── style.css
│   ├── packages.css
│   └── import.css
├── js/
│   ├── main.js                  # Learning views and exercises
│   ├── core.js                  # Library, progress, and validation
│   ├── audio.js                 # TTS, recording, and speech recognition
│   ├── package-core.js          # Package parsing and batch publishing
│   ├── packages-ui.js           # Package review and approval interface
│   └── importer.js              # PDF import interface
├── data/
│   ├── unit-03.json
│   ├── workplace-original.json
│   └── minimal-pairs.json
├── packages/
│   ├── english-vocabulary-in-use-elementary-starter.json
│   └── english-vocabulary-in-use-elementary-expanded.json
├── tests/
│   ├── test_package.mjs
│   ├── test_expanded.mjs
│   └── build_sample_pack.py
├── COVERAGE_REPORT.md
└── README.md
```

This tree describes the **VocabLab 1.1 distribution**. If the GitHub repository uses a different directory layout, update the paths in this README accordingly.

## Testing

With **Node.js** installed, run the existing package tests from the project root:

```bash
node --experimental-default-type=module tests/test_package.mjs
node --experimental-default-type=module tests/test_expanded.mjs
```

These tests primarily exercise **data formats, import rules, duplicate/conflict handling, progress preservation, and backups**. They do **not** constitute a complete browser end-to-end test suite, nor do they automatically verify linguistic correctness or IPA quality.

Manual browser testing is especially important for:

- TTS voice selection and playback behavior.
- Microphone permissions, recording, and audio playback.
- Speech-recognition availability and failure handling.
- Package review, approval, conflict resolution, and publication.
- Data persistence after reload and backup restoration.

## Known limitations

- **No cloud synchronization:** learning history is tied to the local browser and application origin.
- **No validated phoneme-level scoring:** speech recognition and self-assessment are not acoustic pronunciation analysis.
- **Browser-dependent audio:** voices, TTS quality, microphone features, and recognition vary across platforms.
- **Incomplete textbook packages:** content derived from books requires unit-by-unit auditing before a claim of comprehensive coverage can be made.
- **Progress tracked by IDs:** identical words in different units are not automatically merged into one learning record.
- **Limited end-to-end test coverage:** automated browser-interaction testing is not yet comprehensive.
- **Heuristic PDF import:** tables, diagrams, images, and teaching activities may be missed or misread.
- **Local storage limits:** large libraries may exceed browser storage quotas.
- **Some interface strings remain in Portuguese** in the current implementation; this English README does not imply that the UI has been fully localized.

## Contributing

Contributions to the **application code, tests, accessibility, documentation, and original learning content** are welcome. Before making major changes, consider opening an issue to describe the proposed improvement and its scope.

For new or revised content packages:

- Keep IDs stable when updating published material.
- Include original examples and clear learning notes.
- Record the content source and the scope of the review.
- Distinguish verified textbook content from added learning material.
- Validate the JSON and document any remaining gaps.
- Do not include third-party copyrighted files without appropriate rights.
