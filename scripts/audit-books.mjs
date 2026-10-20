/** Check that available books resolve to real, uniquely assigned manifest units. */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { validateBooksRegistry, bookBySourceId } from '../js/curriculum/books.js';

export async function auditBooks(root) {
  const json = async path => JSON.parse(await readFile(join(root, path), 'utf8'));
  const books = validateBooksRegistry(await json('curriculum/books.json'));
  const vocab = await json('database/manifest.json');
  const grammar = await json('database/grammar-manifest.json');
  if (vocab.format !== 'vocablab-catalog' || !Array.isArray(vocab.units) ||
      grammar.format !== 'vocablab-grammar-catalog' || !Array.isArray(grammar.units)) {
    throw new Error('Invalid source manifest format.');
  }
  const counts = Object.fromEntries(books.map(x => [x.id, 0]));
  const seen = new Set();
  for (const [provider, units] of [['vocabulary', vocab.units], ['grammar', grammar.units]]) {
    for (const unit of units) {
      if (seen.has(unit.id)) throw new Error(`Duplicate unit across manifests: ${unit.id}`);
      seen.add(unit.id);
      const source = provider === 'grammar' ? unit.collectionId : unit.bookId;
      const book = bookBySourceId(books, provider, source);
      if (!book) throw new Error(`Unregistered ${provider} unit ${unit.id} (source ${source || 'missing'}).`);
      if (unit.path?.includes('..') || !unit.path?.startsWith('database/')) {
        throw new Error(`Invalid path for ${unit.id}`);
      }
      counts[book.id]++;
    }
  }
  for (const book of books) {
    if (book.status === 'available' && !counts[book.id]) throw new Error(`Available book has zero units: ${book.id}`);
    if (book.status === 'planned' && counts[book.id]) throw new Error(`Planned book has units: ${book.id}`);
  }
  return { books: books.length, available: books.filter(x => x.status === 'available').length,
    planned: books.filter(x => x.status === 'planned').length, units: seen.size, counts };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  try {
    const result = await auditBooks(root);
    console.log(`Book registry validated: ${result.books} books (${result.available} available, ${result.planned} planned), ${result.units} units.`);
    for (const [id, count] of Object.entries(result.counts)) if (count) console.log(`  ${id}: ${count} units`);
  } catch (e) { console.error(`Book audit failed: ${e.message}`); process.exitCode = 1; }
}
