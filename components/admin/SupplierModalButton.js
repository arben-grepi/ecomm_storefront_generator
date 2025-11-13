'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { addDoc, collection, doc, getDocs, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { getFirebaseDb } from '@/lib/firebase';
import { getStoreCollectionPath, getStoreDocPath } from '@/lib/store-collections';

export default function SupplierModalButton({
  mode = 'create',
  triggerLabel,
  supplier,
  onCompleted,
  className = '',
}) {
  const db = getFirebaseDb();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: '',
    contactEmail: '',
    phone: '',
    address: { street: '', city: '', state: '', zip: '', country: '' },
    notes: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (mode === 'edit' && supplier) {
      setForm({
        name: supplier.name || '',
        contactEmail: supplier.contactEmail || '',
        phone: supplier.phone || '',
        address: supplier.address || { street: '', city: '', state: '', zip: '', country: '' },
        notes: supplier.notes || '',
      });
    } else {
      setForm({
        name: '',
        contactEmail: '',
        phone: '',
        address: { street: '', city: '', state: '', zip: '', country: '' },
        notes: '',
      });
    }
  }, [mode, supplier, open]);

  const resetState = () => {
    setForm({
      name: '',
      contactEmail: '',
      phone: '',
      address: { street: '', city: '', state: '', zip: '', country: '' },
      notes: '',
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

    if (!form.name.trim()) {
      setError('Name is required.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const trimmedName = form.name.trim();

      if (mode === 'edit' && supplier) {
        // When editing, check if the new name conflicts with another supplier
        const nameQuery = query(
          collection(db, ...getStoreCollectionPath('suppliers')),
          where('name', '==', trimmedName)
        );
        const nameSnapshot = await getDocs(nameQuery);
        const conflictingName = nameSnapshot.docs.find((doc) => doc.id !== supplier.id);

        if (conflictingName) {
          setError(`A supplier with the name "${trimmedName}" already exists.`);
          setSubmitting(false);
          return;
        }

        const payload = {
          name: trimmedName,
          contactEmail: form.contactEmail.trim() || null,
          phone: form.phone.trim() || null,
          address: form.address,
          notes: form.notes.trim() || null,
          updatedAt: serverTimestamp(),
        };

        await updateDoc(doc(db, ...getStoreDocPath('suppliers', supplier.id)), payload);

        if (onCompleted) {
          onCompleted({ id: supplier.id, ...supplier, ...payload });
        }
      } else {
        // When creating, check if supplier with same name already exists
        const nameQuery = query(
          collection(db, ...getStoreCollectionPath('suppliers')),
          where('name', '==', trimmedName)
        );
        const nameSnapshot = await getDocs(nameQuery);

        if (!nameSnapshot.empty) {
          setError(`A supplier with the name "${trimmedName}" already exists.`);
          setSubmitting(false);
          return;
        }

        const payload = {
          name: trimmedName,
          contactEmail: form.contactEmail.trim() || null,
          phone: form.phone.trim() || null,
          address: form.address,
          notes: form.notes.trim() || null,
          createdAt: serverTimestamp(),
        };

        const docRef = await addDoc(collection(db, ...getStoreCollectionPath('suppliers')), payload);
        const createdSupplier = { id: docRef.id, ...payload };
        if (onCompleted) {
          onCompleted(createdSupplier);
        }
      }

      resetState();
      setOpen(false);
    } catch (submitError) {
      console.error('Failed to save supplier', submitError);
      const errorMessage = submitError?.message || 'Failed to save supplier. Please try again.';
      const errorCode = submitError?.code ? ` (${submitError.code})` : '';
      setError(`${errorMessage}${errorCode}`);
      setSubmitting(false);
    }
  };

  const title = mode === 'edit' ? 'Edit supplier' : 'Create supplier';
  const submitLabel = mode === 'edit' ? 'Save changes' : 'Create supplier';

  return (
    <>
      <div className="relative group">
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setError(null);
            setOpen(true);
          }}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-zinc-200/70 text-zinc-500 transition hover:border-emerald-200 hover:bg-emerald-50/50 hover:text-emerald-600"
          aria-label="Create new supplier"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </button>
        <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-48 rounded-lg bg-zinc-900 px-3 py-2 text-xs text-white shadow-lg opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50">
          Create a new supplier
          <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-zinc-900" />
        </div>
      </div>

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
            <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
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
                  placeholder="Supplier name"
                  required
                />
              </label>

              <label className="flex flex-col gap-2">
                <span className="text-sm font-medium text-zinc-600">Contact Email</span>
                <input
                  type="email"
                  value={form.contactEmail}
                  onChange={(event) => setForm((prev) => ({ ...prev, contactEmail: event.target.value }))}
                  className="rounded-xl border border-zinc-200 px-4 py-2 text-sm focus:border-emerald-400 focus:outline-none"
                  placeholder="supplier@example.com"
                />
              </label>

              <label className="flex flex-col gap-2">
                <span className="text-sm font-medium text-zinc-600">Phone</span>
                <input
                  type="tel"
                  value={form.phone}
                  onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))}
                  className="rounded-xl border border-zinc-200 px-4 py-2 text-sm focus:border-emerald-400 focus:outline-none"
                  placeholder="+1 234 567 8900"
                />
              </label>

              <div className="space-y-2">
                <span className="text-sm font-medium text-zinc-600">Address</span>
                <div className="grid gap-2">
                  <input
                    type="text"
                    value={form.address.street}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        address: { ...prev.address, street: event.target.value },
                      }))
                    }
                    className="rounded-xl border border-zinc-200 px-4 py-2 text-sm focus:border-emerald-400 focus:outline-none"
                    placeholder="Street address"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={form.address.city}
                      onChange={(event) =>
                        setForm((prev) => ({
                          ...prev,
                          address: { ...prev.address, city: event.target.value },
                        }))
                      }
                      className="rounded-xl border border-zinc-200 px-4 py-2 text-sm focus:border-emerald-400 focus:outline-none"
                      placeholder="City"
                    />
                    <input
                      type="text"
                      value={form.address.state}
                      onChange={(event) =>
                        setForm((prev) => ({
                          ...prev,
                          address: { ...prev.address, state: event.target.value },
                        }))
                      }
                      className="rounded-xl border border-zinc-200 px-4 py-2 text-sm focus:border-emerald-400 focus:outline-none"
                      placeholder="State"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={form.address.zip}
                      onChange={(event) =>
                        setForm((prev) => ({
                          ...prev,
                          address: { ...prev.address, zip: event.target.value },
                        }))
                      }
                      className="rounded-xl border border-zinc-200 px-4 py-2 text-sm focus:border-emerald-400 focus:outline-none"
                      placeholder="ZIP"
                    />
                    <input
                      type="text"
                      value={form.address.country}
                      onChange={(event) =>
                        setForm((prev) => ({
                          ...prev,
                          address: { ...prev.address, country: event.target.value },
                        }))
                      }
                      className="rounded-xl border border-zinc-200 px-4 py-2 text-sm focus:border-emerald-400 focus:outline-none"
                      placeholder="Country"
                    />
                  </div>
                </div>
              </div>

              <label className="flex flex-col gap-2">
                <span className="text-sm font-medium text-zinc-600">Notes</span>
                <textarea
                  value={form.notes}
                  onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
                  rows={3}
                  className="rounded-xl border border-zinc-200 px-4 py-2 text-sm focus:border-emerald-400 focus:outline-none"
                  placeholder="Internal notes"
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

