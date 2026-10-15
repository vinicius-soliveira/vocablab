/** Local Grammar Lab: source-independent lessons, deterministic correction, and separate progress. */
import {loadGrammarCatalog, loadGrammarUnit} from './catalog.js';
import {evaluateExercise, exerciseSkill} from './engine.js';
import {evaluateSpokenAnswer, normalizeSpokenAnswer} from './speaking.js';
import {recognize, browserSupportsRecognition, playText, getAudioSettings} from '../audio.js';
import {GRAMMAR_ACTIVE_KEY, GRAMMAR_PROGRESS_KEY, grammarKey, getGrammarProgress,
  recordGrammarAttempt, dueExercises, dueSpeakingExercises, summarizeSpeakingUnit,
  summarizeGrammarUnit, summarizeGrammarCatalog,
  dueGrammarUnitIds, exportGrammarProgress, importGrammarProgress} from './progress.js';

const $ = selector => document.querySelector(selector);
const app = $('#app');
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c =>
  ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const state = {catalog:[], cache:new Map(), current:null, page:'library', session:[], position:0,
  result:null, answer:null, speechError:'', loading:false};
const percent = (correct,attempts) => attempts ? `${Math.round(correct/attempts*100)}%` : '—';
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
function renderLibrary() {
  const all = summarizeGrammarCatalog(state.catalog);
  header('Grammar Lab','GRAMMAR · A1–C2','Learn the pattern, compare forms, practise and review.',`${state.catalog.length} LESSONS`);
  const cards = state.catalog.map(entry => {
    const s=all.byUnit[entry.id];
    const search=`${entry.title} ${entry.level} ${entry.topicId}`.toLowerCase();
    return `<article class="small-card grammar-card" data-search="${escapeHtml(search)}" data-level="${escapeHtml(entry.level)}">
      <div class="grammar-topic"><span class="chip">${escapeHtml(entry.level)}</span><span class="hint">${escapeHtml(entry.topicId.replaceAll('-',' '))}</span></div>
      <h3>${escapeHtml(entry.title)}</h3><p class="hint">${s.practiced}/${s.total} written · ${s.due} due</p>
      <p class="hint">Speaking: ${s.speaking.practiced}/${s.speaking.total} practised · ${s.speaking.due} due</p>
      <div class="buttonrow"><button class="primary" data-action="open" data-id="${escapeHtml(entry.id)}">Open lesson</button></div></article>`;
  }).join('');
  app.innerHTML=`<div class="stack"><section class="panel"><div class="between"><div><h2>Grammar lessons</h2><p class="hint">Original teaching notes and exercises; lessons load when opened.</p></div>
    <span class="chip">${all.practiced}/${all.exercises} practised</span></div>
    <div class="grammar-filters"><label>Search<input id="grammarSearch" type="search" placeholder="e.g. conditionals, articles" autocomplete="off"></label>
    <label>CEFR level<select id="grammarLevel"><option value="all">All levels</option>${['A1','A2','B1','B2','C1','C2'].map(x=>`<option value="${x}">${x}</option>`).join('')}</select></label></div>
    <p id="grammarNoResults" class="hint" hidden>No matching lessons.</p>
    <div class="grid" id="grammarCards">${cards}</div></section>
    <section class="panel"><div class="between"><div><h2>Adaptive grammar review</h2><p class="hint">Revisit due exercises from any lesson without changing your vocabulary progress.</p></div>
    <span class="chip">${all.due} written due</span></div><div class="buttonrow"><button class="primary" data-action="review-all" ${all.due?'':'disabled'}>Review written (${all.due})</button><button class="ghost" data-action="review-speaking-all" ${all.speaking.due?'':'disabled'}>Review speaking (${all.speaking.due})</button><button class="ghost" data-action="progress">View progress</button></div></section></div>`;
}
function renderTeaching(unit) {
  const objectives=unit.learningObjectives?.length ? `<section class="panel grammar-lesson-block"><h2>Learning objectives</h2><ul class="grammar-bullets">${unit.learningObjectives.map(x=>`<li>${escapeHtml(x)}</li>`).join('')}</ul></section>` : '';
  const explanations=`<section class="panel grammar-lesson-block"><h2>Grammar explained</h2>
    ${unit.explanation.map((section,i)=>`<article class="grammar-section"><span class="grammar-number">${i+1}</span><div><h3>${escapeHtml(section.heading)}</h3><p>${escapeHtml(section.body)}</p>
    ${section.example?`<div class="grammar-example">${escapeHtml(section.example)}</div>`:''}</div></article>`).join('')}</section>`;
  const comparisons=unit.comparisons?.length?`<section class="panel grammar-lesson-block"><h2>Compare the structures</h2><p class="hint">Notice how the form changes meaning or usage.</p>
    ${unit.comparisons.map(c=>`<div class="grammar-comparison"><h3>${escapeHtml(c.title)}</h3><div class="grammar-compare-grid">
      ${['left','right'].map(side=>`<div class="grammar-compare-side"><span class="label">${escapeHtml(c[side].label)}</span><strong>${escapeHtml(c[side].example)}</strong><p class="hint">${escapeHtml(c[side].note)}</p></div>`).join('')}</div></div>`).join('')}</section>`:'';
  const examples=unit.examples?.length?`<section class="panel grammar-lesson-block"><h2>Examples in context</h2><div class="grammar-example-list">
    ${unit.examples.map(x=>`<div class="grammar-example-item"><strong>${escapeHtml(x.sentence)}</strong><p class="hint">${escapeHtml(x.note)}</p></div>`).join('')}</div></section>`:'';
  const mistakes=unit.commonMistakes?.length?`<section class="panel grammar-lesson-block"><h2>Common mistakes</h2><p class="hint">Compare the incorrect sentence with a natural correction.</p>
    <div class="grammar-mistakes">${unit.commonMistakes.map(x=>`<div class="grammar-mistake"><div><span class="grammar-error-label">Incorrect</span><p>${escapeHtml(x.incorrect)}</p></div>
    <div><span class="grammar-correct-label">Correct</span><p>${escapeHtml(x.correct)}</p></div><p class="hint">${escapeHtml(x.why)}</p></div>`).join('')}</div></section>`:'';
  const tips=unit.studyTips?.length?`<section class="panel grammar-lesson-block"><h2>Study tips</h2><ul class="grammar-bullets">${unit.studyTips.map(t=>`<li>${escapeHtml(t)}</li>`).join('')}</ul></section>`:'';
  return objectives+explanations+comparisons+examples+mistakes+tips;
}
function renderLesson() {
  const u=state.current;
  if(!u){header('Grammar Lab','GRAMMAR · LESSON','Choose a lesson to get started.');app.innerHTML=notice('Select a grammar lesson to get started.');return;}
  const s=summarizeGrammarUnit(u),due=dueExercises(u),spoken=summarizeSpeakingUnit(u),speakingDue=dueSpeakingExercises(u);
  header(u.title,`GRAMMAR · ${u.level}`,u.summary,`${u.exercises.length} EXERCISES`);
  app.innerHTML=`<div class="stack"><section class="panel"><div class="between"><div><span class="chip">${escapeHtml(u.level)}</span><h2 style="margin-top:12px">Study, practise, review</h2>
    <p class="hint">Read the rules, comparisons and mistakes. Then test yourself.</p></div><span class="grammar-note">${s.practiced}/${s.total} attempted · ${percent(s.successes,s.attempts)} accuracy</span></div>
    <div class="buttonrow"><button class="primary" data-action="start">Practice writing (${u.exercises.length})</button><button class="ghost" data-action="review" ${due.length?'':'disabled'}>Review written (${due.length})</button><button class="ghost" data-action="library">All lessons</button></div></section>
    <section class="panel grammar-speaking-panel"><div class="between"><div><span class="chip">SPEAKING</span><h2 style="margin-top:10px">Speak the grammar</h2><p class="hint">Say a complete sentence using the target structure. The browser compares the recognized words with accepted model answers.</p></div>
    <span class="grammar-note">${spoken.practiced}/${spoken.total} practised · ${percent(spoken.successes,spoken.attempts)} matched</span></div>
    <div class="buttonrow"><button class="primary" data-action="start-speaking" ${(u.speakingExercises?.length)?'':'disabled'}>Speaking practice (${u.speakingExercises?.length || 0})</button>
    <button class="ghost" data-action="review-speaking" ${speakingDue.length?'':'disabled'}>Review speaking (${speakingDue.length})</button></div></section>
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
    <p style="color:inherit">${escapeHtml(state.result.feedback)}</p></div>`:'';
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
function renderProgress() {
  const stats=summarizeGrammarCatalog(state.catalog),u=state.current;
  header('Grammar progress','GRAMMAR · ANALYTICS','Progress is saved locally and separate from vocabulary.',`${stats.practiced} PRACTISED`);
  const tileData=[['Exercises',`${stats.practiced}/${stats.exercises}`],['Overall accuracy',percent(stats.successes,stats.attempts)],
    ['Recognition',percent(stats.recognition.successes,stats.recognition.attempts)],['Writing',percent(stats.production.successes,stats.production.attempts)],
    ['Speaking',percent(stats.speaking.successes,stats.speaking.attempts)],['Speaking prompts',`${stats.speaking.practiced}/${stats.speaking.total}`],['Review due',stats.due+stats.speaking.due]];
  const overall=`<section class="panel"><h2>All grammar lessons</h2><div class="grammar-progress-grid">${tileData.map(([title,value])=>
    `<div class="small-card"><span class="label">${title}</span><strong>${value}</strong></div>`).join('')}</div>
    <div class="buttonrow"><button class="primary" data-action="review-all" ${stats.due?'':'disabled'}>Review written (${stats.due})</button><button class="ghost" data-action="review-speaking-all" ${stats.speaking.due?'':'disabled'}>Review speaking (${stats.speaking.due})</button><button class="ghost" data-action="library">Browse lessons</button></div>
    <div class="table-wrap"><table><thead><tr><th>Lesson</th><th>Level</th><th>Practised</th><th>Accuracy</th><th>Speaking</th><th>Due</th></tr></thead>
    <tbody>${state.catalog.map(e=>{const s=stats.byUnit[e.id];return `<tr><td><button class="grammar-text-button" data-action="open" data-id="${escapeHtml(e.id)}">${escapeHtml(e.title)}</button></td>
    <td>${escapeHtml(e.level)}</td><td>${s.practiced}/${s.total}</td><td>${percent(s.successes,s.attempts)}</td><td>${s.speaking.practiced}/${s.speaking.total}</td><td>${s.due+s.speaking.due}</td></tr>`;}).join('')}</tbody></table></div></section>`;
  const records=getGrammarProgress();
  const detail=u?`<section class="panel"><div class="between"><h2>${escapeHtml(u.title)} · individual exercises</h2><button class="ghost" data-action="lesson">View lesson</button></div>
    <div class="table-wrap"><table><thead><tr><th>Exercise</th><th>Skill</th><th>Attempts</th><th>Accuracy</th><th>Next review</th></tr></thead>
    <tbody>${[...u.exercises,...(u.speakingExercises||[])].map(ex=>{const p=records[grammarKey(u.id,ex.id)];return `<tr><td>${escapeHtml(ex.id)}</td><td>${escapeHtml((u.speakingExercises||[]).includes(ex)?'speaking':exerciseSkill(ex))}</td>
      <td>${p?.attempts??0}</td><td>${p?percent(p.successes,p.attempts):'—'}</td><td>${p?(p.due<=Date.now()?'Due':escapeHtml(new Date(p.due).toLocaleString())):'Not practised'}</td></tr>`;}).join('')}</tbody></table></div></section>`:'';
  app.innerHTML=`<div class="stack">${overall}${detail}<section class="panel"><h2>Grammar progress backup</h2>
    <p class="hint">Export/import includes grammar exercise progress across all lessons. Vocabulary progress and vocabulary backups are unchanged.</p>
    <div class="buttonrow"><button class="ghost" data-action="export">Export grammar progress</button><button class="ghost" data-action="import">Import grammar progress</button>
    <button class="ghost" data-action="clear">Clear grammar progress</button></div><input type="file" id="grammarImportFile" accept=".json,application/json" hidden></section></div>`;
}
function render(){if(state.page==='library')renderLibrary();else if(state.page==='lesson')renderLesson();else if(state.page==='session')renderSession();else if(state.page==='speaking')renderSpeaking();else renderProgress();}
async function getUnit(id){
  if(state.cache.has(id))return state.cache.get(id);
  const entry=state.catalog.find(x=>x.id===id);
  if(!entry)throw new Error('Unknown lesson: '+id);
  const unit=await loadGrammarUnit(entry);
  state.cache.set(id,unit);
  return unit;
}
async function openLesson(id){state.current=await getUnit(id);localStorage.setItem(GRAMMAR_ACTIVE_KEY,id);
  state.page='lesson';state.result=null;state.answer=null;state.session=[];render();}
function startSpeakingSession(review=false){
  if(!state.current){state.page='library';render();return;}
  const prompts=review?dueSpeakingExercises(state.current):(state.current.speakingExercises||[]);
  state.session=prompts.map(exercise=>({unit:state.current,exercise}));
  state.position=0;state.result=null;state.answer=null;state.speechError='';
  state.page=state.session.length?'speaking':'lesson';render();
}
async function startGlobalSpeakingReview(){
  const pending=[];
  for(const item of state.catalog){
    if(!(summarizeGrammarCatalog([item]).speaking.due))continue;
    const unit=await getUnit(item.id);
    for(const exercise of dueSpeakingExercises(unit))pending.push({unit,exercise});
  }
  state.session=pending;state.position=0;state.result=null;state.answer=null;state.speechError='';
  state.page=pending.length?'speaking':'progress';render();
}
function startSession(review=false){
  if(!state.current){state.page='library';render();return;}
  const exercises=review?dueExercises(state.current):state.current.exercises;
  state.session=exercises.map(exercise=>({unit:state.current,exercise}));
  state.position=0;state.result=null;state.answer=null;
  if(!state.session.length){state.page='lesson';render();return;}
  state.page='session';render();
}
async function startGlobalReview(){
  const dueIds=dueGrammarUnitIds(state.catalog);
  const pending=[];
  for(const id of dueIds){const unit=await getUnit(id);for(const exercise of dueExercises(unit))pending.push({unit,exercise});}
  state.session=pending;state.position=0;state.result=null;state.answer=null;
  state.page=pending.length?'session':'progress';render();
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
  if(event.target.id!=='grammarImportFile'||!event.target.files?.[0])return;
  try{const data=JSON.parse(await event.target.files[0].text());
    if(!confirm('Replace ALL grammar progress with this backup? Vocabulary progress is not affected.'))return;
    importGrammarProgress(data);render();
  }catch(error){alert('Could not import grammar progress: '+error.message);}
});
app.addEventListener('submit',event=>{
  if(event.target.id!=='grammarAnswerForm')return;
  event.preventDefault();
  if(state.page!=='session'||state.result)return;
  const entry=currentEntry();if(!entry)return;
  const value=new FormData(event.target).get('answer');
  if(value===null||!String(value).trim())return;
  state.answer=entry.exercise.type==='multiple-choice'?Number(value):String(value);
  state.result=evaluateExercise(entry.exercise,state.answer);
  recordGrammarAttempt(entry.unit.id,entry.exercise.id,exerciseSkill(entry.exercise),state.result.correct);
  render();
});
app.addEventListener('click',async event=>{
  const button=event.target.closest('[data-action]');
  if(!button||state.loading)return;
  const action=button.dataset.action;
  try{
    state.loading=true;
    if(action==='open')await openLesson(button.dataset.id);
    else if(action==='library'){state.page='library';state.result=null;render();}
    else if(action==='lesson'){state.page=state.current?'lesson':'library';state.result=null;render();}
    else if(action==='progress'){state.page='progress';state.result=null;render();}
    else if(action==='start')startSession();
    else if(action==='review')startSession(true);
    else if(action==='review-all')await startGlobalReview();
    else if(action==='start-speaking')startSpeakingSession();
    else if(action==='review-speaking')startSpeakingSession(true);
    else if(action==='review-speaking-all')await startGlobalSpeakingReview();
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
            recordGrammarAttempt(entry.unit.id,entry.exercise.id,'speaking',state.result.correct);
          }
          render();
        }
      }catch(error){
        if(state.page==='speaking' && currentEntry()===entry){state.speechError=error.message;render();}
      }
    }
    else if(action==='next-speaking'&&state.page==='speaking'&&state.result){
      state.position++;state.result=null;state.answer=null;state.speechError='';
      state.page=state.position<state.session.length?'speaking':'progress';render();
    }
    else if(action==='next'&&state.result){state.position++;state.result=null;state.answer=null;
      state.page=state.position<state.session.length?'session':'progress';render();}
    else if(action==='export')saveJSON(exportGrammarProgress(),'vocablab-grammar-progress.json');
    else if(action==='import')$('#grammarImportFile')?.click();
    else if(action==='clear'){if(confirm('Delete ALL grammar progress? Vocabulary progress will remain untouched.')){
      localStorage.removeItem(GRAMMAR_PROGRESS_KEY);render();}}
  }catch(error){app.innerHTML=notice(error.message);}finally{state.loading=false;}
});
document.querySelectorAll('[data-nav]').forEach(button=>button.addEventListener('click',()=>{
  const page=button.dataset.nav;if(page==='speaking'){startSpeakingSession();return;}
  state.page=page==='lesson'&&!state.current?'library':page;state.result=null;state.answer=null;render();
}));
(async()=>{
  try{
    state.catalog=await loadGrammarCatalog();
    const active=localStorage.getItem(GRAMMAR_ACTIVE_KEY);
    if(state.catalog.some(x=>x.id===active))state.current=await getUnit(active);
    render();
  }catch(error){header('Unable to start Grammar Lab','GRAMMAR · ERROR','Check the local server and grammar/manifest.json.');app.innerHTML=notice(error.message);}
})();
