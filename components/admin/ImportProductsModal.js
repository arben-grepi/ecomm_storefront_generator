'use client';

import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { collection, getDocs } from 'firebase/firestore';
import { getFirebaseDb } from '@/lib/firebase';
import { getCollectionPath } from '@/lib/store-collections';
import { useWebsite } from '@/lib/website-context';
import Toast from '@/components/admin/Toast';

export default function ImportProductsModal({ isOpen, onClose, onImport }) {
  const db = getFirebaseDb();
  const { selectedWebsite, availableWebsites } = useWebsite();
  const [loading, setLoading] = useState(true);
  const [shopifyItems, setShopifyItems] = useState([]);
  const [existingProducts, setExistingProducts] = useState([]); // Products that already exist
  const [expandedProducts, setExpandedProducts] = useState(new Set());
  const [selectedProducts, setSelectedProducts] = useState(new Set()); // Selected product IDs
  const [selectedVariants, setSelectedVariants] = useState(new Set()); // Selected variant IDs (format: productId-variantId)
  const [importing, setImporting] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);

  // Fetch products from Shopify API and check which products exist
  useEffect(() => {
    if (!isOpen) return;

    const loadData = async () => {
      setLoading(true);
      try {
        // Fetch products directly from Shopify API
        const response = await fetch('/api/admin/fetch-shopify-products');
        const data = await response.json();

        if (!data.success) {
          throw new Error(data.error || 'Failed to fetch products from Shopify');
        }

        const shopifyProducts = data.products || [];

        // Check which products already exist in shopifyItems collection
        const existingProductsSet = new Set();
        
        if (db) {
          try {
            const shopifyItemsSnap = await getDocs(collection(db, ...getCollectionPath('shopifyItems')));
            shopifyItemsSnap.docs.forEach((doc) => {
              const itemData = doc.data();
              // Check if product has shopifyId (the Shopify product ID)
              if (itemData.shopifyId) {
                existingProductsSet.add(itemData.shopifyId.toString());
              }
            });
          } catch (error) {
            console.warn('Failed to load shopifyItems:', error);
          }
        }

        // Transform Shopify products to match the expected format
        const items = shopifyProducts.map((product) => ({
          id: product.id,
          shopifyId: product.id,
          title: product.title,
          handle: product.handle,
          status: product.status,
          vendor: product.vendor,
          productType: product.productType,
          tags: product.tags,
          rawProduct: {
            id: product.id,
            title: product.title,
            variants: product.variants,
            images: product.images,
          },
        }));

        setShopifyItems(items);
        setExistingProducts(Array.from(existingProductsSet));
      } catch (error) {
        console.error('Failed to fetch Shopify products:', error);
        setToastMessage({ type: 'error', text: `Failed to fetch products from Shopify: ${error.message}` });
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [isOpen, db, availableWebsites]);

  // Separate products into existing and new
  const { newProducts, existingProductsList } = useMemo(() => {
    const newProds = [];
    const existingProds = [];

    shopifyItems.forEach((item) => {
      const shopifyId = item.shopifyId?.toString();
      const exists = shopifyId && existingProducts.includes(shopifyId);
      
      if (exists) {
        existingProds.push(item);
      } else {
        newProds.push(item);
      }
    });

    return {
      newProducts: newProds,
      existingProductsList: existingProds,
    };
  }, [shopifyItems, existingProducts]);

  // Get variants for a product
  const getProductVariants = (item) => {
    if (item.rawProduct?.variants) {
      return item.rawProduct.variants;
    }
    // Fallback: if rawProduct doesn't exist, return empty array
    return [];
  };

  // Group variants by the first part of their title (before the first "/")
  const groupVariantsByFirstPart = (variants) => {
    const groups = new Map();
    
    variants.forEach((variant) => {
      const variantName = variant.title || variant.name || variant.selectedOptions?.map((opt) => opt.value).join(' / ') || 'Unnamed variant';
      // Extract the first part before the first "/"
      const firstPart = variantName.split(' / ')[0]?.trim() || 'Other';
      
      if (!groups.has(firstPart)) {
        groups.set(firstPart, []);
      }
      groups.get(firstPart).push(variant);
    });
    
    // Convert Map to array of [groupName, variants] pairs, sorted by group name
    return Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  };

  // Toggle product expansion
  const toggleProduct = (productId) => {
    setExpandedProducts((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) {
        next.delete(productId);
      } else {
        next.add(productId);
      }
      return next;
    });
  };

  // Toggle product selection (auto-selects all variants)
  const toggleProductSelection = (productId, item) => {
    setSelectedProducts((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) {
        next.delete(productId);
        // Deselect all variants for this product
        setSelectedVariants((prevVariants) => {
          const nextVariants = new Set(prevVariants);
          const variants = getProductVariants(item);
          variants.forEach((variant) => {
            nextVariants.delete(`${productId}-${variant.id}`);
          });
          return nextVariants;
        });
      } else {
        next.add(productId);
        // Auto-select all variants for this product
        setSelectedVariants((prevVariants) => {
          const nextVariants = new Set(prevVariants);
          const variants = getProductVariants(item);
          variants.forEach((variant) => {
            nextVariants.add(`${productId}-${variant.id}`);
          });
          return nextVariants;
        });
      }
      return next;
    });
  };

  // Toggle individual variant selection
  const toggleVariantSelection = (productId, variantId) => {
    const variantKey = `${productId}-${variantId}`;
    setSelectedVariants((prev) => {
      const next = new Set(prev);
      if (next.has(variantKey)) {
        next.delete(variantKey);
        // If all variants are deselected, deselect the product
        const item = shopifyItems.find((i) => i.id === productId);
        if (item) {
          const variants = getProductVariants(item);
          const allDeselected = variants.every((v) => !next.has(`${productId}-${v.id}`));
          if (allDeselected) {
            setSelectedProducts((prevProds) => {
              const nextProds = new Set(prevProds);
              nextProds.delete(productId);
              return nextProds;
            });
          }
        }
      } else {
        next.add(variantKey);
        // If any variant is selected, select the product
        setSelectedProducts((prev) => {
          const next = new Set(prev);
          next.add(productId);
          return next;
        });
      }
      return next;
    });
  };

  // Select all new products
  const selectAllNewProducts = () => {
    setSelectedProducts(new Set(newProducts.map((item) => item.id)));
    setSelectedVariants((prev) => {
      const next = new Set(prev);
      newProducts.forEach((item) => {
        const variants = getProductVariants(item);
        variants.forEach((variant) => {
          next.add(`${item.id}-${variant.id}`);
        });
      });
      return next;
    });
  };

  // Deselect all
  const deselectAll = () => {
    setSelectedProducts(new Set());
    setSelectedVariants(new Set());
  };

  // Handle import
  const handleImport = async () => {
    if (selectedProducts.size === 0) {
      setToastMessage({ type: 'error', text: 'Please select at least one product to import.' });
      return;
    }

    setImporting(true);
    try {
      // Prepare selected items with their selected variants
      // Format: [{ productId: string, variantIds: string[] }]
      const itemsToImport = Array.from(selectedProducts).map((productId) => {
        const item = shopifyItems.find((i) => i.id === productId);
        const variants = getProductVariants(item);
        const selectedVariantIds = variants
          .filter((variant) => selectedVariants.has(`${productId}-${variant.id}`))
          .map((variant) => variant.id);

        return {
          productId: productId.toString(),
          variantIds: selectedVariantIds.length > 0 ? selectedVariantIds.map(id => id.toString()) : null, // null means all variants
        };
      });

      // Call the import callback
      await onImport(itemsToImport);

      setToastMessage({ type: 'success', text: 'Import started successfully!' });
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (error) {
      console.error('Import error:', error);
      setToastMessage({ type: 'error', text: 'Failed to start import. Please try again.' });
    } finally {
      setImporting(false);
    }
  };

  if (!isOpen) return null;

  const selectedCount = selectedProducts.size;
  const totalNewProducts = newProducts.length;
  const totalExistingProducts = existingProductsList.length;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-5xl rounded-3xl border border-zinc-200/70 bg-white/95 p-8 shadow-xl backdrop-blur-sm dark:border-zinc-800/80 dark:bg-zinc-900/95 my-8"
        onClick={(e) => e.stopPropagation()}
      >
        {toastMessage && (
          <Toast
            message={toastMessage}
            onDismiss={() => setToastMessage(null)}
            position="absolute"
            offsetClass="top-6 right-6"
          />
        )}

        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
              Import Products from Shopify
            </h2>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Select products and variants to import
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={importing}
            className="rounded-full p-2 text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {loading ? (
          <div className="py-12 text-center text-zinc-500 dark:text-zinc-400">
            <svg className="mx-auto h-8 w-8 animate-spin text-emerald-600" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            <p className="mt-4">Loading products...</p>
          </div>
        ) : (
          <>
            {/* Selection Controls */}
            <div className="mb-6 flex items-center justify-between rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-800/50">
              <div className="flex items-center gap-3">
                <button
                  onClick={selectAllNewProducts}
                  disabled={totalNewProducts === 0 || importing}
                  className="rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-50 disabled:cursor-not-allowed dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300"
                >
                  Select All ({totalNewProducts})
                </button>
                <button
                  onClick={deselectAll}
                  disabled={selectedCount === 0 || importing}
                  className="rounded-full border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 disabled:opacity-50 disabled:cursor-not-allowed dark:border-zinc-700 dark:text-zinc-300"
                >
                  Deselect All
                </button>
              </div>
              <div className="text-sm text-zinc-600 dark:text-zinc-400">
                {selectedCount} product{selectedCount !== 1 ? 's' : ''} selected
              </div>
            </div>

            {/* Empty State */}
            {newProducts.length === 0 && existingProductsList.length === 0 && !loading && (
              <div className="py-12 text-center text-zinc-500 dark:text-zinc-400">
                <p className="text-lg font-medium">No products found</p>
                <p className="mt-2 text-sm">No products available in your Shopify store.</p>
              </div>
            )}

            {/* New Products Section */}
            {newProducts.length > 0 && (
              <div className="mb-6">
                <h3 className="mb-4 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                  New Products ({newProducts.length})
                </h3>
                <div className="max-h-[32rem] space-y-2 overflow-y-auto rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900/50">
                  {newProducts.map((item) => {
                    const productId = item.id;
                    const isExpanded = expandedProducts.has(productId);
                    const isSelected = selectedProducts.has(productId);
                    const variants = getProductVariants(item);
                    const selectedVariantCount = variants.filter((v) =>
                      selectedVariants.has(`${productId}-${v.id}`)
                    ).length;

                    return (
                      <div
                        key={productId}
                        className={`rounded-lg border ${
                          isSelected
                            ? 'border-emerald-300 bg-emerald-50/50 dark:border-emerald-500/50 dark:bg-emerald-500/10'
                            : 'border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-800/50'
                        }`}
                      >
                        {/* Product Row */}
                        <div className="flex items-center gap-3 p-3">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleProductSelection(productId, item)}
                            disabled={importing}
                            className="h-4 w-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500"
                          />
                          <div className="flex-1">
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="font-medium text-zinc-900 dark:text-zinc-100">
                                  {item.title || 'Untitled Product'}
                                </p>
                                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                                  {variants.length} variant{variants.length !== 1 ? 's' : ''}
                                  {isSelected && selectedVariantCount < variants.length && (
                                    <span className="ml-2 text-emerald-600">
                                      ({selectedVariantCount}/{variants.length} selected)
                                    </span>
                                  )}
                                </p>
                              </div>
                              <button
                                onClick={() => toggleProduct(productId)}
                                disabled={importing}
                                className="p-1 text-zinc-400 transition hover:text-zinc-600 dark:hover:text-zinc-200"
                              >
                                <svg
                                  className={`h-5 w-5 transition-transform ${
                                    isExpanded ? 'rotate-180' : ''
                                  }`}
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  stroke="currentColor"
                                >
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                </svg>
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* Variants (when expanded) */}
                        {isExpanded && variants.length > 0 && (() => {
                          const groupedVariants = groupVariantsByFirstPart(variants);
                          
                          return (
                            <div className="border-t border-zinc-200 bg-zinc-50/50 p-3 dark:border-zinc-700 dark:bg-zinc-900/30">
                              <div className="space-y-4">
                                {groupedVariants.map(([groupName, groupVariants]) => (
                                  <div key={groupName} className="space-y-2">
                                    <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                                      {groupName}
                                    </h4>
                                    {groupVariants.map((variant) => {
                                      const variantId = variant.id;
                                      const variantKey = `${productId}-${variantId}`;
                                      const isVariantSelected = selectedVariants.has(variantKey);
                                      const variantName =
                                        variant.title || variant.name || variant.selectedOptions?.map((opt) => opt.value).join(' / ') || 'Unnamed variant';
                                      const stock = variant.inventory_quantity || variant.inventoryQuantity || 0;

                                      return (
                                        <div
                                          key={variantId}
                                          className={`ml-4 flex items-center gap-3 rounded border p-2 ${
                                            isVariantSelected
                                              ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-500/50 dark:bg-emerald-500/10'
                                              : 'border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-800/50'
                                          }`}
                                        >
                                          <input
                                            type="checkbox"
                                            checked={isVariantSelected}
                                            onChange={() => toggleVariantSelection(productId, variantId)}
                                            disabled={importing}
                                            className="h-4 w-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500"
                                          />
                                          <div className="flex-1">
                                            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                                              {variantName}
                                            </p>
                                            <p className="text-xs text-zinc-500 dark:text-zinc-400">
                                              Stock: {stock} | SKU: {variant.sku || 'N/A'}
                                            </p>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Existing Products Section */}
            {existingProductsList.length > 0 && (
              <div className="mb-6">
                <h3 className="mb-4 text-lg font-semibold text-zinc-500 dark:text-zinc-400">
                  Already Imported ({existingProductsList.length})
                </h3>
                <div className="max-h-[16rem] space-y-2 overflow-y-auto rounded-xl border border-zinc-200 bg-zinc-50/50 p-4 dark:border-zinc-700 dark:bg-zinc-800/30">
                  {existingProductsList.map((item) => {
                    const variants = getProductVariants(item);
                    return (
                      <div
                        key={item.id}
                        className="rounded-lg border border-zinc-200 bg-white p-3 opacity-60 dark:border-zinc-700 dark:bg-zinc-800/50"
                      >
                        <p className="font-medium text-zinc-600 dark:text-zinc-400">
                          {item.title || 'Untitled Product'}
                        </p>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400">
                          {variants.length} variant{variants.length !== 1 ? 's' : ''} • Already in database
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-3 border-t border-zinc-200 pt-6 dark:border-zinc-700">
              <button
                onClick={onClose}
                disabled={importing}
                className="rounded-full border border-zinc-200 px-6 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300"
              >
                Cancel
              </button>
              <button
                onClick={handleImport}
                disabled={selectedCount === 0 || importing}
                className="rounded-full bg-emerald-600 px-6 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {importing ? 'Importing...' : `Import ${selectedCount} Product${selectedCount !== 1 ? 's' : ''}`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}

