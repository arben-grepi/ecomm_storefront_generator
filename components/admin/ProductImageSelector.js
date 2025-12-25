'use client';

import { getDisplayImageUrl } from '@/lib/image-utils';

/**
 * ProductImageSelector - Component for selecting main product images
 */
export default function ProductImageSelector({
  availableImages,
  selectedImages,
  handleImageToggle,
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
        Additional Product Photos ({selectedImages.length} selected) <span className="text-xs font-normal text-zinc-400">(Optional)</span>
        <span className="ml-2 text-xs font-normal text-zinc-500">
          - Additional photos for the product gallery. The product card image is automatically set from the default variant's default photo.
        </span>
      </label>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-7">
        {availableImages.map((imageUrl, idx) => {
          const isSelected = selectedImages.some((img) => img.url === imageUrl);
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
            </div>
          );
        })}
      </div>
    </div>
  );
}

