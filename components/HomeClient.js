'use client';

import { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import SettingsMenu from '@/components/SettingsMenu';
import InstagramLogo from '@/components/InstagramLogo';
import CategoryCarousel from '@/components/CategoryCarousel';
import ProductCardWrapper from '@/components/ProductCardWrapper';
import SkeletonProductCardWrapper from '@/components/SkeletonProductCardWrapper';
import { saveInfoToCache } from '@/lib/info-cache';
import Banner from '@/components/Banner';
import { useCategories, useAllProducts, useProductsByCategory } from '@/lib/firestore-data';
import { useCart } from '@/lib/cart';
import { useStorefront } from '@/lib/storefront-context';
import { saveStorefrontToCache } from '@/lib/get-storefront';
import { getStorefrontTheme, getStorefrontLogo, getStorefrontBanner } from '@/lib/storefront-logos';
import { getLogo, saveLogoToCache } from '@/lib/logo-cache';
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

  // Cache Info document and logo when received from server
  useEffect(() => {
    if (info && storefront && typeof window !== 'undefined' && Object.keys(info).length > 0) {
      const { saveInfoToCache } = require('@/lib/info-cache');
      saveInfoToCache(storefront, info);
      
      // Cache logo path when info is available
      const logoPath = getLogo(storefront, info);
      if (logoPath) {
        saveLogoToCache(storefront, logoPath);
      }
    }
  }, [info, storefront]);
  
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

  // Intercept return from Shopify checkout and redirect to custom thank-you page
  useEffect(() => {
    if (!hasMounted || typeof window === 'undefined' || !storefront) return;

    const checkForCheckoutReturn = async () => {
      try {
        // Check if user just completed checkout
        const checkoutInitiated = sessionStorage.getItem('checkout_initiated');
        const storedStorefront = sessionStorage.getItem('storefront_id');
        const checkoutTimestamp = sessionStorage.getItem('checkout_timestamp');

        if (!checkoutInitiated || storedStorefront !== storefront) {
          return; // No checkout flag or different storefront
        }

        // Clear flag immediately to prevent multiple redirects
        sessionStorage.removeItem('checkout_initiated');
        sessionStorage.removeItem('storefront_id');
        sessionStorage.removeItem('checkout_timestamp');

        // Check if checkout was recent (within last 10 minutes)
        const timestamp = checkoutTimestamp ? parseInt(checkoutTimestamp, 10) : 0;
        const tenMinutesAgo = Date.now() - (10 * 60 * 1000);
        if (timestamp < tenMinutesAgo) {
          console.log('[HomeClient] Checkout flag expired, skipping redirect');
          return;
        }

        // Fetch recent order from Firestore using checkout session
        const { getFirebaseDb } = await import('@/lib/firebase');
        const { collection, query, where, orderBy, limit, getDocs, Timestamp } = await import('firebase/firestore');
        
        const db = getFirebaseDb();
        if (!db) {
          console.warn('[HomeClient] Firebase not available for order lookup');
          return;
        }

        // Try to get checkout session from localStorage
        const checkoutSessionStr = localStorage.getItem('checkout_session');
        if (!checkoutSessionStr) {
          console.log('[HomeClient] No checkout session found');
          return;
        }

        const checkoutSession = JSON.parse(checkoutSessionStr);
        if (!checkoutSession.storefront || !checkoutSession.timestamp) {
          console.log('[HomeClient] Invalid checkout session');
          return;
        }

        // Poll for order created after checkout session timestamp
        const sessionTimestamp = Timestamp.fromMillis(checkoutSession.timestamp);
        const confirmationsRef = collection(db, 'orderConfirmations');
        const q = query(
          confirmationsRef,
          where('storefront', '==', storefront),
          where('createdAt', '>=', sessionTimestamp),
          orderBy('createdAt', 'desc'),
          limit(1)
        );

        const snapshot = await getDocs(q);
        if (!snapshot.empty) {
          const orderDoc = snapshot.docs[0];
          const orderData = orderDoc.data();
          
          if (orderData.confirmationNumber) {
            console.log('[HomeClient] Found recent order, redirecting to thank-you page');
            // Clean up checkout session
            localStorage.removeItem('checkout_session');
            // Redirect to thank-you page
            router.push(`/thank-you?confirmation=${orderData.confirmationNumber}`);
            return;
          }
        }

        // If no order found yet, wait a bit and try again (webhook might still be processing)
        console.log('[HomeClient] No order found yet, will retry in 2 seconds');
        setTimeout(async () => {
          const retrySnapshot = await getDocs(q);
          if (!retrySnapshot.empty) {
            const orderDoc = retrySnapshot.docs[0];
            const orderData = orderDoc.data();
            if (orderData.confirmationNumber) {
              console.log('[HomeClient] Found order on retry, redirecting to thank-you page');
              localStorage.removeItem('checkout_session');
              router.push(`/thank-you?confirmation=${orderData.confirmationNumber}`);
            }
          }
        }, 2000);
      } catch (error) {
        console.error('[HomeClient] Error checking for checkout return:', error);
        // Don't block the page if there's an error
      }
    };

    // Only check once after mount
    const timeout = setTimeout(checkForCheckoutReturn, 500);
    return () => clearTimeout(timeout);
  }, [hasMounted, storefront, router]);

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
  // Helper functions to get color and font from selections
  const getColorFromSelection = (colorSelection) => {
    switch (colorSelection) {
      case 'primary': return rawInfo.colorPrimary || '#ec4899';
      case 'secondary': return rawInfo.colorSecondary || '#64748b';
      case 'tertiary': return rawInfo.colorTertiary || '#94a3b8';
      default: return rawInfo.colorPrimary || '#ec4899';
    }
  };

  const getFontFromSelection = (fontSelection) => {
    switch (fontSelection) {
      case 'primary': return rawInfo.fontPrimary || 'inherit';
      case 'secondary': return rawInfo.fontSecondary || 'inherit';
      case 'tertiary': return rawInfo.fontTertiary || 'inherit';
      default: return 'inherit';
    }
  };

  // Memoize siteInfo to prevent unnecessary re-renders, especially for banner image
  const siteInfo = useMemo(() => ({
    ...rawInfo,
    heroMainHeading: rawInfo.heroMainHeading && rawInfo.heroMainHeading.includes('Something went wrong')
      ? ''
      : rawInfo.heroMainHeading || '',
    // Parse all font sizes
    companyTaglineFontSize: rawInfo.companyTaglineFontSize != null ? Math.max(parseFloat(rawInfo.companyTaglineFontSize), 1.3) : 1.3,
    heroMainHeadingFontSize: rawInfo.heroMainHeadingFontSize != null ? parseFloat(rawInfo.heroMainHeadingFontSize) || 4 : 4,
    heroDescriptionFontSize: rawInfo.heroDescriptionFontSize != null ? parseFloat(rawInfo.heroDescriptionFontSize) || 1 : 1,
    // Banner settings
    heroBannerTextWidth: rawInfo.heroBannerTextWidth != null ? parseFloat(rawInfo.heroBannerTextWidth) || 75 : 75,
    heroBannerCropTop: rawInfo.heroBannerCropTop != null ? parseFloat(rawInfo.heroBannerCropTop) || 0 : 0,
    heroBannerCropBottom: rawInfo.heroBannerCropBottom != null ? parseFloat(rawInfo.heroBannerCropBottom) || 0 : 0,
    // Category Carousel styling
    categoryCarouselFontSize: rawInfo.categoryCarouselFontSize != null ? parseFloat(rawInfo.categoryCarouselFontSize) || 0.875 : 0.875,
    // All Categories Tagline styling - explicitly include color and font
    allCategoriesTaglineColor: rawInfo.allCategoriesTaglineColor || 'secondary',
    allCategoriesTaglineFont: rawInfo.allCategoriesTaglineFont || 'primary',
    allCategoriesTaglineFontSize: rawInfo.allCategoriesTaglineFontSize != null ? parseFloat(rawInfo.allCategoriesTaglineFontSize) || 1 : 1,
    // Product Card styling
    productCardType: rawInfo.productCardType || 'minimal',
    // Convert boolean to aspect ratio string for ProductCard component
    productCardAspectRatio: rawInfo.productCardIsSquare === true ? '1:1' : '3:4',
    productCardColumnsPhone: rawInfo.productCardColumnsPhone != null ? parseInt(rawInfo.productCardColumnsPhone) || 2 : 2,
    productCardColumnsTablet: rawInfo.productCardColumnsTablet != null ? parseInt(rawInfo.productCardColumnsTablet) || 3 : 3,
    productCardColumnsLaptop: rawInfo.productCardColumnsLaptop != null ? parseInt(rawInfo.productCardColumnsLaptop) || 4 : 4,
    productCardColumnsDesktop: rawInfo.productCardColumnsDesktop != null ? parseInt(rawInfo.productCardColumnsDesktop) || 5 : 5,
    productCardGap: rawInfo.productCardGap != null ? (isNaN(parseFloat(rawInfo.productCardGap)) ? 1 : parseFloat(rawInfo.productCardGap)) : 1,
    productCardBorderRadius: rawInfo.productCardBorderRadius || 'medium',
    productCardNameColor: rawInfo.productCardNameColor || 'primary',
    productCardNameFont: rawInfo.productCardNameFont || 'primary',
    productCardNameFontSize: rawInfo.productCardNameFontSize != null ? parseFloat(rawInfo.productCardNameFontSize) || 0.65 : 0.65,
    productCardPriceColor: rawInfo.productCardPriceColor || 'primary',
    productCardPriceFont: rawInfo.productCardPriceFont || 'primary',
    productCardPriceFontSize: rawInfo.productCardPriceFontSize != null ? parseFloat(rawInfo.productCardPriceFontSize) || 1 : 1,
    productCardVatText: rawInfo.productCardVatText || 'Includes VAT',
    productCardVatColor: rawInfo.productCardVatColor || 'secondary',
    productCardVatFont: rawInfo.productCardVatFont || 'primary',
    productCardVatFontSize: rawInfo.productCardVatFontSize != null ? parseFloat(rawInfo.productCardVatFontSize) || 0.75 : 0.75,
    footerTextFontSize: rawInfo.footerTextFontSize != null ? parseFloat(rawInfo.footerTextFontSize) || 0.875 : 0.875,
  }), [rawInfo]);
  
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
                    src={getLogo(storefront, siteInfo)}
                    alt={siteInfo.companyName || storefront}
                    width={300}
                    height={100}
                    className="h-12 w-auto sm:h-16 object-contain flex-shrink-0"
                    style={{ objectFit: 'contain' }}
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
                  const wrappedText = preventOrphanedWords(siteInfo.companyTagline);
                  const baseSize = siteInfo.companyTaglineFontSize || 1.3;
                  return (
                    <span 
                      className="rounded-full px-3 py-1 font-medium uppercase tracking-[0.3em] whitespace-nowrap overflow-hidden"
                      style={{ 
                        color: getColorFromSelection(siteInfo.companyTaglineColor || 'primary'),
                        fontFamily: getFontFromSelection(siteInfo.companyTaglineFont || 'primary'),
                        fontSize: `clamp(0.6rem, ${baseSize * 0.5}vw, ${baseSize}rem)`,
                        marginLeft: '1%',
                      }}
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
                  const secondaryColor = colorPalette.colorSecondary || '#64748b';
                  return (
                    <Link
                      href={`/cart?storefront=${encodeURIComponent(storefront)}&colorPrimary=${encodeURIComponent(siteInfo.colorPrimary || '')}&colorSecondary=${encodeURIComponent(siteInfo.colorSecondary || '')}&colorTertiary=${encodeURIComponent(siteInfo.colorTertiary || '')}`}
                      onClick={() => {
                        // Ensure storefront is saved to cache before navigating to cart
                        if (storefront && typeof window !== 'undefined') {
                          saveStorefrontToCache(storefront);
                        }
                      }}
                      className="relative ml-2 flex items-center justify-center rounded-full border bg-white/80 p-2.5 shadow-sm transition-colors hover:bg-secondary"
                      style={{ 
                        borderColor: `${secondaryColor}4D`,
                        color: secondaryColor,
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.color = secondaryColor;
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
                        style={{ backgroundColor: siteInfo.colorPrimary || '#ec4899' }}
                        suppressHydrationWarning
                      >
                        {getCartItemCount() > 9 ? '9+' : getCartItemCount()}
                      </span>
                    </Link>
                  );
                })()}
                <div className="ml-2">
                  <SettingsMenu 
                    secondaryColor={siteInfo.colorSecondary || '#64748b'} 
                    primaryColor={siteInfo.colorPrimary || '#ec4899'}
                    email={siteInfo.email || null}
                    instagramUrl={siteInfo.instagramUrl || ''}
                    instagramBgColor={siteInfo.instagramBgColor || 'primary'}
                    showInstagram={siteInfo.showInstagram === true}
                    emailAddress={siteInfo.emailAddress || ''}
                    emailColor={siteInfo.emailColor || 'primary'}
                    showEmail={siteInfo.showEmail === true}
                  />
                </div>
              </div>
            </div>
          </header>

      {/* Hero Section with Banner */}
      <Banner 
        imageSrc={getStorefrontBanner(storefront)}
        className="mb-8 sm:mb-12"
        cropTop={siteInfo.heroBannerCropTop || 0}
        cropBottom={siteInfo.heroBannerCropBottom || 0}
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
          <div className="mx-auto flex flex-col items-center gap-6 text-center w-full max-w-full">
            {siteInfo.heroMainHeading && !siteInfo.heroMainHeading.includes('Something went wrong') && (() => {
              const wrappedText = preventOrphanedWords(siteInfo.heroMainHeading);
              const baseSize = siteInfo.heroMainHeadingFontSize || 4;
              return (
                <h2 
                  className="w-full max-w-full break-words"
                  style={{ 
                    color: getColorFromSelection(siteInfo.heroMainHeadingColor || 'primary'),
                    fontFamily: getFontFromSelection(siteInfo.heroMainHeadingFont || 'primary'),
                    fontSize: `${baseSize * 0.8}vw`,
                    lineHeight: '1.2',
                    wordWrap: 'break-word',
                    overflowWrap: 'break-word',
                  }}
                  dangerouslySetInnerHTML={{ __html: wrappedText }}
                />
              );
            })()}
            {siteInfo.heroDescription && (() => {
              const wrappedText = preventOrphanedWords(siteInfo.heroDescription);
              const baseSize = siteInfo.heroDescriptionFontSize || 1;
              return (
                <p 
                  className="w-full max-w-full break-words"
                  style={{
                    color: getColorFromSelection(siteInfo.heroDescriptionColor || 'secondary'),
                    fontFamily: getFontFromSelection(siteInfo.heroDescriptionFont || 'primary'),
                    fontSize: `${baseSize * 0.5}vw`,
                    lineHeight: '1.5',
                    wordWrap: 'break-word',
                    overflowWrap: 'break-word',
                  }}
                  dangerouslySetInnerHTML={{ __html: wrappedText }} 
                />
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
            color={siteInfo.categoryCarouselColor || 'primary'}
            colorPalette={{
              colorPrimary: siteInfo.colorPrimary,
              colorSecondary: siteInfo.colorSecondary,
              colorTertiary: siteInfo.colorTertiary,
            }}
            font={siteInfo.categoryCarouselFont || 'primary'}
            fontPalette={{
              fontPrimary: siteInfo.fontPrimary,
              fontSecondary: siteInfo.fontSecondary,
              fontTertiary: siteInfo.fontTertiary,
            }}
            fontSize={siteInfo.categoryCarouselFontSize != null ? parseFloat(siteInfo.categoryCarouselFontSize) || 0.875 : 0.875}
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
              const wrappedText = preventOrphanedWords(siteInfo.allCategoriesTagline);
              return (
                <p 
                  className="mt-2 max-sm:!text-[1rem]"
                  style={{
                    color: getColorFromSelection(siteInfo.allCategoriesTaglineColor || 'secondary'),
                    fontFamily: getFontFromSelection(siteInfo.allCategoriesTaglineFont || 'primary'),
                    fontSize: `clamp(0.75rem, ${siteInfo.allCategoriesTaglineFontSize || 1}rem, 2rem)`,
                  }}
                  dangerouslySetInnerHTML={{ __html: wrappedText }} 
                />
              );
            }
            return null;
          })()}
        </div>
        {loading || isFiltering || productsLoading ? (
          // Show ghost cards while loading or filtering
          (() => {
            const cardGap = siteInfo.productCardGap != null ? parseFloat(siteInfo.productCardGap) : 1;
            const columnsPhone = siteInfo.productCardColumnsPhone != null ? parseInt(siteInfo.productCardColumnsPhone) : 2;
            const columnsTablet = siteInfo.productCardColumnsTablet != null ? parseInt(siteInfo.productCardColumnsTablet) : 3;
            const columnsLaptop = siteInfo.productCardColumnsLaptop != null ? parseInt(siteInfo.productCardColumnsLaptop) : 4;
            const columnsDesktop = siteInfo.productCardColumnsDesktop != null ? parseInt(siteInfo.productCardColumnsDesktop) : 5;
            
            // Calculate card width: (100% - gap * (columns - 1)) / columns
            const calcWidth = (cols, gap) => {
              if (cols === 0) return '100%';
              const gapTotal = gap * (cols - 1);
              return `calc((100% - ${gapTotal}rem) / ${cols})`;
            };
            
            return (
              <>
                <style dangerouslySetInnerHTML={{__html: `
                  .skeleton-card-responsive {
                    width: ${calcWidth(columnsPhone, cardGap)};
                  }
                  @media (min-width: 640px) {
                    .skeleton-card-responsive {
                      width: ${calcWidth(columnsTablet, cardGap)};
                    }
                  }
                  @media (min-width: 1024px) {
                    .skeleton-card-responsive {
                      width: ${calcWidth(columnsLaptop, cardGap)};
                    }
                  }
                  @media (min-width: 1536px) {
                    .skeleton-card-responsive {
                      width: ${calcWidth(columnsDesktop, cardGap)};
                    }
                  }
                `}} />
                <div 
                  className="flex flex-wrap"
                  style={{ 
                    gap: `${cardGap}rem`,
                  }}
                >
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                    <div key={i} className="skeleton-card-responsive">
                      <SkeletonProductCardWrapper
                        cardType={siteInfo.productCardType || 'minimal'}
                        cardAspectRatio={siteInfo.productCardAspectRatio || '3:4'}
                        cardBorderRadius={siteInfo.productCardBorderRadius || 'medium'}
                        colorPrimary={siteInfo.colorPrimary || '#ec4899'}
                        colorSecondary={siteInfo.colorSecondary || '#64748b'}
                      />
                    </div>
                  ))}
                </div>
              </>
            );
          })()
        ) : displayedProducts.length > 0 ? (() => {
          // Show filtered products (sorted by viewCount, limited to current page)
          const cardGap = siteInfo.productCardGap != null ? parseFloat(siteInfo.productCardGap) : 1;
          const columnsPhone = siteInfo.productCardColumnsPhone != null ? parseInt(siteInfo.productCardColumnsPhone) : 2;
          const columnsTablet = siteInfo.productCardColumnsTablet != null ? parseInt(siteInfo.productCardColumnsTablet) : 3;
          const columnsLaptop = siteInfo.productCardColumnsLaptop != null ? parseInt(siteInfo.productCardColumnsLaptop) : 4;
          const columnsDesktop = siteInfo.productCardColumnsDesktop != null ? parseInt(siteInfo.productCardColumnsDesktop) : 5;
          
          // Calculate card width: (100% - gap * (columns - 1)) / columns
          const calcWidth = (cols, gap) => {
            if (cols === 0) return '100%';
            const gapTotal = gap * (cols - 1);
            return `calc((100% - ${gapTotal}rem) / ${cols})`;
          };
          
          return (
            <>
              <style dangerouslySetInnerHTML={{__html: `
                .product-card-responsive {
                  width: ${calcWidth(columnsPhone, cardGap)};
                }
                @media (min-width: 640px) {
                  .product-card-responsive {
                    width: ${calcWidth(columnsTablet, cardGap)};
                  }
                }
                @media (min-width: 1024px) {
                  .product-card-responsive {
                    width: ${calcWidth(columnsLaptop, cardGap)};
                  }
                }
                @media (min-width: 1536px) {
                  .product-card-responsive {
                    width: ${calcWidth(columnsDesktop, cardGap)};
                  }
                }
              `}} />
              <div 
                className="flex flex-wrap"
                style={{ 
                  gap: `${cardGap}rem`,
                }}
              >
                {displayedProducts.map((product) => {
                  // Get category slug from category ID
                  const categoryId = product.categoryIds?.[0] || product.categoryId;
                  const categorySlug = categoryId ? (categorySlugMap.get(categoryId) || categoryId) : 'all';
                  return (
                    <div 
                      key={product.id}
                      className="product-card-responsive"
                    >
                      <ProductCardWrapper
                        product={product}
                        categorySlug={categorySlug}
                        colorPalette={{
                          colorPrimary: siteInfo.colorPrimary,
                          colorSecondary: siteInfo.colorSecondary,
                          colorTertiary: siteInfo.colorTertiary,
                        }}
                        fontPalette={{
                          fontPrimary: siteInfo.fontPrimary,
                          fontSecondary: siteInfo.fontSecondary,
                          fontTertiary: siteInfo.fontTertiary,
                        }}
                        cardType={siteInfo.productCardType || 'minimal'}
                        cardAspectRatio={siteInfo.productCardAspectRatio || '3:4'}
                        cardBorderRadius={siteInfo.productCardBorderRadius || 'medium'}
                        nameColor={siteInfo.productCardNameColor || 'primary'}
                        nameFont={siteInfo.productCardNameFont || 'primary'}
                        nameFontSize={siteInfo.productCardNameFontSize != null ? parseFloat(siteInfo.productCardNameFontSize) || 0.65 : 0.65}
                        priceColor={siteInfo.productCardPriceColor || 'primary'}
                        priceFont={siteInfo.productCardPriceFont || 'primary'}
                        priceFontSize={siteInfo.productCardPriceFontSize != null ? parseFloat(siteInfo.productCardPriceFontSize) || 1 : 1}
                        vatText={siteInfo.productCardVatText || 'Includes VAT'}
                        vatColor={siteInfo.productCardVatColor || 'secondary'}
                        vatFont={siteInfo.productCardVatFont || 'primary'}
                        vatFontSize={siteInfo.productCardVatFontSize != null ? parseFloat(siteInfo.productCardVatFontSize) || 0.75 : 0.75}
                      />
                    </div>
                  );
                })}
              </div>
            </>
          );
        })() : (
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
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          {(() => {
            const wrappedText = preventOrphanedWords(siteInfo.footerText);
            return (
              <div 
                className="text-center mb-6 max-sm:!text-[0.7rem]"
                style={{
                  color: getColorFromSelection(siteInfo.footerTextColor || 'tertiary'),
                  fontFamily: getFontFromSelection(siteInfo.footerTextFont || 'primary'),
                  fontSize: `clamp(0.4rem, ${siteInfo.footerTextFontSize || 0.875}rem, 1.5rem)`,
                }}
                dangerouslySetInnerHTML={{ __html: wrappedText }} 
              />
            );
          })()}
          {/* Social Links - Horizontal Layout */}
          {(siteInfo.showInstagram || siteInfo.showEmail) && (
            <div className="flex flex-row items-center justify-center gap-6 flex-wrap">
              {siteInfo.showInstagram && siteInfo.instagramUrl && (
                <a
                  href={siteInfo.instagramUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 transition-opacity hover:opacity-80"
                  style={{ color: getColorFromSelection(siteInfo.footerTextColor || 'tertiary') }}
                >
                  <InstagramLogo 
                    size="w-6 h-6" 
                    bgColor={getColorFromSelection(siteInfo.instagramBgColor || 'primary')}
                  />
                </a>
              )}
              {siteInfo.showEmail && siteInfo.emailAddress && (
                <a
                  href={`mailto:${siteInfo.emailAddress}`}
                  className="flex items-center gap-2 transition-opacity hover:opacity-80 text-sm"
                  style={{ color: getColorFromSelection(siteInfo.emailColor || 'primary') }}
                >
                  <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  <span>{siteInfo.emailAddress}</span>
                </a>
              )}
            </div>
          )}
        </div>
      </footer>
    </div>
  );
}

