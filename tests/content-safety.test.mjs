import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,readdir,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {unitIdentity,buildIdentityLock,checkIdentities,identityPath} from '../scripts/content-identities.mjs';
import {auditReport} from '../scripts/content-audit-report.mjs';
import {publishStaging} from '../scripts/content.mjs';
import {GRAMMAR_COLLECTIONS,grammarCatalogEntry} from '../js/grammar/collections.js';
import {buildCurriculumIndex} from '../js/curriculum/index.js';

const project=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=async path=>JSON.parse(await readFile(path,'utf8'));
const emit=async(path,value)=>writeFile(path,JSON.stringify(value,null,2)+'\n');
const isolated=async work=>{const root=await mkdtemp(join(tmpdir(),'vocablab-publisher-safety-'));try{return await work(root);}finally{await rm(root,{recursive:true,force:true});}};

// Only IDs affect stable identity fingerprints; punctuation, wording and answer strings do not.
test('identity fingerprints allow editorial corrections but reject ID changes',()=>{
  const grammar={format:'vocablab-grammar-unit',version:1,id:'eg1-u001',title:'Example',level:'A1',topicId:'example',summary:'Example',
    explanation:[{heading:'Rule',body:'Example explanation'}],
    exercises:[{id:'wr-01',type:'gap-fill',prompt:'It ___ here.',acceptedAnswers:['is'],feedback:'It is here.'}],
    speakingExercises:[{id:'sp-01',prompt:'Say the sentence',acceptedAnswers:['It is here.'],feedback:'Correct.'}],
    listeningExercises:[{id:'li-01',type:'gap-fill',audioText:'It is here.',prompt:'Write the verb',acceptedAnswers:['is'],feedback:'Correct.'}]};
  const a=unitIdentity(grammar,'grammar');
  const revised=structuredClone(grammar);revised.exercises[0].prompt='Please complete the sentence.';
  assert.equal(unitIdentity(revised,'grammar').fingerprint,a.fingerprint);
  revised.exercises[0].id='wr-99';
  assert.notEqual(unitIdentity(revised,'grammar').fingerprint,a.fingerprint);
  const vocab={id:'coll2-u001',items:[{id:'take-a-break',word:'take a break'},{id:'make-progress',word:'make progress'}]};
  const fingerprint=unitIdentity(vocab,'vocabulary').fingerprint;
  vocab.items[0].word='take a brief break';
  assert.equal(unitIdentity(vocab,'vocabulary').fingerprint,fingerprint);
  vocab.items[0].id='take-break';
  assert.notEqual(unitIdentity(vocab,'vocabulary').fingerprint,fingerprint);
});

test('audit reports use structured stable error and warning records',()=>{
  const result=auditReport({book:{id:'english-grammar-3',title:'English Grammar 3'},provider:'grammar',expected:120,units:119,files:['eg3-u001.json'],errors:['eg3-u120: missing unit'],warnings:['eg3-u001: level should be C1']});
  assert.equal(result.format,'vocablab-content-audit');
  assert.equal(result.passed,false);
  assert.equal(result.summary.errors,1);
  assert.equal(result.issues[0].location,'eg3-u120');
  assert.equal(result.issues[1].severity,'warning');
});

async function setup(root){
  for(const dir of ['curriculum','database','database/English_Grammar_1','content-staging/English_Grammar_3','scripts'])await mkdir(join(root,dir),{recursive:true});
  for(const name of ['build-catalog.mjs','build-grammar-catalog.mjs','build-curriculum-index.mjs'])await writeFile(join(root,'scripts',name),'// mock generator for rollback fault injection\n');
  const registry=await read(join(project,'curriculum/books.json'));
  for(const book of registry.books)if(book.id!=='english-grammar-1'){
    book.status='planned';delete book.contentProvider;delete book.manifest;delete book.sourceIds;
  }
  await emit(join(root,'curriculum/books.json'),registry);
  const unit=await read(join(project,'database/English_Grammar_1/eg1-u001.json'));
  await emit(join(root,'database/English_Grammar_1/eg1-u001.json'),unit);
  const grammar={format:'vocablab-grammar-catalog',version:1,
    collections:GRAMMAR_COLLECTIONS.map(c=>({id:c.id,title:c.title,level:c.level,book:c.book,edition:c.edition,unitCount:c.id==='english-grammar-1'?1:0})),
    units:[grammarCatalogEntry(unit,'database/English_Grammar_1/eg1-u001.json')]};
  const vocab={format:'vocablab-catalog',version:1,units:[]};
  await emit(join(root,'database/grammar-manifest.json'),grammar);
  await emit(join(root,'database/manifest.json'),vocab);
  await emit(join(root,'curriculum/index.json'),buildCurriculumIndex(registry,vocab,grammar));
  await emit(identityPath(root),await buildIdentityLock(root));
  const staged=await read(join(project,'database/English_Grammar_2/eg2-u001.json'));
  staged.id='eg3-u001';staged.level='C1';staged.topicId='eg3-u001-test';
  await emit(join(root,'content-staging/English_Grammar_3/eg3-u001.json'),staged);
  return {sourceDir:join(root,'content-staging/English_Grammar_3'),bookId:'english-grammar-3',root,expected:1};
}

test('fault injection restores exact manifests, identity lock and files, and removes publication lock', async()=>{
  for(const point of ['after-files','after-registry','after-catalogs'])await isolated(async root=>{
    const options=await setup(root);
    const managed=['curriculum/books.json','curriculum/index.json','curriculum/content-identities.json','database/grammar-manifest.json','database/manifest.json'];
    const before=new Map(await Promise.all(managed.map(async x=>[x,await readFile(join(root,x))])));
    await assert.rejects(()=>publishStaging({...options,onPhase:async phase=>{if(phase===point){if(point==='after-catalogs')await writeFile(join(root,'database/grammar-manifest.json'),'{invalid generated manifest');throw new Error('injected failure at '+phase);}}}),/rollback completed/);
    for(const name of managed)assert.deepEqual(await readFile(join(root,name)),before.get(name),name+' changed after rollback');
    const db=join(root,'database/English_Grammar_3');
    await assert.rejects(()=>readdir(db),/ENOENT/);
    await assert.rejects(()=>readFile(join(root,'.content-publish.lock')),/ENOENT/);
    assert.equal((await read(join(root,'curriculum/books.json'))).books.find(b=>b.id==='english-grammar-3').status,'planned');
  });
});

test('a second publisher cannot bypass the exclusive publication lock',async()=>{
  await isolated(async root=>{
    const options=await setup(root);
    const lock=join(root,'.content-publish.lock');
    await writeFile(lock,'publication running');
    await assert.rejects(()=>publishStaging(options),/Another publication may be in progress/);
    assert.equal(await readFile(lock,'utf8'),'publication running');
  });
});

test('committed published identities still match the public catalogs',async()=>{
  const result=await checkIdentities(project);
  assert.ok(result.books>=7);
  assert.ok(result.units>=682);
});
