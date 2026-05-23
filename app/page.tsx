"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { 
  Play, 
  Square, 
  Settings, 
  Save, 
  Mic, 
  Sliders, 
  Radio, 
  Sparkles, 
  Volume2, 
  Music, 
  ChevronRight, 
  RefreshCw, 
  VolumeX, 
  GitMerge, 
  Compass, 
  Copy, 
  Check, 
  BookOpen, 
  HelpCircle,
  Hash,
  Activity,
  LogOut,
  UserCheck
} from "lucide-react";
import { 
  auth, 
  db, 
  googleProvider, 
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  collection,
  doc,
  setDoc,
  getDocs,
  query,
  where
} from "@/lib/firebase";

// Definition for track items
interface Track {
  id: string;
  name: string;
  volume: number; // 0 to 100
  panning: number; // -1 (Left) to 1 (Right)
  isMuted: boolean;
  isSoloed: boolean;
  frequency: number; // Pitch sound frequency for synthesized playback
  steps: boolean[]; // 8 Steps
}

const CHORD_KEYS = ["C", "G", "D", "A", "E"];
const CHORD_DEGREE_NAMES = ["I", "ii", "iii", "IV", "V", "vi", "vii°"];

// Map keys to Nashville Number equivalents
const CHORD_MAP: Record<string, string[]> = {
  "C": ["C", "Dm", "Em", "F", "G", "Am", "Bdim"],
  "G": ["G", "Am", "Bm", "C", "D", "Em", "F#dim"],
  "D": ["D", "Em", "F#m", "G", "A", "Bm", "C#dim"],
  "A": ["A", "Bm", "C#m", "D", "E", "F#m", "G#dim"],
  "E": ["E", "F#m", "G#m", "A", "B", "C#m", "D#dim"],
};

