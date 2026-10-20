/** Local Grammar Lab: source-independent lessons, deterministic correction, and separate progress. */
import {loadGrammarCatalog, loadGrammarUnit} from './catalog.js';
import {GRAMMAR_COLLECTIONS,grammarCollection,selectGrammarCollection} from './collections.js';
import {evaluateExercise, exerciseSkill} from './engine.js';
import {evaluateSpokenAnswer, normalizeSpokenAnswer} from './speaking.js';
import {evaluateListeningAnswer} from './listening.js';
import {renderGrammarDashboard} from './dashboard-view.js';
import {getGrammarHistory, selectGrammarHistory, summarizeGrammarHistory, groupGrammarSessions,
  GRAMMAR_HISTORY_KEY, HISTORY_SKILLS, MAX_HISTORY_ATTEMPTS} from './history.js';
import {recognize, browserSupportsRecognition, playText, stopAudio, getAudioSettings, configureAudio} from '../audio.js';
import {GRAMMAR_ACTIVE_KEY, GRAMMAR_PROGRESS_KEY, grammarKey, getGrammarProgress,
  recordGrammarAttempt, dueExercises, dueSpeakingExercises, dueListeningExercises,
  summarizeSpeakingUnit, summarizeListeningUnit,
  summarizeGrammarUnit, summarizeGrammarCatalog,
  dueGrammarUnitIds, exportGrammarProgress, importGrammarProgress} from './progress.js';

const $ = selector => document.querySelector(selector);
const app = $('#app');
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c =>
  ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const state = {catalog:[], collectionId:'all', cache:new Map(), current:null, page:'library', session:[], position:0,
  result:null, answer:null, speechError:'', loading:false, historyDays:30, historySkill:'all', dashboardDays:30,
  sessionId:'',sessionMode:'practice',sessionSource:'lesson',questionStartedAt:0};
const percent = (correct,attempts) => attempts ? `${Math.round(correct/attempts*100)}%` : '—';
const skillLabel = skill => ({recognition:'Recognition',production:'Writing',speaking:'Speaking',listening:'Listening'}[skill] || skill);
const formatTime = ts => new Date(ts).toLocaleString();
const formatDuration = ms => `${Math.round(ms/1000)} s`;
const makeSessionId = () => `g${Date.now()}_${Math.random().toString(36).slice(2,10)}`;
function beginTrackedSession(mode,source){
  state.sessionId=makeSessionId();state.sessionMode=mode;state.sessionSource=source;
  state.questionStartedAt=Date.now();
}
function attemptContext(){return {sessionId:state.sessionId, mode:state.sessionMode,source:state.sessionSource,
  durationMs:Date.now()-state.questionStartedAt};}
const notice = message => `<section class="panel"><p>${escapeHtml(message)}</p><div class="buttonrow"><button class="ghost" data-action="library">Browse lessons</button></div></section>`;

