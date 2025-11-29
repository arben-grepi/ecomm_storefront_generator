'use client';

import { useState, useEffect, useMemo, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { useCart } from '@/lib/cart';
import { getMarket } from '@/lib/get-market';
import { getMarketConfig } from '@/lib/market-utils';
import { useStorefront } from '@/lib/storefront-context';
import { getStorefrontLogo, getStorefrontTheme } from '@/lib/storefront-logos';
import { saveStorefrontToCache } from '@/lib/get-storefront';
import { getFirebaseDb } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';

// Format price based on market currency
import { getMarketCurrency, getMarketLocale } from '@/lib/market-utils';

const formatPrice = (value, market = 'DE') => {
  const currency = getMarketCurrency(market);
  const locale = getMarketLocale(market);
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

// Helper function to get storefront from cookie (reusable)
function getStorefrontFromCookie() {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return null;
  }
  const cookies = document.cookie.split(';').map(c => c.trim());
  const storefrontCookie = cookies.find(c => c.startsWith('storefront='));
  if (storefrontCookie) {
    const sf = storefrontCookie.split('=')[1];
    return sf || null;
  }
  return null;
}

function CartPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { cart, updateQuantity, removeFromCart, getCartTotal, loading } = useCart();
  
  // Get storefront from context (set by middleware cookie or URL path)
  // This allows the cart to know which storefront the user came from
  const storefrontFromContext = useStorefront();
  
  // IMPORTANT: Get storefront from URL parameter first (most reliable - passed explicitly)
  // This ensures we use the correct storefront even when multiple tabs are open
  // Priority: URL param > Cookie > Context > localStorage > Default
  const [storefront, setStorefront] = useState(() => {
    // First priority: URL parameter (explicitly passed when navigating to cart)
    // Try both searchParams hook and window.location (for immediate access)
    let urlStorefront = null;
    
    try {
      if (searchParams) {
        urlStorefront = searchParams.get('storefront');
      }
    } catch (e) {
      // searchParams might not be available during initial render
    }
    
    // Fallback: read from window.location if searchParams not available
    if (!urlStorefront && typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      urlStorefront = urlParams.get('storefront');
    }
    
    if (urlStorefront) {
      const decoded = decodeURIComponent(urlStorefront);
      if (decoded && typeof window !== 'undefined') {
        saveStorefrontToCache(decoded);
        return decoded;
      }
    }
    
    // Second priority: Cookie (set by middleware)
    if (typeof window !== 'undefined') {
      const cookieStorefront = getStorefrontFromCookie();
      if (cookieStorefront) {
        saveStorefrontToCache(cookieStorefront);
        return cookieStorefront;
      }
      
      // Third priority: localStorage cache
      const cached = localStorage.getItem('ecommerce_storefront');
      if (cached) {
        return cached;
      }
    }
    
    // Fourth priority: Context
    if (storefrontFromContext && storefrontFromContext !== 'LUNERA') {
      if (typeof window !== 'undefined') {
        saveStorefrontToCache(storefrontFromContext);
      }
      return storefrontFromContext;
    }
    
    // Default fallback
    return 'LUNERA';
  });
  
  // Check for storefront changes from URL parameter (highest priority)
  // This ensures the theme updates when navigating to cart from different storefronts
  useEffect(() => {
    if (!searchParams) return;
    
    const urlStorefront = searchParams.get('storefront');
    if (urlStorefront) {
      const decoded = decodeURIComponent(urlStorefront);
      if (decoded && decoded !== storefront) {
        console.log(`[CART] 🔄 Storefront changed from URL: ${storefront} → ${decoded}`);
        setStorefront(decoded);
        saveStorefrontToCache(decoded);
      }
    }
  }, [searchParams, storefront]);
  
  // Also check cookie periodically (for cases where URL param is missing)
  // But only if URL param is not present
  useEffect(() => {
    if (!searchParams) return;
    
    const urlStorefront = searchParams.get('storefront');
    // Only check cookie if URL param is not present
    if (urlStorefront) {
      return; // URL param takes precedence, don't check cookie
    }
    
    const checkStorefront = () => {
      const cookieStorefront = getStorefrontFromCookie();
      if (cookieStorefront && cookieStorefront !== storefront) {
        console.log(`[CART] 🔄 Storefront changed from cookie: ${storefront} → ${cookieStorefront}`);
        setStorefront(cookieStorefront);
        saveStorefrontToCache(cookieStorefront);
      }
    };
    
    // Check immediately
    checkStorefront();
    
    // Check when page becomes visible (user switches tabs/windows)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkStorefront();
      }
    };
    
    // Check on focus (user switches back to tab)
    const handleFocus = () => {
      checkStorefront();
    };
    
    // Check periodically (every 500ms) to catch cookie changes
    const interval = setInterval(checkStorefront, 500);
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);
    
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, [storefront, searchParams]);
  
  // Also save to cache whenever storefront changes
  useEffect(() => {
    if (storefront && typeof window !== 'undefined') {
      saveStorefrontToCache(storefront);
    }
  }, [storefront]);
  
  // Get logo path for the current storefront (recalculate when storefront changes)
  const logoPath = useMemo(() => getStorefrontLogo(storefront), [storefront]);
  const theme = useMemo(() => getStorefrontTheme(storefront), [storefront]); // Get theme colors for current storefront
  
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
  }, [productIds.join(','), storefront]); // Only re-fetch if product IDs or storefront changes
  
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
        {/* Header with Storefront Logo - Clickable to navigate back to storefront */}
        <header className="sticky top-0 z-50 border-b border-secondary/70 bg-white/90 backdrop-blur">
          <div className="mx-auto flex max-w-7xl items-center justify-center px-4 py-4 sm:px-6 lg:px-8">
            <Link 
              href={`/${storefront}`} 
              className="flex items-center transition-opacity hover:opacity-80"
              aria-label={`Return to ${storefront} homepage`}
            >
              <Image
                src={logoPath}
                alt={`${storefront} logo`}
                width={300}
                height={100}
                className="h-16 w-auto sm:h-24"
                priority
              />
            </Link>
          </div>
        </header>
        <main className="mx-auto max-w-4xl px-4 py-16 text-center">
          <h1 className="mb-4 text-2xl font-medium" style={{ color: theme.textColor }}>Your cart is empty</h1>
          <p className="mb-8 text-slate-600">Add some items to get started.</p>
          <Link
            href={`/${storefront}`}
            className="inline-block rounded-full px-6 py-3 font-semibold text-white transition"
            style={{ 
              backgroundColor: theme.primaryColor,
              '--hover-color': theme.primaryColorHover,
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = theme.primaryColorHover}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = theme.primaryColor}
          >
            Continue Shopping
          </Link>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-white via-secondary/40 to-white">
      {/* Header with Storefront Logo - Clickable to navigate back to storefront */}
      <header className="sticky top-0 z-50 border-b border-secondary/70 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-center px-4 py-4 sm:px-6 lg:px-8">
          <Link 
            href={`/${storefront}`} 
            className="flex items-center transition-opacity hover:opacity-80"
            aria-label={`Return to ${storefront} homepage`}
          >
            <Image
              src={logoPath}
              alt={`${storefront} logo`}
              width={300}
              height={100}
              className="h-16 w-auto sm:h-24"
              priority
            />
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <h1 className="mb-8 text-3xl font-light" style={{ color: theme.textColor }}>Shopping Cart</h1>

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
              <h2 className="mb-2 text-lg font-medium" style={{ color: theme.textColor }}>Shipping Location</h2>
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
                    className="w-full rounded-lg border border-secondary/70 px-4 py-2.5 focus:outline-none focus:ring-2"
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = theme.borderColor;
                      e.currentTarget.style.boxShadow = `0 0 0 2px ${theme.borderColor}33`;
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = '';
                      e.currentTarget.style.boxShadow = '';
                    }}
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
                    className="w-full rounded-lg border border-secondary/70 px-4 py-2.5 focus:outline-none focus:ring-2"
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = theme.borderColor;
                      e.currentTarget.style.boxShadow = `0 0 0 2px ${theme.borderColor}33`;
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = '';
                      e.currentTarget.style.boxShadow = '';
                    }}
                  />
                </div>
              </div>
            </section>

            {/* Cart Items */}
            <section className="space-y-4">
              <h2 className="text-lg font-medium" style={{ color: theme.textColor }}>Cart Items</h2>
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
                    <h3 className="font-medium" style={{ color: theme.textColor }}>{item.productName}</h3>
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
              <h2 className="mb-6 text-lg font-medium" style={{ color: theme.textColor }}>Order Summary</h2>
              
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
                  <span className="text-lg font-semibold" style={{ color: theme.textColor }}>{formatPrice(estimatedTotal, shippingAddress.countryCode || market)}</span>
                </div>
                <p className="text-xs text-slate-500">
                  Final total will be shown on checkout page
                </p>
              </div>

              {/* Proceed to Checkout Button */}
              <button
                type="submit"
                disabled={processing || validatingShipping}
                className="mt-6 w-full rounded-full px-6 py-3 font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-50"
                style={{ 
                  backgroundColor: theme.primaryColor,
                }}
                onMouseEnter={(e) => {
                  if (!e.currentTarget.disabled) {
                    e.currentTarget.style.backgroundColor = theme.primaryColorHover;
                  }
                }}
                onMouseLeave={(e) => {
                  if (!e.currentTarget.disabled) {
                    e.currentTarget.style.backgroundColor = theme.primaryColor;
                  }
                }}
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
                className="mt-3 block w-full rounded-full bg-white px-6 py-3 text-center font-semibold transition hover:bg-slate-50"
                style={{
                  borderColor: theme.borderColor,
                  color: theme.textColor,
                }}
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

// Wrap CartPageContent in Suspense to handle useSearchParams
export default function CartPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-slate-500">Loading cart...</div>
      </div>
    }>
      <CartPageContent />
    </Suspense>
  );
}

