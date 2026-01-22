'use client';

import { signIn } from 'next-auth/react';
import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function AuthContent() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlError = searchParams?.get('error');

  useEffect(() => {
    if (urlError) {
      if (urlError === 'OAuthAccountNotLinked') {
        setError('This email is already used by another account.');
      } else {
        setError('Authentication failed. Check your details.');
      }
    }
  }, [urlError]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (isSignUp) {
      try {
        const res = await fetch('/api/register', {
          method: 'POST',
          body: JSON.stringify({ email, password }),
          headers: { 'Content-Type': 'application/json' }
        });
        
        const data = await res.json();
        
        if (res.ok) {
          setIsSignUp(false);
          alert("Account created! Please sign in.");
        } else {
          setError(data.error || "Registration failed.");
        }
      } catch (err) {
        setError("Connection failed. Please try again.");
      }
    } else {
      const result = await signIn('credentials', {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        setError("Invalid email or password.");
      } else if (result?.ok) {
        router.push('/trainer');
        router.refresh();
      }
    }
  };

  return (
    <div className="min-h-screen bg-[#0d1117] flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-[#161b22] border border-gray-800 p-10 rounded-3xl shadow-2xl relative">
        <h2 className="text-3xl font-bold text-white mb-6 text-center">
          {isSignUp ? 'Join the Bee' : 'Welcome Back'}
        </h2>

        {/* Google Button - Added cursor-pointer */}
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

        <form onSubmit={handleSubmit} className="space-y-4">
          <input 
            type="email" placeholder="Email" value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full bg-[#0d1117] border border-gray-700 p-4 rounded-xl focus:border-blue-500 outline-none transition text-white"
            required
          />
          <input 
            type="password" placeholder="Password" value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full bg-[#0d1117] border border-gray-700 p-4 rounded-xl focus:border-blue-500 outline-none transition text-white"
            required
          />
          {error && (
            <div className="bg-red-500/10 border border-red-500/50 p-3 rounded-lg text-red-400 text-sm text-center">
              {error}
            </div>
          )}
          
          {/* Submit Button - Added cursor-pointer */}
          <button className="w-full bg-blue-600 hover:bg-blue-500 text-white py-4 rounded-xl font-bold transition shadow-lg shadow-blue-900/20 cursor-pointer">
            {isSignUp ? 'Create Account' : 'Sign In'}
          </button>
        </form>

        <p className="mt-8 text-center text-gray-400 text-sm">
          {isSignUp ? "Already a member?" : "New to the trainer?"}{' '}
          {/* Toggle Link - Added cursor-pointer */}
          <button 
            type="button"
            onClick={() => { setIsSignUp(!isSignUp); setError(''); }} 
            className="text-blue-500 hover:underline font-bold cursor-pointer"
          >
            {isSignUp ? 'Sign In' : 'Sign Up'}
          </button>
        </p>
      </div>
    </div>
  );
}

export default function AuthPage() {
  return (
    <Suspense fallback={<div className="h-screen bg-[#0d1117] flex items-center justify-center text-white">Loading...</div>}>
      <AuthContent />
    </Suspense>
  );
}