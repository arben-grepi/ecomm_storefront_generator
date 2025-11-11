'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';

const BANNER_STORAGE_KEY = 'ecommerce_under_construction_dismissed';

export default function UnderConstructionBanner() {
  const [isVisible, setIsVisible] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    // Check if banner was dismissed
    if (typeof window !== 'undefined') {
      const dismissed = localStorage.getItem(BANNER_STORAGE_KEY);
      if (dismissed) {
        setIsDismissed(true);
        setIsVisible(false);
      } else {
        setIsVisible(true);
      }
    }
  }, []);

  // Reset visibility when pathname changes (optional - remove if you want it to stay dismissed)
  // useEffect(() => {
  //   setIsVisible(!isDismissed);
  // }, [pathname, isDismissed]);

  const handleDismiss = () => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(BANNER_STORAGE_KEY, 'true');
      setIsDismissed(true);
      setIsVisible(false);
    }
  };

  if (!isVisible || isDismissed) {
    return null;
  }

  return (
    <div className="relative z-50 border-b border-amber-200 bg-gradient-to-r from-amber-50 via-yellow-50 to-amber-50 px-4 py-3 shadow-sm">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex-shrink-0">
            <svg
              className="h-5 w-5 text-amber-600"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="2"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
              />
            </svg>
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-amber-800">
              <span className="font-semibold">Site Under Construction:</span> We're building something amazing! 
              Orders are currently disabled while we finalize our setup. 
              <span className="block mt-1 text-xs text-amber-700">
                Note: Product photos shown are placeholders and do not represent actual products. All data is for demonstration purposes only.
              </span>
            </p>
          </div>
        </div>
        <button
          onClick={handleDismiss}
          className="flex-shrink-0 rounded-lg p-1 text-amber-600 transition hover:bg-amber-100 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2"
          aria-label="Dismiss banner"
        >
          <svg
            className="h-5 w-5"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth="2"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}

