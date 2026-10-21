#!/usr/bin/env node
/**
 * VocabLab v1.5.1: published identity lock.
 * Captures stable unit / exercise / item IDs, not lesson wording.
 * The initial snapshot is an explicit, one-time human-reviewed baseline.
 */
import {createHash} from 'node:crypto';
import {readFile,writeFile,lstat,rename,rm} from 'node:fs/promises';
import {resolve,dirname,join,relative,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateBooksRegistry,bookBySourceId} from '../js/curriculum/books.js';
import {validateGrammarUnit} from '../js/grammar/schema.js';
import {auditBooks} from './audit-books.mjs';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const NAME='curriculum/content-identities.json';
const ID=/^[A-Za-z0-9_-]+$/;
const read=async file=>JSON.parse(await readFile(file,'utf8'));
const canonical=values=>[...values].sort();
const assert=(condition,message)=>{if(!condition)throw new Error(`Content identities: ${message}`);};
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const identityPath=root=>join(resolve(root),NAME);

/** Wording, choices and translations do not affect an identity fingerprint. */
export function unitIdentity(unit,provider){
  assert(unit && typeof unit.id==='string' && ID.test(unit.id), 'invalid unit ID');
  let sets;
  if(provider==='grammar'){
    validateGrammarUnit(unit);
    sets={writing:unit.exercises.map(e=>e.id),speaking:(unit.speakingExercises||[]).map(e=>e.id),listening:(unit.listeningExercises||[]).map(e=>e.id)};
  } else if(provider==='vocabulary'){
    assert(Array.isArray(unit.items) && unit.items.length>0,`${unit.id}: missing lexical items`);
    sets={items:unit.items.map(e=>e.id)};
  } else throw new Error('Unsupported content provider: '+provider);
  for(const [skill,ids] of Object.entries(sets)){
    assert(ids.every(id=>typeof id==='string'&&ID.test(id)),`${unit.id}: invalid ${skill} ID`);
    assert(new Set(ids).size===ids.length,`${unit.id}: duplicated ${skill} IDs`);
  }
  const ids=Object.fromEntries(Object.entries(sets).map(([k,v])=>[k,canonical(v)]));
  return {fingerprint:hash(ids),counts:Object.fromEntries(Object.entries(sets).map(([k,v])=>[k,v.length]))};
}

function checkLockShape(lock){
  assert(lock?.format==='vocablab-content-identities' && lock?.version===1 &&
    lock.books && typeof lock.books==='object' && !Array.isArray(lock.books), 'unsupported identity lock format');
}
async function publishedState(root){
  root=resolve(root);
  const [registry,grammar,vocab]=await Promise.all([
    read(join(root,'curriculum/books.json')),
    read(join(root,'database/grammar-manifest.json')),
    read(join(root,'database/manifest.json')),
  ]);
  const books=validateBooksRegistry(registry).filter(x=>x.status==='available');
  const groups=new Map(books.map(x=>[x.id,{}]));
  for(const [provider,units] of [['grammar',grammar.units],['vocabulary',vocab.units]]){
    assert(Array.isArray(units),`${provider}: missing manifest units`);
    for(const entry of units){
      const source=provider==='grammar'?entry.collectionId:entry.bookId;
      const book=bookBySourceId(books,provider,source);
      assert(book,`unregistered published unit ${entry.id}`);
      const path=entry.path;
      assert(typeof path==='string' && /^database\/[\w/-]+\.json$/.test(path) && !path.split('/').includes('..'),`${entry.id}: unsafe path`);
      const absolute=resolve(root,...path.split('/'));
      assert(absolute.startsWith(join(root,'database')+sep),`${entry.id}: path escapes database`);
      const info=await lstat(absolute);
      assert(info.isFile()&&!info.isSymbolicLink(),`${entry.id}: source is not a regular file`);
      const document=await read(absolute);
      const content=provider==='grammar'?[document]:Array.isArray(document.units)?document.units:[document];
      const unit=content.find(u=>u.id===entry.id);
      assert(unit,`${entry.id}: missing from ${path}`);
      assert(!Object.hasOwn(groups.get(book.id),entry.id),`${entry.id}: repeated unit`);
      groups.get(book.id)[entry.id]=unitIdentity(unit,provider);
    }
  }
  for(const book of books)assert(Object.keys(groups.get(book.id)).length>0,`${book.id}: no published units`);
  return Object.fromEntries([...groups].sort(([a],[b])=>a.localeCompare(b)).map(([bookId,units])=>[bookId,Object.fromEntries(Object.entries(units).sort(([a],[b])=>a.localeCompare(b)))]));
}

