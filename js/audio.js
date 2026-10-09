/** Browser speech synthesis, optional MP3 playback, and microphone recording. */
const AUDIO_SETTINGS_KEY = 'vocablab.audio.v2';
const DEFAULT_SETTINGS = Object.freeze({
    voice: '',
    rate: 0.85,
    pitch: 1,
    volume: 1,
    source: 'auto',
    recognitionLang: 'en-GB',
});
let audioSettings = { ...DEFAULT_SETTINGS };
let currentAudio = null;
let mediaRecorder = null;
let recordedChunks = [];
let microphoneStream = null;
try {
    audioSettings = {
        ...DEFAULT_SETTINGS,
        ...JSON.parse(localStorage.getItem(AUDIO_SETTINGS_KEY) || '{}'),
    };
}
catch {
    // Invalid settings must not prevent the learning application from starting.
}
function clamp(value, minimum, maximum, fallback) {
    const numericValue = Number(value);
    return Number.isFinite(numericValue)
        ? Math.max(minimum, Math.min(maximum, numericValue))
        : fallback;
}
export const canSpeak = () => typeof window !== 'undefined' && Boolean(window.speechSynthesis);
export const getAudioSettings = () => ({ ...audioSettings });
export function listVoices() {
    if (!canSpeak())
        return [];
    return speechSynthesis.getVoices()
        .filter((voice) => voice.lang.toLowerCase().startsWith('en'))
        .sort((left, right) => left.lang.localeCompare(right.lang) || left.name.localeCompare(right.name));
}
export function configureAudio(options) {
    audioSettings = { ...audioSettings, ...options };
    audioSettings.rate = clamp(audioSettings.rate, 0.5, 1.5, 0.85);
    audioSettings.pitch = clamp(audioSettings.pitch, 0.5, 1.5, 1);
    audioSettings.volume = clamp(audioSettings.volume, 0, 1, 1);
    try {
        localStorage.setItem(AUDIO_SETTINGS_KEY, JSON.stringify(audioSettings));
    }
    catch {
        // Playback continues with in-memory preferences if storage is full.
    }
    return getAudioSettings();
}
export function stopAudio() {
    if (currentAudio) {
        currentAudio.pause();
        currentAudio.currentTime = 0;
        currentAudio = null;
    }
    if (canSpeak())
        speechSynthesis.cancel();
}
function speakWithBrowser(text) {
    if (!canSpeak()) {
        throw new Error('Speech synthesis is unavailable in this browser.');
    }
    const utterance = new SpeechSynthesisUtterance(text);
    const voices = listVoices();
    utterance.voice = voices.find((voice) => voice.voiceURI === audioSettings.voice)
        || voices.find((voice) => voice.lang === audioSettings.recognitionLang)
        || voices[0]
        || null;
    utterance.lang = utterance.voice?.lang || audioSettings.recognitionLang;
    utterance.rate = audioSettings.rate;
    utterance.pitch = audioSettings.pitch;
    utterance.volume = audioSettings.volume;
    speechSynthesis.speak(utterance);
    return 'tts';
}
/** Play a local MP3 when available; otherwise synthesize speech with the chosen voice. */
export async function playText(text, audioPath = null, { forceTTS = false } = {}) {
    stopAudio();
    if (forceTTS || audioSettings.source === 'tts') {
        return speakWithBrowser(text);
    }
    const validPath = typeof audioPath === 'string' &&
        /^assets\/audio\/[a-zA-Z0-9_./-]+\.mp3$/.test(audioPath) &&
        !audioPath.includes('..');
    if (validPath) {
        const player = new Audio(audioPath);
        player.volume = audioSettings.volume;
        currentAudio = player;
        try {
            await player.play();
            return 'mp3';
        }
        catch {
            currentAudio = null;
        }
    }
    if (audioSettings.source === 'mp3') {
        throw new Error(`MP3 recording unavailable for “${text}”. Switch to Auto or TTS.`);
    }
    return speakWithBrowser(text);
}
export function browserSupportsRecognition() {
    return typeof window !== 'undefined' &&
        Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
}
/** Return recognized alternatives; this is not a phonetic accuracy score. */
export function recognize(language = 'en-GB') {
    return new Promise((resolve, reject) => {
        const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!Recognition) {
            reject(new Error('Speech recognition is unavailable in this browser.'));
            return;
        }
        const recognition = new Recognition();
        recognition.lang = language;
        recognition.interimResults = false;
        recognition.maxAlternatives = 5;
        recognition.onresult = (event) => resolve(Array.from(event.results[0]).map((result) => result.transcript));
        recognition.onerror = (event) => reject(new Error(`Speech recognition failed: ${event.error}`));
        recognition.onnomatch = () => reject(new Error('No speech was recognized.'));
        recognition.start();
    });
}
export async function startRecording() {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
        throw new Error('Recording is unsupported. Use HTTPS or localhost and allow microphone access.');
    }
    microphoneStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    recordedChunks = [];
    mediaRecorder = new MediaRecorder(microphoneStream);
    mediaRecorder.ondataavailable = (event) => {
        if (event.data.size)
            recordedChunks.push(event.data);
    };
    mediaRecorder.start();
}
export function stopRecording() {
    return new Promise((resolve, reject) => {
        if (!mediaRecorder || mediaRecorder.state === 'inactive') {
            reject(new Error('No active recording to stop.'));
            return;
        }
        mediaRecorder.onstop = () => {
            microphoneStream?.getTracks().forEach((track) => track.stop());
            microphoneStream = null;
            const recordingBlob = new Blob(recordedChunks, {
                type: mediaRecorder.mimeType || 'audio/webm',
            });
            mediaRecorder = null;
            resolve(URL.createObjectURL(recordingBlob));
        };
        mediaRecorder.stop();
    });
}
