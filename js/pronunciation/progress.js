/** Independent recognition/practice log; existing vocabulary/grammar history is never rewritten.
 * Recognition is a transcript match only. Saved audio is temporary and not persisted.
 */
export const PRONUNCIATION_STORAGE_KEY = 'vocablab.pronunciation.practice.v1';
export const PRONUNCIATION_BACKUP_FORMAT = 'vocablab-pronunciation-practice-v1';
const DAY = 86_400_000;
const MINUTE = 60_000;
const ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

function makeKey(unitId, itemId) {
  if (!ID_PATTERN.test(unitId) || !ID_PATTERN.test(itemId)) throw new Error('Invalid pronunciation unit or item ID.');
  return `${unitId}::${itemId}`;
}

export function getPracticeData(storage = localStorage) {
  try {
    const data = JSON.parse(storage.getItem(PRONUNCIATION_STORAGE_KEY) || '{}');
    return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  } catch { return {}; }
}
export function getPracticeStats(unitId, itemId, storage = localStorage) {
  return getPracticeData(storage)[makeKey(unitId, itemId)] || {};
}
function update(unitId, itemId, modify, storage, now) {
  const id = makeKey(unitId, itemId);
  const data = getPracticeData(storage);
  const row = { ...data[id] };
  modify(row);
  row.lastPractice = now;
  data[id] = row;
  storage.setItem(PRONUNCIATION_STORAGE_KEY, JSON.stringify(data));
  return row;
}

/** A saved recording counts as practice, never as a recognized or correct answer. */
export function recordPractice(unitId, itemId, storage = localStorage, now = Date.now()) {
  return update(unitId, itemId, row => { row.recordings = (row.recordings || 0) + 1; }, storage, now);
}

/** Called only when the recognizer returns a nonempty transcript hypothesis. */
export function recordRecognition(unitId, itemId, matched, storage = localStorage, now = Date.now()) {
  return update(unitId, itemId, row => {
    const recognized = Boolean(matched);
    row.recognitionAttempts = (row.recognitionAttempts || 0) + 1;
    row.recognitionMatches = (row.recognitionMatches || 0) + Number(recognized);
    row.lastRecognition = recognized ? 'recognized' : 'mismatch';
    if (recognized) {
      row.recognizedStreak = (row.recognizedStreak || 0) + 1;
      row.intervalDays = row.intervalDays > 0
        ? Math.min(90, Math.max(1, Math.round(row.intervalDays * (row.recognizedStreak < 3 ? 1.6 : 2.2))))
        : 1;
      row.due = now + row.intervalDays * DAY;
    } else {
      row.recognizedStreak = 0;
      row.intervalDays = 0;
      row.due = now + 5 * MINUTE;
    }
  }, storage, now);
}

/** Sentence recognition is tracked separately from word recognition. */
export function recordSentenceRecognition(unitId, itemId, matched, storage = localStorage, now = Date.now()) {
  return update(unitId, itemId, row => {
    const recognized = Boolean(matched);
    row.sentenceRecognitionAttempts = (row.sentenceRecognitionAttempts || 0) + 1;
    row.sentenceRecognitionMatches = (row.sentenceRecognitionMatches || 0) + Number(recognized);
    row.lastSentenceRecognition = recognized ? 'recognized' : 'mismatch';
    if (recognized) {
      row.sentenceRecognizedStreak = (row.sentenceRecognizedStreak || 0) + 1;
      row.sentenceIntervalDays = row.sentenceIntervalDays > 0
        ? Math.min(90, Math.max(1, Math.round(row.sentenceIntervalDays * (row.sentenceRecognizedStreak < 3 ? 1.6 : 2.2))))
        : 1;
      row.sentenceDue = now + row.sentenceIntervalDays * DAY;
    } else {
      row.sentenceRecognizedStreak = 0;
      row.sentenceIntervalDays = 0;
      row.sentenceDue = now + 5 * MINUTE;
    }
  }, storage, now);
}

/** A failed or unavailable recognizer is inconclusive: do not penalize the student. */
export function isPracticeDue(unitId, itemId, storage = localStorage, now = Date.now()) {
  const row = getPracticeStats(unitId, itemId, storage);
  const wordDue = Boolean(row.recognitionAttempts) && Number.isFinite(row.due) && row.due <= now;
  const sentenceDue = Boolean(row.sentenceRecognitionAttempts) && Number.isFinite(row.sentenceDue) && row.sentenceDue <= now;
  return wordDue || sentenceDue;
}

