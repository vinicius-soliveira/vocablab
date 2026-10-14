/** Deterministic correction only: no fuzzy or AI-generated acceptance. */
export function normalizeAnswer(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/[\u2018\u2019\u02BC]/g, "'")
    .trim().replace(/\s+/g, ' ')
    .replace(/\s+([,;:.!?])/g, '$1')
    .replace(/[.!?]+$/g, '')
    .trim().toLocaleLowerCase('en');
}
export function correctAnswer(exercise) {
  return exercise.type === 'multiple-choice'
    ? exercise.choices[exercise.answerIndex]
    : exercise.acceptedAnswers[0];
}
export function evaluateExercise(exercise, answer) {
  if (exercise.type === 'multiple-choice') {
    return {correct: Number.isInteger(answer) && answer === exercise.answerIndex,
      expected: correctAnswer(exercise), feedback: exercise.feedback};
  }
  if (exercise.type !== 'gap-fill' && exercise.type !== 'error-correction') {
    throw new Error(`Unknown exercise type: ${exercise.type}.`);
  }
  const normalized = normalizeAnswer(answer);
  return {correct: normalized.length > 0 && exercise.acceptedAnswers.some(a => normalizeAnswer(a) === normalized),
    expected: correctAnswer(exercise), feedback: exercise.feedback};
}
export function exerciseSkill(exercise) {
  return exercise.type === 'multiple-choice' ? 'recognition' : 'production';
}
