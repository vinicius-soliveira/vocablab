import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateGrammarUnit } from '../js/grammar/schema.js';
import { validateBooksRegistry } from '../js/curriculum/books.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = async path => JSON.parse(await readFile(join(root,path),'utf8'));

test('English Grammar 2 is either planned and empty or published with exactly 145 valid units', async () => {
  const registry=await read('curriculum/books.json');
  validateBooksRegistry(registry);
  const book=registry.books.find(x=>x.id==='english-grammar-2');
  assert.ok(book,'English Grammar 2 book registration missing');
  const grammar=await read('database/grammar-manifest.json');
  const entries=grammar.units.filter(x=>x.collectionId==='english-grammar-2');
  if(book.status==='planned') {
    assert.equal(entries.length,0,'planned EG2 cannot have published catalog entries');
    return;
  }
  assert.equal(book.status,'available');
  assert.equal(book.contentProvider,'grammar');
  assert.deepEqual(book.sourceIds,['english-grammar-2']);
  assert.equal(entries.length,145,'published EG2 must have exactly 145 units');
  const seen = new Set();
  const dir=join(root,'database','English_Grammar_2');
  const files=(await readdir(dir)).filter(x=>x.endsWith('.json'));
  assert.equal(files.length,145,'published EG2 must have exactly 145 JSON files');
  for(let n=1;n<=145;n++){
    const number=String(n).padStart(3,'0');
    const id=`eg2-u${number}`;
    const entry=entries.find(x=>x.id===id);
    assert.ok(entry,`${id} missing from manifest`);
    assert.ok(!seen.has(id));seen.add(id);
    assert.equal(entry.path,`database/English_Grammar_2/${id}.json`);
    const unit=validateGrammarUnit(await read(entry.path));
    assert.equal(unit.id,id);
    assert.ok(['B1','B2'].includes(unit.level));
    assert.equal(unit.exercises.length,12);
    assert.equal(unit.speakingExercises.length,8);
    assert.equal(unit.listeningExercises.length,8);
    assert.equal(entry.exerciseCount,12);
    assert.equal(entry.speakingCount,8);
    assert.equal(entry.listeningCount,8);
  }
});
