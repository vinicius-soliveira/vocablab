import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtemp,mkdir,writeFile,readFile,copyFile,rm} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const {
  PRONUNCIATION_STORAGE_KEY,getPracticeStats,recordPractice,recordRecognition,recordSentenceRecognition,
  isPracticeDue,practicePriority,summarizeUnitPractice,exportPracticeBackup,importPracticeBackup
}=await import('../js/pronunciation/progress.js');
function memory(){
  const db=new Map();return {
    getItem:k=>db.get(k)??null,setItem:(k,v)=>db.set(k,String(v)),removeItem:k=>db.delete(k)
  };
}

const {matchesSpokenTarget,matchesSentenceTarget,normalizeSpokenText}=await import('../js/pronunciation/matching.js');

test('transcript matching ignores case and punctuation but not different words',()=>{
  assert.equal(normalizeSpokenText(' THINK!  '),'think');
  assert.equal(matchesSpokenTarget('think',['sink','Think.']),true);
  assert.equal(matchesSpokenTarget('think',['sink','thin']),false);
  assert.equal(matchesSpokenTarget('go off',['go-off']),true);
  assert.equal(matchesSpokenTarget('I’ve worked',['I\'ve worked.']),true);
  assert.equal(matchesSpokenTarget('', ['hello']),false);
  assert.equal(matchesSpokenTarget('hello',null),false);
});
test('sentence checks use the complete example, not just the target word',()=>{
  const reference="'Good morning, Mr Evans. Is the office open?'";
  assert.equal(matchesSentenceTarget(reference,['Good morning Mr Evans is the office open']),true);
  assert.equal(matchesSentenceTarget(reference,['Good morning mister Evans, is the office open?']),true);
  assert.equal(matchesSentenceTarget(reference,['good morning']),false);
  assert.equal(matchesSentenceTarget(reference,['good morning Mr Evans is office open']),false);
  assert.equal(matchesSentenceTarget("I've worked here since 2021.",['I have worked here since 2021']),true);
  assert.equal(matchesSentenceTarget("Don't worry.",['Do not worry']),true);
  assert.equal(matchesSentenceTarget('', ['hello']),false);
});
test('word and sentence checks have independent results and review schedules',()=>{
  const storage=memory(),now=1_000_000;
  recordRecognition('u01','hello',true,storage,now);
  recordSentenceRecognition('u01','hello',false,storage,now);
  const r=getPracticeStats('u01','hello',storage);
  assert.deepEqual([r.recognitionAttempts,r.recognitionMatches,r.lastRecognition],[1,1,'recognized']);
  assert.deepEqual([r.sentenceRecognitionAttempts,r.sentenceRecognitionMatches,r.lastSentenceRecognition],[1,0,'mismatch']);
  assert.equal(isPracticeDue('u01','hello',storage,now+4*60_000),false);
  assert.equal(isPracticeDue('u01','hello',storage,now+5*60_000),true);
  assert.equal(practicePriority('u01','hello',storage,now+5*60_000),120);
  const summary=summarizeUnitPractice('u01',[{id:'hello'}],storage,now+5*60_000);
  assert.deepEqual([summary.recognitionMatches,summary.sentenceRecognitionAttempts,summary.sentenceRecognitionMatches,summary.due],[1,1,0,1]);
  recordSentenceRecognition('u01','hello',true,storage,now+5*60_000);
  assert.equal(isPracticeDue('u01','hello',storage,now+10*60_000),false);
  assert.equal(isPracticeDue('u01','hello',storage,now+5*60_000+86_400_000),true);
});
test('sentence assessment works even if the word has never been checked',()=>{
  const storage=memory(),now=1_000_000;
  recordSentenceRecognition('u01','hello',false,storage,now);
  assert.equal(getPracticeStats('u01','hello',storage).recognitionAttempts,undefined);
  assert.equal(isPracticeDue('u01','hello',storage,now+300_000),true);
});
test('sentence results survive a practice backup and invalid counts are rejected',()=>{
  const storage=memory(),restored=memory();
  recordSentenceRecognition('u01','hello',true,storage,1_000_000);
  importPracticeBackup(exportPracticeBackup(storage),restored);
  const saved=getPracticeStats('u01','hello',restored);
  assert.equal(saved.sentenceRecognitionMatches,1);
  assert.equal(saved.sentenceRecognitionAttempts,1);
  assert.equal(saved.lastSentenceRecognition,'recognized');
  const before=restored.getItem(PRONUNCIATION_STORAGE_KEY);
  assert.throws(()=>importPracticeBackup({format:'vocablab-pronunciation-practice-v1',version:1,records:{'u01::hello':{sentenceRecognitionAttempts:1,sentenceRecognitionMatches:2}}},restored),/Invalid recognition count/);
  assert.equal(before,restored.getItem(PRONUNCIATION_STORAGE_KEY));
});
test('recording counts only practice; no automatic recognized result or review schedule',()=>{
  const storage=memory();
  recordPractice('u01','think',storage,1000);
  const row=getPracticeStats('u01','think',storage);
  assert.equal(row.recordings,1);
  assert.equal(row.recognitionAttempts,undefined);
  assert.equal(row.due,undefined);
  assert.ok(!storage.getItem('vocablab.progress.v1'));
});
test('word recognized / not recognized are counted separately and drive review',()=>{
  const storage=memory(),now=1_000_000;
  recordRecognition('u01','think',false,storage,now);
  let row=getPracticeStats('u01','think',storage);
  assert.deepEqual([row.recognitionAttempts,row.recognitionMatches,row.lastRecognition],[1,0,'mismatch']);
  assert.equal(isPracticeDue('u01','think',storage,now+4*60_000),false);
  assert.equal(isPracticeDue('u01','think',storage,now+5*60_000),true);
  recordRecognition('u01','think',true,storage,now+5*60_000);
  row=getPracticeStats('u01','think',storage);
  assert.deepEqual([row.recognitionAttempts,row.recognitionMatches,row.lastRecognition],[2,1,'recognized']);
  assert.equal(isPracticeDue('u01','think',storage,now+60*60_000),false);
  assert.equal(isPracticeDue('u01','think',storage,now+5*60_000+86_400_000),true);
});
test('repeated recognition grows review interval and mismatch resets it',()=>{
  const storage=memory(),day=86_400_000;
  recordRecognition('u01','word',true,storage,day);
  recordRecognition('u01','word',true,storage,2*day);
  recordRecognition('u01','word',true,storage,3*day);
  assert.ok(getPracticeStats('u01','word',storage).intervalDays>=2);
  recordRecognition('u01','word',false,storage,4*day);
  assert.equal(getPracticeStats('u01','word',storage).recognizedStreak,0);
  assert.equal(getPracticeStats('u01','word',storage).intervalDays,0);
});
test('unassessed words and previous self ratings do not count as due recognition reviews',()=>{
  const storage=memory(),now=1_000_000;
  storage.setItem(PRONUNCIATION_STORAGE_KEY,JSON.stringify({'u01::legacy':{lastRating:'retry',due:1}}));
  assert.equal(isPracticeDue('u01','legacy',storage,now),false);
  assert.equal(practicePriority('u01','legacy',storage,now),70);
  assert.equal(isPracticeDue('u01','new',storage,now),false);
});
test('unit summary includes only requested items',()=>{
  const storage=memory(),now=1_000_000;
  recordPractice('u01','x',storage,now);
  recordPractice('u01','other',storage,now);
  recordRecognition('u01','x',true,storage,now);
  const s=summarizeUnitPractice('u01',[{id:'x'}],storage,now);
  assert.deepEqual([s.recordings,s.recognitionAttempts,s.recognitionMatches,s.due],[1,1,1,0]);
});
test('backup preserves old data, round-trips and rejects invalid records atomically',()=>{
  const a=memory(),b=memory();
  recordPractice('u01','think',a,100);
  recordRecognition('u01','think',true,a,100);
  const backup=exportPracticeBackup(a);
  assert.equal(backup.format,'vocablab-pronunciation-practice-v1');
  assert.equal(importPracticeBackup(backup,b),1);
  assert.equal(getPracticeStats('u01','think',b).recognitionMatches,1);
  const saved=b.getItem(PRONUNCIATION_STORAGE_KEY);
  assert.throws(()=>importPracticeBackup({...backup,records:{'bad::key':{recordings:-5}}},b));
  assert.equal(b.getItem(PRONUNCIATION_STORAGE_KEY),saved);
  assert.equal(importPracticeBackup({format:backup.format,version:1,records:{'u01::old':{selfGood:2,lastRating:'good'}}},b),1);
});
test('no audio or transcript strings persisted in assessment records',()=>{
  const storage=memory();
  recordPractice('u01','x',storage);recordRecognition('u01','x',false,storage);
  const data=JSON.stringify(exportPracticeBackup(storage));
  assert.ok(!data.includes('audioBlob'));
  assert.ok(!data.includes('transcript'));
});
test('new interface has direct word feedback and no mandatory self-rating', async()=>{
  const ui=await readFile(join(root,'js/pronunciation/main.js'),'utf8');
  const page=await readFile(join(root,'pronunciation.html'),'utf8');
  assert.match(ui,/Check word/);
  assert.match(ui,/Check sentence/);
  assert.match(ui,/Sentence recognized/);
  assert.match(ui,/Sentence not recognized/);
  assert.match(ui,/Word recognized/);
  assert.match(ui,/Word not recognized/);
  assert.doesNotMatch(ui,/data-rate-attempt|How was your pronunciation\?/);
  assert.doesNotMatch(ui,/This does not measure phonetic accuracy/i);
  assert.doesNotMatch(page,/This does not measure phonetic accuracy/i);
});

