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

export default function AboutUsClient({ initialProducts = [], info = null, storefront: storefrontProp = null }) {
  const storefrontFromContext = useStorefront();
  const storefront = storefrontProp || storefrontFromContext || 'LUNERA';
  const db = getFirebaseDb();

  // Get site info for colors
  const [siteInfo, setSiteInfo] = useState({
    colorPrimary: info?.colorPrimary || '#ec4899',
    colorSecondary: info?.colorSecondary || '#64748b',
    colorTertiary: info?.colorTertiary || '#94a3b8',
  });

  // Fetch colors if not provided
  useEffect(() => {
    if (info?.colorPrimary) {
      setSiteInfo({
        colorPrimary: info.colorPrimary || '#ec4899',
        colorSecondary: info.colorSecondary || '#64748b',
        colorTertiary: info.colorTertiary || '#94a3b8',
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

  // Get top products by views - need 9 for 3x3, or 12 for 3 rows of 4
  const topProducts = useMemo(() => {
    // Sort by totalViews and take top 12 (to have options for 3x4 layout)
    const sorted = [...initialProducts].sort((a, b) => {
      const aViews = a.metrics?.totalViews || a.viewCount || 0;
      const bViews = b.metrics?.totalViews || b.viewCount || 0;
      return bViews - aViews;
    });
    return sorted.slice(0, 12);
  }, [initialProducts]);

  // Determine layout: if we have exactly 9, use 3x3, otherwise use 3 rows of 4 (12 products)
  const hasNineProducts = topProducts.length === 9;
  const gridLayout = hasNineProducts ? 'grid-cols-3' : 'grid-cols-4';
  const productsToShow = hasNineProducts ? topProducts : topProducts.slice(0, 12);

  return (
    <div className="min-h-screen bg-gradient-to-b from-white via-secondary/40 to-white">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-secondary/70 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
          <Link href={storefront === 'LUNERA' ? '/' : `/${storefront}`} className="flex items-center">
            <Image
              src="/Blerinas/Lunera_logo.png"
              alt="Lunera"
              width={300}
              height={100}
              className="h-12 w-auto sm:h-16"
              priority
            />
          </Link>
          <SettingsMenu 
            secondaryColor={siteInfo.colorSecondary || '#64748b'} 
            primaryColor={siteInfo.colorPrimary || '#ec4899'} 
          />
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          {/* Left: Product Grid */}
          <div className="order-2 lg:order-1">
            <div className={`grid ${gridLayout} gap-2 w-full`} style={{ aspectRatio: '1 / 1' }}>
              {productsToShow.map((product, index) => {
                const imageUrl = product.images?.[0] || product.image || '';
                return (
                  <div
                    key={product.id || index}
                    className="relative w-full overflow-hidden rounded-lg"
                    style={{ aspectRatio: '1 / 1' }}
                  >
                    {imageUrl ? (
                      <Image
                        src={getDisplayImageUrl(imageUrl)}
                        alt={product.name || 'Product'}
                        fill
                        className="object-cover"
                        sizes="(max-width: 768px) 33vw, 25vw"
                      />
                    ) : (
                      <div className="w-full h-full bg-zinc-200 flex items-center justify-center">
                        <span className="text-zinc-400 text-xs">No image</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
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
                <p className="mb-3">
                  Stay up to date on our newest products and exclusive offers. Follow us on Instagram to be the first to know about new arrivals, styling tips, and special promotions.
                </p>
                <a
                  href="https://www.instagram.com/lunerashop.co?igsh=MTd3d3pxdWZ6MWpsbw%3D%3D"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-lg transition-all text-white font-medium"
                  style={{ backgroundColor: siteInfo.colorPrimary || '#ec4899' }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.opacity = '0.9';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.opacity = '1';
                  }}
                >
                  <svg
                    className="w-5 h-5"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path d="M12.315 2c2.43 0 2.784.013 3.808.06 1.064.049 1.791.218 2.427.465a4.902 4.902 0 011.772 1.153 4.902 4.902 0 011.153 1.772c.247.636.416 1.363.465 2.427.048 1.067.06 1.407.06 4.123v.08c0 2.643-.012 2.987-.06 4.043-.049 1.064-.218 1.791-.465 2.427a4.902 4.902 0 01-1.153 1.772 4.902 4.902 0 01-1.772 1.153c-.636.247-1.363.416-2.427.465-1.067.048-1.407.06-4.123.06h-.08c-2.643 0-2.987-.012-4.043-.06-1.064-.049-1.791-.218-2.427-.465a4.902 4.902 0 01-1.772-1.153 4.902 4.902 0 01-1.153-1.772c-.247-.636-.416-1.363-.465-2.427-.047-1.024-.06-1.379-.06-3.808v-.63c0-2.43.013-2.784.06-3.808.049-1.064.218-1.791.465-2.427a4.902 4.902 0 011.153-1.772A4.902 4.902 0 015.45 2.525c.636-.247 1.363-.416 2.427-.465C8.901 2.013 9.256 2 11.685 2h.63zm-.081 1.802h-.468c-2.456 0-2.784.011-3.807.058-.975.045-1.504.207-1.857.344-.467.182-.8.398-1.15.748-.35.35-.566.683-.748 1.15-.137.353-.3.882-.344 1.857-.047 1.023-.058 1.351-.058 3.807v.468c0 2.456.011 2.784.058 3.807.045.975.207 1.504.344 1.857.182.466.399.8.748 1.15.35.35.683.566 1.15.748.353.137.882.3 1.857.344 1.054.048 1.37.058 4.041.058h.08c2.597 0 2.917-.01 3.96-.058.976-.045 1.505-.207 1.858-.344.466-.182.8-.398 1.15-.748.35-.35.566-.683.748-1.15.137-.353.3-.882.344-1.857.048-1.055.058-1.37.058-4.041v-.08c0-2.597-.01-2.917-.058-3.96-.045-.976-.207-1.505-.344-1.858a3.097 3.097 0 00-.748-1.15 3.098 3.098 0 00-1.15-.748c-.353-.137-.882-.3-1.857-.344-1.023-.047-1.351-.058-3.807-.058zM12 6.865a5.135 5.135 0 110 10.27 5.135 5.135 0 010-10.27zm0 1.802a3.333 3.333 0 100 6.666 3.333 3.333 0 000-6.666zm5.338-3.205a1.2 1.2 0 110 2.4 1.2 1.2 0 010-2.4z" />
                  </svg>
                  Follow us on Instagram
                </a>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

