import { getServerSideCategories, getServerSideProducts, getServerSideInfo } from '@/lib/firestore-server';
import { headers } from 'next/headers';
import { getMarketFromHeaders } from '@/lib/get-market-server';
import { Suspense } from 'react';
import HomeClient from '@/components/HomeClient';

// This is now a Server Component - it fetches data on the server
// and passes it to the client component for interactivity
export default async function Home() {
  // 🔍 FIVESTARFINDS PAGE (SERVER COMPONENT) - Set breakpoint here in Cursor
  // FIVESTARFINDS storefront at /FIVESTARFINDS
  // Always use English - language functionality removed
  const language = 'en';
  
  console.log(`[SSR] 🚀 Initializing Five-Star Finds Home page (Server Component)`);
  const pageStartTime = Date.now();
  
  const headersList = headers();
  // For pages in app/FIVESTARFINDS/, always use 'FIVESTARFINDS' (folder name determines storefront)
  const storefront = 'FIVESTARFINDS';
  const market = await getMarketFromHeaders(headersList);
  console.log(`[SSR] 📍 Using storefront: ${storefront} (from folder), market: ${market}`);

  // Fetch initial data on the server (for SEO and fast initial load)
  // 
  // Note: On Firebase Hosting/Cloud Functions, credentials are automatically available.
  // During local development, if credentials aren't set up, this will gracefully fallback
  // to client-side fetching (the app still works, just without SSR benefits).
  let categories = [];
  let products = [];
  let info = null;

  console.log(`[SSR] 📦 Starting parallel data fetch (products, info)`);
  try {
    // Fetch products and info in parallel first
    const [productsResult, infoResult] = await Promise.all([
      getServerSideProducts(storefront, market),
      getServerSideInfo(language, storefront),
    ]);
    
    // Extract products array from result (now returns { products, hasMore, lastDoc })
    products = productsResult.products || [];
    info = infoResult;
    
    // Then fetch categories using the already-fetched products (avoids duplicate product fetch)
    categories = await getServerSideCategories(storefront, market, products);
    
    const pageDuration = Date.now() - pageStartTime;
    console.log(`[SSR] ✅ All data fetched successfully:`);
    console.log(`[SSR]    - Categories: ${categories.length}`);
    console.log(`[SSR]    - Products: ${products.length}`);
    console.log(`[SSR]    - Info: ${info ? '✅' : '❌'}`);
    console.log(`[SSR] ⏱️  Total SSR time: ${pageDuration}ms`);
    console.log(`[SSR] 📤 Sending data to client component...`);
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
  
  // Log info for debugging
  // Note: getServerSideInfo always returns an object (never null), but fields may be empty strings
  if (info && (info.heroMainHeading || info.companyName || info.companyTagline)) {
    console.log(`[SSR] 📄 Info loaded - heroMainHeading: "${info.heroMainHeading || '(empty)'}", companyName: "${info.companyName || '(empty)'}"`);
  } else {
    console.log(`[SSR] ⚠️  Info document exists but all fields are empty - storefront: ${storefront}. Check if ${storefront}/Info document has data in Firestore.`);
  }

  // Pass server-rendered data to client component
  // The client component will hydrate with this data and then add real-time updates
  // If server data is empty, client component will fetch everything client-side
  // Wrap in Suspense since HomeClient uses useSearchParams
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-600">Loading...</p>
      </div>
    }>
      <HomeClient initialCategories={categories} initialProducts={products} info={info} storefront={storefront} />
    </Suspense>
  );
}

