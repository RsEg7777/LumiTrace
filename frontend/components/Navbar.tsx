'use client';

import { Github, Sparkles } from 'lucide-react';
import { User, AuthResponse } from '@/app/types';

interface NavbarProps {
  user: User | null;
  processingSummary: string;
  onLogout: () => void;
}

export default function Navbar({ user, processingSummary, onLogout }: NavbarProps) {
  return (
    <header className="sticky top-0 z-40 border-b border-white/5 bg-zinc-950/70 backdrop-blur-xl">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 shadow-[0_0_20px_rgba(99,102,241,0.4)] border border-indigo-400/50">
            <Sparkles className="h-5 w-5 text-white" />
          </div>
          <div>
            <p className="font-heading text-lg font-bold tracking-tight text-zinc-50">LumiTrace Studio</p>
            {user && <p className="text-xs text-zinc-400">{processingSummary}</p>}
          </div>
        </div>

        <nav className="flex items-center gap-4">
          <a
            href="https://github.com/RsEg7777/LumiTrace"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden sm:inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-teal-300 transition-all hover:text-zinc-50 hover:bg-white/5"
          >
            <Github className="h-4 w-4" />
            GitHub
          </a>
          
          {user ? (
            <div className="flex items-center gap-4 border-l border-white/10 pl-4">
              <span className="text-sm text-zinc-300 hidden sm:inline-block">
                {user.display_name || user.email}
              </span>
              <button
                onClick={onLogout}
                className="rounded-lg bg-white/5 px-3 py-2 text-sm font-medium text-zinc-300 transition-all hover:bg-white/10"
              >
                Sign out
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <a href="#login-section" className="text-sm font-medium text-zinc-300 hover:text-white">Sign In</a>
            </div>
          )}
        </nav>
      </div>
    </header>
  );
}
