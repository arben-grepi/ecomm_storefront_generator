'use client';

import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { getFirebaseDb } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

const formatPrice = (value) => currencyFormatter.format(value ?? 0);

export default function OrderConfirmationPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const orderId = searchParams.get('orderId');
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!orderId) {
      setError('No order ID provided');
      setLoading(false);
      return;
    }

    const fetchOrder = async () => {
      try {
        const db = getFirebaseDb();
        if (!db) {
          setError('Database connection failed');
          setLoading(false);
          return;
        }

        const orderRef = doc(db, 'orders', orderId);
        const orderDoc = await orderRef.get();

        if (!orderDoc.exists()) {
          setError('Order not found');
          setLoading(false);
          return;
        }

        const orderData = orderDoc.data();
        setOrder({
          id: orderDoc.id,
          ...orderData,
        });
      } catch (err) {
        console.error('Error fetching order:', err);
        setError('Failed to load order details');
      } finally {
        setLoading(false);
      }
    };

    fetchOrder();
  }, [orderId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-white via-pink-50/40 to-white">
        <div className="mx-auto flex max-w-2xl items-center justify-center px-4 py-32">
          <div className="text-center">
            <div className="mb-4 inline-block h-8 w-8 animate-spin rounded-full border-4 border-pink-200 border-t-pink-500" />
            <p className="text-slate-600">Loading order details...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-white via-pink-50/40 to-white">
        <div className="mx-auto flex max-w-2xl items-center justify-center px-4 py-32">
          <div className="text-center">
            <div className="mb-4 inline-block h-12 w-12 rounded-full bg-red-100 p-3">
              <svg
                className="h-6 w-6 text-red-600"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth="2"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </div>
            <h2 className="text-2xl font-light text-slate-800">Order Not Found</h2>
            <p className="mt-2 text-slate-600">{error || 'Unable to load order details'}</p>
            <Link
              href="/"
              className="mt-6 inline-flex items-center justify-center rounded-full bg-pink-500 px-8 py-3 text-sm font-semibold uppercase tracking-[0.3em] text-white shadow-lg transition hover:bg-pink-400"
            >
              Return to Home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-white via-pink-50/40 to-white">
      <header className="sticky top-0 z-40 border-b border-pink-100/70 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <Link href="/" className="text-sm font-medium text-pink-500 transition hover:text-pink-600">
            ← Back to shop
          </Link>
          <h1 className="text-xl font-light text-slate-800">Order Confirmation</h1>
          <div className="w-20" />
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="space-y-8">
            {/* Success Message */}
            <div className="rounded-2xl border border-green-200 bg-green-50/50 p-6 text-center">
              <div className="mb-4 inline-block h-12 w-12 rounded-full bg-green-100 p-3">
                <svg
                  className="h-6 w-6 text-green-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth="2"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M4.5 12.75l6 6 9-13.5"
                  />
                </svg>
              </div>
              <h2 className="text-2xl font-light text-slate-800">Thank you for your order!</h2>
              <p className="mt-2 text-slate-600">
                Your order #{order.id.slice(0, 8).toUpperCase()} has been confirmed.
              </p>
            </div>

            {/* Order Summary */}
            <div className="rounded-2xl border border-pink-100/70 bg-white/90 p-6 shadow-sm">
              <h3 className="mb-4 text-lg font-semibold text-slate-800">Order Summary</h3>
              <div className="space-y-4">
                {order.items?.map((item, index) => (
                  <div key={index} className="flex gap-4 border-b border-pink-100 pb-4 last:border-0">
                    {item.image && (
                      <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg bg-pink-50/70">
                        <img src={item.image} alt={item.productName} className="h-full w-full object-cover" />
                      </div>
                    )}
                    <div className="flex-1">
                      <h4 className="font-medium text-slate-800">{item.productName}</h4>
                      {item.variantName && (
                        <p className="text-sm text-slate-500">{item.variantName}</p>
                      )}
                      <p className="mt-1 text-sm text-slate-600">
                        Quantity: {item.quantity} × {formatPrice(item.unitPrice)}
                      </p>
                    </div>
                    <p className="font-semibold text-pink-500">{formatPrice(item.subtotal)}</p>
                  </div>
                ))}
              </div>

              <div className="mt-6 space-y-2 border-t border-pink-100 pt-4">
                <div className="flex justify-between text-sm text-slate-600">
                  <span>Subtotal</span>
                  <span>{formatPrice(order.totals?.subtotal)}</span>
                </div>
                {order.totals?.shipping !== undefined && (
                  <div className="flex justify-between text-sm text-slate-600">
                    <span>Shipping</span>
                    <span>
                      {order.totals.shipping === 0 ? (
                        <span className="text-green-600">Free</span>
                      ) : (
                        formatPrice(order.totals.shipping)
                      )}
                    </span>
                  </div>
                )}
                {order.totals?.tax !== undefined && order.totals.tax > 0 && (
                  <div className="flex justify-between text-sm text-slate-600">
                    <span>Tax</span>
                    <span>{formatPrice(order.totals.tax)}</span>
                  </div>
                )}
                <div className="flex justify-between border-t border-pink-100 pt-2 text-lg font-semibold text-slate-800">
                  <span>Total</span>
                  <span>{formatPrice(order.totals?.grandTotal)}</span>
                </div>
              </div>
            </div>

            {/* Shipping Address */}
            {order.shippingAddress && Object.keys(order.shippingAddress).length > 0 && (
              <div className="rounded-2xl border border-pink-100/70 bg-white/90 p-6 shadow-sm">
                <h3 className="mb-4 text-lg font-semibold text-slate-800">Shipping Address</h3>
                <div className="text-sm text-slate-600">
                  {order.shippingAddress.name && <p className="font-medium">{order.shippingAddress.name}</p>}
                  {order.shippingAddress.line1 && <p>{order.shippingAddress.line1}</p>}
                  {order.shippingAddress.line2 && <p>{order.shippingAddress.line2}</p>}
                  <p>
                    {order.shippingAddress.city}
                    {order.shippingAddress.state && `, ${order.shippingAddress.state}`}
                    {order.shippingAddress.postal_code && ` ${order.shippingAddress.postal_code}`}
                  </p>
                  {order.shippingAddress.country && <p>{order.shippingAddress.country}</p>}
                </div>
              </div>
            )}

            {/* Payment Info */}
            {order.paymentSummary && (
              <div className="rounded-2xl border border-pink-100/70 bg-white/90 p-6 shadow-sm">
                <h3 className="mb-4 text-lg font-semibold text-slate-800">Payment Information</h3>
                <div className="text-sm text-slate-600">
                  <p>
                    <span className="font-medium">Payment Method:</span> Card ending in{' '}
                    {order.paymentSummary.last4 || '****'}
                  </p>
                  <p className="mt-1">
                    <span className="font-medium">Transaction ID:</span>{' '}
                    {order.paymentSummary.transactionId?.slice(0, 20)}...
                  </p>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-col gap-3 sm:flex-row">
              <Link
                href="/"
                className="flex-1 rounded-full bg-pink-500 px-8 py-3 text-center text-sm font-semibold uppercase tracking-[0.3em] text-white shadow-lg transition hover:bg-pink-400"
              >
                Continue Shopping
              </Link>
              <button
                type="button"
                onClick={() => window.print()}
                className="flex-1 rounded-full border border-pink-200/70 bg-white/80 px-8 py-3 text-sm font-semibold uppercase tracking-[0.3em] text-pink-600 shadow-sm transition hover:bg-pink-50"
              >
                Print Receipt
              </button>
            </div>
          </div>
        </main>
    </div>
  );
}

