'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { addDoc, collection, doc, getDocs, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { getFirebaseDb } from '@/lib/firebase';
import { getStoreCollectionPath, getStoreDocPath } from '@/lib/store-collections';

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
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', imageUrl: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (mode === 'edit' && category) {
      setForm({
        name: category.name || '',
        description: category.description || '',
        imageUrl: category.imageUrl || '',
      });
    } else {
      setForm({ name: '', description: '', imageUrl: '' });
    }
  }, [mode, category, open]);

  const resetState = () => {
    setForm({ name: '', description: '', imageUrl: '' });
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

      if (mode === 'edit' && category) {
        // When editing, check if the new name conflicts with another category
        const nameQuery = query(
          collection(db, ...getStoreCollectionPath('categories')),
          where('name', '==', trimmedName)
        );
        const nameSnapshot = await getDocs(nameQuery);
        const conflictingName = nameSnapshot.docs.find((doc) => doc.id !== category.id);

        if (conflictingName) {
          setError(`A category with the name "${trimmedName}" already exists.`);
          setSubmitting(false);
          return;
        }

        const payload = {
          name: trimmedName,
          slug: newSlug,
          description: form.description.trim(),
          imageUrl: form.imageUrl.trim() || null,
          updatedAt: serverTimestamp(),
        };

        await updateDoc(doc(db, ...getStoreDocPath('categories', category.id)), payload);

        if (onCompleted) {
          onCompleted({ id: category.id, ...category, ...payload });
        }
      } else {
        // When creating, check if category with same name or slug already exists
        const nameQuery = query(
          collection(db, ...getStoreCollectionPath('categories')),
          where('name', '==', trimmedName)
        );
        const slugQuery = query(
          collection(db, ...getStoreCollectionPath('categories')),
          where('slug', '==', newSlug)
        );

        const [nameSnapshot, slugSnapshot] = await Promise.all([
          getDocs(nameQuery),
          getDocs(slugQuery),
        ]);

        if (!nameSnapshot.empty) {
          setError(`A category with the name "${trimmedName}" already exists.`);
          setSubmitting(false);
          return;
        }

        if (!slugSnapshot.empty) {
          setError(`A category with the slug "${newSlug}" already exists.`);
          setSubmitting(false);
          return;
        }

        const payload = {
          name: trimmedName,
          slug: newSlug,
          description: form.description.trim(),
          imageUrl: form.imageUrl.trim() || null,
          active: true,
          metrics: {
            totalViews: 0,
            lastViewedAt: null,
          },
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };

        const docRef = await addDoc(collection(db, ...getStoreCollectionPath('categories')), payload);
        const createdCategory = { id: docRef.id, ...payload };
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
