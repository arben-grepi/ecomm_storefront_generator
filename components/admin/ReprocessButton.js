'use client';

import { useState } from 'react';

/**
 * ReprocessButton - Button to reprocess a Shopify item
 * Deletes product from all storefronts and resets to initial state
 */
export default function ReprocessButton({ shopifyItemId, onReprocessed }) {
  const [loading, setLoading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [preview, setPreview] = useState(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null); // Store deletion result to show in modal

  // Load preview when dialog opens
  const handleOpenConfirm = async () => {
    setShowConfirm(true);
    setLoadingPreview(true);
    setError(null);
    
    try {
      const response = await fetch(`/api/admin/reprocess-shopify-item?shopifyItemId=${shopifyItemId}`);
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to load preview');
      }
      
      setPreview(data.preview);
    } catch (err) {
      console.error('Failed to load reprocess preview:', err);
      setError(err.message || 'Failed to load preview');
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleReprocess = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/admin/reprocess-shopify-item', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shopifyItemId }),
      });
      
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to reprocess item');
      }
      
      // Store result to show in modal
      setResult(data.result?.deletionResult || null);
    } catch (err) {
      console.error('Failed to reprocess item:', err);
      setError(err.message || 'Failed to reprocess item');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        onClick={handleOpenConfirm}
        disabled={loading}
        className="rounded-full p-2 text-xs text-amber-600 transition hover:bg-amber-50 hover:text-amber-700 dark:text-amber-400 dark:hover:bg-amber-900/20 dark:hover:text-amber-300"
        title="Reprocess this item"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
      </button>

      {/* Confirm Dialog */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-2xl rounded-xl border border-zinc-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-900">
            <div className="border-b border-zinc-200 p-6 dark:border-zinc-800">
              <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                Reprocess Shopify Item
              </h3>
            </div>
            
            <div className="max-h-[60vh] overflow-y-auto p-6">
              {loading ? (
                <div className="flex flex-col items-center justify-center py-8">
                  <svg className="h-6 w-6 animate-spin text-emerald-600" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                  </svg>
                  <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">Reprocessing...</p>
                </div>
              ) : result ? (
                <div className="space-y-4">
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-800 dark:bg-emerald-900/20">
                    <h4 className="mb-2 font-medium text-emerald-900 dark:text-emerald-100">
                      ✅ Reprocess Successful!
                    </h4>
                    <div className="space-y-1 text-sm text-emerald-800 dark:text-emerald-200">
                      <p>• Deleted {result.storefronts?.deletedVariants || 0} variant(s)</p>
                      <p>• Deleted {result.storefronts?.deletedProducts || 0} product(s)</p>
                      {(result.categories?.updatedCategories || 0) > 0 && (
                        <p>• Updated {result.categories.updatedCategories} categor{result.categories.updatedCategories === 1 ? 'y' : 'ies'}</p>
                      )}
                      {(result.categories?.deletedCategories || 0) > 0 && (
                        <p>• Deleted {result.categories.deletedCategories} empty categor{result.categories.deletedCategories === 1 ? 'y' : 'ies'}</p>
                      )}
                    </div>
                    <p className="mt-3 text-sm text-emerald-700 dark:text-emerald-300">
                      Product has been reset and is ready to be reprocessed.
                    </p>
                  </div>
                </div>
              ) : loadingPreview ? (
                <div className="flex items-center justify-center py-8">
                  <svg className="h-6 w-6 animate-spin text-emerald-600" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                  </svg>
                </div>
              ) : error ? (
                <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
                  {error}
                </div>
              ) : preview ? (
                <div className="space-y-6">
                  <div>
                    <h4 className="mb-2 font-medium text-zinc-900 dark:text-zinc-100">
                      Product: {preview.productName}
                    </h4>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                      This will completely remove the product from all storefronts, reset it to unprocessed state, 
                      and allow you to reprocess it with the current processing logic.
                    </p>
                  </div>

                  <div>
                    <h4 className="mb-2 font-medium text-zinc-900 dark:text-zinc-100">
                      Storefronts Affected ({preview.storefronts.length})
                    </h4>
                    {preview.storefronts.length > 0 ? (
                      <ul className="list-disc list-inside space-y-1 text-sm text-zinc-600 dark:text-zinc-400">
                        {preview.storefronts.map((sf) => (
                          <li key={sf}>{sf}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-zinc-500 dark:text-zinc-500">
                        No storefronts (product not yet processed)
                      </p>
                    )}
                  </div>

                  <div>
                    <h4 className="mb-2 font-medium text-zinc-900 dark:text-zinc-100">
                      Categories Affected ({preview.affectedCategories.length})
                    </h4>
                    {preview.affectedCategories.length > 0 ? (
                      <div className="space-y-2">
                        {preview.affectedCategories.map((cat, idx) => (
                          <div key={idx} className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-800/50">
                            <div className="flex items-center justify-between">
                              <span className="font-medium text-zinc-900 dark:text-zinc-100">
                                {cat.categoryName}
                              </span>
                              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                                {cat.storefront}
                              </span>
                            </div>
                            <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                              Product will be removed from this category. If this is the last product, 
                              the category will be deleted.
                            </p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-zinc-500 dark:text-zinc-500">
                        No categories affected
                      </p>
                    )}
                  </div>

                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-900/20">
                    <h4 className="mb-2 font-medium text-amber-900 dark:text-amber-100">
                      What will happen:
                    </h4>
                    <ul className="list-disc list-inside space-y-1 text-sm text-amber-800 dark:text-amber-200">
                      <li>Product and all variants will be deleted from all storefronts</li>
                      <li>Product will be removed from category preview lists</li>
                      <li>Empty categories will be deleted</li>
                      <li>Shopify item will be reset to unprocessed state</li>
                      <li>You can then reprocess it with the current processing logic</li>
                    </ul>
                  </div>
                </div>
              ) : null}
            </div>
            
            <div className="border-t border-zinc-200 p-6 dark:border-zinc-800">
              <div className="flex items-center justify-end gap-3">
                {result ? (
                  <button
                    onClick={() => {
                      setShowConfirm(false);
                      setPreview(null);
                      setResult(null);
                      setError(null);
                      if (onReprocessed) {
                        onReprocessed();
                      }
                    }}
                    className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700"
                  >
                    Close
                  </button>
                ) : (
                  <>
                    <button
                      onClick={() => {
                        setShowConfirm(false);
                        setPreview(null);
                        setResult(null);
                        setError(null);
                      }}
                      disabled={loading}
                      className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleReprocess}
                      disabled={loading || loadingPreview || !preview}
                      className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-amber-700 disabled:opacity-50"
                    >
                      Reprocess Item
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

