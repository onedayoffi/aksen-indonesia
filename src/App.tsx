/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  Mic, 
  Play, 
  Download, 
  History, 
  Settings, 
  Volume2, 
  Trash2, 
  Info, 
  CheckCircle2, 
  AlertCircle,
  Loader2,
  ChevronRight,
  Music,
  Wind,
  Coffee,
  Smartphone,
  Mic2,
  Edit2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI, Modality } from "@google/genai";
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Utility for tailwind classes
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Types ---

declare global {
  interface Window {
    aistudio: {
      hasSelectedApiKey: () => Promise<boolean>;
      openSelectKey: () => Promise<void>;
    };
  }
}

interface VoiceOption {
  id: string;
  name: string;
  description: string;
  apiName: string; // The actual name used in prebuiltVoiceConfig
}

interface StyleOption {
  id: string;
  name: string;
  prompt: string;
}

interface EnvironmentOption {
  id: string;
  name: string;
  icon: React.ReactNode;
  prompt: string;
}

interface HistoryItem {
  id: string;
  text: string;
  voice: string;
  style: string;
  environment: string;
  audioUrl: string;
  timestamp: number;
  fileName: string;
}

// --- Constants ---

const VOICES: VoiceOption[] = [
  { id: 'charon', name: 'Charon', description: 'Deep, authoritative, and calm.', apiName: 'Charon' },
  { id: 'fenrir', name: 'Fenrir', description: 'Strong, rugged, and expressive.', apiName: 'Fenrir' },
  { id: 'zephyr', name: 'Zephyr', description: 'Light, airy, and friendly.', apiName: 'Zephyr' },
  { id: 'puck', name: 'Puck', description: 'Playful, energetic, and youthful.', apiName: 'Puck' },
  { id: 'kore', name: 'Kore', description: 'Soft, nurturing, and clear.', apiName: 'Kore' },
  { id: 'orus', name: 'Orus', description: 'Wise and ancient (Experimental).', apiName: 'Charon' },
  { id: 'enceladus', name: 'Enceladus', description: 'Cool and precise (Experimental).', apiName: 'Fenrir' },
  { id: 'lapetus', name: 'Lapetus', description: 'Steady and reliable (Experimental).', apiName: 'Zephyr' },
  { id: 'leda', name: 'Leda', description: 'Elegant and sophisticated (Experimental).', apiName: 'Kore' },
  { id: 'aode', name: 'Aode', description: 'Musical and rhythmic (Experimental).', apiName: 'Puck' },
  { id: 'callirrhoe', name: 'Callirrhoe', description: 'Gentle and flowing (Experimental).', apiName: 'Zephyr' },
  { id: 'despina', name: 'Despina', description: 'Quick and sharp (Experimental).', apiName: 'Puck' },
  { id: 'algieba', name: 'Algieba', description: 'Bright and stellar (Experimental).', apiName: 'Zephyr' },
];

const STYLES: StyleOption[] = [
  { id: 'natural', name: 'Natural', prompt: 'Speak in a natural, conversational tone.' },
  { id: 'content', name: 'Baca Naskah Konten', prompt: 'Speak like a content creator or YouTuber, engaging and clear.' },
  { id: 'news', name: 'Baca Berita', prompt: 'Speak in a formal, professional news anchor style.' },
  { id: 'asmr', name: 'ASMR', prompt: 'Speak in a very soft, whispering, intimate ASMR style.' },
  { id: 'drama', name: 'Drama', prompt: 'Speak with high emotional intensity and dramatic flair.' },
  { id: 'standup', name: 'Stand Up', prompt: 'Speak with the timing and energy of a stand-up comedian.' },
  { id: 'public', name: 'Public Speaking', prompt: 'Speak with authority and projection, like a keynote speaker.' },
  { id: 'chat', name: 'Ngobrol', prompt: 'Speak casually, with informal pauses and a relaxed vibe.' },
];

