/** One-time, idempotent migration of VocabLab 1.2 to read-only catalog loading. */
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const mainFile = join(root, 'js/main.js');
const htmlFile = join(root, 'index.html');
const pkgFile = join(root, 'package.json');
const original = await readFile(mainFile, 'utf8');
if (original.includes("import { loadCatalog, loadCatalogUnit } from './catalog.js';")) {
  console.log('Catalog migration was already applied; no changes necessary.');
  process.exit(0);
}
let main = original;
const swap = (before, after, label) => {
  if (!main.includes(before)) throw new Error(`Cannot migrate main.js: unexpected ${label} (wrong application version?).`);
  main = main.replace(before, after);
};

swap("import { install, library, remove,", "import { library, remove,", 'core imports');
swap("const getElement = (selector) => document.querySelector(selector);",
  "import { loadCatalog, loadCatalogUnit } from './catalog.js';\nconst getElement = (selector) => document.querySelector(selector);", 'catalog import');
swap("let view = 'dashboard', activeUnitId = localStorage.getItem('vocablab.active.v1') || 'unit-03',",
  "let view = 'dashboard', activeUnitId = localStorage.getItem('vocablab.active.v1') || 'evie-3ed-u01',", 'initial unit');
const at = "const unit = () => units[activeUnitId], items = () => unit()?.items || [];";
swap(at, `let catalogEntries = new Map();
let loadedCatalogUnitId = null;
function syncUnitsFromLibrary() {
    units = library(); // Only personal content is stored in localStorage.
    for (const entry of catalogEntries.values()) {
        units[entry.id] = { ...entry, source: entry.bookTitle, items: [] };
    }
    loadedCatalogUnitId = null;
}
async function ensureUnitLoaded(id) {
    if (!catalogEntries.has(id) || loadedCatalogUnitId === id) return;
    const data = await loadCatalogUnit(catalogEntries.get(id));
    if (loadedCatalogUnitId) {
        const previous = catalogEntries.get(loadedCatalogUnitId);
        units[previous.id] = { ...previous, source: previous.bookTitle, items: [] };
    }
    units[id] = data;
    loadedCatalogUnitId = id;
}
${at}`, 'catalog state');

const oldBoot = `function chooseUnit(id) {
    activeUnitId = id;
    localStorage.setItem('vocablab.active.v1', id);
    lessonIndex = 0;
    navigate('dashboard');
}
async function start() {
    try {
        for (const path of ['data/unit-03.json', 'data/workplace-original.json']) {
            const response = await fetch(path);
            if (!response.ok)
                throw Error('Failed to load ' + path);
            const seed = await response.json();
            if (!library()[seed.id])
                install(seed);
        }
        units = library();
        const r = await fetch('data/minimal-pairs.json');
        pairs = await r.json();
        if (!units[activeUnitId])
            activeUnitId = Object.keys(units)[0];
        setup();
        render();
    }
    catch (e) {
        getElement('#app').innerHTML = \`<section class="panel"><h2>Unable to start</h2><p>\${escapeHtml(e.message)}</p><p>Start the server with <code>python -m http.server 8085 --bind 127.0.0.1</code> and open http://127.0.0.1:8085.</p></section>\`;
    }
}`;
const newBoot = `async function chooseUnit(id) {
    try {
        if (!units[id]) throw new Error('Unknown vocabulary unit: ' + id);
        await ensureUnitLoaded(id);
        activeUnitId = id;
        localStorage.setItem('vocablab.active.v1', id);
        lessonIndex = 0;
        navigate('dashboard');
    }
    catch (error) { toast('Could not open unit: ' + error.message); }
}
async function start() {
    try {
        catalogEntries = new Map((await loadCatalog()).map(entry => [entry.id, entry]));
        syncUnitsFromLibrary();
        const response = await fetch('data/minimal-pairs.json');
        if (!response.ok) throw new Error('Could not load pronunciation exercises.');
        pairs = await response.json();
        if (!units[activeUnitId]) activeUnitId = catalogEntries.keys().next().value || Object.keys(units)[0];
        if (!activeUnitId) throw new Error('No vocabulary units are available.');
        await ensureUnitLoaded(activeUnitId);
        setup();
        render();
    }
    catch (error) {
        getElement('#app').innerHTML = \`<section class="panel"><h2>Unable to start</h2><p>\${escapeHtml(error.message)}</p><p>Run <code>npm run catalog</code>, then start your local server using <code>python -m http.server 8085</code>.</p></section>\`;
    }
}`;
swap(oldBoot, newBoot, 'initialization and unit selection');

