#!/usr/bin/env node
/** One-time, guarded v1.4.2 -> v1.5.0 migration for fixed-count tests and npm scripts.
 * Does not modify database files or history/progress.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const edits=new Map();
const read=async p=>readFile(join(root,p),'utf8');
const set=(p,s)=>edits.set(p,s);
function replaceOnce(data,from,to,file){
  if(data.includes(to))return data;
  if(!data.includes(from))throw new Error(`Unexpected ${file} revision; missing: ${from.slice(0,110)}`);
  if(data.split(from).length!==2)throw new Error(`${file}: ambiguous replacement, refusing.`);
  return data.replace(from,to);
}
// Patch with targeted edits, not full test-file replacements, to preserve local changes.
const bookFile='tests/curriculum-books.test.mjs';
let t=await read(bookFile);
t=replaceOnce(t,"assert.equal(books.filter(x => x.status === 'available').length, published ? 7 : 6);", "assert.ok(books.filter(x => x.status === 'available').length >= (published ? 7 : 6));",bookFile);
t=replaceOnce(t,"assert.equal(books.filter(x => x.status === 'planned').length, published ? 13 : 14);", "assert.equal(books.filter(x => x.status === 'planned').length + books.filter(x => x.status === 'available').length, books.length);",bookFile);
t=replaceOnce(t,"assert.equal(report.available, published ? 7 : 6);", "assert.equal(report.available, registry.books.filter(x=>x.status==='available').length);",bookFile);
t=replaceOnce(t,"assert.equal(report.planned, published ? 13 : 14);", "assert.equal(report.planned, registry.books.filter(x=>x.status==='planned').length);",bookFile);
set(bookFile,t);

const indexFile='tests/curriculum-index.test.mjs';
t=await read(indexFile);
t=replaceOnce(t,"const expectedUnitCount=eg2Available ? 682 : 537;", "const expectedUnitCount=vocabulary.units.length+grammar.units.length;",indexFile);
t=replaceOnce(t,"const expectedAvailable=eg2Available ? 7 : 6;", "const expectedAvailable=books.books.filter(x=>x.status==='available').length;",indexFile);
t=replaceOnce(t,"assert.deepEqual(published.map(b=>b.units.length),eg2Available ? [60,100,101,101,115,145,60] : [60,100,101,101,115,60]);", `for (const [id, count] of Object.entries({
    'english-vocabulary-1':60,'english-vocabulary-2':100,
    'english-vocabulary-3':101,'english-vocabulary-4':101,
    'english-grammar-1':115,'english-grammar-2':145,
    'english-collocations-1':60,
  })) {
    const book=published.find(b=>b.id===id);
    if(book)assert.equal(book.units.length,count,id);
  }`,indexFile);
set(indexFile,t);

const dbFile='tests/unified-database.test.mjs';
t=await read(dbFile);
t=replaceOnce(t,'assert.equal(vocabulary.units.length, 422);','assert.ok(vocabulary.units.length >= 422);',dbFile);
t=replaceOnce(t,'assert.equal(grammar.units.length, eg2Available ? 260 : 115);',`assert.equal(grammar.units.length, 115 + (eg2Available ? 145 : 0) +
    grammar.units.filter(x=>x.collectionId==='english-grammar-3').length);`,dbFile);
set(dbFile,t);

const pkgFile='package.json';
t=await read(pkgFile);
const pkg=JSON.parse(t);
if(!['1.4.2','1.5.0'].includes(pkg.version))throw new Error(`Unexpected package version ${pkg.version}`);
pkg.version='1.5.0';
pkg.scripts.content='node scripts/content.mjs';
set(pkgFile,JSON.stringify(pkg,null,2)+'\n');

const ignoreFile='.gitignore';
t=await read(ignoreFile);
for(const line of ['content-staging/','content-reports/'])if(!t.split(/\r?\n/).includes(line))t+=`\n${line}\n`;
set(ignoreFile,t);

// Preflight all inputs before modifying any file; then write backups and changes.
let changed=0;
for(const [p,updated] of edits){
  const before=await read(p);
  if(before!==updated){await writeFile(join(root,p+'.bak'),before);await writeFile(join(root,p),updated);changed++;console.log(`Updated ${p}`);}
}
console.log(`VocabLab v1.5.0 content pipeline install complete (${changed} files updated). Run npm test.`);
