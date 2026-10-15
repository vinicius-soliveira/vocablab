/** Build grammar/manifest.json from independently authored grammar unit files. */
import {readdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,dirname,join,relative,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateGrammarUnit,validateGrammarManifest} from '../js/grammar/schema.js';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const unitsDir=join(root,'grammar','units');
const entries=[];
const ids=new Set();
for(const file of (await readdir(unitsDir)).filter(n=>n.endsWith('.json')).sort()) {
  const filePath=join(unitsDir,file);
  const unit=validateGrammarUnit(JSON.parse(await readFile(filePath,'utf8')));
  if(ids.has(unit.id)) throw new Error(`Duplicate grammar unit: ${unit.id}`);
  ids.add(unit.id);
  if(file!==unit.id+'.json') throw new Error(`Grammar unit filename must match ID: ${file}`);
  entries.push({id:unit.id,title:unit.title,level:unit.level,topicId:unit.topicId,
    exerciseCount:unit.exercises.length,speakingCount:unit.speakingExercises?.length || 0,
    listeningCount:unit.listeningExercises?.length || 0,
    path:relative(root,filePath).split(sep).join('/')});
}
if(!entries.length) throw new Error('No grammar unit files found.');
entries.sort((a,b)=>a.level.localeCompare(b.level)||a.title.localeCompare(b.title));
validateGrammarManifest({format:'vocablab-grammar-catalog',version:1,units:entries});
await writeFile(join(root,'grammar','manifest.json'),JSON.stringify({format:'vocablab-grammar-catalog',version:1,units:entries},null,2)+'\n','utf8');
console.log(`Grammar catalog generated: ${entries.length} units, ${entries.reduce((n,e)=>n+e.exerciseCount,0)} exercises.`);
