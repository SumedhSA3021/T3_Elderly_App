import { useState, useRef, useCallback, useEffect } from 'react';

/**
 * Helper to auto-detect language from speech transcript
 */
export function detectLanguage(text, fallback = 'en-IN') {
  return 'en-IN';
}

/**
 * Chunks long Indic/Kannada text at sentence or natural clause boundaries (<= 130 chars)
 * ensuring smooth audio streaming without hitting URL length limits.
 */
function splitTextIntoAudioChunks(text, maxLen = 130) {
  if (!text || typeof text !== 'string') return [];
  const clean = text.trim();
  if (clean.length <= maxLen) return [clean];

  // Split on clause terminators or punctuation
  const parts = clean.split(/([.,!?।\n;]+)/);
  const chunks = [];
  let current = '';

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (!part) continue;
    if ((current + part).length <= maxLen) {
      current += part;
    } else {
      if (current.trim()) chunks.push(current.trim());
      if (part.length <= maxLen) {
        current = part;
      } else {
        const words = part.split(/\s+/);
        let sub = '';
        for (const w of words) {
          if ((sub + ' ' + w).length <= maxLen) {
            sub = sub ? sub + ' ' + w : w;
          } else {
            if (sub.trim()) chunks.push(sub.trim());
            sub = w;
          }
        }
        current = sub;
      }
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks.length ? chunks : [clean.substring(0, maxLen)];
}


/**
 * Native Web Speech API Voice Handler.
 * Captures both interim and finalized speech transcript seamlessly.
 */
export function useVoiceHandler() {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [interimText, setInterimText] = useState('');
  const [debugLogs, setDebugLogs] = useState([]);

  const recognitionRef = useRef(null);
  const isSpeakingRef = useRef(false);
  const isSessionActiveRef = useRef(false);
  const listeningSecondsLeftRef = useRef(5);
  const listeningTimerIntervalRef = useRef(null);
  const accumulatedTranscriptRef = useRef('');
  const latestSpokenTranscriptRef = useRef('');
  const onTranscriptCallbackRef = useRef(null);
  const languageCodeRef = useRef('en-IN');

  const silenceTimeoutRef = useRef(null);
  const errorTimeoutRef = useRef(null);
  const currentAudioRef = useRef(null);
  const activeSessionRef = useRef(null);
  const abortIndicAudioRef = useRef(false);

  const setAutoClearingError = useCallback((msg, timeoutMs = 3500) => {
    if (errorTimeoutRef.current) clearTimeout(errorTimeoutRef.current);
    setError(msg);
    if (msg && timeoutMs > 0) {
      errorTimeoutRef.current = setTimeout(() => {
        setError(null);
        errorTimeoutRef.current = null;
      }, timeoutMs);
    }
  }, []);

  // Debug logging
  const log = useCallback((msg, type = 'info') => {
    const ts = new Date().toLocaleTimeString('en-IN', { hour12: false });
    console.log(`[${ts}] [${type}] ${msg}`);
    setDebugLogs((prev) => [{ ts, msg, type, id: Date.now() + Math.random() }, ...prev].slice(0, 100));
  }, []);

  const clearLogs = useCallback(() => setDebugLogs([]), []);

  const SpeechRecognition =
    typeof window !== 'undefined'
      ? window.SpeechRecognition || window.webkitSpeechRecognition
      : null;

  const isSupported = !!SpeechRecognition;
  const isTTSSupported = typeof window !== 'undefined' && 'speechSynthesis' in window;
  const isSecureContext = typeof window !== 'undefined' && window.isSecureContext;

  const clearTimers = useCallback(() => {
    if (listeningTimerIntervalRef.current) {
      clearInterval(listeningTimerIntervalRef.current);
      listeningTimerIntervalRef.current = null;
    }
    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current);
      silenceTimeoutRef.current = null;
    }
  }, []);

  /**
   * Stop recognition session and cancel any speech synthesis or Indic audio
   */
  const stop = useCallback(() => {
    clearTimers();
    if (errorTimeoutRef.current) {
      clearTimeout(errorTimeoutRef.current);
      errorTimeoutRef.current = null;
    }
    setError(null);
    isSessionActiveRef.current = false;
    abortIndicAudioRef.current = true;
    activeSessionRef.current = null;
    if (currentAudioRef.current) {
      try {
        currentAudioRef.current.pause();
        currentAudioRef.current.currentTime = 0;
        currentAudioRef.current.src = '';
      } catch (e) {}
      currentAudioRef.current = null;
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.onresult = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.onend = null;
        recognitionRef.current.abort();
      } catch (e) {}
      recognitionRef.current = null;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try { window.speechSynthesis.cancel(); } catch (e) {}
    }
    isSpeakingRef.current = false;
    setIsSpeaking(false);
    setIsListening(false);
    setSecondsLeft(0);
    setInterimText('');
    accumulatedTranscriptRef.current = '';
    latestSpokenTranscriptRef.current = '';
    onTranscriptCallbackRef.current = null;
  }, [clearTimers]);

  /**
   * Finish recognition session and deliver speech transcript
   */
  const finishListening = useCallback(() => {
    clearTimers();
    isSessionActiveRef.current = false;

    if (recognitionRef.current) {
      try {
        recognitionRef.current.onresult = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.onend = null;
        recognitionRef.current.stop();
      } catch (e) {}
      recognitionRef.current = null;
    }

    setIsListening(false);
    setSecondsLeft(0);
    setInterimText('');
    const cb = onTranscriptCallbackRef.current;
    onTranscriptCallbackRef.current = null;

    const rawResult = (latestSpokenTranscriptRef.current || accumulatedTranscriptRef.current).trim();
    const isSpurious = !rawResult || rawResult.length < 2 || /^[\s\p{P}\p{S}]+$/u.test(rawResult);
    const finalResult = isSpurious ? '' : rawResult;

    if (finalResult) {
      log(`📝 Captured Speech: "${finalResult}"`, 'success');
      if (cb) cb(finalResult, languageCodeRef.current || 'en-IN');
    } else {
      log('ℹ️ Listening concluded. Ready for next interaction.', 'info');
      if (cb) cb(null, languageCodeRef.current || 'en-IN');
    }

    accumulatedTranscriptRef.current = '';
    latestSpokenTranscriptRef.current = '';
  }, [clearTimers, log]);

  /**
   * Test mic hardware
   */
  const testMicrophone = useCallback(async () => {
    setError(null);
    log('🎙️ Testing hardware microphone...', 'info');

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      const msg = 'navigator.mediaDevices.getUserMedia is unavailable.';
      setAutoClearingError(msg, 4000);
      log(msg, 'error');
      return false;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);

      const buffer = new Uint8Array(analyser.frequencyBinCount);
      let maxVol = 0;

      for (let i = 0; i < 15; i++) {
        await new Promise((r) => setTimeout(r, 60));
        analyser.getByteFrequencyData(buffer);
        const currentVol = buffer.reduce((a, b) => a + b, 0) / buffer.length;
        if (currentVol > maxVol) maxVol = currentVol;
      }

      stream.getTracks().forEach((t) => t.stop());
      audioCtx.close().catch(() => {});

      if (maxVol > 3) {
        log(`🎉 HARDWARE SUCCESS! Peak volume: ${maxVol.toFixed(1)}/128`, 'success');
      } else {
        log(`⚠️ Hardware volume very low (${maxVol.toFixed(1)}/128). Check if mic is muted in Windows or Stereo Mix is default.`, 'error');
      }
      return true;
    } catch (err) {
      log(`❌ Mic permission error: ${err.message}`, 'error');
      setAutoClearingError(`Mic permission error: ${err.message}`, 4000);
      return false;
    }
  }, [log, setAutoClearingError]);

  /**
   * Start listening (supports both positional and object options)
   */
  const listen = useCallback(
    (arg1 = 'en-IN', arg2) => {
      // Safely cleanup previous recognition and audio before starting
      clearTimers();
      if (errorTimeoutRef.current) {
        clearTimeout(errorTimeoutRef.current);
        errorTimeoutRef.current = null;
      }
      setError(null);
      setInterimText('');

      let targetLang = 'en-IN';
      let onTranscriptCb = null;

      if (typeof arg1 === 'object' && arg1 !== null) {
        targetLang = arg1.languageCode || arg1.language || 'en-IN';
        onTranscriptCb = arg1.onTranscript || null;
      } else if (typeof arg1 === 'string') {
        targetLang = arg1;
        onTranscriptCb = arg2 || null;
      }

      if (!SpeechRecognition) {
        const msg = 'Web Speech API not supported in this browser. Please use Chrome or Edge.';
        setAutoClearingError(msg, 5000);
        log(msg, 'error');
        if (onTranscriptCb) onTranscriptCb(null);
        return;
      }

      // If audio is currently playing, stop it cleanly
      if (currentAudioRef.current) {
        try {
          currentAudioRef.current.pause();
          currentAudioRef.current.currentTime = 0;
          currentAudioRef.current.src = '';
        } catch (e) {}
        currentAudioRef.current = null;
      }
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        try { window.speechSynthesis.cancel(); } catch (e) {}
      }
      isSpeakingRef.current = false;
      setIsSpeaking(false);

      // Cleanly detach any previous recognition instance without triggering its onend
      if (recognitionRef.current) {
        try {
          recognitionRef.current.onresult = null;
          recognitionRef.current.onerror = null;
          recognitionRef.current.onend = null;
          recognitionRef.current.abort();
        } catch (e) {}
        recognitionRef.current = null;
      }

      const duration = (typeof arg1 === 'object' && arg1?.duration) ? arg1.duration : 8;

      onTranscriptCallbackRef.current = onTranscriptCb;
      languageCodeRef.current = targetLang;
      accumulatedTranscriptRef.current = '';
      latestSpokenTranscriptRef.current = '';
      isSessionActiveRef.current = true;
      listeningSecondsLeftRef.current = duration;
      setSecondsLeft(duration);
      setIsListening(true);

      log(`🎙️ Live Microphone Open (${targetLang} • ${duration}s). Ready...`, 'info');

      // 1. Countdown timer
      listeningTimerIntervalRef.current = setInterval(() => {
        listeningSecondsLeftRef.current -= 1;
        setSecondsLeft(Math.max(0, listeningSecondsLeftRef.current));

        if (listeningSecondsLeftRef.current <= 0) {
          finishListening();
        }
      }, 1000);

      // Flag to track fatal errors (like mic permission denied)
      let fatalError = false;

      const isMobileDevice = typeof navigator !== 'undefined' && /iPhone|iPad|iPod|Android|Mobile/i.test(navigator.userAgent);

      // 2. SpeechRecognition instance with auto-keepalive during the active listening window
      const startRecognitionSession = (delayMs = 0) => {
        if (!isSessionActiveRef.current || fatalError) return;

        const launch = () => {
          if (!isSessionActiveRef.current || fatalError) return;

          try {
            const rec = new SpeechRecognition();
            // iOS Safari WebKit throws or fails when continuous is true; use false on mobile
            rec.continuous = !isMobileDevice;
            rec.interimResults = true;
            rec.maxAlternatives = 1;
            rec.lang = targetLang;

            rec.onstart = () => {
              log(`🎙️ Microphone active & listening (${isMobileDevice ? 'Mobile' : 'Desktop'} • ${targetLang})`, 'success');
              setIsListening(true);
            };

            rec.onresult = (event) => {
              let sessionFinal = '';
              let sessionInterim = '';

              for (let i = 0; i < event.results.length; ++i) {
                const resultItem = event.results[i];
                const transcriptChunk = resultItem[0]?.transcript || '';

                if (resultItem.isFinal) {
                  sessionFinal += transcriptChunk + ' ';
                } else {
                  sessionInterim += transcriptChunk;
                }
              }

              if (sessionFinal) {
                accumulatedTranscriptRef.current = (accumulatedTranscriptRef.current + ' ' + sessionFinal).trim().replace(/\s+/g, ' ');
              }

              const fullCombined = (accumulatedTranscriptRef.current + ' ' + sessionInterim).trim().replace(/\s+/g, ' ');

              // Filter out spurious / punctuation-only noise artifacts on mobile
              const isNoise = !fullCombined || fullCombined.length < 1 || /^[\s\p{P}\p{S}]+$/u.test(fullCombined);

              if (fullCombined && !isNoise) {
                latestSpokenTranscriptRef.current = fullCombined;
                setInterimText(fullCombined);
                log(`📝 Heard: "${fullCombined}"`, 'success');

                // ⚡ Smart Voice Activity Snapping:
                // Slightly longer quiet buffer (1800ms) on mobile so pauses don't cut off elder speech
                if (silenceTimeoutRef.current) clearTimeout(silenceTimeoutRef.current);
                const silenceWait = isMobileDevice ? 1800 : 1500;
                silenceTimeoutRef.current = setTimeout(() => {
                  finishListening();
                }, silenceWait);
              }
            };

            rec.onerror = (e) => {
              log(`Speech Recognition event: ${e.error}`, ['no-speech', 'aborted'].includes(e.error) ? 'info' : 'error');
              
              // Benign non-errors: silence or user interruption (never show scary error banners)
              if (e.error === 'no-speech' || e.error === 'aborted') {
                return;
              }

              if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
                fatalError = true;
                setAutoClearingError('Microphone permission needed. Please allow microphone access in your browser settings.', 5000);
                finishListening();
              } else if (e.error === 'audio-capture') {
                fatalError = true;
                setAutoClearingError('No microphone detected. Please check your audio device.', 4000);
                finishListening();
              } else if (e.error === 'network') {
                // Transient mobile speech network reconnect
                log('Speech server network hiccup; maintaining session...', 'info');
              } else {
                log(`Microphone notice: ${e.error}`, 'info');
              }
            };

            rec.onend = () => {
              if (!isSessionActiveRef.current) return;
              if (fatalError) {
                finishListening();
                return;
              }

              // If senior already spoke and silence timeout triggered or is running, wrap up cleanly
              if (latestSpokenTranscriptRef.current && listeningSecondsLeftRef.current <= 1) {
                finishListening();
                return;
              }

              // If countdown time is still left, keep the microphone alive!
              // On mobile (where continuous=false), onend fires after each pause.
              // Auto-resume with a 140ms debounce to avoid InvalidStateError in WebKit.
              if (listeningSecondsLeftRef.current > 0) {
                const resumeDelay = isMobileDevice ? 140 : 60;
                setTimeout(() => {
                  if (isSessionActiveRef.current && listeningSecondsLeftRef.current > 0) {
                    startRecognitionSession(0);
                  }
                }, resumeDelay);
                return;
              }

              finishListening();
            };

            recognitionRef.current = rec;
            try {
              rec.start();
            } catch (startErr) {
              if (startErr.name !== 'InvalidStateError') {
                log(`SpeechRecognition start note: ${startErr.message}`, 'info');
              }
            }
          } catch (err) {
            log(`SpeechRecognition launch error: ${err.message}`, 'info');
            if (isSessionActiveRef.current && listeningSecondsLeftRef.current > 0) {
              setTimeout(() => {
                if (isSessionActiveRef.current && listeningSecondsLeftRef.current > 0) {
                  startRecognitionSession(0);
                }
              }, 140);
            } else {
              finishListening();
            }
          }
        };

        if (delayMs > 0) {
          setTimeout(launch, delayMs);
        } else {
          launch();
        }
      };

      // Allow 50ms for any prior aborted tracks to completely clear before opening new session
      startRecognitionSession(50);
    },
    [SpeechRecognition, finishListening, clearTimers, log, setAutoClearingError]
  );

  // Load voices dynamically on launch
  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const loadVoices = () => {
      window.speechSynthesis.getVoices();
    };
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
  }, []);

  /**
   * Helper to select appropriate synthesizer voice matching language (Kannada, Hindi, English)
   */
  /**
   * Select crystal-clear, natural, non-robotic synthesizer voice with pleasant accent
   */
  /**
   * Select crystal-clear, authentic natural voice tailored for each language
   */
  const getVoiceForLanguage = useCallback((langCode) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
    const voices = window.speechSynthesis.getVoices();
    if (!voices || voices.length === 0) return null;

    const langLower = (langCode || 'en-IN').toLowerCase();
    const prefix = langLower.split('-')[0]; // 'kn', 'hi', 'ta', 'te', 'en'

    // 1. Kannada ('kn' / 'kn-IN')
    if (prefix === 'kn') {
      const knVoice =
        voices.find((v) => (v.name.toLowerCase().includes('gagan') || v.name.toLowerCase().includes('sapna')) && v.name.toLowerCase().includes('natural')) ||
        voices.find((v) => v.lang.toLowerCase().startsWith('kn') && (v.name.toLowerCase().includes('natural') || v.name.toLowerCase().includes('neural'))) ||
        voices.find((v) => v.lang.toLowerCase().startsWith('kn') || v.name.toLowerCase().includes('kannada') || v.name.includes('ಕನ್ನಡ')) ||
        voices.find((v) => v.lang.toLowerCase() === 'kn-in');

      if (knVoice) {
        log(`🎙️ Using Natural Kannada Voice: "${knVoice.name}" (${knVoice.lang})`, 'success');
        return knVoice;
      }
    }

    // 2. Hindi ('hi' / 'hi-IN')
    if (prefix === 'hi') {
      const hiVoice =
        voices.find((v) => (v.name.toLowerCase().includes('swara') || v.name.toLowerCase().includes('madhur')) && v.name.toLowerCase().includes('natural')) ||
        voices.find((v) => v.lang.toLowerCase().startsWith('hi') && (v.name.toLowerCase().includes('natural') || v.name.toLowerCase().includes('neural'))) ||
        voices.find((v) => v.lang.toLowerCase().startsWith('hi') || v.name.toLowerCase().includes('hindi') || v.name.includes('हिन्दी')) ||
        voices.find((v) => v.lang.toLowerCase() === 'hi-in');

      if (hiVoice) {
        log(`🎙️ Using Natural Hindi Voice: "${hiVoice.name}" (${hiVoice.lang})`, 'success');
        return hiVoice;
      }
    }

    // 3. Tamil ('ta' / 'ta-IN')
    if (prefix === 'ta') {
      const taVoice =
        voices.find((v) => (v.name.toLowerCase().includes('pallavi') || v.name.toLowerCase().includes('valluvar')) && v.name.toLowerCase().includes('natural')) ||
        voices.find((v) => v.lang.toLowerCase().startsWith('ta') && (v.name.toLowerCase().includes('natural') || v.name.toLowerCase().includes('neural'))) ||
        voices.find((v) => v.lang.toLowerCase().startsWith('ta') || v.name.toLowerCase().includes('tamil'));

      if (taVoice) {
        log(`🎙️ Using Natural Tamil Voice: "${taVoice.name}" (${taVoice.lang})`, 'success');
        return taVoice;
      }
    }

    // 4. Telugu ('te' / 'te-IN')
    if (prefix === 'te') {
      const teVoice =
        voices.find((v) => (v.name.toLowerCase().includes('mohan') || v.name.toLowerCase().includes('shruti')) && v.name.toLowerCase().includes('natural')) ||
        voices.find((v) => v.lang.toLowerCase().startsWith('te') && (v.name.toLowerCase().includes('natural') || v.name.toLowerCase().includes('neural'))) ||
        voices.find((v) => v.lang.toLowerCase().startsWith('te') || v.name.toLowerCase().includes('telugu'));

      if (teVoice) {
        log(`🎙️ Using Natural Telugu Voice: "${teVoice.name}" (${teVoice.lang})`, 'success');
        return teVoice;
      }
    }

    // 5. English ('en' / 'en-IN' / 'en-US') - Natural & Clear
    const preferredEnglishVoices = [
      'neerja',
      'jenny',
      'aria',
      'google us english',
      'google uk english female',
      'guy',
      'sonia',
      'samantha',
      'karen',
      'microsoft zira'
    ];

    for (const name of preferredEnglishVoices) {
      const match = voices.find(
        (v) =>
          v.name.toLowerCase().includes(name) &&
          (v.name.toLowerCase().includes('natural') || v.name.toLowerCase().includes('online') || !v.name.toLowerCase().includes('desktop'))
      );
      if (match) {
        log(`🎙️ Using Clear English Voice: "${match.name}"`, 'success');
        return match;
      }
    }

    // Fallback: any voice matching language prefix that is not a legacy robotic voice
    const matchedPrefix = voices.find(
      (v) =>
        v.lang.toLowerCase().startsWith(prefix) &&
        !v.name.toLowerCase().includes('ravi') &&
        !v.name.toLowerCase().includes('neera') &&
        !v.name.toLowerCase().includes('david')
    );
    if (matchedPrefix) return matchedPrefix;

    const anyEn = voices.find((v) => v.lang.toLowerCase().startsWith('en'));
    return anyEn || voices[0];
  }, [log]);

  /**
   * Play authentic, high-fidelity neural Indic audio stream with natural accent and cadence
   */
  const playIndicAudio = useCallback(
    (text, langCode = 'kn', onEnd = null) => {
      if (!text || typeof text !== 'string') {
        if (onEnd) onEnd();
        return;
      }

      // Abort previous session and speech synthesis
      abortIndicAudioRef.current = true;
      if (currentAudioRef.current) {
        try {
          currentAudioRef.current.pause();
          currentAudioRef.current.currentTime = 0;
          currentAudioRef.current.src = '';
        } catch (e) {}
        currentAudioRef.current = null;
      }
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        try { window.speechSynthesis.cancel(); } catch (e) {}
      }

      const sessionId = Symbol('indic-tts-session');
      activeSessionRef.current = sessionId;
      abortIndicAudioRef.current = false;

      const chunks = splitTextIntoAudioChunks(text, 130);
      if (!chunks.length) {
        isSpeakingRef.current = false;
        setIsSpeaking(false);
        if (onEnd) onEnd();
        return;
      }

      isSpeakingRef.current = true;
      setIsSpeaking(true);
      log(`🎙️ Authentic Indic Neural TTS (${langCode}): "${text.substring(0, 50)}..."`, 'info');

      let chunkIndex = 0;

      const playNextChunk = () => {
        if (activeSessionRef.current !== sessionId || abortIndicAudioRef.current) {
          if (activeSessionRef.current === sessionId) {
            isSpeakingRef.current = false;
            setIsSpeaking(false);
            currentAudioRef.current = null;
          }
          return;
        }

        if (chunkIndex >= chunks.length) {
          if (activeSessionRef.current === sessionId) {
            isSpeakingRef.current = false;
            setIsSpeaking(false);
            currentAudioRef.current = null;
            if (onEnd) onEnd();
          }
          return;
        }

        const chunk = chunks[chunkIndex];
        chunkIndex++;

        // 1. Same-Origin Vite proxy endpoint
        const primaryUrl = `/api/tts?q=${encodeURIComponent(chunk)}&tl=${encodeURIComponent(langCode)}`;
        // 2. Direct fallback to Google TTS URL if proxy encounters an issue
        const fallbackUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(chunk)}&tl=${encodeURIComponent(langCode)}&client=tw-ob`;

        const audio = new Audio();
        currentAudioRef.current = audio;

        let hasHandledEnd = false;
        const handleDone = () => {
          if (hasHandledEnd) return;
          hasHandledEnd = true;
          audio.onended = null;
          audio.onerror = null;
          playNextChunk();
        };

        audio.onended = handleDone;

        audio.onerror = (err) => {
          if (activeSessionRef.current !== sessionId || abortIndicAudioRef.current) return;
          console.warn(`[IndicTTS] Audio chunk error on ${audio.src}, attempting fallback...`, err);
          if (audio.src && audio.src.includes('/api/tts')) {
            audio.src = fallbackUrl;
            audio.play().catch(() => handleDone());
          } else {
            handleDone();
          }
        };

        audio.src = primaryUrl;
        const playPromise = audio.play();
        if (playPromise !== undefined) {
          playPromise.catch((err) => {
            if (activeSessionRef.current !== sessionId || abortIndicAudioRef.current) return;
            console.warn('[IndicTTS] Audio play() promise rejected:', err);
            if (audio.src && audio.src.includes('/api/tts')) {
              audio.src = fallbackUrl;
              audio.play().catch(() => handleDone());
            } else {
              handleDone();
            }
          });
        }
      };

      playNextChunk();
    },
    [log]
  );

  /**
   * Speak TTS then listen immediately with zero latency (supports both object and positional args)
   */
  const speakThenListen = useCallback(
    (arg1, arg2 = 'en-IN', arg3) => {
      setError(null);

      let msg = '';
      let targetLang = 'en-IN';
      let onTranscriptCb = null;

      if (typeof arg1 === 'object' && arg1 !== null) {
        msg = arg1.prompt || arg1.message || '';
        targetLang = arg1.languageCode || arg1.language || 'en-IN';
        onTranscriptCb = arg1.onTranscript || null;
      } else {
        msg = arg1 || '';
        targetLang = arg2;
        onTranscriptCb = arg3 || null;
      }

      if (!msg) {
        listen(targetLang, onTranscriptCb);
        return;
      }

      // Auto-detect language script
      if (/[\u0C80-\u0CFF]/.test(msg)) targetLang = 'kn-IN';
      else if (/[\u0900-\u097F]/.test(msg)) targetLang = 'hi-IN';
      else if (/[\u0B80-\u0BFF]/.test(msg)) targetLang = 'ta-IN';
      else if (/[\u0C00-\u0C7F]/.test(msg)) targetLang = 'te-IN';

      const prefix = targetLang.split('-')[0].toLowerCase();
      const isKannada =
        prefix === 'kn' ||
        /[\u0C80-\u0CFF]/.test(msg) ||
        /\b(namaskara|namaskar|hegidd|oota|thindi|sahaya|biddidd|aushadhi|kannada|avare|mathad|bejaru|arama|chennagidd)\b/i.test(msg);

      // Kannada route -> Always high-fidelity Indic neural TTS!
      if (isKannada) {
        playIndicAudio(msg, 'kn', () => {
          listen(targetLang, onTranscriptCb);
        });
        return;
      }

      // Other Indic routes without natural browser voice
      if (['hi', 'ta', 'te'].includes(prefix)) {
        const naturalVoice = getVoiceForLanguage(targetLang);
        const isTrueNatural = naturalVoice && (naturalVoice.name.toLowerCase().includes('natural') || naturalVoice.name.toLowerCase().includes('neural'));
        if (!isTrueNatural) {
          playIndicAudio(msg, prefix, () => {
            listen(targetLang, onTranscriptCb);
          });
          return;
        }
      }

      log(`⚡ Clear Voice TTS (${targetLang}): "${msg.substring(0, 60)}..."`, 'info');

      if (!isTTSSupported) {
        listen(targetLang, onTranscriptCb);
        return;
      }

      // Clear any pending browser speech queue and wake up synthesizer
      window.speechSynthesis.cancel();
      if (window.speechSynthesis.paused) {
        try { window.speechSynthesis.resume(); } catch (e) {}
      }

      const targetVoice = getVoiceForLanguage(targetLang);

      const utterance = new SpeechSynthesisUtterance(msg);
      utterance.lang = targetVoice ? targetVoice.lang : 'en-US';
      utterance.rate = 1.0;
      utterance.pitch = 1.0;

      if (targetVoice) {
        utterance.voice = targetVoice;
      }

      isSpeakingRef.current = true;
      setIsSpeaking(true);

      utterance.onend = () => {
        isSpeakingRef.current = false;
        setIsSpeaking(false);
        listen(targetLang, onTranscriptCb);
      };

      utterance.onerror = () => {
        isSpeakingRef.current = false;
        setIsSpeaking(false);
        listen(targetLang, onTranscriptCb);
      };

      window.speechSynthesis.speak(utterance);
    },
    [isTTSSupported, listen, log, getVoiceForLanguage, playIndicAudio]
  );

  const speak = useCallback(
    (message, languageCode = 'en-IN') => {
      if (!message || typeof message !== 'string') return;
      setError(null);

      // Auto-detect language script
      let detectedLang = languageCode || 'en-IN';
      if (/[\u0C80-\u0CFF]/.test(message)) detectedLang = 'kn-IN';
      else if (/[\u0900-\u097F]/.test(message)) detectedLang = 'hi-IN';
      else if (/[\u0B80-\u0BFF]/.test(message)) detectedLang = 'ta-IN';
      else if (/[\u0C00-\u0C7F]/.test(message)) detectedLang = 'te-IN';

      const prefix = detectedLang.split('-')[0].toLowerCase();
      const isKannada =
        prefix === 'kn' ||
        /[\u0C80-\u0CFF]/.test(message) ||
        /\b(namaskara|namaskar|hegidd|oota|thindi|sahaya|biddidd|aushadhi|kannada|avare|mathad|bejaru|arama|chennagidd)\b/i.test(message);

      // Kannada route -> Always high-fidelity Indic neural TTS!
      if (isKannada) {
        playIndicAudio(message, 'kn');
        return;
      }

      // Other Indic routes without natural browser voice
      if (['hi', 'ta', 'te'].includes(prefix)) {
        const naturalVoice = getVoiceForLanguage(detectedLang);
        const isTrueNatural = naturalVoice && (naturalVoice.name.toLowerCase().includes('natural') || naturalVoice.name.toLowerCase().includes('neural'));
        if (!isTrueNatural) {
          playIndicAudio(message, prefix);
          return;
        }
      }

      if (!isTTSSupported) return;
      window.speechSynthesis.cancel();

      const targetVoice = getVoiceForLanguage(detectedLang);

      const utterance = new SpeechSynthesisUtterance(message);
      utterance.lang = targetVoice ? targetVoice.lang : 'en-US';
      utterance.rate = 1.0;
      utterance.pitch = 1.0;

      if (targetVoice) {
        utterance.voice = targetVoice;
      }

      isSpeakingRef.current = true;
      setIsSpeaking(true);

      utterance.onend = () => {
        isSpeakingRef.current = false;
        setIsSpeaking(false);
      };
      utterance.onerror = () => {
        isSpeakingRef.current = false;
        setIsSpeaking(false);
      };

      if (window.speechSynthesis.paused) {
        try { window.speechSynthesis.resume(); } catch (e) {}
      }

      setTimeout(() => {
        try {
          if (window.speechSynthesis.paused) {
            window.speechSynthesis.resume();
          }
          window.speechSynthesis.speak(utterance);
        } catch (e) {
          console.warn('speechSynthesis.speak error:', e);
        }
      }, 40);
    },
    [isTTSSupported, getVoiceForLanguage, playIndicAudio]
  );

  return {
    speakThenListen,
    speak,
    playIndicAudio,
    listen,
    stop,
    finishListening,
    testMicrophone,
    isSpeaking,
    isListening,
    error,
    clearError: () => setError(null),
    isSupported,
    isSecureContext,
    secondsLeft,
    interimText,
    debugLogs,
    clearLogs,
  };
}

