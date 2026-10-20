/** Applies the local VocabLab 1.3 Pronunciation Lab 2.0 patch. No GitHub actions. */
import {readFile,writeFile,copyFile,access} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const mainFile=join(root,'js','main.js');
const indexFile=join(root,'index.html');
for (const f of ['pronunciation.html','css/pronunciation.css','js/pronunciation/main.js','js/pronunciation/player.js','js/pronunciation/progress.js']) await access(join(root,f));
const originalMain=await readFile(mainFile,'utf8');
const originalIndex=await readFile(indexFile,'utf8');
const marker='href="pronunciation.html"';
if(originalIndex.includes(marker)){
  console.log('Pronunciation Lab 2.0 is already linked. No changes made.');
  process.exit(0);
}
let main=originalMain,index=originalIndex;
function replaceOnce(text,oldPart,newPart,label){
  const pos=text.indexOf(oldPart);
  if(pos<0 || text.indexOf(oldPart,pos+oldPart.length)>=0) throw new Error(`${label}: unexpected source layout. No files changed.`);
  return text.slice(0,pos)+newPart+text.slice(pos+oldPart.length);
}
const oldNavigation=/<button data-view="pronounce">[\s\S]*?<\/button>/g;
const hits=index.match(oldNavigation);
if(!hits||hits.length!==1)throw new Error('Could not safely find Pronunciation Lab navigation. No files changed.');
index=index.replace(oldNavigation,'<a class="rail-package-link" href="pronunciation.html">◌ <span>Pronunciation lab</span></a>');
const oldClick="        getElement('#' + id).onclick = () => navigate(dest);";
const newClick="        getElement('#' + id).onclick = () => dest === 'pronounce' ? window.location.assign('pronunciation.html') : navigate(dest);";
main=replaceOnce(main,oldClick,newClick,'Dashboard pronunciation link');
// Old pronunciation attempts were unverified. Do not create further legacy 'success' records.
main=replaceOnce(main,
  '    record(activeUnitId, x.id, skill, ok, verified);',
  "    if (skill !== 'pronunciation') record(activeUnitId, x.id, skill, ok, verified);",
  'Legacy score protection');
// Legacy pronunciation reviews cannot measure pronunciation. Scheduling is now on the 2.0 page.
main=replaceOnce(main,
  "        session = dueItems(activeUnitId, items()).filter((task) => task.skill !== 'listening' || canDictate(task.item));",
  "        session = dueItems(activeUnitId, items()).filter((task) => task.skill !== 'pronunciation' && (task.skill !== 'listening' || canDictate(task.item)));",
  'Legacy review filtering');
const legacyMastery="const xs = items(), due = dueItems(activeUnitId, xs), avg = xs.length ? xs.reduce((a, x) => a + mastery(activeUnitId, x.id), 0) / xs.length : 0;";
// Keep existing mastery and records unchanged, but identify them as historical where shown.
main=replaceOnce(main,legacyMastery,
  "const xs = items(), due = dueItems(activeUnitId, xs).filter(t => t.skill !== 'pronunciation'), avg = xs.length ? xs.reduce((a, x) => a + mastery(activeUnitId, x.id), 0) / xs.length : 0;",
  'Dashboard review count');
main=replaceOnce(main,
  '<span class="label">Overall mastery</span>',
  '<span class="label">Historical mastery*</span>',
  'Mastery disclaimer');
main=replaceOnce(main,
  '<p class="hint">Skills with scheduled reviews.</p>',
  '<p class="hint">Meaning, listening and usage reviews. Pronunciation review is in Pronunciation Lab 2.0.</p>',
  'Review disclaimer');
// No modifications are written unless every anchor matched.
await copyFile(mainFile,mainFile+'.before-pronunciation-2.bak');
await copyFile(indexFile,indexFile+'.before-pronunciation-2.bak');
await writeFile(mainFile,main,'utf8');
await writeFile(indexFile,index,'utf8');
console.log('Pronunciation Lab 2.0 linked locally. Original main.js and index.html backed up as .bak files.');
