'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { doc, getDoc, collection, getDocs, query, updateDoc, Timestamp, where } from 'firebase/firestore';
import { getFirebaseDb } from '@/lib/firebase';
import { getStoreCollectionPath, getStoreDocPath } from '@/lib/store-collections';
import Toast from '@/components/admin/Toast';
import InfoIcon from '@/components/admin/InfoIcon';

export default function EditPromotionPage() {
  const router = useRouter();
  const params = useParams();
  const promotionId = params?.id;
  const db = getFirebaseDb();
  const [form, setForm] = useState({
    code: '',
    description: '',
    type: 'percentage',
    value: '',
    appliesTo: {
      categories: [],
      products: [],
    },
    startDate: '',
    endDate: '',
    maxRedemptions: '',
  });
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState(null);

  // Load promotion and available categories/products
  useEffect(() => {
    if (!db || !promotionId) {
      setLoading(false);
      return;
    }

    const loadPromotion = async () => {
      try {
        const promoDoc = await getDoc(doc(db, ...getStoreDocPath('promotions', promotionId)));
        if (!promoDoc.exists()) {
          setMessage({ type: 'error', text: 'Promotion not found.' });
          setLoading(false);
          return;
        }

        const promoData = promoDoc.data();
        const startDate = promoData.startDate?.toDate?.();
        const endDate = promoData.endDate?.toDate?.();

        setForm({
          code: promoData.code || '',
          description: promoData.description || '',
          type: promoData.type || 'percentage',
          value: promoData.value?.toString() || '',
          appliesTo: {
            categories: promoData.appliesTo?.categories || [],
            products: promoData.appliesTo?.products || [],
          },
          startDate: startDate ? startDate.toISOString().slice(0, 16) : '',
          endDate: endDate ? endDate.toISOString().slice(0, 16) : '',
          maxRedemptions: promoData.maxRedemptions?.toString() || '',
        });
      } catch (error) {
        console.error('Error loading promotion', error);
        setMessage({ type: 'error', text: 'Failed to load promotion.' });
      } finally {
        setLoading(false);
      }
    };

    const categoriesQuery = query(collection(db, ...getStoreCollectionPath('categories')));
    const productsQuery = query(collection(db, ...getStoreCollectionPath('products')));

    Promise.all([
      loadPromotion(),
      getDocs(categoriesQuery).then((snapshot) =>
        snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
      ),
      getDocs(productsQuery).then((snapshot) =>
        snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
      ),
    ])
      .then(([, categoriesData, productsData]) => {
        setCategories(categoriesData.filter((cat) => cat.active !== false));
        setProducts(productsData.filter((prod) => prod.active !== false));
      })
      .catch((error) => {
        console.error('Failed to load categories/products', error);
      });
  }, [db, promotionId]);

  const handleChange = (field) => (event) => {
    const value = event.target.value;
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleAppliesToChange = (type, id, checked) => {
    setForm((prev) => {
      const current = prev.appliesTo[type] || [];
      const updated = checked
        ? [...current, id]
        : current.filter((itemId) => itemId !== id);
      return {
        ...prev,
        appliesTo: {
          ...prev.appliesTo,
          [type]: updated,
        },
      };
    });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setMessage(null);

    if (!form.code.trim()) {
      setMessage({ type: 'error', text: 'Code is required.' });
      return;
    }

    const value = parseFloat(form.value);
    if (Number.isNaN(value) || value <= 0) {
      setMessage({ type: 'error', text: 'Enter a valid discount value greater than 0.' });
      return;
    }

    if (form.type === 'percentage' && value > 100) {
      setMessage({ type: 'error', text: 'Percentage discount cannot exceed 100%.' });
      return;
    }

    // Check for duplicate code (excluding current promotion)
    if (db) {
      try {
        const codeQuery = query(
          collection(db, ...getStoreCollectionPath('promotions')),
          where('code', '==', form.code.trim().toUpperCase())
        );
        const codeSnapshot = await getDocs(codeQuery);
        const duplicate = codeSnapshot.docs.find((doc) => doc.id !== promotionId);
        if (duplicate) {
          setMessage({ type: 'error', text: `A promotion with code "${form.code.trim().toUpperCase()}" already exists.` });
          return;
        }
      } catch (error) {
        console.error('Error checking duplicate code', error);
      }
    }

    setSubmitting(true);

    try {
      const payload = {
        code: form.code.trim().toUpperCase(),
        description: form.description.trim() || null,
        type: form.type,
        value,
        appliesTo: {
          categories: form.appliesTo.categories.length > 0 ? form.appliesTo.categories : null,
          products: form.appliesTo.products.length > 0 ? form.appliesTo.products : null,
        },
        startDate: form.startDate ? Timestamp.fromDate(new Date(form.startDate)) : null,
        endDate: form.endDate ? Timestamp.fromDate(new Date(form.endDate)) : null,
        maxRedemptions: form.maxRedemptions ? parseInt(form.maxRedemptions, 10) : null,
      };

      await updateDoc(doc(db, ...getStoreDocPath('promotions', promotionId)), payload);
      setMessage({ type: 'success', text: 'Promotion updated successfully.' });
      setTimeout(() => {
        router.push('/admin/promotions');
      }, 1500);
    } catch (error) {
      console.error('Error updating promotion', error);
      setMessage({ type: 'error', text: 'Failed to update promotion. Check console for details.' });
      setSubmitting(false);
    }
  };

  if (!db) {
    return (
      <div className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-6 px-6 py-16">
        <h1 className="text-2xl font-semibold text-rose-500">Firebase is not configured</h1>
        <p className="text-zinc-600">
          The admin app could not reach Firestore. Verify configuration before attempting to edit promotions.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-8 px-6 py-16">
        <div className="h-8 w-48 animate-pulse rounded-full bg-zinc-200" />
        <div className="h-6 w-64 animate-pulse rounded-lg bg-zinc-100" />
        <div className="h-96 w-full animate-pulse rounded-3xl bg-zinc-100" />
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-8 px-6 py-16">
      <header className="space-y-2">
        <button
          onClick={() => router.push('/admin/promotions')}
          className="text-sm font-medium text-emerald-600 transition hover:text-emerald-500"
        >
          ← Back to promotions
        </button>
        <h1 className="text-3xl font-semibold text-zinc-900">Edit promotion</h1>
        <p className="text-base text-zinc-500">
          Update promotion details and targeting.
        </p>
      </header>

      <Toast message={message} onDismiss={() => setMessage(null)} />

      <form onSubmit={handleSubmit} className="space-y-10">
        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-zinc-800">Basic details</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium text-zinc-600">Code *</span>
              <input
                type="text"
                value={form.code}
                onChange={handleChange('code')}
                className="rounded-xl border border-zinc-200 px-4 py-2 text-sm focus:border-emerald-400 focus:outline-none font-mono uppercase"
                placeholder="SUMMER20"
                required
              />
            </label>
            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium text-zinc-600">Type *</span>
              <select
                value={form.type}
                onChange={handleChange('type')}
                className="rounded-xl border border-zinc-200 px-4 py-2 text-sm focus:border-emerald-400 focus:outline-none"
                required
              >
                <option value="percentage">Percentage</option>
                <option value="amount">Fixed amount</option>
              </select>
            </label>
            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium text-zinc-600">Value *</span>
              <input
                type="number"
                min="0"
                step={form.type === 'percentage' ? '1' : '0.01'}
                max={form.type === 'percentage' ? '100' : undefined}
                value={form.value}
                onChange={handleChange('value')}
                className="rounded-xl border border-zinc-200 px-4 py-2 text-sm focus:border-emerald-400 focus:outline-none"
                placeholder={form.type === 'percentage' ? '20' : '10.00'}
                required
              />
            </label>
            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium text-zinc-600">Max redemptions</span>
              <input
                type="number"
                min="1"
                value={form.maxRedemptions}
                onChange={handleChange('maxRedemptions')}
                className="rounded-xl border border-zinc-200 px-4 py-2 text-sm focus:border-emerald-400 focus:outline-none"
                placeholder="Unlimited"
              />
            </label>
          </div>
          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-zinc-600">Description</span>
            <textarea
              value={form.description}
              onChange={handleChange('description')}
              rows={3}
              className="rounded-xl border border-zinc-200 px-4 py-2 text-sm focus:border-emerald-400 focus:outline-none"
              placeholder="Summer sale - 20% off all items"
            />
          </label>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-zinc-800">Validity period</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium text-zinc-600">Start date</span>
              <input
                type="datetime-local"
                value={form.startDate}
                onChange={handleChange('startDate')}
                className="rounded-xl border border-zinc-200 px-4 py-2 text-sm focus:border-emerald-400 focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium text-zinc-600">End date</span>
              <input
                type="datetime-local"
                value={form.endDate}
                onChange={handleChange('endDate')}
                className="rounded-xl border border-zinc-200 px-4 py-2 text-sm focus:border-emerald-400 focus:outline-none"
              />
            </label>
          </div>
          <p className="text-xs text-zinc-400">Leave empty for no date restrictions</p>
        </section>

        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-semibold text-zinc-800">Targeting</h2>
            <InfoIcon tooltip="Optionally restrict this promotion to specific categories or products. If left empty, the promotion applies to all items." />
          </div>
          <p className="text-sm text-zinc-500">Leave empty to apply to all items</p>

          <div className="grid gap-6 sm:grid-cols-2">
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-zinc-700">Categories</h3>
              <div className="max-h-48 space-y-2 overflow-y-auto rounded-xl border border-zinc-200 p-3">
                {categories.length === 0 ? (
                  <p className="text-xs text-zinc-400">No categories available</p>
                ) : (
                  categories.map((category) => (
                    <label key={category.id} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={form.appliesTo.categories.includes(category.id)}
                        onChange={(e) => handleAppliesToChange('categories', category.id, e.target.checked)}
                        className="h-4 w-4 rounded border border-zinc-300 text-emerald-500 focus:ring-emerald-400"
                      />
                      <span className="text-sm text-zinc-600">{category.name}</span>
                    </label>
                  ))
                )}
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="text-sm font-medium text-zinc-700">Products</h3>
              <div className="max-h-48 space-y-2 overflow-y-auto rounded-xl border border-zinc-200 p-3">
                {products.length === 0 ? (
                  <p className="text-xs text-zinc-400">No products available</p>
                ) : (
                  products.map((product) => (
                    <label key={product.id} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={form.appliesTo.products.includes(product.id)}
                        onChange={(e) => handleAppliesToChange('products', product.id, e.target.checked)}
                        className="h-4 w-4 rounded border border-zinc-300 text-emerald-500 focus:ring-emerald-400"
                      />
                      <span className="text-sm text-zinc-600">{product.name}</span>
                    </label>
                  ))
                )}
              </div>
            </div>
          </div>
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
            onClick={() => router.push('/admin/promotions')}
            className="text-sm font-medium text-zinc-500 underline-offset-4 transition hover:text-zinc-700"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

