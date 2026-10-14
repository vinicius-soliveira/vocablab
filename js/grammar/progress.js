/** Separate Grammar Lab progress. Vocabulary progress remains untouched. */
export const GRAMMAR_PROGRESS_KEY = 'vocablab.grammar.progress.v1';
export const GRAMMAR_ACTIVE_KEY = 'vocablab.grammar.active.v1';
const DAY = 86400000;
const RETRY = 300000;
export const grammarKey = (unitId, exerciseId) => `${unitId}::${exerciseId}`;

export function getGrammarProgress(storage = localStorage) {
  try {
    const data = JSON.parse(storage.getItem(GRAMMAR_PROGRESS_KEY) || '{}');
    return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  } catch { return {}; }
}
export function recordGrammarAttempt(unitId, exerciseId, skill, correct, storage = localStorage, now = Date.now()) {
  if (!/^[\w-]+$/.test(unitId) || !/^[\w-]+$/.test(exerciseId) ||
      !['recognition', 'production'].includes(skill)) throw new Error('Invalid grammar progress key or skill.');
  const all = getGrammarProgress(storage);
  const id = grammarKey(unitId, exerciseId);
  const old = all[id] || {};
  const streak = correct ? Math.max(0, old.streak || 0) + 1 : 0;
  const intervalDays = correct
    ? (old.intervalDays > 0 ? Math.min(90, Math.max(1, Math.round(old.intervalDays * (streak < 3 ? 1.6 : 2.2)))) : 1)
    : 0;
  const updated = {
    attempts: (old.attempts || 0) + 1,
    successes: (old.successes || 0) + (correct ? 1 : 0),
    streak, intervalDays, skill,
    last: now, due: now + (correct ? intervalDays * DAY : RETRY)
  };
  all[id] = updated;
  storage.setItem(GRAMMAR_PROGRESS_KEY, JSON.stringify(all));
  return updated;
}
export function dueExercises(unit, storage = localStorage, now = Date.now()) {
  const all = getGrammarProgress(storage);
  return unit.exercises.filter(e => {
    const entry = all[grammarKey(unit.id, e.id)];
    return entry && entry.due <= now;
  });
}
export function summarizeGrammarUnit(unit, storage = localStorage) {
  const all = getGrammarProgress(storage);
  const summary = {total: unit.exercises.length, practiced: 0, attempts: 0, successes: 0, recognition: {attempts: 0, successes: 0}, production: {attempts: 0, successes: 0}};
  for (const e of unit.exercises) {
    const x = all[grammarKey(unit.id, e.id)];
    if (!x) continue;
    summary.practiced += 1;
    summary.attempts += x.attempts;
    summary.successes += x.successes;
    const skill = e.type === 'multiple-choice' ? 'recognition' : 'production';
    summary[skill].attempts += x.attempts;
    summary[skill].successes += x.successes;
  }
  return summary;
}
export function exportGrammarProgress(storage = localStorage) {
  return {format:'vocablab-grammar-progress-backup', version:1, exportedAt:new Date().toISOString(), progress:getGrammarProgress(storage)};
}
export function importGrammarProgress(backup, storage = localStorage) {
  if (!backup || backup.format !== 'vocablab-grammar-progress-backup' || backup.version !== 1 ||
      !backup.progress || typeof backup.progress !== 'object' || Array.isArray(backup.progress)) {
    throw new Error('Invalid grammar progress backup.');
  }
  const validated = {};
  for (const [id, item] of Object.entries(backup.progress)) {
    if (!/^[\w-]+::[\w-]+$/.test(id) || !item || typeof item !== 'object' ||
        !['recognition', 'production'].includes(item.skill)) throw new Error(`Invalid progress record: ${id}.`);
    for (const n of ['attempts', 'successes', 'streak', 'intervalDays', 'due', 'last']) {
      if (!Number.isSafeInteger(item[n]) || item[n] < 0) throw new Error(`Invalid progress value: ${id}.${n}.`);
    }
    if (item.successes > item.attempts || item.streak > item.attempts) throw new Error('Invalid grammar attempts.');
    validated[id] = Object.fromEntries(['attempts','successes','streak','intervalDays','due','last','skill'].map(k => [k,item[k]]));
  }
  storage.setItem(GRAMMAR_PROGRESS_KEY, JSON.stringify(validated));
  return Object.keys(validated).length;
}

/** Index records by unit once; supports hundreds of future grammar lessons. */
function progressByUnit(storage) {
  const grouped = new Map();
  for (const [key, record] of Object.entries(getGrammarProgress(storage))) {
    const marker = key.indexOf('::');
    if (marker < 1 || !record || typeof record !== 'object') continue;
    const unitId = key.slice(0, marker);
    if (!grouped.has(unitId)) grouped.set(unitId, []);
    grouped.get(unitId).push(record);
  }
  return grouped;
}

/** Catalog-wide aggregates without downloading every lesson's exercises. */
export function summarizeGrammarCatalog(catalog, storage = localStorage, now = Date.now()) {
  const grouped = progressByUnit(storage);
  const result = {units:catalog.length, exercises:0, practiced:0, attempts:0, successes:0, due:0,
    recognition:{attempts:0, successes:0}, production:{attempts:0, successes:0}, byUnit:{}};
  for (const unit of catalog) {
    const stats = {total:unit.exerciseCount, practiced:0, attempts:0, successes:0, due:0};
    for (const record of grouped.get(unit.id) || []) {
      stats.practiced++;
      stats.attempts += record.attempts || 0;
      stats.successes += record.successes || 0;
      stats.due += Number(record.due <= now);
      if (result[record.skill]) {
        result[record.skill].attempts += record.attempts || 0;
        result[record.skill].successes += record.successes || 0;
      }
    }
    result.exercises += stats.total;
    result.practiced += stats.practiced;
    result.attempts += stats.attempts;
    result.successes += stats.successes;
    result.due += stats.due;
    result.byUnit[unit.id] = stats;
  }
  return result;
}

/** IDs of catalog units with currently due exercises; never includes removed units. */
export function dueGrammarUnitIds(catalog, storage = localStorage, now = Date.now()) {
  const grouped = progressByUnit(storage);
  return catalog.filter(unit => (grouped.get(unit.id) || []).some(record => record.due <= now)).map(unit => unit.id);
}
