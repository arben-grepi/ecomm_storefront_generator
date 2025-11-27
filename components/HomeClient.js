'use client';

import { useEffect, useMemo, useState, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import SettingsMenu from '@/components/SettingsMenu';
import CategoryCard from '@/components/CategoryCard';
import CategoryCarousel from '@/components/CategoryCarousel';
import ProductCard from '@/components/ProductCard';
import SkeletonCard from '@/components/SkeletonCard';
import SkeletonProductCard from '@/components/SkeletonProductCard';
import { useCategories, useAllProducts } from '@/lib/firestore-data';
import { useCart } from '@/lib/cart';
import { useStorefront } from '@/lib/storefront-context';
import { saveStorefrontToCache } from '@/lib/get-storefront';
import { getStorefrontTheme } from '@/lib/storefront-logos';
import dynamic from 'next/dynamic';

const AdminRedirect = dynamic(() => import('@/components/AdminRedirect'), {
  ssr: false,
});

export default function HomeClient({ initialCategories = [], initialProducts = [], info = null, storefront: storefrontProp = null }) {
  console.log(`[COMPONENT] 🏠 HomeClient: Initializing with SSR data - Categories: ${initialCategories.length}, Products: ${initialProducts.length}, Info: ${info ? '✅' : '❌'}, Storefront: ${storefrontProp || 'not provided'}`);
  
  // Use storefront from prop (server-provided) or fallback to context
  const storefrontFromContext = useStorefront();
  const storefront = storefrontProp || storefrontFromContext;
  const theme = getStorefrontTheme(storefront); // Get theme for cart badge
  
  // Use real-time updates from Firebase, but start with server-rendered data
  // Pass initial data and storefront to hooks to avoid double-fetching
  const { categories: realtimeCategories, loading: categoriesLoading } = useCategories(initialCategories, storefront);
  const { products: realtimeProducts, loading: productsLoading } = useAllProducts(initialProducts, storefront);
  const { getCartItemCount } = useCart();
  const [hasMounted, setHasMounted] = useState(false);
  const [showSkeletons, setShowSkeletons] = useState(true);
  const [minDisplayTimeElapsed, setMinDisplayTimeElapsed] = useState(false);

  // Use ref to track start time (only set once on mount, avoids hydration mismatch)
  const componentStartTimeRef = useRef(null);
  
  useEffect(() => {
    if (componentStartTimeRef.current === null) {
      componentStartTimeRef.current = Date.now();
    }
    console.log(`[COMPONENT] 🏠 HomeClient: Component mounted`);
    setHasMounted(true);
    // Ensure skeletons show for at least 500ms for better UX
    const timer = setTimeout(() => {
      const componentDuration = componentStartTimeRef.current ? Date.now() - componentStartTimeRef.current : 0;
      console.log(`[COMPONENT] ⏱️  HomeClient: Minimum display time (500ms) elapsed (total: ${componentDuration}ms)`);
      setMinDisplayTimeElapsed(true);
    }, 500);
    return () => clearTimeout(timer);
  }, []);

  // Use real-time data if available (after hydration), otherwise use initial server data
  const categories = realtimeCategories.length > 0 ? realtimeCategories : initialCategories;
  const products = realtimeProducts.length > 0 ? realtimeProducts : initialProducts;
  
  console.log(`[COMPONENT] 📊 HomeClient: Data state - Categories: ${categories.length} (realtime: ${realtimeCategories.length}, initial: ${initialCategories.length}), Products: ${products.length} (realtime: ${realtimeProducts.length}, initial: ${initialProducts.length})`);
  console.log(`[COMPONENT] 📊 HomeClient: Loading state - Categories: ${categoriesLoading}, Products: ${productsLoading}`);

  // Hide skeletons once we have categories AND hooks have finished loading AND minimum display time has elapsed
  useEffect(() => {
    const canHideSkeletons = categories.length > 0 && !categoriesLoading && !productsLoading && minDisplayTimeElapsed;
    console.log(`[COMPONENT] 👻 HomeClient: Skeleton visibility check - Categories: ${categories.length}, CategoriesLoading: ${categoriesLoading}, ProductsLoading: ${productsLoading}, MinTimeElapsed: ${minDisplayTimeElapsed}, CanHide: ${canHideSkeletons}`);
    
    if (canHideSkeletons) {
      // Small delay to ensure smooth transition
      const timer = setTimeout(() => {
        const componentDuration = componentStartTimeRef.current ? Date.now() - componentStartTimeRef.current : 0;
        console.log(`[COMPONENT] ✅ HomeClient: Hiding skeletons and showing products (${componentDuration}ms since init)`);
        setShowSkeletons(false);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [categories.length, categoriesLoading, productsLoading, minDisplayTimeElapsed, componentStartTimeRef]);

  // Show loading skeletons if:
  // - We're still showing skeletons (initial load), OR
  // - Hooks are loading (even if we have SSR data, show skeletons while real-time loads)
  const loading = showSkeletons || categoriesLoading || productsLoading;
  console.log(`[COMPONENT] 🔄 HomeClient: Loading state - showSkeletons: ${showSkeletons}, categoriesLoading: ${categoriesLoading}, productsLoading: ${productsLoading}, final loading: ${loading}`);

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

  const categoryPreviews = useMemo(() => {
    console.log(`[COMPONENT] 🎨 HomeClient: Computing category previews - Categories: ${categories.length}, Products: ${products.length}, Loading: ${loading}`);
    
    // Don't compute previews if we're loading and have no data
    if (loading && categories.length === 0) {
      console.log(`[COMPONENT] ⏸️  HomeClient: Skipping preview computation (loading with no data)`);
      return [];
    }

    const filtered = categories
      .map((category) => {
        // Use previewProductIds if set, otherwise fall back to top products
        let categoryProducts = [];
        if (category.previewProductIds && category.previewProductIds.length > 0) {
          // Get products by their IDs in the order specified
          categoryProducts = category.previewProductIds
            .map((productId) => products.find((p) => p.id === productId))
            .filter(Boolean)
            .map((product) => ({
              id: product.id,
              image: product.image, // Use the image from the product
            }));
        } else {
          // Fallback: get top products by views, but only include those with images
          // Support both categoryId (single) and categoryIds (array) for backward compatibility
          categoryProducts = products
            .filter((product) => {
              const matchesCategory = product.categoryId === category.id || 
                                     (product.categoryIds && product.categoryIds.includes(category.id));
              return matchesCategory && product.image;
            })
            .sort((a, b) => {
              const aViews = a.metrics?.totalViews || 0;
              const bViews = b.metrics?.totalViews || 0;
              return bViews - aViews;
            })
            .slice(0, 4)
            .map((product) => ({
              id: product.id,
              image: product.image, // Only include products with actual images
            }));
        }

        // Check if category has any products at all (not just preview products)
        // Support both categoryId (single) and categoryIds (array) for backward compatibility
        const hasAnyProducts = products.some((product) => 
          product.categoryId === category.id || 
          (product.categoryIds && product.categoryIds.includes(category.id))
        );

        return {
          category,
          products: categoryProducts,
          hasAnyProducts,
        };
      })
      .filter(({ hasAnyProducts }) => hasAnyProducts);

    console.log(`[COMPONENT] ✅ HomeClient: Category previews computed - ${filtered.length} categories with products`);
    return filtered;
  }, [categories, products, loading]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-white via-secondary/40 to-white">
      <AdminRedirect />
          {/* Header */}
          <header className="sticky top-0 z-50 border-b border-secondary/70 bg-white/90 backdrop-blur">
            <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 sm:justify-between sm:gap-4 sm:px-6 lg:px-8">
              {/* Mobile: Logo, Desktop: Full branding */}
              <div className="flex flex-col sm:flex-col">
                <Link href={`/${storefront}`} className="flex items-center">
                  <Image
                    src="/Blerinas/Blerinas-logo-transparent2.png"
                    alt={siteInfo.companyName || 'Blerinas'}
                    width={300}
                    height={100}
                    className="h-12 w-auto sm:h-16"
                    priority
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

      {/* Category carousel - hidden on mobile */}
      <section className="hidden px-4 pt-4 sm:block sm:px-6 lg:px-8">
        <CategoryCarousel categories={categories} products={products} storefront={storefront} />
      </section>

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

      {/* Category Cards or Products Grid */}
      <main id="collection" className="mx-auto max-w-7xl px-3 pb-16 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-col gap-2 text-center sm:mb-12 sm:text-left">
          <h3 className="text-xl font-medium text-primary sm:text-2xl">{siteInfo.categorySectionHeading}</h3>
          <p className="text-sm text-slate-600 sm:text-base">
            {siteInfo.categorySectionDescription}
          </p>
        </div>
        {loading ? (
          <div className="flex flex-wrap justify-center gap-4 sm:gap-6">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <SkeletonCard key={i} className="w-full sm:w-[calc(50%-0.75rem)] xl:w-[calc(33.333%-1rem)] max-w-sm" />
            ))}
          </div>
        ) : categoryPreviews.length > 0 ? (
          // Show categories if we have them
          <div className="flex flex-wrap justify-center gap-4 sm:gap-6">
            {categoryPreviews.map(({ category, products }) => (
              <div key={category.id} className="w-full sm:w-[calc(50%-0.75rem)] xl:w-[calc(33.333%-1rem)] max-w-sm">
                <CategoryCard category={category} products={products} />
              </div>
            ))}
          </div>
        ) : products.length > 0 ? (
          // Fallback: Show products directly if we have products but no categories
          <div className="flex flex-wrap justify-center gap-3 sm:gap-4 md:gap-5">
            {products.map((product) => (
              <div key={product.id} className="w-[calc(50%-0.375rem)] sm:w-[calc(33.333%-0.667rem)] md:w-[calc(25%-0.938rem)] max-w-xs">
                <ProductCard
                  product={product}
                  categorySlug={product.categoryIds?.[0] || product.categoryId || 'all'}
                />
              </div>
            ))}
          </div>
        ) : (
          // No products or categories
          <div className="rounded-3xl border border-secondary/70 bg-white/80 p-6 text-center text-slate-500">
            Products will appear here soon. Check back shortly.
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

