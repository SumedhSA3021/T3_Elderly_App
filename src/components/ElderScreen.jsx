import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useWebSocket } from '../hooks/useWebSocket';
import { useVoiceHandler } from '../hooks/useVoiceHandler';
import { useCheckInScheduler } from '../hooks/useCheckInScheduler';
import CheckInCard from './CheckInCard';
import { FallEmergencyModal } from './FallEmergencyModal';
import { postSensorEvent, postDecision, fetchLatestEvents, fetchLatestDecisions } from '../api/api';
import { playEmergencyAlarm, playGentleChime, playSuccessChime, playPhoneRing } from '../utils/audioChimes';
import { localizeMessage, getLocalizedTierLabel } from '../utils/translator';
import ElderProfileView from './ElderProfileView';
import { generateCompanionDecision, dispatchCompanionDecision } from '../services/ElderAiCompanionService';
import './ElderScreen.css';

const ELDER_ID = import.meta.env.VITE_ELDER_ID || 'kamala_001';

/**
 * UI Translations (English)
 */
const I18N = {
  'en-IN': {
    appName: 'SHASTRA GUARDIAN',
    appSub: 'Elder Companion & Safety',
    familySynced: 'Family Synced',
    calmStatus: 'Kamala is Safe & Comfortable',
    calmSub: 'ShastraVision Active • Vitals & Posture Normal',
    listening: 'Listening...',
    listeningSub: 'Speak naturally in your language',
    sentConfirmation: '✓ Dispatched to Care Team',
    sosSentStatus: 'Emergency SOS Dispatched',
    sosSentSub: 'Dispatched to 112 & Family • Help on the way',
    speakingStatus: 'Companion Speaking...',
    speakingSub: 'Empathetic voice assistant responding',
    reconnectingStatus: 'Reconnecting to Cloud',
    reconnectingSub: 'Re-establishing live medical WebSocket stream',

    // Companion Persona
    companionGreeting: 'Hello, Kamala',
    companionGreetingSub: "I'm your personal care companion. How are you feeling today?",
    companionPresenceHint: 'Tap anytime to ask questions, report symptoms, or chat',
    companionIdleBubble: 'Feel free to talk with me about your health, medicines, or how your day is going.',
    companionYouSaid: 'You said:',
    companionReplayBtn: '🔊 Replay Voice',

    // Family Glance Card
    familyGlanceTitle: 'Family Message',
    familyGlanceSender: 'Priya (Daughter)',
    familyGlanceTime: '10m ago',
    familyGlanceNote: 'Had breakfast Amma? Don\'t forget your afternoon medicine, visiting this evening! ❤️',
    familyQuickReply: '❤️ Send "I\'m Doing Well"',
    familyReplySent: '✓ Quick reply sent to Priya',

    // Primary SOS Tile
    sosBadge: 'Emergency Help • 112',
    sosBtnLabel: 'I Need Help',
    sosBtnSub: 'Immediate alert to 112 & family',
    sosBtnActiveLabel: 'Help Requested',
    sosBtnActiveSub: '112 & family alerted • Help is coming',

    // 3 Major Action Buttons
    callFamilyBadge: 'Family Direct',
    callFamilyBtn: 'Call Priya',
    callFamilySub: 'Priya (Daughter) • Instant phone call',
    callFamilyStatus: 'Calling Priya directly...',

    // Daily Mood / Rhythm Row
    moodRowTitle: "Today's Wellness & Rhythm",
    moodGood: 'Energetic',
    moodCalm: 'Peaceful',
    moodResting: 'Resting',
    moodRecordedToast: 'Wellness state shared with family',

    // Voice Intercom Dock
    voiceBadge: 'Care Companion',
    voiceIntercomLabel: 'Speak freely with your companion',
    voiceIntercomSub: 'Ask health questions, report symptoms, or chat anytime',
    talkBtnTapToSpeak: 'Tap to Talk With Me',
    talkBtnListening: 'Listening to you...',
    talkBtnSpeakNow: 'Speak clearly now',

    // Medication Tracker
    medTrackerTitle: 'Medication Schedule',
    medTakenBadge: 'Taken',
    medDueBadge: 'Due Now',
    medMarkTakenBtn: '✓ Took This',

    // Fall & Vision Perception Translations
    fallAlertTitle: 'Did you fall?',
    fallAlertPrompt: 'ShastraVision detected a sudden fall or posture anomaly. Are you okay?',
    fallVoiceCheck: 'Kamala, did you fall? Are you okay? Please speak or press the button.',
    emotionSadPrompt: 'I noticed you might be feeling sad or distressed. I am right here with you. How can I help?',
    emotionFearPrompt: 'Do not worry, you are safe. I am right here with you.',
    inactivityPrompt: 'Checking in to see if you are resting comfortably.',

    // Escalation Mode Translations
    alertTitle: 'Did you fall? Are you okay?',
    alertSub: 'Did you fall? Are you fine? Please confirm if you are safe or we will call for help.',
    yesImFineBtn: 'I\'M OKAY — STOP TIMER',
    yesImFineSub: 'Reset and cancel emergency escalation',
    fineConfirmationTts: 'Glad you are safe. Escalation cancelled.',
    escalationWarning: 'Auto-escalating to Family & 112 if no response',

    // Escalation Tiers
    tier1: 'Tier 1: Voice Check-in',
    tier2: 'Tier 2: Caregiver Ring & Escalation Pending',
    tier3: 'Tier 3: Caregiver Escalation & Emergency Dispatch',
    secondsShort: 's',

    // Alert Actions & Subtexts
    streamingAudioSub: 'Streaming audio response live',
    speakToExplainSub: 'Speak to explain your situation',
    sosEmergencyBadge: '(112 Emergency)',

    // Voice & Telemetry
    telemetryHubLabel: 'Hub Link:',
    telemetryHubConnected: 'Connected',
    telemetryHubReconnecting: 'Reconnecting',
    telemetryVoiceLabel: 'Voice:',
    telemetryVoiceReady: 'Ready',
    telemetryVoiceListening: 'Listening',
    telemetryVoiceSpeaking: 'Speaking',
    toolVisionSim: '👁️ Vision Sim',
    toolCheckIns: '📋 Check-ins',
    toolSteadiness: '🚶 Steadiness',

    // Voice States
    voiceStateListening: '● LISTENING',
    voiceStateSpeaking: '● SPEAKING',
    voiceStateReady: '● READY',
    liveSpeechStream: 'LIVE SPEECH STREAM:',
    dialFamilyPill: 'DIAL 📞',
    voiceIssueHeadline: 'Voice issue — tap to retry',
    voiceIssueDetail: 'Microphone permission check recommended',

    // Drawers
    drawerVisionTitle: '👁️ ShastraVision Perception Stream Triggers:',
    drawerTriggerFall: '💥 Trigger Fall Detected',
    drawerTriggerSad: '😢 Trigger Distress (Sad)',
    drawerTriggerFear: '😨 Trigger Distress (Fear)',
    drawerTriggerInactivity: '🛑 Trigger Inactivity',
    drawerCheckInTitle: '📋 Health Check-Ins:',
    drawerCognitive: '🧠 Cognitive Check',
    drawerBreakfast: '🥣 Breakfast',
    drawerLunch: '🍲 Lunch',
    drawerSleep: '🌙 Sleep Quality',
    drawerMobility: '🚶 Mobility steadiness',
  },
  'hi-IN': {
    appName: 'शास्त्र गार्डियन',
    appSub: 'बुज़ुर्ग साथी एवं सुरक्षा',
    familySynced: 'परिवार से जुड़ा',
    calmStatus: 'कमला सुरक्षित और आरामदायक हैं',
    calmSub: 'शास्त्र विज़न सक्रिय • स्वास्थ्य और मुद्रा सामान्य',
    listening: 'सुन रहा है...',
    listeningSub: 'अपनी भाषा में स्वाभाविक रूप से बोलें',
    sentConfirmation: '✓ देखभाल टीम को भेजा गया',
    sosSentStatus: 'आपातकालीन SOS भेजा गया',
    sosSentSub: '112 और परिवार को सूचित किया गया • मदद आ रही है',
    speakingStatus: 'साथी बोल रहा है...',
    speakingSub: 'सहानुभूतिपूर्ण वॉइस सहायक जवाब दे रहा है',
    reconnectingStatus: 'क्लाउड से पुनः जुड़ रहा है',
    reconnectingSub: 'लाइव मेडिकल स्ट्रीम पुनः स्थापित हो रही है',

    // Companion Persona
    companionGreeting: 'नमस्ते, कमला जी',
    companionGreetingSub: 'मैं आपकी व्यक्तिगत देखभाल साथी हूँ। आज आप कैसा महसूस कर रही हैं?',
    companionPresenceHint: 'सवाल पूछने, लक्षण बताने या बातचीत करने के लिए कभी भी टैप करें',
    companionIdleBubble: 'अपने स्वास्थ्य, दवाइयों या दिनचर्या के बारे में मुझसे बेझिझक बात करें।',
    companionYouSaid: 'आपने कहा:',
    companionReplayBtn: '🔊 आवाज़ दोहराएं',

    // Family Glance Card
    familyGlanceTitle: 'परिवार का संदेश',
    familyGlanceSender: 'प्रिया (बेटी)',
    familyGlanceTime: '10 मिनट पहले',
    familyGlanceNote: 'अम्मा, नाश्ता किया? दोपहर की दवाई मत भूलना, शाम को मिलने आ रही हूँ! ❤️',
    familyQuickReply: '❤️ "मैं ठीक हूँ" भेजें',
    familyReplySent: '✓ प्रिया को जवाब भेजा गया',

    // Primary SOS Tile
    sosBadge: 'आपातकालीन सहायता • 112',
    sosBtnLabel: 'मुझे मदद चाहिए',
    sosBtnSub: '112 और परिवार को तुरंत सूचना',
    sosBtnActiveLabel: 'सहायता अनुरोध भेजा गया',
    sosBtnActiveSub: '112 और परिवार को सतर्क किया गया • मदद आ रही है',

    // 3 Major Action Buttons
    callFamilyBadge: 'परिवार संपर्क',
    callFamilyBtn: 'प्रिया को कॉल करें',
    callFamilySub: 'प्रिया (बेटी) • तुरंत फ़ोन कॉल',
    callFamilyStatus: 'प्रिया को कॉल किया जा रहा है...',

    // Daily Mood / Rhythm Row
    moodRowTitle: 'आज का स्वास्थ्य और लय',
    moodGood: 'ऊर्जावान',
    moodCalm: 'शांत',
    moodResting: 'आराम',
    moodRecordedToast: 'स्वास्थ्य स्थिति परिवार के साथ साझा की गई',

    // Voice Intercom Dock
    voiceBadge: 'देखभाल साथी',
    voiceIntercomLabel: 'अपने साथी से बेझिझक बात करें',
    voiceIntercomSub: 'स्वास्थ्य प्रश्न, लक्षण या सामान्य बातचीत',
    talkBtnTapToSpeak: 'मुझसे बात करने के लिए टैप करें',
    talkBtnListening: 'आपकी बात सुन रहे हैं...',
    talkBtnSpeakNow: 'अब स्पष्ट रूप से बोलें',

    // Medication Tracker
    medTrackerTitle: 'दवाई अनुसूची',
    medTakenBadge: 'ली गई',
    medDueBadge: 'अभी लें',
    medMarkTakenBtn: '✓ ले ली',

    // Fall & Vision Perception Translations
    fallAlertTitle: 'क्या आप गिर गई हैं?',
    fallAlertPrompt: 'शास्त्र विज़न ने अचानक गिरावट या मुद्रा में बदलाव का पता लगाया है। क्या आप ठीक हैं?',
    fallVoiceCheck: 'कमला जी, क्या आप गिर गई हैं? क्या आप ठीक हैं? कृपया बोलें या बटन दबाएं।',
    emotionSadPrompt: 'मुझे लगा कि आप उदास या परेशान हैं। मैं आपके साथ हूँ, क्या आपको किसी मदद की ज़रूरत है?',
    emotionFearPrompt: 'घबराएं नहीं, आप सुरक्षित हैं। मैं आपके साथ हूँ।',
    inactivityPrompt: 'कमला जी, बस यह देखने के लिए कि आप आराम से और ठीक हैं।',

    // Escalation Mode Translations
    alertTitle: 'क्या आप गिर गई हैं? क्या आप ठीक हैं?',
    alertSub: 'क्या आप गिरी हैं? क्या आप सुरक्षित हैं? कृपया पुष्टि करें अन्यथा हम मदद बुलाएंगे।',
    yesImFineBtn: 'मैं ठीक हूँ — टाइमर रोकें',
    yesImFineSub: 'आपातकालीन अलर्ट रद्द करें',
    fineConfirmationTts: 'आप सुरक्षित हैं, यह जानकर खुशी हुई। अलर्ट रद्द किया गया।',
    escalationWarning: 'कोई प्रतिक्रिया न मिलने पर परिवार और 112 को सूचित किया जाएगा',

    // Escalation Tiers
    tier1: 'स्तर १: वॉयस चेक-इन',
    tier2: 'स्तर २: परिवार को कॉल और अलर्ट',
    tier3: 'स्तर ३: आपातकालीन 112 सहायता',
    secondsShort: 'से',

    // Alert Actions & Subtexts
    streamingAudioSub: 'लाइव ऑडियो चल रहा है',
    speakToExplainSub: 'अपनी स्थिति बताने के लिए बोलें',
    sosEmergencyBadge: '(112 आपातकालीन)',

    // Voice & Telemetry
    telemetryHubLabel: 'हब लिंक:',
    telemetryHubConnected: 'जुड़ा हुआ',
    telemetryHubReconnecting: 'पुनः जुड़ रहा है...',
    telemetryVoiceLabel: 'वॉइस:',
    telemetryVoiceReady: 'तैयार',
    telemetryVoiceListening: 'सुन रहा है',
    telemetryVoiceSpeaking: 'बोल रहा है',
    toolVisionSim: '👁️ विज़न सिम',
    toolCheckIns: '📋 चेक-इन',
    toolSteadiness: '🚶 स्थिरता जांच',

    // Voice States
    voiceStateListening: '● सुन रहा है',
    voiceStateSpeaking: '● बोल रहा है',
    voiceStateReady: '● तैयार',
    liveSpeechStream: 'लाइव स्पीच स्ट्रीम:',
    dialFamilyPill: 'कॉल करें 📞',
    voiceIssueHeadline: 'वॉइस समस्या — पुनः प्रयास करें',
    voiceIssueDetail: 'माइक्रोफ़ोन अनुमति जांचें',

    // Drawers
    drawerVisionTitle: '👁️ शास्त्र विज़न ट्रिगर:',
    drawerTriggerFall: '💥 गिरावट पहचान',
    drawerTriggerSad: '😢 भावनात्मक संकट (उदासी)',
    drawerTriggerFear: '😨 भावनात्मक संकट (भय)',
    drawerTriggerInactivity: '🛑 निष्क्रियता पहचान',
    drawerCheckInTitle: '📋 स्वास्थ्य जांच:',
    drawerCognitive: '🧠 संज्ञानात्मक जांच',
    drawerBreakfast: '🥣 नाश्ता',
    drawerLunch: '🍲 दोपहर का भोजन',
    drawerSleep: '🌙 नींद की गुणवत्ता',
    drawerMobility: '🚶 चलने की स्थिरता',
  },
  'kn-IN': {
    appName: 'ಶಾಸ್ತ್ರ ಗಾರ್ಡಿಯನ್',
    appSub: 'ಹಿರಿಯರ ಸುರಕ್ಷತೆ & ಒಡನಾಡಿ',
    familySynced: 'ಕುಟುಂಬ ಸಂಪರ್ಕದಲ್ಲಿದೆ',
    calmStatus: 'ಕಮಲಾ ಅವರು ಸುರಕ್ಷಿತವಾಗಿದ್ದಾರೆ',
    calmSub: 'ಶಾಸ್ತ್ರ ವಿಷನ್ ಸಕ್ರಿಯ • ಸಾಮಾನ್ಯ ಭಂಗಿ & ಕ್ಷೇಮ',
    listening: 'ಆಲಿಸುತ್ತಿದೆ...',
    listeningSub: 'ನಿಮ್ಮ ಮಾತೃಭಾಷೆಯಲ್ಲಿ ಮಾತನಾಡಿ',
    sentConfirmation: '✓ ಸಂದೇಶ ರವಾನಿಸಲಾಗಿದೆ',
    sosSentStatus: 'ತುರ್ತು ಎಚ್ಚರಿಕೆ ರವಾನಿಸಲಾಗಿದೆ',
    sosSentSub: '೧೧೨ ಮತ್ತು ಕುಟುಂಬಕ್ಕೆ ರವಾನಿಸಲಾಗಿದೆ • ಸಹಾಯ ಬರುತ್ತಿದೆ',
    speakingStatus: 'ಒಡನಾಡಿ ಮಾತನಾಡುತ್ತಿದೆ...',
    speakingSub: 'ಧ್ವನಿ ಸಹಾಯಕ ಮಾತನಾಡುತ್ತಿದೆ',
    reconnectingStatus: 'ಕ್ಲೌಡ್ ಮರುಸಂಪರ್ಕ...',
    reconnectingSub: 'ಲೈವ್ ಸ್ಟ್ರೀಮ್ ಸಂಪರ್ಕಿಸಲಾಗುತ್ತಿದೆ',

    // Companion Persona
    companionGreeting: 'ನಮಸ್ಕಾರ, ಕಮಲಾ ಅವರೇ',
    companionGreetingSub: 'ನಾನು ನಿಮ್ಮ ಆರೈಕೆ ಒಡನಾಡಿ. ಇಂದು ನಿಮ್ಮ ದಿನ ಹೇಗಿದೆ?',
    companionPresenceHint: 'ಆರೋಗ್ಯ ವಿಚಾರಿಸಲು ಅಥವಾ ಮಾತನಾಡಲು ಯಾವುದೇ ಸಮಯದಲ್ಲಿ ಟ್ಯಾಪ್ ಮಾಡಿ',
    companionIdleBubble: 'ನಿಮ್ಮ ಆರೋಗ್ಯ, ಔಷಧಿ ಅಥವಾ ಯೋಗಕ್ಷೇಮದ ಬಗ್ಗೆ ನನ್ನೊಂದಿಗೆ ನಿರಾಳವಾಗಿ ಮಾತನಾಡಿ.',
    companionYouSaid: 'ನೀವು ಹೇಳಿದ್ದು:',
    companionReplayBtn: '🔊 ಧ್ವನಿ ಮರುಪ್ಲೇ',

    // Family Glance Card
    familyGlanceTitle: 'ಕುಟುಂಬದ ಸಂದೇಶ',
    familyGlanceSender: 'ಪ್ರಿಯಾ (ಮಗಳು)',
    familyGlanceTime: '೧೦ ನಿಮಿಷಗಳ ಹಿಂದೆ',
    familyGlanceNote: 'ತಿಂಡಿ ತಿಂದಿರಾ ಅಮ್ಮಾ? ಮಧ್ಯಾಹ್ನದ ಔಷಧಿ ಮರೆಯಬೇಡಿ, ಸಂಜೆ ಭೇಟಿಯಾಗುತ್ತೇನೆ! ❤️',
    familyQuickReply: '❤️ "ನಾನು ಕ್ಷೇಮವಾಗಿದ್ದೇನೆ" ಎಂದು ಕಳುಹಿಸಿ',
    familyReplySent: '✓ ಪ್ರಿಯಾಗೆ ಉತ್ತರಿಸಲಾಗಿದೆ',

    // Primary SOS Tile
    sosBadge: 'ತುರ್ತು ಸಹಾಯ • ೧೧೨',
    sosBtnLabel: 'ನನಗೆ ಸಹಾಯ ಬೇಕು',
    sosBtnSub: '೧೧೨ ಮತ್ತು ಕುಟುಂಬಕ್ಕೆ ತಕ್ಷಣ ಎಚ್ಚರಿಕೆ',
    sosBtnActiveLabel: 'ಸಹಾಯ ಕೋರಲಾಗಿದೆ',
    sosBtnActiveSub: '೧೧೨ ಮತ್ತು ಕುಟುಂಬಕ್ಕೆ ಎಚ್ಚರಿಸಲಾಗಿದೆ • ಸಹಾಯ ಬರುತ್ತಿದೆ',

    // 3 Major Action Buttons
    callFamilyBadge: 'ಕುಟುಂಬ ಸಂಪರ್ಕ',
    callFamilyBtn: 'ಪ್ರಿಯಾಗೆ ಕರೆ',
    callFamilySub: 'ಪ್ರಿಯಾ (ಮಗಳು) • ತಕ್ಷಣದ ಫೋನ್ ಕರೆ',
    callFamilyStatus: 'ಪ್ರಿಯಾಗೆ ಕರೆ ಮಾಡಲಾಗುತ್ತಿದೆ...',

    // Daily Mood / Rhythm Row
    moodRowTitle: 'ಇಂದಿನ ಕ್ಷೇಮ ಮತ್ತು ಲಯ',
    moodGood: 'ಉತ್ಸಾಹ',
    moodCalm: 'ಶಾಂತ',
    moodResting: 'ವಿಶ್ರಾಂತಿ',
    moodRecordedToast: 'ಕ್ಷೇಮ ಸ್ಥಿತಿ ಕುಟುಂಬದೊಂದಿಗೆ ಹಂಚಿಕೊಳ್ಳಲಾಗಿದೆ',

    // Voice Intercom Dock
    voiceBadge: 'ಆರೈಕೆ ಒಡನಾಡಿ',
    voiceIntercomLabel: 'ನಿಮ್ಮ ಒಡನಾಡಿಯೊಂದಿಗೆ ಮುಕ್ತವಾಗಿ ಮಾತನಾಡಿ',
    voiceIntercomSub: 'ಆರೋಗ್ಯ ಪ್ರಶ್ನೆಗಳು, ರೋಗಲಕ್ಷಣಗಳು ಅಥವಾ ಸಾಮಾನ್ಯ ಹರಟೆ',
    talkBtnTapToSpeak: 'ನನ್ನೊಂದಿಗೆ ಮಾತನಾಡಲು ಟ್ಯಾಪ್ ಮಾಡಿ',
    talkBtnListening: 'ಆಲಿಸಲಾಗುತ್ತಿದೆ...',
    talkBtnSpeakNow: 'ಸ್ಪಷ್ಟವಾಗಿ ಮಾತನಾಡಿ',

    // Medication Tracker
    medTrackerTitle: 'ಔಷಧಿ ವೇಳಾಪಟ್ಟಿ',
    medTakenBadge: 'ತೆಗೆದುಕೊಂಡಾಗಿದೆ',
    medDueBadge: 'ಈಗ ತೆಗೆದುಕೊಳ್ಳಿ',
    medMarkTakenBtn: '✓ ತೆಗೆದುಕೊಂಡಿದ್ದೇನೆ',

    // Fall & Vision Perception Translations
    fallAlertTitle: 'ನೀವು ಕೆಳಗೆ ಬಿದ್ದಿದ್ದೀರಾ?',
    fallAlertPrompt: 'ಕೋಣೆಯಲ್ಲಿ ಹಠಾತ್ ಕುಸಿತ ಅಥವಾ ಭಂಗಿಯ ಏರುಪೇರು ಪತ್ತೆಯಾಗಿದೆ. ನೀವು ಕ್ಷೇಮವಾಗಿದ್ದೀರಾ?',
    fallVoiceCheck: 'ಕಮಲಾ ಅವರೇ, ಬಿದ್ದಿದ್ದೀರಾ? ನಿಮಗೆ ಆರಾಮವಿದೆಯೇ? ದಯವಿಟ್ಟು ಮಾತನಾಡಿ ಅಥವಾ ಬಟನ್ ಒತ್ತಿ.',
    emotionSadPrompt: 'ನೀವು ಬೇಸರ ಅಥವಾ ಆತಂಕದಲ್ಲಿದ್ದಂತೆ ತೋರುತ್ತಿದೆ. ನಾನು ನಿಮ್ಮೊಂದಿಗೆ ಇದ್ದೇನೆ, ಏನಾದರೂ ಸಹಾಯ ಬೇಕೇ?',
    emotionFearPrompt: 'ಚಿಂತಿಸಬೇಡಿ, ನೀವು ಸುರಕ್ಷಿತವಾಗಿದ್ದೀರಿ. ನಾನು ಇಲ್ಲೇ ನಿಮ್ಮೊಂದಿಗೆ ಇದ್ದೇನೆ.',
    inactivityPrompt: 'ಕಮಲಾ ಅವರೇ, ನೀವು ಆರಾಮವಾಗಿ ವಿಶ್ರಾಂತಿ ಪಡೆಯುತ್ತಿದ್ದೀರಾ ಎಂದು ಪರಿಶೀಲಿಸುತ್ತಿದ್ದೇನೆ.',

    // Escalation Mode Translations
    alertTitle: 'ನೀವು ಬಿದ್ದಿದ್ದೀರಾ? ಕ್ಷೇಮವಾಗಿದ್ದೀರಾ?',
    alertSub: 'ಕಮಲಾ ಅವರೇ, ನೀವು ಬಿದ್ದಿದ್ದೀರಾ? ನಿಮಗೆ ಆರಾಮವಿದೆಯೇ? ದಯವಿಟ್ಟು ಖಚಿತಪಡಿಸಿ.',
    yesImFineBtn: 'ನಾನು ಕ್ಷೇಮವಾಗಿದ್ದೇನೆ — ಟೈಮರ್ ನಿಲ್ಲಿಸಿ',
    yesImFineSub: 'ಎಚ್ಚರಿಕೆ ರದ್ದುಮಾಡಿ ಮತ್ತು ಸಾಮಾನ್ಯ ಸ್ಥಿತಿಗೆ ಮರಳಿ',
    fineConfirmationTts: 'ನೀವು ಸುರಕ್ಷಿತವಾಗಿರುವುದು ಸಂತೋಷ ತಂದಿದೆ. ಎಚ್ಚರಿಕೆ ರದ್ದುಗೊಂಡಿದೆ.',
    escalationWarning: 'ಯಾವುದೇ ಪ್ರತಿಕ್ರಿಯೆ ಇಲ್ಲದಿದ್ದರೆ ಕುಟುಂಬ ಮತ್ತು ೧೧೨ ಕ್ಕೆ ಎಚ್ಚರಿಕೆ ರವಾನೆಯಾಗುತ್ತದೆ',

    // Escalation Tiers
    tier1: 'ಹಂತ ೧: ಧ್ವನಿ ವಿಚಾರಣೆ',
    tier2: 'ಹಂತ ೨: ಆರೈಕೆದಾರರ ಫೋನ್ & ತುರ್ತು ಮುನ್ಸೂಚನೆ',
    tier3: 'ಹಂತ ೩: ತುರ್ತು ರವಾನೆ & ೧೧೨ ಸಂಪರ್ಕ',
    secondsShort: 'ಸೆ',

    // Alert Actions & Subtexts
    streamingAudioSub: 'ಧ್ವನಿ ಆಡಿಯೋ ಲೈವ್ ಪ್ಲೇ ಆಗುತ್ತಿದೆ',
    speakToExplainSub: 'ನಿಮ್ಮ ಪರಿಸ್ಥಿತಿಯನ್ನು ವಿವರಿಸಿ',
    sosEmergencyBadge: '(೧೧೨ ತುರ್ತು)',

    // Voice & Telemetry
    telemetryHubLabel: 'ಹಬ್ ಲಿಂಕ್:',
    telemetryHubConnected: 'ಸಂಪರ್ಕಿತ',
    telemetryHubReconnecting: 'ಮರುಸಂಪರ್ಕ...',
    telemetryVoiceLabel: 'ಧ್ವನಿ:',
    telemetryVoiceReady: 'ಸಿದ್ಧ',
    telemetryVoiceListening: 'ಆಲಿಸುತ್ತಿದೆ',
    telemetryVoiceSpeaking: 'ಮಾತನಾಡುತ್ತಿದೆ',
    toolVisionSim: '👁️ ವಿಷನ್ ಸಿಮ್ಯುಲೇಶನ್',
    toolCheckIns: '📋 ಆರೋಗ್ಯ ಪರಿಶೀಲನೆ',
    toolSteadiness: '🚶 ಸ್ಥಿರತೆ ಪರಿಶೀಲನೆ',

    // Voice States
    voiceStateListening: '● ಆಲಿಸುತ್ತಿದೆ',
    voiceStateSpeaking: '● ಮಾತನಾಡುತ್ತಿದೆ',
    voiceStateReady: '● ಸಿದ್ಧ',
    liveSpeechStream: 'ಲೈವ್ ಭಾಷಣ ಸ್ಟ್ರೀಮ್:',
    dialFamilyPill: 'ಕರೆ ಮಾಡಿ 📞',
    voiceIssueHeadline: 'ಧ್ವನಿ ಸಮಸ್ಯೆ — ಮರುಪ್ರಯತ್ನಿಸಿ',
    voiceIssueDetail: 'ಮೈಕ್ರೊಫೋನ್ ಅನುಮತಿ ಪರಿಶೀಲಿಸಿ',

    // Drawers
    drawerVisionTitle: '👁️ ಶಾಸ್ತ್ರ ವಿಷನ್ ಪ್ರಚೋದಕಗಳು:',
    drawerTriggerFall: '💥 ಬಿದ್ದಿರುವುದು ಪತ್ತೆ',
    drawerTriggerSad: '😢 ಆತಂಕ ಪತ್ತೆ (ಬೇಸರ)',
    drawerTriggerFear: '😨 ಆತಂಕ ಪತ್ತೆ (ಭಯ)',
    drawerTriggerInactivity: '🛑 ನಿಶ್ಚಲತೆ ಪತ್ತೆ',
    drawerCheckInTitle: '📋 ಆರೋಗ್ಯ ಪರಿಶೀಲನೆಗಳು:',
    drawerCognitive: '🧠 ನೆನಪಿನ ಶಕ್ತಿ ಪರಿಶೀಲನೆ',
    drawerBreakfast: '🥣 ಉಪಾಹಾರ',
    drawerLunch: '🍲 ಊಟ',
    drawerSleep: '🌙 ನಿದ್ರೆ ಗುಣಮಟ್ಟ',
    drawerMobility: '🚶 ನಡಿಗೆ ಸ್ಥಿರತೆ',
  },
};

