'use client';

import Image from 'next/image';
import Banner from '@/components/Banner';
import CategoryCarousel from '@/components/CategoryCarousel';
import SkeletonProductCard from '@/components/SkeletonProductCard';
import { getTextColorProps } from '@/lib/text-color-utils';

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

  return (
    <div className="relative bg-white overflow-y-auto h-full w-full">
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
            {companyTagline && (
              <span 
                className="rounded-full px-4 py-1 text-xs font-medium uppercase tracking-[0.3em]"
                style={{ color: primaryColor }}
              >
                {companyTagline}
              </span>
            )}
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
          <section className="w-full px-4 py-10 sm:px-6 sm:py-16">
            <div className="mx-auto flex max-w-3xl flex-col items-center gap-6 text-center">
              {heroMainHeading && (
                <h2 
                  className="text-3xl font-light sm:text-5xl"
                  style={{ color: colorPalette?.colorPrimary || '#ec4899' }}
                >
                  {heroMainHeading}
                </h2>
              )}
              {heroDescription && (
                <p className={`text-base sm:text-lg ${heroDescColorProps.className}`} style={heroDescColorProps.style}>
                  {heroDescription}
                </p>
              )}
            </div>
          </section>
        </Banner>
      ) : (
        // Hero section without banner
        (heroMainHeading || heroDescription) && (
          <section className="w-full px-4 py-10 sm:px-6 sm:py-16">
            <div className="mx-auto flex max-w-3xl flex-col items-center gap-6 text-center">
              {heroMainHeading && (
                <h2 
                  className="text-3xl font-light sm:text-5xl"
                  style={{ color: colorPalette?.colorPrimary || '#ec4899' }}
                >
                  {heroMainHeading}
                </h2>
              )}
              {heroDescription && (
                <p className={`text-base sm:text-lg ${heroDescColorProps.className}`} style={heroDescColorProps.style}>
                  {heroDescription}
                </p>
              )}
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
          {allCategoriesTagline && (
            <p className={`text-sm sm:text-base mt-2 ${categoryDescColorProps.className}`} style={categoryDescColorProps.style}>
              {allCategoriesTagline}
            </p>
          )}
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
      {footerText && (
        <footer className="border-t border-secondary/70 bg-white">
          <div className={`mx-auto max-w-7xl px-4 py-10 text-center text-sm sm:px-6 lg:px-8 ${footerColorProps.className}`} style={footerColorProps.style}>
            {footerText}
          </div>
        </footer>
      )}
    </div>
  );
}

