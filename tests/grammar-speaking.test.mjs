import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {evaluateSpokenAnswer,normalizeSpokenAnswer} from '../js/grammar/speaking.js';
import {validateGrammarUnit,validateGrammarManifest} from '../js/grammar/schema.js';
import {exampleUnit,fixtureEntry,fixtureManifest} from './fixtures/grammar-fixture.mjs';
import {recordGrammarAttempt,getGrammarProgress,dueSpeakingExercises,summarizeSpeakingUnit,
  summarizeGrammarCatalog,dueGrammarUnitIds,exportGrammarProgress,importGrammarProgress,GRAMMAR_PROGRESS_KEY}
  from '../js/grammar/progress.js';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=async path=>JSON.parse(await readFile(join(root,path),'utf8'));
function fakeStorage(){const m=new Map();return {getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k)};}
const exercise={id:'sp-01',prompt:'Say that you have worked here.',acceptedAnswers:["I've worked here.",'I have worked here.'],feedback:'Present perfect.'};
test('Speech transcripts normalize punctuation, curly quotes, whitespace, and contractions',()=>{
  assert.equal(normalizeSpokenAnswer('  I’ve   worked here! '),'i have worked here');
  assert.equal(normalizeSpokenAnswer("I HAVEN'T seen it."),'i have not seen it');
  assert.equal(normalizeSpokenAnswer('We do not work here.'),'we do not work here');
  assert.equal(normalizeSpokenAnswer("We don't work here."),'we do not work here');
});
test('Speaking accepts an explicit complete model answer, including alternate ASR transcripts',()=>{
  assert.equal(evaluateSpokenAnswer(exercise,["Ive worked here","I've worked here!"]).correct,true);
  assert.equal(evaluateSpokenAnswer(exercise,'I have worked here.').correct,true);
  assert.equal(evaluateSpokenAnswer(exercise,'I worked here.').correct,false);
  assert.equal(evaluateSpokenAnswer(exercise,'').correct,false);
  assert.equal(evaluateSpokenAnswer(exercise,'I have worked').correct,false);
});

test('Speaking corpus supplies eight valid, answerable prompts per published unit', async () => {
  const manifest = validateGrammarManifest(
    await read('database/grammar-manifest.json')
  );

  assert.ok(Array.isArray(manifest));

  const expectedSpeakingIds = Array.from(
    { length: 8 },
    (_, i) => `sp-${String(i + 1).padStart(2, '0')}`
  );

  let total = 0;

  for (const entry of manifest) {
    const unit = validateGrammarUnit(await read(entry.path));

    // Validate exercise counts
    assert.equal(unit.exercises.length, 12, unit.id);
    assert.equal(unit.speakingExercises.length, 8, unit.id);
    assert.equal(unit.listeningExercises.length, 8, unit.id);

    // Manifest must reflect the actual corpus
    assert.equal(entry.speakingCount, 8, entry.id);
    assert.equal(
      entry.speakingCount,
      unit.speakingExercises.length,
      entry.id
    );

    // Verify Speaking IDs and their order
    assert.deepEqual(
      unit.speakingExercises.map(e => e.id),
      expectedSpeakingIds,
      unit.id
    );

    // Check ID uniqueness across all three skills
    const ids = [
      ...unit.exercises,
      ...unit.speakingExercises,
      ...unit.listeningExercises
    ].map(e => e.id);

    assert.equal(
      ids.length,
      new Set(ids).size,
      unit.id
    );

    // Validate each Speaking exercise
    for (const e of unit.speakingExercises) {
      assert.ok(
        e.prompt.length > 10 &&
        e.feedback.length > 10,
        `${unit.id}: ${e.id}`
      );

      assert.ok(
        Array.isArray(e.acceptedAnswers) &&
        e.acceptedAnswers.length > 0,
        `${unit.id}: ${e.id}`
      );

      // Every accepted answer must be recognized
      for (const answer of e.acceptedAnswers) {
        assert.ok(
          evaluateSpokenAnswer(e, answer).correct,
          `${entry.id} ${e.id}: ${answer}`
        );
      }
    }

    total += unit.speakingExercises.length;
  }

  // Verify the aggregate against the manifest
  assert.equal(
    total,
    manifest.reduce(
      (n, entry) => n + entry.speakingCount,
      0
    )
  );

  // Current corpus: eight Speaking exercises per unit
  assert.equal(total, manifest.length * 8);
});

test('Schema rejects malformed speaking prompts and duplicate IDs, old units stay valid',async()=>{
  const unit=exampleUnit();
  const {speakingExercises,...oldUnit}=unit;
  assert.equal(validateGrammarUnit(oldUnit).id,unit.id);
  assert.throws(()=>validateGrammarUnit({...unit,speakingExercises:[{...unit.speakingExercises[0],id:unit.exercises[0].id}]}),/Duplicate/);
  assert.throws(()=>validateGrammarUnit({...unit,speakingExercises:[{...unit.speakingExercises[0],acceptedAnswers:[]}]}),/Invalid speaking/);
});
test('Speaking attempts and due dates remain separate from written grammar and vocabulary',async()=>{
  const storage=fakeStorage();const unit=exampleUnit();
  storage.setItem('vocablab.progress.v1','{"keep":true}');
  const result=recordGrammarAttempt(unit.id,'sp-01','speaking',false,storage,1000);
  assert.equal(result.due,301000);
  assert.equal(dueSpeakingExercises(unit,storage,300999).length,0);
  assert.deepEqual(dueSpeakingExercises(unit,storage,301000).map(e=>e.id),['sp-01']);
  assert.equal(summarizeSpeakingUnit(unit,storage,301000).attempts,1);
  assert.equal(summarizeSpeakingUnit(unit,storage,301000).successes,0);
  assert.equal(storage.getItem('vocablab.progress.v1'),' {"keep":true}'.trim());
});
test('Catalog distinguishes speaking totals and written review queues',async()=>{
  const manifest=fixtureManifest([fixtureEntry()]).units;
  const storage=fakeStorage();
  recordGrammarAttempt(manifest[0].id,'sp-01','speaking',false,storage,0);
  recordGrammarAttempt(manifest[0].id,'written-01','production',false,storage,0);
  const stats=summarizeGrammarCatalog(manifest,storage,300000);
  assert.equal(stats.exercises,12);
  assert.equal(stats.practiced,1);
  assert.equal(stats.speaking.total,3);
  assert.equal(stats.speaking.practiced,1);
  assert.equal(stats.speaking.due,1);
  assert.equal(stats.due,1);
  assert.deepEqual(dueGrammarUnitIds(manifest,storage,300000),[manifest[0].id]);
  const storage2=fakeStorage();recordGrammarAttempt(manifest[0].id,'sp-01','speaking',false,storage2,0);
  assert.deepEqual(dueGrammarUnitIds(manifest,storage2,300000),[]);
});
test('Existing grammar backups import and new speaking records survive export/import',()=>{
  const old=fakeStorage();
  recordGrammarAttempt('demo','q1','production',true,old,0);
  const backup=exportGrammarProgress(old);
  const dest=fakeStorage();
  assert.equal(importGrammarProgress(backup,dest),1);
  recordGrammarAttempt('demo','sp-01','speaking',true,dest,1000);
  const joined=exportGrammarProgress(dest);
  const restored=fakeStorage();
  assert.equal(importGrammarProgress(joined,restored),2);
  assert.equal(getGrammarProgress(restored)['demo::sp-01'].skill,'speaking');
  assert.deepEqual(getGrammarProgress(restored),getGrammarProgress(dest));
  assert.ok(restored.getItem(GRAMMAR_PROGRESS_KEY));
});
