/** Generate the public read-only vocabulary catalog from database/*.json. */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join, relative, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateBooksRegistry, bookBySourceId } from '../js/curriculum/books.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const base = join(root, 'database');
const units = [];
const ids = new Set();

async function scan(folder) {
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    const full = join(folder, entry.name);
    if (entry.isDirectory()) {
      // Grammar books share database/ but have a different JSON schema and catalog.
      if (/^English_Grammar_[1-3]$/.test(entry.name)) continue;
      await scan(full);
    } else if (entry.isFile() && entry.name.endsWith('.json') &&
               entry.name !== 'manifest.json' && entry.name !== 'grammar-manifest.json') {
      const source = JSON.parse(await readFile(full, 'utf8'));
      const sourceUnits = Array.isArray(source.units) ? source.units : (Array.isArray(source.items) ? [source] : []);
      if (!sourceUnits.length) throw new Error('No units found in ' + full);
      const path = relative(root, full).split(sep).join('/');
      for (const unit of sourceUnits) {
        if (!/^[A-Za-z0-9_-]+$/.test(unit.id || '') || ids.has(unit.id)) {
          throw new Error('Invalid or duplicated unit ID in ' + path + ': ' + unit.id);
        }
        if (!Array.isArray(unit.items) || !unit.items.length) {
          throw new Error('Missing items in ' + path + ' / ' + unit.id);
        }
        ids.add(unit.id);
        units.push({
          id: unit.id,
          number: Number.isInteger(unit.number) ? unit.number : null,
          title: unit.title || `Unit ${unit.number}`,
          level: unit.level || 'Mixed',
          category: unit.category || '',
          bookId: unit.bookId || source.bookId || '',
          bookTitle: unit.bookTitle || source.title || 'Personal collection',
          itemsCount: unit.items.length,
          path,
        });
      }
    }
  }
}
await scan(base);
if (!units.length) throw new Error('The database/ directory contains no vocabulary units.');
// Public labels come from the platform book registry, not imported source titles.
// An unknown custom collection retains its own label for backward compatibility.
const books = validateBooksRegistry(JSON.parse(await readFile(join(root, 'curriculum/books.json'), 'utf8')));
const ranks = new Map(books.map((book, index) => [book.id, index]));
for (const unit of units) {
  const book = bookBySourceId(books, 'vocabulary', unit.bookId);
  if (book) unit.bookTitle = book.title;
}
const rank = unit => {
  const book = bookBySourceId(books, 'vocabulary', unit.bookId);
  return book ? ranks.get(book.id) : books.length;
};
units.sort((a, b) => rank(a) - rank(b) || (a.number ?? 999) - (b.number ?? 999) || a.id.localeCompare(b.id));
const output = join(base, 'manifest.json');
await writeFile(output, JSON.stringify({ format: 'vocablab-catalog', version: 1, units }, null, 2) + '\n');
console.log(`Catalog generated: ${units.length} units, ${units.reduce((n, u) => n + u.itemsCount, 0)} entries.`);
