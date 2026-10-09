# VocabLab

**Learn vocabulary through meaning, listening, pronunciation, active recall, and spaced repetition.**

VocabLab is a lightweight, local-first language-learning platform built with **HTML, CSS, and vanilla JavaScript**. It helps you build vocabulary, recognize spoken words, practise pronunciation, and retain what you learn over time.

Import your own learning content using a simple JSON template. No frameworks, user accounts, API keys, or paid services are required to use the core application.

## Features

| Feature | What you can do |
| --- | --- |
| **Learn** | Explore words and expressions with translations, IPA, examples, and usage notes. |
| **Listen** | Train listening comprehension with multiple-choice questions and dictation. |
| **Pronunciation Lab** | Hear a reference, record your voice, replay your recording, and practise minimal pairs. |
| **Use & Recall** | Retrieve words and expressions from meaning-based prompts. |
| **Adaptive Review** | Revisit vocabulary based on performance and review schedules. |
| **Content Packages** | Import, inspect, edit, approve, and publish vocabulary units from JSON files. |
| **Audio Settings** | Choose an available voice, playback speed, pitch, volume, and audio source. |
| **Progress & Backup** | Track learning across skills and export or restore local progress. |

Progress is tracked separately for **meaning, listening, pronunciation practice, and usage**. Recognizing a word in writing does not automatically count as understanding it in speech.

## Getting started

### Requirements

- A modern browser with JavaScript enabled.
- Python 3 to run a simple local HTTP server.
- A microphone and supported browser features only if you want to record or recognize speech.

No Python libraries or JavaScript dependencies need to be installed for normal use.

### Run locally

Open a terminal in the project directory (where `index.html` is located).

**Windows — PowerShell**

```powershell
python -m http.server 8085 --bind 127.0.0.1
```

**Linux / macOS**

```bash
python3 -m http.server 8085 --bind 127.0.0.1
```

Then open **http://127.0.0.1:8085**.

Stop the server with `Ctrl+C`.

> Use a local HTTP server rather than opening `index.html` as a `file://` URL, because VocabLab loads JavaScript modules and JSON data.

## How to study

1. Open **Unit Library** and choose a learning unit.
2. Start with **Learn** to understand the meaning, pronunciation, and context.
3. Switch to **Listen** to identify words by sound and practise dictation.
4. Use **Pronunciation Lab** to listen, record, and compare.
5. Practise retrieving words in **Use & Recall**.
6. Complete sessions in **Adaptive Review** to reinforce weaker vocabulary.
7. Check **Progress & Backup** to review performance and save your data.

## Create and import learning content

VocabLab uses **JSON content packages**. A package can include a single learning unit or several units, each containing words or expressions.

You don't need to change the application code to add new content.

### Use the built-in template

1. Open **Content Packages** (`packages.html`).
2. Select **Template** to download an example JSON file.
3. Add your units and vocabulary entries.
4. Choose **Import JSON package** and select your file.
5. Review the content, edit any entries, and approve the units.
6. Select **Publish approved units**.

A template lets you provide:

- **Words and expressions** to learn.
- **Translations** and **IPA pronunciations**.
- **Example sentences** and **usage notes**.
- **Sections, levels, and learning objectives** to organize the content.
- **Optional MP3 references** for recorded pronunciations.
- **Optional speech text** for expressions that should be spoken differently from how they are displayed.

### Example JSON package

```json
{
  "format": "vocablab-content-package",
  "version": 1,
  "id": "everyday-vocabulary-01",
  "title": "Everyday Vocabulary",
  "description": "Useful everyday words and expressions.",
  "units": [
    {
      "id": "everyday-u01",
      "number": 1,
      "title": "Daily Activities",
      "level": "A2",
      "learningObjectives": [
        "Recognize everyday expressions in speech.",
        "Use new vocabulary in simple sentences."
      ],
      "items": [
        {
          "id": "umbrella",
          "word": "umbrella",
          "pt": "guarda-chuva",
          "ipa": "/ʌmˈbrelə/",
          "section": "Everyday objects",
          "example": "My umbrella is by the door.",
          "note": "Use 'an umbrella' in the singular.",
          "audio": ""
        },
        {
          "id": "take-a-break",
          "word": "take a break",
          "pt": "fazer uma pausa",
          "ipa": "/teɪk ə breɪk/",
          "section": "Daily activities",
          "example": "Let's take a break after lunch.",
          "note": "A common expression for stopping an activity to rest.",
          "audio": ""
        }
      ]
    }
  ]
}
```

The `pt` field is required in the current schema and represents a Portuguese translation. Its name is preserved for backward compatibility.

### Main content fields

