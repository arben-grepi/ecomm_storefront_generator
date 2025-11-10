'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { trackProductView } from '@/lib/analytics';

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

const formatPrice = (value) => currencyFormatter.format(value ?? 0);

export default function ProductDetailPage({ category, product, variants }) {
  const hasVariants = Array.isArray(variants) && variants.length > 0;
  const [selectedVariantId, setSelectedVariantId] = useState(
    hasVariants ? variants[0]?.id ?? null : null
  );
  const [activeImage, setActiveImage] = useState(null);

  const selectedVariant = useMemo(() => {
    if (!hasVariants || !selectedVariantId) return null;
    return variants.find((variant) => variant.id === selectedVariantId) ?? null;
  }, [hasVariants, selectedVariantId, variants]);

  const displayedPrice = selectedVariant?.priceOverride ?? product.basePrice ?? 0;
  const displayedStock =
    selectedVariant?.stock ??
    (typeof product.stock === 'number' ? product.stock : (hasVariants ? null : 0));

  const galleryImages = useMemo(() => {
    const baseImages = Array.isArray(product.images) ? product.images.filter(Boolean) : [];
    const variantImage = selectedVariant?.image ? [selectedVariant.image] : [];
    const dedupedBase = baseImages.filter((img) => !variantImage.includes(img));
    return [...variantImage, ...dedupedBase];
  }, [product.images, selectedVariant?.image]);

  useEffect(() => {
    const primaryImage =
      selectedVariant?.image || galleryImages[0] || product.images?.[0] || null;
    setActiveImage(primaryImage);
  }, [selectedVariant?.image, galleryImages, product.images]);

  useEffect(() => {
    trackProductView(product.id).catch(() => {});
  }, [product.id]);

  const handleAddToBag = () => {
    // Placeholder add-to-cart action
    console.log('Add to bag:', {
      productId: product.id,
      variantId: selectedVariant?.id ?? null,
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-white via-pink-50/40 to-white">
      <header className="sticky top-0 z-40 border-b border-pink-100/70 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <Link
            href={`/${category.slug}`}
            className="text-sm font-medium text-pink-500 transition hover:text-pink-600"
          >
            ← Back to {category.label}
          </Link>
          <nav className="hidden items-center gap-2 text-xs uppercase tracking-[0.2em] text-pink-400 sm:flex">
            <Link href="/" className="transition hover:text-pink-500">
              Home
            </Link>
            <span>•</span>
            <Link href={`/${category.slug}`} className="transition hover:text-pink-500">
              {category.label}
            </Link>
            <span>•</span>
            <span className="text-pink-500">{product.name}</span>
          </nav>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-12 sm:px-6 lg:flex-row lg:items-start lg:gap-16 lg:px-8">
        {/* Gallery */}
        <section className="flex w-full flex-col gap-4 lg:w-1/2">
          <div className="overflow-hidden rounded-3xl bg-pink-50/70 shadow-sm ring-1 ring-pink-100/50">
            {activeImage ? (
              <img
                src={activeImage}
                alt={product.name}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex aspect-[3/4] items-center justify-center text-pink-200">
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
                      ? 'border-pink-400 shadow-md'
                      : 'border-pink-100/70 hover:border-pink-200'
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
            <div className="inline-flex items-center gap-2 rounded-full bg-white/80 px-3 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-pink-400">
              {category.label}
            </div>
            <h1 className="text-3xl font-light text-slate-900 sm:text-4xl md:text-5xl">
              {product.name}
            </h1>
            <p className="text-lg text-slate-600 sm:text-xl">{product.description}</p>
          </div>

          <div className="flex items-baseline gap-4">
            <p className="text-3xl font-semibold text-pink-500 sm:text-4xl">
              {formatPrice(displayedPrice)}
            </p>
            {selectedVariant?.priceOverride && (
              <span className="rounded-full bg-pink-100/80 px-3 py-1 text-xs font-semibold uppercase tracking-[0.25em] text-pink-500">
                Variant price
              </span>
            )}
          </div>

  <div>
            <p className="text-sm text-slate-500">
              {displayedStock != null
                ? displayedStock > 0
                  ? `${displayedStock} in stock`
                  : 'Out of stock'
                : 'Check variant availability'}
            </p>
          </div>

          {hasVariants && (
            <div className="space-y-4">
              <h2 className="text-sm font-semibold uppercase tracking-[0.3em] text-pink-400">
                Select a variant
              </h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {variants.map((variant) => {
                  const isSelected = selectedVariantId === variant.id;
                  return (
                    <button
                      key={variant.id}
                      type="button"
                      onClick={() => setSelectedVariantId(variant.id)}
                      className={`flex flex-col gap-2 rounded-2xl border px-4 py-3 text-left transition ${
                        isSelected
                          ? 'border-pink-400 bg-white shadow-md'
                          : 'border-pink-100/70 bg-white/60 hover:border-pink-200'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-slate-800">
                          {variant.size || variant.color
                            ? [variant.size, variant.color].filter(Boolean).join(' • ')
                            : 'One size'}
                        </span>
                        {variant.priceOverride && (
                          <span className="text-xs font-medium text-pink-500">
                            {formatPrice(variant.priceOverride)}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500">
                        Stock: {typeof variant.stock === 'number' ? variant.stock : 0}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex flex-col gap-4">
            <button
              type="button"
              onClick={handleAddToBag}
              className="flex items-center justify-center rounded-full bg-pink-500 px-8 py-3 text-sm font-semibold uppercase tracking-[0.3em] text-white shadow-lg transition hover:bg-pink-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pink-500"
            >
              Add to bag
            </button>
            <p className="text-xs text-slate-500">
              Free express shipping on orders over $150. Easy 30-day returns.
            </p>
          </div>

          {product.tags.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold uppercase tracking-[0.3em] text-pink-400">
                Tags
              </h3>
              <div className="flex flex-wrap gap-2">
                {product.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-white/80 px-3 py-1 text-xs font-medium text-pink-500 ring-1 ring-pink-100/70"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {product.careInstructions && (
            <div className="space-y-2 rounded-3xl bg-white/70 p-6 ring-1 ring-pink-100/70">
              <h3 className="text-sm font-semibold uppercase tracking-[0.3em] text-pink-400">
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

