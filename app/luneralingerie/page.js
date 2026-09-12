import { getServerSideCategories, getServerSideProducts, getServerSideInfo } from '@/lib/firestore-server';
import { headers } from 'next/headers';
import { getMarketFromHeaders } from '@/lib/get-market-server';
import { Suspense } from 'react';
import HomeClient from '@/components/HomeClient';

export default async function Home() {
  const language = 'en';
  const storefront = 'LUNERA';
  const pageStartTime = Date.now();

  console.log(`[SSR] 🚀 Initializing LUNERA Home page`);

  const headersList = headers();
  const market = await getMarketFromHeaders(headersList);
  console.log(`[SSR] 📍 storefront: ${storefront}, market: ${market}`);

  let categories = [];
  let products = [];
  let info = null;

  try {
    const [productsResult, infoResult] = await Promise.all([
      getServerSideProducts(storefront, market),
      getServerSideInfo(language, storefront),
    ]);

    products = productsResult.products || [];
    info = infoResult;
    categories = await getServerSideCategories(storefront, market, products);

    console.log(`[SSR] ✅ LUNERA SSR done in ${Date.now() - pageStartTime}ms (${products.length} products)`);
  } catch (error) {
    console.error('Server-side data fetching failed:', error);
  }

  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-600">Loading...</p>
      </div>
    }>
      <HomeClient
        initialCategories={categories}
        initialProducts={products}
        info={info}
        storefront={storefront}
      />
    </Suspense>
  );
}
