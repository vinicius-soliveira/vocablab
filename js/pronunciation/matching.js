/** Conservative normalized transcript matching for the expected spoken target. */
export function normalizeSpokenText(text) {
  return String(text ?? '')
    .normalize('NFKC')
    .toLocaleLowerCase('en')
    .replace(/[\u2018\u2019\u02bc]/g, "'")
    .replace(/[^a-z0-9'\s-]/g, ' ')
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Web Speech may offer multiple hypotheses; accept a complete match to any of them. */
export function matchesSpokenTarget(reference, alternatives) {
  const target = normalizeSpokenText(reference);
  if (!target || !Array.isArray(alternatives)) return false;
  return alternatives.some(value => normalizeSpokenText(value) === target);
}

/** Recognize a complete example sentence, allowing formatting and common ASR spellings.
 * It still requires the full word sequence: a recognized target word is insufficient.
 */
export function normalizeSentenceText(text) {
  const expansions = {
    "i'm":"i am", "you're":"you are", "we're":"we are", "they're":"they are",
    "i've":"i have", "you've":"you have", "we've":"we have", "they've":"they have",
    "i'll":"i will", "you'll":"you will", "he'll":"he will", "she'll":"she will",
    "we'll":"we will", "they'll":"they will", "it'll":"it will",
    "don't":"do not", "doesn't":"does not", "didn't":"did not", "isn't":"is not",
    "aren't":"are not", "wasn't":"was not", "weren't":"were not",
    "haven't":"have not", "hasn't":"has not", "hadn't":"had not",
    "can't":"cannot", "cannot":"can not", "won't":"will not", "wouldn't":"would not",
    "couldn't":"could not", "shouldn't":"should not", "mustn't":"must not",
    "would've":"would have", "could've":"could have", "should've":"should have",
    "mr":"mister", "mrs":"missus", "dr":"doctor",
  };
  return normalizeSpokenText(text)
    .replace(/(^|\s)'(?=[a-z])/g, '$1')
    .replace(/'(?![a-z])/g, '')
    .trim()
    .split(' ')
    .filter(Boolean)
    .map(word => expansions[word] ?? word)
    .join(' ')
    .replace(/\bcan not\b/g, 'cannot');
}
export function matchesSentenceTarget(reference, alternatives) {
  const target=normalizeSentenceText(reference);
  return Boolean(target) && Array.isArray(alternatives)
    && alternatives.some(candidate=>normalizeSentenceText(candidate)===target);
}