function header(title,subtitle,description,badge='GRAMMAR') {
  $('#title').textContent=title;$('#subtitle').textContent=subtitle;
  $('#description').textContent=description;$('#unitChip').textContent=badge;
  document.querySelectorAll('[data-nav]').forEach(button => {
    const current = button.dataset.nav === (state.page==='session'?'lesson':state.page);
    button.classList.toggle('selected',current);
    if (current) button.setAttribute('aria-current','page'); else button.removeAttribute('aria-current');
  });
}
const audioButton = (area,index,side='') => `<button type="button" class="ghost grammar-audio-button" data-action="play-teaching" data-area="${area}" data-index="${index}" ${side?`data-side="${side}"`:''} aria-label="Listen to the example">▶ Listen</button>`;
const speedControl = () => {
  const rate=getAudioSettings().rate;
  const choices=[0.75,0.85,1,1.25];
  if(!choices.some(value=>Math.abs(value-rate)<0.01))choices.push(rate);
  choices.sort((a,b)=>a-b);
  return `<label class="grammar-audio-speed">Voice speed <select id="grammarAudioSpeed" aria-label="Audio playback speed">
    ${choices.map(n=>`<option value="${n}" ${Math.abs(rate-n)<0.01?'selected':''}>${n}×</option>`).join('')}
    </select></label>`;
};
function teachingAudioText(unit,area,index,side) {
  if (area==='explanation') return unit.explanation[index]?.example || '';
  if (area==='comparison' && ['left','right'].includes(side)) return unit.comparisons?.[index]?.[side]?.example || '';
  if (area==='examples') return unit.examples?.[index]?.sentence || '';
  if (area==='mistakes') return unit.commonMistakes?.[index]?.correct || '';
  return '';
}
/** Some teaching notes display multiple sentences or quoted transformations. */
function speakableText(value) {
  return String(value).replace(/\s+\/\s+/g,'. ').replace(/[“”]/g,'').replace(/\s*→\s*/g,'. ').replace(/\s+/g,' ').trim();
}
function renderLibrary() {
  const catalog=selectGrammarCollection(state.catalog,state.collectionId);
  const all=summarizeGrammarCatalog(catalog);
  const selected=grammarCollection(state.collectionId);
  header(selected?.title||'Grammar Library','GRAMMAR · THREE COLLECTIONS',
    selected?`Grammar practice · ${selected.level}`:'Choose a collection or browse every available grammar lesson.',
    `${catalog.length} LESSONS`);
  const collectionCards=GRAMMAR_COLLECTIONS.map(collection=>{
    const count=state.catalog.filter(entry=>entry.collectionId===collection.id).length;
    const current=state.collectionId===collection.id;
    return `<button type="button" class="grammar-collection-card ${current?'selected':''}" data-action="select-collection" data-collection="${collection.id}" aria-pressed="${current}">
      <span class="grammar-collection-head"><strong>${escapeHtml(collection.title)}</strong><span class="chip">${escapeHtml(collection.level)}</span></span>
      <span class="hint">Grammar practice · ${escapeHtml(collection.level)}</span>
      <span class="grammar-collection-foot">${count} ${count===1?'lesson':'lessons'} available <span aria-hidden="true">→</span></span>
    </button>`;
  }).join('');
  const cards=catalog.map(entry=>{
    const stats=all.byUnit[entry.id];
    const search=`${entry.title} ${entry.level} ${entry.topicId} ${entry.number}`.toLowerCase();
    return `<article class="small-card grammar-card" data-search="${escapeHtml(search)}" data-level="${escapeHtml(entry.level)}">
      <div class="grammar-topic"><span class="chip">Unit ${String(entry.number).padStart(3,'0')}</span><span class="chip">${escapeHtml(entry.level)}</span><span class="hint">${escapeHtml(entry.topicId.replaceAll('-',' '))}</span></div>
      <h3>${escapeHtml(entry.title)}</h3><p class="hint">${stats.practiced}/${stats.total} written · ${stats.due} due</p>
      <p class="hint">Speaking: ${stats.speaking.practiced}/${stats.speaking.total} practised · ${stats.speaking.due} due</p>
      <p class="hint">Listening: ${stats.listening.practiced}/${stats.listening.total} practised · ${stats.listening.due} due</p>
      <div class="buttonrow"><button class="primary" data-action="open" data-id="${escapeHtml(entry.id)}">Open lesson</button></div></article>`;
  }).join('');
  const scope=selected?selected.title:'All collections';
  const empty=catalog.length===0?`<div class="grammar-library-empty"><strong>No lessons available in ${escapeHtml(scope)} yet.</strong><p class="hint">Add your unit JSON files to database/English_Grammar_${escapeHtml((selected?.id||'english-grammar-1').at(-1))}/, then rebuild the grammar catalog.</p></div>`:'';
  app.innerHTML=`<div class="stack"><section class="panel">
    <div class="between"><div><h2>Grammar collections</h2><p class="hint">Choose the book you want to study. Your progress remains separate from Vocabulary Lab.</p></div>
    <button class="ghost" data-action="select-collection" data-collection="all" ${state.collectionId==='all'?'disabled':''}>All collections</button></div>
    <div class="grammar-collections-grid">${collectionCards}</div></section>
    <section class="panel"><div class="between"><div><h2>${escapeHtml(scope)} · Lessons</h2><p class="hint">Original explanations, writing, speaking and listening practice.</p></div>
    <span class="chip">${all.practiced}/${all.exercises} practised</span></div>
    ${catalog.length?`<div class="grammar-filters"><label>Search<input id="grammarSearch" type="search" placeholder="e.g. articles, conditionals" autocomplete="off"></label>
    <label>CEFR level<select id="grammarLevel"><option value="all">All levels</option>${['A1','A2','B1','B2','C1','C2'].map(x=>`<option value="${x}">${x}</option>`).join('')}</select></label></div>
    <p id="grammarNoResults" class="hint" hidden>No matching lessons.</p>
    <div class="grid" id="grammarCards">${cards}</div>`:empty}</section>
    <section class="panel"><div class="between"><div><h2>${escapeHtml(scope)} · Adaptive review</h2><p class="hint">Review due exercises from this selection only.</p></div>
    <span class="chip">${all.due} written due</span></div>
    <div class="buttonrow"><button class="primary" data-action="review-collection-written" ${all.due?'':'disabled'}>Review written (${all.due})</button>
    <button class="ghost" data-action="review-collection-speaking" ${all.speaking.due?'':'disabled'}>Review speaking (${all.speaking.due})</button>
    <button class="ghost" data-action="review-collection-listening" ${all.listening.due?'':'disabled'}>Review listening (${all.listening.due})</button>
    <button class="ghost" data-action="progress">View overall progress</button></div></section></div>`;
}
function renderTeaching(unit) {
  const objectives=unit.learningObjectives?.length ? `<section class="panel grammar-lesson-block"><h2>Learning objectives</h2><ul class="grammar-bullets">${unit.learningObjectives.map(x=>`<li>${escapeHtml(x)}</li>`).join('')}</ul></section>` : '';
  const explanations=`<section class="panel grammar-lesson-block"><h2>Grammar explained</h2>
    ${unit.explanation.map((section,i)=>`<article class="grammar-section"><span class="grammar-number">${i+1}</span><div><h3>${escapeHtml(section.heading)}</h3><p>${escapeHtml(section.body)}</p>
    ${section.example?`<div class="grammar-example">${escapeHtml(section.example)} ${audioButton('explanation',i)}</div>`:''}</div></article>`).join('')}</section>`;
  const comparisons=unit.comparisons?.length?`<section class="panel grammar-lesson-block"><h2>Compare the structures</h2><p class="hint">Notice how the form changes meaning or usage.</p>
    ${unit.comparisons.map(c=>`<div class="grammar-comparison"><h3>${escapeHtml(c.title)}</h3><div class="grammar-compare-grid">
      ${['left','right'].map(side=>`<div class="grammar-compare-side"><span class="label">${escapeHtml(c[side].label)}</span><strong>${escapeHtml(c[side].example)}</strong>${audioButton('comparison',unit.comparisons.indexOf(c),side)}<p class="hint">${escapeHtml(c[side].note)}</p></div>`).join('')}</div></div>`).join('')}</section>`:'';
  const examples=unit.examples?.length?`<section class="panel grammar-lesson-block"><h2>Examples in context</h2><div class="grammar-example-list">
    ${unit.examples.map((x,i)=>`<div class="grammar-example-item"><strong>${escapeHtml(x.sentence)}</strong> ${audioButton('examples',i)}<p class="hint">${escapeHtml(x.note)}</p></div>`).join('')}</div></section>`:'';
  const mistakes=unit.commonMistakes?.length?`<section class="panel grammar-lesson-block"><h2>Common mistakes</h2><p class="hint">Compare the incorrect sentence with a natural correction.</p>
    <div class="grammar-mistakes">${unit.commonMistakes.map((x,i)=>`<div class="grammar-mistake"><div><span class="grammar-error-label">Incorrect</span><p>${escapeHtml(x.incorrect)}</p></div>
    <div><span class="grammar-correct-label">Correct</span><p>${escapeHtml(x.correct)}</p>${audioButton('mistakes',i)}</div><p class="hint">${escapeHtml(x.why)}</p></div>`).join('')}</div></section>`:'';
  const tips=unit.studyTips?.length?`<section class="panel grammar-lesson-block"><h2>Study tips</h2><ul class="grammar-bullets">${unit.studyTips.map(t=>`<li>${escapeHtml(t)}</li>`).join('')}</ul></section>`:'';
  return objectives+explanations+comparisons+examples+mistakes+tips;
}
function renderLesson() {
  const u=state.current;
  if(!u){header('Grammar Lab','GRAMMAR · LESSON','Choose a lesson to get started.');app.innerHTML=notice('Select a grammar lesson to get started.');return;}
  const s=summarizeGrammarUnit(u),due=dueExercises(u),spoken=summarizeSpeakingUnit(u),speakingDue=dueSpeakingExercises(u),
    heard=summarizeListeningUnit(u),listeningDue=dueListeningExercises(u);
  header(u.title,`GRAMMAR · ${u.level}`,u.summary,`${u.exercises.length} EXERCISES`);
  app.innerHTML=`<div class="stack"><section class="panel"><div class="between"><div><span class="chip">${escapeHtml(u.level)}</span><h2 style="margin-top:12px">Study, practise, review</h2>
    <p class="hint">Read the rules, comparisons and mistakes. Then test yourself.</p></div><span class="grammar-note">${s.practiced}/${s.total} attempted · ${percent(s.successes,s.attempts)} accuracy</span></div>
    <div class="buttonrow"><button class="primary" data-action="start">Practice writing (${u.exercises.length})</button><button class="ghost" data-action="review" ${due.length?'':'disabled'}>Review written (${due.length})</button><button class="ghost" data-action="library">All lessons</button></div></section>
    <section class="panel grammar-speaking-panel"><div class="between"><div><span class="chip">SPEAKING</span><h2 style="margin-top:10px">Speak the grammar</h2><p class="hint">Say a complete sentence using the target structure. The browser compares the recognized words with accepted model answers.</p></div>
    <span class="grammar-note">${spoken.practiced}/${spoken.total} practised · ${percent(spoken.successes,spoken.attempts)} matched</span></div>
    <div class="buttonrow"><button class="primary" data-action="start-speaking" ${(u.speakingExercises?.length)?'':'disabled'}>Speaking practice (${u.speakingExercises?.length || 0})</button>
    <button class="ghost" data-action="review-speaking" ${speakingDue.length?'':'disabled'}>Review speaking (${speakingDue.length})</button></div></section>
    <section class="panel grammar-listening-panel"><div class="between"><div><span class="chip">LISTENING</span><h2 style="margin-top:10px">Hear the grammar</h2>
    <p class="hint">Listen first, then identify the structure or type what you heard. The sentence stays hidden until you submit.</p></div>
    <span class="grammar-note">${heard.practiced}/${heard.total} practised · ${percent(heard.successes,heard.attempts)} correct</span></div>
    <div class="buttonrow"><button class="primary" data-action="start-listening" ${u.listeningExercises?.length?'':'disabled'}>Listening practice (${u.listeningExercises?.length||0})</button>
    <button class="ghost" data-action="review-listening" ${listeningDue.length?'':'disabled'}>Review listening (${listeningDue.length})</button></div></section>
    <section class="panel grammar-audio-tools"><div class="between"><div><h2>Listen to the examples</h2><p class="hint">Use the play buttons throughout the explanations, comparisons, and corrected examples.</p></div>${speedControl()}</div>
    <p id="grammarAudioStatus" class="hint" role="status"></p></section>
    ${renderTeaching(u)}
    <section class="panel"><h2>Ready to practise?</h2><p class="hint">Multiple choice checks recognition; gap-fill and error-correction check production. Feedback explains the rule after each answer.</p>
    <div class="buttonrow"><button class="primary" data-action="start">Start exercises →</button><button class="ghost" data-action="progress">View progress</button></div></section></div>`;
}
const currentEntry=()=>state.session[state.position];
function renderSession() {
  const entry=currentEntry();
  if(!entry){state.page='progress';render();return;}
  const {unit:u, exercise:e}=entry, finished=state.result!==null;
  header('Grammar practice',`${u.level} · ${u.title}`,'Choose or write an answer, then read the explanation.',`${state.position+1}/${state.session.length}`);
  const choices=e.type==='multiple-choice' ? `<div class="grammar-options">${e.choices.map((choice,i)=>
    `<label class="grammar-choice"><input type="radio" name="answer" value="${i}" ${finished?'disabled':''} ${state.answer===i?'checked':''} required><span>${escapeHtml(choice)}</span></label>`).join('')}</div>`
    :`<label for="grammarTextAnswer">${e.type==='gap-fill'?'Fill in the blank':'Rewrite the entire sentence correctly'}
    <input class="field grammar-answer" id="grammarTextAnswer" name="answer" type="text" autocomplete="off" spellcheck="false" maxlength="300"
    placeholder="Type your answer" value="${finished?escapeHtml(state.answer):''}" ${finished?'disabled':''} required></label>`;
  const feedback=finished?`<div class="grammar-feedback ${state.result.correct?'success':'warning'}" role="status"><strong>${state.result.correct?'Correct!':'Not quite.'}</strong>
    ${state.result.correct?'':`<p style="color:inherit">Example accepted answer: <strong>${escapeHtml(state.result.expected)}</strong></p>`}
    <p style="color:inherit">${escapeHtml(state.result.feedback)}</p>
    <button type="button" class="ghost grammar-audio-button" data-action="play-written-answer">▶ Hear accepted answer</button></div>`:'';
  app.innerHTML=`<section class="panel"><div class="grammar-toolbar"><div><span class="chip">${escapeHtml(e.type.replaceAll('-',' '))}</span> <span class="grammar-note">${escapeHtml(u.title)}</span></div>
    <span class="grammar-note">Question ${state.position+1} of ${state.session.length}</span></div>
    <div class="meter"><i style="width:${Math.round((state.position+1)/state.session.length*100)}%"></i></div>
    <div class="grammar-question">${escapeHtml(e.prompt)}</div><form id="grammarAnswerForm">${choices}
    ${finished?'':'<div class="buttonrow"><button class="primary" type="submit">Check answer</button></div>'}</form>
    ${feedback}<div class="buttonrow"><button class="ghost" data-action="lesson">${state.current?'Back to lesson':'Browse lessons'}</button>
    ${finished?`<button class="primary" data-action="next">${state.position===state.session.length-1?'See progress':'Next question →'}</button>`:''}</div></section>`;
  if(!finished&&e.type!=='multiple-choice')$('#grammarTextAnswer')?.focus();
}
/** Spoken production uses its own session; written exercises are unchanged. */
function renderSpeaking() {
  const entry=currentEntry();
  if(!entry){state.page='progress';render();return;}
  const {unit:u,exercise:e}=entry;
  const finished=state.result!==null;
  header('Grammar speaking',`${u.level} · ${u.title}`,
    'Speak a complete sentence. Recognized text is checked against the listed model answers.',
    `${state.position+1}/${state.session.length}`);
  const result=finished?`<div class="grammar-feedback ${state.result.correct?'success':'warning'}" role="status">
    <strong>${state.result.correct?'Model answer recognized':'Different answer recognized'}</strong>
    <p style="color:inherit">Transcript: <strong>${escapeHtml(state.result.transcript)}</strong></p>
    ${state.result.correct?'':`<p style="color:inherit">Model answer: <strong>${escapeHtml(state.result.expected)}</strong></p>`}
    <p style="color:inherit">${escapeHtml(state.result.feedback)}</p>
    ${state.result.correct?'':'<p style="color:inherit">Other valid sentences may exist; this exercise checks its listed answers.</p>'}
    </div>`:'';
  app.innerHTML=`<section class="panel"><div class="grammar-toolbar"><div><span class="chip">SPEAKING · ${escapeHtml(u.level)}</span> <span class="grammar-note">${escapeHtml(u.title)}</span></div>
    <span class="grammar-note">Prompt ${state.position+1} of ${state.session.length}</span></div>
    <div class="meter"><i style="width:${Math.round((state.position+1)/state.session.length*100)}%"></i></div>
    <div class="grammar-question">${escapeHtml(e.prompt)}</div>
    <p class="hint">Say the full English sentence. Speak naturally; contractions such as “I've” and “I have” are treated alike.</p>
    <div class="buttonrow">
    <button class="primary" data-action="speak" ${(!browserSupportsRecognition())?'disabled':''}>🎙 ${finished?'Try speaking again':'Speak & check'}</button>
    <button class="ghost" data-action="speak-model">▶ Hear model answer</button></div>
    <p class="grammar-speech-status" id="grammarSpeechStatus" role="status">${escapeHtml(state.speechError || (!browserSupportsRecognition()?'Speech recognition is unavailable in this browser. Try Chrome or Edge.':'Ready when you are.'))}</p>
    ${result}
    <div class="buttonrow grammar-actions"><button class="ghost" data-action="lesson">Back to lesson</button>
    ${finished?`<button class="primary" data-action="next-speaking">${state.position===state.session.length-1?'See progress':'Next prompt →'}</button>`:''}
    </div></section>`;
}
/** Listening uses browser TTS and explicit grammar-focused answers. */
function renderListening() {
  const entry=currentEntry();
  if(!entry){state.page='progress';render();return;}
  const {unit:u,exercise:e}=entry, finished=state.result!==null;
  header('Grammar listening',`${u.level} · ${u.title}`,'Listen carefully and identify the structure you hear.',`${state.position+1}/${state.session.length}`);
  const controls=e.type==='multiple-choice' ? `<div class="grammar-options">${e.choices.map((choice,i)=>
    `<label class="grammar-choice"><input type="radio" name="answer" value="${i}" ${finished?'disabled':''} ${state.answer===i?'checked':''} required><span>${escapeHtml(choice)}</span></label>`).join('')}</div>`
    : `<label for="grammarListeningAnswer">Type the missing expression
       <input class="field grammar-answer" id="grammarListeningAnswer" name="answer" type="text" autocomplete="off" spellcheck="false" maxlength="300"
       placeholder="Type what you heard" value="${finished?escapeHtml(state.answer):''}" ${finished?'disabled':''} required></label>`;
  const feedback=finished?`<div class="grammar-feedback ${state.result.correct?'success':'warning'}" role="status">
    <strong>${state.result.correct?'Correct!':'Not quite.'}</strong>
    <p style="color:inherit">Audio: <strong>${escapeHtml(e.audioText)}</strong></p>
    ${state.result.correct?'':`<p style="color:inherit">Expected answer: <strong>${escapeHtml(state.result.expected)}</strong></p>`}
    <p style="color:inherit">${escapeHtml(state.result.feedback)}</p></div>`:'';
  app.innerHTML=`<section class="panel"><div class="grammar-toolbar"><div><span class="chip">LISTENING · ${escapeHtml(u.level)}</span><span class="grammar-note">${escapeHtml(u.title)}</span></div>
    <span class="grammar-note">Audio ${state.position+1} of ${state.session.length}</span></div>
    <div class="meter"><i style="width:${Math.round((state.position+1)/state.session.length*100)}%"></i></div>
    <div class="grammar-listening-player"><p class="hint">Listen before answering. Replay the same sentence as often as you need.</p>
    <div class="buttonrow"><button type="button" class="primary" data-action="play-listening">▶ Play sentence</button>${speedControl()}</div>
    <p id="grammarAudioStatus" class="hint" role="status"></p></div>
    <div class="grammar-question">${escapeHtml(e.prompt)}</div>
    <form id="grammarListeningForm">${controls}${finished?'':'<div class="buttonrow"><button class="primary" type="submit">Check answer</button></div>'}</form>
    ${feedback}<div class="buttonrow"><button class="ghost" data-action="lesson">Back to lesson</button>
    ${finished?`<button class="primary" data-action="next-listening">${state.position===state.session.length-1?'See progress':'Next audio →'}</button>`:''}</div></section>`;
}
function renderDashboard(){
  try {
    const {model,html}=renderGrammarDashboard({catalog:state.catalog,
      progress:summarizeGrammarCatalog(state.catalog),days:state.dashboardDays});
    header('Learning dashboard','GRAMMAR · DASHBOARD',
      'Track recorded activity, accuracy and review opportunities.',`${model.stats.attempts} ANSWERS`);
    app.innerHTML=html;
  } catch(error) {
    header('Learning dashboard','GRAMMAR · DASHBOARD','History could not be displayed.');
    app.innerHTML=notice(`Unable to render dashboard: ${error.message}`);
  }
}
function renderHistory(){
  let all;
  try {all=getGrammarHistory().attempts;}
  catch(error){header('Learning history','GRAMMAR · HISTORY','Recorded attempts are unavailable.');
    app.innerHTML=notice(`Unable to read grammar history: ${error.message}`);return;}
  const filtered=selectGrammarHistory(all,{days:state.historyDays,skill:state.historySkill});
  const stats=summarizeGrammarHistory(filtered);
  const sessions=groupGrammarSessions(filtered).slice(0,25);
  const byUnit=new Map(state.catalog.map(u=>[u.id,u.title]));
  header('Learning history','GRAMMAR · ACTIVITY','Dated attempts recorded in this browser since Learning History was installed.',
    `${stats.attempts} ATTEMPTS`);
  const periodOptions=[[7,'Last 7 days'],[30,'Last 30 days'],[90,'Last 90 days'],[0,'All recorded history']];
  const skillOptions=[['all','All skills'],...HISTORY_SKILLS.map(sk=>[sk,skillLabel(sk)])];
  const periodSelect=`<label>Period<select id="grammarHistoryPeriod">${periodOptions.map(([value,name])=>
    `<option value="${value}" ${state.historyDays===value?'selected':''}>${name}</option>`).join('')}</select></label>`;
  const skillSelect=`<label>Skill<select id="grammarHistorySkill">${skillOptions.map(([value,name])=>
    `<option value="${value}" ${state.historySkill===value?'selected':''}>${name}</option>`).join('')}</select></label>`;
  const summary=[['Attempts',stats.attempts],['Accuracy',percent(stats.successes,stats.attempts)],
    ['Unique exercises',stats.exercises],['Sessions with answers',stats.sessions],
    ['Approx. answer time',`${Math.round(stats.durationMs/60000)} min`],
    ['First-ever attempts',stats.firstAttempts],
    ['Delayed attempts (24h+)',`${stats.delayedAttempts} · ${percent(stats.delayedSuccesses,stats.delayedAttempts)}`]];
  const skills=HISTORY_SKILLS.map(sk=>{
    const x=stats.bySkill[sk];return `<tr><td>${skillLabel(sk)}</td><td>${x.attempts}</td><td>${percent(x.successes,x.attempts)}</td><td>${Math.round(x.durationMs/60000)} min</td></tr>`;
  }).join('');
  const sessionRows=sessions.map(x=>`<tr><td>${escapeHtml(formatTime(x.last))}</td>
    <td>${escapeHtml(x.mode)} · ${escapeHtml(x.source)}</td><td>${x.attempts}</td>
    <td>${percent(x.successes,x.attempts)}</td><td>${escapeHtml(x.units.length===1?(byUnit.get(x.units[0])||x.units[0]):`${x.units.length} lessons`)}</td>
    <td>${formatDuration(x.durationMs)}</td></tr>`).join('');
  const latest=[...filtered].sort((a,b)=>b.time-a.time).slice(0,40);
  const attemptRows=latest.map(a=>`<tr><td>${escapeHtml(formatTime(a.time))}</td>
    <td>${escapeHtml(byUnit.get(a.unitId)||a.unitId)}</td><td>${escapeHtml(skillLabel(a.skill))}</td>
    <td>${escapeHtml(a.exerciseId)}</td><td>${a.correct?'Correct':'Incorrect'}</td>
    <td>${a.delayed?'Yes':'No'}</td><td>${formatDuration(a.durationMs)}</td></tr>`).join('');
  app.innerHTML=`<div class="stack"><section class="panel">
    <div class="between"><div><h2>Study activity</h2><p class="hint">Filter completed attempts. Previous cumulative progress has no timestamps and cannot appear here.</p></div>
    <span class="chip">${all.length}/${MAX_HISTORY_ATTEMPTS} retained</span></div>
    <div class="grammar-history-filters">${periodSelect}${skillSelect}</div>
    <div class="grammar-progress-grid">${summary.map(([label,value])=>`<div class="small-card"><span class="label">${label}</span><strong>${value}</strong></div>`).join('')}</div>
    <p class="hint grammar-history-note">Timed from question display to submission; pauses and replay time are included. A delayed attempt is a new response at least 24 hours after the previous one, not a verified mastery score.</p>
    <div class="buttonrow"><button class="ghost" data-action="dashboard">Learning dashboard</button><button class="ghost" data-action="progress">Back to grammar progress</button><button class="ghost" data-action="export">Export grammar backup (including history)</button></div>
  </section><section class="panel"><h2>By skill</h2><div class="table-wrap"><table><thead><tr><th>Skill</th><th>Attempts</th><th>Accuracy</th><th>Approx. time</th></tr></thead><tbody>${skills}</tbody></table></div></section>
  <section class="panel"><h2>Recent sessions</h2><p class="hint">Up to 25 sessions with at least one recorded answer.</p>
    ${sessionRows?`<div class="table-wrap"><table><thead><tr><th>Last activity</th><th>Type</th><th>Answers</th><th>Accuracy</th><th>Lesson</th><th>Question time</th></tr></thead><tbody>${sessionRows}</tbody></table></div>`:'<p class="hint">No completed exercises in this period.</p>'}</section>
  <section class="panel"><h2>Recent attempts</h2><p class="hint">Most recent 40 answers. The entered text and speech transcripts are never stored.</p>
    ${attemptRows?`<div class="table-wrap"><table><thead><tr><th>Time</th><th>Lesson</th><th>Skill</th><th>Exercise</th><th>Result</th><th>24h+</th><th>Time</th></tr></thead><tbody>${attemptRows}</tbody></table></div>`:'<p class="hint">Complete an exercise to start recording history.</p>'}</section></div>`;
}
function renderProgress() {
  const stats=summarizeGrammarCatalog(state.catalog),u=state.current;
  header('Grammar progress','GRAMMAR · ANALYTICS','Progress is saved locally and separate from vocabulary.',`${stats.practiced} PRACTISED`);
  const tileData=[['Exercises',`${stats.practiced}/${stats.exercises}`],['Overall accuracy',percent(stats.successes,stats.attempts)],
    ['Recognition',percent(stats.recognition.successes,stats.recognition.attempts)],['Writing',percent(stats.production.successes,stats.production.attempts)],
    ['Speaking',percent(stats.speaking.successes,stats.speaking.attempts)],['Speaking prompts',`${stats.speaking.practiced}/${stats.speaking.total}`],
    ['Listening',percent(stats.listening.successes,stats.listening.attempts)],['Listening prompts',`${stats.listening.practiced}/${stats.listening.total}`],
    ['Review due',stats.due+stats.speaking.due+stats.listening.due]];
  const overall=`<section class="panel"><h2>All grammar lessons</h2><div class="grammar-progress-grid">${tileData.map(([title,value])=>
    `<div class="small-card"><span class="label">${title}</span><strong>${value}</strong></div>`).join('')}</div>
    <div class="buttonrow"><button class="primary" data-action="review-all" ${stats.due?'':'disabled'}>Review written (${stats.due})</button><button class="ghost" data-action="review-speaking-all" ${stats.speaking.due?'':'disabled'}>Review speaking (${stats.speaking.due})</button><button class="ghost" data-action="review-listening-all" ${stats.listening.due?'':'disabled'}>Review listening (${stats.listening.due})</button><button class="ghost" data-action="dashboard">Learning dashboard</button><button class="ghost" data-action="history">Learning history</button><button class="ghost" data-action="library">Browse lessons</button></div>
    <div class="table-wrap"><table><thead><tr><th>Lesson</th><th>Collection</th><th>Level</th><th>Practised</th><th>Accuracy</th><th>Speaking</th><th>Listening</th><th>Due</th></tr></thead>
    <tbody>${state.catalog.map(e=>{const s=stats.byUnit[e.id];return `<tr><td><button class="grammar-text-button" data-action="open" data-id="${escapeHtml(e.id)}">${escapeHtml(e.title)}</button></td>
    <td>${escapeHtml(grammarCollection(e.collectionId)?.title||e.collectionId)}</td><td>${escapeHtml(e.level)}</td><td>${s.practiced}/${s.total}</td><td>${percent(s.successes,s.attempts)}</td><td>${s.speaking.practiced}/${s.speaking.total}</td><td>${s.listening.practiced}/${s.listening.total}</td><td>${s.due+s.speaking.due+s.listening.due}</td></tr>`;}).join('')}</tbody></table></div></section>`;
  const records=getGrammarProgress();
  const detail=u?`<section class="panel"><div class="between"><h2>${escapeHtml(u.title)} · individual exercises</h2><button class="ghost" data-action="lesson">View lesson</button></div>
    <div class="table-wrap"><table><thead><tr><th>Exercise</th><th>Skill</th><th>Attempts</th><th>Accuracy</th><th>Next review</th></tr></thead>
    <tbody>${[...u.exercises,...(u.speakingExercises||[]),...(u.listeningExercises||[])].map(ex=>{const p=records[grammarKey(u.id,ex.id)];return `<tr><td>${escapeHtml(ex.id)}</td><td>${escapeHtml((u.speakingExercises||[]).includes(ex)?'speaking':(u.listeningExercises||[]).includes(ex)?'listening':exerciseSkill(ex))}</td>
      <td>${p?.attempts??0}</td><td>${p?percent(p.successes,p.attempts):'—'}</td><td>${p?(p.due<=Date.now()?'Due':escapeHtml(new Date(p.due).toLocaleString())):'Not practised'}</td></tr>`;}).join('')}</tbody></table></div></section>`:'';
  app.innerHTML=`<div class="stack">${overall}${detail}<section class="panel"><h2>Grammar progress backup</h2>
    <p class="hint">Export/import includes grammar progress and dated learning history; legacy backups without history still import. Vocabulary progress is unchanged.</p>
    <div class="buttonrow"><button class="ghost" data-action="export">Export grammar progress</button><button class="ghost" data-action="import">Import grammar progress</button>
    <button class="ghost" data-action="clear">Clear grammar progress and history</button></div><input type="file" id="grammarImportFile" accept=".json,application/json" hidden></section></div>`;
}
function render(){if(state.page==='library')renderLibrary();else if(state.page==='lesson')renderLesson();else if(state.page==='session')renderSession();else if(state.page==='speaking')renderSpeaking();else if(state.page==='listening')renderListening();else if(state.page==='history')renderHistory();else if(state.page==='dashboard')renderDashboard();else renderProgress();}
async function getUnit(id){
  if(state.cache.has(id))return state.cache.get(id);
  const entry=state.catalog.find(x=>x.id===id);
  if(!entry)throw new Error('Unknown lesson: '+id);
  const unit=await loadGrammarUnit(entry);
  state.cache.set(id,unit);
  return unit;
}
async function openLesson(id){state.current=await getUnit(id);
  state.collectionId=state.catalog.find(entry=>entry.id===id)?.collectionId||state.collectionId;
  localStorage.setItem(GRAMMAR_ACTIVE_KEY,id);
  state.page='lesson';state.result=null;state.answer=null;state.session=[];render();}
