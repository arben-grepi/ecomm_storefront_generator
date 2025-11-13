'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { doc, getDocs, setDoc, serverTimestamp, collection, addDoc, query, where, limit } from 'firebase/firestore';
import { getFirebaseDb } from '@/lib/firebase';
import { getStoreCollectionPath, getStoreDocPath } from '@/lib/store-collections';
import Toast from '@/components/admin/Toast';
import CategorySelector from '@/components/admin/CategorySelector';

const COLOR_OPTION_KEYWORDS = [
  'color',
  'colour',
  'colorway',
  'colourway',
  'shade',
  'tone',
  'pattern',
  'print',
  'finish',
  'style',
];

const SIZE_OPTION_KEYWORDS = [
  'size',
  'waist',
  'length',
  'band',
  'cup',
  'hip',
  'bust',
  'height',
  'width',
  'shoe',
  'dimension',
  'fit',
];

const COLOR_VALUE_KEYWORDS = [
  'black',
  'white',
  'ivory',
  'cream',
  'beige',
  'brown',
  'tan',
  'camel',
  'taupe',
  'grey',
  'gray',
  'charcoal',
  'silver',
  'gold',
  'blue',
  'navy',
  'teal',
  'turquoise',
  'cyan',
  'aqua',
  'green',
  'olive',
  'emerald',
  'mint',
  'lime',
  'yellow',
  'mustard',
  'orange',
  'coral',
  'red',
  'maroon',
  'burgundy',
  'pink',
  'rose',
  'magenta',
  'purple',
  'violet',
  'lavender',
  'lilac',
  'cream',
  'peach',
  'nude',
  'multicolor',
  'multi',
  'rainbow',
  'leopard',
  'cheetah',
  'zebra',
  'animal',
  'floral',
  'print',
  'polka',
  'plaid',
  'striped',
  'stripe',
];

const COMMON_SIZE_VALUES = [
  'one size',
  'one-size',
  'onesize',
  'petite',
  'regular',
  'tall',
  'short',
  'long',
  'xxxs',
  'xxs',
  'xs',
  's',
  'small',
  'm',
  'medium',
  'l',
  'large',
  'xl',
  'xxl',
  'xxxl',
  '2xl',
  '3xl',
  '4xl',
  '5xl',
  'plus',
  'queen',
  'king',
];

const SIZE_SORT_VALUES = [
  'xxxs',
  'xxs',
  'xs',
  's',
  'small',
  'm',
  'medium',
  'l',
  'large',
  'xl',
  'xxl',
  'xxxl',
  '2xl',
  '3xl',
  '4xl',
  '5xl',
  'plus',
  'queen',
  'king',
  'one size',
  'onesize',
  'one-size',
  'petite',
  'regular',
  'tall',
  'short',
  'long',
];

const normalizeString = (value) => {
  if (value === null || value === undefined) return '';
  return value.toString().trim().toLowerCase();
};

const getOptionName = (options, position) => {
  const option = options.find((opt) => (opt?.position || 0) === position);
  return normalizeString(option?.name || '');
};

const isLikelyColorValue = (value) => {
  const lower = normalizeString(value);
  if (!lower) return false;
  if (/\d/.test(lower)) return false;
  if (lower.includes('-')) return false;
  if (COLOR_VALUE_KEYWORDS.some((keyword) => lower.includes(keyword))) {
    return true;
  }
  if (lower.length > 2 && !COMMON_SIZE_VALUES.includes(lower)) {
    return true;
  }
  return false;
};

const isLikelySizeValue = (value) => {
  const lower = normalizeString(value);
  if (!lower) return false;
  if (COMMON_SIZE_VALUES.includes(lower)) {
    return true;
  }
  if (/\d/.test(lower)) {
    return true;
  }
  if (SIZE_OPTION_KEYWORDS.some((keyword) => lower.includes(keyword))) {
    return true;
  }
  if (/(^|\b)(xxxs|xxs|xs|s|m|l|xl|xxl|xxxl|4xl|5xl)(\b|$)/.test(lower)) {
    return true;
  }
  if (/(cm|mm|inch|in|kg|lb|lbs)/.test(lower)) {
    return true;
  }
  return false;
};

