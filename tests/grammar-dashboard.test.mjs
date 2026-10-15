import test from 'node:test';
import assert from 'node:assert/strict';
import {buildGrammarDashboard,DASHBOARD_PERIODS} from '../js/grammar/dashboard.js';
import {renderGrammarDashboard} from '../js/grammar/dashboard-view.js';
import {emptyGrammarHistory, GRAMMAR_HISTORY_KEY} from '../js/grammar/history.js';

const DAY=86400000;
const now=Date.UTC(2026,9,15,12);
const catalog=[
  {id:'grammar-b1-present-perfect',title:'Present Perfect',level:'B1'},
  {id:'grammar-b2-conditionals',title:'Conditionals',level:'B2'},
  {id:'grammar-b2-passive',title:'Passive',level:'B2'},
];
const progress={exercises:36,practiced:9,due:2,speaking:{total:9,practiced:2,due:1},listening:{total:9,practiced:1,due:0},
  byUnit:{'grammar-b1-present-perfect':{due:2,speaking:{due:1},listening:{due:0}},
    'grammar-b2-conditionals':{due:0,speaking:{due:0},listening:{due:0}},
    'grammar-b2-passive':{due:0,speaking:{due:0},listening:{due:0}}}};
const sample=(time,unitId,skill,correct,exerciseId='e1',overrides={})=>({time,unitId,skill,correct,exerciseId,sessionId:'session1',mode:'practice',source:'lesson',durationMs:16000,firstAttempt:false,delayed:false,...overrides});
const present='grammar-b1-present-perfect',conditionals='grammar-b2-conditionals';
const attempts=[
 sample(now-DAY,present,'production',false,'e1',{firstAttempt:true}),
 sample(now-DAY+1000,present,'speaking',true,'sp1',{firstAttempt:true}),
 sample(now-DAY+2000,present,'listening',false,'li1',{firstAttempt:true}),
 sample(now-2*DAY,conditionals,'recognition',false,'e1',{firstAttempt:true}),
 sample(now-3*DAY,conditionals,'production',true,'e2',{delayed:true,mode:'review',sessionId:'session2'}),
 sample(now-40*DAY,conditionals,'recognition',true,'e3',{sessionId:'session3'}),
 sample(now+DAY,present,'production',true,'future',{sessionId:'future'})
];
const fakeStorage=records=>({getItem:k=>k===GRAMMAR_HISTORY_KEY?JSON.stringify({format:'vocablab-grammar-history',version:1,attempts:records}):null});

