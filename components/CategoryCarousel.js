'use client';

import { useMemo } from 'react';
import { useStorefront } from '@/lib/storefront-context';

export default function CategoryCarousel({ 
  align = 'center', 
  categories = [], 
  products = [], 
  storefront: storefrontProp = null,
  selectedCategory = null, // null = "All Categories"
  onCategorySelect = null,
  onAllCategories = null,
}) {
  const storefrontFromContext = useStorefront(); // Get current storefront from context
  const storefront = storefrontProp || storefrontFromContext || 'LUNERA'; // Use prop if provided, otherwise context, fallback to LUNERA

  const navItems = useMemo(() => {
    // Filter categories that have products
    const categoriesWithProducts = categories.filter((category) =>
      products.some((product) => 
        product.categoryId === category.id || 
        (product.categoryIds && product.categoryIds.includes(category.id))
      )
    );

    return [
      { value: 'all', label: 'All Categories', id: null },
      ...categoriesWithProducts.map((category) => ({
        value: category.slug,
        label: category.label,
        id: category.id,
      })),
    ];
  }, [categories, products]);

  const isActive = (item) => {
    if (item.value === 'all') {
      return selectedCategory === null;
    }
    return selectedCategory === item.id;
  };

  const handleClick = (item) => {
    if (item.value === 'all') {
      if (onAllCategories) {
        onAllCategories();
      }
    } else {
      if (onCategorySelect) {
        onCategorySelect(item.id);
      }
    }
  };

  const containerAlignment =
    align === 'start' ? 'justify-start' : 'justify-center sm:justify-start';

  return (
    <div className="relative">
      <div
        className="flex flex-wrap items-center gap-0"
        aria-label="Browse categories"
      >
        <ul className={`flex w-full flex-wrap items-center gap-0 ${containerAlignment}`}>
          {navItems.map((item, index) => {
            const active = isActive(item);
            return (
              <li key={item.value} className="flex-none flex items-center">
                {/* Breadcrumb separator */}
                {index > 0 && (
                  <span className="mx-2 text-primary/40 text-xl font-medium sm:text-2xl">/</span>
                )}
                <button
                  onClick={() => handleClick(item)}
                  className={`inline-flex items-center px-4 py-2 text-xl font-medium transition sm:text-2xl ${
                    active
                      ? 'text-primary font-semibold'
                      : 'text-slate-500 hover:text-primary'
                  }`}
                  aria-current={active ? 'page' : undefined}
                >
                  {item.label}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}


