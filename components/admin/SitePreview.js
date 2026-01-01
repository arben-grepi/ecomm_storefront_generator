'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Banner from '@/components/Banner';
import CategoryCarousel from '@/components/CategoryCarousel';
import PreviewProductCardWrapper from '@/components/admin/PreviewProductCardWrapper';
import { getTextColorProps } from '@/lib/text-color-utils';
import { preventOrphanedWords } from '@/lib/text-wrap-utils';
import { getStorefrontBanner, getStorefrontLogo } from '@/lib/storefront-logos';
import InstagramLogo from '@/components/InstagramLogo';

/**
 * SitePreview - Full-screen preview of the homepage
 * Shows banner with hero text, category carousel, and ghost product cards
 * Used for live preview while editing site content
 */
export default function SitePreview({ 
  // Content
  companyTagline,
  companyTaglineColor,
  companyTaglineFont,
  companyTaglineFontSize,
  heroMainHeading,
  heroMainHeadingColor,
  heroMainHeadingFont,
  heroMainHeadingFontSize,
  heroDescription,
  heroDescriptionColor,
  heroDescriptionFont,
  heroDescriptionFontSize,
  storefront = 'LUNERA',
  categoryCarouselColor,
  categoryCarouselFont,
  categoryCarouselFontSize,
  allCategoriesTagline,
  allCategoriesTaglineColor,
  allCategoriesTaglineFont,
  allCategoriesTaglineFontSize,
  footerText,
  footerTextColor,
  footerTextFont,
  footerTextFontSize,
  // Product Card styling
  productCardType,
  productCardAspectRatio,
  productCardColumnsPhone,
  productCardColumnsTablet,
  productCardColumnsLaptop,
  productCardColumnsDesktop,
  productCardGap,
  productCardBorderRadius,
  productCardNameColor,
  productCardNameFont,
  productCardNameFontSize,
  productCardPriceColor,
  productCardPriceFont,
  productCardPriceFontSize,
  productCardVatText,
  productCardVatColor,
  productCardVatFont,
  productCardVatFontSize,
  // Banner settings
  textWidth,
  highlightTextWidth,
  bannerCropTop = 0,
  bannerCropBottom = 0,
  // Color and Font palettes
  colorPalette,
  fontPalette,
}) {
  // Mock categories for preview
  const mockCategories = [
    { id: '2', label: 'Category 1', slug: 'category-1', active: true },
    { id: '3', label: 'Category 2', slug: 'category-2', active: true },
  ];

  // Helper functions to get color and font from selections
  const getColorFromSelection = (colorSelection) => {
    switch (colorSelection) {
      case 'primary': return colorPalette?.colorPrimary || '#ec4899';
      case 'secondary': return colorPalette?.colorSecondary || '#64748b';
      case 'tertiary': return colorPalette?.colorTertiary || '#94a3b8';
      default: return '#ec4899';
    }
  };

  const getFontFromSelection = (fontSelection) => {
    switch (fontSelection) {
      case 'primary': return fontPalette?.fontPrimary || 'inherit';
      case 'secondary': return fontPalette?.fontSecondary || 'inherit';
      case 'tertiary': return fontPalette?.fontTertiary || 'inherit';
      default: return 'inherit';
    }
  };

  const primaryColor = colorPalette?.colorPrimary || '#ec4899';
  const secondaryColor = colorPalette?.colorSecondary || '#64748b';
  const [showTextWidthBorder, setShowTextWidthBorder] = useState(false);
  const [hasMounted, setHasMounted] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  // Handle hydration
  useEffect(() => {
    setHasMounted(true);
  }, []);

  // Handle text width highlight
  useEffect(() => {
    if (highlightTextWidth) {
      setShowTextWidthBorder(true);
      const timer = setTimeout(() => {
        setShowTextWidthBorder(false);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [highlightTextWidth]);

  // Mock cart item count for preview
  const mockCartCount = 2;

  return (
    <div className="relative bg-white overflow-y-auto" style={{ height: '100vh', width: '100vw' }}>
      {/* Mock Header - Non-clickable */}
      <header className="sticky top-0 z-50 border-b border-secondary/70 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 sm:justify-between sm:gap-4 sm:px-6 lg:px-8">
          {/* Logo and Company Tagline */}
          <div className="flex flex-col sm:flex-col">
            <div className="flex items-center">
              <Image
                src={getStorefrontLogo(storefront, { colorPrimary: primaryColor, colorSecondary: secondaryColor, colorTertiary: colorPalette?.colorTertiary })}
                alt={storefront}
                width={300}
                height={100}
                className="h-12 w-auto sm:h-16 object-contain flex-shrink-0"
                style={{ objectFit: 'contain' }}
                priority
              />
            </div>
            {companyTagline && (() => {
              const wrappedText = preventOrphanedWords(companyTagline);
              return (
                <span 
                  className="rounded-full px-4 py-1 font-medium uppercase tracking-[0.3em] whitespace-nowrap overflow-hidden text-ellipsis max-w-[200px] sm:max-w-none max-sm:!text-[0.6rem]"
                  style={{ 
                    color: getColorFromSelection(companyTaglineColor || 'primary'),
                    fontFamily: getFontFromSelection(companyTaglineFont || 'primary'),
                    fontSize: `clamp(0.4rem, ${companyTaglineFontSize || 0.75}rem, 1.5rem)`,
                  }}
                  dangerouslySetInnerHTML={{ __html: wrappedText }}
                />
              );
            })()}
          </div>
          {/* Spacer for mobile to push buttons to right */}
          <div className="flex-1 sm:hidden" />
          <div className="flex w-full items-center justify-end gap-3 sm:w-auto sm:gap-4">
            {/* Cart icon - Mock for preview */}
            {hasMounted && mockCartCount > 0 && (
              <div
                className="relative ml-2 flex items-center justify-center rounded-full border bg-white/80 p-2.5 shadow-sm transition-colors hover:bg-secondary cursor-not-allowed opacity-75"
                style={{ 
                  borderColor: `${secondaryColor}4D`,
                  color: secondaryColor,
                }}
                aria-label="Shopping cart (Preview)"
              >
                <svg
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth="2"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007zM8.625 10.5a.375.375 0 11-.75 0 .375.375 0 01.75 0zm7.5 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"
                  />
                </svg>
                <span 
                  className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full text-xs font-semibold text-white" 
                  style={{ backgroundColor: primaryColor }}
                  suppressHydrationWarning
                >
                  {mockCartCount > 9 ? '9+' : mockCartCount}
                </span>
              </div>
            )}
            {/* Settings Menu Button - Mock for preview */}
            <div className="ml-2">
              <button
                onClick={() => setIsMenuOpen(!isMenuOpen)}
                className="flex items-center justify-center w-10 h-10 rounded-full hover:bg-secondary/20 transition-colors"
                aria-label="Settings (Preview)"
                style={{ color: secondaryColor }}
              >
                <svg
                  className="w-6 h-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  style={{ color: secondaryColor }}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 6h16M4 12h16M4 18h16"
                  />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Banner with Hero Text */}
      <Banner 
        imageSrc={getStorefrontBanner(storefront)}
        className="w-full mb-8 sm:mb-12"
        cropTop={bannerCropTop}
        cropBottom={bannerCropBottom}
      >
          <section 
            className="px-4 py-10 sm:px-6 sm:py-16 transition-all duration-300"
            style={{ 
              maxWidth: `${textWidth ?? 75}%`,
              margin: '0 auto',
              width: '100%',
              border: showTextWidthBorder ? `3px solid ${primaryColor}` : '3px solid transparent',
              borderRadius: showTextWidthBorder ? '8px' : '0px',
              padding: showTextWidthBorder ? 'calc(1rem + 8px) calc(1rem + 8px)' : undefined,
            }}
          >
            <div className="mx-auto flex flex-col items-center gap-6 text-center">
              {heroMainHeading && (() => {
                const wrappedText = preventOrphanedWords(heroMainHeading);
                return (
                  <h2 
                    style={{ 
                      color: getColorFromSelection(heroMainHeadingColor || 'primary'),
                      fontFamily: getFontFromSelection(heroMainHeadingFont || 'primary'),
                      fontSize: `clamp(1.25rem, ${heroMainHeadingFontSize || 4}rem, 6rem)`,
                    }}
                    dangerouslySetInnerHTML={{ __html: wrappedText }}
                  />
                );
              })()}
              {heroDescription && (() => {
                const wrappedText = preventOrphanedWords(heroDescription);
                return (
                  <p 
                    style={{
                      color: getColorFromSelection(heroDescriptionColor || 'secondary'),
                      fontFamily: getFontFromSelection(heroDescriptionFont || 'primary'),
                      fontSize: `clamp(0.75rem, ${heroDescriptionFontSize || 1}rem, 2rem)`,
                    }}
                    dangerouslySetInnerHTML={{ __html: wrappedText }} 
                  />
                );
              })()}
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
            color={categoryCarouselColor || 'primary'}
            colorPalette={colorPalette}
            primaryColor={colorPalette?.colorPrimary || '#ec4899'}
            font={categoryCarouselFont || 'primary'}
            fontPalette={fontPalette}
            fontSize={categoryCarouselFontSize || 0.875}
          />
          {allCategoriesTagline && (() => {
            const wrappedText = preventOrphanedWords(allCategoriesTagline);
            const fontSize = allCategoriesTaglineFontSize != null ? parseFloat(allCategoriesTaglineFontSize) || 1 : 1;
            return (
              <p 
                className="mt-2"
                style={{
                  color: getColorFromSelection(allCategoriesTaglineColor || 'secondary'),
                  fontFamily: getFontFromSelection(allCategoriesTaglineFont || 'primary'),
                  fontSize: `clamp(0.75rem, ${fontSize}rem, 1rem)`,
                }}
                dangerouslySetInnerHTML={{ __html: wrappedText }} 
              />
            );
          })()}
        </div>
      </div>

      {/* Preview Product Cards Grid */}
      <div className="mx-auto max-w-7xl px-3 pb-16 sm:px-6 lg:px-8">
        {(() => {
          const cardGap = productCardGap != null ? parseFloat(productCardGap) : 1;
          const columnsPhone = productCardColumnsPhone != null ? parseInt(productCardColumnsPhone) : 2;
          const columnsTablet = productCardColumnsTablet != null ? parseInt(productCardColumnsTablet) : 3;
          const columnsLaptop = productCardColumnsLaptop != null ? parseInt(productCardColumnsLaptop) : 4;
          const columnsDesktop = productCardColumnsDesktop != null ? parseInt(productCardColumnsDesktop) : 5;
          
          // Calculate card width: (100% - gap * (columns - 1)) / columns
          const calcWidth = (cols, gap) => {
            if (cols === 0) return '100%';
            const gapTotal = gap * (cols - 1);
            return `calc((100% - ${gapTotal}rem) / ${cols})`;
          };
          
          return (
            <>
              <style dangerouslySetInnerHTML={{__html: `
                .preview-card-responsive {
                  width: ${calcWidth(columnsPhone, cardGap)};
                }
                @media (min-width: 640px) {
                  .preview-card-responsive {
                    width: ${calcWidth(columnsTablet, cardGap)};
                  }
                }
                @media (min-width: 1024px) {
                  .preview-card-responsive {
                    width: ${calcWidth(columnsLaptop, cardGap)};
                  }
                }
                @media (min-width: 1536px) {
                  .preview-card-responsive {
                    width: ${calcWidth(columnsDesktop, cardGap)};
                  }
                }
              `}} />
              <div 
                className="flex flex-wrap"
                style={{ 
                  gap: `${cardGap}rem`,
                }}
              >
                {Array.from({ length: 8 }).map((_, index) => (
                  <div key={index} className="preview-card-responsive">
                    <PreviewProductCardWrapper
                      colorPalette={colorPalette}
                      fontPalette={fontPalette}
                      cardType={productCardType || 'minimal'}
                      cardAspectRatio={productCardAspectRatio || '3:4'}
                      cardBorderRadius={productCardBorderRadius || 'medium'}
                      nameColor={productCardNameColor || 'primary'}
                      nameFont={productCardNameFont || 'primary'}
                      nameFontSize={productCardNameFontSize != null ? parseFloat(productCardNameFontSize) || 0.65 : 0.65}
                      priceColor={productCardPriceColor || 'primary'}
                      priceFont={productCardPriceFont || 'primary'}
                      priceFontSize={productCardPriceFontSize != null ? parseFloat(productCardPriceFontSize) || 1 : 1}
                      vatText={productCardVatText || 'Includes VAT'}
                      vatColor={productCardVatColor || 'secondary'}
                      vatFont={productCardVatFont || 'primary'}
                      vatFontSize={productCardVatFontSize != null ? parseFloat(productCardVatFontSize) || 0.75 : 0.75}
                    />
                  </div>
                ))}
              </div>
            </>
          );
        })()}
      </div>

      {/* Footer */}
      <footer className="border-t border-secondary/70 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          {footerText && (() => {
            const wrappedText = preventOrphanedWords(footerText);
            return (
              <div 
                className="text-center mb-6 max-sm:!text-[0.7rem]"
                style={{
                  color: getColorFromSelection(footerTextColor || 'tertiary'),
                  fontFamily: getFontFromSelection(footerTextFont || 'primary'),
                  fontSize: `clamp(0.4rem, ${footerTextFontSize || 0.875}rem, 1.5rem)`,
                }}
                dangerouslySetInnerHTML={{ __html: wrappedText }} 
              />
            );
          })()}
          {/* Social Links - Horizontal Layout */}
          <div className="flex flex-row items-center justify-center gap-6 flex-wrap">
            <a
              href="https://www.instagram.com/lunerashop.co?igsh=MTd3d3pxdWZ6MWpsbw%3D%3D"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 transition-opacity hover:opacity-80"
              style={{ color: getColorFromSelection(footerTextColor || 'tertiary') }}
            >
              <InstagramLogo size="w-6 h-6" bgColor={primaryColor} />
            </a>
            <a
              href="mailto:lunera.shop@outlook.com"
              className="flex items-center gap-2 transition-opacity hover:opacity-80 text-sm"
              style={{ color: getColorFromSelection(footerTextColor || 'tertiary') }}
            >
              <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              <span>lunera.shop@outlook.com</span>
            </a>
          </div>
        </div>
      </footer>

      {/* Mock Settings Menu Overlay - Preview Only */}
      {hasMounted && isMenuOpen && (
        <>
          {/* Blurred backdrop */}
          <div 
            className="fixed inset-0 bg-black/30 backdrop-blur-md z-[999]"
            onClick={() => setIsMenuOpen(false)}
          />
          
          {/* Menu Panel */}
          <nav 
            className="fixed top-0 right-0 h-full w-80 max-w-[85vw] bg-white shadow-2xl z-[1000] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-col h-full">
              {/* Header */}
              <div className="flex items-center justify-between p-6 border-b" style={{ borderColor: `${secondaryColor}30` }}>
                <h2 className="text-xl font-semibold" style={{ color: primaryColor }}>Menu</h2>
                <button
                  onClick={() => setIsMenuOpen(false)}
                  className="p-2 rounded-full hover:bg-secondary/20 transition-colors"
                  style={{ color: secondaryColor }}
                  aria-label="Close menu"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Navigation Content */}
              <div className="flex-1 overflow-y-auto py-6">
                {/* Navigation Links */}
                <div className="space-y-2 px-4">
                  <div
                    className="block px-4 py-3 rounded-lg transition-all text-sm border-2 border-transparent cursor-not-allowed opacity-50"
                    style={{ color: secondaryColor }}
                  >
                    Home
                  </div>
                  <div
                    className="block px-4 py-3 rounded-lg transition-all text-sm border-2 border-transparent cursor-not-allowed opacity-50"
                    style={{ color: secondaryColor }}
                  >
                    About Us
                  </div>
                  <div
                    className="block px-4 py-3 rounded-lg transition-all text-sm border-2 border-transparent cursor-not-allowed opacity-50"
                    style={{ color: secondaryColor }}
                  >
                    Privacy Policy
                  </div>
                </div>
              </div>
            </div>
          </nav>
        </>
      )}
    </div>
  );
}