test('installer changes only source entry points and creates backups; safe to rerun',async()=>{
  const tmp=await mkdtemp(join(tmpdir(),'pronunciation-patch-'));
  try{
    for(const folder of ['js','js/pronunciation','css','scripts'])await mkdir(join(tmp,folder),{recursive:true});
    for(const f of ['pronunciation.html','css/pronunciation.css','js/pronunciation/main.js','js/pronunciation/progress.js','js/pronunciation/player.js','scripts/apply-pronunciation-lab-2.mjs']){
      await copyFile(join(root,f),join(tmp,f));
    }
    const main=`function dashboard(){const xs = items(), due = dueItems(activeUnitId, xs), avg = xs.length ? xs.reduce((a, x) => a + mastery(activeUnitId, x.id), 0) / xs.length : 0;
      const label='<span class="label">Overall mastery</span><p class="hint">Skills with scheduled reviews.</p>';}
      function setup(){for(const [id,dest] of [['dashPron','pronounce']])
        getElement('#' + id).onclick = () => navigate(dest);}
      function finish(){    record(activeUnitId, x.id, skill, ok, verified);}
      function review(){        session = dueItems(activeUnitId, items()).filter((task) => task.skill !== 'listening' || canDictate(task.item));}
      `;
    const index='<html><head></head><body><button data-view="pronounce">◌ <span>Pronunciation lab</span></button></body></html>';
    await writeFile(join(tmp,'js/main.js'),main);
    await writeFile(join(tmp,'index.html'),index);
    const cli=join(tmp,'scripts/apply-pronunciation-lab-2.mjs');
    execFileSync('node',[cli]);
    const newMain=await readFile(join(tmp,'js/main.js'),'utf8');
    const newIndex=await readFile(join(tmp,'index.html'),'utf8');
    assert.match(newIndex,/href="pronunciation.html"/);
    assert.match(newMain,/skill !== 'pronunciation'/);
    assert.match(newMain,/window.location.assign\('pronunciation.html'\)/);
    execFileSync('node',[cli]);
    assert.equal(await readFile(join(tmp,'js/main.js'),'utf8'),newMain);
    assert.equal(await readFile(join(tmp,'index.html'),'utf8'),newIndex);
    assert.equal(await readFile(join(tmp,'js/main.js.before-pronunciation-2.bak'),'utf8'),main);
  }finally{await rm(tmp,{force:true,recursive:true});}
});

