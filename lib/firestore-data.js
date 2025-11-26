'use client';

import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { getFirebaseDb } from './firebase';
import { getCollectionPath } from './store-collections';
import { useWebsite } from './website-context';
import { getMarket } from './get-market';
import { getStorefront } from './get-storefront';

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
    price: data.basePrice || 0,
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
    createdAt: data.createdAt || null,
    storefronts,
    markets, // Array of market codes for filtering
    marketsObject, // Object with market-specific data (if available)
    publishedToOnlineStore: data.publishedToOnlineStore !== undefined ? data.publishedToOnlineStore : true, // Default to true for backward compatibility
    // Product-level stock status (from import or calculated)
    hasInStockVariants: data.hasInStockVariants !== undefined ? data.hasInStockVariants : true, // Default to true for backward compatibility (assume in stock if not set)
    inStockVariantCount: data.inStockVariantCount || 0,
    totalVariantCount: data.totalVariantCount || 0,
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
export const useCategories = (initialCategories = []) => {
  const db = getFirebaseDb();
  const { selectedWebsite } = useWebsite();
  const [categories, setCategories] = useState(initialCategories);
  const [loading, setLoading] = useState(initialCategories.length === 0);
  const [error, setError] = useState(null);
  const [hasHydrated, setHasHydrated] = useState(false);

  console.log(`[HOOK] 🎣 useCategories initialized - Initial categories: ${initialCategories.length}, Loading: ${loading}`);

  // Delay Firestore listener until after hydration to avoid double-fetching
  useEffect(() => {
    console.log(`[HOOK] 💧 useCategories: Hydration started`);
    setHasHydrated(true);
    console.log(`[HOOK] ✅ useCategories: Hydration complete`);
  }, []);

  useEffect(() => {
    if (!db || !hasHydrated) {
      // If we have initial data, we're not loading
      if (initialCategories.length > 0) {
        console.log(`[HOOK] 📦 useCategories: Using ${initialCategories.length} initial categories (no DB/hydration yet)`);
        setLoading(false);
      } else {
        console.log(`[HOOK] ⏳ useCategories: Waiting for DB/hydration...`);
      }
      return undefined;
    }

    console.log(`[HOOK] 🔥 useCategories: Starting Firestore listener for website: ${selectedWebsite}`);
    const listenerStartTime = Date.now();

    // Fetch all categories from the storefront folder (e.g. LUNERA/categories/items)
    const categoriesQuery = query(
      collection(db, ...getCollectionPath('categories', selectedWebsite)),
      orderBy('name', 'asc')
    );

    const unsubscribe = onSnapshot(
      categoriesQuery,
      (snapshot) => {
        const listenerDuration = Date.now() - listenerStartTime;
        console.log(`[HOOK] 📨 useCategories: Firestore snapshot received - ${snapshot.docs.length} docs (${listenerDuration}ms)`);
        
        const transformed = snapshot.docs
          .map(transformCategory)
          .filter((cat) => cat.active)
          .sort((a, b) => (a.label || '').localeCompare(b.label || ''));
        
        console.log(`[HOOK] ✅ useCategories: Transformed to ${transformed.length} active categories`);
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
      console.log(`[HOOK] 🛑 useCategories: Unsubscribing from Firestore listener`);
      unsubscribe();
    };
  }, [db, selectedWebsite, hasHydrated, initialCategories.length]);

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
export const useProductsByCategory = (categoryId, initialProducts = []) => {
  const db = getFirebaseDb();
  const { selectedWebsite } = useWebsite();
  // Use initial products if provided (from SSR), filter by category
  const initialFiltered = useMemo(() => {
    if (initialProducts.length === 0 || !categoryId) return [];
    const filtered = initialProducts.filter(p => p.categoryIds?.includes(categoryId));
    console.log(`[HOOK] 🎣 useProductsByCategory initialized - Category: ${categoryId}, Initial products: ${initialProducts.length}, Filtered: ${filtered.length}`);
    return filtered;
  }, [initialProducts, categoryId]);
  
  const [products, setProducts] = useState(initialFiltered);
  const [loading, setLoading] = useState(initialFiltered.length === 0);
  const [error, setError] = useState(null);
  const [hasHydrated, setHasHydrated] = useState(false);

  // Memoize market and storefront - only recalculate when they actually change
  const market = useMemo(() => getMarket(), []);
  const storefront = useMemo(() => getStorefront(), []);

  console.log(`[HOOK] 🎣 useProductsByCategory - Category: ${categoryId}, Initial filtered: ${initialFiltered.length}, Loading: ${loading}, Market: ${market}, Storefront: ${storefront}`);

  // Delay Firestore listener until after hydration to avoid double-fetching
  useEffect(() => {
    console.log(`[HOOK] 💧 useProductsByCategory: Hydration started`);
    setHasHydrated(true);
    console.log(`[HOOK] ✅ useProductsByCategory: Hydration complete`);
  }, []);

  useEffect(() => {
    if (!db || !hasHydrated) {
      // If we have initial data, we're not loading
      if (initialFiltered.length > 0) {
        console.log(`[HOOK] 📦 useProductsByCategory: Using ${initialFiltered.length} initial filtered products (no DB/hydration yet)`);
        setLoading(false);
      } else {
        console.log(`[HOOK] ⏳ useProductsByCategory: Waiting for DB/hydration...`);
      }
      return undefined;
    }

    if (!categoryId) {
      console.log(`[HOOK] ⚠️  useProductsByCategory: No categoryId provided`);
      setProducts([]);
      setLoading(false);
      return undefined;
    }

    console.log(`[HOOK] 🔥 useProductsByCategory: Starting Firestore listener for category: ${categoryId}, website: ${selectedWebsite}, market: ${market}, storefront: ${storefront}`);
    const listenerStartTime = Date.now();

    // Query products from the storefront folder and then:
    // - Filter by `categoryId` & `active` on the client.
    // - Sort on the client to avoid composite index requirements.
    const productsQuery = query(
      collection(db, ...getCollectionPath('products', selectedWebsite))
    );

    const unsubscribe = onSnapshot(
      productsQuery,
      (snapshot) => {
        const totalProducts = snapshot.docs.length;
        
        const transformed = snapshot.docs
          .map(transformProduct)
          .filter((prod) => {
            // Filter by categoryId and active status client-side
            if (!prod.active || !prod.categoryIds?.includes(categoryId)) {
              return false;
            }
            
            // Filter by Online Store publication status - only show products published to Online Store
            // This ensures products are accessible via Storefront API
            if (prod.publishedToOnlineStore === false) {
              if (process.env.NODE_ENV === 'development') {
                console.log(`[Product Filter] Product "${prod.name}" filtered out - Not published to Online Store`);
              }
              return false;
            }
            
            // Filter by storefront (dual filtering: storefront + market)
            if (prod.storefronts && Array.isArray(prod.storefronts) && prod.storefronts.length > 0) {
              const isInStorefront = prod.storefronts.includes(storefront);
              if (!isInStorefront && process.env.NODE_ENV === 'development') {
                console.log(`[Product Filter] Product "${prod.name}" filtered out - Storefronts: [${prod.storefronts.join(', ')}], Current Storefront: ${storefront}`);
              }
              if (!isInStorefront) return false;
            } else {
              // Products without storefronts array are hidden (strict storefront filtering)
              if (process.env.NODE_ENV === 'development') {
                console.log(`[Product Filter] Product "${prod.name}" filtered out - No storefronts array assigned`);
              }
              return false;
            }
            
            // Filter by market - support both array and object formats
            if (prod.marketsObject && typeof prod.marketsObject === 'object') {
              // New format: markets object { FI: { available: true, ... }, ... }
              const marketData = prod.marketsObject[market];
              if (!marketData || !marketData.available) {
                if (process.env.NODE_ENV === 'development') {
                  console.log(`[Product Filter] Product "${prod.name}" filtered out - Not available in market ${market} (object format)`);
                }
                return false;
              }
              // Product is available in this market
            } else if (prod.markets && Array.isArray(prod.markets) && prod.markets.length > 0) {
              // Legacy format: markets array
              const isInMarket = prod.markets.includes(market);
              if (!isInMarket && process.env.NODE_ENV === 'development') {
                console.log(`[Product Filter] Product "${prod.name}" filtered out - Markets: [${prod.markets.join(', ')}], User Market: ${market}`);
              }
              if (!isInMarket) return false;
            } else {
              // Products without markets data are hidden (strict market filtering)
              if (process.env.NODE_ENV === 'development') {
                console.log(`[Product Filter] Product "${prod.name}" filtered out - No markets data assigned (strict filtering)`);
              }
              return false;
            }
            
            // Filter out products with no in-stock variants (webhook-updated stock status)
            // Note: hasInStockVariants defaults to true for backward compatibility (products without this field are shown)
            if (prod.hasInStockVariants === false) {
              if (process.env.NODE_ENV === 'development') {
                console.log(`[Product Filter] Product "${prod.name}" filtered out - No in-stock variants (hasInStockVariants: false)`);
              }
              return false;
            }
            
            return true; // Passed all filters
          })
          .sort((a, b) => {
            // Sort by createdAt if available, otherwise by name
            const aCreated = a.createdAt?.toMillis?.() || 0;
            const bCreated = b.createdAt?.toMillis?.() || 0;
            if (aCreated && bCreated) {
              return bCreated - aCreated; // Newest first
            }
            return (a.name || '').localeCompare(b.name || '');
          });
        
        const filterDuration = Date.now() - listenerStartTime;
        console.log(`[HOOK] ✅ useProductsByCategory: Filtered to ${transformed.length} products for category "${categoryId}" (from ${totalProducts} total) - storefront: "${storefront}", market: "${market}" (${filterDuration}ms total)`);
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
      console.log(`[HOOK] 🛑 useProductsByCategory: Unsubscribing from Firestore listener`);
      unsubscribe();
    };
  }, [db, categoryId, selectedWebsite, market, storefront, hasHydrated, initialFiltered.length]);

  return { products, loading, error };
};

/**
 * Live subscription to all active products in the current storefront.
 *
 * Use this for admin/product overviews where you want the full list.
 * Client‑side filtering/sorting is used for flexibility and to keep
 * Firestore index requirements minimal.
 */
export const useAllProducts = (initialProducts = []) => {
  const db = getFirebaseDb();
  const { selectedWebsite } = useWebsite();
  const [products, setProducts] = useState(initialProducts);
  const [loading, setLoading] = useState(initialProducts.length === 0);
  const [error, setError] = useState(null);
  const [hasHydrated, setHasHydrated] = useState(false);

  // Memoize market and storefront - only recalculate when they actually change
  const market = useMemo(() => getMarket(), []);
  const storefront = useMemo(() => getStorefront(), []);

  console.log(`[HOOK] 🎣 useAllProducts initialized - Initial products: ${initialProducts.length}, Loading: ${loading}, Market: ${market}, Storefront: ${storefront}`);

  // Delay Firestore listener until after hydration to avoid double-fetching
  useEffect(() => {
    console.log(`[HOOK] 💧 useAllProducts: Hydration started`);
    setHasHydrated(true);
    console.log(`[HOOK] ✅ useAllProducts: Hydration complete`);
  }, []);

  useEffect(() => {
    if (!db || !hasHydrated) {
      // If we have initial data, we're not loading
      if (initialProducts.length > 0) {
        console.log(`[HOOK] 📦 useAllProducts: Using ${initialProducts.length} initial products (no DB/hydration yet)`);
        setLoading(false);
      } else {
        console.log(`[HOOK] ⏳ useAllProducts: Waiting for DB/hydration...`);
      }
      return undefined;
    }

    console.log(`[HOOK] 🔥 useAllProducts: Starting Firestore listener for website: ${selectedWebsite}, market: ${market}, storefront: ${storefront}`);
    const listenerStartTime = Date.now();

    // Fetch all products from the storefront folder, filter active client‑side,
    // and sort in memory (by `createdAt` then by `name`).
    const productsQuery = query(
      collection(db, ...getCollectionPath('products', selectedWebsite))
    );

    const unsubscribe = onSnapshot(
      productsQuery,
      (snapshot) => {
        const listenerDuration = Date.now() - listenerStartTime;
        const totalProducts = snapshot.docs.length;
        console.log(`[HOOK] 📨 useAllProducts: Firestore snapshot received - ${totalProducts} docs (${listenerDuration}ms)`);
        
        const transformed = snapshot.docs
          .map(transformProduct)
          .filter((prod) => {
            if (!prod.active) return false;
            
            // Filter by Online Store publication status - only show products published to Online Store
            // This ensures products are accessible via Storefront API
            if (prod.publishedToOnlineStore === false) {
              if (process.env.NODE_ENV === 'development') {
                console.log(`[Product Filter] Product "${prod.name}" filtered out - Not published to Online Store`);
              }
              return false;
            }
            
            // Filter by storefront (dual filtering: storefront + market)
            if (prod.storefronts && Array.isArray(prod.storefronts) && prod.storefronts.length > 0) {
              const isInStorefront = prod.storefronts.includes(storefront);
              if (!isInStorefront && process.env.NODE_ENV === 'development') {
                console.log(`[Product Filter] Product "${prod.name}" filtered out - Storefronts: [${prod.storefronts.join(', ')}], Current Storefront: ${storefront}`);
              }
              if (!isInStorefront) return false;
            } else {
              // Products without storefronts array are hidden (strict storefront filtering)
              if (process.env.NODE_ENV === 'development') {
                console.log(`[Product Filter] Product "${prod.name}" filtered out - No storefronts array assigned`);
              }
              return false;
            }
            
            // Filter by market - support both array and object formats
            if (prod.marketsObject && typeof prod.marketsObject === 'object') {
              // New format: markets object { FI: { available: true, ... }, ... }
              const marketData = prod.marketsObject[market];
              if (!marketData || !marketData.available) {
                if (process.env.NODE_ENV === 'development') {
                  console.log(`[Product Filter] Product "${prod.name}" filtered out - Not available in market ${market} (object format)`);
                }
                return false;
              }
              // Product is available in this market
            } else if (prod.markets && Array.isArray(prod.markets) && prod.markets.length > 0) {
              // Legacy format: markets array
              const isInMarket = prod.markets.includes(market);
              if (!isInMarket && process.env.NODE_ENV === 'development') {
                console.log(`[Product Filter] Product "${prod.name}" filtered out - Markets: [${prod.markets.join(', ')}], User Market: ${market}`);
              }
              if (!isInMarket) return false;
            } else {
              // Products without markets data are hidden (strict market filtering)
              if (process.env.NODE_ENV === 'development') {
                console.log(`[Product Filter] Product "${prod.name}" filtered out - No markets data assigned (strict filtering)`);
              }
              return false;
            }
            
            // Filter out products with no in-stock variants (webhook-updated stock status)
            // Note: hasInStockVariants defaults to true for backward compatibility (products without this field are shown)
            if (prod.hasInStockVariants === false) {
              if (process.env.NODE_ENV === 'development') {
                console.log(`[Product Filter] Product "${prod.name}" filtered out - No in-stock variants (hasInStockVariants: false)`);
              }
              return false;
            }
            
            return true; // Passed all filters
          })
          .sort((a, b) => {
            // Sort by createdAt if available, otherwise by name
            const aCreated = a.createdAt?.toMillis?.() || 0;
            const bCreated = b.createdAt?.toMillis?.() || 0;
            if (aCreated && bCreated) {
              return bCreated - aCreated; // Newest first
            }
            return (a.name || '').localeCompare(b.name || '');
          });
        
        const filterDuration = Date.now() - listenerStartTime;
        console.log(`[HOOK] ✅ useAllProducts: Filtered to ${transformed.length} products (from ${totalProducts} total) - storefront: "${storefront}", market: "${market}" (${filterDuration}ms total)`);
        
        setProducts(transformed);
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.error(`[HOOK] ❌ useAllProducts: Firestore error:`, err);
        setError(err);
        setProducts([]);
        setLoading(false);
      }
    );

    return () => {
      console.log(`[HOOK] 🛑 useAllProducts: Unsubscribing from Firestore listener`);
      unsubscribe();
    };
  }, [db, selectedWebsite, market, storefront, hasHydrated, initialProducts.length]);

  return { products, loading, error };
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

