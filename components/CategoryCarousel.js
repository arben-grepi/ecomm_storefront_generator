'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMemo } from 'react';
import { useStorefront } from '@/lib/storefront-context';

export default function CategoryCarousel({ align = 'center', categories = [], products = [], storefront: storefrontProp = null }) {
  console.log(`[COMPONENT] 🎠 CategoryCarousel: Initializing - Categories: ${categories.length}, Products: ${products.length}`);
  const pathname = usePathname();
  const storefrontFromContext = useStorefront(); // Get current storefront from context
  const storefront = storefrontProp || storefrontFromContext || 'LUNERA'; // Use prop if provided, otherwise context, fallback to LUNERA

  const navItems = useMemo(() => {
    // Filter categories that have products
    const categoriesWithProducts = categories.filter((category) =>
      products.some((product) => product.categoryId === category.id)
    );

    // Use current storefront for navigation links
    const storefrontPath = storefront || 'LUNERA'; // Fallback to LUNERA if not available

    return [
      { href: `/${storefrontPath}`, value: 'all', label: 'All Categories' },
      ...categoriesWithProducts.map((category) => ({
        href: `/${storefrontPath}/${category.slug}`,
        value: category.slug,
        label: category.label,
      })),
    ];
  }, [categories, products, storefront]);

  const isActive = (item) => {
    const storefrontPath = storefront || 'LUNERA';
    return (item.value === 'all' && pathname === `/${storefrontPath}`) || pathname === item.href;
  };

  const containerAlignment =
    align === 'start' ? 'justify-start' : 'justify-center sm:justify-start';

  return (
    <div className="relative">
      <div
        className="-mx-2 flex overflow-x-auto scroll-smooth px-2 sm:mx-0 sm:px-4 lg:px-6 hide-scrollbar"
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


