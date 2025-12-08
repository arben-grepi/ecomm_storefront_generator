'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Banner from '@/components/Banner';
import CategoryCarousel from '@/components/CategoryCarousel';
import SkeletonProductCard from '@/components/SkeletonProductCard';
import { getTextColorProps } from '@/lib/text-color-utils';
import { preventOrphanedWords } from '@/lib/text-wrap-utils';

/**
 * SitePreview - Full-screen preview of the homepage
 * Shows banner with hero text, category carousel, and ghost product cards
 * Used for live preview while editing site content
 */
export default function SitePreview({ 
  // Content
  companyTagline,
  heroMainHeading,
  heroDescription,
  heroBannerImage,
  allCategoriesTagline,
  footerText,
  // Banner settings
  maxHeight,
  marginBottom,
  textWidth,
  highlightTextWidth,
  // Hero text styling
  heroMainHeadingFontFamily,
  heroMainHeadingFontStyle,
  heroMainHeadingFontWeight,
  heroMainHeadingFontSize,
  // Colors
  colorPalette,
  heroDescriptionColor,
  categoryDescriptionColor,
  footerTextColor,
}) {
  // Mock categories for preview
  const mockCategories = [
    { id: '2', label: 'Category 1', slug: 'category-1', active: true },
    { id: '3', label: 'Category 2', slug: 'category-2', active: true },
  ];

  const heroDescColorProps = getTextColorProps(heroDescriptionColor || 'secondary', colorPalette);
  const categoryDescColorProps = getTextColorProps(categoryDescriptionColor || 'secondary', colorPalette);
  const footerColorProps = getTextColorProps(footerTextColor || 'tertiary', colorPalette);

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
                  className="rounded-full px-4 py-1 text-xs font-medium uppercase tracking-[0.3em]"
                  style={{ color: primaryColor }}
                  dangerouslySetInnerHTML={{ __html: wrappedText }}
                />
              );
            })()}
          </div>
        </div>
      </header>

      {/* Banner with Hero Text */}
      {heroBannerImage ? (
        <Banner 
          imageSrc={heroBannerImage}
          maxHeight={maxHeight || 550}
          marginBottom={marginBottom || 40}
          className="w-full"
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
                      color: colorPalette?.colorPrimary || '#ec4899',
                      fontFamily: heroMainHeadingFontFamily || 'inherit',
                      fontStyle: heroMainHeadingFontStyle || 'normal',
                      fontWeight: heroMainHeadingFontWeight || '300',
                      fontSize: `clamp(1.5rem, ${heroMainHeadingFontSize || 4}vw, 6rem)`,
                    }}
                    dangerouslySetInnerHTML={{ __html: wrappedText }}
                  />
                );
              })()}
              {heroDescription && (() => {
                const wrappedText = preventOrphanedWords(heroDescription);
                return (
                  <p className={`text-base sm:text-lg ${heroDescColorProps.className}`} style={heroDescColorProps.style} dangerouslySetInnerHTML={{ __html: wrappedText }} />
                );
              })()}
            </div>
          </section>
        </Banner>
      ) : (
        // Hero section without banner
        (heroMainHeading || heroDescription) && (
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
                      color: colorPalette?.colorPrimary || '#ec4899',
                      fontFamily: heroMainHeadingFontFamily || 'inherit',
                      fontStyle: heroMainHeadingFontStyle || 'normal',
                      fontWeight: heroMainHeadingFontWeight || '300',
                      fontSize: `clamp(1.5rem, ${heroMainHeadingFontSize || 4}vw, 6rem)`,
                    }}
                    dangerouslySetInnerHTML={{ __html: wrappedText }}
                  />
                );
              })()}
              {heroDescription && (() => {
                const wrappedText = preventOrphanedWords(heroDescription);
                return (
                  <p className={`text-base sm:text-lg ${heroDescColorProps.className}`} style={heroDescColorProps.style} dangerouslySetInnerHTML={{ __html: wrappedText }} />
                );
              })()}
            </div>
          </section>
        )
      )}

      {/* Category Carousel */}
      <div className="mx-auto max-w-7xl px-3 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-col gap-2 text-center sm:mb-12 sm:text-left">
          <CategoryCarousel 
            categories={mockCategories}
            products={[]}
            selectedCategory={null}
          />
          {allCategoriesTagline && (() => {
            const wrappedText = preventOrphanedWords(allCategoriesTagline);
            return (
              <p className={`text-sm sm:text-base mt-2 ${categoryDescColorProps.className}`} style={categoryDescColorProps.style} dangerouslySetInnerHTML={{ __html: wrappedText }} />
            );
          })()}
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

      {/* Footer */}
      {footerText && (() => {
        const wrappedText = preventOrphanedWords(footerText);
        return (
          <footer className="border-t border-secondary/70 bg-white">
            <div className={`mx-auto max-w-7xl px-4 py-10 text-center text-sm sm:px-6 lg:px-8 ${footerColorProps.className}`} style={footerColorProps.style} dangerouslySetInnerHTML={{ __html: wrappedText }} />
          </footer>
        );
      })()}
    </div>
  );
}

