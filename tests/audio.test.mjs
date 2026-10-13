import test from 'node:test';
import assert from 'node:assert/strict';

const stored = new Map();
const spoken = [];
let mp3ShouldFail = true;
let lastPath = null;

globalThis.localStorage = {
  getItem: (key) => stored.get(key) ?? null,
  setItem: (key, value) => stored.set(key, String(value)),
};
globalThis.window = {
  speechSynthesis: {
    cancel: () => {},
    getVoices: () => [{ name: 'English', lang: 'en-GB', voiceURI: 'en-uk' }],
    speak: (utterance) => spoken.push(utterance.text),
  },
};
globalThis.speechSynthesis = window.speechSynthesis;
globalThis.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
globalThis.Audio = class {
  constructor(path) { lastPath = path; this.currentTime = 0; }
  async play() { if (mp3ShouldFail) throw new Error('Recording not found'); }
  pause() {}
};

const audio = await import('../js/audio.js');

test('browser speech works without an MP3', async () => {
  assert.equal(await audio.playText('knee'), 'tts');
  assert.equal(spoken.at(-1), 'knee');
});

test('missing MP3 falls back to TTS in Auto mode', async () => {
  audio.configureAudio({ source: 'auto' });
  assert.equal(await audio.playText('shoulder', 'assets/audio/unit-03/shoulder.mp3'), 'tts');
  assert.equal(lastPath, 'assets/audio/unit-03/shoulder.mp3');
  assert.equal(spoken.at(-1), 'shoulder');
});

test('MP3-only mode reports missing recordings', async () => {
  audio.configureAudio({ source: 'mp3' });
  await assert.rejects(audio.playText('shoulder'), /MP3 recording unavailable/);
});

test('configured MP3 is used when it plays', async () => {
  mp3ShouldFail = false;
  audio.configureAudio({ source: 'auto' });
  assert.equal(await audio.playText('knee', 'assets/audio/demo/knee.mp3'), 'mp3');
});

test('Word excludes parenthetical meaning labels from imported vocabulary', () => {
  assert.equal(audio.getWordPlaybackText({ word: 'go off (stop working)' }), 'go off');
  assert.equal(audio.getWordPlaybackText({ word: 'flood (noun)' }), 'flood');
  assert.equal(audio.getWordPlaybackText({ word: 'make me (feel) tired' }), 'make me tired');
  assert.equal(audio.getWordPlaybackText({ word: 'tip (money)' }), 'tip');
});

test('Word ignores an incorrectly authored sentence in speechText', () => {
  const entry = {
    word: 'go off (stop working)',
    speechText: 'The heating goes off at midnight.',
    example: 'The heating goes off automatically at midnight.',
  };
  assert.equal(audio.getWordPlaybackText(entry), 'go off');
  assert.notEqual(audio.getWordPlaybackText(entry), entry.example);
  assert.equal(entry.example, 'The heating goes off automatically at midnight.');
});

test('Word uses short explicit speechText for lexical pronunciation', () => {
  assert.equal(audio.getWordPlaybackText({ word: 'St.', speechText: 'Saint' }), 'Saint');
  assert.equal(audio.getWordPlaybackText({ word: 'pick someone up', speechText: 'He picked his keys up.' }), 'pick someone up');
});

test('Templates use natural spoken examples rather than placeholders', () => {
  assert.equal(audio.getWordPlaybackText({ word: 'prefer ... to ...', example: 'I prefer tea to coffee.' }), 'I prefer tea to coffee.');
  assert.equal(audio.getWordPlaybackText({ word: 'go + -ing (activities)', example: 'I go swimming.' }), 'I go swimming.');
  assert.equal(audio.getWordPlaybackText({ word: 'go / went / gone', example: 'She went home.' }), 'She went home.');
});
