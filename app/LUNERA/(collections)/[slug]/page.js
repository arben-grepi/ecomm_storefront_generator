import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import CategoryPageTemplate from '@/components/CategoryPageTemplate';
import { getServerSideCategoryBySlug, getServerSideProductsByCategory, getServerSideInfo } from '@/lib/firestore-server';
import { getStorefrontFromHeaders } from '@/lib/get-storefront-server';

export default async function CategoryPage({ params }) {
  const { slug } = await params;
  
  // Extract storefront from URL path (this page is in app/LUNERA/, so storefront is 'LUNERA')
  const headersList = headers();
  const storefront = await getStorefrontFromHeaders(headersList);

  // Always use English - language functionality removed
  const language = 'en';

  const category = await getServerSideCategoryBySlug(slug, storefront);
  if (!category) {
    notFound();
  }

  const [products, info] = await Promise.all([
    getServerSideProductsByCategory(category.id, storefront),
    getServerSideInfo(language),
  ]);

  return (
    <CategoryPageTemplate
      categoryId={category.id}
      category={category}
      products={products}
      info={info}
    />
  );
}
