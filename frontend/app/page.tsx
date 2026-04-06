'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Cpu,
  Film,
  Github,
  Image as ImageIcon,
  Radar,
  Sparkles,
  Zap,
} from 'lucide-react';

import { useProcessing } from './hooks/useProcessing';
import { AuthResponse, HistoryItem, JobSummary, RenderSettings, User } from './types';
import AuthPanel from '../components/AuthPanel';
import Controls from '../components/Controls';
import HistoryPanel from '../components/HistoryPanel';
import Preview from '../components/Preview';
import Progress from '../components/Progress';
import Toast from '../components/Toast';
import Uploader from '../components/Uploader';
import { fetchMe, listJobs } from '@/lib/api';

const SETTINGS_STORAGE_KEY = 'lumitrace.settings.v2';
const HISTORY_STORAGE_KEY = 'lumitrace.history.v2';
const TOKEN_STORAGE_KEY = 'lumitrace.token.v1';

const DEFAULT_SETTINGS: RenderSettings = {
  samples: 64,
  maxBounces: 4,
  useDenoising: true,
  useNeural: false,
  exposure: 1,
};

interface ToastState {
  open: boolean;
  message: string;
  type: 'success' | 'error' | 'info';
}

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const [settings, setSettings] = useState<RenderSettings>(DEFAULT_SETTINGS);
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>([]);
  const [remoteJobs, setRemoteJobs] = useState<JobSummary[]>([]);

  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);

  const [toast, setToast] = useState<ToastState>({
    open: false,
    message: '',
    type: 'info',
  });

  const {
    isProcessing,
    progress,
    error,
    processFile,
    cancelProcessing,
    activeJobId,
  } = useProcessing();

  const processingSummary = useMemo(() => {
    if (!file) return 'Ready to start';
    if (isProcessing) {
      return `Job ${activeJobId?.slice(0, 8) || 'active'} running`;
    }

    return `${file.name} selected`;
  }, [activeJobId, file, isProcessing]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const storedSettings = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    const storedHistory = window.localStorage.getItem(HISTORY_STORAGE_KEY);
    const storedToken = window.localStorage.getItem(TOKEN_STORAGE_KEY);

    if (storedSettings) {
      try {
        setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(storedSettings) });
      } catch {
        setSettings(DEFAULT_SETTINGS);
      }
    }

    if (storedHistory) {
      try {
        const parsed = JSON.parse(storedHistory) as HistoryItem[];
        setHistoryItems(Array.isArray(parsed) ? parsed : []);
      } catch {
        setHistoryItems([]);
      }
    }

    if (storedToken) {
      setToken(storedToken);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(historyItems));
  }, [historyItems]);

  useEffect(() => {
    if (!token) {
      setUser(null);
      setRemoteJobs([]);
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem(TOKEN_STORAGE_KEY);
      }
      return;
    }

    if (typeof window !== 'undefined') {
      window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
    }

    fetchMe(token)
      .then((responseUser) => {
        setUser(responseUser);
        return listJobs(token, 8);
      })
      .then((jobs) => {
        setRemoteJobs(jobs);
      })
      .catch(() => {
        setToken(null);
        setUser(null);
      });
  }, [token]);

  useEffect(() => {
    if (!error) return;
    setToast({
      open: true,
      message: error,
      type: 'error',
    });
  }, [error]);

  const rememberJob = useCallback((jobId: string, selectedFile: File, currentSettings: RenderSettings) => {
    const item: HistoryItem = {
      id: jobId,
      name: selectedFile.name,
      mediaType: selectedFile.type.startsWith('video/') ? 'video' : 'image',
      createdAt: new Date().toISOString(),
      settings: currentSettings,
    };

    setHistoryItems((prev) => [item, ...prev].slice(0, 12));
  }, []);

  const handleFileSelect = (selectedFile: File, previewUrl: string) => {
    setFile(selectedFile);
    setPreview(previewUrl);
    setResult(null);
  };

  const handleProcess = useCallback(async () => {
    if (!file) {
      setToast({
        open: true,
        message: 'Select a file before starting.',
        type: 'info',
      });
      return;
    }

    await processFile(file, settings, token || undefined, (url, jobId) => {
      setResult(url);
      rememberJob(jobId, file, settings);
      setToast({
        open: true,
        message: 'Render completed and ready to download.',
        type: 'success',
      });

      if (token) {
        listJobs(token, 8).then(setRemoteJobs).catch(() => {
          // Keep the UI functional even if history sync fails.
        });
      }
    });
  }, [file, processFile, rememberJob, settings, token]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && file && !isProcessing) {
        event.preventDefault();
        void handleProcess();
      }

      if (event.key === 'Escape' && isProcessing) {
        event.preventDefault();
        cancelProcessing();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [cancelProcessing, file, handleProcess, isProcessing]);

  useEffect(() => {
    return () => {
      if (preview) {
        URL.revokeObjectURL(preview);
      }
    };
  }, [preview]);

  useEffect(() => {
    return () => {
      if (result) {
        URL.revokeObjectURL(result);
      }
    };
  }, [result]);

  const handleReset = () => {
    setFile(null);
    setPreview(null);
    setResult(null);
  };

  return (
    <main className="min-h-screen pb-16">
      <header className="sticky top-0 z-40 border-b border-white/5 bg-zinc-950/70 backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 shadow-[0_0_20px_rgba(99,102,241,0.4)] border border-indigo-400/50">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="font-heading text-lg font-bold tracking-tight text-zinc-50">LumiTrace Studio</p>
              <p className="text-xs text-zinc-400">{processingSummary}</p>
            </div>
          </div>

          <a
            href="https://github.com/RsEg7777/LumiTrace"
            target="_blank"
            rel="noopener noreferrer"
            className="chip inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-teal-300 transition-all hover:text-zinc-50 hover:bg-white/5"
          >
            <Github className="h-4 w-4" />
            GitHub
          </a>
        </div>
      </header>

      <section className="mx-auto w-full max-w-7xl px-4 pt-10 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-strong relative overflow-hidden rounded-[2rem] px-6 py-12 sm:px-12"
        >
          <div className="absolute -right-20 -top-24 h-72 w-72 rounded-full bg-teal-500/20 blur-[100px]" />
          <div className="absolute -bottom-20 left-6 h-72 w-72 rounded-full bg-rose-500/20 blur-[100px]" />

          <div className="relative">
            <h1 className="hero-title font-heading text-4xl font-extrabold tracking-tight sm:text-5xl lg:text-7xl">
              Cinematic path tracing <br/>
              <span className="hero-title-accent">for images and videos</span>
            </h1>
            <p className="mt-6 max-w-2xl text-base text-zinc-400 sm:text-lg leading-relaxed">
              Build physically inspired lighting passes with account-backed job history, reusable presets,
              robust progress tracking, and resilient download flows.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              {[
                { icon: Cpu, text: 'GPU optimized backend' },
                { icon: Radar, text: 'Persistent job tracking' },
                { icon: Zap, text: 'Preset-driven controls' },
                { icon: ImageIcon, text: 'Image rendering' },
                { icon: Film, text: 'Video rendering' },
              ].map((feature, index) => (
                <motion.div
                  key={feature.text}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="chip inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium text-teal-300"
                >
                  <feature.icon className="h-3.5 w-3.5 text-teal-300" />
                  {feature.text}
                </motion.div>
              ))}
            </div>
          </div>
        </motion.div>
      </section>

      <section className="mx-auto mt-8 grid w-full max-w-7xl grid-cols-1 gap-6 px-4 sm:px-6 lg:grid-cols-12 lg:px-8">
        <aside className="space-y-6 lg:col-span-3">
          <AuthPanel
            user={user}
            onAuth={(auth: AuthResponse) => {
              setToken(auth.access_token);
              setUser(auth.user);
              setToast({ open: true, message: 'Signed in successfully.', type: 'success' });
            }}
            onLogout={() => {
              setToken(null);
              setUser(null);
              setToast({ open: true, message: 'Signed out.', type: 'info' });
            }}
          />

          <HistoryPanel
            items={historyItems}
            onClear={() => {
              setHistoryItems([]);
              setToast({ open: true, message: 'Local history cleared.', type: 'info' });
            }}
          />

          {user && (
            <section className="rounded-2xl border border-white/10 glass-strong p-4 shadow-sm">
              <h3 className="text-sm font-semibold text-zinc-200">Cloud Job History</h3>
              <p className="mt-1 text-xs text-zinc-400">{remoteJobs.length} recent jobs linked to your account.</p>
            </section>
          )}
        </aside>

        <div className="space-y-6 lg:col-span-4">
          <AnimatePresence mode="wait">
            {!file ? (
              <motion.div
                key="uploader"
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
              >
                <Uploader onFileSelect={handleFileSelect} />
              </motion.div>
            ) : (
              <motion.div
                key="controls"
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -12 }}
              >
                <Controls
                  settings={settings}
                  onSettingsChange={setSettings}
                  onProcess={handleProcess}
                  onCancel={cancelProcessing}
                  isProcessing={isProcessing}
                  onReset={handleReset}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="space-y-4 lg:col-span-5">
          <Preview original={preview} processed={result} isProcessing={isProcessing} />
          {isProcessing ? <Progress progress={progress} /> : null}
        </div>
      </section>

      <Toast
        open={toast.open}
        message={toast.message}
        type={toast.type}
        onClose={() => setToast((prev) => ({ ...prev, open: false }))}
      />
    </main>
  );
}
