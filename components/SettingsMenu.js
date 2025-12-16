'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { signInWithGoogle, signOutUser, isAdmin, subscribeToAuth } from '@/lib/auth';
import { useRouter } from 'next/navigation';
import { getStorefront } from '@/lib/get-storefront';
import Link from 'next/link';
import { useStorefront } from '@/lib/storefront-context';

export default function SettingsMenu({ secondaryColor = '#64748b', primaryColor = '#ec4899' }) {
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
        router.push('/admin/overview');
      }
    });

    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [router]);

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
  const instagramUrl = 'https://www.instagram.com/lunerashop.co?igsh=MTd3d3pxdWZ6MWpsbw%3D%3D';

  return (
    <>
      {/* Hamburger Menu Icon Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-center w-10 h-10 rounded-full hover:bg-secondary/20 transition-colors"
        aria-label="Settings"
        style={{ color: secondaryColor }}
      >
        <svg
          className="w-6 h-6"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          style={{ color: secondaryColor }}
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
                  <a
                    href={instagramUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 px-4 py-3 rounded-lg transition-all text-sm border-2 border-transparent hover:border-opacity-50"
                    style={{ color: secondaryColor }}
                    onMouseEnter={(e) => e.currentTarget.style.borderColor = primaryColor}
                    onMouseLeave={(e) => e.currentTarget.style.borderColor = 'transparent'}
                  >
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M12.315 2c2.43 0 2.784.013 3.808.06 1.064.049 1.791.218 2.427.465a4.902 4.902 0 011.772 1.153 4.902 4.902 0 011.153 1.772c.247.636.416 1.363.465 2.427.048 1.067.06 1.407.06 4.123v.08c0 2.643-.012 2.987-.06 4.043-.049 1.064-.218 1.791-.465 2.427a4.902 4.902 0 01-1.153 1.772 4.902 4.902 0 01-1.772 1.153c-.636.247-1.363.416-2.427.465-1.067.048-1.407.06-4.123.06h-.08c-2.643 0-2.987-.012-4.043-.06-1.064-.049-1.791-.218-2.427-.465a4.902 4.902 0 01-1.772-1.153 4.902 4.902 0 01-1.153-1.772c-.247-.636-.416-1.363-.465-2.427-.047-1.024-.06-1.379-.06-3.808v-.63c0-2.43.013-2.784.06-3.808.049-1.064.218-1.791.465-2.427a4.902 4.902 0 011.153-1.772A4.902 4.902 0 015.45 2.525c.636-.247 1.363-.416 2.427-.465C8.901 2.013 9.256 2 11.685 2h.63zm-.081 1.802h-.468c-2.456 0-2.784.011-3.807.058-.975.045-1.504.207-1.857.344-.467.182-.8.398-1.15.748-.35.35-.566.683-.748 1.15-.137.353-.3.882-.344 1.857-.047 1.023-.058 1.351-.058 3.807v.468c0 2.456.011 2.784.058 3.807.045.975.207 1.504.344 1.857.182.466.399.8.748 1.15.35.35.683.566 1.15.748.353.137.882.3 1.857.344 1.054.048 1.37.058 4.041.058h.08c2.597 0 2.917-.01 3.96-.058.976-.045 1.505-.207 1.858-.344.466-.182.8-.398 1.15-.748.35-.35.566-.683.748-1.15.137-.353.3-.882.344-1.857.048-1.055.058-1.37.058-4.041v-.08c0-2.597-.01-2.917-.058-3.96-.045-.976-.207-1.505-.344-1.858a3.097 3.097 0 00-.748-1.15 3.098 3.098 0 00-1.15-.748c-.353-.137-.882-.3-1.857-.344-1.023-.047-1.351-.058-3.807-.058zM12 6.865a5.135 5.135 0 110 10.27 5.135 5.135 0 010-10.27zm0 1.802a3.333 3.333 0 100 6.666 3.333 3.333 0 000-6.666zm5.338-3.205a1.2 1.2 0 110 2.4 1.2 1.2 0 010-2.4z" />
                    </svg>
                    <span>Instagram</span>
                  </a>
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
            </div>
          </nav>
        </>,
        document.body
      )}
    </>
  );
}
