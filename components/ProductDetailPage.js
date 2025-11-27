'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useCart } from '@/lib/cart';
import SettingsMenu from '@/components/SettingsMenu';
import { useStorefront } from '@/lib/storefront-context';
import { saveStorefrontToCache } from '@/lib/get-storefront';
import { getMarket } from '@/lib/get-market';
import { getStorefrontTheme } from '@/lib/storefront-logos';

// Format price based on market (EUR for EU markets)
const formatPrice = (value, market = 'FI') => {
  const isEUMarket = market === 'FI' || market === 'DE';
  const currencyFormatter = new Intl.NumberFormat(isEUMarket ? 'fi-FI' : 'en-US', {
    style: 'currency',
    currency: isEUMarket ? 'EUR' : 'USD',
  });
  return currencyFormatter.format(value ?? 0);
};

// Known color names (case-insensitive matching)
const KNOWN_COLORS = [
  'black', 'white', 'red', 'blue', 'green', 'yellow', 'orange', 'purple', 'pink', 'brown',
  'gray', 'grey', 'silver', 'gold', 'beige', 'tan', 'navy', 'maroon', 'olive', 'teal',
  'cyan', 'magenta', 'lime', 'indigo', 'violet', 'coral', 'salmon', 'khaki', 'ivory',
  'cream', 'mint', 'lavender', 'peach', 'turquoise', 'burgundy', 'charcoal', 'crimson',
  'emerald', 'amber', 'copper', 'bronze', 'plum', 'sage', 'rose', 'cobalt', 'azure',
  'coral', 'pearl', 'champagne', 'mauve', 'taupe', 'slate', 'denim', 'forest', 'ocean',
  'sunset', 'midnight', 'ivory', 'bone', 'sand', 'stone', 'ash', 'smoke', 'steel', 'pewter'
];

// Known country names (case-insensitive matching) - to filter out from variant displays
const KNOWN_COUNTRIES = [
  'china', 'usa', 'united states', 'uk', 'united kingdom', 'germany', 'france', 'italy',
  'spain', 'japan', 'korea', 'south korea', 'india', 'brazil', 'canada', 'australia',
  'mexico', 'russia', 'poland', 'netherlands', 'belgium', 'sweden', 'norway', 'denmark',
  'finland', 'portugal', 'greece', 'turkey', 'thailand', 'vietnam', 'indonesia', 'philippines',
  'taiwan', 'hong kong', 'singapore', 'malaysia', 'new zealand', 'south africa', 'egypt',
  'argentina', 'chile', 'colombia', 'peru', 'venezuela', 'switzerland', 'austria', 'ireland'
];

// Check if a value is a known color
const isKnownColor = (value) => {
  if (!value || typeof value !== 'string') return false;
  const normalized = value.toLowerCase().trim();
  return KNOWN_COLORS.some(color => normalized === color || normalized.includes(color));
};

// Check if a value is a country name (to filter out)
const isCountry = (value) => {
  if (!value || typeof value !== 'string') return false;
  const normalized = value.toLowerCase().trim();
  return KNOWN_COUNTRIES.some(country => normalized === country || normalized.includes(country));
};

// Filter out countries from a value
const filterOutCountries = (value) => {
  if (!value || typeof value !== 'string') return value;
  // Remove country names from the value
  let filtered = value;
  KNOWN_COUNTRIES.forEach(country => {
    const regex = new RegExp(`\\b${country}\\b`, 'gi');
    filtered = filtered.replace(regex, '').trim();
  });
  // Clean up extra spaces and separators
  filtered = filtered.replace(/\s*•\s*/g, ' • ').replace(/\s+/g, ' ').trim();
  // Remove leading/trailing separators
  filtered = filtered.replace(/^[•\s]+|[•\s]+$/g, '').trim();
  return filtered || null;
};

