'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { getFirebaseDb } from '@/lib/firebase';
import { useWebsite } from '@/lib/website-context';
import Toast from '@/components/admin/Toast';
import BannerImageUpload from '@/components/admin/BannerImageUpload';
import HexColorInput from '@/components/admin/HexColorInput';
import PaletteColorSelector from '@/components/admin/PaletteColorSelector';
import SitePreview from '@/components/admin/SitePreview';

export default function EditSiteInfoButton({ className = '' }) {
  const db = getFirebaseDb();
  const { selectedWebsite, availableWebsites, loading: websitesLoading } = useWebsite();
  const [open, setOpen] = useState(false);
  const [selectedStorefront, setSelectedStorefront] = useState(null);
  const [form, setForm] = useState({
    companyTagline: '',
    heroMainHeading: '',
    heroDescription: '',
    heroBannerImage: '',
    heroBannerMaxHeight: 550,
    heroBannerMarginBottom: 40,
    heroBannerTextWidth: 75,
    heroMainHeadingFontFamily: 'inherit',
    heroMainHeadingFontStyle: 'normal',
    heroMainHeadingFontWeight: '300',
    heroMainHeadingFontSize: 48,
    categorySectionHeading: '',
    categorySectionDescription: '',
    allCategoriesTagline: '',
    footerText: '',
    // Color palette (hex values)
    colorPrimary: '#ec4899',
    colorSecondary: '#64748b',
    colorTertiary: '#94a3b8',
    // Section-specific color selections (which palette color to use)
    heroDescriptionColor: 'secondary',
    categoryDescriptionColor: 'secondary',
    footerTextColor: 'tertiary',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);
  const [textWidthChanged, setTextWidthChanged] = useState(false);

  // Initialize selectedStorefront when modal opens
  useEffect(() => {
    if (open && availableWebsites.length > 0) {
      // Default to selectedWebsite if available, otherwise first available
      if (availableWebsites.includes(selectedWebsite)) {
        setSelectedStorefront(selectedWebsite);
      } else {
        setSelectedStorefront(availableWebsites[0]);
      }
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
          heroMainHeading: data.heroMainHeading || '',
          heroDescription: data.heroDescription || '',
          heroBannerImage: data.heroBannerImage || '',
          heroBannerMaxHeight: data.heroBannerMaxHeight || 550,
          heroBannerMarginBottom: data.heroBannerMarginBottom || 40,
          heroBannerTextWidth: data.heroBannerTextWidth || 75,
          heroMainHeadingFontFamily: data.heroMainHeadingFontFamily || 'inherit',
          heroMainHeadingFontStyle: data.heroMainHeadingFontStyle || 'normal',
          heroMainHeadingFontWeight: data.heroMainHeadingFontWeight || '300',
          heroMainHeadingFontSize: data.heroMainHeadingFontSize || 48,
          categorySectionHeading: data.categorySectionHeading || '',
          categorySectionDescription: data.categorySectionDescription || '',
          allCategoriesTagline: data.allCategoriesTagline || '',
          footerText: data.footerText || '',
          // Color palette (hex values)
          colorPrimary: data.colorPrimary || '#ec4899',
          colorSecondary: data.colorSecondary || '#64748b',
          colorTertiary: data.colorTertiary || '#94a3b8',
          // Section-specific color selections (which palette color to use)
          heroDescriptionColor: data.heroDescriptionColor || 'secondary',
          categoryDescriptionColor: data.categoryDescriptionColor || 'secondary',
          footerTextColor: data.footerTextColor || 'tertiary',
        });
      } else {
        // Initialize with empty values if document doesn't exist
        setForm({
          companyTagline: '',
          heroMainHeading: '',
          heroDescription: '',
          heroBannerImage: '',
          heroBannerMaxHeight: 550,
          heroBannerMarginBottom: 40,
          heroBannerTextWidth: 75,
          heroMainHeadingFontFamily: 'inherit',
          heroMainHeadingFontStyle: 'normal',
          heroMainHeadingFontWeight: '300',
          heroMainHeadingFontSize: 48,
          categorySectionHeading: '',
          categorySectionDescription: '',
          allCategoriesTagline: '',
          footerText: '',
          // Color palette (hex values)
          colorPrimary: '#ec4899',
          colorSecondary: '#64748b',
          colorTertiary: '#94a3b8',
          // Section-specific color selections (which palette color to use)
          heroDescriptionColor: 'secondary',
          categoryDescriptionColor: 'secondary',
          footerTextColor: 'tertiary',
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
      heroMainHeading: '',
      heroDescription: '',
      heroBannerImage: '',
      heroBannerMaxHeight: 550,
      heroBannerMarginBottom: 40,
      heroBannerTextWidth: 75,
      heroMainHeadingFontFamily: 'inherit',
      heroMainHeadingFontStyle: 'normal',
      heroMainHeadingFontWeight: '300',
      heroMainHeadingFontSize: 48,
      categorySectionHeading: '',
          categorySectionDescription: '',
          allCategoriesTagline: '',
          footerText: '',
          // Color palette (hex values)
          colorPrimary: '#ec4899',
          colorSecondary: '#64748b',
          colorTertiary: '#94a3b8',
          // Section-specific color selections (which palette color to use)
          heroDescriptionColor: 'secondary',
          categoryDescriptionColor: 'secondary',
          footerTextColor: 'tertiary',
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
      const payload = {
        companyTagline: form.companyTagline.trim() || '',
        heroMainHeading: form.heroMainHeading.trim() || '',
        heroDescription: form.heroDescription.trim() || '',
        heroBannerImage: form.heroBannerImage.trim() || '',
        heroBannerMaxHeight: form.heroBannerMaxHeight || 550,
        heroBannerMarginBottom: form.heroBannerMarginBottom || 40,
        heroBannerTextWidth: form.heroBannerTextWidth || 75,
        heroMainHeadingFontFamily: form.heroMainHeadingFontFamily || 'inherit',
        heroMainHeadingFontStyle: form.heroMainHeadingFontStyle || 'normal',
        heroMainHeadingFontWeight: form.heroMainHeadingFontWeight || '300',
        heroMainHeadingFontSize: form.heroMainHeadingFontSize || 48,
        categorySectionHeading: form.categorySectionHeading.trim() || '',
        categorySectionDescription: form.categorySectionDescription.trim() || '',
        allCategoriesTagline: form.allCategoriesTagline.trim() || '',
        footerText: form.footerText.trim() || '',
        // Color palette (hex values)
        colorPrimary: form.colorPrimary || '#ec4899',
        colorSecondary: form.colorSecondary || '#64748b',
        colorTertiary: form.colorTertiary || '#94a3b8',
        // Section-specific color selections (which palette color to use)
        heroDescriptionColor: form.heroDescriptionColor || 'secondary',
        categoryDescriptionColor: form.categoryDescriptionColor || 'secondary',
        footerTextColor: form.footerTextColor || 'tertiary',
        storefront: selectedStorefront,
        updatedAt: serverTimestamp(),
      };

      await setDoc(doc(db, selectedStorefront, 'Info'), payload, { merge: true });

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

  if (!open) {
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
              heroMainHeading={form.heroMainHeading}
              heroDescription={form.heroDescription}
              heroBannerImage={form.heroBannerImage}
              allCategoriesTagline={form.allCategoriesTagline}
              footerText={form.footerText}
              maxHeight={form.heroBannerMaxHeight || 550}
              marginBottom={form.heroBannerMarginBottom || 40}
              textWidth={form.heroBannerTextWidth || 75}
              highlightTextWidth={textWidthChanged}
              heroMainHeadingFontFamily={form.heroMainHeadingFontFamily}
              heroMainHeadingFontStyle={form.heroMainHeadingFontStyle}
              heroMainHeadingFontWeight={form.heroMainHeadingFontWeight}
              heroMainHeadingFontSize={form.heroMainHeadingFontSize}
              colorPalette={{
                colorPrimary: form.colorPrimary,
                colorSecondary: form.colorSecondary,
                colorTertiary: form.colorTertiary,
              }}
              heroDescriptionColor={form.heroDescriptionColor}
              categoryDescriptionColor={form.categoryDescriptionColor}
              footerTextColor={form.footerTextColor}
            />
          </div>

          {/* Bottom Editing Panel - 30% height, multi-column layout */}
          <div className="fixed bottom-0 left-0 right-0 z-10 bg-white/70 backdrop-blur-sm border-t border-zinc-200/70 shadow-2xl dark:bg-zinc-900/70 dark:border-zinc-700" style={{ height: '30vh' }}>
            <div className="h-full flex flex-col">
              {/* Header - Fixed */}
              <div className="flex-shrink-0 px-4 py-2 flex items-center justify-between border-b border-zinc-200/50 dark:border-zinc-700">
                <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Edit Site Content</h2>
                <button
                  onClick={handleClose}
                  disabled={submitting}
                  className="rounded-full p-1.5 text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                  aria-label="Close Preview"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Content - Multi-column with vertical scroll */}
              <div className="flex-1 overflow-x-auto overflow-y-auto">
                {loading || websitesLoading ? (
                  <div className="py-4 px-4 text-center text-zinc-500 text-sm">Loading site information...</div>
                ) : (
                  <form onSubmit={handleSubmit} className="h-full">
                    {error && (
                      <div className="absolute top-14 left-4 right-4 rounded-lg bg-red-50 p-2 text-xs text-red-700 dark:bg-red-900/20 dark:text-red-300 z-20">
                        {error}
                      </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 px-4 py-3 h-full">
                      {/* Storefront Selector */}
                      <div className="flex-shrink-0 w-40">
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

                      {/* Hero Section */}
                      <div className="space-y-3 border-r border-zinc-200/50 dark:border-zinc-700 pr-4">
                        <h3 className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 mb-2">Hero Section</h3>
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
                            maxLength={100}
                          />
                        </div>
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
                        </div>
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
                        </div>
                      </div>

                      {/* Banner Section */}
                      <div className="space-y-3 border-r border-zinc-200/50 dark:border-zinc-700 pr-4">
                        <h3 className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 mb-2">Banner Settings</h3>
                        <div>
                          <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                            Banner Image
                          </label>
                          <label className="flex cursor-pointer items-center justify-center rounded border border-zinc-200 bg-white px-2 py-1 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800">
                            {form.heroBannerImage ? 'Replace' : 'Upload'}
                            <input
                              type="file"
                              accept="image/*"
                              onChange={async (e) => {
                                const file = e.target.files?.[0];
                                if (!file || !selectedStorefront) return;
                                try {
                                  const { getFirebaseApp } = await import('@/lib/firebase');
                                  const { getStorage, ref, uploadBytesResumable, getDownloadURL } = await import('firebase/storage');
                                  const app = getFirebaseApp();
                                  if (!app) return;
                                  const storage = getStorage(app);
                                  const timestamp = Date.now();
                                  const sanitizedFilename = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
                                  const storagePath = `banners/${selectedStorefront}/${timestamp}-${sanitizedFilename}`;
                                  const storageRef = ref(storage, storagePath);
                                  const uploadTask = uploadBytesResumable(storageRef, file);
                                  uploadTask.on('state_changed', null, null, async () => {
                                    const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
                                    setForm((prev) => ({ ...prev, heroBannerImage: downloadURL }));
                                  });
                                } catch (err) {
                                  console.error('Upload error:', err);
                                }
                              }}
                              className="hidden"
                            />
                          </label>
                          {form.heroBannerImage && (
                            <button
                              type="button"
                              onClick={() => {
                                if (window.confirm('Are you sure you want to remove the banner image? This will remove the banner from your homepage and the hero text will be displayed without a background image.')) {
                                  setForm((prev) => ({ ...prev, heroBannerImage: '' }));
                                }
                              }}
                              className="mt-1.5 w-full rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700 hover:bg-red-100 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300"
                            >
                              Remove
                            </button>
                          )}
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                            Max Height: {form.heroBannerMaxHeight}px
                          </label>
                          <input
                            type="range"
                            min="200"
                            max="1000"
                            value={form.heroBannerMaxHeight}
                            onChange={(e) => setForm((prev) => ({ ...prev, heroBannerMaxHeight: Number(e.target.value) }))}
                            className="w-full h-2 bg-zinc-200 rounded-lg appearance-none cursor-pointer dark:bg-zinc-700"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                            Margin Bottom: {form.heroBannerMarginBottom}px
                          </label>
                          <input
                            type="range"
                            min="0"
                            max="200"
                            value={form.heroBannerMarginBottom}
                            onChange={(e) => setForm((prev) => ({ ...prev, heroBannerMarginBottom: Number(e.target.value) }))}
                            className="w-full h-2 bg-zinc-200 rounded-lg appearance-none cursor-pointer dark:bg-zinc-700"
                          />
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

                      {/* Hero Text Settings Section */}
                      <div className="space-y-3 border-r border-zinc-200/50 dark:border-zinc-700 pr-4">
                        <h3 className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 mb-2">Hero Text Settings</h3>
                        <div>
                          <label htmlFor="heroMainHeadingFontFamily" className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                            Font Family
                          </label>
                          <select
                            id="heroMainHeadingFontFamily"
                            value={form.heroMainHeadingFontFamily}
                            onChange={(e) => setForm((prev) => ({ ...prev, heroMainHeadingFontFamily: e.target.value }))}
                            className="w-full rounded border border-zinc-200 px-2.5 py-1.5 text-xs focus:border-emerald-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                          >
                            <option value="inherit">Default (System)</option>
                            <option value="serif">Serif</option>
                            <option value="sans-serif">Sans Serif</option>
                            <option value="monospace">Monospace</option>
                            <option value="cursive">Cursive</option>
                            <option value="fantasy">Fantasy</option>
                            <option value="'Playfair Display', serif">Playfair Display</option>
                            <option value="'Roboto', sans-serif">Roboto</option>
                            <option value="'Open Sans', sans-serif">Open Sans</option>
                            <option value="'Montserrat', sans-serif">Montserrat</option>
                            <option value="'Lora', serif">Lora</option>
                            <option value="'Merriweather', serif">Merriweather</option>
                          </select>
                        </div>
                        <div>
                          <label htmlFor="heroMainHeadingFontStyle" className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                            Font Style
                          </label>
                          <select
                            id="heroMainHeadingFontStyle"
                            value={form.heroMainHeadingFontStyle}
                            onChange={(e) => setForm((prev) => ({ ...prev, heroMainHeadingFontStyle: e.target.value }))}
                            className="w-full rounded border border-zinc-200 px-2.5 py-1.5 text-xs focus:border-emerald-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                          >
                            <option value="normal">Normal</option>
                            <option value="italic">Italic</option>
                            <option value="oblique">Oblique</option>
                          </select>
                        </div>
                        <div>
                          <label htmlFor="heroMainHeadingFontWeight" className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                            Font Weight: {form.heroMainHeadingFontWeight}
                          </label>
                          <input
                            type="range"
                            min="100"
                            max="900"
                            step="100"
                            value={form.heroMainHeadingFontWeight}
                            onChange={(e) => setForm((prev) => ({ ...prev, heroMainHeadingFontWeight: e.target.value }))}
                            className="w-full h-2 bg-zinc-200 rounded-lg appearance-none cursor-pointer dark:bg-zinc-700"
                          />
                          <div className="mt-1 flex justify-between text-[10px] text-zinc-500">
                            <span>Thin</span>
                            <span>Normal</span>
                            <span>Bold</span>
                          </div>
                        </div>
                        <div>
                          <label htmlFor="heroMainHeadingFontSize" className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                            Font Size: {form.heroMainHeadingFontSize}px
                          </label>
                          <input
                            type="range"
                            min="24"
                            max="120"
                            step="2"
                            value={form.heroMainHeadingFontSize}
                            onChange={(e) => setForm((prev) => ({ ...prev, heroMainHeadingFontSize: Number(e.target.value) }))}
                            className="w-full h-2 bg-zinc-200 rounded-lg appearance-none cursor-pointer dark:bg-zinc-700"
                          />
                          <div className="mt-1 flex justify-between text-[10px] text-zinc-500">
                            <span>Small</span>
                            <span>Medium</span>
                            <span>Large</span>
                          </div>
                        </div>
                      </div>

                      {/* Category & Footer Section */}
                      <div className="space-y-3 border-r border-zinc-200/50 dark:border-zinc-700 pr-4">
                        <h3 className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 mb-2">Category & Footer</h3>
                        <div>
                          <label htmlFor="categorySectionHeading" className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                            Category Heading
                          </label>
                          <input
                            id="categorySectionHeading"
                            type="text"
                            value={form.categorySectionHeading}
                            onChange={(e) => setForm((prev) => ({ ...prev, categorySectionHeading: e.target.value }))}
                            className="w-full rounded border border-zinc-200 px-2.5 py-1.5 text-xs focus:border-emerald-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                            placeholder="Shop by category"
                            maxLength={50}
                          />
                        </div>
                        <div>
                          <label htmlFor="categorySectionDescription" className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                            Category Description
                          </label>
                          <textarea
                            id="categorySectionDescription"
                            value={form.categorySectionDescription}
                            onChange={(e) => setForm((prev) => ({ ...prev, categorySectionDescription: e.target.value }))}
                            className="w-full rounded border border-zinc-200 px-2.5 py-1.5 text-xs focus:border-emerald-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 resize-none"
                            placeholder="Choose a category..."
                            rows={2}
                            maxLength={150}
                          />
                        </div>
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
                        </div>
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
                        </div>
                      </div>

                      {/* Color Palette Section */}
                      <div className="space-y-3 border-r border-zinc-200/50 dark:border-zinc-700 pr-4">
                        <h3 className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 mb-2">Color Palette</h3>
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
                              value={form.colorPrimary || ''}
                              onChange={(e) => {
                                const val = e.target.value;
                                if (val === '' || /^#[0-9A-Fa-f]{0,6}$/.test(val)) {
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
                              value={form.colorSecondary || ''}
                              onChange={(e) => {
                                const val = e.target.value;
                                if (val === '' || /^#[0-9A-Fa-f]{0,6}$/.test(val)) {
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
                              value={form.colorTertiary || ''}
                              onChange={(e) => {
                                const val = e.target.value;
                                if (val === '' || /^#[0-9A-Fa-f]{0,6}$/.test(val)) {
                                  setForm((prev) => ({ ...prev, colorTertiary: val }));
                                }
                              }}
                              placeholder="#94a3b8"
                              className="flex-1 rounded border border-zinc-200 px-2 py-1 text-xs font-mono focus:border-emerald-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Text Color Assignments Section */}
                      <div className="space-y-3">
                        <h3 className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 mb-2">Text Color Assignments</h3>
                        <div>
                          <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                            Hero Desc Color
                          </label>
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
                        <div>
                          <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                            Category Desc Color
                          </label>
                          <select
                            value={form.categoryDescriptionColor || 'secondary'}
                            onChange={(e) => setForm((prev) => ({ ...prev, categoryDescriptionColor: e.target.value }))}
                            className="w-full rounded border border-zinc-200 px-2.5 py-1.5 text-xs focus:border-emerald-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                          >
                            <option value="primary">Primary</option>
                            <option value="secondary">Secondary</option>
                            <option value="tertiary">Tertiary</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                            Footer Text Color
                          </label>
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
                        {/* Action Buttons */}
                        <div className="flex items-center gap-2 pt-2">
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
                            disabled={submitting}
                            className="rounded bg-emerald-600 px-4 py-2 text-xs font-medium text-white transition hover:bg-emerald-700 disabled:opacity-50"
                          >
                            {submitting ? 'Saving...' : 'Save'}
                          </button>
                        </div>
                      </div>
                    </div>
                  </form>
                )}
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

