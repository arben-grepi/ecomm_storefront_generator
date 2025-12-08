'use client';

import { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import SettingsMenu from '@/components/SettingsMenu';
import CategoryCarousel from '@/components/CategoryCarousel';
import ProductCard from '@/components/ProductCard';
import SkeletonProductCard from '@/components/SkeletonProductCard';
import Banner from '@/components/Banner';
import { useCategories, useAllProducts, useProductsByCategory } from '@/lib/firestore-data';
import { useCart } from '@/lib/cart';
import { useStorefront } from '@/lib/storefront-context';
import { saveStorefrontToCache } from '@/lib/get-storefront';
import { getStorefrontTheme } from '@/lib/storefront-logos';
import { getTextColorProps } from '@/lib/text-color-utils';
import { preventOrphanedWords } from '@/lib/text-wrap-utils';
import dynamic from 'next/dynamic';

const AdminRedirect = dynamic(() => import('@/components/AdminRedirect'), {
  ssr: false,
});

export default function HomeClient({ initialCategories = [], initialProducts = [], info = null, storefront: storefrontProp = null }) {
  // 🔍 CLIENT COMPONENT (HYDRATION) - Set breakpoint here in Cursor
  
  // Use storefront from prop (server-provided) or fallback to context
  const storefrontFromContext = useStorefront();
  const storefront = storefrontProp || storefrontFromContext;
  const theme = getStorefrontTheme(storefront); // Get theme for cart badge
  
  // Get category from URL parameter if present (needed before hooks)
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const categoryParam = searchParams?.get('category');
  
  // Category filtering state (only for root/LUNERA storefront)
  // Always start with "All products" (null), URL parameter will be handled in useEffect
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [isFiltering, setIsFiltering] = useState(false);
  const [hasMounted, setHasMounted] = useState(false);
  const [showSkeletons, setShowSkeletons] = useState(true);
  const [shouldStartRealTimeListeners, setShouldStartRealTimeListeners] = useState(false);
  const [displayedProductsCount, setDisplayedProductsCount] = useState(20); // Show 20 products per page
  
  // Use real-time updates from Firebase, but start with server-rendered data
  // Pass initial data and storefront to hooks to avoid double-fetching
  // Delay real-time listeners until after initial render for better performance
  const { categories: realtimeCategories, loading: categoriesLoading } = useCategories(
    initialCategories, 
    storefront,
    shouldStartRealTimeListeners
  );
  
  // Use category-specific hook when category is selected, otherwise use all products
  // Only call useProductsByCategory when we actually have a category to avoid unnecessary hook calls
  const allProductsHook = useAllProducts(
    selectedCategory === null ? initialProducts : [], 
    storefront,
    shouldStartRealTimeListeners
  );
  const categoryProductsHook = useProductsByCategory(
    selectedCategory || null, // Pass null instead of undefined to avoid hook being called unnecessarily
    selectedCategory ? initialProducts : [],
    storefront,
    shouldStartRealTimeListeners
  );
  
  // Select the appropriate hook based on whether a category is selected
  const { products: realtimeProducts, loading: productsLoading, hasMore: hasMoreProducts, loadMore: loadMoreProducts } = 
    selectedCategory === null ? allProductsHook : categoryProductsHook;
  const { getCartItemCount } = useCart();

  // Use ref to track start time (only set once on mount, avoids hydration mismatch)
  const componentStartTimeRef = useRef(null);
  
  // Save storefront to cache immediately on mount and whenever it changes
  // This ensures the storefront is always cached for use in 404 pages and other navigation
  useEffect(() => {
    if (storefront && typeof window !== 'undefined') {
      saveStorefrontToCache(storefront);
    }
  }, [storefront]);
  
  useEffect(() => {
    if (componentStartTimeRef.current === null) {
      componentStartTimeRef.current = Date.now();
    }
    setHasMounted(true);
    
    // Delay real-time listeners until after initial render is complete
    // This improves initial render performance by not competing with SSR data
    const timer = requestAnimationFrame(() => {
      // Wait for next frame to ensure initial render is complete
      setTimeout(() => {
        setShouldStartRealTimeListeners(true);
      }, 100);
    });
    return () => cancelAnimationFrame(timer);
  }, []);

  // Use real-time data if available (after hydration), otherwise use initial server data
  const categories = realtimeCategories.length > 0 ? realtimeCategories : initialCategories;
  // When a category is selected, always use the hook's products (they're already filtered)
  // When showing all categories, fall back to initialProducts if hook hasn't loaded yet
  const products = selectedCategory === null 
    ? (realtimeProducts.length > 0 ? realtimeProducts : initialProducts)
    : realtimeProducts; // For category view, always use hook's filtered products
  
  // Debug: Log hook selection and products (only when category changes)
  useEffect(() => {
    const selectedCategoryData = selectedCategory 
      ? categories.find(c => c.id === selectedCategory)
      : null;
    const selectedCategoryName = selectedCategoryData?.label || selectedCategoryData?.name || 'All Categories';
    
    console.log('[HomeClient] 🔍 Category Filtering:', {
      category: selectedCategoryName,
      usingHook: selectedCategory === null ? 'allProductsHook' : 'categoryProductsHook',
      productsCount: realtimeProducts.length,
      loading: productsLoading,
    });
  }, [selectedCategory]); // Only log when category changes, not on every product update

  // Hide skeletons once we have categories AND hooks have finished loading
  // No minimum display time - show until we get actual data
  useEffect(() => {
    const canHideSkeletons = categories.length > 0 && !categoriesLoading && !productsLoading;
    
    if (canHideSkeletons) {
      // Small delay to ensure smooth transition
      const timer = setTimeout(() => {
        setShowSkeletons(false);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [categories.length, categoriesLoading, productsLoading]);

  // Track previous category to detect category changes
  const prevCategoryRef = useRef(selectedCategory);
  const categoryChangeTimeRef = useRef(null);
  
  // When category changes, set filtering state and track the change time
  // This ensures ghost cards show when category changes (from any source)
  useEffect(() => {
    if (prevCategoryRef.current !== selectedCategory) {
      const categoryData = selectedCategory 
        ? categories.find(c => c.id === selectedCategory)
        : null;
      const categoryName = categoryData?.label || categoryData?.name || 'All Categories';
      console.log('[HomeClient] 🔄 Category changed:', categoryName, '- showing ghost cards');
      setIsFiltering(true);
      categoryChangeTimeRef.current = Date.now();
      prevCategoryRef.current = selectedCategory;
    }
  }, [selectedCategory, categories]);
  
  // Stop filtering when products finish loading AND minimum display time has passed
  // This ensures ghost cards show for at least a brief moment even with cached data
  useEffect(() => {
    if (isFiltering && !productsLoading) {
      const minDisplayTime = 300; // milliseconds - ensures smooth transition
      const timeElapsed = Date.now() - (categoryChangeTimeRef.current || 0);
      
      if (timeElapsed >= minDisplayTime) {
        console.log('[HomeClient] ✅ Products loaded, hiding ghost cards');
        setIsFiltering(false);
      } else {
        const remainingTime = minDisplayTime - timeElapsed;
        const timer = setTimeout(() => {
          console.log('[HomeClient] ✅ Min display time met, hiding ghost cards');
          setIsFiltering(false);
        }, remainingTime);
        return () => clearTimeout(timer);
      }
    }
  }, [isFiltering, productsLoading]);

  // Show loading skeletons if:
  // - We're still showing skeletons (initial load), OR
  // - Hooks are loading (even if we have SSR data, show skeletons while real-time loads)
  const loading = showSkeletons || categoriesLoading || productsLoading;

  // Use info from server (for SEO), with empty strings as fallback
  // Filter out any error messages that might be stored in the database
  const rawInfo = info && Object.keys(info).length > 0 ? info : {
    companyName: '',
    companyTagline: '',
    heroMainHeading: '',
    heroDescription: '',
    heroBannerImage: '',
    categorySectionHeading: '',
    categorySectionDescription: '',
    allCategoriesTagline: '',
    footerText: '',
  };
  
  // Filter out error messages from heroMainHeading (in case it's stored in DB)
  // Include all font properties from rawInfo
  const siteInfo = {
    ...rawInfo,
    heroMainHeading: rawInfo.heroMainHeading && rawInfo.heroMainHeading.includes('Something went wrong')
      ? ''
      : rawInfo.heroMainHeading || '',
    // Ensure font properties are included (they should come from rawInfo, but explicitly include them)
    heroMainHeadingFontFamily: rawInfo.heroMainHeadingFontFamily,
    heroMainHeadingFontStyle: rawInfo.heroMainHeadingFontStyle,
    heroMainHeadingFontWeight: rawInfo.heroMainHeadingFontWeight,
    heroMainHeadingFontSize: rawInfo.heroMainHeadingFontSize,
  };
  
  // Log if we filtered out an error message
  if (rawInfo.heroMainHeading && rawInfo.heroMainHeading.includes('Something went wrong')) {
    console.warn('[HomeClient] ⚠️  Filtered out error message from heroMainHeading');
  }

  
  // Memoize "All Categories" product list (sorted by viewCount) to avoid recalculation
  const allProductsSorted = useMemo(() => {
    if (!products || products.length === 0) return [];
    
    return [...products].sort((a, b) => {
      // Use viewCount (new field) first, fall back to metrics.totalViews for backward compatibility
      const aViews = a.viewCount ?? a.metrics?.totalViews ?? 0;
      const bViews = b.viewCount ?? b.metrics?.totalViews ?? 0;
      return bViews - aViews; // Highest first
    });
  }, [products]);
  
  // Create a map of category ID to category slug for quick lookup
  const categorySlugMap = useMemo(() => {
    const map = new Map();
    categories.forEach((category) => {
      map.set(category.id, category.slug || category.id);
    });
    return map;
  }, [categories]);
  
  // When a category is selected, products are already filtered server-side by useProductsByCategory
  // So we just need to sort them, no additional filtering needed
  const filteredProducts = useMemo(() => {
    if (selectedCategory === null) {
      // "All Categories" - use memoized sorted list
      return allProductsSorted;
    }
    
    // Category is selected - products are already filtered by useProductsByCategory hook
    // Just sort by viewCount
    const sorted = [...products].sort((a, b) => {
      const aViews = a.viewCount ?? a.metrics?.totalViews ?? 0;
      const bViews = b.viewCount ?? b.metrics?.totalViews ?? 0;
      return bViews - aViews;
    });
    
    return sorted;
  }, [selectedCategory, allProductsSorted, products]);

  // Limit displayed products to current page (20 products per page)
  const displayedProducts = useMemo(() => {
    return filteredProducts.slice(0, displayedProductsCount);
  }, [filteredProducts, displayedProductsCount]);

  // Check if there are more products to load
  const hasMoreProductsToShow = filteredProducts.length > displayedProductsCount;
  
  // Update selectedCategory when URL parameter changes (e.g., when navigating from product page)
  // Only update if category actually changed to prevent double updates
  useEffect(() => {
    if (categoryParam && categories.length > 0) {
      const category = categories.find(
        (cat) => cat.id === categoryParam || cat.slug === categoryParam
      );
      if (category && category.id !== selectedCategory) {
        console.log('[HomeClient] 🔗 Setting category from URL:', category.label || category.name);
        setIsFiltering(true); // Show ghost cards when category changes from URL
        setSelectedCategory(category.id);
        setDisplayedProductsCount(20);
      }
    } else if (!categoryParam && selectedCategory !== null) {
      // URL parameter removed, clear selection
      console.log('[HomeClient] 🔗 Clearing category selection');
      setIsFiltering(true); // Show ghost cards when clearing category
      setSelectedCategory(null);
      setDisplayedProductsCount(20);
    }
  }, [categoryParam, categories]); // Removed selectedCategory from deps to prevent double updates
  
  // Category change logging is handled in the useEffect above (line 135)

  // Handle category selection with ghost card effect
  const handleCategorySelect = useCallback((categoryId) => {
    // Find the category to get its name and slug
    const category = categories.find(cat => cat.id === categoryId);
    const categoryName = category?.label || category?.name || 'Unknown';
    
    console.log('[HomeClient] 🎯 Category selected:', categoryName);
    
    // Set filtering state first to show ghost cards immediately
    setIsFiltering(true);
    setSelectedCategory(categoryId);
    setDisplayedProductsCount(20); // Reset to first page when category changes
    
    if (category) {
      // Update URL without causing navigation (use replace to avoid history entry)
      const params = new URLSearchParams();
      if (searchParams) {
        searchParams.forEach((value, key) => {
          if (key !== 'category') {
            params.append(key, value);
          }
        });
      }
      params.set('category', categoryId);
      
      const queryString = params.toString();
      const newUrl = queryString ? `${pathname}?${queryString}` : `${pathname}?category=${categoryId}`;
      // Use replace instead of push to avoid adding to history and prevent double navigation
      router.replace(newUrl, { scroll: false });
    }
  }, [categories, searchParams, pathname, router]);
  
  // Handle "All Categories" selection
  const handleAllCategories = useCallback(() => {
    console.log('[HomeClient] 🎯 All Categories selected');
    setIsFiltering(true);
    setSelectedCategory(null);
    setDisplayedProductsCount(20); // Reset to first page when switching to All Categories
    
    // Remove category parameter from URL
    const params = new URLSearchParams();
    if (searchParams) {
      searchParams.forEach((value, key) => {
        if (key !== 'category') {
          params.append(key, value);
        }
      });
    }
    
    const queryString = params.toString();
    const newUrl = queryString ? `${pathname}?${queryString}` : pathname;
    // Use replace instead of push to avoid adding to history and prevent double navigation
    router.replace(newUrl, { scroll: false });
  }, [searchParams, pathname, router]);

  // Handle loading more products (client-side pagination)
  const handleLoadMore = () => {
    setDisplayedProductsCount((prev) => prev + 20);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-white via-secondary/40 to-white">
      <AdminRedirect />
          {/* Header */}
          <header className="sticky top-0 z-50 border-b border-secondary/70 bg-white/90 backdrop-blur">
            <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 sm:justify-between sm:gap-4 sm:px-6 lg:px-8">
              {/* Mobile: Logo, Desktop: Full branding */}
              <div className="flex flex-col sm:flex-col">
                <Link href={storefront === 'LUNERA' ? '/' : `/${storefront}`} className="flex items-center">
                  <Image
                    src="/Blerinas/Blerinas-logo-transparent2.png"
                    alt={siteInfo.companyName || 'Blerinas'}
                    width={300}
                    height={100}
                    className="h-12 w-auto sm:h-16"
                    priority
                    onLoad={(e) => {
                      // Image loaded successfully (no logging needed)
                    }}
                    onError={(e) => {
                      console.error(`[PERF] ❌ Logo image failed to load: ${e.target.src}`);
                    }}
                  />
                </Link>
                {siteInfo.companyTagline && (() => {
                  const colorPalette = {
                    colorPrimary: siteInfo.colorPrimary,
                    colorSecondary: siteInfo.colorSecondary,
                    colorTertiary: siteInfo.colorTertiary,
                  };
                  const primaryColor = colorPalette.colorPrimary || '#ec4899';
                  const wrappedText = preventOrphanedWords(siteInfo.companyTagline);
                  return (
                    <span 
                      className="rounded-full px-4 py-1 text-xs font-medium uppercase tracking-[0.3em]"
                      style={{ color: primaryColor }}
                      dangerouslySetInnerHTML={{ __html: wrappedText }}
                    />
                  );
                })()}
              </div>
              {/* Spacer for mobile to push buttons to right */}
              <div className="flex-1 sm:hidden" />
              <div className="flex w-full items-center justify-end gap-3 sm:w-auto sm:gap-4">
                {/* Cart icon - only show if cart has items (after hydration to avoid mismatch) */}
                {hasMounted && getCartItemCount() > 0 && (() => {
                  const colorPalette = {
                    colorPrimary: siteInfo.colorPrimary,
                    colorSecondary: siteInfo.colorSecondary,
                    colorTertiary: siteInfo.colorTertiary,
                  };
                  const primaryColor = colorPalette.colorPrimary || '#ec4899';
                  return (
                    <Link
                      href={`/cart?storefront=${encodeURIComponent(storefront)}`}
                      onClick={() => {
                        // Ensure storefront is saved to cache before navigating to cart
                        if (storefront && typeof window !== 'undefined') {
                          saveStorefrontToCache(storefront);
                        }
                      }}
                      className="relative ml-2 flex items-center justify-center rounded-full border bg-white/80 p-2.5 shadow-sm transition-colors hover:bg-secondary"
                      style={{ 
                        borderColor: `${primaryColor}4D`,
                        color: primaryColor,
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.color = primaryColor;
                      }}
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
                      <span 
                        className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full text-xs font-semibold text-white" 
                        style={{ backgroundColor: primaryColor }}
                        suppressHydrationWarning
                      >
                        {getCartItemCount() > 9 ? '9+' : getCartItemCount()}
                      </span>
                    </Link>
                  );
                })()}
                <SettingsMenu />
              </div>
            </div>
          </header>

      {/* Hero Section with Banner */}
      <Banner 
        imageSrc={siteInfo.heroBannerImage} 
        maxHeight={siteInfo.heroBannerMaxHeight || 550}
        marginBottom={siteInfo.heroBannerMarginBottom || 40}
      >
        {/* Hero text content centered on banner */}
        <section 
          className="px-4 py-10 sm:px-6 sm:py-16"
          style={{ 
            maxWidth: `${siteInfo.heroBannerTextWidth ?? 75}%`,
            margin: '0 auto',
            width: '100%',
          }}
        >
          <div className="mx-auto flex flex-col items-center gap-6 text-center">
            {siteInfo.heroMainHeading && !siteInfo.heroMainHeading.includes('Something went wrong') && (() => {
              const colorPalette = {
                colorPrimary: siteInfo.colorPrimary,
                colorSecondary: siteInfo.colorSecondary,
                colorTertiary: siteInfo.colorTertiary,
              };
              const primaryColor = colorPalette.colorPrimary || '#ec4899';
              const wrappedText = preventOrphanedWords(siteInfo.heroMainHeading);
              return (
                <h2 
                  style={{ 
                    color: primaryColor,
                    fontFamily: siteInfo.heroMainHeadingFontFamily || 'inherit',
                    fontStyle: siteInfo.heroMainHeadingFontStyle || 'normal',
                    fontWeight: siteInfo.heroMainHeadingFontWeight || '300',
                    fontSize: `${siteInfo.heroMainHeadingFontSize || 48}px`,
                  }}
                  dangerouslySetInnerHTML={{ __html: wrappedText }}
                />
              );
            })()}
            {siteInfo.heroDescription && (() => {
              const colorPalette = {
                colorPrimary: siteInfo.colorPrimary,
                colorSecondary: siteInfo.colorSecondary,
                colorTertiary: siteInfo.colorTertiary,
              };
              const colorProps = getTextColorProps(siteInfo.heroDescriptionColor || 'secondary', colorPalette);
              const wrappedText = preventOrphanedWords(siteInfo.heroDescription);
              return (
                <p className={`text-base sm:text-lg ${colorProps.className}`} style={colorProps.style} dangerouslySetInnerHTML={{ __html: wrappedText }} />
              );
            })()}
          </div>
        </section>
      </Banner>

      {/* Products Grid */}
      <main id="collection" className="mx-auto max-w-7xl px-3 pb-16 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-col gap-2 text-center sm:mb-12 sm:text-left">
          <CategoryCarousel 
            categories={categories} 
            products={products} 
            storefront={storefront}
            selectedCategory={selectedCategory}
            onCategorySelect={handleCategorySelect}
            onAllCategories={handleAllCategories}
          />
          {/* Show selected category description if available, or "All Categories" tagline */}
          {(() => {
            if (selectedCategory) {
              const selectedCategoryData = categories.find(cat => cat.id === selectedCategory);
              if (selectedCategoryData?.description) {
                const colorPalette = {
                  colorPrimary: siteInfo.colorPrimary,
                  colorSecondary: siteInfo.colorSecondary,
                  colorTertiary: siteInfo.colorTertiary,
                };
                const colorProps = getTextColorProps(siteInfo.categoryDescriptionColor || 'secondary', colorPalette);
                const wrappedText = preventOrphanedWords(selectedCategoryData.description);
                return (
                  <p className={`text-sm sm:text-base mt-2 ${colorProps.className}`} style={colorProps.style} dangerouslySetInnerHTML={{ __html: wrappedText }} />
                );
              }
              // If category is selected but has no description, show nothing
              return null;
            }
            // Show "All Categories" tagline when no category is selected
            if (siteInfo.allCategoriesTagline) {
              const colorPalette = {
                colorPrimary: siteInfo.colorPrimary,
                colorSecondary: siteInfo.colorSecondary,
                colorTertiary: siteInfo.colorTertiary,
              };
              const colorProps = getTextColorProps(siteInfo.categoryDescriptionColor || 'secondary', colorPalette);
              const wrappedText = preventOrphanedWords(siteInfo.allCategoriesTagline);
              return (
                <p className={`text-sm sm:text-base mt-2 ${colorProps.className}`} style={colorProps.style} dangerouslySetInnerHTML={{ __html: wrappedText }} />
              );
            }
            return null;
          })()}
        </div>
        {loading || isFiltering || productsLoading ? (
          // Show ghost cards while loading or filtering
          <div className="flex flex-wrap justify-center gap-3 sm:gap-4 md:gap-5">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
              <SkeletonProductCard key={i} className="w-[calc(50%-0.375rem)] sm:w-[calc(33.333%-0.667rem)] md:w-[calc(25%-0.938rem)] max-w-xs" />
            ))}
          </div>
        ) : displayedProducts.length > 0 ? (
          // Show filtered products (sorted by viewCount, limited to current page)
          <div className="flex flex-wrap justify-center gap-3 sm:gap-4 md:gap-5">
            {displayedProducts.map((product) => {
              // Get category slug from category ID
              const categoryId = product.categoryIds?.[0] || product.categoryId;
              const categorySlug = categoryId ? (categorySlugMap.get(categoryId) || categoryId) : 'all';
              return (
                <div key={product.id} className="w-[calc(50%-0.375rem)] sm:w-[calc(33.333%-0.667rem)] md:w-[calc(25%-0.938rem)] max-w-xs">
                  <ProductCard
                    product={product}
                    categorySlug={categorySlug}
                  />
                </div>
              );
            })}
          </div>
        ) : (
          // No products
          (() => {
            const colorPalette = {
              colorPrimary: siteInfo.colorPrimary,
              colorSecondary: siteInfo.colorSecondary,
              colorTertiary: siteInfo.colorTertiary,
            };
            const colorProps = getTextColorProps(siteInfo.categoryDescriptionColor || 'secondary', colorPalette);
            const noProductsText = selectedCategory ? 'No products found in this category.' : 'Products will appear here soon. Check back shortly.';
            const wrappedText = preventOrphanedWords(noProductsText);
            return (
              <div className={`rounded-3xl border border-secondary/70 bg-white/80 p-6 text-center ${colorProps.className}`} style={colorProps.style} dangerouslySetInnerHTML={{ __html: wrappedText }} />
            );
          })()
        )}
        {/* Load More button - show if we have more products to display (client-side pagination) or server-side pagination for All Categories */}
        {!loading && !isFiltering && (
          <>
            {/* Client-side pagination for both All Categories and category views */}
            {hasMoreProductsToShow && (() => {
              const colorPalette = {
                colorPrimary: siteInfo.colorPrimary,
                colorSecondary: siteInfo.colorSecondary,
                colorTertiary: siteInfo.colorTertiary,
              };
              const primaryColor = colorPalette.colorPrimary || '#ec4899';
              return (
                <div className="mt-8 flex justify-center">
                  <button
                    onClick={handleLoadMore}
                    className="rounded-full border bg-white/80 px-6 py-3 text-sm font-medium shadow-sm transition-colors hover:bg-secondary disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{ 
                      borderColor: `${primaryColor}4D`,
                      color: primaryColor,
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.color = primaryColor;
                    }}
                  >
                    Load More Products ({filteredProducts.length - displayedProductsCount} more)
                  </button>
                </div>
              );
            })()}
            {/* Server-side pagination for All Categories (load more from Firestore) */}
            {!selectedCategory && hasMoreProducts && !hasMoreProductsToShow && (() => {
              const colorPalette = {
                colorPrimary: siteInfo.colorPrimary,
                colorSecondary: siteInfo.colorSecondary,
                colorTertiary: siteInfo.colorTertiary,
              };
              const primaryColor = colorPalette.colorPrimary || '#ec4899';
              return (
                <div className="mt-8 flex justify-center">
                  <button
                    onClick={loadMoreProducts}
                    disabled={productsLoading}
                    className="rounded-full border bg-white/80 px-6 py-3 text-sm font-medium shadow-sm transition-colors hover:bg-secondary disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{ 
                      borderColor: `${primaryColor}4D`,
                      color: primaryColor,
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.color = primaryColor;
                    }}
                  >
                    {productsLoading ? 'Loading...' : 'Load More Products'}
                  </button>
                </div>
              );
            })()}
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-secondary/70 bg-white">
        {(() => {
          const colorPalette = {
            colorPrimary: siteInfo.colorPrimary,
            colorSecondary: siteInfo.colorSecondary,
            colorTertiary: siteInfo.colorTertiary,
          };
          const colorProps = getTextColorProps(siteInfo.footerTextColor || 'tertiary', colorPalette);
          const wrappedText = preventOrphanedWords(siteInfo.footerText);
          return (
            <div className={`mx-auto max-w-7xl px-4 py-10 text-center text-sm sm:px-6 lg:px-8 ${colorProps.className}`} style={colorProps.style} dangerouslySetInnerHTML={{ __html: wrappedText }} />
          );
        })()}
      </footer>
    </div>
  );
}

