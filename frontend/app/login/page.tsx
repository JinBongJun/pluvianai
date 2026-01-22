'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { authAPI } from '@/lib/api';
import posthog from 'posthog-js';
import { useLoading } from '@/hooks/useLoading';
import { useFormSubmit } from '@/hooks/useFormSubmit';
import { getErrorMessage } from '@/lib/errorMessages';
import { validateEmail, validatePassword, passwordStrength } from '@/lib/validation';

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const { isLoading, start, stop } = useLoading({ minDuration: 300 });
  const pwdStrength = passwordStrength(password);

  useEffect(() => {
    // Check for mode query parameter
    const mode = searchParams?.get('mode');
    if (mode === 'signup') {
      setIsLogin(false);
    }
  }, [searchParams]);

  const handleSubmit = async () => {
    setError('');

    const emailError = validateEmail(email);
    if (emailError) {
      setError(emailError);
      return;
    }
    if (!isLogin) {
      const pwdError = validatePassword(password);
      if (pwdError) {
        setError(pwdError);
        return;
      }
    }

    start();

    try {
      if (isLogin) {
        await authAPI.login(email, password);
        posthog.capture('user_login', { method: 'password' });
        router.push('/organizations');
      } else {
        await authAPI.register(email, password, fullName);
        posthog.capture('user_register', { method: 'password' });
        // After registration, log in
        await authAPI.login(email, password);
        posthog.capture('user_login', { method: 'password' });
        router.push('/organizations');
      }
    } catch (err: any) {
      console.error('Login error:', err);
      let errorMessage = 'An error occurred';
      
      if (err.response) {
        // Server responded with error
        const detail = err.response.data?.detail;
        if (typeof detail === 'string') {
          errorMessage = getErrorMessage(detail) || detail;
        } else if (typeof detail === 'object' && detail?.message) {
          errorMessage = detail.message;
        } else {
          errorMessage = `Server error: ${err.response.status}`;
        }
      } else if (err.request) {
        // Request was made but no response received
        errorMessage = 'Cannot connect to server. Please check if the backend is running.';
      } else {
        // Something else happened
        errorMessage = err.message || 'An unexpected error occurred';
      }
      
      setError(errorMessage);
    } finally {
      stop();
    }
  };

  const { submitting, handleSubmit: onSubmit } = useFormSubmit({ onSubmit: handleSubmit });

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#000314] py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <div className="flex justify-center mb-4">
            <div className="h-12 w-12 bg-gradient-to-br from-purple-500 to-purple-700 rounded-xl flex items-center justify-center shadow-lg shadow-purple-500/30">
              <span className="text-white font-bold text-lg">AG</span>
            </div>
          </div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-white">
            {isLogin ? 'Sign in to AgentGuard' : 'Create your account'}
          </h2>
          <p className="mt-2 text-center text-sm text-slate-400">
            Monitor your LLM agents with confidence
          </p>
        </div>
        <form className="mt-8 space-y-6" onSubmit={onSubmit}>
          {error && (
            <div className="bg-red-500/20 border border-red-500/30 text-red-400 px-4 py-3 rounded">
              {error}
            </div>
          )}
          <div className="rounded-md shadow-sm -space-y-px" role="group" aria-labelledby="login-fields">
            {!isLogin && (
              <div>
                <label htmlFor="full-name" className="sr-only">
                  Full Name
                </label>
                <input
                  id="full-name"
                  name="fullName"
                  type="text"
                  required={!isLogin}
                  className="appearance-none rounded-none relative block w-full px-3 py-2 bg-white/5 border border-white/10 placeholder-slate-500 text-white rounded-t-md focus:outline-none focus:ring-purple-500 focus:border-purple-500 focus:z-10 sm:text-sm"
                  placeholder="Full Name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                />
              </div>
            )}
            <div>
              <label htmlFor="email-address" className="sr-only">
                Email address
              </label>
              <input
                id="email-address"
                name="email"
                type="email"
                autoComplete="email"
                required
                aria-required="true"
                className={`appearance-none rounded-none relative block w-full px-3 py-2 bg-white/5 border border-white/10 placeholder-slate-500 text-white ${!isLogin ? '' : 'rounded-t-md'} focus:outline-none focus:ring-purple-500 focus:border-purple-500 focus:z-10 sm:text-sm`}
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="password" className="sr-only">
                Password
              </label>
              <input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                required
                aria-required="true"
                className="appearance-none rounded-none relative block w-full px-3 py-2 bg-white/5 border border-white/10 placeholder-slate-500 text-white rounded-b-md focus:outline-none focus:ring-purple-500 focus:border-purple-500 focus:z-10 sm:text-sm pr-10"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-2 text-slate-400 hover:text-slate-200 text-sm"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          {!isLogin && (
            <div className="text-xs text-slate-400" role="status" aria-live="polite">
              Password strength:
              <span className="ml-2" aria-label={`Strength ${pwdStrength} of 5`}>
                {'●'.repeat(pwdStrength)}
                {'○'.repeat(Math.max(0, 5 - pwdStrength))}
              </span>
            </div>
          )}

          <div>
            <button
              type="submit"
              disabled={isLoading || submitting}
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-purple-600 hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 disabled:opacity-50 transition-colors"
            >
              {isLoading || submitting ? 'Loading...' : isLogin ? 'Sign in' : 'Sign up'}
            </button>
          </div>

          <div className="text-center">
            <button
              type="button"
              onClick={() => {
                setIsLogin(!isLogin);
                setError('');
              }}
              className="text-sm text-purple-400 hover:text-purple-300 transition-colors"
            >
              {isLogin ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}