const beforeLib = 'function showLibrary() {';
const afterLib = 'async function importData(e) {';
const libStart = main.indexOf(beforeLib), libEnd = main.indexOf(afterLib);
if (libStart < 0 || libEnd < libStart) throw new Error('Could not identify library rendering function.');
const newLib = `function showLibrary() {
    const all = Object.values(units);
    const groups = new Map();
    for (const u of all) {
        const group = u.bookTitle || u.source || 'Personal collections';
        if (!groups.has(group)) groups.set(group, []);
        groups.get(group).push(u);
    }
    getElement('#app').innerHTML = \`<section class="panel"><div class="between"><div><h2>Content library</h2><p class="hint">Select a book and a unit to start studying. Content loads automatically.</p></div><a class="ghost" href="packages.html">Custom JSON packages</a></div><label style="margin-top:17px">Search units or books<input id="librarySearch" type="search" placeholder="e.g. Unit 41, Grammar, Elementary"></label><p class="hint">\${all.length} available units across \${groups.size} collections.</p><div id="libraryGroups"></div></section>\`;
    const renderCards = () => {
        const q = normalize(getElement('#librarySearch').value);
        const activeGroup = unit()?.bookTitle || unit()?.source;
        getElement('#libraryGroups').innerHTML = [...groups.entries()].map(([group, collection]) => {
            const matches = collection.filter(u => !q || normalize(group + ' ' + u.title + ' ' + u.category + ' ' + u.source).includes(q)).sort((a,b) => (a.number ?? 999) - (b.number ?? 999));
            if (!matches.length) return '';
            const open = q || activeGroup === group ? 'open' : '';
            return \`<details \${open} style="margin:16px 0"><summary style="cursor:pointer;padding:12px 2px"><strong>\${escapeHtml(group)}</strong> · \${matches.length} units</summary><div class="grid">\${matches.map(u => \`<article class="small-card"><span class="chip">\${escapeHtml(u.level)}</span><h3 style="margin-top:13px">\${escapeHtml(u.title)}</h3><p class="hint">\${u.itemsCount ?? u.items.length} items · \${escapeHtml(u.category || '').slice(0,100)}</p><div class="buttonrow"><button class="primary" data-open="\${escapeHtml(u.id)}">\${u.id === activeUnitId ? 'Current' : 'Study'}</button><button class="ghost" data-export="\${escapeHtml(u.id)}">Export</button>\${catalogEntries.has(u.id) || ['unit-03','workplace-communication'].includes(u.id) ? '' : \`<button class="ghost" data-delete="\${escapeHtml(u.id)}">Remove</button>\`}</div></article>\`).join('')}</div></details>\`;
        }).join('') || '<p class="hint">No units found.</p>';
        document.querySelectorAll('[data-open]').forEach(button => button.onclick = () => chooseUnit(button.dataset.open));
        document.querySelectorAll('[data-export]').forEach(button => button.onclick = async () => {
            try {
                const id = button.dataset.export;
                const data = catalogEntries.has(id) ? await loadCatalogUnit(catalogEntries.get(id)) : units[id];
                downloadJSON(data, id + '.json');
            } catch (error) { toast('Could not export unit: ' + error.message); }
        });
        document.querySelectorAll('[data-delete]').forEach(button => button.onclick = async () => {
            const id = button.dataset.delete;
            if (catalogEntries.has(id)) return;
            if (!confirm('Remove this custom unit? Its progress will be retained.')) return;
            remove(id);
            syncUnitsFromLibrary();
            if (id === activeUnitId) {
                activeUnitId = catalogEntries.keys().next().value || Object.keys(units)[0];
                if (activeUnitId) await ensureUnitLoaded(activeUnitId);
            } else if (activeUnitId) {
                await ensureUnitLoaded(activeUnitId);
            }
            render();
        });
    };
    getElement('#librarySearch').oninput = renderCards;
    renderCards();
}
`;
main = main.slice(0, libStart) + newLib + main.slice(libEnd);
swap(`        units = library();
        activeUnitId = units[activeUnitId] ? activeUnitId : Object.keys(units)[0];
        render();
        toast('Backup restored.');`,
`        syncUnitsFromLibrary();
        activeUnitId = units[activeUnitId] ? activeUnitId : catalogEntries.keys().next().value || Object.keys(units)[0];
        if (activeUnitId) await ensureUnitLoaded(activeUnitId);
        render();
        toast('Backup restored.');`, 'backup restoration');
swap('<h3>Installed packages</h3>', '<h3>Available units</h3>', 'dashboard label');
swap('Import new units anytime without editing JavaScript.', 'Choose a unit from any available collection.', 'dashboard hint');
swap('↓ Full backup', '↓ Progress + custom content backup', 'backup label');

const html = await readFile(htmlFile, 'utf8');
const packageConfig = JSON.parse(await readFile(pkgFile, 'utf8'));
packageConfig.version = '1.3.0';
packageConfig.scripts ||= {};
packageConfig.scripts.catalog = 'node scripts/build-catalog.mjs';
await Promise.all([
  writeFile(mainFile, main),
  writeFile(htmlFile, html.replaceAll('VocabLab 1.2', 'VocabLab 1.3').replace('STUDIO · 1.2', 'STUDIO · 1.3')),
  writeFile(pkgFile, JSON.stringify(packageConfig, null, 2) + '\n'),
]);
console.log('Local catalog changes applied. Run npm run catalog, npm test, then start your server.');
