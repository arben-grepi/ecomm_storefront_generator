'use client';

import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { doc, getDoc, getDocs, setDoc, serverTimestamp, collection, addDoc, updateDoc, query, where, limit, deleteDoc, arrayUnion } from 'firebase/firestore';
import { getFirebaseDb } from '@/lib/firebase';
import { getCollectionPath, getDocumentPath } from '@/lib/store-collections';
import { useWebsite } from '@/lib/website-context';
import Toast from '@/components/admin/Toast';
import CategorySelector from '@/components/admin/CategorySelector';
import ImageManager from '@/components/admin/ImageManager';
import ProductFormFields from '@/components/admin/ProductFormFields';
import StorefrontSelector from '@/components/admin/StorefrontSelector';
import MarketInfoDisplay from '@/components/admin/MarketInfoDisplay';
import ProductImageSelector from '@/components/admin/ProductImageSelector';
import ManualVariantForm from '@/components/admin/ManualVariantForm';
import VariantSelector from '@/components/admin/VariantSelector';
import {
  normalizeString,
  cleanVariantName,
  getVariantColor,
  getVariantSize,
  getVariantGroupKey,
  sortVariantsList,
  getVariantsWithSameColor,
} from '@/lib/variant-utils';
import { getDisplayImageUrl, getFullQualityImageUrl } from '@/lib/image-utils';
import { useProductLoader } from '@/hooks/useProductLoader';
import { useShopifyItemInitializer } from '@/hooks/useShopifyItemInitializer';
import { useProductSaver } from '@/hooks/useProductSaver';

/**
 * ProductModal - Unified modal for creating/editing products
 * 
 * Props:
 * - mode: 'shopify' | 'manual' | 'edit'
 * - shopifyItem: Shopify item data (for mode='shopify')
 * - existingProduct: Existing product data (for mode='edit')
 * - onClose: Callback when modal closes
 * - onSaved: Callback when product is saved
 */