const ENVIRONMENTS: EnvironmentOption[] = [
  { id: 'home', name: 'Ruangan Rumah', icon: <Music className="w-4 h-4" />, prompt: 'Simulate the acoustics of a normal living room with slight natural reverb.' },
  { id: 'studio', name: 'Studio Rekaman', icon: <Mic2 className="w-4 h-4" />, prompt: 'Crystal clear studio recording with no background noise or reverb.' },
  { id: 'cafe', name: 'Kafe Restoran', icon: <Coffee className="w-4 h-4" />, prompt: 'Include subtle background sounds of a busy cafe, clinking cups, and distant chatter.' },
  { id: 'outdoor', name: 'Jalan Raya Outdoor', icon: <Wind className="w-4 h-4" />, prompt: 'Simulate an outdoor environment with distant traffic noise and wind.' },
  { id: 'phone', name: 'Telepon / Call', icon: <Smartphone className="w-4 h-4" />, prompt: 'Apply a telephonic filter, making the voice sound like it is coming through a phone call.' },
];

const TUTORIALS = [
  { 
    label: 'Semangat & Teriak', 
    text: '(nada semangat sambil teriak) AKU SUDAH BILANG KAMU GAK USAH IKUT..',
    description: 'Gunakan tanda kurung untuk memberikan instruksi emosi.'
  },
  { 
    label: 'Sedih & Terbata', 
    text: '(nada sedih suara terbata bata) Besok aku mau Pulang ke rumah ibu, kalo kamu masih kayak gini',
    description: 'Instruksi detail membantu model memahami jeda dan intonasi.'
  },
  { 
    label: 'Tertawa & Batuk', 
    text: '(sambil tertawa lepas lalu batuk) Hahahaha.. lihat, giginya nyampe copot, kok bisa yah gigi ompong makan daging',
    description: 'Efek suara non-verbal bisa disimulasikan melalui deskripsi.'
  }
];

// --- IndexedDB Helper ---
const DB_NAME = 'vocalist_db';
const STORE_NAME = 'audio_blobs';

const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

