'use client';

import { useEffect, useMemo, useState, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import SettingsMenu from '@/components/SettingsMenu';
import CategoryCarousel from '@/components/CategoryCarousel';
import ProductCard from '@/components/ProductCard';
import SkeletonProductCard from '@/components/SkeletonProductCard';
import { useCategories, useAllProducts, useProductsByCategory } from '@/lib/firestore-data';
import { useCart } from '@/lib/cart';
import { useStorefront } from '@/lib/storefront-context';
import { saveStorefrontToCache } from '@/lib/get-storefront';
import { getStorefrontTheme } from '@/lib/storefront-logos';
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
  const categoryParam = searchParams?.get('category');
  
  // Category filtering state (only for root/LUNERA storefront)
  // Initialize from URL parameter if present
  const [selectedCategory, setSelectedCategory] = useState(() => {
    // Try to find category by ID or slug from URL parameter
    if (categoryParam && initialCategories.length > 0) {
      const category = initialCategories.find(
        (cat) => cat.id === categoryParam || cat.slug === categoryParam
      );
      return category ? category.id : null;
    }
    return null;
  });
  const [isFiltering, setIsFiltering] = useState(false);
  const [hasMounted, setHasMounted] = useState(false);
  const [showSkeletons, setShowSkeletons] = useState(true);
  const [shouldStartRealTimeListeners, setShouldStartRealTimeListeners] = useState(false);
  
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
  const products = realtimeProducts.length > 0 ? realtimeProducts : initialProducts;

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
    categorySectionHeading: '',
    categorySectionDescription: '',
    footerText: '',
  };
  
  // Filter out error messages from heroMainHeading (in case it's stored in DB)
  const siteInfo = {
    ...rawInfo,
    heroMainHeading: rawInfo.heroMainHeading && rawInfo.heroMainHeading.includes('Something went wrong')
      ? ''
      : rawInfo.heroMainHeading || '',
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
    return [...products].sort((a, b) => {
      const aViews = a.viewCount ?? a.metrics?.totalViews ?? 0;
      const bViews = b.viewCount ?? b.metrics?.totalViews ?? 0;
      return bViews - aViews;
    });
  }, [selectedCategory, allProductsSorted, products]);
  
  // Update selectedCategory when URL parameter changes (e.g., when navigating from product page)
  useEffect(() => {
    if (categoryParam && categories.length > 0) {
      const category = categories.find(
        (cat) => cat.id === categoryParam || cat.slug === categoryParam
      );
      if (category && category.id !== selectedCategory) {
        setSelectedCategory(category.id);
      }
    } else if (!categoryParam && selectedCategory !== null) {
      // URL parameter removed, clear selection
      setSelectedCategory(null);
    }
  }, [categoryParam, categories, selectedCategory]);

  // Handle category selection with ghost card effect
  const handleCategorySelect = (categoryId) => {
    setIsFiltering(true);
    setSelectedCategory(categoryId);
    
    // Simulate filtering delay for ghost card effect
    setTimeout(() => {
      setIsFiltering(false);
    }, 300);
  };
  
  // Handle "All Categories" selection
  const handleAllCategories = () => {
    setIsFiltering(true);
    setSelectedCategory(null);
    
    // Simulate filtering delay for ghost card effect
    setTimeout(() => {
      setIsFiltering(false);
    }, 100); // Shorter delay since we're using memoized data
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
                <p className="hidden text-sm text-slate-500 sm:block">
                  {siteInfo.companyTagline}
                </p>
              </div>
              {/* Spacer for mobile to push buttons to right */}
              <div className="flex-1 sm:hidden" />
              <div className="flex w-full items-center justify-end gap-3 sm:w-auto sm:gap-4">
                {/* Cart icon - only show if cart has items (after hydration to avoid mismatch) */}
                {hasMounted && getCartItemCount() > 0 && (
                  <Link
                    href={`/cart?storefront=${encodeURIComponent(storefront)}`}
                    onClick={() => {
                      // Ensure storefront is saved to cache before navigating to cart
                      if (storefront && typeof window !== 'undefined') {
                        saveStorefrontToCache(storefront);
                      }
                    }}
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
                    <span 
                      className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full text-xs font-semibold text-white" 
                      style={{ backgroundColor: theme.primaryColor }}
                      suppressHydrationWarning
                    >
                      {getCartItemCount() > 9 ? '9+' : getCartItemCount()}
                    </span>
                  </Link>
                )}
                <SettingsMenu />
              </div>
            </div>
          </header>

      {/* Hero Section */}
      <section className="px-4 py-10 sm:px-6 sm:py-16">
        <div className="mx-auto flex max-w-3xl flex-col items-center gap-6 text-center">
          <span className="rounded-full bg-white/70 px-4 py-1 text-xs font-medium uppercase tracking-[0.3em] text-primary">
            Explore the Edit
          </span>
          {siteInfo.heroMainHeading && !siteInfo.heroMainHeading.includes('Something went wrong') && (
            <h2 className="text-3xl font-light text-primary sm:text-5xl">
              {siteInfo.heroMainHeading}
            </h2>
          )}
          {siteInfo.heroDescription && (
            <p className="text-base text-slate-600 sm:text-lg">
              {siteInfo.heroDescription}
            </p>
          )}
        </div>
      </section>

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
          {siteInfo.categorySectionDescription && (
            <p className="text-sm text-slate-600 sm:text-base mt-2">
              {siteInfo.categorySectionDescription}
            </p>
          )}
        </div>
        {loading || isFiltering ? (
          // Show ghost cards while loading or filtering
          <div className="flex flex-wrap justify-center gap-3 sm:gap-4 md:gap-5">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
              <SkeletonProductCard key={i} className="w-[calc(50%-0.375rem)] sm:w-[calc(33.333%-0.667rem)] md:w-[calc(25%-0.938rem)] max-w-xs" />
            ))}
          </div>
        ) : filteredProducts.length > 0 ? (
          // Show filtered products (sorted by viewCount)
          <div className="flex flex-wrap justify-center gap-3 sm:gap-4 md:gap-5">
            {filteredProducts.map((product) => {
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
          <div className="rounded-3xl border border-secondary/70 bg-white/80 p-6 text-center text-slate-500">
            {selectedCategory ? 'No products found in this category.' : 'Products will appear here soon. Check back shortly.'}
          </div>
        )}
        {/* Load More button - only show if not filtering by category and has more products */}
        {!selectedCategory && hasMoreProducts && !loading && (
          <div className="mt-8 flex justify-center">
            <button
              onClick={loadMoreProducts}
              disabled={productsLoading}
              className="rounded-full border border-primary/30 bg-white/80 px-6 py-3 text-sm font-medium text-primary shadow-sm transition-colors hover:bg-secondary hover:text-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {productsLoading ? 'Loading...' : 'Load More Products'}
            </button>
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

