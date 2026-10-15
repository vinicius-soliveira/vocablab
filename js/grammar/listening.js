/** Grammar Listening checks controlled answers, not pronunciation. */
import {normalizeSpokenAnswer} from './speaking.js';
export function evaluateListeningAnswer(exercise, answer) {
  if (!exercise || !['multiple-choice','gap-fill'].includes(exercise.type))
    throw new Error('Invalid listening exercise.');
  if (exercise.type === 'multiple-choice') {
    const correct = Number.isInteger(answer) && answer === exercise.answerIndex;
    return {correct, expected:exercise.choices[exercise.answerIndex], feedback:exercise.feedback};
  }
  const normalized=normalizeSpokenAnswer(answer);
  const correct=Boolean(normalized) && exercise.acceptedAnswers.some(x=>normalizeSpokenAnswer(x)===normalized);
  return {correct, expected:exercise.acceptedAnswers[0], feedback:exercise.feedback};
}
