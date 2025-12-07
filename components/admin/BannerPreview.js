'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import Banner from '@/components/Banner';
import CategoryCarousel from '@/components/CategoryCarousel';
import SkeletonProductCard from '@/components/SkeletonProductCard';

/**
 * BannerPreview - Modal preview component showing how the banner will look on the homepage
 * Shows banner with hero text, category carousel, and ghost product cards
 */
export default function BannerPreview({ 
  bannerImage, 
  heroMainHeading, 
  heroDescription,
  maxHeight,
  marginBottom,
  onMaxHeightChange,
  onMarginBottomChange,
  isOpen = false,
  onClose
}) {
  const [isEditing, setIsEditing] = useState(false);

  if (!bannerImage || !isOpen) {
    return null;
  }

  // Mock categories for preview
  // Note: CategoryCarousel automatically adds "All Categories" as the first item,
  // so we don't include it here to avoid duplicate keys
  const mockCategories = [
    { id: '2', label: 'Category 1', slug: 'category-1', active: true },
    { id: '3', label: 'Category 2', slug: 'category-2', active: true },
  ];

  const handleSliderChange = (type, value) => {
    setIsEditing(true);
    if (type === 'height') {
      onMaxHeightChange(value);
    } else {
      onMarginBottomChange(value);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
      <div 
        className="relative w-[95vw] h-[95vh] rounded-xl border border-zinc-200/70 bg-white shadow-xl backdrop-blur-sm dark:border-zinc-800/80 dark:bg-zinc-900 overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header with Close Button */}
        <div className="flex items-center justify-between bg-zinc-50 border-b border-zinc-200 px-4 py-3 dark:bg-zinc-800 dark:border-zinc-700">
          <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Banner Preview</h3>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 text-zinc-500 transition hover:bg-zinc-200 hover:text-zinc-900 dark:hover:bg-zinc-700 dark:hover:text-zinc-100"
            aria-label="Close preview"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Controls Bar */}
        <div className="bg-zinc-50 border-b border-zinc-200 px-4 py-3 flex items-center gap-4 dark:bg-zinc-800 dark:border-zinc-700 flex-wrap sm:flex-nowrap">
          <div className="flex items-center gap-4 flex-1 min-w-[200px]">
            <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300 whitespace-nowrap">
              Max Height:
            </label>
            <input
              type="range"
              min="200"
              max="1000"
              value={maxHeight}
              onChange={(e) => handleSliderChange('height', Number(e.target.value))}
              onMouseUp={() => setTimeout(() => setIsEditing(false), 500)}
              onTouchEnd={() => setTimeout(() => setIsEditing(false), 500)}
              className="flex-1 h-2 bg-zinc-200 rounded-lg appearance-none cursor-pointer dark:bg-zinc-700"
            />
            <span className="text-sm text-zinc-600 dark:text-zinc-400 w-16 text-right">
              {maxHeight}px
            </span>
          </div>
          <div className="flex items-center gap-4 flex-1 min-w-[200px]">
            <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300 whitespace-nowrap">
              Margin Bottom:
            </label>
            <input
              type="range"
              min="0"
              max="200"
              value={marginBottom}
              onChange={(e) => handleSliderChange('margin', Number(e.target.value))}
              onMouseUp={() => setTimeout(() => setIsEditing(false), 500)}
              onTouchEnd={() => setTimeout(() => setIsEditing(false), 500)}
              className="flex-1 h-2 bg-zinc-200 rounded-lg appearance-none cursor-pointer dark:bg-zinc-700"
            />
            <span className="text-sm text-zinc-600 dark:text-zinc-400 w-16 text-right">
              {marginBottom}px
            </span>
          </div>
        </div>

        {/* Preview Content */}
        <div className="relative bg-white overflow-y-auto flex-1">
        {/* Banner with Hero Text */}
        <Banner 
          imageSrc={bannerImage}
          maxHeight={maxHeight}
          marginBottom={marginBottom}
          className="w-full"
        >
          <section className="w-full px-4 py-10 sm:px-6 sm:py-16">
            <div className="mx-auto flex max-w-3xl flex-col items-center gap-6 text-center">
              <h2 className="text-3xl font-light text-primary sm:text-5xl">
                {heroMainHeading || 'Hero Main Heading'}
              </h2>
              <p className="text-base text-slate-600 sm:text-lg">
                {heroDescription || 'Hero description text goes here'}
              </p>
            </div>
          </section>
        </Banner>

        {/* Category Carousel */}
        <div className="mx-auto max-w-7xl px-3 sm:px-6 lg:px-8">
          <div className="mb-8 flex flex-col gap-2 text-center sm:mb-12 sm:text-left">
            <CategoryCarousel 
              categories={mockCategories}
              products={[]}
              selectedCategory={null}
            />
          </div>
        </div>

        {/* Ghost Product Cards Grid */}
        <div className="mx-auto max-w-7xl px-3 pb-16 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, index) => (
              <SkeletonProductCard key={index} />
            ))}
          </div>
        </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

