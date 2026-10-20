import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {GRAMMAR_COLLECTIONS,grammarCatalogEntry,selectGrammarCollection} from '../js/grammar/collections.js';
import {validGrammarPath,validateGrammarManifest} from '../js/grammar/schema.js';
import {buildGrammarCatalog} from '../scripts/build-grammar-catalog.mjs';
import {exampleUnit,fixtureEntry,fixtureManifest} from './fixtures/grammar-fixture.mjs';

async function withDir(fn){const root=await mkdtemp(join(tmpdir(),'vocablab-grammar-'));try{return await fn(root);}finally{await rm(root,{recursive:true,force:true});}}
async function place(root,collection,unit){const dir=join(root,'database',`English_Grammar_${collection.at(-1)}`);
  await mkdir(dir,{recursive:true});await writeFile(join(dir,unit.id+'.json'),JSON.stringify(unit));}

test('three collection identities and nested paths are fixed and safe',()=>{
  assert.deepEqual(GRAMMAR_COLLECTIONS.map(c=>c.id),['english-grammar-1','english-grammar-2','english-grammar-3']);
  assert.equal(validGrammarPath('database/English_Grammar_1/eg1-u001.json'),true);
  for(const path of ['grammar/units/grammar-b1-articles.json','database/English_Grammar_2/eg1-u001.json',
    'database/English_Grammar_1/../eg1-u001.json','grammar/units/english-grammar-4/eg4-u001.json',
    'database/English_Grammar_1/eg1-u001.json?query=1'])assert.equal(validGrammarPath(path),false,path);
  assert.throws(()=>grammarCatalogEntry(exampleUnit(),'database/English_Grammar_2/eg1-u001.json'),/Invalid/);
});
test('manifest validates the collections, count and membership and allows empty collections',()=>{
  assert.equal(validateGrammarManifest(fixtureManifest([])).length,0);
  assert.equal(validateGrammarManifest(fixtureManifest()).length,1);
  assert.throws(()=>validateGrammarManifest({...fixtureManifest(),collections:[]}),/collections/);
  assert.throws(()=>validateGrammarManifest(fixtureManifest([{...fixtureEntry(),collectionId:'english-grammar-2'}])),/Invalid/);
  assert.throws(()=>validateGrammarManifest(fixtureManifest([{...fixtureEntry(),number:30}])),/Invalid/);
  assert.equal(selectGrammarCollection([fixtureEntry()],'english-grammar-2').length,0);
});
test('generator scans subfolders, sorts by unit number, ignores root pilots and builds empty collections',async()=>{
  await withDir(async root=>{
    await mkdir(join(root,'database','English_Grammar_1'),{recursive:true});
    await writeFile(join(root,'database','grammar-b1-articles.json'),'invalid legacy unit deliberately ignored');
    const one=exampleUnit('eg1-u001'),four=exampleUnit('eg1-u004');
    const advanced=exampleUnit('eg3-u103','C1');
    await place(root,'english-grammar-1',four);await place(root,'english-grammar-1',one);
    await place(root,'english-grammar-3',advanced);
    const result=await buildGrammarCatalog(root);
    assert.equal(result.units,3);assert.equal(result.exercises,36);
    const catalog=JSON.parse(await readFile(join(root,'database','grammar-manifest.json'),'utf8'));
    assert.deepEqual(catalog.units.map(x=>x.id),['eg1-u001','eg1-u004','eg3-u103']);
    assert.deepEqual(catalog.collections.map(x=>x.unitCount),[2,0,1]);
    assert.equal(validateGrammarManifest(catalog).length,3);
  });
  await withDir(async root=>{
    const result=await buildGrammarCatalog(root);
    assert.equal(result.units,0);
    const catalog=JSON.parse(await readFile(join(root,'database','grammar-manifest.json'),'utf8'));
    assert.equal(validateGrammarManifest(catalog).length,0);
  });
});
test('generator rejects wrong book, filename and invalid JSON without overwriting a previously generated manifest',async()=>{
  await withDir(async root=>{
    await buildGrammarCatalog(root);
    const previous=await readFile(join(root,'database','grammar-manifest.json'),'utf8');
    await place(root,'english-grammar-2',exampleUnit('eg2-u001','A1'));
    await assert.rejects(()=>buildGrammarCatalog(root),/expected a B1–B2/);
    assert.equal(await readFile(join(root,'database','grammar-manifest.json'),'utf8'),previous);
  });
  await withDir(async root=>{
    const dir=join(root,'database','English_Grammar_1');await mkdir(dir,{recursive:true});
    await writeFile(join(dir,'bad.json'),JSON.stringify(exampleUnit()));
    await assert.rejects(()=>buildGrammarCatalog(root),/Invalid grammar collection or unit path/);
  });
});
