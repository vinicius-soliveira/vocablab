import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { folderForBook, providerForBook, inspectStaging, publishStaging, verifyPublished } from '../scripts/content.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixture = async file => JSON.parse(await readFile(join(root,file),'utf8'));
async function temp(callback) {
  const folder=await mkdtemp(join(tmpdir(),'vocablab-content-test-'));
  try{return await callback(folder);}finally{await rm(folder,{recursive:true,force:true});}
}

test('content pipeline maps canonical metadata to existing public folders and engines', async () => {
  const books=(await fixture('curriculum/books.json')).books;
  assert.equal(folderForBook(books.find(b=>b.id==='english-grammar-3')),'English_Grammar_3');
  assert.equal(folderForBook(books.find(b=>b.id==='english-collocations-2')),'English_Collocations_2');
  assert.equal(providerForBook(books.find(b=>b.id==='english-grammar-3')),'grammar');
  assert.equal(providerForBook(books.find(b=>b.id==='english-collocations-2')),'vocabulary');
  assert.throws(()=>providerForBook(books.find(b=>b.id==='english-pronunciation-1')),/needs a content engine/);
});

test('staging validation accepts one schema-correct Grammar 3 unit and does not touch published manifests', async () => {
  await temp(async folder => {
    const model=await fixture('database/English_Grammar_2/eg2-u001.json');
    model.id='eg3-u001';model.level='C1';model.topicId='eg3-u001-grammar-topic';
    await writeFile(join(folder,'eg3-u001.json'),JSON.stringify(model));
    const before=await readFile(join(root,'curriculum/index.json'));
    const plan=await inspectStaging({root,bookId:'english-grammar-3',sourceDir:folder,expected:1});
    assert.equal(plan.units,1);
    assert.deepEqual(plan.errors,[]);
    assert.deepEqual(await readFile(join(root,'curriculum/index.json')),before);
  });
});

test('staging validation detects missing units and refuses publication before touching database', async () => {
  await temp(async folder => {
    const model=await fixture('database/English_Grammar_2/eg2-u001.json');
    model.id='eg3-u001';model.level='C1';model.topicId='eg3-u001-grammar-topic';
    await writeFile(join(folder,'eg3-u001.json'),JSON.stringify(model));
    const plan=await inspectStaging({root,bookId:'english-grammar-3',sourceDir:folder,expected:2});
    assert.ok(plan.errors.some(e=>e.includes('missing unit number 2')));
    // Avoid colliding with the real publication lock while the suite runs.
    const isolatedRoot=join(folder,'isolated-project');
    await mkdir(join(isolatedRoot,'curriculum'),{recursive:true});
    await writeFile(join(isolatedRoot,'curriculum','books.json'),await readFile(join(root,'curriculum','books.json')));
    await assert.rejects(()=>publishStaging({
      root:isolatedRoot,bookId:'english-grammar-3',sourceDir:folder,expected:2
    }),/Preflight failed/);
  });
});

test('staging validation supports multiple vocabulary-like units per JSON source file', async () => {
  await temp(async folder => {
    const unit = n => ({id:`coll2-u${String(n).padStart(3,'0')}`,number:n,title:`Unit ${n}`,level:'C1',bookId:'english-collocations-2',items:[{id:'collocation',word:'make progress',pt:'progredir',example:'She is making progress.'}]});
    await writeFile(join(folder,'batch-01-02.json'),JSON.stringify({format:'vocablab-unit-package',bookId:'english-collocations-2',units:[unit(1),unit(2)]}));
    const plan=await inspectStaging({root,bookId:'english-collocations-2',sourceDir:folder,expected:2});
    assert.equal(plan.files.length,1);
    assert.equal(plan.units,2);
    assert.deepEqual(plan.errors,[]);
  });
});

test('published English Grammar 2 remains verifiable by the generic pipeline', async () => {
  const result=await verifyPublished({root,bookId:'english-grammar-2',expected:145});
  assert.equal(result.passed,true);
  assert.equal(result.units,145);
});
