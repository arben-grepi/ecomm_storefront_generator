'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { getFirebaseDb } from '@/lib/firebase';
import { useWebsite } from '@/lib/website-context';
import Toast from '@/components/admin/Toast';

export default function EditSiteInfoButton({ className = '' }) {
  const db = getFirebaseDb();
  const { selectedWebsite, availableWebsites, loading: websitesLoading } = useWebsite();
  const [open, setOpen] = useState(false);
  const [selectedStorefront, setSelectedStorefront] = useState(null);
  const [form, setForm] = useState({
    companyTagline: '',
    heroMainHeading: '',
    heroDescription: '',
    categorySectionHeading: '',
    categorySectionDescription: '',
    allCategoriesTagline: '',
    footerText: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);

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
          categorySectionHeading: data.categorySectionHeading || '',
          categorySectionDescription: data.categorySectionDescription || '',
          allCategoriesTagline: data.allCategoriesTagline || '',
          footerText: data.footerText || '',
        });
      } else {
        // Initialize with empty values if document doesn't exist
        setForm({
          companyTagline: '',
          heroMainHeading: '',
          heroDescription: '',
          categorySectionHeading: '',
          categorySectionDescription: '',
          allCategoriesTagline: '',
          footerText: '',
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
      categorySectionHeading: '',
      categorySectionDescription: '',
      allCategoriesTagline: '',
      footerText: '',
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
        categorySectionHeading: form.categorySectionHeading.trim() || '',
        categorySectionDescription: form.categorySectionDescription.trim() || '',
        allCategoriesTagline: form.allCategoriesTagline.trim() || '',
        footerText: form.footerText.trim() || '',
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
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={handleClose}
        >
      <div
        className="w-full max-w-2xl rounded-3xl border border-zinc-200/70 bg-white/90 p-6 shadow-xl backdrop-blur-sm dark:border-zinc-800/80 dark:bg-zinc-900/90"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-xl font-semibold">Edit Site Content</h2>
          <button
            onClick={handleClose}
            disabled={submitting}
            className="rounded-full p-2 text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
            aria-label="Close"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {loading || websitesLoading ? (
          <div className="py-8 text-center text-zinc-500">Loading site information...</div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="rounded-2xl bg-red-50 p-4 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-300">
                {error}
              </div>
            )}

            {/* Storefront Selector */}
            <div>
              <label htmlFor="storefront-select" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                Select Storefront *
              </label>
              {availableWebsites.length === 0 ? (
                <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400">
                  No storefronts available
                </div>
              ) : (
                <select
                  id="storefront-select"
                  value={selectedStorefront || ''}
                  onChange={(e) => setSelectedStorefront(e.target.value)}
                  className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-400/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:focus:border-emerald-500"
                  required
                >
                  <option value="">Select a storefront...</option>
                  {availableWebsites.map((storefront) => (
                    <option key={storefront} value={storefront}>
                      {storefront}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div>
              <label htmlFor="companyTagline" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Company Tagline
              </label>
              <input
                id="companyTagline"
                type="text"
                value={form.companyTagline}
                onChange={(e) => setForm((prev) => ({ ...prev, companyTagline: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                placeholder="Effortless softness for every day and night in."
                maxLength={100}
              />
            </div>

            <div>
              <label htmlFor="heroMainHeading" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Hero Main Heading
              </label>
              <input
                id="heroMainHeading"
                type="text"
                value={form.heroMainHeading}
                onChange={(e) => setForm((prev) => ({ ...prev, heroMainHeading: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                placeholder="Curated collections for every mood and moment."
                maxLength={80}
              />
            </div>

            <div>
              <label htmlFor="heroDescription" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Hero Description
              </label>
              <textarea
                id="heroDescription"
                value={form.heroDescription}
                onChange={(e) => setForm((prev) => ({ ...prev, heroDescription: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                placeholder="From delicate lace to active-ready comfort. Discover the pieces that make you feel confident, effortless, and beautifully yourself."
                rows={3}
                maxLength={200}
              />
            </div>

            <div>
              <label htmlFor="categorySectionHeading" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Category Section Heading
              </label>
              <input
                id="categorySectionHeading"
                type="text"
                value={form.categorySectionHeading}
                onChange={(e) => setForm((prev) => ({ ...prev, categorySectionHeading: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                placeholder="Shop by category"
                maxLength={50}
              />
            </div>

            <div>
              <label htmlFor="categorySectionDescription" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Category Section Description
              </label>
              <textarea
                id="categorySectionDescription"
                value={form.categorySectionDescription}
                onChange={(e) => setForm((prev) => ({ ...prev, categorySectionDescription: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                placeholder="Choose a category to explore this week's top four bestsellers, refreshed daily."
                rows={2}
                maxLength={150}
              />
            </div>

            <div>
              <label htmlFor="allCategoriesTagline" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                All Categories Tagline
              </label>
              <input
                id="allCategoriesTagline"
                type="text"
                value={form.allCategoriesTagline}
                onChange={(e) => setForm((prev) => ({ ...prev, allCategoriesTagline: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                placeholder="Choose a category to explore this week's top four bestsellers, refreshed daily."
                maxLength={100}
              />
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                This text appears below the category breadcrumbs when "All Categories" is selected.
              </p>
            </div>

            <div>
              <label htmlFor="footerText" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Footer Text
              </label>
              <input
                id="footerText"
                type="text"
                value={form.footerText}
                onChange={(e) => setForm((prev) => ({ ...prev, footerText: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                placeholder="© 2024 Lingerie Boutique. All rights reserved."
                maxLength={100}
              />
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <button
                type="button"
                onClick={handleClose}
                disabled={submitting}
                className="rounded-full border border-zinc-200/70 px-5 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-800/80 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="rounded-full bg-emerald-600 px-5 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:opacity-50"
              >
                {submitting ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>,
    document.body
      )}
    </>
  );
}

