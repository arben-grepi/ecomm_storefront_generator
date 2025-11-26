'use client';

import { memo, useState, useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { getMarket } from '@/lib/get-market';
import { useStorefront } from '@/lib/storefront-context';

const categoryLabels = {
  lingerie: 'Lingerie',
  underwear: 'Underwear',
  sports: 'Activewear',
  clothes: 'Clothing',
  dresses: 'Dresses',
};

function ProductCard({ product, categorySlug }) {
  const categoryLabel = categoryLabels[product.category] ?? 'Collection';
  // Cache market value to avoid parsing cookies on every render
  const market = useMemo(() => getMarket(), []);
  const isEUMarket = market === 'FI' || market === 'DE';
  const storefront = useStorefront();
  const [isNavigating, setIsNavigating] = useState(false);

  const handleClick = () => {
    setIsNavigating(true);
    // Reset after a delay in case navigation is very fast
    setTimeout(() => setIsNavigating(false), 2000);
  };

  return (
    <div className="relative">
      <Link
        href={`/${storefront}/${categorySlug}/${product.slug}`}
        onClick={handleClick}
        className="group flex w-full flex-col overflow-hidden rounded-2xl bg-white/90 shadow-sm ring-1 ring-secondary/70 transition hover:-translate-y-1 hover:shadow-xl sm:rounded-3xl"
        prefetch
      >
      <div className="aspect-[3/4] w-full overflow-hidden bg-secondary/70 sm:aspect-[3/4] relative">
        {product.image ? (
          <Image
            src={product.image}
            alt={product.name}
            fill
            sizes="(max-width: 768px) 50vw, 33vw"
            className="object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-secondary">
            <svg className="h-10 w-10" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M3 8a2 2 0 012-2h14a2 2 0 012 2v9a2 2 0 01-2 2h-5l-2 3-2-3H5a2 2 0 01-2-2V8z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9 10h.01M15 10h.01M9.5 15a3.5 3.5 0 005 0"
              />
            </svg>
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-3 p-3 sm:p-5">
        <div>
          <p className="text-[0.65rem] font-medium uppercase tracking-[0.25em] text-primary sm:text-xs">
            {categoryLabel}
          </p>
          <h3 className="mt-2 text-sm font-medium text-slate-800 sm:text-base">
            {product.name}
          </h3>
        </div>
        <div className="mt-auto">
          <p className="text-base font-semibold text-primary sm:text-lg">
            €{product.price.toFixed(2)}
          </p>
          {isEUMarket && (
            <p className="text-xs text-slate-500 mt-0.5">
              Includes VAT
            </p>
          )}
        </div>
      </div>
      </Link>
      {/* Ghost skeleton overlay when navigating */}
      {isNavigating && (
        <div className="absolute inset-0 z-10 overflow-hidden rounded-2xl bg-white/50 backdrop-blur-sm sm:rounded-3xl">
          {/* Skeleton structure matching the card */}
          <div className="h-full w-full animate-pulse">
            {/* Image skeleton */}
            <div className="aspect-[3/4] w-full bg-secondary/40 relative overflow-hidden">
              <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/20 to-transparent"></div>
            </div>
            {/* Content skeleton */}
            <div className="flex flex-1 flex-col gap-3 p-3 sm:p-5">
              <div className="space-y-2">
                <div className="h-3 w-1/4 rounded bg-secondary/40"></div>
                <div className="h-4 w-3/4 rounded bg-secondary/40"></div>
              </div>
              <div className="mt-auto">
                <div className="h-5 w-1/3 rounded bg-secondary/40"></div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default memo(ProductCard);
