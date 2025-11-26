'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useCart } from '@/lib/cart';
import { getMarket } from '@/lib/get-market';
import { getMarketConfig } from '@/lib/market-utils';
import { useStorefront } from '@/lib/storefront-context';
import { getFirebaseDb } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import AuthButton from '@/components/AuthButton';

// Format price based on market currency
const formatPrice = (value, market = 'FI') => {
  const currency = market === 'FI' || market === 'DE' ? 'EUR' : 'USD';
  const locale = market === 'FI' ? 'fi-FI' : market === 'DE' ? 'de-DE' : 'en-US';
  const formatter = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currency,
  });
  return formatter.format(value ?? 0);
};

// Country list (European countries for shipping)
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
];

export default function CartPage() {
  const router = useRouter();
  const { cart, updateQuantity, removeFromCart, getCartTotal, loading } = useCart();
  const storefront = useStorefront(); // Get storefront from context (cached)
  
  // Get user's market from cookie (set by middleware) - cached to avoid repeated parsing
  const market = useMemo(() => getMarket(), []);
  const marketConfig = getMarketConfig(market);
  
  // Address form state (minimal: Country, City - full address collected in Shopify checkout)
  const [shippingAddress, setShippingAddress] = useState({
    city: '',
    country: marketConfig.name,
    countryCode: market,
  });
  
  // Checkout processing state
  const [processing, setProcessing] = useState(false);
  const [validatingShipping, setValidatingShipping] = useState(false);
  const [validationError, setValidationError] = useState(null);

  const subtotal = getCartTotal();
  
  // Get current market from selected country
  const currentMarket = shippingAddress.countryCode || market;
  
  // Fetch products to get shipping estimates from marketsObject
  const [productsData, setProductsData] = useState({});
  
  // Get unique product IDs from cart (stable reference)
  const productIds = useMemo(() => {
    return [...new Set(cart.map(item => item.productId))].sort();
  }, [cart]);
  
  // Fetch products once when cart or market changes
  useEffect(() => {
    const fetchProducts = async () => {
      if (productIds.length === 0) {
        setProductsData({});
        return;
      }
      
      const db = getFirebaseDb();
      if (!db) {
        setProductsData({});
        return;
      }
      
      const products = {};
      
      try {
        for (const productId of productIds) {
            try {
              const productRef = doc(db, storefront, 'products', 'items', productId);
              const productDoc = await getDoc(productRef);
            
            if (productDoc.exists()) {
              products[productId] = productDoc.data();
            }
          } catch (error) {
            console.error(`Failed to fetch product ${productId}:`, error);
          }
        }
        
        setProductsData(products);
      } catch (error) {
        console.error('Failed to fetch products for shipping estimate:', error);
      }
    };
    
    fetchProducts();
  }, [productIds.join(',')]); // Only re-fetch if product IDs change
  
  // Calculate shipping estimate from products' marketsObject
  const shippingEstimatePrice = useMemo(() => {
    const currentMarketConfig = getMarketConfig(currentMarket);
    let maxShipping = 0;
    
    // Get shipping estimate from each product's marketsObject
    for (const item of cart) {
      const product = productsData[item.productId];
      if (product?.marketsObject && typeof product.marketsObject === 'object') {
        const marketData = product.marketsObject[currentMarket];
        if (marketData?.shippingEstimate) {
          const shipping = parseFloat(marketData.shippingEstimate) || 0;
          if (shipping > maxShipping) {
            maxShipping = shipping;
          }
        }
      }
    }
    
    // Fallback to market config if no shipping found in products
    if (maxShipping === 0) {
      return parseFloat(currentMarketConfig.shippingEstimate || '7.00');
    }
    
    return maxShipping;
  }, [productsData, cart, currentMarket]);
  
  const tax = 0; // TODO: Calculate tax
  const estimatedTotal = subtotal + shippingEstimatePrice + tax;

  // Validation only happens when "Proceed to Checkout" is clicked
  // No automatic validation on address change

  const handleCheckout = async (e) => {
    e.preventDefault();
    const checkoutStartTime = Date.now();
    console.log(`[CHECKOUT] 🛒 Checkout initiated - Cart items: ${cart.length}, Market: ${market}`);
    
    if (cart.length === 0) {
      console.warn(`[CHECKOUT] ⚠️  Checkout attempted with empty cart`);
      return;
    }
    
    setProcessing(true);
    setValidationError(null);

    try {
      // Validate country and city are entered (full address will be collected in Shopify checkout)
      if (!shippingAddress.city || !shippingAddress.countryCode) {
        console.error(`[CHECKOUT] ❌ Validation failed: Missing city or country`);
        setValidationError('Please enter your country and city');
        setProcessing(false);
        return;
      }

      // Validate inventory and shipping (only when proceeding to checkout)
      console.log(`[CHECKOUT] ✅ Address validated, starting pre-checkout validation...`);
      setValidatingShipping(true);
      
      const validationStartTime = Date.now();
      const validationResponse = await fetch('/api/checkout/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cart,
          shippingAddress,
        }),
      });

      if (!validationResponse.ok) {
        const validationDuration = Date.now() - validationStartTime;
        console.error(`[CHECKOUT] ❌ Validation API returned error (${validationDuration}ms):`, validationResponse.status);
        throw new Error('Pre-checkout validation failed');
      }

      const validation = await validationResponse.json();
      const validationDuration = Date.now() - validationStartTime;
      console.log(`[CHECKOUT] ✅ Validation complete (${validationDuration}ms) - Valid: ${validation.valid}, Inventory: ${validation.inventory?.valid}, Shipping: ${validation.shipping?.available}`);
      setValidatingShipping(false);
      
      if (!validation.valid) {
        console.error(`[CHECKOUT] ❌ Validation failed:`, validation.errors);
        setValidationError(validation.errors?.join(', ') || 'Validation failed');
        setProcessing(false);
        return;
      }

      if (!validation.inventory.valid) {
        console.error(`[CHECKOUT] ❌ Inventory validation failed:`, validation.inventory.error);
        setValidationError(validation.inventory.error || 'Some items are no longer available in the requested quantity');
        setProcessing(false);
        return;
      }

      if (!validation.shipping.available) {
        console.error(`[CHECKOUT] ❌ Shipping validation failed:`, validation.shipping.error);
        setValidationError(validation.shipping.error || 'We cannot ship to this address. Please check your address and try again.');
        setProcessing(false);
        return;
      }

      // Create Shopify checkout and redirect
      console.log(`[CHECKOUT] 🛒 Creating Shopify checkout...`);
      const checkoutCreateStartTime = Date.now();
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
        const checkoutCreateDuration = Date.now() - checkoutCreateStartTime;
        const errorData = await checkoutResponse.json();
        console.error(`[CHECKOUT] ❌ Checkout creation failed (${checkoutCreateDuration}ms):`, errorData);
        throw new Error(errorData.message || errorData.error || 'Failed to create checkout');
      }

      const checkoutData = await checkoutResponse.json();
      const checkoutUrl = checkoutData.checkoutUrl;
      const checkoutCreateDuration = Date.now() - checkoutCreateStartTime;

      if (!checkoutUrl) {
        console.error(`[CHECKOUT] ❌ No checkout URL in response`);
        throw new Error('Failed to get checkout URL');
      }

      const totalDuration = Date.now() - checkoutStartTime;
      console.log(`[CHECKOUT] ✅ Checkout created successfully - URL: ${checkoutUrl} (${totalDuration}ms total)`);
      console.log(`[CHECKOUT] 🔀 Redirecting to Shopify checkout...`);

      // Redirect to Shopify checkout
      window.location.href = checkoutUrl;
    } catch (err) {
      const totalDuration = Date.now() - checkoutStartTime;
      console.error(`[CHECKOUT] ❌ Checkout error (${totalDuration}ms):`, err);
      console.error(`[CHECKOUT] ❌ Error details:`, {
        message: err.message,
        stack: err.stack,
        name: err.name,
      });
      setValidationError(err.message || 'An error occurred during checkout. Please try again.');
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-slate-500">Loading cart...</div>
      </div>
    );
  }

  if (cart.length === 0) {
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
          <h1 className="mb-4 text-2xl font-medium text-primary">Your cart is empty</h1>
          <p className="mb-8 text-slate-600">Add some items to get started.</p>
          <Link
            href={`/${storefront}`}
            className="inline-block rounded-full bg-primary px-6 py-3 font-semibold text-white transition hover:bg-primary/90"
          >
            Continue Shopping
          </Link>
        </main>
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
        <h1 className="mb-8 text-3xl font-light text-primary">Shopping Cart</h1>

        {validationError && (
          <div className="mb-6 rounded-lg border border-red-300 bg-red-50 p-4 text-red-800">
            {validationError}
          </div>
        )}

        <form onSubmit={handleCheckout} className="grid gap-8 lg:grid-cols-3">
          {/* Left column - Address Form + Cart Items */}
          <div className="lg:col-span-2 space-y-6">
            {/* Shipping Address Form - At the top */}
            <section className="rounded-xl border border-secondary/70 bg-white/90 p-6">
              <h2 className="mb-2 text-lg font-medium text-primary">Shipping Location</h2>
              <p className="mb-4 text-sm text-slate-600">
                Enter your country and city to check shipping availability. Full address will be collected on the checkout page.
              </p>
              <div className="space-y-4">
                {/* Country - At the top */}
                <div>
                  <label htmlFor="country" className="mb-1 block text-sm font-medium text-slate-700">
                    Country
                  </label>
                  <select
                    id="country"
                    name="country"
                    required
                    autoComplete="shipping country"
                    value={shippingAddress.countryCode}
                    onChange={(e) => {
                      const selectedCountry = countries.find(c => c.code === e.target.value);
                      setShippingAddress({
                        ...shippingAddress,
                        countryCode: e.target.value,
                        country: selectedCountry?.name || '',
                      });
                    }}
                    className="w-full rounded-lg border border-secondary/70 px-4 py-2.5 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  >
                    {countries.map((country) => (
                      <option key={country.code} value={country.code}>
                        {country.name}
                      </option>
                    ))}
                  </select>
                </div>
                
                {/* City */}
                <div>
                  <label htmlFor="city" className="mb-1 block text-sm font-medium text-slate-700">
                    City
                  </label>
                  <input
                    id="city"
                    name="city"
                    type="text"
                    required
                    autoComplete="shipping address-level2"
                    value={shippingAddress.city}
                    onChange={(e) => setShippingAddress({ ...shippingAddress, city: e.target.value })}
                    placeholder="Enter your city"
                    className="w-full rounded-lg border border-secondary/70 px-4 py-2.5 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
              </div>
            </section>

            {/* Cart Items */}
            <section className="space-y-4">
              <h2 className="text-lg font-medium text-primary">Cart Items</h2>
              {cart.map((item) => (
                <div
                  key={`${item.productId}-${item.variantId}`}
                  className="flex gap-4 rounded-xl border border-secondary/70 bg-white/90 p-4"
                >
                  {item.image && (
                    <img
                      src={item.image}
                      alt={item.productName}
                      className="h-24 w-24 rounded-lg object-cover"
                    />
                  )}
                  <div className="flex-1">
                    <h3 className="font-medium text-primary">{item.productName}</h3>
                    {item.variantName && (
                      <p className="text-sm text-slate-600">{item.variantName}</p>
                    )}
                    <p className="mt-2 font-medium">{formatPrice(item.priceAtAdd * item.quantity, shippingAddress.countryCode || market)}</p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => updateQuantity(item.productId, item.variantId, item.quantity - 1)}
                        className="rounded border border-secondary/70 px-2 py-1 text-sm hover:bg-secondary/50"
                      >
                        −
                      </button>
                      <span className="w-8 text-center text-sm">{item.quantity}</span>
                      <button
                        type="button"
                        onClick={() => updateQuantity(item.productId, item.variantId, item.quantity + 1)}
                        className="rounded border border-secondary/70 px-2 py-1 text-sm hover:bg-secondary/50"
                      >
                        +
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeFromCart(item.productId, item.variantId)}
                      className="text-xs text-red-600 hover:text-red-800"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </section>
          </div>

          {/* Order Summary */}
          <div className="lg:col-span-1">
            <div className="sticky top-24 rounded-xl border border-secondary/70 bg-white/90 p-6 shadow-sm">
              <h2 className="mb-6 text-lg font-medium text-primary">Order Summary</h2>
              
              {/* Subtotal */}
              <div className="mb-4 space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Subtotal</span>
                  <span className="font-medium">{formatPrice(subtotal, shippingAddress.countryCode || market)}</span>
                </div>
              </div>

              {/* Shipping Estimate */}
              <div className="mb-4 space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Shipping</span>
                  <span className="font-medium">
                    {formatPrice(shippingEstimatePrice, currentMarket)}
                  </span>
                </div>
                <p className="text-xs text-slate-500">
                  Estimated shipping based on your selected country. Final shipping cost will be confirmed on checkout.
                </p>
              </div>

              {/* Estimated Total */}
              <div className="border-t border-secondary/70 pt-4">
                <div className="mb-2 flex justify-between">
                  <span className="text-sm font-medium text-slate-700">Estimated Total</span>
                  <span className="text-lg font-semibold text-primary">{formatPrice(estimatedTotal, shippingAddress.countryCode || market)}</span>
                </div>
                <p className="text-xs text-slate-500">
                  Final total will be shown on checkout page
                </p>
              </div>

              {/* Proceed to Checkout Button */}
              <button
                type="submit"
                disabled={processing || validatingShipping}
                className="mt-6 w-full rounded-full bg-primary px-6 py-3 font-semibold text-white transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {processing ? (
                  'Processing...'
                ) : validatingShipping ? (
                  'Validating...'
                ) : (
                  'Proceed to Checkout'
                )}
              </button>

              {/* Continue Shopping */}
              <Link
                href={`/${storefront}`}
                className="mt-3 block w-full rounded-full border border-primary bg-white px-6 py-3 text-center font-semibold text-primary transition hover:bg-slate-50"
              >
                Continue Shopping
              </Link>

              {/* Info */}
              <p className="mt-4 text-xs text-slate-500 text-center">
                Secure checkout powered by Shopify
              </p>
            </div>
          </div>
        </form>
      </main>
    </div>
  );
}
