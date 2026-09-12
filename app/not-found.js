'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useStorefront } from '@/lib/storefront-context';
import { getStorefront } from '@/lib/get-storefront';
import Image from 'next/image';
import { getLogo } from '@/lib/logo-cache';
import { getFirebaseDb } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { getCachedInfo } from '@/lib/info-cache';
import { getStorefrontHomePath } from '@/lib/storefront-paths';
import { useT } from '@/lib/i18n/language-context';

export default function NotFound() {
  const storefrontFromContext = useStorefront();
  const [storefront, setStorefront] = useState('LUNERA');
  const [mounted, setMounted] = useState(false);
  const [info, setInfo] = useState(null);
  const t = useT();

  useEffect(() => {
    // Get storefront from cookie/cache (set by middleware) - don't use URL parameters
    // This ensures 404 page uses the correct storefront even if URL is wrong
    // Priority: Context (from cookie) > getStorefront() (checks cookie, then cache)
    const currentStorefront = storefrontFromContext || getStorefront();
    setStorefront(currentStorefront);
    setMounted(true);
  }, [storefrontFromContext]);

  // Fetch info document to get logo from Firestore
  useEffect(() => {
    if (!storefront || !mounted) return;

    const fetchInfo = async () => {
      try {
        // Try cache first
        const cachedInfo = getCachedInfo(storefront);
        if (cachedInfo) {
          setInfo(cachedInfo);
          return;
        }

        // Fetch from Firestore
        const db = getFirebaseDb();
        if (db) {
          const infoDoc = await getDoc(doc(db, storefront, 'Info'));
          if (infoDoc.exists()) {
            const data = infoDoc.data();
            setInfo(data);
            
            // Cache logo as well
            const { getLogo, saveLogoToCache } = await import('@/lib/logo-cache');
            const logoPath = getLogo(storefront, data);
            if (logoPath) {
              saveLogoToCache(storefront, logoPath);
            }
          }
        }
      } catch (error) {
        console.error('[404] Failed to fetch info for logo:', error);
      }
    };

    fetchInfo();
  }, [storefront, mounted]);

  // Calculate home path based on storefront
  const homePath = getStorefrontHomePath(storefront);

  return (
    <div className="min-h-screen bg-gradient-to-b from-white via-secondary/40 to-white flex items-center justify-center px-4">
      <div className="max-w-2xl w-full text-center">
        {/* Logo */}
        <div className="mb-8 flex justify-center">
          <Link href={homePath}>
            <Image
              src={getLogo(storefront, info)}
              alt={storefront === 'LUNERA' ? 'Lunera' : storefront}
              width={300}
              height={100}
              className="h-16 w-auto sm:h-20 object-contain flex-shrink-0"
              style={{ objectFit: 'contain' }}
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
              {t('notFound.title')}
            </h2>
            <p className="text-lg text-slate-600 max-w-md mx-auto">
              {t('notFound.body')}
            </p>
          </div>

          {/* Navigation Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center pt-6">
            <Link
              href={homePath}
              className="rounded-full border border-primary/30 bg-white/80 px-8 py-3 text-sm font-medium text-primary shadow-sm transition-colors hover:bg-secondary hover:text-primary"
            >
              {storefront === 'LUNERA' ? t('notFound.goHome') : t('notFound.goStorefrontHome', { storefront })}
            </Link>
            
            <button
              onClick={() => window.history.back()}
              className="rounded-full border border-slate-300 bg-white/80 px-8 py-3 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
            >
              {t('common.goBack')}
            </button>
          </div>

          {/* Storefront Info (only show if not LUNERA) */}
          {storefront !== 'LUNERA' && mounted && (
            <p className="text-sm text-slate-500 pt-4">
              {t('notFound.currentStorefront', { storefront })}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

