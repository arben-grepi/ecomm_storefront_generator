'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Banner from '@/components/Banner';
import CategoryCarousel from '@/components/CategoryCarousel';
import PreviewProductCardWrapper from '@/components/admin/PreviewProductCardWrapper';
import { getTextColorProps } from '@/lib/text-color-utils';
import { preventOrphanedWords } from '@/lib/text-wrap-utils';
import { getStorefrontBanner } from '@/lib/storefront-logos';

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
  const [showTextWidthBorder, setShowTextWidthBorder] = useState(false);

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

  return (
    <div className="relative bg-white overflow-y-auto" style={{ height: '100vh', width: '100vw' }}>
      {/* Mock Header - Non-clickable */}
      <header className="sticky top-0 z-50 border-b border-secondary/70 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 sm:justify-between sm:gap-4 sm:px-6 lg:px-8">
          {/* Logo and Company Tagline */}
          <div className="flex flex-col sm:flex-col">
            <div className="flex items-center">
              <Image
                src="/Blerinas/Blerinas-logo-transparent2.png"
                alt="Blerinas"
                width={300}
                height={100}
                className="h-12 w-auto sm:h-16"
                priority
              />
            </div>
            {companyTagline && (() => {
              const wrappedText = preventOrphanedWords(companyTagline);
              return (
                <span 
                  className="rounded-full px-4 py-1 font-medium uppercase tracking-[0.3em]"
                  style={{ 
                    color: getColorFromSelection(companyTaglineColor || 'primary'),
                    fontFamily: getFontFromSelection(companyTaglineFont || 'primary'),
                    fontSize: `clamp(0.5rem, ${companyTaglineFontSize || 0.75}rem, 1.5rem)`,
                  }}
                  dangerouslySetInnerHTML={{ __html: wrappedText }}
                />
              );
            })()}
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
                      fontSize: `clamp(1.5rem, ${heroMainHeadingFontSize || 4}rem, 6rem)`,
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
                      fontSize: `clamp(0.875rem, ${heroDescriptionFontSize || 1}rem, 2rem)`,
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
                  fontSize: `clamp(0.875rem, ${fontSize}rem, 2rem)`,
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
      {footerText && (() => {
        const wrappedText = preventOrphanedWords(footerText);
        return (
          <footer className="border-t border-secondary/70 bg-white">
            <div 
              className="mx-auto max-w-7xl px-4 py-10 text-center sm:px-6 lg:px-8"
              style={{
                color: getColorFromSelection(footerTextColor || 'tertiary'),
                fontFamily: getFontFromSelection(footerTextFont || 'primary'),
                fontSize: `clamp(0.5rem, ${footerTextFontSize || 0.875}rem, 1.5rem)`,
              }}
              dangerouslySetInnerHTML={{ __html: wrappedText }} 
            />
          </footer>
        );
      })()}
    </div>
  );
}

