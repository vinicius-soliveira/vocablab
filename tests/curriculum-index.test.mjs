import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildCurriculumIndex,validateCurriculumIndex,summarizeBookProgress,loadCurriculumIndex} from '../js/curriculum/index.js';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=async path=>JSON.parse(await readFile(join(root,path),'utf8'));
const books=await read('curriculum/books.json');
const vocabulary=await read('database/manifest.json');
const grammar=await read('database/grammar-manifest.json');
const index=await read('curriculum/index.json');
const clone=value=>JSON.parse(JSON.stringify(value));

test('curriculum index unifies six published books and 537 units without demo entries or publisher labels',()=>{
  assert.deepEqual(index,buildCurriculumIndex(books,vocabulary,grammar));
  assert.equal(validateCurriculumIndex(index),index);
  assert.equal(index.books.length,20);
  assert.equal(index.availableBooks,6);
  assert.equal(index.totalUnits,537);
  const published=index.books.filter(x=>x.status==='available');
  assert.equal(published.reduce((n,b)=>n+b.units.length,0),537);
  assert.deepEqual(published.map(b=>b.units.length),[60,100,101,101,115,60]);
  const ids=new Set(published.flatMap(b=>b.units.map(u=>u.id)));
  assert.ok(!ids.has('unit-03')&&!ids.has('workplace-communication'));
  assert.ok(!/Cambridge|In Use|Edition|Original content/i.test(JSON.stringify(index)));
  assert.equal(published.find(b=>b.id==='english-collocations-1').title,'English Collocations 1');
});

test('curriculum rejects orphaned, duplicate, and mismatched units',()=>{
  const orphan=clone(vocabulary);orphan.units[0].bookId='unregistered-source';
  assert.throws(()=>buildCurriculumIndex(books,orphan,grammar),/unregistered/);
  const duplicate=clone(vocabulary);duplicate.units[1].id=duplicate.units[0].id;
  assert.throws(()=>buildCurriculumIndex(books,duplicate,grammar),/duplicated/);
  const wrongPublicTitle=clone(vocabulary);wrongPublicTitle.units[0].bookTitle='Old publisher title';
  assert.throws(()=>buildCurriculumIndex(books,wrongPublicTitle,grammar),/public book name mismatch/);
  const corrupted=clone(index);corrupted.books[0].units[1].id=corrupted.books[0].units[0].id;
  assert.throws(()=>validateCurriculumIndex(corrupted),/duplicate/);
});

test('book progress summary reads old vocab/grammar keys without mutating data',()=>{
  const v=clone(index.books[0]);const g=clone(index.books.find(x=>x.id==='english-grammar-1'));
  const lex={};lex[`${v.units[0].id}::word1`]={meaning:{attempts:1,due:1},listening:{attempts:1,due:9999999999999}};
  lex[`${v.units[1].id}::word2`]={meaning:{attempts:1,due:1}};
  lex['unit-03::pilot']={meaning:{attempts:3,due:1}};
  const gram={};gram[`${g.units[0].id}::wr-01`]={attempts:1,due:1,skill:'recognition'};
  gram[`${g.units[0].id}::li-01`]={attempts:1,due:9999999999999,skill:'listening'};
  const before=JSON.stringify({lex,gram});
  assert.deepEqual(summarizeBookProgress(v,lex,gram,1000),{started:2,complete:0,due:2,total:60});
  assert.deepEqual(summarizeBookProgress(g,lex,gram,1000),{started:1,complete:0,due:1,total:115});
  assert.equal(JSON.stringify({lex,gram}),before);
});

test('browser curriculum loader accepts generated JSON, rejects missing and corrupt manifests',async()=>{
  const output=await loadCurriculumIndex(async url=>{
    assert.equal(new URL(url).pathname.endsWith('/curriculum/index.json'),true);
    return {ok:true,json:async()=>index};
  });
  assert.equal(output.totalUnits,537);
  await assert.rejects(()=>loadCurriculumIndex(async()=>({ok:false,status:404})),/npm run catalog:all/);
  await assert.rejects(()=>loadCurriculumIndex(async()=>({ok:true,json:async()=>({})})),/Invalid curriculum index/);
});

test('Books Library uses deep links while demo units remain archived in browser storage',async()=>{
  const html=await readFile(join(root,'library.html'),'utf8');
  const ui=await readFile(join(root,'js/curriculum/library-ui.js'),'utf8');
  const main=await readFile(join(root,'js/main.js'),'utf8');
  const grammarMain=await readFile(join(root,'js/grammar/main.js'),'utf8');
  const indexHtml=await readFile(join(root,'index.html'),'utf8');
  assert.match(indexHtml,/href="library\.html"[^>]*>.*Books Library/);
  assert.match(html,/js\/curriculum\/library-ui\.js/);
  assert.match(ui,/index\.html.*unit=/);
  assert.match(ui,/grammar\.html.*unit=/);
  assert.match(main,/new URLSearchParams\(window\.location\.search\)\.get\('unit'\)/);
  assert.match(grammarMain,/new URLSearchParams\(window\.location\.search\)\.get\('unit'\)/);
  assert.match(main,/\['unit-03', 'workplace-communication'\]/);
  assert.doesNotMatch(ui,/\.removeItem\(|\.setItem\(/);
});
