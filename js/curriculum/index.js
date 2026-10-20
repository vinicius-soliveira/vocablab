/** Unified, publisher-neutral book/unit index over the two existing manifests. */
import { validateBooksRegistry, bookBySourceId } from './books.js';
const catalogError = message => { throw new Error(`Invalid curriculum index: ${message}`); };
const publicUnit = (unit, provider) => {
  if (!unit || typeof unit.id !== 'string' || !/^[\w-]+$/.test(unit.id) ||
      typeof unit.title !== 'string' || !unit.title.trim() || unit.title.length > 240 ||
      !Number.isInteger(unit.number) || unit.number < 1 || unit.number > 9999 ||
      typeof unit.level !== 'string' || !unit.level.trim()) catalogError('invalid unit metadata');
  return {id:unit.id,number:unit.number,title:unit.title,level:unit.level,provider,
    activityCount:provider === 'grammar' ? unit.exerciseCount + (unit.speakingCount || 0) + (unit.listeningCount || 0) : unit.itemsCount};
};
export function buildCurriculumIndex(registry, vocabulary, grammar) {
  const books = validateBooksRegistry(registry);
  if (vocabulary?.format !== 'vocablab-catalog' || vocabulary.version !== 1 || !Array.isArray(vocabulary.units) ||
      grammar?.format !== 'vocablab-grammar-catalog' || grammar.version !== 1 || !Array.isArray(grammar.units)) {
    catalogError('expected valid vocabulary and grammar catalogs');
  }
  const indexed = books.map(book => ({id:book.id,title:book.title,family:book.family,sequence:book.sequence,
    levels:book.levels,status:book.status,provider:book.contentProvider || null,units:[]}));
  const byId = new Map(indexed.map(book=>[book.id,book]));
  const unitIds = new Set();
  for (const [provider, entries, field] of [['vocabulary',vocabulary.units,'bookId'], ['grammar',grammar.units,'collectionId']]) {
    for (const entry of entries) {
      const book = bookBySourceId(books,provider,entry[field]);
      if (!book || unitIds.has(entry.id)) catalogError(`unregistered or duplicated unit ${entry.id}`);
      const unit=publicUnit(entry, provider);
      if (!Number.isInteger(unit.activityCount) || unit.activityCount < 1) catalogError(`invalid exercise count ${entry.id}`);
      if (provider === 'vocabulary' && entry.bookTitle !== book.title) catalogError(`public book name mismatch for ${entry.id}`);
      unitIds.add(entry.id);
      byId.get(book.id).units.push(unit);
    }
  }
  for (const book of indexed) {
    book.units.sort((a,b)=>a.number-b.number || a.id.localeCompare(b.id));
    if (book.status==='available' && book.units.length===0) catalogError(`available book has no units: ${book.id}`);
    if (book.status==='planned' && book.units.length) catalogError(`planned book has units: ${book.id}`);
  }
  return {format:'vocablab-curriculum-index',version:1,books:indexed,
    totalUnits:unitIds.size,availableBooks:indexed.filter(b=>b.status==='available').length};
}
export function validateCurriculumIndex(index) {
  if (index?.format!=='vocablab-curriculum-index' || index.version!==1 || !Array.isArray(index.books) ||
    !Number.isInteger(index.totalUnits) || index.totalUnits<0 || !Number.isInteger(index.availableBooks)) catalogError('invalid header');
  const units=new Set(), books=new Set();let available=0;
  for (const book of index.books) {
    if(!/^english-[a-z-]+-[1-9]\d*$/.test(book.id||'') || books.has(book.id) ||
      book.title !== `English ${book.family?.split('-').map(s=>s[0].toUpperCase()+s.slice(1)).join(' ')} ${book.sequence}` ||
      !['available','planned'].includes(book.status) || !Array.isArray(book.units)) catalogError('invalid book entry');
    books.add(book.id);
    if(book.status==='available')available++;
    if(book.status==='planned' && book.units.length)catalogError('planned book contains units');
    for(const u of book.units) {
      if(!/^[\w-]+$/.test(u.id||'') || units.has(u.id) || !['vocabulary','grammar'].includes(u.provider) ||
        !Number.isInteger(u.number) || u.number<1 || !Number.isInteger(u.activityCount) || u.activityCount<1 ||
        typeof u.title!=='string' || !u.title.trim() || !u.level)catalogError('invalid or duplicate unit');
      units.add(u.id);
    }
  }
  if(units.size!==index.totalUnits || available!==index.availableBooks)catalogError('inconsistent totals');
  return index;
}
export async function loadCurriculumIndex(fetcher=fetch) {
  const response=await fetcher(new URL('../../curriculum/index.json',import.meta.url),{cache:'no-store'});
  if(!response.ok)throw new Error(`Curriculum index unavailable (HTTP ${response.status}). Run npm run catalog:all.`);
  return validateCurriculumIndex(await response.json());
}
/** Read-only progress summary. No writes, and no migrations of stored data. */
export function summarizeBookProgress(book, lexical={},grammar={},now=Date.now()) {
  const attemptsByUnit=new Map();
  for(const [key, record] of Object.entries(book.provider==='grammar'?grammar:lexical)) {
    const i=key.indexOf('::');if(i<1 || !record || typeof record!=='object')continue;
    const unitId=key.slice(0,i);
    let attempts=0, due=0;
    if(book.provider==='grammar'){
      attempts=Number(record.attempts)>0?1:0;
      due=attempts && Number(record.due)<=now?1:0;
    }else{
      const records=Object.values(record).filter(x=>x && typeof x==='object' && Number(x.attempts)>0);
      attempts=records.length>0?1:0;
      due=records.filter(x=>Number(x.due)<=now).length;
    }
    if(!attempts)continue;
    const old=attemptsByUnit.get(unitId)||{practised:0,due:0};
    old.practised+=attempts;old.due+=due;
    attemptsByUnit.set(unitId,old);
  }
  let started=0,complete=0,due=0;
  for(const u of book.units){const s=attemptsByUnit.get(u.id)||{practised:0,due:0};
    if(s.practised)started++;
    if(s.practised>=u.activityCount)complete++;
    due+=s.due;
  }
  return {started,complete,due,total:book.units.length};
}
