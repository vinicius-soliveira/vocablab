import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,join,dirname} from 'node:path';
import {recordGrammarAttempt, getGrammarProgress,exportGrammarProgress,importGrammarProgress,
 GRAMMAR_PROGRESS_KEY} from '../js/grammar/progress.js';
import {GRAMMAR_HISTORY_KEY,GRAMMAR_HISTORY_FORMAT,MAX_HISTORY_ATTEMPTS,
 getGrammarHistory,appendGrammarHistory,validateGrammarHistory,
 selectGrammarHistory,summarizeGrammarHistory,groupGrammarSessions} from '../js/grammar/history.js';
const makeStorage=()=>{const map=new Map();return {
 getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,String(v)),removeItem:k=>map.delete(k)};};
const DAY=86400000;
const context=(sessionId='g1',mode='practice',source='lesson',durationMs=5000)=>({sessionId,mode,source,durationMs});
const attempt=(time,extra={})=>({time,unitId:'unit-1',exerciseId:'q1',skill:'production',correct:true,
 sessionId:'g1',mode:'practice',source:'lesson',durationMs:5000,firstAttempt:true,delayed:false,...extra});

test('history only records new attempts when session context is supplied; legacy progress remains unchanged',()=>{
 const storage=makeStorage();storage.setItem('vocablab.progress.v1','{"existing":true}');
 recordGrammarAttempt('unit-1','q1','production',false,storage,1000);
 assert.deepEqual(getGrammarHistory(storage).attempts,[]);
 recordGrammarAttempt('unit-1','q1','production',true,storage,2000,context());
 const [x]=getGrammarHistory(storage).attempts;
 assert.equal(x.time,2000);assert.equal(x.firstAttempt,false);
 assert.equal(x.delayed,false);assert.equal(x.correct,true);assert.equal(x.durationMs,5000);
 assert.equal(getGrammarProgress(storage)['unit-1::q1'].attempts,2);
 assert.equal(storage.getItem('vocablab.progress.v1'),'{"existing":true}');
});
test('first-attempt and delayed status are derived from existing progress rather than guessed',()=>{
 const db=makeStorage();
 recordGrammarAttempt('unit-1','q1','recognition',true,db,1000,context());
 recordGrammarAttempt('unit-1','q1','recognition',false,db,2000,context('g2','review'));
 recordGrammarAttempt('unit-1','q1','recognition',true,db,DAY+3000,context('g3','review'));
 assert.deepEqual(getGrammarHistory(db).attempts.map(a=>[a.firstAttempt,a.delayed,a.mode]),[
  [true,false,'practice'],[false,false,'review'],[false,true,'review']]);
});
test('speaking/listening/recognition/writing events have independent metadata and store no raw answers',()=>{
 const db=makeStorage();const skills=['speaking','listening','production','recognition'];
 for(let i=0;i<skills.length;i++){
  recordGrammarAttempt('unit-1','q'+(i+1),skills[i],i%2===0,db,10000+i,context('g1'));
 }
 const attempts=getGrammarHistory(db).attempts;
 assert.deepEqual(attempts.map(a=>a.skill),skills);
 assert.equal(summarizeGrammarHistory(attempts).attempts,4);
 assert.equal(summarizeGrammarHistory(attempts).successes,2);
 assert.equal(summarizeGrammarHistory(attempts).bySkill.speaking.durationMs,5000);
 assert.equal(JSON.stringify(attempts).includes('transcript'),false);
 assert.equal(JSON.stringify(attempts).includes('answer'),false);
 const safe=appendGrammarHistory({...attempt(12000),transcript:'sensitive',answer:'secret'},db);
 assert.equal('transcript' in safe,false);assert.equal('answer' in safe,false);
 assert.equal(JSON.stringify(getGrammarHistory(db)).includes('secret'),false);
});
test('filters aggregate only dated attempts from selected period and skill',()=>{
 const now=50*DAY;
 const items=[attempt(now-2*DAY),attempt(now-10*DAY,{skill:'listening',correct:false,sessionId:'g2'}),
  attempt(now-40*DAY,{skill:'speaking',sessionId:'g3'})];
 assert.equal(selectGrammarHistory(items,{days:7},now).length,1);
 assert.equal(selectGrammarHistory(items,{days:30},now).length,2);
 assert.equal(selectGrammarHistory(items,{days:0},now).length,3);
 assert.equal(selectGrammarHistory(items,{days:30,skill:'listening'},now).length,1);
 const summary=summarizeGrammarHistory(items);
 assert.equal(summary.attempts,3);assert.equal(summary.sessions,3);assert.equal(summary.exercises,1);
 assert.equal(summary.bySkill.speaking.attempts,1);
 assert.throws(()=>selectGrammarHistory(items,{skill:'fake'},now),/skill/);
});
test('sessions group practice and global review, without counting empty sessions',()=>{
 const items=[attempt(1100),attempt(1200,{exerciseId:'q2',correct:false}),
  attempt(1300,{sessionId:'g2',mode:'review',source:'global',durationMs:2000})];
 const sessions=groupGrammarSessions(items);
 assert.equal(sessions.length,2);assert.equal(sessions[0].mode,'review');
 assert.equal(sessions[1].attempts,2);assert.equal(sessions[1].durationMs,10000);
 assert.equal(sessions[1].successes,1);
});
test('backup round-trip includes history and old v1 backups import safely',()=>{
 const db=makeStorage();recordGrammarAttempt('unit-1','q1','production',false,db,2000,context());
 const backup=exportGrammarProgress(db);
 assert.equal(backup.format,'vocablab-grammar-progress-backup');assert.equal(backup.version,1);
 assert.equal(backup.history.format,GRAMMAR_HISTORY_FORMAT);
 const db2=makeStorage();assert.equal(importGrammarProgress(backup,db2),1);
 assert.deepEqual(getGrammarHistory(db2),getGrammarHistory(db));
 assert.deepEqual(getGrammarProgress(db2),getGrammarProgress(db));
 const legacy={...backup};delete legacy.history;
 assert.equal(importGrammarProgress(legacy,db2),1);
 assert.equal(db2.getItem(GRAMMAR_HISTORY_KEY),null);
 assert.deepEqual(getGrammarProgress(db2),getGrammarProgress(db));
});
test('invalid history in a backup is rejected before either progress or history is changed',()=>{
 const db=makeStorage();recordGrammarAttempt('unit-1','q1','production',true,db,1000,context());
 const beforeProgress=db.getItem(GRAMMAR_PROGRESS_KEY),beforeHistory=db.getItem(GRAMMAR_HISTORY_KEY);
 const backup=exportGrammarProgress(db);
 backup.history.attempts[0].durationMs=-3;
 assert.throws(()=>importGrammarProgress(backup,db),/Invalid grammar history/);
 assert.equal(db.getItem(GRAMMAR_PROGRESS_KEY),beforeProgress);
 assert.equal(db.getItem(GRAMMAR_HISTORY_KEY),beforeHistory);
 assert.throws(()=>validateGrammarHistory({...getGrammarHistory(db),attempts:[attempt(10,{skill:'invalid'})]}));
});
test('history has a bounded local-storage footprint, with oldest events discarded',()=>{
 const db=makeStorage();const initial=getGrammarHistory(db);
 initial.attempts=Array.from({length:MAX_HISTORY_ATTEMPTS},(_,i)=>attempt(i,{sessionId:'g1'}));
 db.setItem(GRAMMAR_HISTORY_KEY,JSON.stringify(initial));
 appendGrammarHistory(attempt(100000),db);
 const all=getGrammarHistory(db).attempts;
 assert.equal(all.length,MAX_HISTORY_ATTEMPTS);
 assert.equal(all[0].time,1);assert.equal(all.at(-1).time,100000);
 assert.throws(()=>validateGrammarHistory({...initial,attempts:[...initial.attempts,attempt(110000)]}),/format/);
});
test('progress remains recorded if history localStorage is unavailable',()=>{
 const db=makeStorage();const warn=console.warn;console.warn=()=>{};
 const oldSet=db.setItem;
 db.setItem=(key,val)=>{if(key===GRAMMAR_HISTORY_KEY)throw new Error('quota');oldSet(key,val);};
 try{recordGrammarAttempt('unit-1','q1','production',true,db,1000,context());}
 finally{console.warn=warn;}
 assert.equal(getGrammarProgress(db)['unit-1::q1'].attempts,1);
});
test('UI has a history page and tracks all three session modes and four grammar skills',async()=>{
 const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
 const source=await readFile(join(root,'js/grammar/main.js'),'utf8');
 const html=await readFile(join(root,'grammar.html'),'utf8');
 assert.match(source,/renderHistory\(/);assert.match(source,/getGrammarHistory\(\)/);
 assert.match(source,/recordGrammarAttempt\(entry\.unit\.id,entry\.exercise\.id,'speaking'/);
 assert.match(source,/recordGrammarAttempt\(entry\.unit\.id,entry\.exercise\.id,'listening'/);
 assert.match(source,/beginTrackedSession\('review','global'\)/);
 assert.match(html,/data-nav="history"/);
});