export default function ProductDetailPage({ category, product, variants, info = null }) {
  const { addToCart, getCartItemCount, cart } = useCart();
  const storefront = useStorefront(); // Get storefront for dynamic links
  const theme = getStorefrontTheme(storefront); // Get theme for cart badge
  const [addingToCart, setAddingToCart] = useState(false);
  const [justAdded, setJustAdded] = useState(false);
  const [hasMounted, setHasMounted] = useState(false);
  const hasVariants = Array.isArray(variants) && variants.length > 0;
  // Cache market value to avoid parsing cookies on every render
  const market = useMemo(() => getMarket(), []);
  const isEUMarket = market === 'FI' || market === 'DE';
  
  // Use info from server (for SEO), with empty strings as fallback
  const siteInfo = info || {
    companyName: '',
    footerText: '',
  };
  
  // Check if variants have colors (only if they match known colors)
  const hasColors = useMemo(() => {
    return variants.some((v) => v.color && v.color !== 'default' && isKnownColor(v.color));
  }, [variants]);
  
  const hasTypes = useMemo(() => {
    return variants.some((v) => v.type);
  }, [variants]);

  // Group variants by color or type (include all variants for grouping, filtering happens later)
  const variantsByGroup = useMemo(() => {
    if (!hasVariants) return new Map();
    const grouped = new Map();
    variants.forEach((variant) => {
      // Use color if it's a known color, otherwise use type, otherwise 'default'
      let groupKey = 'default';
      if (variant.color && isKnownColor(variant.color) && !isCountry(variant.color)) {
        groupKey = variant.color;
      } else if (variant.type) {
        // Filter out countries from type
        const filteredType = filterOutCountries(variant.type);
        groupKey = filteredType || 'default';
      } else if (variant.color) {
        // If color exists but isn't a known color, treat it as type (after filtering countries)
        const filteredColor = filterOutCountries(variant.color);
        if (filteredColor && !isCountry(variant.color)) {
          groupKey = filteredColor;
        }
      }
      if (!grouped.has(groupKey)) {
        grouped.set(groupKey, []);
      }
      grouped.get(groupKey).push(variant);
    });
    return grouped;
  }, [hasVariants, variants]);

  // Filter groups to only show groups that have at least one in-stock variant
  const availableGroups = useMemo(() => {
    return Array.from(variantsByGroup.keys()).filter((key) => {
      const groupVariants = variantsByGroup.get(key) || [];
      // Group is available if it has at least one in-stock variant
      const hasInStockVariant = groupVariants.some((variant) => {
        const stock = variant.stock ?? 0;
        const allowsBackorder = variant.inventory_policy === 'continue';
        return stock > 0 || allowsBackorder;
      });
      // Also include 'default' if it's the only group (for products without colors/types)
      return hasInStockVariant || (key === 'default' && variantsByGroup.size === 1);
    });
  }, [variantsByGroup]);

  // availableGroups is now calculated above after filtering variants

  // Find default variant if set
  const defaultVariant = useMemo(() => {
    if (!product.defaultVariantId || !hasVariants) return null;
    return variants.find((v) => v.id === product.defaultVariantId);
  }, [product.defaultVariantId, variants, hasVariants]);

  // Initialize selected group and size from default variant
  const getInitialGroup = () => {
    if (defaultVariant) {
      if (defaultVariant.color && isKnownColor(defaultVariant.color)) {
        return defaultVariant.color;
      } else if (defaultVariant.type) {
        return defaultVariant.type;
      } else if (defaultVariant.color) {
        // If color exists but isn't a known color, use it as type
        return defaultVariant.color;
      }
    }
    return availableGroups.length > 0 ? availableGroups[0] : null;
  };

  const getInitialSize = (group) => {
    if (defaultVariant && group) {
      const groupVariants = variantsByGroup.get(group) || [];
      const defaultInGroup = groupVariants.find((v) => v.id === defaultVariant.id);
      if (defaultInGroup && defaultInGroup.size) {
        const filteredSize = filterOutCountries(defaultInGroup.size);
        return filteredSize || null;
      }
    }
    return null;
  };

  // State: selected group (color or type) first, then size within that group
  const [selectedGroup, setSelectedGroup] = useState(getInitialGroup);
  const [selectedSize, setSelectedSize] = useState(() => getInitialSize(getInitialGroup()));

  // Get variants for selected group - FILTER OUT OF STOCK VARIANTS
  const groupVariants = useMemo(() => {
    if (!selectedGroup) return [];
    const allVariants = variantsByGroup.get(selectedGroup) || [];
    // Filter to only show in-stock variants (stock > 0 OR inventory_policy === 'continue' for backorder)
    return allVariants.filter((variant) => {
      const stock = variant.stock ?? 0;
      const allowsBackorder = variant.inventory_policy === 'continue';
      return stock > 0 || allowsBackorder;
    });
  }, [selectedGroup, variantsByGroup]);

  // Get available sizes for selected group - simple and straightforward
  const availableSizes = useMemo(() => {
    if (!selectedGroup) return [];
    
    // Get unique sizes from variants in the selected group (filter out countries)
    const sizeSet = new Set();
    groupVariants.forEach((v) => {
      if (v.size) {
        const filteredSize = filterOutCountries(v.size);
        if (filteredSize) {
          sizeSet.add(filteredSize);
        }
      }
    });
    
    // Sort sizes in standard order: XS, S, M, L, XL, XXL, etc.
    const sizeOrder = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', 'ONE SIZE', 'ONE-SIZE'];
    const sizes = Array.from(sizeSet);
    
    return sizes.sort((a, b) => {
      const aUpper = a.toUpperCase().trim();
      const bUpper = b.toUpperCase().trim();
      
      const aIndex = sizeOrder.findIndex((order) => aUpper === order || aUpper.includes(order));
      const bIndex = sizeOrder.findIndex((order) => bUpper === order || bUpper.includes(order));
      
      if (aIndex !== -1 && bIndex !== -1) {
        return aIndex - bIndex;
      }
      if (aIndex !== -1) return -1;
      if (bIndex !== -1) return 1;
      
      const aNum = parseFloat(aUpper);
      const bNum = parseFloat(bUpper);
      const aIsNum = !Number.isNaN(aNum);
      const bIsNum = !Number.isNaN(bNum);
      if (aIsNum && bIsNum) {
        return aNum - bNum;
      }
      if (aIsNum) return -1;
      if (bIsNum) return 1;
      return a.localeCompare(b);
    });
  }, [selectedGroup, groupVariants]);

  // Simple: when group changes, reset size to first available (already filtered)
  useEffect(() => {
    if (!selectedGroup || availableSizes.length === 0) {
      setSelectedSize(null);
      return;
    }
    
    // Always select first available size when group changes
    // availableSizes are already filtered (countries removed)
    setSelectedSize(availableSizes[0]);
  }, [selectedGroup, availableSizes]);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  // Find selected variant based on group (color/type) + size
  const selectedVariant = useMemo(() => {
    if (!selectedGroup) return null;
    
    // If size is selected, find variant with that size (matching filtered size)
    if (selectedSize) {
      const variant = groupVariants.find((v) => {
        const filteredVariantSize = v.size ? filterOutCountries(v.size) : null;
        return filteredVariantSize === selectedSize;
      });
      return variant || groupVariants[0] || null;
    }
    
    // Otherwise, return first variant of selected group
    return groupVariants[0] || null;
  }, [selectedGroup, selectedSize, groupVariants]);

  const displayedPrice = selectedVariant?.priceOverride ?? product.basePrice ?? 0;

  // Gallery images: variant photos first, then main product photos
  const galleryImages = useMemo(() => {
    const mainProductImages = Array.isArray(product.images) ? product.images.filter(Boolean) : [];
    
    if (!selectedGroup || !hasVariants) {
      return mainProductImages;
    }

    // Collect all images from variants of the selected group
    // Support both `images` (array) and `image` (string) for backward compatibility
    // Prioritize the selected variant's images first
    const selectedVariantImages = [];
    const otherGroupVariantImages = [];
    
    for (const variant of groupVariants) {
      let variantImages = [];
      if (Array.isArray(variant.images) && variant.images.length > 0) {
        variantImages = variant.images.filter(Boolean);
      } else if (variant.image) {
        variantImages = [variant.image];
      }
      
      // If this is the selected variant, prioritize its images
      if (selectedVariant && variant.id === selectedVariant.id) {
        selectedVariantImages.push(...variantImages);
      } else {
        otherGroupVariantImages.push(...variantImages);
      }
    }

    // Remove duplicates while preserving order: selected variant images first, then other variant images, then main images
    const seen = new Set();
    const combined = [];
    
    // Add selected variant images first (these should include the main variant photo)
    selectedVariantImages.forEach((img) => {
      if (img && !seen.has(img)) {
        combined.push(img);
        seen.add(img);
      }
    });
    
    // Then add other variant images
    otherGroupVariantImages.forEach((img) => {
      if (img && !seen.has(img)) {
        combined.push(img);
        seen.add(img);
      }
    });
    
    // Finally add main product images
    mainProductImages.forEach((img) => {
      if (img && !seen.has(img)) {
        combined.push(img);
        seen.add(img);
      }
    });

    return combined.length > 0 ? combined : mainProductImages;
  }, [selectedGroup, groupVariants, product.images, hasVariants, selectedVariant]);

  const [activeImage, setActiveImage] = useState(null);

  // Update active image when group changes or gallery changes
  useEffect(() => {
    const primaryImage = galleryImages[0] || product.images?.[0] || null;
    setActiveImage(primaryImage);
  }, [selectedGroup, galleryImages, product.images]);

  // Check if current variant is already in cart
  const currentCartItem = useMemo(() => {
    const variantId = selectedVariant?.id || null;
    return cart.find(
      (item) => item.productId === product.id && item.variantId === variantId
    );
  }, [cart, product.id, selectedVariant?.id]);

  const handleAddToBag = async () => {
    if (addingToCart) return;

    setAddingToCart(true);
    try {
      const variantId = selectedVariant?.id || null;
      const variantName = selectedVariant
        ? (() => {
            const parts = [];
            // Filter out countries from size
            const size = selectedVariant.size ? filterOutCountries(selectedVariant.size) : null;
            if (size) parts.push(size);
            
            // Only include color if it's a known color and not a country
            if (selectedVariant.color && isKnownColor(selectedVariant.color) && !isCountry(selectedVariant.color)) {
              parts.push(selectedVariant.color);
            }
            
            // Filter out countries from type
            const type = selectedVariant.type ? filterOutCountries(selectedVariant.type) : null;
            if (type) parts.push(type);
            
            // If color exists but isn't a known color and no type, use it as type (after filtering countries)
            if (selectedVariant.color && !isKnownColor(selectedVariant.color) && !selectedVariant.type) {
              const filteredColor = filterOutCountries(selectedVariant.color);
              if (filteredColor && !isCountry(selectedVariant.color)) {
                parts.push(filteredColor);
              }
            }
            return parts.length > 0 ? parts.join(' ') : 'One size';
          })()
        : 'One size';
      
      const image = selectedVariant?.images?.[0] || selectedVariant?.image || product.images?.[0] || null;

      await addToCart({
        productId: product.id,
        variantId, // Firestore variant document ID
        shopifyVariantId: selectedVariant?.shopifyVariantId || null, // Shopify variant ID for checkout
        quantity: 1,
        priceAtAdd: displayedPrice,
        productName: product.name,
        variantName,
        image,
      });

      // Show success state
      setJustAdded(true);
      setAddingToCart(false);
      
      // Revert to normal state after 2 seconds
      setTimeout(() => {
        setJustAdded(false);
      }, 2000);
    } catch (error) {
      console.error('Failed to add to cart:', error);
      setAddingToCart(false);
    }
  };

  return (
    <div className="relative min-h-screen bg-gradient-to-b from-white via-secondary/40 to-white">
      <header className="sticky top-0 z-40 border-b border-secondary/70 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <Link
              href={`/${storefront}/${category.slug}`}
              className="flex items-center text-primary transition hover:text-primary"
              aria-label={`Back to ${category.label}`}
            >
              <svg
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth="2"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
              </svg>
            </Link>
            <div className="flex flex-col sm:flex-row sm:items-center sm:gap-4">
              <Link href={`/${storefront}`} className="flex items-center sm:hidden">
                <Image
                  src="/Blerinas/Blerinas-logo-transparent2.png"
                  alt={siteInfo.companyName || 'Blerinas'}
                  width={240}
                  height={80}
                  className="h-10 w-auto"
                  priority
                />
              </Link>
              <nav className="hidden items-center gap-2 text-xs uppercase tracking-[0.2em] text-primary sm:flex">
                <Link href={`/${storefront}`} className="transition hover:text-primary">
                  Home
                </Link>
                <span>•</span>
                <Link href={`/${storefront}/${category.slug}`} className="transition hover:text-primary">
                  {category.label}
                </Link>
                <span>•</span>
                <span className="text-primary">{product.name}</span>
              </nav>
            </div>
          </div>
          <div className="flex items-center gap-3 sm:gap-4">
            {/* Cart icon - only show if cart has items (after hydration to avoid mismatch) */}
            {hasMounted && getCartItemCount() > 0 && (
              <Link
                href={`/cart?storefront=${encodeURIComponent(storefront)}`}
                onClick={() => {
                  // Ensure storefront is saved to cache before navigating to cart
                  if (storefront && typeof window !== 'undefined') {
                    saveStorefrontToCache(storefront);
                  }
                }}
                className="relative ml-2 flex items-center justify-center rounded-full border border-primary/30 bg-white/80 p-2 text-primary shadow-sm transition-colors hover:bg-secondary hover:text-primary"
                aria-label="Shopping cart"
                style={{ borderColor: theme.borderColor, color: theme.textColor, '--hover-bg': theme.primaryColorHover }}
              >
                <svg
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth="2"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007zM8.625 10.5a.375.375 0 11-.75 0 .375.375 0 01.75 0zm7.5 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"
                  />
                </svg>
                <span 
                  className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full text-xs font-semibold text-white" 
                  style={{ backgroundColor: theme.primaryColor }}
                  suppressHydrationWarning
                >
                  {getCartItemCount() > 9 ? '9+' : getCartItemCount()}
                </span>
              </Link>
            )}
            <SettingsMenu />
          </div>
        </div>
      </header>

          <main className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-12 sm:px-6 lg:flex-row lg:items-start lg:gap-16 lg:px-8">
        {/* Gallery */}
        <section className="flex w-full flex-col gap-4 lg:w-1/2">
          <div className="overflow-hidden rounded-3xl bg-secondary/70 shadow-sm ring-1 ring-secondary/50 aspect-[3/4] relative">
            {activeImage ? (
              <Image
                src={activeImage}
                alt={product.name}
                fill
                sizes="(max-width: 1024px) 100vw, 50vw"
                className="object-cover"
                priority
              />
            ) : (
              <div className="flex aspect-[3/4] items-center justify-center text-secondary">
                <svg className="h-16 w-16" viewBox="0 0 48 48" fill="none" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M8 37l10-12a2 2 0 013 0l7 8 5-6a2 2 0 013 0l7 8M5 11a2 2 0 012-2h34a2 2 0 012 2v26a2 2 0 01-2 2H7a2 2 0 01-2-2V11z"
                  />
                </svg>
              </div>
            )}
          </div>

          {galleryImages.length > 1 && (
            <div className="grid grid-cols-4 gap-3">
              {galleryImages.map((image) => (
                <button
                  key={image}
                  type="button"
                  onClick={() => setActiveImage(image)}
                  className={`overflow-hidden rounded-2xl border transition ${
                    activeImage === image
                      ? 'border-primary shadow-md'
                      : 'border-secondary/70 hover:border-primary/30'
                  }`}
                >
                  <div className="aspect-square relative">
                    <Image src={image} alt="" fill sizes="(max-width: 1024px) 25vw, 12.5vw" className="object-cover" />
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>

        {/* Product Info */}
        <section className="flex w-full flex-col gap-8 lg:w-1/2">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/80 px-3 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-primary">
              {category.label}
            </div>
            <h1 className="text-3xl font-light text-primary sm:text-4xl md:text-5xl">
              {product.name}
            </h1>
            <p className="text-lg text-slate-600 sm:text-xl">{product.description}</p>
            {Array.isArray(product.bulletPoints) && product.bulletPoints.length > 0 && (
              <div className="space-y-2">
                <h2 className="text-sm font-semibold uppercase tracking-[0.3em] text-primary">
                  Details
                </h2>
                <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600">
                  {product.bulletPoints
                    .filter((point) => typeof point === 'string' && point.trim().length > 0)
                    .map((point, index) => (
                      <li key={`${product.id}-bullet-${index}`}>{point.trim()}</li>
                    ))}
                </ul>
              </div>
            )}
          </div>

              <div className="space-y-1">
                <div className="flex items-baseline gap-4">
                  <p className="text-3xl font-semibold text-primary sm:text-4xl">
                    {formatPrice(displayedPrice, market)}
                  </p>
                  {selectedVariant?.priceOverride && (
                    <span className="rounded-full bg-secondary/80 px-3 py-1 text-xs font-semibold uppercase tracking-[0.25em] text-primary">
                      Variant price
                    </span>
                  )}
                </div>
                {isEUMarket && (
                  <p className="text-sm text-slate-500">
                    Includes VAT
                  </p>
                )}
              </div>


          {hasVariants && (
            <div className="space-y-6">
              {/* Color/Type Selector */}
              {availableGroups.length > 1 && (
                <div className="space-y-3">
                  <h2 className="text-sm font-semibold uppercase tracking-[0.3em] text-primary">
                    {(() => {
                      // Determine label based on whether selected group is a known color
                      if (hasColors && isKnownColor(selectedGroup)) {
                        return 'Color';
                      } else if (hasTypes) {
                        return 'Type';
                      } else {
                        return 'Variant';
                      }
                    })()}: {filterOutCountries(selectedGroup) || selectedGroup}
                  </h2>
                  <div className="flex flex-wrap gap-3">
                    {availableGroups.map((group) => {
                      const isSelected = selectedGroup === group;
                      const groupVariantsForGroup = variantsByGroup.get(group) || [];
                      // Get first image from variant (support both images array and image string)
                      const firstVariantWithImage = groupVariantsForGroup.find(
                        (v) => (Array.isArray(v.images) && v.images.length > 0) || v.image
                      );
                      const firstVariantImage = firstVariantWithImage
                        ? Array.isArray(firstVariantWithImage.images) && firstVariantWithImage.images.length > 0
                          ? firstVariantWithImage.images[0]
                          : firstVariantWithImage.image
                        : null;
                      const isGroupAColor = isKnownColor(group);
                      return (
                        <button
                          key={group}
                          type="button"
                          onClick={() => setSelectedGroup(group)}
                          className={`relative flex items-center gap-2 rounded-xl border-2 px-4 py-2 transition ${
                            isSelected
                              ? 'border-primary bg-white shadow-md'
                              : 'border-secondary/70 bg-white/60 hover:border-primary/30'
                          }`}
                        >
                          {firstVariantImage && hasColors && isGroupAColor && (
                            <div className="relative h-8 w-8">
                              <Image
                                src={firstVariantImage}
                                alt={group}
                                fill
                                sizes="32px"
                                className="rounded-full object-cover ring-1 ring-secondary/50"
                              />
                            </div>
                          )}
                          <span className="text-sm font-semibold text-slate-800">{filterOutCountries(group) || group}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Size Selector (only show if there are multiple sizes for selected group) */}
              {availableSizes.length > 1 && (
                <div className="space-y-3">
                  <h2 className="text-sm font-semibold uppercase tracking-[0.3em] text-primary">
                    Size
                  </h2>
                  <div className="grid grid-cols-4 gap-3">
                    {availableSizes.map((size) => {
                        const isSelected = selectedSize === size;
                        // Find variant by matching filtered size (need to check original size field)
                        const sizeVariant = groupVariants.find((v) => {
                          const filteredVariantSize = v.size ? filterOutCountries(v.size) : null;
                          return filteredVariantSize === size;
                        });
                        const isOutOfStock = !sizeVariant || (sizeVariant.stock ?? 0) === 0;
                        return (
                          <button
                            key={size}
                            type="button"
                            onClick={() => setSelectedSize(size)}
                            disabled={isOutOfStock}
                            className={`flex flex-col items-center justify-center rounded-xl border-2 px-3 py-2 text-sm font-semibold transition ${
                              isSelected
                                ? 'border-primary bg-white shadow-md text-slate-800'
                                : isOutOfStock
                                ? 'border-secondary/30 bg-white/30 text-slate-400 cursor-not-allowed'
                                : 'border-secondary/70 bg-white/60 text-slate-700 hover:border-primary/30'
                            }`}
                          >
                            <span>{size}</span>
                          </button>
                        );
                      })}
                  </div>
                </div>
              )}

              {/* Show selected variant details */}
              {selectedVariant && (
                <div className="rounded-xl border border-secondary/70 bg-white/60 px-4 py-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-slate-800">
                      {(() => {
                        const parts = [];
                        // Filter out countries from size
                        const size = selectedVariant.size ? filterOutCountries(selectedVariant.size) : null;
                        if (size) parts.push(size);
                        
                        // Only include color if it's a known color and not a country
                        if (selectedVariant.color && isKnownColor(selectedVariant.color) && !isCountry(selectedVariant.color)) {
                          parts.push(selectedVariant.color);
                        }
                        
                        // Filter out countries from type
                        const type = selectedVariant.type ? filterOutCountries(selectedVariant.type) : null;
                        if (type) parts.push(type);
                        
                        // If color exists but isn't a known color and no type, use it as type (after filtering countries)
                        if (selectedVariant.color && !isKnownColor(selectedVariant.color) && !selectedVariant.type) {
                          const filteredColor = filterOutCountries(selectedVariant.color);
                          if (filteredColor && !isCountry(selectedVariant.color)) {
                            parts.push(filteredColor);
                          }
                        }
                        return parts.length > 0 ? parts.join(' • ') : 'One size';
                      })()}
                    </span>
                    {selectedVariant.priceOverride && (
                      <span className="text-xs font-medium text-primary">
                        {formatPrice(selectedVariant.priceOverride, market)}
                      </span>
                    )}
                  </div>
                  {/* Display flexible attributes (Material, Model, Style, etc.) */}
                  {selectedVariant.attributes && typeof selectedVariant.attributes === 'object' && Object.keys(selectedVariant.attributes).length > 0 && (
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
                      {Object.entries(selectedVariant.attributes).map(([key, value]) => (
                        <div key={key} className="flex items-center gap-1">
                          <span className="font-medium">{key}:</span>
                          <span>{value}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

              <div className="flex flex-col gap-4">
                <button
                  type="button"
                  onClick={handleAddToBag}
                  disabled={addingToCart}
                  className={`flex items-center justify-center gap-2 rounded-full px-8 py-3 text-sm font-semibold uppercase tracking-[0.3em] text-white shadow-lg transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${
                    justAdded
                      ? 'bg-green-500 hover:bg-green-400 focus-visible:outline-green-500'
                      : addingToCart
                      ? 'bg-primary/80 cursor-wait'
                      : currentCartItem
                      ? 'bg-primary hover:bg-primary/90 focus-visible:outline-primary'
                      : 'bg-primary hover:bg-primary/90 focus-visible:outline-primary'
                  }`}
                >
                  {addingToCart ? (
                    <>
                      <svg
                        className="h-4 w-4 animate-spin"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        />
                      </svg>
                      Adding...
                    </>
                  ) : justAdded ? (
                    <>
                      <svg
                        className="h-4 w-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth="2.5"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M4.5 12.75l6 6 9-13.5"
                        />
                      </svg>
                      Added to cart!
                    </>
                  ) : currentCartItem ? (
                    <>
                      <svg
                        className="h-4 w-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth="2"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M12 4.5v15m7.5-7.5h-15"
                        />
                      </svg>
                      Add another ({currentCartItem.quantity} in cart)
                    </>
                  ) : (
                    <>
                      <svg
                        className="h-4 w-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth="2"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007zM8.625 10.5a.375.375 0 11-.75 0 .375.375 0 01.75 0zm7.5 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"
                        />
                      </svg>
                      Add to bag
                    </>
                  )}
                </button>
                {currentCartItem && !justAdded && (
                  <p className="text-xs text-primary font-medium">
                    This item is already in your cart. Click to add another.
                  </p>
                )}
                <p className="text-xs text-slate-500">
                  Free express shipping on orders over $150. Easy 30-day returns.
                </p>
              </div>

              {product.careInstructions && (
            <div className="space-y-2 rounded-3xl bg-white/70 p-6 ring-1 ring-secondary/70">
              <h3 className="text-sm font-semibold uppercase tracking-[0.3em] text-primary">
                Care instructions
              </h3>
              <p className="text-sm text-slate-600 whitespace-pre-line">
                {product.careInstructions}
              </p>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}


