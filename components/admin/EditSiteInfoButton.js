'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { getFirebaseDb } from '@/lib/firebase';
import { useWebsite } from '@/lib/website-context';
import Toast from '@/components/admin/Toast';
import HexColorInput from '@/components/admin/HexColorInput';
import PaletteColorSelector from '@/components/admin/PaletteColorSelector';
import SitePreview from '@/components/admin/SitePreview';
import FontPreview from '@/components/admin/FontPreview';
import FontSelector from '@/components/admin/FontSelector';

// Shared font options list
const FONT_OPTIONS = [
  { value: 'inherit', label: 'Default (System)' },
  { value: 'serif', label: 'Serif' },
  { value: 'sans-serif', label: 'Sans Serif' },
  { value: 'monospace', label: 'Monospace' },
  { value: 'cursive', label: 'Cursive' },
  { value: 'fantasy', label: 'Fantasy' },
  // Google Fonts - Sans Serif
  { value: "'Inter', sans-serif", label: 'Inter' },
  { value: "'Roboto', sans-serif", label: 'Roboto' },
  { value: "'Open Sans', sans-serif", label: 'Open Sans' },
  { value: "'Montserrat', sans-serif", label: 'Montserrat' },
  { value: "'Poppins', sans-serif", label: 'Poppins' },
  { value: "'Raleway', sans-serif", label: 'Raleway' },
  { value: "'Nunito', sans-serif", label: 'Nunito' },
  { value: "'Lato', sans-serif", label: 'Lato' },
  { value: "'Source Sans Pro', sans-serif", label: 'Source Sans Pro' },
  { value: "'Work Sans', sans-serif", label: 'Work Sans' },
  { value: "'DM Sans', sans-serif", label: 'DM Sans' },
  { value: "'Plus Jakarta Sans', sans-serif", label: 'Plus Jakarta Sans' },
  { value: "'Space Grotesk', sans-serif", label: 'Space Grotesk' },
  { value: "'Outfit', sans-serif", label: 'Outfit' },
  { value: "'Manrope', sans-serif", label: 'Manrope' },
  { value: "'Rubik', sans-serif", label: 'Rubik' },
  { value: "'Quicksand', sans-serif", label: 'Quicksand' },
  // Google Fonts - Serif
  { value: "'Playfair Display', serif", label: 'Playfair Display' },
  { value: "'Lora', serif", label: 'Lora' },
  { value: "'Merriweather', serif", label: 'Merriweather' },
  { value: "'Cormorant Garamond', serif", label: 'Cormorant Garamond' },
  { value: "'Crimson Pro', serif", label: 'Crimson Pro' },
  { value: "'Libre Baskerville', serif", label: 'Libre Baskerville' },
  { value: "'Cinzel', serif", label: 'Cinzel' },
  // Google Fonts - Display/Decorative
  { value: "'Bebas Neue', sans-serif", label: 'Bebas Neue' },
  { value: "'Oswald', sans-serif", label: 'Oswald' },
  { value: "'Dancing Script', cursive", label: 'Dancing Script' },
  { value: "'Pacifico', cursive", label: 'Pacifico' },
  { value: "'Comfortaa', sans-serif", label: 'Comfortaa' },
];

