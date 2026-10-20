import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {evaluateListeningAnswer} from '../js/grammar/listening.js';
import {validateGrammarUnit,validateGrammarManifest} from '../js/grammar/schema.js';
import {exampleUnit,fixtureEntry,fixtureManifest} from './fixtures/grammar-fixture.mjs';
import {recordGrammarAttempt,dueListeningExercises,summarizeListeningUnit,dueGrammarUnitIds,
 summarizeGrammarCatalog,getGrammarProgress,exportGrammarProgress,importGrammarProgress,GRAMMAR_PROGRESS_KEY} from '../js/grammar/progress.js';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=async path=>JSON.parse(await readFile(join(root,path),'utf8'));
const storage=()=>{const m=new Map();return {getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k)};};
const choice={type:'multiple-choice',choices:['Past Simple','Present Perfect','Future'],answerIndex:1,feedback:'Present perfect.'};
const gap={type:'gap-fill',acceptedAnswers:['have not finished',"haven't finished"],feedback:'Present perfect.'};
test('Listening choice evaluates the selected option, not a substring or spoken transcription',()=>{
 assert.equal(evaluateListeningAnswer(choice,1).correct,true);
 assert.equal(evaluateListeningAnswer(choice,0).correct,false);
 assert.equal(evaluateListeningAnswer(choice,'1').correct,false);
 assert.equal(evaluateListeningAnswer(choice,2).expected,'Present Perfect');
});
test('Listening transcription accepts case, punctuation and common contractions only',()=>{
 for(const answer of ['Have NOT finished!','haven’t finished',"haven't finished"])
  assert.equal(evaluateListeningAnswer(gap,answer).correct,true,answer);
 for(const answer of ['not finished','finished','have not',''])
  assert.equal(evaluateListeningAnswer(gap,answer).correct,false,answer);
});

