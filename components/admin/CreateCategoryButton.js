'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { addDoc, collection, doc, getDoc, getDocs, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore';
import { getFirebaseDb } from '@/lib/firebase';
import { getCollectionPath, getDocumentPath } from '@/lib/store-collections';
import { useWebsite } from '@/lib/website-context';

const slugify = (value) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');

export default function CategoryModalButton({
  mode = 'create',
  triggerLabel,
  category,
  onCompleted,
  className = '',
}) {
  const db = getFirebaseDb();
  const { selectedWebsite, availableWebsites, loading: websitesLoading } = useWebsite();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', imageUrl: '' });
  const [storefrontSelections, setStorefrontSelections] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (mode === 'edit' && category) {
      setForm({
        name: category.name || '',
        description: category.description || '',
        imageUrl: category.imageUrl || '',
      });
      // Set storefront selections from category.storefronts
      if (Array.isArray(category.storefronts) && category.storefronts.length > 0) {
        setStorefrontSelections(category.storefronts);
      } else {
        setStorefrontSelections([selectedWebsite]);
      }
    } else {
      setForm({ name: '', description: '', imageUrl: '' });
      // Initialize storefront selections for create mode - start with empty array (no preselection)
      setStorefrontSelections([]);
    }
  }, [mode, category, open, selectedWebsite, availableWebsites]);

  const resetState = () => {
    setForm({ name: '', description: '', imageUrl: '' });
    setStorefrontSelections([]);
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

    if (!form.name.trim()) {
      setError('Name is required.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const trimmedName = form.name.trim();
      const newSlug = slugify(trimmedName);

      // Get selected storefronts (must have at least one)
      const selectedStorefronts = storefrontSelections;
      
      if (selectedStorefronts.length === 0) {
        setError('Please select at least one storefront.');
        setSubmitting(false);
        return;
      }

      if (mode === 'edit' && category) {
        // When editing, update category in all selected storefronts
        // Check for name conflicts in each storefront
        for (const storefront of selectedStorefronts) {
          const nameQuery = query(
            collection(db, ...getCollectionPath('categories', storefront)),
            where('name', '==', trimmedName)
          );
          const nameSnapshot = await getDocs(nameQuery);
          const conflictingName = nameSnapshot.docs.find((doc) => doc.id !== category.id);

          if (conflictingName) {
            setError(`A category with the name "${trimmedName}" already exists in ${storefront}.`);
            setSubmitting(false);
            return;
          }
        }

        const payload = {
          name: trimmedName,
          slug: newSlug,
          description: form.description.trim(),
          imageUrl: form.imageUrl.trim() || null,
          storefronts: selectedStorefronts,
          updatedAt: serverTimestamp(),
        };

        // Update category in all selected storefronts
        // First, find which storefront the category currently exists in
        let categoryStorefront = null;
        const allStorefronts = availableWebsites.length > 0 ? availableWebsites : ['LUNERA'];
        for (const storefront of allStorefronts) {
          const categoryDocRef = doc(db, ...getDocumentPath('categories', category.id, storefront));
          const categoryDoc = await getDoc(categoryDocRef);
          if (categoryDoc.exists()) {
            categoryStorefront = storefront;
            break;
          }
        }

        // Update in the original storefront
        if (categoryStorefront) {
          await updateDoc(doc(db, ...getDocumentPath('categories', category.id, categoryStorefront)), payload);
        }

        // Create/update in other selected storefronts
        for (const storefront of selectedStorefronts) {
          if (storefront === categoryStorefront) continue; // Already updated above
          
          const categoryDocRef = doc(db, ...getDocumentPath('categories', category.id, storefront));
          const existingDoc = await getDoc(categoryDocRef);
          
          if (existingDoc.exists()) {
            // Update existing
            await updateDoc(categoryDocRef, payload);
          } else {
            // Create new in this storefront with the same ID
            const newPayload = {
              ...payload,
              active: true,
              metrics: {
                totalViews: 0,
                lastViewedAt: null,
              },
              createdAt: serverTimestamp(),
            };
            await setDoc(categoryDocRef, newPayload);
          }
        }

        if (onCompleted) {
          onCompleted({
            id: category.id,
            ...category,
            ...payload,
          });
        }
      } else {
        // When creating, check if category with same name or slug already exists in any selected storefront
        for (const storefront of selectedStorefronts) {
          const baseCollection = collection(db, ...getCollectionPath('categories', storefront));
          const nameQuery = query(
            baseCollection,
            where('name', '==', trimmedName)
          );
          const slugQuery = query(
            baseCollection,
            where('slug', '==', newSlug)
          );

          const [nameSnapshot, slugSnapshot] = await Promise.all([
            getDocs(nameQuery),
            getDocs(slugQuery),
          ]);

          if (!nameSnapshot.empty) {
            setError(`A category with the name "${trimmedName}" already exists in ${storefront}.`);
            setSubmitting(false);
            return;
          }

          if (!slugSnapshot.empty) {
            setError(`A category with the slug "${newSlug}" already exists in ${storefront}.`);
            setSubmitting(false);
            return;
          }
        }

        // Create category in all selected storefronts
        let categoryIdToUse = null;
        const payload = {
          name: trimmedName,
          slug: newSlug,
          description: form.description.trim(),
          imageUrl: form.imageUrl.trim() || null,
          active: true,
          storefronts: selectedStorefronts,
          metrics: {
            totalViews: 0,
            lastViewedAt: null,
          },
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };

        // Create in first storefront to get the ID
        const firstStorefront = selectedStorefronts[0];
        const firstCollection = collection(db, ...getCollectionPath('categories', firstStorefront));
        const docRef = await addDoc(firstCollection, payload);
        categoryIdToUse = docRef.id;

        // Create in remaining storefronts with the same ID
        for (let i = 1; i < selectedStorefronts.length; i++) {
          const storefront = selectedStorefronts[i];
          await setDoc(doc(db, ...getDocumentPath('categories', categoryIdToUse, storefront)), payload);
        }

        const createdCategory = { id: categoryIdToUse, ...payload };
        if (onCompleted) {
          onCompleted(createdCategory);
        }
      }

      resetState();
      setOpen(false);
    } catch (submitError) {
      console.error('Failed to save category', submitError);
      const errorMessage = submitError?.message || 'Failed to save category. Please try again.';
      const errorCode = submitError?.code ? ` (${submitError.code})` : '';
      setError(`${errorMessage}${errorCode}`);
      setSubmitting(false);
    }
  };

  const title = mode === 'edit' ? 'Edit category' : 'Create category';
  const submitLabel = mode === 'edit' ? 'Save changes' : 'Create category';

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setError(null);
          setOpen(true);
        }}
        className={className || 'rounded-full border border-zinc-200/70 px-3 py-1.5 text-xs font-medium text-zinc-600 transition hover:border-emerald-200 hover:bg-emerald-50/50'}
        aria-label={mode === 'edit' ? 'Edit category' : 'Create new category'}
      >
        {triggerLabel || (mode === 'edit' ? 'Edit' : (
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        ))}
      </button>

      {open &&
        typeof window !== 'undefined' &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 px-4"
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                resetState();
                setOpen(false);
              }
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-zinc-800">{title}</h2>
              <button
                type="button"
                onClick={() => {
                  resetState();
                  setOpen(false);
                }}
                className="rounded-full p-1 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-600"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} onClick={(e) => e.stopPropagation()} className="mt-6 space-y-4">
              <label className="flex flex-col gap-2">
                <span className="text-sm font-medium text-zinc-600">Name *</span>
                <input
                  type="text"
                  value={form.name}
                  onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                  className="rounded-xl border border-zinc-200 px-4 py-2 text-sm focus:border-emerald-400 focus:outline-none"
                  placeholder="Accessories"
                  required
                />
              </label>

              <label className="flex flex-col gap-2">
                <span className="text-sm font-medium text-zinc-600">Description</span>
                <textarea
                  value={form.description}
                  onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
                  rows={3}
                  className="rounded-xl border border-zinc-200 px-4 py-2 text-sm focus:border-emerald-400 focus:outline-none"
                  placeholder="Optional description shown in admin listings."
                />
              </label>

              <label className="flex flex-col gap-2">
                <span className="text-sm font-medium text-zinc-600">Image URL</span>
                <input
                  type="url"
                  value={form.imageUrl}
                  onChange={(event) => setForm((prev) => ({ ...prev, imageUrl: event.target.value }))}
                  className="rounded-xl border border-zinc-200 px-4 py-2 text-sm focus:border-emerald-400 focus:outline-none"
                  placeholder="https://..."
                />
              </label>

              {/* Storefront Selection */}
              <div>
                <label className="block text-sm font-medium text-zinc-600 mb-2">
                  Assign to Storefronts *
                </label>
                {websitesLoading || availableWebsites.length === 0 ? (
                  <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-500">
                    {websitesLoading ? 'Loading storefronts...' : 'No storefronts available'}
                  </div>
                ) : (
                  <>
                    <div className="space-y-2 rounded-lg border border-zinc-200 bg-white p-3">
                      {availableWebsites.map((storefront) => {
                        const isSelected = storefrontSelections.includes(storefront);
                        return (
                          <label
                            key={storefront}
                            className="flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 transition hover:bg-zinc-50"
                            style={{
                              borderColor: isSelected ? '#10b981' : undefined,
                              backgroundColor: isSelected ? '#ecfdf5' : undefined,
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setStorefrontSelections([...storefrontSelections, storefront]);
                                } else {
                                  // Prevent unchecking if it's the only selected storefront
                                  if (storefrontSelections.length > 1) {
                                    setStorefrontSelections(storefrontSelections.filter(s => s !== storefront));
                                  } else {
                                    e.preventDefault();
                                    setError('At least one storefront must be selected.');
                                  }
                                }
                              }}
                              className="h-4 w-4 rounded border-zinc-300 text-emerald-600 focus:ring-2 focus:ring-emerald-500 focus:ring-offset-0"
                            />
                            <span className="flex-1 text-sm font-medium text-zinc-700">
                              {storefront}
                            </span>
                            {isSelected && (
                              <svg className="h-5 w-5 text-emerald-600" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                              </svg>
                            )}
                          </label>
                        );
                      })}
                    </div>
                    <p className="mt-2 text-xs text-zinc-500">
                      Select one or more storefronts where this category should appear. At least one must be selected.
                    </p>
                  </>
                )}
              </div>

              {error && <p className="text-sm text-rose-600">{error}</p>}

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    resetState();
                    setOpen(false);
                  }}
                  className="text-sm font-medium text-zinc-500 transition hover:text-zinc-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-full bg-emerald-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submitting ? 'Saving…' : submitLabel}
                </button>
              </div>
            </form>
          </div>
        </div>,
          document.body
        )}
    </>
  );
}
