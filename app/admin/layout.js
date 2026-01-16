'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { subscribeToAuth, isAdmin, signOutUser } from '@/lib/auth';
import { getStorefront } from '@/lib/get-storefront';
import { WebsiteProvider, useWebsite } from '@/lib/website-context';

function AdminLayoutContent({ children }) {
  const router = useRouter();
  const { selectedWebsite } = useWebsite();
  const [loading, setLoading] = useState(true);

  // Capture and store the referrer/storefront when entering admin
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Check if we already have a stored storefront (don't overwrite it)
    // Check both admin_storefront (set by overview page) and admin_referrer (set by layout)
    const existingStorefront = sessionStorage.getItem('admin_storefront') || sessionStorage.getItem('admin_referrer');
    if (existingStorefront) {
      // Ensure both are set for consistency
      if (!sessionStorage.getItem('admin_storefront')) {
        sessionStorage.setItem('admin_storefront', existingStorefront);
      }
      if (!sessionStorage.getItem('admin_referrer')) {
        sessionStorage.setItem('admin_referrer', existingStorefront);
      }
      return; // Already captured, don't overwrite
    }

    // Try to get storefront from cookie (set by middleware when on storefront)
    const cookies = document.cookie.split(';').map(c => c.trim());
    const storefrontCookie = cookies.find(c => c.startsWith('storefront='));
    
    if (storefrontCookie) {
      const storefront = storefrontCookie.split('=')[1];
      if (storefront) {
        // Store the storefront we came from (store in both for consistency)
        sessionStorage.setItem('admin_referrer', storefront);
        sessionStorage.setItem('admin_storefront', storefront);
        return;
      }
    }

    // Fallback: try to extract storefront from document.referrer
    const referrer = document.referrer;
    if (referrer) {
      try {
        const referrerUrl = new URL(referrer);
        const referrerPath = referrerUrl.pathname;
        const segments = referrerPath.split('/').filter(Boolean);
        
        // Check if referrer contains a storefront path
        const excludedSegments = ['admin', 'api', 'thank-you', 'order-confirmation', 'unavailable', '_next', 'cart', 'orders'];
        if (segments.length > 0 && !excludedSegments.includes(segments[0].toLowerCase())) {
          const storefront = segments[0].toUpperCase();
          // Store in both for consistency
          sessionStorage.setItem('admin_referrer', storefront);
          sessionStorage.setItem('admin_storefront', storefront);
          return;
        }
      } catch (e) {
        // Invalid URL, ignore
      }
    }

    // Last fallback: use current storefront detection or selectedWebsite from context
    const currentStorefront = selectedWebsite || getStorefront();
    if (currentStorefront && currentStorefront !== 'FIVESTARFINDS') {
      sessionStorage.setItem('admin_referrer', currentStorefront);
      sessionStorage.setItem('admin_storefront', currentStorefront);
    } else {
      // Default to FIVESTARFINDS if we can't determine
      sessionStorage.setItem('admin_referrer', 'FIVESTARFINDS');
      sessionStorage.setItem('admin_storefront', 'FIVESTARFINDS');
    }
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeToAuth((user) => {
      if (!user || !isAdmin(user.email)) {
        router.push('/');
      } else {
        setLoading(false);
      }
    });

    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [router]);

  const handleSignOut = async () => {
    await signOutUser();
    
    // Get the stored storefront BEFORE clearing sessionStorage
    let storefront = null;
    if (typeof window !== 'undefined') {
      // Try admin_storefront first (set by admin overview page)
      storefront = sessionStorage.getItem('admin_storefront');
      
      // Fallback to admin_referrer (set by admin layout on entry)
      if (!storefront) {
        storefront = sessionStorage.getItem('admin_referrer');
      }
      
      // Clear stored values after reading them
      sessionStorage.removeItem('admin_storefront');
      sessionStorage.removeItem('admin_referrer');
    }
    
    // Redirect to the storefront we came from, or default to FIVESTARFINDS
    if (storefront && storefront !== 'FIVESTARFINDS') {
      router.push(`/${storefront}`);
    } else {
      // FIVESTARFINDS is the default storefront (root redirects to /FIVESTARFINDS)
      router.push('/FIVESTARFINDS');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-600">Loading...</p>
      </div>
    );
  }

  return (
    <div>
      <nav className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <h1 className="text-xl font-semibold text-gray-800 dark:text-gray-100">Admin Dashboard</h1>
            </div>
            <button
              onClick={handleSignOut}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
            >
              Sign Out
            </button>
          </div>
        </div>
      </nav>
      {children}
    </div>
  );
}

export default function AdminLayout({ children }) {
  return (
    <WebsiteProvider>
      <AdminLayoutContent>{children}</AdminLayoutContent>
    </WebsiteProvider>
  );
}

