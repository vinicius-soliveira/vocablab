/** Pronunciation Lab 2.0: separate local UI, no legacy fake-success recording. */
import {loadCatalog,loadCatalogUnit} from '../catalog.js';
import {getWordPlaybackText, getAudioSettings, browserSupportsRecognition, recognize, startRecording, stopRecording} from '../audio.js';
import {createPronunciationPlayer,PRACTICE_RATES} from './player.js';
import {getPracticeStats,recordPractice,recordRecognition,recordSentenceRecognition,
  isPracticeDue,practicePriority,summarizeUnitPractice,exportPracticeBackup,importPracticeBackup} from './progress.js';
import {matchesSpokenTarget,matchesSentenceTarget,normalizeSpokenText} from './matching.js';
const $=selector=>document.querySelector(selector);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const player=createPronunciationPlayer();
const state={catalog:[],unit:null,unitId:null,position:0,mode:'all',rate:1,recording:false,
  recordingUrl:'',checking:false,selectionToken:0,queueItems:null};
const summary=(row,kind='word')=>kind==='sentence'
  ? `${row.sentenceRecognitionMatches||0}/${row.sentenceRecognitionAttempts||0}`
  : `${row.recognitionMatches||0}/${row.recognitionAttempts||0}`;
const key='vocablab.active.v1';
const records=()=>state.unit?.items||[];
const queue=()=>{
  if(state.queueItems)return state.queueItems;
  const xs=records().filter(x=>state.mode==='all'||isPracticeDue(state.unitId,x.id));
  state.queueItems=[...xs].sort((a,b)=>practicePriority(state.unitId,b.id)-practicePriority(state.unitId,a.id));
  return state.queueItems;
};
function cleanup(){
  player.stop();
  if(state.recordingUrl){URL.revokeObjectURL(state.recordingUrl);state.recordingUrl='';}
}
function status(message){const el=$('#pronStatus');if(el)el.textContent=message;}
function saveJSON(value,name){
  const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));
  const link=document.createElement('a');link.href=url;link.download=name;link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1500);
}
function updateStats(x){
  const r=getPracticeStats(state.unitId,x.id);
  const unit=summarizeUnitPractice(state.unitId,records());
  $('#countRecordings').textContent=String(r.recordings||0);
  $('#countRecognized').textContent=summary(r);
  $('#countSentenceRecognized').textContent=summary(r,'sentence');
  $('#countOutcome').textContent=r.lastRecognition==='recognized'?'Recognized':r.lastRecognition==='mismatch'?'Not recognized':'—';
  $('#countSentenceOutcome').textContent=r.lastSentenceRecognition==='recognized'?'Recognized':r.lastSentenceRecognition==='mismatch'?'Not recognized':'—';
  $('#unitStats').textContent=`${unit.recordings} recordings · Words: ${unit.recognitionMatches}/${unit.recognitionAttempts} · Sentences: ${unit.sentenceRecognitionMatches}/${unit.sentenceRecognitionAttempts} · ${unit.due} due for review`;
}
function render(){
  const list=queue();
  if(state.position>=list.length)state.position=0;
  const item=list[state.position];
  const unit=state.unit;
  $('#pronUnitChip').textContent=unit?`${unit.level} · ${records().length} items`:'NO UNIT';
  const groups=new Map();
  for(const entry of state.catalog){const title=entry.bookTitle||'Custom';if(!groups.has(title))groups.set(title,[]);groups.get(title).push(entry);}
  const options=[...groups.entries()].map(([group,arr])=>`<optgroup label="${esc(group)}">${arr.map(e=>`<option value="${esc(e.id)}" ${state.unitId===e.id?'selected':''}>${esc(e.title)} (${e.itemsCount})</option>`).join('')}</optgroup>`).join('');
  const head=`<section class="panel"><div class="between"><div><h2>Choose a unit</h2><p class="hint">Practise words and example sentences independently. Vocabulary is loaded on demand.</p></div>
    <div class="buttonrow"><button class="ghost" id="exportPractice">↓ Practice backup</button><button class="ghost" id="importPractice">↑ Restore</button></div></div>
    <div class="pronunciation-filters"><label>Vocabulary unit<select id="pronUnit">${options}</select></label>
    <label>Practice mode<select id="pronMode"><option value="all" ${state.mode==='all'?'selected':''}>All items (prioritize mismatches)</option><option value="due" ${state.mode==='due'?'selected':''}>Due for review only</option></select></label></div>
    <div class="hint" id="unitStats"></div><input id="practiceImportFile" type="file" accept=".json,application/json" hidden></section>`;
  const body=!item?`<section class="panel"><h2>No due items</h2><p>Nothing is scheduled for pronunciation review now. Choose All items to continue practising.</p></section>`:
  `<section class="panel"><div class="between"><span class="chip">${esc(item.section||'Vocabulary')}</span><span class="hint">${state.position+1} / ${list.length}</span></div>
  <div class="center hero"><div class="word">${esc(item.word)}</div><p class="ipa">${esc(item.ipa||'')}</p><p>${esc(item.example||'')}</p>
  ${getWordPlaybackText(item)!==item.word?`<p class="hint">Say: <strong>${esc(getWordPlaybackText(item))}</strong></p>`:''}
  <div class="pronunciation-rate"><label for="playbackSpeed">Playback speed</label>
  <select id="playbackSpeed">${PRACTICE_RATES.map(r=>`<option value="${r}" ${r===state.rate?'selected':''}>${r.toFixed(2)}×</option>`).join('')}</select></div>
  <div class="buttonrow" style="justify-content:center"><button class="primary" id="playReference">▶ Reference</button><button class="ghost" id="playSentence" ${item.example?'':'disabled'}>▶ Sentence</button></div>
  <div class="buttonrow" style="justify-content:center"><button class="ghost" id="beginRec">● Record</button><button class="ghost" id="finishRec" disabled>■ Stop recording</button><button class="ghost" id="playRec" disabled>▶ Your voice</button></div>
  <div class="buttonrow" style="justify-content:center"><button class="primary" id="compareRec" disabled>⇄ Compare both</button><button class="ghost" id="stopAudio">■ Stop audio</button></div>
  <div class="pronunciation-assessments">
    <div class="pronunciation-assessment"><div class="pronunciation-assessment-heading"><strong>Word / phrase</strong><button class="primary" id="recognizeWord">🎙 Check word</button></div>
      <div id="wordFeedback" class="pronunciation-feedback" role="status" aria-live="polite" hidden></div><p id="wordTranscript" class="pronunciation-transcript hint"></p></div>
    <div class="pronunciation-assessment"><div class="pronunciation-assessment-heading"><strong>Example sentence</strong><button class="primary" id="recognizeSentence" ${item.example?.trim()?'':'disabled'}>🎙 Check sentence</button></div>
      <div id="sentenceFeedback" class="pronunciation-feedback" role="status" aria-live="polite" hidden></div><p id="sentenceTranscript" class="pronunciation-transcript hint"></p></div>
  </div>
  <div class="pronunciation-status hint" id="pronStatus" role="status">Choose Check word or Check sentence. Each check listens separately. Recording and comparison are optional.</div>
  <div class="pronunciation-summary"><div class="small-card"><b id="countRecordings">0</b><span class="hint">Recordings</span></div>
  <div class="small-card"><b id="countRecognized">0/0</b><span class="hint">Words recognized</span></div>
  <div class="small-card"><b id="countSentenceRecognized">0/0</b><span class="hint">Sentences recognized</span></div>
  <div class="small-card"><b id="countOutcome">—</b><span class="hint">Last word check</span></div>
  <div class="small-card"><b id="countSentenceOutcome">—</b><span class="hint">Last sentence check</span></div></div>
  <p class="pronunciation-disclaimer">Each check uses a new microphone capture. Matching the full sentence requires all its words, not just the target expression.</p>
  </div><div class="note">${esc(item.note||'Listen for sounds, word stress and rhythm.')}</div>
  <div class="buttonrow"><button class="ghost" id="previous">← Previous</button><button class="primary" id="next">Next →</button></div></section>`;
  $('#pronApp').innerHTML=`<div class="stack">${head}${body}</div>`;
  $('#pronUnit').onchange=event=>openUnit(event.target.value);
  $('#pronMode').onchange=event=>{
    if(state.recording||state.checking){event.target.value=state.mode;return status('Finish the current attempt before changing modes.');}
    state.selectionToken++;cleanup();state.mode=event.target.value;state.position=0;state.queueItems=null;render();
  };
  $('#exportPractice').onclick=()=>saveJSON(exportPracticeBackup(),'vocablab-pronunciation-practice.json');
  $('#importPractice').onclick=()=>$('#practiceImportFile').click();
  $('#practiceImportFile').onchange=async event=>{
    const file=event.target.files?.[0];if(!file)return;
    try{
      if(file.size>2_000_000)throw new Error('Backup file exceeds 2 MB.');
      const data=JSON.parse(await file.text());
      if(!confirm('Replace pronunciation practice progress? Vocabulary and grammar progress will not change.'))return;
      importPracticeBackup(data);render();
    }catch(error){alert('Import failed: '+error.message);}
  };
  if(!item){const s=summarizeUnitPractice(state.unitId,records());$('#unitStats').textContent=`${s.recordings} recordings · ${s.due} due`;return;}
  updateStats(item);
  $('#playbackSpeed').onchange=e=>{player.stop();state.rate=Number(e.target.value);};
  const target=getWordPlaybackText(item);
  const play=p=>p.catch(err=>status(err.message));
  $('#playReference').onclick=()=>play(player.playReference(target,item.audio||null,state.rate));
  $('#playSentence').onclick=()=>play(player.playReference(item.example,null,state.rate));
  $('#playRec').onclick=()=>play(player.playRecording(state.recordingUrl,state.rate));
  $('#compareRec').onclick=()=>play(player.compare(target,item.audio||null,state.recordingUrl,state.rate));
  $('#stopAudio').onclick=()=>player.stop();
  $('#beginRec').onclick=async()=>{
    if(state.recording||state.checking)return;
    player.stop();
    try{
      await startRecording();
      state.recording=true;
      $('#beginRec').disabled=true;$('#finishRec').disabled=false;
      $('#compareRec').disabled=true;$('#playRec').disabled=true;
      status('Recording…');
    }catch(err){status(err.message);}
  };
  $('#finishRec').onclick=async()=>{
    if(!state.recording)return;
    try{
      const url=await stopRecording();
      cleanup();state.recordingUrl=url;
      recordPractice(state.unitId,item.id);
      $('#compareRec').disabled=false;$('#playRec').disabled=false;
      status('Recording ready. Play your voice or compare it with the reference.');
      updateStats(item);
    }catch(err){status(err.message);}
    finally{state.recording=false;$('#beginRec').disabled=false;$('#finishRec').disabled=true;}
  };
  async function checkSpeech(kind){
    if(state.recording)return status('Stop recording first.');
    if(state.checking)return;
    if(!browserSupportsRecognition())return status('Speech recognition is unavailable. Try Chrome or Edge.');
    const sentence=kind==='sentence';
    const expected=sentence?item.example:target;
    if(!expected?.trim())return status('This item has no example sentence.');
    const match=sentence?matchesSentenceTarget:matchesSpokenTarget;
    const feedback=$(sentence?'#sentenceFeedback':'#wordFeedback');
    const transcriptNode=$(sentence?'#sentenceTranscript':'#wordTranscript');
    player.stop();
    state.checking=true;
    $('#recognizeWord').disabled=true;
    $('#recognizeSentence').disabled=true;
    $('#beginRec').disabled=true;
    const token=state.selectionToken,selectedUnit=state.unitId;
    feedback.hidden=true;
    transcriptNode.textContent='';
    status(sentence?'Listening… Say the complete example sentence.':'Listening… Say the word or phrase above.');
    try{
      // Web Speech starts a new capture; the separately saved recording is never scored.
      const alternatives=await recognize(getAudioSettings().recognitionLang);
      if(token!==state.selectionToken)return;
      const nonempty=alternatives.filter(value=>normalizeSpokenText(value));
      if(!nonempty.length){status('No clear speech detected. Try again.');return;}
      const matched=match(expected,nonempty);
      if(sentence)recordSentenceRecognition(selectedUnit,item.id,matched);
      else recordRecognition(selectedUnit,item.id,matched);
      feedback.hidden=false;
      feedback.className=`pronunciation-feedback ${matched?'success':'warning'}`;
      feedback.textContent=sentence
        ? matched?'✓ Sentence recognized':'↻ Sentence not recognized'
        : matched?'✓ Word recognized':'↻ Word not recognized';
      const heard=matched?nonempty.find(value=>match(expected,[value])):nonempty[0];
      transcriptNode.textContent=`Heard: “${heard}”. ${matched?'Nice work!':'Listen again and try another attempt.'}`;
      status('You can check the other target or repeat this one.');
      updateStats(item);
    }catch(error){
      if(token===state.selectionToken){
        if(/No speech was recognized|no-speech|no match/i.test(error.message)){
          status('No clear speech detected. Try again.');
        }else status(`Could not complete recognition: ${error.message}. Try again.`);
      }
    }finally{
      state.checking=false;
      if(token===state.selectionToken){
        $('#recognizeWord').disabled=false;
        $('#recognizeSentence').disabled=!item.example?.trim();
        $('#beginRec').disabled=false;
      }
    }
  }
  $('#recognizeWord').onclick=()=>checkSpeech('word');
  $('#recognizeSentence').onclick=()=>checkSpeech('sentence');
  function move(delta){
    if(state.recording||state.checking)return status('Finish the current attempt before changing words.');
    state.selectionToken++;cleanup();
    if(state.mode==='due'){state.position=0;state.queueItems=null;}
    else state.position=(state.position+queue().length+delta)%queue().length;
    render();
  }
  $('#previous').onclick=()=>move(-1);
  $('#next').onclick=()=>move(1);
}
async function openUnit(id){
  if(state.recording||state.checking){alert('Finish the current attempt before changing units.');$('#pronUnit').value=state.unitId;return;}
  const token=++state.selectionToken;
  cleanup();
  $('#pronApp').innerHTML='<section class="panel">Loading selected unit…</section>';
  try{
    const entry=state.catalog.find(e=>e.id===id);
    if(!entry)throw new Error('Unit not found in the vocabulary catalog.');
    const unit=await loadCatalogUnit(entry);
    if(token!==state.selectionToken)return;
    state.unitId=id;state.unit=unit;state.position=0;state.queueItems=null;
    localStorage.setItem(key,id);
    render();
  }catch(error){$('#pronApp').innerHTML=`<section class="panel"><h2>Unable to load unit</h2><p>${esc(error.message)}</p></section>`;}
}
async function start(){
  try{
    state.catalog=await loadCatalog();
    const saved=localStorage.getItem(key);
    await openUnit(state.catalog.some(u=>u.id===saved)?saved:state.catalog[0].id);
  }catch(error){$('#pronApp').innerHTML=`<section class="panel"><h2>Unable to start</h2><p>${esc(error.message)}</p><p>Start the local HTTP server and regenerate the catalog if necessary.</p></section>`;}
}
window.addEventListener('beforeunload',cleanup);
start();
