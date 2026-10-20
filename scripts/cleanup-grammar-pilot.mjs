/** Explicit cleanup for the ten legacy root-level Grammar Lab pilot lessons. */
import {unlink,access} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const ids=['grammar-b1-articles','grammar-b1-past-simple-present-perfect','grammar-b1-prepositions',
  'grammar-b1-present-perfect','grammar-b1-verb-patterns','grammar-b2-conditionals',
  'grammar-b2-modal-verbs','grammar-b2-passive','grammar-b2-relative-clauses','grammar-b2-reported-speech'];
const apply=process.argv.includes('--apply');
let found=0;
for(const id of ids){
  const path=join(root,'grammar','units',`${id}.json`);
  try{await access(path);}catch{continue;}
  found++;
  if(apply){await unlink(path);console.log(`Removed ${id}.json`);}
  else console.log(`Would remove ${id}.json`);
}
console.log(apply?`Removed ${found} legacy grammar files. Saved browser progress was NOT touched.`:`Dry run: ${found} legacy grammar files found. Add --apply to delete ONLY these files.`);
