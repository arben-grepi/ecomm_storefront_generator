'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { doc, getDoc, collection, getDocs, updateDoc, serverTimestamp } from 'firebase/firestore';
import { getFirebaseDb } from '@/lib/firebase';
import CategorySelector from '@/components/admin/CategorySelector';
import SupplierSelector from '@/components/admin/SupplierSelector';
import InfoIcon from '@/components/admin/InfoIcon';
import Toast from '@/components/admin/Toast';
import VariantRow from '@/components/admin/VariantRow';
import ImageManager from '@/components/admin/ImageManager';
import UnsavedChangesDialog from '@/components/admin/UnsavedChangesDialog';
import { getStoreDocPath } from '@/lib/store-collections';

export default function EditProductPage() {
  const router = useRouter();
  const params = useParams();
  const productId = params?.id;
  const db = getFirebaseDb();

  const [form, setForm] = useState({
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
  });
  const [variants, setVariants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState(null);
  const [originalForm, setOriginalForm] = useState(null);
  const [originalVariants, setOriginalVariants] = useState(null);
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState(null);
  const variantSaveRefs = useRef({});

  useEffect(() => {
    if (!db || !productId) {
      setLoading(false);
      return;
    }

    const loadProduct = async () => {
      try {
        const productDoc = await getDoc(doc(db, ...getStoreDocPath('products', productId)));
        if (!productDoc.exists()) {
          setMessage({ type: 'error', text: 'Product not found.' });
          setLoading(false);
          return;
        }

        const productData = productDoc.data();
        const initialForm = {
          name: productData.name || '',
          slug: productData.slug || '',
          categoryId: productData.categoryId || '',
          supplierId: productData.supplierId || '',
          basePrice: productData.basePrice?.toString() || '',
          description: productData.description || '',
          careInstructions: productData.careInstructions || '',
          active: productData.active !== false,
          images: productData.images || [],
          stock: productData.stock?.toString() || '',
        };
        setForm(initialForm);
        setOriginalForm(JSON.parse(JSON.stringify(initialForm)));

        // Load variants
        const variantsSnapshot = await getDocs(collection(db, ...getStoreDocPath('products', productId), 'variants'));
        const variantsData = variantsSnapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        setVariants(variantsData);
        setOriginalVariants(JSON.parse(JSON.stringify(variantsData)));
      } catch (error) {
        console.error('Error loading product', error);
        setMessage({ type: 'error', text: 'Failed to load product.' });
      } finally {
        setLoading(false);
      }
    };

    loadProduct();
  }, [db, productId]);

  // Check for unsaved changes
  const hasUnsavedChanges = () => {
    if (!originalForm || !originalVariants) return false;
    
    // Check form changes
    const formChanged = JSON.stringify(form) !== JSON.stringify(originalForm);
    
    // Check if any variants are in edit mode
    const hasEditingVariants = variants.some((v) => {
      const variantRef = variantSaveRefs.current[v.id || `new-${variants.indexOf(v)}`];
      return variantRef && variantRef.isEditing;
    });
    
    // Check if variants were added/removed
    const variantsChanged = JSON.stringify(variants.map(v => ({ id: v.id, ...v }))) !== JSON.stringify(originalVariants.map(v => ({ id: v.id, ...v })));
    
    return formChanged || hasEditingVariants || variantsChanged;
  };

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
    if (pendingNavigation) {
      pendingNavigation();
      setPendingNavigation(null);
    }
  };

  // Block browser navigation
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (!originalForm || !originalVariants) return;
      
      const formChanged = JSON.stringify(form) !== JSON.stringify(originalForm);
      const hasEditingVariants = variants.some((v) => {
        const variantRef = variantSaveRefs.current[v.id || `new-${variants.indexOf(v)}`];
        return variantRef && variantRef.isEditing;
      });
      const variantsChanged = JSON.stringify(variants.map(v => ({ id: v.id, ...v }))) !== JSON.stringify(originalVariants.map(v => ({ id: v.id, ...v })));
      
      if (formChanged || hasEditingVariants || variantsChanged) {
        e.preventDefault();
        e.returnValue = '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [form, variants, originalForm, originalVariants]);

  if (!db) {
    return (
      <div className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-6 px-6 py-16">
        <h1 className="text-2xl font-semibold text-rose-500">Firebase is not configured</h1>
        <p className="text-zinc-600">
          The admin app could not reach Firestore. Verify configuration before attempting to edit products.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-6 px-6 py-16">
        <p className="text-zinc-600">Loading product...</p>
      </div>
    );
  }

  const handleChange = (field) => (event) => {
    const value = field === 'active' ? event.target.checked : event.target.value;
    setForm((prev) => ({ ...prev, [field]: value }));
  };

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

    // Check if any variants are in edit mode and validate them
    const editingVariants = variants.filter((v) => {
      const variantRef = variantSaveRefs.current[v.id || `new-${variants.indexOf(v)}`];
      return variantRef && variantRef.isEditing && variantRef.getFormData;
    });

    for (const variant of editingVariants) {
      const variantRef = variantSaveRefs.current[variant.id || `new-${variants.indexOf(variant)}`];
      if (variantRef && variantRef.getFormData) {
        const formData = variantRef.getFormData();
        
        // Validate stock
        const stock = parseInt(formData.stock, 10);
        if (Number.isNaN(stock) || stock < 0) {
          setMessage({ type: 'error', text: `Variant stock must be a valid number (0 or greater).` });
          return;
        }

        // Validate price override if provided
        if (formData.priceOverride && formData.priceOverride.trim()) {
          const priceOverride = parseFloat(formData.priceOverride);
          if (Number.isNaN(priceOverride) || priceOverride < 0) {
            setMessage({ type: 'error', text: `Variant price override must be a valid number (0 or greater).` });
            return;
          }
        }
      }
    }

    setSubmitting(true);

    try {
      // Save any variants that are in edit mode
      for (const variant of editingVariants) {
        const variantRef = variantSaveRefs.current[variant.id || `new-${variants.indexOf(variant)}`];
        if (variantRef && variantRef.save) {
          await variantRef.save(true); // Pass true to suppress individual messages
        }
      }

      const productPayload = {
        name: form.name.trim(),
        slug: form.slug.trim(),
        categoryId: form.categoryId.trim(),
        supplierId: form.supplierId.trim() || null,
        basePrice,
        description: form.description.trim(),
        careInstructions: form.careInstructions.trim(),
        active: form.active,
        images: form.images,
        // Only include stock if no variants exist
        ...(variants.length === 0 && form.stock ? { stock: parseInt(form.stock, 10) || 0 } : {}),
        updatedAt: serverTimestamp(),
      };

      await updateDoc(doc(db, ...getStoreDocPath('products', productId)), productPayload);
      
      // Update original form after successful save
      const updatedForm = { ...form };
      setOriginalForm(JSON.parse(JSON.stringify(updatedForm)));
      setOriginalVariants(JSON.parse(JSON.stringify(variants)));
      
      setMessage({ type: 'success', text: 'Product and variants updated successfully.' });
    } catch (error) {
      console.error('Error updating product', error);
      const errorMessage = error.message || 'Failed to update product. Check console for details.';
      setMessage({ type: 'error', text: errorMessage });
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
          onClick={() => handleNavigation('/LUNERA/admin/categories')}
          className="text-sm font-medium text-emerald-600 transition hover:text-emerald-500"
        >
          ← Back to categories
        </button>
        <h1 className="text-3xl font-semibold text-zinc-900">Edit product</h1>
        <p className="text-base text-zinc-500">
          Update product details, pricing, and visibility.
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
            {variants.length === 0 && (
              <label className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-zinc-600">Stock</span>
                  <InfoIcon tooltip="Product stock quantity. Only shown when no variants are defined. If variants exist, stock is managed per variant." />
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
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1">
              <h2 className="text-xl font-semibold text-zinc-800">Variants</h2>
              <InfoIcon tooltip="Variants represent different size/color combinations of this product. Each variant has its own stock count, can have a custom price, and optionally a variant-specific image (useful for color variants). Stock is tracked per variant, not per product." />
            </div>
            <button
              type="button"
              onClick={() => {
                // Add new variant - will implement modal/form
                const newVariant = {
                  size: '',
                  color: '',
                  stock: 0,
                  priceOverride: '',
                  sku: '',
                };
                setVariants([...variants, { id: 'new', ...newVariant, isNew: true }]);
              }}
              className="rounded-full border border-zinc-200 px-4 py-1.5 text-sm font-medium text-zinc-600 transition hover:border-emerald-200 hover:bg-emerald-50/50"
            >
              + Add variant
            </button>
          </div>
          {variants.length === 0 ? (
            <p className="text-sm text-zinc-500">No variants yet. Add one to manage stock.</p>
          ) : (
            <div className="overflow-hidden rounded-xl border border-zinc-200/70">
              <table className="min-w-full divide-y divide-zinc-100 bg-white text-sm">
                <thead className="bg-zinc-50 text-zinc-500">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">Size</th>
                    <th className="px-4 py-3 text-left font-medium">Color</th>
                    <th className="px-4 py-3 text-left font-medium">
                      <div className="flex items-center gap-1">
                        <span>SKU</span>
                        <InfoIcon tooltip="Stock Keeping Unit - a unique identifier for this specific variant (e.g., 'LACE-BLK-M'). Optional but useful for inventory tracking." />
                      </div>
                    </th>
                    <th className="px-4 py-3 text-left font-medium">Stock</th>
                    <th className="px-4 py-3 text-left font-medium">
                      <div className="flex items-center gap-1">
                        <span>Override €</span>
                        <InfoIcon tooltip="Optional: Set a different price for this variant. If left empty, the variant will use the product's base price. Useful when certain sizes or colors cost more or less." />
                      </div>
                    </th>
                    <th className="px-4 py-3 text-left font-medium">Image</th>
                    <th className="px-4 py-3 text-right font-medium">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {variants.map((variant, index) => {
                    const variantKey = variant.id || `new-${index}`;
                    return (
                      <VariantRow
                        key={variantKey}
                        ref={(el) => {
                          if (el) {
                            variantSaveRefs.current[variantKey] = el;
                          } else {
                            delete variantSaveRefs.current[variantKey];
                          }
                        }}
                        variant={variant}
                        productId={productId}
                        basePrice={parseFloat(form.basePrice) || 0}
                        onUpdate={(updatedVariant) => {
                          const updated = variants.map((v) =>
                            v.id === variant.id ? updatedVariant : v
                          );
                          setVariants(updated);
                        }}
                        onDelete={() => {
                          setVariants(variants.filter((v) => v.id !== variant.id));
                        }}
                        db={db}
                        setMessage={setMessage}
                      />
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={submitting}
            className="rounded-full bg-emerald-600 px-6 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? 'Saving…' : 'Save changes'}
          </button>
          <button
            type="button"
            onClick={() => handleNavigation('/LUNERA/admin/categories')}
            className="text-sm font-medium text-zinc-500 underline-offset-4 transition hover:text-zinc-700"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

