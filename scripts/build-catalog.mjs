/** Generate the public read-only vocabulary catalog from database/*.json. */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join, relative, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const base = join(root, 'database');
const units = [];
const ids = new Set();

async function scan(folder) {
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    const full = join(folder, entry.name);
    if (entry.isDirectory()) {
      await scan(full);
    } else if (entry.isFile() && entry.name.endsWith('.json') && entry.name !== 'manifest.json') {
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
const canonicalTitles = {
  'english-vocabulary-in-use-elementary-3ed': 'English Vocabulary in Use — Elementary (3rd Edition)',
  'english-vocabulary-in-use-pre-intermediate-intermediate-4ed': 'English Vocabulary in Use — Pre-intermediate and Intermediate (4th Edition)',
  'english-vocabulary-in-use-upper-intermediate-4ed': 'English Vocabulary in Use — Upper-intermediate (4th Edition)',
  'english-vocabulary-in-use-advanced-3ed': 'English Vocabulary in Use — Advanced (3rd Edition)',
};
for (const unit of units) {
  if (canonicalTitles[unit.bookId]) unit.bookTitle = canonicalTitles[unit.bookId];
}
const order = ['elementary-3ed', 'pre-intermediate-intermediate', 'upper-intermediate', 'advanced-3ed'];
const orderOf = (id) => {
  const i = order.findIndex(value => String(id).includes(value));
  return i < 0 ? order.length : i;
};
units.sort((a, b) => orderOf(a.bookId) - orderOf(b.bookId) || (a.number ?? 999) - (b.number ?? 999));
const output = join(base, 'manifest.json');
await writeFile(output, JSON.stringify({ format: 'vocablab-catalog', version: 1, units }, null, 2) + '\n');
console.log(`Catalog generated: ${units.length} units, ${units.reduce((n, u) => n + u.itemsCount, 0)} entries.`);
