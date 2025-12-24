'use client';

import Image from 'next/image';

/**
 * PreviewProductCard - Shows a product card with mock data for preview
 * Used in SitePreview to demonstrate product card styling
 */
export default function PreviewProductCard({
  // Styling props
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
  // Card type and size props
  cardType = 'minimal',
  cardWidth = null,
  cardPadding = null,
  cardAspectRatio = '3:4',
}) {
  // Helper functions to get color and font from selections
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

  // Mock product data
  const mockProduct = {
    name: 'Example Product Name',
    price: 49.99,
  };

  // Get aspect ratio class
  const aspectRatioClass = {
    '3:4': 'aspect-[3/4]',
    '1:1': 'aspect-square',
    '4:3': 'aspect-[4/3]',
  }[cardAspectRatio] || 'aspect-[3/4]';

  // Get card type styles
  const getCardStyles = () => {
    const primaryColor = getColorFromSelection('primary');
    const secondaryColor = getColorFromSelection('secondary');
    
    switch (cardType) {
      case 'bordered':
        return {
          container: 'ring-2',
          containerStyle: { borderColor: `${primaryColor}80` },
          hover: 'hover:ring-4',
          shadow: 'shadow-md hover:shadow-2xl',
        };
      case 'overlay':
        return {
          container: 'ring-0',
          containerStyle: {},
          hover: '',
          shadow: 'shadow-lg hover:shadow-2xl',
        };
      case 'compact':
        return {
          container: 'ring-1',
          containerStyle: { borderColor: `${secondaryColor}40` },
          hover: '',
          shadow: 'shadow-sm hover:shadow-md',
        };
      default: // minimal
        return {
          container: 'ring-1',
          containerStyle: { borderColor: `${secondaryColor}70` },
          hover: 'hover:-translate-y-1',
          shadow: 'shadow-sm hover:shadow-xl',
        };
    }
  };

  const cardStyles = getCardStyles();
  const padding = cardPadding ? `${cardPadding}rem` : (cardType === 'compact' ? '0.5rem 0.75rem' : '0.75rem 1rem');
  const containerWidth = cardWidth ? { width: `${cardWidth}rem`, maxWidth: '100%' } : {};

  // Render overlay type
  if (cardType === 'overlay') {
    return (
      <div className="relative" style={containerWidth}>
        <div className={`group flex w-full flex-col overflow-hidden rounded-2xl bg-white/90 ${cardStyles.shadow} transition ${cardStyles.hover} sm:rounded-3xl`} style={cardStyles.containerStyle}>
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
              <div className="max-sm:min-h-[2.5rem] sm:min-h-0 mb-1">
                <h3 
                  className="font-medium uppercase tracking-[0.25em] text-white max-sm:line-clamp-2"
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

  // Standard card layout
  return (
    <div className="relative" style={containerWidth}>
      <div className={`group flex w-full flex-col overflow-hidden rounded-2xl bg-white/90 ${cardStyles.container} ${cardStyles.shadow} transition ${cardStyles.hover} sm:rounded-3xl`} style={cardStyles.containerStyle}>
        {/* Image placeholder */}
        <div className={`${aspectRatioClass} w-full overflow-hidden bg-secondary/70 relative`}>
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
        </div>
        {/* Content */}
        <div 
          className={`flex flex-1 flex-col ${cardType === 'compact' ? 'gap-1.5' : 'gap-3'}`}
          style={{ padding }}
        >
          <div className="max-sm:min-h-[2.5rem] sm:min-h-0">
            <h3 
              className="font-medium uppercase tracking-[0.25em] max-sm:line-clamp-2"
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
              className={cardType === 'compact' ? 'mt-0' : 'mt-0.5'}
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

