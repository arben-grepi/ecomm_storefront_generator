import { notFound } from 'next/navigation';
import CategoryPageTemplate from '@/components/CategoryPageTemplate';
import { getServerSideCategoryBySlug, getServerSideProductsByCategory, getServerSideInfo } from '@/lib/firestore-server';

export default async function CategoryPage({ params }) {
  const { slug } = await params;

  const category = await getServerSideCategoryBySlug(slug);
  if (!category) {
    notFound();
  }

  const [products, info] = await Promise.all([
    getServerSideProductsByCategory(category.id),
    getServerSideInfo(),
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
