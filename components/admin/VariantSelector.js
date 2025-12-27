'use client';

import { getDisplayImageUrl } from '@/lib/image-utils';
import { cleanBrackets, normalizeVariantName, cleanSizeValue } from '@/lib/variant-utils';
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
  productOptions, // Optional: Product options for proper variant name normalization
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
          // Always prioritize default variant photo, then variant images, then fallback
          const previewImage =
            defaultVariantPhotos[variantId] ||
            selectedVariantImagesForVariant[0] ||
            getVariantDefaultImages(variant)[0] ||
            selectedImages[0]?.url ||
            availableImages[0];
          const isExpanded = expandedVariants.has(variantId);
          const selectedAttributeLabels = (variant.selectedOptions || []).map((option) => ({
            label: option?.name || 'Option',
            value: cleanBrackets(option?.value || ''), // Clean brackets from option values
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
                  <div className="flex items-center gap-2">
                    <input
                      id={`default-variant-${variantId}`}
                      type="radio"
                      name="defaultVariant"
                      checked={defaultVariantId === variantId}
                      onChange={() => setDefaultVariantId(variantId)}
                      disabled={!isSelected}
                      className="h-4 w-4 border-zinc-300 text-emerald-500 focus:ring-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed"
                      title={isSelected ? 'Set as default variant (product card will use this variant\'s default photo)' : 'Select variant first'}
                    />
                    {defaultVariantId === variantId && (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" title="Default variant - product card uses this variant's default photo">
                        Default
                      </span>
                    )}
                  </div>
                  <label htmlFor={`variant-${variantId}`} className="flex flex-col text-sm">
                    <span className="font-medium text-zinc-900 dark:text-zinc-100">
                      {(() => {
                        const variantId = variant.id || variant.shopifyId;
                        console.log('[VariantSelector] Rendering variant name:', {
                          variantId,
                          hasProductOptions: !!productOptions,
                          hasVariantName: !!variant.variantName,
                          hasTitle: !!variant.title,
                          hasName: !!variant.name,
                          hasSelectedOptions: !!variant.selectedOptions,
                          selectedOptionsCount: variant.selectedOptions?.length,
                          selectedOptions: variant.selectedOptions?.map(opt => ({ name: opt.name, value: opt.value })),
                          option1: variant.option1,
                          option2: variant.option2,
                          option3: variant.option3,
                        });
                        
                        // Always try to use normalizeVariantName if productOptions available (cleans size values properly)
                        // This works even if selectedOptions is undefined, as it can use option1, option2, option3
                        if (productOptions && productOptions.length > 0) {
                          const normalizedName = normalizeVariantName(variant, productOptions);
                          console.log('[VariantSelector] normalizeVariantName result:', { variantId, normalizedName });
                          if (normalizedName) {
                            return normalizedName;
                          }
                        }
                        
                        // Fallback to variant properties, but clean size values from them too
                        if (variant.variantName) {
                          console.log('[VariantSelector] Using variant.variantName:', { variantId, variantName: variant.variantName });
                          // Clean size patterns from the variant name
                          const parts = cleanBrackets(variant.variantName).split(' / ');
                          const cleanedParts = parts.map(part => cleanSizeValue(part));
                          return cleanedParts.join(' / ');
                        }
                        if (variant.title) {
                          console.log('[VariantSelector] Using variant.title:', { variantId, title: variant.title });
                          // Clean size patterns from the title - split by " / " and clean each part
                          const parts = cleanBrackets(variant.title).split(' / ');
                          const cleanedParts = parts.map(part => cleanSizeValue(part));
                          return cleanedParts.join(' / ');
                        }
                        if (variant.name) {
                          console.log('[VariantSelector] Using variant.name:', { variantId, name: variant.name });
                          const parts = cleanBrackets(variant.name).split(' / ');
                          const cleanedParts = parts.map(part => cleanSizeValue(part));
                          return cleanedParts.join(' / ');
                        }
                        if (variant.selectedOptions && Array.isArray(variant.selectedOptions) && variant.selectedOptions.length > 0) {
                          // Clean brackets and size patterns from each option value
                          const fallbackName = variant.selectedOptions.map((opt) => cleanSizeValue(cleanBrackets(opt.value || ''))).join(' / ');
                          console.log('[VariantSelector] Using selectedOptions fallback:', { variantId, fallbackName });
                          return fallbackName;
                        }
                        console.log('[VariantSelector] Using "Unnamed variant" fallback:', { variantId });
                        return 'Unnamed variant';
                      })()}
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
                    <div className="relative">
                      <img
                        src={getDisplayImageUrl(previewImage)}
                        alt="Variant preview"
                        className={`h-12 w-12 rounded-lg border object-cover ${
                          defaultVariantPhotos[variantId] === previewImage
                            ? 'border-emerald-500 ring-2 ring-emerald-200 dark:border-emerald-400 dark:ring-emerald-800'
                            : 'border-zinc-200 dark:border-zinc-700'
                        }`}
                        title={defaultVariantPhotos[variantId] === previewImage ? 'Default photo for this variant' : 'Variant preview'}
                      />
                      {defaultVariantPhotos[variantId] === previewImage && (
                        <div className="absolute -top-1 -right-1 rounded-full bg-emerald-500 p-0.5">
                          <svg className="h-3 w-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                          </svg>
                        </div>
                      )}
                    </div>
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

