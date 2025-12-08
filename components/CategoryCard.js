'use client';

import { memo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useStorefront } from '@/lib/storefront-context';

function CategoryCard({ category, products }) {
  // Use the products provided (which should be the preview products from the database)
  // Only show actual products, up to 4
  const previewItems = products.slice(0, 4).filter((item) => item && item.image);
  
  // Show either 4 photos (2x2 grid) or just 1 photo (single)
  const showFourPhotos = previewItems.length === 4;
  const itemsToShow = showFourPhotos ? previewItems : previewItems.slice(0, 1);
  const storefront = useStorefront();
  const [isNavigating, setIsNavigating] = useState(false);

  const handleClick = () => {
    setIsNavigating(true);
    // Reset after a delay in case navigation is very fast
    setTimeout(() => setIsNavigating(false), 2000);
  };

  // Categories are now filters on the home page, not separate pages
  // Link to home page with category filter
  const categoryLink = storefront === 'LUNERA' 
    ? `/?category=${category.id}`
    : `/${storefront}?category=${category.id}`;

  return (
    <div className="relative">
      <Link
        href={categoryLink}
        onClick={handleClick}
        className="group flex flex-col overflow-hidden rounded-2xl border border-secondary/70 bg-white/90 shadow-sm transition hover:-translate-y-1 hover:shadow-xl sm:rounded-3xl"
        prefetch
        aria-label={`Explore ${category.label} collection`}
      >
      <div className={`grid ${showFourPhotos ? 'grid-cols-2 grid-rows-2' : 'grid-cols-1'} gap-1 p-2 sm:gap-1.5 sm:p-3`}>
        {itemsToShow.length > 0 ? (
          itemsToShow.map((item, index) => (
            <div
              key={`${category.id}-${item.id}-${index}`}
              className="overflow-hidden rounded-xl bg-secondary/80 sm:rounded-2xl aspect-square relative"
            >
              <Image
                src={item.image}
                alt={`${category.label} highlight ${index + 1}`}
                fill
                sizes="(max-width: 768px) 50vw, 25vw"
                className="object-cover transition duration-500 group-hover:scale-105"
              />
            </div>
          ))
        ) : (
          <div className="col-span-full aspect-square flex items-center justify-center rounded-xl bg-secondary/80 sm:rounded-2xl">
            <svg
              className="h-10 w-10 text-secondary sm:h-12 sm:w-12"
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
      <div className="flex flex-col gap-1.5 px-3 pb-4 sm:px-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-medium text-primary sm:text-lg">{category.label}</h3>
          <span className="text-xs font-medium uppercase tracking-[0.3em] text-primary">
            Shop
          </span>
        </div>
        <span className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary sm:text-sm">
          View collection
          <svg
            className="h-3 w-3 translate-y-[1px] transition group-hover:translate-x-1"
            viewBox="0 0 16 16"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M9.172 2.172a4 4 0 0 1 5.656 5.656l-5.657 5.657a4 4 0 1 1-5.656-5.657l.707-.707 1.414 1.414-.707.707a2 2 0 1 0 2.829 2.829l5.657-5.657a2 2 0 0 0-2.829-2.829l-.707.707-1.414-1.414.707-.707Z" />
          </svg>
        </span>
      </div>
      </Link>
      {/* Ghost skeleton overlay when navigating */}
      {isNavigating && (
        <div className="absolute inset-0 z-10 overflow-hidden rounded-2xl bg-white/50 backdrop-blur-sm sm:rounded-3xl">
          {/* Skeleton structure matching the card */}
          <div className="h-full w-full animate-pulse">
            {/* Image grid skeleton */}
            <div className={`grid ${showFourPhotos ? 'grid-cols-2 grid-rows-2' : 'grid-cols-1'} gap-1 p-2 sm:gap-1.5 sm:p-3`}>
              {itemsToShow.map((_, index) => (
                <div key={index} className="aspect-square rounded-xl bg-secondary/40 relative overflow-hidden sm:rounded-2xl">
                  <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/20 to-transparent"></div>
                </div>
              ))}
            </div>
            {/* Content skeleton */}
            <div className="flex flex-col gap-1.5 px-3 pb-4 sm:px-4">
              <div className="h-4 w-2/3 rounded bg-secondary/40"></div>
              <div className="h-3 w-full rounded bg-secondary/40"></div>
              <div className="h-3 w-3/4 rounded bg-secondary/40"></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default memo(CategoryCard);

