import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateBooksRegistry, bookBySourceId, loadBooks } from '../js/curriculum/books.js';
import { auditBooks } from '../scripts/audit-books.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const readJSON = async path => JSON.parse(await readFile(join(root, path), 'utf8'));
const registry = await readJSON('curriculum/books.json');
const clone = value => JSON.parse(JSON.stringify(value));

test('book library lists six available and fourteen planned volumes with platform-owned names', () => {
  const books = validateBooksRegistry(registry);
  assert.equal(books.length, 20);
  assert.equal(books.filter(x => x.status === 'available').length, 6);
  assert.equal(books.filter(x => x.status === 'planned').length, 14);
  for (const book of books) {
    assert.match(book.title, /^English (Vocabulary|Grammar|Pronunciation|Collocations|Phrasal Verbs|Idioms|Academic Vocabulary|Business Vocabulary|Technical English) [1-9][0-9]*$/);
    assert.doesNotMatch(book.title, /cambridge|in use|edition|publisher/i);
  }
});

test('legacy content ID resolves to public English Collocations 1 without altering its identity', () => {
  const books = validateBooksRegistry(registry);
  const book = bookBySourceId(books, 'vocabulary', 'english-collocations-in-use-intermediate-2ed');
  assert.equal(book?.id, 'english-collocations-1');
  assert.equal(book?.title, 'English Collocations 1');
  assert.equal(bookBySourceId(books, 'grammar', 'english-grammar-1')?.title, 'English Grammar 1');
  assert.equal(bookBySourceId(books, 'vocabulary', 'custom-unit'), null);
});

test('invalid registry data is rejected: IDs, aliases, levels, paths, and planned content', () => {
  for (const change of [
    d => d.books.push(clone(d.books[0])),
    d => d.books[0].title = 'Third-party publisher title',
    d => d.books[0].levels = ['A2', 'A1'],
    d => d.books[0].levels = ['A1', 'A1'],
    d => d.books[0].manifest = '../private/manifest.json',
    d => d.books[0].sourceIds = ['../wrong'],
    d => d.books[1].sourceIds = clone(d.books[0].sourceIds),
    d => d.books.find(x=>x.status==='planned').manifest = 'database/grammar-manifest.json',
    d => d.books[0].id = 'english-unknown-1',
    d => d.books[0].status = 'broken',
  ]) {
    const candidate = clone(registry);
    change(candidate);
    assert.throws(() => validateBooksRegistry(candidate), /Invalid book registry/);
  }
});

test('browser loader validates registry and does not depend on an API or account', async () => {
  const list = await loadBooks(async url => {
    assert.equal(new URL(url).pathname.endsWith('/curriculum/books.json'), true);
    return { ok: true, json: async () => clone(registry) };
  });
  assert.equal(list.length, 20);
  await assert.rejects(() => loadBooks(async () => ({ ok: false, status: 404 })), /HTTP 404/);
});

test('available books match every vocabulary and grammar manifest entry, planned books have no phantom units', async () => {
  const report = await auditBooks(root);
  assert.equal(report.available, 6);
  assert.equal(report.planned, 14);
  const lexical = await readJSON('database/manifest.json');
  const grammar = await readJSON('database/grammar-manifest.json');
  assert.equal(report.units, lexical.units.length + grammar.units.length);
  const books = validateBooksRegistry(registry);
  for (const unit of lexical.units) {
    const book = bookBySourceId(books, 'vocabulary', unit.bookId);
    assert.ok(book, `no book for ${unit.id}`);
    assert.equal(unit.bookTitle, book.title, `public title mismatch for ${unit.id}`);
  }
  for (const collection of grammar.collections) {
    assert.equal(collection.title, collection.book, 'legacy field should not reveal publisher titles');
    assert.equal(collection.edition, '');
    assert.equal(collection.title, bookBySourceId(books, 'grammar', collection.id)?.title ?? collection.title);
  }
  for (const book of books.filter(x=>x.status==='planned')) {
    assert.equal(report.counts[book.id], 0, book.id);
  }
});
