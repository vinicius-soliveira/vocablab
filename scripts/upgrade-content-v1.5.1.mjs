#!/usr/bin/env node
/** Apply minimal, fail-closed changes to the v1.5.0 pipeline. Safe to rerun. */
import {readFile,writeFile} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const file=join(root,'scripts/content.mjs');
let original=await readFile(file,'utf8');
// Git on Windows may check out source files with CRLF line endings.
// Match anchors against normalized LF, then restore the original line endings.
const sourceNewline=original.includes('\r\n')?'\r\n':'\n';
let code=original.replace(/\r\n/g,'\n');
if(code.includes('async function publishStagingUnlocked(options)') && code.includes('export async function publishStaging(options)')){
  console.log('Content pipeline v1.5.1 upgrade already applied.');
  process.exit(0);
}
function replace(from,to,label){
  if(!code.includes(from))throw new Error(`Cannot upgrade: expected v1.5.0 anchor missing (${label}). No file was changed.`);
  if(code.split(from).length!==2)throw new Error(`Ambiguous v1.5.0 anchor (${label}). No file was changed.`);
  code=code.replace(from,to);
}
replace("import { readFile, readdir, writeFile, mkdir, rm, lstat } from 'node:fs/promises';",
  "import { readFile, readdir, writeFile, mkdir, rm, lstat, open, rmdir } from 'node:fs/promises';",'fs imports');
replace("import { auditBooks } from './audit-books.mjs';",
  "import { auditBooks } from './audit-books.mjs';\nimport { checkIdentities, addPublishedBookIdentity, identityPath } from './content-identities.mjs';\nimport { auditReport } from './content-audit-report.mjs';",'new imports');
replace('export async function publishStaging(options) {\n  const plan=await inspectStaging(options);pass(plan);await checkNotPublished(plan);',
  "async function publishStagingUnlocked(options) {\n  const plan=await inspectStaging(options);pass(plan);await checkIdentities(plan.root);await checkNotPublished(plan);",'preflight');
replace("join(plan.root,'curriculum','index.json')];",
  "join(plan.root,'curriculum','index.json'),identityPath(plan.root)];",'rollback managed files');
replace("createdFiles.push(name);}\n    await writeFile(registryPath,",
  "createdFiles.push(name);}\n    await options.onPhase?.('after-files');\n    await writeFile(registryPath,",'file checkpoint');
replace("runScript(plan.root,'build-catalog.mjs');",
  "await options.onPhase?.('after-registry');\n    runScript(plan.root,'build-catalog.mjs');",'registry checkpoint');
replace("    await auditBooks(plan.root);\n    await verifyPublished({root:plan.root,bookId:plan.book.id,expected:plan.expected});",
  "    await options.onPhase?.('after-catalogs');\n    await auditBooks(plan.root);\n    await addPublishedBookIdentity(plan.root,plan.book.id);\n    await options.onPhase?.('after-identity');\n    await verifyPublished({root:plan.root,bookId:plan.book.id,expected:plan.expected});",'identity baseline on publication');
replace("if(createdDir)try{await rm(plan.destination,{recursive:true,force:true});}",
  "if(createdDir)try{await rmdir(plan.destination);}",'safe rollback directory removal');
replace('/** Ensure published units, generated manifests and the book registry agree. */',
`/** Exclusive, local publication lock; a stale lock after a crash requires manual inspection. */
export async function publishStaging(options) {
  const root=resolve(options?.root || DEFAULT_ROOT);
  const lock=join(root,'.content-publish.lock');
  let handle;
  try {
    handle=await open(lock,'wx');
    await handle.writeFile(JSON.stringify({pid:process.pid,started:new Date().toISOString()})+'\\n');
  } catch(e) {
    if(handle)await handle.close();
    if(e.code==='EEXIST')throw new Error('Another publication may be in progress (.content-publish.lock exists). Inspect before removing the lock.');
    throw e;
  }
  try {return await publishStagingUnlocked({...options,root});}
  finally {await handle.close();await rm(lock,{force:true});}
}
/** Ensure published units, generated manifests and the book registry agree. */`, 'exclusive publication lock');
replace("  await auditBooks(root);\n  return {mode:'verify'",
  "  await auditBooks(root);\n  await checkIdentities(root,{bookId});\n  return {mode:'verify'",'verify identities');
replace("await writeFile(out,JSON.stringify(result,null,2)+'\\n');".replace('\\\\n','\\n'),
  "await writeFile(out,JSON.stringify(auditReport(plan),null,2)+'\\n');".replace('\\\\n','\\n'), 'structured audit report');

const pkgFile=join(root,'package.json');
const pkg=JSON.parse(await readFile(pkgFile,'utf8'));
if(pkg.version!=='1.5.0' && pkg.version!=='1.5.1')throw new Error('Expected package.json version 1.5.0 or 1.5.1; no files changed.');
pkg.version='1.5.1';
pkg.scripts['content:identities']='node scripts/content-identities.mjs check';
const ignoreFile=join(root,'.gitignore');
const ignore=await readFile(ignoreFile,'utf8');
// Apply the changes only after every anchor and input has passed validation.
await writeFile(file,code.replace(/\n/g,sourceNewline),'utf8');
await writeFile(pkgFile,JSON.stringify(pkg,null,2)+'\n','utf8');
if(!ignore.includes('.content-publish.lock'))await writeFile(ignoreFile,ignore.replace(/\s*$/,'')+'\n\n# Content publisher coordination file\n.content-publish.lock\n','utf8');
console.log('Upgraded VocabLab content pipeline to v1.5.1. Next: initialize published identity baseline.');
