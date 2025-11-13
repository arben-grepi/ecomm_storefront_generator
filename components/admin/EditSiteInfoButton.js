'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { getFirebaseDb } from '@/lib/firebase';
import Toast from '@/components/admin/Toast';

export default function EditSiteInfoButton({ className = '' }) {
  const db = getFirebaseDb();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: '',
    slogan: '',
    heroMainHeading: '',
    heroDescr: '',
    categoryDesc: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);

  useEffect(() => {
    if (open && db) {
      loadSiteInfo();
    }
  }, [open, db]);

  const loadSiteInfo = async () => {
    if (!db) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const infoDoc = await getDoc(doc(db, 'LUNERA', 'Info'));
      
      if (infoDoc.exists()) {
        const data = infoDoc.data();
        setForm({
          name: data.name || '',
          slogan: data.slogan || '',
          heroMainHeading: data.heroMainHeading || '',
          heroDescr: data.heroDescr || '',
          categoryDesc: data.categoryDesc || '',
        });
      } else {
        // Initialize with empty values if document doesn't exist
        setForm({
          name: '',
          slogan: '',
          heroMainHeading: '',
          heroDescr: '',
          categoryDesc: '',
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
      name: '',
      slogan: '',
      heroMainHeading: '',
      heroDescr: '',
      categoryDesc: '',
    });
    setSubmitting(false);
    setError(null);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    event.stopPropagation();
    
    if (!db) {
      setError('Firestore is not configured.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const payload = {
        name: form.name.trim() || '',
        slogan: form.slogan.trim() || '',
        heroMainHeading: form.heroMainHeading.trim() || '',
        heroDescr: form.heroDescr.trim() || '',
        categoryDesc: form.categoryDesc.trim() || '',
        updatedAt: serverTimestamp(),
      };

      await setDoc(doc(db, 'LUNERA', 'Info'), payload, { merge: true });

      // Close modal and reset
      setOpen(false);
      resetState();
      
      // Show success toast
      setToastMessage({ type: 'success', text: 'Site information updated successfully!' });
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

        {loading ? (
          <div className="py-8 text-center text-zinc-500">Loading site information...</div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="rounded-2xl bg-red-50 p-4 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-300">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="name" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Company Name
              </label>
              <input
                id="name"
                type="text"
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                placeholder="Lunera"
                maxLength={50}
              />
            </div>

            <div>
              <label htmlFor="slogan" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Company Tagline
              </label>
              <input
                id="slogan"
                type="text"
                value={form.slogan}
                onChange={(e) => setForm((prev) => ({ ...prev, slogan: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                placeholder="softness for every day and night in."
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
              <label htmlFor="heroDescr" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Hero Description
              </label>
              <textarea
                id="heroDescr"
                value={form.heroDescr}
                onChange={(e) => setForm((prev) => ({ ...prev, heroDescr: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                placeholder="From delicate lace to active-ready comfort. Discover the pieces that make you feel confident, effortless, and beautifully yourself."
                rows={3}
                maxLength={200}
              />
            </div>

            <div>
              <label htmlFor="categoryDesc" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Category Section Description
              </label>
              <textarea
                id="categoryDesc"
                value={form.categoryDesc}
                onChange={(e) => setForm((prev) => ({ ...prev, categoryDesc: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                placeholder="Choose a category to explore this week's top four bestsellers, refreshed daily."
                rows={2}
                maxLength={150}
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

