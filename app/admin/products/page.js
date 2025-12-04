'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { collection, doc, getDocs, onSnapshot, query, serverTimestamp, updateDoc, where, getDoc } from 'firebase/firestore';
import { getFirebaseDb } from '@/lib/firebase';
import Toast from '@/components/admin/Toast';
import ProductModal from '@/components/admin/ProductModal';
import { getCollectionPath, getDocumentPath } from '@/lib/store-collections';
import { useWebsite } from '@/lib/website-context';

export default function ProductsListPage() {
  const router = useRouter();
  const db = getFirebaseDb();
  const { selectedWebsite, availableWebsites } = useWebsite();
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedStorefront, setSelectedStorefront] = useState('all'); // 'all' or specific storefront
  const [activeFilter, setActiveFilter] = useState('all'); // 'all', 'active', 'inactive', 'out-of-stock'
  const [lowStockThreshold, setLowStockThreshold] = useState(10); // Low stock threshold
  const OUT_OF_STOCK_THRESHOLD = 5; // Out of stock threshold (< 5)
  const [editingProduct, setEditingProduct] = useState(null);
  const [creatingProduct, setCreatingProduct] = useState(false);
  const [orderCounts, setOrderCounts] = useState({}); // Map productId -> order count

  // Fetch categories from all storefronts or selected one
  useEffect(() => {
    if (!db) {
      setLoading(false);
      return undefined;
    }

    const storefrontsToLoad = selectedStorefront === 'all' ? availableWebsites : [selectedStorefront || selectedWebsite];
    const unsubscribes = [];
    const categoriesMap = new Map();

    const loadCategories = (storefront) => {
      const categoriesQuery = query(
        collection(db, ...getCollectionPath('categories', storefront))
      );
      const unsubscribe = onSnapshot(
        categoriesQuery,
        (snapshot) => {
          snapshot.docs.forEach((doc) => {
            const categoryData = { id: doc.id, ...doc.data(), storefront };
            // Deduplicate by ID, keeping the first one found
            if (!categoriesMap.has(doc.id)) {
              categoriesMap.set(doc.id, categoryData);
            }
          });
          // Update state with merged categories
          const merged = Array.from(categoriesMap.values())
            .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
          setCategories(merged);
        },
        (error) => {
          console.error(`Failed to load categories from ${storefront}`, error);
        }
      );
      unsubscribes.push(unsubscribe);
    };

    storefrontsToLoad.forEach(loadCategories);

    return () => {
      unsubscribes.forEach((unsub) => unsub());
    };
  }, [db, selectedWebsite, selectedStorefront, availableWebsites]);

  // Fetch products from selected storefront(s)
  useEffect(() => {
    if (!db) {
      setLoading(false);
      return undefined;
    }

    const storefrontsToLoad = selectedStorefront === 'all' ? availableWebsites : [selectedStorefront || selectedWebsite];
    const unsubscribes = [];
    const productsMap = new Map(); // Use Map to deduplicate by product ID

    const loadProducts = (storefront) => {
      const productsQuery = query(
        collection(db, ...getCollectionPath('products', storefront))
      );
      const unsubscribe = onSnapshot(
        productsQuery,
        async (snapshot) => {
          snapshot.docs.forEach((doc) => {
            const productData = { id: doc.id, ...doc.data(), _storefront: storefront };
            
            // Use product-level stock data if available (set by webhooks/imports)
            // Make sure we're reading the actual values from Firestore, not defaulting to 0
            const totalStock = productData.totalStock !== undefined ? productData.totalStock : 0;
            const hasInStockVariants = productData.hasInStockVariants !== undefined 
              ? productData.hasInStockVariants 
              : (totalStock > 0); // Default to true if totalStock > 0
            
            const productWithStock = { 
              ...productData, 
              totalStock, 
              variants: [], // Don't load variants - load on demand
              lowStockVariants: productData.lowStockVariants || 0,
              hasInStockVariants,
              inStockVariantCount: productData.inStockVariantCount !== undefined 
                ? productData.inStockVariantCount 
                : (hasInStockVariants ? 1 : 0),
              totalVariantCount: productData.totalVariantCount !== undefined 
                ? productData.totalVariantCount 
                : 0
            };
            
            // If product exists in multiple storefronts, merge storefronts array
            // NOTE: Stock is the SAME across all storefronts (single source of truth from shopifyItems)
            // We use the first storefront's stock data since they should all match.
            // If they don't match, run the sync script: npm run stock:sync-from-shopify
            if (productsMap.has(doc.id)) {
              const existing = productsMap.get(doc.id);
              const existingStorefronts = Array.isArray(existing.storefronts) ? existing.storefronts : [];
              if (!existingStorefronts.includes(storefront)) {
                existing.storefronts = [...existingStorefronts, storefront];
              }
              // Keep existing stock data (from first storefront) - they should all be the same
              // If inconsistencies exist, the sync script will fix them
            } else {
              productsMap.set(doc.id, productWithStock);
            }
          });
          
          // Update state with merged products
          const merged = Array.from(productsMap.values()).sort((a, b) => {
            const aCreated = a.createdAt?.toMillis?.() || (a.createdAt?.seconds ? a.createdAt.seconds * 1000 : 0);
            const bCreated = b.createdAt?.toMillis?.() || (b.createdAt?.seconds ? b.createdAt.seconds * 1000 : 0);
            return bCreated - aCreated;
          });
          
          setProducts(merged);
          
          // Fetch order counts for all products
          const counts = {};
          const allStorefronts = availableWebsites.length > 0 ? availableWebsites : ['LUNERA', 'GIFTSHOP'];
          for (const sf of allStorefronts) {
            try {
              const ordersSnapshot = await getDocs(
                collection(db, sf, 'orders', 'items')
              );
              ordersSnapshot.docs.forEach((orderDoc) => {
                const orderData = orderDoc.data();
                const items = orderData.items || [];
                items.forEach((item) => {
                  const shopifyProductId = item.productId;
                  if (shopifyProductId) {
                    const matchingProduct = merged.find(
                      (p) => p.sourceShopifyId?.toString() === shopifyProductId.toString()
                    );
                    if (matchingProduct) {
                      counts[matchingProduct.id] = (counts[matchingProduct.id] || 0) + (item.quantity || 1);
                    }
                  }
                });
              });
            } catch (error) {
              console.warn(`Failed to load orders for ${sf}:`, error);
            }
          }
          setOrderCounts(counts);
          setLoading(false);
        },
        (error) => {
          console.error(`Failed to load products from ${storefront}`, error);
          setMessage({ type: 'error', text: 'Failed to load products.' });
          setLoading(false);
        }
      );
      unsubscribes.push(unsubscribe);
    };

    storefrontsToLoad.forEach(loadProducts);

    return () => {
      unsubscribes.forEach((unsub) => unsub());
    };
  }, [db, lowStockThreshold, selectedWebsite, selectedStorefront, availableWebsites]);

  // Filter and search products
  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      // Storefront filter
      if (selectedStorefront !== 'all') {
        const productStorefronts = Array.isArray(product.storefronts) ? product.storefronts : [];
        if (!productStorefronts.includes(selectedStorefront)) {
          return false;
        }
      }

      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesSearch =
          product.displayName?.toLowerCase().includes(query) ||
          product.name?.toLowerCase().includes(query) ||
          product.slug?.toLowerCase().includes(query) ||
          product.description?.toLowerCase().includes(query);
        if (!matchesSearch) return false;
      }

      // Category filter
      if (selectedCategory && !(product.categoryIds || []).includes(selectedCategory)) {
        return false;
      }

      // Active status filter
      if (activeFilter === 'active' && product.active === false) {
        return false;
      }
      if (activeFilter === 'inactive' && product.active !== false) {
        return false;
      }
      
      // Out of stock filter: total stock < 5 OR no in-stock variants
      if (activeFilter === 'out-of-stock') {
        const isOutOfStock = (product.totalStock || 0) < OUT_OF_STOCK_THRESHOLD || product.hasInStockVariants === false;
        if (!isOutOfStock) {
          return false;
        }
      }

      return true;
    });
  }, [products, searchQuery, selectedCategory, activeFilter, selectedStorefront]);

  // Separate filtered out products (out of stock: total stock < 5 OR no in-stock variants)
  const filteredOutProducts = useMemo(() => {
    return filteredProducts.filter((product) => {
      const totalStock = product.totalStock || 0;
      return totalStock < OUT_OF_STOCK_THRESHOLD || product.hasInStockVariants === false;
    });
  }, [filteredProducts]);

  // Products that are visible to customers (total stock >= 5 AND has in-stock variants)
  const visibleProducts = useMemo(() => {
    return filteredProducts.filter((product) => {
      const totalStock = product.totalStock || 0;
      return totalStock >= OUT_OF_STOCK_THRESHOLD && product.hasInStockVariants !== false;
    });
  }, [filteredProducts]);

  const handleToggleActive = async (product) => {
    if (!db) {
      return;
    }

    try {
      await updateDoc(doc(db, ...getDocumentPath('products', product.id, selectedWebsite)), {
        active: product.active === false ? true : false,
        updatedAt: serverTimestamp(),
      });
      const label = product.displayName || product.name || 'product';
      setMessage({ type: 'success', text: `Product "${label}" ${product.active === false ? 'activated' : 'deactivated'}.` });
    } catch (error) {
      console.error('Failed to update product', error);
      setMessage({ type: 'error', text: 'Failed to update product. Check console for details.' });
    }
  };

  const getCategoryName = (categoryId) => {
    const category = categories.find((cat) => cat.id === categoryId);
    return category?.name || '—';
  };

  const storefrontBasePath = '/admin';

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-8 px-6 py-16">
      <header className="space-y-2">
        <button
          onClick={() => router.push(`${storefrontBasePath}/overview`)}
          className="text-sm font-medium text-emerald-600 transition hover:text-emerald-500"
        >
          ← Back to admin
        </button>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-semibold text-zinc-900">Products</h1>
            <p className="text-base text-zinc-500">
              Manage your product catalog, inventory, and pricing.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href={`${storefrontBasePath}/plans/products`}
              className="rounded-full border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-600 transition hover:border-emerald-200 hover:bg-emerald-50/50"
            >
              View plan
            </Link>
            <button
              onClick={() => setCreatingProduct(true)}
              className="rounded-full bg-emerald-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-500"
            >
              + New product
            </button>
          </div>
        </div>
      </header>

      <Toast message={message} onDismiss={() => setMessage(null)} />

      {/* Filters */}
      <section className="space-y-4 rounded-3xl border border-zinc-200/70 bg-white/80 p-6 shadow-sm backdrop-blur-sm">
        <div className="flex items-center gap-4">
          {/* Storefront filter */}
          <div className="flex flex-col gap-2 flex-1 max-w-xs">
            <label className="text-sm font-medium text-zinc-600">Filter by Storefront</label>
            <select
              value={selectedStorefront}
              onChange={(e) => setSelectedStorefront(e.target.value)}
              className="rounded-xl border border-zinc-200 px-4 py-2 text-sm focus:border-emerald-400 focus:outline-none"
            >
              <option value="all">All stores</option>
              {availableWebsites.map((storefront) => (
                <option key={storefront} value={storefront}>
                  {storefront}
                </option>
              ))}
            </select>
          </div>

          {/* Search - keep it but make it secondary */}
          <div className="flex flex-col gap-2 flex-1">
            <label className="text-sm font-medium text-zinc-600">Search</label>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name, slug, or description..."
              className="rounded-xl border border-zinc-200 px-4 py-2 text-sm focus:border-emerald-400 focus:outline-none"
            />
          </div>
        </div>

        {/* Results count */}
        <div className="flex items-center justify-between border-t border-zinc-100 pt-4">
          <p className="text-sm text-zinc-500">
            Showing {visibleProducts.length} visible, {filteredOutProducts.length} filtered out of {products.length} total products
          </p>
          <div className="flex items-center gap-4">
            {filteredOutProducts.length > 0 && (
              <p className="text-sm font-medium text-amber-600">
                🔒 {filteredOutProducts.length} product(s) filtered out (out of stock)
              </p>
            )}
            {filteredProducts.some((p) => p.lowStockVariants > 0) && (
              <p className="text-sm font-medium text-rose-600">
                ⚠️ {filteredProducts.filter((p) => p.lowStockVariants > 0).length} product(s) with low stock
              </p>
            )}
          </div>
        </div>
      </section>

      {/* Filtered Out Products Section */}
      {filteredOutProducts.length > 0 && (
        <section className="overflow-hidden rounded-3xl border border-amber-200/70 bg-amber-50/50 shadow-sm">
          <div className="border-b border-amber-200/70 bg-amber-100/50 px-6 py-4">
            <h2 className="text-lg font-semibold text-amber-900">
              🔒 Filtered Out Products ({filteredOutProducts.length})
            </h2>
            <p className="text-sm text-amber-700 mt-1">
              These products are hidden from customers because all variants are out of stock
            </p>
          </div>
          <div className="divide-y divide-amber-100">
            {filteredOutProducts.map((product) => {
              const hasImage = product.images && product.images.length > 0 && product.images[0];
              return (
                <div
                  key={product.id}
                  className="flex items-center justify-between px-6 py-4 hover:bg-amber-50/50 transition"
                >
                  <div className="flex items-center gap-4 flex-1">
                    <div className="h-12 w-12 flex-shrink-0 overflow-hidden rounded-lg bg-zinc-100">
                      {hasImage ? (
                        <img src={product.images[0]} alt={product.name} className="h-full w-full object-cover opacity-60" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center">
                          <svg className="h-6 w-6 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                          </svg>
                        </div>
                      )}
                    </div>
                    <div className="flex-1">
                      <button
                        type="button"
                        onClick={() => setEditingProduct(product)}
                        className="text-left font-medium text-amber-900 transition hover:text-amber-700"
                      >
                        {product.displayName || product.name || 'Untitled product'}
                      </button>
                      <div className="flex items-center gap-4 mt-1 text-xs text-amber-700">
                        <span>{product.slug}</span>
                        <span>•</span>
                        <span>{product.inStockVariantCount || 0}/{product.totalVariantCount || 0} variants in stock</span>
                        <span>•</span>
                        <span className="font-medium text-rose-600">Total stock: {product.totalStock || 0}</span>
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditingProduct(product)}
                    className="rounded-lg border border-amber-300 px-4 py-2 text-sm font-medium text-amber-700 transition hover:bg-amber-100"
                  >
                    Edit
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Products table */}
      <section className="overflow-hidden rounded-3xl border border-zinc-200/70 bg-white shadow-sm">
        {loading ? (
          <div className="px-4 py-10 text-center text-zinc-400">Loading products...</div>
        ) : visibleProducts.length === 0 ? (
          <div className="px-4 py-10 text-center text-zinc-400">
            {searchQuery || selectedCategory || activeFilter !== 'all' ? 'No products match your filters.' : 'No products yet. Create your first product to get started.'}
          </div>
        ) : (
          <table className="min-w-full divide-y divide-zinc-100 bg-white text-sm">
            <thead className="bg-zinc-50 text-zinc-500">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Product</th>
                <th className="px-4 py-3 text-left font-medium">Storefronts</th>
                <th className="px-4 py-3 text-left font-medium">Category</th>
                <th className="px-4 py-3 text-left font-medium">Price</th>
                <th className="px-4 py-3 text-left font-medium">Stock</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-left font-medium">Markets</th>
                <th className="px-4 py-3 text-left font-medium">Orders</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {visibleProducts.map((product) => {
                const hasLowStock = product.lowStockVariants > 0;
                const hasImage = product.images && product.images.length > 0 && product.images[0];

                return (
                  <tr
                    key={product.id}
                    className={`hover:bg-zinc-50/80 transition ${
                      hasLowStock ? 'bg-rose-50/30' : ''
                    }`}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="h-12 w-12 flex-shrink-0 overflow-hidden rounded-lg bg-zinc-100">
                          {hasImage ? (
                            <img src={product.images[0]} alt={product.name} className="h-full w-full object-cover" />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center">
                              <svg
                                className="h-6 w-6 text-zinc-400"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                strokeWidth={1.5}
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"
                                />
                              </svg>
                            </div>
                          )}
                        </div>
                        <div className="flex flex-col">
                          <button
                            type="button"
                            onClick={() => setEditingProduct(product)}
                            className="text-left font-medium text-zinc-800 transition hover:text-emerald-600"
                          >
                            {product.displayName || product.name || 'Untitled product'}
                          </button>
                          <span className="text-xs text-zinc-400">{product.slug}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {(() => {
                          const productStorefronts = Array.isArray(product.storefronts) ? product.storefronts : [];
                          if (productStorefronts.length === 0) {
                            return <span className="text-xs text-zinc-400">—</span>;
                          }
                          return productStorefronts.map((sf) => (
                            <span
                              key={sf}
                              className="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium bg-zinc-100 text-zinc-700"
                            >
                              {sf}
                            </span>
                          ));
                        })()}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-zinc-600">
                      {(product.categoryIds || [])
                        .map((id) => getCategoryName(id))
                        .filter(Boolean)
                        .join(', ') || '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-medium text-zinc-800">€{product.basePrice?.toFixed(2) || '0.00'}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col">
                        <span className={`font-medium ${product.totalStock === 0 ? 'text-rose-600' : hasLowStock ? 'text-amber-600' : 'text-emerald-600'}`}>
                          {product.totalStock}
                        </span>
                        {hasLowStock && (
                          <span className="text-xs text-rose-500">
                            {product.lowStockVariants} variant{product.lowStockVariants !== 1 ? 's' : ''} low
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                          product.active === false
                            ? 'bg-rose-100 text-rose-600'
                            : 'bg-emerald-100 text-emerald-600'
                        }`}
                      >
                        {product.active === false ? 'Inactive' : 'Active'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {(() => {
                          const marketsList = product.marketsObject && typeof product.marketsObject === 'object'
                            ? Object.keys(product.marketsObject)
                            : (Array.isArray(product.markets) ? product.markets : []);
                          
                          if (marketsList.length === 0) {
                            return <span className="text-xs text-zinc-400">—</span>;
                          }
                          
                          return marketsList.map((market) => {
                            const marketData = product.marketsObject?.[market];
                            const isAvailable = marketData?.available !== false;
                            
                            return (
                              <span
                                key={market}
                                className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ${
                                  isAvailable
                                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                                    : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                                }`}
                                title={isAvailable ? `${market}: Available to customers` : `${market}: Assigned but not available`}
                              >
                                {market}
                                {!isAvailable && (
                                  <svg className="ml-0.5 h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                                  </svg>
                                )}
                              </span>
                            );
                          });
                        })()}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-zinc-500">
                      {orderCounts[product.id] || 0}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setEditingProduct(product)}
                          className="rounded-full border border-zinc-200 px-3 py-1 text-xs font-medium text-zinc-600 transition hover:border-emerald-200 hover:bg-emerald-50/50"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleActive(product)}
                          className="rounded-full border border-zinc-200 px-3 py-1 text-xs font-medium text-zinc-600 transition hover:border-emerald-200 hover:bg-emerald-50/50"
                        >
                          {product.active === false ? 'Activate' : 'Deactivate'}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      {/* Product Edit Modal */}
      {editingProduct && (
        <ProductModal
          mode="edit"
          existingProduct={editingProduct}
          onClose={() => setEditingProduct(null)}
          onSaved={() => {
            setEditingProduct(null);
            setMessage({ type: 'success', text: 'Product updated successfully!' });
          }}
        />
      )}

      {/* Product Create Modal */}
      {creatingProduct && (
        <ProductModal
          mode="manual"
          onClose={() => setCreatingProduct(false)}
          onSaved={() => {
            setCreatingProduct(false);
            setMessage({ type: 'success', text: 'Product created successfully!' });
          }}
        />
      )}
    </div>
  );
}

