/** Safely add Grammar Lab navigation without replacing the existing index.html. */
import {readFile, writeFile, copyFile, access} from 'node:fs/promises';
import {resolve, dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const target=join(root,'index.html');
const backup=join(root,'index.html.before-grammar-lab.bak');
const content=await readFile(target,'utf8');
const marker='href="grammar.html"';
if(content.includes(marker)) {
  console.log('Grammar Lab navigation already present; nothing changed.');
  process.exit(0);
}
const anchor='<a class="rail-package-link" href="packages.html">';
if(!content.includes(anchor)) {
  throw new Error('Could not locate the original Content Packages link in index.html; no files were modified.');
}
try { await access(backup); throw new Error('Backup already exists: index.html.before-grammar-lab.bak. Please move it before retrying.'); }
catch(e) { if(e.code!=='ENOENT') throw e; }
await copyFile(target,backup);
const inserted='<a class="rail-package-link" href="grammar.html">\n      ✎\n      <span>Grammar Lab</span>\n</a>\n';
await writeFile(target, content.replace(anchor, inserted+anchor),'utf8');
console.log('Grammar Lab navigation installed in index.html.');
console.log('Original index saved as index.html.before-grammar-lab.bak.');
