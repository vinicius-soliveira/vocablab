import {downloadJSON,library,normalize} from './core.js';
import {parseContentPackage,inspectPackage,publishMany,exportContentPackage,validateFileSize} from './package-core.js';
const $=s=>document.querySelector(s);
const escapeHTML=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let pack=null,states=[],active=0,search='';
function message(t,isError=false){const el=$('#result');el.hidden=false;el.textContent=t;el.classList.toggle('error',isError);el.scrollIntoView({behavior:'smooth',block:'nearest'})}
function loaded(data){
 pack=parseContentPackage(data);
 states=pack.units.map(unit=>({unit,selected:true,approved:false}));active=0;search='';$('#filterUnits').value='';
 $('#packageTitle').textContent=pack.title;$('#packageDescription').textContent=pack.description;
 $('#packageBadge').textContent=pack.coverage==='partial'?'Cobertura inicial parcial':'Pacote importável';
 $('#workspace').hidden=false;$('#result').hidden=true;
 renderAll();$('#workspace').scrollIntoView({behavior:'smooth',block:'start'});
}
function score(){const totals=states.reduce((acc,s)=>{acc.all+=s.unit.items.length;if(s.selected){acc.selected++;acc.selectedItems+=s.unit.items.length;if(s.approved)acc.approved++}return acc},{selected:0,approved:0,all:0,selectedItems:0});
 const inspected=inspectPackage(states.map(s=>s.unit),library());const conflicts=inspected.filter(x=>x.conflict).length;
 const existing=new Map();for(const u of Object.values(library()))for(const it of u.items){const k=normalize(it.word);if(k)existing.set(k,true)}
 const wordMap=new Map();let duplicates=0;
 for(const s of states)for(const it of s.unit.items){const k=normalize(it.word);if(existing.has(k)||wordMap.has(k))duplicates++;wordMap.set(k,true)}
 $('#summary').innerHTML=`<div class="metric"><b>${states.length}</b>unidades</div><div class="metric"><b>${totals.all}</b>itens</div><div class="metric"><b>${totals.approved} / ${totals.selected}</b>unidades revisadas</div><div class="metric"><b>${conflicts}</b>IDs já instalados</div><div class="metric"><b>${duplicates}</b>repetições de palavras*</div>`;
 $('#validation').textContent=`*Repetições entre unidades são permitidas: as palavras podem aparecer em contextos diferentes. O histórico existente permanece associado ao ID da unidade e do item. O pacote de exemplo apresenta vocabulário selecionado, não todas as palavras do livro.`;
 $('#publishCount').textContent=`${totals.approved} unidades aprovadas de ${totals.selected} selecionadas. A publicação é feita em uma única operação.`;
}
function renderList(){const previousScroll=$('#unitsList').parentElement.scrollTop;
 const matched=states.map((s,i)=>({s,i})).filter(({s})=>`${s.unit.number??''} ${s.unit.title} ${s.unit.category||''}`.toLowerCase().includes(search));
 $('#unitsList').innerHTML=matched.map(({s,i})=>`<div class="unit-line ${i===active?'active':''}"><label title="Publicar unidade"><input type="checkbox" data-select="${i}" ${s.selected?'checked':''} aria-label="Selecionar unidade ${i+1}"></label><button style="border:0;background:transparent;text-align:left;padding:0" data-open="${i}"><strong>${escapeHTML(s.unit.title)}</strong>${s.approved?'<span class="smallpill">revisada</span>':''}<span class="hint">${escapeHTML(s.unit.category||'General')} · ${s.unit.items.length} itens · ${s.unit.coverage==='starter-curated-partial'?'parcial':'personalizada'}</span></button></div>`).join('')||'<p class="hint">Nenhuma unidade encontrada.</p>';
 $('#unitsList').querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>{active=Number(b.dataset.open);renderList();renderDetails()});
 $('#unitsList').querySelectorAll('[data-select]').forEach(c=>c.onchange=()=>{states[Number(c.dataset.select)].selected=c.checked;states[Number(c.dataset.select)].approved=false;renderAll()});
 $('#unitsList').parentElement.scrollTop=previousScroll;
}
function renderDetails(){const s=states[active];if(!s)return;
 const u=s.unit,duplicates=inspectPackage([u],library())[0];
 $('#details').innerHTML=`<div class="between"><div><h3>${escapeHTML(u.title)}</h3><span class="hint">${escapeHTML(u.bookTitle||'Coleção pessoal')} · ${escapeHTML(u.category||'Geral')} · ${u.sourcePage?`PDF p. ${u.sourcePage}`:'página não indicada'}</span></div><span class="chip">${u.items.length} itens</span></div>
 <p class="hint">${duplicates.conflict?'Unidade já instalada. A política de conflito será aplicada ao publicar.':''} ${duplicates.duplicates?`${duplicates.duplicates} termo(s) também aparece(m) na biblioteca atual.`:''}</p>
 <div class="buttonrow"><button id="approveUnit" class="${s.approved?'ghost':'primary'}">${s.approved?'✓ Revisão aprovada':'✓ Aprovar após revisar'}</button><button id="addWord" class="ghost">+ Novo item</button><button id="removeUnit" class="ghost">Remover da seleção</button></div>
 <div class="table-wrap"><table><thead><tr><th></th><th>Palavra / expressão</th><th>Tradução</th><th>IPA (opcional)</th><th>Exemplo original</th></tr></thead><tbody>${u.items.map((x,i)=>`<tr><td><button type="button" class="ghost" data-drop="${i}" title="Excluir item">×</button></td><td><input data-edit="word" data-index="${i}" value="${escapeHTML(x.word)}" aria-label="Palavra"></td><td><input data-edit="pt" data-index="${i}" value="${escapeHTML(x.pt)}" aria-label="Tradução"></td><td><input data-edit="ipa" data-index="${i}" value="${escapeHTML(x.ipa)}" placeholder="/…/" aria-label="IPA"></td><td><textarea data-edit="example" data-index="${i}" aria-label="Frase exemplo">${escapeHTML(x.example)}</textarea></td></tr>`).join('')}</tbody></table></div><p class="hint">Modificar um item retira a aprovação desta unidade. Os exemplos foram redigidos para o VocabLab e podem ser editados.</p>`;
 $('#approveUnit').onclick=()=>{if(!s.selected)s.selected=true;if(!s.unit.items.length){message('Uma unidade não pode ficar vazia.',true);return}try{parseContentPackage(s.unit);s.approved=!s.approved;renderAll()}catch(e){message(e.message,true)}};
 $('#addWord').onclick=()=>{s.unit.items.push({id:`new-item-${Date.now().toString(36)}`,word:'',pt:'',ipa:'',section:s.unit.category||'General',example:'',note:'',audio:''});s.approved=false;renderAll()};
 $('#removeUnit').onclick=()=>{s.selected=false;s.approved=false;renderAll()};
 $('#details').querySelectorAll('[data-drop]').forEach(b=>b.onclick=()=>{s.unit.items.splice(Number(b.dataset.drop),1);s.approved=false;renderAll()});
 $('#details').querySelectorAll('[data-edit]').forEach(x=>x.oninput=()=>{s.unit.items[Number(x.dataset.index)][x.dataset.edit]=x.value;s.approved=false;$('#approveUnit').textContent='✓ Aprovar após revisar';$('#approveUnit').className='primary';score()});
}
function renderAll(){renderList();renderDetails();score()}
async function openFile(file){if(!file)return;try{validateFileSize(file);loaded(JSON.parse(await file.text()))}catch(e){message('Não foi possível abrir o pacote: '+e.message,true)}}
$('#openFile').onclick=()=>$('#fileInput').click();$('#fileInput').onchange=e=>{openFile(e.target.files?.[0]);e.target.value=''};
$('#loadExample').onclick=async()=>{try{const response=await fetch('packages/english-vocabulary-in-use-elementary-starter.json');if(!response.ok)throw Error('Arquivo não encontrado');loaded(await response.json())}catch(e){message('Falha ao carregar exemplo: '+e.message,true)}};
$('#selectAll').onclick=()=>{states.forEach(s=>s.selected=true);renderAll()};
$('#selectNone').onclick=()=>{states.forEach(s=>{s.selected=false;s.approved=false});renderAll()};
$('#approveAll').onclick=()=>{const selected=states.filter(s=>s.selected);if(!selected.length)return message('Selecione ao menos uma unidade.',true);
 if(!confirm(`Você revisou as ${selected.length} unidades selecionadas? Este comando marca todas como aprovadas, sem revisar automaticamente a qualidade pedagógica.`))return;
 try{for(const s of selected)parseContentPackage(s.unit);selected.forEach(s=>s.approved=true);renderAll()}catch(e){message('Ainda há conteúdo inválido: '+e.message,true)}
};
$('#filterUnits').oninput=e=>{search=e.target.value.toLowerCase().trim();renderList()};
$('#downloadReviewed').onclick=()=>{const approved=states.filter(s=>s.selected&&s.approved).map(s=>s.unit);if(!approved.length)return message('Primeiro aprove uma ou mais unidades.',true);
 try{for(const u of approved)parseContentPackage(u);downloadJSON(exportContentPackage(pack,approved),pack.id+'-reviewed.json');message(`Pacote revisado exportado com ${approved.length} unidades.`)}catch(e){message(e.message,true)}
};
$('#publish').onclick=()=>{const selected=states.filter(s=>s.selected),approved=selected.filter(s=>s.approved);if(!selected.length)return message('Selecione ao menos uma unidade.',true);
 if(approved.length!==selected.length)return message(`Há ${selected.length-approved.length} unidade(s) selecionada(s) que ainda não foram aprovadas. Revise ou desmarque essas unidades.`,true);
 try{const result=publishMany(approved.map(s=>s.unit),$('#conflictPolicy').value);message(`Importação concluída: ${result.added} unidade(s) novas, ${result.updated} atualizada(s) e ${result.skipped} ignorada(s). Abra a biblioteca do VocabLab para estudar.`);renderAll()}
 catch(e){message('Falha ao publicar: '+e.message,true)}
};
$('#downloadTemplate').onclick=()=>downloadJSON({format:'vocablab-content-package',version:1,id:'my-course-01',title:'My English Course',description:'Unidades de vocabulário organizadas por tema',units:[{id:'course-01-unit-01',title:'Unit 01 — Meetings',level:'B1',bookId:'my-course-01',bookTitle:'My English Course',category:'Work',items:[{id:'deadline',word:'deadline',pt:'prazo final',ipa:'/ˈdedlaɪn/',section:'Meetings',example:'We need to meet the deadline.',note:'',audio:''}]}]},'vocablab-package-template-v1.1.json');
