'use client';

import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, orderBy, query, where, limit, startAfter, getDocs, doc, getDoc } from 'firebase/firestore';
import { getFirebaseDb } from './firebase';
import { getCollectionPath, getDocumentPath } from './store-collections';
import { useStorefront } from './storefront-context';
import { getMarket } from './get-market';
import { devLog } from './dev-log';

/**
 * Transform a Firestore category document into the shape that the
 * e‑commerce UI expects.
 *
 * Notes:
 * - `storefronts` is kept for backwards compatibility, but with the
 *   single‑storefront setup it will usually just include `LUNERA` or be empty.
 */
const transformCategory = (doc) => {
  const data = doc.data();
  const storefronts = Array.isArray(data.storefronts) ? data.storefronts : [];
  return {
    id: doc.id,
    value: doc.id, // Use document ID as value for routing
    label: data.name || '',
    description: data.description || '',
    imageUrl: data.imageUrl || null,
    slug: data.slug || doc.id,
    active: data.active !== false,
    previewProductIds: data.previewProductIds || [],
    storefronts,
  };
};

/**
 * Transform a Firestore product document into the shape used by the UI.
 *
 * Responsibilities:
 * - Normalize `categoryIds` to an array.
 * - Expose both `categoryId` and `category` for convenience in components.
 * - Pick the first image as the main thumbnail.
 * - Keep raw `metrics` and `createdAt` for client‑side sorting.
 */
const transformProduct = (doc) => {
  const data = doc.data();
  const categoryIds = Array.isArray(data.categoryIds)
    ? data.categoryIds
    : data.categoryId
    ? [data.categoryId]
    : [];
  const storefronts = Array.isArray(data.storefronts) ? data.storefronts : [];
  
  // Handle markets: can be array (legacy) or object (new format with Shopify Markets)
  let markets = [];
  let marketsObject = null;
  if (data.markets) {
    if (Array.isArray(data.markets)) {
      // Legacy array format
      markets = data.markets;
    } else if (typeof data.markets === 'object') {
      // New object format: { FI: { available: true, price: "29.99", currency: "EUR" }, ... }
      marketsObject = data.markets;
      markets = Object.keys(data.markets); // Extract market codes for filtering
    }
  }
  
  return {
    id: doc.id,
    name: data.name || '',
    slug: data.slug || doc.id,
    price: data.defaultVariantPrice != null ? data.defaultVariantPrice : (data.basePrice || 0), // Use default variant price for product card
    image: data.images && data.images.length > 0 ? data.images[0] : null,
    categoryIds,
    category: categoryIds[0] || '',
    categoryId: categoryIds[0] || '',
    description: data.description || '',
    descriptionHtml: data.descriptionHtml || null,
    extraImages: Array.isArray(data.extraImages) ? data.extraImages.filter(Boolean) : [],
    specs: data.specs || null,
    active: data.active !== false,
    metrics: data.metrics || { totalViews: 0, totalPurchases: 0 },
    viewCount: data.viewCount || null, // Direct viewCount field (newer, preferred over metrics.totalViews)
    createdAt: data.createdAt || null,
    storefronts,
    markets, // Array of market codes for filtering
    marketsObject, // Object with market-specific data (if available)
    publishedToOnlineStore: data.publishedToOnlineStore !== undefined ? data.publishedToOnlineStore : true, // Default to true for backward compatibility
    // Product-level stock status (from import or calculated)
    hasInStockVariants: data.hasInStockVariants !== undefined ? data.hasInStockVariants : true, // Default to true for backward compatibility (assume in stock if not set)
    inStockVariantCount: data.inStockVariantCount || 0,
    totalVariantCount: data.totalVariantCount || 0,
    totalStock: data.totalStock !== undefined ? data.totalStock : 0, // Total stock across all variants
  };
};

/**
 * Live client‑side subscription to all active categories for the current website.
 *
 * Uses:
 * - Firestore client SDK with `onSnapshot` for real‑time updates.
 * - `getCollectionPath('categories', selectedWebsite)` so it works with the
 *   storefront folder structure (currently effectively just `LUNERA`).
 *
 * Returns:
 * - `categories`: transformed, active‑only, alphabetically sorted.
 * - `loading`: true until the first snapshot arrives or Firestore is unavailable.
 * - `error`: any Firestore error encountered while listening.
 */
