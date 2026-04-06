'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, LockKeyhole, Sparkles } from 'lucide-react';
import { useRouter } from 'next/navigation';

import AuthPanel from '../../components/AuthPanel';
import { AuthResponse, User } from '../types';
import { fetchMe } from '@/lib/api';
import { clearStoredToken, persistToken, readStoredToken } from '@/lib/auth';

export default function LoginPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const existingToken = readStoredToken();
    if (!existingToken) {
      setChecking(false);
      return;
    }

    fetchMe(existingToken)
      .then((resolvedUser) => {
        setUser(resolvedUser);
        router.replace('/studio');
      })
      .catch(() => {
        clearStoredToken();
      })
      .finally(() => {
        setChecking(false);
      });
  }, [router]);

  return (
    <main className="relative min-h-screen overflow-hidden px-4 pb-12 pt-10 sm:px-6 lg:px-8">
      <div className="absolute -left-28 top-8 h-72 w-72 rounded-full bg-cyan-500/20 blur-[110px]" />
      <div className="absolute -right-20 bottom-0 h-80 w-80 rounded-full bg-orange-500/20 blur-[120px]" />

      <div className="relative mx-auto max-w-6xl">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-zinc-300 hover:text-white">
          <ArrowLeft className="h-4 w-4" />
          Back to home
        </Link>

        <div className="mt-10 grid gap-6 lg:grid-cols-2 lg:items-center">
          <motion.section
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            <p className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs uppercase tracking-[0.18em] text-cyan-200">
              <Sparkles className="h-3.5 w-3.5" />
              LumiTrace Access
            </p>

            <h1 className="font-heading text-4xl font-bold leading-tight text-white sm:text-5xl">
              Sign in to your
              <span className="block text-cyan-300">render workspace</span>
            </h1>

            <p className="max-w-lg text-sm text-zinc-300 sm:text-base">
              Use your account to keep job history synced, monitor in-flight renders, and continue projects from any device.
            </p>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className="text-xs uppercase tracking-[0.14em] text-zinc-400">Secure Auth</p>
                <p className="mt-1 text-sm font-semibold text-zinc-100">JWT-protected sessions</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className="text-xs uppercase tracking-[0.14em] text-zinc-400">Cloud Sync</p>
                <p className="mt-1 text-sm font-semibold text-zinc-100">Account job timeline</p>
              </div>
            </div>
          </motion.section>

          <motion.section
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="glass-strong rounded-3xl border border-white/10 p-5 shadow-[0_20px_80px_rgba(0,0,0,0.35)] sm:p-8"
          >
            <div className="mb-5 flex items-center gap-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-zinc-200">
              <LockKeyhole className="h-4 w-4 text-cyan-300" />
              <p className="text-sm">Authentication portal</p>
            </div>

            {checking ? (
              <p className="text-sm text-zinc-300">Checking active session...</p>
            ) : (
              <AuthPanel
                user={user}
                onAuth={(auth: AuthResponse) => {
                  persistToken(auth.access_token);
                  setUser(auth.user);
                  router.push('/studio');
                }}
                onLogout={() => {
                  clearStoredToken();
                  setUser(null);
                }}
              />
            )}
          </motion.section>
        </div>
      </div>
    </main>
  );
}
