import { getServerSideCategories, getServerSideProducts, getServerSideInfo } from '@/lib/firestore-server';
import { headers } from 'next/headers';
import { getMarketFromHeaders } from '@/lib/get-market-server';
import { Suspense } from 'react';
import HomeClient from '@/components/HomeClient';

// This is now a Server Component - it fetches data on the server
// and passes it to the client component for interactivity
export default async function Home() {
  // 🔍 LEATHER PAGE (SERVER COMPONENT) - Set breakpoint here in Cursor
  // LEATHER storefront at /LEATHER
  // Always use English - language functionality removed
  const language = 'en';
  
  console.log(`[SSR] 🚀 Initializing Leather Home page (Server Component)`);
  const pageStartTime = Date.now();
  
  const headersList = headers();
  // For pages in app/LEATHER/, always use 'LEATHER' (folder name determines storefront)
  const storefront = 'LEATHER';
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
    console.error('Server-side data fetching failed:', error);
   
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

