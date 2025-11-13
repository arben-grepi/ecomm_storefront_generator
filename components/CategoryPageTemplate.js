'use client';

import Link from 'next/link';
import AuthButton from '@/components/AuthButton';
import CategoryCarousel from '@/components/CategoryCarousel';
import ProductCard from '@/components/ProductCard';
import { useCategories, useProductsByCategory } from '@/lib/firestore-data';
import { useCart } from '@/lib/cart';
import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';

const AdminRedirect = dynamic(() => import('@/components/AdminRedirect'), {
  ssr: false,
});

export default function CategoryPageTemplate({ categoryId, category: categoryProp, products: productsProp, info = null }) {
  const { categories } = useCategories();
  const { products: fetchedProducts, loading: productsLoading } = useProductsByCategory(categoryId);
  const { getCartItemCount } = useCart();
  const [hasMounted, setHasMounted] = useState(false);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  // Use fetched data if categoryId provided, otherwise use props (for backward compatibility)
  const category = categoryId
    ? categories.find((cat) => cat.id === categoryId) || categoryProp
    : categoryProp;
  const products = categoryId ? fetchedProducts : productsProp;
  const loading = categoryId ? productsLoading : false;

  // Use info from server (for SEO), with empty strings as fallback
  const siteInfo = info || {
    companyName: '',
    companyTagline: '',
    footerText: '',
  };

  // (Analytics removed)

  // Show loading state if category is not yet loaded
  if (!category && categoryId) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-slate-500">Loading category...</div>
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

  return (
    <div className="relative min-h-screen bg-gradient-to-b from-white via-secondary/40 to-white">
      <AdminRedirect />

      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-secondary/70 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 sm:justify-between sm:gap-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <Link
              href="/LUNERA"
              className="flex items-center text-primary transition hover:text-primary"
              aria-label="Back to home"
            >
              <svg
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth="2"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
              </svg>
            </Link>
            {/* Mobile: Company name, Desktop: Full branding */}
            <div className="flex flex-col sm:flex-col">
              <h1 className="whitespace-nowrap text-xl font-light text-primary tracking-wide sm:text-2xl">
                {siteInfo.companyName}
              </h1>
              <p className="hidden text-sm text-slate-500 sm:block">
                {siteInfo.companyTagline}
              </p>
            </div>
          </div>
          {/* Spacer for mobile to push buttons to right */}
          <div className="flex-1 sm:hidden" />
          <div className="flex w-full items-center justify-end gap-3 sm:w-auto sm:gap-4">
            <AuthButton />
            <Link
              href="/LUNERA/cart"
              className="relative ml-2 flex items-center justify-center rounded-full border border-primary/30 bg-white/80 p-2.5 text-primary shadow-sm transition-colors hover:bg-secondary hover:text-primary"
              aria-label="Shopping cart"
            >
              <svg
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth="2"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007zM8.625 10.5a.375.375 0 11-.75 0 .375.375 0 01.75 0zm7.5 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"
                />
              </svg>
              {hasMounted && getCartItemCount() > 0 && (
                <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-xs font-semibold text-white">
                  {getCartItemCount() > 9 ? '9+' : getCartItemCount()}
                </span>
              )}
            </Link>
          </div>
        </div>
      </header>

      {/* Category carousel - hidden on mobile */}
      <section className="hidden px-4 pt-4 sm:block sm:px-6 lg:px-8">
        <CategoryCarousel align="start" />
      </section>

      {/* Hero Section */}
      <section className="px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
        <div className="mx-auto flex max-w-3xl flex-col items-center gap-6 text-center">
          <span className="rounded-full bg-white/70 px-4 py-1 text-xs font-medium uppercase tracking-[0.3em] text-primary">
            {category.label || category.name || 'Collection'}
          </span>
          <h2 className="text-3xl font-light text-primary sm:text-5xl">
            {category.description || 'Discover our curated collection.'}
          </h2>
          <p className="text-base text-slate-600 sm:text-lg">
            Discover the full assortment of best-sellers, refreshed styles, and timeless pieces in
            our {(category.label || category.name || 'collection').toLowerCase()} collection.
          </p>
        </div>
      </section>

      {/* Products Grid */}
      <main className="mx-auto max-w-7xl px-3 pb-16 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-col gap-2 text-center sm:mb-12 sm:text-left">
          <h3 className="text-xl font-medium text-primary sm:text-2xl">
            {category.label} favorites
          </h3>
          <p className="text-sm text-slate-600 sm:text-base">
            Pieces designed for softness, style, and everyday confidence.
          </p>
        </div>

        {loading ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 md:gap-5">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
              <div key={i} className="aspect-[3/4] animate-pulse rounded-3xl bg-secondary/50" />
            ))}
          </div>
        ) : !category ? (
          <div className="rounded-3xl border border-secondary/70 bg-white/80 p-6 text-center text-slate-500">
            Category not found.
          </div>
        ) : products.length === 0 ? (
          <div className="rounded-3xl border border-secondary/70 bg-white/80 p-6 text-center text-slate-500">
            Products will appear here soon. Check back shortly.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 md:gap-5">
            {products.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                categorySlug={category.slug}
              />
            ))}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-secondary/70 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-10 text-center text-sm text-slate-500 sm:px-6 lg:px-8">
          {siteInfo.footerText}
        </div>
      </footer>
    </div>
  );
}


