'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { doc, getDoc, onSnapshot, collection, query, where, getDocs } from 'firebase/firestore';
import { getFirebaseDb } from '@/lib/firebase';
import { getStorefront } from '@/lib/get-storefront';
import { getStorefrontTheme } from '@/lib/storefront-logos';
import AuthButton from '@/components/AuthButton';

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

const formatPrice = (value) => currencyFormatter.format(value ?? 0);

export default function OrderConfirmationPage() {
  const params = useParams();
  const router = useRouter();
  const pathname = usePathname();
  const orderId = params?.orderId;
  const storefront = getStorefront(); // Get storefront from URL
  const theme = getStorefrontTheme(storefront);
  const primaryColor = theme.primaryColor || '#ec4899';
  const primaryColorHover = theme.primaryColorHover || `${primaryColor}E6`;
  
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!orderId) {
      setError('Order ID is required');
      setLoading(false);
      return;
    }

    const db = getFirebaseDb();
    if (!db) {
      setError('Database not available');
      setLoading(false);
      return;
    }

    // Fetch order from Firestore (storefront-specific)
    // Support both Firestore document ID and Shopify order number
    // Path: {storefront}/orders/items/{orderId} OR query by orderNumber
    
    // Polling function with fallback to Shopify Admin API
    const fetchOrder = async () => {
      let orderData = null;
      let attempts = 0;
      const maxAttempts = 10; // Poll for up to 10 seconds

      // Try Firestore first (webhook may have synced it)
      while (!orderData && attempts < maxAttempts) {
        try {
          // First, try direct document lookup (if orderId is Firestore doc ID)
          const orderRef = doc(db, storefront, 'orders', 'items', orderId);
          const docSnap = await getDoc(orderRef);
          
          if (docSnap.exists()) {
            orderData = { id: docSnap.id, ...docSnap.data() };
            setOrder(orderData);
            setLoading(false);
            return orderData.id;
          }
          
          // If not found, try querying by orderNumber (if orderId is Shopify order number)
          const ordersCollection = collection(db, storefront, 'orders', 'items');
          const orderNumberQuery = query(ordersCollection, where('orderNumber', '==', orderId));
          const orderNumberSnapshot = await getDocs(orderNumberQuery);
          
          if (!orderNumberSnapshot.empty) {
            const orderDoc = orderNumberSnapshot.docs[0];
            orderData = { id: orderDoc.id, ...orderDoc.data() };
            setOrder(orderData);
            setLoading(false);
            return orderData.id;
          }
        } catch (err) {
          console.error('Failed to fetch order from Firestore:', err);
        }

        // Wait 1 second before retrying (webhook might still be processing)
        if (!orderData && attempts < maxAttempts - 1) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
        attempts++;
      }

      // Fallback: If not found in Firestore, try Shopify Admin API
      if (!orderData) {
        try {
          const response = await fetch(`/api/checkout/get-order?orderId=${orderId}`);
          if (response.ok) {
            const shopifyOrder = await response.json();
            if (shopifyOrder) {
              // Transform Shopify order format to match our Firestore format
              orderData = {
                shopifyOrderId: shopifyOrder.id?.toString(),
                orderNumber: shopifyOrder.order_number?.toString() || shopifyOrder.name,
                email: shopifyOrder.email,
                status: shopifyOrder.financial_status === 'paid' ? 'paid' : 'pending',
                items: (shopifyOrder.line_items || []).map((item) => ({
                  productId: item.product_id?.toString(),
                  variantId: item.variant_id?.toString(),
                  quantity: item.quantity,
                  unitPrice: parseFloat(item.price || 0),
                  subtotal: parseFloat(item.price || 0) * (item.quantity || 0),
                  title: item.title || '',
                  sku: item.sku || null,
                })),
                totals: {
                  subtotal: parseFloat(shopifyOrder.subtotal_price || 0),
                  tax: parseFloat(shopifyOrder.total_tax || 0),
                  shipping: parseFloat(shopifyOrder.total_shipping_price_set?.shop_money?.amount || 0),
                  grandTotal: parseFloat(shopifyOrder.total_price || 0),
                },
                shippingAddress: shopifyOrder.shipping_address ? {
                  firstName: shopifyOrder.shipping_address.first_name,
                  lastName: shopifyOrder.shipping_address.last_name,
                  address1: shopifyOrder.shipping_address.address1,
                  address2: shopifyOrder.shipping_address.address2,
                  city: shopifyOrder.shipping_address.city,
                  province: shopifyOrder.shipping_address.province,
                  zip: shopifyOrder.shipping_address.zip,
                  country: shopifyOrder.shipping_address.country,
                  phone: shopifyOrder.shipping_address.phone,
                } : null,
                placedAt: shopifyOrder.created_at ? new Date(shopifyOrder.created_at) : new Date(),
              };
              setOrder(orderData);
              setLoading(false);
              return null; // Can't subscribe to Shopify API orders
            }
          }
        } catch (err) {
          console.error('Failed to fetch order from Shopify:', err);
        }
      }

      // If still not found, show error
      if (!orderData) {
        setError('Order not found. It may still be processing. Please check back in a few moments.');
        setLoading(false);
        return null;
      }
      
      // Return the found order document ID for subscription
      return orderData.id;
    };

    let unsubscribe = null;
    
    fetchOrder().then((foundOrderId) => {
      // Subscribe to real-time updates if we found the order
      if (foundOrderId && db) {
        // Subscribe to the specific order document
        const orderRef = doc(db, storefront, 'orders', 'items', foundOrderId);
        unsubscribe = onSnapshot(
          orderRef,
          (docSnap) => {
            if (docSnap.exists()) {
              setOrder({ id: docSnap.id, ...docSnap.data() });
            }
          },
          (err) => {
            console.error('Order subscription error:', err);
          }
        );
      }
    });

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [orderId, storefront]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-slate-500">Loading order...</div>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-white via-secondary/40 to-white">
        <header className="sticky top-0 z-50 border-b border-secondary/70 bg-white/90 backdrop-blur">
          <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 sm:justify-between sm:gap-4 sm:px-6 lg:px-8">
            <Link href={`/${storefront}`} className="text-xl font-light text-primary tracking-wide">
              {storefront}
            </Link>
            <AuthButton />
          </div>
        </header>
        <main className="mx-auto max-w-4xl px-4 py-16 text-center">
          <h1 className="mb-4 text-2xl font-medium text-primary">Order Not Found</h1>
          <p className="mb-8 text-slate-600">{error || 'The order you are looking for does not exist.'}</p>
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
            Continue Shopping
          </Link>
        </main>
      </div>
    );
  }

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

  return (
    <div className="min-h-screen bg-gradient-to-b from-white via-secondary/40 to-white">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-secondary/70 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 sm:justify-between sm:gap-4 sm:px-6 lg:px-8">
          <Link href="/LUNERA" className="text-xl font-light text-primary tracking-wide">
            LUNERA
          </Link>
          <AuthButton />
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Success Message */}
        <div className="mb-8 rounded-xl border border-green-300 bg-green-50 p-6 text-center">
          <svg
            className="mx-auto mb-4 h-12 w-12 text-green-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <h1 className="mb-2 text-2xl font-medium text-green-900">Order Confirmed!</h1>
          <p className="text-green-700">
            Thank you for your order. We've sent a confirmation email to {order.email}
          </p>
        </div>

        {/* Order Details */}
        <div className="mb-8 rounded-xl border border-secondary/70 bg-white/90 p-6">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-medium text-primary">Order Details</h2>
              <p className="text-sm text-slate-600">
                Order #{order.orderNumber || order.id}
              </p>
            </div>
            <span className={`rounded-full px-3 py-1 text-xs font-medium ${getStatusColor(order.status)}`}>
              {getStatusLabel(order.status)}
            </span>
          </div>

          {/* Order Items */}
          <div className="mb-6 space-y-4 border-b border-secondary/70 pb-6">
            {order.items?.map((item, index) => (
              <div key={index} className="flex items-center gap-4">
                {item.image && (
                  <img
                    src={item.image}
                    alt={item.title}
                    className="h-20 w-20 rounded-lg object-cover"
                  />
                )}
                <div className="flex-1">
                  <p className="font-medium">{item.title}</p>
                  <p className="text-sm text-slate-600">Quantity: {item.quantity}</p>
                </div>
                <p className="font-medium">{formatPrice(item.subtotal)}</p>
              </div>
            ))}
          </div>

          {/* Totals */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Subtotal</span>
              <span>{formatPrice(order.totals?.subtotal || 0)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>Shipping</span>
              <span>{formatPrice(order.totals?.shipping || 0)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>Tax</span>
              <span>{formatPrice(order.totals?.tax || 0)}</span>
            </div>
            <div className="flex justify-between border-t border-secondary/70 pt-2 font-semibold">
              <span>Total</span>
              <span>{formatPrice(order.totals?.grandTotal || 0)}</span>
            </div>
          </div>
        </div>

        {/* Shipping Address */}
        {order.shippingAddress && (
          <div className="mb-8 rounded-xl border border-secondary/70 bg-white/90 p-6">
            <h2 className="mb-4 text-lg font-medium text-primary">Shipping Address</h2>
            <div className="text-sm text-slate-600">
              <p className="font-medium">
                {order.shippingAddress.firstName} {order.shippingAddress.lastName}
              </p>
              <p>{order.shippingAddress.address1}</p>
              {order.shippingAddress.address2 && <p>{order.shippingAddress.address2}</p>}
              <p>
                {order.shippingAddress.city}, {order.shippingAddress.province} {order.shippingAddress.zip}
              </p>
              <p>{order.shippingAddress.country}</p>
              {order.shippingAddress.phone && <p className="mt-2">Phone: {order.shippingAddress.phone}</p>}
            </div>
          </div>
        )}

        {/* Shipping/Tracking Info */}
        {order.fulfillment && (
          <div className="mb-8 rounded-xl border border-blue-300 bg-blue-50 p-6">
            <h2 className="mb-4 text-lg font-medium text-blue-900">Shipping Information</h2>
            {order.fulfillment.trackingNumber && (
              <div className="mb-3">
                <p className="text-sm font-medium text-blue-800">Tracking Number:</p>
                <p className="text-lg font-semibold text-blue-900">{order.fulfillment.trackingNumber}</p>
              </div>
            )}
            {order.fulfillment.trackingUrl && (
              <a
                href={order.fulfillment.trackingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block text-sm font-medium text-blue-600 underline hover:text-blue-800"
              >
                Track Package
              </a>
            )}
            {order.fulfillment.status && (
              <p className="mt-2 text-sm text-blue-700">
                Status: <span className="font-medium">{order.fulfillment.status}</span>
              </p>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-col gap-4 sm:flex-row">
          <Link
            href={`/${storefront}/orders`}
            className="flex-1 rounded-full border border-primary bg-white px-6 py-3 text-center font-semibold text-primary transition hover:bg-secondary"
          >
            View All Orders
          </Link>
          <Link
            href={`/${storefront}`}
            className="flex-1 rounded-full px-6 py-3 text-center font-semibold text-white transition"
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
            Continue Shopping
          </Link>
        </div>
      </main>
    </div>
  );
}

