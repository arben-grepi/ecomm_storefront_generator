'use client';

import { getDisplayImageUrl } from '@/lib/image-utils';

/**
 * VariantExpandedView - Expanded view of a variant showing images and price override
 */
export default function VariantExpandedView({
  variant,
  variantId,
  mode,
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
  getVariantColor,
}) {
  const variantInstance = variant;
  const sameGroupVariants = getSameColorVariantIds(variantId);
  const groupKey = getVariantGroupKey(variantInstance);
  const displayGroup = mode === 'shopify'
    ? (getVariantColor ? getVariantColor(variantInstance) : null) || (variantInstance?.color || 'this variant')
    : (variantInstance?.color || variantInstance?.type || 'this variant');
  
  // Variant-specific images (original variant photos) - get for THIS specific variant
  // In edit mode, use only variant-specific images (not group images) to match saved state
  // In shopify mode, use group images for variants of the same color
  const thisVariantSpecificImages = variantImages[variantId] || [];
  const groupVariantImages = mode === 'edit' ? [] : (variantImages[groupKey] || []); // Don't use group images in edit mode
  // Combine: this variant's specific images first, then group images (only in shopify mode)
  const variantSpecificImages = [...new Set([...thisVariantSpecificImages, ...groupVariantImages])];
  // Main gallery selected images
  const mainGallerySelectedUrls = selectedImages.map((img) => img.url);
  // Combined: variant-specific images first (original variant photo), then main gallery selections
  // In edit mode, only include main gallery images if they're also in the variant's saved images
  const groupSelectedImages = mode === 'edit'
    ? [...new Set([...thisVariantSpecificImages])] // Edit mode: only variant's own saved images
    : [...new Set([...variantSpecificImages, ...mainGallerySelectedUrls])]; // Shopify mode: include group and main gallery
  // Available images: all main gallery images + variant-specific images
  const variantDefaultImages = getVariantDefaultImages(variantInstance);
  const availableVariantImages = Array.from(new Set([
    ...availableImages, // All main gallery images
    ...variantDefaultImages // Original variant photos
  ]));

  return (
    <div className="border-t border-zinc-200 bg-white/70 px-3 py-3 dark:border-zinc-700 dark:bg-zinc-900/50 space-y-4">
      {/* Price Display (Read-only from Shopify) */}
      {mode === 'shopify' && variant.price && (
        <div>
          <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
            Price (from Shopify)
          </label>
          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
            €{parseFloat(variant.price || 0).toFixed(2)}
          </p>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Prices are managed in Shopify and cannot be changed here.
          </p>
        </div>
      )}
      
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
          Variant Photos ({groupSelectedImages.length} selected) - Default photo used when viewing this variant
        </p>
        {sameGroupVariants.length > 1 && (
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Applies to all {displayGroup} sizes
          </p>
        )}
      </div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-7">
        {availableVariantImages.map((imageUrl, idx) => {
          const isSelectedImage = groupSelectedImages.includes(imageUrl);
          const isDefaultPhoto = defaultVariantPhotos[variantId] === imageUrl;
          return (
            <button
              key={`${variantId}-image-${idx}`}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (e.shiftKey || e.metaKey || e.ctrlKey) {
                  // Set as default photo when holding Shift/Cmd/Ctrl
                  // Apply to all grouped variants (same color/style)
                  setDefaultVariantPhotos((prev) => {
                    const updated = { ...prev };
                    // Set default photo for all variants in the same group
                    sameGroupVariants.forEach((groupId) => {
                      updated[groupId] = imageUrl;
                    });
                    return updated;
                  });
                  // Also select the image (toggle selection)
                  handleVariantImageToggle(variantId, imageUrl);
                } else {
                  // Toggle image selection
                  handleVariantImageToggle(variantId, imageUrl);
                }
              }}
              onDoubleClick={(e) => {
                e.stopPropagation();
                // Double-click to set as default photo
                // First, make sure the image is selected
                if (!isSelectedImage) {
                  handleVariantImageToggle(variantId, imageUrl);
                }
                // Apply to all grouped variants (same color/style)
                setDefaultVariantPhotos((prev) => {
                  const updated = { ...prev };
                  // Set default photo for all variants in the same group
                  sameGroupVariants.forEach((groupId) => {
                    updated[groupId] = imageUrl;
                  });
                  return updated;
                });
              }}
              className={`group relative aspect-square w-full overflow-hidden rounded-lg border-2 transition ${
                isSelectedImage
                  ? 'border-emerald-500 ring-2 ring-emerald-200'
                  : 'border-zinc-200 dark:border-zinc-700'
              } ${isDefaultPhoto ? 'ring-2 ring-yellow-400 ring-offset-2' : ''}`}
              title={isDefaultPhoto ? 'Default photo (double-click to change)' : 'Click to select, Shift+Click or Double-click to set as default'}
            >
              <img
                src={getDisplayImageUrl(imageUrl)}
                alt={`Variant image ${idx + 1}`}
                className="h-full w-full object-cover"
              />
              {isSelectedImage && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                  <div className="rounded-full bg-emerald-500 p-1">
                    <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                </div>
              )}
              {isDefaultPhoto && (
                <div className="absolute -top-1 -right-1 rounded-full bg-emerald-500 px-2 py-0.5 text-xs font-medium text-white">
                  Default
                </div>
              )}
              {isDefaultPhoto && (
                <div className="absolute top-1 right-1 rounded-full bg-yellow-500 p-1 shadow-lg">
                  <svg className="h-3 w-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                </div>
              )}
            </button>
          );
        })}
      </div>
      {groupSelectedImages.length > 0 && (
        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
          💡 Tip: Double-click an image or Shift+Click to set it as the default photo for this variant (used when viewing this variant). 
          {defaultVariantPhotos[variantId] && ' Yellow star indicates default variant photo.'}
          <br />
          <span className="text-zinc-400">Note: The main product photo (set above) is used in product cards, while variant default photos are used when viewing specific variants.</span>
        </p>
      )}
      {groupSelectedImages.length === 0 && (
        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
          No images selected for this variant. The product main images will be used if you leave this empty.
        </p>
      )}
    </div>
  );
}

