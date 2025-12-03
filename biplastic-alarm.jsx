import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { setLogLevel } from 'firebase/firestore';
import { Clock, Moon, Sun, Repeat2, BellRing, BellOff, Volume2 } from 'lucide-react';

// 1. GLOBAL FIREBASE CONFIG & APP ID ACCESS
const appId = typeof __app_id !== 'undefined' ? __app_id : 'sleep-tracker-default';
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : null;
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

// The CORRECTED biphasic sleep schedule defined in 24-hour time (minutes past midnight)
const SCHEDULE_EVENTS = [
  // Sleep 1: 9 PM (1260 min) to 1 AM (60 min)
  { minutes: 21 * 60, type: 'SLEEP', label: 'Core 1 Start (9 PM)' }, // 1260 min
  { minutes: 1 * 60, type: 'WAKE', label: 'Core 1 End (1 AM)' },     // 60 min

  // Sleep 2: 2 AM (120 min) to 5 AM (300 min)
  { minutes: 2 * 60, type: 'SLEEP', label: 'Core 2 Start (2 AM)' },   // 120 min
  { minutes: 5 * 60, type: 'WAKE', label: 'Core 2 End (5 AM)' },     // 300 min
];

/**
 * Utility function to convert minutes (0-1439) to HH:MM format (24h)
 * @param {number} totalMinutes - Minutes past midnight
 * @returns {string} HH:MM
 */