// A deterministic browser mock verifies sequential playback and cancellation without a real microphone.
const audioStore=memory();
globalThis.localStorage=audioStore;
const played=[];
let lastPlayer=null;
let mp3Failure=false;
let finishAutomatically=true;
globalThis.window={speechSynthesis:{
  getVoices:()=>[{lang:'en-GB',voiceURI:'en-GB',name:'English'}],
  cancel:()=>played.push('stop-tts'),
  speak:utterance=>{played.push('tts:'+utterance.text+':'+utterance.rate);queueMicrotask(()=>utterance.onend?.());}
}};
globalThis.speechSynthesis=window.speechSynthesis;
globalThis.SpeechSynthesisUtterance=class{constructor(text){this.text=text;}};
globalThis.Audio=class {
  constructor(url){this.url=url;this.currentTime=0;this.volume=1;this.playbackRate=1;lastPlayer=this;}
  play(){
    played.push('audio:'+this.url+':'+this.playbackRate);
    if(mp3Failure&&this.url.startsWith('assets/'))return Promise.reject(new Error('missing MP3'));
    if(finishAutomatically)queueMicrotask(()=>this.onended?.());
    return Promise.resolve();
  }
  pause(){played.push('pause:'+this.url);}
};
const {createPronunciationPlayer}=await import('../js/pronunciation/player.js');
test('compare waits for reference TTS to finish before playing saved recording',async()=>{
  const p=createPronunciationPlayer();
  played.length=0;
  const done=await p.compare('think',null,'blob:recording',.75);
  assert.equal(done,true);
  assert.deepEqual(played.filter(x=>x.startsWith('tts:')||x.startsWith('audio:')),
    ['tts:think:0.75','audio:blob:recording:0.75']);
  p.stop();
});
test('missing MP3 falls back to TTS in Auto mode',async()=>{
  const p=createPronunciationPlayer();
  mp3Failure=true;
  played.length=0;
  assert.equal(await p.playReference('think','assets/audio/demo/think.mp3',1),true);
  assert.ok(played.includes('tts:think:1'));
  mp3Failure=false;
  p.stop();
});
test('stop cancels pending audio without continuing comparison',async()=>{
  const p=createPronunciationPlayer();
  finishAutomatically=false;
  played.length=0;
  const promise=p.compare('think','assets/audio/demo/think.mp3','blob:recording',1);
  await Promise.resolve();
  p.stop();
  assert.equal(await promise,false);
  assert.ok(!played.some(x=>x.startsWith('audio:blob:recording')));
  finishAutomatically=true;
});
