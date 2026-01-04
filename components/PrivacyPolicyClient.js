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

  return (
    <div className="min-h-screen bg-gradient-to-b from-white via-secondary/40 to-white">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-secondary/70 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
          <Link href={storefront === 'LUNERA' ? '/' : `/${storefront}`} className="flex items-center">
            <Image
              src={getLogo(storefront, siteInfo)}
              alt={siteInfo.companyName || storefront}
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
            <section>
              <h2 className="text-2xl font-semibold mb-4" style={{ color: siteInfo.colorPrimary || '#ec4899' }}>
                Information We Collect
              </h2>
              <p>
                We collect information that you provide directly to us, including when you create an account, place an order, or contact us. This may include your name, email address, shipping address, payment information, and phone number.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4" style={{ color: siteInfo.colorPrimary || '#ec4899' }}>
                How We Use Your Information
              </h2>
              <p>
                We use the information we collect to process your orders, communicate with you about your purchases, send you marketing communications (with your consent), improve our services, and comply with legal obligations.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4" style={{ color: siteInfo.colorPrimary || '#ec4899' }}>
                Information Sharing
              </h2>
              <p>
                We do not sell your personal information. We may share your information with service providers who assist us in operating our business (such as payment processors and shipping companies), and as required by law.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4" style={{ color: siteInfo.colorPrimary || '#ec4899' }}>
                Data Security
              </h2>
              <p>
                We implement appropriate technical and organizational measures to protect your personal information against unauthorized access, alteration, disclosure, or destruction.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4" style={{ color: siteInfo.colorPrimary || '#ec4899' }}>
                Your Rights
              </h2>
              <p>
                You have the right to access, update, or delete your personal information at any time. You may also opt out of marketing communications by following the unsubscribe instructions in our emails or by contacting us directly.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4" style={{ color: siteInfo.colorPrimary || '#ec4899' }}>
                Cookies and Tracking
              </h2>
              <p>
                We use cookies and similar tracking technologies to enhance your browsing experience, analyze site traffic, and understand where our visitors are coming from. You can control cookies through your browser settings.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4" style={{ color: siteInfo.colorPrimary || '#ec4899' }}>
                Changes to This Policy
              </h2>
              <p>
                We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page and updating the "Last Updated" date.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4" style={{ color: siteInfo.colorPrimary || '#ec4899' }}>
                Contact Us
              </h2>
              <p>
                If you have any questions about this Privacy Policy, please contact us at{' '}
                <a 
                  href="mailto:lunera.shop@outlook.com" 
                  className="underline hover:opacity-80"
                  style={{ color: siteInfo.colorPrimary || '#ec4899' }}
                >
                  lunera.shop@outlook.com
                </a>
                .
              </p>
            </section>

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

