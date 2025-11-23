'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { getFirebaseDb } from '@/lib/firebase';
import { getCollectionPath } from '@/lib/store-collections';
import Toast from '@/components/admin/Toast';
import { useWebsite } from '@/lib/website-context';

export default function AnalyticsPage() {
  const router = useRouter();
  const db = getFirebaseDb();
  const { selectedWebsite } = useWebsite();
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState(null);

  // Fetch categories and sort client-side (to avoid index requirement)
  useEffect(() => {
    if (!db) {
      setLoading(false);
      return undefined;
    }

    const categoriesQuery = query(
      collection(db, ...getCollectionPath('categories')),
      where('storefronts', 'array-contains', selectedWebsite)
    );
    const unsubscribeCategories = onSnapshot(
      categoriesQuery,
      (snapshot) => {
        const data = snapshot.docs
          .map((doc) => ({
            id: doc.id,
            ...doc.data(),
          }))
          .sort((a, b) => {
            const aViews = a.metrics?.totalViews || 0;
            const bViews = b.metrics?.totalViews || 0;
            return bViews - aViews;
          });
        setCategories(data);
        setLoading(false);
      },
      (error) => {
        console.error('Failed to load categories', error);
        setMessage({ type: 'error', text: 'Failed to load analytics data.' });
        setLoading(false);
      }
    );

    return () => unsubscribeCategories();
  }, [db, selectedWebsite]);

  // Fetch products and sort client-side
  useEffect(() => {
    if (!db) return undefined;

    const productsQuery = query(
      collection(db, ...getCollectionPath('products')),
      where('storefronts', 'array-contains', selectedWebsite)
    );
    const unsubscribeProducts = onSnapshot(
      productsQuery,
      (snapshot) => {
        const data = snapshot.docs
          .map((doc) => ({
            id: doc.id,
            ...doc.data(),
          }))
          .sort((a, b) => {
            const aViews = a.metrics?.totalViews || 0;
            const bViews = b.metrics?.totalViews || 0;
            return bViews - aViews;
          })
          .slice(0, 20);
        setProducts(data);
      },
      (error) => {
        // Silently fail - products are optional
        console.warn('Failed to load products', error);
      }
    );

    return () => unsubscribeProducts();
  }, [db, selectedWebsite]);

  const topCategories = useMemo(() => categories.slice(0, 10), [categories]);
  const topProducts = useMemo(() => products.slice(0, 10), [products]);

  const totalCategoryViews = useMemo(
    () => categories.reduce((sum, cat) => sum + (cat.metrics?.totalViews || 0), 0),
    [categories]
  );
  const totalProductViews = useMemo(
    () => products.reduce((sum, prod) => sum + (prod.metrics?.totalViews || 0), 0),
    [products]
  );

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-8 px-6 py-16">
      <header className="space-y-2">
        <button
          onClick={() => router.push('/admin/overview')}
          className="text-sm font-medium text-emerald-600 transition hover:text-emerald-500"
        >
          ← Back to admin
        </button>
        <h1 className="text-3xl font-semibold text-zinc-900">Engagement & Analytics</h1>
        <p className="text-base text-zinc-500">
          Track how users interact with your categories and products.
        </p>
      </header>

      <Toast message={message} onDismiss={() => setMessage(null)} />

      {/* Summary Cards */}
      <section className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-3xl border border-zinc-200/70 bg-white/80 p-6 shadow-sm backdrop-blur-sm">
          <p className="text-sm font-medium text-zinc-500">Total Category Views</p>
          <p className="mt-3 text-2xl font-semibold">{totalCategoryViews.toLocaleString()}</p>
        </div>
        <div className="rounded-3xl border border-zinc-200/70 bg-white/80 p-6 shadow-sm backdrop-blur-sm">
          <p className="text-sm font-medium text-zinc-500">Total Product Views</p>
          <p className="mt-3 text-2xl font-semibold">{totalProductViews.toLocaleString()}</p>
        </div>
        <div className="rounded-3xl border border-zinc-200/70 bg-white/80 p-6 shadow-sm backdrop-blur-sm">
          <p className="text-sm font-medium text-zinc-500">Active Categories</p>
          <p className="mt-3 text-2xl font-semibold">{categories.filter((c) => c.active !== false).length}</p>
        </div>
        <div className="rounded-3xl border border-zinc-200/70 bg-white/80 p-6 shadow-sm backdrop-blur-sm">
          <p className="text-sm font-medium text-zinc-500">Top Products Tracked</p>
          <p className="mt-3 text-2xl font-semibold">{products.length}</p>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Top Categories */}
        <section className="overflow-hidden rounded-3xl border border-zinc-200/70 bg-white shadow-sm">
          <div className="border-b border-zinc-100 bg-zinc-50 px-6 py-4">
            <h2 className="text-lg font-semibold text-zinc-800">Top Categories by Views</h2>
            <p className="mt-1 text-sm text-zinc-500">Most viewed categories</p>
          </div>
          {loading ? (
            <div className="px-6 py-10 text-center text-zinc-400">Loading...</div>
          ) : topCategories.length === 0 ? (
            <div className="px-6 py-10 text-center text-zinc-400">No category views yet</div>
          ) : (
            <div className="divide-y divide-zinc-100">
              {topCategories.map((category, index) => (
                <div key={category.id} className="flex items-center justify-between px-6 py-4 hover:bg-zinc-50/50 transition">
                  <div className="flex items-center gap-4">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-sm font-semibold text-emerald-600">
                      {index + 1}
                    </span>
                    <div>
                      <p className="font-medium text-zinc-800">{category.name}</p>
                      <p className="text-xs text-zinc-400">{category.slug}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-zinc-800">{category.metrics?.totalViews || 0}</p>
                    <p className="text-xs text-zinc-400">views</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Top Products */}
        <section className="overflow-hidden rounded-3xl border border-zinc-200/70 bg-white shadow-sm">
          <div className="border-b border-zinc-100 bg-zinc-50 px-6 py-4">
            <h2 className="text-lg font-semibold text-zinc-800">Top Products by Views</h2>
            <p className="mt-1 text-sm text-zinc-500">Most viewed products</p>
          </div>
          {loading ? (
            <div className="px-6 py-10 text-center text-zinc-400">Loading...</div>
          ) : topProducts.length === 0 ? (
            <div className="px-6 py-10 text-center text-zinc-400">No product views yet</div>
          ) : (
            <div className="divide-y divide-zinc-100">
              {topProducts.map((product, index) => (
                <div key={product.id} className="flex items-center justify-between px-6 py-4 hover:bg-zinc-50/50 transition">
                  <div className="flex items-center gap-4">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-sm font-semibold text-emerald-600">
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-zinc-800">{product.name}</p>
                      <p className="text-xs text-zinc-400">€{product.basePrice?.toFixed(2) || '0.00'}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-zinc-800">{product.metrics?.totalViews || 0}</p>
                    <p className="text-xs text-zinc-400">views</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <div className="rounded-2xl bg-blue-50/50 border border-blue-200 p-4 text-sm text-blue-700">
        <p className="font-medium">Note</p>
        <p className="mt-1">
          Analytics only track views from signed-in users. Views are updated in real-time as users interact with categories and products.
        </p>
      </div>
    </div>
  );
}

