import { notFound } from 'next/navigation';
import { getServerSideProductDetail, getServerSideInfo } from '@/lib/firestore-server';
import ProductDetailPage from '@/components/ProductDetailPage';

export default async function ProductPage({ params }) {
  const resolved = await params;
  const slug = Array.isArray(resolved?.slug) ? resolved.slug[0] : resolved?.slug;
  const productSlug = Array.isArray(resolved?.productSlug)
    ? resolved.productSlug[0]
    : resolved?.productSlug;

  if (!slug || !productSlug) {
    notFound();
  }

  const [detail, info] = await Promise.all([
    getServerSideProductDetail(slug, productSlug),
    getServerSideInfo(),
  ]);

  if (!detail?.product || !detail?.category) {
    notFound();
  }

  return (
    <ProductDetailPage
      category={detail.category}
      product={detail.product}
      variants={detail.variants}
      info={info}
    />
  );
}