export const useCategories = (initialCategories = [], storefrontProp = null, shouldStartListeners = true) => {
  const db = getFirebaseDb();
  const storefrontFromContext = useStorefront();
  const storefront = storefrontProp || storefrontFromContext; // Use prop if provided, otherwise context
  const [categories, setCategories] = useState(initialCategories);
  const [loading, setLoading] = useState(initialCategories.length === 0);
  const [error, setError] = useState(null);
  const [hasHydrated, setHasHydrated] = useState(false);

  // Delay Firestore listener until after hydration to avoid double-fetching
  useEffect(() => {
    setHasHydrated(true);
  }, []);

  useEffect(() => {
    if (!db || !hasHydrated || !shouldStartListeners) {
      // If we have initial data, we're not loading
      if (initialCategories.length > 0) {
        setLoading(false);
      }
      return undefined;
    }
    const listenerStartTime = Date.now();

    // Fetch all categories from the storefront folder (e.g. LUNERA/categories/items)
    const categoriesQuery = query(
      collection(db, ...getCollectionPath('categories', storefront)),
      orderBy('name', 'asc')
    );

    const unsubscribe = onSnapshot(
      categoriesQuery,
      (snapshot) => {
        const listenerDuration = Date.now() - listenerStartTime;
        const docCount = snapshot.docs.length;
        
        // Performance warning for slow queries (only log if slow)
        if (listenerDuration > 2000) {
          console.warn(`[PERF] ⚠️  useCategories query took ${listenerDuration}ms - SLOW (${docCount} docs)`);
        }
        
        const transformed = snapshot.docs
          .map(transformCategory)
          .filter((cat) => cat.active)
          .sort((a, b) => (a.label || '').localeCompare(b.label || ''));
        setCategories(transformed);
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.error(`[HOOK] ❌ useCategories: Firestore error:`, err);
        setError(err);
        setCategories([]);
        setLoading(false);
      }
    );

    return () => {
      unsubscribe();
    };
    }, [db, storefront, hasHydrated, shouldStartListeners, initialCategories.length]);

  return { categories, loading, error };
};

/**
 * Live subscription to all active products for a given category in the
 * current storefront.
 *
 * Implementation details:
 * - We query all products under the storefront’s `products/items` collection,
 *   then filter by `categoryId` client‑side. This avoids Firestore limitations
 *   around multiple `array-contains` filters and composite indexes.
 * - Sorting is also done client‑side by `createdAt` (newest first), falling
 *   back to `name` when timestamps are missing.
 */
