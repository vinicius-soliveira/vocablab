# VocabLab Book Registry — v1

`books.json` is the central metadata registry for VocabLab course volumes. Book names displayed in the UI and generated manifests are defined in this registry, ensuring consistent naming across the platform.

## Example

```json
{
  "id": "english-grammar-1",
  "title": "English Grammar 1",
  "family": "grammar",
  "sequence": 1,
  "levels": ["A1", "A2"],
  "status": "available",
  "contentProvider": "grammar",
  "manifest": "database/grammar-manifest.json",
  "sourceIds": ["english-grammar-1"]
}
```

- `id` and `title`: VocabLab-owned public identifiers. Titles follow `English <Family> <Number>`.
- `family` and `sequence`: support ordered book families and future curriculum navigation.
- `levels`: approximate CEFR coverage; do **not** treat this as proof of a learner's proficiency.
- `status`: `available` or `planned`.
- `contentProvider`: for **available** volumes, `vocabulary` or `grammar` (the two existing catalog engines).
- `manifest`: for **available** volumes, a safe local manifest path matching the provider.
- `sourceIds`: the exact, **unchanged** historical `bookId` or `collectionId` values inside source catalogs. They are internal aliases. An old alias can differ from the book's public ID.

**Planned books** contain only `id`, `title`, `family`, `sequence`, `levels`, and `status`. They do not pretend to have a source, unit count, exercises, or a generated manifest. Future content types require a distinct schema/provider integration before their status becomes available.

## Adding an available book

1. Register its public name and status in `books.json`.
2. Keep the original `bookId` / `collectionId` in existing JSON content or source manifests; use it in `sourceIds`.
3. For currently supported providers, generate the relevant manifest (`npm run catalog` or `node scripts/build-grammar-catalog.mjs`). The grammar provider currently supports only `english-grammar-1` through `english-grammar-3`.
4. Run `npm run audit:books` and `npm test`. All units must map to exactly one available book. An unregistered imported book triggers an audit error, rather than being silently misclassified.
5. Check user-facing labels in the existing UI. The book registry does not modify teaching content or provenance stored inside JSON packages.

The book registry is an **additional layer**, not a replacement for `database/manifest.json` or `database/grammar-manifest.json`. Its browser loader is `loadBooks()` from `js/curriculum/books.js`. Version 1.4.2 adds `curriculum/index.json` and a `library.html` Books Library for read-only book/unit navigation and progress summaries; the registry itself does not change existing local-storage data or exercise engines.

## Backward compatibility

The vocabulary generator uses the registry to set published `bookTitle` values; grammar collections expose their neutral names. Existing unit and exercise IDs, historical source book IDs, learning progress keys, and backup formats remain unchanged. Source metadata may be retained inside original content packages for editorial traceability; it is not the book label shown in generated catalogs.

Grammar unit files live in `database/English_Grammar_1/` (and `_2`, `_3` for future volumes).
