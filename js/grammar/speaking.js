/** Controlled speaking feedback: recognize utterances, compare only approved model answers. */
const CONTRACTIONS = new Map(Object.entries({
  "i'm":"i am", "you're":"you are", "we're":"we are", "they're":"they are",
  "he's":"he is", "she's":"she is", "it's":"it is", "that's":"that is",
  "i've":"i have", "you've":"you have", "we've":"we have", "they've":"they have",
  "i'll":"i will", "you'll":"you will", "we'll":"we will", "they'll":"they will",
  "he'll":"he will", "she'll":"she will", "it'll":"it will",
  "i'd":"i would", "you'd":"you would", "we'd":"we would", "they'd":"they would",
  "don't":"do not", "doesn't":"does not", "didn't":"did not",
  "haven't":"have not", "hasn't":"has not", "hadn't":"had not",
  "can't":"cannot", "cannot":"cannot", "couldn't":"could not",
  "won't":"will not", "wouldn't":"would not", "shouldn't":"should not",
  "mustn't":"must not", "isn't":"is not", "aren't":"are not",
  "wasn't":"was not", "weren't":"were not", "let's":"let us"
}));
/** Normalize common speech-to-text punctuation and predictable contractions, not arbitrary grammar. */
export function normalizeSpokenAnswer(value) {
  return String(value ?? '').normalize('NFKC').toLowerCase()
    .replace(/[\u2018\u2019\u02bc]/g, "'")
    .replace(/\b[a-z]+(?:'[a-z]+)?\b/g, token => CONTRACTIONS.get(token) || token)
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ').trim();
}
export function evaluateSpokenAnswer(exercise, alternatives) {
  if (!exercise || !Array.isArray(exercise.acceptedAnswers)) throw new Error('Invalid speaking exercise.');
  const heard = Array.isArray(alternatives) ? alternatives : [alternatives];
  const expected = new Set(exercise.acceptedAnswers.map(normalizeSpokenAnswer));
  const transcript = heard.find(t => expected.has(normalizeSpokenAnswer(t))) || heard[0] || '';
  return {correct:Boolean(normalizeSpokenAnswer(transcript)) && expected.has(normalizeSpokenAnswer(transcript)),
    transcript:String(transcript), expected:exercise.acceptedAnswers[0], feedback:exercise.feedback};
}