export default function ProductModal({ mode = 'shopify', shopifyItem, existingProduct, onClose, onSaved, initialCategoryId }) {
  // Early returns MUST be before any hooks
  if (mode === 'shopify' && !shopifyItem) return null;
  if (mode === 'edit' && !existingProduct) return null;

  const db = getFirebaseDb();
  const { selectedWebsite, availableWebsites, loading: websitesLoading } = useWebsite();
  const [categoryId, setCategoryId] = useState(initialCategoryId || '');
  const [loading, setLoading] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);
  const [storefrontSelections, setStorefrontSelections] = useState([]);
  // Form state
  const [selectedImages, setSelectedImages] = useState([]);
  const [selectedVariants, setSelectedVariants] = useState([]);
  // Track the item ID to prevent resetting variants when category changes
  const initializedItemIdRef = useRef(null);
  const [displayName, setDisplayName] = useState('');
  const [displayDescription, setDisplayDescription] = useState('');
  const [bulletPoints, setBulletPoints] = useState([]);
  const [basePriceInput, setBasePriceInput] = useState('');
  const [showOnlyInStock, setShowOnlyInStock] = useState(false);
  const [expandedVariants, setExpandedVariants] = useState(new Set());
  const [productId, setProductId] = useState(null); // For edit mode
  const [variantImages, setVariantImages] = useState({});
  const [defaultVariantId, setDefaultVariantId] = useState(null);
  const [defaultVariantPhotos, setDefaultVariantPhotos] = useState({}); // Map variantId -> default photo URL
  const [variantPriceOverrides, setVariantPriceOverrides] = useState({}); // Map variantId -> price override
  const [variantPriceErrors, setVariantPriceErrors] = useState({}); // Map variantId -> error message
  const [editModeShopifyItem, setEditModeShopifyItem] = useState(null); // Store shopifyItem when editing
  
  // Manual mode: image URLs and variant creation
  const [manualImageUrls, setManualImageUrls] = useState([]); // Raw image URLs for manual mode
  const [newVariantForm, setNewVariantForm] = useState({
    hasColor: true, // true for color, false for type
    color: '',
    type: '',
    size: '',
    stock: '',
    priceOverride: '',
    sku: '',
  });
  
  // Determine which item to use based on mode
  const item = mode === 'shopify' ? shopifyItem : null;
  const itemOptions = useMemo(() => item?.rawProduct?.options || [], [item]);
  
  // For Shopify mode: use Shopify variants
  // For manual/edit mode: use manual variants (will be loaded/created)
  const [manualVariants, setManualVariants] = useState([]);
  
  const sortedVariants = useMemo(() => {
    if (mode === 'shopify') {
      return sortVariantsList(item?.rawProduct?.variants || item?.variants || []);
    }
    return sortVariantsList(manualVariants);
  }, [mode, item, manualVariants]);
  
  const allVariants = sortedVariants;

  const getSameColorVariantIds = useCallback(
    (variantId, variantsList = allVariants) => {
      return getVariantsWithSameColor(variantsList, variantId);
    },
    [allVariants]
  );

  const getVariantDefaultImages = (variant) => {
    const variantId = variant.id || variant.shopifyId;
    const images = [];
    const variantImageId = variant.image_id || variant.imageId;
    
    // Prioritize the variant-specific photo (from image_id) - it should be first
    if (variantImageId && item?.rawProduct?.images) {
      const variantImage = item.rawProduct.images.find((img) => img.id === variantImageId);
      if (variantImage?.src) {
        images.push(variantImage.src);
      }
    }

    // Then add other variant-specific images
    if (item?.rawProduct?.images) {
      const variantSpecificImages = item.rawProduct.images
        .filter((img) => {
          const imgVariantIds = img.variant_ids || [];
          return imgVariantIds.includes(variantId) && img.id !== variantImageId; // Exclude the main variant image we already added
        })
        .map((img) => img.src)
        .filter(Boolean);

      images.push(...variantSpecificImages);
    }

    return Array.from(new Set(images.filter(Boolean)));
  };

  const getAvailableImagesForVariant = (variant) => {
    if (mode === 'shopify') {
    const variantId = variant.id || variant.shopifyId;
    if (!item?.rawProduct?.images) {
      return availableImages;
    }

    const variantSpecificImages = item.rawProduct.images
      .filter((img) => {
        const imgVariantIds = img.variant_ids || [];
        return imgVariantIds.includes(variantId);
      })
      .map((img) => img.src);

    const generalImages = item.rawProduct.images
      .filter((img) => {
        const imgVariantIds = img.variant_ids || [];
        return imgVariantIds.length === 0;
      })
      .map((img) => img.src);

    const combined = [...variantSpecificImages, ...generalImages, ...availableImages];
    return Array.from(new Set(combined.filter(Boolean)));
    } else {
      // For manual/edit mode, return all available images
      return availableImages;
    }
  };

  const toggleVariantExpanded = (variantId) => {
    setExpandedVariants((prev) => {
      const next = new Set(prev);
      if (next.has(variantId)) {
        next.delete(variantId);
      } else {
        next.add(variantId);
      }
      return next;
    });
  };

  const handleVariantImageToggle = (variantId, imageUrl) => {
    const variant = allVariants.find((v) => (v.id || v.shopifyId) === variantId);
    if (!variant) return;
    
    // Check if this image is in the main gallery selection
    const isMainGalleryImage = selectedImages.some((img) => img.url === imageUrl);
    
    // If it's a main gallery image, toggle it in the main gallery instead
    if (isMainGalleryImage) {
      handleImageToggle(imageUrl);
      return;
    }
    
    // Otherwise, it's a variant-specific image - toggle it in variantImages
    const groupKey = getVariantGroupKey(variant);
    const sameGroupVariantIds = getSameColorVariantIds(variantId);

    setVariantImages((prev) => {
      const updated = { ...prev };
      const baseSelectionsRaw = prev[groupKey] || prev[variantId] || [];
      const baseSelections = Array.isArray(baseSelectionsRaw) ? [...baseSelectionsRaw] : [];
      const current = [...baseSelections];
      const exists = current.includes(imageUrl);

      if (exists) {
        // Unselecting: remove from group
        updated[groupKey] = current.filter((url) => url !== imageUrl);
        // Also remove from all variants in this group (for backward compatibility)
        sameGroupVariantIds.forEach((id) => {
          const previousVariantSelectionsRaw = updated[id] || prev[id] || baseSelections;
          const previousVariantSelections = Array.isArray(previousVariantSelectionsRaw)
            ? [...previousVariantSelectionsRaw]
            : [];
          updated[id] = previousVariantSelections.filter((url) => url !== imageUrl);
        });
        return updated;
      }

      // Selecting: add to group
      const nextGroupSelections = updated[groupKey]
        ? [...updated[groupKey]]
        : [...baseSelections];
      if (!nextGroupSelections.includes(imageUrl)) {
        nextGroupSelections.push(imageUrl);
      }
      updated[groupKey] = nextGroupSelections;

      // Also add to all variants in this group (for backward compatibility)
      sameGroupVariantIds.forEach((id) => {
        const previousVariantSelectionsRaw = updated[id] || prev[id] || baseSelections;
        const previousVariantSelections = Array.isArray(previousVariantSelectionsRaw)
          ? [...previousVariantSelectionsRaw]
          : [];
        if (!previousVariantSelections.includes(imageUrl)) {
          previousVariantSelections.push(imageUrl);
        }
        updated[id] = previousVariantSelections;
      });
      return updated;
    });

    // Ensure variants in this group are selected when an image is chosen
    if (!setSelectedVariants) {
      return;
    }

    setSelectedVariants((prev) => {
      const next = new Set(prev);
      sameGroupVariantIds.forEach((id) => next.add(id));
      return Array.from(next);
    });
  };

  const getSelectedVariantImages = (variantId) => {
    const variant = allVariants.find((v) => (v.id || v.shopifyId) === variantId);
    if (!variant) return [];
    
    const groupKey = getVariantGroupKey(variant);
    // Check group key first, then fallback to variant ID (for backward compatibility)
    return variantImages[groupKey] || variantImages[variantId] || [];
  };
  
  // Add new variant handler for manual mode
  const handleAddVariant = () => {
    if (!newVariantForm.size.trim()) {
      setToastMessage({ type: 'error', text: 'Size is required.' });
      return;
    }
    
    if (!newVariantForm.hasColor && !newVariantForm.type.trim()) {
      setToastMessage({ type: 'error', text: 'Please enter either a color or type.' });
      return;
    }
    
    if (newVariantForm.hasColor && !newVariantForm.color.trim()) {
      setToastMessage({ type: 'error', text: 'Please enter a color.' });
      return;
    }
    
    const parsedBasePrice = basePriceInput ? parseFloat(basePriceInput) : 0;
    const variantColor = newVariantForm.hasColor ? newVariantForm.color.trim() : null;
    const variantType = !newVariantForm.hasColor ? newVariantForm.type.trim() : null;
    const variantSize = newVariantForm.size.trim();
    
    // Construct variantName for display (e.g., "Black / M")
    const nameParts = [];
    if (variantColor) nameParts.push(variantColor);
    if (variantType) nameParts.push(variantType);
    if (variantSize) nameParts.push(variantSize);
    const variantName = cleanVariantName(nameParts.length > 0 ? nameParts.join(' / ') : null);
    
    const newVariant = {
      id: `temp-${Date.now()}-${Math.random()}`,
      shopifyId: `temp-${Date.now()}-${Math.random()}`,
      color: variantColor,
      type: variantType,
      size: variantSize, // Store as string
      variantName: variantName, // Save display name
      stock: parseInt(newVariantForm.stock, 10) || 0,
      // Ensure variant price is at least equal to base price
      priceOverride: newVariantForm.priceOverride ? parseFloat(newVariantForm.priceOverride) : null,
      sku: newVariantForm.sku.trim() || null,
      price: (() => {
        if (newVariantForm.priceOverride) {
          const variantPrice = parseFloat(newVariantForm.priceOverride);
          // If variant price is less than base price, use base price
          return !isNaN(variantPrice) && variantPrice >= parsedBasePrice ? variantPrice : parsedBasePrice;
        }
        return parsedBasePrice;
      })(),
    };
    
    setManualVariants((prev) => [...prev, newVariant]);
    setSelectedVariants((prev) => [...prev, newVariant.id]);
    
    // Reset form
    setNewVariantForm({
      hasColor: true,
      color: '',
      type: '',
      size: '',
      stock: '',
      priceOverride: '',
      sku: '',
    });
  };
  
  const handleRemoveVariant = (variantId) => {
    setManualVariants((prev) => prev.filter((v) => (v.id || v.shopifyId) !== variantId));
    setSelectedVariants((prev) => prev.filter((id) => id !== variantId));
  };

  // Load existing product data when editing
  useProductLoader({
    mode,
    existingProduct,
    db,
    selectedWebsite,
    availableWebsites,
    setProductId,
    setManualVariants,
    setSelectedVariants,
    setDisplayName,
    setDisplayDescription,
    setBulletPoints,
    setCategoryId,
    setBasePriceInput,
    setDefaultVariantId,
    setSelectedImages,
    setVariantImages,
    setDefaultVariantPhotos,
    setVariantPriceOverrides,
    setStorefrontSelections,
    setEditModeShopifyItem,
    setToastMessage,
    setLoading,
  });

  // Initialize Shopify item data
  useShopifyItemInitializer({
    mode,
    item,
    sortedVariants,
    basePriceInput,
    getVariantDefaultImages,
    setSelectedImages,
    setSelectedVariants,
    setBasePriceInput,
    setDisplayName,
    setDisplayDescription,
    setBulletPoints,
    setExpandedVariants,
    setVariantImages,
    setDefaultVariantPhotos,
    setVariantPriceOverrides,
    initializedItemIdRef,
  });

  // Automatically adjust variant prices when base price changes
  // If a variant price is less than the new base price, set it to the base price
  useEffect(() => {
    const basePrice = basePriceInput ? parseFloat(basePriceInput) : 0;
    if (isNaN(basePrice) || basePrice <= 0) return;

    setVariantPriceOverrides((prev) => {
      const updated = { ...prev };
      let hasChanges = false;

      Object.keys(updated).forEach((variantId) => {
        const variantPrice = parseFloat(updated[variantId]);
        if (!isNaN(variantPrice) && variantPrice < basePrice) {
          updated[variantId] = basePrice.toString();
          hasChanges = true;
        }
      });

      return hasChanges ? updated : prev;
    });
  }, [basePriceInput]);
  
  const handleImageToggle = (imageUrl) => {
    setSelectedImages((prev) => {
      const exists = prev.find((img) => img.url === imageUrl);
      if (exists) {
        // If removing main image, make first remaining image main
        const filtered = prev.filter((img) => img.url !== imageUrl);
        if (exists.isMain && filtered.length > 0) {
          filtered[0].isMain = true;
        }
        // Note: We don't remove from variantImages here because variant images are now
        // automatically synced with selectedImages. Variant-specific images are separate.
        return filtered;
      } else {
        // If no images selected, make this one main
        const isMain = prev.length === 0;
        const newSelected = [...prev, { url: imageUrl, isMain }];
        // Note: Variant images will automatically include selectedImages, so no need to update here
        return newSelected;
      }
    });
  };

  const handleSetMainImage = (imageUrl) => {
    setSelectedImages((prev) =>
      prev.map((img) => ({ ...img, isMain: img.url === imageUrl }))
    );
  };

  const handleVariantToggle = (variantId) => {
    const variant = allVariants.find((v) => (v.id || v.shopifyId) === variantId);
    const stock = variant
      ? mode === 'shopify'
        ? (variant.inventory_quantity || variant.inventoryQuantity || 0)
        : (variant.stock || 0)
      : 0;
    
    // For manual/edit mode, allow selecting even if stock is 0 (for adding new variants)
    if (mode === 'shopify' && stock <= 0) {
      return;
    }
    
    setSelectedVariants((prev) => {
      const alreadySelected = prev.includes(variantId);
      if (alreadySelected) {
        // Unselecting: only remove this specific variant
        // If this was the default variant, clear it
        if (defaultVariantId === variantId) {
          setDefaultVariantId(null);
        }
        return prev.filter((id) => id !== variantId);
      }

      // Selecting: add all same-color variants (only in-stock ones for Shopify mode)
      const sameColorVariantIds = getSameColorVariantIds(variantId);
      const inStockSameColorIds = sameColorVariantIds.filter((id) => {
        const v = allVariants.find((variant) => (variant.id || variant.shopifyId) === id);
        if (!v) return false;
        const variantStock = mode === 'shopify'
          ? (v.inventory_quantity || v.inventoryQuantity || 0)
          : (v.stock || 0);
        // For manual/edit mode, allow selecting variants with 0 stock
        return mode === 'manual' || mode === 'edit' || variantStock > 0;
      });

      // Add all in-stock same-color variants
      const newSelected = [...prev];
      inStockSameColorIds.forEach((id) => {
        if (!newSelected.includes(id)) {
          newSelected.push(id);
        }
      });

      setVariantImages((prevImages) => {
        const existingPhotos = sameColorVariantIds
          .map((id) => prevImages[id])
          .find((photos) => photos && photos.length > 0);

        if (existingPhotos) {
          const updated = { ...prevImages };
          sameColorVariantIds.forEach((id) => {
            if (!updated[id] || updated[id].length === 0) {
              updated[id] = [...existingPhotos];
            }
          });
          return updated;
        }

        const defaults = variant ? getVariantDefaultImages(variant) : [];
        if (defaults.length === 0) {
          return prevImages;
        }

        const updated = { ...prevImages };
        sameColorVariantIds.forEach((id) => {
          updated[id] = [...defaults];
        });
        return updated;
      });

      // Always ensure we have a default variant - set the first selected variant as default
      // If no default variant is set yet, or the current default is not selected anymore,
      // set the toggled variant as the default. This makes the first selected variant
      // automatically become the default.
      if (!defaultVariantId || !newSelected.includes(defaultVariantId)) {
        setDefaultVariantId(variantId);
      } else if (newSelected.length > 0 && !newSelected.includes(defaultVariantId)) {
        // If default variant was removed, set first selected as default
        setDefaultVariantId(newSelected[0]);
      }

      return newSelected;
    });
  };

  const handleGenerateAI = async () => {
    // TODO: Implement AI text generation
    // See docs/ai-text-generation.md for implementation instructions
    setToastMessage({ type: 'error', text: 'AI text generation not yet implemented. See docs/ai-text-generation.md for details.' });
  };

  // Determine available images based on mode
  // For edit mode, use shopifyItem images if available (like when first handling), otherwise use product images
  const availableImages = useMemo(() => {
    if (mode === 'shopify') {
      return item?.imageUrls || item?.images || [];
    } else if (mode === 'edit') {
      // Use shopifyItem images if available (like when first handling), otherwise use product images
      if (editModeShopifyItem) {
        return editModeShopifyItem.imageUrls || editModeShopifyItem.images || existingProduct?.images || [];
      }
      return existingProduct?.images || [];
    } else {
      // Manual mode - use manualImageUrls
      return manualImageUrls;
    }
  }, [mode, item, existingProduct, manualImageUrls, editModeShopifyItem]);

  // Use product saver hook
  const { save: handleSave } = useProductSaver({
    db,
    mode,
    item,
    existingProduct,
    productId,
    displayName,
    displayDescription,
    bulletPoints,
    categoryId,
    basePriceInput,
    selectedImages,
    selectedVariants,
    defaultVariantId,
    allVariants,
    manualVariants,
    variantImages,
    defaultVariantPhotos,
    variantPriceOverrides,
    getSelectedVariantImages,
    getVariantDefaultImages,
    availableImages,
    storefrontSelections,
    selectedWebsite,
    availableWebsites,
    setLoading,
    setToastMessage,
    setBasePriceInput,
    onSaved,
  });
  
  // Sync manualImageUrls to selectedImages when they change
  useEffect(() => {
    if (mode === 'manual' && manualImageUrls.length > 0) {
      const imageObjects = manualImageUrls.map((url, idx) => ({
        url,
        isMain: idx === 0,
      }));
      setSelectedImages(imageObjects);
    }
  }, [mode, manualImageUrls]);

  // Get sourceShopifyId for showing link
  const sourceShopifyId = mode === 'shopify' 
    ? item?.shopifyId 
    : (mode === 'edit' ? existingProduct?.sourceShopifyId : null);
  
  const availableVariants = showOnlyInStock
    ? allVariants.filter((v) => (v.inventory_quantity || v.inventoryQuantity || 0) > 0)
    : allVariants;

  // Build option labels - simplified since we assume "color/style / size" format
  const normalizedOptionLabels = useMemo(() => {
    if (mode === 'shopify') {
      const options = item?.rawProduct?.options || [];
      if (options.length === 0) return [];
      // Return option names as-is, or default to "Color" and "Size" based on position
      return options.map((opt, index) => {
        if (opt.name) return opt.name;
        // Default: first option is Color/Style, second is Size
        return index === 0 ? 'Color' : index === 1 ? 'Size' : `Option ${index + 1}`;
      });
    } else {
      // For manual/edit mode, determine labels from variant properties
      const labels = [];
      if (manualVariants.some((v) => v.color)) labels.push('Color');
      if (manualVariants.some((v) => v.size)) labels.push('Size');
      if (manualVariants.some((v) => v.type)) labels.push('Type');
      return labels.length > 0 ? labels : ['Variant'];
    }
  }, [mode, item, manualVariants]);
  
  const optionLabels = normalizedOptionLabels;

  // Don't preselect storefronts - let user choose manually

  return (
    <>
      {createPortal(
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 overflow-y-auto"
          onClick={onClose}
        >
          <div
            className="relative w-full max-w-6xl rounded-3xl border border-zinc-200/70 bg-white/95 p-8 shadow-xl backdrop-blur-sm dark:border-zinc-800/80 dark:bg-zinc-900/95 my-8"
            onClick={(e) => e.stopPropagation()}
          >
            {toastMessage && (
              <Toast
                message={toastMessage}
                onDismiss={() => setToastMessage(null)}
                position="absolute"
                offsetClass="bottom-6 left-1/2 -translate-x-1/2"
              />
            )}
            {loading && (
              <div className="absolute bottom-0 left-0 right-0 z-50 flex items-center justify-center rounded-b-3xl border-t border-zinc-200/70 bg-white/95 backdrop-blur-sm py-4 shadow-lg dark:border-zinc-800/80 dark:bg-zinc-900/95">
                <div className="flex items-center gap-3">
                  <svg className="h-5 w-5 animate-spin text-emerald-600" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                  </svg>
                  <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    {mode === 'edit' ? 'Updating product...' : 'Creating product...'}
                  </span>
                </div>
              </div>
            )}
            <div className="mx-auto w-full max-w-5xl">
              <div className="mb-6 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <h2 className="text-xl font-semibold text-emerald-600 dark:text-emerald-400">
                    {mode === 'edit' ? 'Edit Product' : mode === 'manual' ? 'Create Product' : 'Process Shopify Item'}
                  </h2>
                  {sourceShopifyId && (
                    <a
                      href="/admin/overview/shopifyItems"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-emerald-600 underline hover:text-emerald-700 dark:text-emerald-400"
                    >
                      View Shopify Item
                    </a>
                  )}
                </div>
                <button
                  onClick={onClose}
                  disabled={loading}
                  className="rounded-full p-2 text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="space-y-6">
                {/* Original Title (only for Shopify mode) */}
                {mode === 'shopify' && item?.title && (
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                    Original Title
                  </label>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">{item.title}</p>
                </div>
                )}

                {/* Main Product Photos - Used in product cards and as fallback */}
                <ProductImageSelector
                  availableImages={availableImages}
                  selectedImages={selectedImages}
                  handleImageToggle={handleImageToggle}
                  handleSetMainImage={handleSetMainImage}
                  mode={mode}
                />

                {/* Manual Mode: Image Upload */}
                {mode === 'manual' && (
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-3">
                      Main Product Photos
                      <span className="ml-2 text-xs font-normal text-zinc-500">
                        - Used in product cards and product detail page
                      </span>
                    </label>
                    <ImageManager
                      images={manualImageUrls}
                      onChange={setManualImageUrls}
                      maxImages={10}
                    />
                  </div>
                )}

                {/* Manual Mode: Add Variant Form */}
                {mode === 'manual' && (
                  <ManualVariantForm
                    newVariantForm={newVariantForm}
                    setNewVariantForm={setNewVariantForm}
                    basePriceInput={basePriceInput}
                    setToastMessage={setToastMessage}
                    handleAddVariant={handleAddVariant}
                  />
                )}

                {/* Variant Selection */}
                {availableVariants.length > 0 ? (
                  <VariantSelector
                    availableVariants={availableVariants}
                    selectedVariants={selectedVariants}
                    setSelectedVariants={setSelectedVariants}
                    handleVariantToggle={handleVariantToggle}
                    defaultVariantId={defaultVariantId}
                    setDefaultVariantId={setDefaultVariantId}
                    expandedVariants={expandedVariants}
                    toggleVariantExpanded={toggleVariantExpanded}
                    mode={mode}
                    showOnlyInStock={showOnlyInStock}
                    setShowOnlyInStock={setShowOnlyInStock}
                    basePriceInput={basePriceInput}
                    variantPriceOverrides={variantPriceOverrides}
                    variantPriceErrors={variantPriceErrors}
                    setVariantPriceOverrides={setVariantPriceOverrides}
                    setVariantPriceErrors={setVariantPriceErrors}
                    defaultVariantPhotos={defaultVariantPhotos}
                    setDefaultVariantPhotos={setDefaultVariantPhotos}
                    variantImages={variantImages}
                    getVariantDefaultImages={getVariantDefaultImages}
                    getSelectedVariantImages={getSelectedVariantImages}
                    selectedImages={selectedImages}
                    availableImages={availableImages}
                    getVariantGroupKey={getVariantGroupKey}
                    getSameColorVariantIds={getSameColorVariantIds}
                    handleVariantImageToggle={handleVariantImageToggle}
                    handleRemoveVariant={handleRemoveVariant}
                    getVariantColor={getVariantColor}
                  />
                ) : (
                  <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 p-8 text-center text-zinc-500">
                    No variants available for this product
                  </div>
                )}

                {/* Category and Storefronts - Side by Side */}
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                  {/* Category Selection */}
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                      Category
                    </label>
                    <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800 shadow-sm transition focus-within:border-emerald-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:focus-within:border-emerald-500">
                      <CategorySelector 
                        value={categoryId} 
                        onChange={setCategoryId}
                        storefronts={storefrontSelections.length > 0 ? storefrontSelections : availableWebsites.length > 0 ? availableWebsites : undefined}
                      />
                    </div>
                  </div>

                  {/* Storefront Selection */}
                  <StorefrontSelector
                    availableWebsites={availableWebsites}
                    storefrontSelections={storefrontSelections}
                    setStorefrontSelections={setStorefrontSelections}
                    setToastMessage={setToastMessage}
                    websitesLoading={websitesLoading}
                  />
                </div>

                {/* Market Availability and Base Price - Side by Side */}
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                  {/* Market Information (Read-only) */}
                  {mode === 'shopify' && item && (
                    <MarketInfoDisplay item={item} />
                  )}

                  {/* Base Price */}
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                      Base Price *
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={basePriceInput}
                      onChange={(e) => setBasePriceInput(e.target.value)}
                      className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                      placeholder="e.g., 79.99"
                    />
                    <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                      All variants inherit this price unless a specific variant override is set.
                    </p>
                  </div>
                </div>

                {/* Product Form Fields (without Base Price) */}
                <ProductFormFields
                  displayName={displayName}
                  setDisplayName={setDisplayName}
                  displayDescription={displayDescription}
                  setDisplayDescription={setDisplayDescription}
                  bulletPoints={bulletPoints}
                  setBulletPoints={setBulletPoints}
                  basePriceInput={basePriceInput}
                  setBasePriceInput={setBasePriceInput}
                  mode={mode}
                  handleGenerateAI={handleGenerateAI}
                  hideBasePrice={true}
                />
              </div>
            </div>

            <div className={`mt-6 flex justify-end gap-3 ${loading ? 'pb-20' : ''}`}>
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="rounded-full border border-zinc-200/70 px-5 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-800/80 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={loading}
                className="rounded-full bg-emerald-600 px-5 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <svg
                      className="h-4 w-4 animate-spin text-white"
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
                        d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                      />
                    </svg>
                    {mode === 'edit' ? 'Updating...' : 'Creating...'}
                  </span>
                ) : (
                  mode === 'edit' ? 'Update Product' : 'Create Product'
                )}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

