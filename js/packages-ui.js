/** Content package review and publishing interface. */
import { downloadJSON, library, normalize } from './core.js';
import { parseContentPackage, inspectPackage, publishMany, exportContentPackage, validateFileSize } from './package-core.js';
const getElement = (selector) => document.querySelector(selector);
const escapeHTML = s => String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[c]));
let contentPackage = null, unitReviewStates = [], activeUnitIndex = 0, searchQuery = '';
/** Map content provenance identifiers to honest, user-facing labels. */
function getContentOriginLabel(contentOrigin) {
    switch (contentOrigin) {
        case 'source-reviewed':
        case 'pdf-topic-source':
            return 'Source reviewed';
        case 'pedagogical-extension':
        case 'original-thematic-extension':
            return 'Pedagogical extension';
        default:
            return 'Not specified';
    }
}
function message(t, isError = false) {
    const el = getElement('#result');
    el.hidden = false;
    el.textContent = t;
    el.classList.toggle('error', isError);
    el.scrollIntoView({
        behavior: 'smooth', block: 'nearest'
    });
}
function loaded(data) {
    contentPackage = parseContentPackage(data);
    unitReviewStates = contentPackage.units.map(unit => ({
        unit, selected: true, approved: false
    }));
    activeUnitIndex = 0;
    searchQuery = '';
    getElement('#filterUnits').value = '';
    getElement('#packageTitle').textContent = contentPackage.title;
    getElement('#packageDescription').textContent = contentPackage.description;
    getElement('#packageBadge').textContent = contentPackage.coverage === 'expanded-curated-partial' ? 'Review required' : contentPackage.coverage === 'partial' ? 'Review required' : 'Importable package';
    getElement('#workspace').hidden = false;
    getElement('#result').hidden = true;
    renderAll();
    getElement('#workspace').scrollIntoView({
        behavior: 'smooth', block: 'start'
    });
}
function score() {
    const totals = unitReviewStates.reduce((acc, s) => {
        acc.all += s.unit.items.length;
        if (s.selected) {
            acc.selected++;
            acc.selectedItems += s.unit.items.length;
            if (s.approved)
                acc.approved++;
        }
        return acc;
    }, {
        selected: 0, approved: 0, all: 0, selectedItems: 0
    });
    const inspected = inspectPackage(unitReviewStates.map(s => s.unit), library());
    const conflicts = inspected.filter(x => x.conflict).length;
    const existing = new Map();
    for (const u of Object.values(library()))
        for (const it of u.items) {
            const k = normalize(it.word);
            if (k)
                existing.set(k, true);
        }
    const wordMap = new Map();
    let duplicates = 0;
    for (const s of unitReviewStates)
        for (const it of s.unit.items) {
            const k = normalize(it.word);
            if (existing.has(k) || wordMap.has(k))
                duplicates++;
            wordMap.set(k, true);
        }
    getElement('#summary').innerHTML = `<div class="metric"><b>${unitReviewStates.length}</b>units</div><div class="metric"><b>${totals.all}</b>items</div><div class="metric"><b>${totals.approved} / ${totals.selected}</b>approved units</div><div class="metric"><b>${conflicts}</b>existing unit IDs</div><div class="metric"><b>${duplicates}</b>repeated words*</div>`;
    getElement('#validation').textContent = `*Words may appear across multiple units with different meanings. Progress is tracked by unit and item IDs. Example collections may have incomplete textbook coverage. Review each content source and its audit.`;
    getElement('#publishCount').textContent = `${totals.approved} approved units out of ${totals.selected} selected. Publishing uses a single atomic write.`;
}
function renderList() {
    const previousScroll = getElement('#unitsList').parentElement.scrollTop;
    const matched = unitReviewStates.map((s, i) => ({
        s, i
    })).filter(({ s }) => `${s.unit.number ?? ''} ${s.unit.title} ${s.unit.category || ''}`.toLowerCase().includes(searchQuery));
    getElement('#unitsList').innerHTML = matched.map(({ s, i }) => `<div class="unit-line ${i === activeUnitIndex ? 'active' : ''}"><label title="Publish unit"><input type="checkbox" data-select="${i}" ${s.selected ? 'checked' : ''} aria-label="Select unit ${i + 1}"></label><button style="border:0;background:transparent;text-align:left;padding:0" data-open="${i}"><strong>${escapeHTML(s.unit.title)}</strong>${s.approved ? '<span class="smallpill">reviewed</span>' : ''}<span class="hint">${escapeHTML(s.unit.category || 'General')} · ${s.unit.items.length} items · ${s.unit.coverage === 'expanded-curated-partial' ? 'expanded · review pending' : s.unit.coverage === 'starter-curated-partial' ? 'partial' : 'custom'}</span></button></div>`).join('') || '<p class="hint">No units found.</p>';
    getElement('#unitsList').querySelectorAll('[data-open]').forEach(b => b.onclick = () => {
        activeUnitIndex = Number(b.dataset.open);
        renderList();
        renderDetails();
    });
    getElement('#unitsList').querySelectorAll('[data-select]').forEach(c => c.onchange = () => {
        unitReviewStates[Number(c.dataset.select)].selected = c.checked;
        unitReviewStates[Number(c.dataset.select)].approved = false;
        renderAll();
    });
    getElement('#unitsList').parentElement.scrollTop = previousScroll;
}
function renderDetails() {
    const s = unitReviewStates[activeUnitIndex];
    if (!s)
        return;
    const u = s.unit, duplicates = inspectPackage([u], library())[0];
    getElement('#details').innerHTML = `<div class="between"><div><h3>${escapeHTML(u.title)}</h3><span class="hint">${escapeHTML(u.bookTitle || 'Personal collection')} · ${escapeHTML(u.category || 'General')} · ${u.sourcePage ? `Source p. ${u.sourcePage}` : 'page not specified'}</span></div><span class="chip">${u.items.length} items</span></div>
 <p class="hint">${duplicates.conflict ? 'Unit already installed. The selected conflict policy will be applied.' : ''} ${duplicates.duplicates ? `${duplicates.duplicates} term(s) also appear in the current library.` : ''}</p>
 <div class="buttonrow"><button id="approveUnit" class="${s.approved ? 'ghost' : 'primary'}">${s.approved ? '✓ Review approved' : '✓ Approve after review'}</button><button id="addWord" class="ghost">+ New item</button><button id="removeUnit" class="ghost">Remove from selection</button></div>
 <div class="table-wrap"><table><thead><tr><th></th><th>Word / phrase</th><th>Source</th><th>Translation</th><th>IPA (optional)</th><th>Original example</th></tr></thead><tbody>${u.items.map((x, i) => `<tr><td><button type="button" class="ghost" data-drop="${i}" title="Delete item">×</button></td><td><input data-edit="word" data-index="${i}" value="${escapeHTML(x.word)}" aria-label="Word"></td><td><span class="hint">${escapeHTML(getContentOriginLabel(x.contentOrigin))}</span></td><td><input data-edit="pt" data-index="${i}" value="${escapeHTML(x.pt)}" aria-label="Translation"></td><td><input data-edit="ipa" data-index="${i}" value="${escapeHTML(x.ipa)}" placeholder="/…/" aria-label="IPA"></td><td><textarea data-edit="example" data-index="${i}" aria-label="Example sentence">${escapeHTML(x.example)}</textarea></td></tr>`).join('')}</tbody></table></div><p class="hint">Editing an item revokes approval for this unit. Original example sentences can be edited.</p>`;
    getElement('#approveUnit').onclick = () => {
        if (!s.selected)
            s.selected = true;
        if (!s.unit.items.length) {
            message('A unit cannot be empty.', true);
            return;
        }
        try {
            parseContentPackage(s.unit);
            s.approved = !s.approved;
            renderAll();
        }
        catch (e) {
            message(e.message, true);
        }
    };
    getElement('#addWord').onclick = () => {
        s.unit.items.push({
            id: `new-item-${Date.now().toString(36)}`, word: '', pt: '', ipa: '', section: s.unit.category || 'General', example: '', note: '', audio: ''
        });
        s.approved = false;
        renderAll();
    };
    getElement('#removeUnit').onclick = () => {
        s.selected = false;
        s.approved = false;
        renderAll();
    };
    getElement('#details').querySelectorAll('[data-drop]').forEach(b => b.onclick = () => {
        s.unit.items.splice(Number(b.dataset.drop), 1);
        s.approved = false;
        renderAll();
    });
    getElement('#details').querySelectorAll('[data-edit]').forEach(x => x.oninput = () => {
        s.unit.items[Number(x.dataset.index)][x.dataset.edit] = x.value;
        s.approved = false;
        getElement('#approveUnit').textContent = '✓ Approve after review';
        getElement('#approveUnit').className = 'primary';
        score();
    });
}
function renderAll() {
    renderList();
    renderDetails();
    score();
}
async function openFile(file) {
    if (!file)
        return;
    try {
        validateFileSize(file);
        loaded(JSON.parse(await file.text()));
    }
    catch (e) {
        message('Unable to open package: ' + e.message, true);
    }
}
getElement('#openFile').onclick = () => getElement('#fileInput').click();
getElement('#fileInput').onchange = e => {
    openFile(e.target.files?.[0]);
    e.target.value = '';
};
getElement('#selectAll').onclick = () => {
    unitReviewStates.forEach(s => s.selected = true);
    renderAll();
};
getElement('#selectNone').onclick = () => {
    unitReviewStates.forEach(s => {
        s.selected = false;
        s.approved = false;
    });
    renderAll();
};
getElement('#approveAll').onclick = () => {
    const selected = unitReviewStates.filter(s => s.selected);
    if (!selected.length)
        return message('Select at least one unit.', true);
    if (!confirm(`Have you reviewed all ${selected.length} selected units? This action marks them approved; it does not automatically verify pedagogical quality.`))
        return;
    try {
        for (const s of selected)
            parseContentPackage(s.unit);
        selected.forEach(s => s.approved = true);
        renderAll();
    }
    catch (e) {
        message('Some content is still invalid: ' + e.message, true);
    }
};
getElement('#filterUnits').oninput = e => {
    searchQuery = e.target.value.toLowerCase().trim();
    renderList();
};
getElement('#downloadReviewed').onclick = () => {
    const approved = unitReviewStates.filter(s => s.selected && s.approved).map(s => s.unit);
    if (!approved.length)
        return message('Approve at least one unit first.', true);
    try {
        for (const u of approved)
            parseContentPackage(u);
        downloadJSON(exportContentPackage(contentPackage, approved), contentPackage.id + '-reviewed.json');
        message(`Reviewed package exported with ${approved.length} units.`);
    }
    catch (e) {
        message(e.message, true);
    }
};
getElement('#publish').onclick = () => {
    const selected = unitReviewStates.filter(s => s.selected), approved = selected.filter(s => s.approved);
    if (!selected.length)
        return message('Select at least one unit.', true);
    if (approved.length !== selected.length)
        return message(`${selected.length - approved.length} selected unit(s) are not approved yet. Review or deselect them.`, true);
    try {
        const result = publishMany(approved.map(s => s.unit), getElement('#conflictPolicy').value);
        message(`Import completed: ${result.added} new units, ${result.updated} updated and ${result.skipped} skipped. Open the VocabLab library to study.`);
        renderAll();
    }
    catch (e) {
        message('Publishing failed: ' + e.message, true);
    }
};
getElement('#downloadTemplate').onclick = () => downloadJSON({
    format: 'vocablab-content-package', version: 1, id: 'my-course-01', title: 'My English Course', description: 'Vocabulary units organized by topic', units: [{
            id: 'course-01-unit-01', title: 'Unit 01 — Meetings', level: 'B1', bookId: 'my-course-01', bookTitle: 'My English Course', category: 'Work', items: [{
                    id: 'deadline', word: 'deadline', pt: 'prazo final', ipa: '/ˈdedlaɪn/', section: 'Meetings', example: 'We need to meet the deadline.', note: '', audio: ''
                }
            ]
        }
    ]
}, 'vocablab-package-template-v1.2.json');
