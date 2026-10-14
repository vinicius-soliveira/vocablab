/** Sequential reference/recording playback, with cancellation on navigation.
 * Audio is not scored. This module reuses VocabLab's saved voice and MP3 settings.
 */
import {getAudioSettings, listVoices, stopAudio} from '../audio.js';
export const PRACTICE_RATES = Object.freeze([0.75, 1, 1.25]);
export const safePracticeRate = rate => PRACTICE_RATES.includes(Number(rate)) ? Number(rate) : 1;

export function createPronunciationPlayer() {
  let generation = 0;
  let activeAudio = null;
  let finishActive = null;
  function stop() {
    generation++;
    finishActive?.(false);
    finishActive = null;
    if (activeAudio) { activeAudio.pause(); activeAudio.currentTime = 0; activeAudio = null; }
    stopAudio();
  }
  function playClip(url, rate, token, volume) {
    return new Promise((resolve, reject) => {
      if (token !== generation) return resolve(false);
      const player = new Audio(url);
      activeAudio = player;
      player.playbackRate = rate;
      player.volume = volume;
      let settled = false;
      const finish = (ok, error = null) => {
        if (settled) return;
        settled = true;
        player.onended = null;
        player.onerror = null;
        if (activeAudio === player) activeAudio = null;
        if (finishActive === finish) finishActive = null;
        if (error) reject(error); else resolve(ok);
      };
      finishActive = finish;
      player.onended = () => finish(true);
      player.onerror = () => finish(false, new Error('Could not play audio.'));
      Promise.resolve(player.play()).catch(err => finish(false, err));
    });
  }
  function speak(text, rate, token) {
    return new Promise((resolve, reject) => {
      if (token !== generation) return resolve(false);
      if (!window.speechSynthesis || !window.SpeechSynthesisUtterance && !globalThis.SpeechSynthesisUtterance) {
        return reject(new Error('Browser speech synthesis is unavailable.'));
      }
      const settings = getAudioSettings();
      const utterance = new SpeechSynthesisUtterance(text);
      const voices = listVoices();
      utterance.voice = voices.find(v => v.voiceURI === settings.voice)
        || voices.find(v => v.lang === settings.recognitionLang)
        || voices[0] || null;
      utterance.lang = utterance.voice?.lang || settings.recognitionLang;
      utterance.rate = rate;
      utterance.pitch = settings.pitch;
      utterance.volume = settings.volume;
      let settled = false;
      const finish = ok => {
        if (settled) return;
        settled = true;
        if (finishActive === finish) finishActive = null;
        resolve(ok);
      };
      finishActive = finish;
      utterance.onend = () => finish(true);
      utterance.onerror = event => {
        if (token === generation) {
          if (finishActive === finish) finishActive = null;
          reject(new Error(`Speech synthesis failed: ${event.error || 'unknown error'}.`));
        } else finish(false);
      };
      window.speechSynthesis.speak(utterance);
    });
  }
  async function reference(text, audioPath, rate, token) {
    const settings = getAudioSettings();
    const validMP3 = typeof audioPath === 'string' && /^assets\/audio\/[a-zA-Z0-9_./-]+\.mp3$/.test(audioPath) && !audioPath.includes('..');
    if (validMP3 && settings.source !== 'tts') {
      try { return await playClip(audioPath, rate, token, settings.volume); }
      catch (error) { if (settings.source === 'mp3' || token !== generation) throw error; }
    }
    if (settings.source === 'mp3') throw new Error('MP3 unavailable. Select Auto or TTS in Audio settings.');
    return speak(text, rate, token);
  }
  async function playReference(text, audioPath, rate = 1) {
    stop();
    return reference(text, audioPath, safePracticeRate(rate), generation);
  }
  async function playRecording(url, rate = 1) {
    stop();
    if (!url) throw new Error('Record your voice first.');
    return playClip(url, safePracticeRate(rate), generation, getAudioSettings().volume);
  }
  async function compare(text, audioPath, recordingUrl, rate = 1) {
    stop();
    if (!recordingUrl) throw new Error('Record your voice first.');
    const token = generation;
    const speed = safePracticeRate(rate);
    const first = await reference(text, audioPath, speed, token);
    if (!first || token !== generation) return false;
    return playClip(recordingUrl, speed, token, getAudioSettings().volume);
  }
  return {playReference,playRecording,compare,stop};
}