export const useProductsByCategory = (categoryId, initialProducts = [], storefrontProp = null, shouldStartListeners = true) => {
  const db = getFirebaseDb();
  const storefrontFromContext = useStorefront();
  const storefront = storefrontProp || storefrontFromContext; // Use prop if provided, otherwise context
  // Use initial products if provided (from SSR), filter by category
  const initialFiltered = useMemo(() => {
    if (initialProducts.length === 0 || !categoryId) return [];
    const filtered = initialProducts.filter(p => p.categoryIds?.includes(categoryId));
    // Only log when categoryId is provided (avoid noise when hook is called with null)
    if (categoryId) {
      devLog(`[HOOK] 🎣 useProductsByCategory initialized - Category: ${categoryId}, Initial products: ${initialProducts.length}, Filtered: ${filtered.length}`);
    }
    return filtered;
  }, [initialProducts, categoryId]);
  
  const [products, setProducts] = useState(initialFiltered);
  const [loading, setLoading] = useState(initialFiltered.length === 0);
  const [error, setError] = useState(null);
  const [hasHydrated, setHasHydrated] = useState(false);

  // Get market reactively - re-read from cookie on each render to catch changes
  // We use a state that updates periodically to detect cookie changes
  const [market, setMarket] = useState(() => getMarket());
  
  // Update market when cookie might have changed (e.g., user changed market selector)
  useEffect(() => {
    const updateMarket = () => {
      const currentMarket = getMarket();
      setMarket(currentMarket);
    };
    
    // Update immediately
    updateMarket();
    
    // Also check periodically (every 1 second) in case cookie changed externally
    const interval = setInterval(updateMarket, 1000);
    
    return () => clearInterval(interval);
  }, []);

  // Only log if categoryId is provided (avoid spam when null)
  if (categoryId) {
    // Note: We don't have category name here, but we'll log it in the filtering step
    devLog(`[HOOK] 🎣 useProductsByCategory - Category ID: ${categoryId}, Initial filtered: ${initialFiltered.length}, Loading: ${loading}, Market: ${market}, Storefront: ${storefront}`);
  }

  // Delay Firestore listener until after hydration to avoid double-fetching
  useEffect(() => {
    if (categoryId) {
      devLog(`[HOOK] 💧 useProductsByCategory: Hydration started (Category: ${categoryId})`);
    }
    setHasHydrated(true);
    if (categoryId) {
      devLog(`[HOOK] ✅ useProductsByCategory: Hydration complete (Category: ${categoryId})`);
    }
  }, [categoryId]);

  useEffect(() => {
    // Don't set up listener if categoryId is null/empty
    if (!categoryId) {
      setLoading(false);
      return undefined;
    }
    
    if (!db || !hasHydrated || !shouldStartListeners) {
      // If we have initial data, we're not loading
      if (initialFiltered.length > 0) {
        devLog(`[HOOK] 📦 useProductsByCategory: Using ${initialFiltered.length} initial filtered products (no DB/hydration yet)`);
        setLoading(false);
      } else {
        devLog(`[HOOK] ⏳ useProductsByCategory: Waiting for DB/hydration...`);
      }
      return undefined;
    }

    if (!categoryId) {
      devLog(`[HOOK] ⚠️  useProductsByCategory: No categoryId provided`);
      setProducts([]);
      setLoading(false);
      return undefined;
    }

    // Query products from the storefront folder and then:
    // - Filter by `categoryId` & `active` on the client.
    // - Sort on the client to avoid composite index requirements.
    const productsQuery = query(
      collection(db, ...getCollectionPath('products', storefront)),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(
      productsQuery,
      (snapshot) => {
        const allTransformed = snapshot.docs.map(transformProduct);
        
        const transformed = allTransformed
          .filter((prod) => {
            // 1. Must be active
            if (prod.active === false) return false;
            
            // 2. Must belong to selected category
            const hasCategory = prod.categoryIds?.includes(categoryId) || prod.categoryId === categoryId;
            if (!hasCategory) return false;
            
            // 3. Must be in correct storefront (if storefronts array exists and is not empty)
            if (prod.storefronts && Array.isArray(prod.storefronts) && prod.storefronts.length > 0) {
              if (!prod.storefronts.includes(storefront)) return false;
            }
            
            // 4. Market filtering - only filter if market data exists
            if (prod.marketsObject && typeof prod.marketsObject === 'object') {
              const marketData = prod.marketsObject[market];
              if (!marketData || marketData.available === false) return false;
            } else if (prod.markets && Array.isArray(prod.markets) && prod.markets.length > 0) {
              if (!prod.markets.includes(market)) return false;
            }
            // If no market data exists, allow the product (backward compatibility)
            
            // 5. Must have in-stock variants (only filter if explicitly false)
            if (prod.hasInStockVariants === false) return false;
            
            // 6. Stock check - only filter if totalStock is explicitly set and < 5
            // If totalStock is undefined/null, allow the product (might be manually created without stock data yet)
            if (prod.totalStock !== undefined && prod.totalStock !== null) {
              if (prod.totalStock < 5) return false;
            }
            
            return true;
          })
          .sort((a, b) => {
            const aCreated = a.createdAt?.toMillis?.() || 0;
            const bCreated = b.createdAt?.toMillis?.() || 0;
            if (aCreated && bCreated) {
              return bCreated - aCreated; // Newest first
            }
            return (a.name || '').localeCompare(b.name || '');
          });
        
        // Log summary when results change
        console.log(`[HOOK] ✅ Category ${categoryId}: ${transformed.length} products (from ${allTransformed.length} total)`);
        
        setProducts(transformed);
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.error(`[HOOK] ❌ useProductsByCategory: Firestore error:`, err);
        setError(err);
        setProducts([]);
        setLoading(false);
      }
    );

    return () => {
      unsubscribe();
    };
  }, [db, categoryId, storefront, market, hasHydrated, shouldStartListeners, initialFiltered.length]);

  return { products, loading, error };
};

/**
 * Live subscription to all active products in the current storefront.
 *
 * Use this for admin/product overviews where you want the full list.
 * Client‑side filtering/sorting is used for flexibility and to keep
 * Firestore index requirements minimal.
 */
const PRODUCTS_PER_PAGE = 20;

export const useAllProducts = (initialProducts = [], storefrontProp = null, shouldStartListeners = true) => {
  const db = getFirebaseDb();
  const storefrontFromContext = useStorefront();
  const storefront = storefrontProp || storefrontFromContext; // Use prop if provided, otherwise context
  const [products, setProducts] = useState(initialProducts);
  const [loading, setLoading] = useState(initialProducts.length === 0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [lastDoc, setLastDoc] = useState(null);
  const [error, setError] = useState(null);
  const [hasHydrated, setHasHydrated] = useState(false);

  // Get market reactively - read once and cache in state (optimized)
  const [market, setMarket] = useState(() => getMarket());
  
  // Update market when cookie might have changed (e.g., user changed market selector)
  // Only check periodically, not on every render
  useEffect(() => {
    const updateMarket = () => {
      const currentMarket = getMarket();
      if (currentMarket !== market) {
        setMarket(currentMarket);
      }
    };
    
    // Update immediately on mount
    updateMarket();
    
    // Check periodically (every 2 seconds) in case cookie changed externally
    const interval = setInterval(updateMarket, 2000);
    
    return () => clearInterval(interval);
  }, [market]);

  // Delay Firestore listener until after hydration to avoid double-fetching
  useEffect(() => {
    setHasHydrated(true);
  }, []);

  useEffect(() => {
    if (!db || !hasHydrated || !shouldStartListeners) {
      // If we have initial data, we're not loading
      if (initialProducts.length > 0) {
        setLoading(false);
      }
      return undefined;
    }
    const listenerStartTime = Date.now();

    // Fetch products with server-side filtering where possible
    // Use where clauses to filter server-side instead of fetching all and filtering client-side
    let productsQuery;
    try {
      productsQuery = query(
        collection(db, ...getCollectionPath('products', storefront)),
        where('active', '==', true),
        where('publishedToOnlineStore', '==', true),
        where('storefronts', 'array-contains', storefront),
        limit(PRODUCTS_PER_PAGE) // Pagination: load 30 products at a time
      );
    } catch (error) {
      // If query fails (missing index), fall back to loading all and filtering client-side
      console.warn(`[HOOK] ⚠️  Server-side filter query failed (may need index), falling back to client-side filtering: ${error.message}`);
      productsQuery = query(
        collection(db, ...getCollectionPath('products', storefront)),
        orderBy('createdAt', 'desc'),
        limit(PRODUCTS_PER_PAGE)
      );
    }

    const unsubscribe = onSnapshot(
      productsQuery,
      (snapshot) => {
        // Use cached market value (optimized - don't read cookie on every snapshot)
        const currentMarket = market;
        
        const listenerDuration = Date.now() - listenerStartTime;
        const totalProducts = snapshot.docs.length;
        
        // Performance warning for slow queries (only log if slow)
        if (listenerDuration > 2000) {
          console.warn(`[PERF] ⚠️  useAllProducts query took ${listenerDuration}ms - SLOW (${totalProducts} docs)`);
        }
        
        // Check if we have more products (pagination)
        const hasMoreData = snapshot.docs.length === PRODUCTS_PER_PAGE;
        setHasMore(hasMoreData);
        if (snapshot.docs.length > 0) {
          setLastDoc(snapshot.docs[snapshot.docs.length - 1]);
        }
        
        const transformed = snapshot.docs
          .map(transformProduct)
          .filter((prod) => {
            // Server-side filters already applied (active, publishedToOnlineStore, storefronts)
            // Only need to filter by market (marketsObject can't be queried server-side)
            
            // Filter by market - support both array and object formats
            // ALWAYS filter by market - products without market data are hidden
            if (prod.marketsObject && typeof prod.marketsObject === 'object') {
              // New format: markets object { FI: { available: true, ... }, ... }
              const marketData = prod.marketsObject[currentMarket];
              if (!marketData || marketData.available === false) {
                return false;
              }
              // Product is available in this market
            } else if (prod.markets && Array.isArray(prod.markets) && prod.markets.length > 0) {
              // Legacy format: markets array
              const isInMarket = prod.markets.includes(currentMarket);
              if (!isInMarket) return false;
            } else {
              // Products without markets data are hidden (strict market filtering)
              return false;
            }
            
            // Filter out products with no in-stock variants (webhook-updated stock status)
            // Note: hasInStockVariants defaults to true for backward compatibility (products without this field are shown)
            if (prod.hasInStockVariants === false) {
              return false;
            }
            
            // Filter out products with less than 5 in stock
            const totalStock = prod.totalStock || 0;
            if (totalStock < 5) {
              return false;
            }
            
            return true; // Passed all filters
          })
          .sort((a, b) => {
            // Sort by viewCount (highest first), fallback to metrics.totalViews, then createdAt
            const aViews = a.viewCount ?? a.metrics?.totalViews ?? 0;
            const bViews = b.viewCount ?? b.metrics?.totalViews ?? 0;
            if (aViews !== bViews) {
              return bViews - aViews; // Highest viewCount first
            }
            // If viewCounts are equal, sort by createdAt (newest first)
            const aCreated = a.createdAt?.toMillis?.() || 0;
            const bCreated = b.createdAt?.toMillis?.() || 0;
            if (aCreated && bCreated) {
              return bCreated - aCreated;
            }
            return (a.name || '').localeCompare(b.name || '');
          });
        
        // Update products - append if loading more, replace if initial load
        if (loadingMore) {
          setProducts((prev) => [...prev, ...transformed]);
        } else {
          setProducts(transformed);
        }
        setLoading(false);
        setLoadingMore(false);
        setError(null);
      },
      (err) => {
        console.error(`[HOOK] ❌ useAllProducts: Firestore error:`, err);
        setError(err);
        setProducts([]);
        setLoading(false);
        setLoadingMore(false);
      }
    );

    return () => {
      unsubscribe();
    };
  }, [db, storefront, market, hasHydrated, shouldStartListeners, initialProducts.length]); // Removed loadingMore from deps to avoid unnecessary re-runs

  // Load more products function
  const loadMore = async () => {
    if (!loadingMore && hasMore && !loading && lastDoc && db) {
      setLoadingMore(true);
      try {
        // Rebuild the query with startAfter for pagination
        let loadMoreQuery;
        try {
          loadMoreQuery = query(
            collection(db, ...getCollectionPath('products', storefront)),
            where('active', '==', true),
            where('publishedToOnlineStore', '==', true),
            where('storefronts', 'array-contains', storefront),
            startAfter(lastDoc),
            limit(PRODUCTS_PER_PAGE)
          );
        } catch (error) {
          // Fallback if query fails
          loadMoreQuery = query(
            collection(db, ...getCollectionPath('products', storefront)),
            orderBy('createdAt', 'desc'),
            startAfter(lastDoc),
            limit(PRODUCTS_PER_PAGE)
          );
        }
        
        const snapshot = await getDocs(loadMoreQuery);
        const currentMarket = market;
        const transformed = snapshot.docs
          .map(transformProduct)
          .filter((prod) => {
            // Filter by market - must match validateMarketAvailability logic
            if (prod.marketsObject && typeof prod.marketsObject === 'object') {
              const marketData = prod.marketsObject[currentMarket];
              if (!marketData || marketData.available === false) {
                return false; // Not available in this market
              }
            } else if (prod.markets && Array.isArray(prod.markets) && prod.markets.length > 0) {
              if (!prod.markets.includes(currentMarket)) {
                return false; // Not in markets array
              }
            } else {
              // Products without markets data are hidden (strict market filtering)
              return false;
            }
            // Additional filters
            if (prod.hasInStockVariants === false) return false;
            const totalStock = prod.totalStock || 0;
            if (totalStock < 5) return false;
            return true;
          })
          .sort((a, b) => {
            const aViews = a.viewCount ?? a.metrics?.totalViews ?? 0;
            const bViews = b.viewCount ?? b.metrics?.totalViews ?? 0;
            if (aViews !== bViews) return bViews - aViews;
            const aCreated = a.createdAt?.toMillis?.() || 0;
            const bCreated = b.createdAt?.toMillis?.() || 0;
            if (aCreated && bCreated) return bCreated - aCreated;
            return (a.name || '').localeCompare(b.name || '');
          });
        
        setProducts((prev) => [...prev, ...transformed]);
        setHasMore(snapshot.docs.length === PRODUCTS_PER_PAGE);
        if (snapshot.docs.length > 0) {
          setLastDoc(snapshot.docs[snapshot.docs.length - 1]);
        }
      } catch (error) {
        console.error('Failed to load more products:', error);
      } finally {
        setLoadingMore(false);
      }
    }
  };

  return { products, loading, error, hasMore, loadMore };
};

/**
 * Convenience hook for homepage/category preview strips.
 *
 * - Wraps `useProductsByCategory` and then sorts by `metrics.totalViews`
 *   to approximate “bestsellers”, returning only the top `limit` products.
 */
export const useTopProductsByCategory = (categoryId, limit = 4) => {
  const { products, loading, error } = useProductsByCategory(categoryId);
  const topProducts = useMemo(() => {
    // Sort by metrics.totalViews or createdAt, then take top N
    return products
      .sort((a, b) => {
        const aViews = a.metrics?.totalViews || 0;
        const bViews = b.metrics?.totalViews || 0;
        return bViews - aViews;
      })
      .slice(0, limit);
  }, [products, limit]);

  return { products: topProducts, loading, error };
};

