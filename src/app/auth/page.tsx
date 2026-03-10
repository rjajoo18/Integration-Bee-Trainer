'use client';

import { signIn } from 'next-auth/react';
import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

type Mode = 'signin' | 'signup' | 'verify';

function AuthContent() {
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);

  const router = useRouter();
  const searchParams = useSearchParams();
  const urlError = searchParams?.get('error');

  useEffect(() => {
    if (urlError) {
      if (urlError === 'OAuthAccountNotLinked') {
        setError('This email is already linked to another sign-in method.');
      } else if (urlError === 'EmailNotVerified') {
        setError('Please verify your email before signing in.');
      } else {
        setError('Authentication failed. Please check your details.');
      }
    }
  }, [urlError]);

  // Resend cooldown countdown
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  const switchMode = (next: Mode) => {
    setMode(next);
    setError('');
    setCode('');
    if (next !== 'signup') setUsername('');
  };

  // ── Sign In ──────────────────────────────────────────────────────────────
  const handleSignIn = async () => {
    setLoading(true);
    setError('');

    const result = await signIn('credentials', { email, password, redirect: false });
    setLoading(false);

    if (result?.error) {
      if (result.error === 'EmailNotVerified') {
        setError(
          'Your email is not yet verified. To resend your code, use Sign Up with the same email.',
        );
      } else {
        setError('Invalid email or password.');
      }
    } else if (result?.ok) {
      router.push('/trainer');
      router.refresh();
    }
  };

  // ── Sign Up → sends verification code ───────────────────────────────────
  const handleSignUp = async () => {
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/register', {
        method: 'POST',
        body: JSON.stringify({ email, username, password }),
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();

      if (res.ok && data.needsVerification) {
        setMode('verify');
        setResendCooldown(60);
      } else {
        setError(data.error || 'Registration failed. Please try again.');
      }
    } catch {
      setError('Connection failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ── Verify code → auto-sign-in ───────────────────────────────────────────
  const handleVerify = async () => {
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth/verify-email', {
        method: 'POST',
        body: JSON.stringify({ email, code }),
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Invalid or expired code.');
        setLoading(false);
        return;
      }

      // Email verified — sign in automatically (password still in state)
      const result = await signIn('credentials', { email, password, redirect: false });
      setLoading(false);

      if (result?.ok) {
        router.push('/trainer');
        router.refresh();
      } else {
        setError('Verified! Please sign in below.');
        switchMode('signin');
      }
    } catch {
      setError('Connection failed. Please try again.');
      setLoading(false);
    }
  };

  // ── Resend verification code ─────────────────────────────────────────────
  const handleResend = async () => {
    if (resendCooldown > 0) return;
    try {
      await fetch('/api/auth/resend-verification', {
        method: 'POST',
        body: JSON.stringify({ email }),
        headers: { 'Content-Type': 'application/json' },
      });
      setResendCooldown(60);
      setError('');
    } catch {
      // Silently ignore
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === 'signin') await handleSignIn();
    else if (mode === 'signup') await handleSignUp();
    else await handleVerify();
  };

  const title =
    mode === 'verify' ? 'Check your email' : mode === 'signup' ? 'Join the Bee' : 'Welcome Back';

  const submitLabel = loading
    ? '...'
    : mode === 'verify'
      ? 'Verify & Sign In'
      : mode === 'signup'
        ? 'Create Account'
        : 'Sign In';

  return (
    <div className="min-h-screen bg-[#0d1117] flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-[#161b22] border border-gray-800 p-10 rounded-3xl shadow-2xl">

        <h2 className="text-3xl font-bold text-white mb-6 text-center">{title}</h2>

        {/* Google button — not shown during verification step */}
        {mode !== 'verify' && (
          <>
            <button
              type="button"
              onClick={() => signIn('google', { callbackUrl: '/trainer' })}
              className="w-full flex items-center justify-center gap-3 bg-white text-black py-3 rounded-xl font-bold hover:bg-gray-100 transition mb-6 cursor-pointer"
            >
              <img src="https://authjs.dev/img/providers/google.svg" width="20" alt="Google" />
              Continue with Google
            </button>

            <div className="flex items-center gap-4 my-6 opacity-30">
              <div className="h-[1px] flex-1 bg-white" />
              <span className="text-xs uppercase font-bold text-white">or</span>
              <div className="h-[1px] flex-1 bg-white" />
            </div>
          </>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">

          {/* Email — sign in and sign up */}
          {mode !== 'verify' && (
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-[#0d1117] border border-gray-700 p-4 rounded-xl focus:border-blue-500 outline-none transition text-white"
              required
              autoComplete="email"
            />
          )}

          {/* Username — sign up only */}
          {mode === 'signup' && (
            <div>
              <input
                type="text"
                placeholder="Username (letters, numbers, underscore)"
                value={username}
                onChange={(e) =>
                  setUsername(
                    e.target.value
                      .toLowerCase()
                      .replace(/[^a-z0-9_]/g, '')
                      .slice(0, 20),
                  )
                }
                className="w-full bg-[#0d1117] border border-gray-700 p-4 rounded-xl focus:border-blue-500 outline-none transition text-white font-mono tracking-wide"
                required
                autoComplete="username"
                spellCheck={false}
                minLength={3}
                maxLength={20}
              />
              {username.length > 0 && username.length < 3 && (
                <p className="text-xs text-zinc-500 mt-1.5 pl-1">At least 3 characters required</p>
              )}
            </div>
          )}

          {/* Password — sign in and sign up */}
          {mode !== 'verify' && (
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-[#0d1117] border border-gray-700 p-4 rounded-xl focus:border-blue-500 outline-none transition text-white"
              required
              minLength={8}
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            />
          )}

          {/* Verification step */}
          {mode === 'verify' && (
            <>
              <p className="text-gray-400 text-sm text-center pb-2">
                A 6-digit code was sent to{' '}
                <span className="text-white font-semibold">{email}</span>
              </p>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                placeholder="000000"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="w-full bg-[#0d1117] border border-gray-700 p-4 rounded-xl text-center text-2xl font-mono tracking-[0.5em] focus:border-blue-500 outline-none transition text-white"
                autoComplete="one-time-code"
                autoFocus
                required
              />
            </>
          )}

          {error && (
            <div className="bg-red-500/10 border border-red-500/50 p-3 rounded-lg text-red-400 text-sm text-center">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-60 disabled:cursor-not-allowed text-white py-4 rounded-xl font-bold transition shadow-lg shadow-blue-900/20 cursor-pointer"
          >
            {submitLabel}
          </button>
        </form>

        {/* Resend — only in verify mode */}
        {mode === 'verify' && (
          <div className="mt-5 text-center space-y-3">
            <button
              type="button"
              onClick={handleResend}
              disabled={resendCooldown > 0}
              className="text-sm text-gray-400 hover:text-white transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              {resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : 'Resend code'}
            </button>
            <div>
              <button
                type="button"
                onClick={() => switchMode('signup')}
                className="text-xs text-gray-600 hover:text-gray-400 transition cursor-pointer"
              >
                ← Back to sign up
              </button>
            </div>
          </div>
        )}

        {/* Sign in / Sign up toggle */}
        {mode !== 'verify' && (
          <p className="mt-8 text-center text-gray-400 text-sm">
            {mode === 'signup' ? 'Already a member?' : 'New to the trainer?'}{' '}
            <button
              type="button"
              onClick={() => switchMode(mode === 'signup' ? 'signin' : 'signup')}
              className="text-blue-500 hover:underline font-bold cursor-pointer"
            >
              {mode === 'signup' ? 'Sign In' : 'Sign Up'}
            </button>
          </p>
        )}
      </div>
    </div>
  );
}

export default function AuthPage() {
  return (
    <Suspense
      fallback={
        <div className="h-screen bg-[#0d1117] flex items-center justify-center text-white">
          Loading...
        </div>
      }
    >
      <AuthContent />
    </Suspense>
  );
}
