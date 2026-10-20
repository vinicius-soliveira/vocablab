/** Public VocabLab book identities. Historical source IDs remain internal aliases. */
const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const FAMILIES = new Set([
  'vocabulary', 'grammar', 'pronunciation', 'collocations',
  'phrasal-verbs', 'idioms', 'academic-vocabulary',
  'business-vocabulary', 'technical-english',
]);
const ID = /^english-[a-z]+(?:-[a-z]+)*-[1-9][0-9]*$/;
const SOURCE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PATHS = new Set(['database/manifest.json', 'database/grammar-manifest.json']);
const error = message => { throw new Error(`Invalid book registry: ${message}`); };

export function validateBooksRegistry(data) {
  if (!data || Array.isArray(data) || data.format !== 'vocablab-books' ||
      data.version !== 1 || !Array.isArray(data.books) || !data.books.length || data.books.length > 200) {
    error('expected vocablab-books v1 with a non-empty books array');
  }
  const ids = new Set(), aliases = new Set(), sequences = new Set();
  for (const book of data.books) {
    if (!book || Array.isArray(book) || !ID.test(book.id ?? '') || ids.has(book.id)) {
      error(`duplicate or invalid book id ${book?.id ?? '(missing)'}`);
    }
    const family = book.family;
    if (!FAMILIES.has(family) || book.id !== `english-${family}-${book.sequence}` ||
        !Number.isInteger(book.sequence) || book.sequence < 1 || book.sequence > 99 ||
        sequences.has(`${family}:${book.sequence}`)) {
      error(`invalid family or sequence for ${book.id}`);
    }
    if (book.title !== `English ${family.split('-').map(s => s[0].toUpperCase()+s.slice(1)).join(' ')} ${book.sequence}`) {
      error(`non-canonical public title for ${book.id}`);
    }
    if (!Array.isArray(book.levels) || book.levels.length < 1 ||
        book.levels.some(x => !LEVELS.includes(x)) || new Set(book.levels).size !== book.levels.length ||
        book.levels.some((x,i) => i > 0 && LEVELS.indexOf(x) <= LEVELS.indexOf(book.levels[i-1]))) {
      error(`invalid level sequence for ${book.id}`);
    }
    if (!['available','planned'].includes(book.status)) error(`invalid status for ${book.id}`);
    if (book.status === 'available') {
      if (!['vocabulary','grammar'].includes(book.contentProvider) ||
          (book.contentProvider === 'grammar' ? book.manifest !== 'database/grammar-manifest.json' : book.manifest !== 'database/manifest.json') ||
          !PATHS.has(book.manifest) || !Array.isArray(book.sourceIds) || !book.sourceIds.length) {
        error(`invalid content source for available book ${book.id}`);
      }
      for (const source of book.sourceIds) {
        if (typeof source !== 'string' || !SOURCE_ID.test(source) || aliases.has(`${book.contentProvider}:${source}`)) {
          error(`duplicate or invalid source ID for ${book.id}`);
        }
        aliases.add(`${book.contentProvider}:${source}`);
      }
    } else if ('manifest' in book || 'sourceIds' in book || 'contentProvider' in book) {
      error(`planned book ${book.id} cannot claim available content`);
    }
    ids.add(book.id);
    sequences.add(`${family}:${book.sequence}`);
  }
  return data.books;
}

export function bookBySourceId(books, provider, sourceId) {
  return books.find(book => book.status === 'available' && book.contentProvider === provider && book.sourceIds.includes(sourceId)) ?? null;
}

/** Browser loader; uses local JSON and no external services. */
export async function loadBooks(fetcher = fetch) {
  const response = await fetcher(new URL('../../curriculum/books.json', import.meta.url));
  if (!response.ok) throw new Error(`Book library unavailable (HTTP ${response.status}).`);
  return validateBooksRegistry(await response.json());
}
