'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { collection, getDocs } from 'firebase/firestore';
import { getFirebaseDb } from '@/lib/firebase';
import { getStoreCollectionPath } from '@/lib/store-collections';
import { useWebsite } from '@/lib/website-context';
import EditSiteInfoButton from '@/components/admin/EditSiteInfoButton';

const QUICK_ACTIONS = [
  {
    href: '/LUNERA/admin/products',
    title: 'Manage products',
    description: 'Review, edit, and publish store products.',
  },
  {
    href: '/LUNERA/admin/products/new',
    title: 'Create product manually',
    description: 'Add a product that is not sourced from Shopify.',
  },
  {
    href: '/LUNERA/admin/overview/shopifyItems',
    title: 'Process Shopify imports',
    description: 'Select images, variants, and publish imported items.',
  },
  {
    href: '/LUNERA/admin/categories',
    title: 'Manage categories',
    description: 'Organize storefront collections and featured items.',
  },
  {
    href: '/LUNERA/admin/promotions',
    title: 'Manage promotions',
    description: 'Schedule and monitor promotional campaigns.',
  },
  {
    href: '/LUNERA/admin/analytics',
    title: 'Engagement analytics',
    description: 'Track category and product view metrics.',
  },
];

export default function EcommerceOverview() {
  const db = getFirebaseDb();
  const { selectedWebsite } = useWebsite();
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState({
    totalProducts: 0,
    totalCategories: 0,
    activeCategories: 0,
    totalPromotions: 0,
    pendingShopify: 0,
  });
  const [pendingShopifyPreview, setPendingShopifyPreview] = useState([]);

  useEffect(() => {
    if (!db) {
      setLoading(false);
      return;
    }

    let isMounted = true;

    const loadData = async () => {
      setLoading(true);
      try {
        const [categoriesSnap, productsSnap, promotionsSnap, shopifySnap] = await Promise.all([
          getDocs(collection(db, ...getStoreCollectionPath('categories', selectedWebsite))),
          getDocs(collection(db, ...getStoreCollectionPath('products', selectedWebsite))),
          getDocs(collection(db, ...getStoreCollectionPath('promotions', selectedWebsite))),
          getDocs(collection(db, selectedWebsite || 'LUNERA', 'shopify', 'items')),
        ]);

        if (!isMounted) return;

        const categories = categoriesSnap.docs.map((doc) => doc.data());
        const promotions = promotionsSnap.docs.map((doc) => doc.data());

        const shopifyItems = shopifySnap.docs.map((doc) => {
          const data = doc.data();
          const createdAt =
            typeof data.createdAt?.toMillis === 'function'
              ? data.createdAt.toMillis()
              : data.createdAt?.seconds
              ? data.createdAt.seconds * 1000
              : 0;
          return {
            id: doc.id,
            title: data.title || '',
            processed: data.processed || false,
            createdAt,
          };
        });

        const pendingShopify = shopifyItems.filter((item) => !item.processed);

        setSummary({
          totalProducts: productsSnap.size,
          totalCategories: categories.length,
          activeCategories: categories.filter((category) => category.active !== false).length,
          totalPromotions: promotions.length,
          pendingShopify: pendingShopify.length,
        });

        setPendingShopifyPreview(
          pendingShopify
            .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
            .slice(0, 3)
        );
      } catch (error) {
        console.error('Failed to load admin overview data', error);
        if (isMounted) {
          setSummary({
            totalProducts: 0,
            totalCategories: 0,
            activeCategories: 0,
            totalPromotions: 0,
            pendingShopify: 0,
          });
          setPendingShopifyPreview([]);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    loadData();

    return () => {
      isMounted = false;
    };
  }, [db, selectedWebsite]);

  const summaryCards = useMemo(
    () => [
      { label: 'Products', value: summary.totalProducts },
      { label: 'Active categories', value: summary.activeCategories },
      { label: 'Total categories', value: summary.totalCategories },
      { label: 'Pending Shopify imports', value: summary.pendingShopify },
      { label: 'Promotions', value: summary.totalPromotions },
    ],
    [summary]
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-50 via-white to-zinc-100 text-zinc-900 transition-colors dark:from-black dark:via-zinc-950 dark:to-black dark:text-zinc-100">
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-6 py-12 sm:px-10">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <p className="text-sm uppercase tracking-[0.2em] text-zinc-500 dark:text-zinc-400">
              Admin overview
            </p>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Store operations
            </h1>
            <p className="max-w-2xl text-base text-zinc-600 dark:text-zinc-400">
              Monitor the health of the storefront and jump straight into the day-to-day workflows.
            </p>
          </div>
          <EditSiteInfoButton />
        </header>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {summaryCards.map((card) => (
            <div
              key={card.label}
              className="rounded-3xl border border-zinc-200/70 bg-white/80 p-5 shadow-sm backdrop-blur-sm dark:border-zinc-800/80 dark:bg-zinc-900/60"
            >
              <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">{card.label}</p>
              <p className="mt-3 text-2xl font-semibold">
                {loading ? '—' : card.value.toLocaleString()}
              </p>
            </div>
          ))}
        </section>

        <section className="grid gap-6 lg:grid-cols-[3fr_2fr]">
          <div className="rounded-3xl border border-zinc-200/70 bg-white/80 p-6 shadow-sm backdrop-blur-sm dark:border-zinc-800/80 dark:bg-zinc-900/60">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Quick actions</h2>
            </div>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {QUICK_ACTIONS.map((action) => (
                <Link
                  key={action.href}
                  href={action.href}
                  className="group flex h-full flex-col justify-between rounded-2xl border border-zinc-200/70 px-4 py-5 transition hover:border-emerald-200 hover:bg-emerald-50/60 dark:border-zinc-800/70 dark:hover:border-emerald-500/40 dark:hover:bg-emerald-500/10"
                >
                  <div>
                    <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                      {action.title}
                    </p>
                    <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
                      {action.description}
                    </p>
                  </div>
                  <span className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-emerald-600 transition group-hover:translate-x-1 dark:text-emerald-400">
                    Open
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </span>
                </Link>
              ))}
            </div>
          </div>

          <aside className="flex flex-col gap-4 rounded-3xl border border-zinc-200/70 bg-white/80 p-6 shadow-sm backdrop-blur-sm dark:border-zinc-800/80 dark:bg-zinc-900/60">
            <div>
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                Shopify queue
              </h2>
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                {summary.pendingShopify > 0
                  ? 'Pending imports ready for processing.'
                  : 'All imported Shopify items are processed.'}
              </p>
            </div>

            {loading ? (
              <div className="rounded-2xl border border-dashed border-zinc-200/70 px-4 py-6 text-center text-sm text-zinc-500 dark:border-zinc-800/80 dark:text-zinc-400">
                Loading queue…
              </div>
            ) : pendingShopifyPreview.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-zinc-200/70 px-4 py-6 text-center text-sm text-zinc-500 dark:border-zinc-800/80 dark:text-zinc-400">
                No pending Shopify items.
              </div>
            ) : (
              <ul className="space-y-3">
                {pendingShopifyPreview.map((item) => (
                  <li
                    key={item.id}
                    className="rounded-2xl border border-zinc-200/70 px-4 py-3 text-sm text-zinc-700 transition hover:border-emerald-200 hover:bg-emerald-50/60 dark:border-zinc-800/80 dark:text-zinc-200 dark:hover:border-emerald-500/40 dark:hover:bg-emerald-500/10"
                  >
                    <p className="line-clamp-2 font-medium">{item.title || 'Untitled item'}</p>
                  </li>
                ))}
              </ul>
            )}

            <Link
              href="/LUNERA/admin/overview/shopifyItems"
              className="mt-auto inline-flex items-center justify-center rounded-full border border-emerald-200 bg-emerald-50/60 px-4 py-2 text-xs font-semibold text-emerald-600 transition hover:border-emerald-300 hover:bg-emerald-100 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300 dark:hover:border-emerald-400"
            >
              Open Shopify queue
            </Link>
          </aside>
        </section>
      </main>
    </div>
  );
}

