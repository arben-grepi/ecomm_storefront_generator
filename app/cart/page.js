'use client';

import { useState, useEffect, useMemo, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { useCart } from '@/lib/cart';
import { getMarket } from '@/lib/get-market';
import { getMarketConfig } from '@/lib/market-utils';
import { useStorefront } from '@/lib/storefront-context';
import { getLogo } from '@/lib/logo-cache';
import { saveStorefrontToCache } from '@/lib/get-storefront';
import SettingsMenu from '@/components/SettingsMenu';
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
    if (storefrontFromContext) {
      if (typeof window !== 'undefined') {
        saveStorefrontToCache(storefrontFromContext);
      }
      return storefrontFromContext;
    }
    
    // Default fallback
    return 'FIVESTARFINDS';
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
  
  // Get colors and social links from URL parameters (passed from homepage) or fetch from Firestore
  const [siteInfo, setSiteInfo] = useState({
    colorPrimary: '#ec4899',
    colorSecondary: '#64748b',
    colorTertiary: '#94a3b8',
    instagramUrl: '',
    instagramBgColor: 'primary',
    showInstagram: false,
    emailAddress: '',
    emailColor: 'primary',
    showEmail: false,
  });
  
  // Get colors from URL params if available, otherwise fetch from Firestore
  useEffect(() => {
    const fetchColors = async () => {
      // First, try to get colors from URL params
      if (searchParams) {
        const colorPrimary = searchParams.get('colorPrimary');
        const colorSecondary = searchParams.get('colorSecondary');
        const colorTertiary = searchParams.get('colorTertiary');
        
        if (colorPrimary || colorSecondary || colorTertiary) {
          setSiteInfo({
            colorPrimary: colorPrimary ? decodeURIComponent(colorPrimary) : '#ec4899',
            colorSecondary: colorSecondary ? decodeURIComponent(colorSecondary) : '#64748b',
            colorTertiary: colorTertiary ? decodeURIComponent(colorTertiary) : '#94a3b8',
            instagramUrl: '',
            instagramBgColor: 'primary',
            showInstagram: false,
            emailAddress: '',
            emailColor: 'primary',
            showEmail: false,
          });
          return; // URL params take precedence
        }
      }
      
      // If no URL params, try cache first, then fetch from Firestore
      if (storefront) {
        try {
          // Try to get from cache first
          if (typeof window !== 'undefined') {
            const { getCachedInfo } = require('@/lib/info-cache');
            const cachedInfo = getCachedInfo(storefront);
            if (cachedInfo) {
              setSiteInfo({
                colorPrimary: cachedInfo.colorPrimary || '#ec4899',
                colorSecondary: cachedInfo.colorSecondary || '#64748b',
                colorTertiary: cachedInfo.colorTertiary || '#94a3b8',
                instagramUrl: cachedInfo.instagramUrl || '',
                instagramBgColor: cachedInfo.instagramBgColor || 'primary',
                showInstagram: cachedInfo.showInstagram === true,
                emailAddress: cachedInfo.emailAddress || '',
                emailColor: cachedInfo.emailColor || 'primary',
                showEmail: cachedInfo.showEmail === true,
              });
              return; // Use cached data
            }
          }
          
          // If no cache, fetch from Firestore
          const db = getFirebaseDb();
          if (db) {
            const infoDoc = await getDoc(doc(db, storefront, 'Info'));
            if (infoDoc.exists()) {
              const data = infoDoc.data();
              const infoData = {
                colorPrimary: data.colorPrimary || '#ec4899',
                colorSecondary: data.colorSecondary || '#64748b',
                colorTertiary: data.colorTertiary || '#94a3b8',
                instagramUrl: data.instagramUrl || '',
                instagramBgColor: data.instagramBgColor || 'primary',
                showInstagram: data.showInstagram === true,
                emailAddress: data.emailAddress || '',
                emailColor: data.emailColor || 'primary',
                showEmail: data.showEmail === true,
              };
              setSiteInfo(infoData);
              
              // Cache the fetched data
              if (typeof window !== 'undefined') {
                const { saveInfoToCache } = require('@/lib/info-cache');
                saveInfoToCache(storefront, data);
              }
            }
          }
        } catch (error) {
          console.error('[CART] Failed to fetch colors from Firestore:', error);
          // Keep default colors on error
        }
      }
    };
    
    fetchColors();
  }, [searchParams, storefront]);
  
  // Get logo path for the current storefront (uses cache first, falls back to calculation)
  const logoPath = useMemo(() => getLogo(storefront, siteInfo), [storefront, siteInfo]);
  
  // Colors come from siteInfo (Info document), no separate theme object needed
  
  // Get user's market from cookie (set by middleware) - cached to avoid repeated parsing
  const market = useMemo(() => getMarket(), []);
  const marketConfig = getMarketConfig(market);
  
  // Address form state (minimal: Country only - full address collected in Shopify checkout)
  const [shippingAddress, setShippingAddress] = useState({
    country: marketConfig.name,
    countryCode: market,
  });
  
  // Checkout processing state
  const [processing, setProcessing] = useState(false);
  const [validatingShipping, setValidatingShipping] = useState(false);
  const [validationError, setValidationError] = useState(null);
  const [checkoutStatus, setCheckoutStatus] = useState(''); // Current checkout step message
  const [unavailableItems, setUnavailableItems] = useState(new Set()); // Set of item keys that are unavailable
  const [cartEmptiedMessage, setCartEmptiedMessage] = useState(null); // Message when cart becomes empty due to unavailable items

  // Calculate subtotal excluding unavailable items
  // Calculate subtotal excluding unavailable items
  const subtotal = useMemo(() => {
    return cart
      .filter(item => !unavailableItems.has(`${item.productId}-${item.variantId}`))
      .reduce((sum, item) => sum + (item.priceAtAdd * item.quantity), 0);
  }, [cart, unavailableItems]);
  
  // Get current market from selected country
  const currentMarket = shippingAddress.countryCode || market;
  
  // Shipping rate is always 2.90€ flat rate (hardcoded)
  // Note: Products show actual shipping costs in admin panel for business intelligence,
  // but customers always pay the same flat rate regardless of their location
  const CUSTOMER_SHIPPING_PRICE = 2.90;
  const shippingEstimatePrice = CUSTOMER_SHIPPING_PRICE;
  
  const tax = 0; // TODO: Calculate tax
  const estimatedTotal = useMemo(() => subtotal + shippingEstimatePrice + tax, [subtotal, shippingEstimatePrice, tax]);

  // Validation only happens when "Proceed to Checkout" is clicked
  // No automatic validation on address change

  const handleCheckout = async (e) => {
    e.preventDefault();
    
    if (cart.length === 0) {
      return;
    }
    
    setProcessing(true);
    setValidationError(null);
    setCheckoutStatus('Validating your cart...');

    try {
      // Validate country is entered (full address will be collected in Shopify checkout)
      if (!shippingAddress.countryCode) {
        setValidationError('Please select your country');
        setProcessing(false);
        setCheckoutStatus('');
        return;
      }

      // Validate inventory and shipping (only when proceeding to checkout)
      setValidatingShipping(true);
      setCheckoutStatus('Checking availability and shipping...');
      
      const validationResponse = await fetch('/api/checkout/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cart,
          shippingAddress,
          storefront: storefront, // Pass storefront so validation knows where to look for products
        }),
      });

      if (!validationResponse.ok) {
        throw new Error('Pre-checkout validation failed');
      }

      const validation = await validationResponse.json();
      setValidatingShipping(false);
      
      // Track unavailable items for visual display and removal
      const unavailableItemKeys = new Set();
      const itemsToRemove = [];
      const removedItemNames = []; // Track product names for error message
      
      if (validation.unavailableItems && Array.isArray(validation.unavailableItems)) {
        validation.unavailableItems.forEach(item => {
          if (item.productId && item.variantId) {
            const itemKey = `${item.productId}-${item.variantId}`;
            unavailableItemKeys.add(itemKey);
            // Find the cart item to get product name
            const cartItem = cart.find(ci => ci.productId === item.productId && ci.variantId === item.variantId);
            if (cartItem) {
              removedItemNames.push(cartItem.productName || item.title || 'item');
            }
            // Remove from cart
            itemsToRemove.push({ productId: item.productId, variantId: item.variantId });
          } else if (item.productId) {
            // If only productId is available, mark all variants of this product as unavailable
            cart.filter(cartItem => cartItem.productId === item.productId)
              .forEach(cartItem => {
                const itemKey = `${cartItem.productId}-${cartItem.variantId}`;
                unavailableItemKeys.add(itemKey);
                if (!removedItemNames.includes(cartItem.productName || item.title || 'item')) {
                  removedItemNames.push(cartItem.productName || item.title || 'item');
                }
                itemsToRemove.push({ productId: cartItem.productId, variantId: cartItem.variantId });
              });
          }
        });
      }
      setUnavailableItems(unavailableItemKeys);
      
      // Check if cart will be empty after removal
      const cartWillBeEmpty = cart.length === itemsToRemove.length;
      
      // Remove unavailable items from cart
      if (itemsToRemove.length > 0) {
        itemsToRemove.forEach(({ productId, variantId }) => {
          removeFromCart(productId, variantId);
        });
      }
      
      // If cart becomes empty, set a helpful message
      if (cartWillBeEmpty && removedItemNames.length > 0) {
        const itemList = removedItemNames.length === 1 
          ? removedItemNames[0]
          : removedItemNames.slice(0, -1).join(', ') + ' and ' + removedItemNames[removedItemNames.length - 1];
        const message = removedItemNames.length === 1
          ? `The item "${itemList}" is no longer available and has been removed from your cart.`
          : `The following items are no longer available and have been removed from your cart: ${itemList}.`;
        setCartEmptiedMessage(message);
      } else {
        setCartEmptiedMessage(null);
      }
      
      if (!validation.valid) {
        // Use improved error messages that include product names
        const errorMessage = validation.errors?.length > 0 
          ? validation.errors.join('. ')
          : 'Validation failed. Please check your cart items and shipping address.';
        setValidationError(errorMessage);
        setProcessing(false);
        setCheckoutStatus('');
        return;
      }

      if (!validation.inventory.valid) {
        // Use improved error message with product names
        const errorMessage = validation.errors?.find(e => e.includes('not available')) 
          || validation.inventory.error 
          || 'Some items are no longer available in the requested quantity';
        setValidationError(errorMessage);
        setProcessing(false);
        setCheckoutStatus('');
        return;
      }

      if (!validation.shipping.available) {
        // Use improved error message with product names if available
        const errorMessage = validation.errors?.find(e => e.includes('cannot be shipped') || e.includes('shipped to'))
          || validation.shipping.error 
          || 'We cannot ship to this address. Please check your address and try again.';
        setValidationError(errorMessage);
        setProcessing(false);
        setCheckoutStatus('');
        return;
      }
      
      // Clear unavailable items if validation passes
      setUnavailableItems(new Set());
      setCartEmptiedMessage(null);

      // Create Shopify checkout and redirect
      setCheckoutStatus('Creating checkout...');
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
        throw new Error(errorData.message || errorData.error || 'Failed to create checkout');
      }

      const checkoutData = await checkoutResponse.json();
      const checkoutUrl = checkoutData.checkoutUrl;

      if (!checkoutUrl) {
        throw new Error('Failed to get checkout URL');
      }

      // Store checkout session in localStorage for thank-you page
      try {
        const checkoutSession = {
          cartId: checkoutData.cartId || null,
          storefront: storefront,
          market: shippingAddress.countryCode || shippingAddress.country || 'DE',
          timestamp: Date.now(),
        };
        localStorage.setItem('checkout_session', JSON.stringify(checkoutSession));
      } catch (sessionError) {
        console.warn('Failed to store checkout session:', sessionError);
        // Non-critical, continue with redirect
      }

      // Set sessionStorage flag to intercept return from checkout
      // This allows us to redirect to custom thank-you page after Shopify checkout
      try {
        sessionStorage.setItem('checkout_initiated', 'true');
        sessionStorage.setItem('storefront_id', storefront);
        sessionStorage.setItem('checkout_timestamp', Date.now().toString());
      } catch (storageError) {
        console.warn('Failed to set checkout flag:', storageError);
        // Non-critical, continue with redirect
      }

      // Redirect to Shopify checkout
      window.location.href = checkoutUrl;
    } catch (err) {
      
      // Try to parse error message for unavailable items
      // Check if error mentions variant IDs or product IDs
      const errorMessage = err.message || 'An error occurred during checkout. Please try again.';
      
      // If error mentions specific variant IDs, try to mark those items as unavailable
      const variantIdMatch = errorMessage.match(/\d{13,}/g); // Shopify variant IDs are typically 13+ digits
      if (variantIdMatch) {
        const variantIdsToMark = variantIdMatch.map(id => id.toString());
        const unavailableItemKeys = new Set();
        cart.forEach(item => {
          const shopifyVariantId = item.shopifyVariantId?.toString() || item.variantId?.toString();
          if (shopifyVariantId && variantIdsToMark.includes(shopifyVariantId)) {
            unavailableItemKeys.add(`${item.productId}-${item.variantId}`);
          }
        });
        if (unavailableItemKeys.size > 0) {
          setUnavailableItems(unavailableItemKeys);
        }
      }
      
      setValidationError(errorMessage);
      setProcessing(false);
      setCheckoutStatus('');
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div style={{ color: siteInfo.colorTertiary || '#94a3b8' }}>Loading cart...</div>
      </div>
    );
  }

  if (cart.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-white via-secondary/40 to-white">
        {/* Header with Storefront Logo - Clickable to navigate back to storefront */}
        <header className="sticky top-0 z-50 border-b border-secondary/70 bg-white/90 backdrop-blur">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
            <Link 
              href={storefront === 'LUNERA' ? '/' : `/${storefront}`}
              className="flex items-center transition-opacity hover:opacity-80"
              aria-label={`Return to ${storefront} homepage`}
            >
              <Image
                src={logoPath}
                alt={`${storefront} logo`}
                width={300}
                height={100}
                className="h-16 w-auto sm:h-24 object-contain flex-shrink-0"
                style={{ objectFit: 'contain' }}
                priority
              />
            </Link>
            <SettingsMenu 
            secondaryColor={siteInfo.colorSecondary || '#64748b'} 
            primaryColor={siteInfo.colorPrimary || '#ec4899'}
            instagramUrl={siteInfo.instagramUrl || ''}
            instagramBgColor={siteInfo.instagramBgColor || 'primary'}
            showInstagram={siteInfo.showInstagram === true}
            emailAddress={siteInfo.emailAddress || ''}
            emailColor={siteInfo.emailColor || 'primary'}
            showEmail={siteInfo.showEmail === true}
          />
          </div>
        </header>
        <main className="mx-auto max-w-4xl px-4 py-16 text-center">
          <h1 className="mb-4 text-2xl font-medium" style={{ color: siteInfo.colorPrimary || '#ec4899' }}>Your cart is empty</h1>
          
          {cartEmptiedMessage ? (
            <>
              <div className="mb-6 rounded-lg border border-red-300 bg-red-50 p-4 text-left text-red-800 max-w-2xl mx-auto">
                {cartEmptiedMessage}
              </div>
              <p className="mb-8" style={{ color: siteInfo.colorSecondary || '#64748b' }}>Please add other items to continue.</p>
            </>
          ) : (
            <p className="mb-8" style={{ color: siteInfo.colorSecondary || '#64748b' }}>Add some items to get started.</p>
          )}
          
          <Link
            href={storefront === 'LUNERA' ? '/' : `/${storefront}`}
            className="inline-block rounded-full px-6 py-3 font-semibold text-white transition"
            style={{ 
              backgroundColor: siteInfo.colorPrimary || '#ec4899',
              '--hover-color': siteInfo.colorPrimary ? `${siteInfo.colorPrimary}E6` : '#ec4899E6',
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = siteInfo.colorPrimary ? `${siteInfo.colorPrimary}E6` : '#ec4899E6'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = siteInfo.colorPrimary || '#ec4899'}
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
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <Link 
            href={storefront === 'LUNERA' ? '/' : `/${storefront}`} 
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
          <SettingsMenu 
            secondaryColor={siteInfo.colorSecondary || '#64748b'} 
            primaryColor={siteInfo.colorPrimary || '#ec4899'} 
          />
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <h1 className="mb-8 text-3xl font-light" style={{ color: siteInfo.colorPrimary || '#ec4899' }}>Shopping Cart</h1>

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
              <h2 className="mb-2 text-lg font-medium" style={{ color: siteInfo.colorPrimary || '#ec4899' }}>Shipping Location</h2>
              <p className="mb-4 text-sm" style={{ color: '#000000' }}>
                Select your country to check shipping availability. Full address will be collected on the checkout page.
              </p>
              <div className="space-y-4">

                {/* Country - At the top */}
                <div>
                  <label htmlFor="country" className="mb-1 block text-sm font-medium" style={{ color: siteInfo.colorSecondary || '#64748b' }}>
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
                      // Clear validation errors and unavailable items when address changes
                      setValidationError(null);
                      setUnavailableItems(new Set());
                      setCartEmptiedMessage(null);
                    }}
                    className="w-full rounded-lg border px-4 py-2.5 focus:outline-none focus:ring-2"
                    style={{
                      borderColor: 'rgba(100, 116, 139, 0.7)',
                      color: siteInfo.colorSecondary || '#64748b',
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = siteInfo.colorPrimary || '#ec4899';
                      e.currentTarget.style.boxShadow = `0 0 0 2px ${(siteInfo.colorPrimary || '#ec4899')}33`;
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = 'rgba(100, 116, 139, 0.7)';
                      e.currentTarget.style.boxShadow = '';
                    }}
                  >
                    {countries.map((country) => (
                      <option key={country.code} value={country.code} style={{ color: siteInfo.colorSecondary || '#64748b' }}>
                        {country.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </section>

            {/* Cart Items */}
            <section className="space-y-4">
              <h2 className="text-lg font-medium" style={{ color: siteInfo.colorPrimary || '#ec4899' }}>Cart Items</h2>
              {cart.map((item) => {
                const itemKey = `${item.productId}-${item.variantId}`;
                const isUnavailable = unavailableItems.has(itemKey);
                return (
                <div
                  key={itemKey}
                  className="flex gap-4 rounded-xl border border-secondary/70 bg-white/90 p-4"
                  style={{
                    opacity: isUnavailable ? 0.3 : 1,
                  }}
                >
                  {item.image && (
                    <img
                      src={item.image}
                      alt={item.productName}
                      className="h-24 w-24 rounded-lg object-cover"
                    />
                  )}
                  <div className="flex-1">
                    <h3 className="font-medium" style={{ color: siteInfo.colorPrimary || '#ec4899' }}>{item.productName}</h3>
                    {item.variantName && (
                      <p className="text-sm" style={{ color: siteInfo.colorSecondary || '#64748b' }}>{item.variantName}</p>
                    )}
                    <p className="mt-2 font-medium" style={{ color: siteInfo.colorPrimary || '#ec4899' }}>{formatPrice(item.priceAtAdd * item.quantity, shippingAddress.countryCode || market)}</p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => updateQuantity(item.productId, item.variantId, item.quantity - 1)}
                        className="rounded px-2 py-1 text-sm transition-colors"
                        style={{ 
                          borderColor: 'transparent',
                          borderWidth: '1px',
                          borderStyle: 'solid',
                          color: siteInfo.colorSecondary || '#64748b',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.borderColor = siteInfo.colorSecondary || '#64748b';
                          e.currentTarget.style.backgroundColor = `${siteInfo.colorSecondary || '#64748b'}1A`;
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.borderColor = 'transparent';
                          e.currentTarget.style.backgroundColor = 'transparent';
                        }}
                      >
                        −
                      </button>
                      <span className="w-8 text-center text-sm" style={{ color: siteInfo.colorSecondary || theme.textColor }}>{item.quantity}</span>
                      <button
                        type="button"
                        onClick={() => updateQuantity(item.productId, item.variantId, item.quantity + 1)}
                        className="rounded px-2 py-1 text-sm transition-colors"
                        style={{ 
                          borderColor: 'transparent',
                          borderWidth: '1px',
                          borderStyle: 'solid',
                          color: siteInfo.colorSecondary || '#64748b',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.borderColor = siteInfo.colorSecondary || '#64748b';
                          e.currentTarget.style.backgroundColor = `${siteInfo.colorSecondary || '#64748b'}1A`;
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.borderColor = 'transparent';
                          e.currentTarget.style.backgroundColor = 'transparent';
                        }}
                      >
                        +
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeFromCart(item.productId, item.variantId)}
                      className="text-xs transition-colors"
                      style={{ color: siteInfo.colorSecondary || '#64748b' }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.color = siteInfo.colorPrimary || '#ec4899';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.color = siteInfo.colorSecondary || '#64748b';
                      }}
                    >
                      Remove
                    </button>
                  </div>
                  {isUnavailable && (
                    <div className="mt-2 w-full text-sm text-red-600">
                      This item is not available for checkout
                    </div>
                  )}
                </div>
                );
              })}
            </section>
          </div>

          {/* Order Summary */}
          <div className="lg:col-span-1">
            <div className="sticky top-24 rounded-xl border border-secondary/70 bg-white/90 p-6 shadow-sm">
              <h2 className="mb-6 text-lg font-medium" style={{ color: siteInfo.colorPrimary || '#ec4899' }}>Order Summary</h2>
              
              {/* Subtotal */}
              <div className="mb-4 space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600" style={{ color: '#000000' }}>Subtotal</span>
                  <span className="font-medium" style={{ color: siteInfo.colorSecondary || '#64748b' }}>{formatPrice(subtotal, shippingAddress.countryCode || market)}</span>
                </div>
              </div>

              {/* Shipping Estimate */}
              <div className="mb-4 space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600" style={{ color: '#000000' }}>Shipping</span>
                  <span className="font-medium" style={{ color: siteInfo.colorSecondary || '#64748b' }}>
                    {formatPrice(shippingEstimatePrice, currentMarket)}
                  </span>
                </div>
               
              </div>

              {/* Estimated Total - Exclude unavailable items */}
              <div className="border-t border-secondary/70 pt-4">
                <div className="mb-2 flex justify-between">
                  <span className="text-sm font-medium text-slate-700" style={{ color: siteInfo.colorSecondary || '#64748b' }}>Estimated Total</span>
                  <span className="text-lg font-semibold" style={{ color: siteInfo.colorPrimary || '#ec4899' }}>
                    {formatPrice(
                      cart
                        .filter(item => !unavailableItems.has(`${item.productId}-${item.variantId}`))
                        .reduce((sum, item) => sum + (item.priceAtAdd * item.quantity), 0) +
                      shippingEstimatePrice,
                      shippingAddress.countryCode || market
                    )}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-2" style={{ color: siteInfo.colorSecondary || '#64748b' }}>Includes VAT</p>
              </div>

              {/* Proceed to Checkout Button */}
              <button
                type="submit"
                disabled={processing || validatingShipping}
                className="mt-6 w-full rounded-full px-6 py-3 font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-50"
                style={{ 
                  backgroundColor: siteInfo.colorPrimary || '#ec4899',
                }}
                onMouseEnter={(e) => {
                  if (!e.currentTarget.disabled) {
                    e.currentTarget.style.backgroundColor = siteInfo.colorPrimary ? `${siteInfo.colorPrimary}E6` : '#ec4899E6';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!e.currentTarget.disabled) {
                    e.currentTarget.style.backgroundColor = siteInfo.colorPrimary || '#ec4899';
                  }
                }}
              >
                {processing || validatingShipping ? (
                  checkoutStatus || 'Validating...'
                ) : (
                  'Proceed to Checkout'
                )}
              </button>

              {/* Continue Shopping */}
              <Link
                href={storefront === 'LUNERA' ? '/' : `/${storefront}`}
                className="mt-3 block w-full rounded-full bg-white px-6 py-3 text-center font-semibold transition hover:bg-slate-50"
                style={{
                  borderColor: siteInfo.colorPrimary || '#ec4899',
                  color: siteInfo.colorPrimary || '#ec4899',
                }}
              >
                Continue Shopping
              </Link>

              {/* Info */}
              <p className="mt-4 text-xs text-center" style={{ color: siteInfo.colorTertiary || '#94a3b8' }}>
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
        <div style={{ color: '#94a3b8' }}>Loading cart...</div>
      </div>
    }>
      <CartPageContent />
    </Suspense>
  );
}

