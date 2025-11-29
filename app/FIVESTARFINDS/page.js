import { getServerSideCategories, getServerSideProducts, getServerSideInfo } from '@/lib/firestore-server';
import { headers } from 'next/headers';
import { getMarketFromHeaders } from '@/lib/get-market-server';
import HomeClient from '@/components/HomeClient';

// This is now a Server Component - it fetches data on the server
// and passes it to the client component for interactivity
export default async function Home() {
  // 🔍 FIVESTARFINDS PAGE (SERVER COMPONENT) - Set breakpoint here in Cursor
  const pageStartTime = Date.now();
  console.log(`[SSR] 🚀 Initializing Five-Star Finds Home page (Server Component)`);

  const headersList = await headers();
  // For pages in app/FIVESTARFINDS/, always use 'FIVESTARFINDS' (folder name determines storefront)
  // Don't detect from headers/cookies - the folder structure is the source of truth
  const storefront = 'FIVESTARFINDS';
  const market = await getMarketFromHeaders(headersList);
  console.log(`[SSR] 📍 Using storefront: ${storefront} (from folder), market: ${market}`);

  // Default language (English)
  const language = 'en';

  // Fetch data in parallel for better performance
  let categories = [];
  let products = [];
  let info = null;

  console.log(`[SSR] 📦 Starting parallel data fetch (products, info)`);
  try {
    // Fetch products and info in parallel first
    [products, info] = await Promise.all([
      getServerSideProducts(storefront, market),
      getServerSideInfo(language, storefront),
    ]);
    
    // Then fetch categories using the already-fetched products (avoids duplicate product fetch)
    categories = await getServerSideCategories(storefront, market, products);
    
    const pageDuration = Date.now() - pageStartTime;
    console.log(`[SSR] ✅ All data fetched successfully:`);
    console.log(`[SSR]    - Categories: ${categories.length}`);
    console.log(`[SSR]    - Products: ${products.length}`);
    console.log(`[SSR]    - Info: ${info ? '✅' : '❌'}`);
    console.log(`[SSR] ⏱️  Total SSR time: ${pageDuration}ms`);
    console.log(`[SSR] 📤 Sending data to client component...`);
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

  // Pass server-rendered data to client component
  // The client component will hydrate with this data and then add real-time updates
  // If server data is empty, client component will fetch everything client-side
  return <HomeClient initialCategories={categories} initialProducts={products} info={info} storefront={storefront} />;
}

