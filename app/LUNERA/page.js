import { getServerSideCategories, getServerSideProducts, getServerSideInfo } from '@/lib/firestore-server';
import { headers } from 'next/headers';
import { getStorefrontFromHeaders } from '@/lib/get-storefront-server';
import HomeClient from '@/components/HomeClient';

// This is now a Server Component - it fetches data on the server
// and passes it to the client component for interactivity
export default async function Home() {
  // Log environment variables for debugging (only in production to diagnose auth issues)
  if (process.env.NODE_ENV === 'production') {
    const envVars = {
      NEXT_PUBLIC_FIREBASE_API_KEY: process.env.NEXT_PUBLIC_FIREBASE_API_KEY 
        ? `✅ Set (length: ${process.env.NEXT_PUBLIC_FIREBASE_API_KEY.length})` 
        : '❌ Missing',
      NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN 
        ? `✅ Set: ${process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN}` 
        : '❌ Missing',
      NEXT_PUBLIC_FIREBASE_PROJECT_ID: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID 
        ? `✅ Set: ${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}` 
        : '❌ Missing',
      NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET 
        ? `✅ Set: ${process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET}` 
        : '❌ Missing',
      NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID 
        ? `✅ Set (length: ${process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID.length})` 
        : '❌ Missing',
      NEXT_PUBLIC_FIREBASE_APP_ID: process.env.NEXT_PUBLIC_FIREBASE_APP_ID 
        ? `✅ Set (length: ${process.env.NEXT_PUBLIC_FIREBASE_APP_ID.length})` 
        : '❌ Missing',
      NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID 
        ? `✅ Set: ${process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID}` 
        : '❌ Missing',
      FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID 
        ? `✅ Set: ${process.env.FIREBASE_PROJECT_ID}` 
        : '❌ Missing',
      FIREBASE_CLIENT_EMAIL: process.env.FIREBASE_CLIENT_EMAIL 
        ? `✅ Set: ${process.env.FIREBASE_CLIENT_EMAIL}` 
        : '❌ Missing',
      FIREBASE_PRIVATE_KEY: process.env.FIREBASE_PRIVATE_KEY 
        ? `✅ Set (length: ${process.env.FIREBASE_PRIVATE_KEY.length})` 
        : '❌ Missing',
    };
    
    console.log('🔍 Environment Variables Check (Production):');
    console.log('==========================================');
    Object.entries(envVars).forEach(([key, value]) => {
      console.log(`${key}: ${value}`);
    });
    console.log('==========================================');
  }
  
  // Always use English - language functionality removed
  const language = 'en';
  
  // Extract storefront from URL path (this page is in app/LUNERA/, so storefront is 'LUNERA')
  // For dynamic routes, this would come from params
  const headersList = headers();
  const storefront = await getStorefrontFromHeaders(headersList);

  // Fetch initial data on the server (for SEO and fast initial load)
  // 
  // Note: On Firebase Hosting/Cloud Functions, credentials are automatically available.
  // During local development, if credentials aren't set up, this will gracefully fallback
  // to client-side fetching (the app still works, just without SSR benefits).
  let categories = [];
  let products = [];
  let info = null;

  try {
    [categories, products, info] = await Promise.all([
      getServerSideCategories(storefront),
      getServerSideProducts(storefront),
      getServerSideInfo(language),
    ]);
  } catch (error) {
    // Only fallback in development - in production (Firebase Hosting), credentials should always be available
    // If this fails in production, it's a configuration issue that should be fixed
    if (process.env.NODE_ENV === 'development') {
      console.warn('Server-side data fetching failed (development mode), falling back to client-side:', error.message);
      console.info(
        '💡 Tip: To enable server-side rendering locally, run: gcloud auth application-default login\n' +
        '   See docs/local-dev-setup.md for details'
      );
    } else {
      // In production, log the error but don't crash - Firebase Hosting should have credentials
      // If this happens, it's unexpected and should be investigated
      console.error('Server-side data fetching failed in production:', error);
      // Still fallback to prevent page crash, but this shouldn't happen normally
    }
  }

  // Ensure info has defaults if fetch failed
  if (!info) {
    info = await getServerSideInfo(language);
  }

  // Pass server-rendered data to client component
  // The client component will hydrate with this data and then add real-time updates
  // If server data is empty, client component will fetch everything client-side
  return <HomeClient initialCategories={categories} initialProducts={products} info={info} />;
}
