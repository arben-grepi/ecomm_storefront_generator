'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { collection, getDocs, query, where, orderBy, limit } from 'firebase/firestore';
import { getFirebaseDb } from '@/lib/firebase';
import { getCollectionPath, getDocumentPath } from '@/lib/store-collections';
import { useWebsite } from '@/lib/website-context';
import { getStorefront, saveStorefrontToCache } from '@/lib/get-storefront';
import EditSiteInfoButton from '@/components/admin/EditSiteInfoButton';
import ProductModal from '@/components/admin/ProductModal';
import ImportProductsModal from '@/components/admin/ImportProductsModal';
import ImportLogsModal from '@/components/admin/ImportLogsModal';
import { getCachedMetrics, setCachedMetrics } from '@/lib/metrics-cache';

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
  const db = getFirebaseDb();
  const { selectedWebsite, availableWebsites, loading: websitesLoading } = useWebsite();
  const [loading, setLoading] = useState(true);
  const [selectedShopifyItem, setSelectedShopifyItem] = useState(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showLogsModal, setShowLogsModal] = useState(false);
  const [importId, setImportId] = useState(null);
  const [importing, setImporting] = useState(false);
  const [importStatus, setImportStatus] = useState(null);
  const [importCompleted, setImportCompleted] = useState(false);
  const [showEditSiteContent, setShowEditSiteContent] = useState(false);
  const [datasets, setDatasets] = useState({
    products: [],
    shopifyItems: [],
  });

  // Store the storefront in memory when navigating to admin overview
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    // Priority order:
    // 1. Check sessionStorage (set when navigating from storefront page)
    // 2. Check document.referrer to extract storefront from URL
    // 3. Use selectedWebsite from context
    // 4. Fallback to getStorefront()
    
    let storefront = null;
    
    // Check sessionStorage first (set by SettingsMenu/AuthButton when navigating)
    const storedStorefront = sessionStorage.getItem('admin_storefront');
    if (storedStorefront) {
      storefront = storedStorefront;
    } else {
      // Try to extract from referrer URL (e.g., /HEALTH -> HEALTH)
      const referrer = document.referrer;
      if (referrer) {
        try {
          const referrerUrl = new URL(referrer);
          const referrerPath = referrerUrl.pathname;
          const segments = referrerPath.split('/').filter(Boolean);
          
          // Check if first segment is a storefront (not admin, api, etc.)
          const excludedSegments = ['admin', 'api', 'cart', 'checkout', 'orders', 'unavailable', 'thank-you', 'order-confirmation'];
          if (segments.length > 0 && !excludedSegments.includes(segments[0].toLowerCase())) {
            const potentialStorefront = segments[0].toUpperCase();
            // Only use if it's a valid storefront (all uppercase, no hyphens typically)
            if (potentialStorefront === segments[0] && !potentialStorefront.includes('-')) {
              storefront = potentialStorefront;
              // Store it for future use
              sessionStorage.setItem('admin_storefront', storefront);
            }
          }
        } catch (e) {
          // Invalid referrer URL, ignore
        }
      }
    }
    
    // Fallback to context or getStorefront()
    if (!storefront) {
      storefront = selectedWebsite || getStorefront();
    }
    
    if (storefront) {
      // Store in sessionStorage for use during sign out and in admin components
      sessionStorage.setItem('admin_storefront', storefront);
      // Also save to in-memory cache (same as cart page) so logo navigation works correctly
      saveStorefrontToCache(storefront);
    }
  }, [selectedWebsite]);

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
        // Load products - limit to 100 for metrics calculation (we don't need all products)
        // Use product-level stock data instead of loading variants (variants loaded on-demand when viewing product)
        const productsQuery = query(
          collection(db, ...getCollectionPath('products', selectedWebsite)),
          orderBy('createdAt', 'desc'),
          limit(100)
        );
        const productsSnap = await getDocs(productsQuery);
        const products = productsSnap.docs.map((doc) => {
          const productData = { id: doc.id, ...doc.data() };
          
          // Use product-level stock data if available (set by webhooks/imports)
          // Variants will be loaded on-demand when viewing/editing the product
          productData.totalStock = productData.totalStock || 0;
          if (productData.hasInStockVariants === undefined) {
            // Default to true if not set (backward compatibility)
            productData.hasInStockVariants = productData.totalStock > 0;
          }
          
          return productData;
        });

        // Load shopify items - only unprocessed ones for efficiency
        let shopifySnap;
        try {
          // Try to query for unprocessed items first (most efficient)
          const unprocessedQuery = query(
            collection(db, ...getCollectionPath('shopifyItems')),
            where('hasProcessedStorefronts', '==', false),
            orderBy('createdAt', 'desc')
          );
          shopifySnap = await getDocs(unprocessedQuery);
        } catch (indexError) {
          // If index doesn't exist, fall back to loading all and filtering client-side
          console.warn('hasProcessedStorefronts index may not exist, loading all items:', indexError.message);
          const allItemsQuery = query(
            collection(db, ...getCollectionPath('shopifyItems')),
            orderBy('createdAt', 'desc')
          );
          shopifySnap = await getDocs(allItemsQuery).catch((error) => {
            console.warn('Failed to load shopifyItems (may need admin auth):', error.message);
            return { docs: [] };
          });
        }
        
        const shopifyItems = shopifySnap.docs
          .map((doc) => {
            const data = doc.data();
            const createdAt =
              typeof data.createdAt?.toMillis === 'function'
                ? data.createdAt.toMillis()
                : data.createdAt?.seconds
                ? data.createdAt.seconds * 1000
                : 0;
            const processedStorefronts = Array.isArray(data.processedStorefronts) ? data.processedStorefronts : [];
            const hasProcessedStorefronts = data.hasProcessedStorefronts !== undefined 
              ? data.hasProcessedStorefronts 
              : processedStorefronts.length > 0;
            
            return {
              id: doc.id,
              ...data,
              createdAt,
              processedStorefronts,
              storefronts: Array.isArray(data.storefronts) ? data.storefronts : [],
              hasProcessedStorefronts,
            };
          })
          .filter((item) => !item.hasProcessedStorefronts); // Filter to only unprocessed items

        if (!isMounted) return;

        setDatasets({ products, shopifyItems });
      } catch (error) {
        console.error('Failed to load admin overview data', error);
        if (isMounted) {
          setDatasets({ products: [], shopifyItems: [] });
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

  // Function to refresh shopifyItems (can be called after import)
  const refreshShopifyItems = async () => {
    if (!db) return;
    
    try {
      let shopifySnap;
      try {
        // Try to query for unprocessed items first (most efficient)
        const unprocessedQuery = query(
          collection(db, ...getCollectionPath('shopifyItems')),
          where('hasProcessedStorefronts', '==', false),
          orderBy('createdAt', 'desc')
        );
        shopifySnap = await getDocs(unprocessedQuery);
      } catch (indexError) {
        // If index doesn't exist, fall back to loading all and filtering client-side
        const allItemsQuery = query(
          collection(db, ...getCollectionPath('shopifyItems')),
          orderBy('createdAt', 'desc')
        );
        shopifySnap = await getDocs(allItemsQuery).catch((error) => {
          console.warn('Failed to load shopifyItems:', error.message);
          return { docs: [] };
        });
      }
      
      const shopifyItems = shopifySnap.docs
        .map((doc) => {
          const itemData = doc.data();
          const createdAt =
            typeof itemData.createdAt?.toMillis === 'function'
              ? itemData.createdAt.toMillis()
              : itemData.createdAt?.seconds
              ? itemData.createdAt.seconds * 1000
              : 0;
          const processedStorefronts = Array.isArray(itemData.processedStorefronts) ? itemData.processedStorefronts : [];
          const hasProcessedStorefronts = itemData.hasProcessedStorefronts !== undefined 
            ? itemData.hasProcessedStorefronts 
            : processedStorefronts.length > 0;
          
          return {
            id: doc.id,
            ...itemData,
            createdAt,
            processedStorefronts,
            storefronts: Array.isArray(itemData.storefronts) ? itemData.storefronts : [],
            hasProcessedStorefronts,
          };
        })
        .filter((item) => !item.hasProcessedStorefronts); // Filter to only unprocessed items
      
      setDatasets((prev) => ({ ...prev, shopifyItems }));
    } catch (error) {
      console.error('Failed to refresh shopifyItems:', error);
    }
  };

  const isPendingForStorefront = (item, storefront) => {
    if (!storefront) {
      return false;
    }
    const processed = item.processedStorefronts || [];
    const targetStorefronts = item.storefronts && item.storefronts.length > 0 
      ? item.storefronts 
      : [storefront];
    return targetStorefronts.includes(storefront) && !processed.includes(storefront);
  };

  // Products with stock data
  const productsWithStock = useMemo(() => {
    return datasets.products.map((product) => {
      const totalStock = product.totalStock || 0;
      const hasInStockVariants = product.hasInStockVariants !== false;
      
      return {
        ...product,
        totalStock,
        hasInStockVariants,
      };
    });
  }, [datasets.products]);

  // Calculate metrics - memoized
  const metrics = useMemo(() => {
    const cacheKey = `metrics_${selectedWebsite || 'default'}`;
    
    // Try to get from cache first
    const cached = getCachedMetrics(cacheKey);
    if (cached) {
      return cached;
    }
    
    // Filter products by selectedWebsite
    const filteredProducts = productsWithStock.filter((product) => 
      (product.storefronts || []).includes(selectedWebsite)
    );
    
    const calculatedMetrics = {};
    
    // Cache the metrics
    setCachedMetrics(cacheKey, calculatedMetrics);
    
    return calculatedMetrics;
  }, [productsWithStock, selectedWebsite]);

  const pendingShopifyPreview = useMemo(() => {
    const items = datasets.shopifyItems.filter((item) => 
      isPendingForStorefront(item, selectedWebsite)
    );

    return items
      .map((item) => ({
        id: item.id,
        title: item.title || '',
        createdAt: item.createdAt || 0,
        item: item, // Store full item for modal
      }))
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
      .slice(0, 5);
  }, [datasets.shopifyItems, selectedWebsite]);

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
    () => [],
    []
  );

  const handleCardClick = (href) => {
    if (href) {
      router.push(href);
    }
  };

  const handleImportProducts = async (selectedItems) => {
    if (importing) return;
    
    setImporting(true);
    setImportStatus({ type: 'info', message: 'Starting import from Shopify...' });
    
    try {
      const response = await fetch('/api/admin/import-shopify-products', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          selectedItems: selectedItems.map((item) => ({
            productId: item.productId,
            variantIds: item.variantIds,
          })),
        }),
      });
      
      const data = await response.json();
      
      if (data.success) {
        setImportStatus({ 
          type: 'success', 
          message: data.message || 'Import triggered successfully. Products will be imported from Shopify.' 
        });
        
        // Show logs modal if importId is provided
        if (data.importId) {
          setImportId(data.importId);
          setShowLogsModal(true);
          setImportCompleted(false);
          
          // Poll for completion status
          const pollCompletion = setInterval(async () => {
            try {
              const statusResponse = await fetch(`/api/admin/import-shopify-products?importId=${data.importId}`);
              if (statusResponse.ok) {
                const statusData = await statusResponse.json();
                if (statusData.completed) {
                  setImportCompleted(true);
                  setImportStatus({ 
                    type: 'success', 
                    message: 'Import completed successfully!' 
                  });
                  clearInterval(pollCompletion);
                  // Refresh shopifyItems after completion
                  refreshShopifyItems();
                }
              }
            } catch (error) {
              console.error('Failed to check import status:', error);
            }
          }, 3000); // Poll every 3 seconds
          
          // Stop polling after 10 minutes
          setTimeout(() => {
            clearInterval(pollCompletion);
          }, 10 * 60 * 1000);
        }
      } else {
        setImportStatus({ 
          type: 'error', 
          message: data.error || 'Failed to trigger import' 
        });
      }
    } catch (error) {
      console.error('Import error:', error);
      setImportStatus({ 
        type: 'error', 
        message: 'Failed to trigger import. Please check server logs or run the script manually.' 
      });
    } finally {
      setImporting(false);
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
        </header>


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
              
              {/* Edit Site Content Button */}
              <button
                onClick={() => setShowEditSiteContent(true)}
                className="group flex h-full flex-col justify-between rounded-2xl border border-zinc-200/70 px-4 py-5 text-left transition hover:border-emerald-200 hover:bg-emerald-50/60 dark:border-zinc-800/70 dark:hover:border-emerald-500/40 dark:hover:bg-emerald-500/10"
              >
                <div>
                  <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                    Edit Site Content
                  </p>
                  <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
                    Customize banner, colors, fonts, and product card styling.
                  </p>
                </div>
                <span className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-emerald-600 transition group-hover:translate-x-1 dark:text-emerald-400">
                  Open
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </span>
              </button>
              
              {/* Import Products Button */}
              <button
                onClick={() => {
                  setShowImportModal(true);
                  setImportCompleted(false);
                }}
                disabled={importing}
                className="group flex h-full flex-col justify-between rounded-2xl border border-zinc-200/70 px-4 py-5 transition hover:border-emerald-200 hover:bg-emerald-50/60 disabled:opacity-50 disabled:cursor-not-allowed dark:border-zinc-800/70 dark:hover:border-emerald-500/40 dark:hover:bg-emerald-500/10"
              >
                <div>
                  <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                    {importCompleted ? 'Import Complete ✓' : 'Import from Shopify'}
                  </p>
                  <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
                    Select and import products from Shopify store.
                  </p>
                  {importStatus && (
                    <p className={`mt-2 text-xs ${
                      importStatus.type === 'success' 
                        ? 'text-emerald-600 dark:text-emerald-400' 
                        : importStatus.type === 'error'
                        ? 'text-rose-600 dark:text-rose-400'
                        : 'text-blue-600 dark:text-blue-400'
                    }`}>
                      {importCompleted ? 'Import completed successfully!' : importStatus.message}
                    </p>
                  )}
                  {importCompleted && (
                    <p className="mt-1 text-xs text-emerald-600 dark:text-emerald-400">
                      ✓ Ready to import more products
                    </p>
                  )}
                </div>
                <span className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-emerald-600 transition group-hover:translate-x-1 dark:text-emerald-400">
                  Select Products
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                </span>
              </button>
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

      {/* Import Products Modal */}
      {showImportModal && (
        <ImportProductsModal
          isOpen={showImportModal}
          onClose={() => setShowImportModal(false)}
          onImport={handleImportProducts}
        />
      )}
      
      {showLogsModal && (
        <ImportLogsModal
          isOpen={showLogsModal}
          onClose={() => {
            setShowLogsModal(false);
            // Refresh shopifyItems when closing logs modal
            refreshShopifyItems();
          }}
          importId={importId}
        />
      )}
      
      {/* Edit Site Content Modal */}
      <EditSiteInfoButton 
        open={showEditSiteContent}
        onOpenChange={setShowEditSiteContent}
      />
    </div>
  );
}

export default function EcommerceOverview() {
  return <EcommerceOverviewContent />;
}
