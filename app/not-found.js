'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useStorefront } from '@/lib/storefront-context';
import { getStorefront } from '@/lib/get-storefront';
import Image from 'next/image';

export default function NotFound() {
  const storefrontFromContext = useStorefront();
  const [storefront, setStorefront] = useState('LUNERA');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Get storefront from context first, then calculate it
    // getStorefront() will check cookie (set by middleware), then cache, then URL
    // This ensures we get the most accurate storefront
    const currentStorefront = storefrontFromContext || getStorefront();
    setStorefront(currentStorefront);
    setMounted(true);
  }, [storefrontFromContext]);

  // Calculate home path based on storefront
  const homePath = storefront === 'LUNERA' ? '/' : `/${storefront}`;

  return (
    <div className="min-h-screen bg-gradient-to-b from-white via-secondary/40 to-white flex items-center justify-center px-4">
      <div className="max-w-2xl w-full text-center">
        {/* Logo */}
        <div className="mb-8 flex justify-center">
          <Link href={homePath}>
            <Image
              src="/Blerinas/Blerinas-logo-transparent2.png"
              alt="Blerinas"
              width={300}
              height={100}
              className="h-16 w-auto sm:h-20"
              priority
            />
          </Link>
        </div>

        {/* 404 Content */}
        <div className="space-y-6">
          <h1 className="text-9xl font-bold text-primary/20 sm:text-[12rem]">
            404
          </h1>
          
          <div className="space-y-4">
            <h2 className="text-3xl font-semibold text-slate-900 sm:text-4xl">
              Page Not Found
            </h2>
            <p className="text-lg text-slate-600 max-w-md mx-auto">
              Sorry, we couldn't find the page you're looking for. The page might have been moved or doesn't exist.
            </p>
          </div>

          {/* Navigation Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center pt-6">
            <Link
              href={homePath}
              className="rounded-full border border-primary/30 bg-white/80 px-8 py-3 text-sm font-medium text-primary shadow-sm transition-colors hover:bg-secondary hover:text-primary"
            >
              Go to {storefront === 'LUNERA' ? 'Home' : `${storefront} Home`}
            </Link>
            
            <button
              onClick={() => window.history.back()}
              className="rounded-full border border-slate-300 bg-white/80 px-8 py-3 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
            >
              Go Back
            </button>
          </div>

          {/* Storefront Info (only show if not LUNERA) */}
          {storefront !== 'LUNERA' && mounted && (
            <p className="text-sm text-slate-500 pt-4">
              Current storefront: <span className="font-medium text-primary">{storefront}</span>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

