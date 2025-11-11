'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { signInWithGoogle, signOutUser, isAdmin, subscribeToAuth } from '@/lib/auth';

export default function AuthButton() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = subscribeToAuth((currentUser) => {
      setUser(currentUser);
      setLoading(false);

      if (currentUser && isAdmin(currentUser.email)) {
        router.push('/admin/overview');
      }
    });

    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [router]);

  const handleSignIn = async () => {
    try {
      const user = await signInWithGoogle();
      if (isAdmin(user.email)) {
        router.push('/admin/overview');
      }
    } catch (error) {
      console.error('Sign in error:', error);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOutUser();
      router.push('/');
    } catch (error) {
      console.error('Sign out error:', error);
    }
  };

  const googleButtonMobileClasses = 'flex items-center justify-center rounded-full border border-zinc-200 bg-white px-5 py-2 text-sm font-medium shadow-sm transition-colors hover:bg-zinc-50 sm:hidden';
  const googleButtonDesktopClasses = 'hidden sm:flex items-center justify-center gap-2 rounded-full border border-zinc-200 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-zinc-50 mr-5 md:mr-10 lg:mr-20';
  const signOutButtonDesktopClasses = 'hidden sm:flex items-center justify-center gap-2 rounded-full border border-pink-200/70 bg-white/80 px-5 py-2.5 text-sm font-medium text-pink-600 shadow-sm transition-colors hover:bg-pink-100 hover:text-pink-700 mr-5 md:mr-10 lg:mr-20';

  if (loading) {
    return (
      <>
        <button className={googleButtonMobileClasses} aria-label="Loading">
          Google
        </button>
        <button className={googleButtonDesktopClasses} aria-label="Loading" disabled>
          <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
            <path fill="#4285F4" d="M23.49 12.27c0-.82-.07-1.64-.21-2.44H12v4.62h6.41c-.27 1.48-1.11 2.74-2.37 3.58v2.95h3.84c2.25-2.07 3.54-5.12 3.54-8.71z" />
            <path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.94-2.91l-3.84-2.95c-1.06.71-2.44 1.12-4.1 1.12-3.16 0-5.83-2.13-6.78-4.99H1.24v3.14C3.21 21.68 7.3 24 12 24z" />
            <path fill="#FBBC05" d="M5.22 14.27c-.24-.71-.35-1.36-.35-2.09s.13-1.43.35-2.09V6.59H1.24A11.97 11.97 0 0 0 0 12c0 1.94.46 3.77 1.24 5.41l3.98-3.14z" />
            <path fill="#EA4335" d="M12 4.75c1.76 0 3.34.61 4.58 1.8l3.42-3.42C17.94 1.21 15.22 0 12 0 7.3 0 3.21 2.32 1.24 6.59l3.98 3.14C6.17 6.88 8.84 4.75 12 4.75z" />
          </svg>
          Sign in with Google
        </button>
      </>
    );
  }

  if (user) {
    const displayName = user.displayName || user.email;
    const welcomeLabel = displayName ? `Welcome, ${displayName}` : 'Welcome';

    return (
      <>
        <button
          onClick={handleSignOut}
          className={`${googleButtonMobileClasses} italic text-pink-500`}
          aria-label="Sign out"
        >
          Google
        </button>
        <div className="hidden sm:flex sm:flex-wrap sm:items-center sm:justify-end sm:gap-2 sm:text-sm sm:gap-3">
          <span className="text-pink-500 italic">{welcomeLabel}</span>
          <button
            onClick={handleSignOut}
            className={signOutButtonDesktopClasses}
          >
            Sign Out
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      <button
        onClick={handleSignIn}
        className={googleButtonMobileClasses}
        aria-label="Sign in with Google"
      >
        <span className="text-slate-700">Google</span>
      </button>
      <button
        onClick={handleSignIn}
        className={googleButtonDesktopClasses}
      >
        Google
      </button>
    </>
  );
}