const saveBlob = async (id: string, blob: Blob) => {
  const db = await openDB();
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(blob, id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

const getBlob = async (id: string): Promise<Blob | null> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(id);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
};

const deleteBlob = async (id: string) => {
  const db = await openDB();
  const transaction = db.transaction(STORE_NAME, 'readwrite');
  transaction.objectStore(STORE_NAME).delete(id);
};

// --- Audio Helper ---
function pcmToWav(pcmBase64: string, sampleRate: number = 24000): Blob {
  const binaryString = atob(pcmBase64);
  const pcmData = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    pcmData[i] = binaryString.charCodeAt(i);
  }

  // Check if it's already a WAV file (starts with "RIFF")
  if (pcmData[0] === 0x52 && pcmData[1] === 0x49 && pcmData[2] === 0x46 && pcmData[3] === 0x46) {
    return new Blob([pcmData], { type: 'audio/wav' });
  }

  const buffer = new ArrayBuffer(44 + pcmData.length);
  const view = new DataView(buffer);

  // RIFF identifier
  view.setUint32(0, 0x52494646, false);
  // file length
  view.setUint32(4, 36 + pcmData.length, true);
  // RIFF type
  view.setUint32(8, 0x57415645, false);
  // format chunk identifier
  view.setUint32(12, 0x666d7420, false);
  // format chunk length
  view.setUint32(16, 16, true);
  // sample format (raw)
  view.setUint16(20, 1, true);
  // channel count
  view.setUint16(22, 1, true);
  // sample rate
  view.setUint32(24, sampleRate, true);
  // byte rate (sample rate * block align)
  view.setUint32(28, sampleRate * 2, true);
  // block align (channel count * bytes per sample)
  view.setUint16(32, 2, true);
  // bits per sample
  view.setUint16(34, 16, true);
  // data chunk identifier
  view.setUint32(36, 0x64617461, false);
  // data chunk length
  view.setUint32(40, pcmData.length, true);

  // write PCM data
  for (let i = 0; i < pcmData.length; i++) {
    view.setUint8(44 + i, pcmData[i]);
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

// --- Main Component ---

export default function App() {
  const [text, setText] = useState('');
  const [selectedVoice, setSelectedVoice] = useState(VOICES[0]);
  const [selectedStyle, setSelectedStyle] = useState(STYLES[0]);
  const [selectedEnv, setSelectedEnv] = useState(ENVIRONMENTS[1]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [activeTab, setActiveTab] = useState<'create' | 'history'>('create');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [hasApiKey, setHasApiKey] = useState<boolean>(true);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Check for API Key on mount
  useEffect(() => {
    const checkKey = async () => {
      if (window.aistudio?.hasSelectedApiKey) {
        const selected = await window.aistudio.hasSelectedApiKey();
        setHasApiKey(selected);
      }
    };
    checkKey();
  }, []);

  const handleOpenKeySelector = async () => {
    if (window.aistudio?.openSelectKey) {
      await window.aistudio.openSelectKey();
      setHasApiKey(true);
    }
  };

  // Load history from localStorage and restore blobs
  useEffect(() => {
    const loadHistory = async () => {
      const savedHistory = localStorage.getItem('vocalist_history');
      if (savedHistory) {
        try {
          const parsedHistory: HistoryItem[] = JSON.parse(savedHistory);
          // Restore audio URLs from IndexedDB
          const restoredHistory = await Promise.all(parsedHistory.map(async (item) => {
            const blob = await getBlob(item.id);
            if (blob) {
              return { ...item, audioUrl: URL.createObjectURL(blob) };
            }
            return item;
          }));
          setHistory(restoredHistory);
        } catch (e) {
          console.error("Failed to parse history", e);
        }
      }
    };
    loadHistory();
  }, []);

  // Save history metadata to localStorage
  useEffect(() => {
    // We don't save the audioUrl to localStorage as it's temporary
    const metadata = history.map(({ audioUrl, ...rest }) => rest);
    localStorage.setItem('vocalist_history', JSON.stringify(metadata));
  }, [history]);

  const generateTTS = async () => {
    if (!text.trim()) {
      setError("Silakan masukkan teks terlebih dahulu.");
      return;
    }

    setIsGenerating(true);
    setError(null);

    const maxRetries = 3;
    let attempt = 0;

    const executeGeneration = async () => {
      try {
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        
        const isExperimental = selectedVoice.description.includes('Experimental');
        const voiceCharacterPrompt = isExperimental 
          ? `[Persona: ${selectedVoice.name}] ` 
          : '';

        // Simplify prompt to be more like the documentation examples
        const fullPrompt = `${voiceCharacterPrompt}[Style: ${selectedStyle.name}] [Environment: ${selectedEnv.name}] ${text}`.trim();

        const response = await ai.models.generateContent({
          model: "gemini-2.5-flash-preview-tts",
          contents: [{ parts: [{ text: fullPrompt }] }],
          config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: selectedVoice.apiName as any },
              },
            },
          },
        });

        const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        
        if (base64Audio) {
          const audioBlob = pcmToWav(base64Audio);
          const id = crypto.randomUUID();
          await saveBlob(id, audioBlob);
          const audioUrl = URL.createObjectURL(audioBlob);
          
          const newItem: HistoryItem = {
            id,
            text: text.substring(0, 100),
            voice: selectedVoice.name,
            style: selectedStyle.name,
            environment: selectedEnv.name,
            audioUrl,
            timestamp: Date.now(),
            fileName: `vocalist_${Date.now()}.wav`
          };

          setHistory(prev => [newItem, ...prev]);
          setText('');
          
          // Play immediately
          if (audioRef.current) {
            audioRef.current.src = audioUrl;
            audioRef.current.play();
          }
        } else {
          throw new Error("Gagal menghasilkan audio. Silakan coba lagi.");
        }
      } catch (err: any) {
        console.error(`Attempt ${attempt + 1} failed:`, err);
        
        const isInternalError = err.message?.includes('500') || err.message?.includes('INTERNAL');
        
        if (isInternalError && attempt < maxRetries - 1) {
          attempt++;
          const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
          await new Promise(resolve => setTimeout(resolve, delay));
          return executeGeneration();
        }

        if (err.message?.includes('quota') || err.message?.includes('429')) {
          setError("Token atau kuota habis. Jika Anda memiliki akun berbayar, silakan hubungkan API Key Anda.");
        } else if (err.message?.includes('Requested entity was not found')) {
          setError("API Key tidak valid atau tidak ditemukan. Silakan pilih ulang.");
          setHasApiKey(false);
        } else {
          setError(err.message || "Terjadi kesalahan internal pada server AI. Silakan coba lagi dalam beberapa saat.");
        }
      }
    };

    await executeGeneration();
    setIsGenerating(false);
  };

  const deleteHistoryItem = (id: string) => {
    setHistory(prev => prev.filter(item => item.id !== id));
    deleteBlob(id);
  };

  const startEditing = (item: HistoryItem) => {
    setEditingId(item.id);
    setEditName(item.fileName);
  };

  const saveFileName = (id: string) => {
    setHistory(prev => prev.map(item => 
      item.id === id ? { ...item, fileName: editName.endsWith('.wav') ? editName : `${editName}.wav` } : item
    ));
    setEditingId(null);
  };

  const downloadAudio = (item: HistoryItem) => {
    const link = document.createElement('a');
    link.href = item.audioUrl;
    link.download = item.fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-zinc-100 font-sans selection:bg-emerald-500/30">
      <audio ref={audioRef} hidden />
      
      {/* Header */}
      <header className="sticky top-0 z-50 bg-[#0a0a0a]/80 backdrop-blur-md border-b border-white/5">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <Volume2 className="text-black w-5 h-5" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tighter text-white uppercase italic">
              PERFECT <span className="text-gradient">VOICE</span>
            </h1>
          </div>
          
          <div className="hidden sm:flex items-center gap-4 text-[10px] font-bold uppercase tracking-widest text-zinc-500">
            {!hasApiKey ? (
              <button 
                onClick={handleOpenKeySelector}
                className="flex items-center gap-2 bg-emerald-500 text-black px-3 py-1.5 rounded-lg hover:bg-emerald-400 transition-colors"
              >
                <Smartphone className="w-3 h-3" />
                Connect Paid Account
              </button>
            ) : (
              <span className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                Gemini 2.5 Active
              </span>
            )}
            <a 
              href="https://ai.google.dev/gemini-api/docs/billing" 
              target="_blank" 
              rel="noopener noreferrer"
              className="hover:text-zinc-300 transition-colors"
            >
              Billing Info
            </a>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 sm:py-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12">
          
          {/* Left Column: Main Editor */}
          <div className="lg:col-span-7 space-y-6 sm:space-y-8">
            <AnimatePresence mode="wait">
              {activeTab === 'create' ? (
                <motion.div 
                  key="create-view"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  className="space-y-6 sm:space-y-8"
                >
                  {!hasApiKey && (
                    <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <AlertCircle className="text-emerald-500 w-5 h-5" />
                        <p className="text-xs text-zinc-300">
                          Anda mencapai batas kuota gratis? Hubungkan <strong>API Key Berbayar</strong> Anda untuk penggunaan tanpa batas.
                        </p>
                      </div>
                      <button 
                        onClick={handleOpenKeySelector}
                        className="whitespace-nowrap bg-emerald-500 text-black px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-emerald-400 transition-all"
                      >
                        Hubungkan Akun
                      </button>
                    </div>
                  )}

                  {/* Text Input Area */}
                  <section className="space-y-4">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-zinc-500 uppercase tracking-[0.2em] flex items-center gap-2">
                        <Edit2 className="w-3 h-3" />
                        Naskah Suara
                      </label>
                      <span className="text-[10px] font-mono text-zinc-600 bg-zinc-900 px-2 py-0.5 rounded border border-white/5">
                        {text.length} chars
                      </span>
                    </div>
                    <div className="relative group">
                      <textarea
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        placeholder="Tuliskan apa yang ingin Anda ubah menjadi suara di sini..."
                        className="w-full h-48 sm:h-64 bg-zinc-900/40 border border-white/5 rounded-3xl p-6 sm:p-8 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500/40 transition-all resize-none placeholder:text-zinc-700 text-lg leading-relaxed"
                      />
                      <div className="absolute bottom-6 right-6 flex gap-2">
                        <button 
                          onClick={() => setText('')}
                          className="p-3 bg-black/40 backdrop-blur-sm text-zinc-500 hover:text-red-400 rounded-full border border-white/5 transition-all hover:scale-110"
                          title="Hapus semua"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </section>

                  {/* Dropdowns Section */}
                  <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {/* Voice Dropdown */}
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-1.5 ml-1">
                        <Mic className="w-3 h-3" /> Model Suara
                      </label>
                      <select 
                        value={selectedVoice.id}
                        onChange={(e) => setSelectedVoice(VOICES.find(v => v.id === e.target.value) || VOICES[0])}
                        className="w-full bg-zinc-900/60 border border-white/5 rounded-xl px-4 py-3 text-sm text-zinc-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 appearance-none cursor-pointer hover:bg-zinc-800/60 transition-colors"
                      >
                        {VOICES.map(v => (
                          <option key={v.id} value={v.id} className="bg-zinc-900">{v.name} {v.description.includes('Experimental') ? '(Exp)' : ''}</option>
                        ))}
                      </select>
                    </div>

                    {/* Style Dropdown */}
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-1.5 ml-1">
                        <Settings className="w-3 h-3" /> Gaya Bicara
                      </label>
                      <select 
                        value={selectedStyle.id}
                        onChange={(e) => setSelectedStyle(STYLES.find(s => s.id === e.target.value) || STYLES[0])}
                        className="w-full bg-zinc-900/60 border border-white/5 rounded-xl px-4 py-3 text-sm text-zinc-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 appearance-none cursor-pointer hover:bg-zinc-800/60 transition-colors"
                      >
                        {STYLES.map(s => (
                          <option key={s.id} value={s.id} className="bg-zinc-900">{s.name}</option>
                        ))}
                      </select>
                    </div>

                    {/* Environment Dropdown */}
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-1.5 ml-1">
                        <Music className="w-3 h-3" /> Lingkungan
                      </label>
                      <select 
                        value={selectedEnv.id}
                        onChange={(e) => setSelectedEnv(ENVIRONMENTS.find(env => env.id === e.target.value) || ENVIRONMENTS[0])}
                        className="w-full bg-zinc-900/60 border border-white/5 rounded-xl px-4 py-3 text-sm text-zinc-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 appearance-none cursor-pointer hover:bg-zinc-800/60 transition-colors"
                      >
                        {ENVIRONMENTS.map(env => (
                          <option key={env.id} value={env.id} className="bg-zinc-900">{env.name}</option>
                        ))}
                      </select>
                    </div>
                  </section>

                  {/* Generate Button */}
                  <div className="pt-2">
                    <button
                      onClick={generateTTS}
                      disabled={isGenerating || !text.trim()}
                      className={cn(
                        "w-full py-6 rounded-3xl font-black text-xl uppercase tracking-tighter flex items-center justify-center gap-4 transition-all shadow-2xl",
                        isGenerating || !text.trim()
                          ? "bg-zinc-900 text-zinc-700 cursor-not-allowed border border-white/5"
                          : "bg-emerald-500 text-black hover:bg-emerald-400 active:scale-[0.98] shadow-emerald-500/20"
                      )}
                    >
                      {isGenerating ? (
                        <>
                          <Loader2 className="w-6 h-6 animate-spin" />
                          Processing...
                        </>
                      ) : (
                        <>
                          <Play className="w-6 h-6 fill-current" />
                          Generate Voice
                        </>
                      )}
                    </button>
                    
                    {error && (
                      <motion.div 
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="mt-4 p-5 bg-red-500/5 border border-red-500/20 rounded-2xl flex items-center gap-4 text-red-400 text-sm"
                      >
                        <AlertCircle className="w-6 h-6 shrink-0" />
                        <div className="flex-1">
                          <p className="font-bold uppercase text-[10px] tracking-widest mb-1">Error Detected</p>
                          <p className="opacity-80">{error}</p>
                        </div>
                      </motion.div>
                    )}
                  </div>
                </motion.div>
              ) : (
                <motion.div 
                  key="history-view"
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  className="space-y-6"
                >
                  <div className="flex items-center justify-between">
                    <h2 className="text-xl font-black uppercase tracking-tighter flex items-center gap-3">
                      <History className="text-emerald-500" />
                      Riwayat <span className="text-zinc-500">VO</span>
                    </h2>
                    <button 
                      onClick={() => confirm("Hapus semua riwayat?") && setHistory([])}
                      className="text-[10px] font-bold uppercase tracking-widest text-zinc-600 hover:text-red-400 transition-colors flex items-center gap-2"
                    >
                      <Trash2 className="w-3 h-3" /> Clear All
                    </button>
                  </div>

                  {history.length === 0 ? (
                    <div className="py-32 flex flex-col items-center justify-center text-zinc-700 space-y-6 bg-zinc-900/20 rounded-3xl border border-dashed border-white/5">
                      <div className="w-20 h-20 bg-zinc-900 rounded-full flex items-center justify-center border border-white/5">
                        <History className="w-10 h-10 opacity-10" />
                      </div>
                      <div className="text-center">
                        <p className="font-bold uppercase tracking-widest text-xs mb-1">Empty History</p>
                        <p className="text-[10px] opacity-50">Belum ada rekaman yang dibuat.</p>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-4">
                      {history.map((item) => (
                        <div 
                          key={item.id}
                          className="bg-zinc-900/30 border border-white/5 rounded-2xl p-5 sm:p-6 space-y-4 hover:border-white/10 transition-all group"
                        >
                          <div className="flex items-start justify-between">
                            <div className="space-y-1 flex-1 mr-4">
                              {editingId === item.id ? (
                                <div className="flex items-center gap-2">
                                  <input 
                                    type="text"
                                    value={editName}
                                    onChange={(e) => setEditName(e.target.value)}
                                    className="bg-black border border-emerald-500/50 rounded-lg px-3 py-1.5 text-sm w-full focus:outline-none"
                                    autoFocus
                                    onKeyDown={(e) => e.key === 'Enter' && saveFileName(item.id)}
                                  />
                                  <button onClick={() => saveFileName(item.id)} className="text-emerald-500 p-2">
                                    <CheckCircle2 className="w-5 h-5" />
                                  </button>
                                </div>
                              ) : (
                                <h3 className="font-bold text-zinc-200 flex items-center gap-2 truncate">
                                  {item.fileName}
                                  <button 
                                    onClick={() => startEditing(item)}
                                    className="opacity-0 group-hover:opacity-100 transition-opacity"
                                  >
                                    <Edit2 className="w-3 h-3 text-zinc-600 hover:text-emerald-500" />
                                  </button>
                                </h3>
                              )}
                              <p className="text-xs text-zinc-500 line-clamp-1 italic opacity-60">
                                "{item.text}..."
                              </p>
                            </div>
                            <span className="text-[10px] font-mono text-zinc-700 whitespace-nowrap">
                              {new Date(item.timestamp).toLocaleDateString()}
                            </span>
                          </div>

                          <div className="flex flex-wrap gap-2">
                            {[item.voice, item.style, item.environment].map((tag, i) => (
                              <span key={i} className="px-2 py-0.5 bg-black/40 rounded text-[9px] font-bold uppercase tracking-widest text-zinc-500 border border-white/5">
                                {tag}
                              </span>
                            ))}
                          </div>

                          <div className="pt-2 flex items-center justify-between">
                            <div className="flex gap-3">
                              <button 
                                onClick={() => {
                                  if (audioRef.current) {
                                    audioRef.current.src = item.audioUrl;
                                    audioRef.current.play();
                                  }
                                }}
                                className="w-12 h-12 bg-emerald-500 rounded-2xl flex items-center justify-center text-black hover:scale-105 active:scale-95 transition-all shadow-lg shadow-emerald-500/20"
                              >
                                <Play className="w-5 h-5 fill-current" />
                              </button>
                              <button 
                                onClick={() => downloadAudio(item)}
                                className="w-12 h-12 bg-zinc-800 rounded-2xl flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-700 transition-all"
                              >
                                <Download className="w-5 h-5" />
                              </button>
                            </div>
                            <button 
                              onClick={() => deleteHistoryItem(item.id)}
                              className="p-3 text-zinc-800 hover:text-red-500 transition-colors"
                            >
                              <Trash2 className="w-5 h-5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Right Column: Navigation & Tips */}
          <div className="lg:col-span-5 space-y-6 sm:space-y-8">
            
            {/* Tab Navigation - Moved here as requested */}
            <nav className="flex bg-zinc-900/40 p-1.5 rounded-2xl border border-white/5 shadow-inner">
              <button 
                onClick={() => setActiveTab('create')}
                className={cn(
                  "flex-1 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2",
                  activeTab === 'create' 
                    ? "bg-emerald-500 text-black shadow-lg" 
                    : "text-zinc-500 hover:text-zinc-300"
                )}
              >
                <Mic className="w-4 h-4" />
                Buat Baru
              </button>
              <button 
                onClick={() => setActiveTab('history')}
                className={cn(
                  "flex-1 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2",
                  activeTab === 'history' 
                    ? "bg-emerald-500 text-black shadow-lg" 
                    : "text-zinc-500 hover:text-zinc-300"
                )}
              >
                <History className="w-4 h-4" />
                Riwayat
                {history.length > 0 && (
                  <span className={cn(
                    "px-1.5 py-0.5 rounded-md text-[9px] font-bold",
                    activeTab === 'history' ? "bg-black/20 text-black" : "bg-emerald-500/20 text-emerald-500"
                  )}>
                    {history.length}
                  </span>
                )}
              </button>
            </nav>

            {/* Tips Section */}
            <section className="bg-zinc-900/20 border border-white/5 rounded-[2.5rem] p-8 sm:p-10 space-y-8">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-zinc-800 rounded-2xl flex items-center justify-center border border-white/5">
                  <Info className="text-emerald-500 w-6 h-6" />
                </div>
                <div>
                  <h2 className="font-black text-xl uppercase tracking-tighter">Dinamika <span className="text-zinc-500">Suara</span></h2>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-600">Tips & Tutorial</p>
                </div>
              </div>

              <div className="space-y-5">
                {TUTORIALS.map((tut, idx) => (
                  <div key={idx} className="p-6 bg-black/20 rounded-3xl border border-white/5 space-y-3 hover:border-emerald-500/20 transition-colors group">
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] font-black uppercase tracking-[0.2em] text-emerald-500/50">
                        {tut.label}
                      </span>
                      <button 
                        onClick={() => { setText(tut.text); setActiveTab('create'); }}
                        className="text-[9px] font-bold uppercase tracking-widest text-zinc-600 hover:text-white transition-colors flex items-center gap-1"
                      >
                        Try <ChevronRight className="w-3 h-3" />
                      </button>
                    </div>
                    <p className="text-base italic text-zinc-300 leading-relaxed font-medium">
                      "{tut.text}"
                    </p>
                    <p className="text-[10px] text-zinc-600 font-medium uppercase tracking-wider">
                      {tut.description}
                    </p>
                  </div>
                ))}
              </div>

              <div className="p-6 bg-emerald-500/5 border border-emerald-500/10 rounded-3xl">
                <h3 className="text-[10px] font-black uppercase tracking-widest text-emerald-500 mb-3 flex items-center gap-2">
                  <CheckCircle2 className="w-3 h-3" />
                  Pro Technique
                </h3>
                <p className="text-xs text-zinc-500 leading-relaxed font-medium">
                  Gunakan tanda baca seperti titik (.) untuk jeda panjang, koma (,) untuk jeda pendek, dan tanda tanya (?) untuk intonasi bertanya.
                </p>
              </div>
            </section>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="max-w-5xl mx-auto px-4 py-12 border-t border-white/5 text-center space-y-4">
        <div className="flex items-center justify-center gap-6 text-zinc-600">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
            <span className="text-xs font-medium uppercase tracking-widest">Powered by Gemini 2.5</span>
          </div>
        </div>
        <p className="text-[10px] text-zinc-700 max-w-md mx-auto leading-relaxed">
          Aplikasi ini menggunakan model kecerdasan buatan untuk menghasilkan suara. Hasil mungkin bervariasi tergantung pada kompleksitas teks dan instruksi yang diberikan.
        </p>
      </footer>
    </div>
  );
}
