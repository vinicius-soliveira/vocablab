/** Main application UI: study activities, navigation, and progress views. */
import { playText, getWordPlaybackText, stopAudio, listVoices, configureAudio, getAudioSettings, recognize, browserSupportsRecognition, startRecording, stopRecording } from './audio.js';
import { install, library, remove, profile, record, mastery, ordered, dueItems, skills, shuffle, same, normalize, downloadJSON, importBackup, makeBackup } from './core.js';
const getElement = (selector) => document.querySelector(selector);
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[c]));
let view = 'dashboard', activeUnitId = localStorage.getItem('vocablab.active.v1') || 'unit-03', units = {}, pairs = [], current = null, isAnswerSubmitted = false, session = [], position = 0, listeningMode = 'choice', lessonIndex = 0, pronunciationMode = 'words', minimalPairIndex = 0, minimalPairAnswer = '', recordingUrl = '', recording = false, activeTaskSkill = 'meaning', isReviewSession = false;
// Display metadata for the main application views.
const VIEW_METADATA = {
    dashboard: ['YOUR LEARNING SPACE', 'Overview', 'Adaptive vocabulary learning, independent of any textbook.'], learn: ['VOCABULARY', 'Explore & understand', 'Learn meanings, pronunciation, and examples in context.'], listen: ['LISTENING', 'Train your ears', 'Recognize spoken words without relying on text.'], pronounce: ['SPEAKING', 'Pronunciation lab', 'Compare reference audio, practice minimal pairs, and record your voice.'], use: ['ACTIVE VOCABULARY', 'Use & recall', 'Recall words from their meanings and use them in context.'], review: ['ADAPTIVE PRACTICE', 'Review queue', 'Review each skill at the appropriate time.'], library: ['CONTENT MANAGER', 'Unit library', 'Study content from books, lessons, or personal lists.'], progress: ['ANALYTICS', 'Learning progress', 'Track each skill and back up your progress.']
};
const unit = () => units[activeUnitId], items = () => unit()?.items || [];
function toast(t) {
    getElement('#toast').textContent = t;
    getElement('#toast').classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => getElement('#toast').classList.remove('show'), 4500);
}
function button(label, id, kind = 'ghost') {
    return `<button type="button" id="${id}" class="${kind}">${label}</button>`;
}
function navigate(x) {
    view = x;
    current = null;
    isAnswerSubmitted = false;
    position = 0;
    session = [];
    stopAudio();
    if (recordingUrl) {
        URL.revokeObjectURL(recordingUrl);
        recordingUrl = '';
    }
    ;
    render();
}
function chooseUnit(id) {
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
        getElement('#app').innerHTML = `<section class="panel"><h2>Unable to start</h2><p>${escapeHtml(e.message)}</p><p>Start the server with <code>python -m http.server 8085 --bind 127.0.0.1</code> and open http://127.0.0.1:8085.</p></section>`;
    }
}
function setup() {
    document.querySelectorAll('[data-view]').forEach(b => b.onclick = () => navigate(b.dataset.view));
    const d = getElement('#settings');
    getElement('#settingsBtn').onclick = () => {
        syncSettings();
        d.showModal();
    };
    getElement('#closeSettings').onclick = () => d.close();
    getElement('#stopVoice').onclick = stopAudio;
    getElement('#testVoice').onclick = () => playText('Today I am practising English pronunciation.', null, {
        forceTTS: true
    }).catch(e => toast(e.message));
    for (const [id, property] of [['rate', 'rate'], ['pitch', 'pitch'], ['volume', 'volume']])
        getElement('#' + id).oninput = e => {
            const value = Number(e.target.value);
            configureAudio({
                [property]: value
            });
            getElement('#' + id + 'V').textContent = property === 'volume' ? Math.round(value * 100) + '%' : value.toFixed(2) + '×';
        };
    for (const id of ['source', 'recognitionLang'])
        getElement('#' + id).onchange = e => configureAudio({
            [id]: e.target.value
        });
    getElement('#voice').onchange = e => configureAudio({
        voice: e.target.value
    });
    if (window.speechSynthesis)
        speechSynthesis.addEventListener('voiceschanged', syncVoices);
    syncSettings();
    getElement('#backupImporter').onchange = importData;
}
function syncVoices() {
    const voices = listVoices(), saved = getAudioSettings().voice;
    getElement('#voice').innerHTML = voices.map(v => `<option value="${escapeHtml(v.voiceURI)}">${escapeHtml(v.name)} · ${escapeHtml(v.lang)}</option>`).join('') || '<option value="">No English voices available</option>';
    const chosen = voices.find(v => v.voiceURI === saved) || voices[0];
    if (chosen) {
        getElement('#voice').value = chosen.voiceURI;
        configureAudio({
            voice: chosen.voiceURI
        });
    }
}
function syncSettings() {
    const s = getAudioSettings();
    for (const k of ['rate', 'pitch', 'volume']) {
        getElement('#' + k).value = s[k];
        getElement('#' + k + 'V').textContent = k === 'volume' ? Math.round(s[k] * 100) + '%' : Number(s[k]).toFixed(2) + '×';
    }
    getElement('#source').value = s.source;
    getElement('#recognitionLang').value = s.recognitionLang;
    syncVoices();
}
function header() {
    const m = VIEW_METADATA[view];
    getElement('#subtitle').textContent = m[0];
    getElement('#title').textContent = m[1];
    getElement('#description').textContent = m[2];
    getElement('#activeTitle').textContent = unit()?.title || 'No unit selected';
    getElement('#unitChip').textContent = `${items().length} items · ${unit()?.level || 'A1–A2'}`;
    document.querySelectorAll('[data-view]').forEach(b => b.classList.toggle('selected', b.dataset.view === view));
}
function render() {
    header();
    ({
        dashboard, learn, listen, pronounce, use, review, library: showLibrary, progress: showProgress
    }[view])();
}
const bar = p => `<div class="meter"><i style="width:${Math.min(100, Math.max(0, Math.round(p * 100)))}%"></i></div>`;
function dashboard() {
    const xs = items(), due = dueItems(activeUnitId, xs), avg = xs.length ? xs.reduce((a, x) => a + mastery(activeUnitId, x.id), 0) / xs.length : 0;
    getElement('#app').innerHTML = `<div class="grid"><section class="panel"><span class="label">Active vocabulary</span><div class="stat">${xs.length}</div><p class="hint">${escapeHtml(unit()?.title)}</p></section><section class="panel"><span class="label">Overall mastery</span><div class="stat">${Math.round(avg * 100)}%</div>${bar(avg)}</section><section class="panel"><span class="label">Reviews due</span><div class="stat">${due.length}</div><p class="hint">Skills with scheduled reviews.</p></section></div><div class="cols" style="margin-top:17px"><section class="panel"><h2>Your next session</h2><p>Practice each skill. Priority is based on accuracy, mistakes, and scheduled reviews.</p><div class="grid"><button class="option" id="dashLearn">◫ Learn · meaning</button><button class="option" id="dashListen">◉ Listen · recognition</button><button class="option" id="dashPron">◌ Pronunciation lab</button><button class="option" id="dashReview">↻ Adaptive review (${due.length})</button></div></section><section class="panel"><h3>Installed packages</h3><div class="stat">${Object.keys(units).length}</div><p class="hint">Import new units anytime without editing JavaScript.</p>${button('Manage packages', 'dashLibrary', 'primary')}</section></div>`;
    for (const [id, dest] of [['dashLearn', 'learn'], ['dashListen', 'listen'], ['dashPron', 'pronounce'], ['dashReview', 'review'], ['dashLibrary', 'library']])
        getElement('#' + id).onclick = () => navigate(dest);
}
/** Exclude grammatical templates from exact-transcription exercises. */
function canDictate(item) {
    return !item.speechText && /^[A-Za-z][A-Za-z '\-!?]*$/.test(item.word);
}
function makeSession(skill) {
    const availableItems = skill === 'listening' ? items().filter(canDictate) : items();
    session = ordered(activeUnitId, availableItems, skill).map(item => ({
        item, skill
    }));
    position = 0;
    isAnswerSubmitted = false;
    current = null;
}
function nextSession() {
    position++;
    isAnswerSubmitted = false;
    current = null;
    render();
}
function nextControl() {
    return `<div class="buttonrow">${button('Next →', 'next', 'primary')}</div>`;
}
function response(feedback, good) {
    return `<div class="${good ? 'success' : 'warning'}" role="status">${feedback}</div>${nextControl()}`;
}
function learn() {
    const xs = ordered(activeUnitId, items(), 'meaning');
    if (!xs.length)
        return;
    const x = xs[lessonIndex % xs.length];
    getElement('#app').innerHTML = `<div class="cols"><section class="panel"><div class="between"><span class="chip">${escapeHtml(x.section)}</span><span class="hint">${lessonIndex % xs.length + 1} / ${xs.length}</span></div><div class="center hero"><div class="word">${escapeHtml(x.word)}</div><div class="ipa">${escapeHtml(x.ipa)}</div><div class="buttonrow" style="justify-content:center">${button('▶ Word', 'wordAudio')}${button('▶ Sentence', 'sentenceAudio')}</div><p class="translation">${escapeHtml(x.pt)}</p><p><em>${escapeHtml(x.example)}</em></p></div>${x.note ? `<div class="note">💡 ${escapeHtml(x.note)}</div>` : ''}<div class="between" style="margin-top:20px">${button('← Previous', 'previous')}${button('Mark as studied ✓', 'known', 'primary')}${button('Next →', 'following')}</div></section>${skillPanel(x)}</div>`;
    getElement('#wordAudio').onclick = () => playWord(x);
    getElement('#sentenceAudio').onclick = () => playSentence(x);
    getElement('#previous').onclick = () => {
        lessonIndex = (lessonIndex + xs.length - 1) % xs.length;
        render();
    };
    getElement('#following').onclick = () => {
        lessonIndex++;
        render();
    };
    getElement('#known').onclick = () => {
        record(activeUnitId, x.id, 'meaning', true);
        lessonIndex++;
        render();
    };
}
function skillPanel(x) {
    return `<aside class="panel"><h3>Mastery by skill</h3>${skills.map(s => {
        const p = profile(activeUnitId, x.id)[s], v = p ? Math.round(100 * p.success / Math.max(1, p.attempts)) : 0;
        return `<div class="skill"><div class="between"><span class="hint">${s}</span><b>${v}%</b></div>${bar(v / 100)}</div>`;
    }).join('')}<p class="hint">Percentages are practice accuracy rates, not certified proficiency scores.</p></aside>`;
}
/** Play the saved MP3, or use browser speech when a recording is unavailable. */
function playWord(item) {
    const audioPath = item.audio || null;
    const spokenText = getWordPlaybackText(item);
    return playText(spokenText, audioPath).catch((error) => toast(error.message));
}
function playSentence(x) {
    return playText(x.example, null, {
        forceTTS: true
    }).catch(e => toast(e.message));
}
function studyTask(skill, fromReview = false) {
    if (!session.length)
        makeSession(skill);
    if (position >= session.length) {
        getElement('#app').innerHTML = `<section class="panel center"><h2>Session complete ✓</h2><p>Results have been recorded by skill.</p>${button('Restart', 'again', 'primary')}</section>`;
        getElement('#again').onclick = () => {
            session = [];
            render();
        };
        return null;
    }
    return session[position];
}
function studyCard(x, top, body) {
    getElement('#app').innerHTML = `<div class="cols"><section class="panel"><div class="between"><span class="chip">${escapeHtml(top)}</span><span class="hint">${position + 1} / ${session.length}</span></div>${body}<div id="result"></div></section>${skillPanel(x)}</div>`;
}
function finish(x, skill, ok, content, verified = true) {
    if (isAnswerSubmitted)
        return;
    isAnswerSubmitted = true;
    record(activeUnitId, x.id, skill, ok, verified);
    getElement('#result').innerHTML = response(content, ok);
    getElement('#next').onclick = () => nextSession();
}
function listen() {
    const toggle = `<div class="tabs"><button class="ghost ${listeningMode === 'choice' ? 'active' : ''}" id="choiceMode">Multiple choice</button><button class="ghost ${listeningMode === 'dictation' ? 'active' : ''}" id="dictMode">Dictation</button></div>`;
    if (!session.length)
        makeSession('listening');
    const t = studyTask('listening');
    if (!t)
        return;
    const x = t.item, options = shuffle([x, ...shuffle(items().filter(q => q.id !== x.id)).slice(0, 3)]);
    studyCard(x, 'Listen · ' + listeningMode, `${toggle}<div class="hero center"><div class="stat">◉</div><h2>What did you hear?</h2><p>Listen without looking at the answer.</p>${button('▶ Play word', 'playW', 'primary')} ${button('▶ Example', 'playEx')}</div>${listeningMode === 'choice' ? `<div class="choices">${options.map((q, i) => `<button class="option" data-answer="${escapeHtml(q.id)}">${escapeHtml(q.word)}</button>`).join('')}</div>` : `<form id="listenForm" class="formrow"><input type="text" id="typed" autocomplete="off" spellcheck="false" placeholder="Type the word you heard..."><button class="primary" type="submit">Check</button></form>`}`);
    getElement('#choiceMode').onclick = () => {
        listeningMode = 'choice';
        session = [];
        render();
    };
    getElement('#dictMode').onclick = () => {
        listeningMode = 'dictation';
        session = [];
        render();
    };
    getElement('#playW').onclick = () => playWord(x);
    getElement('#playEx').onclick = () => playSentence(x);
    if (listeningMode === 'choice')
        document.querySelectorAll('[data-answer]').forEach(b => b.onclick = () => finish(x, 'listening', b.dataset.answer === x.id, `<strong>${escapeHtml(x.word)}</strong> · ${escapeHtml(x.ipa)} · ${escapeHtml(x.pt)}`));
    else {
        getElement('#listenForm').onsubmit = e => {
            e.preventDefault();
            if (!getElement('#typed').value.trim())
                return;
            finish(x, 'listening', same(getElement('#typed').value, x.word), `Answer: <strong>${escapeHtml(x.word)}</strong> · ${escapeHtml(x.ipa)}`);
        };
        getElement('#typed').focus();
    }
}
function use() {
    if (!session.length)
        makeSession('usage');
    const t = studyTask('usage');
    if (!t)
        return;
    const x = t.item;
    studyCard(x, 'Use & recall', `<div class="hero center"><span class="label">Write in English</span><p class="translation">${escapeHtml(x.pt)}</p><p class="hint">Hint: ${escapeHtml(x.section)}</p></div><form id="useForm" class="formrow"><input id="useInput" type="text" autocomplete="off" spellcheck="false" placeholder="Type the English word..."><button class="primary" type="submit">Check</button></form><div class="buttonrow">${button('Reveal answer', 'reveal')}</div>`);
    const go = (v, correct) => finish(x, 'usage', correct, `<b>${escapeHtml(x.word)}</b> · ${escapeHtml(x.ipa)}<p>${escapeHtml(x.example)}</p>`);
    getElement('#useForm').onsubmit = e => {
        e.preventDefault();
        if (!getElement('#useInput').value.trim())
            return;
        go(getElement('#useInput').value, same(getElement('#useInput').value, x.word));
    };
    getElement('#reveal').onclick = () => go('', false);
    getElement('#useInput').focus();
}
function pronounce() {
    const nav = `<div class="tabs"><button id="wordsTab" class="ghost ${pronunciationMode === 'words' ? 'active' : ''}">Word practice</button><button id="pairsTab" class="ghost ${pronunciationMode === 'pairs' ? 'active' : ''}">Minimal pairs</button></div>`;
    if (pronunciationMode === 'pairs') {
        const p = pairs[minimalPairIndex % pairs.length];
        getElement('#app').innerHTML = `<section class="panel">${nav}<span class="chip">Minimal pairs · ${minimalPairIndex % pairs.length + 1}/${pairs.length}</span><div class="hero center"><h2>Distinguish these sounds</h2><div class="minimalpair">${escapeHtml(p.a)} <span class="muted">vs</span> ${escapeHtml(p.b)}</div><p class="ipa">${escapeHtml(p.ipaA)} · ${escapeHtml(p.ipaB)}</p><div class="buttonrow" style="justify-content:center">${button('▶ First', 'firstSound')}${button('▶ Second', 'secondSound')}${button('▶ Random challenge', 'randomSound', 'primary')}</div><p id="pairPrompt" class="hint">Listen to both words, then select Random challenge and identify the spoken word.</p><div class="choices">${button(escapeHtml(p.a), 'pairA', 'option')}${button(escapeHtml(p.b), 'pairB', 'option')}</div><div id="pairFeedback"></div></div><div class="note">${escapeHtml(p.tip)}</div><div class="buttonrow">${button('Next pair →', 'nextPair', 'primary')}</div></section>`;
        getElement('#firstSound').onclick = () => playText(p.a, null, {
            forceTTS: true
        });
        getElement('#secondSound').onclick = () => playText(p.b, null, {
            forceTTS: true
        });
        getElement('#randomSound').onclick = () => {
            minimalPairAnswer = Math.random() < .5 ? p.a : p.b;
            playText(minimalPairAnswer, null, {
                forceTTS: true
            });
            getElement('#pairPrompt').textContent = 'Choose the word you heard.';
            getElement('#pairFeedback').innerHTML = '';
        };
        for (const [id, v] of [['pairA', p.a], ['pairB', p.b]])
            getElement('#' + id).onclick = () => {
                if (!minimalPairAnswer) {
                    toast('Select Random challenge first.');
                    return;
                }
                getElement('#pairFeedback').innerHTML = `<div class="${v === minimalPairAnswer ? 'success' : 'warning'}">${v === minimalPairAnswer ? 'Correct!' : 'Not quite.'} Answer: ${escapeHtml(minimalPairAnswer)}.</div>`;
                minimalPairAnswer = '';
            };
        getElement('#nextPair').onclick = () => {
            minimalPairIndex++;
            render();
        };
    }
    else {
        const xs = ordered(activeUnitId, items(), 'pronunciation'), x = xs[lessonIndex % xs.length];
        getElement('#app').innerHTML = `<div class="cols"><section class="panel">${nav}<span class="chip">${escapeHtml(x.section)}</span><div class="center hero"><div class="word">${escapeHtml(x.word)}</div><p class="ipa">${escapeHtml(x.ipa)}</p><p>${escapeHtml(x.example)}</p><div class="buttonrow" style="justify-content:center">${button('▶ Reference', 'refWord', 'primary')}${button('▶ Sentence', 'refSentence')}</div><div class="buttonrow" style="justify-content:center">${button('● Start recording', 'startRec')}${button('■ Stop recording', 'stopRec')}${button('▶ Playback', 'playRec')}</div><div class="buttonrow" style="justify-content:center">${button('🎙 Recognize my speech', 'recognizeBtn')}</div><div id="speechStatus" role="status" class="hint">Recording supports listening-based comparison. Speech recognition checks transcripts, not phoneme accuracy.</div></div><div class="note">${escapeHtml(x.note || 'Listen for rhythm, sounds, and stress, then compare with your recording.')}</div><div class="buttonrow">${button('← Previous', 'prevSpeak')}${button('Next →', 'nextSpeak', 'primary')}</div></section>${skillPanel(x)}</div>`;
        getElement('#refWord').onclick = () => playWord(x);
        getElement('#refSentence').onclick = () => playSentence(x);
        getElement('#startRec').onclick = async () => {
            try {
                await startRecording();
                recording = true;
                getElement('#speechStatus').textContent = 'Recording...';
                getElement('#startRec').disabled = true;
            }
            catch (e) {
                toast(e.message);
            }
        };
        getElement('#stopRec').onclick = async () => {
            if (!recording)
                return;
            try {
                if (recordingUrl)
                    URL.revokeObjectURL(recordingUrl);
                recordingUrl = await stopRecording();
                getElement('#speechStatus').textContent = 'Recording ready for playback and manual comparison.';
                recording = false;
                getElement('#startRec').disabled = false;
                record(activeUnitId, x.id, 'pronunciation', true, false);
            }
            catch (e) {
                toast(e.message);
            }
        };
        getElement('#playRec').onclick = () => {
            if (!recordingUrl)
                return toast('Record your voice first.');
            new Audio(recordingUrl).play().catch(e => toast(e.message));
        };
        getElement('#recognizeBtn').onclick = async () => {
            if (!browserSupportsRecognition())
                return toast('Speech recognition is unavailable. Try Chrome or Edge.');
            getElement('#speechStatus').textContent = 'Listening...';
            try {
                const words = await recognize(getAudioSettings().recognitionLang);
                const ok = words.some(t => same(t, x.word));
                record(activeUnitId, x.id, 'pronunciation', ok, false);
                getElement('#speechStatus').innerHTML = `<div class="${ok ? 'success' : 'warning'}">Transcript: ${escapeHtml(words[0])}. ${ok ? 'Target word recognized.' : 'The target word was not recognized.'} This is <b>not</b> a phonetic accuracy score.</div>`;
            }
            catch (e) {
                getElement('#speechStatus').textContent = e.message;
            }
        };
        getElement('#prevSpeak').onclick = () => {
            lessonIndex = (lessonIndex + xs.length - 1) % xs.length;
            render();
        };
        getElement('#nextSpeak').onclick = () => {
            lessonIndex++;
            render();
        };
    }
    getElement('#wordsTab').onclick = () => {
        pronunciationMode = 'words';
        render();
    };
    getElement('#pairsTab').onclick = () => {
        pronunciationMode = 'pairs';
        render();
    };
}
function review() {
    if (!session.length) {
        session = dueItems(activeUnitId, items()).filter((task) => task.skill !== 'listening' || canDictate(task.item));
        position = 0;
        isAnswerSubmitted = false;
    }
    if (!session.length || position >= session.length) {
        getElement('#app').innerHTML = `<section class="panel center"><div class="stat">✓</div><h2>Reviews complete</h2><p>No due items remain in this session. Continue with Learn, Listen, and Use.</p>${button('Back to dashboard', 'goDash', 'primary')}</section>`;
        getElement('#goDash').onclick = () => navigate('dashboard');
        return;
    }
    const { item: x, skill } = session[position];
    const names = {
        meaning: 'Meaning', listening: 'Listening', pronunciation: 'Pronunciation', usage: 'Usage'
    };
    let body = '';
    if (skill === 'meaning')
        body = `<p>What does <b>${escapeHtml(x.word)}</b>?</p><form id="reviewForm" class="formrow"><input id="reviewInput" placeholder="Meaning in Portuguese..."><button class="primary">Check</button></form>`;
    else if (skill === 'listening')
        body = `<div class="center hero">${button('▶ Play', 'reviewAudio', 'primary')}<p>Type what you heard.</p></div><form id="reviewForm" class="formrow"><input id="reviewInput" placeholder="Word in English..."><button class="primary">Check</button></form>`;
    else if (skill === 'pronunciation')
        body = `<div class="hero center"><div class="word">${escapeHtml(x.word)}</div><p>${escapeHtml(x.ipa)}</p>${button('▶ Reference', 'reviewAudio', 'primary')}<p>Repeat out loud, then rate your attempt.</p><div class="buttonrow" style="justify-content:center">${button('Still difficult', 'notYet')}${button('I repeated it', 'yesRepeated', 'primary')}</div><p class="hint">Self-assessment only; not a validated phonetic score.</p></div>`;
    else
        body = `<p>How do you say <b>${escapeHtml(x.pt)}</b> in English?</p><form id="reviewForm" class="formrow"><input id="reviewInput" placeholder="Word in English..."><button class="primary">Check</button></form>`;
    studyCard(x, 'Review · ' + names[skill], body);
    const done = (ok, detail) => {
        finish(x, skill, ok, detail, skill !== 'pronunciation');
    };
    if (getElement('#reviewAudio'))
        getElement('#reviewAudio').onclick = () => playWord(x);
    if (getElement('#reviewForm')) {
        getElement('#reviewForm').onsubmit = e => {
            e.preventDefault();
            const v = getElement('#reviewInput').value;
            if (!v.trim())
                return;
            const target = skill === 'meaning' ? x.pt : x.word;
            const ok = skill === 'meaning' ? x.pt.split(',').some(y => same(v, y)) : same(v, target);
            done(ok, `Answer: <b>${escapeHtml(target)}</b>`);
        };
        getElement('#reviewInput').focus();
    }
    if (getElement('#notYet'))
        getElement('#notYet').onclick = () => done(false, 'Keep practicing.');
    if (getElement('#yesRepeated'))
        getElement('#yesRepeated').onclick = () => done(true, 'Self-assessment recorded (unverified).');
}
function showLibrary() {
    const all = Object.values(units);
    const groups = new Map();
    for (const u of all) {
        const group = u.bookTitle || u.source || 'Personal collections';
        if (!groups.has(group))
            groups.set(group, []);
        groups.get(group).push(u);
    }
    getElement('#app').innerHTML = `<section class="panel"><div class="between"><div><h2>Content library</h2><p class="hint">Collections, books, and units, with progress tracked separately by skill.</p></div><div class="buttonrow"><a class="primary" href="packages.html" style="text-decoration:none;display:inline-flex;align-items:center">◈ Content Packages</a></div></div>
 <label style="margin-top:17px">Search for a unit or collection<input id="librarySearch" type="search" placeholder="Ex.: Unit 41, Make, Grammar, Elementary"></label><p class="hint">${all.length} installed units across ${groups.size} collection(s).</p><div id="libraryGroups"></div></section>`;
    const renderCards = () => {
        const q = normalize(getElement('#librarySearch').value);
        getElement('#libraryGroups').innerHTML = [...groups.entries()].map(([group, collection]) => {
            const matches = collection.filter(u => !q || normalize(group + ' ' + u.title + ' ' + u.category + ' ' + u.source).includes(q)).sort((a, b) => (a.number ?? 999) - (b.number ?? 999));
            if (!matches.length)
                return '';
            return `<div style="margin:20px 0"><div class="between"><h3>${escapeHtml(group)}</h3><span class="chip">${matches.length} units</span></div><div class="grid">${matches.map(u => `<article class="small-card"><span class="chip">${escapeHtml(u.level)}</span>${['starter-curated-partial', 'expanded-curated-partial'].includes(u.coverage) ? '<span class="pill">Partial curation</span>' : ''}<h3 style="margin-top:13px">${escapeHtml(u.title)}</h3><p class="hint">${u.items.length} items · ${escapeHtml(u.category || u.source || '').slice(0, 100)}</p><div class="buttonrow"><button class="primary" data-open="${escapeHtml(u.id)}">${u.id === activeUnitId ? 'Current' : 'Select'}</button><button class="ghost" data-export="${escapeHtml(u.id)}">Export</button>${!['unit-03', 'workplace-communication'].includes(u.id) ? `<button class="ghost" data-delete="${escapeHtml(u.id)}">Remove</button>` : ''}</div></article>`).join('')}</div></div>`;
        }).join('') || '<p class="hint">No units match this search.</p>';
        document.querySelectorAll('[data-open]').forEach(b => b.onclick = () => chooseUnit(b.dataset.open));
        document.querySelectorAll('[data-export]').forEach(b => b.onclick = () => downloadJSON(units[b.dataset.export], b.dataset.export + '.json'));
        document.querySelectorAll('[data-delete]').forEach(b => b.onclick = () => {
            if (confirm('Remove this unit? Its progress will remain available if you import it again.')) {
                remove(b.dataset.delete);
                units = library();
                if (activeUnitId === b.dataset.delete) {
                    activeUnitId = Object.keys(units)[0] || '';
                    localStorage.setItem('vocablab.active.v1', activeUnitId);
                }
                render();
            }
        });
    };
    getElement('#librarySearch').oninput = renderCards;
    renderCards();
}
async function importData(e) {
    const f = e.target.files[0];
    if (!f)
        return;
    try {
        if (f.size > 10e6)
            throw Error('Backup exceeds 10 MB');
        const b = JSON.parse(await f.text());
        if (!confirm('Restore this backup and replace the current library and progress?'))
            return;
        importBackup(b);
        units = library();
        activeUnitId = units[activeUnitId] ? activeUnitId : Object.keys(units)[0];
        render();
        toast('Backup restored.');
    }
    catch (err) {
        toast('Backup error: ' + err.message);
    }
    finally {
        e.target.value = '';
    }
}
function showProgress() {
    const xs = items();
    getElement('#app').innerHTML = `<div class="grid">${skills.map(s => {
        const attempted = xs.filter(x => profile(activeUnitId, x.id)[s]?.attempts), success = attempted.reduce((a, x) => a + profile(activeUnitId, x.id)[s].success, 0), tries = attempted.reduce((a, x) => a + profile(activeUnitId, x.id)[s].attempts, 0);
        return `<section class="panel"><span class="label">${s}</span><div class="stat">${tries ? Math.round(success / tries * 100) : 0}%</div>${bar(tries ? success / tries : 0)}<p class="hint">${attempted.length} items · ${tries} attempts</p></section>`;
    }).join('')}</div><section class="panel" style="margin-top:17px"><div class="between"><h2>Progress by word</h2><div class="buttonrow">${button('↓ Full backup', 'backup', 'primary')}${button('↑ Restore backup', 'restore')}${button('Clear progress', 'wipe')}</div></div><div class="table-wrap"><table><thead><tr><th>Item</th><th>Meaning</th><th>Listening</th><th>Pronunciation*</th><th>Usage</th><th>Average</th></tr></thead><tbody>${xs.map(x => `<tr><td><b>${escapeHtml(x.word)}</b><div class="hint">${escapeHtml(x.pt)}</div></td>${skills.map(s => {
        const p = profile(activeUnitId, x.id)[s];
        return `<td>${p?.attempts ? `${p.success}/${p.attempts}` : '—'}</td>`;
    }).join('')}<td>${Math.round(mastery(activeUnitId, x.id) * 100)}%</td></tr>`).join('')}</tbody></table></div><p class="hint">* Pronunciation records practice, recognition, or self-assessment; it does not measure phonetic accuracy.</p></section>`;
    getElement('#backup').onclick = () => downloadJSON(makeBackup(), 'vocablab-full-backup.json');
    getElement('#restore').onclick = () => getElement('#backupImporter').click();
    getElement('#wipe').onclick = () => {
        if (!confirm('Delete all learning progress?'))
            return;
        localStorage.removeItem('vocablab.progress.v1');
        render();
    };
}
start();
