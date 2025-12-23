'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useStorefront } from '@/lib/storefront-context';
import { getDisplayImageUrl } from '@/lib/image-utils';
import { getCachedInfo, saveInfoToCache } from '@/lib/info-cache';
import { getFirebaseDb } from '@/lib/firebase';
import { getCollectionPath } from '@/lib/store-collections';
import { collection, getDocs, query, orderBy, limit } from 'firebase/firestore';
import SettingsMenu from '@/components/SettingsMenu';
import InstagramLogo from '@/components/InstagramLogo';
import { getStorefrontLogo } from '@/lib/storefront-logos';

export default function AboutUsClient({ initialProducts = [], info = null, storefront: storefrontProp = null }) {
  const storefrontFromContext = useStorefront();
  const storefront = storefrontProp || storefrontFromContext || 'LUNERA';
  const db = getFirebaseDb();

  // Get site info for colors and email
  const [siteInfo, setSiteInfo] = useState({
    colorPrimary: info?.colorPrimary || '#ec4899',
    colorSecondary: info?.colorSecondary || '#64748b',
    colorTertiary: info?.colorTertiary || '#94a3b8',
    email: info?.email || null,
  });

  // Fetch colors if not provided
  useEffect(() => {
    if (info?.colorPrimary) {
      setSiteInfo({
        colorPrimary: info.colorPrimary || '#ec4899',
        colorSecondary: info.colorSecondary || '#64748b',
        colorTertiary: info.colorTertiary || '#94a3b8',
        email: info.email || null,
      });
      return;
    }

    const fetchColors = async () => {
      try {
        // Try cache first
        const cachedInfo = getCachedInfo(storefront);
        if (cachedInfo) {
          setSiteInfo({
            colorPrimary: cachedInfo.colorPrimary || '#ec4899',
            colorSecondary: cachedInfo.colorSecondary || '#64748b',
            colorTertiary: cachedInfo.colorTertiary || '#94a3b8',
            email: cachedInfo.email || null,
          });
          return;
        }

        // Fetch from Firestore
        if (db) {
          const { doc, getDoc } = await import('firebase/firestore');
          // Info document is at: {storefront}/Info
          const infoRef = doc(db, storefront, 'Info');
          const infoSnap = await getDoc(infoRef);
          if (infoSnap.exists()) {
            const data = infoSnap.data();
            const infoData = {
              colorPrimary: data.colorPrimary || '#ec4899',
              colorSecondary: data.colorSecondary || '#64748b',
              colorTertiary: data.colorTertiary || '#94a3b8',
              email: data.email || null,
            };
            setSiteInfo(infoData);
            saveInfoToCache(storefront, data);
          }
        }
      } catch (error) {
        console.error('Failed to fetch site info:', error);
      }
    };

    fetchColors();
  }, [db, storefront, info]);

  // Get top product by views - show only the single top product
  const topProduct = useMemo(() => {
    if (!initialProducts || initialProducts.length === 0) return null;
    // Sort by totalViews and take top 1
    const sorted = [...initialProducts].sort((a, b) => {
      const aViews = a.metrics?.totalViews || a.viewCount || 0;
      const bViews = b.metrics?.totalViews || b.viewCount || 0;
      return bViews - aViews;
    });
    return sorted[0];
  }, [initialProducts]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-white via-secondary/40 to-white">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-secondary/70 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
          <Link href={storefront === 'LUNERA' ? '/' : `/${storefront}`} className="flex items-center">
            <Image
              src={getStorefrontLogo(storefront, siteInfo)}
              alt={siteInfo.companyName || storefront}
              width={300}
              height={100}
              className="h-12 w-auto sm:h-16"
              priority
            />
          </Link>
          <SettingsMenu 
            secondaryColor={siteInfo.colorSecondary || '#64748b'} 
            primaryColor={siteInfo.colorPrimary || '#ec4899'}
            email={siteInfo.email || null}
          />
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          {/* Left: Top Product - Hidden on mobile */}
          <div className="order-2 lg:order-1 hidden lg:block">
            {topProduct ? (
              <div className="relative w-full overflow-hidden rounded-lg" style={{ aspectRatio: '1 / 1' }}>
                {(() => {
                  const imageUrl = topProduct.images?.[0] || topProduct.image || '';
                  // Use full quality image URL (remove any size parameters) for better quality
                  const fullQualityUrl = imageUrl ? imageUrl.split('?')[0] : '';
                  return fullQualityUrl ? (
                    <Image
                      src={fullQualityUrl}
                      alt={topProduct.name || 'Product'}
                      fill
                      className="object-cover"
                      sizes="(max-width: 768px) 100vw, 50vw"
                      quality={95}
                      priority
                    />
                  ) : (
                    <div className="w-full h-full bg-zinc-200 flex items-center justify-center">
                      <span className="text-zinc-400 text-xs">No image</span>
                    </div>
                  );
                })()}
              </div>
            ) : (
              <div className="w-full bg-zinc-200 rounded-lg flex items-center justify-center" style={{ aspectRatio: '1 / 1' }}>
                <span className="text-zinc-400">No products available</span>
              </div>
            )}
          </div>

          {/* Right: Text Content */}
          <div className="order-1 lg:order-2 space-y-6">
            <h1 
              className="text-4xl sm:text-5xl font-semibold"
              style={{ color: siteInfo.colorPrimary || '#ec4899' }}
            >
              About Us
            </h1>
            <div 
              className="text-lg leading-relaxed space-y-4"
              style={{ color: siteInfo.colorSecondary || '#64748b' }}
            >
              <p>
                We are combining the sexy, confident, brave and elegancy to wear you. At LUNERA, we believe that what you wear should reflect who you are - bold, beautiful, and unapologetically yourself.
              </p>
              <p>
                Wear, feel and be sexy with LUNERA. Our carefully curated collection is designed to make you feel confident and empowered in your own skin. Every piece is thoughtfully selected to celebrate your unique style and personality.
              </p>
              <p>
                We guarantee quality and delivery. Your satisfaction is our priority, and we stand behind every product we offer. From the moment you browse our collection to the day your order arrives, we're committed to providing you with an exceptional experience.
              </p>
              <p>
                We hope you love our products as much as we love them, and we love you! Your support means everything to us, and we're grateful to be part of your journey.
              </p>
              <div className="pt-4 border-t" style={{ borderColor: `${siteInfo.colorSecondary || '#64748b'}33` }}>
                <p className="mb-4">
                  Stay up to date on our newest products and exclusive offers. Follow us on Instagram to be the first to know about new arrivals, styling tips, and special promotions.
                </p>
                <div className="flex items-center gap-4">
                  <a
                    href="https://www.instagram.com/lunerashop.co?igsh=MTd3d3pxdWZ6MWpsbw%3D%3D"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center w-8 h-8 rounded-full transition-transform duration-200 hover:scale-110 flex-shrink-0"
                    style={{ 
                      backgroundColor: siteInfo.colorPrimary || '#ec4899',
                    }}
                    aria-label="Follow us on Instagram"
                  >
                    <InstagramLogo size="w-9 h-9" bgColor="transparent" bgOpacity={1} />
                  </a>
                  <p 
                    className="text-sm"
                    style={{ color: siteInfo.colorSecondary || '#64748b' }}
                  >
                    Follow us on Instagram to see the latest catalog
                  </p>
                </div>
                {siteInfo.email && (
                  <a
                    href={`mailto:${siteInfo.email}`}
                    className="inline-flex items-center gap-3 px-6 py-3 rounded-lg transition-all font-medium border-2 mt-3"
                    style={{ 
                      borderColor: siteInfo.colorPrimary || '#ec4899',
                      color: siteInfo.colorPrimary || '#ec4899',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = `${siteInfo.colorPrimary || '#ec4899'}10`;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }}
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    <span>{siteInfo.email}</span>
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

