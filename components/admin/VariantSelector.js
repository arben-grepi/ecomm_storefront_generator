'use client';

import { getDisplayImageUrl } from '@/lib/image-utils';
import VariantExpandedView from './VariantExpandedView';

/**
 * VariantSelector - Component for selecting and displaying variants
 * Reuses the pattern from ImportProductsModal for consistency
 */
export default function VariantSelector({
  availableVariants,
  selectedVariants,
  setSelectedVariants,
  handleVariantToggle,
  defaultVariantId,
  setDefaultVariantId,
  expandedVariants,
  toggleVariantExpanded,
  mode,
  showOnlyInStock,
  setShowOnlyInStock,
  basePriceInput,
  variantPriceOverrides,
  variantPriceErrors,
  setVariantPriceOverrides,
  setVariantPriceErrors,
  defaultVariantPhotos,
  setDefaultVariantPhotos,
  variantImages,
  getVariantDefaultImages,
  getSelectedVariantImages,
  selectedImages,
  availableImages,
  getVariantGroupKey,
  getSameColorVariantIds,
  handleVariantImageToggle,
  handleRemoveVariant,
  getVariantColor,
}) {
  const filteredVariants = showOnlyInStock
    ? availableVariants.filter((v) => {
        const stock = mode === 'shopify'
          ? (v.inventory_quantity || v.inventoryQuantity || 0)
          : (v.stock || 0);
        return stock > 0;
      })
    : availableVariants;

  const allSelectableIds = availableVariants
    .filter((v) => {
      const variantId = v.id || v.shopifyId;
      const stock = mode === 'shopify'
        ? (v.inventory_quantity || v.inventoryQuantity || 0)
        : (v.stock || 0);
      return mode === 'manual' || mode === 'edit' || stock > 0;
    })
    .map((v) => v.id || v.shopifyId);

  const allSelected = allSelectableIds.every((id) => selectedVariants.includes(id));

  if (availableVariants.length === 0) {
    return null;
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Select Variants ({selectedVariants.length} selected)
          </label>
          <button
            type="button"
            onClick={() => {
              if (allSelected) {
                setSelectedVariants([]);
              } else {
                setSelectedVariants([...new Set([...selectedVariants, ...allSelectableIds])]);
              }
            }}
            className="text-xs text-emerald-600 hover:text-emerald-700 dark:text-emerald-400"
          >
            {allSelected ? 'Deselect All' : 'Select All'}
          </button>
        </div>
        <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
          <input
            type="checkbox"
            checked={showOnlyInStock}
            onChange={(e) => setShowOnlyInStock(e.target.checked)}
            className="rounded border-zinc-300"
          />
          Show only in-stock
        </label>
      </div>
      <div className="max-h-[36rem] overflow-y-auto overflow-x-hidden space-y-3 rounded-lg border border-zinc-200 dark:border-zinc-700 p-3">
        {filteredVariants.map((variant) => {
          const variantId = variant.id || variant.shopifyId;
          const isSelected = selectedVariants.includes(variantId);
          const stock = mode === 'shopify'
            ? (variant.inventory_quantity || variant.inventoryQuantity || 0)
            : (variant.stock || 0);
          const isOutOfStock = stock <= 0;
          const selectedVariantImagesForVariant = getSelectedVariantImages(variantId);
          const previewImage =
            defaultVariantPhotos[variantId] ||
            selectedVariantImagesForVariant[0] ||
            getVariantDefaultImages(variant)[0] ||
            selectedImages.find((img) => img.isMain)?.url ||
            selectedImages[0]?.url ||
            availableImages[0];
          const isExpanded = expandedVariants.has(variantId);
          const selectedAttributeLabels = (variant.selectedOptions || []).map((option) => ({
            label: option?.name || 'Option',
            value: option?.value || '',
          }));

          return (
            <div
              key={variantId}
              className={`rounded-xl border border-zinc-200 bg-white shadow-sm transition dark:border-zinc-700 dark:bg-zinc-900 ${
                isSelected ? 'ring-1 ring-emerald-400 dark:ring-emerald-500' : ''
              }`}
            >
              <div className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="flex items-center gap-3">
                  <input
                    id={`variant-${variantId}`}
                    type="checkbox"
                    checked={selectedVariants.includes(variantId)}
                    onChange={() => handleVariantToggle(variantId)}
                    className="h-4 w-4 rounded border-zinc-300 text-emerald-500 focus:ring-emerald-400"
                  />
                  <div className="flex items-center gap-1">
                    <input
                      id={`default-variant-${variantId}`}
                      type="radio"
                      name="defaultVariant"
                      checked={defaultVariantId === variantId}
                      onChange={() => setDefaultVariantId(variantId)}
                      disabled={!isSelected}
                      className="h-4 w-4 border-zinc-300 text-emerald-500 focus:ring-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed"
                      title={isSelected ? 'Set as default variant' : 'Select variant first'}
                    />
                    {defaultVariantId === variantId && (
                      <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400" title="Default variant">
                        Default
                      </span>
                    )}
                  </div>
                  <label htmlFor={`variant-${variantId}`} className="flex flex-col text-sm">
                    <span className="font-medium text-zinc-900 dark:text-zinc-100">
                      {variant.variantName || variant.title || variant.name || variant.selectedOptions?.map((opt) => opt.value).join(' / ') || 'Unnamed variant'}
                    </span>
                    <span className="flex flex-wrap gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                      {selectedAttributeLabels.map((attr) => (
                        <span key={`${variantId}-${attr.label}`} className="rounded-full bg-zinc-100 px-2 py-0.5 dark:bg-zinc-800">
                          {attr.value || '—'}
                        </span>
                      ))}
                    </span>
                  </label>
                </div>
                <div className="flex items-center gap-3">
                  {previewImage && (
                    <img
                      src={getDisplayImageUrl(previewImage)}
                      alt="Variant preview"
                      className="h-12 w-12 rounded-lg border border-zinc-200 object-cover dark:border-zinc-700"
                    />
                  )}
                  <div className="flex items-center gap-2">
                    {mode === 'manual' && (
                      <button
                        type="button"
                        onClick={() => handleRemoveVariant(variantId)}
                        className="rounded-full p-2 text-red-500 transition hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-900/20"
                        title="Remove variant"
                      >
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => toggleVariantExpanded(variantId)}
                      className="rounded-full p-2 text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                    >
                      <svg
                        className={`h-5 w-5 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
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

              {isExpanded && (
                <VariantExpandedView
                  variant={variant}
                  variantId={variantId}
                  mode={mode}
                  basePriceInput={basePriceInput}
                  variantPriceOverrides={variantPriceOverrides}
                  variantPriceErrors={variantPriceErrors}
                  setVariantPriceOverrides={setVariantPriceOverrides}
                  setVariantPriceErrors={setVariantPriceErrors}
                  defaultVariantPhotos={defaultVariantPhotos}
                  setDefaultVariantPhotos={setDefaultVariantPhotos}
                  variantImages={variantImages}
                  getVariantDefaultImages={getVariantDefaultImages}
                  getSelectedVariantImages={getSelectedVariantImages}
                  selectedImages={selectedImages}
                  availableImages={availableImages}
                  getVariantGroupKey={getVariantGroupKey}
                  getSameColorVariantIds={getSameColorVariantIds}
                  handleVariantImageToggle={handleVariantImageToggle}
                  getVariantColor={getVariantColor}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

