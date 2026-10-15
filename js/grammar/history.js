/** Bounded, privacy-conscious history of completed Grammar Lab attempts.
 * No user answers, ASR transcripts, or microphone audio are stored.
 * Legacy progress cannot be reconstructed as dated history.
 */
export const GRAMMAR_HISTORY_KEY = 'vocablab.grammar.history.v1';
export const GRAMMAR_HISTORY_FORMAT = 'vocablab-grammar-history';
export const MAX_HISTORY_ATTEMPTS = 8000;
export const HISTORY_SKILLS = Object.freeze(['recognition','production','speaking','listening']);
const ID = /^[a-zA-Z0-9_-]{1,120}$/;
const MODES = new Set(['practice','review']);
const SOURCES = new Set(['lesson','global']);
const MAX_DURATION_MS = 3600000;
const DAY = 86400000;

export function validateGrammarHistory(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      value.format !== GRAMMAR_HISTORY_FORMAT || value.version !== 1 ||
      !Array.isArray(value.attempts) || value.attempts.length > MAX_HISTORY_ATTEMPTS)
    throw new Error('Invalid grammar history format.');
  const attempts=value.attempts.map((item,i)=>{
    if (!item || typeof item !== 'object' || Array.isArray(item) ||
        !ID.test(item.unitId) || !ID.test(item.exerciseId) || !ID.test(item.sessionId) ||
        !HISTORY_SKILLS.includes(item.skill) || !MODES.has(item.mode) || !SOURCES.has(item.source) ||
        !Number.isSafeInteger(item.time) || item.time < 0 ||
        !Number.isSafeInteger(item.durationMs) || item.durationMs < 0 || item.durationMs > MAX_DURATION_MS ||
        typeof item.correct !== 'boolean' || typeof item.firstAttempt !== 'boolean' ||
        typeof item.delayed !== 'boolean') throw new Error(`Invalid grammar history attempt ${i}.`);
    // Whitelist every field: never persist arbitrary responses or transcripts.
    return Object.fromEntries(['time','unitId','exerciseId','skill','correct','sessionId',
      'mode','source','durationMs','firstAttempt','delayed'].map(key=>[key,item[key]]));
  });
  return {format:GRAMMAR_HISTORY_FORMAT,version:1,attempts};
}
export const emptyGrammarHistory=()=>({format:GRAMMAR_HISTORY_FORMAT,version:1,attempts:[]});
export function getGrammarHistory(storage=localStorage) {
  const raw=storage.getItem(GRAMMAR_HISTORY_KEY);
  return raw===null?emptyGrammarHistory():validateGrammarHistory(JSON.parse(raw));
}
export function appendGrammarHistory(attempt,storage=localStorage) {
  const history=getGrammarHistory(storage);
  const validated=validateGrammarHistory({...history,attempts:[attempt]}).attempts[0];
  history.attempts.push(validated);
  if(history.attempts.length>MAX_HISTORY_ATTEMPTS)
    history.attempts.splice(0,history.attempts.length-MAX_HISTORY_ATTEMPTS);
  storage.setItem(GRAMMAR_HISTORY_KEY,JSON.stringify(history));
  return validated;
}
/** Filters dated attempts; progress created before this feature never appears here. */
export function selectGrammarHistory(history,{days=30,skill='all'}={},now=Date.now()) {
  const attempts=Array.isArray(history)?history:history.attempts;
  if (!(days===0 || (Number.isInteger(days)&&days>0))) throw new Error('Invalid history period.');
  if(skill!=='all'&&!HISTORY_SKILLS.includes(skill))throw new Error('Invalid history skill.');
  const cutoff=days?now-days*DAY:-Infinity;
  return attempts.filter(a=>a.time>=cutoff && (skill==='all'||a.skill===skill));
}
export function summarizeGrammarHistory(attempts) {
  const bySkill=Object.fromEntries(HISTORY_SKILLS.map(skill=>[skill,{attempts:0,successes:0,durationMs:0}]));
  const distinct=new Set();const sessions=new Set();
  let successes=0,delayedAttempts=0,delayedSuccesses=0,firstAttempts=0,durationMs=0;
  for(const a of attempts){
    successes+=Number(a.correct);durationMs+=a.durationMs;
    sessions.add(a.sessionId);distinct.add(`${a.unitId}::${a.exerciseId}`);
    bySkill[a.skill].attempts++;bySkill[a.skill].successes+=Number(a.correct);bySkill[a.skill].durationMs+=a.durationMs;
    if(a.delayed){delayedAttempts++;delayedSuccesses+=Number(a.correct);}
    if(a.firstAttempt)firstAttempts++;
  }
  return {attempts:attempts.length,successes,exercises:distinct.size,sessions:sessions.size,
    firstAttempts,delayedAttempts,delayedSuccesses,durationMs,bySkill};
}
/** Sessions are inferred from completed attempts. Sessions with no answers are not counted. */
export function groupGrammarSessions(attempts) {
  const sessions=new Map();
  for(const a of attempts){
    if(!sessions.has(a.sessionId))sessions.set(a.sessionId,{sessionId:a.sessionId,
      first:a.time,last:a.time,mode:a.mode,source:a.source,attempts:0,successes:0,durationMs:0,units:new Set()});
    const s=sessions.get(a.sessionId);
    s.first=Math.min(s.first,a.time);s.last=Math.max(s.last,a.time);
    s.attempts++;s.successes+=Number(a.correct);s.durationMs+=a.durationMs;s.units.add(a.unitId);
  }
  return [...sessions.values()].map(s=>({...s,units:[...s.units]})).sort((a,b)=>b.last-a.last);
}
