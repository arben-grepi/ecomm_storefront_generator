'use client';

import Image from 'next/image';

export default function BorderedPreviewProductCard({
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

  const primaryColor = getColorFromSelection('primary');

  return (
    <div className="relative">
      <div 
        className={`group flex w-full flex-col overflow-hidden ${borderRadiusClass} bg-white/90 ring-2 shadow-md transition hover:ring-4 hover:shadow-2xl`} 
        style={{ '--tw-ring-color': primaryColor }}
      >
        <div className={`${aspectRatioClass} w-full overflow-hidden bg-secondary/70 relative`}>
          <Image
            src="/Blerinas/Blerinas-logo-transparent2.png"
            alt={mockProduct.name}
            fill
            sizes="(max-width: 768px) 50vw, 33vw"
            className="object-cover transition-transform duration-500 group-hover:scale-105"
            priority
          />
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
              {mockProduct.name}
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
              €{mockProduct.price.toFixed(2)}
            </p>
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
          </div>
        </div>
      </div>
    </div>
  );
}

