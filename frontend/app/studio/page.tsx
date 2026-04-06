'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

import { useProcessing } from '../hooks/useProcessing';
import { HistoryItem, JobSummary, RenderSettings, User } from '../types';
import Controls from '../../components/Controls';
import HistoryPanel from '../../components/HistoryPanel';
import Preview from '../../components/Preview';
import Progress from '../../components/Progress';
import Toast from '../../components/Toast';
import Uploader from '../../components/Uploader';
import Navbar from '../../components/Navbar';
import { fetchMe, listJobs } from '@/lib/api';
import { clearStoredToken, persistToken, readStoredToken } from '@/lib/auth';

const SETTINGS_STORAGE_KEY = 'lumitrace.settings.v2';
const HISTORY_STORAGE_KEY = 'lumitrace.history.v2';

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

export default function StudioPage() {
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
    const storedToken = readStoredToken();

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
      clearStoredToken();
      return;
    }

    persistToken(token);

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
          // Keep local UX functional even if cloud sync fails.
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
      <Navbar
        user={user}
        processingSummary={processingSummary}
        onLogout={() => {
          setToken(null);
          setUser(null);
          clearStoredToken();
          setToast({ open: true, message: 'Signed out.', type: 'info' });
        }}
      />

      <section className="mx-auto w-full max-w-7xl px-4 pt-8 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-strong rounded-2xl border border-white/10 p-4"
        >
          {user ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-zinc-300">
                Connected as <span className="font-semibold text-zinc-100">{user.display_name || user.email}</span>
              </p>
              <p className="text-xs text-zinc-400">Cloud history enabled for this account.</p>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-zinc-100">Anonymous mode active</p>
                <p className="text-xs text-zinc-400">Sign in to unlock account-backed cloud history across devices.</p>
              </div>
              <div className="flex items-center gap-2">
                <Link
                  href="/login"
                  className="rounded-lg bg-gradient-to-r from-cyan-500 to-teal-500 px-4 py-2 text-sm font-semibold text-white"
                >
                  Go to Login
                </Link>
                <Link
                  href="/"
                  className="rounded-lg border border-white/10 px-4 py-2 text-sm text-zinc-200 hover:bg-white/5"
                >
                  Back to Home
                </Link>
              </div>
            </div>
          )}
        </motion.div>
      </section>

      <section className="mx-auto mt-6 grid w-full max-w-7xl grid-cols-1 gap-6 px-4 sm:px-6 lg:grid-cols-12 lg:px-8">
        <aside className="space-y-6 lg:col-span-3">
          <HistoryPanel
            items={historyItems}
            onClear={() => {
              setHistoryItems([]);
              setToast({ open: true, message: 'Local history cleared.', type: 'info' });
            }}
          />

          <section className="rounded-2xl border border-white/10 glass-strong p-4 shadow-sm">
            <h3 className="text-sm font-semibold text-zinc-200">Cloud Job History</h3>
            <p className="mt-1 text-xs text-zinc-400">
              {user ? `${remoteJobs.length} recent jobs linked to your account.` : 'Sign in to sync cloud job history.'}
            </p>
          </section>
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
