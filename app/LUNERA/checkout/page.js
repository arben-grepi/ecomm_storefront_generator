'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useCart } from '@/lib/cart';
import { subscribeToAuth } from '@/lib/auth';
import { getStorefront } from '@/lib/get-storefront';
import Link from 'next/link';
import AuthButton from '@/components/AuthButton';

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

const formatPrice = (value) => currencyFormatter.format(value ?? 0);

export default function CheckoutPage() {
  const router = useRouter();
  const storefront = getStorefront(); // Get storefront from URL
  const { cart, getCartTotal, clearCart, loading: cartLoading } = useCart();
  const [user, setUser] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState(null);
  
  // Form state - Simplified: Only collect Country, City, Street Address for shipping validation
  // Email, name, phone will be collected on Shopify's checkout page
  const [shippingAddress, setShippingAddress] = useState({
    address1: '', // Street address
    city: '',
    country: 'Finland',
    countryCode: 'FI',
  });

  // Load user if authenticated (for future use, not needed for checkout)
  useEffect(() => {
    const unsubscribe = subscribeToAuth((currentUser) => {
      setUser(currentUser);
    });
    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, []);

  // Redirect if cart is empty
  useEffect(() => {
    if (!cartLoading && cart.length === 0) {
      router.push(`/${storefront}`);
    }
  }, [cart, cartLoading, router, storefront]);

  const [cartId, setCartId] = useState(null); // Store cart ID
  const [validatingInventory, setValidatingInventory] = useState(false);
  const [validationError, setValidationError] = useState(null);

  const subtotal = getCartTotal();
  // Note: Shipping is selected on Shopify's checkout page, not here
  // We can show estimated shipping based on market (FI: €7, DE: €9)
  const estimatedShipping = 7; // Default estimate - actual shipping shown on checkout page
  const tax = 0; // TODO: Calculate tax
  const estimatedTotal = subtotal + estimatedShipping + tax; // Estimated total

  // Check if all required shipping information is filled (minimal: country, city, street address)
  const isShippingInfoComplete = useCallback(() => {
    return !!(
      shippingAddress.address1 &&
      shippingAddress.city &&
      shippingAddress.countryCode &&
      cart.length > 0
    );
  }, [shippingAddress, cart.length]);

  // Country list with ISO 2-letter codes (European countries only - no US shipping)
  const countries = [
    { code: 'FI', name: 'Finland' },
    { code: 'SE', name: 'Sweden' },
    { code: 'NO', name: 'Norway' },
    { code: 'DK', name: 'Denmark' },
    { code: 'DE', name: 'Germany' },
    { code: 'FR', name: 'France' },
    { code: 'IT', name: 'Italy' },
    { code: 'ES', name: 'Spain' },
    { code: 'PT', name: 'Portugal' },
    { code: 'NL', name: 'Netherlands' },
    { code: 'BE', name: 'Belgium' },
    { code: 'AT', name: 'Austria' },
    { code: 'CH', name: 'Switzerland' },
    { code: 'PL', name: 'Poland' },
    { code: 'CZ', name: 'Czech Republic' },
    { code: 'IE', name: 'Ireland' },
    { code: 'GB', name: 'United Kingdom' },
    { code: 'GR', name: 'Greece' },
    { code: 'RO', name: 'Romania' },
    { code: 'HU', name: 'Hungary' },
    { code: 'SK', name: 'Slovakia' },
    { code: 'HR', name: 'Croatia' },
    { code: 'SI', name: 'Slovenia' },
    { code: 'EE', name: 'Estonia' },
    { code: 'LV', name: 'Latvia' },
    { code: 'LT', name: 'Lithuania' },
    { code: 'BG', name: 'Bulgaria' },
    { code: 'LU', name: 'Luxembourg' },
    { code: 'MT', name: 'Malta' },
    { code: 'CY', name: 'Cyprus' },
    { code: 'IS', name: 'Iceland' },
  ];

  // Simplified validation - only validate inventory when form is submitted
  // Shipping rates are not available via Cart API - they're shown on Shopify's checkout page


  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setValidationError(null);
    setProcessing(true);
    setValidatingInventory(true);

    try {
      // Validate inventory before creating cart
      const validationResponse = await fetch('/api/checkout/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cart,
          shippingAddress,
        }),
      });

      if (!validationResponse.ok) {
        throw new Error('Pre-checkout validation failed');
      }

      const validation = await validationResponse.json();
      if (!validation.valid) {
        setValidationError(validation.errors?.join(', ') || 'Validation failed');
        setProcessing(false);
        setValidatingInventory(false);
        return;
      }

      if (!validation.inventory.valid) {
        setValidationError(validation.inventory.error || 'Inventory validation failed');
        setProcessing(false);
        setValidatingInventory(false);
        return;
      }

      setValidatingInventory(false);

      // Create cart via Storefront API (Cart API)
      // This will create a cart and return a checkout URL
      // Shipping selection happens on Shopify's checkout page
      const checkoutResponse = await fetch('/api/checkout/create-shopify-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cart,
          shippingAddress,
          storefront: storefront,
        }),
      });

      if (!checkoutResponse.ok) {
        const errorData = await checkoutResponse.json();
        
        // Handle specific error types with helpful messages
        if (errorData.error === 'variants_not_indexed') {
          const retryAfter = errorData.retryAfter || 30;
          throw new Error(
            `Some products are still being prepared for checkout. Please wait ${retryAfter} seconds and try again. ` +
            `This usually happens when products were recently added or updated.`
          );
        } else if (errorData.error === 'variants_not_available') {
          throw new Error(
            'Some products in your cart are no longer available. Please remove them and try again.'
          );
        } else if (errorData.error === 'cart_creation_failed') {
          const retryAfter = errorData.retryAfter || 30;
          throw new Error(
            `Unable to create checkout. The products may still be indexing. Please try again in ${retryAfter} seconds.`
          );
        }
        
        throw new Error(errorData.message || errorData.error || 'Failed to create checkout');
      }

      const checkoutData = await checkoutResponse.json();
      const checkoutUrl = checkoutData.checkoutUrl;

      if (!checkoutUrl) {
        console.error('[Checkout] No checkout URL available for redirect');
        throw new Error('Failed to get checkout URL');
      }

      console.log(`[Checkout] Redirecting to Shopify checkout - URL: ${checkoutUrl}, Market: ${shippingAddress.countryCode || shippingAddress.country || 'unknown'}`);
      
      // Redirect to Shopify's hosted checkout
      // Shopify will handle payment, shipping selection, and order confirmation
      window.location.href = checkoutUrl;
    } catch (err) {
      console.error('Checkout error:', err);
      setError(err.message || 'An error occurred during checkout. Please try again.');
      setProcessing(false);
      setValidatingInventory(false);
    }
  };

  if (cartLoading || cart.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-slate-500">Loading...</div>
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
        <h1 className="mb-8 text-3xl font-light text-primary">Checkout</h1>

        {error && (
          <div className="mb-6 rounded-lg border border-red-300 bg-red-50 p-4 text-red-800">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="grid gap-8 lg:grid-cols-3">
          {/* Left column - Form */}
          <div className="lg:col-span-2 space-y-6">
            {/* Shipping Address - Simplified: Only Country, City, Street Address */}
            <section className="rounded-xl border border-secondary/70 bg-white/90 p-6">
              <h2 className="mb-4 text-lg font-medium text-primary">Shipping Address</h2>
              <p className="mb-4 text-sm text-slate-600">
                Enter your shipping address to validate shipping availability. You'll complete your contact information and payment on the next page.
              </p>
              {validatingInventory && (
                <div className="mb-4 text-sm text-blue-600">
                  Validating shipping availability...
                </div>
              )}
              {validationError && (
                <div className="mb-4 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">
                  {validationError}
                </div>
              )}
              <div className="space-y-4">
                {/* Country - At the top as requested */}
                <select
                  required
                  value={shippingAddress.countryCode}
                  onChange={(e) => {
                    const selectedCountry = countries.find(c => c.code === e.target.value);
                    setShippingAddress({
                      ...shippingAddress,
                      countryCode: e.target.value,
                      country: selectedCountry?.name || '',
                    });
                  }}
                  className="w-full rounded-lg border border-secondary/70 px-4 py-2 focus:border-primary focus:outline-none"
                >
                  {countries.map((country) => (
                    <option key={country.code} value={country.code}>
                      {country.name}
                    </option>
                  ))}
                </select>
                
                {/* City */}
                <input
                  type="text"
                  required
                  value={shippingAddress.city}
                  onChange={(e) => setShippingAddress({ ...shippingAddress, city: e.target.value })}
                  placeholder="City"
                  className="w-full rounded-lg border border-secondary/70 px-4 py-2 focus:border-primary focus:outline-none"
                />
                
                {/* Street Address */}
                <input
                  type="text"
                  required
                  value={shippingAddress.address1}
                  onChange={(e) => setShippingAddress({ ...shippingAddress, address1: e.target.value })}
                  placeholder="Street address"
                  className="w-full rounded-lg border border-secondary/70 px-4 py-2 focus:border-primary focus:outline-none"
                />
              </div>
            </section>

            {/* Info about next steps */}
            <section className="rounded-xl border border-secondary/70 bg-secondary/20 p-6">
              <h2 className="mb-2 text-lg font-medium text-primary">Next Steps</h2>
              <p className="text-sm text-slate-600">
                After validating your shipping address, you'll be redirected to Shopify's secure checkout page where you can:
              </p>
              <ul className="mt-2 list-disc list-inside space-y-1 text-sm text-slate-600">
                <li>Enter your email address</li>
                <li>Complete your shipping details</li>
                <li>Select shipping method</li>
                <li>Enter payment information</li>
              </ul>
            </section>
          </div>

          {/* Right column - Order Summary */}
          <div className="lg:col-span-1">
            <div className="sticky top-24 rounded-xl border border-secondary/70 bg-white/90 p-6">
              <h2 className="mb-4 text-lg font-medium text-primary">Order Summary</h2>
              
              <div className="space-y-3 mb-6">
                {cart.map((item) => (
                  <div key={`${item.productId}-${item.variantId}`} className="flex items-center gap-3">
                    {item.image && (
                      <img
                        src={item.image}
                        alt={item.productName}
                        className="h-16 w-16 rounded-lg object-cover"
                      />
                    )}
                    <div className="flex-1">
                      <p className="text-sm font-medium">{item.productName}</p>
                      {item.variantName && (
                        <p className="text-xs text-slate-500">{item.variantName}</p>
                      )}
                      <p className="text-xs text-slate-500">Qty: {item.quantity}</p>
                    </div>
                    <p className="text-sm font-medium">{formatPrice(item.priceAtAdd * item.quantity)}</p>
                  </div>
                ))}
              </div>

              <div className="space-y-2 border-t border-secondary/70 pt-4">
                <div className="flex justify-between text-sm">
                  <span>Subtotal</span>
                  <span>{formatPrice(subtotal)}</span>
                </div>
              </div>
              <div className="space-y-2 border-b border-secondary/70 pb-4 mb-4">
                <div className="flex items-center justify-between text-sm">
                  <span>Shipping</span>
                  <div className="text-right">
                    <div className="font-medium text-slate-600">Est. {formatPrice(estimatedShipping)}</div>
                    <div className="text-xs text-slate-500">Selected at checkout</div>
                  </div>
                </div>
                <p className="text-xs text-slate-500 mt-2">
                  You'll select your shipping option on Shopify's checkout page
                </p>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Tax</span>
                  <span>{formatPrice(tax)}</span>
                </div>
              <div className="flex justify-between border-t border-secondary/70 pt-2 text-lg font-semibold">
                <span>Est. Total</span>
                <span>{formatPrice(estimatedTotal)}</span>
              </div>
              <p className="text-xs text-slate-500 mt-2 text-center">
                Final total shown at checkout
              </p>
            </div>

              <button
                type="submit"
                disabled={processing || validatingInventory}
                className="mt-6 w-full rounded-full bg-primary px-6 py-3 font-semibold text-white transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {processing ? (
                  'Processing...'
                ) : validatingInventory ? (
                  'Validating...'
                ) : (
                  `Proceed to Checkout - ${formatPrice(estimatedTotal)}`
                )}
              </button>
            </div>
          </div>
        </form>
      </main>
    </div>
  );
}
