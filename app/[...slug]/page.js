import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { getServerSideProductDetail, getServerSideInfo } from '@/lib/firestore-server';
import ProductDetailPage from '@/components/ProductDetailPage';

/**
 * Catch-all route for products
 * Handles storefront products only (all products are under storefront paths)
 * 
 * Routes:
 * - /FIVESTARFINDS/product-slug (storefront product, two segments)
 * - /HEALTH/product-slug (storefront product, two segments)
 * 
 * Note: Single segment URLs are not valid product routes - they should be storefront home pages.
 * Root (/) redirects to /FIVESTARFINDS via middleware.
 */
export default async function ProductPage({ params }) {
  const resolved = await params;
  const slugArray = Array.isArray(resolved?.slug) ? resolved.slug : (resolved?.slug ? [resolved.slug] : []);
  
  if (slugArray.length === 0) {
    notFound();
  }

  // Determine storefront and product slug directly from URL segments
  // All product URLs must have format: /{storefront}/{product-slug}
  let storefront = 'FIVESTARFINDS';
  let productSlug = null;
  const excludedSegments = ['admin', 'api', 'cart', 'orders', 'checkout', 'unavailable', 'order-confirmation', 'thank-you'];
  
  if (slugArray.length === 1) {
    // Single segment: should not be a product (should be a storefront home page)
    // Treat as FIVESTARFINDS product for backwards compatibility, but this shouldn't happen
    const segment = slugArray[0];
    if (excludedSegments.includes(segment.toLowerCase())) {
      notFound();
    }
    storefront = 'FIVESTARFINDS';
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
        storefront={storefront}
      />
    </Suspense>
  );
}