export default function NashvilleDaw() {
  // Authentication & Cloud states
  const [user, setUser] = useState<any | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [cloudStatus, setCloudStatus] = useState<string>("Offline Database Mode");
  const [syncMessage, setSyncMessage] = useState<string>("");
  const [savedSessions, setSavedSessions] = useState<any[]>([]);

  // DAW Session Config
  const [sessionName, setSessionName] = useState("Midnight Bluegrass");
  const [bpm, setBpm] = useState(110);
  const [activeKey, setActiveKey] = useState("G");
  
  // Selected Progression indices (indices of degree: 0 to 6)
  const [progression, setProgression] = useState<number[]>([0, 3, 4, 5]); // Default: I - IV - V - vi (G, C, D, Em)

  // Sequencer playback states
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);

  // Initial tracks definition
  const [tracks, setTracks] = useState<Track[]>([
    {
      id: "acoustic-guitar",
      name: "Acoustic Guitar",
      volume: 85,
      panning: -0.3,
      isMuted: false,
      isSoloed: false,
      frequency: 293.66, // D4
      steps: [true, false, true, false, true, false, true, false],
    },
    {
      id: "fiddle",
      name: "Melody Solo / Fiddle",
      volume: 75,
      panning: 0.3,
      isMuted: false,
      isSoloed: false,
      frequency: 440.00, // A4
      steps: [false, true, false, true, false, true, true, false],
    },
    {
      id: "nashville-bass",
      name: "Roots Upright Bass",
      volume: 90,
      panning: 0.0,
      isMuted: false,
      isSoloed: false,
      frequency: 98.00, // G2
      steps: [true, false, false, false, true, false, false, false],
    },
    {
      id: "studio-drums",
      name: "Groove Percussion",
      volume: 80,
      panning: 0.1,
      isMuted: false,
      isSoloed: false,
      frequency: 150.00, // Kick/snare pitch
      steps: [true, false, true, true, true, false, true, true],
    },
  ]);

  // AI Co-Producer Interface States
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiResponse, setAiResponse] = useState<string>("");
  const [aiLoading, setAiLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  
  // Web Audio Context reference
  const audioContextRef = useRef<AudioContext | null>(null);
  const stepTimerRef = useRef<any>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Meter levels for UI visualizers
  const [channelLevels, setChannelLevels] = useState<Record<string, number>>({
    "acoustic-guitar": 0,
    "fiddle": 0,
    "nashville-bass": 0,
    "studio-drums": 0,
  });

  // Keep a reference to current tracks, BPM and progression for the lock-step audio thread
  const tracksRef = useRef<Track[]>(tracks);
  tracksRef.current = tracks;
  const bpmRef = useRef<number>(bpm);
  bpmRef.current = bpm;
  const progressionRef = useRef<number[]>(progression);
  progressionRef.current = progression;
  const activeKeyRef = useRef<string>(activeKey);
  activeKeyRef.current = activeKey;

  // Track Solo configuration helper
  const isAnySoloActive = tracks.some(t => t.isSoloed);

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
      if (currentUser) {
        setCloudStatus("✓ Connected to Firebase.");
        fetchSessions(currentUser.uid);
      } else {
        setCloudStatus("Sign in for cloud sync.");
      }
    });
    return () => unsubscribe();
  }, []);

  // Fetch Saved sessions
  const fetchSessions = async (userId: string) => {
    try {
      const q = query(collection(db, "nashville_sessions"), where("ownerId", "==", userId));
      const querySnapshot = await getDocs(q);
      const fsSessions: any[] = [];
      querySnapshot.forEach((docSnap) => {
        fsSessions.push({ id: docSnap.id, ...docSnap.data() });
      });
      setSavedSessions(fsSessions);
    } catch (e) {
      console.error("Error fetching sessions: ", e);
    }
  };

  const handleGoogleSignIn = async () => {
    setAuthLoading(true);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("Auth sign in error: ", error);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      setSavedSessions([]);
    } catch (error) {
      console.error("Signout error: ", error);
    }
  };

  // Convert current state to clean template string for Gemini seed guidance
  const handleAiCoproduce = async (creativeVibe?: string) => {
    setAiLoading(true);
    setAiResponse("");
    
    const selectedVibe = creativeVibe || "Warm Country Ballad";
    
    // Get the chords names
    const chordList = progression.map(deg => CHORD_MAP[activeKey][deg] || "N/A").join(" - ");

    try {
      const res = await fetch("/api/gemini", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vibe: selectedVibe,
          key: activeKey,
          bpm,
          prompt: aiPrompt || `Provide arrangement and mix directives matching this structural key: ${activeKey} and sequence: ${chordList}.`,
        }),
      });

      const data = await res.json();
      if (data.text) {
        setAiResponse(data.text);
      } else if (data.error) {
        setAiResponse(`### AI Session Configurator offline\n${data.error}`);
      }
    } catch (error: any) {
      setAiResponse(`### Directives Generation Interrupted\n${error?.message || "Verify your connection"}`);
    } finally {
      setAiLoading(false);
    }
  };

  const handleCopyText = () => {
    if (!aiResponse) return;
    navigator.clipboard.writeText(aiResponse);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Trigger synth bounchers in loop
  const triggerSynthSound = useCallback((track: Track, pitchFreq: number, panVal: number, volFactor: number) => {
    if (!audioContextRef.current) return;
    
    const ctx = audioContextRef.current;
    
    // Soft osc node
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();
    const panner = ctx.createStereoPanner();

    // Route: Osc -> Gain -> Panner -> Destination
    osc.connect(gainNode);
    gainNode.connect(panner);
    panner.connect(ctx.destination);

    // Pan values check
    panner.pan.value = panVal;

    // Pitch styling per track
    if (track.id === "nashville-bass") {
      osc.type = "sine";
      // Roots bass fundamental freq
      osc.frequency.setValueAtTime(pitchFreq, ctx.currentTime);
      gainNode.gain.setValueAtTime(volFactor * 0.45, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    } else if (track.id === "studio-drums") {
      // Noise/snare simulation
      osc.type = "triangle";
      osc.frequency.setValueAtTime(pitchFreq, ctx.currentTime);
      // Sweeping frequency for analog kick/snare
      osc.frequency.exponentialRampToValueAtTime(40, ctx.currentTime + 0.12);
      gainNode.gain.setValueAtTime(volFactor * 0.6, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
    } else if (track.id === "fiddle") {
      // Bright violin string raspiness via sawtooth or triangle
      osc.type = "triangle";
      osc.frequency.setValueAtTime(pitchFreq, ctx.currentTime);
      // Gentle vibrato
      osc.frequency.sineWave = 5; 
      gainNode.gain.setValueAtTime(volFactor * 0.25, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    } else {
      // Acoustic Guitar string pluck simulation
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(pitchFreq, ctx.currentTime);
      gainNode.gain.setValueAtTime(volFactor * 0.18, ctx.currentTime);
      
      // Pluck filter envelopment
      const pluckFilter = ctx.createBiquadFilter();
      pluckFilter.type = "lowpass";
      pluckFilter.frequency.setValueAtTime(1000, ctx.currentTime);
      pluckFilter.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.25);
      
      osc.disconnect(gainNode);
      osc.connect(pluckFilter);
      pluckFilter.connect(gainNode);

      gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
    }

    osc.start();
    osc.stop(ctx.currentTime + 0.6);

    // Dynamic graphic bounce multiplier
    setChannelLevels(prev => ({
      ...prev,
      [track.id]: Math.min(100, 15 + volFactor * 105),
    }));

    // Fade UI levels out gradually
    setTimeout(() => {
      setChannelLevels(prev => ({
        ...prev,
        [track.id]: Math.max(0, prev[track.id] - 25),
      }));
    }, 180);
  }, []);

  // Sync to database
  const saveSessionToCloud = async () => {
    if (!user) {
      setSyncMessage("⚠ Authenticate first to sync.");
      return;
    }
    setSyncMessage("Saving to database...");
    
    const payload = {
      ownerId: user.uid,
      name: sessionName,
      bpm,
      activeKey,
      progression,
      tracks: tracks.map(({ id, name, volume, panning, steps }) => ({
        id, name, volume, panning, steps
      })),
      updatedAt: new Date().toISOString()
    };

    try {
      const docId = `${user.uid}-${sessionName.toLowerCase().replace(/[^a-z0-9]/g, "-")}`;
      await setDoc(doc(db, "nashville_sessions", docId), payload);
      setSyncMessage("✓ Saved successfully!");
      fetchSessions(user.uid);
      setTimeout(() => setSyncMessage(""), 4000);
    } catch (err) {
      console.error(err);
      setSyncMessage("Sync error. Please retry.");
    }
  };

  // Load user session
  const loadSavedSession = (sess: any) => {
    if (sess.bpm) setBpm(sess.bpm);
    if (sess.activeKey) setActiveKey(sess.activeKey);
    if (sess.name) setSessionName(sess.name);
    if (sess.progression) setProgression(sess.progression);
    if (sess.tracks) {
      const restored = tracks.map(original => {
        const matching = sess.tracks.find((t: any) => t.id === original.id);
        if (matching) {
          return {
            ...original,
            volume: matching.volume,
            panning: matching.panning,
            steps: matching.steps
          };
        }
        return original;
      });
      setTracks(restored);
    }
    setSyncMessage(`✓ Loaded ${sess.name}`);
    setTimeout(() => setSyncMessage(""), 3000);
  };

  // Web Audio Context initializer
  const startAudioContext = () => {
    if (!audioContextRef.current) {
      // @ts-ignore
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      audioContextRef.current = new AudioCtx();
    }
    if (audioContextRef.current.state === "suspended") {
      audioContextRef.current.resume();
    }
  };

  // Playback trigger loop
  const handleSequencerStep = useCallback(() => {
    setCurrentStep((prev) => {
      const nextStep = (prev + 1) % 8;
      
      // Determine what chord scale relative to the step
      // Standard 8 step progression chord index:
      // Steps 0-1: Progression Chord 1
      // Steps 2-3: Progression Chord 2
      // Steps 4-5: Progression Chord 3
      // Steps 6-7: Progression Chord 4
      const progressionIndex = Math.floor(nextStep / 2) % progressionRef.current.length;
      const degreeSelected = progressionRef.current[progressionIndex];
      const activeChord = CHORD_MAP[activeKeyRef.current]?.[degreeSelected] || "G";

      // Root note selection map (Hz frequencies)
      const baseFrequencies: Record<string, number> = {
        "C": 261.63, "Dm": 293.66, "Em": 329.63, "F": 349.23, "G": 392.00, "Am": 440.00, "Bdim": 493.88,
        "Bm": 493.88, "D": 293.66, "A": 440.00, "F#m": 369.99, "C#dim": 554.37, "F#dim": 369.99,
        "C#m": 554.37, "E": 329.63, "G#m": 415.30, "G#dim": 415.30, "B": 493.88, "D#dim": 622.25
      };

      const baseHz = baseFrequencies[activeChord] || 261.63;

      // Play matching step hits on active tracks
      tracksRef.current.forEach((track) => {
        if (track.steps[nextStep]) {
          // Skip if track is muted or another track is soloed and this one is not
          if (track.isMuted) return;
          if (isAnySoloActive && !track.isSoloed) return;

          // Determine specific note octave adjustments per track type
          let noteFreq = baseHz;
          if (track.id === "nashville-bass") {
            // Roots bass needs to sound lower in the octaves
            noteFreq = baseHz / 4;
          } else if (track.id === "fiddle") {
            // Solo strings higher melody
            noteFreq = baseHz * 1.5;
          } else if (track.id === "studio-drums") {
            noteFreq = nextStep % 4 === 2 ? 180 : 80; // Higher snare beat, lower kick beat
          }

          const volFactor = track.volume / 100;
          triggerSynthSound(track, noteFreq, track.panning, volFactor);
        }
      });

      return nextStep;
    });
  }, [triggerSynthSound, isAnySoloActive]);

  // Master Playback Switcher
  useEffect(() => {
    if (isPlaying) {
      startAudioContext();
      
      const intervalMs = (60 * 1000) / (bpmRef.current * 2); // 8th notes
      
      const loop = () => {
        handleSequencerStep();
        stepTimerRef.current = setTimeout(loop, intervalMs);
      };
      
      stepTimerRef.current = setTimeout(loop, intervalMs);
    } else {
      if (stepTimerRef.current) {
        clearTimeout(stepTimerRef.current);
      }
      // Clear levels
      setChannelLevels({
        "acoustic-guitar": 0,
        "fiddle": 0,
        "nashville-bass": 0,
        "studio-drums": 0,
      });
    }

    return () => {
      if (stepTimerRef.current) {
        clearTimeout(stepTimerRef.current);
      }
    };
  }, [isPlaying, handleSequencerStep]);

  // Toggle step cells
  const toggleStep = (trackId: string, stepIndex: number) => {
    setTracks(prev => prev.map(t => {
      if (t.id === trackId) {
        const nextSteps = [...t.steps];
        nextSteps[stepIndex] = !nextSteps[stepIndex];
        return { ...t, steps: nextSteps };
      }
      return t;
    }));
  };

  // Modify individual track parameters (volume fader, panning, etc)
  const updateTrackParam = (trackId: string, param: keyof Track, value: any) => {
    setTracks(prev => prev.map(t => {
      if (t.id === trackId) {
        return { ...t, [param]: value };
      }
      return t;
    }));
  };

  // Helper calculation to fetch chord names based on Selected progression
  const getChordAtSlot = (progSlot: number) => {
    const keyMap = CHORD_MAP[activeKey];
    if (!keyMap) return "G";
    return keyMap[progSlot] || "G";
  };

  return (
    <div id="daw-app-root" className="min-h-screen bg-[#07070a] p-4 lg:p-8 font-sans flex flex-col text-slate-300">
      
      {/* HEADER CONTROLLER BANNER */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 pb-4 border-b border-white/10 shrink-0">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-gradient-to-br from-amber-400 to-amber-600 rounded-lg flex items-center justify-center shadow-lg shadow-amber-500/10">
              <Sliders className="w-5 h-5 text-black font-extrabold" />
            </div>
            <div>
              <h1 id="app-title-header" className="text-xl md:text-2xl font-black tracking-tight text-white flex items-center gap-2">
                Nashville Studio AI
                <span className="bg-yellow-500/10 text-yellow-500 border border-yellow-500/20 text-[10px] uppercase font-bold tracking-widest px-2 py-0.5 rounded-full">
                  DAW Direct
                </span>
              </h1>
              <p className="text-xs text-white/40 mt-0.5">
                Multi-Track Sequencer & Co-Producer Core
              </p>
            </div>
          </div>
        </div>

        {/* MASTER CONSOLE TRANSPORT CONTROLS */}
        <div className="flex flex-wrap items-center gap-3 bg-[#0d0d14] border border-white/5 p-2 rounded-xl">
          {/* BPM Meter */}
          <div className="flex items-center gap-2 px-3 border-r border-white/5">
            <span className="text-[10px] font-mono tracking-wider text-slate-400 uppercase">Tempo</span>
            <input 
              type="number" 
              value={bpm} 
              onChange={(e) => {
                const val = Math.max(50, Math.min(220, Number(e.target.value)));
                setBpm(val);
              }}
              className="w-12 bg-black border border-white/10 text-center rounded text-white font-mono font-bold text-xs p-1"
            />
            <span className="text-[10px] font-mono text-white/30 font-bold">BPM</span>
          </div>

          {/* Session Name Title */}
          <div className="flex items-center gap-2 px-3 border-r border-white/5">
            <span className="text-[10px] font-mono text-slate-400 uppercase">Song</span>
            <input 
              type="text" 
              value={sessionName}
              onChange={(e) => setSessionName(e.target.value)}
              className="bg-transparent text-xs text-amber-400 font-bold truncate focus:bg-black/50 border-none p-1 rounded w-32 md:w-40"
            />
          </div>

          {/* PLAY BUTTON DISPLAY */}
          <button
            onClick={() => {
              setIsPlaying(!isPlaying);
              startAudioContext();
            }}
            className={`cursor-pointer px-4 py-2 rounded-lg text-xs font-black tracking-wide uppercase transition-all duration-300 flex items-center gap-2 border ${
              isPlaying 
                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/40 shadow-[0_0_15px_rgba(16,185,129,0.25)]" 
                : "bg-amber-500 text-black border-amber-600 font-bold hover:brightness-110"
            }`}
          >
            {isPlaying ? (
              <>
                <Square className="w-3.5 h-3.5 fill-current" />
                Stop
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-current" />
                Arm & Play
              </>
            )}
          </button>
        </div>
      </header>

      {/* DETAILED ACTIVE STEP SEQUENCER METRIC INDICATOR BAR */}
      <div className="mb-6 grid grid-cols-8 gap-1 bg-[#09090f]/55 border border-white/5 p-1 rounded-lg">
        {Array.from({ length: 8 }).map((_, idx) => (
          <div 
            key={idx} 
            className={`py-1 text-center font-mono text-[10px] font-semibold transition-all duration-200 rounded ${
              idx === currentStep && isPlaying
                ? "bg-amber-500 text-black font-extrabold shadow-sm"
                : "text-white/35 bg-black/30"
            }`}
          >
            {idx === currentStep && isPlaying ? "⚡ RUN" : `0${idx + 1}`}
          </div>
        ))}
      </div>

      <main className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 overflow-hidden">
        
        {/* LEFT COLUMN: CO-PRODUCER ENGINE AND PERSISTENCE PANEL */}
        <section className="lg:col-span-4 flex flex-col gap-6 overflow-y-auto pr-1">
          
          {/* SECURE CLOUD SYNCHRONIZER */}
          <div className="bg-[#0b0b12] border border-white/5 rounded-xl p-4 shadow-xl relative overflow-hidden">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-extrabold uppercase tracking-widest text-slate-300 flex items-center gap-2">
                <Radio className="w-3.5 h-3.5 text-amber-500 animate-pulse" />
                Cloud Operations Sync
              </h2>
              {syncMessage && (
                <span className="text-[10px] bg-amber-500/10 text-amber-500 border border-amber-500/20 px-2 py-0.5 rounded font-mono font-bold">
                  {syncMessage}
                </span>
              )}
            </div>

            {authLoading ? (
              <div className="flex py-4 items-center gap-2.5">
                <RefreshCw className="w-4 h-4 text-amber-500 animate-spin" />
                <span className="text-xs text-white/50">Synchronizing database token...</span>
              </div>
            ) : !user ? (
              <div className="py-2">
                <p className="text-xs text-slate-400 mb-3.5 leading-relaxed">
                  Connect your Google account safely to write arrangements, layouts, and sound faders directly into the cloud.
                </p>
                <button
                  onClick={handleGoogleSignIn}
                  className="w-full py-2 px-3 bg-[#112] hover:bg-[#181829] border border-white/10 text-white hover:text-amber-400 font-bold rounded-lg text-xs tracking-wider transition-all duration-350 flex items-center justify-center gap-2 cursor-pointer"
                >
                  <UserCheck className="w-3.5 h-3.5 text-amber-500" /> Confirm Google Console Auths
                </button>
              </div>
            ) : (
              <div className="space-y-3.5">
                <div className="flex items-center justify-between p-2.5 bg-black/45 border border-white/5 rounded-lg">
                  <div className="flex items-center gap-3">
                    {user.photoURL ? (
                      <img src={user.photoURL} alt="User Authed" className="w-8 h-8 rounded-full border border-white/10" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="w-8 h-8 bg-amber-500 rounded-full flex items-center justify-center text-xs font-black text-black">
                        NS
                      </div>
                    )}
                    <div className="flex flex-col">
                      <span className="text-xs font-bold text-white leading-tight">{user.displayName || user.email}</span>
                      <span className="text-[10px] text-white/40">{cloudStatus}</span>
                    </div>
                  </div>
                  <button
                    onClick={handleSignOut}
                    className="p-1 px-2 border border-red-500/25 bg-red-500/5 text-red-400 rounded hover:bg-red-500/20 hover:text-white text-[10px] font-bold uppercase tracking-wider transition cursor-pointer"
                  >
                    Logout
                  </button>
                </div>

                {/* Cloud Saving action triggers */}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={saveSessionToCloud}
                    className="py-2 bg-amber-500 text-black hover:brightness-110 font-bold rounded-lg text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Save className="w-3.5 h-3.5" /> Save Session
                  </button>
                  <button
                    onClick={() => fetchSessions(user.uid)}
                    className="py-2 bg-black hover:bg-white/5 border border-white/10 text-slate-300 font-bold rounded-lg text-xs uppercase tracking-wider flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <RefreshCw className="w-3 h-3 text-slate-400" /> Reload List
                  </button>
                </div>

                {/* List saved sessions if any */}
                {savedSessions.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-white/5">
                    <span className="text-[10px] font-mono tracking-widest text-white/40 uppercase block mb-1.5">Saved Projects:</span>
                    <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                      {savedSessions.map((session, sidx) => (
                        <div 
                          key={sidx}
                          onClick={() => loadSavedSession(session)}
                          className="p-1.5 bg-black/45 hover:bg-amber-500/10 border border-white/5 hover:border-amber-500/20 rounded text-xs text-slate-300 hover:text-white cursor-pointer flex justify-between items-center transition"
                        >
                          <span className="font-bold">{session.name}</span>
                          <span className="text-[10px] font-mono text-white/40">{session.activeKey} Key • {session.bpm} BPM</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* AI SESSION CO-PRODUCER ENGINE */}
          <div className="bg-[#0b0b12] border border-white/5 rounded-xl p-4 shadow-xl flex flex-col relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-amber-500/2 to-transparent rounded-full blur-2xlPointer pointer-events-none"></div>

            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="w-4 h-4 text-amber-500" />
              <h2 className="text-xs font-extrabold uppercase tracking-widest text-slate-300">
                AI Co-Producer directives
              </h2>
            </div>

            <p className="text-xs text-white/40 leading-relaxed mb-4">
              Connect to our artificial multi-instrumental session desk to design master advice, chord adjustments, and mix directions.
            </p>

            {/* Quick Presets Selection */}
            <div className="mb-4">
              <span className="text-[10px] font-mono tracking-widest text-white/30 uppercase block mb-1.5">Quick Presets:</span>
              <div className="flex flex-wrap gap-1.5">
                {["Warm Acoustic ballad", "High Octane Outlaw", "Southern Folk Rock", "Honky Tonk Swing"].map((preset, pIdx) => (
                  <button
                    key={pIdx}
                    onClick={() => {
                      setAiPrompt(`Provide optimal studio arrangement and mixing setup for a ${preset}. Add lyric block.`);
                      handleAiCoproduce(preset);
                    }}
                    className="px-2 py-1 bg-black hover:bg-amber-500/10 hover:text-amber-400 border border-white/5 rounded text-[10px] font-semibold text-slate-400 transition cursor-pointer"
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <textarea
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                placeholder="Ask specific guidelines (e.g. 'fiddler mic setup for raw warm midranges')"
                className="w-full h-16 text-xs bg-black/60 border border-white/10 rounded-lg p-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-amber-500/50 transition-all resize-none"
              />

              <button
                onClick={() => handleAiCoproduce()}
                disabled={aiLoading}
                className="w-full py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 font-bold text-black rounded-lg text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition hover:brightness-110 disabled:opacity-50 cursor-pointer"
              >
                {aiLoading ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Analyzing Studio Deck...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    Compile Producer Directives
                  </>
                )}
              </button>
            </div>

            {/* Markdown rendered AI response pane */}
            {aiResponse && (
              <div className="mt-4 pt-4 border-t border-white/5 flex-1 flex flex-col min-h-[190px] max-h-[350px]">
                <div className="flex items-center justify-between mb-2 shrink-0">
                  <span className="text-[11px] font-bold text-white/55 flex items-center gap-1.5">
                    <BookOpen className="w-3.5 h-3.5 text-amber-500" /> Resulting Slate
                  </span>
                  <button 
                    onClick={handleCopyText}
                    className="p-1.5 bg-black hover:bg-white/5 border border-white/10 text-white/50 hover:text-white rounded transition flex items-center gap-1 text-[10px] cursor-pointer"
                  >
                    {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    {copied ? "Copied" : "Copy"}
                  </button>
                </div>
                <div className="flex-1 bg-black/45 border border-white/5 p-3 rounded-lg overflow-y-auto text-xs text-slate-300 leading-relaxed font-sans space-y-3 select-text select-all">
                  <div className="prose prose-invert prose-xs max-w-none text-left select-text whitespace-pre-wrap">
                    {aiResponse}
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* MIDDLE/RIGHT DECK: MULTI-TRACK SEQUENCER & ACTIVE AUDIO MIXER */}
        <section className="lg:col-span-8 flex flex-col gap-6 overflow-hidden">
          
          {/* NASHVILLE NUMBER SYSTEM PROGRESSION BUILDER */}
          <div className="bg-[#0b0b12] border border-white/5 rounded-xl p-4 shadow-xl">
            <div className="flex items-center justify-between mb-3.5">
              <div className="flex items-center gap-2">
                <Music className="w-4 h-4 text-amber-500" />
                <h2 className="text-xs font-extrabold uppercase tracking-widest text-slate-300">
                  Nashville Number System Progression
                </h2>
              </div>
              <div className="flex items-center gap-2 bg-black border border-white/5 p-0.5 rounded-lg">
                {CHORD_KEYS.map((key) => (
                  <button
                    key={key}
                    onClick={() => setActiveKey(key)}
                    className={`p-1 px-2.5 rounded text-xs font-black transition cursor-pointer ${
                      activeKey === key 
                        ? "bg-amber-500 text-black shadow-sm" 
                        : "text-slate-400 hover:text-white hover:bg-white/5"
                    }`}
                  >
                    {key}
                  </button>
                ))}
              </div>
            </div>

            <p className="text-xs text-white/40 mb-4 leading-relaxed">
              Select or design chords in the Key of <span className="text-amber-400 font-bold">{activeKey}</span>. They translate dynamically into the standardized Nashville Numbers for instant sessions.
            </p>

            {/* THE FOUR STEPS CHORD PROGRESSION DISKS */}
            <div className="grid grid-cols-4 gap-3.5 mb-2">
              {progression.map((degreeIndex, cardIdx) => (
                <div 
                  key={cardIdx}
                  className="bg-black/45 border border-white/5 hover:border-amber-500/30 p-2.5 rounded-xl flex flex-col items-center relative transition-all group"
                >
                  <div className="absolute top-1.5 right-1.5 text-[8px] font-mono text-white/20 font-black">
                    NNS #{cardIdx + 1}
                  </div>
                  
                  {/* Styled block with NNS Numbers */}
                  <div className="w-10 h-10 bg-[#111] rounded-full flex items-center justify-center border border-white/10 group-hover:border-amber-500/40 text-amber-400 text-base font-black tracking-tighter mb-1.5 transition-all">
                    {/* Maps Index of NNS degrees to localized display strings */}
                    {["①", "②m", "③m", "④", "⑤", "⑥m", "⑦dim"][degreeIndex]}
                  </div>

                  {/* Dynamic Chord Translation Name */}
                  <span className="text-xs font-extrabold text-white">
                    {CHORD_MAP[activeKey]?.[degreeIndex] || "N/A"}
                  </span>
                  
                  {/* Selector dropdown for the Chord Degree */}
                  <select
                    value={degreeIndex}
                    onChange={(e) => {
                      const updated = [...progression];
                      updated[cardIdx] = Number(e.target.value);
                      setProgression(updated);
                    }}
                    className="w-full mt-2 bg-black text-[10px] text-white/60 font-semibold p-1 hover:text-white border border-white/5 rounded focus:outline-none"
                  >
                    {CHORD_DEGREE_NAMES.map((name, nameIdx) => (
                      <option key={nameIdx} value={nameIdx}>
                        {name} ({CHORD_MAP[activeKey]?.[nameIdx]})
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>

          {/* ACTIVE MULTI-TRACK STEP SEQUENCER DECK */}
          <div className="bg-[#0b0b12] border border-white/5 rounded-xl p-4 shadow-xl flex-1 flex flex-col">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-white/5">
              <h3 className="text-xs font-extrabold uppercase tracking-widest text-[#94a3b8] flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-amber-500" /> Multi-Track Sequencer
              </h3>

              <div className="flex gap-1.5">
                <button
                  onClick={() => {
                    // Reset grid
                    setTracks(prev => prev.map(t => ({
                      ...t,
                      steps: Array.from({ length: 8 }, () => false)
                    })));
                  }}
                  className="px-2 py-1 bg-black border border-white/10 hover:bg-white/5 hover:text-white rounded text-[10px] font-bold uppercase tracking-wider transition cursor-pointer"
                >
                  Clear Pattern
                </button>
                <button
                  onClick={() => {
                    // Seed pattern
                    setTracks(prev => prev.map(t => {
                      const steps = Array.from({ length: 8 }, () => Math.random() > 0.45);
                      return { ...t, steps };
                    }));
                  }}
                  className="px-2 py-1 bg-black border border-white/10 hover:bg-white/5 hover:text-white rounded text-[10px] font-bold uppercase tracking-wider transition cursor-pointer"
                >
                  Randomize Pattern
                </button>
              </div>
            </div>

            {/* Track entries */}
            <div className="flex-1 space-y-4 overflow-y-auto max-h-[300px]">
              {tracks.map((track) => {
                const soloAllowed = isAnySoloActive && !track.isSoloed;
                const activeVolume = track.isMuted || soloAllowed ? 0 : track.volume;
                
                return (
                  <div key={track.id} className="grid grid-cols-1 md:grid-cols-12 items-center gap-3 p-3 bg-black/40 border border-white/5 hover:border-white/10 rounded-xl transition">
                    
                    {/* Track Header & Active signal indicators */}
                    <div className="md:col-span-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-extrabold text-white">{track.name}</span>
                        {isPlaying && track.steps[currentStep] && !track.isMuted && !soloAllowed && (
                          <span className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-ping"></span>
                        )}
                      </div>
                      
                      {/* Active level bar indicators */}
                      <div className="w-full bg-white/5 h-1 rounded-full overflow-hidden relative">
                        <div 
                          className="bg-amber-400 h-full transition-all duration-75"
                          style={{ width: `${isPlaying && track.steps[currentStep] && !track.isMuted && !soloAllowed ? "100%" : "0%"}` }}
                        ></div>
                      </div>
                    </div>

                    {/* Sequencer Buttons Grid - 8 Steps */}
                    <div className="md:col-span-6 grid grid-cols-8 gap-1.5">
                      {track.steps.map((isActive, sidx) => (
                        <button
                          key={sidx}
                          onClick={() => toggleStep(track.id, sidx)}
                          className={`cursor-pointer aspect-square rounded-md p-1 font-mono text-[9px] font-bold flex items-center justify-center transition-all duration-150 border ${
                            isActive
                              ? "bg-amber-500 hover:bg-amber-400 text-black border-amber-600 font-extrabold shadow-sm"
                              : sidx === currentStep && isPlaying
                                ? "bg-white/10 border-white/20 text-white"
                                : "bg-black/60 border-white/5 hover:border-white/20 text-slate-500"
                          }`}
                        >
                          {sidx + 1}
                        </button>
                      ))}
                    </div>

                    {/* Track Mix Controllers (Mute/Solo) */}
                    <div className="md:col-span-3 flex items-center justify-end gap-2 text-right">
                      <button
                        onClick={() => updateTrackParam(track.id, "isSoloed", !track.isSoloed)}
                        className={`p-1 px-2.5 rounded text-[10px] font-black uppercase tracking-wider transition cursor-pointer border ${
                          track.isSoloed
                            ? "bg-yellow-500 text-black border-yellow-600 shadow-[0_0_8px_rgba(234,179,8,0.2)]"
                            : "bg-black text-[#f1f5f9] border-white/10 hover:bg-white/5"
                        }`}
                      >
                        Solo
                      </button>

                      <button
                        onClick={() => updateTrackParam(track.id, "isMuted", !track.isMuted)}
                        className={`p-1 px-2.5 rounded text-[10px] font-black uppercase tracking-wider transition cursor-pointer border ${
                          track.isMuted
                            ? "bg-red-500/20 text-red-500 border-red-500/40"
                            : "bg-black text-[#f1f5f9] border-white/10 hover:bg-white/5"
                        }`}
                      >
                        Mute
                      </button>
                    </div>

                  </div>
                );
              })}
            </div>
          </div>

          {/* DETAILED ACTIVE ANALOG MIXING CONSOLE BOARD */}
          <div className="bg-[#0b0b12] border border-white/5 rounded-xl p-4 shadow-xl">
            <h3 className="text-xs font-extrabold uppercase tracking-widest text-[#94a3b8] mb-4 flex items-center gap-1.5 pb-2 border-b border-white/5">
              <Activity className="w-3.5 h-3.5 text-amber-500" /> Studio Console Board
            </h3>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {tracks.map((track) => {
                const lvl = channelLevels[track.id] || 0;
                return (
                  <div key={track.id} className="bg-black/45 border border-white/5 p-3 rounded-lg flex flex-col items-center">
                    <span className="text-[10px] font-bold text-white/60 mb-2 truncate block w-full text-center">{track.name}</span>
                    
                    {/* Slider Input */}
                    <div className="flex items-center gap-2 w-full mt-1 shrink-0 justify-center">
                      <VolumeX className="w-3 h-3 text-white/30" />
                      <input 
                        type="range"
                        min="0"
                        max="100"
                        value={track.volume}
                        onChange={(e) => updateTrackParam(track.id, "volume", Number(e.target.value))}
                        className="flex-1 accent-amber-500 cursor-pointer h-1 rounded"
                      />
                      <Volume2 className="w-3.5 h-3.5 text-white/40" />
                    </div>

                    {/* Numeric volume display */}
                    <div className="flex justify-between w-full mt-2 shrink-0 px-1 text-[9px] font-mono">
                      <span className="text-white/40">Fader</span>
                      <span className="font-bold text-amber-400">{track.volume}%</span>
                    </div>

                    {/* Stereo Panning selector */}
                    <div className="w-full mt-2 pt-2 border-t border-white/5">
                      <div className="flex justify-between text-[9px] font-mono text-white/30 mb-1">
                        <span>L</span>
                        <span>Pan ({track.panning > 0 ? `R +${track.panning.toFixed(1)}` : track.panning < 0 ? `L ${track.panning.toFixed(1)}` : "C"})</span>
                        <span>R</span>
                      </div>
                      <input 
                        type="range"
                        min="-1"
                        max="1"
                        step="0.1"
                        value={track.panning}
                        onChange={(e) => updateTrackParam(track.id, "panning", Number(e.target.value))}
                        className="w-full accent-slate-400 cursor-pointer h-0.5 rounded"
                      />
                    </div>

                    {/* Interactive VU Level indicator */}
                    <div className="w-full mt-3 h-2 bg-black border border-white/10 rounded-full overflow-hidden relative">
                      <div 
                        className="h-full bg-gradient-to-r from-emerald-500 to-amber-400 transition-all duration-75"
                        style={{ width: `${lvl}%` }}
                      ></div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      </main>

    </div>
  );
}