test('Listening corpus has eight well-formed exercises per lesson with unique IDs', async () => {
  const manifest = validateGrammarManifest(
    await read('database/grammar-manifest.json')
  );

  assert.ok(Array.isArray(manifest));

  const expectedListeningIds = Array.from(
    { length: 8 },
    (_, i) => `li-${String(i + 1).padStart(2, '0')}`
  );

  for (const item of manifest) {
    const unit = validateGrammarUnit(await read(item.path));

    // Validate exercise counts
    assert.equal(unit.exercises.length, 12, unit.id);
    assert.equal(unit.speakingExercises.length, 8, unit.id);
    assert.equal(unit.listeningExercises.length, 8, unit.id);

    // Manifest must match actual unit content
    assert.equal(
      item.listeningCount,
      unit.listeningExercises.length,
      unit.id
    );

    // Ensure all expected Listening IDs exist in order
    assert.deepEqual(
      unit.listeningExercises.map(e => e.id),
      expectedListeningIds,
      unit.id
    );

    // Ensure uniqueness across all exercise types
    const ids = [
      ...unit.exercises,
      ...unit.speakingExercises,
      ...unit.listeningExercises
    ].map(e => e.id);

    assert.equal(new Set(ids).size, ids.length, unit.id);

    // Validate Listening types and answers
    assert.ok(
      unit.listeningExercises.every(
        e => ['multiple-choice', 'gap-fill'].includes(e.type)
      ),
      unit.id
    );

    for (const e of unit.listeningExercises) {
      assert.ok(
        e.audioText.length > 10 &&
        e.prompt.length > 15 &&
        e.feedback.length > 10,
        `${unit.id}: ${e.id}`
      );

      if (e.type === 'multiple-choice') {
        assert.equal(
          evaluateListeningAnswer(e, e.answerIndex).correct,
          true,
          `${unit.id}: ${e.id}`
        );
      } else {
        for (const answer of e.acceptedAnswers) {
          assert.equal(
            evaluateListeningAnswer(e, answer).correct,
            true,
            `${unit.id}: ${e.id}`
          );
        }
      }
    }
  }
});
test('Old units without listeningExercises stay valid and malformed content is rejected',async()=>{
 const unit=exampleUnit();
 const {listeningExercises,...oldUnit}=unit;
 assert.equal(validateGrammarUnit(oldUnit).id,unit.id);
 assert.throws(()=>validateGrammarUnit({...unit,listeningExercises:[{...unit.listeningExercises[0],id:unit.speakingExercises[0].id}]}),/Duplicate/);
 assert.throws(()=>validateGrammarUnit({...unit,listeningExercises:[{...unit.listeningExercises[0],audioText:''}]}),/Invalid/);
 assert.throws(()=>validateGrammarUnit({...unit,listeningExercises:[{...unit.listeningExercises[0],type:'other'}]}),/Invalid/);
 assert.throws(()=>validateGrammarUnit({...unit,listeningExercises:[{...unit.listeningExercises[0],answerIndex:6}]}),/Invalid/);
});
test('Catalog rejects mismatched listeningCount',async()=>{
 const cat=fixtureManifest();
 assert.throws(()=>validateGrammarManifest({...cat,units:[{...cat.units[0],listeningCount:-2}]}),/Invalid/);
 const noCount={...cat.units[0]};delete noCount.listeningCount;
 assert.equal(validateGrammarManifest({...cat,units:[noCount]}).length,1);
});
test('Listening review scheduling stays distinct from spoken and written queues',async()=>{
 const unit=exampleUnit();
 const db=storage();db.setItem('vocablab.progress.v1','{"keep":true}');
 const got=recordGrammarAttempt(unit.id,'li-01','listening',false,db,1000);
 assert.equal(got.due,301000);
 assert.deepEqual(dueListeningExercises(unit,db,300999),[]);
 assert.deepEqual(dueListeningExercises(unit,db,301000).map(e=>e.id),['li-01']);
 assert.equal(summarizeListeningUnit(unit,db,301000).attempts,1);
 assert.equal(summarizeListeningUnit(unit,db,301000).due,1);
 assert.equal(db.getItem('vocablab.progress.v1'),'{"keep":true}');
 const manifest=fixtureManifest([fixtureEntry()]).units;
 assert.deepEqual(dueGrammarUnitIds(manifest,db,301000),[]);
 const stats=summarizeGrammarCatalog(manifest,db,301000);
 assert.equal(stats.listening.practiced,1);
 assert.equal(stats.listening.due,1);
 assert.equal(stats.speaking.practiced,0);
 assert.equal(stats.practiced,0);
 assert.equal(stats.due,0);
});
test('Listening answers advance review while failures return to five-minute retry',()=>{
 const db=storage();
 const r=recordGrammarAttempt('demo','li-01','listening',true,db,1000);
 assert.equal(r.due,86401000);
 assert.equal(r.intervalDays,1);
 const fail=recordGrammarAttempt('demo','li-01','listening',false,db,10000);
 assert.equal(fail.intervalDays,0);
 assert.equal(fail.due,310000);
 assert.equal(fail.attempts,2);
});
test('Existing grammar progress imports without listening, new listening is preserved in backup',()=>{
 const db=storage();recordGrammarAttempt('demo','sp-01','speaking',true,db,1234);
 const old=exportGrammarProgress(db),store=storage();
 assert.equal(importGrammarProgress(old,store),1);
 recordGrammarAttempt('demo','li-01','listening',true,store,2000);
 const restored=storage();
 assert.equal(importGrammarProgress(exportGrammarProgress(store),restored),2);
 assert.equal(getGrammarProgress(restored)['demo::li-01'].skill,'listening');
 assert.deepEqual(getGrammarProgress(restored),getGrammarProgress(store));
});
test('TTS and listening UI source code do not require a commercial speech service',async()=>{
 const code=await readFile(join(root,'js/grammar/main.js'),'utf8');
 assert.match(code,/playText\(entry\.exercise\.audioText,null,\{forceTTS:true\}\)/);
 assert.match(code,/play-teaching/);
 assert.match(code,/Listening practice/);
 assert.match(code,/data-action="play-written-answer"/);
});
