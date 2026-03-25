'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useStorefront } from '@/lib/storefront-context';
import { getCachedInfo, saveInfoToCache } from '@/lib/info-cache';
import { getFirebaseDb } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import SettingsMenu from '@/components/SettingsMenu';
import { getLogo } from '@/lib/logo-cache';

export default function PrivacyPolicyClient({ info = null, storefront: storefrontProp = null }) {
  const storefrontFromContext = useStorefront();
  const storefront = storefrontProp || storefrontFromContext || 'FIVESTARFINDS';
  const db = getFirebaseDb();

  // Get site info for colors, social links, and privacy policy sections
  const [siteInfo, setSiteInfo] = useState({
    colorPrimary: info?.colorPrimary || '#ec4899',
    colorSecondary: info?.colorSecondary || '#64748b',
    colorTertiary: info?.colorTertiary || '#94a3b8',
    instagramUrl: info?.instagramUrl || '',
    instagramBgColor: info?.instagramBgColor || 'primary',
    showInstagram: info?.showInstagram === true,
    emailAddress: info?.emailAddress || '',
    emailColor: info?.emailColor || 'primary',
    showEmail: info?.showEmail === true,
    privacyPolicySections: info?.privacyPolicySections || [],
  });

  useEffect(() => {
      if (info?.colorPrimary) {
        setSiteInfo({
          colorPrimary: info.colorPrimary || '#ec4899',
          colorSecondary: info.colorSecondary || '#64748b',
          colorTertiary: info.colorTertiary || '#94a3b8',
          instagramUrl: info.instagramUrl || '',
          instagramBgColor: info.instagramBgColor || 'primary',
          showInstagram: info.showInstagram === true,
          emailAddress: info.emailAddress || '',
          emailColor: info.emailColor || 'primary',
          showEmail: info.showEmail === true,
          privacyPolicySections: info.privacyPolicySections || [],
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
            instagramUrl: cachedInfo.instagramUrl || '',
            instagramBgColor: cachedInfo.instagramBgColor || 'primary',
            showInstagram: cachedInfo.showInstagram === true,
            emailAddress: cachedInfo.emailAddress || '',
            emailColor: cachedInfo.emailColor || 'primary',
            showEmail: cachedInfo.showEmail === true,
            privacyPolicySections: cachedInfo.privacyPolicySections || [],
          });
          return;
        }

        // Fetch from Firestore
        if (db) {
          const infoRef = doc(db, storefront, 'Info');
          const infoSnap = await getDoc(infoRef);
          if (infoSnap.exists()) {
            const data = infoSnap.data();
            const infoData = {
              colorPrimary: data.colorPrimary || '#ec4899',
              colorSecondary: data.colorSecondary || '#64748b',
              colorTertiary: data.colorTertiary || '#94a3b8',
              instagramUrl: data.instagramUrl || '',
              instagramBgColor: data.instagramBgColor || 'primary',
              showInstagram: data.showInstagram === true,
              emailAddress: data.emailAddress || '',
              emailColor: data.emailColor || 'primary',
              showEmail: data.showEmail === true,
              privacyPolicySections: data.privacyPolicySections || [],
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

  return (
    <div className="min-h-screen bg-gradient-to-b from-white via-secondary/40 to-white">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-secondary/70 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
          <Link href={storefront === 'LUNERA' ? '/' : `/${storefront}`} className="flex items-center">
            <Image
              src={getLogo(storefront, siteInfo)}
              alt={storefront}
              width={300}
              height={100}
              className="h-12 w-auto sm:h-16 object-contain flex-shrink-0"
              style={{ objectFit: 'contain' }}
              priority
            />
          </Link>
          <SettingsMenu 
            secondaryColor={siteInfo.colorSecondary || '#64748b'} 
            primaryColor={siteInfo.colorPrimary || '#ec4899'}
            instagramUrl={siteInfo.instagramUrl || ''}
            instagramBgColor={siteInfo.instagramBgColor || 'primary'}
            showInstagram={siteInfo.showInstagram === true}
            emailAddress={siteInfo.emailAddress || ''}
            emailColor={siteInfo.emailColor || 'primary'}
            showEmail={siteInfo.showEmail === true}
            storefront={storefront}
          />
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="space-y-8">
          <h1 
            className="text-4xl sm:text-5xl font-semibold"
            style={{ color: siteInfo.colorPrimary || '#ec4899' }}
          >
            Privacy Policy
          </h1>

          <div 
            className="prose prose-lg max-w-none space-y-6"
            style={{ color: siteInfo.colorSecondary || '#64748b' }}
          >
            {siteInfo.privacyPolicySections && siteInfo.privacyPolicySections.length > 0 ? (
              siteInfo.privacyPolicySections.map((section, i) => (
                <section key={i}>
                  {section.heading && (
                    <h2 className="text-2xl font-semibold mb-4" style={{ color: siteInfo.colorPrimary || '#ec4899' }}>
                      {section.heading}
                    </h2>
                  )}
                  <p>
                    {section.text}
                    {section.heading === 'Contact Us' && siteInfo.emailAddress && (
                      <>
                        {' '}
                        <a
                          href={`mailto:${siteInfo.emailAddress}`}
                          className="underline hover:opacity-80"
                          style={{ color: siteInfo.colorPrimary || '#ec4899' }}
                        >
                          {siteInfo.emailAddress}
                        </a>
                        .
                      </>
                    )}
                  </p>
                </section>
              ))
            ) : (
              <p className="italic opacity-60">Privacy policy content coming soon.</p>
            )}

            <div className="pt-6 border-t" style={{ borderColor: `${siteInfo.colorSecondary || '#64748b'}33` }}>
              <p className="text-sm" style={{ color: siteInfo.colorTertiary || '#94a3b8' }}>
                Last Updated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