const normalizeVariantAttributes = (options, variant) => {
  if (!variant) {
    return { color: null, size: null };
  }

  const optionValues = [
    { position: 1, name: getOptionName(options, 1), value: variant.option1 },
    { position: 2, name: getOptionName(options, 2), value: variant.option2 },
    { position: 3, name: getOptionName(options, 3), value: variant.option3 },
  ].filter((opt) => opt.value);

  const findByOptionKeywords = (keywords) =>
    optionValues.find(
      (opt) =>
        opt.name &&
        keywords.some((keyword) => opt.name.includes(keyword)) &&
        opt.value
    );

  let colorEntry = findByOptionKeywords(COLOR_OPTION_KEYWORDS);
  let sizeEntry = findByOptionKeywords(SIZE_OPTION_KEYWORDS);

  if (!colorEntry || !isLikelyColorValue(colorEntry.value)) {
    colorEntry = optionValues.find((opt) => isLikelyColorValue(opt.value));
  }

  if ((!sizeEntry || sizeEntry === colorEntry || !isLikelySizeValue(sizeEntry.value)) && optionValues.length > 1) {
    sizeEntry = optionValues.find(
      (opt) => opt !== colorEntry && isLikelySizeValue(opt.value)
    );
  }

  if (colorEntry && !isLikelyColorValue(colorEntry.value)) {
    colorEntry = null;
  }

  if (!colorEntry && optionValues.length > 0) {
    const remaining = optionValues.filter((opt) => opt !== sizeEntry);
    colorEntry = remaining.find((opt) => isLikelyColorValue(opt.value)) || null;
  }

  if (!sizeEntry) {
    const fallback = optionValues.find((opt) => opt !== colorEntry);
    sizeEntry = fallback || null;
  }

  const colorValue = colorEntry && isLikelyColorValue(colorEntry.value) ? colorEntry.value : null;
  const sizeValue =
    sizeEntry && sizeEntry !== colorEntry ? sizeEntry.value : null;
  
  // If no color but there's a non-size option, treat it as type
  let typeValue = null;
  if (!colorValue && optionValues.length > 0) {
    const nonSizeOption = optionValues.find((opt) => opt !== sizeEntry && opt.value);
    if (nonSizeOption) {
      typeValue = nonSizeOption.value;
    }
  }

  return { color: colorValue || null, size: sizeValue || null, type: typeValue || null };
};

const getSizeSortRank = (sizeValue) => {
  const normalized = normalizeString(sizeValue);
  if (!normalized) {
    return { rank: 1000, label: '' };
  }

  const predefinedIndex = SIZE_SORT_VALUES.indexOf(normalized);
  if (predefinedIndex !== -1) {
    return { rank: predefinedIndex, label: normalized };
  }

  const numericMatch = normalized.match(/(\d+(\.\d+)?)/);
  if (numericMatch) {
    const numericValue = parseFloat(numericMatch[1]);
    return { rank: 200 + numericValue, label: normalized };
  }

  return { rank: 600 + normalized.charCodeAt(0), label: normalized };
};

const getVariantColorKey = (options, variant) => {
  const { color } = normalizeVariantAttributes(options, variant);
  if (color && typeof color === 'string') {
    const normalized = normalizeString(color);
    if (normalized) return normalized;
  }
  const fallback =
    variant?.title?.split(' / ')[0] ||
    variant?.option1 ||
    variant?.option2 ||
    null;
  return normalizeString(fallback);
};

const sortVariantsList = (options, variantsList = []) => {
  const list = [...variantsList];
  list.sort((a, b) => {
    const { color: colorAValue, size: sizeAValue } = normalizeVariantAttributes(options, a);
    const { color: colorBValue, size: sizeBValue } = normalizeVariantAttributes(options, b);

    const colorA = normalizeString(colorAValue);
    const colorB = normalizeString(colorBValue);

    if (colorA !== colorB) {
      return colorA.localeCompare(colorB);
    }

    const sizeInfoA = getSizeSortRank(sizeAValue);
    const sizeInfoB = getSizeSortRank(sizeBValue);

    if (sizeInfoA.rank !== sizeInfoB.rank) {
      return sizeInfoA.rank - sizeInfoB.rank;
    }

    return sizeInfoA.label.localeCompare(sizeInfoB.label);
  });

  return list;
};

