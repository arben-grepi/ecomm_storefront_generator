'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { doc, getDoc, getDocs, setDoc, serverTimestamp, collection, addDoc, updateDoc, query, where, limit, deleteDoc } from 'firebase/firestore';
import { getFirebaseDb } from '@/lib/firebase';
import { getStoreCollectionPath, getStoreDocPath } from '@/lib/store-collections';
import { useWebsite } from '@/lib/website-context';
import Toast from '@/components/admin/Toast';
import CategorySelector from '@/components/admin/CategorySelector';
import ImageManager from '@/components/admin/ImageManager';

// Simple size pattern matching (common clothing sizes)
const SIZE_PATTERN = /^(xxxs|xxs|xs|s|small|m|medium|l|large|xl|xxl|xxxl|2xl|3xl|4xl|5xl|one[\s-]?size|onesize|petite|regular|tall|short|long|plus|queen|king)$/i;

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
  // If it has digits or dashes, it's likely not a color (e.g., "L-80ABC", "1PC-style8")
  if (/\d/.test(lower) || lower.includes('-')) return false;
  // If it matches a size pattern, it's not a color
  if (SIZE_PATTERN.test(lower)) return false;
  // If it's a simple word (no special chars except spaces), it might be a color
  if (/^[a-z\s]+$/.test(lower) && lower.length > 2) return true;
  return false;
};

