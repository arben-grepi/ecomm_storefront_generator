'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { doc, getDoc, onSnapshot, collection, query, where, orderBy, limit, getDocs, Timestamp } from 'firebase/firestore';
import { getFirebaseDb } from '@/lib/firebase';
import { getLogo } from '@/lib/logo-cache';
import { getCachedInfo, saveInfoToCache } from '@/lib/info-cache';
import AuthButton from '@/components/AuthButton';

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

const formatPrice = (value, currency = 'USD') => {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'USD',
    }).format(value ?? 0);
  } catch {
    return currencyFormatter.format(value ?? 0);
  }
};

function ThankYouPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [orderData, setOrderData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [siteInfo, setSiteInfo] = useState(null);
  
  // Get confirmation number from URL or checkout session
  const confirmationFromUrl = searchParams?.get('confirmation');
  const checkoutId = searchParams?.get('checkout_id');
  const orderIdFromUrl = searchParams?.get('order_id');
  
  useEffect(() => {
    async function loadOrder() {
      const db = getFirebaseDb();
      if (!db) {
        setError('Database not available');
        setLoading(false);
        return;
      }
      
      let confirmationNumber = confirmationFromUrl;
      
      // If no confirmation in URL, poll Firestore using checkout session
      if (!confirmationNumber) {
        try {
          const session = JSON.parse(localStorage.getItem('checkout_session') || '{}');
          if (session.storefront && session.timestamp) {
            console.log('[Thank You] No confirmation in URL, polling by session:', session);
            
            // Poll for order created after checkout session timestamp
            const maxAttempts = 10;
            
            for (let i = 0; i < maxAttempts; i++) {
              try {
                const sessionTimestamp = Timestamp.fromMillis(session.timestamp);
                const confirmationsRef = collection(db, 'orderConfirmations');
                const q = query(
                  confirmationsRef,
                  where('storefront', '==', session.storefront),
                  where('createdAt', '>=', sessionTimestamp),
                  orderBy('createdAt', 'desc'),
                  limit(1)
                );
                
                const snapshot = await getDocs(q);
                if (!snapshot.empty) {
                  const orderDoc = snapshot.docs[0];
                  const data = orderDoc.data();
                  confirmationNumber = data.confirmationNumber;
                  console.log('[Thank You] Found order via polling:', confirmationNumber);
                  break;
                }
              } catch (queryError) {
                console.error('[Thank You] Query error:', queryError);
                // Continue polling
              }
              
              // Wait before next attempt
              if (i < maxAttempts - 1) {
                await new Promise((resolve) => setTimeout(resolve, 1000));
              }
            }
          }
        } catch (err) {
          console.error('[Thank You] Failed to load checkout session:', err);
        }
      }
      
      if (!confirmationNumber) {
        setError('Order confirmation number not found. Please check your email for order confirmation or wait a moment and refresh the page.');
        setLoading(false);
        return;
      }
      
      // Fetch order data from orderConfirmations collection
      const confirmationRef = doc(db, 'orderConfirmations', confirmationNumber);
      
      // Try direct lookup first
      const confirmationSnap = await getDoc(confirmationRef);
      
      if (confirmationSnap.exists()) {
        const data = confirmationSnap.data();
        setOrderData(data);
        setLoading(false);
        
        // Clean up checkout session
        try {
          localStorage.removeItem('checkout_session');
        } catch (e) {
          // Ignore
        }
        
        // Subscribe to updates
        const unsubscribe = onSnapshot(confirmationRef, (snap) => {
          if (snap.exists()) {
            setOrderData(snap.data());
          }
        });
        
        return () => unsubscribe();
      } else {
        // Order might not be in Firestore yet (webhook still processing)
        // Poll for a few seconds
        let attempts = 0;
        const maxAttempts = 10;
        const pollInterval = setInterval(async () => {
          attempts++;
          const snap = await getDoc(confirmationRef);
          if (snap.exists()) {
            const data = snap.data();
            setOrderData(data);
            setLoading(false);
            clearInterval(pollInterval);
            
            // Clean up checkout session
            try {
              localStorage.removeItem('checkout_session');
            } catch (e) {
              // Ignore
            }
          } else if (attempts >= maxAttempts) {
            clearInterval(pollInterval);
            setError('Order confirmation not found. It may still be processing. Please check your email for order confirmation.');
            setLoading(false);
          }
        }, 1000);
        
        return () => clearInterval(pollInterval);
      }
    }
    
    loadOrder();
  }, [confirmationFromUrl, checkoutId, orderIdFromUrl]);
  
  // Fetch site info for the order's storefront
  useEffect(() => {
    if (!orderData?.storefront) return;
    
    const fetchSiteInfo = async () => {
      try {
        // Try cache first
        const cachedInfo = getCachedInfo(orderData.storefront);
        if (cachedInfo) {
          setSiteInfo(cachedInfo);
          return;
        }
        
        // Fetch from Firestore
        const db = getFirebaseDb();
        if (db) {
          const { doc, getDoc } = await import('firebase/firestore');
          const infoRef = doc(db, orderData.storefront, 'Info');
          const infoSnap = await getDoc(infoRef);
          if (infoSnap.exists()) {
            const data = infoSnap.data();
            setSiteInfo(data);
            // Cache it
            saveInfoToCache(orderData.storefront, data);
          }
        }
      } catch (error) {
        console.error('Failed to fetch site info:', error);
      }
    };
    
    fetchSiteInfo();
  }, [orderData?.storefront]);
  
  const displayStorefront = orderData?.storefront || 'FIVESTARFINDS';
  const logoPath = getLogo(displayStorefront, siteInfo);
  const primaryColor = siteInfo?.colorPrimary || '#ec4899';
  const primaryColorHover = siteInfo?.colorPrimary ? `${siteInfo.colorPrimary}E6` : '#ec4899E6';
  
  // Get home URL based on storefront
  // All storefronts use blerinas.com/{storefront} format
  const getHomeUrl = (storefront) => {
    return `https://blerinas.com/${storefront}`;
  };
  
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-white via-secondary/40 to-white">
        <div className="flex min-h-screen items-center justify-center">
          <div className="text-slate-500">Loading your order confirmation...</div>
        </div>
      </div>
    );
  }
  
  if (error || !orderData) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-white via-secondary/40 to-white">
        <header className="sticky top-0 z-50 border-b border-secondary/70 bg-white/90 backdrop-blur">
          <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 sm:justify-between sm:gap-4 sm:px-6 lg:px-8">
            <Link 
              href={getHomeUrl(displayStorefront)} 
              className="flex items-center transition-opacity hover:opacity-80"
              aria-label={`Return to ${displayStorefront} homepage`}
            >
              {logoPath ? (
                <Image
                  src={logoPath}
                  alt={`${displayStorefront} logo`}
                  width={300}
                  height={100}
                  className="h-12 w-auto sm:h-16 object-contain flex-shrink-0"
                  style={{ objectFit: 'contain' }}
                  priority
                />
              ) : (
                <span className="text-xl font-light tracking-wide" style={{ color: primaryColor }}>
                  {displayStorefront}
                </span>
              )}
            </Link>
            <AuthButton />
          </div>
        </header>
        <main className="mx-auto max-w-4xl px-4 py-16 text-center">
          <h1 className="mb-4 text-2xl font-medium" style={{ color: primaryColor }}>Order Confirmation Not Found</h1>
          <p className="mb-8 text-slate-600">{error || 'The order confirmation you are looking for does not exist. Please check your email for order confirmation.'}</p>
          <Link
            href={getHomeUrl(displayStorefront)}
            className="inline-block rounded-full px-6 py-3 font-semibold text-white transition"
            style={{
              backgroundColor: primaryColor,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = primaryColorHover;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = primaryColor;
            }}
          >
            Continue Shopping
          </Link>
        </main>
      </div>
    );
  }
  
  return (
    <div className="min-h-screen bg-gradient-to-b from-white via-secondary/40 to-white">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-secondary/70 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 sm:justify-between sm:gap-4 sm:px-6 lg:px-8">
          <Link 
            href={getHomeUrl(displayStorefront)} 
            className="flex items-center transition-opacity hover:opacity-80"
            aria-label={`Return to ${displayStorefront} homepage`}
          >
            {logoPath ? (
              <Image
                src={logoPath}
                alt={`${displayStorefront} logo`}
                width={300}
                height={100}
                className="h-12 w-auto sm:h-16 object-contain flex-shrink-0"
                style={{ objectFit: 'contain' }}
                priority
              />
            ) : (
              <span className="text-xl font-light tracking-wide" style={{ color: primaryColor }}>
                {displayStorefront}
              </span>
            )}
          </Link>
          <AuthButton />
        </div>
      </header>
      
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Success Message */}
        <div className="mb-8 rounded-xl border border-green-300 bg-green-50 p-6 text-center">
          <svg
            className="mx-auto mb-4 h-12 w-12 text-green-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <h1 className="mb-2 text-2xl font-medium text-green-900">Thank you for your order!</h1>
          <p className="text-green-700">
            We've sent a confirmation email to {orderData.email}
          </p>
          {orderData.orderNumber && (
            <p className="mt-2 text-sm text-green-600">
              Order #{orderData.orderNumber}
            </p>
          )}
          {orderData.confirmationNumber && (
            <p className="mt-1 text-xs text-green-600">
              Confirmation: {orderData.confirmationNumber}
            </p>
          )}
        </div>
        
        {/* Order Items */}
        {orderData.items && orderData.items.length > 0 && (
          <div className="mb-8 rounded-xl border border-secondary/70 bg-white/90 p-6">
            <h2 className="mb-4 text-lg font-medium" style={{ color: primaryColor }}>Order Summary</h2>
            <div className="space-y-4 border-b border-secondary/70 pb-4">
              {orderData.items.map((item, index) => (
                <div key={index} className="flex items-center justify-between">
                  <div className="flex-1">
                    <p className="font-medium">{item.title}</p>
                    <p className="text-sm text-slate-600">Quantity: {item.quantity}</p>
                  </div>
                  <p className="font-medium">{formatPrice(item.subtotal || item.price * item.quantity, orderData.currency)}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 flex justify-between border-t border-secondary/70 pt-4 font-semibold">
              <span>Total</span>
              <span>{formatPrice(orderData.total, orderData.currency)}</span>
            </div>
          </div>
        )}
        
        {/* Actions */}
        <div className="flex flex-col gap-4 sm:flex-row">
          <Link
            href={getHomeUrl(displayStorefront)}
            className="flex-1 rounded-full px-6 py-3 text-center font-semibold text-white transition"
            style={{
              backgroundColor: primaryColor,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = primaryColorHover;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = primaryColor;
            }}
          >
            Continue Shopping at {displayStorefront}
          </Link>
        </div>
      </main>
    </div>
  );
}

export default function ThankYouPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-b from-white via-secondary/40 to-white">
        <div className="flex min-h-screen items-center justify-center">
          <div className="text-slate-500">Loading your order confirmation...</div>
        </div>
      </div>
    }>
      <ThankYouPageContent />
    </Suspense>
  );
}

