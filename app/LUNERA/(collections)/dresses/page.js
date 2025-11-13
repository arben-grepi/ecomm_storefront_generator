'use client';

import CategoryPageTemplate from '@/components/CategoryPageTemplate';
import { useCategories } from '@/lib/firestore-data';

export default function DressesPage() {
  const { categories, loading } = useCategories();
  const category = categories.find((cat) => cat.slug === 'dresses');

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-slate-500">Loading...</div>
      </div>
    );
  }

  if (!category) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-slate-500">Category not found.</div>
      </div>
    );
  }

  return <CategoryPageTemplate categoryId={category.id} />;
}

