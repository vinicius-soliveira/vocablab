# Content Integration Pipeline (VocabLab 1.5.0)

The Books Library uses **platform-owned book names** from `curriculum/books.json`. New content must not place third-party book titles in public labels or generated manifests. Preserve existing stable unit and exercise IDs when correcting a published book.

## Preparing a new volume

1. Register the book as `planned` in `curriculum/books.json` (currently 20 known books).
2. Produce and review canonical JSON pilots before parallel authoring.
3. Place all finished JSONs outside `database/`, in `content-staging/English_Grammar_3/`, `content-staging/English_Collocations_2/`, etc.
4. Count the expected *units*, not JSON files (a lexical file may contain multiple units).
5. Never use a local output folder inside `database/` for staging.

## Commands

```powershell
node scripts/content.mjs validate --book english-grammar-3 --expected 100
node scripts/content.mjs audit --book english-grammar-3 --expected 100
node scripts/content.mjs publish --book english-grammar-3 --expected 100
node scripts/content.mjs verify --book english-grammar-3 --expected 100
```

Replace `100` with the actual known unit count. `--expected` is required for staging validation and publication to prevent accidental partial releases. Use the **canonical book ID**, not its folder name. The default staging directory derives from the registry, but `--source C:\path\to\staging` may override it.

`validate` is read-only; it checks filenames, schemas, unique IDs, number coverage, activity contracts, and compatibility with the current engine. `audit` performs those same checks and saves `content-reports/<book-id>-audit.json`. The generated report is ignored by Git.

`publish` is limited to `planned` books and rejects existing destination files, already published units, or incomplete staging. It changes `books.json`, copies units into `database/`, regenerates vocabulary and grammar catalogs and the curriculum index, and verifies their consistency. It restores the original registry/manifests and removes files created by this publication if a **caught** error occurs. This is a **best-effort rollback**, not a crash-safe multi-file transaction. Avoid concurrent publishing and always use version control.

`verify` checks the published book against actual JSON files, both manifests, and the public index; it requires no staging folder. It may be used after every catalog rebuild.

## Current scope

- **Grammar:** existing unit schema, 12 Writing / 8 Speaking / 8 Listening exercises, required teaching blocks, sequence and answer checks.
- **Vocabulary-like:** grouped or single-unit JSON packages, unique IDs, lexical item fields, unit numbering, catalog compatibility.
- **Pronunciation:** not publishable through this pipeline until a compatible content schema and runtime engine exist.

Additional editorial review is always required. Automated checks cannot guarantee linguistic accuracy, naturally spoken examples, copyright compliance, or appropriate CEFR difficulty.

## Release checklist

```powershell
npm run catalog:all
npm run audit:books
node scripts/audit-grammar-answers.mjs
npm test
git diff --check
```

Then manually check the first and last units, representative Writing/Speaking/Listening exercises, book navigation, backups, and existing progress. Commit on a feature branch only after successful review.

## Revisions

This first version intentionally **does not overwrite available books**. A future revision workflow must distinguish safe wording corrections from semantic changes to exercise answers, and protect user progress accordingly. Do not delete or renumber established IDs.
