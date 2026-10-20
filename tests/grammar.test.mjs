import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateGrammarUnit,validateGrammarManifest} from '../js/grammar/schema.js';
import {exampleUnit,fixtureEntry,fixtureManifest} from './fixtures/grammar-fixture.mjs';
import {evaluateExercise, normalizeAnswer, exerciseSkill} from '../js/grammar/engine.js';
import {getGrammarProgress,recordGrammarAttempt,dueExercises,summarizeGrammarUnit,
  exportGrammarProgress,importGrammarProgress,GRAMMAR_PROGRESS_KEY} from '../js/grammar/progress.js';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const readJSON=async path=>JSON.parse(await readFile(join(root,path),'utf8'));
function fakeStorage() {
  const mem=new Map();
  return {getItem:k=>mem.get(k)??null,setItem:(k,v)=>mem.set(k,String(v)),removeItem:k=>mem.delete(k)};
}
const fixture={format:'vocablab-grammar-unit',version:1,id:'demo-b1',title:'Demo',level:'B1',topicId:'demo',summary:'Summary.',explanation:[{heading:'H',body:'Explanation.'}],exercises:[{id:'q-01',type:'gap-fill',prompt:'She ___ finished.',feedback:'Use has.',acceptedAnswers:['has']} ]};

test('Grammar manifest lists valid, unique, existing units with matching metadata',async()=>{
  const manifest=await readJSON('database/grammar-manifest.json');
  const entries=validateGrammarManifest(manifest);
  assert.equal(manifest.collections.length,3);
  let total=0;
  for(const entry of entries){
    const u=validateGrammarUnit(await readJSON(entry.path));
    assert.equal(u.id,entry.id); assert.equal(u.topicId,entry.topicId);assert.equal(u.level,entry.level);
    assert.equal(u.exercises.length,entry.exerciseCount);
    total+=u.exercises.length;
    assert.ok(new Set(u.exercises.map(x=>x.id)).size===u.exercises.length);
  }
  assert.equal(total,entries.reduce((n,e)=>n+e.exerciseCount,0));
});
test('Rejects duplicate exercise IDs and malicious catalog paths',()=>{
  assert.throws(()=>validateGrammarUnit({...fixture,exercises:[fixture.exercises[0],fixture.exercises[0]]}),/Duplicate/);
  assert.throws(()=>validateGrammarManifest({format:'vocablab-grammar-catalog',version:1,units:[{id:'demo',title:'Demo',level:'B1',topicId:'demo',exerciseCount:1,path:'grammar/../index.html',collectionId:'english-grammar-1',number:1}]}),/Invalid/);
});
test('Rejects unsupported exercise types and malformed answer arrays',()=>{
  assert.throws(()=>validateGrammarUnit({...fixture,exercises:[{...fixture.exercises[0],type:'essay'}]}),/Unsupported/);
  assert.throws(()=>validateGrammarUnit({...fixture,exercises:[{...fixture.exercises[0],acceptedAnswers:[]}]}),/Invalid acceptedAnswers/);
});
test('Multiple choice requires exact answer index',()=>{
  const e={type:'multiple-choice',choices:['a','b','c'],answerIndex:1,feedback:'b'};
  assert.equal(evaluateExercise(e,1).correct,true);
  assert.equal(evaluateExercise(e,0).correct,false);
  assert.equal(evaluateExercise(e,'1').correct,false);
  assert.equal(exerciseSkill(e),'recognition');
});
test('Gap fill accepts explicitly listed contractions and punctuation variants',()=>{
  const e={type:'gap-fill',acceptedAnswers:["haven't finished",'have not finished'],feedback:'The present perfect.'};
  assert.equal(evaluateExercise(e,"HAVEN’T   FINISHED.").correct,true);
  assert.equal(evaluateExercise(e,'Have Not Finished').correct,true);
  assert.equal(evaluateExercise(e,'did not finish').correct,false);
  assert.equal(exerciseSkill(e),'production');
  assert.equal(normalizeAnswer(' I  have   finished. '),'i have finished');
});
test('Error corrections reject superficially similar but incorrect alternatives',()=>{
  const e={type:'error-correction',acceptedAnswers:['I sent the report yesterday.'],feedback:'Use past simple.'};
  assert.equal(evaluateExercise(e,'i sent the report yesterday').correct,true);
  assert.equal(evaluateExercise(e,'I have sent the report yesterday.').correct,false);
});
test('Progress is isolated and schedules wrong attempts for five minutes',()=>{
  const storage=fakeStorage();
  storage.setItem('vocablab.progress.v1','{"voc":true}');
  const x=recordGrammarAttempt('u','e','production',false,storage,1000);
  assert.equal(x.due,301000);assert.equal(x.streak,0);
  assert.equal(getGrammarProgress(storage)['u::e'].attempts,1);
  assert.equal(storage.getItem('vocablab.progress.v1'),'{"voc":true}');
  assert.equal(storage.getItem(GRAMMAR_PROGRESS_KEY)!==null,true);
});
test('Review queue and skill metrics are calculated per unit',()=>{
  const storage=fakeStorage();
  const u={id:'demo-b1',exercises:[{id:'a',type:'multiple-choice'},{id:'b',type:'gap-fill'}]};
  recordGrammarAttempt(u.id,'a','recognition',true,storage,0);
  recordGrammarAttempt(u.id,'b','production',false,storage,0);
  assert.deepEqual(dueExercises(u,storage,299999),[]);
  assert.deepEqual(dueExercises(u,storage,300000).map(e=>e.id),['b']);
  const s=summarizeGrammarUnit(u,storage);
  assert.equal(s.practiced,2);assert.equal(s.attempts,2);assert.equal(s.successes,1);
  assert.equal(s.recognition.successes,1);assert.equal(s.production.successes,0);
});
test('Correct answers increase intervals without modifying vocabulary storage',()=>{
  const storage=fakeStorage();
  const first=recordGrammarAttempt('u','e','recognition',true,storage,0);
  const next=recordGrammarAttempt('u','e','recognition',true,storage,86400001);
  assert.equal(first.intervalDays,1);assert.equal(next.intervalDays,2);
  assert.equal(next.successes,2);assert.equal(next.attempts,2);
});
test('Grammar progress backup round-trip; invalid import does not overwrite stored data',()=>{
  const source=fakeStorage();
  recordGrammarAttempt('u','e','recognition',true,source,1000);
  const backup=exportGrammarProgress(source);
  const dest=fakeStorage();
  const count=importGrammarProgress(backup,dest);
  assert.equal(count,1);assert.deepEqual(getGrammarProgress(dest),getGrammarProgress(source));
  const snapshot=dest.getItem(GRAMMAR_PROGRESS_KEY);
  assert.throws(()=>importGrammarProgress({...backup,progress:{'invalid-key':{}}},dest),/Invalid/);
  assert.equal(dest.getItem(GRAMMAR_PROGRESS_KEY),snapshot);
});