const getVariantsWithSameColor = (options, variantsList, variantId) => {
  const variant = variantsList.find((v) => (v.id || v.shopifyId) === variantId);
  if (!variant) return [variantId];

  const colorKey = getVariantColorKey(options, variant);
  if (!colorKey) return [variantId];

  return variantsList
    .filter((v) => getVariantColorKey(options, v) === colorKey)
    .map((v) => v.id || v.shopifyId);
};

export default function ShopifyItemModal({ item, onClose, onSaved }) {
  const db = getFirebaseDb();
  const [loading, setLoading] = useState(false);
  // const [generating, setGenerating] = useState(false); // TODO: Re-enable when AI is implemented
  const [toastMessage, setToastMessage] = useState(null);
  
  // Form state
  const [selectedImages, setSelectedImages] = useState([]);
  const [selectedVariants, setSelectedVariants] = useState([]);
  const [displayName, setDisplayName] = useState('');
  const [displayDescription, setDisplayDescription] = useState('');
  const [bulletPoints, setBulletPoints] = useState([]);
  const [categoryId, setCategoryId] = useState('');
  const [showOnlyInStock, setShowOnlyInStock] = useState(false);
  const [expandedVariants, setExpandedVariants] = useState(new Set());
  const [variantImages, setVariantImages] = useState({}); // { variantId: string[] }
  const itemOptions = useMemo(() => item?.rawProduct?.options || [], [item]);
  const sortedVariants = useMemo(
    () => sortVariantsList(itemOptions, item?.rawProduct?.variants || item?.variants || []),
    [item, itemOptions]
  );
  const allVariants = sortedVariants;

  const getVariantAttributes = useCallback(
    (variant) => normalizeVariantAttributes(itemOptions, variant),
    [itemOptions]
  );

  const getVariantColorKeyFor = useCallback(
    (variant) => getVariantColorKey(itemOptions, variant),
    [itemOptions]
  );

  const getSameColorVariantIds = useCallback(
    (variantId, variantsList = allVariants) =>
      getVariantsWithSameColor(itemOptions, variantsList, variantId),
    [itemOptions, allVariants]
  );

  const getVariantDefaultImages = (variant) => {
    const variantId = variant.id || variant.shopifyId;
    const images = [];

    if (item?.rawProduct?.images) {
      const variantSpecificImages = item.rawProduct.images
        .filter((img) => {
          const imgVariantIds = img.variant_ids || [];
          return imgVariantIds.includes(variantId);
        })
        .map((img) => img.src)
        .filter(Boolean);

      images.push(...variantSpecificImages);
    }

    const variantImageId = variant.image_id || variant.imageId;
    if (variantImageId && item?.rawProduct?.images) {
      const variantImage = item.rawProduct.images.find((img) => img.id === variantImageId);
      if (variantImage?.src) {
        images.push(variantImage.src);
      }
    }

    return Array.from(new Set(images.filter(Boolean)));
  };

  const getAvailableImagesForVariant = (variant) => {
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
    const sameColorVariantIds = getSameColorVariantIds(variantId);

    setVariantImages((prev) => {
      const updated = { ...prev };
      const current = prev[variantId] || [];
      const exists = current.includes(imageUrl);

      if (exists) {
        // Unselecting: remove from all same-color variants
        sameColorVariantIds.forEach((id) => {
          const variantPhotos = updated[id] || [];
          updated[id] = variantPhotos.filter((url) => url !== imageUrl);
        });
        return updated;
      }

      sameColorVariantIds.forEach((id) => {
        const variantPhotos = updated[id] || [];
        if (!variantPhotos.includes(imageUrl)) {
          updated[id] = [...variantPhotos, imageUrl];
        }
      });

      return updated;
    });
  };

  const getSelectedVariantImages = (variantId) => variantImages[variantId] || [];

  useEffect(() => {
    if (!item) return;

    console.log('🔍 Shopify Item Modal - Item data:', {
      id: item.id,
      title: item.title,
      imageUrls: item.imageUrls,
      images: item.images,
      variants: item.variants,
      rawProduct: item.rawProduct ? 'exists' : 'missing',
      rawProductVariants: item.rawProduct?.variants?.length || 0,
    });

    const images = item.imageUrls || item.images || [];
    console.log('📸 Available images:', images);
    setSelectedImages([]);

    const variants = sortedVariants;
    console.log('🎨 Available variants:', variants.length, variants);
    setSelectedVariants([]);

    const initialExpanded = new Set();
    const initialVariantImages = {};

    const colorGroups = new Map();
    variants.forEach((variant) => {
      const variantId = variant.id || variant.shopifyId;
      const colorKey = getVariantColorKeyFor(variant);
      const key = colorKey || variantId;

      if (!colorGroups.has(key)) {
        colorGroups.set(key, []);
      }
      colorGroups.get(key).push(variant);
    });

    colorGroups.forEach((groupVariants) => {
      const firstVariant = groupVariants[0];
      const defaults = getVariantDefaultImages(firstVariant);
      const uniqueDefaults = Array.from(new Set(defaults));

      groupVariants.forEach((variant) => {
        const variantId = variant.id || variant.shopifyId;
        if (uniqueDefaults.length > 0) {
          initialVariantImages[variantId] = [...uniqueDefaults];
        }
      });
    });

    setExpandedVariants(initialExpanded);
    setVariantImages(initialVariantImages);

    if (item.matchedCategorySlug) {
      loadCategoryId(item.matchedCategorySlug);
    }
  }, [item, sortedVariants, getVariantColorKeyFor]);

  const loadCategoryId = async (slug) => {
    if (!db || !slug) return;
    try {
      const categoriesQuery = query(
        collection(db, ...getStoreCollectionPath('categories')),
        where('slug', '==', slug),
        limit(1)
      );
      const snapshot = await getDocs(categoriesQuery);
      if (!snapshot.empty) {
        setCategoryId(snapshot.docs[0].id);
      }
    } catch (error) {
      console.error('Failed to load category:', error);
    }
  };

  const handleImageToggle = (imageUrl) => {
    setSelectedImages((prev) => {
      const exists = prev.find((img) => img.url === imageUrl);
      if (exists) {
        // If removing main image, make first remaining image main
        const filtered = prev.filter((img) => img.url !== imageUrl);
        if (exists.isMain && filtered.length > 0) {
          filtered[0].isMain = true;
        }
        return filtered;
      } else {
        // If no images selected, make this one main
        const isMain = prev.length === 0;
        return [...prev, { url: imageUrl, isMain }];
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
    const stock = variant ? variant.inventory_quantity || variant.inventoryQuantity || 0 : 0;
    if (stock <= 0) {
      return;
    }
    setSelectedVariants((prev) => {
      const alreadySelected = prev.includes(variantId);
      if (alreadySelected) {
        // Unselecting: only remove this specific variant
        return prev.filter((id) => id !== variantId);
      }

      // Selecting: add all same-color variants (only in-stock ones)
      const sameColorVariantIds = getSameColorVariantIds(variantId);
      const inStockSameColorIds = sameColorVariantIds.filter((id) => {
        const v = allVariants.find((variant) => (variant.id || variant.shopifyId) === id);
        const variantStock = v ? v.inventory_quantity || v.inventoryQuantity || 0 : 0;
        return variantStock > 0;
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

      return newSelected;
    });
  };

  const handleGenerateAI = async () => {
    // TODO: Implement AI text generation
    // See docs/ai-text-generation.md for implementation instructions
    setToastMessage({ type: 'error', text: 'AI text generation not yet implemented. See docs/ai-text-generation.md for details.' });
  };

  const handleSave = async () => {
    if (!db || !item || !categoryId) {
      setToastMessage({ type: 'error', text: 'Please select a category.' });
      return;
    }

    if (selectedImages.length === 0) {
      setToastMessage({ type: 'error', text: 'Please select at least one image.' });
      return;
    }

    if (selectedVariants.length === 0) {
      const anyInStock = allVariants.some(
        (variant) => (variant.inventory_quantity || variant.inventoryQuantity || 0) > 0
      );
      setToastMessage({
        type: 'error',
        text: anyInStock
          ? 'Please select at least one variant.'
          : 'All variants are out of stock. Please restock in Shopify before creating this product.',
      });
      return;
    }

    if (!displayName.trim()) {
      setToastMessage({ type: 'error', text: 'Please enter a display name.' });
      return;
    }

    const slug = displayName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    setLoading(true);
    try {
      // Ensure product name/slug are unique
      const productsCollection = collection(db, ...getStoreCollectionPath('products'));
      const [existingNameSnapshot, existingSlugSnapshot] = await Promise.all([
        getDocs(query(productsCollection, where('name', '==', displayName), limit(1))),
        getDocs(query(productsCollection, where('slug', '==', slug), limit(1))),
      ]);

      if (!existingNameSnapshot.empty || !existingSlugSnapshot.empty) {
        setToastMessage({
          type: 'error',
          text: 'A product with this name already exists. Please choose a different display name.',
        });
        setLoading(false);
        return;
      }

      const mainImage = selectedImages.find((img) => img.isMain)?.url || selectedImages[0].url;
      const additionalImages = selectedImages
        .filter((img) => !img.isMain)
        .map((img) => img.url);

      const selectedVariantData = allVariants.filter((v) =>
        selectedVariants.includes(v.id || v.shopifyId)
      );

      const productData = {
        name: displayName,
        slug,
        categoryId,
        basePrice: parseFloat(selectedVariantData[0]?.price || 0),
        description: displayDescription,
        bulletPoints: bulletPoints.filter(Boolean), // Store non-empty bullet points
        images: [mainImage, ...additionalImages],
        active: true,
        sourceShopifyId: item.shopifyId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      const productRef = await addDoc(
        collection(db, ...getStoreCollectionPath('products')),
        productData
      );

      // Add variants
      for (const variant of selectedVariantData) {
        const variantId = variant.id || variant.shopifyId;
        let variantImageUrls = getSelectedVariantImages(variantId);

        if (!variantImageUrls.length) {
          variantImageUrls = getVariantDefaultImages(variant);
        }

        if (!variantImageUrls.length) {
          variantImageUrls = [mainImage, ...additionalImages];
        }

        const uniqueVariantImages = Array.from(new Set(variantImageUrls.filter(Boolean)));
        const { color: normalizedColor, size: normalizedSize, type: normalizedType } = getVariantAttributes(variant);

        await addDoc(
          collection(db, ...getStoreDocPath('products', productRef.id), 'variants'),
          {
            size: normalizedSize || null,
            color: normalizedColor || null,
            type: normalizedType || null,
            sku: variant.sku || null,
            stock: variant.inventory_quantity || variant.inventoryQuantity || 0,
            priceOverride: parseFloat(variant.price || 0) || null,
            images: uniqueVariantImages,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          }
        );
      }

      // Mark Shopify item as processed
      await setDoc(
        doc(db, 'LUNERA', 'shopify', 'items', item.id),
        { processed: true, processedAt: serverTimestamp() },
        { merge: true }
      );

      setToastMessage({ type: 'success', text: 'Product created successfully!' });
      setTimeout(() => {
        onSaved();
      }, 1500);
    } catch (error) {
      console.error('Failed to create product:', error);
      setToastMessage({ type: 'error', text: 'Failed to create product. Please try again.' });
    } finally {
      setLoading(false);
    }
  };

  if (!item) return null;

  // Get images from imageUrls (stored format) or images (fallback)
  const availableImages = item.imageUrls || item.images || [];
  
  const availableVariants = showOnlyInStock
    ? allVariants.filter((v) => (v.inventory_quantity || v.inventoryQuantity || 0) > 0)
    : allVariants;

  // Build normalized option labels - rename "Color" if values aren't actually colors
  const normalizedOptionLabels = useMemo(() => {
    const options = item.rawProduct?.options || [];
    if (options.length === 0) return [];
    
    return options.map((opt, index) => {
      const position = opt.position || index + 1;
      const values = opt.values || [];
      
      // Check if Shopify labeled it "Color" but values aren't colors
      if (opt.name && opt.name.toLowerCase().includes('color')) {
        const hasValidColor = values.some((val) => isLikelyColorValue(val));
        if (!hasValidColor) {
          // Not actually colors - use generic label instead of "Color"
          return 'Type'; // Change "Color" to "Type" when values aren't colors
        }
        return 'Color';
      }
      
      // Check if Shopify labeled it "Size" but values aren't sizes
      if (opt.name && opt.name.toLowerCase().includes('size')) {
        const hasValidSize = values.some((val) => isLikelySizeValue(val));
        if (!hasValidSize) {
          return opt.name; // Keep original
        }
        return 'Size';
      }
      
      // Check if values look like colors or sizes (even if not labeled as such)
      const hasColorValues = values.some((val) => isLikelyColorValue(val));
      const hasSizeValues = values.some((val) => isLikelySizeValue(val));
      
      if (hasColorValues && !hasSizeValues) {
        return 'Color';
      }
      if (hasSizeValues && !hasColorValues) {
        return 'Size';
      }
      
      // Default to original label
      return opt.name || `Option ${position}`;
    }).filter(Boolean);
  }, [item]);
  
  const optionLabels = normalizedOptionLabels;

  return (
    <>
      {createPortal(
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 overflow-y-auto"
          onClick={onClose}
        >
          <div
            className="relative w-full max-w-5xl rounded-3xl border border-zinc-200/70 bg-white/95 p-8 shadow-xl backdrop-blur-sm dark:border-zinc-800/80 dark:bg-zinc-900/95 my-8"
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
            <div className="mx-auto w-full max-w-4xl">
              <div className="mb-6 flex items-center justify-between">
                <h2 className="text-xl font-semibold">Process Shopify Item</h2>
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
                {/* Original Title */}
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                    Original Title
                  </label>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">{item.title}</p>
                </div>

                {/* Main Product Photos - Used in product cards and as fallback */}
                {availableImages.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-3">
                      Main Product Photos ({selectedImages.length} selected)
                      <span className="ml-2 text-xs font-normal text-zinc-500">
                        - Used in product cards and product detail page
                      </span>
                    </label>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                      {availableImages.map((imageUrl, idx) => {
                      const isSelected = selectedImages.some((img) => img.url === imageUrl);
                      const isMain = selectedImages.find((img) => img.url === imageUrl)?.isMain;
                      return (
                        <div key={idx} className="relative group">
                          <button
                            type="button"
                            onClick={() => handleImageToggle(imageUrl)}
                            className={`relative aspect-square w-full overflow-hidden rounded-lg border-2 transition ${
                              isSelected
                                ? 'border-emerald-500 ring-2 ring-emerald-200'
                                : 'border-zinc-200 dark:border-zinc-700'
                            }`}
                          >
                            <img
                              src={imageUrl}
                              alt={`Product image ${idx + 1}`}
                              className="h-full w-full object-cover"
                            />
                            {isSelected && (
                              <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                                <div className="rounded-full bg-emerald-500 p-1">
                                  <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                  </svg>
                                </div>
                              </div>
                            )}
                          </button>
                          {isMain && (
                            <div className="absolute -top-1 -right-1 rounded-full bg-emerald-500 px-2 py-0.5 text-xs font-medium text-white">
                              Main
                            </div>
                          )}
                          {isSelected && !isMain && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSetMainImage(imageUrl);
                              }}
                              className="absolute bottom-1 left-1/2 -translate-x-1/2 rounded bg-zinc-900/80 px-2 py-1 text-xs text-white opacity-0 transition group-hover:opacity-100"
                            >
                              Set Main
                            </button>
                          )}
                        </div>
                      );
                    })}
                    </div>
                  </div>
                )}

                {availableImages.length === 0 && (
                  <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 p-8 text-center text-zinc-500">
                    No images available for this product
                  </div>
                )}

                {/* Variant Selection */}
                {availableVariants.length > 0 ? (
                  <div>
                    <div className="mb-3 flex items-center justify-between">
                      <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                        Select Variants ({selectedVariants.length} selected)
                      </label>
                      <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                        <input
                          type="checkbox"
                          checked={showOnlyInStock}
                          onChange={(e) => setShowOnlyInStock(e.target.checked)}
                          className="rounded border-zinc-300"
                        />
                        Show only in-stock
                      </label>
                    </div>
                    <div className="max-h-96 overflow-y-auto overflow-x-hidden space-y-3 rounded-lg border border-zinc-200 dark:border-zinc-700 p-3">
                      {availableVariants.map((variant, index) => {
                        const variantId = variant.id || variant.shopifyId;
                        const isSelected = selectedVariants.includes(variantId);
                        const stock = variant.inventory_quantity || variant.inventoryQuantity || 0;
                        const isOutOfStock = stock <= 0;
                        const selectedVariantImages = getSelectedVariantImages(variantId);
                        const previewImage =
                          selectedVariantImages[0] ||
                          getVariantDefaultImages(variant)[0] ||
                          selectedImages.find((img) => img.isMain)?.url ||
                          selectedImages[0]?.url ||
                          availableImages[0];
                        const isExpanded = expandedVariants.has(variantId);
                        const availableVariantImages = getAvailableImagesForVariant(variant);
                        const { color: currentColor } = getVariantAttributes(variant);
                        const previousVariant = index > 0 ? availableVariants[index - 1] : null;
                        const previousColor = previousVariant ? getVariantAttributes(previousVariant).color : null;
                        const isNewColorGroup =
                          index > 0 && normalizeString(currentColor) !== normalizeString(previousColor);

                        return (
                          <div
                            key={variantId}
                            className={`rounded-xl border ${
                              isSelected
                                ? 'border-emerald-500 bg-emerald-50/60 dark:bg-emerald-900/15'
                                : 'border-zinc-200 dark:border-zinc-700'
                            } ${isNewColorGroup ? 'mt-2' : ''}`}
                          >
                            <div className="flex w-full items-start gap-4 px-3 py-3">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                disabled={isOutOfStock}
                                onChange={() => handleVariantToggle(variantId)}
                                className="mt-1 rounded border-zinc-300 disabled:cursor-not-allowed"
                              />
                              <div className="flex flex-1 flex-wrap items-start gap-4 text-sm text-zinc-800 dark:text-zinc-100">
                                {optionLabels.length > 0 ? (
                                  optionLabels.map((label, index) => {
                                    const value = variant[`option${index + 1}`] || '-';
                                    return (
                                      <div key={`${variantId}-${label}`} className="min-w-[140px]">
                                        <p className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                                          {label}
                                        </p>
                                        <p className="font-medium">{value}</p>
                                      </div>
                                    );
                                  })
                                ) : (
                                  <div className="min-w-[140px]">
                                    <p className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                                      Variant
                                    </p>
                                    <p className="font-medium">{variant.title || 'Default'}</p>
                                  </div>
                                )}
                                <div className="min-w-[110px]">
                                  <p className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                                    Price
                                  </p>
                                  <p className="font-medium">${Number(variant.price || 0).toFixed(2)}</p>
                                </div>
                                <div className="min-w-[110px]">
                                  <p className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                                    Stock
                                  </p>
                                  <p className={`font-medium ${isOutOfStock ? 'text-red-500 dark:text-red-400' : ''}`}>
                                    {stock}
                                  </p>
                                </div>
                                <div className="min-w-[160px]">
                                  <p className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                                    SKU
                                  </p>
                                  <p className="font-medium break-words">{variant.sku || '-'}</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-3">
                                {previewImage && (
                                  <img
                                    src={previewImage}
                                    alt="Variant preview"
                                    className="h-12 w-12 rounded-lg border border-zinc-200 object-cover dark:border-zinc-700"
                                  />
                                )}
                                <button
                                  type="button"
                                  onClick={() => toggleVariantExpanded(variantId)}
                                  className="rounded-full p-2 text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                                >
                                  <svg
                                    className={`h-5 w-5 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                  >
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                  </svg>
                                </button>
                              </div>
                            </div>

                             {isExpanded && (() => {
                               const variantInstance = availableVariants.find((v) => (v.id || v.shopifyId) === variantId);
                               const sameColorVariants = getSameColorVariantIds(variantId);
                               const { color: colorLabel } = getVariantAttributes(variantInstance);
                               const displayColor = colorLabel || variantInstance?.title?.split(' / ')[0] || 'this color';

                               return (
                                 <div className="border-t border-zinc-200 bg-white/70 px-3 py-3 dark:border-zinc-700 dark:bg-zinc-900/50">
                                   <div className="mb-2 flex items-center justify-between">
                                     <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                                       Variant Photos ({selectedVariantImages.length} selected)
                                     </p>
                                     {sameColorVariants.length > 1 && (
                                       <p className="text-xs text-zinc-500 dark:text-zinc-400">
                                         Applies to all {displayColor} sizes
                                       </p>
                                     )}
                                   </div>
                                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 md:grid-cols-5">
                                  {availableVariantImages.map((imageUrl, idx) => {
                                    const isSelectedImage = selectedVariantImages.includes(imageUrl);
                                    return (
                                      <button
                                        key={`${variantId}-image-${idx}`}
                                        type="button"
                                        onClick={() => handleVariantImageToggle(variantId, imageUrl)}
                                        className={`group relative aspect-square w-full overflow-hidden rounded-lg border-2 transition ${
                                          isSelectedImage
                                            ? 'border-emerald-500 ring-2 ring-emerald-200'
                                            : 'border-zinc-200 dark:border-zinc-700'
                                        }`}
                                      >
                                        <img
                                          src={imageUrl}
                                          alt={`Variant ${idx + 1}`}
                                          className="h-full w-full object-cover"
                                        />
                                        {isSelectedImage && (
                                          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                                            <div className="rounded-full bg-emerald-500 p-1">
                                              <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                              </svg>
                                            </div>
                                          </div>
                                        )}
                                      </button>
                                    );
                                  })}
                                </div>
                                {selectedVariantImages.length === 0 && (
                                  <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                                    No images selected for this variant. The product main images will be used if you leave this empty.
                                  </p>
                                )}
                              </div>
                              );
                            })()}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 p-8 text-center text-zinc-500">
                    No variants available for this product
                  </div>
                )}

                {/* Category Selection */}
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                    Category
                  </label>
                  <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800 shadow-sm transition focus-within:border-emerald-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:focus-within:border-emerald-500">
                    <CategorySelector value={categoryId} onChange={setCategoryId} />
                  </div>
                </div>

                {/* AI Generated Text */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                      Display Name
                    </label>
                    <button
                      type="button"
                      onClick={handleGenerateAI}
                      disabled={true}
                      className="rounded-full bg-emerald-600 px-4 py-1.5 text-xs font-medium text-white transition hover:bg-emerald-700 disabled:opacity-50 cursor-not-allowed"
                      title="AI text generation coming soon - see docs/ai-text-generation.md"
                    >
                      Generate with AI (Coming Soon)
                    </button>
                  </div>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                    placeholder="Enter product display name"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                    Display Description
                  </label>
                  <textarea
                    value={displayDescription}
                    onChange={(e) => setDisplayDescription(e.target.value)}
                    rows={4}
                    className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                    placeholder="Enter product description"
                  />
                </div>

                {/* Bullet Points */}
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                    Key Features (Bullet Points)
                  </label>
                  <div className="space-y-2 pb-6">
                    {bulletPoints.map((point, idx) => (
                      <div key={idx} className="flex items-start gap-2">
                        <span className="mt-1 text-emerald-600">•</span>
                        <input
                          type="text"
                          value={point}
                          onChange={(e) => {
                            const newPoints = [...bulletPoints];
                            newPoints[idx] = e.target.value;
                            setBulletPoints(newPoints);
                          }}
                          className="flex-1 rounded-lg border border-zinc-200 px-3 py-1.5 text-sm focus:border-emerald-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                          placeholder="Enter feature point"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            setBulletPoints(bulletPoints.filter((_, i) => i !== idx));
                          }}
                          className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => setBulletPoints([...bulletPoints, ''])}
                      className="mt-2 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs text-zinc-600 transition hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
                    >
                      + Add Bullet Point
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
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
                    Creating...
                  </span>
                ) : (
                  'Create Product'
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

