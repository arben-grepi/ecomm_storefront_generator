'use client';

import { useState, useEffect, useRef } from 'react';
import { getMarket } from '@/lib/get-market';
import { signInWithGoogle, signOutUser, isAdmin, subscribeToAuth } from '@/lib/auth';
import { useRouter } from 'next/navigation';
import { getStorefront } from '@/lib/get-storefront';

export default function SettingsMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const menuRef = useRef(null);
  const router = useRouter();

  useEffect(() => {
    // Subscribe to auth changes
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

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);


  const handleSignIn = async () => {
    try {
      const user = await signInWithGoogle();
      setIsOpen(false);
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
      setIsOpen(false);
      // Get storefront from cache to navigate back to the correct storefront
      const storefront = getStorefront();
      // LUNERA is the default storefront at root path
      const redirectPath = storefront === 'LUNERA' ? '/' : `/${storefront}`;
      router.push(redirectPath);
    } catch (error) {
      console.error('Sign out error:', error);
    }
  };

  // Google logo SVG
  const GoogleLogo = () => (
    <svg className="h-5 w-5 flex-shrink-0" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M23.49 12.27c0-.82-.07-1.64-.21-2.44H12v4.62h6.41c-.27 1.48-1.11 2.74-2.37 3.58v2.95h3.84c2.25-2.07 3.54-5.12 3.54-8.71z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.94-2.91l-3.84-2.95c-1.06.71-2.44 1.12-4.1 1.12-3.16 0-5.83-2.13-6.78-4.99H1.24v3.14C3.21 21.68 7.3 24 12 24z" />
      <path fill="#FBBC05" d="M5.22 14.27c-.24-.71-.35-1.36-.35-2.09s.13-1.43.35-2.09V6.59H1.24A11.97 11.97 0 0 0 0 12c0 1.94.46 3.77 1.24 5.41l3.98-3.14z" />
      <path fill="#EA4335" d="M12 4.75c1.76 0 3.34.61 4.58 1.8l3.42-3.42C17.94 1.21 15.22 0 12 0 7.3 0 3.21 2.32 1.24 6.59l3.98 3.14C6.17 6.88 8.84 4.75 12 4.75z" />
    </svg>
  );

  return (
    <div className="relative" ref={menuRef}>
      {/* Hamburger Menu Icon Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-center w-10 h-10 rounded-full hover:bg-secondary/20 transition-colors"
        aria-label="Settings"
      >
        <svg
          className="w-6 h-6 text-primary"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 6h16M4 12h16M4 18h16"
          />
        </svg>
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-64 rounded-xl border border-secondary/70 bg-white shadow-xl z-50 overflow-hidden">
          <div className="py-2">
            {/* Links Section */}
            <div className="px-4 py-3 border-b border-secondary/30">
              <button
                className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-secondary/20 transition-colors text-sm text-primary"
                onClick={() => setIsOpen(false)}
              >
                About Us
              </button>
              <button
                className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-secondary/20 transition-colors text-sm text-primary"
                onClick={() => setIsOpen(false)}
              >
                Privacy Policy
              </button>
            </div>

            {/* Auth Section */}
            <div className="px-4 py-3">
              {loading ? (
                <div className="text-sm text-slate-400 text-center py-2">Loading...</div>
              ) : user ? (
                <>
                  <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
                    Account
                  </div>
                  <div className="text-sm text-primary mb-3 px-3 py-2 rounded-lg bg-slate-50">
                    {user.displayName || user.email}
                  </div>
                  <button
                    onClick={handleSignOut}
                    className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-secondary/20 transition-colors text-sm text-primary"
                  >
                    Sign Out
                  </button>
                </>
              ) : (
                <button
                  onClick={handleSignIn}
                  className="flex items-center justify-center gap-3 w-full rounded-lg border border-[#DADCE0] bg-white px-4 py-2.5 text-sm font-medium text-[#3C4043] shadow-sm transition-all hover:bg-[#F8F9FA] hover:shadow-md"
                >
                  <GoogleLogo />
                  <span>Sign in with Google</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

