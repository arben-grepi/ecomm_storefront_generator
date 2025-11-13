'use client';

import { useState, useEffect, useImperativeHandle, forwardRef } from 'react';
import { doc, addDoc, updateDoc, deleteDoc, collection, serverTimestamp } from 'firebase/firestore';
import { getStoreDocPath } from '@/lib/store-collections';

const VariantRow = forwardRef(function VariantRow({ variant, productId, basePrice, onUpdate, onDelete, db, setMessage, suppressMessages }, ref) {
  const [editing, setEditing] = useState(variant.isNew || false);
  const [form, setForm] = useState({
    size: variant.size || '',
    color: variant.color || '',
    sku: variant.sku || '',
    stock: variant.stock?.toString() || '0',
    priceOverride: variant.priceOverride?.toString() || '',
    image: variant.image || '',
  });
  const [saving, setSaving] = useState(false);
  const [imageError, setImageError] = useState(false);

  // Reset image error when variant image changes
  useEffect(() => {
    setImageError(false);
  }, [variant.image]);

  // Expose methods to parent component
  useImperativeHandle(ref, () => ({
    isEditing: editing,
    getFormData: () => form,
    save: (suppressMsg = false) => {
      const originalSuppress = suppressMessages;
      return handleSave(suppressMsg || originalSuppress);
    },
  }));

  const handleSave = async (suppressMsg = false) => {
    if (!db) {
      throw new Error('Firestore is not configured.');
    }

    // Validate before saving
    const stock = parseInt(form.stock, 10);
    if (Number.isNaN(stock) || stock < 0) {
      throw new Error('Stock must be a valid number (0 or greater).');
    }

    const priceOverride = form.priceOverride && form.priceOverride.trim() ? parseFloat(form.priceOverride) : null;
    if (priceOverride !== null && (Number.isNaN(priceOverride) || priceOverride < 0)) {
      throw new Error('Price override must be a valid number (0 or greater).');
    }

    setSaving(true);
    try {
      const payload = {
        size: form.size.trim() || null,
        color: form.color.trim() || null,
        sku: form.sku.trim() || null,
        stock,
        priceOverride,
        image: form.image.trim() || null,
        updatedAt: serverTimestamp(),
      };

      if (variant.isNew) {
        // Create new variant
        payload.createdAt = serverTimestamp();
        payload.metrics = {
          totalViews: 0,
          totalAddedToCart: 0,
          totalPurchases: 0,
        };
        const docRef = await addDoc(collection(db, ...getStoreDocPath('products', productId), 'variants'), payload);
        onUpdate({ id: docRef.id, ...payload });
        if (!suppressMsg && !suppressMessages && setMessage) {
          setMessage({ type: 'success', text: 'Variant created successfully.' });
        }
      } else {
        // Update existing variant
        await updateDoc(doc(db, ...getStoreDocPath('products', productId), 'variants', variant.id), payload);
        onUpdate({ ...variant, ...payload });
        if (!suppressMsg && !suppressMessages && setMessage) {
          setMessage({ type: 'success', text: 'Variant updated successfully.' });
        }
      }

      setEditing(false);
      return true; // Success
    } catch (error) {
      console.error('Error saving variant', error);
      const errorMessage = error.message || 'Failed to save variant. Check console for details.';
      if (!suppressMsg && setMessage) {
        setMessage({ type: 'error', text: errorMessage });
      }
      throw error; // Re-throw so parent can handle it
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!db || variant.isNew) {
      onDelete();
      return;
    }

    if (!confirm(`Delete variant ${variant.size || variant.color || 'this variant'}?`)) {
      return;
    }

    try {
      await deleteDoc(doc(db, ...getStoreDocPath('products', productId), 'variants', variant.id));
      onDelete();
      setMessage({ type: 'success', text: 'Variant deleted successfully.' });
    } catch (error) {
      console.error('Error deleting variant', error);
      setMessage({ type: 'error', text: 'Failed to delete variant. Check console for details.' });
    }
  };

  if (editing) {
    return (
      <tr className="bg-emerald-50/30">
        <td className="px-4 py-3">
          <input
            type="text"
            value={form.size}
            onChange={(e) => setForm((prev) => ({ ...prev, size: e.target.value }))}
            className="w-full rounded-lg border border-zinc-200 px-2 py-1 text-sm focus:border-emerald-400 focus:outline-none"
            placeholder="S, M, L"
          />
        </td>
        <td className="px-4 py-3">
          <input
            type="text"
            value={form.color}
            onChange={(e) => setForm((prev) => ({ ...prev, color: e.target.value }))}
            className="w-full rounded-lg border border-zinc-200 px-2 py-1 text-sm focus:border-emerald-400 focus:outline-none"
            placeholder="Black, Red"
          />
        </td>
        <td className="px-4 py-3">
          <input
            type="text"
            value={form.sku}
            onChange={(e) => setForm((prev) => ({ ...prev, sku: e.target.value }))}
            className="w-full rounded-lg border border-zinc-200 px-2 py-1 text-sm focus:border-emerald-400 focus:outline-none"
            placeholder="SKU-001"
          />
        </td>
        <td className="px-4 py-3">
          <input
            type="number"
            min="0"
            value={form.stock}
            onChange={(e) => setForm((prev) => ({ ...prev, stock: e.target.value }))}
            className="w-full rounded-lg border border-zinc-200 px-2 py-1 text-sm focus:border-emerald-400 focus:outline-none"
            placeholder="0"
          />
        </td>
        <td className="px-4 py-3">
          <input
            type="number"
            min="0"
            step="0.01"
            value={form.priceOverride}
            onChange={(e) => setForm((prev) => ({ ...prev, priceOverride: e.target.value }))}
            className="w-full rounded-lg border border-zinc-200 px-2 py-1 text-sm focus:border-emerald-400 focus:outline-none"
            placeholder={`${basePrice.toFixed(2)} (base)`}
          />
        </td>
        <td className="px-4 py-3">
          <input
            type="url"
            value={form.image}
            onChange={(e) => setForm((prev) => ({ ...prev, image: e.target.value }))}
            className="w-full rounded-lg border border-zinc-200 px-2 py-1 text-sm focus:border-emerald-400 focus:outline-none"
            placeholder="https://example.com/image.jpg"
          />
        </td>
        <td className="px-4 py-3 text-right">
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => handleSave(false)}
              disabled={saving}
              className="rounded-full bg-emerald-600 px-3 py-1 text-xs font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-60"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
            <button
              type="button"
              onClick={() => {
                if (variant.isNew) {
                  onDelete();
                } else {
                  setEditing(false);
                  setForm({
                    size: variant.size || '',
                    color: variant.color || '',
                    sku: variant.sku || '',
                    stock: variant.stock?.toString() || '0',
                    priceOverride: variant.priceOverride?.toString() || '',
                    image: variant.image || '',
                  });
                }
              }}
              className="rounded-full border border-zinc-200 px-3 py-1 text-xs font-medium text-zinc-600 transition hover:border-zinc-300 hover:bg-zinc-50"
            >
              Cancel
            </button>
          </div>
        </td>
      </tr>
    );
  }

  const displayPrice = variant.priceOverride || basePrice;

  return (
    <tr className="hover:bg-zinc-50/80">
      <td className="px-4 py-3 text-zinc-800">{variant.size || '—'}</td>
      <td className="px-4 py-3 text-zinc-800">{variant.color || '—'}</td>
      <td className="px-4 py-3 text-zinc-500">{variant.sku || '—'}</td>
      <td className="px-4 py-3">
        <span className={`font-medium ${(variant.stock || 0) === 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
          {variant.stock || 0}
        </span>
      </td>
      <td className="px-4 py-3 text-zinc-500">
        {variant.priceOverride ? (
          <span>
            €{variant.priceOverride.toFixed(2)} <span className="text-xs text-zinc-400">(override)</span>
          </span>
        ) : (
          <span className="text-zinc-400">€{basePrice.toFixed(2)}</span>
        )}
      </td>
      <td className="px-4 py-3">
        {variant.image ? (
          <div className="h-12 w-12 overflow-hidden rounded-lg bg-zinc-100">
            {imageError ? (
              <div className="flex h-full w-full items-center justify-center">
                <svg className="h-4 w-4 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                </svg>
              </div>
            ) : (
              <img
                src={variant.image}
                alt={`${variant.color || variant.size || 'Variant'} image`}
                className="h-full w-full object-cover"
                onError={() => setImageError(true)}
              />
            )}
          </div>
        ) : (
          <span className="text-xs text-zinc-400">—</span>
        )}
      </td>
      <td className="px-4 py-3 text-right">
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded-full border border-zinc-200 px-3 py-1 text-xs font-medium text-zinc-600 transition hover:border-emerald-200 hover:bg-emerald-50/50"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={handleDelete}
            className="rounded-full border border-zinc-200 px-3 py-1 text-xs font-medium text-rose-600 transition hover:border-rose-200 hover:bg-rose-50/50"
          >
            Delete
          </button>
        </div>
      </td>
    </tr>
  );
});

export default VariantRow;

