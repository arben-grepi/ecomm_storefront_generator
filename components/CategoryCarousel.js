'use client';

import { useMemo, useState, useEffect } from 'react';

export default function CategoryCarousel({ 
  align = 'center', 
  categories = [], 
  products = [], 
  selectedCategory = null, // null = "All Categories"
  onCategorySelect = null,
  onAllCategories = null,
}) {
  // Local state for immediate UI updates (optimistic update)
  const [localSelectedCategory, setLocalSelectedCategory] = useState(selectedCategory);
  
  // Sync local state with prop changes (from URL or external updates)
  useEffect(() => {
    if (localSelectedCategory !== selectedCategory) {
      console.log('[CategoryCarousel] 🔄 Syncing local state with prop - from:', localSelectedCategory, 'to:', selectedCategory);
      setLocalSelectedCategory(selectedCategory);
    }
  }, [selectedCategory, localSelectedCategory]);

  const navItems = useMemo(() => {
    // Show all active categories - don't filter based on current products
    // This ensures all categories remain visible even when one is selected
    const activeCategories = categories.filter((category) => category.active !== false);

    return [
      { value: 'all', label: 'All Categories', id: null },
      ...activeCategories.map((category) => ({
        value: category.slug,
        label: category.label,
        id: category.id,
      })),
    ];
  }, [categories]); // Removed products dependency - show all categories

  const isActive = (item) => {
    if (item.value === 'all') {
      return localSelectedCategory === null;
    }
    return localSelectedCategory === item.id;
  };

  const handleClick = (item) => {
    // Update UI immediately (optimistic update)
    console.log('[CategoryCarousel] 🖱️ Clicked category:', item.label, 'id:', item.id);
    if (item.value === 'all') {
      setLocalSelectedCategory(null);
      console.log('[CategoryCarousel] ✅ Updated local state to: null (All Categories)');
      onAllCategories?.();
    } else {
      setLocalSelectedCategory(item.id);
      console.log('[CategoryCarousel] ✅ Updated local state to:', item.id);
      onCategorySelect?.(item.id);
    }
  };

  const containerAlignment = align === 'start' ? 'justify-start' : 'justify-center sm:justify-start';

  return (
    <div className="overflow-x-auto scrollbar-hide scroll-smooth">
      <ul className={`flex flex-nowrap items-center gap-0 ${containerAlignment} min-w-full`}>
        {navItems.map((item, index) => {
          const active = isActive(item);
          return (
            <li key={item.value} className="flex-none flex items-center">
              {index > 0 && (
                <span className="mx-2 text-primary/40 text-sm">•</span>
              )}
              <button
                onClick={() => handleClick(item)}
                className={`rounded-full px-4 py-1 text-sm font-medium uppercase tracking-[0.3em] text-primary transition-all border-b ${
                  active
                    ? 'border-primary/20'
                    : 'border-transparent'
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
  );
}


