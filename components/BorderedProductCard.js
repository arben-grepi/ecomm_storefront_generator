'use client';

import { memo, useState, useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { getMarket } from '@/lib/get-market';
import { useStorefront } from '@/lib/storefront-context';
import { isEUMarket } from '@/lib/market-utils';

function BorderedProductCard({ 
  product, 
  categorySlug,
  colorPalette,
  nameColor = 'primary',
  nameFont = 'primary',
  nameFontSize = 0.65,
  priceColor = 'primary',
  priceFont = 'primary',
  priceFontSize = 1,
  vatText = 'Includes VAT',
  vatColor = 'secondary',
  vatFont = 'primary',
  vatFontSize = 0.75,
  fontPalette,
  cardAspectRatio = '3:4',
  cardBorderRadius = 'medium',
}) {
  // Border radius mapping
  const getBorderRadiusClass = (radius) => {
    switch (radius) {
      case 'none': return 'rounded-none';
      case 'small': return 'rounded-lg sm:rounded-xl';
      case 'medium': return 'rounded-2xl sm:rounded-3xl';
      case 'large': return 'rounded-3xl sm:rounded-[2rem]';
      default: return 'rounded-2xl sm:rounded-3xl';
    }
  };
  
  const borderRadiusClass = getBorderRadiusClass(cardBorderRadius);
  const market = useMemo(() => getMarket(), []);
  const isEU = isEUMarket(market);
  const storefront = useStorefront();
  const [isNavigating, setIsNavigating] = useState(false);

  const getColorFromSelection = (colorSelection) => {
    if (!colorPalette) return '#ec4899';
    switch (colorSelection) {
      case 'primary': return colorPalette.colorPrimary || '#ec4899';
      case 'secondary': return colorPalette.colorSecondary || '#64748b';
      case 'tertiary': return colorPalette.colorTertiary || '#94a3b8';
      default: return colorPalette.colorPrimary || '#ec4899';
    }
  };

  const getFontFromSelection = (fontSelection) => {
    if (!fontPalette) return 'inherit';
    switch (fontSelection) {
      case 'primary': return fontPalette.fontPrimary || 'inherit';
      case 'secondary': return fontPalette.fontSecondary || 'inherit';
      case 'tertiary': return fontPalette.fontTertiary || 'inherit';
      default: return 'inherit';
    }
  };

  const handleClick = () => {
    setIsNavigating(true);
    setTimeout(() => setIsNavigating(false), 2000);
  };

  const basePath = storefront === 'LUNERA' 
    ? `/${product.slug}`
    : `/${storefront}/${product.slug}`;
  
  const productPath = colorPalette
    ? `${basePath}?colorPrimary=${encodeURIComponent(colorPalette.colorPrimary || '')}&colorSecondary=${encodeURIComponent(colorPalette.colorSecondary || '')}&colorTertiary=${encodeURIComponent(colorPalette.colorTertiary || '')}`
    : basePath;

  const aspectRatioClass = {
    '3:4': 'aspect-[3/4]',
    '1:1': 'aspect-square',
  }[cardAspectRatio] || 'aspect-[3/4]';

  const primaryColor = getColorFromSelection('primary');

  return (
    <div className="relative">
      <Link
        href={productPath}
        onClick={handleClick}
        className={`group flex w-full flex-col overflow-hidden ${borderRadiusClass} bg-white/90 ring-2 shadow-md transition hover:ring-4 hover:shadow-2xl`}
        style={{ '--tw-ring-color': primaryColor }}
        prefetch
      >
        <div className={`${aspectRatioClass} w-full overflow-hidden bg-secondary/70 relative`}>
          {product.image ? (
            <Image
              src={product.image}
              alt={product.name}
              fill
              sizes="(max-width: 768px) 50vw, 33vw"
              className="object-cover transition-transform duration-500 group-hover:scale-105"
              loading="eager"
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
            <h3 
              className="font-medium uppercase tracking-[0.25em]"
              style={{
                color: getColorFromSelection(nameColor),
                fontFamily: getFontFromSelection(nameFont),
                fontSize: `clamp(0.5rem, ${nameFontSize}rem, 1.5rem)`,
              }}
            >
              {product.name}
            </h3>
          </div>
          <div className="mt-auto">
            <p 
                className="font-semibold"
                style={{
                  color: getColorFromSelection(priceColor),
                  fontFamily: getFontFromSelection(priceFont),
                  fontSize: `clamp(0.875rem, ${priceFontSize}rem, 2rem)`,
                }}
            >
              €{product.price.toFixed(2)}
            </p>
            {isEU && (
              <p 
                className="mt-0.5"
                style={{
                  color: getColorFromSelection(vatColor),
                  fontFamily: getFontFromSelection(vatFont),
                  fontSize: `clamp(0.5rem, ${vatFontSize}rem, 1.5rem)`,
                }}
              >
                {vatText}
              </p>
            )}
          </div>
        </div>
      </Link>
      {isNavigating && (
        <div className={`absolute inset-0 z-10 overflow-hidden ${borderRadiusClass} bg-white/50 backdrop-blur-sm`}>
          <div className="h-full w-full animate-pulse">
            <div className={`${aspectRatioClass} w-full bg-secondary/40 relative overflow-hidden`}>
              <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/20 to-transparent"></div>
            </div>
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

export default memo(BorderedProductCard);

