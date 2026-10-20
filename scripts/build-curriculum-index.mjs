/** Generate the public book-driven index; never scan localStorage or legacy pilot folders. */
import {readFile,writeFile} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildCurriculumIndex} from '../js/curriculum/index.js';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=async path=>JSON.parse(await readFile(join(root,path),'utf8'));
const index=buildCurriculumIndex(await read('curriculum/books.json'),await read('database/manifest.json'),await read('database/grammar-manifest.json'));
await writeFile(join(root,'curriculum/index.json'),JSON.stringify(index,null,2)+'\n');
console.log(`Curriculum index: ${index.availableBooks} available / ${index.books.length} total books, ${index.totalUnits} units.`);