const formatMinutesToTime = (totalMinutes) => {
  const h = Math.floor(totalMinutes / 60) % 24;
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

/**
 * Utility function to format a duration in seconds into HH:MM:SS
 * @param {number} totalSeconds - Total seconds remaining
 * @returns {string} HH:MM:SS
 */
const formatDuration = (totalSeconds) => {
  if (totalSeconds < 0) totalSeconds = 0;
  const days = Math.floor(totalSeconds / (60 * 60 * 24));
  const remainingSeconds = totalSeconds % (60 * 60 * 24);
  const h = Math.floor(remainingSeconds / 3600);
  const m = Math.floor((remainingSeconds % 3600) / 60);
  const s = remainingSeconds % 60;

  const hh = String(h + days * 24).padStart(2, '0');
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');

  return `${hh}:${mm}:${ss}`;
};

const NextEventCard = ({ event, countdown }) => {
  const isSleep = event.type === 'SLEEP';
  const timeStr = formatMinutesToTime(event.minutes);
  const formattedCountdown = formatDuration(countdown);

  return (
    <div className={`p-6 rounded-xl shadow-2xl transition-all duration-300 w-full mb-6 ${isSleep ? 'bg-indigo-700 text-white' : 'bg-emerald-500 text-white'}`}>
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-3xl font-extrabold tracking-tight">
          {isSleep ? 'Time to Sleep' : 'Time to Wake Up'}
        </h2>
        {isSleep ? <Moon size={32} /> : <Sun size={32} />}
      </div>
      <p className="text-lg font-light mb-4">
        Next Event: <span className="font-semibold">{event.label}</span> at <span className="font-semibold">{timeStr}</span>
      </p>
      <div className="text-center">
        <p className="text-4xl sm:text-6xl font-mono font-bold">
          {formattedCountdown}
        </p>
        <p className="text-sm uppercase tracking-wider mt-1 opacity-80">
          Remaining
        </p>
      </div>
    </div>
  );
};

const CurrentStatus = ({ currentMinutes }) => {
  let isAsleep = false;
  let currentBlock = 'Unknown Period';

  // 9 PM (1260) to 1 AM (60) - Sleep 1 (Crosses Midnight)
  if (currentMinutes >= 1260 || (currentMinutes >= 0 && currentMinutes < 60)) {
    isAsleep = true;
    currentBlock = 'Core Sleep 1 (9 PM - 1 AM)';
  }
  // 2 AM (120) to 5 AM (300) - Sleep 2
  else if (currentMinutes >= 120 && currentMinutes < 300) {
    isAsleep = true;
    currentBlock = 'Core Sleep 2 (2 AM - 5 AM)';
  }
  // 1 AM (60) to 2 AM (120) - Wake 1
  else if (currentMinutes >= 60 && currentMinutes < 120) {
    isAsleep = false;
    currentBlock = 'Awake Period 1 (1 AM - 2 AM)';
  }
  // 5 AM (300) to 9 PM (1260) - Wake 2
  else if (currentMinutes >= 300 && currentMinutes < 1260) {
    isAsleep = false;
    currentBlock = 'Awake Period 2 (5 AM - 9 PM)';
  }

  const statusText = isAsleep ? 'Sleeping' : 'Awake';
  const statusColor = isAsleep ? 'bg-indigo-500' : 'bg-emerald-500';

  return (
    <div className={`p-4 rounded-xl shadow-md transition-all duration-300 w-full mb-4 ${statusColor} text-white`}>
      <div className="flex items-center justify-center">
        {isAsleep ? <Moon size={20} className="mr-2" /> : <Sun size={20} className="mr-2" />}
        <span className="text-xl font-semibold">{statusText}</span>
      </div>
      <p className="text-sm opacity-90 text-center mt-1">
        Currently in: {currentBlock}
      </p>
    </div>
  );
};

export default function App() {
  // ----------------------------------------------------
  // 2. FIREBASE/AUTH SETUP
  // ----------------------------------------------------
  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null);
  const [userId, setUserId] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(false);

  useEffect(() => {
    if (!firebaseConfig) {
      console.error("Firebase config not found. Skipping initialization.");
      setIsAuthReady(true);
      return;
    }

    try {
      const app = initializeApp(firebaseConfig, appId);
      const dbInstance = getFirestore(app);
      const authInstance = getAuth(app);
      setDb(dbInstance);
      setAuth(authInstance);
      setLogLevel('debug');

      const unsubscribe = onAuthStateChanged(authInstance, async (user) => {
        if (!user) {
          if (initialAuthToken) {
            await signInWithCustomToken(authInstance, initialAuthToken);
          } else {
            await signInAnonymously(authInstance);
          }
        }
        setUserId(authInstance.currentUser?.uid || crypto.randomUUID());
        setIsAuthReady(true);
      });

      return () => unsubscribe();
    } catch (error) {
      console.error("Firebase initialization failed:", error);
      setIsAuthReady(true);
    }
  }, []);
  // ----------------------------------------------------

  // ----------------------------------------------------
  // 3. TIMER AND SCHEDULE LOGIC
  // ----------------------------------------------------
  const [now, setNow] = useState(new Date());
  const [alarmEnabled, setAlarmEnabled] = useState(true);
  const ALARM_THRESHOLD_SECONDS = 5;

  // Function to generate and play a simple sine wave beep
  const playBeep = useCallback((frequency = 440, duration = 0.5) => {
    if (!alarmEnabled) return;

    // Check for browser compatibility
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) {
      console.warn("Web Audio API not supported.");
      return;
    }

    try {
      const context = new AudioContext();
      const oscillator = context.createOscillator();
      const gainNode = context.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(context.destination);

      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(frequency, context.currentTime); // Set pitch
      gainNode.gain.setValueAtTime(0.5, context.currentTime); // Set volume

      // Fade out to prevent clicks
      gainNode.gain.exponentialRampToValueAtTime(0.00001, context.currentTime + duration);

      oscillator.start();
      oscillator.stop(context.currentTime + duration);

      setTimeout(() => {
        context.close();
      }, duration * 1000 + 50); // Ensure context is closed after sound stops
    } catch (e) {
      console.error("Error playing audio:", e);
    }
  }, [alarmEnabled]);


  useEffect(() => {
    const timerId = setInterval(() => {
      setNow(new Date());
    }, 1000);
    return () => clearInterval(timerId);
  }, []);

  const { currentMinutes, nextEvent, countdownSeconds } = useMemo(() => {
    const totalMinutesInDay = 24 * 60;
    const currentMins = now.getHours() * 60 + now.getMinutes();
    const currentSeconds = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();

    let closestEvent = null;
    let minCountdown = Infinity;

    // Iterate through the schedule to find the *next* event
    for (const event of SCHEDULE_EVENTS) {
      const eventMins = event.minutes;

      const eventSeconds = eventMins * 60;
      let diffSeconds;

      // Calculate difference accounting for events that wrap around midnight
      if (eventSeconds > currentSeconds) {
        // Event is later today
        diffSeconds = eventSeconds - currentSeconds;
      } else {
        // Event is tomorrow (wrap around in seconds)
        const totalSecondsInDay = totalMinutesInDay * 60;
        diffSeconds = totalSecondsInDay - currentSeconds + eventSeconds;
      }

      if (diffSeconds < minCountdown) {
        minCountdown = diffSeconds;
        closestEvent = event;
      }
    }

    return {
      currentMinutes: currentMins,
      nextEvent: closestEvent,
      countdownSeconds: minCountdown,
    };
  }, [now]); // Recalculate whenever the current time updates

  // ALARM TRIGGER EFFECT
  useEffect(() => {
    if (countdownSeconds <= ALARM_THRESHOLD_SECONDS && countdownSeconds > 0) {
      // Trigger a sound when the countdown is very close to zero
      // Use a different frequency depending on the event type (Wake up needs a higher pitch)
      const freq = nextEvent?.type === 'WAKE' ? 660 : 220;
      playBeep(freq, 0.2);
    }
  }, [countdownSeconds, nextEvent, playBeep]);


  const currentTimeFormatted = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  const nextEventAction = nextEvent?.type === 'SLEEP' ? 'Sleep' : 'Wake Up';
  const isTimeUp = countdownSeconds <= 0;

  // ----------------------------------------------------
  // 4. RENDER UI
  // ----------------------------------------------------
  return (
    <div className="min-h-screen bg-gray-50 flex items-start sm:items-center justify-center p-4">
      <div className={`w-full max-w-lg bg-white rounded-3xl shadow-2xl p-6 sm:p-8 transition-all duration-300 ${isTimeUp ? 'ring-8 ring-red-400' : ''}`}>
        <header className="mb-6 border-b pb-4">
          <h1 className="text-4xl font-black text-gray-900 flex items-center">
            <Repeat2 className="text-indigo-600 mr-2" size={30} />
            Biphasic Sleep Tracker
          </h1>
          <p className="text-gray-500 mt-2 text-sm">
            Tracking Schedule: Core 1 (9 PM - 1 AM) & Core 2 (2 AM - 5 AM)
          </p>
        </header>

        {/* User Info and Alarm Controls */}
        <div className="flex justify-between items-center mb-6 p-3 bg-gray-100 rounded-xl">
          <div className="flex items-center">
            <Clock className="text-gray-600 mr-2" size={24} />
            <span className="text-xl font-bold text-gray-800 font-mono">{currentTimeFormatted}</span>
          </div>

          <button
            onClick={() => setAlarmEnabled(!alarmEnabled)}
            className={`p-2 rounded-full transition-colors duration-200 shadow-md flex items-center ${alarmEnabled ? 'bg-red-500 hover:bg-red-600 text-white' : 'bg-gray-300 hover:bg-gray-400 text-gray-700'}`}
            title={alarmEnabled ? "Disable Alarm" : "Enable Alarm"}
          >
            {alarmEnabled ? <BellRing size={20} /> : <BellOff size={20} />}
            <span className="ml-2 hidden sm:inline text-sm">{alarmEnabled ? 'Alarm ON' : 'Alarm OFF'}</span>
          </button>
        </div>

        {/* Alarm Notification Banner */}
        {isTimeUp && (
             <div className="p-4 mb-4 bg-red-100 border-l-4 border-red-500 text-red-700 rounded-lg flex items-center justify-center animate-pulse">
                <Volume2 className="w-6 h-6 mr-3" />
                <p className="font-bold text-lg">
                    TIME TO {nextEventAction.toUpperCase()}!
                </p>
            </div>
        )}

        {/* Current Status */}
        <CurrentStatus currentMinutes={currentMinutes} />

        {/* Next Event Countdown */}
        {nextEvent && (
          <NextEventCard event={nextEvent} countdown={countdownSeconds} />
        )}

        {/* Full Schedule Display */}
        <h3 className="text-xl font-bold text-gray-800 mb-4 mt-6">
          Your Daily Cycle
        </h3>
        <div className="space-y-3">
          <div className="flex justify-between items-center p-3 bg-indigo-100 rounded-lg">
            <span className="font-semibold text-indigo-800">Core Sleep 1</span>
            <span className="font-mono text-indigo-700">09:00 PM - 01:00 AM (4 hr)</span>
          </div>
          <div className="flex justify-between items-center p-3 bg-emerald-100 rounded-lg">
            <span className="font-semibold text-emerald-800">Awake Period 1 (Nap/Awake)</span>
            <span className="font-mono text-emerald-700">01:00 AM - 02:00 AM (1 hr)</span>
          </div>
          <div className="flex justify-between items-center p-3 bg-indigo-100 rounded-lg">
            <span className="font-semibold text-indigo-800">Core Sleep 2</span>
            <span className="font-mono text-indigo-700">02:00 AM - 05:00 AM (3 hr)</span>
          </div>
          <div className="flex justify-between items-center p-3 bg-emerald-100 rounded-lg">
            <span className="font-semibold text-emerald-800">Awake Period 2 (Main)</span>
            <span className="font-mono text-emerald-700">05:00 AM - 09:00 PM (16 hr)</span>
          </div>
        </div>

        <footer className="mt-8 pt-4 border-t text-xs text-gray-400 text-center">
            {isAuthReady && userId && (
                <p>User ID: <span className="font-mono text-xs">{userId}</span></p>
            )}
            {!isAuthReady && <p>Initializing authentication...</p>}
        </footer>
      </div>
    </div>
  );
}
