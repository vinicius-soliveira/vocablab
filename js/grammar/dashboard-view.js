/** Read-only local dashboard. Chart SVGs use static markup, not remote libraries. */
import {buildGrammarDashboard, DASHBOARD_PERIODS} from './dashboard.js';
import {getGrammarHistory} from './history.js';

const escapeHtml=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const formatPercent=(successes,attempts)=>attempts?`${Math.round(successes/attempts*100)}%`:'—';
const toPercent=ratio=>ratio===null?'—':`${Math.round(ratio*100)}%`;
const skillName=s=>({recognition:'Recognition',production:'Writing',speaking:'Speaking',listening:'Listening'}[s]||s);
const dateLabel=ts=>new Date(ts).toLocaleDateString('en',{month:'short',day:'numeric'});
const labels=[[7,'7 days'],[30,'30 days'],[90,'90 days'],[0,'All time']];

function drawTrend(model) {
  const points=model.trend;
  if(!model.stats.attempts)return `<div class="grammar-dashboard-empty"><strong>No recorded attempts in this period.</strong><p class="hint">Complete a Grammar Lab exercise to start your learning timeline. Earlier cumulative progress has no dated history.</p></div>`;
  const width=760,height=230,left=38,right=15,top=22,bottom=40;
  const cw=(width-left-right)/points.length;
  const plotHeight=height-top-bottom;
  const max=Math.max(1,...points.map(x=>x.attempts));
  const y=n=>top+plotHeight*(1-n/max);
  const pY=r=>top+plotHeight*(1-r);
  const grid=[0,0.5,1].map(frac=>{let yp=pY(frac);return `<line x1="${left}" y1="${yp}" x2="${width-right}" y2="${yp}" class="grammar-db-grid"/><text x="${left-7}" y="${yp+4}" text-anchor="end" class="grammar-db-axis">${Math.round(frac*100)}%</text>`;}).join('');
  const bars=points.map((v,i)=>{
    const bx=left+i*cw+cw*0.16,bw=cw*.68;
    const bh=v.attempts/max*(plotHeight*.8);
    return `<rect x="${bx.toFixed(1)}" y="${(top+plotHeight-bh).toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(0,bh).toFixed(1)}" rx="4" class="grammar-db-bar"><title>${escapeHtml(dateLabel(v.start))}: ${v.attempts} answers, ${toPercent(v.accuracy)} accuracy</title></rect>`;
  }).join('');
  let segments=[],current=[];
  points.forEach((v,i)=>{
    if(v.accuracy===null){if(current.length)segments.push(current);current=[];return;}
    const px=left+(i+.5)*cw,py=pY(v.accuracy);
    current.push(`${px.toFixed(1)},${py.toFixed(1)}`);
  });
  if(current.length)segments.push(current);
  const paths=segments.filter(s=>s.length>1).map(s=>`<polyline points="${s.join(' ')}" class="grammar-db-line"/>`).join('');
  const dots=points.map((v,i)=>v.accuracy===null?'':`<circle class="grammar-db-dot" cx="${(left+(i+.5)*cw).toFixed(1)}" cy="${pY(v.accuracy).toFixed(1)}" r="4"><title>${escapeHtml(dateLabel(v.start))}: ${toPercent(v.accuracy)} (${v.successes}/${v.attempts})</title></circle>`).join('');
  const xTicks=points.map((v,i)=>`<text x="${(left+(i+.5)*cw).toFixed(1)}" y="${height-14}" text-anchor="middle" class="grammar-db-axis">${escapeHtml(dateLabel(v.start))}</text>`).join('');
  return `<div class="grammar-db-chart-scroll"><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Study history: answer counts as bars and accuracy as a line. Empty intervals are not scored." class="grammar-db-chart"><title>Recorded attempts and accuracy over time</title>${grid}${bars}${paths}${dots}${xTicks}</svg></div>
    <div class="grammar-db-key"><span><i class="grammar-db-key-bar"></i> Answers (relative height)</span><span><i class="grammar-db-key-line"></i> Accuracy (0–100%)</span></div>
    <p class="hint">The line skips periods without answers; bars use a separate relative scale. Details below list the exact counts.</p>
    <div class="table-wrap"><table><thead><tr><th>Period starts</th><th>Answers</th><th>Accuracy</th></tr></thead><tbody>${points.map(v=>`<tr><td>${escapeHtml(dateLabel(v.start))}</td><td>${v.attempts}</td><td>${formatPercent(v.successes,v.attempts)}</td></tr>`).join('')}</tbody></table></div>`;
}
function skillBars(model) {
  return model.skillStats.map(s=>`<div class="grammar-db-skill">
    <div class="grammar-db-skill-head"><strong>${skillName(s.skill)}</strong><span>${toPercent(s.accuracy)} · ${s.attempts} answers · ${s.exercises} different exercises</span></div>
    <div class="grammar-db-track" role="progressbar" aria-label="${skillName(s.skill)} accuracy" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${s.accuracy===null?0:Math.round(s.accuracy*100)}" aria-valuetext="${s.accuracy===null?'No attempts':toPercent(s.accuracy)}"><span style="width:${s.accuracy===null?0:(s.accuracy*100).toFixed(1)}%"></span></div>
  </div>`).join('');
}
function topicTable(model) {
  const observed=model.topics.filter(t=>t.attempts>0||t.due>0).sort((a,b)=>b.due-a.due||b.attempts-a.attempts);
  if(!observed.length)return `<p class="hint">No studied lessons or pending reviews yet.</p>`;
  return `<div class="table-wrap"><table><thead><tr><th>Lesson</th><th>Answers in period</th><th>Accuracy</th><th>Reviews due</th><th></th></tr></thead><tbody>
    ${observed.map(t=>`<tr><td><strong>${escapeHtml(t.title)}</strong><div class="hint">${escapeHtml(t.level)} · ${t.exercises} different exercises</div></td><td>${t.attempts}</td><td>${toPercent(t.accuracy)}</td><td>${t.due}</td><td><button type="button" class="ghost" data-action="open" data-id="${escapeHtml(t.id)}">Open</button></td></tr>`).join('')}
    </tbody></table></div>`;
}
export function renderGrammarDashboard({catalog,progress,days=30,now=Date.now(),storage=localStorage}={}) {
  if(!DASHBOARD_PERIODS.includes(days)) throw new Error('Invalid dashboard period.');
  const model=buildGrammarDashboard(getGrammarHistory(storage),catalog,progress,{days},now);
  const statCards=[
    ['Answers in period',model.stats.attempts],
    ['Observed accuracy',formatPercent(model.stats.successes,model.stats.attempts)],
    ['Sessions with answers',model.stats.sessions],
    ['Different exercises',model.stats.exercises],
    ['Delayed reviews (24h+)',`${model.stats.delayedAttempts} · ${toPercent(model.delayedAccuracy)}`],
    ['All-time exercise coverage',`${model.totalPracticed}/${model.totalAvailable}`],
    ['Reviews due now',model.dueCount],
    ['Approx. answer time',`${Math.round(model.stats.durationMs/60000)} min`]
  ];
  const periodOptions=labels.map(([v,t])=>`<option value="${v}" ${days===v?'selected':''}>${t}</option>`).join('');
  const insights=model.focus.length?model.focus.map(t=>`<li><strong>${escapeHtml(t.title)}</strong> — ${t.due?`${t.due} review${t.due===1?'':'s'} due`: `${toPercent(t.accuracy)} across ${t.attempts} answers`}. <button type="button" class="grammar-text-button" data-action="open" data-id="${escapeHtml(t.id)}">Open lesson</button></li>`).join(''):
    `<li>Nothing flagged yet. Complete different exercises over multiple days to build a more informative history.</li>`;
  return {model, html:`<div class="stack grammar-dashboard">
    <section class="panel"><div class="between"><div><h2>Learning overview</h2><p class="hint">Grammar Lab only · actual recorded answers, not a CEFR assessment.</p></div>
      <label class="grammar-db-period">Time range<select id="grammarDashboardPeriod" aria-label="Dashboard time range">${periodOptions}</select></label></div>
      <div class="grammar-progress-grid grammar-db-cards">${statCards.map(([k,v])=>`<div class="small-card"><span class="label">${k}</span><strong>${v}</strong></div>`).join('')}</div>
      <p class="hint grammar-db-note">Period filters apply to dated attempts; all-time coverage and reviews due use existing cumulative progress. History starts when Learning History was installed and retains at most 8,000 attempts.</p>
      <div class="buttonrow"><button type="button" class="ghost" data-action="history">See detailed history</button><button type="button" class="ghost" data-action="progress">Grammar progress & backup</button></div>
    </section>
    <section class="panel"><div class="between"><div><h2>Learning trend</h2><p class="hint">How many questions you answered and your accuracy over time.</p></div><span class="chip">${model.stats.attempts} answers</span></div>${drawTrend(model)}</section>
    <section class="panel"><h2>Performance by skill</h2><p class="hint">Correct answers divided by attempts in the selected period. A small sample can be misleading; speech transcription matches are not pronunciation scores.</p>${skillBars(model)}</section>
    <section class="panel"><h2>Lessons to revisit</h2><p class="hint">Based on reviews due, or at least three answers with accuracy below 70% in the selected period. These are study suggestions, not mastery ratings.</p><ul class="grammar-db-focus">${insights}</ul></section>
    <section class="panel"><h2>Performance by lesson</h2><p class="hint">Accuracy covers only dated attempts in the selected period. Due reviews reflect current saved progress.</p>${topicTable(model)}</section>
    <p class="hint">No audio, transcriptions or typed responses are collected for these charts. Older study progress is preserved but cannot be reconstructed as a dated trend.</p>
  </div>`};
}