export function practicePriority(unitId, itemId, storage = localStorage, now = Date.now()) {
  const row = getPracticeStats(unitId, itemId, storage);
  if (isPracticeDue(unitId, itemId, storage, now)) {
    const overdueMismatch = (row.lastRecognition === 'mismatch' && row.recognitionAttempts && row.due <= now)
      || (row.lastSentenceRecognition === 'mismatch' && row.sentenceRecognitionAttempts && row.sentenceDue <= now);
    return overdueMismatch ? 120 : 90;
  }
  if (!row.recognitionAttempts && !row.sentenceRecognitionAttempts) return 70;
  if (row.lastRecognition === 'mismatch' || row.lastSentenceRecognition === 'mismatch') return 40;
  return 10;
}
export function summarizeUnitPractice(unitId, items, storage = localStorage, now = Date.now()) {
  const records = getPracticeData(storage);
  return items.reduce((totals, item) => {
    const row = records[makeKey(unitId, item.id)] || {};
    totals.recordings += row.recordings || 0;
    totals.recognitionAttempts += row.recognitionAttempts || 0;
    totals.recognitionMatches += row.recognitionMatches || 0;
    totals.sentenceRecognitionAttempts += row.sentenceRecognitionAttempts || 0;
    totals.sentenceRecognitionMatches += row.sentenceRecognitionMatches || 0;
    const wordDue = Boolean(row.recognitionAttempts) && Number.isFinite(row.due) && row.due <= now;
    const sentenceDue = Boolean(row.sentenceRecognitionAttempts) && Number.isFinite(row.sentenceDue) && row.sentenceDue <= now;
    totals.due += Number(wordDue || sentenceDue);
    return totals;
  }, { recordings: 0, recognitionAttempts: 0, recognitionMatches: 0, sentenceRecognitionAttempts: 0, sentenceRecognitionMatches: 0, due: 0 });
}

/** Accept old optional self-rating fields for users who tried an earlier local preview. */
function validateRow(id, row) {
  if (!/^[A-Za-z0-9_-]+::[A-Za-z0-9_-]+$/.test(id) || !row || typeof row !== 'object' || Array.isArray(row)) {
    throw new Error('Invalid pronunciation record.');
  }
  for (const field of ['recordings', 'recognitionAttempts', 'recognitionMatches', 'recognizedStreak',
    'intervalDays', 'due', 'lastPractice', 'sentenceRecognitionAttempts', 'sentenceRecognitionMatches',
    'sentenceRecognizedStreak', 'sentenceIntervalDays', 'sentenceDue', 'selfGood', 'selfUnsure', 'selfRetry', 'goodStreak']) {
    if (row[field] !== undefined && (!Number.isSafeInteger(row[field]) || row[field] < 0)) {
      throw new Error(`Invalid pronunciation field: ${field}.`);
    }
  }
  if (row.lastRecognition !== undefined && !['recognized', 'mismatch'].includes(row.lastRecognition)) {
    throw new Error('Invalid recognition outcome.');
  }
  if (row.lastSentenceRecognition !== undefined && !['recognized', 'mismatch'].includes(row.lastSentenceRecognition)) {
    throw new Error('Invalid sentence recognition outcome.');
  }
  if (row.lastRating !== undefined && !['good', 'unsure', 'retry'].includes(row.lastRating)) {
    throw new Error('Invalid legacy rating.');
  }
  if ((row.recognitionMatches || 0) > (row.recognitionAttempts || 0)
      || (row.sentenceRecognitionMatches || 0) > (row.sentenceRecognitionAttempts || 0)) {
    throw new Error('Invalid recognition count.');
  }
  return { ...row };
}
export function validatePracticeBackup(backup) {
  if (!backup || backup.format !== PRONUNCIATION_BACKUP_FORMAT || backup.version !== 1 ||
      !backup.records || typeof backup.records !== 'object' || Array.isArray(backup.records)) {
    throw new Error('Unsupported pronunciation practice backup.');
  }
  return Object.fromEntries(Object.entries(backup.records).map(([id, row]) => [id, validateRow(id, row)]));
}
export function exportPracticeBackup(storage = localStorage) {
  return { format: PRONUNCIATION_BACKUP_FORMAT, version: 1, records: getPracticeData(storage) };
}
export function importPracticeBackup(backup, storage = localStorage) {
  const records = validatePracticeBackup(backup);
  storage.setItem(PRONUNCIATION_STORAGE_KEY, JSON.stringify(records));
  return Object.keys(records).length;
}
