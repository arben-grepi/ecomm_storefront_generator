'use client';

import Image from 'next/image';

export default function OverlayPreviewProductCard({
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

  const mockProduct = {
    name: 'Example Product Name',
    price: 49.99,
  };

  const aspectRatioClass = {
    '3:4': 'aspect-[3/4]',
    '1:1': 'aspect-square',
  }[cardAspectRatio] || 'aspect-[3/4]';

  return (
    <div className="relative">
      <div className={`group flex w-full flex-col overflow-hidden ${borderRadiusClass} bg-white/90 shadow-lg transition hover:shadow-2xl`}>
        <div className={`${aspectRatioClass} w-full overflow-hidden bg-secondary/70 relative`}>
          <Image
            src="/Blerinas/Blerinas-logo-transparent2.png"
            alt={mockProduct.name}
            fill
            sizes="(max-width: 768px) 50vw, 33vw"
            className="object-cover transition-transform duration-500 group-hover:scale-105"
            priority
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
          <div className="absolute bottom-0 left-0 right-0 p-3 sm:p-4">
            <div className="min-h-[2.5rem] mb-1">
              <h3 
                className="font-medium uppercase tracking-[0.25em] text-white line-clamp-2"
                style={{
                  fontFamily: getFontFromSelection(nameFont),
                  fontSize: `clamp(0.5rem, ${nameFontSize}rem, 1.5rem)`,
                }}
              >
                {mockProduct.name}
              </h3>
            </div>
            <div className="flex items-baseline gap-2">
              <p 
                className="font-semibold text-white"
                style={{
                  fontFamily: getFontFromSelection(priceFont),
                  fontSize: `clamp(0.875rem, ${priceFontSize}rem, 2rem)`,
                }}
              >
                €{mockProduct.price.toFixed(2)}
              </p>
              <p 
                className="text-white/80"
                style={{
                  fontFamily: getFontFromSelection(vatFont),
                  fontSize: `clamp(0.5rem, ${vatFontSize}rem, 1.5rem)`,
                }}
              >
                {vatText}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

