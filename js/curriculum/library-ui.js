/** Books Library: read-only user interface over generated curriculum/index.json. */
import {loadCurriculumIndex,summarizeBookProgress} from './index.js';
const $=query=>document.querySelector(query);
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const read=key=>{try{const value=JSON.parse(localStorage.getItem(key)||'{}');return value && typeof value==='object'&&!Array.isArray(value)?value:{}}catch{return {}}};
const state={index:null,bookId:null,search:'',level:'all',shown:24};
let lexical={},grammar={};
const details=b=>summarizeBookProgress(b,lexical,grammar);
const matchesLevel=(entryLevel,filter)=>filter==='all' || entryLevel.split(/[^A-C1-2]+/).includes(filter) || entryLevel.includes(filter);
const unitURL=u=>`${u.provider==='grammar'?'grammar.html':'index.html'}?unit=${encodeURIComponent(u.id)}`;
const showMore=()=>{state.shown+=24;renderBook();};
function updateUrl(){const url=new URL(window.location.href);if(state.bookId)url.searchParams.set('book',state.bookId);else url.searchParams.delete('book');history.replaceState(null,'',url);}
function openBook(id){if(!state.index.books.some(b=>b.id===id && b.status==='available'))return;
  state.bookId=id;state.search='';state.level='all';state.shown=24;updateUrl();renderBook();window.scrollTo(0,0);
}
function selectLibrary(){state.bookId=null;state.search='';state.level='all';updateUrl();renderHome();window.scrollTo(0,0);}
function bindBookLinks(){document.querySelectorAll('[data-book]').forEach(a=>a.addEventListener('click',e=>{e.preventDefault();openBook(a.dataset.book)}));}
function renderHome(){const available=state.index.books.filter(b=>b.status==='available');
  const planned=state.index.books.filter(b=>b.status==='planned');
  $('#pageTitle').textContent='Books Library';$('#pageDescription').textContent='Choose an available book, then open the unit you want to study.';
  $('#libraryCounter').textContent=`${state.index.totalUnits} units · ${available.length} books`;
  $('#app').innerHTML=`<section class="panel"><div class="between"><div><h2>Available books</h2><p class="hint">Progress is read from your existing Vocabulary and Grammar records.</p></div><a class="ghost library-link" href="packages.html">Custom JSON packages</a></div>
   <div class="library-toolbar"><label>Search books or units<input id="bookSearch" type="search" placeholder="e.g. Grammar, Collocations, Present Simple" autocomplete="off"></label>
     <label style="max-width:170px">Level<select id="bookLevel"><option value="all">All levels</option>${['A1','A2','B1','B2','C1','C2'].map(x=>`<option value="${x}">${x}</option>`).join('')}</select></label></div>
   <div class="library-books" id="availableBooks"></div><p class="hint" id="noBooks" hidden>No books match this search.</p>
   <details class="library-planned"><summary>${planned.length} planned books · view roadmap</summary><div class="library-planned-grid">${planned.map(b=>`<span>${esc(b.title)} · ${b.levels.join('–')}</span>`).join('')}</div></details></section>`;
  const filter=()=>{const q=$('#bookSearch').value.toLowerCase().trim(),level=$('#bookLevel').value;
    const filtered=available.filter(b=>(level==='all'||b.levels.includes(level)) && (!q||b.title.toLowerCase().includes(q)||b.units.some(u=>`${u.title} ${u.level} ${u.number}`.toLowerCase().includes(q))));
    $('#noBooks').hidden=filtered.length>0;
    $('#availableBooks').innerHTML=filtered.map(b=>{const stats=details(b);
      return `<a href="library.html?book=${encodeURIComponent(b.id)}" class="library-book" data-book="${esc(b.id)}"><div class="book-top"><span class="chip">${esc(b.levels.join('–'))}</span><span class="hint">${b.units.length} units</span></div>
         <h3>${esc(b.title)}</h3><p class="hint">${stats.started} started · ${stats.complete} completed</p>
         <div class="library-progress"><i style="width:${stats.total?Math.round(stats.complete/stats.total*100):0}%"></i></div>
         <div class="book-foot"><span>${stats.due} reviews due</span><span>Browse units →</span></div></a>`}).join('');
    bindBookLinks();
  };
  $('#bookSearch').oninput=filter;$('#bookLevel').onchange=filter;filter();
}
function renderBook(){const b=state.index.books.find(x=>x.id===state.bookId && x.status==='available');if(!b){selectLibrary();return;}
  const stats=details(b);
  $('#pageTitle').textContent=b.title;$('#pageDescription').textContent='Follow the original book sequence, or search for a specific unit.';
  $('#libraryCounter').textContent=`${b.units.length} units · ${b.levels.join('–')}`;
  $('#app').innerHTML=`<a href="library.html" class="library-back" id="backToBooks">← All books</a>
    <section class="panel"><div class="library-book-detail"><div><span class="eyebrow">STUDY BY BOOK</span><h2>${esc(b.title)}</h2>
    <p class="hint">Select a lesson below to open it in ${b.provider==='grammar'?'Grammar Lab':'Vocabulary Lab'}.</p></div><span class="chip">${esc(b.levels.join('–'))}</span></div>
    <div class="library-stats"><span class="chip">${stats.started}/${stats.total} units started</span><span class="chip">${stats.complete} units completed</span><span class="chip">${stats.due} reviews due</span></div>
    <div class="library-toolbar"><label>Search this book<input type="search" id="unitSearch" placeholder="Search by title or unit number" autocomplete="off"></label>
      <label style="max-width:170px">Level<select id="unitLevel"><option value="all">All levels</option>${b.levels.map(l=>`<option value="${l}">${l}</option>`).join('')}</select></label></div>
    <p id="matchCount" class="hint"></p><div id="units" class="library-unit-list"></div><div class="buttonrow" id="moreRow"></div></section>`;
  $('#backToBooks').onclick=e=>{e.preventDefault();selectLibrary()};
  $('#unitSearch').value=state.search;$('#unitLevel').value=state.level;
  const filter=()=>{state.search=$('#unitSearch').value;state.level=$('#unitLevel').value;state.shown=24;paintUnits(b)};
  $('#unitSearch').oninput=filter;$('#unitLevel').onchange=filter;paintUnits(b);
}
function paintUnits(book){const q=state.search.toLowerCase().trim();const filtered=book.units.filter(u=>matchesLevel(u.level,state.level)&&(!q||`${u.title} ${u.number} ${u.level}`.toLowerCase().includes(q)));
  $('#matchCount').textContent=`${filtered.length} ${filtered.length===1?'unit':'units'} found`;
  $('#units').innerHTML=filtered.slice(0,state.shown).map(u=>`<article class="library-unit"><div><span class="chip">Unit ${String(u.number).padStart(3,'0')}</span> <span class="chip">${esc(u.level)}</span></div>
    <h3>${esc(u.title)}</h3><p class="unit-activity">${u.activityCount} ${u.provider==='grammar'?'exercises':'items'}</p>
    <div class="buttonrow"><a class="primary" href="${unitURL(u)}">Open ${u.provider==='grammar'?'lesson':'unit'} →</a></div></article>`).join('')||'<p class="library-empty">No units match your search.</p>';
  $('#moreRow').innerHTML=filtered.length>state.shown?`<button type="button" class="ghost" id="showMore">Show more (${filtered.length-state.shown} remaining)</button>`:'';
  if($('#showMore'))$('#showMore').onclick=showMore;
}
async function start(){try{state.index=await loadCurriculumIndex();lexical=read('vocablab.progress.v1');grammar=read('vocablab.grammar.progress.v1');
    const requested=new URLSearchParams(window.location.search).get('book');
    if(requested && state.index.books.some(b=>b.id===requested && b.status==='available')){state.bookId=requested;renderBook();}
    else renderHome();
  }catch(error){$('#app').innerHTML=`<section class="panel"><h2>Unable to load Books Library</h2><p>${esc(error.message)}</p><p>Run <code>npm run catalog:all</code> and restart the local server.</p></section>`;}}
start();
