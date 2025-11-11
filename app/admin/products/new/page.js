'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { getFirebaseDb } from '@/lib/firebase';
import CategorySelector from '@/components/admin/CategorySelector';
import SupplierSelector from '@/components/admin/SupplierSelector';
import InfoIcon from '@/components/admin/InfoIcon';
import Toast from '@/components/admin/Toast';
import ImageManager from '@/components/admin/ImageManager';
import UnsavedChangesDialog from '@/components/admin/UnsavedChangesDialog';

const initialFormState = {
  name: '',
  slug: '',
  categoryId: '',
  supplierId: '',
  basePrice: '',
  description: '',
  careInstructions: '',
  active: true,
  images: [],
  stock: '',
  variant: {
    size: '',
    color: '',
    stock: '',
    priceOverride: '',
  },
};

export default function NewProductPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const db = getFirebaseDb();
  const categoryIdFromUrl = searchParams?.get('categoryId');

  const [form, setForm] = useState(initialFormState);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState(null);
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState(null);

  // Pre-fill category if provided in URL
  useEffect(() => {
    if (categoryIdFromUrl) {
      setForm((prev) => ({ ...prev, categoryId: categoryIdFromUrl }));
    }
  }, [categoryIdFromUrl]);

  if (!db) {
    return (
      <div className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-6 px-6 py-16">
        <h1 className="text-2xl font-semibold text-rose-500">Firebase is not configured</h1>
        <p className="text-zinc-600">
          The admin app could not reach Firestore. Verify configuration before attempting to add products.
        </p>
      </div>
    );
  }

  const handleChange = (field) => (event) => {
    const value = field === 'active' ? event.target.checked : event.target.value;
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleVariantChange = (field) => (event) => {
    const value = event.target.value;
    setForm((prev) => ({
      ...prev,
      variant: {
        ...prev.variant,
        [field]: value,
      },
    }));
  };

  const resetForm = () => {
    setForm(initialFormState);
  };

  // Check for unsaved changes
  const hasUnsavedChanges = useCallback(() => {
    const isEmpty = !form.name.trim() && !form.slug.trim() && !form.categoryId.trim() && !form.basePrice && form.images.length === 0;
    return !isEmpty;
  }, [form]);

  // Handle navigation attempts
  const handleNavigation = (path) => {
    if (hasUnsavedChanges()) {
      setPendingNavigation(() => () => router.push(path));
      setShowUnsavedDialog(true);
    } else {
      router.push(path);
    }
  };

  // Handle save from dialog
  const handleSaveFromDialog = async () => {
    setShowUnsavedDialog(false);
    // Trigger form submit
    const formElement = document.querySelector('form');
    if (formElement) {
      formElement.requestSubmit();
    }
    // Wait a bit for save to complete, then navigate
    setTimeout(() => {
      if (pendingNavigation) {
        pendingNavigation();
        setPendingNavigation(null);
      }
    }, 500);
  };

  // Handle discard from dialog
  const handleDiscardFromDialog = () => {
    setShowUnsavedDialog(false);
    resetForm();
    if (pendingNavigation) {
      pendingNavigation();
      setPendingNavigation(null);
    }
  };

  // Block browser navigation
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (hasUnsavedChanges()) {
        e.preventDefault();
        e.returnValue = '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setMessage(null);

    if (!form.name.trim() || !form.slug.trim() || !form.categoryId.trim()) {
      setMessage({ type: 'error', text: 'Name, slug, and category are required.' });
      return;
    }

    const basePrice = parseFloat(form.basePrice);
    if (Number.isNaN(basePrice) || basePrice <= 0) {
      setMessage({ type: 'error', text: 'Enter a valid base price greater than 0.' });
      return;
    }

    setSubmitting(true);

    try {
      const productPayload = {
        name: form.name.trim(),
        slug: form.slug.trim(),
        categoryId: form.categoryId.trim(),
        supplierId: form.supplierId.trim() || null,
        basePrice,
        description: form.description.trim(),
        careInstructions: form.careInstructions.trim(),
        images: form.images || [],
        active: form.active,
        // Only include stock if no variant is being created
        ...(!form.variant.size.trim() && !form.variant.color.trim() && !form.variant.stock && !form.variant.priceOverride && form.stock ? { stock: parseInt(form.stock, 10) || 0 } : {}),
        metrics: {
          totalViews: 0,
          lastViewedAt: null,
          totalPurchases: 0,
        },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      const productRef = await addDoc(collection(db, 'products'), productPayload);

      const variantHasData =
        form.variant.size.trim() || form.variant.color.trim() || form.variant.stock || form.variant.priceOverride;

      if (variantHasData) {
        const stock = parseInt(form.variant.stock, 10);
        const priceOverride = form.variant.priceOverride ? parseFloat(form.variant.priceOverride) : null;

        await addDoc(collection(db, 'products', productRef.id, 'variants'), {
          size: form.variant.size.trim() || null,
          color: form.variant.color.trim() || null,
          stock: Number.isNaN(stock) ? 0 : stock,
          priceOverride: priceOverride && !Number.isNaN(priceOverride) ? priceOverride : null,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          metrics: {
            totalViews: 0,
            totalAddedToCart: 0,
            totalPurchases: 0,
          },
        });
      }

      setMessage({ type: 'success', text: 'Product created successfully.' });
      resetForm();
    } catch (error) {
      console.error('Error creating product', error);
      setMessage({ type: 'error', text: 'Failed to create product. Check console for details.' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-8 px-6 py-16">
      <UnsavedChangesDialog
        isOpen={showUnsavedDialog}
        onSave={handleSaveFromDialog}
        onDiscard={handleDiscardFromDialog}
        onCancel={() => {
          setShowUnsavedDialog(false);
          setPendingNavigation(null);
        }}
      />
      <header className="space-y-2">
        <button
          onClick={() => {
            const path = categoryIdFromUrl ? '/admin/categories' : '/admin/overview';
            handleNavigation(path);
          }}
          className="text-sm font-medium text-emerald-600 transition hover:text-emerald-500"
        >
          ← {categoryIdFromUrl ? 'Back to categories' : 'Back to admin'}
        </button>
        <h1 className="text-3xl font-semibold text-zinc-900">Add new product</h1>
        <p className="text-base text-zinc-500">
          Provide core details, assign a category and supplier, and optionally seed the first variant.
        </p>
      </header>

      <Toast message={message} onDismiss={() => setMessage(null)} />

      <form onSubmit={handleSubmit} className="space-y-10">
        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-zinc-800">Core details</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium text-zinc-600">Name *</span>
              <input
                type="text"
                value={form.name}
                onChange={handleChange('name')}
                className="rounded-xl border border-zinc-200 px-4 py-2 text-sm focus:border-emerald-400 focus:outline-none"
                placeholder="Lace bralette set"
                required
              />
            </label>
            <label className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-zinc-600">Slug *</span>
                <InfoIcon tooltip="URL-friendly identifier for the product (e.g., 'lace-bralette-set'). Used in product URLs and should be lowercase with hyphens instead of spaces." />
              </div>
              <input
                type="text"
                value={form.slug}
                onChange={handleChange('slug')}
                className="rounded-xl border border-zinc-200 px-4 py-2 text-sm focus:border-emerald-400 focus:outline-none"
                placeholder="lace-bralette-set"
                required
              />
            </label>
            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium text-zinc-600">Category *</span>
              <CategorySelector
                value={form.categoryId}
                onChange={(categoryId) =>
                  setForm((prev) => ({
                    ...prev,
                    categoryId,
                  }))
                }
              />
            </label>
            <div className="flex flex-col gap-2">
              <SupplierSelector
                value={form.supplierId}
                onChange={(supplierId) =>
                  setForm((prev) => ({
                    ...prev,
                    supplierId: supplierId || '',
                  }))
                }
              />
            </div>
            <label className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-zinc-600">Base price *</span>
                <InfoIcon tooltip="The default price for this product. Individual variants can override this price if they need different pricing (e.g., larger sizes cost more)." />
              </div>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.basePrice}
                onChange={handleChange('basePrice')}
                className="rounded-xl border border-zinc-200 px-4 py-2 text-sm focus:border-emerald-400 focus:outline-none"
                placeholder="79.99"
                required
              />
            </label>
            {!form.variant.size.trim() && !form.variant.color.trim() && !form.variant.stock && !form.variant.priceOverride && (
              <label className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-zinc-600">Stock</span>
                  <InfoIcon tooltip="Product stock quantity. Only shown when no variant is being created. If you create a variant, stock will be managed per variant." />
                </div>
                <input
                  type="number"
                  min="0"
                  value={form.stock}
                  onChange={handleChange('stock')}
                  className="rounded-xl border border-zinc-200 px-4 py-2 text-sm focus:border-emerald-400 focus:outline-none"
                  placeholder="0"
                />
              </label>
            )}
            <label className="flex items-center gap-2 pt-7">
              <input
                type="checkbox"
                checked={form.active}
                onChange={handleChange('active')}
                className="h-4 w-4 rounded border border-zinc-300 text-emerald-500 focus:ring-emerald-400"
              />
              <span className="text-sm text-zinc-600">Visible in storefront</span>
            </label>
          </div>

          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-zinc-600">Description</span>
            <textarea
              value={form.description}
              onChange={handleChange('description')}
              rows={4}
              className="rounded-xl border border-zinc-200 px-4 py-2 text-sm focus:border-emerald-400 focus:outline-none"
              placeholder="Include fit details, fabric, and styling notes."
            />
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-zinc-600">Care instructions</span>
            <textarea
              value={form.careInstructions}
              onChange={handleChange('careInstructions')}
              rows={3}
              className="rounded-xl border border-zinc-200 px-4 py-2 text-sm focus:border-emerald-400 focus:outline-none"
              placeholder="Hand wash cold. Lay flat to dry."
            />
          </label>

          <div className="pt-2">
            <ImageManager
              images={form.images || []}
              onChange={(images) => setForm((prev) => ({ ...prev, images }))}
              maxImages={5}
            />
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-zinc-800">Initial variant (optional)</h2>
          <p className="text-sm text-zinc-500">
            Provide first size/color combination. You can add more variants later in the variant manager.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium text-zinc-600">Size</span>
              <input
                type="text"
                value={form.variant.size}
                onChange={handleVariantChange('size')}
                className="rounded-xl border border-zinc-200 px-4 py-2 text-sm focus:border-emerald-400 focus:outline-none"
                placeholder="S, M, L"
              />
            </label>
            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium text-zinc-600">Color</span>
              <input
                type="text"
                value={form.variant.color}
                onChange={handleVariantChange('color')}
                className="rounded-xl border border-zinc-200 px-4 py-2 text-sm focus:border-emerald-400 focus:outline-none"
                placeholder="Champagne"
              />
            </label>
            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium text-zinc-600">Stock quantity</span>
              <input
                type="number"
                min="0"
                value={form.variant.stock}
                onChange={handleVariantChange('stock')}
                className="rounded-xl border border-zinc-200 px-4 py-2 text-sm focus:border-emerald-400 focus:outline-none"
                placeholder="25"
              />
            </label>
            <label className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-zinc-600">Price override</span>
                <InfoIcon tooltip="Optional: Set a different price for this specific variant. If left empty, the variant will use the base price. Useful when certain sizes or colors cost more or less." />
              </div>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.variant.priceOverride}
                onChange={handleVariantChange('priceOverride')}
                className="rounded-xl border border-zinc-200 px-4 py-2 text-sm focus:border-emerald-400 focus:outline-none"
                placeholder="89.99"
              />
            </label>
          </div>
        </section>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={submitting}
            className="rounded-full bg-emerald-600 px-6 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? 'Saving…' : 'Create product'}
          </button>
          <button
            type="button"
            onClick={resetForm}
            disabled={submitting}
            className="text-sm font-medium text-zinc-500 underline-offset-4 transition hover:text-zinc-700"
          >
            Reset form
          </button>
        </div>
      </form>
    </div>
  );
}