export async function buildIdentityLock(root=ROOT){
  await auditBooks(resolve(root));
  return {format:'vocablab-content-identities',version:1,books:await publishedState(root)};
}
export async function checkIdentities(root=ROOT,{bookId}={}){
  root=resolve(root);
  let locked;
  try{locked=await read(identityPath(root));}catch(e){if(e.code==='ENOENT')throw new Error('Missing identity baseline. Run: node scripts/content-identities.mjs init');throw e;}
  checkLockShape(locked);
  const current=await publishedState(root);
  const bookIds=bookId?[bookId]:canonical(new Set([...Object.keys(locked.books),...Object.keys(current)]));
  for(const id of bookIds){
    assert(Object.hasOwn(locked.books,id),`${id}: book is not registered in the identity baseline`);
    assert(Object.hasOwn(current,id),`${id}: book is no longer available`);
    const old=locked.books[id], now=current[id];
    for(const unitId of canonical(new Set([...Object.keys(old),...Object.keys(now)]))){
      assert(Object.hasOwn(old,unitId),`${id}/${unitId}: a new unit was added without a reviewed publication`);
      assert(Object.hasOwn(now,unitId),`${id}/${unitId}: published unit ID disappeared`);
      assert(old[unitId].fingerprint===now[unitId].fingerprint,`${id}/${unitId}: exercise/item IDs changed; preserve existing progress keys`);
    }
  }
  return {passed:true,books:bookIds.length,units:bookIds.reduce((n,id)=>n+Object.keys(current[id]).length,0)};
}
/** Only during a validated publication: append the new book without changing old identities. */
export async function addPublishedBookIdentity(root,bookId){
  root=resolve(root);
  const file=identityPath(root);
  const lock=await read(file);checkLockShape(lock);
  assert(!Object.hasOwn(lock.books,bookId),`${bookId}: already has an identity baseline`);
  const current=await publishedState(root);
  // Recheck all historical identities before committing a new volume.
  for(const [id,entries] of Object.entries(lock.books)){
    assert(Object.hasOwn(current,id),`${id}: existing book missing`);
    assert(JSON.stringify(entries)===JSON.stringify(current[id]),`${id}: existing identities changed`);
  }
  assert(Object.hasOwn(current,bookId),`${bookId}: not present in published manifests`);
  lock.books[bookId]=current[bookId];
  lock.books=Object.fromEntries(Object.entries(lock.books).sort(([a],[b])=>a.localeCompare(b)));
  await writeFile(file,JSON.stringify(lock,null,2)+'\n','utf8');
}

async function main(){
  const [action,...rest]=process.argv.slice(2);
  if(rest.length || !['init','check'].includes(action))throw new Error('Usage: node scripts/content-identities.mjs init|check');
  if(action==='init'){
    const file=identityPath(ROOT);
    const baseline=await buildIdentityLock(ROOT);
    await writeFile(file,JSON.stringify(baseline,null,2)+'\n',{flag:'wx'});
    console.log(`Initialized ${NAME}: ${Object.keys(baseline.books).length} books. Review and commit the generated baseline.`);
  }else console.log(JSON.stringify(await checkIdentities(ROOT),null,2));
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{console.error(`ERROR: ${e.message}`);process.exitCode=1;});
