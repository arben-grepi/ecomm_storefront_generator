'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { signInWithGoogle, signOutUser, isAdmin, subscribeToAuth } from '@/lib/auth';
import { getStorefront } from '@/lib/get-storefront';

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
      
      // Get the stored storefront from admin overview (highest priority)
      const storedStorefront = typeof window !== 'undefined' 
        ? sessionStorage.getItem('admin_storefront') 
        : null;
      
      // Fallback to current storefront detection
      const storefront = storedStorefront || getStorefront();
      
      // Clear the stored storefront after using it
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem('admin_storefront');
      }
      
      // LUNERA is the default storefront at root path
      const redirectPath = storefront === 'LUNERA' ? '/' : `/${storefront}`;
      router.push(redirectPath);
    } catch (error) {
      console.error('Sign out error:', error);
    }
  };

  // Google's official button guidelines - single button that works on all screen sizes
  // Reference: https://developers.google.com/identity/branding-guidelines
  const googleButtonClasses = 'flex items-center justify-center gap-3 rounded border border-[#DADCE0] bg-white px-4 py-2.5 text-sm font-medium text-[#3C4043] shadow-sm transition-all hover:bg-[#F8F9FA] hover:shadow-md mr-5 md:mr-10 lg:mr-20';
  const signOutButtonClasses = 'flex items-center justify-center gap-2 rounded-full border border-primary/30 bg-white/80 px-5 py-2.5 text-sm font-medium text-primary shadow-sm transition-colors hover:bg-secondary hover:text-primary mr-5 md:mr-10 lg:mr-20';

  // Official Google logo SVG
  const GoogleLogo = () => (
    <svg className="h-5 w-5 flex-shrink-0" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M23.49 12.27c0-.82-.07-1.64-.21-2.44H12v4.62h6.41c-.27 1.48-1.11 2.74-2.37 3.58v2.95h3.84c2.25-2.07 3.54-5.12 3.54-8.71z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.94-2.91l-3.84-2.95c-1.06.71-2.44 1.12-4.1 1.12-3.16 0-5.83-2.13-6.78-4.99H1.24v3.14C3.21 21.68 7.3 24 12 24z" />
      <path fill="#FBBC05" d="M5.22 14.27c-.24-.71-.35-1.36-.35-2.09s.13-1.43.35-2.09V6.59H1.24A11.97 11.97 0 0 0 0 12c0 1.94.46 3.77 1.24 5.41l3.98-3.14z" />
      <path fill="#EA4335" d="M12 4.75c1.76 0 3.34.61 4.58 1.8l3.42-3.42C17.94 1.21 15.22 0 12 0 7.3 0 3.21 2.32 1.24 6.59l3.98 3.14C6.17 6.88 8.84 4.75 12 4.75z" />
    </svg>
  );

  if (loading) {
    return (
      <button className={googleButtonClasses} aria-label="Loading" disabled>
        <GoogleLogo />
        <span>Sign in with Google</span>
      </button>
    );
  }

  if (user) {
    const displayName = user.displayName || user.email;
    const welcomeLabel = displayName ? `Welcome, ${displayName}` : 'Welcome';

    return (
      <div className="flex items-center gap-3">
        <span className="hidden text-sm text-primary italic sm:inline">{welcomeLabel}</span>
        <button
          onClick={handleSignOut}
          className={signOutButtonClasses}
          aria-label="Sign out"
        >
          Sign Out
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={handleSignIn}
      className={googleButtonClasses}
      aria-label="Sign in with Google"
    >
      <GoogleLogo />
      <span>Sign in with Google</span>
    </button>
  );
}