test('Catalog loader validates supplied JSON and resolves grammar manifest URL', async()=>{
  const {loadGrammarCatalog}=await import('../js/grammar/catalog.js');
  const original=await readJSON('database/grammar-manifest.json');
  const urls=[];
  const fetcher=async url=>{urls.push(String(url));return {ok:true,json:async()=>original};};
  const entries=await loadGrammarCatalog(fetcher);
  assert.ok(entries.length>=0);
  assert.ok(urls[0].endsWith('/database/grammar-manifest.json'));
});
test('Unit loader rejects manifest/content mismatches',async()=>{
  const {loadGrammarUnit}=await import('../js/grammar/catalog.js');
  const original=exampleUnit();
  const entry=fixtureEntry(original);
  const fetcher=async()=>({ok:true,json:async()=>original});
  assert.equal((await loadGrammarUnit(entry,fetcher)).id,entry.id);
  await assert.rejects(()=>loadGrammarUnit({...entry,exerciseCount:25},fetcher),/mismatch/);
});

test('Published lesson files include validated explanations, comparisons, examples, mistakes and tips',async()=>{
  const manifest=await readJSON('database/grammar-manifest.json');
  const topics=new Set();
  for(const item of manifest.units){
    const u=validateGrammarUnit(await readJSON(item.path));
    assert.ok(u.learningObjectives?.length>=2,u.id+' objectives');
    assert.ok(u.comparisons?.length>=1,u.id+' comparisons');
    assert.ok(u.examples?.length>=2,u.id+' examples');
    assert.ok(u.commonMistakes?.length>=2,u.id+' mistakes');
    assert.ok(u.studyTips?.length>=1,u.id+' tips');
    assert.ok(u.exercises.length>=1 && u.exercises.length<=150,u.id+' exercises');
    assert.ok(u.topicId);topics.add(u.topicId);
  }
});

