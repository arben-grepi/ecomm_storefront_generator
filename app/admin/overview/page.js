'use client';

import { useEffect, useMemo, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { collection, getDocs } from 'firebase/firestore';
import { getFirebaseDb } from '@/lib/firebase';
import { getCollectionPath, getDocumentPath } from '@/lib/store-collections';
import { useWebsite } from '@/lib/website-context';
import EditSiteInfoButton from '@/components/admin/EditSiteInfoButton';
import ProductModal from '@/components/admin/ProductModal';
import { saveStorefrontToCache } from '@/lib/get-storefront';

const QUICK_ACTIONS = [
  {
    key: 'products',
    path: 'products',
    title: 'Manage products',
    description: 'Review, edit, and publish store products.',
  },
  {
    key: 'categories',
    path: 'categories',
    title: 'Manage categories',
    description: 'Organize storefront collections and featured items.',
  },
];

function EcommerceOverviewContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const db = getFirebaseDb();
  const { selectedWebsite, availableWebsites, loading: websitesLoading } = useWebsite();
  const [loading, setLoading] = useState(true);
  const [selectedShopifyItem, setSelectedShopifyItem] = useState(null);
  const LOW_STOCK_THRESHOLD = 10; // Fixed threshold
  const [datasets, setDatasets] = useState({
    products: [],
    shopifyItems: [],
    orders: [],
  });
  const [viewMode, setViewMode] = useState('selected'); // 'selected' | 'all'
  const [selectedFilterStorefront, setSelectedFilterStorefront] = useState(null); // null = all, or specific storefront
  
  // Get storefront from URL parameter (like cart does)
  const urlStorefront = searchParams?.get('storefront');

  // Load all data - memoized to prevent unnecessary re-renders
  useEffect(() => {
    if (!db) {
      setLoading(false);
      return;
    }

    let isMounted = true;

    const loadData = async () => {
      setLoading(true);
      try {
        // Load products with variants to calculate stock
        const productsSnap = await getDocs(collection(db, ...getCollectionPath('products', selectedWebsite)));
        const productsPromises = productsSnap.docs.map(async (doc) => {
          const productData = { id: doc.id, ...doc.data() };
          
          // Try to load variants to calculate total stock
          try {
            const variantsSnap = await getDocs(
              collection(db, ...getDocumentPath('products', doc.id, selectedWebsite), 'variants')
            );
            const variants = variantsSnap.docs.map((v) => v.data());
            const totalStock = variants.reduce((sum, variant) => sum + (variant.stock || 0), 0);
            productData.totalStock = totalStock;
            productData.hasInStockVariants = variants.some((v) => (v.stock || 0) > 0 || v.inventory_policy === 'continue');
          } catch (error) {
            // If variants can't be loaded, use product-level data if available
            productData.totalStock = productData.totalStock || 0;
            if (productData.hasInStockVariants === undefined) {
              productData.hasInStockVariants = productData.totalStock > 0;
            }
          }
          
          return productData;
        });
        const products = await Promise.all(productsPromises);

        // Load shopify items
        const shopifySnap = await getDocs(collection(db, ...getCollectionPath('shopifyItems'))).catch((error) => {
          console.warn('Failed to load shopifyItems (may need admin auth):', error.message);
          return { docs: [] };
        });
        const shopifyItems = shopifySnap.docs.map((doc) => {
          const data = doc.data();
          const createdAt =
            typeof data.createdAt?.toMillis === 'function'
              ? data.createdAt.toMillis()
              : data.createdAt?.seconds
              ? data.createdAt.seconds * 1000
              : 0;
          return {
            id: doc.id,
            ...data,
            createdAt,
            processedStorefronts: Array.isArray(data.processedStorefronts) ? data.processedStorefronts : [],
            storefronts: Array.isArray(data.storefronts) ? data.storefronts : [],
          };
        });

        // Load orders from all storefronts
        const allStorefronts = availableWebsites.length > 0 ? availableWebsites : ['LUNERA', 'FIVESTARFINDS'];
        const ordersPromises = allStorefronts.map(async (storefront) => {
          try {
            const ordersSnap = await getDocs(collection(db, storefront, 'orders', 'items'));
            return ordersSnap.docs.map((doc) => ({
              id: doc.id,
              storefront,
              ...doc.data(),
            }));
          } catch (error) {
            console.warn(`Failed to load orders for ${storefront}:`, error);
            return [];
          }
        });
        const ordersArrays = await Promise.all(ordersPromises);
        const orders = ordersArrays.flat();

        if (!isMounted) return;

        setDatasets({ products, shopifyItems, orders });
      } catch (error) {
        console.error('Failed to load admin overview data', error);
        if (isMounted) {
          setDatasets({ products: [], shopifyItems: [], orders: [] });
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    loadData();

    return () => {
      isMounted = false;
    };
  }, [db, selectedWebsite, availableWebsites]);

  useEffect(() => {
    setViewMode('selected');
  }, [selectedWebsite]);

  // Use availableWebsites from context, fallback to derived storefronts if not available
  const allStorefronts = useMemo(() => {
    if (availableWebsites && availableWebsites.length > 0) {
      return availableWebsites.sort();
    }
    // Fallback: derive from data
    const set = new Set();
    datasets.products.forEach((product) => (product.storefronts || []).forEach((sf) => set.add(sf)));
    datasets.orders.forEach((order) => {
      if (order.storefront) set.add(order.storefront);
    });
    if (set.size === 0) {
      set.add(selectedWebsite || 'LUNERA');
    }
    return Array.from(set).sort();
  }, [availableWebsites, datasets, selectedWebsite]);

  // Initialize selectedFilterStorefront from URL parameter or availableWebsites
  useEffect(() => {
    if (allStorefronts.length > 0 && selectedFilterStorefront === null) {
      // Priority: URL parameter > selectedWebsite > first available
      if (urlStorefront && allStorefronts.includes(urlStorefront)) {
        setSelectedFilterStorefront(urlStorefront);
        saveStorefrontToCache(urlStorefront);
      } else if (allStorefronts.includes(selectedWebsite)) {
        setSelectedFilterStorefront(selectedWebsite);
      } else {
        setSelectedFilterStorefront(allStorefronts[0]);
      }
    }
  }, [allStorefronts, selectedWebsite, selectedFilterStorefront, urlStorefront]);
  
  // Update URL when storefront filter changes
  useEffect(() => {
    if (selectedFilterStorefront && typeof window !== 'undefined') {
      const currentUrl = new URL(window.location.href);
      if (viewMode === 'all') {
        currentUrl.searchParams.delete('storefront');
      } else {
        currentUrl.searchParams.set('storefront', selectedFilterStorefront);
      }
      // Update URL without reloading (using replaceState to avoid adding to history)
      window.history.replaceState({}, '', currentUrl.toString());
      saveStorefrontToCache(selectedFilterStorefront);
    }
  }, [selectedFilterStorefront, viewMode]);

  const effectiveSelectedStorefront = useMemo(() => {
    if (viewMode === 'all') {
      return null; // All storefronts
    }
    // Use selectedFilterStorefront if set, otherwise fallback to selectedWebsite
    if (selectedFilterStorefront && allStorefronts.includes(selectedFilterStorefront)) {
      return selectedFilterStorefront;
    }
    if (allStorefronts.includes(selectedWebsite)) {
      return selectedWebsite;
    }
    return allStorefronts[0] || 'LUNERA';
  }, [selectedFilterStorefront, allStorefronts, selectedWebsite, viewMode]);

  const isPendingForStorefront = (item, storefront) => {
    if (!storefront) {
      return false;
    }
    const processed = item.processedStorefronts || [];
    const targetStorefronts = item.storefronts && item.storefronts.length > 0 
      ? item.storefronts 
      : allStorefronts.length > 0 
        ? allStorefronts 
        : [storefront];
    return targetStorefronts.includes(storefront) && !processed.includes(storefront);
  };

  const isPendingForAnyStorefront = (item) => {
    const processed = item.processedStorefronts || [];
    const targets = item.storefronts && item.storefronts.length > 0 
      ? item.storefronts 
      : allStorefronts.length > 0 
        ? allStorefronts 
        : [selectedWebsite || 'LUNERA'];
    if (targets.length === 0) {
      return processed.length === 0;
    }
    return targets.some((sf) => !processed.includes(sf));
  };

  // Calculate product stock - memoized separately so threshold changes don't re-calculate everything
  const productsWithStock = useMemo(() => {
    return datasets.products.map((product) => {
      // Calculate total stock from variants (if we have them loaded)
      // For now, we'll use hasInStockVariants and inStockVariantCount if available
      const totalStock = product.totalStock || 0;
      const hasInStockVariants = product.hasInStockVariants !== false;
      const isLowStock = totalStock > 0 && totalStock < LOW_STOCK_THRESHOLD;
      const isOutOfStock = !hasInStockVariants;
      
      return {
        ...product,
        totalStock,
        hasInStockVariants,
        isLowStock,
        isOutOfStock,
      };
    });
  }, [datasets.products]);

  // Calculate metrics - memoized based on datasets and viewMode only
  const metrics = useMemo(() => {
    const store = viewMode === 'all' ? null : effectiveSelectedStorefront;
    
    // Filter products by storefront if needed
    const filteredProducts = store
      ? productsWithStock.filter((product) => (product.storefronts || []).includes(store))
      : productsWithStock;
    
    // Filter orders by storefront if needed
    const filteredOrders = store
      ? datasets.orders.filter((order) => order.storefront === store)
      : datasets.orders;
    
    // Calculate low stock products
    const lowStockProducts = filteredProducts.filter((p) => p.isLowStock);
    
    // Calculate out of stock products
    const outOfStockProducts = filteredProducts.filter((p) => p.isOutOfStock);
    
    // Calculate orders metrics
    const totalOrders = filteredOrders.length;
    const ordersLast7Days = filteredOrders.filter((order) => {
      const placedAt = order.placedAt;
      if (!placedAt) return false;
      const orderDate = placedAt.toDate ? placedAt.toDate() : new Date(placedAt);
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      return orderDate >= sevenDaysAgo;
    }).length;
    
    // Calculate revenue
    const totalRevenue = filteredOrders.reduce((sum, order) => {
      const grandTotal = order.totals?.grandTotal || 0;
      return sum + grandTotal;
    }, 0);
    
    // Orders by storefront breakdown
    const ordersByStorefront = {};
    filteredOrders.forEach((order) => {
      const sf = order.storefront || 'Unknown';
      ordersByStorefront[sf] = (ordersByStorefront[sf] || 0) + 1;
    });
    
    // Orders by market breakdown
    const ordersByMarket = {};
    filteredOrders.forEach((order) => {
      const market = order.market || 'Unknown';
      ordersByMarket[market] = (ordersByMarket[market] || 0) + 1;
    });
    
    return {
      lowStockProducts: lowStockProducts.length,
      outOfStockProducts: outOfStockProducts.length,
      totalOrders,
      ordersLast7Days,
      totalRevenue,
      ordersByStorefront,
      ordersByMarket,
    };
  }, [productsWithStock, datasets.orders, viewMode, effectiveSelectedStorefront]);

  const pendingShopifyPreview = useMemo(() => {
    const items = viewMode === 'all'
      ? datasets.shopifyItems.filter((item) => isPendingForAnyStorefront(item))
      : datasets.shopifyItems.filter((item) => isPendingForStorefront(item, effectiveSelectedStorefront));

    return items
      .map((item) => ({
        id: item.id,
        title: item.title || '',
        createdAt: item.createdAt || 0,
        item: item, // Store full item for modal
      }))
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
      .slice(0, 5);
  }, [datasets.shopifyItems, viewMode, effectiveSelectedStorefront, allStorefronts]);

  const quickActions = useMemo(
    () =>
      QUICK_ACTIONS.map((action) => ({
        ...action,
        href: `/admin/${action.path}`,
      })),
    []
  );

  // Summary cards with click handlers
  const summaryCards = useMemo(
    () => [
      {
        label: 'Low stock products',
        value: metrics.lowStockProducts,
        subtitle: `< 10 units`,
        href: `/admin/products?filter=low-stock&threshold=10`,
        color: 'amber',
      },
      {
        label: 'Out of stock',
        value: metrics.outOfStockProducts,
        href: '/admin/products?filter=out-of-stock',
        color: 'rose',
      },
      {
        label: 'Total orders',
        value: metrics.totalOrders,
        subtitle: `${metrics.ordersLast7Days} last 7 days`,
        href: '/admin/orders',
        color: 'emerald',
      },
      {
        label: 'Total revenue',
        value: `€${metrics.totalRevenue.toFixed(2)}`,
        subtitle: `${metrics.totalOrders} orders`,
        href: '/admin/orders',
        color: 'emerald',
      },
      {
        label: 'Orders by storefront',
        value: Object.keys(metrics.ordersByStorefront).length,
        subtitle: Object.entries(metrics.ordersByStorefront)
          .map(([sf, count]) => `${sf}: ${count}`)
          .join(', ') || 'No orders',
        href: '/admin/orders',
        color: 'blue',
      },
    ],
    [metrics]
  );

  const handleCardClick = (href) => {
    if (href) {
      router.push(href);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-50 via-white to-zinc-100 text-zinc-900 transition-colors dark:from-black dark:via-zinc-950 dark:to-black dark:text-zinc-100">
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-6 py-12 sm:px-10">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <p className="text-sm uppercase tracking-[0.2em] text-zinc-500 dark:text-zinc-400">
              Admin overview
            </p>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Store operations
            </h1>
            <p className="max-w-2xl text-base text-zinc-600 dark:text-zinc-400">
              Monitor the health of the storefront and jump straight into the day-to-day workflows.
            </p>
          </div>
          <EditSiteInfoButton />
        </header>

        {allStorefronts.length > 0 && (
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-zinc-500 dark:text-zinc-400">
              {viewMode === 'all' ? (
                'Viewing aggregate metrics across all storefronts'
              ) : (
                `Viewing metrics for ${effectiveSelectedStorefront || 'selected storefront'}`
              )}
            </div>
            <div className="flex items-center gap-3">
              {/* Storefront Filter Dropdown */}
              {allStorefronts.length > 1 && (
                <div className="relative">
                  <select
                    value={viewMode === 'all' ? 'all' : (selectedFilterStorefront || '')}
                    onChange={(e) => {
                      const value = e.target.value;
                      if (value === 'all') {
                        setViewMode('all');
                        setSelectedFilterStorefront(null);
                        // Update URL to remove storefront parameter
                        if (typeof window !== 'undefined') {
                          const currentUrl = new URL(window.location.href);
                          currentUrl.searchParams.delete('storefront');
                          window.history.replaceState({}, '', currentUrl.toString());
                        }
                      } else {
                        setViewMode('selected');
                        setSelectedFilterStorefront(value);
                        // URL will be updated by the useEffect above
                      }
                    }}
                    className="appearance-none rounded-lg border border-zinc-200 bg-white px-4 py-2 pr-8 text-sm font-medium text-zinc-700 shadow-sm transition hover:border-emerald-300 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-400/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-emerald-500 dark:focus:border-emerald-500"
                  >
                    <option value="all">All Storefronts</option>
                    {allStorefronts.map((storefront) => (
                      <option key={storefront} value={storefront}>
                        {storefront}
                      </option>
                    ))}
                  </select>
                  <svg
                    className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              )}
              {/* Quick Toggle (if only 2 storefronts, show as toggle buttons) */}
              {allStorefronts.length === 2 && (
                <div className="inline-flex rounded-full border border-zinc-200 bg-white/70 p-1 dark:border-zinc-700 dark:bg-zinc-900/60">
                  <button
                    type="button"
                    onClick={() => {
                      setViewMode('selected');
                      setSelectedFilterStorefront(allStorefronts[0]);
                      // URL will be updated by the useEffect above
                    }}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                      viewMode === 'selected' && selectedFilterStorefront === allStorefronts[0]
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : 'text-zinc-600 hover:text-emerald-600 dark:text-zinc-300 dark:hover:text-emerald-400'
                    }`}
                  >
                    {allStorefronts[0]}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setViewMode('selected');
                      setSelectedFilterStorefront(allStorefronts[1]);
                      // URL will be updated by the useEffect above
                    }}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                      viewMode === 'selected' && selectedFilterStorefront === allStorefronts[1]
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : 'text-zinc-600 hover:text-emerald-600 dark:text-zinc-300 dark:hover:text-emerald-400'
                    }`}
                  >
                    {allStorefronts[1]}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setViewMode('all');
                      setSelectedFilterStorefront(null);
                      // Update URL to remove storefront parameter
                      if (typeof window !== 'undefined') {
                        const currentUrl = new URL(window.location.href);
                        currentUrl.searchParams.delete('storefront');
                        window.history.replaceState({}, '', currentUrl.toString());
                      }
                    }}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                      viewMode === 'all'
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : 'text-zinc-600 hover:text-emerald-600 dark:text-zinc-300 dark:hover:text-emerald-400'
                    }`}
                  >
                    All
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {summaryCards.map((card) => (
            <button
              key={card.label}
              onClick={() => handleCardClick(card.href)}
              className="group rounded-3xl border border-zinc-200/70 bg-white/80 p-5 text-left shadow-sm backdrop-blur-sm transition hover:border-emerald-200 hover:shadow-md dark:border-zinc-800/80 dark:bg-zinc-900/60 dark:hover:border-emerald-500/40"
            >
              <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">{card.label}</p>
              <p className="mt-3 text-2xl font-semibold">
                {loading ? '—' : typeof card.value === 'string' ? card.value : card.value.toLocaleString()}
              </p>
              {card.subtitle && (
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{card.subtitle}</p>
              )}
            </button>
          ))}
        </section>

        <section className="grid gap-6 lg:grid-cols-[3fr_2fr]">
          <div className="rounded-3xl border border-zinc-200/70 bg-white/80 p-6 shadow-sm backdrop-blur-sm dark:border-zinc-800/80 dark:bg-zinc-900/60">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Quick actions</h2>
            </div>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {quickActions.map((action) => (
                <Link
                  key={action.href}
                  href={action.href}
                  className="group flex h-full flex-col justify-between rounded-2xl border border-zinc-200/70 px-4 py-5 transition hover:border-emerald-200 hover:bg-emerald-50/60 dark:border-zinc-800/70 dark:hover:border-emerald-500/40 dark:hover:bg-emerald-500/10"
                >
                  <div>
                    <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                      {action.title}
                    </p>
                    <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
                      {action.description}
                    </p>
                  </div>
                  <span className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-emerald-600 transition group-hover:translate-x-1 dark:text-emerald-400">
                    Open
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </span>
                </Link>
              ))}
            </div>
          </div>

          <aside className="flex flex-col gap-4 rounded-3xl border border-zinc-200/70 bg-white/80 p-6 shadow-sm backdrop-blur-sm dark:border-zinc-800/80 dark:bg-zinc-900/60">
            <div>
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                Shopify queue
              </h2>
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                {pendingShopifyPreview.length > 0
                  ? 'Pending imports ready for processing.'
                  : 'All imported Shopify items are processed.'}
              </p>
            </div>

            {loading ? (
              <div className="rounded-2xl border border-dashed border-zinc-200/70 px-4 py-6 text-center text-sm text-zinc-500 dark:border-zinc-800/80 dark:text-zinc-400">
                Loading queue…
              </div>
            ) : pendingShopifyPreview.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-zinc-200/70 px-4 py-6 text-center text-sm text-zinc-500 dark:border-zinc-800/80 dark:text-zinc-400">
                No pending Shopify items.
              </div>
            ) : (
              <>
                <ul className="space-y-3">
                  {pendingShopifyPreview.map((item) => (
                    <li
                      key={item.id}
                      onClick={() => setSelectedShopifyItem(item.item)}
                      className="cursor-pointer rounded-2xl border border-zinc-200/70 px-4 py-3 text-sm text-zinc-700 transition hover:border-emerald-200 hover:bg-emerald-50/60 dark:border-zinc-800/80 dark:text-zinc-200 dark:hover:border-emerald-500/40 dark:hover:bg-emerald-500/10"
                    >
                      <p className="line-clamp-2 font-medium">{item.title || 'Untitled item'}</p>
                    </li>
                  ))}
                </ul>
                <Link
                  href="/admin/overview/shopifyItems"
                  className="mt-auto inline-flex items-center justify-center rounded-full border border-emerald-200 bg-emerald-50/60 px-4 py-2 text-xs font-semibold text-emerald-600 transition hover:border-emerald-300 hover:bg-emerald-100 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300 dark:hover:border-emerald-400"
                >
                  Open Shopify queue
                </Link>
              </>
            )}
          </aside>
        </section>
      </main>

      {/* Shopify Item Modal */}
      {selectedShopifyItem && (
        <ProductModal
          mode="shopify"
          shopifyItem={selectedShopifyItem}
          onClose={() => setSelectedShopifyItem(null)}
          onSaved={() => {
            setSelectedShopifyItem(null);
            // Reload data
            window.location.reload();
          }}
        />
      )}
    </div>
  );
}

// Wrap EcommerceOverviewContent in Suspense to handle useSearchParams
export default function EcommerceOverview() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-600">Loading...</p>
      </div>
    }>
      <EcommerceOverviewContent />
    </Suspense>
  );
}
