'use client';

import { useCart } from '@/lib/cart';
import Link from 'next/link';
import SignInNewsletterModal from '@/components/SignInNewsletterModal';

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

const formatPrice = (value) => currencyFormatter.format(value ?? 0);

export default function CartPage() {
  const { cart, loading, removeFromCart, updateQuantity, getCartTotal, getCartItemCount } = useCart();

  const subtotal = getCartTotal();
  const shipping = subtotal >= 150 ? 0 : 15; // Free shipping over $150
  const total = subtotal + shipping;

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-white via-pink-50/40 to-white">
        <div className="mx-auto flex max-w-6xl items-center justify-center px-4 py-32">
          <div className="text-center">
            <div className="mb-4 inline-block h-8 w-8 animate-spin rounded-full border-4 border-pink-200 border-t-pink-500" />
            <p className="text-slate-600">Loading cart...</p>
          </div>
        </div>
      </div>
    );
  }

  if (cart.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-white via-pink-50/40 to-white">
        <header className="sticky top-0 z-40 border-b border-pink-100/70 bg-white/90 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
            <Link href="/" className="text-sm font-medium text-pink-500 transition hover:text-pink-600">
              ← Back to shop
            </Link>
            <h1 className="text-xl font-light text-slate-800">Shopping Cart</h1>
            <div className="w-20" /> {/* Spacer */}
          </div>
        </header>

        <main className="mx-auto flex max-w-2xl flex-col items-center justify-center px-4 py-32">
          <div className="text-center">
            <svg
              className="mx-auto h-16 w-16 text-pink-200"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007zM8.625 10.5a.375.375 0 11-.75 0 .375.375 0 01.75 0zm7.5 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"
              />
            </svg>
            <h2 className="mt-4 text-2xl font-light text-slate-800">Your cart is empty</h2>
            <p className="mt-2 text-slate-600">Start shopping to add items to your cart.</p>
            <Link
              href="/"
              className="mt-6 inline-flex items-center justify-center rounded-full bg-pink-500 px-8 py-3 text-sm font-semibold uppercase tracking-[0.3em] text-white shadow-lg transition hover:bg-pink-400"
            >
              Continue shopping
            </Link>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-white via-pink-50/40 to-white">
      <SignInNewsletterModal />
      <header className="sticky top-0 z-40 border-b border-pink-100/70 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-2 text-sm font-medium text-pink-500 transition hover:text-pink-600">
            <svg
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="2"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
            <span>Continue shopping</span>
          </Link>
          <h1 className="text-xl font-light text-slate-800">Shopping Cart ({getCartItemCount()} items)</h1>
          <div className="w-20" /> {/* Spacer */}
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid gap-12 lg:grid-cols-3">
          {/* Cart Items */}
          <div className="lg:col-span-2">
            <div className="space-y-6">
              {cart.map((item) => (
                <div
                  key={`${item.productId}-${item.variantId || 'default'}`}
                  className="flex gap-6 rounded-2xl border border-pink-100/70 bg-white/90 p-6 shadow-sm"
                >
                  {item.image && (
                    <div className="h-24 w-24 flex-shrink-0 overflow-hidden rounded-xl bg-pink-50/70">
                      <img src={item.image} alt={item.productName} className="h-full w-full object-cover" />
                    </div>
                  )}
                  <div className="flex flex-1 flex-col gap-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-medium text-slate-800">{item.productName}</h3>
                        {item.variantName && (
                          <p className="text-sm text-slate-500">{item.variantName}</p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => removeFromCart(item.productId, item.variantId)}
                        className="text-slate-400 transition hover:text-red-500"
                        aria-label="Remove item"
                      >
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => updateQuantity(item.productId, item.variantId, item.quantity - 1)}
                          className="flex h-8 w-8 items-center justify-center rounded-lg border border-pink-200 text-pink-600 transition hover:bg-pink-50"
                          aria-label="Decrease quantity"
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12h-15" />
                          </svg>
                        </button>
                        <span className="w-8 text-center text-sm font-medium text-slate-800">{item.quantity}</span>
                        <button
                          type="button"
                          onClick={() => updateQuantity(item.productId, item.variantId, item.quantity + 1)}
                          className="flex h-8 w-8 items-center justify-center rounded-lg border border-pink-200 text-pink-600 transition hover:bg-pink-50"
                          aria-label="Increase quantity"
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                          </svg>
                        </button>
                      </div>
                      <p className="text-lg font-semibold text-pink-500">{formatPrice(item.priceAtAdd * item.quantity)}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Order Summary */}
          <div className="lg:col-span-1">
            <div className="sticky top-24 rounded-2xl border border-pink-100/70 bg-white/90 p-6 shadow-sm">
              <h2 className="mb-6 text-lg font-semibold text-slate-800">Order Summary</h2>
              <div className="space-y-4">
                <div className="flex justify-between text-sm text-slate-600">
                  <span>Subtotal</span>
                  <span>{formatPrice(subtotal)}</span>
                </div>
                <div className="flex justify-between text-sm text-slate-600">
                  <span>Shipping</span>
                  <span>{shipping === 0 ? <span className="text-green-600">Free</span> : formatPrice(shipping)}</span>
                </div>
                {subtotal < 150 && (
                  <p className="text-xs text-slate-500">
                    Add {formatPrice(150 - subtotal)} more for free shipping
                  </p>
                )}
                <div className="border-t border-pink-100 pt-4">
                  <div className="flex justify-between text-lg font-semibold text-slate-800">
                    <span>Total</span>
                    <span>{formatPrice(total)}</span>
                  </div>
                </div>
              </div>

              {/* Checkout - Under Development */}
              <div className="mt-8">
                <div className="rounded-xl border-2 border-dashed border-amber-200 bg-amber-50/50 p-6 text-center">
                  <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-amber-100">
                    <svg
                      className="h-6 w-6 text-amber-600"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth="2"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
                      />
                    </svg>
                  </div>
                  <h3 className="mb-2 text-lg font-semibold text-amber-900">Checkout Under Development</h3>
                  <p className="mb-4 text-sm text-amber-700">
                    We're currently finalizing our payment processing system. Checkout will be available soon!
                  </p>
                  <div className="rounded-lg bg-white/80 p-4 text-left">
                    <p className="text-xs font-medium text-amber-800 mb-2">What's coming:</p>
                    <ul className="space-y-1 text-xs text-amber-700">
                      <li className="flex items-start gap-2">
                        <svg className="h-4 w-4 mt-0.5 flex-shrink-0 text-amber-600" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                        </svg>
                        <span>Secure card payments</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <svg className="h-4 w-4 mt-0.5 flex-shrink-0 text-amber-600" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                        </svg>
                        <span>Multiple payment options</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <svg className="h-4 w-4 mt-0.5 flex-shrink-0 text-amber-600" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                        </svg>
                        <span>Order tracking</span>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

