#!/usr/bin/env node
/**
 * English Grammar 2: validate all 145 authored JSON files, then publish atomically
 * into the existing VocabLab v1.4.2 curriculum and grammar catalogs.
 *
 * Usage:
 *   node scripts/publish-eg2.mjs "C:/path/to/eg2-final" --check
 *   node scripts/publish-eg2.mjs "C:/path/to/eg2-final" --publish
 */
import { readFile, readdir, mkdir, writeFile, rm, stat } from 'node:fs/promises';
import { dirname, join, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateGrammarUnit } from '../js/grammar/schema.js';
import { grammarCatalogEntry } from '../js/grammar/collections.js';
import { validateBooksRegistry } from '../js/curriculum/books.js';
import { buildGrammarCatalog } from './build-grammar-catalog.mjs';
import { buildCurriculumIndex } from '../js/curriculum/index.js';
import { auditBooks } from './audit-books.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const mode = args.includes('--publish') ? '--publish' : '--check';
const positional = args.filter(a => !a.startsWith('--'));
if (args.some(a => a.startsWith('--') && a !== '--publish' && a !== '--check') || positional.length !== 1 || (args.includes('--publish') && args.includes('--check'))) {
  console.error('Usage: node scripts/publish-eg2.mjs <folder-with-145-jsons> --check|--publish');
  process.exit(2);
}
const sourceDir = resolve(positional[0]);
const targetDir = join(root, 'database', 'English_Grammar_2');
const booksFile = join(root, 'curriculum', 'books.json');
const grammarManifestFile = join(root, 'database', 'grammar-manifest.json');
const indexFile = join(root, 'curriculum', 'index.json');
const expectedIds = Array.from({ length: 145 }, (_, i) => `eg2-u${String(i+1).padStart(3,'0')}`);
const normalized = s => String(s).normalize('NFKC').toLowerCase().trim().replace(/[\u2018\u2019]/g, "'").replace(/[.!?]+$/g,'').replace(/\s+/g,' ');
const problems = [];
const check = (value, message) => { if (!value) problems.push(message); };
const addProblem = (id, text) => problems.push(`${id}: ${text}`);
const unique = (items) => new Set(items.map(normalized)).size === items.length;

async function getFiles() {
  try { return await readdir(sourceDir); } catch (e) { throw new Error(`Cannot read source folder: ${sourceDir} (${e.message})`); }
}
function inspectUnit(unit, filename) {
  const id=basename(filename,'.json');
  try { validateGrammarUnit(unit); } catch(e) { addProblem(id,`schema: ${e.message}`); return; }
  try { grammarCatalogEntry(unit, `database/English_Grammar_2/${filename}`); }
  catch(e) { addProblem(id,`collection: ${e.message}`); }
  check(unit.id === id,`${id}: unit ID disagrees with filename`);
  for(const [field,count,prefix] of [['exercises',12,'wr'],['speakingExercises',8,'sp'],['listeningExercises',8,'li']]) {
    const list=unit[field];
    check(Array.isArray(list) && list.length===count,`${id}: ${field} must have ${count} exercises`);
    if(!Array.isArray(list))continue;
    list.forEach((e,i) => check(e?.id === `${prefix}-${String(i+1).padStart(2,'0')}`,`${id}: unexpected ID at ${field}[${i}]`));
    for(const e of list) {
      if(Array.isArray(e?.acceptedAnswers))check(unique(e.acceptedAnswers),`${id}: duplicate acceptedAnswers in ${e.id}`);
      if(Array.isArray(e?.choices))check(unique(e.choices),`${id}: duplicate choices in ${e.id}`);
    }
  }
  check(Array.isArray(unit.learningObjectives) && unit.learningObjectives.length>=3,`${id}: at least 3 learning objectives required`);
  check(Array.isArray(unit.explanation) && unit.explanation.length>=4,`${id}: at least 4 explanation sections required`);
  check(Array.isArray(unit.comparisons) && unit.comparisons.length>=1,`${id}: at least one comparison required`);
  check(Array.isArray(unit.examples) && unit.examples.length>=4,`${id}: at least 4 examples required`);
  check(Array.isArray(unit.commonMistakes) && unit.commonMistakes.length>=3,`${id}: at least 3 common mistakes required`);
  check(Array.isArray(unit.studyTips) && unit.studyTips.length>=2,`${id}: at least 2 study tips required`);
  (unit.exercises||[]).forEach((e,i)=>check(e.type===(i<4?'multiple-choice':i<8?'gap-fill':'error-correction'),`${id}: ${e.id} has wrong Writing type/order`));
  (unit.listeningExercises||[]).forEach((e,i)=>check(e.type===(i===2||i>=6?'gap-fill':'multiple-choice'),`${id}: ${e.id} has wrong Listening type/order`));
  const audio=(unit.listeningExercises||[]).map(e=>e.audioText).filter(x=>typeof x==='string');
  check(unique(audio),`${id}: repeated listening audio text`);
}

