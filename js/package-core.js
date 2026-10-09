import {validateUnit,library,save,normalize} from './core.js';
const LIB='vocablab.library.v1';
const MAX_BYTES=1_800_000;
export function parseContentPackage(data){
 if (!data || typeof data!=='object'||Array.isArray(data)) throw Error('Conteúdo JSON inválido.');
 let source;
 if (Array.isArray(data.units)) {
  if (data.format!=='vocablab-content-package'||data.version!==1) throw Error('Formato de pacote incompatível. Use vocablab-content-package, version: 1.');
  source=data.units;
 } else if (Array.isArray(data.items)) source=[data]; // backwards-compatible with v1.0
 else throw Error('Este JSON não contém units[] nem items[].');
 if(!source.length||source.length>200)throw Error('O pacote deve conter de 1 a 200 unidades.');
 const seen=new Set(); let total=0;
 const units=source.map((u,i)=>{
  const checked=validateUnit(u);
  if(seen.has(checked.id))throw Error(`ID de unidade duplicado: ${checked.id}`);
  seen.add(checked.id);total+=checked.items.length;
  return {
   ...checked,number:Number.isInteger(u.number)?u.number:null,
   bookId:typeof u.bookId==='string'?u.bookId.slice(0,160):String(data.bookId||''),
   bookTitle:typeof u.bookTitle==='string'?u.bookTitle.slice(0,160):String(data.title||''),
   category:typeof u.category==='string'?u.category.slice(0,120):'',
   coverage:u.coverage==='starter-curated-partial'?'starter-curated-partial':'user-curated',
   sourcePage:Number.isInteger(u.sourcePage)?u.sourcePage:null,
   packageId:String(data.id||checked.id).slice(0,160),
  };
 });
 if(total>12000)throw Error('Este pacote excede 12.000 itens; divida em pacotes menores.');
 return {
  id:String(data.id||units[0].id).slice(0,160),
  title:String(data.title||units[0].title).slice(0,200),
  description:String(data.description||'').slice(0,1000),
  coverage:String(data.coverage||'custom'), units,
 };
}
export function inspectPackage(units,existing=library()){
 const index=new Map();
 for(const [id,u] of Object.entries(existing))for(const x of u.items||[]){const k=normalize(x.word);if(k){if(!index.has(k))index.set(k,[]);index.get(k).push(id)}}
 const stats=[];const incoming=new Map();
 for(const u of units){let duplicates=0,own=0;
  for(const it of u.items){const k=normalize(it.word);if(index.has(k))duplicates++;if(incoming.has(k))own++;incoming.set(k,true)}
  stats.push({id:u.id,conflict:!!existing[u.id],duplicates,within:own,items:u.items.length});
 }
 return stats;
}
export function publishMany(units,policy='merge'){
 if(!['merge','replace','skip'].includes(policy)) throw Error('Política de conflitos inválida.');
 if(!units.length)throw Error('Aprove ao menos uma unidade antes de importar.');
 // Validate all before any write. One write avoids leaving a partially imported package.
 const existing=library(),draft={...existing};let added=0,updated=0,skipped=0;
 for(const candidate of units){const checked=parseContentPackage(candidate.items?{items:candidate.items,...candidate}:candidate).units[0];
  const old=draft[checked.id];
  if(old&&policy==='skip'){skipped++;continue}
  if(!old){draft[checked.id]=checked;added++;continue}
  if(policy==='replace'){draft[checked.id]=checked;updated++;continue}
  // Merge keeps older words absent from the new release, updating matching item IDs.
  const merged=new Map(old.items.map(i=>[i.id,i]));
  for(const item of checked.items)merged.set(item.id,item);
  draft[checked.id]={...old,...checked,items:[...merged.values()]};updated++;
 }
 const json=JSON.stringify(draft);
 if(new Blob([json]).size>4_000_000)throw Error('Biblioteca excederia 4 MB de dados. Exporte backup e importe um pacote menor.');
 try {localStorage.setItem(LIB,json)} catch(e){throw Error('Sem espaço no navegador. Exporte um backup e remova pacotes que não usa. '+e.message)}
 return {added,updated,skipped};
}
export function exportContentPackage(pack,units){
 return {format:'vocablab-content-package',version:1,id:pack.id,title:pack.title,description:pack.description,coverage:pack.coverage,
  units:units.map(u=>({...u,items:u.items.map(i=>({...i}))}))};
}
export function validateFileSize(file){if(file.size>MAX_BYTES)throw Error('Arquivo maior que 1,8 MB. Divida o pacote em vários arquivos.');}
