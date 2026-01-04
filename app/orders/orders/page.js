'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { getFirebaseDb } from '@/lib/firebase';
import { subscribeToAuth } from '@/lib/auth';
import { getStorefront } from '@/lib/get-storefront';
import AuthButton from '@/components/AuthButton';

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

const formatPrice = (value) => currencyFormatter.format(value ?? 0);

const getStatusColor = (status) => {
  switch (status) {
    case 'paid':
      return 'bg-green-100 text-green-800';
    case 'shipped':
      return 'bg-blue-100 text-blue-800';
    case 'cancelled':
      return 'bg-red-100 text-red-800';
    default:
      return 'bg-yellow-100 text-yellow-800';
  }
};

const getStatusLabel = (status) => {
  switch (status) {
    case 'paid':
      return 'Payment Received';
    case 'shipped':
      return 'Shipped';
    case 'cancelled':
      return 'Cancelled';
    default:
      return 'Pending';
  }
};

export default function OrdersPage() {
  const router = useRouter();
  const storefront = getStorefront(); // Get storefront from URL
  // Colors come from Info document (CSS variables provide fallbacks)
  const primaryColor = '#ec4899'; // Fallback - should fetch from Info document if needed
  const primaryColorHover = '#ec4899E6';
  
  const [user, setUser] = useState(null);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const unsubscribe = subscribeToAuth((currentUser) => {
      setUser(currentUser);
      
      if (!currentUser) {
        // Redirect to home if not authenticated
        router.push(`/${storefront}`);
        return;
      }

      // Fetch orders for this user
      const db = getFirebaseDb();
      if (!db) {
        setError('Database not available');
        setLoading(false);
        return;
      }

      // Query orders by userId or email (storefront-specific)
      // Path: {storefront}/orders/items
      const ordersRef = collection(db, storefront, 'orders', 'items');
      
      // Query by userId first
      const ordersQuery = query(
        ordersRef,
        where('userId', '==', currentUser.uid),
        orderBy('placedAt', 'desc')
      );

      const unsubscribeOrders = onSnapshot(
        ordersQuery,
        (snapshot) => {
          const ordersData = snapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
          }));
          setOrders(ordersData);
          setLoading(false);
        },
        (err) => {
          console.error('Failed to fetch orders:', err);
          setError('Failed to load orders');
          setLoading(false);
        }
      );

      return () => {
        if (typeof unsubscribeOrders === 'function') unsubscribeOrders();
      };
    });

    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, [router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-slate-500">Loading orders...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-white via-secondary/40 to-white">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-secondary/70 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 sm:justify-between sm:gap-4 sm:px-6 lg:px-8">
            <Link href={`/${storefront}`} className="text-xl font-light text-primary tracking-wide">
              {storefront}
            </Link>
          <AuthButton />
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <h1 className="mb-8 text-3xl font-light text-primary">My Orders</h1>

        {error && (
          <div className="mb-6 rounded-lg border border-red-300 bg-red-50 p-4 text-red-800">
            {error}
          </div>
        )}

        {orders.length === 0 ? (
          <div className="rounded-xl border border-secondary/70 bg-white/90 p-12 text-center">
            <p className="mb-4 text-slate-600">You haven't placed any orders yet.</p>
            <Link
                href={`/${storefront}`}
              className="inline-block rounded-full px-6 py-3 font-semibold text-white transition"
              style={{
                backgroundColor: primaryColor,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = primaryColorHover;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = primaryColor;
              }}
            >
              Start Shopping
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {orders.map((order) => (
              <Link
                key={order.id}
                href={`/${storefront}/order-confirmation/${order.id}`}
                className="block rounded-xl border border-secondary/70 bg-white/90 p-6 transition hover:shadow-lg"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="mb-2 flex items-center gap-4">
                      <h3 className="text-lg font-medium text-primary">
                        Order #{order.orderNumber || order.id}
                      </h3>
                      <span className={`rounded-full px-3 py-1 text-xs font-medium ${getStatusColor(order.status)}`}>
                        {getStatusLabel(order.status)}
                      </span>
                    </div>
                    <p className="mb-2 text-sm text-slate-600">
                      Placed on {order.placedAt?.toDate ? new Date(order.placedAt.toDate()).toLocaleDateString() : 'N/A'}
                    </p>
                    <p className="text-sm text-slate-600">
                      {order.items?.length || 0} item{order.items?.length !== 1 ? 's' : ''} • {formatPrice(order.totals?.grandTotal || 0)}
                    </p>
                    {order.fulfillment?.trackingNumber && (
                      <p className="mt-2 text-sm font-medium text-blue-600">
                        Tracking: {order.fulfillment.trackingNumber}
                      </p>
                    )}
                  </div>
                  <svg
                    className="h-5 w-5 text-slate-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

