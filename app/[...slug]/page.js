import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { getServerSideProductDetail, getServerSideInfo } from '@/lib/firestore-server';
import ProductDetailPage from '@/components/ProductDetailPage';
import { pathSegmentToStorefront } from '@/lib/storefront-paths';

/**
 * Catch-all for product URLs:
 * - /luneralingerie/product-slug  (LUNERA, localhost + internal rewrite)
 * - /{STOREFRONT}/product-slug    (future storefronts)
 */
export default async function ProductPage({ params }) {
  const resolved = await params;
  const slugArray = Array.isArray(resolved?.slug) ? resolved.slug : (resolved?.slug ? [resolved.slug] : []);

  if (slugArray.length === 0) {
    notFound();
  }

  let storefront = 'LUNERA';
  let productSlug = null;
  const excludedSegments = ['admin', 'api', 'cart', 'orders', 'checkout', 'unavailable', 'order-confirmation', 'thank-you'];

  if (slugArray.length === 1) {
    const segment = slugArray[0];
    if (excludedSegments.includes(segment.toLowerCase())) {
      notFound();
    }
    // Single segment product only makes sense after domain rewrite → handled as /luneralingerie/slug
    storefront = 'LUNERA';
    productSlug = segment;
  } else if (slugArray.length === 2) {
    const firstSegment = slugArray[0];
    const secondSegment = slugArray[1];

    if (excludedSegments.includes(firstSegment.toLowerCase())) {
      notFound();
    }

    storefront = pathSegmentToStorefront(firstSegment) || firstSegment.toUpperCase();
    productSlug = secondSegment;
  } else {
    notFound();
  }

  if (!productSlug) {
    notFound();
  }

  const language = 'en';
  const detail = await getServerSideProductDetail(productSlug, storefront);

  if (!detail?.product) {
    notFound();
  }

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
