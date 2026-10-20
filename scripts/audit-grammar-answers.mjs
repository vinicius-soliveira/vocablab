/**
 * Inspect and optionally remove equivalent answer variants from Grammar Lab units.
 * Place this file at scripts/audit-grammar-answers.mjs inside your VocabLab project.
 * Usage: node scripts/audit-grammar-answers.mjs [--fix]
 *
 * Dry-run by default. --fix preserves the first equivalent answer, validates each
 * unit, and saves originals to grammar-answer-backups/<timestamp>/ before writing.
 * Does not change exercise IDs, answers with different normalized meanings,
 * or any saved learning progress.
 */
import { readdir, readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeAnswer } from '../js/grammar/engine.js';
import { validateGrammarUnit } from '../js/grammar/schema.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const unitRoot = join(root, 'database');
const args = process.argv.slice(2);
if (args.some(a => a !== '--fix') || args.filter(a => a === '--fix').length > 1) {
  console.error('Usage: node scripts/audit-grammar-answers.mjs [--fix]');
  process.exit(2);
}
const apply = args.includes('--fix');
const kinds = ['exercises', 'speakingExercises', 'listeningExercises'];

async function* jsonFiles(folder) {
  for (const ent of (await readdir(folder, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const path = join(folder, ent.name);
    if (ent.isDirectory()) yield* jsonFiles(path);
    else if (ent.isFile() && ent.name.endsWith('.json')) yield path;
  }
}

const updates = [];
let examined = 0;
let answerLists = 0;
let removed = 0;
for await (const file of (async function*(){
  for (const book of ['English_Grammar_1','English_Grammar_2','English_Grammar_3']) {
    yield* jsonFiles(join(unitRoot,book));
  }
})()) {
  examined++;
  const raw = await readFile(file, 'utf8');
  const unit = JSON.parse(raw);
  const changes = [];
  for (const kind of kinds) {
    for (const ex of unit[kind] || []) {
      if (!Array.isArray(ex.acceptedAnswers)) continue;
      answerLists++;
      const seen = new Map();
      const distinct = [];
      for (const answer of ex.acceptedAnswers) {
        const normalized = normalizeAnswer(answer);
        if (seen.has(normalized)) {
          changes.push({kind, id: ex.id, original: seen.get(normalized), redundant: answer});
          removed++;
        } else {
          seen.set(normalized, answer);
          distinct.push(answer);
        }
      }
      if (distinct.length !== ex.acceptedAnswers.length) ex.acceptedAnswers = distinct;
    }
  }
  if (changes.length) {
    // Fail safely before any write if fixing the responses would make a unit invalid.
    validateGrammarUnit(unit);
    updates.push({file, raw, unit});
    for (const c of changes) {
      console.log(`${relative(root, file)} | ${c.kind}/${c.id}`);
      console.log(`  Keep:   ${JSON.stringify(c.original)}`);
      console.log(`  Remove: ${JSON.stringify(c.redundant)}`);
    }
  }
}

console.log(`\nChecked ${examined} JSON files and ${answerLists} accepted-answer lists.`);
console.log(`Found ${removed} redundant answers across ${updates.length} files.`);
if (apply && updates.length) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = join(root, 'grammar-answer-backups', stamp);
  for (const {file, raw} of updates) {
    const backupPath = join(backupDir, relative(unitRoot, file));
    await mkdir(dirname(backupPath), {recursive: true});
    await copyFile(file, backupPath);
  }
  // Writes happen only after every changed JSON has been validated and backed up.
  for (const {file, unit} of updates) {
    await writeFile(file, JSON.stringify(unit, null, 2) + '\n', 'utf8');
  }
  console.log(`Updated ${updates.length} files. Originals saved at: ${backupDir}`);
  console.log('NOTE: Do not include the grammar-answer-backups/ folder in your git commit.');
} else if (!apply && updates.length) {
  console.log('Dry run only: no files were modified. To remove duplicates, rerun with --fix.');
} else if (!updates.length) {
  console.log('No duplicate variants found.');
}