export default function EditSiteInfoButton({ className = '', open: controlledOpen, onOpenChange }) {
  const db = getFirebaseDb();
  const { selectedWebsite, availableWebsites, loading: websitesLoading } = useWebsite();
  const [internalOpen, setInternalOpen] = useState(false);
  
  // Use controlled state if provided, otherwise use internal state
  const open = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setOpen = (value) => {
    if (onOpenChange) {
      onOpenChange(value);
    } else {
      setInternalOpen(value);
    }
  };
  const [selectedStorefront, setSelectedStorefront] = useState(null);
  const [showControlPanel, setShowControlPanel] = useState(true);
  const [form, setForm] = useState({
    companyTagline: '',
    companyTaglineColor: 'primary',
    companyTaglineFont: 'primary',
    companyTaglineFontSize: 1.3, // rem
    heroMainHeading: '',
    heroMainHeadingColor: 'primary',
    heroMainHeadingFont: 'primary',
    heroMainHeadingFontSize: 4, // rem
    heroDescription: '',
    heroDescriptionColor: 'secondary',
    heroDescriptionFont: 'primary',
    heroDescriptionFontSize: 1, // rem
    heroBannerImage: '',
    heroBannerTextWidth: 75,
    heroBannerCropTop: 0, // Percentage of image height to crop from top (0-50)
    heroBannerCropBottom: 0, // Percentage of image height to crop from bottom (0-50)
    categorySectionHeading: '',
    categorySectionDescription: '',
    allCategoriesTagline: '',
    allCategoriesTaglineColor: 'secondary',
    allCategoriesTaglineFont: 'primary',
    allCategoriesTaglineFontSize: 1, // rem
    // Category Carousel styling
    categoryCarouselColor: 'primary',
    categoryCarouselFont: 'primary',
    categoryCarouselFontSize: 0.875, // rem
    // Product Card styling
    productCardType: 'minimal', // 'minimal' | 'bordered' | 'overlay' | 'compact'
    productCardIsSquare: false, // true = 1:1, false = 3:4
    productCardNameColor: 'primary',
    productCardNameFont: 'primary',
    productCardNameFontSize: 0.65, // rem
    productCardPriceColor: 'primary',
    productCardPriceFont: 'primary',
    productCardPriceFontSize: 1, // rem
    productCardVatText: 'Includes VAT',
    productCardVatColor: 'secondary',
    productCardVatFont: 'primary',
    productCardVatFontSize: 0.75, // rem
    footerText: '',
    footerTextColor: 'tertiary',
    footerTextFont: 'primary',
    footerTextFontSize: 0.875, // rem
    // Instagram and Email
    instagramUrl: '',
    instagramBgColor: 'primary', // 'primary' | 'secondary' | 'tertiary'
    showInstagram: false,
    emailAddress: '',
    emailColor: 'primary', // 'primary' | 'secondary' | 'tertiary'
    showEmail: false,
    // Color palette (hex values)
    colorPrimary: '#ec4899',
    colorSecondary: '#64748b',
    colorTertiary: '#94a3b8',
    // Global Font palette
    fontPrimary: 'inherit',
    fontSecondary: 'inherit',
    fontTertiary: 'inherit',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);
  const [textWidthChanged, setTextWidthChanged] = useState(false);
  const [fontPreviewFont, setFontPreviewFont] = useState(null);
  const [showFontPreview, setShowFontPreview] = useState(false);

  // Initialize selectedStorefront when modal opens
  useEffect(() => {
    if (open && availableWebsites.length > 0) {
      // Priority order:
      // 1. Stored storefront from admin overview (admin_storefront in sessionStorage)
      // 2. selectedWebsite from context
      // 3. First available website
      
      let storefrontToSelect = null;
      
      // Check for stored storefront from admin overview
      if (typeof window !== 'undefined') {
        const storedStorefront = sessionStorage.getItem('admin_storefront');
        if (storedStorefront && availableWebsites.includes(storedStorefront)) {
          storefrontToSelect = storedStorefront;
        }
      }
      
      // Fallback to selectedWebsite from context
      if (!storefrontToSelect && selectedWebsite && availableWebsites.includes(selectedWebsite)) {
        storefrontToSelect = selectedWebsite;
      }
      
      // Final fallback to first available
      if (!storefrontToSelect) {
        storefrontToSelect = availableWebsites[0];
      }
      
      setSelectedStorefront(storefrontToSelect);
    }
  }, [open, availableWebsites, selectedWebsite]);

  // Load site info when storefront changes
  useEffect(() => {
    if (open && db && selectedStorefront) {
      loadSiteInfo();
    }
  }, [open, db, selectedStorefront]);

  const loadSiteInfo = async () => {
    if (!db || !selectedStorefront) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const infoDoc = await getDoc(doc(db, selectedStorefront, 'Info'));
      
      if (infoDoc.exists()) {
        const data = infoDoc.data();
        setForm({
          companyTagline: data.companyTagline || '',
          companyTaglineColor: data.companyTaglineColor || 'primary',
          companyTaglineFont: data.companyTaglineFont || 'primary',
          companyTaglineFontSize: data.companyTaglineFontSize != null ? Math.max(parseFloat(data.companyTaglineFontSize), 1.3) : 1.3,
          heroMainHeading: data.heroMainHeading || '',
          heroMainHeadingColor: data.heroMainHeadingColor || 'primary',
          heroMainHeadingFont: data.heroMainHeadingFont || 'primary',
          heroMainHeadingFontSize: data.heroMainHeadingFontSize != null ? parseFloat(data.heroMainHeadingFontSize) || 4 : 4,
          heroDescription: data.heroDescription || '',
          heroDescriptionColor: data.heroDescriptionColor || 'secondary',
          heroDescriptionFont: data.heroDescriptionFont || 'primary',
          heroDescriptionFontSize: data.heroDescriptionFontSize != null ? parseFloat(data.heroDescriptionFontSize) || 1 : 1,
          heroBannerTextWidth: data.heroBannerTextWidth != null ? parseFloat(data.heroBannerTextWidth) || 75 : 75,
          heroBannerCropTop: data.heroBannerCropTop != null ? parseFloat(data.heroBannerCropTop) || 0 : 0,
          heroBannerCropBottom: data.heroBannerCropBottom != null ? parseFloat(data.heroBannerCropBottom) || 0 : 0,
          categorySectionHeading: data.categorySectionHeading || '',
          categorySectionDescription: data.categorySectionDescription || '',
          allCategoriesTagline: data.allCategoriesTagline || '',
          allCategoriesTaglineColor: data.allCategoriesTaglineColor || 'secondary',
          allCategoriesTaglineFont: data.allCategoriesTaglineFont || 'primary',
          allCategoriesTaglineFontSize: data.allCategoriesTaglineFontSize != null ? parseFloat(data.allCategoriesTaglineFontSize) || 1 : 1,
          // Category Carousel styling
          categoryCarouselColor: data.categoryCarouselColor || 'primary',
          categoryCarouselFont: data.categoryCarouselFont || 'primary',
          categoryCarouselFontSize: data.categoryCarouselFontSize != null ? parseFloat(data.categoryCarouselFontSize) || 0.875 : 0.875,
          // Product Card styling
          productCardType: data.productCardType || 'minimal',
          productCardIsSquare: data.productCardIsSquare === true, // Default to false (3:4) if not set or not boolean
          productCardColumnsPhone: data.productCardColumnsPhone != null ? parseInt(data.productCardColumnsPhone) || 2 : 2,
          productCardColumnsTablet: data.productCardColumnsTablet != null ? parseInt(data.productCardColumnsTablet) || 3 : 3,
          productCardColumnsLaptop: data.productCardColumnsLaptop != null ? parseInt(data.productCardColumnsLaptop) || 4 : 4,
          productCardColumnsDesktop: data.productCardColumnsDesktop != null ? parseInt(data.productCardColumnsDesktop) || 5 : 5,
          productCardGap: data.productCardGap != null ? (isNaN(parseFloat(data.productCardGap)) ? 1 : parseFloat(data.productCardGap)) : 1,
          productCardBorderRadius: data.productCardBorderRadius || 'medium',
          productCardNameColor: data.productCardNameColor || 'primary',
          productCardNameFont: data.productCardNameFont || 'primary',
          productCardNameFontSize: data.productCardNameFontSize != null ? parseFloat(data.productCardNameFontSize) || 0.65 : 0.65,
          productCardPriceColor: data.productCardPriceColor || 'primary',
          productCardPriceFont: data.productCardPriceFont || 'primary',
          productCardPriceFontSize: data.productCardPriceFontSize != null ? parseFloat(data.productCardPriceFontSize) || 1 : 1,
          productCardVatText: data.productCardVatText || 'Includes VAT',
          productCardVatColor: data.productCardVatColor || 'secondary',
          productCardVatFont: data.productCardVatFont || 'primary',
          productCardVatFontSize: data.productCardVatFontSize != null ? parseFloat(data.productCardVatFontSize) || 0.75 : 0.75,
          footerText: data.footerText || '',
          footerTextColor: data.footerTextColor || 'tertiary',
          footerTextFont: data.footerTextFont || 'primary',
          footerTextFontSize: data.footerTextFontSize != null ? parseFloat(data.footerTextFontSize) || 0.875 : 0.875,
          // Instagram and Email
          instagramUrl: data.instagramUrl || '',
          instagramBgColor: data.instagramBgColor || 'primary',
          showInstagram: data.showInstagram === true,
          emailAddress: data.emailAddress || '',
          emailColor: data.emailColor || 'primary',
          showEmail: data.showEmail === true,
          // Color palette (hex values)
          colorPrimary: data.colorPrimary || '#ec4899',
          colorSecondary: data.colorSecondary || '#64748b',
          colorTertiary: data.colorTertiary || '#94a3b8',
          // Global Font palette
          fontPrimary: data.fontPrimary || 'inherit',
          fontSecondary: data.fontSecondary || 'inherit',
          fontTertiary: data.fontTertiary || 'inherit',
        });
      } else {
        // Initialize with empty values if document doesn't exist
        setForm({
          companyTagline: '',
          companyTaglineColor: 'primary',
          companyTaglineFont: 'primary',
          companyTaglineFontSize: 1.3,
          heroMainHeading: '',
          heroMainHeadingColor: 'primary',
          heroMainHeadingFont: 'primary',
          heroMainHeadingFontSize: 4,
          heroDescription: '',
          heroDescriptionColor: 'secondary',
          heroDescriptionFont: 'primary',
          heroDescriptionFontSize: 1,
          heroBannerTextWidth: 75,
          heroBannerCropTop: 0,
          heroBannerCropBottom: 0,
          categorySectionHeading: '',
          categorySectionDescription: '',
          allCategoriesTagline: '',
          allCategoriesTaglineColor: 'secondary',
          allCategoriesTaglineFont: 'primary',
          allCategoriesTaglineFontSize: 1,
          // Category Carousel styling
          categoryCarouselColor: 'primary',
          categoryCarouselFont: 'primary',
          categoryCarouselFontSize: 0.875,
          // Product Card styling
          productCardType: 'minimal',
          productCardIsSquare: false,
          productCardColumnsPhone: 2, // 2 or 3 cards on phone
          productCardColumnsTablet: 3, // 3 or 4 cards on tablet
          productCardColumnsLaptop: 4, // 4 or 5 cards on laptop
          productCardColumnsDesktop: 5, // 5 or 6 cards on desktop
          productCardGap: 1,
          productCardBorderRadius: 'medium', // 'none' | 'small' | 'medium' | 'large'
          productCardNameColor: 'primary',
          productCardNameFont: 'primary',
          productCardNameFontSize: 0.65,
          productCardPriceColor: 'primary',
          productCardPriceFont: 'primary',
          productCardPriceFontSize: 1,
          productCardVatText: 'Includes VAT',
          productCardVatColor: 'secondary',
          productCardVatFont: 'primary',
          productCardVatFontSize: 0.75,
          footerText: '',
          footerTextColor: 'tertiary',
          footerTextFont: 'primary',
          footerTextFontSize: 0.875,
          // Instagram and Email
          instagramUrl: '',
          instagramBgColor: 'primary',
          showInstagram: false,
          emailAddress: '',
          emailColor: 'primary',
          showEmail: false,
          // Color palette (hex values)
          colorPrimary: '#ec4899',
          colorSecondary: '#64748b',
          colorTertiary: '#94a3b8',
          // Global Font palette
          fontPrimary: 'inherit',
          fontSecondary: 'inherit',
          fontTertiary: 'inherit',
        });
      }
    } catch (err) {
      console.error('Failed to load site info:', err);
      setError('Failed to load site information. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const resetState = () => {
    setForm({
      companyTagline: '',
      companyTaglineColor: 'primary',
      companyTaglineFont: 'primary',
      companyTaglineFontSize: 1.3,
      heroMainHeading: '',
      heroMainHeadingColor: 'primary',
      heroMainHeadingFont: 'primary',
      heroMainHeadingFontSize: 4,
      heroDescription: '',
      heroDescriptionColor: 'secondary',
      heroDescriptionFont: 'primary',
      heroDescriptionFontSize: 1,
      heroBannerImage: '',
      heroBannerTextWidth: 75,
      categorySectionHeading: '',
      categorySectionDescription: '',
      allCategoriesTagline: '',
      allCategoriesTaglineColor: 'secondary',
      allCategoriesTaglineFont: 'primary',
      allCategoriesTaglineFontSize: 1,
      footerText: '',
      footerTextColor: 'tertiary',
      footerTextFont: 'primary',
      footerTextFontSize: 0.875,
      // Instagram and Email
      instagramUrl: '',
      instagramBgColor: 'primary',
      showInstagram: false,
      emailAddress: '',
      emailColor: 'primary',
      showEmail: false,
      // Color palette (hex values)
      colorPrimary: '#ec4899',
      colorSecondary: '#64748b',
      colorTertiary: '#94a3b8',
      // Global Font palette
      fontPrimary: 'inherit',
      fontSecondary: 'inherit',
      fontTertiary: 'inherit',
    });
    setSelectedStorefront(null);
    setSubmitting(false);
    setError(null);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    event.stopPropagation();
    
    if (!db || !selectedStorefront) {
      setError('Firestore is not configured or storefront not selected.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      // Ensure color values are valid hex colors
      const validateHexColor = (color, defaultColor) => {
        if (!color || typeof color !== 'string') return defaultColor;
        const trimmed = color.trim();
        return /^#[0-9A-Fa-f]{6}$/.test(trimmed) ? trimmed : defaultColor;
      };

      const payload = {
        companyTagline: form.companyTagline.trim() || '',
        companyTaglineColor: form.companyTaglineColor || 'primary',
        companyTaglineFont: form.companyTaglineFont || 'primary',
        companyTaglineFontSize: Math.max(parseFloat(form.companyTaglineFontSize) || 1.3, 1.3),
        heroMainHeading: form.heroMainHeading.trim() || '',
        heroMainHeadingColor: form.heroMainHeadingColor || 'primary',
        heroMainHeadingFont: form.heroMainHeadingFont || 'primary',
        heroMainHeadingFontSize: parseFloat(form.heroMainHeadingFontSize) || 4,
        heroDescription: form.heroDescription.trim() || '',
        heroDescriptionColor: form.heroDescriptionColor || 'secondary',
        heroDescriptionFont: form.heroDescriptionFont || 'primary',
        heroDescriptionFontSize: parseFloat(form.heroDescriptionFontSize) || 1,
        heroBannerTextWidth: Number(form.heroBannerTextWidth) || 75,
        heroBannerCropTop: Number(form.heroBannerCropTop) || 0,
        heroBannerCropBottom: Number(form.heroBannerCropBottom) || 0,
        categorySectionHeading: form.categorySectionHeading.trim() || '',
        categorySectionDescription: form.categorySectionDescription.trim() || '',
        allCategoriesTagline: form.allCategoriesTagline.trim() || '',
        allCategoriesTaglineColor: form.allCategoriesTaglineColor || 'secondary',
        allCategoriesTaglineFont: form.allCategoriesTaglineFont || 'primary',
        allCategoriesTaglineFontSize: parseFloat(form.allCategoriesTaglineFontSize) || 1,
        // Category Carousel styling
        categoryCarouselColor: form.categoryCarouselColor || 'primary',
        categoryCarouselFont: form.categoryCarouselFont || 'primary',
        categoryCarouselFontSize: parseFloat(form.categoryCarouselFontSize) || 0.875,
        // Product Card styling
        productCardType: form.productCardType || 'minimal',
        productCardIsSquare: form.productCardIsSquare === true, // Explicitly convert to boolean
        productCardColumnsPhone: form.productCardColumnsPhone != null ? (parseInt(form.productCardColumnsPhone, 10) || 2) : 2,
        productCardColumnsTablet: form.productCardColumnsTablet != null ? (parseInt(form.productCardColumnsTablet, 10) || 3) : 3,
        productCardColumnsLaptop: form.productCardColumnsLaptop != null ? (parseInt(form.productCardColumnsLaptop, 10) || 4) : 4,
        productCardColumnsDesktop: form.productCardColumnsDesktop != null ? (parseInt(form.productCardColumnsDesktop, 10) || 5) : 5,
        productCardGap: form.productCardGap != null ? (isNaN(parseFloat(form.productCardGap)) ? 1 : parseFloat(form.productCardGap)) : 1,
        productCardBorderRadius: form.productCardBorderRadius || 'medium',
        productCardNameColor: form.productCardNameColor || 'primary',
        productCardNameFont: form.productCardNameFont || 'primary',
        productCardNameFontSize: parseFloat(form.productCardNameFontSize) || 0.65,
        productCardPriceColor: form.productCardPriceColor || 'primary',
        productCardPriceFont: form.productCardPriceFont || 'primary',
        productCardPriceFontSize: parseFloat(form.productCardPriceFontSize) || 1,
        productCardVatText: form.productCardVatText.trim() || 'Includes VAT',
        productCardVatColor: form.productCardVatColor || 'secondary',
        productCardVatFont: form.productCardVatFont || 'primary',
        productCardVatFontSize: parseFloat(form.productCardVatFontSize) || 0.75,
        footerText: form.footerText.trim() || '',
        footerTextColor: form.footerTextColor || 'tertiary',
        footerTextFont: form.footerTextFont || 'primary',
        footerTextFontSize: parseFloat(form.footerTextFontSize) || 0.875,
        // Instagram and Email
        instagramUrl: form.instagramUrl.trim() || '',
        instagramBgColor: form.instagramBgColor || 'primary',
        showInstagram: form.showInstagram === true,
        emailAddress: form.emailAddress.trim() || '',
        emailColor: form.emailColor || 'primary',
        showEmail: form.showEmail === true,
        // Color palette (hex values) - validate and ensure they're valid
        colorPrimary: validateHexColor(form.colorPrimary, '#ec4899'),
        colorSecondary: validateHexColor(form.colorSecondary, '#64748b'),
        colorTertiary: validateHexColor(form.colorTertiary, '#94a3b8'),
        // Global Font palette
        fontPrimary: form.fontPrimary || 'inherit',
        fontSecondary: form.fontSecondary || 'inherit',
        fontTertiary: form.fontTertiary || 'inherit',
        storefront: selectedStorefront,
        updatedAt: serverTimestamp(),
      };

      await setDoc(doc(db, selectedStorefront, 'Info'), payload, { merge: true });

      // Clear cached Info for this storefront so it gets refreshed on next load
      if (typeof window !== 'undefined') {
        const { clearCachedInfo } = require('@/lib/info-cache');
        clearCachedInfo(selectedStorefront);
      }

      // Close modal and reset
      setOpen(false);
      resetState();
      
      // Show success toast
      setToastMessage({ type: 'success', text: `Site information updated successfully for ${selectedStorefront}!` });
    } catch (err) {
      console.error('Failed to update site info:', err);
      setError('Failed to update site information. Please try again.');
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    if (submitting) return;
    setOpen(false);
    resetState();
  };

  // Only render the button if not controlled (when controlled, parent handles the trigger)
  if (!open) {
    // If controlled, don't render the button (parent will handle it)
    if (controlledOpen !== undefined) {
      return toastMessage ? (
        <Toast
          message={toastMessage}
          onDismiss={() => setToastMessage(null)}
        />
      ) : null;
    }
    
    // If not controlled, render the button
    return (
      <>
        <button
          onClick={() => setOpen(true)}
          className={`rounded-full border border-zinc-200/70 px-4 py-2 text-sm font-medium transition hover:border-emerald-200 hover:bg-emerald-50/50 dark:border-zinc-800/80 dark:hover:border-emerald-500/40 dark:hover:bg-emerald-500/10 ${className}`}
        >
          Edit Site Content
        </button>
        {toastMessage && (
          <Toast
            message={toastMessage}
            onDismiss={() => setToastMessage(null)}
          />
        )}
      </>
    );
  }

  return (
    <>
      {toastMessage && (
        <Toast
          message={toastMessage}
          onDismiss={() => setToastMessage(null)}
        />
      )}
      {createPortal(
        <div className="fixed inset-0 z-50 flex flex-col bg-white">
          {/* Full-screen Preview */}
          <div className="overflow-hidden" style={{ height: '100vh', width: '100vw' }}>
            <SitePreview
              companyTagline={form.companyTagline}
              companyTaglineColor={form.companyTaglineColor}
              companyTaglineFont={form.companyTaglineFont}
              companyTaglineFontSize={form.companyTaglineFontSize}
              heroMainHeading={form.heroMainHeading}
              heroMainHeadingColor={form.heroMainHeadingColor}
              heroMainHeadingFont={form.heroMainHeadingFont}
              heroMainHeadingFontSize={form.heroMainHeadingFontSize}
              heroDescription={form.heroDescription}
              heroDescriptionColor={form.heroDescriptionColor}
              heroDescriptionFont={form.heroDescriptionFont}
              heroDescriptionFontSize={form.heroDescriptionFontSize}
              storefront={selectedStorefront || 'FIVESTARFINDS'}
              categoryCarouselColor={form.categoryCarouselColor}
              categoryCarouselFont={form.categoryCarouselFont}
              categoryCarouselFontSize={form.categoryCarouselFontSize}
              allCategoriesTagline={form.allCategoriesTagline}
              allCategoriesTaglineColor={form.allCategoriesTaglineColor}
              allCategoriesTaglineFont={form.allCategoriesTaglineFont}
              allCategoriesTaglineFontSize={form.allCategoriesTaglineFontSize}
              footerText={form.footerText}
              footerTextColor={form.footerTextColor}
              footerTextFont={form.footerTextFont}
              footerTextFontSize={form.footerTextFontSize}
              // Instagram and Email
              instagramUrl={form.instagramUrl}
              instagramBgColor={form.instagramBgColor}
              showInstagram={form.showInstagram}
              emailAddress={form.emailAddress}
              emailColor={form.emailColor}
              showEmail={form.showEmail}
              // Product Card styling
              productCardType={form.productCardType || 'minimal'}
              productCardIsSquare={form.productCardIsSquare === true}
              productCardColumnsPhone={form.productCardColumnsPhone}
              productCardColumnsTablet={form.productCardColumnsTablet}
              productCardColumnsLaptop={form.productCardColumnsLaptop}
              productCardColumnsDesktop={form.productCardColumnsDesktop}
              productCardGap={form.productCardGap}
              productCardBorderRadius={form.productCardBorderRadius}
              productCardNameColor={form.productCardNameColor}
              productCardNameFont={form.productCardNameFont}
              productCardNameFontSize={form.productCardNameFontSize}
              productCardPriceColor={form.productCardPriceColor}
              productCardPriceFont={form.productCardPriceFont}
              productCardPriceFontSize={form.productCardPriceFontSize}
              productCardVatText={form.productCardVatText}
              productCardVatColor={form.productCardVatColor}
              productCardVatFont={form.productCardVatFont}
              productCardVatFontSize={form.productCardVatFontSize}
              textWidth={form.heroBannerTextWidth || 75}
              highlightTextWidth={textWidthChanged}
              bannerCropTop={form.heroBannerCropTop || 0}
              bannerCropBottom={form.heroBannerCropBottom || 0}
              colorPalette={{
                colorPrimary: form.colorPrimary,
                colorSecondary: form.colorSecondary,
                colorTertiary: form.colorTertiary,
              }}
              fontPalette={{
                fontPrimary: form.fontPrimary,
                fontSecondary: form.fontSecondary,
                fontTertiary: form.fontTertiary,
              }}
            />
          </div>

          {/* Bottom Editing Panel - 50% height, multi-column layout */}
          {showControlPanel && (
            <div className="fixed bottom-0 left-0 right-0 z-10 bg-white/70 backdrop-blur-sm border-t border-zinc-200/70 shadow-2xl dark:bg-zinc-900/70 dark:border-zinc-700" style={{ height: '50vh' }}>
              <div className="h-full flex flex-col">
                {/* Header - Fixed */}
                <div className="flex-shrink-0 px-4 py-2 flex items-center justify-between border-b border-zinc-200/50 dark:border-zinc-700">
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Edit Site Content</h2>
                    <button
                      type="button"
                      onClick={() => setShowControlPanel(false)}
                      className="flex items-center justify-center w-6 h-6 rounded text-zinc-500 hover:text-zinc-700 hover:bg-zinc-100 transition-colors dark:text-zinc-400 dark:hover:text-zinc-200 dark:hover:bg-zinc-800"
                      aria-label="Hide controls"
                      title="Hide controls"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                  </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleClose}
                    disabled={submitting}
                    className="rounded border border-zinc-200/70 px-4 py-2 text-xs font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-800/80 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  >
                    Close
                  </button>
                  <button
                    type="submit"
                    form="edit-site-form"
                    disabled={submitting}
                    className="rounded bg-emerald-600 px-4 py-2 text-xs font-medium text-white transition hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {submitting ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </div>

              {/* Content - Multi-column with vertical scroll */}
              <div className="flex-1 overflow-x-auto overflow-y-auto">
                {loading || websitesLoading ? (
                  <div className="py-4 px-4 text-center text-zinc-500 text-sm">Loading site information...</div>
                ) : (
                  <form id="edit-site-form" onSubmit={handleSubmit} className="h-full">
                    {error && (
                      <div className="absolute top-14 left-4 right-4 rounded-lg bg-red-50 p-2 text-xs text-red-700 dark:bg-red-900/20 dark:text-red-300 z-20">
                        {error}
                      </div>
                    )}

                    <div className="grid grid-cols-3 gap-4 px-4 py-3 h-full">
                      {/* Column 1 */}
                      <div className="space-y-4 overflow-y-auto pr-4 border-r border-zinc-200/50 dark:border-zinc-700">
                        {/* Storefront Selector */}
                        <div>
                          <label htmlFor="storefront-select" className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
                            Storefront *
                          </label>
                          {availableWebsites.length === 0 ? (
                            <div className="rounded border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 text-xs text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400">
                              No storefronts
                            </div>
                          ) : (
                            <select
                              id="storefront-select"
                              value={selectedStorefront || ''}
                              onChange={(e) => setSelectedStorefront(e.target.value)}
                              className="w-full rounded border border-zinc-200 bg-white px-2.5 py-1.5 text-xs text-zinc-700 focus:border-emerald-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
                              required
                            >
                              <option value="">Select...</option>
                              {availableWebsites.map((storefront) => (
                                <option key={storefront} value={storefront}>
                                  {storefront}
                                </option>
                              ))}
                            </select>
                          )}
                        </div>

                        {/* Banner Section */}
                        <div className="space-y-3 pt-4 border-t border-zinc-200/50 dark:border-zinc-700">
                          <h3 className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 mb-2">Banner</h3>
                          <div className="text-xs text-zinc-500 dark:text-zinc-400 mb-3 p-2 bg-zinc-50 dark:bg-zinc-800 rounded">
                            Banner images are now managed as static files in <code className="text-[10px]">public/banners/</code>. 
                            To change the banner, replace the image file directly in the project folder.
                          </div>
                          <div className="grid grid-cols-2 gap-3 mb-3">
                            <div>
                              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                                Crop Top: {form.heroBannerCropTop}%
                              </label>
                              <input
                                type="range"
                                min="0"
                                max="50"
                                step="1"
                                value={form.heroBannerCropTop}
                                onChange={(e) => {
                                  setForm((prev) => ({ ...prev, heroBannerCropTop: Number(e.target.value) }));
                                }}
                                className="w-full h-2 bg-zinc-200 rounded-lg appearance-none cursor-pointer dark:bg-zinc-700"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                                Crop Bottom: {form.heroBannerCropBottom}%
                              </label>
                              <input
                                type="range"
                                min="0"
                                max="50"
                                step="1"
                                value={form.heroBannerCropBottom}
                                onChange={(e) => {
                                  setForm((prev) => ({ ...prev, heroBannerCropBottom: Number(e.target.value) }));
                                }}
                                className="w-full h-2 bg-zinc-200 rounded-lg appearance-none cursor-pointer dark:bg-zinc-700"
                              />
                            </div>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                              Text Width: {form.heroBannerTextWidth}%
                            </label>
                            <input
                              type="range"
                              min="10"
                              max="100"
                              step="1"
                              value={form.heroBannerTextWidth}
                              onChange={(e) => {
                                setForm((prev) => ({ ...prev, heroBannerTextWidth: Number(e.target.value) }));
                                setTextWidthChanged(true);
                                setTimeout(() => setTextWidthChanged(false), 1000);
                              }}
                              className="w-full h-2 bg-zinc-200 rounded-lg appearance-none cursor-pointer dark:bg-zinc-700"
                            />
                          </div>
                        </div>

                        {/* Primary Color + Primary Font */}
                        <div className="space-y-3 pt-4 border-t border-zinc-200/50 dark:border-zinc-700">
                          <h3 className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 mb-2">Primary</h3>
                          <div>
                            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                              Primary Color
                            </label>
                            <div className="flex gap-1.5">
                              <input
                                type="color"
                                value={form.colorPrimary || '#ec4899'}
                                onChange={(e) => setForm((prev) => ({ ...prev, colorPrimary: e.target.value }))}
                                className="h-7 w-10 rounded border border-zinc-200 cursor-pointer dark:border-zinc-700 flex-shrink-0"
                              />
                              <input
                                type="text"
                                value={form.colorPrimary || '#ec4899'}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  // Allow partial input while typing (e.g., #3bb, #3bba, #3bba9)
                                  // Only allow # followed by 0-6 hex characters
                                  if (val === '' || /^#[0-9A-Fa-f]{0,6}$/.test(val)) {
                                    setForm((prev) => ({ ...prev, colorPrimary: val || '#ec4899' }));
                                  }
                                }}
                                onBlur={(e) => {
                                  const val = e.target.value.trim();
                                  // Validate complete hex color on blur
                                  if (!val || !/^#[0-9A-Fa-f]{6}$/.test(val)) {
                                    // If invalid, restore previous valid value or default
                                    setForm((prev) => ({ ...prev, colorPrimary: prev.colorPrimary || '#ec4899' }));
                                  } else {
                                    // Ensure value is saved (in case it was valid but not yet saved)
                                    setForm((prev) => ({ ...prev, colorPrimary: val }));
                                  }
                                }}
                                placeholder="#ec4899"
                                className="flex-1 rounded border border-zinc-200 px-2 py-1 text-xs font-mono focus:border-emerald-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                              />
                            </div>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                              Primary Font
                            </label>
                            <FontSelector
                              value={form.fontPrimary || 'inherit'}
                              onChange={(newValue) => {
                                setForm((prev) => ({ ...prev, fontPrimary: newValue }));
                              }}
                              onHover={(fontValue, isHovering) => {
                                if (isHovering && fontValue && fontValue !== 'inherit') {
                                  setFontPreviewFont(fontValue);
                                  setShowFontPreview(true);
                                } else {
                                  setShowFontPreview(false);
                                }
                              }}
                              options={FONT_OPTIONS}
                              className="w-full"
                            />
                          </div>
                        </div>

                        {/* Secondary Color + Secondary Font */}
                        <div className="space-y-3 pt-4 border-t border-zinc-200/50 dark:border-zinc-700">
                          <h3 className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 mb-2">Secondary</h3>
                          <div>
                            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                              Secondary Color
                            </label>
                            <div className="flex gap-1.5">
                              <input
                                type="color"
                                value={form.colorSecondary || '#64748b'}
                                onChange={(e) => setForm((prev) => ({ ...prev, colorSecondary: e.target.value }))}
                                className="h-7 w-10 rounded border border-zinc-200 cursor-pointer dark:border-zinc-700 flex-shrink-0"
                              />
                              <input
                                type="text"
                                value={form.colorSecondary || '#64748b'}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  // Allow partial input while typing (e.g., #3bb, #3bba, #3bba9)
                                  // Only allow # followed by 0-6 hex characters
                                  if (val === '' || /^#[0-9A-Fa-f]{0,6}$/.test(val)) {
                                    setForm((prev) => ({ ...prev, colorSecondary: val || '#64748b' }));
                                  }
                                }}
                                onBlur={(e) => {
                                  const val = e.target.value.trim();
                                  // Validate complete hex color on blur
                                  if (!val || !/^#[0-9A-Fa-f]{6}$/.test(val)) {
                                    // If invalid, restore previous valid value or default
                                    setForm((prev) => ({ ...prev, colorSecondary: prev.colorSecondary || '#64748b' }));
                                  } else {
                                    // Ensure value is saved (in case it was valid but not yet saved)
                                    setForm((prev) => ({ ...prev, colorSecondary: val }));
                                  }
                                }}
                                placeholder="#64748b"
                                className="flex-1 rounded border border-zinc-200 px-2 py-1 text-xs font-mono focus:border-emerald-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                              />
                            </div>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                              Secondary Font
                            </label>
                            <FontSelector
                              value={form.fontSecondary || 'inherit'}
                              onChange={(newValue) => {
                                setForm((prev) => ({ ...prev, fontSecondary: newValue }));
                              }}
                              onHover={(fontValue, isHovering) => {
                                if (isHovering && fontValue && fontValue !== 'inherit') {
                                  setFontPreviewFont(fontValue);
                                  setShowFontPreview(true);
                                } else {
                                  setShowFontPreview(false);
                                }
                              }}
                              options={FONT_OPTIONS}
                              className="w-full"
                            />
                          </div>
                        </div>

                        {/* Tertiary Color + Tertiary Font */}
                        <div className="space-y-3 pt-4 border-t border-zinc-200/50 dark:border-zinc-700">
                          <h3 className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 mb-2">Tertiary</h3>
                          <div>
                            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                              Tertiary Color
                            </label>
                            <div className="flex gap-1.5">
                              <input
                                type="color"
                                value={form.colorTertiary || '#94a3b8'}
                                onChange={(e) => setForm((prev) => ({ ...prev, colorTertiary: e.target.value }))}
                                className="h-7 w-10 rounded border border-zinc-200 cursor-pointer dark:border-zinc-700 flex-shrink-0"
                              />
                              <input
                                type="text"
                                value={form.colorTertiary || '#94a3b8'}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  // Allow partial input while typing (e.g., #3bb, #3bba, #3bba9)
                                  // Only allow # followed by 0-6 hex characters
                                  if (val === '' || /^#[0-9A-Fa-f]{0,6}$/.test(val)) {
                                    setForm((prev) => ({ ...prev, colorTertiary: val || '#94a3b8' }));
                                  }
                                }}
                                onBlur={(e) => {
                                  const val = e.target.value.trim();
                                  // Validate complete hex color on blur
                                  if (!val || !/^#[0-9A-Fa-f]{6}$/.test(val)) {
                                    // If invalid, restore previous valid value or default
                                    setForm((prev) => ({ ...prev, colorTertiary: prev.colorTertiary || '#94a3b8' }));
                                  } else {
                                    // Ensure value is saved (in case it was valid but not yet saved)
                                    setForm((prev) => ({ ...prev, colorTertiary: val }));
                                  }
                                }}
                                placeholder="#94a3b8"
                                className="flex-1 rounded border border-zinc-200 px-2 py-1 text-xs font-mono focus:border-emerald-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                              />
                            </div>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                              Tertiary Font
                            </label>
                            <FontSelector
                              value={form.fontTertiary || 'inherit'}
                              onChange={(newValue) => {
                                setForm((prev) => ({ ...prev, fontTertiary: newValue }));
                              }}
                              onHover={(fontValue, isHovering) => {
                                if (isHovering && fontValue && fontValue !== 'inherit') {
                                  setFontPreviewFont(fontValue);
                                  setShowFontPreview(true);
                                } else {
                                  setShowFontPreview(false);
                                }
                              }}
                              options={FONT_OPTIONS}
                              className="w-full"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Column 2 */}
                      <div className="space-y-4 overflow-y-auto pr-4 border-r border-zinc-200/50 dark:border-zinc-700">

                        {/* Hero Section */}
                        <div className="space-y-3">
                          <h3 className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 mb-2">Hero Section</h3>
                          
                          {/* Company Tagline */}
                          <div>
                            <label htmlFor="companyTagline" className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                              Company Tagline
                            </label>
                            <input
                              id="companyTagline"
                              type="text"
                              value={form.companyTagline}
                              onChange={(e) => setForm((prev) => ({ ...prev, companyTagline: e.target.value }))}
                              className="w-full rounded border border-zinc-200 px-2.5 py-1.5 text-xs focus:border-emerald-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                              placeholder="Effortless softness..."
                              maxLength={50}
                            />
                            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                              {form.companyTagline.length}/50 characters
                            </p>
                            <div className="flex gap-2 mt-2">
                              <div className="flex-1">
                                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">Color</label>
                                <select
                                  value={form.companyTaglineColor || 'primary'}
                                  onChange={(e) => setForm((prev) => ({ ...prev, companyTaglineColor: e.target.value }))}
                                  className="w-full rounded border border-zinc-200 px-2.5 py-1.5 text-xs focus:border-emerald-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                                >
                                  <option value="primary">Primary</option>
                                  <option value="secondary">Secondary</option>
                                  <option value="tertiary">Tertiary</option>
                                </select>
                              </div>
                              <div className="flex-1">
                                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">Font</label>
                                <select
                                  value={form.companyTaglineFont || 'primary'}
                                  onChange={(e) => setForm((prev) => ({ ...prev, companyTaglineFont: e.target.value }))}
                                  className="w-full rounded border border-zinc-200 px-2.5 py-1.5 text-xs focus:border-emerald-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                                >
                                  <option value="primary">Primary</option>
                                  <option value="secondary">Secondary</option>
                                  <option value="tertiary">Tertiary</option>
                                </select>
                              </div>
                            </div>
                            <div className="mt-2">
                              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                                Size: {form.companyTaglineFontSize}rem
                              </label>
                              <input
                                type="range"
                                min="1.3"
                                max="1.5"
                                step="0.05"
                                value={form.companyTaglineFontSize}
                                onChange={(e) => setForm((prev) => ({ ...prev, companyTaglineFontSize: parseFloat(e.target.value) || 1.3 }))}
                                className="w-full h-2 bg-zinc-200 rounded-lg appearance-none cursor-pointer dark:bg-zinc-700"
                              />
                            </div>
                          </div>

                          {/* Hero Main Heading */}
                          <div>
                            <label htmlFor="heroMainHeading" className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                              Hero Main Heading
                            </label>
                            <input
                              id="heroMainHeading"
                              type="text"
                              value={form.heroMainHeading}
                              onChange={(e) => setForm((prev) => ({ ...prev, heroMainHeading: e.target.value }))}
                              className="w-full rounded border border-zinc-200 px-2.5 py-1.5 text-xs focus:border-emerald-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                              placeholder="Curated collections..."
                              maxLength={80}
                            />
                            <div className="flex gap-2 mt-2">
                              <div className="flex-1">
                                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">Color</label>
                                <select
                                  value={form.heroMainHeadingColor || 'primary'}
                                  onChange={(e) => setForm((prev) => ({ ...prev, heroMainHeadingColor: e.target.value }))}
                                  className="w-full rounded border border-zinc-200 px-2.5 py-1.5 text-xs focus:border-emerald-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                                >
                                  <option value="primary">Primary</option>
                                  <option value="secondary">Secondary</option>
                                  <option value="tertiary">Tertiary</option>
                                </select>
                              </div>
                              <div className="flex-1">
                                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">Font</label>
                                <select
                                  value={form.heroMainHeadingFont || 'primary'}
                                  onChange={(e) => setForm((prev) => ({ ...prev, heroMainHeadingFont: e.target.value }))}
                                  className="w-full rounded border border-zinc-200 px-2.5 py-1.5 text-xs focus:border-emerald-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                                >
                                  <option value="primary">Primary</option>
                                  <option value="secondary">Secondary</option>
                                  <option value="tertiary">Tertiary</option>
                                </select>
                              </div>
                            </div>
                            <div className="mt-2">
                              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                                Size: {form.heroMainHeadingFontSize}rem
                              </label>
                              <input
                                type="range"
                                min="1"
                                max="6"
                                step="0.1"
                                value={form.heroMainHeadingFontSize}
                                onChange={(e) => setForm((prev) => ({ ...prev, heroMainHeadingFontSize: parseFloat(e.target.value) || 4 }))}
                                className="w-full h-2 bg-zinc-200 rounded-lg appearance-none cursor-pointer dark:bg-zinc-700"
                              />
                            </div>
                          </div>

                          {/* Hero Description */}
                          <div>
                            <label htmlFor="heroDescription" className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                              Hero Description
                            </label>
                            <textarea
                              id="heroDescription"
                              value={form.heroDescription}
                              onChange={(e) => setForm((prev) => ({ ...prev, heroDescription: e.target.value }))}
                              className="w-full rounded border border-zinc-200 px-2.5 py-1.5 text-xs focus:border-emerald-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 resize-none"
                              placeholder="From delicate lace..."
                              rows={3}
                              maxLength={200}
                            />
                            <div className="flex gap-2 mt-2">
                              <div className="flex-1">
                                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">Color</label>
                                <select
                                  value={form.heroDescriptionColor || 'secondary'}
                                  onChange={(e) => setForm((prev) => ({ ...prev, heroDescriptionColor: e.target.value }))}
                                  className="w-full rounded border border-zinc-200 px-2.5 py-1.5 text-xs focus:border-emerald-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                                >
                                  <option value="primary">Primary</option>
                                  <option value="secondary">Secondary</option>
                                  <option value="tertiary">Tertiary</option>
                                </select>
                              </div>
                              <div className="flex-1">
                                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">Font</label>
                                <select
                                  value={form.heroDescriptionFont || 'primary'}
                                  onChange={(e) => setForm((prev) => ({ ...prev, heroDescriptionFont: e.target.value }))}
                                  className="w-full rounded border border-zinc-200 px-2.5 py-1.5 text-xs focus:border-emerald-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                                >
                                  <option value="primary">Primary</option>
                                  <option value="secondary">Secondary</option>
                                  <option value="tertiary">Tertiary</option>
                                </select>
                              </div>
                            </div>
                            <div className="mt-2">
                              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                                Size: {form.heroDescriptionFontSize}rem
                              </label>
                              <input
                                type="range"
                                min="0.5"
                                max="2"
                                step="0.1"
                                value={form.heroDescriptionFontSize}
                                onChange={(e) => setForm((prev) => ({ ...prev, heroDescriptionFontSize: parseFloat(e.target.value) || 1 }))}
                                className="w-full h-2 bg-zinc-200 rounded-lg appearance-none cursor-pointer dark:bg-zinc-700"
                              />
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Column 3 */}
                      <div className="space-y-4 overflow-y-auto">
                        {/* Category Carousel + All Categories Tagline Section */}
                        <div className="space-y-3">
                          <h3 className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 mb-2">Category Carousel & Tagline</h3>
                          
                          {/* Category Carousel */}
                          <div>
                            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                              Category Carousel
                            </label>
                            <div className="flex gap-2">
                              <div className="flex-1">
                                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">Color</label>
                                <select
                                  value={form.categoryCarouselColor || 'primary'}
                                  onChange={(e) => setForm((prev) => ({ ...prev, categoryCarouselColor: e.target.value }))}
                                  className="w-full rounded border border-zinc-200 px-2.5 py-1.5 text-xs focus:border-emerald-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                                >
                                  <option value="primary">Primary</option>
                                  <option value="secondary">Secondary</option>
                                  <option value="tertiary">Tertiary</option>
                                </select>
                              </div>
                              <div className="flex-1">
                                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">Font</label>
                                <select
                                  value={form.categoryCarouselFont || 'primary'}
                                  onChange={(e) => setForm((prev) => ({ ...prev, categoryCarouselFont: e.target.value }))}
                                  className="w-full rounded border border-zinc-200 px-2.5 py-1.5 text-xs focus:border-emerald-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                                >
                                  <option value="primary">Primary</option>
                                  <option value="secondary">Secondary</option>
                                  <option value="tertiary">Tertiary</option>
                                </select>
                              </div>
                            </div>
                            <div className="mt-2">
                              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                                Size: {form.categoryCarouselFontSize}rem
                              </label>
                              <input
                                type="range"
                                min="0.5"
                                max="1.5"
                                step="0.05"
                                value={form.categoryCarouselFontSize}
                                onChange={(e) => setForm((prev) => ({ ...prev, categoryCarouselFontSize: parseFloat(e.target.value) || 0.875 }))}
                                className="w-full h-2 bg-zinc-200 rounded-lg appearance-none cursor-pointer dark:bg-zinc-700"
                              />
                            </div>
                          </div>

                          {/* All Categories Tagline */}
                          <div>
                            <label htmlFor="allCategoriesTagline" className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                              All Categories Tagline
                            </label>
                            <input
                              id="allCategoriesTagline"
                              type="text"
                              value={form.allCategoriesTagline}
                              onChange={(e) => setForm((prev) => ({ ...prev, allCategoriesTagline: e.target.value }))}
                              className="w-full rounded border border-zinc-200 px-2.5 py-1.5 text-xs focus:border-emerald-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                              placeholder="Choose a category..."
                              maxLength={100}
                            />
                            <div className="flex gap-2 mt-2">
                              <div className="flex-1">
                                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">Color</label>
                                <select
                                  value={form.allCategoriesTaglineColor || 'secondary'}
                                  onChange={(e) => setForm((prev) => ({ ...prev, allCategoriesTaglineColor: e.target.value }))}
                                  className="w-full rounded border border-zinc-200 px-2.5 py-1.5 text-xs focus:border-emerald-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                                >
                                  <option value="primary">Primary</option>
                                  <option value="secondary">Secondary</option>
                                  <option value="tertiary">Tertiary</option>
                                </select>
                              </div>
                              <div className="flex-1">
                                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">Font</label>
                                <select
                                  value={form.allCategoriesTaglineFont || 'primary'}
                                  onChange={(e) => setForm((prev) => ({ ...prev, allCategoriesTaglineFont: e.target.value }))}
                                  className="w-full rounded border border-zinc-200 px-2.5 py-1.5 text-xs focus:border-emerald-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                                >
                                  <option value="primary">Primary</option>
                                  <option value="secondary">Secondary</option>
                                  <option value="tertiary">Tertiary</option>
                                </select>
                              </div>
                            </div>
                            <div className="mt-2">
                              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                                Size: {form.allCategoriesTaglineFontSize}rem
                              </label>
                              <input
                                type="range"
                                min="0.5"
                                max="2"
                                step="0.1"
                                value={form.allCategoriesTaglineFontSize}
                                onChange={(e) => setForm((prev) => ({ ...prev, allCategoriesTaglineFontSize: parseFloat(e.target.value) || 1 }))}
                                className="w-full h-2 bg-zinc-200 rounded-lg appearance-none cursor-pointer dark:bg-zinc-700"
                              />
                            </div>
                          </div>
                        </div>

                        {/* Product Card Section */}
                        <div className="space-y-3 pt-4 border-t border-zinc-200/50 dark:border-zinc-700">
                          <h3 className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 mb-2">Product Card</h3>
                          
                          {/* Card Type */}
                          <div>
                            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                              Card Type
                            </label>
                            <select
                              value={form.productCardType || 'minimal'}
                              onChange={(e) => setForm((prev) => ({ ...prev, productCardType: e.target.value }))}
                              className="w-full rounded border border-zinc-200 px-2.5 py-1.5 text-xs focus:border-emerald-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                            >
                              <option value="minimal">Minimal</option>
                              <option value="bordered">Bordered</option>
                              <option value="overlay">Overlay</option>
                              <option value="compact">Compact</option>
                            </select>
                          </div>

                          {/* Card Size Controls */}
                          <div className="space-y-3">
                            <div>
                              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                                Image Aspect Ratio
                              </label>
                              <select
                                value={form.productCardIsSquare ? '1:1' : '3:4'}
                                onChange={(e) => setForm((prev) => ({ ...prev, productCardIsSquare: e.target.value === '1:1' }))}
                                className="w-full rounded border border-zinc-200 px-2.5 py-1.5 text-xs focus:border-emerald-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                              >
                                <option value="3:4">3:4 (Portrait)</option>
                                <option value="1:1">1:1 (Square)</option>
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                                Card Gap: {form.productCardGap || 0}rem
                              </label>
                              <input
                                type="range"
                                min="0"
                                max="3"
                                step="0.1"
                                value={form.productCardGap || 0}
                                onChange={(e) => setForm((prev) => ({ ...prev, productCardGap: parseFloat(e.target.value) || 0 }))}
                                className="w-full h-2 bg-zinc-200 rounded-lg appearance-none cursor-pointer dark:bg-zinc-700"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                                Border Radius
                              </label>
                              <select
                                value={form.productCardBorderRadius || 'medium'}
                                onChange={(e) => setForm((prev) => ({ ...prev, productCardBorderRadius: e.target.value }))}
                                className="w-full rounded border border-zinc-200 px-2.5 py-1.5 text-xs focus:border-emerald-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                              >
                                <option value="none">None</option>
                                <option value="small">Small</option>
                                <option value="medium">Medium</option>
                                <option value="large">Large</option>
                              </select>
                            </div>
                            <div className="space-y-2">
                              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                                Cards Per Row by Screen Size
                              </label>
                              <div>
                                <label className="block text-xs text-zinc-600 dark:text-zinc-400 mb-1">Phone: {form.productCardColumnsPhone || 2} cards</label>
                                <select
                                  value={form.productCardColumnsPhone || 2}
                                  onChange={(e) => setForm((prev) => ({ ...prev, productCardColumnsPhone: parseInt(e.target.value) || 2 }))}
                                  className="w-full rounded border border-zinc-200 px-2.5 py-1.5 text-xs focus:border-emerald-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                                >
                                  <option value="2">2 cards</option>
                                  <option value="3">3 cards</option>
                                </select>
                              </div>
                              <div>
                                <label className="block text-xs text-zinc-600 dark:text-zinc-400 mb-1">Tablet (640px+): {form.productCardColumnsTablet || 3} cards</label>
                                <select
                                  value={form.productCardColumnsTablet || 3}
                                  onChange={(e) => setForm((prev) => ({ ...prev, productCardColumnsTablet: parseInt(e.target.value) || 3 }))}
                                  className="w-full rounded border border-zinc-200 px-2.5 py-1.5 text-xs focus:border-emerald-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                                >
                                  <option value="3">3 cards</option>
                                  <option value="4">4 cards</option>
                                </select>
                              </div>
                              <div>
                                <label className="block text-xs text-zinc-600 dark:text-zinc-400 mb-1">Laptop (1024px+): {form.productCardColumnsLaptop != null ? form.productCardColumnsLaptop : 4} cards</label>
                                <select
                                  value={form.productCardColumnsLaptop != null ? form.productCardColumnsLaptop : 4}
                                  onChange={(e) => {
                                    const value = parseInt(e.target.value, 10);
                                    setForm((prev) => ({ ...prev, productCardColumnsLaptop: isNaN(value) ? 4 : value }));
                                  }}
                                  className="w-full rounded border border-zinc-200 px-2.5 py-1.5 text-xs focus:border-emerald-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                                >
                                  <option value="3">3 cards</option>
                                  <option value="4">4 cards</option>
                                  <option value="5">5 cards</option>
                                  <option value="6">6 cards</option>
                                </select>
                              </div>
                              <div>
                                <label className="block text-xs text-zinc-600 dark:text-zinc-400 mb-1">Desktop (1536px+): {form.productCardColumnsDesktop != null ? form.productCardColumnsDesktop : 5} cards</label>
                                <select
                                  value={form.productCardColumnsDesktop != null ? form.productCardColumnsDesktop : 5}
                                  onChange={(e) => {
                                    const value = parseInt(e.target.value, 10);
                                    setForm((prev) => ({ ...prev, productCardColumnsDesktop: isNaN(value) ? 5 : value }));
                                  }}
                                  className="w-full rounded border border-zinc-200 px-2.5 py-1.5 text-xs focus:border-emerald-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                                >
                                  <option value="3">3 cards</option>
                                  <option value="4">4 cards</option>
                                  <option value="5">5 cards</option>
                                  <option value="6">6 cards</option>
                                </select>
                              </div>
                            </div>
                          </div>

                          <div className="pt-2 border-t border-zinc-200/50 dark:border-zinc-700">
                            <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-2">Text Styling</p>
                          </div>
                          
                          {/* Product Name */}
                          <div>
                            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                              Product Name
                            </label>
                            <div className="flex gap-2">
                              <div className="flex-1">
                                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">Color</label>
                                <select
                                  value={form.productCardNameColor || 'primary'}
                                  onChange={(e) => setForm((prev) => ({ ...prev, productCardNameColor: e.target.value }))}
                                  className="w-full rounded border border-zinc-200 px-2.5 py-1.5 text-xs focus:border-emerald-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                                >
                                  <option value="primary">Primary</option>
                                  <option value="secondary">Secondary</option>
                                  <option value="tertiary">Tertiary</option>
                                </select>
                              </div>
                              <div className="flex-1">
                                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">Font</label>
                                <select
                                  value={form.productCardNameFont || 'primary'}
                                  onChange={(e) => setForm((prev) => ({ ...prev, productCardNameFont: e.target.value }))}
                                  className="w-full rounded border border-zinc-200 px-2.5 py-1.5 text-xs focus:border-emerald-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                                >
                                  <option value="primary">Primary</option>
                                  <option value="secondary">Secondary</option>
                                  <option value="tertiary">Tertiary</option>
                                </select>
                              </div>
                            </div>
                            <div className="mt-2">
                              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                                Size: {form.productCardNameFontSize}rem
                              </label>
                              <input
                                type="range"
                                min="0.5"
                                max="1.5"
                                step="0.05"
                                value={form.productCardNameFontSize}
                                onChange={(e) => setForm((prev) => ({ ...prev, productCardNameFontSize: parseFloat(e.target.value) || 0.65 }))}
                                className="w-full h-2 bg-zinc-200 rounded-lg appearance-none cursor-pointer dark:bg-zinc-700"
                              />
                            </div>
                          </div>

                          {/* Price */}
                          <div>
                            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                              Price
                            </label>
                            <div className="flex gap-2">
                              <div className="flex-1">
                                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">Color</label>
                                <select
                                  value={form.productCardPriceColor || 'primary'}
                                  onChange={(e) => setForm((prev) => ({ ...prev, productCardPriceColor: e.target.value }))}
                                  className="w-full rounded border border-zinc-200 px-2.5 py-1.5 text-xs focus:border-emerald-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                                >
                                  <option value="primary">Primary</option>
                                  <option value="secondary">Secondary</option>
                                  <option value="tertiary">Tertiary</option>
                                </select>
                              </div>
                              <div className="flex-1">
                                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">Font</label>
                                <select
                                  value={form.productCardPriceFont || 'primary'}
                                  onChange={(e) => setForm((prev) => ({ ...prev, productCardPriceFont: e.target.value }))}
                                  className="w-full rounded border border-zinc-200 px-2.5 py-1.5 text-xs focus:border-emerald-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                                >
                                  <option value="primary">Primary</option>
                                  <option value="secondary">Secondary</option>
                                  <option value="tertiary">Tertiary</option>
                                </select>
                              </div>
                            </div>
                            <div className="mt-2">
                              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                                Size: {form.productCardPriceFontSize}rem
                              </label>
                              <input
                                type="range"
                                min="0.5"
                                max="2"
                                step="0.1"
                                value={form.productCardPriceFontSize}
                                onChange={(e) => setForm((prev) => ({ ...prev, productCardPriceFontSize: parseFloat(e.target.value) || 1 }))}
                                className="w-full h-2 bg-zinc-200 rounded-lg appearance-none cursor-pointer dark:bg-zinc-700"
                              />
                            </div>
                          </div>

                          {/* VAT Text */}
                          <div>
                            <label htmlFor="productCardVatText" className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                              VAT Text
                            </label>
                            <input
                              id="productCardVatText"
                              type="text"
                              value={form.productCardVatText}
                              onChange={(e) => setForm((prev) => ({ ...prev, productCardVatText: e.target.value }))}
                              className="w-full rounded border border-zinc-200 px-2.5 py-1.5 text-xs focus:border-emerald-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                              placeholder="Includes VAT"
                              maxLength={50}
                            />
                            <div className="flex gap-2 mt-2">
                              <div className="flex-1">
                                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">Color</label>
                                <select
                                  value={form.productCardVatColor || 'secondary'}
                                  onChange={(e) => setForm((prev) => ({ ...prev, productCardVatColor: e.target.value }))}
                                  className="w-full rounded border border-zinc-200 px-2.5 py-1.5 text-xs focus:border-emerald-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                                >
                                  <option value="primary">Primary</option>
                                  <option value="secondary">Secondary</option>
                                  <option value="tertiary">Tertiary</option>
                                </select>
                              </div>
                              <div className="flex-1">
                                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">Font</label>
                                <select
                                  value={form.productCardVatFont || 'primary'}
                                  onChange={(e) => setForm((prev) => ({ ...prev, productCardVatFont: e.target.value }))}
                                  className="w-full rounded border border-zinc-200 px-2.5 py-1.5 text-xs focus:border-emerald-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                                >
                                  <option value="primary">Primary</option>
                                  <option value="secondary">Secondary</option>
                                  <option value="tertiary">Tertiary</option>
                                </select>
                              </div>
                            </div>
                            <div className="mt-2">
                              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                                Size: {form.productCardVatFontSize}rem
                              </label>
                              <input
                                type="range"
                                min="0.5"
                                max="1.5"
                                step="0.05"
                                value={form.productCardVatFontSize}
                                onChange={(e) => setForm((prev) => ({ ...prev, productCardVatFontSize: parseFloat(e.target.value) || 0.75 }))}
                                className="w-full h-2 bg-zinc-200 rounded-lg appearance-none cursor-pointer dark:bg-zinc-700"
                              />
                            </div>
                          </div>
                        </div>

                        {/* Footer Section */}
                        <div className="space-y-3 pt-4 border-t border-zinc-200/50 dark:border-zinc-700">
                          <h3 className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 mb-2">Footer</h3>
                          <div>
                            <label htmlFor="footerText" className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                              Footer Text
                            </label>
                            <input
                              id="footerText"
                              type="text"
                              value={form.footerText}
                              onChange={(e) => setForm((prev) => ({ ...prev, footerText: e.target.value }))}
                              className="w-full rounded border border-zinc-200 px-2.5 py-1.5 text-xs focus:border-emerald-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                              placeholder="© 2024..."
                              maxLength={100}
                            />
                            <div className="flex gap-2 mt-2">
                              <div className="flex-1">
                                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">Color</label>
                                <select
                                  value={form.footerTextColor || 'tertiary'}
                                  onChange={(e) => setForm((prev) => ({ ...prev, footerTextColor: e.target.value }))}
                                  className="w-full rounded border border-zinc-200 px-2.5 py-1.5 text-xs focus:border-emerald-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                                >
                                  <option value="primary">Primary</option>
                                  <option value="secondary">Secondary</option>
                                  <option value="tertiary">Tertiary</option>
                                </select>
                              </div>
                              <div className="flex-1">
                                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">Font</label>
                                <select
                                  value={form.footerTextFont || 'primary'}
                                  onChange={(e) => setForm((prev) => ({ ...prev, footerTextFont: e.target.value }))}
                                  className="w-full rounded border border-zinc-200 px-2.5 py-1.5 text-xs focus:border-emerald-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                                >
                                  <option value="primary">Primary</option>
                                  <option value="secondary">Secondary</option>
                                  <option value="tertiary">Tertiary</option>
                                </select>
                              </div>
                            </div>
                            <div className="mt-2">
                              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                                Size: {form.footerTextFontSize}rem
                              </label>
                              <input
                                type="range"
                                min="0.5"
                                max="1.5"
                                step="0.05"
                                value={form.footerTextFontSize}
                                onChange={(e) => setForm((prev) => ({ ...prev, footerTextFontSize: parseFloat(e.target.value) || 0.875 }))}
                                className="w-full h-2 bg-zinc-200 rounded-lg appearance-none cursor-pointer dark:bg-zinc-700"
                              />
                            </div>
                          </div>
                        </div>

                        {/* Instagram and Email Section */}
                        <div className="space-y-3 pt-4 border-t border-zinc-200/50 dark:border-zinc-700">
                          <h3 className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 mb-2">Social Links</h3>
                          
                          {/* Instagram */}
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                id="showInstagram"
                                checked={form.showInstagram}
                                onChange={(e) => setForm((prev) => ({ ...prev, showInstagram: e.target.checked }))}
                                className="rounded border-zinc-200 text-emerald-600 focus:ring-emerald-500 dark:border-zinc-700"
                              />
                              <label htmlFor="showInstagram" className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                                Show Instagram
                              </label>
                            </div>
                            {form.showInstagram && (
                              <>
                                <div>
                                  <label htmlFor="instagramUrl" className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                                    Instagram URL
                                  </label>
                                  <input
                                    id="instagramUrl"
                                    type="url"
                                    value={form.instagramUrl}
                                    onChange={(e) => setForm((prev) => ({ ...prev, instagramUrl: e.target.value }))}
                                    className="w-full rounded border border-zinc-200 px-2.5 py-1.5 text-xs focus:border-emerald-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                                    placeholder="https://www.instagram.com/..."
                                  />
                                </div>
                                <div>
                                  <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                                    Instagram Background Color
                                  </label>
                                  <select
                                    value={form.instagramBgColor || 'primary'}
                                    onChange={(e) => setForm((prev) => ({ ...prev, instagramBgColor: e.target.value }))}
                                    className="w-full rounded border border-zinc-200 px-2.5 py-1.5 text-xs focus:border-emerald-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                                  >
                                    <option value="primary">Primary</option>
                                    <option value="secondary">Secondary</option>
                                    <option value="tertiary">Tertiary</option>
                                  </select>
                                </div>
                              </>
                            )}
                          </div>

                          {/* Email */}
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                id="showEmail"
                                checked={form.showEmail}
                                onChange={(e) => setForm((prev) => ({ ...prev, showEmail: e.target.checked }))}
                                className="rounded border-zinc-200 text-emerald-600 focus:ring-emerald-500 dark:border-zinc-700"
                              />
                              <label htmlFor="showEmail" className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                                Show Email
                              </label>
                            </div>
                            {form.showEmail && (
                              <>
                                <div>
                                  <label htmlFor="emailAddress" className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                                    Email Address
                                  </label>
                                  <input
                                    id="emailAddress"
                                    type="email"
                                    value={form.emailAddress}
                                    onChange={(e) => setForm((prev) => ({ ...prev, emailAddress: e.target.value }))}
                                    className="w-full rounded border border-zinc-200 px-2.5 py-1.5 text-xs focus:border-emerald-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                                    placeholder="contact@example.com"
                                  />
                                </div>
                                <div>
                                  <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                                    Email Color
                                  </label>
                                  <select
                                    value={form.emailColor || 'primary'}
                                    onChange={(e) => setForm((prev) => ({ ...prev, emailColor: e.target.value }))}
                                    className="w-full rounded border border-zinc-200 px-2.5 py-1.5 text-xs focus:border-emerald-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                                  >
                                    <option value="primary">Primary</option>
                                    <option value="secondary">Secondary</option>
                                    <option value="tertiary">Tertiary</option>
                                  </select>
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </form>
                )}
              </div>
            </div>
          </div>
          )}

          {/* Toggle Button - Bottom Right Corner (shown when panel is hidden) */}
          {!showControlPanel && (
            <button
              type="button"
              onClick={() => setShowControlPanel(true)}
              className="fixed bottom-4 right-4 z-20 flex items-center justify-center w-10 h-10 rounded-full bg-white/90 backdrop-blur-sm border border-zinc-200/70 shadow-lg text-zinc-700 hover:bg-white hover:shadow-xl transition-all dark:bg-zinc-800/90 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
              aria-label="Show controls"
              title="Show controls"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
              </svg>
            </button>
          )}
        </div>,
        document.body
      )}
      <FontPreview fontFamily={fontPreviewFont} isVisible={showFontPreview} />
    </>
  );
}

