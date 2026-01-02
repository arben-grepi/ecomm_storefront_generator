import { getServerSideProducts, getServerSideInfo } from '@/lib/firestore-server';
import { headers } from 'next/headers';
import { getMarketFromHeaders } from '@/lib/get-market-server';
import AboutUsClient from '@/components/AboutUsClient';

export default async function AboutUsPage() {
  const language = 'en';
  const storefront = 'LUNERA';
  const headersList = headers();
  const market = await getMarketFromHeaders(headersList);

  // Fetch products and info
  let products = [];
  let info = null;

  try {
    const [productsResult, infoResult] = await Promise.all([
      getServerSideProducts(storefront, market),
      getServerSideInfo(language, storefront),
    ]);
    
    products = productsResult.products || [];
    info = infoResult;
  } catch (error) {
    console.error('Failed to fetch data for About Us page:', error);
  }

  return <AboutUsClient initialProducts={products} info={info} storefront={storefront} />;
}













