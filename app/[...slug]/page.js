import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import { Suspense } from 'react';
import { getServerSideProductDetail, getServerSideInfo } from '@/lib/firestore-server';
import { getStorefrontFromHeaders } from '@/lib/get-storefront-server';
import ProductDetailPage from '@/components/ProductDetailPage';

/**
 * Catch-all route for products
 * Handles both root (LUNERA) and storefront products
 * 
 * Routes:
 * - /product-slug (LUNERA - root, single segment)
 * - /FIVESTARFINDS/product-slug (storefront product, two segments)
 * - /LINGERIE/product-slug (storefront product, two segments)
 */
export default async function ProductPage({ params }) {
  const resolved = await params;
  const slugArray = Array.isArray(resolved?.slug) ? resolved.slug : (resolved?.slug ? [resolved.slug] : []);
  
  if (slugArray.length === 0) {
    notFound();
  }

  // Get storefront from headers (cookie set by middleware) to match client-side
  const headersList = await headers();
  let storefront = await getStorefrontFromHeaders(headersList, 'LUNERA');
  
  let productSlug = null;
  const excludedSegments = ['admin', 'api', 'cart', 'orders', 'checkout', 'unavailable', 'order-confirmation', 'thank-you'];
  
  if (slugArray.length === 1) {
    // Single segment: /product-slug (root/LUNERA product)
    const segment = slugArray[0];
    if (excludedSegments.includes(segment.toLowerCase())) {
      notFound();
    }
    storefront = 'LUNERA';
    productSlug = segment;
  } else if (slugArray.length === 2) {
    // Two segments: /storefront/product-slug
    const firstSegment = slugArray[0];
    const secondSegment = slugArray[1];
    
    if (excludedSegments.includes(firstSegment.toLowerCase())) {
      notFound();
    }
    
    // First segment is storefront, second is product slug
    storefront = firstSegment.toUpperCase();
    productSlug = secondSegment;
  } else {
    // More than 2 segments - invalid
    notFound();
  }

  if (!productSlug) {
    notFound();
  }

  // Always use English - language functionality removed
  const language = 'en';

  // Fetch product by slug (no category needed)
  const detail = await getServerSideProductDetail(productSlug, storefront);
  
  if (!detail?.product) {
    notFound();
  }

  // Get category from product data (if available)
  const category = detail.category;

  const info = await getServerSideInfo(language, storefront);

  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center">
        <div style={{ color: '#94a3b8' }}>Loading product...</div>
      </div>
    }>
      <ProductDetailPage
        category={category}
        product={detail.product}
        variants={detail.variants}
        info={info}
      />
    </Suspense>
  );
}