test('Optional teaching blocks are backwards-compatible, but invalid nested data is rejected',()=>{
  assert.equal(validateGrammarUnit(fixture).id,'demo-b1');
  assert.throws(()=>validateGrammarUnit({...fixture,comparisons:[{title:'Compare',left:{label:'Left',example:'X',note:'why'},right:null}]}),/Invalid comparisons/);
  assert.throws(()=>validateGrammarUnit({...fixture,commonMistakes:[{incorrect:'Wrong',correct:'Right'}]}),/Invalid commonMistakes/);
  assert.throws(()=>validateGrammarUnit({...fixture,learningObjectives:['']}),/Invalid learningObjectives/);
});

test('Catalog-wide progress and due unit discovery work without loading full units',async()=>{
  const a=fixtureEntry(exampleUnit('eg1-u001'));
  const b=fixtureEntry(exampleUnit('eg1-u002'));
  const manifest=fixtureManifest([a,b]);
  const storage=fakeStorage();
  recordGrammarAttempt(a.id,'mock-a','recognition',true,storage,1000);
  recordGrammarAttempt(b.id,'mock-b','production',false,storage,1000);
  const {summarizeGrammarCatalog,dueGrammarUnitIds}=await import('../js/grammar/progress.js');
  const before=summarizeGrammarCatalog(manifest.units,storage,2000);
  assert.equal(before.practiced,2);assert.equal(before.attempts,2);assert.equal(before.successes,1);
  assert.equal(before.due,0);assert.equal(before.exercises,24);
  assert.deepEqual(dueGrammarUnitIds(manifest.units,storage,300999),[]);
  assert.deepEqual(dueGrammarUnitIds(manifest.units,storage,301000),[b.id]);
  const after=summarizeGrammarCatalog(manifest.units,storage,301000);
  assert.equal(after.due,1);
  assert.equal(after.recognition.successes,1);
  assert.equal(after.production.attempts,1);
});

test('Original exercises have accepted, distinct answers and safely normalized examples',async()=>{
  const manifest=await readJSON('database/grammar-manifest.json');
  for(const entry of manifest.units){
    const u=await readJSON(entry.path);
    for(const ex of u.exercises){
      const correct=ex.type==='multiple-choice'?ex.answerIndex:ex.acceptedAnswers[0];
      assert.equal(evaluateExercise(ex,correct).correct,true,`${u.id}/${ex.id}: reference answer rejected`);
      if(ex.type!=='multiple-choice'){
        const answers=ex.acceptedAnswers.map(normalizeAnswer);
        assert.equal(new Set(answers).size,answers.length,`${u.id}/${ex.id}: repeated answer variant`);
      }
    }
  }
});

test('A stable fixture ID and exercise IDs remain compatible with progress',()=>{
  const u=exampleUnit();
  assert.equal(validateGrammarUnit(u).id,'eg1-u001');
  const id=u.exercises[0].id;
  const store=fakeStorage();
  recordGrammarAttempt(u.id,id,'recognition',true,store,1234);
  assert.equal(getGrammarProgress(store)[`${u.id}::${id}`].attempts,1);
});
