/**
 * Core learning state, unit validation, review scheduling, and backups.
 *
 * Public exports and persisted storage keys remain compatible with VocabLab 1.1.
 * Content fields such as `pt` and `contentOrigin` are part of the JSON schema and
 * must not be renamed as part of a source-code cleanup.
 */
export const STORAGE_KEYS = Object.freeze({
    library: 'vocablab.library.v1',
    progress: 'vocablab.progress.v1',
    activeUnit: 'vocablab.active.v1',
});
export const skills = Object.freeze(['meaning', 'listening', 'pronunciation', 'usage']);
const DAY_IN_MS = 24 * 60 * 60 * 1000;
const FIVE_MINUTES_IN_MS = 5 * 60 * 1000;
const ITEM_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;
const AUDIO_PATH_PATTERN = /^assets\/audio\/[a-zA-Z0-9_./-]+\.mp3$/;
export function read(storageKey, fallbackValue) {
    try {
        return JSON.parse(localStorage.getItem(storageKey)) ?? fallbackValue;
    }
    catch {
        return fallbackValue;
    }
}
export function save(storageKey, value) {
    localStorage.setItem(storageKey, JSON.stringify(value));
}
function assertStringField(object, fieldName, maxLength, context) {
    const fieldValue = object?.[fieldName];
    if (typeof fieldValue !== 'string' || !fieldValue.trim() || fieldValue.length > maxLength) {
        throw new Error(`Invalid ${context} field: ${fieldName}.`);
    }
}
function validateVocabularyItem(item, itemIds) {
    for (const fieldName of ['id', 'word', 'pt']) {
        assertStringField(item, fieldName, 240, 'item');
    }
    if (!ITEM_ID_PATTERN.test(item.id) || ['__proto__', 'constructor', 'prototype'].includes(item.id) || itemIds.has(item.id)) {
        throw new Error(`Duplicate or invalid vocabulary item ID: ${item.id}.`);
    }
    itemIds.add(item.id);
    const optionalTextFields = [
        'ipa', 'example', 'note', 'section', 'audio', 'contentOrigin', 'targetType',
        'speechText',
    ];
    for (const fieldName of optionalTextFields) {
        if (item[fieldName] != null &&
            (typeof item[fieldName] !== 'string' || item[fieldName].length > 800)) {
            throw new Error(`Invalid optional item field: ${fieldName}.`);
        }
    }
    if (item.audio && (!AUDIO_PATH_PATTERN.test(item.audio) || item.audio.includes('..'))) {
        throw new Error('Audio paths must point to assets/audio/*.mp3.');
    }
}
/** Validate and normalize a single unit without discarding approved metadata. */
export function validateUnit(candidateUnit) {
    if (!candidateUnit || typeof candidateUnit !== 'object' || Array.isArray(candidateUnit) ||
        !Array.isArray(candidateUnit.items) ||
        candidateUnit.items.length < 1 || candidateUnit.items.length > 2000) {
        throw new Error('A unit must contain between 1 and 2,000 items.');
    }
    for (const fieldName of ['id', 'title']) {
        assertStringField(candidateUnit, fieldName, 160, 'unit');
    }
    if (!ITEM_ID_PATTERN.test(candidateUnit.id) || ['__proto__', 'constructor', 'prototype'].includes(candidateUnit.id)) {
        throw new Error('Unit IDs may only contain letters, numbers, hyphens, and underscores.');
    }
    const itemIds = new Set();
    candidateUnit.items.forEach((item) => validateVocabularyItem(item, itemIds));
    if (candidateUnit.learningObjectives != null && (!Array.isArray(candidateUnit.learningObjectives) ||
        candidateUnit.learningObjectives.some((objective) => typeof objective !== 'string' || !objective.trim() || objective.length > 1500))) {
        throw new Error('learningObjectives must be an array of nonempty strings.');
    }
    return {
        id: candidateUnit.id,
        title: candidateUnit.title,
        source: String(candidateUnit.source || 'User content package'),
        level: String(candidateUnit.level || 'Mixed'),
        bookId: String(candidateUnit.bookId || '').slice(0, 160),
        bookTitle: String(candidateUnit.bookTitle || '').slice(0, 160),
        category: String(candidateUnit.category || '').slice(0, 120),
        coverage: String(candidateUnit.coverage || '').slice(0, 80),
        packageId: String(candidateUnit.packageId || '').slice(0, 160),
        sourceNotice: String(candidateUnit.sourceNotice || '').slice(0, 1000),
        sourceAudit: candidateUnit.sourceAudit && typeof candidateUnit.sourceAudit === 'object' &&
            !Array.isArray(candidateUnit.sourceAudit)
            ? structuredClone(candidateUnit.sourceAudit) : null,
        number: Number.isInteger(candidateUnit.number) ? candidateUnit.number : null,
        sourcePage: Number.isInteger(candidateUnit.sourcePage) ? candidateUnit.sourcePage : null,
        learningObjectives: candidateUnit.learningObjectives ? [...candidateUnit.learningObjectives] : [],
        items: candidateUnit.items.map((item) => ({
            ...item,
            ipa: item.ipa || '',
            example: item.example || '',
            note: item.note || '',
            section: item.section || 'General',
            audio: item.audio || '',
        })),
    };
}
export const library = () => read(STORAGE_KEYS.library, {});
export const progress = () => read(STORAGE_KEYS.progress, {});
export const allProgress = progress;
export const setProgress = (progressData) => save(STORAGE_KEYS.progress, progressData);
export const key = (unitId, itemId) => `${unitId}::${itemId}`;
export function install(unitData) {
    const validUnit = validateUnit(unitData);
    const installedUnits = library();
    installedUnits[validUnit.id] = validUnit;
    save(STORAGE_KEYS.library, installedUnits);
    return validUnit;
}
export function remove(unitId) {
    const installedUnits = library();
    delete installedUnits[unitId];
    save(STORAGE_KEYS.library, installedUnits);
}
export function profile(unitId, itemId) {
    return progress()[key(unitId, itemId)] || {};
}
/** Store a response without treating self-reported pronunciation as verified. */
export function record(unitId, itemId, skill, isCorrect, isVerified = true) {
    if (!skills.includes(skill)) {
        throw new Error(`Unknown learning skill: ${skill}.`);
    }
    const allRecords = progress();
    const recordKey = key(unitId, itemId);
    const itemRecord = allRecords[recordKey] || {};
    const skillRecord = itemRecord[skill] || {
        success: 0, attempts: 0, streak: 0, due: 0, interval: 0,
    };
    skillRecord.attempts += 1;
    if (isCorrect) {
        skillRecord.success += 1;
        skillRecord.streak += 1;
        skillRecord.interval = skillRecord.interval === 0 ? 1 : Math.min(90, Math.max(1, Math.round(skillRecord.interval * (skillRecord.streak < 3 ? 1.6 : 2.2))));
    }
    else {
        skillRecord.streak = 0;
        skillRecord.interval = 0;
    }
    const now = Date.now();
    skillRecord.due = now + (isCorrect ? skillRecord.interval * DAY_IN_MS : FIVE_MINUTES_IN_MS);
    skillRecord.last = now;
    skillRecord.verified = Boolean(isVerified);
    itemRecord[skill] = skillRecord;
    allRecords[recordKey] = itemRecord;
    setProgress(allRecords);
    return skillRecord;
}
export function mastery(unitId, itemId) {
    const itemRecord = profile(unitId, itemId);
    const totalMastery = skills.reduce((sum, skill) => {
        const skillRecord = itemRecord[skill];
        if (!skillRecord)
            return sum;
        const accuracy = skillRecord.success / (skillRecord.attempts || 1);
        const streakScore = Math.min(1, skillRecord.streak / 3);
        return sum + Math.min(1, accuracy * 0.7 + streakScore * 0.3);
    }, 0);
    return totalMastery / skills.length;
}
export function priority(unitId, itemId, skill) {
    const skillRecord = profile(unitId, itemId)[skill];
    if (!skillRecord)
        return 10;
    const accuracy = skillRecord.success / Math.max(1, skillRecord.attempts);
    return (skillRecord.due <= Date.now() ? 6 : 0) +
        (1 - accuracy) * 4 +
        Math.max(0, 3 - skillRecord.streak) * 1.2 +
        Math.random() * 0.4;
}
export function ordered(unitId, vocabularyItems, skill) {
    return [...vocabularyItems].sort((left, right) => priority(unitId, right.id, skill) - priority(unitId, left.id, skill));
}
export function dueItems(unitId, vocabularyItems) {
    return vocabularyItems.flatMap((item) => skills
        .filter((skill) => {
        const skillRecord = profile(unitId, item.id)[skill];
        return skillRecord && skillRecord.due <= Date.now();
    })
        .map((skill) => ({ item, skill })))
        .sort((left, right) => priority(unitId, right.item.id, right.skill) -
        priority(unitId, left.item.id, left.skill));
}
export function shuffle(values) {
    const shuffledValues = [...values];
    for (let index = shuffledValues.length - 1; index > 0; index--) {
        const randomIndex = Math.floor(Math.random() * (index + 1));
        [shuffledValues[index], shuffledValues[randomIndex]] = [shuffledValues[randomIndex], shuffledValues[index]];
    }
    return shuffledValues;
}
export function normalize(value) {
    return String(value).toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[’']/g, '')
        .replace(/[^a-z0-9\s-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}
export const same = (left, right) => normalize(left) === normalize(right);
export function downloadJSON(value, filename) {
    const blobUrl = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], {
        type: 'application/json',
    }));
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(blobUrl), 1500);
}
/** Restore both the library and the progress after validating all units. */
export function importBackup(backup) {
    if (!backup || backup.format !== 'vocablab-backup-1' ||
        !backup.progress || typeof backup.progress !== 'object' || Array.isArray(backup.progress) ||
        !backup.units || typeof backup.units !== 'object' || Array.isArray(backup.units)) {
        throw new Error('Invalid backup file.');
    }
    const cleanUnits = {};
    for (const candidateUnit of Object.values(backup.units)) {
        const validUnit = validateUnit(candidateUnit);
        cleanUnits[validUnit.id] = validUnit;
    }
    const cleanProgress = {};
    for (const [recordKey, itemRecord] of Object.entries(backup.progress)) {
        if (!/^[\w-]+::[\w-]+$/.test(recordKey) ||
            !itemRecord || typeof itemRecord !== 'object' || Array.isArray(itemRecord))
            continue;
        cleanProgress[recordKey] = {};
        for (const skill of skills) {
            const candidateSkill = itemRecord[skill];
            if (!candidateSkill || typeof candidateSkill !== 'object')
                continue;
            const cleanSkill = {};
            for (const fieldName of ['success', 'attempts', 'streak', 'due', 'interval', 'last']) {
                cleanSkill[fieldName] = Number.isFinite(candidateSkill[fieldName])
                    ? Math.max(0, Math.min(1e15, candidateSkill[fieldName]))
                    : 0;
            }
            cleanSkill.verified = Boolean(candidateSkill.verified);
            cleanProgress[recordKey][skill] = cleanSkill;
        }
    }
    save(STORAGE_KEYS.library, cleanUnits);
    setProgress(cleanProgress);
}
export const makeBackup = () => ({
    format: 'vocablab-backup-1',
    savedAt: new Date().toISOString(),
    units: library(),
    progress: progress(),
});