async function preflight(){
  const found=await getFiles();
  const files=found.filter(x=>x.endsWith('.json'));
  const invalid=files.filter(x=>!/^eg2-u\d{3}\.json$/.test(x));
  for(const x of invalid)addProblem(x,'unexpected JSON filename in source folder');
  const expected=new Set(expectedIds.map(x=>`${x}.json`));
  for(const x of expected)if(!files.includes(x))addProblem(x,'missing unit file');
  for(const x of files)if(!expected.has(x))addProblem(x,'unexpected unit file');
  const results=new Map();
  for(const filename of files.filter(x=>expected.has(x)).sort()){
    let raw,parsed;
    try {raw=await readFile(join(sourceDir,filename),'utf8');parsed=JSON.parse(raw);}catch(e){addProblem(filename,`cannot parse JSON: ${e.message}`);continue;}
    inspectUnit(parsed,filename);
    results.set(filename,raw);
  }
  if(problems.length){
    console.error(`FAILED: ${problems.length} issues in ${files.length} JSON files.`);
    for(const p of problems.slice(0,120))console.error(' - '+p);
    if(problems.length>120)console.error(` ... and ${problems.length-120} more`);
    process.exitCode=1;
    return null;
  }
  console.log(`PASS: ${results.size}/145 EG2 units; 1,740 Writing + 1,160 Speaking + 1,160 Listening = 4,060 exercises.`);
  return results;
}
async function publish(contents){
  // Validate the existing registry before changing any published data.
  const registry=JSON.parse(await readFile(booksFile,'utf8'));
  const book=registry.books.find(b=>b.id==='english-grammar-2');
  if(!book)throw new Error('Missing english-grammar-2 in curriculum/books.json.');
  if(book.status!=='planned' && book.status!=='available')throw new Error('Unexpected English Grammar 2 book status.');
  book.status='available';
  book.contentProvider='grammar';
  book.manifest='database/grammar-manifest.json';
  book.sourceIds=['english-grammar-2'];
  validateBooksRegistry(registry);

  // Refuse an overwrite if an already published unit differs from the input.
  await mkdir(targetDir,{recursive:true});
  const existing=await readdir(targetDir);
  const unknown=existing.filter(x=>x.endsWith('.json')&&!contents.has(x));
  if(unknown.length)throw new Error(`Unexpected JSONs already in EG2 directory: ${unknown.join(', ')}`);
  for(const [name,raw] of contents){
    try{const old=await readFile(join(targetDir,name),'utf8');if(old!==raw)throw new Error(`EG2 destination differs: ${name}. Stop and compare before overwriting.`)}
    catch(e){if(e.code!=='ENOENT')throw e;}
  }
  // Save old manifests and registry. Restore them if catalog generation fails.
  const managed=[booksFile,grammarManifestFile,indexFile];
  const originals=new Map();
  for(const file of managed){try{originals.set(file,await readFile(file));}catch(e){if(e.code!=='ENOENT')throw e;originals.set(file,null);}}
  const created=[];
  try {
    for(const [name,raw] of contents){
      const path=join(targetDir,name);
      try{await stat(path);}catch(e){if(e.code!=='ENOENT')throw e;await writeFile(path,raw,'utf8');created.push(path);}
    }
    await writeFile(booksFile,JSON.stringify(registry,null,2)+'\n','utf8');
    const grammar=await buildGrammarCatalog(root);
    const lexical=JSON.parse(await readFile(join(root,'database','manifest.json'),'utf8'));
    const built=JSON.parse(await readFile(grammarManifestFile,'utf8'));
    const index=buildCurriculumIndex(registry,lexical,built);
    await writeFile(indexFile,JSON.stringify(index,null,2)+'\n','utf8');
    const books=await auditBooks(root);
    if(grammar.collections['english-grammar-2']!==145 || index.totalUnits!==682 || index.availableBooks!==7 || books.available!==7)
      throw new Error('Unexpected catalog counts after publishing');
    console.log(`PUBLISHED: ${grammar.units} grammar units; ${index.totalUnits} total units, ${index.availableBooks} available books.`);
    console.log('NEXT: run npm test, then open /library.html and /grammar.html to check the UI.');
  } catch(e){
    for(const [file,old] of originals){if(old===null)await rm(file,{force:true});else await writeFile(file,old);}
    for(const path of created)await rm(path,{force:true});
    throw e;
  }
}
try{
  const files=await preflight();
  if(files && mode==='--publish')await publish(files);
  else if(files)console.log('No files changed (check mode). When ready, rerun with --publish.');
}catch(e){console.error(`ERROR: ${e.message}`);process.exitCode=1;}
