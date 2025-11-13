'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMemo } from 'react';
import { useCategories, useAllProducts } from '@/lib/firestore-data';

export default function CategoryCarousel({ align = 'center' }) {
  const pathname = usePathname();
  const { categories, loading } = useCategories();
  const { products } = useAllProducts();

  const navItems = useMemo(() => {
    // Filter categories that have products
    const categoriesWithProducts = categories.filter((category) =>
      products.some((product) => product.categoryId === category.id)
    );

    return [
      { href: '/LUNERA', value: 'all', label: 'All Categories' },
      ...categoriesWithProducts.map((category) => ({
        href: `/LUNERA/${category.slug}`,
        value: category.slug,
        label: category.label,
      })),
    ];
  }, [categories, products]);

  const isActive = (item) =>
    (item.value === 'all' && pathname === '/LUNERA') || pathname === item.href;

  const containerAlignment =
    align === 'start' ? 'justify-start' : 'justify-center sm:justify-start';

  return (
    <div className="relative">
      <div
        className="-mx-2 flex overflow-x-auto scroll-smooth px-2 sm:mx-0 sm:px-0 hide-scrollbar"
        aria-label="Browse categories"
      >
        <ul className={`flex w-full min-w-max flex-nowrap items-center gap-2 ${containerAlignment}`}>
          {navItems.map((item) => {
            return (
              <li key={item.value} className="flex-none">
                <Link
                  href={item.href}
                  className={`inline-flex items-center rounded-full border px-4 py-2 text-sm font-medium transition ${
                    isActive(item)
                      ? 'border-primary/50 bg-white shadow-sm text-primary'
                      : 'border-transparent bg-white/70 text-slate-500 hover:border-primary/30 hover:text-primary'
                  }`}
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="pointer-events-none absolute inset-y-0 left-0 w-6 bg-gradient-to-r from-white via-white/60 to-transparent sm:w-8" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-white via-white/60 to-transparent sm:w-8" />
    </div>
  );
}


