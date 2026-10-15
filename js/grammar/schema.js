/** Grammar Lab JSON v1. Existing pilot lessons remain compatible; teaching blocks are optional. */
export const GRAMMAR_FORMAT = 'vocablab-grammar-unit';
export const GRAMMAR_TYPES = Object.freeze(['multiple-choice', 'gap-fill', 'error-correction']);
const ID = /^[A-Za-z0-9_-]+$/;
const SAFE_IDS = new Set(['__proto__', 'constructor', 'prototype']);
const LEVELS = new Set(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']);

function assertText(value, field, max = 1500) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error(`Invalid ${field}.`);
}
function assertId(value, field) {
  assertText(value, field, 120);
  if (!ID.test(value) || SAFE_IDS.has(value)) throw new Error(`Invalid ${field}.`);
}
function textList(value, field, limit = 15, max = 700) {
  if (value === undefined) return;
  if (!Array.isArray(value) || value.length > limit) throw new Error(`Invalid ${field}.`);
  value.forEach((item, index) => assertText(item, `${field}[${index}]`, max));
}
function objectList(value, field, limit, check) {
  if (value === undefined) return;
  if (!Array.isArray(value) || value.length > limit) throw new Error(`Invalid ${field}.`);
  value.forEach((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error(`Invalid ${field}[${index}].`);
    check(item, `${field}[${index}]`);
  });
}
export function validateGrammarUnit(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data) ||
      data.format !== GRAMMAR_FORMAT || data.version !== 1) throw new Error('Unsupported grammar unit format or version.');
  assertId(data.id, 'unit id');
  assertText(data.title, 'unit title', 160);
  assertId(data.topicId, 'topicId');
  if (!LEVELS.has(data.level)) throw new Error('Invalid CEFR level.');
  assertText(data.summary, 'unit summary', 600);
  if (!Array.isArray(data.explanation) || !data.explanation.length || data.explanation.length > 20) {
    throw new Error('A grammar unit needs between 1 and 20 explanation sections.');
  }
  for (const section of data.explanation) {
    assertText(section?.heading, 'explanation heading', 120);
    assertText(section?.body, 'explanation body', 1800);
    if (section.example !== undefined) assertText(section.example, 'explanation example', 400);
  }
  textList(data.learningObjectives, 'learningObjectives', 20);
  textList(data.studyTips, 'studyTips', 12);
  objectList(data.comparisons, 'comparisons', 12, (item, prefix) => {
    assertText(item.title, `${prefix}.title`, 160);
    for (const side of ['left', 'right']) {
      if (!item[side] || typeof item[side] !== 'object' || Array.isArray(item[side])) throw new Error(`Invalid ${prefix}.${side}.`);
      assertText(item[side].label, `${prefix}.${side}.label`, 120);
      assertText(item[side].example, `${prefix}.${side}.example`, 450);
      assertText(item[side].note, `${prefix}.${side}.note`, 800);
    }
  });
  objectList(data.examples, 'examples', 30, (item, prefix) => {
    assertText(item.sentence, `${prefix}.sentence`, 450);
    assertText(item.note, `${prefix}.note`, 800);
  });
  objectList(data.commonMistakes, 'commonMistakes', 30, (item, prefix) => {
    assertText(item.incorrect, `${prefix}.incorrect`, 450);
    assertText(item.correct, `${prefix}.correct`, 450);
    assertText(item.why, `${prefix}.why`, 800);
  });
  if (!Array.isArray(data.exercises) || !data.exercises.length || data.exercises.length > 150) {
    throw new Error('A grammar unit needs between 1 and 150 exercises.');
  }
  const ids = new Set();
  for (const e of data.exercises) {
    assertId(e?.id, 'exercise id');
    if (ids.has(e.id)) throw new Error(`Duplicate exercise ID: ${e.id}.`);
    ids.add(e.id);
    if (!GRAMMAR_TYPES.includes(e.type)) throw new Error(`Unsupported exercise type: ${e.type}.`);
    assertText(e.prompt, 'exercise prompt', 600);
    assertText(e.feedback, 'exercise feedback', 1000);
    if (e.type === 'multiple-choice') {
      if (!Array.isArray(e.choices) || e.choices.length < 2 || e.choices.length > 6 ||
          e.choices.some(choice => typeof choice !== 'string' || !choice.trim() || choice.length > 250) ||
          new Set(e.choices.map(x=>x.trim().toLowerCase())).size !== e.choices.length ||
          !Number.isInteger(e.answerIndex) || e.answerIndex < 0 || e.answerIndex >= e.choices.length) {
        throw new Error(`Invalid choices or answerIndex for ${e.id}.`);
      }
    } else {
      if (!Array.isArray(e.acceptedAnswers) || e.acceptedAnswers.length < 1 || e.acceptedAnswers.length > 20 ||
          e.acceptedAnswers.some(a => typeof a !== 'string' || !a.trim() || a.length > 300)) {
        throw new Error(`Invalid acceptedAnswers for ${e.id}.`);
      }
    }
  }
  if (data.speakingExercises !== undefined) {
    if (!Array.isArray(data.speakingExercises) || data.speakingExercises.length > 30)
      throw new Error('Invalid speakingExercises.');
    for (const e of data.speakingExercises) {
      assertId(e?.id, 'speaking exercise id');
      if (ids.has(e.id)) throw new Error(`Duplicate exercise ID: ${e.id}.`);
      ids.add(e.id);
      assertText(e.prompt, 'speaking prompt', 600);
      assertText(e.feedback, 'speaking feedback', 1000);
      if (!Array.isArray(e.acceptedAnswers) || !e.acceptedAnswers.length || e.acceptedAnswers.length > 20 ||
        e.acceptedAnswers.some(answer => typeof answer !== 'string' || !answer.trim() || answer.length > 300))
        throw new Error(`Invalid speaking acceptedAnswers for ${e.id}.`);
    }
  }
  return data;
}
export function validGrammarPath(path) {
  return typeof path === 'string' && /^grammar\/units\/[A-Za-z0-9_-]+\.json$/.test(path);
}
export function validateGrammarManifest(data) {
  if (!data || data.format !== 'vocablab-grammar-catalog' || data.version !== 1 ||
      !Array.isArray(data.units) || data.units.length > 500) throw new Error('Invalid grammar catalog format.');
  const ids = new Set();
  for (const item of data.units) {
    assertId(item?.id, 'catalog unit id');
    assertText(item.title, 'catalog title', 160);
    assertId(item.topicId, 'catalog topicId');
    if (!LEVELS.has(item.level) || !validGrammarPath(item.path) ||
        !Number.isInteger(item.exerciseCount) || item.exerciseCount < 1 || item.exerciseCount > 150 ||
        (item.speakingCount !== undefined && (!Number.isInteger(item.speakingCount) || item.speakingCount < 0 || item.speakingCount > 30)) ||
        ids.has(item.id)) throw new Error(`Invalid grammar catalog entry: ${item.id}.`);
    ids.add(item.id);
  }
  return data.units;
}
