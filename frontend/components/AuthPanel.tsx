'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, LogOut, ShieldCheck, UserCircle2 } from 'lucide-react';

import { AuthResponse, User } from '@/app/types';
import { googleLogin, login, register } from '@/lib/api';

interface AuthPanelProps {
  user: User | null;
  onAuth: (auth: AuthResponse) => void;
  onLogout: () => void;
}

export default function AuthPanel({ user, onAuth, onLogout }: AuthPanelProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleReady, setGoogleReady] = useState(false);
  const googleButtonRef = useRef<HTMLDivElement | null>(null);

  const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

  const title = useMemo(() => {
    if (mode === 'register') return 'Create account';
    return 'Member sign in';
  }, [mode]);

  useEffect(() => {
    if (!googleClientId || user || !googleButtonRef.current) {
      return;
    }

    let isCancelled = false;

    const initGoogleButton = () => {
      if (isCancelled || !googleButtonRef.current || !window.google?.accounts?.id) {
        return;
      }

      window.google.accounts.id.initialize({
        client_id: googleClientId,
        callback: async (response) => {
          if (!response?.credential) {
            setError('Google sign-in returned an empty credential');
            return;
          }

          setLoading(true);
          setError(null);
          try {
            const authPayload = await googleLogin({ id_token: response.credential });
            onAuth(authPayload);
          } catch (err: any) {
            setError(err?.message || 'Google sign-in failed');
          } finally {
            setLoading(false);
          }
        },
      });

      googleButtonRef.current.innerHTML = '';
      window.google.accounts.id.renderButton(googleButtonRef.current, {
        theme: 'outline',
        size: 'large',
        text: 'signin_with',
        shape: 'pill',
        width: 260,
      });
      setGoogleReady(true);
    };

    if (window.google?.accounts?.id) {
      initGoogleButton();
      return () => {
        isCancelled = true;
      };
    }

    const existingScript = document.getElementById('google-identity-services') as HTMLScriptElement | null;
    if (existingScript) {
      existingScript.addEventListener('load', initGoogleButton, { once: true });
      return () => {
        isCancelled = true;
      };
    }

    const script = document.createElement('script');
    script.id = 'google-identity-services';
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = initGoogleButton;
    script.onerror = () => {
      if (!isCancelled) {
        setError('Failed to load Google sign-in');
      }
    };
    document.head.appendChild(script);

    return () => {
      isCancelled = true;
    };
  }, [googleClientId, onAuth, user]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const payload =
        mode === 'register'
          ? await register({ email, password, display_name: displayName })
          : await login({ email, password });
      onAuth(payload);
      setPassword('');
    } catch (err: any) {
      setError(err?.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  }

  if (user) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-sm">
        <div className="mb-3 flex items-center gap-2 text-slate-800">
          <ShieldCheck className="h-5 w-5 text-emerald-600" />
          <h3 className="text-sm font-semibold">Authenticated</h3>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
          <p className="flex items-center gap-2 font-medium">
            <UserCircle2 className="h-4 w-4" />
            {user.display_name || user.email}
          </p>
          <p className="mt-1 text-xs text-slate-500">{user.email}</p>
        </div>
        <button
          onClick={onLogout}
          className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
        <div className="inline-flex rounded-lg border border-slate-200 p-0.5 text-xs">
          <button
            onClick={() => setMode('login')}
            className={`rounded-md px-2 py-1 ${mode === 'login' ? 'bg-slate-900 text-white' : 'text-slate-600'}`}
            type="button"
          >
            Login
          </button>
          <button
            onClick={() => setMode('register')}
            className={`rounded-md px-2 py-1 ${mode === 'register' ? 'bg-slate-900 text-white' : 'text-slate-600'}`}
            type="button"
          >
            Register
          </button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-2.5">
        {mode === 'register' && (
          <input
            required
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            placeholder="Display name"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-cyan-300 focus:ring"
          />
        )}
        <input
          required
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="Email"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-cyan-300 focus:ring"
        />
        <input
          required
          type="password"
          minLength={8}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Password"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-cyan-300 focus:ring"
        />
        {error && <p className="text-xs text-rose-600">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-70"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {mode === 'register' ? 'Create account' : 'Sign in'}
        </button>

        {googleClientId ? (
          <div className="space-y-1.5 pt-2">
            <div className="relative text-center text-[11px] text-slate-500">
              <span className="bg-white px-2">or continue with Google</span>
            </div>
            <div className="flex justify-center" ref={googleButtonRef} />
            {!googleReady ? <p className="text-[11px] text-slate-500 text-center">Loading Google sign-in…</p> : null}
          </div>
        ) : null}
      </form>
    </section>
  );
}
