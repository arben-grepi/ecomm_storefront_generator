'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useCart } from '@/lib/cart';
import AuthButton from '@/components/AuthButton';

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

const formatPrice = (value) => currencyFormatter.format(value ?? 0);

export default function ProductDetailPage({ category, product, variants, info = null }) {
  const { addToCart, getCartItemCount, cart } = useCart();
  const [addingToCart, setAddingToCart] = useState(false);
  const [justAdded, setJustAdded] = useState(false);
  const [hasMounted, setHasMounted] = useState(false);
  const hasVariants = Array.isArray(variants) && variants.length > 0;
  
  // Use info from server (for SEO), with empty strings as fallback
  const siteInfo = info || {
    companyName: '',
    footerText: '',
  };
  
  // Check if variants have colors or types
  const hasColors = useMemo(() => {
    return variants.some((v) => v.color && v.color !== 'default');
  }, [variants]);
  
  const hasTypes = useMemo(() => {
    return variants.some((v) => v.type);
  }, [variants]);

  // Group variants by color or type
  const variantsByGroup = useMemo(() => {
    if (!hasVariants) return new Map();
    const grouped = new Map();
    variants.forEach((variant) => {
      // Use color if available, otherwise type, otherwise 'default'
      const groupKey = hasColors 
        ? (variant.color || 'default')
        : hasTypes 
        ? (variant.type || 'default')
        : 'default';
      if (!grouped.has(groupKey)) {
        grouped.set(groupKey, []);
      }
      grouped.get(groupKey).push(variant);
    });
    return grouped;
  }, [hasVariants, variants, hasColors, hasTypes]);

  // Get available groups (colors or types)
  const availableGroups = useMemo(() => {
    return Array.from(variantsByGroup.keys()).filter((key) => key !== 'default' || variantsByGroup.size === 1);
  }, [variantsByGroup]);

  // State: selected group (color or type) first, then size within that group
  const [selectedGroup, setSelectedGroup] = useState(
    availableGroups.length > 0 ? availableGroups[0] : null
  );
  const [selectedSize, setSelectedSize] = useState(null);

  // Get variants for selected group
  const groupVariants = useMemo(() => {
    if (!selectedGroup) return [];
    return variantsByGroup.get(selectedGroup) || [];
  }, [selectedGroup, variantsByGroup]);

  // Get available sizes for selected group
  const availableSizes = useMemo(() => {
    return groupVariants
      .map((v) => v.size)
      .filter(Boolean)
      .filter((size, index, arr) => arr.indexOf(size) === index)
      .sort();
  }, [groupVariants]);

  // Auto-select first size when group changes
  useEffect(() => {
    if (availableSizes.length > 0) {
      // Reset to first available size when group changes
      setSelectedSize(availableSizes[0]);
    } else {
      setSelectedSize(null);
    }
  }, [selectedGroup, availableSizes]);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  // Find selected variant based on group (color/type) + size
  const selectedVariant = useMemo(() => {
    if (!selectedGroup || !selectedSize) {
      // If no size selected, return first variant of selected group
      return groupVariants[0] || null;
    }
    return (
      groupVariants.find((v) => {
        if (hasColors) {
          return v.size === selectedSize && v.color === selectedGroup;
        } else if (hasTypes) {
          return v.size === selectedSize && v.type === selectedGroup;
        }
        return v.size === selectedSize;
      }) || groupVariants[0] || null
    );
  }, [selectedGroup, selectedSize, groupVariants, hasColors, hasTypes]);

  const displayedPrice = selectedVariant?.priceOverride ?? product.basePrice ?? 0;

  // Gallery images: variant photos first, then main product photos
  const galleryImages = useMemo(() => {
    const mainProductImages = Array.isArray(product.images) ? product.images.filter(Boolean) : [];
    
    if (!selectedGroup || !hasVariants) {
      return mainProductImages;
    }

    // Collect all images from variants of the selected group
    // Support both `images` (array) and `image` (string) for backward compatibility
    const allGroupVariantImages = [];
    for (const variant of groupVariants) {
      if (Array.isArray(variant.images) && variant.images.length > 0) {
        // Use images array if available
        allGroupVariantImages.push(...variant.images.filter(Boolean));
      } else if (variant.image) {
        // Backward compatibility: single image field
        allGroupVariantImages.push(variant.image);
      }
    }

    // Remove duplicates from variant images while preserving order
    const uniqueVariantImages = allGroupVariantImages.filter(
      (img, index, arr) => arr.indexOf(img) === index
    );

    // Combine: variant images first, then product images (excluding duplicates)
    const combined = [...uniqueVariantImages];
    mainProductImages.forEach((img) => {
      if (!combined.includes(img)) {
        combined.push(img);
      }
    });

    return combined.length > 0 ? combined : mainProductImages;
  }, [selectedGroup, groupVariants, product.images, hasVariants]);

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
            if (selectedVariant.size) parts.push(selectedVariant.size);
            if (selectedVariant.color) parts.push(selectedVariant.color);
            if (selectedVariant.type) parts.push(selectedVariant.type);
            return parts.length > 0 ? parts.join(' ') : 'One size';
          })()
        : 'One size';
      
      const image = selectedVariant?.images?.[0] || selectedVariant?.image || product.images?.[0] || null;

      await addToCart({
        productId: product.id,
        variantId,
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
              href={`/LUNERA/${category.slug}`}
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
              <h1 className="whitespace-nowrap text-xl font-light text-primary tracking-wide sm:hidden">
                {siteInfo.companyName}
              </h1>
              <nav className="hidden items-center gap-2 text-xs uppercase tracking-[0.2em] text-primary sm:flex">
                <Link href="/LUNERA" className="transition hover:text-primary">
                  Home
                </Link>
                <span>•</span>
                <Link href={`/LUNERA/${category.slug}`} className="transition hover:text-primary">
                  {category.label}
                </Link>
                <span>•</span>
                <span className="text-primary">{product.name}</span>
              </nav>
            </div>
          </div>
          <div className="flex items-center gap-3 sm:gap-4">
            <AuthButton />
            <Link
              href="/LUNERA/cart"
              className="relative ml-2 flex items-center justify-center rounded-full border border-primary/30 bg-white/80 p-2 text-primary shadow-sm transition-colors hover:bg-secondary hover:text-primary"
              aria-label="Shopping cart"
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
              {hasMounted && getCartItemCount() > 0 && (
                <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-xs font-semibold text-white">
                  {getCartItemCount() > 9 ? '9+' : getCartItemCount()}
                </span>
              )}
            </Link>
          </div>
        </div>
      </header>

          <main className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-12 sm:px-6 lg:flex-row lg:items-start lg:gap-16 lg:px-8">
        {/* Gallery */}
        <section className="flex w-full flex-col gap-4 lg:w-1/2">
          <div className="overflow-hidden rounded-3xl bg-secondary/70 shadow-sm ring-1 ring-secondary/50">
            {activeImage ? (
              <img
                src={activeImage}
                alt={product.name}
                className="h-full w-full object-cover"
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
                  <img src={image} alt="" className="aspect-square w-full object-cover" />
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

              <div className="flex items-baseline gap-4">
                <p className="text-3xl font-semibold text-primary sm:text-4xl">
                  {formatPrice(displayedPrice)}
                </p>
                {selectedVariant?.priceOverride && (
                  <span className="rounded-full bg-secondary/80 px-3 py-1 text-xs font-semibold uppercase tracking-[0.25em] text-primary">
                    Variant price
                  </span>
                )}
              </div>


          {hasVariants && (
            <div className="space-y-6">
              {/* Color/Type Selector */}
              {availableGroups.length > 1 && (
                <div className="space-y-3">
                  <h2 className="text-sm font-semibold uppercase tracking-[0.3em] text-primary">
                    {hasColors ? 'Color' : hasTypes ? 'Type' : 'Variant'}: {selectedGroup}
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
                      return (
                        <button
                          key={group}
                          type="button"
                          onClick={() => {
                            setSelectedGroup(group);
                            setSelectedSize(null); // Reset size when group changes
                          }}
                          className={`relative flex items-center gap-2 rounded-xl border-2 px-4 py-2 transition ${
                            isSelected
                              ? 'border-primary bg-white shadow-md'
                              : 'border-secondary/70 bg-white/60 hover:border-primary/30'
                          }`}
                        >
                          {firstVariantImage && hasColors && (
                            <img
                              src={firstVariantImage}
                              alt={group}
                              className="h-8 w-8 rounded-full object-cover ring-1 ring-secondary/50"
                            />
                          )}
                          <span className="text-sm font-semibold text-slate-800">{group}</span>
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
                      const sizeVariant = groupVariants.find((v) => {
                        if (hasColors) {
                          return v.size === size && v.color === selectedGroup;
                        } else if (hasTypes) {
                          return v.size === size && v.type === selectedGroup;
                        }
                        return v.size === size;
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
                <div className="rounded-xl border border-secondary/70 bg-white/60 px-4 py-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-slate-800">
                      {(() => {
                        const parts = [];
                        if (selectedVariant.size) parts.push(selectedVariant.size);
                        if (selectedVariant.color) parts.push(selectedVariant.color);
                        if (selectedVariant.type) parts.push(selectedVariant.type);
                        return parts.length > 0 ? parts.join(' • ') : 'One size';
                      })()}
                    </span>
                    {selectedVariant.priceOverride && (
                      <span className="text-xs font-medium text-primary">
                        {formatPrice(selectedVariant.priceOverride)}
                      </span>
                    )}
                  </div>
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


