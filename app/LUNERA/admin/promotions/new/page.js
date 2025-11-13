'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { addDoc, collection, getDocs, query, serverTimestamp, Timestamp, where } from 'firebase/firestore';
import { getFirebaseDb } from '@/lib/firebase';
import { getStoreCollectionPath } from '@/lib/store-collections';
import Toast from '@/components/admin/Toast';
import InfoIcon from '@/components/admin/InfoIcon';

const initialFormState = {
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
};

export default function NewPromotionPage() {
  const router = useRouter();
  const db = getFirebaseDb();
  const [form, setForm] = useState(initialFormState);
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState(null);

  // Fetch categories and products for targeting
  useEffect(() => {
    if (!db) return;

    const categoriesQuery = query(collection(db, ...getStoreCollectionPath('categories')));
    const productsQuery = query(collection(db, ...getStoreCollectionPath('products')));

    Promise.all([
      getDocs(categoriesQuery).then((snapshot) =>
        snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
      ),
      getDocs(productsQuery).then((snapshot) =>
        snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
      ),
    ])
      .then(([categoriesData, productsData]) => {
        setCategories(categoriesData.filter((cat) => cat.active !== false));
        setProducts(productsData.filter((prod) => prod.active !== false));
      })
      .catch((error) => {
        console.error('Failed to load categories/products', error);
      });
  }, [db]);

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

    // Check for duplicate code
    if (db) {
      try {
        const codeQuery = query(
          collection(db, ...getStoreCollectionPath('promotions')),
          where('code', '==', form.code.trim().toUpperCase())
        );
        const codeSnapshot = await getDocs(codeQuery);
        if (!codeSnapshot.empty) {
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
        currentRedemptions: 0,
        createdAt: serverTimestamp(),
      };

      await addDoc(collection(db, ...getStoreCollectionPath('promotions')), payload);
      setMessage({ type: 'success', text: 'Promotion created successfully.' });
      setTimeout(() => {
        router.push('/LUNERA/admin/promotions');
      }, 1500);
    } catch (error) {
      console.error('Error creating promotion', error);
      setMessage({ type: 'error', text: 'Failed to create promotion. Check console for details.' });
      setSubmitting(false);
    }
  };

  if (!db) {
    return (
      <div className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-6 px-6 py-16">
        <h1 className="text-2xl font-semibold text-rose-500">Firebase is not configured</h1>
        <p className="text-zinc-600">
          The admin app could not reach Firestore. Verify configuration before attempting to add promotions.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-8 px-6 py-16">
      <header className="space-y-2">
        <button
          onClick={() => router.push('/LUNERA/admin/promotions')}
          className="text-sm font-medium text-emerald-600 transition hover:text-emerald-500"
        >
          ← Back to promotions
        </button>
        <h1 className="text-3xl font-semibold text-zinc-900">Create promotion</h1>
        <p className="text-base text-zinc-500">
          Create a new discount code or promotional campaign.
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
              <p className="text-xs text-zinc-400">Will be converted to uppercase automatically</p>
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
            {submitting ? 'Creating…' : 'Create promotion'}
          </button>
          <button
            type="button"
            onClick={() => router.push('/LUNERA/admin/promotions')}
            className="text-sm font-medium text-zinc-500 underline-offset-4 transition hover:text-zinc-700"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

