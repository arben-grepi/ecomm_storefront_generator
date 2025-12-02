'use client';

import { getDisplayImageUrl } from '@/lib/image-utils';

/**
 * ProductImageSelector - Component for selecting main product images
 */
export default function ProductImageSelector({
  availableImages,
  selectedImages,
  handleImageToggle,
  handleSetMainImage,
  mode,
}) {
  if (mode === 'manual') {
    return null; // Manual mode uses ImageManager component
  }

  if (availableImages.length === 0) {
    return (
      <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 p-8 text-center text-zinc-500">
        No images available for this product
      </div>
    );
  }

  return (
    <div>
      <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-3">
        Main Product Photo ({selectedImages.length} selected) <span className="text-xs font-normal text-zinc-400">(Optional)</span>
        <span className="ml-2 text-xs font-normal text-zinc-500">
          - Used in product cards. Select one main photo (mark as "Main") that will be shown on product cards. If none selected, the default variant's photo will be used.
        </span>
      </label>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-7">
        {availableImages.map((imageUrl, idx) => {
          const isSelected = selectedImages.some((img) => img.url === imageUrl);
          const isMain = selectedImages.find((img) => img.url === imageUrl)?.isMain;
          return (
            <div key={idx} className="relative group">
              <button
                type="button"
                onClick={() => handleImageToggle(imageUrl)}
                className={`relative aspect-square w-full overflow-hidden rounded-lg border-2 transition ${
                  isSelected
                    ? 'border-emerald-500 ring-2 ring-emerald-200'
                    : 'border-zinc-200 dark:border-zinc-700'
                }`}
              >
                <img
                  src={getDisplayImageUrl(imageUrl)}
                  alt={`Product image ${idx + 1}`}
                  className="h-full w-full object-cover"
                />
                {isSelected && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                    <div className="rounded-full bg-emerald-500 p-1">
                      <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  </div>
                )}
              </button>
              {isMain && (
                <div className="absolute -top-1 -right-1 rounded-full bg-emerald-500 px-2 py-0.5 text-xs font-medium text-white">
                  Main (Product Card)
                </div>
              )}
              {isSelected && !isMain && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSetMainImage(imageUrl);
                  }}
                  className="absolute bottom-1 left-1/2 -translate-x-1/2 rounded bg-zinc-900/80 px-2 py-1 text-xs text-white opacity-0 transition group-hover:opacity-100"
                  title="Set as main product photo (used in product cards)"
                >
                  Set as Main
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

