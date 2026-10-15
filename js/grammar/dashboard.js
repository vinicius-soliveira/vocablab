/** Pure Grammar Lab dashboard analysis: no changes to saved progress or history. */
import {HISTORY_SKILLS, selectGrammarHistory, summarizeGrammarHistory} from './history.js';

const DAY = 86400000;
export const DASHBOARD_PERIODS = Object.freeze([7,30,90,0]);

function normalizePeriod(days) {
  if (!DASHBOARD_PERIODS.includes(days)) throw new Error('Invalid dashboard period.');
  return days;
}

function makeBuckets(attempts, days, now) {
  // Fixed-width date ranges, local labels provided by the view. Missing answers are null, not 0%.
  const count=days===7?7:days===30?6:days===90?13:12;
  const earliest=attempts.length?Math.min(...attempts.map(a=>a.time)):now;
  const start=days===0?Math.min(earliest,now-DAY):now-days*DAY;
  const width=Math.max(1,(now-start)/count);
  const buckets=Array.from({length:count},(_,i)=>({start:start+width*i,
    end:i===count-1?now:start+width*(i+1),attempts:0,successes:0,accuracy:null}));
  for (const a of attempts){
    if (a.time>now || a.time<start) continue; // never silently count future dated records
    const idx=Math.min(count-1,Math.floor((a.time-start)/width));
    const b=buckets[idx];b.attempts++;b.successes+=Number(a.correct);
  }
  for(const b of buckets)if(b.attempts)b.accuracy=b.successes/b.attempts;
  return buckets;
}

export function buildGrammarDashboard(history,catalog,catalogProgress,{days=30}={},now=Date.now()) {
  normalizePeriod(days);
  const records=Array.isArray(history)?history:history?.attempts;
  if (!Array.isArray(records)) throw new Error('Invalid dashboard history.');
  const filtered=selectGrammarHistory(records,{days},now).filter(a=>a.time<=now);
  const stats=summarizeGrammarHistory(filtered);
  const trend=makeBuckets(filtered,days,now);
  const titles=new Map(catalog.map(u=>[u.id,u]));
  const topics=catalog.map(u=>({
    id:u.id,title:u.title,level:u.level,attempts:0,successes:0,
    distinct:new Set(),due:((catalogProgress.byUnit||{})[u.id]?.due||0)+
      ((catalogProgress.byUnit||{})[u.id]?.speaking?.due||0)+
      ((catalogProgress.byUnit||{})[u.id]?.listening?.due||0)
  }));
  const topicMap=new Map(topics.map(t=>[t.id,t]));
  const seenBySkill=Object.fromEntries(HISTORY_SKILLS.map(skill=>[skill,new Set()]));
  for(const a of filtered){
    const topic=topicMap.get(a.unitId);if(topic){topic.attempts++;topic.successes+=Number(a.correct);topic.distinct.add(a.exerciseId);}
    if(seenBySkill[a.skill])seenBySkill[a.skill].add(`${a.unitId}::${a.exerciseId}`);
  }
  for(const t of topics){t.exercises=t.distinct.size;delete t.distinct;t.accuracy=t.attempts?t.successes/t.attempts:null;}
  const skillStats=HISTORY_SKILLS.map(skill=>({...stats.bySkill[skill],skill,
    exercises:seenBySkill[skill].size,
    accuracy:stats.bySkill[skill].attempts?stats.bySkill[skill].successes/stats.bySkill[skill].attempts:null}));
  // A topic is not classified as weak on fewer than three responses.
  const focus=[...topics].filter(t=>t.due>0 || (t.attempts>=3 && t.accuracy<0.7))
    .sort((a,b)=>b.due-a.due || (a.accuracy??1)-(b.accuracy??1) || b.attempts-a.attempts).slice(0,5);
  const visited=topics.filter(x=>x.attempts>0).length;
  const totalAvailable=(catalogProgress.exercises||0)+(catalogProgress.speaking?.total||0)+(catalogProgress.listening?.total||0);
  const totalPracticed=(catalogProgress.practiced||0)+(catalogProgress.speaking?.practiced||0)+(catalogProgress.listening?.practiced||0);
  const dueCount=(catalogProgress.due||0)+(catalogProgress.speaking?.due||0)+(catalogProgress.listening?.due||0);
  return {period:days,now,stats,trend,skillStats,topics,focus,visited,lessonCount:titles.size,
    totalAvailable,totalPracticed,dueCount,
    delayedAccuracy:stats.delayedAttempts?stats.delayedSuccesses/stats.delayedAttempts:null};
}
