'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { collection, doc, onSnapshot, orderBy, query, serverTimestamp, updateDoc } from 'firebase/firestore';
import { getFirebaseDb } from '@/lib/firebase';
import { getStoreCollectionPath } from '@/lib/store-collections';
import Toast from '@/components/admin/Toast';

export default function PromotionsListPage() {
  const router = useRouter();
  const db = getFirebaseDb();
  const [promotions, setPromotions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all'); // 'all', 'active', 'upcoming', 'expired'
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch promotions
  useEffect(() => {
    if (!db) {
      setLoading(false);
      return undefined;
    }

    const promotionsQuery = query(
      collection(db, ...getStoreCollectionPath('promotions')),
      orderBy('createdAt', 'desc')
    );
    const unsubscribe = onSnapshot(
      promotionsQuery,
      (snapshot) => {
        const data = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        setPromotions(data);
        setLoading(false);
      },
      (error) => {
        console.error('Failed to load promotions', error);
        setMessage({ type: 'error', text: 'Failed to load promotions.' });
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [db]);

  // Filter promotions by status and search
  const filteredPromotions = useMemo(() => {
    const now = new Date();

    return promotions.filter((promo) => {
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesSearch =
          promo.code?.toLowerCase().includes(query) ||
          promo.description?.toLowerCase().includes(query);
        if (!matchesSearch) return false;
      }

      // Status filter
      if (statusFilter === 'all') return true;

      const startDate = promo.startDate?.toDate?.() || null;
      const endDate = promo.endDate?.toDate?.() || null;

      if (statusFilter === 'active') {
        const isActive =
          (!startDate || startDate <= now) && (!endDate || endDate >= now);
        return isActive;
      }

      if (statusFilter === 'upcoming') {
        return startDate && startDate > now;
      }

      if (statusFilter === 'expired') {
        return endDate && endDate < now;
      }

      return true;
    });
  }, [promotions, statusFilter, searchQuery]);

  const getStatus = (promo) => {
    const now = new Date();
    const startDate = promo.startDate?.toDate?.() || null;
    const endDate = promo.endDate?.toDate?.() || null;

    if (endDate && endDate < now) return 'expired';
    if (startDate && startDate > now) return 'upcoming';
    if ((!startDate || startDate <= now) && (!endDate || endDate >= now)) return 'active';
    return 'unknown';
  };

  const formatDiscount = (promo) => {
    if (promo.type === 'percentage') {
      return `${promo.value}% off`;
    }
    return `€${promo.value?.toFixed(2) || '0.00'} off`;
  };

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-8 px-6 py-16">
      <header className="space-y-2">
        <button
          onClick={() => router.push('/admin/overview')}
          className="text-sm font-medium text-emerald-600 transition hover:text-emerald-500"
        >
          ← Back to admin
        </button>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-semibold text-zinc-900">Promotions</h1>
            <p className="text-base text-zinc-500">
              Manage discount codes and promotional campaigns.
            </p>
          </div>
          <Link
            href="/admin/promotions/new"
            className="rounded-full bg-emerald-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-500"
          >
            + New promotion
          </Link>
        </div>
      </header>

      <Toast message={message} onDismiss={() => setMessage(null)} />

      {/* Filters */}
      <section className="space-y-4 rounded-3xl border border-zinc-200/70 bg-white/80 p-6 shadow-sm backdrop-blur-sm">
        <div className="grid gap-4 sm:grid-cols-2">
          {/* Search */}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-zinc-600">Search</label>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by code or description..."
              className="rounded-xl border border-zinc-200 px-4 py-2 text-sm focus:border-emerald-400 focus:outline-none"
            />
          </div>

          {/* Status filter */}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-zinc-600">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-xl border border-zinc-200 px-4 py-2 text-sm focus:border-emerald-400 focus:outline-none"
            >
              <option value="all">All promotions</option>
              <option value="active">Active</option>
              <option value="upcoming">Upcoming</option>
              <option value="expired">Expired</option>
            </select>
          </div>
        </div>

        {/* Results count */}
        <div className="border-t border-zinc-100 pt-4">
          <p className="text-sm text-zinc-500">
            Showing {filteredPromotions.length} of {promotions.length} promotions
          </p>
        </div>
      </section>

      {/* Promotions table */}
      <section className="overflow-hidden rounded-3xl border border-zinc-200/70 bg-white shadow-sm">
        {loading ? (
          <div className="px-4 py-10 text-center text-zinc-400">Loading promotions...</div>
        ) : filteredPromotions.length === 0 ? (
          <div className="px-4 py-10 text-center text-zinc-400">
            {searchQuery || statusFilter !== 'all' ? 'No promotions match your filters.' : 'No promotions yet. Create your first promotion to get started.'}
          </div>
        ) : (
          <table className="min-w-full divide-y divide-zinc-100 bg-white text-sm">
            <thead className="bg-zinc-50 text-zinc-500">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Code</th>
                <th className="px-4 py-3 text-left font-medium">Description</th>
                <th className="px-4 py-3 text-left font-medium">Discount</th>
                <th className="px-4 py-3 text-left font-medium">Valid Period</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-left font-medium">Usage</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {filteredPromotions.map((promo) => {
                const status = getStatus(promo);
                const startDate = promo.startDate?.toDate?.();
                const endDate = promo.endDate?.toDate?.();

                return (
                  <tr key={promo.id} className="hover:bg-zinc-50/80 transition">
                    <td className="px-4 py-3">
                      <span className="font-mono font-medium text-zinc-800">{promo.code}</span>
                    </td>
                    <td className="px-4 py-3 text-zinc-600">
                      {promo.description || '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-medium text-emerald-600">{formatDiscount(promo)}</span>
                    </td>
                    <td className="px-4 py-3 text-zinc-500 text-xs">
                      {startDate ? (
                        <div>
                          <div>From: {startDate.toLocaleDateString()}</div>
                          {endDate && <div>To: {endDate.toLocaleDateString()}</div>}
                        </div>
                      ) : (
                        'No date restrictions'
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                          status === 'active'
                            ? 'bg-emerald-100 text-emerald-600'
                            : status === 'upcoming'
                            ? 'bg-blue-100 text-blue-600'
                            : status === 'expired'
                            ? 'bg-rose-100 text-rose-600'
                            : 'bg-zinc-100 text-zinc-600'
                        }`}
                      >
                        {status.charAt(0).toUpperCase() + status.slice(1)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-zinc-500">
                      {promo.maxRedemptions
                        ? `${promo.currentRedemptions || 0} / ${promo.maxRedemptions}`
                        : promo.currentRedemptions || 0}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/admin/promotions/${promo.id}/edit`}
                        className="rounded-full border border-zinc-200 px-3 py-1 text-xs font-medium text-zinc-600 transition hover:border-emerald-200 hover:bg-emerald-50/50"
                      >
                        Edit
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

