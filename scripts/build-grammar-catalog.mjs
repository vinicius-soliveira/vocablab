/** Build Grammar Lab manifest from independently authored JSONs in exactly three collections. */
import {mkdir,readdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,dirname,join,relative,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateGrammarUnit,validateGrammarManifest} from '../js/grammar/schema.js';
import {GRAMMAR_COLLECTIONS,grammarCatalogEntry} from '../js/grammar/collections.js';

export async function buildGrammarCatalog(root){
  const entries=[],ids=new Set();
  for(const collection of GRAMMAR_COLLECTIONS){
    const dir=join(root,'database',collection.folder);
    await mkdir(dir,{recursive:true});
    for(const file of (await readdir(dir)).filter(x=>x.endsWith('.json')).sort()){
      const filePath=join(dir,file);
      const unit=validateGrammarUnit(JSON.parse(await readFile(filePath,'utf8')));
      const entry=grammarCatalogEntry(unit,relative(root,filePath).split(sep).join('/'));
      if(file!==`${unit.id}.json`)throw new Error(`Grammar unit filename must match ID: ${file}`);
      if(ids.has(unit.id))throw new Error(`Duplicate grammar unit: ${unit.id}`);
      ids.add(unit.id);entries.push(entry);
    }
  }
  const counts=Object.fromEntries(GRAMMAR_COLLECTIONS.map(c=>[c.id,0]));
  entries.forEach(e=>counts[e.collectionId]++);
  entries.sort((a,b)=>GRAMMAR_COLLECTIONS.findIndex(c=>c.id===a.collectionId)-GRAMMAR_COLLECTIONS.findIndex(c=>c.id===b.collectionId)||a.number-b.number);
  const manifest={format:'vocablab-grammar-catalog',version:1,
    collections:GRAMMAR_COLLECTIONS.map(c=>({id:c.id,title:c.title,level:c.level,book:c.book,edition:c.edition,unitCount:counts[c.id]})),units:entries};
  validateGrammarManifest(manifest);
  const path=join(root,'database','grammar-manifest.json');
  await mkdir(dirname(path),{recursive:true});
  await writeFile(path,JSON.stringify(manifest,null,2)+'\n','utf8');
  return {units:entries.length,exercises:entries.reduce((n,e)=>n+e.exerciseCount,0),collections:counts};
}

if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
  try{const result=await buildGrammarCatalog(root);
    console.log(`Grammar catalog generated: ${result.units} units, ${result.exercises} written exercises.`);
    for(const c of GRAMMAR_COLLECTIONS)console.log(`  ${c.title}: ${result.collections[c.id]} units`);
  }catch(err){console.error(`Grammar catalog failed: ${err.message}`);process.exitCode=1;}
}
