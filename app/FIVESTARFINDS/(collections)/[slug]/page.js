import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import CategoryPageTemplate from '@/components/CategoryPageTemplate';
import { getServerSideCategoryBySlug, getServerSideProductsByCategory, getServerSideInfo } from '@/lib/firestore-server';
import { getMarketFromHeaders } from '@/lib/get-market-server';

export default async function CategoryPage({ params }) {
  const { slug } = await params;
  
  // Extract storefront from URL path
  const headersList = headers();
  // For pages in app/FIVESTARFINDS/, always use 'FIVESTARFINDS' (folder name determines storefront)
  const storefront = 'FIVESTARFINDS';
  const market = await getMarketFromHeaders(headersList);

  // Always use English - language functionality removed
  const language = 'en';

  const category = await getServerSideCategoryBySlug(slug, storefront);
  if (!category) {
    notFound();
  }

  // Fetch products and info in parallel
  // Note: Info could be cached client-side, but we still fetch it server-side for SEO
  // The client component will use cached version if available to avoid refetching
  const [products, info] = await Promise.all([
    getServerSideProductsByCategory(category.id, storefront, market),
    getServerSideInfo(language, storefront), // Still fetch for SSR/SEO, but client will cache it
  ]);

  return (
    <CategoryPageTemplate
      categoryId={category.id}
      category={category}
      products={products}
      info={info}
      storefront={storefront}
    />
  );
}

