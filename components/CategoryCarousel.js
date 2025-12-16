'use client';

import { useMemo, useState, useEffect, useRef } from 'react';

export default function CategoryCarousel({ 
  align = 'center', 
  categories = [], 
  products = [], 
  selectedCategory = null, // null = "All Categories"
  onCategorySelect = null,
  onAllCategories = null,
  storefront = null, // Storefront identifier (e.g., 'LUNERA')
  primaryColor = '#ec4899', // Default primary color (for backward compatibility)
  color = 'primary', // Color selection: 'primary', 'secondary', or 'tertiary'
  colorPalette = { colorPrimary: '#ec4899', colorSecondary: '#64748b', colorTertiary: '#94a3b8' },
  font = 'primary', // Font selection: 'primary', 'secondary', or 'tertiary'
  fontPalette = { fontPrimary: 'inherit', fontSecondary: 'inherit', fontTertiary: 'inherit' },
  fontSize = 0.875, // Font size in rem
}) {
  // Get actual color from color selection
  const getColorFromSelection = () => {
    if (color === 'primary') return colorPalette.colorPrimary || primaryColor;
    if (color === 'secondary') return colorPalette.colorSecondary || '#64748b';
    if (color === 'tertiary') return colorPalette.colorTertiary || '#94a3b8';
    return primaryColor; // Fallback
  };

  // Get actual font from font selection
  const getFontFromSelection = () => {
    if (font === 'primary') return fontPalette.fontPrimary || 'inherit';
    if (font === 'secondary') return fontPalette.fontSecondary || 'inherit';
    if (font === 'tertiary') return fontPalette.fontTertiary || 'inherit';
    return 'inherit'; // Fallback
  };
  
  const carouselColor = getColorFromSelection();
  const carouselFont = getFontFromSelection();
  
  // Helper function to convert hex to rgba with opacity
  const hexToRgba = (hex, opacity) => {
    // Remove # if present
    const cleanHex = hex.replace('#', '');
    // Parse RGB values
    const r = parseInt(cleanHex.substring(0, 2), 16);
    const g = parseInt(cleanHex.substring(2, 4), 16);
    const b = parseInt(cleanHex.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
  };
  
  // Local state for immediate UI updates (optimistic update)
  const [localSelectedCategory, setLocalSelectedCategory] = useState(selectedCategory);
  const scrollContainerRef = useRef(null);
  const [showLeftFade, setShowLeftFade] = useState(false);
  const [showRightFade, setShowRightFade] = useState(false);
  
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

    // For LUNERA storefront, prioritize "lingerie" and "underwear" categories
    if (storefront === 'LUNERA') {
      // Find specific categories by label (case-insensitive)
      const lingerieCategory = activeCategories.find(
        (cat) => cat.label?.toLowerCase() === 'lingerie' || cat.name?.toLowerCase() === 'lingerie'
      );
      const underwearCategory = activeCategories.find(
        (cat) => cat.label?.toLowerCase() === 'underwear' || cat.name?.toLowerCase() === 'underwear'
      );

      // Get remaining categories (excluding lingerie and underwear)
      const remainingCategories = activeCategories.filter(
        (cat) => cat !== lingerieCategory && cat !== underwearCategory
      );

      // Build ordered list: All Categories, lingerie (if exists), underwear (if exists), then rest
      const orderedCategories = [];
      if (lingerieCategory) {
        orderedCategories.push(lingerieCategory);
      }
      if (underwearCategory) {
        orderedCategories.push(underwearCategory);
      }
      orderedCategories.push(...remainingCategories);

      return [
        { value: 'all', label: 'All Categories', id: null },
        ...orderedCategories.map((category) => ({
          value: category.slug,
          label: category.label,
          id: category.id,
        })),
      ];
    }

    // For other storefronts, use default order
    return [
      { value: 'all', label: 'All Categories', id: null },
      ...activeCategories.map((category) => ({
        value: category.slug,
        label: category.label,
        id: category.id,
      })),
    ];
  }, [categories, storefront]); // Added storefront dependency

  // Check scroll position and show/hide fade indicators
  const checkScrollPosition = () => {
    if (!scrollContainerRef.current) return;
    const { scrollLeft, scrollWidth, clientWidth } = scrollContainerRef.current;
    setShowLeftFade(scrollLeft > 0);
    setShowRightFade(scrollLeft < scrollWidth - clientWidth - 1);
  };

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    // Check on mount and when navItems change
    checkScrollPosition();
    
    // Check on scroll
    container.addEventListener('scroll', checkScrollPosition);
    
    // Check on resize (categories might change)
    const resizeObserver = new ResizeObserver(() => {
      checkScrollPosition();
    });
    resizeObserver.observe(container);

    return () => {
      container.removeEventListener('scroll', checkScrollPosition);
      resizeObserver.disconnect();
    };
  }, [navItems]);

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

  const containerAlignment = align === 'start' ? 'justify-start' : 'justify-start';

  return (
    <div className="relative">
      {/* Left fade gradient - shows when scrolled right */}
      {showLeftFade && (
        <div 
          className="absolute left-0 top-0 bottom-0 w-8 pointer-events-none z-10"
          style={{
            background: 'linear-gradient(to right, rgba(255, 255, 255, 0.95), transparent)',
          }}
        />
      )}
      
      {/* Scrollable container - hide scrollbar completely */}
      <div 
        ref={scrollContainerRef}
        className="hide-scrollbar overflow-x-auto scroll-smooth"
        style={{
          WebkitOverflowScrolling: 'touch', /* Smooth scrolling on iOS */
        }}
        onScroll={checkScrollPosition}
      >
        <ul className={`flex flex-nowrap items-center gap-0 ${containerAlignment} min-w-max`}>
          {navItems.map((item, index) => {
            const active = isActive(item);
            return (
              <li key={item.value} className="flex-none flex items-center whitespace-nowrap">
                {index > 0 && (
                  <span className="mx-4" style={{ color: `${carouselColor}66`, fontSize: `clamp(0.75rem, ${fontSize}rem, 1rem)` }}>•</span>
                )}
                <button
                  onClick={() => handleClick(item)}
                  className="font-medium uppercase tracking-[0.3em] transition-all whitespace-nowrap"
                  style={{
                    color: carouselColor,
                    fontFamily: carouselFont,
                    borderBottom: active ? `0.1rem solid ${carouselColor}` : '0.1rem solid transparent',
                    fontSize: `clamp(0.75rem, ${fontSize}rem, 1.2rem)`,
                  }}
                  aria-current={active ? 'page' : undefined}
                >
                  {item.label}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
      
      {/* Right fade gradient - shows when there's more content to scroll */}
      {showRightFade && (
        <div 
          className="absolute right-0 top-0 bottom-0 w-8 pointer-events-none z-10"
          style={{
            background: 'linear-gradient(to left, rgba(255, 255, 255, 0.95), transparent)',
          }}
        />
      )}
    </div>
  );
}


