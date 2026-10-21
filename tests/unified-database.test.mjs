import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve, dirname, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { loadGrammarCatalog, loadGrammarUnit } from '../js/grammar/catalog.js';
import { validateBooksRegistry, bookBySourceId } from '../js/curriculum/books.js';
import { buildGrammarCatalog } from '../scripts/build-grammar-catalog.mjs';
import { exampleUnit } from './fixtures/grammar-fixture.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const json = async path => JSON.parse(await readFile(join(root, path), 'utf8'));

// Model the same local static-file URLs that the browser fetches.
const localFetch = async (url, options) => {
  const filename = fileURLToPath(url);
  assert.ok(filename.startsWith(join(root, 'database') + sep), `escaped database directory: ${filename}`);
  assert.ok(options === undefined || options.cache === 'no-store');
  try { return {ok: true, json: async () => JSON.parse(await readFile(filename, 'utf8'))}; }
  catch { return {ok: false, status: 404}; }
};

test('grammar manifest and every grammar lesson are loadable from unified database', async () => {
  const catalog = await loadGrammarCatalog(localFetch);
  const entries = catalog.filter(x=>x.collectionId==='english-grammar-1');
  assert.equal(entries.length, 115);
  const files = await readdir(join(root, 'database', 'English_Grammar_1'));
  assert.equal(files.filter(name=> /^eg1-u\d{3}\.json$/.test(name)).length, 115);
  assert.ok(entries.every(entry => entry.path.startsWith('database/English_Grammar_1/')));
  for (const entry of entries) {
    const unit = await loadGrammarUnit(entry, localFetch);
    assert.equal(unit.exercises.length, 12);
    assert.equal(unit.speakingExercises.length, 8);
    assert.equal(unit.listeningExercises.length, 8);
  }
});

test('both specialized catalog formats are registered under database, without mixing entries', async () => {
  const books = validateBooksRegistry(await json('curriculum/books.json'));
  const grammarBook = bookBySourceId(books, 'grammar', 'english-grammar-1');
  assert.equal(grammarBook?.manifest, 'database/grammar-manifest.json');
  const vocabulary = await json('database/manifest.json');
  assert.equal(vocabulary.units.length, 422);
  assert.equal(vocabulary.units.some(u => u.path.includes('English_Grammar')), false);
  const grammar = await json('database/grammar-manifest.json');
  const bookRegistry = await json('curriculum/books.json');
  const eg2Available = bookRegistry.books.find(b=>b.id==='english-grammar-2').status==='available';
  assert.equal(grammar.units.length, eg2Available ? 260 : 115);
  // An in-place upgrade can retain the old grammar/ folder.
  // Only paths in the unified database may be published in either catalog.
  assert.ok(grammar.units.every(u => /^database\/English_Grammar_[1-3]\/eg[1-3]-u\d{3}\.json$/.test(u.path)));
  assert.ok(vocabulary.units.every(u => u.path.startsWith('database/')));
});


test('a leftover legacy grammar folder is ignored by the unified catalog generator', async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'vocablab-unified-upgrade-'));
  try {
    const currentDir = join(temporaryRoot, 'database', 'English_Grammar_1');
    const legacyDir = join(temporaryRoot, 'grammar', 'units', 'english-grammar-1');
    await mkdir(currentDir, { recursive: true });
    await mkdir(legacyDir, { recursive: true });
    await writeFile(join(currentDir, 'eg1-u001.json'), JSON.stringify(exampleUnit('eg1-u001')));
    // Existing installations may retain even malformed old content;
    // the generator must never ingest it or follow its catalog.
    await writeFile(join(legacyDir, 'eg1-u999.json'), '{ invalid legacy json');
    await writeFile(join(temporaryRoot, 'grammar', 'manifest.json'), '{ invalid legacy manifest');
    const generated = await buildGrammarCatalog(temporaryRoot);
    assert.equal(generated.units, 1);
    const catalog = JSON.parse(await readFile(join(temporaryRoot, 'database', 'grammar-manifest.json'), 'utf8'));
    assert.deepEqual(catalog.units.map(unit => unit.path), ['database/English_Grammar_1/eg1-u001.json']);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});
