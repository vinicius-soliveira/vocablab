/** Import, inspect, publish, and export VocabLab content packages. */
import { validateUnit, library, normalize, STORAGE_KEYS } from './core.js';
const MAX_FILE_BYTES = 1800000;
const MAX_LIBRARY_BYTES = 4000000;
const MAX_PACKAGE_UNITS = 200;
const MAX_PACKAGE_ITEMS = 12000;
/** Parse either a content package or a legacy single-unit JSON file. */
export function parseContentPackage(inputData) {
    if (!inputData || typeof inputData !== 'object' || Array.isArray(inputData)) {
        throw new Error('Invalid JSON content package.');
    }
    let sourceUnits;
    if (Array.isArray(inputData.units)) {
        if (inputData.format !== 'vocablab-content-package' || inputData.version !== 1) {
            throw new Error('Unsupported package format. Expected vocablab-content-package v1.');
        }
        sourceUnits = inputData.units;
    }
    else if (Array.isArray(inputData.items)) {
        sourceUnits = [inputData]; // Compatibility with VocabLab 1.0.
    }
    else {
        throw new Error('The JSON file must contain either units[] or items[].');
    }
    if (sourceUnits.length < 1 || sourceUnits.length > MAX_PACKAGE_UNITS) {
        throw new Error('A package must contain between 1 and 200 units.');
    }
    const seenUnitIds = new Set();
    let totalItems = 0;
    const units = sourceUnits.map((sourceUnit) => {
        const validatedUnit = validateUnit(sourceUnit);
        if (seenUnitIds.has(validatedUnit.id)) {
            throw new Error(`Duplicate unit ID: ${validatedUnit.id}.`);
        }
        seenUnitIds.add(validatedUnit.id);
        totalItems += validatedUnit.items.length;
        return {
            ...validatedUnit,
            number: Number.isInteger(sourceUnit.number) ? sourceUnit.number : null,
            bookId: String(sourceUnit.bookId ?? inputData.bookId ?? '').slice(0, 160),
            bookTitle: String(sourceUnit.bookTitle ?? inputData.title ?? '').slice(0, 160),
            category: String(sourceUnit.category ?? '').slice(0, 120),
            coverage: String(sourceUnit.coverage ?? inputData.coverage ?? 'user-curated').slice(0, 80),
            sourcePage: Number.isInteger(sourceUnit.sourcePage) ? sourceUnit.sourcePage : null,
            packageId: String(inputData.id || validatedUnit.id).slice(0, 160),
            sourceNotice: String(sourceUnit.sourceNotice ?? inputData.sourceNotice ?? '').slice(0, 1000),
            sourceAudit: sourceUnit.sourceAudit ?? inputData.audit ?? null,
        };
    });
    if (totalItems > MAX_PACKAGE_ITEMS) {
        throw new Error('A package cannot contain more than 12,000 items. Split it into smaller packages.');
    }
    return {
        id: String(inputData.id || units[0].id).slice(0, 160),
        title: String(inputData.title || units[0].title).slice(0, 200),
        description: String(inputData.description || '').slice(0, 1000),
        coverage: String(inputData.coverage || 'custom'),
        ...(inputData.audit && typeof inputData.audit === 'object' ? { audit: inputData.audit } : {}),
        ...(inputData.sourceNotice ? { sourceNotice: String(inputData.sourceNotice) } : {}),
        units,
    };
}
/** Report conflicts with installed units and vocabulary overlap. */
export function inspectPackage(candidateUnits, existingLibrary = library()) {
    const knownWords = new Map();
    for (const [unitId, installedUnit] of Object.entries(existingLibrary)) {
        for (const item of installedUnit.items || []) {
            const normalizedWord = normalize(item.word);
            if (!normalizedWord)
                continue;
            if (!knownWords.has(normalizedWord))
                knownWords.set(normalizedWord, []);
            knownWords.get(normalizedWord).push(unitId);
        }
    }
    const seenIncomingWords = new Set();
    return candidateUnits.map((unit) => {
        let duplicates = 0;
        let within = 0;
        for (const item of unit.items) {
            const normalizedWord = normalize(item.word);
            if (knownWords.has(normalizedWord))
                duplicates++;
            if (seenIncomingWords.has(normalizedWord))
                within++;
            seenIncomingWords.add(normalizedWord);
        }
        return {
            id: unit.id,
            conflict: Boolean(existingLibrary[unit.id]),
            duplicates,
            within,
            items: unit.items.length,
        };
    });
}
/** Validate every unit before a single atomic library write. */
export function publishMany(candidateUnits, conflictPolicy = 'merge') {
    if (!['merge', 'replace', 'skip'].includes(conflictPolicy)) {
        throw new Error('Invalid conflict policy.');
    }
    if (!Array.isArray(candidateUnits) || candidateUnits.length === 0) {
        throw new Error('Approve at least one unit before publishing.');
    }
    const updatedLibrary = { ...library() };
    const incomingUnitIds = new Set();
    let added = 0;
    let updated = 0;
    let skipped = 0;
    for (const candidateUnit of candidateUnits) {
        const validUnit = parseContentPackage(candidateUnit).units[0];
        if (incomingUnitIds.has(validUnit.id)) {
            throw new Error(`Duplicate unit ID in publishing batch: ${validUnit.id}.`);
        }
        incomingUnitIds.add(validUnit.id);
        const installedUnit = updatedLibrary[validUnit.id];
        if (installedUnit && conflictPolicy === 'skip') {
            skipped++;
            continue;
        }
        if (!installedUnit) {
            updatedLibrary[validUnit.id] = validUnit;
            added++;
            continue;
        }
        if (conflictPolicy === 'replace') {
            updatedLibrary[validUnit.id] = validUnit;
            updated++;
            continue;
        }
        // Matching IDs replace the previous item; older unmatched items are retained.
        const mergedItems = new Map(installedUnit.items.map((item) => [item.id, item]));
        for (const item of validUnit.items)
            mergedItems.set(item.id, item);
        updatedLibrary[validUnit.id] = {
            ...installedUnit,
            ...validUnit,
            items: [...mergedItems.values()],
        };
        updated++;
    }
    const serializedLibrary = JSON.stringify(updatedLibrary);
    if (new Blob([serializedLibrary]).size > MAX_LIBRARY_BYTES) {
        throw new Error('The library would exceed 4 MB. Export a backup and import smaller packages.');
    }
    try {
        localStorage.setItem(STORAGE_KEYS.library, serializedLibrary);
    }
    catch (error) {
        throw new Error(`Browser storage is full. Export a backup and remove unused units. ${error.message}`);
    }
    return { added, updated, skipped };
}
export function exportContentPackage(sourcePackage, selectedUnits) {
    return {
        format: 'vocablab-content-package',
        version: 1,
        id: sourcePackage.id,
        title: sourcePackage.title,
        description: sourcePackage.description,
        coverage: sourcePackage.coverage,
        ...(sourcePackage.audit ? { audit: sourcePackage.audit } : {}),
        ...(sourcePackage.sourceNotice ? { sourceNotice: sourcePackage.sourceNotice } : {}),
        units: selectedUnits.map((unit) => ({
            ...unit,
            items: unit.items.map((item) => ({ ...item })),
        })),
    };
}
export function validateFileSize(file) {
    if (file.size > MAX_FILE_BYTES) {
        throw new Error('The JSON file exceeds 1.8 MB. Split it into smaller packages.');
    }
}