function startListeningSession(review=false){
  if(!state.current){state.page='library';render();return;}
  const exercises=review?dueListeningExercises(state.current):(state.current.listeningExercises||[]);
  state.session=exercises.map(exercise=>({unit:state.current,exercise}));
  state.position=0;state.result=null;state.answer=null;
  state.page=state.session.length?'listening':'lesson';beginTrackedSession(review?'review':'practice','lesson');stopAudio();render();
}
async function startGlobalListeningReview(scoped=false){
  const pending=[];
  for(const item of (scoped?selectGrammarCollection(state.catalog,state.collectionId):state.catalog)){
    const stats=summarizeGrammarCatalog([item]);
    if(!stats.listening.due)continue;
    const unit=await getUnit(item.id);
    for(const exercise of dueListeningExercises(unit))pending.push({unit,exercise});
  }
  state.session=pending;state.position=0;state.result=null;state.answer=null;
  state.page=pending.length?'listening':'progress';beginTrackedSession('review','global');stopAudio();render();
}
function startSpeakingSession(review=false){
  if(!state.current){state.page='library';render();return;}
  const prompts=review?dueSpeakingExercises(state.current):(state.current.speakingExercises||[]);
  state.session=prompts.map(exercise=>({unit:state.current,exercise}));
  state.position=0;state.result=null;state.answer=null;state.speechError='';
  state.page=state.session.length?'speaking':'lesson';beginTrackedSession(review?'review':'practice','lesson');render();
}
async function startGlobalSpeakingReview(scoped=false){
  const pending=[];
  for(const item of (scoped?selectGrammarCollection(state.catalog,state.collectionId):state.catalog)){
    if(!(summarizeGrammarCatalog([item]).speaking.due))continue;
    const unit=await getUnit(item.id);
    for(const exercise of dueSpeakingExercises(unit))pending.push({unit,exercise});
  }
  state.session=pending;state.position=0;state.result=null;state.answer=null;state.speechError='';
  state.page=pending.length?'speaking':'progress';beginTrackedSession('review','global');render();
}
function startSession(review=false){
  if(!state.current){state.page='library';render();return;}
  const exercises=review?dueExercises(state.current):state.current.exercises;
  state.session=exercises.map(exercise=>({unit:state.current,exercise}));
  state.position=0;state.result=null;state.answer=null;
  if(!state.session.length){state.page='lesson';render();return;}
  state.page='session';beginTrackedSession(review?'review':'practice','lesson');stopAudio();render();
}
async function startGlobalReview(scoped=false){
  const dueIds=dueGrammarUnitIds(scoped?selectGrammarCollection(state.catalog,state.collectionId):state.catalog);
  const pending=[];
  for(const id of dueIds){const unit=await getUnit(id);for(const exercise of dueExercises(unit))pending.push({unit,exercise});}
  state.session=pending;state.position=0;state.result=null;state.answer=null;
  state.page=pending.length?'session':'progress';beginTrackedSession('review','global');stopAudio();render();
}
function saveJSON(object,filename){const url=URL.createObjectURL(new Blob([JSON.stringify(object,null,2)],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);}
function applyFilters(){
  const query=$('#grammarSearch')?.value.toLowerCase().trim()||'';
  const level=$('#grammarLevel')?.value||'all';
  let visible=0;
  document.querySelectorAll('#grammarCards .grammar-card').forEach(card=>{
    const show=card.dataset.search.includes(query)&&(level==='all'||card.dataset.level===level);
    card.hidden=!show;if(show)visible++;
  });
  const empty=$('#grammarNoResults');if(empty)empty.hidden=visible>0;
}
app.addEventListener('input',event=>{if(event.target.id==='grammarSearch')applyFilters();});
app.addEventListener('change',async event=>{
  if(event.target.id==='grammarLevel'){applyFilters();return;}
  if(event.target.id==='grammarDashboardPeriod'){
    state.dashboardDays=Number(event.target.value);render();return;
  }
  if(event.target.id==='grammarHistoryPeriod'){
    state.historyDays=Number(event.target.value);render();return;
  }
  if(event.target.id==='grammarHistorySkill'){
    state.historySkill=event.target.value;render();return;
  }
  if(event.target.id==='grammarAudioSpeed'){configureAudio({rate:Number(event.target.value)});return;}
  if(event.target.id!=='grammarImportFile'||!event.target.files?.[0])return;
  try{const data=JSON.parse(await event.target.files[0].text());
    if(!confirm('Replace ALL grammar progress AND history with this backup? Older backups without history will clear the current dated history. Vocabulary progress is not affected.'))return;
    importGrammarProgress(data);render();
  }catch(error){alert('Could not import grammar progress: '+error.message);}
});
app.addEventListener('submit',event=>{
  if(event.target.id==='grammarListeningForm') {
    event.preventDefault();
    if(state.page!=='listening' || state.result)return;
    const entry=currentEntry();if(!entry)return;
    const value=new FormData(event.target).get('answer');
    if(value===null || !String(value).trim())return;
    state.answer=entry.exercise.type==='multiple-choice'?Number(value):String(value);
    state.result=evaluateListeningAnswer(entry.exercise,state.answer);
    recordGrammarAttempt(entry.unit.id,entry.exercise.id,'listening',state.result.correct,localStorage,Date.now(),attemptContext());
    stopAudio();render();return;
  }
  if(event.target.id!=='grammarAnswerForm')return;
  event.preventDefault();
  if(state.page!=='session'||state.result)return;
  const entry=currentEntry();if(!entry)return;
  const value=new FormData(event.target).get('answer');
  if(value===null||!String(value).trim())return;
  state.answer=entry.exercise.type==='multiple-choice'?Number(value):String(value);
  state.result=evaluateExercise(entry.exercise,state.answer);
  recordGrammarAttempt(entry.unit.id,entry.exercise.id,exerciseSkill(entry.exercise),state.result.correct,localStorage,Date.now(),attemptContext());
  render();
});
app.addEventListener('click',async event=>{
  const button=event.target.closest('[data-action]');
  if(!button||state.loading)return;
  const action=button.dataset.action;
  try{
    state.loading=true;
    if(action==='open')await openLesson(button.dataset.id);
    else if(action==='select-collection'){state.collectionId=button.dataset.collection;state.page='library';stopAudio();render();}
    else if(action==='play-teaching' && state.current){
      const text=teachingAudioText(state.current,button.dataset.area,Number(button.dataset.index),button.dataset.side);
      if(text){try{await playText(speakableText(text),null,{forceTTS:true});}
        catch(error){const status=$('#grammarAudioStatus');if(status)status.textContent=error.message;}}
    }
    else if(action==='play-written-answer'&&state.page==='session'&&state.result){
      try{await playText(state.result.expected,null,{forceTTS:true});}
      catch(error){alert(error.message);}
    }
    else if(action==='play-listening'&&state.page==='listening'){
      const entry=currentEntry();
      if(entry){try{await playText(entry.exercise.audioText,null,{forceTTS:true});}
        catch(error){const status=$('#grammarAudioStatus');if(status)status.textContent=error.message;}}
    }
    else if(action==='library'){stopAudio();state.page='library';state.result=null;render();}
    else if(action==='lesson'){stopAudio();state.page=state.current?'lesson':'library';state.result=null;render();}
    else if(action==='progress'){stopAudio();state.page='progress';state.result=null;render();}
    else if(action==='history'){stopAudio();state.page='history';state.result=null;render();}
    else if(action==='dashboard'){stopAudio();state.page='dashboard';state.result=null;render();}
    else if(action==='start')startSession();
    else if(action==='review')startSession(true);
    else if(action==='review-all')await startGlobalReview();
    else if(action==='review-collection-written')await startGlobalReview(true);
    else if(action==='review-collection-speaking')await startGlobalSpeakingReview(true);
    else if(action==='review-collection-listening')await startGlobalListeningReview(true);
    else if(action==='start-speaking')startSpeakingSession();
    else if(action==='review-speaking')startSpeakingSession(true);
    else if(action==='review-speaking-all')await startGlobalSpeakingReview();
    else if(action==='start-listening')startListeningSession();
    else if(action==='review-listening')startListeningSession(true);
    else if(action==='review-listening-all')await startGlobalListeningReview();
    else if(action==='speak-model'){
      const entry=currentEntry();
      if(entry){try{await playText(entry.exercise.acceptedAnswers[0],null,{forceTTS:true});}
        catch(error){state.speechError=error.message;render();}}
    }
    else if(action==='speak'&&state.page==='speaking'){
      const entry=currentEntry();
      state.speechError='';
      const status=$('#grammarSpeechStatus');if(status)status.textContent='Listening…';
      button.disabled=true;
      try {
        const alternatives=await recognize(getAudioSettings().recognitionLang);
        if(state.page==='speaking' && currentEntry()===entry){
          if(!alternatives.some(value => normalizeSpokenAnswer(value))){
            state.speechError='No speech was recognized. Please try again.';
          }else{
            state.result=evaluateSpokenAnswer(entry.exercise,alternatives);
            recordGrammarAttempt(entry.unit.id,entry.exercise.id,'speaking',state.result.correct,localStorage,Date.now(),attemptContext());
          }
          render();
        }
      }catch(error){
        if(state.page==='speaking' && currentEntry()===entry){state.speechError=error.message;render();}
      }
    }
    else if(action==='next-speaking'&&state.page==='speaking'&&state.result){
      state.position++;state.result=null;state.answer=null;state.speechError='';state.questionStartedAt=Date.now();
      state.page=state.position<state.session.length?'speaking':'progress';render();
    }
    else if(action==='next-listening'&&state.page==='listening'&&state.result){
      stopAudio();state.position++;state.result=null;state.answer=null;state.questionStartedAt=Date.now();
      state.page=state.position<state.session.length?'listening':'progress';render();
    }
    else if(action==='next'&&state.result){stopAudio();state.position++;state.result=null;state.answer=null;state.questionStartedAt=Date.now();
      state.page=state.position<state.session.length?'session':'progress';render();}
    else if(action==='export')saveJSON(exportGrammarProgress(),'vocablab-grammar-progress.json');
    else if(action==='import')$('#grammarImportFile')?.click();
    else if(action==='clear'){if(confirm('Delete ALL grammar progress AND dated history? Vocabulary progress will remain untouched.')){
      localStorage.removeItem(GRAMMAR_PROGRESS_KEY);localStorage.removeItem(GRAMMAR_HISTORY_KEY);render();}}
  }catch(error){app.innerHTML=notice(error.message);}finally{state.loading=false;}
});
document.querySelectorAll('[data-nav]').forEach(button=>button.addEventListener('click',()=>{
  const page=button.dataset.nav;if(page==='speaking'){startSpeakingSession();return;}
  if(page==='listening'){startListeningSession();return;}
  stopAudio();
  state.page=page==='lesson'&&!state.current?'library':page;state.result=null;state.answer=null;render();
}));
(async()=>{
  try{
    state.catalog=await loadGrammarCatalog();
    const active=localStorage.getItem(GRAMMAR_ACTIVE_KEY);
    if(state.catalog.some(x=>x.id===active)){state.current=await getUnit(active);state.collectionId=state.catalog.find(x=>x.id===active).collectionId;}
    render();
  }catch(error){header('Unable to start Grammar Lab','GRAMMAR · ERROR','Check the local server and database/grammar-manifest.json.');app.innerHTML=notice(error.message);}
})();
