#!/usr/bin/env node
/**
 * VocabLab Content Integration Pipeline v1.5.
 *
 *   node scripts/content.mjs validate --book english-grammar-3 --expected 100
 *   node scripts/content.mjs audit --book english-grammar-3 --expected 100
 *   node scripts/content.mjs publish --book english-grammar-3 --expected 100
 *   node scripts/content.mjs verify --book english-grammar-3 --expected 100
 *
 * Commands operate on content-staging/<Book_Folder> by default, never publish
 * individual units, and preserve the existing public unit/exercise identifiers.
 */
import { readFile, readdir, writeFile, mkdir, rm, lstat } from 'node:fs/promises';
import { resolve, join, dirname, basename, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { validateBooksRegistry, bookBySourceId } from '../js/curriculum/books.js';
import { validateGrammarUnit, validateGrammarManifest } from '../js/grammar/schema.js';
import { GRAMMAR_COLLECTIONS, grammarCatalogEntry } from '../js/grammar/collections.js';
import { buildCurriculumIndex, validateCurriculumIndex } from '../js/curriculum/index.js';
import { auditBooks } from './audit-books.mjs';

const DEFAULT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fileId = /^[A-Za-z][A-Za-z0-9_-]*$/;
const s = text => String(text ?? '').normalize('NFKC').toLowerCase().trim().replace(/[\u2018\u2019]/g,"'").replace(/[.!?]+$/g,'').replace(/\s+/g,' ');
const safe = text => typeof text === 'string' && text.trim().length > 0;
const num = n => String(n).padStart(3,'0');
const reportError = (errors, label, message) => errors.push(`${label}: ${message}`);

/** Existing public library folder spelling, without changing stable book IDs. */
export function folderForBook(book) {
  return `English_${book.family.split('-').map(v=>v[0].toUpperCase()+v.slice(1)).join('_')}_${book.sequence}`;
}
export function providerForBook(book) {
  if (book.family === 'grammar') return 'grammar';
  if (['vocabulary', 'collocations', 'phrasal-verbs', 'idioms', 'academic-vocabulary', 'business-vocabulary', 'technical-english'].includes(book.family)) return 'vocabulary';
  throw new Error(`${book.title} needs a content engine before publication; no ${book.family} schema is available.`);
}
async function json(path) { return JSON.parse(await readFile(path, 'utf8')); }
function requireExpected(expected) {
  if (!Number.isSafeInteger(expected) || expected < 1 || expected > 9999) throw new Error('--expected must be a positive integer (1–9999).');
}
function checkUnique(array, label, errors) {
  if (new Set(array.map(s)).size !== array.length) reportError(errors,label,'repeated normalized values');
}
function validateGrammarQuality(unit, book, filename, errors) {
  const id = unit.id || filename;
  const collection = GRAMMAR_COLLECTIONS.find(c=>c.id===book.id);
  if (!collection) { reportError(errors, id, 'grammar collection is not implemented'); return; }
  try { validateGrammarUnit(unit); } catch(e) { reportError(errors,id,`schema: ${e.message}`); return; }
  const path=`database/${collection.folder}/${filename}`;
  try { grammarCatalogEntry(unit,path); } catch(e) { reportError(errors,id,e.message); }
  if (filename !== `${unit.id}.json`) reportError(errors,id,'file name must match unit id');
  const lists=[['exercises',12,'wr'], ['speakingExercises',8,'sp'], ['listeningExercises',8,'li']];
  for(const [field,total,prefix] of lists) {
    const exercises=unit[field];
    if(!Array.isArray(exercises) || exercises.length!==total) {reportError(errors,id,`expected ${total} ${field}`);continue;}
    exercises.forEach((e,i)=> {
      if(e.id !== `${prefix}-${String(i+1).padStart(2,'0')}`) reportError(errors,id,`${field}[${i}] has unexpected ID`);
      if (field==='listeningExercises') {
        if(e.audioText.length<=10 || e.prompt.length<=15 || e.feedback.length<=10) reportError(errors,`${id}/${e.id}`,'audioText/prompt/feedback is too short');
        const type = i===2||i>=6?'gap-fill':'multiple-choice';
        if(e.type!==type) reportError(errors,`${id}/${e.id}`,`expected ${type} listening activity`);
      }
      if (field==='exercises' && e.type !== (i<4?'multiple-choice':i<8?'gap-fill':'error-correction')) reportError(errors,`${id}/${e.id}`,'unexpected writing activity type');
      if(Array.isArray(e.acceptedAnswers))checkUnique(e.acceptedAnswers,`${id}/${e.id} acceptedAnswers`,errors);
      if(Array.isArray(e.choices))checkUnique(e.choices,`${id}/${e.id} choices`,errors);
    });
  }
  for (const [field,min] of [['learningObjectives',3], ['explanation',4], ['comparisons',1], ['examples',4], ['commonMistakes',3], ['studyTips',2]]) {
    if(!Array.isArray(unit[field]) || unit[field].length<min) reportError(errors,id,`${field} needs at least ${min} items`);
  }
  if(Array.isArray(unit.listeningExercises))checkUnique(unit.listeningExercises.map(e=>e.audioText),`${id} audioText`,errors);
}
function validateLexicalUnit(unit, book, errors) {
  const id=unit?.id ?? '(missing id)';
  if (!fileId.test(id)) reportError(errors,id,'invalid unit ID');
  if (!Number.isInteger(unit?.number) || unit.number<1) reportError(errors,id,'missing positive integer unit number');
  if (!safe(unit?.title) || !safe(unit?.level)) reportError(errors,id,'missing title/level');
  if (unit.bookId !== book.id) reportError(errors,id,`bookId must equal ${book.id}`);
  if (unit.bookTitle !== undefined && unit.bookTitle !== book.title) reportError(errors,id,`bookTitle must be the platform name: ${book.title}`);
  if (!Array.isArray(unit.items) || !unit.items.length) {reportError(errors,id,'missing items');return;}
  const itemIds=[];
  for (const item of unit.items) {
    if (!fileId.test(item?.id || '')) reportError(errors,id,'invalid item ID');
    itemIds.push(item?.id || '');
    if (!safe(item?.word) || !safe(item?.pt) || !safe(item?.example)) reportError(errors,`${id}/${item?.id}`,'word, pt, and example must be non-empty');
  }
  checkUnique(itemIds,`${id} item IDs`,errors);
}
/** Validate an unpublished volume without changing the repository. */
export async function inspectStaging({root=DEFAULT_ROOT,bookId,sourceDir,expected}) {
  requireExpected(expected);
  root=resolve(root);
  const registry=await json(join(root,'curriculum','books.json'));
  const books=validateBooksRegistry(registry);
  const book=books.find(b=>b.id===bookId);
  if(!book)throw new Error(`Unknown book ID: ${bookId}. Use the id from curriculum/books.json.`);
  const provider=providerForBook(book);
  const folder=folderForBook(book);
  const source=resolve(sourceDir || join(root,'content-staging',folder));
  const destination=join(root,'database',folder);
  if(source===resolve(destination))throw new Error('Source must be separate from the published database directory.');
  const dirInfo=await lstat(source);
  if (!dirInfo.isDirectory() || dirInfo.isSymbolicLink()) throw new Error('Staging source must be a real directory.');
  const entries=await readdir(source,{withFileTypes:true});
  const errors=[],warnings=[],files=[],unitIds=new Set(),numbers=new Set(),payloads=new Map();
  if(!entries.length)reportError(errors,book.id,'staging directory is empty');
  const knownGrammar=GRAMMAR_COLLECTIONS.find(c=>c.id===book.id);
  if(provider==='grammar' && !knownGrammar)throw new Error(`Unknown grammar collection: ${book.id}`);
  for(const entry of entries) {
    if (!entry.isFile() || entry.isSymbolicLink()) {reportError(errors,entry.name,'only regular JSON files may appear in staging');continue;}
    if (!entry.name.toLowerCase().endsWith('.json')) {reportError(errors,entry.name,'unexpected non-JSON file in staging');continue;}
    if(provider==='grammar' && !new RegExp(`^eg${book.sequence}-u[0-9]{3}\\.json$`).test(entry.name)) {
      reportError(errors,entry.name,'invalid grammar file name');continue;
    }
    let data, raw;
    try {raw=await readFile(join(source,entry.name),'utf8');data=JSON.parse(raw);} catch(e) {reportError(errors,entry.name,`invalid JSON: ${e.message}`);continue;}
    files.push(entry.name);payloads.set(entry.name,raw);
    const units=provider==='grammar'?[data]:(Array.isArray(data.units)?data.units:(Array.isArray(data.items)?[data]:[]));
    if(provider==='vocabulary' && data.bookId!==undefined && data.bookId!==book.id)reportError(errors,entry.name,`outer bookId must equal ${book.id}`);
    if(!units.length) {reportError(errors,entry.name,'file contains no units');continue;}
    for(const unit of units) {
      if (!unit || typeof unit !== 'object' || Array.isArray(unit)) {reportError(errors,entry.name,'invalid unit object');continue;}
      const id=unit.id;
      if(unitIds.has(id))reportError(errors,id,'duplicate unit id in staging');
      unitIds.add(id);
      let n=unit.number;
      if(provider==='grammar') {
        n=Number(/^eg\d-u(\d{3})$/.exec(id||'')?.[1]);
        if(!Number.isInteger(n) || n<1)reportError(errors,id,'invalid numbered grammar ID');
        validateGrammarQuality(unit,book,entry.name,errors);
      } else validateLexicalUnit(unit,book,errors);
      if(numbers.has(n))reportError(errors,entry.name,`duplicate unit number ${n}`);
      numbers.add(n);
      if(!book.levels.includes(unit.level) && !book.levels.join('–').includes(unit.level))warnings.push(`${id}: level ${unit.level} is not a declared individual CEFR level`);
    }
  }
  if(unitIds.size!==expected)reportError(errors,book.id,`expected ${expected} unique units, found ${unitIds.size}`);
  for(let n=1;n<=expected;n++)if(!numbers.has(n))reportError(errors,book.id,`missing unit number ${n}`);
  if(numbers.size>expected)reportError(errors,book.id,'unexpected extra unit numbers');
  return {book,provider,root,source,destination,expected,files:files.sort(),units:unitIds.size,errors,warnings,payloads};
}
function summary(plan,mode){return {mode,bookId:plan.book.id,book:plan.book.title,provider:plan.provider,source:plan.source,units:plan.units,files:plan.files.length,expected:plan.expected,passed:plan.errors.length===0,errors:plan.errors,warnings:plan.warnings};}
function pass(plan){if(plan.errors.length)throw new Error(`Preflight failed (${plan.errors.length} errors):\n - ${plan.errors.slice(0,30).join('\n - ')}`);}
async function checkNotPublished(plan) {
  if(plan.book.status!=='planned')throw new Error(`${plan.book.id} is already available. In-place editing is not supported; use a reviewed revision workflow.`);
  const dir=plan.destination;
  try {
    const entries=await readdir(dir);
    if(entries.length)throw new Error(`Destination ${dir} is not empty; refusing overwrite.`);
  }catch(e){if(e.code!=='ENOENT')throw e;}
  const grammar=await json(join(plan.root,'database','grammar-manifest.json'));
  const vocab=await json(join(plan.root,'database','manifest.json'));
  const registry=await json(join(plan.root,'curriculum','books.json'));
  const books=validateBooksRegistry(registry);
  const existing=(plan.provider==='grammar'?grammar.units:vocab.units).filter(u=>bookBySourceId(books,plan.provider,plan.provider==='grammar'?u.collectionId:u.bookId)?.id===plan.book.id || (plan.provider==='grammar'?u.collectionId:u.bookId)===plan.book.id);
  if(existing.length)throw new Error(`${plan.book.id} already has manifest entries; refusing publication.`);
  const allIds=new Set([...grammar.units,...vocab.units].map(u=>u.id));
  for(const raw of plan.payloads.values()){
    const data=JSON.parse(raw);
    for(const unit of (plan.provider==='grammar'?[data]:(data.units||[data])))if(allIds.has(unit.id))throw new Error(`${unit.id} already exists in a published manifest.`);
  }
}
function runScript(root,script){execFileSync(process.execPath,[join(root,'scripts',script)],{cwd:root,stdio:'pipe',encoding:'utf8',maxBuffer:10*1024*1024});}
/** Publication is fail-closed with best-effort rollback on caught errors.
 * A crash/power loss mid-publication is not a multi-file atomic transaction.
 */
export async function publishStaging(options) {
  const plan=await inspectStaging(options);pass(plan);await checkNotPublished(plan);
  const registryPath=join(plan.root,'curriculum','books.json');
  const managed=[registryPath,join(plan.root,'database','manifest.json'),join(plan.root,'database','grammar-manifest.json'),join(plan.root,'curriculum','index.json')];
  const originals=new Map();
  for(const file of managed){try{originals.set(file,await readFile(file));}catch(e){if(e.code==='ENOENT')originals.set(file,null);else throw e;}}
  const registry=JSON.parse(originals.get(registryPath).toString('utf8'));
  const book=registry.books.find(b=>b.id===plan.book.id);
  book.status='available';book.contentProvider=plan.provider;
  book.manifest=`database/${plan.provider==='grammar'?'grammar-manifest.json':'manifest.json'}`;
  book.sourceIds=[book.id];
  validateBooksRegistry(registry);
  let createdDir=false;
  const createdFiles=[];
  try {
    try {await mkdir(plan.destination);createdDir=true;}catch(e){if(e.code!=='EEXIST')throw e;}
    const entry=await readdir(plan.destination);
    if(entry.length)throw new Error('Target folder changed during publication; refusing overwrite.');
    const targetInfo=await lstat(plan.destination);
    if(!targetInfo.isDirectory() || targetInfo.isSymbolicLink())throw new Error('Published destination must be a real directory.');
    for(const name of plan.files){await writeFile(join(plan.destination,name),plan.payloads.get(name),{flag:'wx'});createdFiles.push(name);}
    await writeFile(registryPath,JSON.stringify(registry,null,2)+'\n');
    runScript(plan.root,'build-catalog.mjs');
    runScript(plan.root,'build-grammar-catalog.mjs');
    runScript(plan.root,'build-curriculum-index.mjs');
    await auditBooks(plan.root);
    await verifyPublished({root:plan.root,bookId:plan.book.id,expected:plan.expected});
    // Block publication if regression tests fail; the best-effort rollback will run.
    const testFiles=(await readdir(join(plan.root,'tests'))).filter(x=>x.endsWith('.test.mjs')).sort().map(x=>join(plan.root,'tests',x));
    execFileSync(process.execPath,['--test',...testFiles],{cwd:plan.root,stdio:'pipe',encoding:'utf8',maxBuffer:20*1024*1024});
    return summary(plan,'publish');
  }catch(e) {
    const rollback=[];
    for(const [file,buffer] of originals)try{if(buffer===null)await rm(file,{force:true});else await writeFile(file,buffer);}catch(error){rollback.push(error.message);}
    // Only remove files this transaction wrote. Preserve a previously existing empty folder.
    for(const name of createdFiles)try{await rm(join(plan.destination,name),{force:true});}catch(error){rollback.push(error.message);}
    if(createdDir)try{await rm(plan.destination,{recursive:true,force:true});}catch(error){rollback.push(error.message);}
    throw new Error(`Publication failed; rollback ${rollback.length?'INCOMPLETE: '+rollback.join('; '):'completed'}: ${e.message}${e.stderr?'\n'+e.stderr.toString():''}`);
  }
}
/** Ensure published units, generated manifests and the book registry agree. */
export async function verifyPublished({root=DEFAULT_ROOT,bookId,expected}) {
  root=resolve(root);
  const registry=await json(join(root,'curriculum','books.json'));
  const book=validateBooksRegistry(registry).find(b=>b.id===bookId);
  if(!book || book.status!=='available')throw new Error(`${bookId}: book is not available.`);
  const provider=providerForBook(book);
  const grammar=await json(join(root,'database','grammar-manifest.json'));
  validateGrammarManifest(grammar);
  const vocab=await json(join(root,'database','manifest.json'));
  const entries=(provider==='grammar'?grammar.units:vocab.units).filter(x=>book.sourceIds.includes(provider==='grammar'?x.collectionId:x.bookId));
  if(!entries.length)throw new Error(`${bookId}: no published units.`);
  if(expected!==undefined){requireExpected(expected);if(entries.length!==expected)throw new Error(`${bookId}: expected ${expected} units, found ${entries.length}.`);}
  const directory=join(root,'database',folderForBook(book));
  const filenames=(await readdir(directory)).filter(x=>x.endsWith('.json')).sort();
  const covered=new Set();
  for(const entry of entries) {
    const path=`database/${folderForBook(book)}/${basename(entry.path || '')}`;
    if(entry.path!==path)throw new Error(`${entry.id}: unexpected published path ${entry.path}`);
    covered.add(basename(entry.path));
    const data=await json(join(root,...entry.path.split('/')));
    const units=provider==='grammar'?[validateGrammarUnit(data)]:(data.units||[data]);
    const unit=units.find(u=>u.id===entry.id);
    if(!unit)throw new Error(`${entry.id}: unit missing from source JSON.`);
    if(provider==='grammar') {
      const rebuiltEntry=grammarCatalogEntry(unit,entry.path);
      if(JSON.stringify(rebuiltEntry)!==JSON.stringify(entry))throw new Error(`${entry.id}: grammar manifest metadata is stale.`);
    } else {
      if(unit.number!==entry.number || unit.title!==entry.title || unit.level!==entry.level ||
        unit.bookId!==entry.bookId || unit.items?.length!==entry.itemsCount || entry.bookTitle!==book.title)
        throw new Error(`${entry.id}: vocabulary manifest metadata is stale.`);
    }
  }
  if(filenames.length!==covered.size || filenames.some(x=>!covered.has(x)))throw new Error(`${bookId}: database file list differs from manifest.`);
  const indexed=validateCurriculumIndex(await json(join(root,'curriculum','index.json')));
  const indexBook=indexed.books.find(b=>b.id===bookId);
  if(!indexBook || indexBook.status!=='available' || indexBook.units.length!==entries.length)throw new Error(`${bookId}: curriculum index does not match.`);
  const rebuilt=buildCurriculumIndex(registry,vocab,grammar);
  if(JSON.stringify(rebuilt)!==JSON.stringify(indexed))throw new Error('Curriculum index is stale.');
  await auditBooks(root);
  return {mode:'verify',bookId,passed:true,files:covered.size,units:entries.length,provider};
}
async function main() {
  const [command,...args]=process.argv.slice(2);
  if(!['validate','audit','publish','verify'].includes(command))throw new Error('Usage: node scripts/content.mjs validate|audit|publish|verify --book <book-id> --expected <number> [--source <folder>]');
  const flags={};
  for(let i=0;i<args.length;i+=2){if(!['--book','--source','--expected'].includes(args[i])||!args[i+1])throw new Error(`Invalid argument: ${args[i]}`);flags[args[i]]=args[i+1];}
  if(!flags['--book'])throw new Error('--book is required. Use the canonical ID, e.g. english-grammar-3.');
  const options={bookId:flags['--book'],sourceDir:flags['--source'],expected:flags['--expected']===undefined?undefined:Number(flags['--expected'])};
  let result;
  if(command==='verify')result=await verifyPublished(options);
  else if(command==='publish')result=await publishStaging(options);
  else {
    const plan=await inspectStaging(options);
    result=summary(plan,command);
    if(command==='audit') {
      const out=join(plan.root,'content-reports',`${plan.book.id}-audit.json`);
      await mkdir(dirname(out),{recursive:true});
      await writeFile(out,JSON.stringify(result,null,2)+'\n');
      console.log(`Audit report: ${relative(plan.root,out)}`);
    }
    if(!result.passed)process.exitCode=1;
  }
  console.log(JSON.stringify(result,null,2));
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  main().catch(err=>{console.error(`ERROR: ${err.message}`);process.exitCode=1;});
}
