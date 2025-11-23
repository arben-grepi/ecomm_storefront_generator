import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import { getServerSideProductDetail, getServerSideCategoryBySlug, getServerSideInfo } from '@/lib/firestore-server';
import ProductDetailPage from '@/components/ProductDetailPage';
import { getStorefrontFromHeaders } from '@/lib/get-storefront-server';

export default async function ProductPage({ params }) {
  const resolved = await params;
  const slug = Array.isArray(resolved?.slug) ? resolved.slug[0] : resolved?.slug;
  const productSlug = Array.isArray(resolved?.productSlug)
    ? resolved.productSlug[0]
    : resolved?.productSlug;

  if (!slug || !productSlug) {
    notFound();
  }

  // Extract storefront from URL path (this page is in app/LUNERA/, so storefront is 'LUNERA')
  const headersList = headers();
  const storefront = await getStorefrontFromHeaders(headersList);

  // Always use English - language functionality removed
  const language = 'en';

  const category = await getServerSideCategoryBySlug(slug, storefront);
  if (!category) {
    notFound();
  }

  const [detail, info] = await Promise.all([
    getServerSideProductDetail(productSlug, storefront),
    getServerSideInfo(language),
  ]);

  if (!detail?.product) {
    notFound();
  }

  return (
    <ProductDetailPage
      category={detail.category || category}
      product={detail.product}
      variants={detail.variants}
      info={info}
    />
  );
}

