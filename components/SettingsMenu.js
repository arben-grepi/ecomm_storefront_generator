'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { signInWithGoogle, signOutUser, isAdmin, subscribeToAuth } from '@/lib/auth';
import { useRouter } from 'next/navigation';
import { getStorefront } from '@/lib/get-storefront';
import Link from 'next/link';
import { useStorefront } from '@/lib/storefront-context';
import InstagramLogo from '@/components/InstagramLogo';

export default function SettingsMenu({ 
  secondaryColor = '#64748b', 
  primaryColor = '#ec4899', 
  email = null,
  instagramUrl = '',
  instagramBgColor = 'primary',
  showInstagram = false,
  emailAddress = '',
  emailColor = 'primary',
  showEmail = false,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);
  const router = useRouter();
  const storefront = useStorefront();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeToAuth((currentUser) => {
      setUser(currentUser);
      setLoading(false);

      if (currentUser && isAdmin(currentUser.email)) {
        // Store current storefront before navigating to admin
        if (storefront && typeof window !== 'undefined') {
          sessionStorage.setItem('admin_storefront', storefront);
        }
        router.push('/admin/overview');
      }
    });

    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [router, storefront]);

  // Prevent body scroll when menu is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  const handleSignIn = async () => {
    try {
      const user = await signInWithGoogle();
      setIsOpen(false);
      if (isAdmin(user.email)) {
        // Store current storefront before navigating to admin
        if (storefront && typeof window !== 'undefined') {
          sessionStorage.setItem('admin_storefront', storefront);
        }
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
      
      const storedStorefront = typeof window !== 'undefined' 
        ? sessionStorage.getItem('admin_storefront') 
        : null;
      
      const currentStorefront = storedStorefront || getStorefront();
      
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem('admin_storefront');
      }
      
      const redirectPath = currentStorefront === 'LUNERA' ? '/' : `/${currentStorefront}`;
      router.push(redirectPath);
    } catch (error) {
      console.error('Sign out error:', error);
    }
  };

  const GoogleLogo = () => (
    <svg className="h-5 w-5 flex-shrink-0" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M23.49 12.27c0-.82-.07-1.64-.21-2.44H12v4.62h6.41c-.27 1.48-1.11 2.74-2.37 3.58v2.95h3.84c2.25-2.07 3.54-5.12 3.54-8.71z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.94-2.91l-3.84-2.95c-1.06.71-2.44 1.12-4.1 1.12-3.16 0-5.83-2.13-6.78-4.99H1.24v3.14C3.21 21.68 7.3 24 12 24z" />
      <path fill="#FBBC05" d="M5.22 14.27c-.24-.71-.35-1.36-.35-2.09s.13-1.43.35-2.09V6.59H1.24A11.97 11.97 0 0 0 0 12c0 1.94.46 3.77 1.24 5.41l3.98-3.14z" />
      <path fill="#EA4335" d="M12 4.75c1.76 0 3.34.61 4.58 1.8l3.42-3.42C17.94 1.21 15.22 0 12 0 7.3 0 3.21 2.32 1.24 6.59l3.98 3.14C6.17 6.88 8.84 4.75 12 4.75z" />
    </svg>
  );

  const aboutUsPath = storefront === 'LUNERA' ? '/about' : `/${storefront}/about`;
  
  // Helper to get color from selection
  const getColorFromSelection = (colorSelection) => {
    switch (colorSelection) {
      case 'primary': return primaryColor;
      case 'secondary': return secondaryColor;
      case 'tertiary': return '#94a3b8'; // Default tertiary
      default: return primaryColor;
    }
  };

  return (
    <>
      {/* Hamburger Menu Icon Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-center w-10 h-10 rounded-full hover:bg-secondary/20 transition-colors"
        aria-label="Settings"
        style={{ color: primaryColor }}
      >
        <svg
          className="w-6 h-6"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          style={{ color: primaryColor }}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 6h16M4 12h16M4 18h16"
          />
        </svg>
      </button>

      {/* Menu Overlay - Rendered to document.body via portal */}
      {mounted && isOpen && createPortal(
        <>
          {/* Blurred backdrop */}
          <div 
            className="fixed inset-0 bg-black/30 backdrop-blur-md z-[999]"
            onClick={() => setIsOpen(false)}
          />
          
          {/* Menu Panel */}
          <nav 
            className="fixed top-0 right-0 h-full w-80 max-w-[85vw] bg-white shadow-2xl z-[1000] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-col h-full">
              {/* Header */}
              <div className="flex items-center justify-between p-6 border-b" style={{ borderColor: `${secondaryColor}30` }}>
                <h2 className="text-xl font-semibold" style={{ color: primaryColor }}>Menu</h2>
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-2 rounded-full hover:bg-secondary/20 transition-colors"
                  style={{ color: secondaryColor }}
                  aria-label="Close menu"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Navigation Content */}
              <div className="flex-1 overflow-y-auto py-6">
                {/* Navigation Links */}
                <div className="space-y-2 px-4">
                  <Link
                    href={storefront === 'LUNERA' ? '/' : `/${storefront}`}
                    onClick={() => setIsOpen(false)}
                    className="block px-4 py-3 rounded-lg transition-all text-sm border-2 border-transparent hover:border-opacity-50"
                    style={{ color: secondaryColor }}
                    onMouseEnter={(e) => e.currentTarget.style.borderColor = primaryColor}
                    onMouseLeave={(e) => e.currentTarget.style.borderColor = 'transparent'}
                  >
                    Home
                  </Link>
                  <Link
                    href={aboutUsPath}
                    onClick={() => setIsOpen(false)}
                    className="block px-4 py-3 rounded-lg transition-all text-sm border-2 border-transparent hover:border-opacity-50"
                    style={{ color: secondaryColor }}
                    onMouseEnter={(e) => e.currentTarget.style.borderColor = primaryColor}
                    onMouseLeave={(e) => e.currentTarget.style.borderColor = 'transparent'}
                  >
                    About Us
                  </Link>
                  <Link
                    href={storefront === 'LUNERA' ? '/privacy' : `/${storefront}/privacy`}
                    onClick={() => setIsOpen(false)}
                    className="block px-4 py-3 rounded-lg transition-all text-sm border-2 border-transparent hover:border-opacity-50"
                    style={{ color: secondaryColor }}
                    onMouseEnter={(e) => e.currentTarget.style.borderColor = primaryColor}
                    onMouseLeave={(e) => e.currentTarget.style.borderColor = 'transparent'}
                  >
                    Privacy Policy
                  </Link>
                </div>

                {/* Divider */}
                <div className="my-6 px-4">
                  <div className="border-t" style={{ borderColor: `${secondaryColor}30` }}></div>
                </div>

                {/* Auth Section */}
                <div className="px-4">
                  {loading ? (
                    <div className="text-sm text-center py-2" style={{ color: `${secondaryColor}66` }}>Loading...</div>
                  ) : user ? (
                    <>
                      <div className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: `${secondaryColor}99` }}>
                        Account
                      </div>
                      <div className="text-sm mb-3 px-4 py-2 rounded-lg bg-slate-50" style={{ color: secondaryColor }}>
                        {user.displayName || user.email}
                      </div>
                      <button
                        onClick={handleSignOut}
                        className="w-full text-left px-4 py-3 rounded-lg transition-all text-sm border-2 border-transparent hover:border-opacity-50"
                        style={{ color: secondaryColor }}
                        onMouseEnter={(e) => e.currentTarget.style.borderColor = primaryColor}
                        onMouseLeave={(e) => e.currentTarget.style.borderColor = 'transparent'}
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

              {/* Footer with Instagram and Email */}
              {(showInstagram || showEmail) && (
                <div className="border-t p-6" style={{ borderColor: `${secondaryColor}30` }}>
                  <div className="flex items-center justify-center gap-6">
                    {showInstagram && instagramUrl && (
                      <a
                        href={instagramUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="transition-transform duration-200 hover:scale-110"
                        aria-label="Instagram"
                      >
                        <InstagramLogo 
                          size="w-6 h-6" 
                          bgColor={getColorFromSelection(instagramBgColor || 'primary')}
                        />
                      </a>
                    )}
                    {showEmail && emailAddress && (
                      <a
                        href={`mailto:${emailAddress}`}
                        className="transition-transform duration-200 hover:scale-110"
                        aria-label="Email"
                        style={{ color: getColorFromSelection(emailColor || 'primary') }}
                      >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                      </a>
                    )}
                  </div>
                </div>
              )}
            </div>
          </nav>
        </>,
        document.body
      )}
    </>
  );
}
