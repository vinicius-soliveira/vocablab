# VocabLab 1.5.1 — Content Publication Safety

This release **extends** the existing v1.5.0 pipeline, retaining `validate`, `audit`, `publish`, and `verify`, and preserving existing stable book, unit, exercise, and lexical item IDs.

## One-time upgrade and baseline

Extract the patch to the repository root on a clean feature branch. Then:

```powershell
node scripts/upgrade-content-v1.5.1.mjs
node scripts/content-identities.mjs init
node scripts/content-identities.mjs check
npm test
npm run audit:books
npm run catalog:all
git diff --check
```

`init` **creates** `curriculum/content-identities.json` with `wx` (will not overwrite an existing baseline). Review and commit this initial snapshot. For the present library, expect 7 available books / 682 units. If the published catalog is unexpectedly different, investigate **before** approving that baseline.

Do **not** run `init` again to bypass ID mismatch warnings. Any intended breaking ID migration requires a separate reviewed process that accounts for existing progress records.

## Identity protection

Each published unit stores a fingerprint of its ID lists: Writing, Speaking and Listening for Grammar; lexical item IDs for Vocabulary-like material. The fingerprint is independent of wording, translations, example sentences and feedback. An altered, removed or added ID fails `content-identities.mjs check` and `content.mjs verify`. Because identical IDs can still acquire different meanings, editorial review remains mandatory for changes to answers or exercise semantics.

When a new planned book is successfully published, its identity fingerprints are appended to the lock in the same rollback scope as the registry/manifests. The established books' fingerprints may not change.

## Publication controls

- An exclusive `.content-publish.lock` prevents two instances of the *VocabLab publisher* running concurrently in the same checkout. It does not stop direct filesystem edits.
- The lock is automatically released after a caught success/error. After a power failure or force-kill, inspect the checkout before manually removing a stale lock.
- Injection checkpoints (`onPhase`) are accessible only via programmatic calls for regression tests, not exposed as CLI switches.
- On caught publication errors, the pipeline restores snapshots of the registry and generated manifests **and the identities file**, deletes only files created by its publication, and attempts to remove a newly created directory **only if empty**.
- This remains **best-effort rollback**, not a crash-safe multi-file transaction.
- Existing `available` books cannot be overwritten through `publish`. Corrections to published content must be reviewed and checked against identity snapshots.

## Auditing and CI

```powershell
node scripts/content.mjs audit --book english-grammar-3 --expected <real-count>
node scripts/content.mjs audit --book english-collocations-2 --expected <real-count>
```

The reports at `content-reports/<book-id>-audit.json` now include a versioned format, pass/fail, unit and file counts, errors, warnings, and structured issue location/severity. They remain local/ignored by Git.

The GitHub Actions workflow runs identity checks, book and grammar audits, the complete test suite, catalog regeneration, and rejects any resulting differences in committed generated manifests. A pull request should be green before merging to `main`.

## Future Grammar 3 / Collocations 2

The two volumes can be produced in independent workstreams; keep their final files in `content-staging/English_Grammar_3/` and `content-staging/English_Collocations_2/`. Run validate and audit with the **correct, actual number of units** before publication. Lexical JSON packages may contain multiple units.