/**
 * Build a SensorEvent payload strictly matching Schema A.
 */
function buildSensorEvent({
  eventType = 'voice_input',
  confidence = 1.0,
  voiceTranscript = null,
  emotion = null,
}) {
  return {
    type: 'SensorEvent',
    event_id: crypto.randomUUID(),
    elder_id: ELDER_ID,
    event_type: eventType,
    confidence,
    voice_transcript: voiceTranscript,
    emotion,
    timestamp: new Date().toISOString(),
  };
}

export default function ElderScreen() {
  const classifyAndDispatchRef = useRef(null);
  const handleIncomingWsMessage = useCallback((data) => {
    if (classifyAndDispatchRef.current) {
      try {
        classifyAndDispatchRef.current(data);
      } catch (err) {
        console.warn('classifyAndDispatch error:', err);
      }
    }
  }, []);

  const { isConnected, lastMessage, sendMessage } = useWebSocket(handleIncomingWsMessage);
  const {
    speakThenListen,
    speak,
    listen,
    stop,
    finishListening,
    isSpeaking,
    isListening,
    error: voiceError,
    clearError,
    secondsLeft,
    interimText,
  } = useVoiceHandler();

  const lastSpokenAiDecisionIdRef = useRef(null);
  const lastReceivedAiDecisionTimeRef = useRef(0);

  // Auto-clear voice error after 3.5s so screen never remains permanently locked in error state
  useEffect(() => {
    if (!voiceError) return;
    const timer = setTimeout(() => {
      if (clearError) clearError();
    }, 3500);
    return () => clearTimeout(timer);
  }, [voiceError, clearError]);

  const [sosSent, setSosSent] = useState(false);
  const [selectedMood, setSelectedMood] = useState(null);
  const [moodToast, setMoodToast] = useState(null);
  const [familyReplied, setFamilyReplied] = useState(false);
  const [customStatusText, setCustomStatusText] = useState('');
  const [lastSentStatus, setLastSentStatus] = useState(null);
  const [isSendingStatus, setIsSendingStatus] = useState(false);
  const statusInputRef = useRef(null);
  const [lastSpokenText, setLastSpokenText] = useState(null);
  const [selectedLang, setSelectedLang] = useState('hi-IN');
  const [currentTime, setCurrentTime] = useState(new Date());
  const [showCheckInMenu, setShowCheckInMenu] = useState(false);
  const [showVisionMenu, setShowVisionMenu] = useState(false);
  const [showMedFab, setShowMedFab] = useState(false);
  const [newMedName, setNewMedName] = useState('');
  const [showFamilySimMenu, setShowFamilySimMenu] = useState(false);
  const [activeTab, setActiveTab] = useState('home'); // 'home' | 'profile'

  // Dynamic Elder Profile State (loaded from localStorage)
  const [elderProfile, setElderProfile] = useState(() => {
    try {
      const saved = localStorage.getItem('shastra_elder_profile_data');
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return { name: 'Kamala Devi', age: 72, gender: 'Female' };
  });

  // Caregiver contact is permanently locked to Priya (Daughter)
  const familyContactName = 'Priya (Daughter)';

  useEffect(() => {
    try {
      localStorage.removeItem('shastra_family_contact_name');
    } catch (e) {}
  }, []);

  // Default Idle Family Message
  const DEFAULT_FAMILY_MESSAGE = {
    sender: 'Priya (Daughter)',
    text: "Hello! I'm here if you need anything. Just let me know whenever you'd like to talk.",
    time: 'Just now',
    timestamp: Date.now(),
  };

  // Live Family Dashboard Bidirectional State
  const [familyMessage, setFamilyMessage] = useState(DEFAULT_FAMILY_MESSAGE);
  const [incomingCall, setIncomingCall] = useState(null); // { caller: string, timestamp: number }
  const [activeCall, setActiveCall] = useState(null); // { call_id: string, caller: string, startTime: number }
  const [activeCallDuration, setActiveCallDuration] = useState(0);
  const handledCallsRef = useRef(new Set());
  const activeCallRef = useRef(null);
  activeCallRef.current = activeCall;

  useEffect(() => {
    if (!activeCall) {
      setActiveCallDuration(0);
      return;
    }
    const interval = setInterval(() => {
      setActiveCallDuration((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [activeCall]);

  const formatCallDuration = useCallback((seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }, []);

  // Looping phone ring audio while an incoming family call is ringing
  useEffect(() => {
    if (!incomingCall) return;
    playPhoneRing();
    const ringInterval = setInterval(() => {
      playPhoneRing();
    }, 2500);
    return () => clearInterval(ringInterval);
  }, [incomingCall]);

  const [familyAck, setFamilyAck] = useState(null); // { acknowledgedBy: string, message: string, timestamp: number }
  const [aiAgentStatus, setAiAgentStatus] = useState(null); // { action: string, message: string, reasoning: string }

  // Dynamic Medications State (elder-managed)
  const [medications, setMedications] = useState([
    { id: 'med_bp', name: 'Amlodipine 5mg (BP)', emoji: '💊', status: 'pending' },
    { id: 'med_calcium', name: 'Calcium + Vit D3', emoji: '💊', status: 'pending' },
    { id: 'med_sugar', name: 'Metformin 500mg', emoji: '💊', status: 'pending' },
  ]);

  // Fall Emergency Modal State
  const [fallModalOpen, setFallModalOpen] = useState(false);
  const [fallReason, setFallReason] = useState('');

  // Dedicated Outgoing Call Modal State (Calling Priya)
  const [outgoingCall, setOutgoingCall] = useState(null);

  // Full Screen Incoming Backend Alert & Privilege Escalation Mode State
  const [backendAlertActive, setBackendAlertActive] = useState(false);
  const [incomingAlertMessage, setIncomingAlertMessage] = useState(null);
  const [rawAlertMessage, setRawAlertMessage] = useState(null);
  const [escalationTierKey, setEscalationTierKey] = useState('tier1');
  const [escalationSecondsLeft, setEscalationSecondsLeft] = useState(15);

  // Dynamically personalize text with active elder identity (memoized to prevent re-render loops)
  const elderFirstName = elderProfile?.name?.split(' ')[0] || 'Kamala';
  const t = useMemo(() => {
    const base = I18N[selectedLang] || I18N['en-IN'];
    const isHindi = selectedLang === 'hi-IN';
    const isKannada = selectedLang === 'kn-IN';
    return {
      ...base,
      calmStatus: isHindi
        ? `${elderFirstName} सुरक्षित और आरामदायक हैं`
        : isKannada
          ? `${elderFirstName} ಅವರು ಸುರಕ್ಷಿತವಾಗಿದ್ದಾರೆ`
          : `${elderFirstName} is Safe & Comfortable`,
      companionGreeting: isHindi
        ? `नमस्ते, ${elderFirstName} जी`
        : isKannada
          ? `ನಮಸ್ಕಾರ, ${elderFirstName} ಅವರೇ`
          : `Hello, ${elderFirstName}`,
      familyGlanceSender: isHindi ? 'प्रिया (बेटी)' : isKannada ? 'ಪ್ರಿಯಾ (ಮಗಳು)' : 'Priya (Daughter)',
      familyReplySent: isHindi ? '✓ प्रिया को जवाब भेजा गया' : isKannada ? '✓ ಪ್ರಿಯಾಗೆ ಉತ್ತರಿಸಲಾಗಿದೆ' : '✓ Quick reply sent to Priya',
    };
  }, [elderFirstName, selectedLang]);

  // Live Announcement Handshake: Broadcast once on initial WebSocket connection
  const hasAnnouncedRef = useRef(false);
  useEffect(() => {
    if (isConnected && !hasAnnouncedRef.current && elderProfile) {
      hasAnnouncedRef.current = true;
      sendMessage({
        type: 'profile_update',
        elder_id: ELDER_ID,
        profile: elderProfile,
        timestamp: new Date().toISOString(),
      });
    } else if (!isConnected) {
      hasAnnouncedRef.current = false;
    }
  }, [isConnected]);

  // Concurrency & Debounce Guards
  const processedDecisionsRef = useRef(new Set());
  const displayTimeoutRef = useRef(null);
  const escalationTimerRef = useRef(null);
  const familyMessageResetTimerRef = useRef(null);
  const lastSosTimeRef = useRef(0);
  const lastTalkTimeRef = useRef(0);
  // Cooldown guard: suppress new alerts for N ms after user dismisses one
  const alertDismissedAtRef = useRef(0);
  const ALERT_COOLDOWN_MS = 12000; // 12-second clean cooldown after dismissal
  const fallModalOpenRef = useRef(false);
  fallModalOpenRef.current = fallModalOpen;
  const [isEmergencyEscalated, setIsEmergencyEscalated] = useState(false);
  const emergencyActiveRef = useRef(false);
  // Strict once-only emergency latch: guarantee exactly ONE emergency request is sent per incident
  const hasSentEmergencyRef = useRef(false);

  // Pure derived localization for active alert message: 0ms latency on language switch
  const displayedAlertMessage = rawAlertMessage
    ? (localizeMessage(rawAlertMessage, selectedLang) || t.alertSub)
    : (incomingAlertMessage || t.alertSub);

  // Real-time Clock
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Escalation Countdown Timer
  useEffect(() => {
    if (!backendAlertActive) {
      if (escalationTimerRef.current) clearInterval(escalationTimerRef.current);
      setEscalationSecondsLeft(15);
      return;
    }

    setEscalationSecondsLeft(15);
    if (escalationTimerRef.current) clearInterval(escalationTimerRef.current);

    escalationTimerRef.current = setInterval(() => {
      setEscalationSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(escalationTimerRef.current);
          setEscalationTierKey('tier3');
          playEmergencyAlarm();
          // Auto-dismiss the alert screen after 5 seconds at tier3
          setTimeout(() => {
            setBackendAlertActive(false);
            setRawAlertMessage(null);
            setIncomingAlertMessage(null);
            setEscalationTierKey('tier1');
            alertDismissedAtRef.current = Date.now();
          }, 5000);
          return 0;
        }
        if (prev === 8) {
          setEscalationTierKey('tier2');
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (escalationTimerRef.current) clearInterval(escalationTimerRef.current);
    };
  }, [backendAlertActive]);

  /**
   * Empathetic Fall Emergency Trigger:
   * Displays compassionate "Did you fall? Are you fine?" prompt and speaks to senior.
   * Clears any active call overlays so the critical emergency interface has 100% focus.
   * Supports isForce=true to bypass cooldown for deliberate simulation/test events.
   */
  const triggerFallAlert = useCallback((customReason, isForce = false) => {
    // 1. Active cooldown protection: elder just pressed "I AM OKAY" (bypassed if explicit simulator/forced trigger)
    const timeSinceDismissal = Date.now() - alertDismissedAtRef.current;
    if (!isForce && timeSinceDismissal < ALERT_COOLDOWN_MS) {
      console.log(`🛡️ Suppressing fall alert: elder confirmed safe ${Math.round(timeSinceDismissal / 1000)}s ago (cooldown: ${ALERT_COOLDOWN_MS / 1000}s)`);
      return;
    }
    // 2. Do not re-trigger if modal is already active
    if (fallModalOpenRef.current) {
      console.log('🛡️ Fall alert modal already active — ignoring re-trigger');
      return;
    }

    console.log('🚨 [FALL_ALERT] Launching Full-Screen Fall Emergency Modal:', customReason);

    // ALWAYS show the 15-second countdown timer first — never skip to escalated
    setIsEmergencyEscalated(false);
    emergencyActiveRef.current = true;

    // Strict Life-Safety Precedence: Clear any active or pending phone calls immediately!
    setActiveCall(null);
    setIncomingCall(null);
    setOutgoingCall(null);

    const empatheticPrompt = t.fallVoiceCheck;
    setFallReason(customReason || empatheticPrompt);
    setFallModalOpen(true);
    playEmergencyAlarm();
    speak(empatheticPrompt, selectedLang);
  }, [selectedLang, speak, t]);

  /**
   * Reset the active backend emergency/escalation mode.
   * Sets a 60s cooldown timestamp, resets emergency latch, and resolves the alert cleanly.
   */
  const handleFallModalSafe = useCallback(async () => {
    stop();
    hasSentEmergencyRef.current = false;
    emergencyActiveRef.current = false;
    setFallModalOpen(false);
    setBackendAlertActive(false);
    setSosSent(false);
    setRawAlertMessage(null);
    setIncomingAlertMessage(null);
    setActiveCall(null);
    setIncomingCall(null);
    setOutgoingCall(null);

    if (escalationTimerRef.current) clearInterval(escalationTimerRef.current);
    setEscalationTierKey('tier1');
    setEscalationSecondsLeft(15);

    // 1. Mark cooldown so polling / WS won't re-trigger the same alert immediately
    alertDismissedAtRef.current = Date.now();

    playGentleChime();
    speak(t.fineConfirmationTts, selectedLang);

    // 2. Broadcast cancel/safe status via WebSocket to Family Dashboard & Hub
    sendMessage({
      type: 'alert_cancelled',
      elder_id: ELDER_ID,
      status: 'safe',
      message: 'Kamala confirmed safe. Alert resolved.',
      timestamp: new Date().toISOString(),
    });

    // 3. Post resolved decision to Hub so family dashboard clears alert banner cleanly
    // Use clean phrasing without 'emergency' to avoid false-positive regex loops
    try {
      await postDecision({
        type: 'AgentDecision',
        decision_id: `safe_${Date.now()}`,
        event_id: `evt_safe_${Date.now()}`,
        severity: 'low',
        action: 'monitor',
        reasoning_trace: 'Elder Kamala Devi confirmed safe and comfortable. Alert resolved.',
        voice_message_to_elder: 'I am glad you are safe and comfortable.',
        language_code: 'en-IN',
        family_message: '✓ Kamala confirmed: safe and comfortable. Alert resolved.',
      });
    } catch (e) {
      console.warn('Failed to post safe confirmation to Hub:', e);
    }
  }, [stop, speak, selectedLang, t, sendMessage]);

  /**
   * Primary Emergency SOS Dispatch (Major Button 1 & Escalation)
   * Dispatches ONCE ONLY per incident to prevent request flooding and loops.
   * Sends exactly 1 canonical SensorEvent (HTTP) and 1 WebSocket broadcast.
   * STRICTLY NEVER INITIATES ANY SYSTEM CALLS.
   */
  const handleSOS = useCallback(async (customReason) => {
    // 1. Strict once-only latch: do not send multiple duplicate emergency requests
    if (hasSentEmergencyRef.current) {
      console.log('🛡️ Emergency request already dispatched once for this incident. Suppressing duplicate network requests.');
      return;
    }
    hasSentEmergencyRef.current = true;
    emergencyActiveRef.current = true;
    setIsEmergencyEscalated(true);
    setFallModalOpen(true);
    setSosSent(true);
    playEmergencyAlarm();

    // Emergency takes precedence over current active calls
    setActiveCall(null);
    setIncomingCall(null);
    setOutgoingCall(null);

    const eventId = crypto.randomUUID ? crypto.randomUUID() : `evt_${Date.now()}`;
    const elderName = elderProfile?.name || 'Kamala Devi';
    const reasonText = typeof customReason === 'string' && customReason.trim()
      ? customReason
      : `Emergency SOS triggered by ${elderName}`;
    const alertMsg = `🚨 CRITICAL EMERGENCY: ${elderName} requires urgent assistance! (${reasonText})`;

    // Register in dedup set so own event does not loop back to elder
    processedDecisionsRef.current.add(eventId);

    // Exactly ONE Hub REST API POST
    // The Hub backend processes this event and broadcasts the authoritative
    // AgentDecision and FamilyAlert to the Family Dashboard without duplicate requests.
    const payload = buildSensorEvent({
      eventType: 'manual_panic',
      severity: 'critical',
      confidence: 1.0,
      eventId: eventId,
      voiceTranscript: reasonText,
      sender: `${elderName} (Elder)`,
    });

    try {
      await postSensorEvent(payload);
      console.log('✓ Emergency SensorEvent dispatched once to Hub:', eventId);
    } catch (e) {
      console.warn('Failed to post emergency event to Hub, using WebSocket fallback:', e);
      sendMessage({
        type: 'manual_panic',
        elder_id: ELDER_ID,
        event_type: 'manual_panic',
        severity: 'critical',
        alert: alertMsg,
        message: alertMsg,
        reason: reasonText,
        timestamp: new Date().toISOString(),
      });
    }
  }, [sendMessage, elderProfile]);

  /**
   * Cancel Emergency SOS / Confirm Safe
   */
  const handleCancelSOS = useCallback(async () => {
    hasSentEmergencyRef.current = false;
    emergencyActiveRef.current = false;
    setIsEmergencyEscalated(false);
    setBackendAlertActive(false);
    setSosSent(false);
    setFallModalOpen(false);
    alertDismissedAtRef.current = Date.now();
    playSuccessChime();
    speak(t.fineConfirmationTts, selectedLang);

    const elderName = elderProfile?.name || 'Kamala';
    sendMessage({
      type: 'emergency_cancelled',
      elder_id: ELDER_ID,
      elder_name: elderName,
      message: `${elderName} confirmed safe. Alert cancelled.`,
      timestamp: new Date().toISOString(),
    });

    const payload = buildSensorEvent({
      eventType: 'voice_input',
      confidence: 1.0,
      voiceTranscript: 'User confirmed: I am safe, cancel emergency alert.',
    });
    postSensorEvent(payload).catch(() => {});
  }, [selectedLang, speak, sendMessage, elderProfile]);

  /**
   * Quick Mood Check-In Handler (Schema A: event_type = "emotion_detected")
   */
  const handleMoodSelect = useCallback(async (emotionType, moodLabel) => {
    setSelectedMood(emotionType);
    playGentleChime();

    const payload = buildSensorEvent({
      eventType: 'emotion_detected',
      emotion: emotionType, // "happy" | "neutral" | "sad"
      confidence: 0.95,
    });

    // Broadcast to Family Dashboard
    sendMessage({
      type: 'wellness_update',
      elder_id: ELDER_ID,
      emotion: emotionType,
      mood_label: moodLabel,
      timestamp: new Date().toISOString(),
    });

    try {
      await postSensorEvent(payload);
      setMoodToast(`${moodLabel} • ${t.moodRecordedToast}`);
      setTimeout(() => setMoodToast(null), 3500);
    } catch (e) {
      console.warn('Failed to post emotion_detected SensorEvent:', e);
    }
  }, [t, sendMessage]);

  /**
   * Quick Status Presets for Elder Convenience
   */
  const STATUS_PRESETS = useMemo(() => [
    { emoji: '❤️', text: "I'm Doing Well" },
    { emoji: '🍵', text: 'Having Morning Tea' },
    { emoji: '🛏️', text: 'Resting Comfortably' },
    { emoji: '☀️', text: 'Feeling Great' },
    { emoji: '💊', text: 'Took All Medicines' },
  ], []);

  /**
   * Custom Status Update: Broadcasts custom written status message to Family Dashboard and Hub
   */
  const handleSendCustomStatus = useCallback(async (explicitText) => {
    const rawText = typeof explicitText === 'string' ? explicitText : customStatusText;
    const textToSend = rawText?.trim();
    if (!textToSend || isSendingStatus) return;

    setIsSendingStatus(true);
    playSuccessChime();

    const elderName = elderProfile?.name || 'Kamala';
    const finalFormattedMessage = `${elderName}: ${textToSend}`;

    // 1. Broadcast over WebSocket to Family Dashboard (both family_reply & elder_status events)
    sendMessage({
      type: 'family_reply',
      elder_id: ELDER_ID,
      sender: `${elderName} (Elder)`,
      message: finalFormattedMessage,
      status_text: textToSend,
      timestamp: new Date().toISOString(),
    });

    sendMessage({
      type: 'elder_status',
      elder_id: ELDER_ID,
      sender: `${elderName} (Elder)`,
      message: finalFormattedMessage,
      status: textToSend,
      timestamp: new Date().toISOString(),
    });

    // 2. Post sensor event to Hub REST API
    const payload = buildSensorEvent({
      eventType: 'voice_input',
      voiceTranscript: `Elder Status: "${textToSend}"`,
      confidence: 1.0,
    });

    try {
      await postSensorEvent(payload);
    } catch (e) {
      console.warn('Failed to post custom status event to Hub:', e);
    } finally {
      setIsSendingStatus(false);
      setLastSentStatus(textToSend);
      setCustomStatusText('');
      setFamilyReplied(true);

      if (familyMessageResetTimerRef.current) {
        clearTimeout(familyMessageResetTimerRef.current);
      }
      familyMessageResetTimerRef.current = setTimeout(() => {
        setFamilyReplied(false);
      }, 7000);
    }
  }, [customStatusText, isSendingStatus, elderProfile, sendMessage]);

  const handleSelectPreset = useCallback((presetText) => {
    setCustomStatusText(presetText);
    if (statusInputRef.current) {
      statusInputRef.current.focus();
    }
  }, []);

  /**
   * Answer Incoming Call from Family Dashboard (Teammate 4 Schema E CallResponse)
   */
  const handleAcceptIncomingCall = useCallback(() => {
    const caller = incomingCall?.caller || 'Family (Priya)';
    const callId = incomingCall?.call_id || `call_${Date.now()}`;
    const elderId = incomingCall?.elder_id || ELDER_ID;

    // 1. Mark this call as handled so it NEVER loops or re-prompts
    handledCallsRef.current.add(callId);
    setIncomingCall(null);
    setActiveCall({ call_id: callId, caller, startTime: Date.now() });

    playSuccessChime();
    speak(`Call connected with ${caller}. You can speak now.`, selectedLang);

    // 2. Send Schema E CallResponse directly over WebSocket to Teammate 4 Dashboard
    sendMessage({
      type: 'CallResponse',
      call_id: callId,
      elder_id: elderId,
      response: 'accepted',
      timestamp: new Date().toISOString(),
    });

    // 3. Dual-dispatch backward compatible status event
    sendMessage({
      type: 'call_accepted',
      call_id: callId,
      elder_id: elderId,
      caller: caller,
      status: 'connected',
      timestamp: new Date().toISOString(),
    });

    const payload = buildSensorEvent({
      eventType: 'voice_input',
      confidence: 1.0,
      voiceTranscript: `Live call connected with ${caller}.`,
      sender: 'Kamala Devi (Elder)',
    });
    postSensorEvent(payload).catch(() => {});
  }, [incomingCall, speak, selectedLang, sendMessage]);

  /**
   * End Active In-Progress Live Call
   */
  const handleEndActiveCall = useCallback(() => {
    const caller = activeCall?.caller || 'Family (Priya)';
    const callId = activeCall?.call_id || `call_${Date.now()}`;

    setActiveCall(null);
    playGentleChime();
    speak('Call ended.', selectedLang);

    sendMessage({
      type: 'call_ended',
      call_id: callId,
      elder_id: ELDER_ID,
      caller: caller,
      status: 'ended',
      timestamp: new Date().toISOString(),
    });
  }, [activeCall, speak, selectedLang, sendMessage]);

  /**
   * Decline Incoming Call from Family Dashboard (Teammate 4 Schema E CallResponse)
   */
  const handleDeclineIncomingCall = useCallback(() => {
    const caller = incomingCall?.caller || 'Family (Priya)';
    const callId = incomingCall?.call_id || `call_${Date.now()}`;
    const elderId = incomingCall?.elder_id || ELDER_ID;

    // Mark call as handled so it never re-triggers
    handledCallsRef.current.add(callId);
    setIncomingCall(null);
    playGentleChime();

    // 1. Send Schema E CallResponse directly over WebSocket to Teammate 4 Dashboard
    sendMessage({
      type: 'CallResponse',
      call_id: callId,
      elder_id: elderId,
      response: 'declined',
      timestamp: new Date().toISOString(),
    });

    // 2. Dual-dispatch backward compatible status event
    sendMessage({
      type: 'call_declined',
      call_id: callId,
      elder_id: elderId,
      caller: caller,
      status: 'declined',
      timestamp: new Date().toISOString(),
    });
  }, [incomingCall, sendMessage]);

  /**
   * Toggle Medication Status (pending ↔ done) & Sync to Family Dashboard
   */
  const handleToggleMedication = useCallback(async (medId) => {
    let nextStatus = 'done';
    let medName = '';
    setMedications((prev) => {
      const updated = prev.map((m) => {
        if (m.id === medId) {
          nextStatus = m.status === 'pending' ? 'done' : 'pending';
          medName = m.name;
          return { ...m, status: nextStatus };
        }
        return m;
      });

      // Broadcast FULL medication list to Family Dashboard via WebSocket
      sendMessage({
        type: 'medication_update',
        elder_id: ELDER_ID,
        medications: updated.map(({ id, name, emoji, status }) => ({ id, name, emoji, status })),
        timestamp: new Date().toISOString(),
      });

      return updated;
    });

    // Also fire a REST SensorEvent using existing voice_input type
    try {
      const payload = buildSensorEvent({
        eventType: 'voice_input',
        confidence: 1.0,
        voiceTranscript: `Medication ${medName || medId} marked ${nextStatus} by elder`,
      });
      await postSensorEvent(payload);
    } catch (e) {
      console.warn('Failed to send medication update to Hub:', e);
    }
  }, [sendMessage]);

  /**
   * Add New Medicine (elder-managed) & Sync to Family Dashboard
   */
  const handleAddMedicine = useCallback(async (name) => {
    if (!name || !name.trim()) return;
    const trimmed = name.trim();
    const newMed = {
      id: `med_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: trimmed,
      emoji: '💊',
      status: 'pending',
    };

    setMedications((prev) => {
      const updated = [...prev, newMed];

      // Broadcast FULL medication list to Family Dashboard via WebSocket
      sendMessage({
        type: 'medication_update',
        elder_id: ELDER_ID,
        medications: updated.map(({ id, name, emoji, status }) => ({ id, name, emoji, status })),
        timestamp: new Date().toISOString(),
      });

      return updated;
    });

    // Fire REST SensorEvent using existing voice_input type
    try {
      const payload = buildSensorEvent({
        eventType: 'voice_input',
        confidence: 1.0,
        voiceTranscript: `Elder added new medication: ${trimmed}`,
      });
      await postSensorEvent(payload);
    } catch (e) {
      console.warn('Failed to send new medication event to Hub:', e);
    }
  }, [sendMessage]);

  /**
   * Handle dynamic profile updates from ElderProfileView
   * Dispatches via WebSocket profile_update and Schema A voice_input
   */
  const handleProfileUpdate = useCallback(async (updatedProfile) => {
    if (!updatedProfile) return;
    setElderProfile(updatedProfile);

    // 1. Post to backend as a low-severity monitor decision so Hub broadcasts it to all clients on /ws/alerts
    try {
      await postDecision({
        type: 'AgentDecision',
        decision_id: `prof_${Date.now()}`,
        event_id: `prof_evt_${Date.now()}`,
        severity: 'low',
        action: 'monitor',
        reasoning_trace: `Elder ${updatedProfile.name} profile sync`,
        voice_message_to_elder: '',
        language_code: 'en-IN',
        family_message: `PROFILE_SYNC:${JSON.stringify(updatedProfile)}`,
      });
    } catch (e) {
      console.warn('Failed to post profile decision to Hub:', e);
    }

    // 2. Direct WebSocket frame
    sendMessage({
      type: 'profile_update',
      elder_id: ELDER_ID,
      profile: updatedProfile,
      timestamp: new Date().toISOString(),
    });
  }, [sendMessage]);

  /**
   * Direct Family Phone Call Trigger (Major Button 3)
   * Opens dedicated Outgoing Call modal and notifies Family Dashboard via CallInvite.
   */
  const handleDirectFamilyCall = useCallback(async () => {
    const familyPhone = '+919876543210';
    const elderName = elderProfile?.name || 'Kamala Devi';
    const targetName = 'Priya (Daughter)';
    const confirmationMsg = 'Calling Priya directly...';

    playGentleChime();
    speak(confirmationMsg, selectedLang);

    // 1. Open dedicated Outgoing Call modal on tablet screen
    setOutgoingCall({
      target: targetName,
      phone: familyPhone,
      startTime: Date.now(),
    });

    const callId = `call_${Date.now()}`;
    const callDecId = `dec_${Date.now()}`;
    const callEvtId = `evt_${Date.now()}`;
    const callMsg = `📞 INCOMING CALL: ${elderName} is calling you! Tap to connect.`;

    // Register in dedup set so own call decision doesn't loop back to elder
    processedDecisionsRef.current.add(callDecId);
    processedDecisionsRef.current.add(callEvtId);

    // 2. Broadcast FamilyAlert and AgentDecision (What Teammate 4's dashboard listens for!)
    sendMessage({
      type: 'FamilyAlert',
      alert_id: `alert_${Date.now()}`,
      decision_id: callDecId,
      message: callMsg,
      severity: 'high',
      reasoning_trace: `${elderName} initiated a live phone call to ${targetName}.`,
      timestamp: new Date().toISOString(),
    });

    sendMessage({
      type: 'AgentDecision',
      decision_id: callDecId,
      event_id: callEvtId,
      severity: 'high',
      action: 'notify_family',
      reasoning_trace: `${elderName} initiated a live phone call to ${targetName}.`,
      voice_message_to_elder: `Calling ${targetName.split(' ')[0]}.`,
      language_code: 'en-IN',
      family_message: callMsg,
      timestamp: new Date().toISOString(),
    });

    // 3. Send CallInvite for Teammate 4's /elder interface
    sendMessage({
      type: 'CallInvite',
      call_id: callId,
      elder_id: ELDER_ID,
      caller_name: `${elderName} (Elder)`,
      call_type: 'voice',
      timestamp: new Date().toISOString(),
    });

    sendMessage({
      type: 'elder_call_initiated',
      elder_id: ELDER_ID,
      target: targetName,
      phone: familyPhone,
      timestamp: new Date().toISOString(),
    });

    // 4. Post to Hub REST API
    try {
      await Promise.allSettled([
        postSensorEvent(
          buildSensorEvent({
            eventType: 'normal',
            confidence: 1.0,
            voiceTranscript: `Elder ${elderName} initiated phone call to ${targetName}`,
            eventId: callEvtId,
          })
        ),
        postDecision({
          type: 'AgentDecision',
          decision_id: callDecId,
          event_id: callEvtId,
          severity: 'high',
          action: 'notify_family',
          reasoning_trace: `${elderName} initiated a live phone call to ${targetName}.`,
          voice_message_to_elder: `Calling ${targetName.split(' ')[0]}.`,
          language_code: 'en-IN',
          family_message: callMsg,
        }),
      ]);
    } catch (e) {
      console.warn('Failed to post direct family call event/decision:', e);
    }
  }, [elderProfile, familyContactName, selectedLang, speak, sendMessage]);

  /**
   * End Outgoing Call Handler
   */
  const handleEndOutgoingCall = useCallback(() => {
    setOutgoingCall(null);
    playGentleChime();
    speak('Call ended.', selectedLang);

    sendMessage({
      type: 'call_ended',
      elder_id: 'kamala_001',
      target: 'Priya (Daughter)',
      timestamp: new Date().toISOString(),
    });
  }, [selectedLang, speak, sendMessage]);

  /**
   * Speech Handler: Tapping microphone triggers STT & POSTs SensorEvent (Schema A)
   */
  const handleTalkTap = useCallback(() => {
    const now = Date.now();
    if (now - lastTalkTimeRef.current < 400) return;
    lastTalkTimeRef.current = now;

    if (isListening) {
      finishListening();
      return;
    }

    listen({
      language: selectedLang,
      duration: 8,
      onTranscript: async (transcript) => {
        const clean = (transcript || '').trim();
        if (!clean || clean.length < 2 || /^[\s\p{P}\p{S}]+$/u.test(clean)) {
          console.log('Spurious/noise speech input ignored:', transcript);
          return;
        }
        setLastSpokenText(clean);
        playSuccessChime();

        // 1. Check for vocal cancellation (using word boundaries to avoid false positives)
        const lower = clean.toLowerCase();
        if (
          /\b(fine|okay|ok|good|safe|theek|arama)\b/i.test(lower) ||
          lower.includes('all good') ||
          lower.includes('i am fine') ||
          lower.includes('i am safe') ||
          lower.includes('sab theek')
        ) {
          handleFallModalSafe();
          return;
        }

        // 1b. Immediate check for vocal emergency / distress / critical mention
        const emergencyKeywords = [
          'need help', 'i need help', 'i have fallen', 'have fallen', 'help', 'fell', 'fallen', 'fall',
          'hurt', 'pain', 'chest', 'dizzy', 'faint', 'fainting', 'breath', 'breathing', 'bleeding',
          'emergency', 'critical', 'ambulance', 'hospital', '112',
          'madad', 'gira', 'gir', 'dard', 'chakkar', 'chhati', 'saans', 'takleef', 'chot',
          'sahaya', 'biddiddene', 'novoo', 'thale tiruguttide', 'usiru', 'kashta'
        ];
        const isCriticalVocal = emergencyKeywords.some((kw) => lower.includes(kw));
        if (isCriticalVocal) {
          console.log('🚨 Critical distress mention detected in elder voice:', clean);
          setActiveCall(null);
          setIncomingCall(null);
          setOutgoingCall(null);
          // Show 15s countdown timer — handleSOS fires via onEmergencyEscalate when timer expires
          triggerFallAlert(clean);
          return;
        }

        // 2. Set UI indicator: waiting for hosted LLM agent
        setAiAgentStatus({
          action: 'voice_check',
          message: '⏳ Consulting Hosted LLM Agent...',
          reasoning: `Voice query "${clean}" dispatched to Hosted AI Brain.`,
          severity: 'low',
          timestamp: Date.now(),
        });

        // 3. Build and post SensorEvent (Schema A) to Hub for Hosted LLM Agent
        const payload = buildSensorEvent({
          eventType: 'voice_input',
          confidence: 1.0,
          voiceTranscript: clean,
          sender: 'Kamala Devi (Elder)',
        });

        // Broadcast elder speech event to Family Dashboard
        sendMessage({
          type: 'elder_voice',
          elder_id: ELDER_ID,
          transcript: clean,
          timestamp: new Date().toISOString(),
        });

        try {
          await postSensorEvent(payload);
          console.log('✓ Dispatched voice_input to Hub for Hosted LLM Agent:', payload.event_id);
        } catch (e) {
          console.warn('Failed to post voice_input SensorEvent:', e);
        }

        // 4. Fallback guard: If Hosted LLM Agent does not respond within 6.5s, provide local response
        const dispatchTime = Date.now();
        setTimeout(async () => {
          if (lastReceivedAiDecisionTimeRef.current >= dispatchTime) return;
          console.log('Hosted LLM Agent timeout (6.5s), activating fallback response...');
          try {
            const fallbackDecision = await generateCompanionDecision({
              transcript,
              elderProfile,
              medications,
              recentMood: selectedMood,
              selectedLang,
              eventId: payload.event_id,
            });

            if (fallbackDecision?.severity === 'critical' || fallbackDecision?.action === 'call_emergency') {
              setActiveCall(null);
              setIncomingCall(null);
              setOutgoingCall(null);
              triggerFallAlert(fallbackDecision?.voice_message_to_elder || transcript);
              return;
            }

            const replyMsg = fallbackDecision?.voice_message_to_elder || 'Hello Kamala ji, I am right here with you.';
            setAiAgentStatus({
              action: fallbackDecision?.action || 'voice_check',
              message: replyMsg,
              reasoning: fallbackDecision?.reasoning_trace || 'Local fallback assessment.',
              severity: fallbackDecision?.severity || 'low',
              timestamp: Date.now(),
            });
            playGentleChime();
            speak(replyMsg, fallbackDecision?.language_code || selectedLang);
          } catch (err) {
            console.error('Fallback reasoning error:', err);
          }
        }, 6500);
      },
    });
  }, [isListening, finishListening, stop, listen, selectedLang, handleFallModalSafe, triggerFallAlert, speak, sendMessage, elderProfile, medications, selectedMood]);

  /**
   * Universal Intelligent Payload Classifier & Router.
   * Understands exact intent from Family Dashboard & AI LLM Agent:
   * - Incoming Calls (audio/video/family requests)
   * - Family Messages/Notes
   * - Family Acknowledgment & Reassurance
   * - Family Medication Nudges
   * - AI Companion Voice Check-ins
   * - Only escalates to Critical Emergency Alert Window on genuine life-safety emergencies!
   */
  const classifyAndDispatchMessage = useCallback(
    (data) => {
      if (!data) return;

      // Extract and normalize payload data
      let payload = data;
      if (typeof data === 'string') {
        try {
          payload = JSON.parse(data);
        } catch {
          payload = { text: data };
        }
      }

      // Combine all potential message fields into a single search text
      const allTextHaystack = [
        payload.family_message,
        payload.voice_transcript,
        payload.transcript,
        payload.voice_message_to_elder,
        payload.ai_reply,
        payload.reply_to_elder,
        payload.voice_reply,
        payload.message,
        payload.text,
        payload.raw,
        payload.note,
        payload.reasoning_trace,
        payload.reason,
      ].filter(Boolean).join(' ').toLowerCase();

      const rawText = String(
        payload.family_message ||
        payload.voice_transcript ||
        payload.transcript ||
        payload.voice_message_to_elder ||
        payload.ai_reply ||
        payload.reply_to_elder ||
        payload.message ||
        payload.text ||
        payload.raw ||
        payload.note ||
        payload.reasoning_trace ||
        payload.reason ||
        ''
      ).trim();

      const lowerText = rawText.toLowerCase();
      const type = String(payload.type || '').toLowerCase();
      const action = String(payload.action || '').toLowerCase();
      const eventType = String(payload.event_type || payload.event || '').toLowerCase();
      const severity = String(payload.severity || '').toLowerCase();

      // Deduplication guard (call invites must NEVER be suppressed by deduplication!)
      const dedupKey = payload.decision_id
        ? `dec_${payload.decision_id}`
        : payload.alert_id
        ? `alert_${payload.alert_id}`
        : payload.call_id
        ? `call_${payload.call_id}`
        : (type === 'sensorevent' || eventType === 'voice_input')
        ? null
        : `${type}_${action}_${(payload.message || payload.text || rawText).slice(0, 30)}_${payload.timestamp || ''}`;

      // =========================================================================
      // 0. CRITICAL EMERGENCY & SAFE/ACK PRE-CHECKS
      // =========================================================================
      const isCallStatusOrTermination =
        type === 'callresponse' ||
        type === 'call_response' ||
        type === 'call_accepted' ||
        type === 'call_declined' ||
        type === 'call_ended' ||
        type === 'call_rejected' ||
        type === 'call_cancelled' ||
        payload.type === 'CallResponse' ||
        payload.type === 'call_accepted' ||
        payload.type === 'call_declined' ||
        payload.type === 'call_ended' ||
        payload.response === 'accepted' ||
        payload.response === 'declined' ||
        payload.status === 'connected' ||
        payload.status === 'accepted' ||
        payload.status === 'declined' ||
        payload.status === 'ended' ||
        lowerText.includes('call connected') ||
        lowerText.includes('call accepted') ||
        lowerText.includes('call declined') ||
        lowerText.includes('call ended') ||
        lowerText.includes('live call connected');

      if (isCallStatusOrTermination) {
        if (payload.response === 'accepted' || type === 'call_accepted' || payload.status === 'connected') {
          // Outgoing call was accepted by family dashboard!
          setOutgoingCall(null);
          setActiveCall({
            call_id: payload.call_id || `call_${Date.now()}`,
            caller: familyContactName || 'Priya (Daughter)',
            startTime: Date.now(),
          });
          playSuccessChime();
          speak(`Call connected with ${familyContactName || 'Priya'}.`, selectedLang);
        } else if (payload.response === 'declined' || type === 'call_declined' || payload.status === 'declined') {
          setOutgoingCall(null);
          playGentleChime();
          speak('Call was declined.', selectedLang);
        } else if (type === 'call_ended' || payload.status === 'ended' || lowerText.includes('call ended')) {
          setActiveCall(null);
          setIncomingCall(null);
          setOutgoingCall(null);
        }
        if (payload.call_id) {
          handledCallsRef.current.add(payload.call_id);
        }
        return;
      }

      // =========================================================================
      // 0b. INCOMING CALL FROM FAMILY DASHBOARD (Teammate 4 / Family Call)
      // Must be evaluated FIRST so family calls are NEVER blocked or missed!
      // =========================================================================
      const inviteMsg =
        (typeof payload.family_message === 'string' && payload.family_message.includes('CALL_INVITE'))
          ? payload.family_message
          : (typeof rawText === 'string' && rawText.includes('CALL_INVITE'))
            ? rawText
            : (typeof payload.message === 'string' && payload.message.includes('CALL_INVITE'))
              ? payload.message
              : '';

      const isCallInvite =
        Boolean(inviteMsg) ||
        type === 'callinvite' ||
        type === 'call_invite' ||
        payload.type === 'CallInvite' ||
        payload.type === 'call_invite' ||
        allTextHaystack.includes('call_invite') ||
        allTextHaystack.includes('callinvite') ||
        allTextHaystack.includes('initiated voice call') ||
        allTextHaystack.includes('initiated video call') ||
        allTextHaystack.includes('initiated call') ||
        allTextHaystack.includes('family call') ||
        (payload.action === 'call' && (payload.caller_name || payload.sender));

      if (isCallInvite) {
        // Strict Life-Safety Precedence: NEVER interrupt or ring during active emergency or fall countdown!
        if (fallModalOpenRef.current || emergencyActiveRef.current || hasSentEmergencyRef.current || sosSent) {
          console.log('🛡️ Incoming call invite suppressed because Fall Alert / Emergency is currently active');
          return;
        }

        const currentElderName = (elderProfile?.name || 'Kamala Devi').toLowerCase();
        if (
          lowerText.includes('elder initiated phone call') ||
          lowerText.includes('calling priya') ||
          (payload.caller_name && payload.caller_name.toLowerCase().includes(currentElderName)) ||
          activeCallRef.current !== null // Cannot receive another call if already connected!
        ) {
          return;
        }

        let callerName = payload.caller_name || payload.sender || familyContactName || 'Family';
        let callType = (allTextHaystack.includes('video') || payload.call_type === 'video') ? 'video' : 'voice';
        let callId = payload.call_id || payload.event_id || payload.decision_id || `call_${Date.now()}`;

        if (inviteMsg) {
          const parts = inviteMsg.split(':');
          if (parts[1] && parts[1].toLowerCase().includes('video')) callType = 'video';
          if (parts[2] && parts[2].trim()) callerName = parts[2].trim();
          if (parts[3] && parts[3].trim()) callId = parts[3].trim();
        }

        if (handledCallsRef.current.has(callId)) return;
        handledCallsRef.current.add(callId);
        setTimeout(() => handledCallsRef.current.delete(callId), 30000);

        console.log('📞 INCOMING CALL POP UP TRIGGERED FROM FAMILY DASHBOARD:', { callId, callerName, callType });

        setIncomingCall({
          call_id: callId,
          elder_id: payload.elder_id || ELDER_ID,
          caller: callerName,
          callType: callType,
          message: `${callerName} is calling you live from the Family Dashboard`,
          timestamp: Date.now(),
        });

        playPhoneRing();
        return;
      }

      // Safe / Alert Cancellation broadcasts from elder tablet or caregiver
      const isExplicitSafeResolution =
        type === 'alert_cancelled' ||
        payload.type === 'alert_cancelled' ||
        payload.status === 'safe' ||
        action === 'resolve' ||
        /\b(alert_cancelled|alert cancelled|confirmed safe|confirmed: i am safe|i am safe|cancel emergency|alert resolved|elder is safe)\b/i.test(rawText);

      if (isExplicitSafeResolution) {
        stop();
        hasSentEmergencyRef.current = false;
        emergencyActiveRef.current = false;
        setIsEmergencyEscalated(false);
        setFallModalOpen(false);
        setBackendAlertActive(false);
        setSosSent(false);
        alertDismissedAtRef.current = Date.now();
        return;
      }

      // Family Alert Acknowledgment / Reassurance (Caregiver clicked Acknowledge on dashboard)
      // STRICT: Only match explicit acknowledgment event types from Teammate 4's dashboard.
      // NEVER match on broad keyword heuristics — the Hub AI's own responses contain words
      // like "acknowledged", "safe", "on the way" which would cause false auto-acknowledgment.
      const isAck =
        ['family_acknowledgement', 'alert_acknowledged', 'familyalertack', 'escalation.status_changed'].includes(type) ||
        ['acknowledge', 'ack', 'caregiver_ack', 'acknowledge_alert'].includes(action) ||
        payload.type === 'family_acknowledgement' ||
        payload.type === 'alert_acknowledged' ||
        payload.type === 'FamilyAlertAck';

      if (isAck) {
        // Dedup guard: don't process same ack event twice
        const ackKey = `ack_${payload.decision_id || payload.alert_id || payload.timestamp || Date.now()}`;
        if (processedDecisionsRef.current.has(ackKey)) return;
        processedDecisionsRef.current.add(ackKey);
        setTimeout(() => processedDecisionsRef.current.delete(ackKey), 30000);

        // Only act if an emergency is actually active — ignore stale ack events
        if (!fallModalOpenRef.current && !emergencyActiveRef.current && !sosSent) {
          console.log('🛡️ Ack received but no emergency is active — ignoring stale ack');
          return;
        }

        // STOP the Fall Emergency modal and alarm chime immediately!
        stop();
        hasSentEmergencyRef.current = false;
        emergencyActiveRef.current = false;
        setIsEmergencyEscalated(false);
        setFallModalOpen(false);
        setBackendAlertActive(false);
        setSosSent(false);
        setActiveCall(null);
        setIncomingCall(null);
        setOutgoingCall(null);
        if (escalationTimerRef.current) clearInterval(escalationTimerRef.current);
        alertDismissedAtRef.current = Date.now();

        const ackBy = payload.acknowledged_by || payload.changed_by_name || payload.sender || familyContactName;
        const ackMsg = rawText || `${ackBy} acknowledged your alert and is on the way home!`;
        setFamilyAck({ acknowledgedBy: ackBy, message: ackMsg, timestamp: Date.now() });
        playSuccessChime();
        speak(`${ackBy} has acknowledged your alert and is on the way to help you.`, selectedLang);
        setTimeout(() => setFamilyAck(null), 14000);
        return;
      }

      // Profile sync handshake and family profile updates
      if (rawText.startsWith('PROFILE_SYNC:') || payload.family_message?.startsWith('PROFILE_SYNC:')) {
        return; // Silent: don't speak or alert own profile broadcasts
      }

      if (type === 'request_profile_sync') {
        sendMessage({
          type: 'profile_update',
          elder_id: ELDER_ID,
          profile: elderProfile,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      if (type === 'family_profile_update') {
        const newFamilyName = payload.sender_name || payload.sender || payload.name;
        if (newFamilyName) {
          setFamilyContactName(newFamilyName);
          try { localStorage.setItem('shastra_family_contact_name', newFamilyName); } catch (e) {}
          setFamilyMessage((prev) => ({ ...prev, sender: newFamilyName }));
        }
        return;
      }

      // =========================================================================
      // 1. CRITICAL LIFE-SAFETY EMERGENCY & FALL DETECTION (TOP PRIORITY)
      // Displays the Full-Screen "DID YOU FALL? ARE YOU OKAY?" countdown modal.
      // Critical emergency MUST NEVER trigger an incoming phone call!
      // =========================================================================
      const isEmergencyAction =
        action === 'call_emergency' ||
        action === 'emergency_escalate' ||
        action === 'escalate_112';

      const isEmergencySeverity = severity === 'critical';

      const isEmergencyType =
        type === 'fall' ||
        type === 'manual_panic' ||
        eventType === 'fall' ||
        eventType === 'manual_panic' ||
        payload.type === 'fall' ||
        payload.type === 'manual_panic' ||
        payload.type === 'FallEmergency' ||
        payload.event_type === 'fall';

      // Hub AI AgentDecision / FamilyAlert for Fall:
      // Hub sends { type: 'AgentDecision', action: 'voice_check', severity: 'high', reasoning_trace: 'Fall detected...' }
      // Hub also sends { type: 'FamilyAlert', message: 'A fall was detected...', severity: 'high' }
      const isHubFallDecision =
        (type === 'agentdecision' || payload.type === 'AgentDecision') &&
        (action === 'voice_check' || severity === 'high' || severity === 'critical') &&
        (allTextHaystack.includes('fall') || allTextHaystack.includes('posture collapse') || allTextHaystack.includes('posture drop') || allTextHaystack.includes('fallen'));

      const isHubFamilyFallAlert =
        (type === 'familyalert' || payload.type === 'FamilyAlert') &&
        (allTextHaystack.includes('fall') || allTextHaystack.includes('fallen') || allTextHaystack.includes('posture'));

      const emergencyKeywordsList = [
        'need help', 'i need help', 'i have fallen', 'have fallen', 'fallen', 'i fell',
        'fell down', 'did you fall', 'fall', 'critical', 'emergency', 'unresponsive',
        'sudden posture drop', 'acute distress', '112 escalation', 'manual panic',
        'chest pain', 'severe pain', 'ambulance', 'sos alert', 'emergency escalate',
        'escalating to 112', 'connecting to 112', 'calling emergency', 'calling 112',
        'calling ambulance', 'calling for help', 'biddiddene', 'novoo', 'sahaya',
        'madad', 'gira', 'dard', 'chakkar'
      ];

      const hasEmergencyKeyword = emergencyKeywordsList.some(
        (kw) => allTextHaystack.includes(kw) || lowerText.includes(kw)
      );

      // Safe / Ack check: NEVER treat explicit safe or ack messages as emergencies
      // Note: We check exact status and words, NOT loose substring 'safe' which matches 'safety'
      const isSafeOrAckMessage =
        isExplicitSafeResolution ||
        isAck ||
        action === 'monitor' ||
        action === 'acknowledge' ||
        (severity === 'low' && !isEmergencyType && !hasEmergencyKeyword);

      const isCriticalEmergency =
        !isSafeOrAckMessage &&
        (isEmergencyAction || isEmergencySeverity || isEmergencyType || isHubFallDecision || isHubFamilyFallAlert || hasEmergencyKeyword);

      if (isCriticalEmergency) {
        // Strict loop guard: if emergency is already active or already sent, do NOT re-trigger
        if (fallModalOpenRef.current || hasSentEmergencyRef.current) {
          console.log('🛡️ Fall/Emergency already active or sent — suppressing duplicate trigger');
          return;
        }

        console.log('🚨 [FALL_ALERT] Critical Fall/Emergency Detected — Launching Fall Verification Modal:', {
          action,
          severity,
          type,
          eventType,
          rawText: rawText.slice(0, 60),
        });

        // Ensure NO phone call overlays or ringing are active
        setActiveCall(null);
        setIncomingCall(null);
        setOutgoingCall(null);

        const alertReason =
          payload.voice_message_to_elder ||
          payload.family_message ||
          payload.reasoning_trace ||
          rawText ||
          (t.fallAlertPrompt || 'Kamala, did you fall? Are you fine? Please confirm if you are okay.');

        // Show 15s countdown timer — escalation dispatches via onEmergencyEscalate when timer expires
        triggerFallAlert(alertReason, true);
        return;
      }

      const isCallRequest = false;

      // Deduplication guard for non-emergency messages
      if (dedupKey && processedDecisionsRef.current.has(dedupKey)) return;
      if (dedupKey) {
        processedDecisionsRef.current.add(dedupKey);
        setTimeout(() => {
          processedDecisionsRef.current.delete(dedupKey);
        }, 20000);
      }

      console.log('📬 Ingesting & Classifying Non-Emergency Payload:', { type, action, eventType, severity, rawText });

      // =========================================================================
      // 3. HOSTED AI AGENT DECISION (Teammate 2 AgentDecision / LLM Agent Reply)
      // Processes voice replies from the hosted brain and speaks to the elder!
      // =========================================================================
      const isAiAgentDecision =
        (type === 'agentdecision' ||
        payload.type === 'AgentDecision' ||
        type === 'decision' ||
        payload.type === 'decision' ||
        Boolean(payload.voice_message_to_elder) ||
        Boolean(payload.ai_reply) ||
        Boolean(payload.reply_to_elder));

      if (isAiAgentDecision) {
        // Record receipt timestamp so safety fallback timer cancels immediately
        lastReceivedAiDecisionTimeRef.current = Date.now();

        // 3a. Check if action requires critical life-safety escalation
        if (action === 'call_emergency' || action === 'emergency_escalate' || action === 'escalate_112' || severity === 'critical') {
          if (fallModalOpenRef.current || emergencyActiveRef.current || hasSentEmergencyRef.current) {
            console.log('🛡️ Emergency already active — skipping duplicate AI decision trigger');
            return;
          }
          setActiveCall(null);
          setIncomingCall(null);
          setOutgoingCall(null);
          triggerFallAlert(payload.voice_message_to_elder || payload.reasoning_trace);
          return;
        }

        // 3b. Extract AI voice reply strictly addressed to the elder
        const aiVoiceReply = String(
          payload.voice_message_to_elder ||
          payload.ai_reply ||
          payload.reply_to_elder ||
          ''
        ).trim();

        console.log('🤖 Processed Hosted LLM Agent Decision:', {
          decision_id: payload.decision_id,
          action,
          reply: aiVoiceReply,
          reasoning: payload.reasoning_trace,
        });

        // Emergency detection in AI voice reply
        const lowerReply = aiVoiceReply.toLowerCase();
        const isEmergencyVoice =
          lowerReply.includes('emergency') ||
          lowerReply.includes('112') ||
          lowerReply.includes('ambulance') ||
          lowerReply.includes('hospital') ||
          lowerReply.includes('unresponsive') ||
          lowerReply.includes('fall') ||
          lowerReply.includes('fallen') ||
          lowerReply.includes('distress') ||
          lowerReply.includes('need help');

        if (isEmergencyVoice) {
          if (fallModalOpenRef.current || emergencyActiveRef.current || hasSentEmergencyRef.current) {
            console.log('🛡️ Emergency already active — skipping AI voice trigger');
            return;
          }
          setActiveCall(null);
          setIncomingCall(null);
          setOutgoingCall(null);
          triggerFallAlert(aiVoiceReply);
          return;
        }

        if (aiVoiceReply) {
          const isAlreadySpoken = Boolean(
            payload.decision_id && payload.decision_id === lastSpokenAiDecisionIdRef.current
          );
          if (payload.decision_id) {
            lastSpokenAiDecisionIdRef.current = payload.decision_id;
          }

          setAiAgentStatus({
            action: action || 'ai_reply',
            message: aiVoiceReply,
            reasoning: payload.reasoning_trace || 'Hosted LLM Agent real-time reasoning',
            severity: payload.severity || 'low',
            timestamp: Date.now(),
          });

          if (!isAlreadySpoken) {
            console.log('🔊 Speaking Hosted LLM Agent Voice Reply:', aiVoiceReply);
            playGentleChime();

            if (action === 'voice_check') {
              speakThenListen({
                prompt: aiVoiceReply,
                language: payload.language_code || selectedLang,
                duration: 5,
                onTranscript: async (elderReply) => {
                  if (!elderReply) return;
                  setLastSpokenText(elderReply);
                  playSuccessChime();

                  const responseEvent = buildSensorEvent({
                    eventType: 'voice_input',
                    confidence: 1.0,
                    voiceTranscript: elderReply,
                    sender: 'Kamala Devi (Elder)',
                  });

                  try {
                    await postSensorEvent(responseEvent);
                  } catch (e) {}
                },
              });
            } else {
              speak(aiVoiceReply, payload.language_code || selectedLang);
            }
          }
        }

        return;
      }

      // =========================================================================
      // 4. INCOMING FAMILY MESSAGE / NOTE FROM PRIYA (EXACT CAREGIVER TEXT)
      // Displays in the Family Live Card when typed by caregiver on dashboard
      // =========================================================================
      const isFromElder =
        (payload.sender && payload.sender.toLowerCase().includes(currentElderName)) ||
        (payload.sender && payload.sender.toLowerCase().includes('kamala')) ||
        eventType === 'voice_input' ||
        payload.type === 'elder_voice' ||
        type === 'elder_voice' ||
        payload.type === 'elder_status' ||
        type === 'elder_status' ||
        payload.type === 'family_reply' ||
        (payload.elder_id === ELDER_ID && !payload.sender?.toLowerCase().includes('priya'));

      const extractVerbatimMessage = () => {
        if (isFromElder) return null;
        if (type === 'agentdecision' || payload.type === 'AgentDecision') return null;

        if (payload.family_message && payload.family_message.startsWith('FAMILY_MESSAGE:')) {
          const parts = payload.family_message.split(':');
          if (parts.length >= 3) return parts.slice(2).join(':').trim();
        }
        if (rawText.startsWith('FAMILY_MESSAGE:')) {
          const parts = rawText.split(':');
          if (parts.length >= 3) return parts.slice(2).join(':').trim();
        }
        if (['family_message', 'familymessage', 'family_note'].includes(type) && payload.text) {
          return String(payload.text).trim();
        }
        if (payload.note && typeof payload.note === 'string' && !isCallKeywordsPresent) {
          return String(payload.note).trim();
        }
        if (payload.sender && payload.sender.toLowerCase().includes('priya') && (payload.message || payload.text)) {
          return String(payload.message || payload.text).trim();
        }
        return null;
      };

      const verbatimMsg = extractVerbatimMessage();

      const isFamilyMessageIntent =
        !isFromElder &&
        !isCallRequest &&
        Boolean(verbatimMsg) &&
        (
          ['family_message', 'familymessage', 'family_note'].includes(type) ||
          Boolean(payload.note) ||
          Boolean(payload.sender && payload.sender.toLowerCase().includes('priya'))
        );

      if (!isCallRequest && isFamilyMessageIntent && verbatimMsg) {
        const senderName = 'Priya (Daughter)';
        console.log('📬 Live Family Card: Displaying message from caregiver:', verbatimMsg);
        
        setFamilyMessage({
          sender: senderName,
          text: verbatimMsg,
          time: 'Just now',
          timestamp: Date.now(),
        });

        playGentleChime();
        speak(verbatimMsg, selectedLang);

        if (familyMessageResetTimerRef.current) {
          clearTimeout(familyMessageResetTimerRef.current);
        }
        familyMessageResetTimerRef.current = setTimeout(() => {
          setFamilyMessage({
            sender: senderName,
            text: "Hello! I'm here if you need anything. Just let me know whenever you'd like to talk.",
            time: 'Just now',
            timestamp: Date.now(),
          });
        }, 8000);

        return;
      }

      // =========================================================================
      // 5. FAMILY DAILY CHECK-IN SYNC (Teammate 4 sendCheckIn: emotion_detected)
      // =========================================================================
      if (eventType === 'emotion_detected') {
        const emotion = payload.emotion || 'happy';
        const moodDesc = emotion === 'happy' ? 'Great & Happy ☀️' : emotion === 'sad' ? 'Needs Attention & Care 🌧️' : 'Calm & Restful 🌤️';
        setMoodToast(`👨‍👩‍👧 Family logged Daily Check-in: ${moodDesc}`);
        playGentleChime();
        setTimeout(() => setMoodToast(null), 6000);
        return;
      }

      // =========================================================================
      // 6. FAMILY MEDICATION NUDGE / REMINDER (Teammate 4 sendMedicationMissed)
      // =========================================================================
      const isMedNudge =
        ['medication_reminder', 'family_nudge', 'task', 'task.created', 'medication_nudge'].includes(type) ||
        ['remind_medication', 'medication_reminder', 'nudge'].includes(action) ||
        eventType === 'medication_missed' ||
        (['medicine', 'pill', 'tablet', 'dose', 'calcium', 'bp', 'metformin'].some((w) => lowerText.includes(w)) &&
          (lowerText.includes('take') || lowerText.includes('reminder') || lowerText.includes('time for') || lowerText.includes('priya') || lowerText.includes('missed')));

      if (isMedNudge) {
        const fromWho = payload.from || payload.sender || 'Family (Priya)';
        const taskMsg = rawText || 'Please take your scheduled medicine with warm water';
        setMoodToast(`💊 ${fromWho}: ${taskMsg}`);
        playGentleChime();
        speak(`${fromWho} sent a reminder: ${taskMsg}`, selectedLang);
        setTimeout(() => setMoodToast(null), 7000);
        return;
      }

      // End of classification pipeline
    },
    [selectedLang, t, speak, speakThenListen, triggerFallAlert, sendMessage]
  );

  classifyAndDispatchRef.current = classifyAndDispatchMessage;
  useEffect(() => {
    classifyAndDispatchRef.current = classifyAndDispatchMessage;
  }, [classifyAndDispatchMessage]);

  // Note: All incoming WebSocket messages are processed directly and exactly once
  // via handleIncomingWsMessage -> classifyAndDispatchRef.current(data).

  // Live Event Polling:
  // 1. During active emergency: Fast 2-second check ONLY for family acknowledgment / safe resolution
  // 2. Normal mode: 6-second check for family call invites and notes
  const pollHandledEventsRef = useRef(new Set());
  useEffect(() => {
    const isEmergencyActive = fallModalOpen || sosSent || isEmergencyEscalated || hasSentEmergencyRef.current;
    const intervalMs = isEmergencyActive ? 1500 : 1000;

    const pollInterval = setInterval(async () => {
      try {
        const events = await fetchLatestEvents(isEmergencyActive ? 10 : 5);
        if (!Array.isArray(events) || events.length === 0) return;

        for (const evt of events) {
          const evtId = evt.event_id || `${evt.event_type}_${evt.timestamp || ''}`;
          if (pollHandledEventsRef.current.has(evtId)) continue;

          const allEvtText = [
            evt.voice_transcript,
            evt.message,
            evt.text,
            evt.transcript,
            evt.event_type,
            evt.type,
          ].filter(Boolean).join(' ').toLowerCase();

          // Check if this is an acknowledgment or safe confirmation from Family Dashboard
          const isAckEvt =
            evt.type === 'alert_acknowledged' ||
            evt.event_type === 'alert_acknowledged' ||
            evt.action === 'acknowledge' ||
            allEvtText.includes('alert_acknowledged') ||
            allEvtText.includes('acknowledged') ||
            allEvtText.includes('priya acknowledged') ||
            allEvtText.includes('elder is safe') ||
            allEvtText.includes('on my way') ||
            allEvtText.includes('on the way');

          if (isAckEvt) {
            pollHandledEventsRef.current.add(evtId);
            setTimeout(() => pollHandledEventsRef.current.delete(evtId), 60000);
            console.log('✅ Family acknowledgment detected via polling! Closing emergency modal.');
            classifyAndDispatchMessage(evt);
            return;
          }

          // If in active emergency, DO NOT PROCESS ANY OTHER EVENT TYPE (strictly no calls, no echo loops)
          if (isEmergencyActive) {
            continue;
          }

          pollHandledEventsRef.current.add(evtId);
          setTimeout(() => pollHandledEventsRef.current.delete(evtId), 60000);

          // Emergency events are already handled via WebSocket / direct triggers; skip in polling
          const isCriticalEvent =
            evt.severity === 'critical' ||
            evt.action === 'call_emergency' ||
            evt.action === 'emergency_escalate' ||
            evt.action === 'escalate_112' ||
            evt.event_type === 'fall' ||
            evt.event_type === 'manual_panic' ||
            evt.type === 'fall' ||
            evt.type === 'manual_panic';

          if (isCriticalEvent) {
            continue;
          }

          const evtTimestamp = evt.timestamp ? new Date(evt.timestamp).getTime() : 0;
          const isTooOld = evtTimestamp > 0 && (Date.now() - evtTimestamp > 60000);
          if (isTooOld) continue;

          const isCallEvent =
            evt.type === 'CallInvite' ||
            evt.type === 'callinvite' ||
            evt.event_type === 'CallInvite' ||
            allEvtText.includes('call_invite') ||
            allEvtText.includes('callinvite') ||
            allEvtText.includes('initiated voice call') ||
            allEvtText.includes('initiated video call') ||
            allEvtText.includes('initiated call') ||
            allEvtText.includes('family call') ||
            allEvtText.includes('calling kamala') ||
            allEvtText.includes('calling elder') ||
            (typeof evt.family_message === 'string' && evt.family_message.includes('CALL_INVITE')) ||
            (typeof evt.message === 'string' && evt.message.includes('CALL_INVITE'));

          if (isCallEvent) {
            // Ignore self calls initiated by elder tablet
            if (
              allEvtText.includes('elder initiated') ||
              allEvtText.includes('kamala initiated') ||
              (evt.sender && evt.sender.toLowerCase().includes('kamala')) ||
              activeCallRef.current !== null
            ) {
              continue;
            }

            let callType = (allEvtText.includes('video') || evt.call_type === 'video') ? 'video' : 'voice';
            let callerName = evt.caller_name || evt.sender_name || (evt.sender && !evt.sender.toLowerCase().includes('kamala') ? evt.sender : null) || familyContactName || 'Family';
            let callId = evt.call_id || evt.event_id || `call_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

            const rawCallMsg = String(evt.family_message || evt.message || '');
            if (rawCallMsg.includes('CALL_INVITE')) {
              const parts = rawCallMsg.split(':');
              if (parts[1] && parts[1].toLowerCase().includes('video')) callType = 'video';
              if (parts[2] && parts[2].trim()) callerName = parts[2].trim();
              if (parts[3] && parts[3].trim()) callId = parts[3].trim();
            }

            if (handledCallsRef.current.has(callId)) continue;
            handledCallsRef.current.add(callId);
            setTimeout(() => handledCallsRef.current.delete(callId), 30000);

            console.log('📞 Live Pending Call Event Detected from Family:', { callId, callerName, callType });

            setIncomingCall({
              call_id: callId,
              elder_id: evt.elder_id || ELDER_ID,
              caller: callerName,
              callType: callType,
              message: `${callerName} is calling you live from the Family Dashboard`,
              timestamp: Date.now(),
            });

            playPhoneRing();
            break;
          }

          // Route family messages/notes
          if (
            evt.type === 'family_message' ||
            evt.family_message ||
            allEvtText.includes('family_message') ||
            allEvtText.includes('family_note') ||
            (evt.sender && String(evt.sender).toLowerCase().includes('priya') && !allEvtText.includes('fall'))
          ) {
            classifyAndDispatchMessage(evt);
          }
        }
      } catch (err) {
        // Silent network retry
      }
    }, intervalMs);

    return () => clearInterval(pollInterval);
  }, [classifyAndDispatchMessage, fallModalOpen, sosSent, isEmergencyEscalated]);

  // Simulation Handlers for Team Demonstration & Testing
  const simulateIncomingFamilyMessage = useCallback((sender = 'Priya (Daughter)', text = 'Had lunch Amma? Taking my break now, visiting this evening! ❤️') => {
    setFamilyMessage({
      sender,
      text,
      time: 'Just now',
      timestamp: Date.now(),
    });
    playGentleChime();
    speak(`Message from ${sender}: ${text}`, selectedLang);
  }, [selectedLang, speak]);

  const simulateIncomingFamilyCall = useCallback((caller = 'Priya (Daughter)') => {
    setIncomingCall({
      call_id: `call_${Date.now()}`,
      elder_id: ELDER_ID,
      caller,
      callType: 'voice',
      message: `${caller} is calling you live from the Family Dashboard`,
      timestamp: Date.now(),
    });
    playPhoneRing();
  }, []);

  const simulateFamilyAcknowledgment = useCallback((acknowledgedBy = 'Priya (Daughter)', message = "Priya acknowledged: 'On my way home Amma! Hang tight.'") => {
    setFamilyAck({ acknowledgedBy, message, timestamp: Date.now() });
    playGentleChime();
    speak(`${acknowledgedBy} has acknowledged your alert and is on her way!`, selectedLang);
    setTimeout(() => setFamilyAck(null), 12000);
  }, [selectedLang, speak]);

  const simulateFamilyMedNudge = useCallback((from = 'Priya (Daughter)', task = 'Please take your 1:30 PM Calcium pill with water.') => {
    setMoodToast(`💊 ${from}: ${task}`);
    playGentleChime();
    speak(`${from} sent a reminder: ${task}`, selectedLang);
    setTimeout(() => setMoodToast(null), 7000);
  }, [selectedLang, speak]);

  const simulateAiAgentVoiceCheck = useCallback(() => {
    classifyAndDispatchMessage({
      type: 'AgentDecision',
      decision_id: crypto.randomUUID(),
      action: 'voice_check',
      severity: 'high',
      voice_message_to_elder: 'Kamala, did you fall? Are you okay? Please speak or press the button.',
      reasoning_trace: 'ShastraVision detected sudden posture drop. AI Agent initiates empathetic voice inquiry.',
      timestamp: new Date().toISOString(),
    });
  }, [classifyAndDispatchMessage]);

  const simulateAiAgentEmergencyEscalate = useCallback(() => {
    classifyAndDispatchMessage({
      type: 'AgentDecision',
      decision_id: crypto.randomUUID(),
      action: 'call_emergency',
      severity: 'critical',
      voice_message_to_elder: 'Emergency Guardian detected unresponsiveness. Escalating to 112 and family.',
      reasoning_trace: 'No vocal response from elder after fall event. Immediate 112 escalation triggered.',
      timestamp: new Date().toISOString(),
    });
  }, [classifyAndDispatchMessage]);

  // Check-In Scheduler
  const {
    activeCheckIn: currentCheckIn,
    handleSelectOption: handleCheckInResponse,
    dismissCheckIn,
    triggerCognitive,
    triggerMeal,
    triggerSleep,
    triggerMobility,
  } = useCheckInScheduler({ elderId: ELDER_ID, selectedLang });

  // Vision Simulator
  const triggerSimulatedVisionEvent = useCallback(
    async (eventType, emotionVal = null) => {
      setShowVisionMenu(false);
      const eventId = `sim_fall_${Date.now()}`;
      const payload = buildSensorEvent({
        eventType,
        emotion: emotionVal,
        confidence: 0.96,
        eventId,
      });

      if (eventType === 'fall') {
        console.log('🚨 [SIMULATOR] Immediate Fall Alert Triggered on Tablet Screen!');
        processedDecisionsRef.current.add(eventId);
        triggerFallAlert(t.fallAlertPrompt || 'ShastraVision: Fall detected in living room (Simulation)', true);
      } else if (eventType === 'emotion_detected') {
        playGentleChime();
        speak(t.emotionSadPrompt, selectedLang);
      } else if (eventType === 'inactivity') {
        playGentleChime();
        speak('Inactivity detected. Kamala, are you resting comfortably?', selectedLang);
      }

      // Asynchronously dispatch to Hub API and WebSocket in the background
      try {
        postSensorEvent(payload).catch((err) => console.warn('Failed to post simulated vision event to Hub:', err));
        sendMessage(payload);
      } catch (e) {
        console.warn('Failed to dispatch simulated vision event:', e);
      }
    },
    [selectedLang, t, speak, triggerFallAlert, sendMessage]
  );

  const timeString = currentTime.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });

  const hourMinute = currentTime.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

  const fullDateString = currentTime.toLocaleDateString('en-IN',
    { weekday: 'long', month: 'short', day: 'numeric' }
  );

  const dateString = currentTime.toLocaleDateString('en-IN', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

  // Calculate status indicator state
  let statusTone = 'emerald';
  let statusHeadline = t.calmStatus;
  let statusDetail = t.calmSub;

  if (sosSent) {
    statusTone = 'rose';
    statusHeadline = t.sosSentStatus;
    statusDetail = t.sosSentSub;
  } else if (isSpeaking) {
    statusTone = 'cyan';
    statusHeadline = t.speakingStatus;
    statusDetail = t.speakingSub;
  } else if (voiceError) {
    statusTone = 'amber';
    statusHeadline = t.voiceIssueHeadline;
    statusDetail = t.voiceIssueDetail;
  } else if (!isConnected) {
    statusTone = 'amber';
    statusHeadline = t.reconnectingStatus;
    statusDetail = t.reconnectingSub;
  } else if (medications.some((m) => m.status === 'pending')) {
    statusTone = 'amber';
    statusHeadline = `⚠️ ${medications.filter((m) => m.status === 'pending').length} Medications Pending`;
    statusDetail = 'Tap 💊 button to open your medication tracker';
  }

  return (
    <main className={`liquid-glass-root ${backendAlertActive ? 'in-alert-state' : ''}`}>
      {/* Bioluminescent Ambient Floating Light Orbs */}
      <div className="ambient-orb orb-cyan" aria-hidden="true"></div>
      <div className="ambient-orb orb-indigo" aria-hidden="true"></div>
      <div className="ambient-orb orb-teal" aria-hidden="true"></div>
      <div
        className={`ambient-orb orb-crimson ${
          backendAlertActive || sosSent ? 'orb-crimson-active' : ''
        }`}
        aria-hidden="true"
      ></div>

      <div className="liquid-glass-container">
        {/* ============================================================
            1. PEACEFUL COMPANION TOP NAV (Clean & Spacious)
            ============================================================ */}
        <header className="companion-top-nav">
          <div className="companion-nav-identity">
            <div className="guardian-glow-beacon">
              <span className={`beacon-pulse-ring beacon-${statusTone}`}></span>
              <div className={`beacon-core beacon-core-${statusTone}`}>
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
              </div>
            </div>

            <div className="companion-nav-meta">
              <span className="companion-brand-title">{t.appName}</span>
              <span className="companion-time-subtitle">{hourMinute} • {fullDateString}</span>
            </div>
          </div>

          <div className="companion-nav-actions">
            <nav className="companion-nav-tabs" aria-label="Main Navigation">
              <button
                type="button"
                className={`nav-tab-btn ${activeTab === 'home' ? 'nav-tab-active' : ''}`}
                onClick={() => setActiveTab('home')}
                aria-current={activeTab === 'home' ? 'page' : undefined}
              >
                <span className="nav-tab-icon">🌿</span>
                <span className="nav-tab-text">Care Sanctuary</span>
              </button>
              <button
                type="button"
                className={`nav-tab-btn ${activeTab === 'profile' ? 'nav-tab-active' : ''}`}
                onClick={() => setActiveTab('profile')}
                aria-current={activeTab === 'profile' ? 'page' : undefined}
              >
                <span className="nav-tab-icon">👤</span>
                <span className="nav-tab-text">Health Profile</span>
              </button>
            </nav>
          </div>
        </header>

        {/* ShastraVision Live Perception Simulator Drawer */}
        {showVisionMenu && (
          <section className="glass-drawer-panel vision-drawer" role="region" aria-label="ShastraVision Simulator">
            <div className="drawer-header">
              <span className="drawer-title">{t.drawerVisionTitle}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="drawer-badge">MediaPipe + DeepFace</span>
                <button
                  className="btn-close-drawer"
                  onClick={() => setShowVisionMenu(false)}
                  title="Close Drawer"
                  aria-label="Close Vision Drawer"
                >
                  ✕
                </button>
              </div>
            </div>
            <div className="drawer-buttons-row">
              <button
                className="drawer-btn btn-trigger-fall"
                onClick={() => triggerSimulatedVisionEvent('fall')}
              >
                {t.drawerTriggerFall}
              </button>
              <button
                className="drawer-btn btn-trigger-sad"
                onClick={() => triggerSimulatedVisionEvent('emotion_detected', 'sad')}
              >
                {t.drawerTriggerSad}
              </button>
              <button
                className="drawer-btn btn-trigger-fear"
                onClick={() => triggerSimulatedVisionEvent('emotion_detected', 'fear')}
              >
                {t.drawerTriggerFear}
              </button>
              <button
                className="drawer-btn btn-trigger-inactivity"
                onClick={() => triggerSimulatedVisionEvent('inactivity')}
              >
                {t.drawerTriggerInactivity}
              </button>
            </div>
          </section>
        )}

        {/* Family & AI LLM Live Simulators Drawer */}
        {showFamilySimMenu && (
          <section className="glass-drawer-panel family-sim-drawer" role="region" aria-label="Family & AI Simulators">
            <div className="drawer-header">
              <span className="drawer-title">👨‍👩‍👧 Family Dashboard &amp; AI LLM Live Simulators</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="drawer-badge">Bidirectional Test</span>
                <button
                  className="btn-close-drawer"
                  onClick={() => setShowFamilySimMenu(false)}
                  title="Close Drawer"
                  aria-label="Close Family & AI Drawer"
                >
                  ✕
                </button>
              </div>
            </div>
            <div className="drawer-buttons-row">
              <button
                className="drawer-btn drawer-btn-family"
                onClick={() => simulateIncomingFamilyMessage('Priya (Daughter)', 'Amma, checking in! Did you take your medicine? Coming home at 6 PM! ❤️')}
              >
                💬 Msg from Priya
              </button>
              <button
                className="drawer-btn drawer-btn-family"
                onClick={() => simulateIncomingFamilyCall('Priya (Daughter)')}
              >
                📞 Call from Priya
              </button>
              <button
                className="drawer-btn drawer-btn-family"
                onClick={() => simulateFamilyAcknowledgment('Priya (Daughter)', "Priya acknowledged: 'On my way home Amma! Don\'t worry.'")}
              >
                🤝 Family Ack
              </button>
              <button
                className="drawer-btn drawer-btn-family"
                onClick={() => simulateFamilyMedNudge('Priya (Daughter)', 'Please take your 1:30 PM Calcium pill with water.')}
              >
                💊 Med Nudge
              </button>
              <button
                className="drawer-btn drawer-btn-ai"
                onClick={() => {
                  setShowFamilySimMenu(false);
                  simulateAiAgentVoiceCheck();
                }}
              >
                🧠 AI Voice Check
              </button>
              <button
                className="drawer-btn drawer-btn-ai"
                onClick={() => {
                  setShowFamilySimMenu(false);
                  simulateAiAgentEmergencyEscalate();
                }}
              >
                🚨 AI Emergency 112
              </button>
            </div>
          </section>
        )}

        {/* Health Check-Ins Drawer */}
        {showCheckInMenu && (
          <section className="glass-drawer-panel checkin-drawer" role="region" aria-label="Health Check-ins">
            <div className="drawer-header">
              <span className="drawer-title">{t.drawerCheckInTitle}</span>
              <button
                className="btn-close-drawer"
                onClick={() => setShowCheckInMenu(false)}
                title="Close Drawer"
                aria-label="Close Check-ins Drawer"
              >
                ✕
              </button>
            </div>
            <div className="drawer-buttons-row">
              <button className="drawer-btn" onClick={() => { triggerCognitive(); setShowCheckInMenu(false); }}>
                {t.drawerCognitive}
              </button>
              <button className="drawer-btn" onClick={() => { triggerMeal('breakfast'); setShowCheckInMenu(false); }}>
                {t.drawerBreakfast}
              </button>
              <button className="drawer-btn" onClick={() => { triggerMeal('lunch'); setShowCheckInMenu(false); }}>
                {t.drawerLunch}
              </button>
              <button className="drawer-btn" onClick={() => { triggerSleep(); setShowCheckInMenu(false); }}>
                {t.drawerSleep}
              </button>
              <button className="drawer-btn" onClick={() => { triggerMobility(); setShowCheckInMenu(false); }}>
                {t.drawerMobility}
              </button>
            </div>
          </section>
        )}

        {/* ============================================================
            2. BACKEND INCOMING ALERT & PRIVILEGE ESCALATION MODE
            ============================================================ */}
        {backendAlertActive && !fallModalOpen ? (
          <section className="glass-critical-alert-card">
            <div className="alert-tier-chip">
              <span className="alert-pulse-flame"></span>
              <span className="alert-tier-name">{t[escalationTierKey] || t.tier1}</span>
              <span className="alert-countdown-tag">⏱️ {escalationSecondsLeft}{t.secondsShort}</span>
            </div>

            <h1 className="alert-main-title">{t.alertTitle}</h1>
            <p className="alert-main-message">{displayedAlertMessage}</p>

            <div className="alert-auto-escalate-warning">
              ⚠️ {t.escalationWarning} ({escalationSecondsLeft}{t.secondsShort})
            </div>

            <div className="alert-glass-actions-grid">
              <button
                className="btn-glass-action btn-glass-fine"
                onClick={handleFallModalSafe}
                aria-label={t.yesImFineBtn}
              >
                <div className="action-icon-circle">✓</div>
                <div className="action-text-column">
                  <span className="action-primary-text">{t.yesImFineBtn}</span>
                  <span className="action-sub-text">{t.yesImFineSub}</span>
                </div>
              </button>

              <button
                className={`btn-glass-action btn-glass-talk ${isListening ? 'action-listening-active' : ''}`}
                onClick={handleTalkTap}
                aria-label="Talk to Clarify"
              >
                <div className="action-icon-circle">🎙️</div>
                <div className="action-text-column">
                  <span className="action-primary-text">
                    {isListening ? `${t.talkBtnListening} (${secondsLeft}${t.secondsShort})` : t.talkBtnTapToSpeak}
                  </span>
                  <span className="action-sub-text">
                    {isListening ? t.streamingAudioSub : t.speakToExplainSub}
                  </span>
                </div>
              </button>

              <button
                className="btn-glass-action btn-glass-panic"
                onClick={handleSOS}
                aria-label="I need emergency help"
              >
                🚨 {t.sosBtnLabel} {t.sosEmergencyBadge}
              </button>
            </div>
          </section>
        ) : activeTab === 'profile' ? (
          <ElderProfileView onProfileChange={handleProfileUpdate} />
        ) : (
          /* ============================================================
             3. MOBILE VERTICAL STACK: THE 3 MAJOR BUTTONS & ALTERNATE FEATURES
             ============================================================ */
          <div className="companion-main-canvas">
            {/* Emergency SOS Active Banner */}
            {sosSent && (
              <section className="family-ack-banner" style={{ background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.25) 0%, rgba(185, 28, 28, 0.35) 100%)', borderColor: '#EF4444' }} role="alert">
                <div className="ack-icon" style={{ background: '#EF4444' }}>🚨</div>
                <div className="ack-text-stack">
                  <span className="ack-title" style={{ color: '#FCA5A5' }}>🚨 EMERGENCY SOS DISPATCHED</span>
                  <p className="ack-body">Alert sent to Priya (Daughter) &amp; 112 Emergency Services. Help is on the way.</p>
                </div>
                <button
                  onClick={handleCancelSOS}
                  style={{ marginLeft: 'auto', background: 'rgba(255, 255, 255, 0.15)', color: '#FFFFFF', border: '1px solid rgba(255, 255, 255, 0.3)', borderRadius: '12px', padding: '8px 16px', fontWeight: '700', fontSize: '13px', cursor: 'pointer' }}
                >
                  ✓ Cancel / I Am Safe
                </button>
              </section>
            )}

            {/* Reassuring Family Acknowledgment Banner (if family acknowledged an alert) */}
            {familyAck && (
              <section className="family-ack-banner" role="status">
                <div className="ack-icon">🤝</div>
                <div className="ack-text-stack">
                  <span className="ack-title">✓ {familyAck.acknowledgedBy} Acknowledged Your Alert</span>
                  <p className="ack-body">{familyAck.message}</p>
                </div>
              </section>
            )}

            {/* ============================================================
                HERO: THE PERSONAL HEALTHCARE COMPANION SANCTUARY
                ============================================================ */}
            <section className="liquid-card companion-sanctuary">
              <div className="glass-specular-edge" aria-hidden="true"></div>

              {/* 1. Warm Personal Greeting & Companion Identity */}
              <div className="companion-greeting-header">
                <div className="companion-status-tag">
                  <span className="companion-status-dot"></span>
                  <span className="companion-status-text">{t.calmStatus}</span>
                </div>
                <h1 className="companion-greeting-title">{t.companionGreeting}</h1>
                <p className="companion-greeting-subtitle">{t.companionGreetingSub}</p>
              </div>

              {/* 2. Living Companion Presence Aura & Interactive Center Mic */}
              <div className="companion-stage">
                <div className={`companion-presence-cluster ${isListening ? 'state-listening' : isSpeaking ? 'state-speaking' : 'state-breathing'}`}>
                  <div className="companion-ambient-halo"></div>
                  <div className="companion-ripple-ring ring-1"></div>
                  <div className="companion-ripple-ring ring-2"></div>

                  <button
                    className="btn-companion-core"
                    onClick={handleTalkTap}
                    aria-label={isListening ? t.talkBtnListening : t.talkBtnTapToSpeak}
                  >
                    <div className="companion-core-inner">
                      <svg
                        className="icon-companion-mic"
                        width="38"
                        height="38"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                        <line x1="12" x2="12" y1="19" y2="22" />
                      </svg>
                    </div>
                  </button>
                </div>

                <button
                  className={`companion-talk-pill ${isListening ? 'talk-pill-active' : ''}`}
                  onClick={handleTalkTap}
                  aria-label={isListening ? t.talkBtnListening : t.talkBtnTapToSpeak}
                >
                  <span className="talk-pill-label">
                    {isListening
                      ? `🎙️ ${t.talkBtnListening} (${secondsLeft}${t.secondsShort})`
                      : isSpeaking
                      ? `🔊 ${t.speakingStatus}`
                      : `🎙️ ${t.talkBtnTapToSpeak}`}
                  </span>
                </button>
              </div>

              {/* 3. Conversational Dialogue Bubble (Spacious & Easy to Read) */}
              <div className="companion-dialogue-box">
                {isListening ? (
                  <div className="companion-speech-card dialogue-live" style={{ borderColor: '#F59E0B', background: 'rgba(245, 158, 11, 0.08)' }}>
                    <div className="speech-card-header">
                      <span className="speech-sender-tag" style={{ color: '#F59E0B', fontWeight: '700' }}>
                        🎙️ Listening ({secondsLeft}s)...
                      </span>
                    </div>
                    {voiceError ? (
                      <p className="speech-transcript-text" style={{ color: '#EF4444' }}>
                        ⚠️ {voiceError}
                      </p>
                    ) : interimText ? (
                      <p className="speech-transcript-text" style={{ color: '#FFFFFF', fontWeight: '600' }}>
                        &ldquo;{interimText}&rdquo;
                      </p>
                    ) : (
                      <p className="speech-transcript-text" style={{ color: 'rgba(255, 255, 255, 0.7)', fontStyle: 'italic' }}>
                        Listening... please speak your message now
                      </p>
                    )}
                  </div>
                ) : interimText ? (
                  <div className="companion-speech-card dialogue-live">
                    <div className="speech-card-header">
                      <span className="speech-sender-tag">● Live Speech Stream</span>
                    </div>
                    <p className="speech-transcript-text">&ldquo;{interimText}&rdquo;</p>
                  </div>
                ) : (lastSpokenText || aiAgentStatus?.message) ? (
                  <div className="companion-speech-card dialogue-confirmed">
                    {lastSpokenText && (
                      <div style={{ marginBottom: aiAgentStatus?.message ? '8px' : '0' }}>
                        <div className="speech-card-header">
                          <span className="speech-sender-tag" style={{ color: 'rgba(255, 255, 255, 0.65)' }}>
                            🗣️ You said:
                          </span>
                        </div>
                        <p className="speech-transcript-text" style={{ fontSize: '0.92rem', color: 'rgba(255, 255, 255, 0.82)', margin: '2px 0 6px 0' }}>
                          &ldquo;{lastSpokenText}&rdquo;
                        </p>
                      </div>
                    )}
                    {aiAgentStatus?.message && (
                      <div style={{ borderTop: lastSpokenText ? '1px solid rgba(255, 255, 255, 0.08)' : 'none', paddingTop: lastSpokenText ? '8px' : '0' }}>
                        <div className="speech-card-header">
                          <span className="speech-sender-tag" style={{ color: '#F0A395', fontWeight: '700' }}>
                            🤖 AI Companion:
                          </span>
                          <button
                            className="btn-replay-voice"
                            onClick={() => {
                              speak(aiAgentStatus.message, selectedLang);
                            }}
                          >
                            🔊 Replay Voice
                          </button>
                        </div>
                        <p className="speech-transcript-text" style={{ color: '#FFFFFF', fontWeight: '600', margin: '4px 0 0 0' }}>
                          &ldquo;{aiAgentStatus.message}&rdquo;
                        </p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="companion-idle-helper">
                    <p className="companion-helper-text">
                      {t.companionIdleBubble}
                    </p>
                  </div>
                )}
              </div>
            </section>

            {/* ============================================================
                FAMILY DASHBOARD LIVE SYNC CARD (Bidirectional Family Link)
                ============================================================ */}
            <section className="family-live-card" aria-label="Family Live Sync">
              <div className="glass-specular-edge" aria-hidden="true"></div>
              
              {/* Dynamic Live Header */}
              <div className="family-card-header">
                <div className="family-sender-identity">
                  <div className="family-avatar-orb">
                    <span className="family-avatar-emoji">👩‍💼</span>
                    <span className="family-avatar-online-dot" title="Family online"></span>
                  </div>
                  <div className="family-sender-meta">
                    <div className="family-sender-row">
                      <span className="family-sender-name">{familyMessage.sender}</span>
                      <span className="family-relation-pill">Family Caregiver</span>
                    </div>
                    <span className="family-time-tag">Sent {familyMessage.time}</span>
                  </div>
                </div>
                <div className="family-sync-indicator" title="Synchronized in real-time with Family Dashboard">
                  <span className="sync-pulse-wrapper">
                    <span className="sync-pulse-dot"></span>
                    <span className="sync-pulse-ring"></span>
                  </span>
                  <span className="sync-label">Live Synced</span>
                </div>
              </div>

              {/* Custom Status Composer Section */}
              <div className="family-status-composer">
                <div className="composer-header-row">
                  <div className="composer-label">
                    <span className="composer-icon">✍️</span>
                    <span className="composer-heading">Share Status With {familyMessage.sender.split(' ')[0]}</span>
                  </div>
                  {customStatusText.length > 0 && (
                    <span className="composer-char-badge">{customStatusText.length} chars</span>
                  )}
                </div>

                <form
                  className="family-status-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSendCustomStatus();
                  }}
                >
                  <div className={`family-status-input-wrapper ${customStatusText ? 'has-text' : ''}`}>
                    <input
                      ref={statusInputRef}
                      type="text"
                      className="family-status-input"
                      placeholder="Type Your Status"
                      aria-label="Type Your Status"
                      value={customStatusText}
                      onChange={(e) => setCustomStatusText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleSendCustomStatus();
                        }
                      }}
                    />

                    {customStatusText && (
                      <button
                        type="button"
                        className="btn-status-clear"
                        onClick={() => {
                          setCustomStatusText('');
                          if (statusInputRef.current) statusInputRef.current.focus();
                        }}
                        title="Clear text"
                        aria-label="Clear status text"
                      >
                        ✕
                      </button>
                    )}

                    <button
                      type="submit"
                      className={`btn-family-status-send ${customStatusText.trim() ? 'active' : ''}`}
                      disabled={!customStatusText.trim() || isSendingStatus}
                      title="Send your status update"
                      aria-label="Send status update"
                    >
                      {isSendingStatus ? (
                        <span className="status-sending-spinner"></span>
                      ) : (
                        <>
                          <span className="send-btn-icon">➤</span>
                          <span className="send-btn-label">Send Status</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>

                {/* Quick Suggestion Chips */}
                <div className="family-presets-container">
                  <span className="presets-label">Quick Suggestions:</span>
                  <div className="family-status-chips-scroll">
                    {STATUS_PRESETS.map((preset) => (
                      <button
                        key={preset.text}
                        type="button"
                        className={`family-status-chip ${customStatusText === preset.text ? 'selected' : ''}`}
                        onClick={() => handleSelectPreset(preset.text)}
                        title={`Select "${preset.text}"`}
                      >
                        <span className="chip-emoji">{preset.emoji}</span>
                        <span className="chip-text">{preset.text}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Live Sent Confirmation Feedback */}
                {familyReplied && (
                  <div className="family-status-sent-banner" role="status">
                    <span className="sent-banner-check">✓</span>
                    <span className="sent-banner-text">
                      Status sent to {familyMessage.sender.split(' ')[0]}:
                      <strong> &ldquo;{lastSentStatus || "I'm Doing Well"}&rdquo;</strong>
                    </span>
                    <span className="sent-banner-time">Just now</span>
                  </div>
                )}
              </div>
            </section>

            {/* ============================================================
                SUPPORT ACTIONS: 📞 CALL PRIYA & 🚨 EMERGENCY SOS
                ============================================================ */}
            <div className="companion-actions-grid">
              {/* Call Priya (Daughter) */}
              <button
                className="liquid-card action-card-family"
                onClick={handleDirectFamilyCall}
                aria-label={t.callFamilyBtn}
              >
                <div className="glass-specular-edge" aria-hidden="true"></div>
                <div className="action-card-content">
                  <div className="action-icon-circle orb-emerald">
                    <svg
                      width="28"
                      height="28"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                    </svg>
                  </div>
                  <div className="action-text-stack">
                    <span className="action-badge-chip badge-sage">PRIYA</span>
                    <h2 className="action-main-title">Call Priya</h2>
                    <p className="action-sub-text">Priya (Daughter) • Instant phone call</p>
                  </div>
                </div>
              </button>

              {/* Emergency SOS */}
              <button
                className={`liquid-card action-card-sos ${sosSent ? 'card-sos-active' : ''}`}
                onClick={handleSOS}
                aria-label={t.sosBtnLabel}
              >
                <div className="glass-specular-edge" aria-hidden="true"></div>
                <div className="action-card-content">
                  <div className="action-icon-circle orb-crimson">
                    <svg
                      width="28"
                      height="28"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                    </svg>
                  </div>
                  <div className="action-text-stack">
                    <span className="action-badge-chip badge-rose">{t.sosBadge}</span>
                    <h2 className="action-main-title">{sosSent ? t.sosBtnActiveLabel : t.sosBtnLabel}</h2>
                    <p className="action-sub-text">{sosSent ? t.sosBtnActiveSub : t.sosBtnSub}</p>
                  </div>
                </div>
              </button>
            </div>

            {/* ============================================================
                DAILY WELLNESS & RHYTHM (Spacious & Inviting)
                ============================================================ */}
            <section className="companion-wellness-section">
              <div className="wellness-header">
                <span className="wellness-header-title">{t.moodRowTitle}</span>
                {moodToast && <span className="wellness-toast-badge">{moodToast}</span>}
              </div>

              <div className="wellness-pills-row" role="group" aria-label="Daily Wellness Check-in">
                <button
                  className={`wellness-pill-btn pill-good ${selectedMood === 'happy' ? 'wellness-pill-selected' : ''}`}
                  onClick={() => handleMoodSelect('happy', `☀️ ${t.moodGood}`)}
                >
                  <span className="wellness-emoji">☀️</span>
                  <span className="wellness-label">{t.moodGood}</span>
                </button>

                <button
                  className={`wellness-pill-btn pill-calm ${selectedMood === 'neutral' ? 'wellness-pill-selected' : ''}`}
                  onClick={() => handleMoodSelect('neutral', `🍵 ${t.moodCalm}`)}
                >
                  <span className="wellness-emoji">🍵</span>
                  <span className="wellness-label">{t.moodCalm}</span>
                </button>

                <button
                  className={`wellness-pill-btn pill-resting ${selectedMood === 'sad' ? 'wellness-pill-selected' : ''}`}
                  onClick={() => handleMoodSelect('sad', `🌙 ${t.moodResting}`)}
                >
                  <span className="wellness-emoji">🌙</span>
                  <span className="wellness-label">{t.moodResting}</span>
                </button>
              </div>
            </section>
          </div>
        )}

        {/* ============================================================
            4. Ambient Telemetry Glass Footer
            ============================================================ */}
        <footer className="glass-telemetry-footer">
          <div className="telemetry-items-group">
            <div className="telemetry-item">
              <span className="telemetry-icon">⚡</span>
              <span className="telemetry-label">{t.telemetryHubLabel}</span>
              <span className={`telemetry-status status-${isConnected ? 'online' : 'offline'}`}>
                {isConnected ? t.telemetryHubConnected : t.telemetryHubReconnecting}
              </span>
            </div>

            <div className="telemetry-item">
              <span className="telemetry-icon">🎙️</span>
              <span className="telemetry-label">{t.telemetryVoiceLabel}</span>
              <span className="telemetry-status status-online">
                {isListening ? t.telemetryVoiceListening : isSpeaking ? t.telemetryVoiceSpeaking : t.telemetryVoiceReady}
              </span>
            </div>
          </div>

          <div className="telemetry-buttons-group">
            <button
              className="btn-footer-tool"
              onClick={() => {
                setShowFamilySimMenu((prev) => !prev);
                setShowVisionMenu(false);
                setShowCheckInMenu(false);
              }}
              title="Family Dashboard & AI Simulators"
            >
              👨‍👩‍👧 Family &amp; AI
            </button>
            <button
              className="btn-footer-tool"
              onClick={() => {
                setShowVisionMenu((prev) => !prev);
                setShowFamilySimMenu(false);
                setShowCheckInMenu(false);
              }}
              title="ShastraVision Simulator"
            >
              {t.toolVisionSim}
            </button>
            <button
              className="btn-footer-tool"
              onClick={() => {
                setShowCheckInMenu((prev) => !prev);
                setShowVisionMenu(false);
                setShowFamilySimMenu(false);
              }}
              title="Health Check-ins"
            >
              {t.toolCheckIns}
            </button>
            <button className="btn-footer-tool" onClick={triggerMobility}>
              {t.toolSteadiness}
            </button>
          </div>
        </footer>
      </div>

      {/* ============================================================
          FLOATING ACTION BUTTON — MEDICATION REMINDER (bottom-right)
          ============================================================ */}
      {showMedFab && (
        <div className="med-fab-backdrop" onClick={() => setShowMedFab(false)} aria-hidden="true" />
      )}

      {showMedFab && (
        <div className="med-fab-panel" role="dialog" aria-label="Medication Reminder">
          <div className="med-fab-panel-header">
            <div className="med-fab-panel-title-group">
              <span className="med-fab-panel-icon">💊</span>
              <div>
                <h3 className="med-fab-panel-title">My Medications</h3>
                <span className="med-fab-panel-subtitle">
                  {medications.filter((m) => m.status === 'done').length}/{medications.length} Done
                </span>
              </div>
            </div>
            <button
              className="med-fab-close-btn"
              onClick={() => setShowMedFab(false)}
              aria-label="Close medication panel"
            >
              ✕
            </button>
          </div>

          <div className="med-fab-list">
            {medications.length === 0 && (
              <div className="med-fab-empty">
                <span>No medications yet.</span>
                <span className="med-fab-empty-sub">Tap below to add your first medicine.</span>
              </div>
            )}
            {medications.map((med) => (
              <div
                key={med.id}
                className={`med-fab-item ${med.status === 'done' ? 'med-fab-item-done' : ''}`}
              >
                <div className="med-fab-item-info">
                  <span className="med-fab-item-emoji">{med.emoji}</span>
                  <span className="med-fab-item-name">{med.name}</span>
                </div>
                <button
                  className={`med-fab-status-btn ${med.status === 'done' ? 'med-fab-status-done' : 'med-fab-status-pending'}`}
                  onClick={() => handleToggleMedication(med.id)}
                >
                  {med.status === 'done' ? '✓ Done!' : 'Pending'}
                </button>
              </div>
            ))}
          </div>

          <div className="med-fab-add-row">
            <input
              type="text"
              className="med-fab-add-input"
              placeholder="Add medicine name..."
              value={newMedName}
              onChange={(e) => setNewMedName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleAddMedicine(newMedName);
                  setNewMedName('');
                }
              }}
              maxLength={60}
            />
            <button
              className="med-fab-add-btn"
              onClick={() => {
                handleAddMedicine(newMedName);
                setNewMedName('');
              }}
              disabled={!newMedName.trim()}
            >
              + Add
            </button>
          </div>
        </div>
      )}

      <button
        className={`med-fab-button ${medications.some((m) => m.status === 'pending') ? 'med-fab-has-pending' : 'med-fab-all-done'}`}
        onClick={() => setShowMedFab((prev) => !prev)}
        aria-label="Open Medication Reminder"
        title="Medication Reminder"
      >
        <span className="med-fab-icon">💊</span>
        {medications.some((m) => m.status === 'pending') && (
          <span className="med-fab-badge">
            {medications.filter((m) => m.status === 'pending').length}
          </span>
        )}
      </button>

      {/* Incoming Family Call Modal Overlay */}
      {incomingCall && (
        <div className="incoming-call-overlay" role="dialog" aria-modal="true">
          <div className="incoming-call-card">
            <div className="call-pulse-cluster">
              <div className="call-ripple-ring"></div>
              <div className="call-ripple-ring"></div>
              <div className="call-avatar-circle">👩‍💼</div>
            </div>
            <div className="call-meta-stack">
              <span className="call-incoming-label">Incoming Call</span>
              <h2 className="call-caller-name">{incomingCall.caller}</h2>
              <p className="call-sub-note">Live call request from Family Dashboard</p>
            </div>
            <div className="call-actions-row">
              <button className="btn-call-accept" onClick={handleAcceptIncomingCall}>
                <span>📞</span>
                <span>Answer &amp; Talk</span>
              </button>
              <button className="btn-call-decline" onClick={handleDeclineIncomingCall}>
                <span>✕</span>
                <span>Decline</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Active In-Progress Live Call Overlay */}
      {activeCall && (
        <div className="incoming-call-overlay" role="dialog" aria-modal="true">
          <div className="incoming-call-card active-call-card" style={{ borderColor: '#10B981', boxShadow: '0 24px 60px rgba(16, 185, 129, 0.25)' }}>
            <div className="call-pulse-cluster">
              <div className="call-ripple-ring" style={{ borderColor: 'rgba(16, 185, 129, 0.5)' }}></div>
              <div className="call-ripple-ring" style={{ borderColor: 'rgba(16, 185, 129, 0.3)' }}></div>
              <div className="call-avatar-circle" style={{ background: 'linear-gradient(135deg, #059669 0%, #10B981 100%)' }}>👩‍💼</div>
            </div>
            <div className="call-meta-stack">
              <span className="call-incoming-label" style={{ color: '#34D399', letterSpacing: '0.08em', fontWeight: '800' }}>● LIVE CALL CONNECTED</span>
              <h2 className="call-caller-name">{activeCall.caller}</h2>
              <p className="call-sub-note" style={{ color: '#A7F3D0', fontWeight: '600' }}>
                Speaking live • {formatCallDuration(activeCallDuration)}
              </p>
            </div>
            <div className="call-actions-row">
              <button
                className="btn-call-decline"
                style={{ minWidth: '180px', background: 'linear-gradient(135deg, #EF4444 0%, #DC2626 100%)', color: '#FFFFFF', borderColor: 'transparent', boxShadow: '0 8px 24px rgba(239, 68, 68, 0.4)' }}
                onClick={handleEndActiveCall}
              >
                <span>🔴</span>
                <span>End Call</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Outgoing Call to Priya Overlay */}
      {outgoingCall && !fallModalOpen && (
        <div className="incoming-call-overlay" role="dialog" aria-modal="true">
          <div className="incoming-call-card outgoing-call-card">
            <div className="call-pulse-cluster">
              <div className="call-ripple-ring"></div>
              <div className="call-ripple-ring"></div>
              <div className="call-avatar-circle" style={{ background: 'linear-gradient(135deg, #059669 0%, #10B981 100%)' }}>👩‍💼</div>
            </div>
            <div className="call-meta-stack">
              <span className="call-incoming-label" style={{ color: '#34D399', letterSpacing: '0.08em', fontWeight: '800' }}>CALLING PRIYA</span>
              <h2 className="call-caller-name">Priya (Daughter)</h2>
              <p className="call-sub-note">{outgoingCall.phone} • Ringing Family Dashboard</p>
            </div>
            <div className="call-actions-row">
              <button
                className="btn-call-decline"
                style={{ minWidth: '170px', background: 'linear-gradient(135deg, #EF4444 0%, #DC2626 100%)', color: '#FFFFFF', borderColor: 'transparent', boxShadow: '0 8px 24px rgba(239, 68, 68, 0.4)' }}
                onClick={handleEndOutgoingCall}
              >
                <span>🔴</span>
                <span>End Call</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fall Emergency Modal Overlay */}
      {fallModalOpen && (
        <FallEmergencyModal
          isOpen={fallModalOpen}
          fallReason={fallReason || `${elderFirstName}, did you fall? Are you fine? Please confirm if you are okay.`}
          onConfirmSafe={handleFallModalSafe}
          onEmergencyEscalate={handleSOS}
          selectedLang={selectedLang}
          elderName={elderFirstName}
          initialEscalated={isEmergencyEscalated}
        />
      )}

      {/* Health Check-In Interactive Overlay Card */}
      {currentCheckIn && (
        <CheckInCard
          checkIn={currentCheckIn}
          onAnswer={handleCheckInResponse}
          onDismiss={dismissCheckIn}
          isListening={isListening}
          interimText={interimText}
        />
      )}
    </main>
  );
}