test('dashboard shows empty state with cumulative coverage and due reviews',()=>{
 const x=buildGrammarDashboard(emptyGrammarHistory(),catalog,progress,{days:30},now);
 assert.equal(x.stats.attempts,0);
 assert.equal(x.stats.sessions,0);
 assert.equal(x.totalAvailable,54);
 assert.equal(x.totalPracticed,12);
 assert.equal(x.dueCount,3);
 assert.equal(x.skillStats.every(s=>s.accuracy===null),true);
 assert.equal(x.trend.every(b=>b.accuracy===null),true);
 assert.equal(x.focus[0].id,present);
});
test('dashboard calculates skills, unique exercises, sessions and delayed review accuracy',()=>{
 const m=buildGrammarDashboard({attempts},catalog,progress,{days:7},now);
 assert.equal(m.stats.attempts,5);
 assert.equal(m.stats.successes,2);
 assert.equal(m.stats.exercises,5);
 assert.equal(m.stats.sessions,2);
 assert.equal(m.stats.delayedAttempts,1);
 assert.equal(m.delayedAccuracy,1);
 assert.equal(m.visited,2);
 assert.equal(m.skillStats.find(x=>x.skill==='production').attempts,2);
 assert.equal(m.skillStats.find(x=>x.skill==='speaking').accuracy,1);
 assert.equal(m.topics.find(x=>x.id===present).attempts,3);
 assert.equal(m.focus[0].id,present);
 assert.equal(m.trend.reduce((n,x)=>n+x.attempts,0),5);
});
test('trend never misrepresents missing days as 0% accuracy',()=>{
 const m=buildGrammarDashboard(attempts,catalog,progress,{days:7},now);
 assert.equal(m.trend.length,7);
 assert.ok(m.trend.some(x=>x.accuracy===null && x.attempts===0));
 assert.ok(m.trend.some(x=>x.accuracy===0));
 assert.ok(m.trend.some(x=>x.accuracy===1));
});
test('7, 30, 90 and all-time ranges are distinct and do not count future attempts',()=>{
 assert.deepEqual(DASHBOARD_PERIODS,[7,30,90,0]);
 assert.equal(buildGrammarDashboard(attempts,catalog,progress,{days:7},now).stats.attempts,5);
 assert.equal(buildGrammarDashboard(attempts,catalog,progress,{days:30},now).stats.attempts,5);
 assert.equal(buildGrammarDashboard(attempts,catalog,progress,{days:90},now).stats.attempts,6);
 assert.equal(buildGrammarDashboard(attempts,catalog,progress,{days:0},now).stats.attempts,6);
});
test('topics require >=3 attempts to be flagged for low accuracy, but due reviews always count',()=>{
 const p={...progress,due:0,speaking:{total:9,due:0},listening:{total:9,due:0},byUnit:Object.fromEntries(catalog.map(x=>[x.id,{due:0,speaking:{due:0},listening:{due:0}}]))};
 const one=buildGrammarDashboard([sample(now,present,'production',false)],catalog,p,{days:7},now);
 assert.equal(one.focus.length,0);
 const three=buildGrammarDashboard(Array.from({length:3},(_,i)=>sample(now-i*1000,present,'production',false,`e${i}`)),catalog,p,{days:7},now);
 assert.equal(three.focus.length,1);
 assert.equal(three.focus[0].id,present);
});
test('dashboard page includes charts, topic actions, 4 skill breakdowns and a no-data notice',()=>{
 const rendered=renderGrammarDashboard({catalog,progress,days:7,now,storage:fakeStorage(attempts)});
 assert.match(rendered.html,/Learning trend/);
 assert.match(rendered.html,/grammar-db-chart/);
 assert.match(rendered.html,/30 days/);
 assert.match(rendered.html,/Recognition/);
 assert.match(rendered.html,/Writing/);
 assert.match(rendered.html,/Speaking/);
 assert.match(rendered.html,/Listening/);
 assert.match(rendered.html,/data-action="open"/);
 assert.match(rendered.html,/Grammar Lab only/);
 const empty=renderGrammarDashboard({catalog,progress,days:7,now,storage:fakeStorage([])});
 assert.match(empty.html,/No recorded attempts/);
 assert.doesNotMatch(empty.html,/grammar-db-chart"/);
});
test('HTML escapes lesson titles; saved answer text is never rendered',()=>{
 const malformed=[{id:'u1',title:'<img src=x onerror=alert(1)>',level:'B2'}];
 const example=[sample(now,'u1','production',true,'e1')];
 const result=renderGrammarDashboard({catalog:malformed,progress:{...progress,byUnit:{}},days:7,now,storage:fakeStorage(example)});
 assert.ok(result.html.includes('&lt;img src=x onerror=alert(1)&gt;'));
 assert.ok(!result.html.includes('<img src=x'));
 assert.ok(!result.html.includes('speechTranscript'));
});
test('invalid ranges are rejected without modifying the input history',()=>{
 const src={attempts:structuredClone(attempts)};
 assert.throws(()=>buildGrammarDashboard(src,catalog,progress,{days:2},now),/Invalid dashboard period/);
 const before=JSON.stringify(src);
 buildGrammarDashboard(src,catalog,progress,{days:30},now);
 assert.equal(JSON.stringify(src),before);
});