| Field | Purpose |
| --- | --- |
| `format`, `version` | Identify the supported content-package format. |
| `id`, `title` | Identify a package or unit; IDs must be stable. |
| `units` | List of learning units included in the package. |
| `items` | Vocabulary entries inside each unit. |
| `word` | Display text for a word or expression. |
| `pt` | Portuguese meaning or translation (required). |
| `ipa` | Optional phonetic transcription. |
| `section` | Optional group or topic. |
| `example` | Optional sentence showing how the item is used. |
| `note` | Optional explanation or usage guidance. |
| `audio` | Optional relative path to an MP3 file. |
| `speechText` | Optional naturally speakable text for audio playback. |
| `learningObjectives` | Optional list of learning goals for a unit. |
| `targetType`, `contentOrigin` | Optional content classification and provenance fields. |

Required item fields are `id`, `word`, and `pt`. Unit fields `id`, `title`, and a non-empty `items` array are also required. The content manager validates packages before publishing.

**Keep IDs stable.** Learning progress is associated with `<unit-id>::<item-id>`. Renaming IDs may disconnect previously recorded progress from an updated item.

### Updating existing content

When you import a unit that already exists, choose a conflict policy:

| Policy | Behavior |
| --- | --- |
| **Merge** | Update entries with matching IDs and keep existing entries not present in the new package. |
| **Replace** | Replace the unit's content. Progress with matching IDs remains associated. |
| **Skip** | Leave the existing unit unchanged. |

Make a backup before replacing large amounts of content.

### Current import limits

- Maximum JSON file size: **1.8 MB**.
- Maximum **200 units** or **12,000 entries** per package.
- Each unit must have **1–2,000 entries**.
- The installed library is limited by browser storage capacity (with an additional application-side size check).

For larger collections, split content into smaller packages.

## Audio and pronunciation

VocabLab supports two audio sources:

- **Text-to-speech (TTS):** uses voices made available by your browser or operating system.
- **MP3 files:** optional local audio references for individual entries.

In **Audio Settings**, choose the available voice, rate, pitch, volume, and playback mode:

- **Auto:** prefer an available MP3 and fall back to TTS.
- **TTS only:** always use browser speech synthesis.
- **MP3 only:** use a recording when one is available.

To associate a recording with a vocabulary item, add a relative audio path:

```json
"audio": "assets/audio/everyday-u01/umbrella.mp3"
```

Then place the actual MP3 file at that location. JSON packages contain the path, **not the MP3 file itself**.

For a grammar pattern or template-like entry, `speechText` can provide a natural utterance for playback.

The Pronunciation Lab uses browser microphone and speech-recognition capabilities when available. **Speech recognition does not provide a validated phonetic-accuracy score.** Recording and listening to your own speech remains useful even when automatic recognition is unavailable.

> Speech recognition may rely on services provided by the browser vendor. Check your browser's privacy settings before using it.

## Progress, storage, and backups

VocabLab stores your library, progress, and preferences in browser `localStorage`. There is no account or cloud synchronization in the current release.

To protect your data, use **Progress & Backup** to export a backup, and restore it when needed. A restore replaces the current stored library and progress.

Browser storage is tied to the site's **origin**. For example:

- `http://127.0.0.1:8085`
- `http://localhost:8085`

These are different storage origins, even on the same computer. Keep the same address and port or export your backup before switching.

## Project structure

```text
VocabLab/
├── index.html              # Learning dashboard and exercises
├── packages.html           # Content package manager
├── css/
│   ├── style.css
│   └── packages.css
├── js/
│   ├── main.js             # Learning interface and exercise logic
│   ├── core.js             # Library, progress, validation, and review
│   ├── audio.js            # Speech synthesis, audio, and recording
│   ├── package-core.js     # JSON package parsing and publishing
│   └── packages-ui.js      # Content review and approval interface
├── data/                   # Demonstration content
├── tests/
│   ├── audio.test.mjs
│   └── content.test.mjs
├── package.json
└── README.md
```

The core application uses plain web technologies and does not require a build step.

## Run tests

Node.js is required **only** for development tests, not to run VocabLab.

```bash
npm test
```

The automated tests cover content parsing, validation, metadata preservation, importing, progress and backup behavior, and audio fallback logic. Browser interactions, microphone permissions, and speech recognition still need manual testing.

## Current limitations

- Data is saved locally; there is no multi-device sync.
- Content imports use **JSON files**.
- Audio and speech recognition depend on browser support.
- Automatic speech recognition is not a substitute for detailed pronunciation assessment.
- Renamed vocabulary IDs are not automatically migrated.
- Browser storage limits how much content can be saved.
- Automated tests do not cover every browser interaction.

## Contributing

Contributions are welcome for improvements to accessibility, user experience, performance, tests, documentation, and original learning content.

For code changes:

1. Create a branch for your change.
2. Keep the implementation lightweight and avoid unnecessary dependencies.
3. Use descriptive **English names, comments, and documentation**.
4. Run `npm test` before opening a pull request.
5. Describe the change and include steps to verify it.

For learning content, use the JSON template, keep IDs stable, and provide clear examples and metadata. Only contribute material you have the rights to share.