const isLikelySizeValue = (value) => {
  const lower = normalizeString(value);
  if (!lower) return false;
  // Check if it matches common size patterns
  if (SIZE_PATTERN.test(lower)) return true;
  // If it contains digits, it's likely a size (e.g., "32", "10.5")
  if (/\d/.test(lower)) return true;
  // If it contains measurement units, it's likely a size
  if (/(cm|mm|inch|in|kg|lb|lbs)/.test(lower)) return true;
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

  // Simple option detection: check if option name contains "color" or "size"
  let colorEntry = optionValues.find(
    (opt) => opt.name && /color|colour/i.test(opt.name) && opt.value
  );
  let sizeEntry = optionValues.find(
    (opt) => opt.name && /size/i.test(opt.name) && opt.value
  );

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

  // Predefined order for common sizes
  const sizeOrder = ['xxxs', 'xxs', 'xs', 's', 'small', 'm', 'medium', 'l', 'large', 'xl', 'xxl', 'xxxl', '2xl', '3xl', '4xl', '5xl', 'one size', 'onesize', 'one-size', 'petite', 'regular', 'tall', 'short', 'long', 'plus', 'queen', 'king'];
  const predefinedIndex = sizeOrder.indexOf(normalized);
  if (predefinedIndex !== -1) {
    return { rank: predefinedIndex, label: normalized };
  }

  // Extract numeric value if present
  const numericMatch = normalized.match(/(\d+(\.\d+)?)/);
  if (numericMatch) {
    const numericValue = parseFloat(numericMatch[1]);
    return { rank: 200 + numericValue, label: normalized };
  }

  // Alphabetic fallback
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

// Get color/type key for manual variants (for grouping photos)
const getManualVariantGroupKey = (variant) => {
  if (variant.color) {
    return `color:${normalizeString(variant.color)}`;
  }
  if (variant.type) {
    return `type:${normalizeString(variant.type)}`;
  }
  return 'default';
};

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
  const db = getFirebaseDb();
  const { selectedWebsite } = useWebsite();
  const [loading, setLoading] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);
  const [initialLoading, setInitialLoading] = useState(mode === 'edit');
  
  // Form state
  const [selectedImages, setSelectedImages] = useState([]);
  const [selectedVariants, setSelectedVariants] = useState([]);
  const [displayName, setDisplayName] = useState('');
  const [displayDescription, setDisplayDescription] = useState('');
  const [bulletPoints, setBulletPoints] = useState([]);
  const [basePriceInput, setBasePriceInput] = useState('');
  const [categoryId, setCategoryId] = useState(initialCategoryId || '');
  const [showOnlyInStock, setShowOnlyInStock] = useState(false);
  const [expandedVariants, setExpandedVariants] = useState(new Set());
  const [variantImages, setVariantImages] = useState({}); // { colorOrTypeKey: string[] } - photos grouped by color/type
  const [productId, setProductId] = useState(null); // For edit mode
  
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
      return sortVariantsList(itemOptions, item?.rawProduct?.variants || item?.variants || []);
    }
    // For manual/edit mode, sort by color then size
    return sortVariantsList([], manualVariants);
  }, [mode, item, itemOptions, manualVariants]);
  
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
    (variantId, variantsList = allVariants) => {
      if (mode === 'shopify') {
        return getVariantsWithSameColor(itemOptions, variantsList, variantId);
      } else {
        // For manual/edit mode, group by color/type
        const variant = variantsList.find((v) => (v.id || v.shopifyId) === variantId);
        if (!variant) return [variantId];
        const groupKey = getManualVariantGroupKey(variant);
        return variantsList
          .filter((v) => getManualVariantGroupKey(v) === groupKey)
          .map((v) => v.id || v.shopifyId);
      }
    },
    [mode, itemOptions, allVariants]
  );
  
  // Get group key for a variant (for photo grouping)
  const getVariantGroupKey = useCallback(
    (variant) => {
      if (mode === 'shopify') {
        return getVariantColorKey(itemOptions, variant);
      } else {
        return getManualVariantGroupKey(variant);
      }
    },
    [mode, itemOptions]
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
    
    const groupKey = getVariantGroupKey(variant);
    const sameGroupVariantIds = getSameColorVariantIds(variantId);

    setVariantImages((prev) => {
      const updated = { ...prev };
      const current = prev[groupKey] || [];
      const exists = current.includes(imageUrl);

      if (exists) {
        // Unselecting: remove from group
        updated[groupKey] = current.filter((url) => url !== imageUrl);
        // Also remove from all variants in this group (for backward compatibility)
        sameGroupVariantIds.forEach((id) => {
          updated[id] = (updated[id] || []).filter((url) => url !== imageUrl);
        });
        return updated;
      }

      // Selecting: add to group
      if (!updated[groupKey]) {
        updated[groupKey] = [];
      }
      if (!updated[groupKey].includes(imageUrl)) {
        updated[groupKey] = [...updated[groupKey], imageUrl];
      }
      // Also add to all variants in this group (for backward compatibility)
      sameGroupVariantIds.forEach((id) => {
        if (!updated[id]) {
          updated[id] = [];
        }
        if (!updated[id].includes(imageUrl)) {
          updated[id] = [...updated[id], imageUrl];
        }
      });

      return updated;
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
    const newVariant = {
      id: `temp-${Date.now()}-${Math.random()}`,
      shopifyId: `temp-${Date.now()}-${Math.random()}`,
      color: newVariantForm.hasColor ? newVariantForm.color.trim() : null,
      type: !newVariantForm.hasColor ? newVariantForm.type.trim() : null,
      size: newVariantForm.size.trim(), // Store as string
      stock: parseInt(newVariantForm.stock, 10) || 0,
      priceOverride: newVariantForm.priceOverride ? parseFloat(newVariantForm.priceOverride) : null,
      sku: newVariantForm.sku.trim() || null,
      price: newVariantForm.priceOverride
        ? parseFloat(newVariantForm.priceOverride)
        : parsedBasePrice,
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
  useEffect(() => {
    if (mode !== 'edit' || !existingProduct || !db) return;

    const loadExistingProduct = async () => {
      try {
        setInitialLoading(true);
        const productId = existingProduct.id;
        setProductId(productId);

        // Load product document
        const productDoc = await getDoc(doc(db, ...getStoreDocPath('products', productId, selectedWebsite)));
        if (!productDoc.exists()) {
          setToastMessage({ type: 'error', text: 'Product not found.' });
          setInitialLoading(false);
          return;
        }

        const productData = productDoc.data();

        // Load variants
        const variantsSnapshot = await getDocs(
          collection(db, ...getStoreDocPath('products', productId, selectedWebsite), 'variants')
        );
        const variantsData = variantsSnapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));

        // Convert existing variants to format compatible with modal
        const convertedVariants = variantsData.map((v) => ({
          id: v.id,
          shopifyId: v.id, // Use id as shopifyId for compatibility
          option1: v.color || v.type || '',
          option2: v.size || '',
          price: v.priceOverride || productData.basePrice || 0,
          inventory_quantity: v.stock || 0,
          inventoryQuantity: v.stock || 0,
          sku: v.sku || '',
          color: v.color,
          size: v.size,
          type: v.type,
          stock: v.stock || 0,
          images: v.images || [],
        }));

        setManualVariants(convertedVariants);
        setSelectedVariants(convertedVariants.map((v) => v.id));

        // Set form fields
        setDisplayName(productData.name || '');
        setDisplayDescription(productData.description || '');
        setBulletPoints(productData.bulletPoints || []);
        setCategoryId(productData.categoryId || '');
        setBasePriceInput(
          productData.basePrice !== undefined && productData.basePrice !== null
            ? productData.basePrice.toString()
            : ''
        );

        // Set images
        const productImages = productData.images || [];
        if (productImages.length > 0) {
          const imageObjects = productImages.map((url, idx) => ({
            url,
            isMain: idx === 0,
          }));
          setSelectedImages(imageObjects);
        }

        // Set variant images
        const variantImagesMap = {};
        convertedVariants.forEach((variant) => {
          if (variant.images && variant.images.length > 0) {
            variantImagesMap[variant.id] = variant.images;
          }
        });
        setVariantImages(variantImagesMap);

        setInitialLoading(false);
      } catch (error) {
        console.error('Failed to load product:', error);
        setToastMessage({ type: 'error', text: 'Failed to load product data.' });
        setInitialLoading(false);
      }
    };

    loadExistingProduct();
  }, [mode, existingProduct, db, selectedWebsite]);

  // Initialize Shopify item data
  useEffect(() => {
    if (mode !== 'shopify' || !item) return;

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

    // Pre-fill base price for Shopify items if available
    if (mode === 'shopify' && !basePriceInput && item?.rawProduct?.variants?.length) {
      const firstVariantPrice = item.rawProduct.variants[0]?.price;
      if (firstVariantPrice) {
        setBasePriceInput(firstVariantPrice.toString());
      }
    }

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
  }, [item, sortedVariants, getVariantColorKeyFor, mode, basePriceInput]);

  const loadCategoryId = async (slug) => {
    if (!db || !slug) return;
    try {
      const categoriesQuery = query(
        collection(db, ...getStoreCollectionPath('categories', selectedWebsite)),
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

      return newSelected;
    });
  };

  const handleGenerateAI = async () => {
    // TODO: Implement AI text generation
    // See docs/ai-text-generation.md for implementation instructions
    setToastMessage({ type: 'error', text: 'AI text generation not yet implemented. See docs/ai-text-generation.md for details.' });
  };

  const handleSave = async () => {
    if (!db || !categoryId) {
      setToastMessage({ type: 'error', text: 'Please select a category.' });
      return;
    }

    // For Shopify mode, require item
    if (mode === 'shopify' && !item) {
      setToastMessage({ type: 'error', text: 'Shopify item data is missing.' });
      return;
    }

    if (selectedImages.length === 0) {
      setToastMessage({ type: 'error', text: 'Please select at least one image.' });
      return;
    }

    // For Shopify mode, require variants
    if (mode === 'shopify' && selectedVariants.length === 0) {
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

    // For manual/edit mode, allow no variants (product without variants)
    if ((mode === 'manual' || mode === 'edit') && selectedVariants.length === 0 && manualVariants.length === 0) {
      // Allow products without variants
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
      const productsCollection = collection(db, ...getStoreCollectionPath('products', selectedWebsite));
      
      // For edit mode, skip uniqueness check (same product)
      // For create modes, check uniqueness
      if (mode !== 'edit') {
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
      } else {
        // For edit mode, check if name/slug conflicts with OTHER products
        const [existingNameSnapshot, existingSlugSnapshot] = await Promise.all([
          getDocs(query(productsCollection, where('name', '==', displayName), limit(2))),
          getDocs(query(productsCollection, where('slug', '==', slug), limit(2))),
        ]);

        const nameConflict = existingNameSnapshot.docs.some((doc) => doc.id !== productId);
        const slugConflict = existingSlugSnapshot.docs.some((doc) => doc.id !== productId);

        if (nameConflict || slugConflict) {
          setToastMessage({
            type: 'error',
            text: 'A product with this name already exists. Please choose a different display name.',
          });
          setLoading(false);
          return;
        }
      }

      const mainImage = selectedImages.find((img) => img.isMain)?.url || selectedImages[0].url;
      const additionalImages = selectedImages
        .filter((img) => !img.isMain)
        .map((img) => img.url);

      // Get selected variant data
      const selectedVariantData = mode === 'shopify'
        ? allVariants.filter((v) => selectedVariants.includes(v.id || v.shopifyId))
        : manualVariants.filter((v) => selectedVariants.includes(v.id || v.shopifyId));

      let parsedBasePrice = null;
      if (basePriceInput.trim()) {
        const parsed = parseFloat(basePriceInput);
        if (Number.isNaN(parsed) || parsed <= 0) {
          setToastMessage({ type: 'error', text: 'Please enter a valid base price greater than 0.' });
          setLoading(false);
          return;
        }
        parsedBasePrice = parsed;
      }

      if (!parsedBasePrice) {
        if (mode === 'manual' || mode === 'edit') {
          setToastMessage({ type: 'error', text: 'Please enter a base price for this product.' });
          setLoading(false);
          return;
        }

        const fallbackPrice = selectedVariantData.length > 0
          ? parseFloat(selectedVariantData[0]?.price || selectedVariantData[0]?.priceOverride || 0)
          : (existingProduct?.basePrice || 0);

        if (!fallbackPrice || Number.isNaN(fallbackPrice) || fallbackPrice <= 0) {
          setToastMessage({ type: 'error', text: 'Please enter a base price for this product.' });
          setLoading(false);
          return;
        }

        parsedBasePrice = fallbackPrice;
        setBasePriceInput(fallbackPrice.toString());
      }

      // Determine sourceType and sourceShopifyId
      const sourceType = mode === 'shopify' ? 'shopify' : 'manual';
      const sourceShopifyId = mode === 'shopify' ? item.shopifyId : (mode === 'edit' ? existingProduct?.sourceShopifyId : null);

      const productData = {
        name: displayName,
        slug,
        categoryId,
        basePrice: parsedBasePrice,
        description: displayDescription,
        bulletPoints: bulletPoints.filter(Boolean),
        images: [mainImage, ...additionalImages],
        active: true,
        sourceType,
        ...(sourceShopifyId ? { sourceShopifyId } : {}),
        updatedAt: serverTimestamp(),
        ...(mode !== 'edit' ? { createdAt: serverTimestamp() } : {}),
      };

      let productRef;
      if (mode === 'edit') {
        // Update existing product
        await updateDoc(doc(db, ...getStoreDocPath('products', productId, selectedWebsite)), productData);
        productRef = { id: productId };

        // Delete existing variants that are not selected
        const existingVariantsSnapshot = await getDocs(
          collection(db, ...getStoreDocPath('products', productId, selectedWebsite), 'variants')
        );
        const existingVariantIds = existingVariantsSnapshot.docs.map((doc) => doc.id);
        const variantsToDelete = existingVariantIds.filter((id) => !selectedVariants.includes(id));

        for (const variantId of variantsToDelete) {
          await deleteDoc(doc(db, ...getStoreDocPath('products', productId, selectedWebsite), 'variants', variantId));
        }
      } else {
        // Create new product
        productRef = await addDoc(productsCollection, productData);
      }

      // Add/update variants
      for (const variant of selectedVariantData) {
        const variantId = variant.id || variant.shopifyId;
        const groupKey = getVariantGroupKey(variant);
        
        // Get images for this color/type group
        let variantImageUrls = variantImages[groupKey] || getSelectedVariantImages(variantId);

        if (mode === 'shopify') {
          if (!variantImageUrls.length) {
            variantImageUrls = getVariantDefaultImages(variant);
          }
          if (!variantImageUrls.length) {
            variantImageUrls = [mainImage, ...additionalImages];
          }
        } else {
          // For manual/edit mode, use group images or fallback to main images
          if (!variantImageUrls.length) {
            variantImageUrls = variant.images || [mainImage, ...additionalImages];
          }
        }

        const uniqueVariantImages = Array.from(new Set(variantImageUrls.filter(Boolean)));
        
        // Get variant attributes - for manual/edit mode, use direct properties
        const { color: normalizedColor, size: normalizedSize, type: normalizedType } = mode === 'shopify'
          ? getVariantAttributes(variant)
          : {
              color: variant.color || null,
              size: variant.size || null, // Size is stored as string (including "one size")
              type: variant.type || null,
            };

        const variantData = {
          size: normalizedSize || null, // Store as string
          color: normalizedColor || null,
          type: normalizedType || null,
          sku: variant.sku || null,
          stock: variant.inventory_quantity || variant.inventoryQuantity || variant.stock || 0,
          priceOverride: parseFloat(variant.price || variant.priceOverride || 0) || null,
          images: uniqueVariantImages,
          updatedAt: serverTimestamp(),
          ...(mode !== 'edit' || !variant.id ? { createdAt: serverTimestamp() } : {}),
        };

        if (mode === 'edit' && variant.id) {
          // Update existing variant
          await updateDoc(
            doc(db, ...getStoreDocPath('products', productId, selectedWebsite), 'variants', variant.id),
            variantData
          );
        } else {
          // Create new variant
          await addDoc(
            collection(db, ...getStoreDocPath('products', productRef.id, selectedWebsite), 'variants'),
            variantData
          );
        }
      }

      // Mark Shopify item as processed (only for shopify mode)
      if (mode === 'shopify' && item?.id) {
        await setDoc(
          doc(db, selectedWebsite, 'shopify', 'items', item.id),
          { processed: true, processedAt: serverTimestamp() },
          { merge: true }
        );
      }

      setToastMessage({ 
        type: 'success', 
        text: mode === 'edit' ? 'Product updated successfully!' : 'Product created successfully!' 
      });
      setTimeout(() => {
        onSaved();
      }, 1500);
    } catch (error) {
      console.error(`Failed to ${mode === 'edit' ? 'update' : 'create'} product:`, error);
      setToastMessage({ 
        type: 'error', 
        text: `Failed to ${mode === 'edit' ? 'update' : 'create'} product. Please try again.` 
      });
    } finally {
      setLoading(false);
    }
  };

  // Determine available images based on mode
  const availableImages = useMemo(() => {
    if (mode === 'shopify') {
      return item?.imageUrls || item?.images || [];
    } else if (mode === 'edit') {
      return existingProduct?.images || [];
    } else {
      // Manual mode - use manualImageUrls
      return manualImageUrls;
    }
  }, [mode, item, existingProduct, manualImageUrls]);
  
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

  // Don't render if required data is missing
  if (mode === 'shopify' && !item) return null;
  if (mode === 'edit' && !existingProduct) return null;
  if (initialLoading) {
    return createPortal(
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div className="rounded-lg bg-white p-6 dark:bg-zinc-900">
          <div className="flex items-center gap-3">
            <svg className="h-5 w-5 animate-spin text-emerald-600" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
            <span className="text-sm text-zinc-700 dark:text-zinc-300">Loading product...</span>
          </div>
        </div>
      </div>,
      document.body
    );
  }
  
  const availableVariants = showOnlyInStock
    ? allVariants.filter((v) => (v.inventory_quantity || v.inventoryQuantity || 0) > 0)
    : allVariants;

  // Build normalized option labels - rename "Color" if values aren't actually colors
  const normalizedOptionLabels = useMemo(() => {
    if (mode === 'shopify') {
      const options = item?.rawProduct?.options || [];
      if (options.length === 0) return [];
      
      return options.map((opt, index) => {
        const position = opt.position || index + 1;
        const values = opt.values || [];
        
        // Check if Shopify labeled it "Color" but values aren't colors
        if (opt.name && opt.name.toLowerCase().includes('color')) {
          const hasValidColor = values.some((val) => isLikelyColorValue(val));
          if (!hasValidColor) {
            return 'Type';
          }
          return 'Color';
        }
        
        // Check if Shopify labeled it "Size" but values aren't sizes
        if (opt.name && opt.name.toLowerCase().includes('size')) {
          const hasValidSize = values.some((val) => isLikelySizeValue(val));
          if (!hasValidSize) {
            return opt.name;
          }
          return 'Size';
        }
        
        // Check if values look like colors or sizes
        const hasColorValues = values.some((val) => isLikelyColorValue(val));
        const hasSizeValues = values.some((val) => isLikelySizeValue(val));
        
        if (hasColorValues && !hasSizeValues) {
          return 'Color';
        }
        if (hasSizeValues && !hasColorValues) {
          return 'Size';
        }
        
        return opt.name || `Option ${position}`;
      }).filter(Boolean);
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
                <div className="flex items-center gap-3">
                  <h2 className="text-xl font-semibold text-emerald-600 dark:text-emerald-400">
                    {mode === 'edit' ? 'Edit Product' : mode === 'manual' ? 'Create Product' : 'Process Shopify Item'}
                  </h2>
                  {sourceShopifyId && (
                    <a
                      href={`/${selectedWebsite}/admin/overview/shopifyItems`}
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

                {mode !== 'manual' && availableImages.length === 0 && (
                  <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 p-8 text-center text-zinc-500">
                    No images available for this product
                  </div>
                )}

                {/* Manual Mode: Add Variant Form */}
                {mode === 'manual' && (
                  <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 p-4 space-y-4">
                    <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Add Variant</h3>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="flex items-center gap-2">
                        <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                          <input
                            type="radio"
                            checked={newVariantForm.hasColor}
                            onChange={() => setNewVariantForm((prev) => ({ ...prev, hasColor: true, type: '' }))}
                            className="rounded border-zinc-300"
                          />
                          Color
                        </label>
                        <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                          <input
                            type="radio"
                            checked={!newVariantForm.hasColor}
                            onChange={() => setNewVariantForm((prev) => ({ ...prev, hasColor: false, color: '' }))}
                            className="rounded border-zinc-300"
                          />
                          Type
                        </label>
                      </div>
                      {newVariantForm.hasColor ? (
                        <label className="flex flex-col gap-1">
                          <span className="text-xs text-zinc-600 dark:text-zinc-400">Color *</span>
                          <input
                            type="text"
                            value={newVariantForm.color}
                            onChange={(e) => setNewVariantForm((prev) => ({ ...prev, color: e.target.value }))}
                            className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm focus:border-emerald-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                            placeholder="e.g., Red, Black"
                          />
                        </label>
                      ) : (
                        <label className="flex flex-col gap-1">
                          <span className="text-xs text-zinc-600 dark:text-zinc-400">Type *</span>
                          <input
                            type="text"
                            value={newVariantForm.type}
                            onChange={(e) => setNewVariantForm((prev) => ({ ...prev, type: e.target.value }))}
                            className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm focus:border-emerald-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                            placeholder="e.g., Style A, Model 1"
                          />
                        </label>
                      )}
                      <label className="flex flex-col gap-1">
                        <span className="text-xs text-zinc-600 dark:text-zinc-400">Size *</span>
                        <input
                          type="text"
                          value={newVariantForm.size}
                          onChange={(e) => setNewVariantForm((prev) => ({ ...prev, size: e.target.value }))}
                          className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm focus:border-emerald-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                          placeholder="e.g., S, M, L, One Size"
                        />
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="text-xs text-zinc-600 dark:text-zinc-400">Stock</span>
                        <input
                          type="number"
                          min="0"
                          value={newVariantForm.stock}
                          onChange={(e) => setNewVariantForm((prev) => ({ ...prev, stock: e.target.value }))}
                          className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm focus:border-emerald-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                          placeholder="0"
                        />
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="text-xs text-zinc-600 dark:text-zinc-400">Price Override</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={newVariantForm.priceOverride}
                          onChange={(e) => setNewVariantForm((prev) => ({ ...prev, priceOverride: e.target.value }))}
                          className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm focus:border-emerald-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                          placeholder="Optional"
                        />
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="text-xs text-zinc-600 dark:text-zinc-400">SKU</span>
                        <input
                          type="text"
                          value={newVariantForm.sku}
                          onChange={(e) => setNewVariantForm((prev) => ({ ...prev, sku: e.target.value }))}
                          className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm focus:border-emerald-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                          placeholder="Optional"
                        />
                      </label>
                    </div>
                    <button
                      type="button"
                      onClick={handleAddVariant}
                      className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700"
                    >
                      + Add Variant
                    </button>
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
                        const stock = mode === 'shopify'
                          ? (variant.inventory_quantity || variant.inventoryQuantity || 0)
                          : (variant.stock || 0);
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
                        // Determine if this is a new color/type group
                        const currentGroupKey = getVariantGroupKey(variant);
                        const previousVariant = index > 0 ? availableVariants[index - 1] : null;
                        const previousGroupKey = previousVariant ? getVariantGroupKey(previousVariant) : null;
                        const isNewColorGroup = index > 0 && currentGroupKey !== previousGroupKey;

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
                                {mode === 'shopify' ? (
                                  optionLabels.length > 0 ? (
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
                                  )
                                ) : (
                                  // Manual/edit mode: display color, size, type directly
                                  <>
                                    {variant.color && (
                                      <div className="min-w-[140px]">
                                        <p className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                                          Color
                                        </p>
                                        <p className="font-medium">{variant.color}</p>
                                      </div>
                                    )}
                                    {variant.size && (
                                      <div className="min-w-[140px]">
                                        <p className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                                          Size
                                        </p>
                                        <p className="font-medium">{variant.size}</p>
                                      </div>
                                    )}
                                    {variant.type && (
                                      <div className="min-w-[140px]">
                                        <p className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                                          Type
                                        </p>
                                        <p className="font-medium">{variant.type}</p>
                                      </div>
                                    )}
                                    {!variant.color && !variant.size && !variant.type && (
                                      <div className="min-w-[140px]">
                                        <p className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                                          Variant
                                        </p>
                                        <p className="font-medium">Default</p>
                                      </div>
                                    )}
                                  </>
                                )}
                                <div className="min-w-[110px]">
                                  <p className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                                    Price
                                  </p>
                                  <p className="font-medium">
                                    ${Number(variant.price || variant.priceOverride || 0).toFixed(2)}
                                  </p>
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
                                <div className="flex items-center gap-2">
                                  {mode === 'manual' && (
                                    <button
                                      type="button"
                                      onClick={() => handleRemoveVariant(variantId)}
                                      className="rounded-full p-2 text-red-500 transition hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-900/20"
                                      title="Remove variant"
                                    >
                                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                      </svg>
                                    </button>
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
                            </div>

                             {isExpanded && (() => {
                               const variantInstance = availableVariants.find((v) => (v.id || v.shopifyId) === variantId);
                               const sameGroupVariants = getSameColorVariantIds(variantId);
                               const groupKey = getVariantGroupKey(variantInstance);
                               let displayGroup = 'this variant';
                               if (mode === 'shopify') {
                                 const { color: colorLabel } = getVariantAttributes(variantInstance);
                                 displayGroup = colorLabel || variantInstance?.title?.split(' / ')[0] || 'this color';
                               } else {
                                 if (variantInstance?.color) {
                                   displayGroup = variantInstance.color;
                                 } else if (variantInstance?.type) {
                                   displayGroup = variantInstance.type;
                                 }
                               }

                               return (
                                 <div className="border-t border-zinc-200 bg-white/70 px-3 py-3 dark:border-zinc-700 dark:bg-zinc-900/50">
                                   <div className="mb-2 flex items-center justify-between">
                                     <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                                       Variant Photos ({selectedVariantImages.length} selected)
                                     </p>
                                     {sameGroupVariants.length > 1 && (
                                       <p className="text-xs text-zinc-500 dark:text-zinc-400">
                                         Applies to all {displayGroup} sizes
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

                {/* AI Generated Text */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                      Display Name
                    </label>
                    {mode !== 'manual' && (
                      <button
                        type="button"
                        onClick={handleGenerateAI}
                        disabled={true}
                        className="rounded-full bg-emerald-600 px-4 py-1.5 text-xs font-medium text-white transition hover:bg-emerald-700 disabled:opacity-50 cursor-not-allowed"
                        title="AI text generation coming soon - see docs/ai-text-generation.md"
                      >
                        Generate with AI (Coming Soon)
                      </button>
                    )}
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

