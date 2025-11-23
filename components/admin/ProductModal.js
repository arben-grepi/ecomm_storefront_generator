'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { doc, getDoc, getDocs, setDoc, serverTimestamp, collection, addDoc, updateDoc, query, where, limit, deleteDoc, arrayUnion } from 'firebase/firestore';
import { getFirebaseDb } from '@/lib/firebase';
import { getCollectionPath, getDocumentPath } from '@/lib/store-collections';
import { useWebsite } from '@/lib/website-context';
import Toast from '@/components/admin/Toast';
import CategorySelector from '@/components/admin/CategorySelector';
import ImageManager from '@/components/admin/ImageManager';

// Assumption: Variants always follow format "color/style / size"
// Example: "A / S", "green / One Size", "Black / M"

const normalizeString = (value) => {
  if (value === null || value === undefined) return '';
  return value.toString().trim().toLowerCase();
};

// Comprehensive color list - used to filter out non-color words from variant titles
const COLOR_ENUM = new Set([
  // Basic colors
  'black', 'white', 'gray', 'grey', 'silver', 'gold', 'beige', 'ivory', 'cream',
  // Primary colors
  'red', 'blue', 'green', 'yellow', 'orange', 'purple', 'pink', 'brown',
  // Shades and variations
  'navy', 'maroon', 'burgundy', 'crimson', 'scarlet', 'coral', 'salmon', 'peach',
  'teal', 'turquoise', 'cyan', 'aqua', 'azure', 'sky', 'royal', 'indigo', 'violet', 'lavender', 'lilac', 'magenta', 'fuchsia', 'rose',
  'lime', 'mint', 'olive', 'emerald', 'forest', 'khaki', 'sage',
  'amber', 'tan', 'copper', 'bronze', 'champagne', 'mustard', 'honey',
  'charcoal', 'slate', 'ash', 'pearl', 'platinum', 'bronze',
  // Extended colors
  'wine', 'ruby', 'cherry', 'berry', 'strawberry',
  'ocean', 'seafoam', 'jade', 'mint', 'avocado',
  'lemon', 'banana', 'butter', 'sunshine', 'canary',
  'tangerine', 'apricot', 'mango', 'papaya',
  'orchid', 'plum', 'aubergine', 'eggplant',
  'blush', 'dusty', 'mauve', 'powder', 'bubblegum',
  'coffee', 'chocolate', 'cocoa', 'camel', 'cognac', 'espresso',
  // Metallic and special
  'rose', 'rose gold', 'copper', 'bronze', 'brass',
  // Multi-word colors (common phrases)
  'rose purple', 'dusty rose', 'navy blue', 'sky blue', 'royal blue', 'powder blue',
  'forest green', 'emerald green', 'olive green', 'mint green', 'sage green',
  'dusty pink', 'rose pink', 'blush pink', 'bubblegum pink',
  'burnt orange', 'tangerine orange',
  'deep purple', 'royal purple', 'lavender purple',
  'burnt sienna', 'raw sienna',
  // Single letter colors (fallback)
  'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z'
].map(c => c.toLowerCase()));

// Check if a word is a color (case-insensitive)
const isColor = (word) => {
  if (!word) return false;
  const normalized = word.trim().toLowerCase();
  
  // Check exact match
  if (COLOR_ENUM.has(normalized)) return true;
  
  // Check multi-word combinations (up to 2 words)
  const words = normalized.split(/\s+/);
  if (words.length === 2) {
    return COLOR_ENUM.has(words.join(' ')) || COLOR_ENUM.has(words[0]);
  }
  
  // Check if any part of the word is a color (for compound colors like "blackish")
  for (const color of COLOR_ENUM) {
    if (normalized.includes(color) || color.includes(normalized)) {
      // Only return true if it's a significant match (not just a substring)
      if (normalized.length >= color.length * 0.7) {
        return true;
      }
    }
  }
  
  return false;
};

// Extract only color words from the prefix before "/"
// "Black vest / S" -> "Black" (removes "vest")
// "Rose Purple vest / L" -> "Rose Purple" (removes "vest")
// "A / S" -> "A" (single letter preserved)
const getVariantColor = (variant) => {
  if (!variant?.title) return null;
  
  // Normalize whitespace
  const clean = variant.title.replace(/\s+/g, " ").trim();
  
  // Extract prefix before "/"
  const match = clean.match(/^([^\/]+?)\s*\/\s*/);
  if (!match || !match[1]) return null;
  
  const prefix = match[1].trim();
  
  // Split into words
  const words = prefix.split(/\s+/);
  
  // Filter to keep only color words
  const colorWords = words.filter(word => {
    const normalized = word.toLowerCase().trim();
    // Keep single letters (A, B, C, etc.)
    if (normalized.length === 1 && /^[a-z]$/.test(normalized)) {
      return true;
    }
    // Keep if it's a color
    return isColor(word);
  });
  
  // Also check for multi-word color combinations
  // Try combinations: "rose purple", "dusty rose", etc.
  const multiWordColors = [];
  for (let i = 0; i < words.length - 1; i++) {
    const twoWords = `${words[i]} ${words[i + 1]}`.toLowerCase();
    if (COLOR_ENUM.has(twoWords)) {
      multiWordColors.push(`${words[i]} ${words[i + 1]}`);
      // Skip the next word since we've used it
      i++;
    }
  }
  
  // Combine multi-word colors with single-word colors (avoid duplicates)
  const allColorWords = [...multiWordColors];
  colorWords.forEach(word => {
    // Skip if already part of a multi-word color
    const isPartOfMultiWord = multiWordColors.some(mwc => 
      mwc.toLowerCase().includes(word.toLowerCase())
    );
    if (!isPartOfMultiWord) {
      allColorWords.push(word);
    }
  });
  
  // Return joined color words, or original prefix if no colors found (fallback)
  if (allColorWords.length > 0) {
    return allColorWords.join(' ').trim();
  }
  
  // Fallback: return original prefix if it's a single letter or very short
  if (prefix.length <= 3) {
    return prefix;
  }
  
  // If we can't identify colors, return null (will use variant ID as group key)
  return null;
};

// Extract size (suffix after "/") from variant title
// "A / S" -> "S", "green / One Size" -> "One Size"
const getVariantSize = (variant) => {
  if (!variant?.title) return null;
  const clean = variant.title.replace(/\s+/g, " ").trim();
  const match = clean.match(/\s*\/\s*(.+)$/);
  return match?.[1]?.trim() || null;
};

// Get group key for variant (color/style) - used for grouping variants and images
const getVariantGroupKey = (variant) => {
  return getVariantColor(variant) || `variant:${variant.id || variant.shopifyId}`;
};

// Sort variants: by color/style, then by size
const sortVariantsList = (variantsList = []) => {
  const list = [...variantsList];
  list.sort((a, b) => {
    const colorA = normalizeString(getVariantColor(a) || '');
    const colorB = normalizeString(getVariantColor(b) || '');
    if (colorA !== colorB) {
      return colorA.localeCompare(colorB);
    }
    const sizeA = normalizeString(getVariantSize(a) || '');
    const sizeB = normalizeString(getVariantSize(b) || '');
    return sizeA.localeCompare(sizeB);
  });
  return list;
};

// Group variants with same color/style (prefix before "/")
const getVariantsWithSameColor = (variantsList, variantId) => {
  const variant = variantsList.find((v) => (v.id || v.shopifyId) === variantId);
  if (!variant) return [variantId];

  const groupKey = getVariantColor(variant);
  if (!groupKey) return [variantId];

  // Group variants with same color/style (case-insensitive)
  const normalizedKey = normalizeString(groupKey);
  return variantsList
    .filter((v) => {
      const vColor = getVariantColor(v);
      return vColor && normalizeString(vColor) === normalizedKey;
    })
    .map((v) => v.id || v.shopifyId);
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
  // Early returns MUST be before any hooks
  if (mode === 'shopify' && !shopifyItem) return null;
  if (mode === 'edit' && !existingProduct) return null;

  const db = getFirebaseDb();
  const { selectedWebsite, availableWebsites } = useWebsite();
  const [categories, setCategories] = useState([]);
  const [categoryId, setCategoryId] = useState(initialCategoryId || '');
  const [loading, setLoading] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);
  const [error, setError] = useState(null);
  const [storefrontSelections, setStorefrontSelections] = useState([]);
  // Form state
  const [selectedImages, setSelectedImages] = useState([]);
  const [selectedVariants, setSelectedVariants] = useState([]);
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
        setLoading(true);
        const productId = existingProduct.id;
        setProductId(productId);

        // Load product document from current storefront (or try to find it in any storefront)
        let productDoc = null;
        let productStorefront = selectedWebsite;
        
        // Try current storefront first
        productDoc = await getDoc(doc(db, ...getDocumentPath('products', productId, selectedWebsite)));
        
        // If not found, try to find in any storefront
        if (!productDoc.exists()) {
          const allStorefronts = availableWebsites.length > 0 ? availableWebsites : ['LUNERA'];
          for (const storefront of allStorefronts) {
            productDoc = await getDoc(doc(db, ...getDocumentPath('products', productId, storefront)));
            if (productDoc.exists()) {
              productStorefront = storefront;
              break;
            }
          }
        }
        
        if (!productDoc.exists()) {
          setToastMessage({ type: 'error', text: 'Product not found.' });
          setLoading(false);
          return;
        }

        const productData = productDoc.data();

        // Try to fetch original shopifyItem to get all available images (like when first handling)
        if (productData.sourceShopifyItemDocId) {
          try {
            const shopifyItemDoc = await getDoc(
              doc(db, ...getCollectionPath('shopifyItems'), productData.sourceShopifyItemDocId)
            );
            if (shopifyItemDoc.exists()) {
              const shopifyItemData = { id: shopifyItemDoc.id, ...shopifyItemDoc.data() };
              setEditModeShopifyItem(shopifyItemData);
            }
          } catch (error) {
            console.warn('Failed to load shopifyItem for editing:', error);
          }
        }

        // Load variants from the storefront where product was found
        const variantsSnapshot = await getDocs(
          collection(db, ...getDocumentPath('products', productId, productStorefront), 'variants')
        );
        const variantsData = variantsSnapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));

        // Convert existing variants to format compatible with modal
        // Preserve shopifyVariantId and shopifyInventoryItemId from Firestore
        const convertedVariants = variantsData.map((v) => ({
          id: v.id,
          shopifyId: v.shopifyVariantId || v.id, // Use shopifyVariantId if available, otherwise fallback to Firestore ID
          shopifyVariantId: v.shopifyVariantId || null, // Preserve Shopify variant ID
          inventory_item_id: v.shopifyInventoryItemId || null, // Preserve inventory item ID
          option1: v.color || v.type || '',
          option2: v.size || '',
          price: v.priceOverride || productData.basePrice || 0,
          priceOverride: v.priceOverride || null, // Preserve priceOverride for editing
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
        setCategoryId(productData.categoryId || productData.categoryIds?.[0] || '');
        setBasePriceInput(
          productData.basePrice !== undefined && productData.basePrice !== null
            ? productData.basePrice.toString()
            : ''
        );
        setDefaultVariantId(productData.defaultVariantId || null);

        // Set selected images (preserve current selection)
        const productImages = productData.images || [];
        if (productImages.length > 0) {
          const imageObjects = productImages.map((url, idx) => ({
            url,
            isMain: idx === 0,
          }));
          setSelectedImages(imageObjects);
        }

        // Set variant images and default photos
        const variantImagesMap = {};
        const defaultPhotosMap = {};
        const priceOverridesMap = {};
        convertedVariants.forEach((variant) => {
          if (variant.images && variant.images.length > 0) {
            variantImagesMap[variant.id] = variant.images;
            // Set default photo if specified, otherwise use first image
            if (variant.defaultPhoto) {
              defaultPhotosMap[variant.id] = variant.defaultPhoto;
            } else if (variant.images.length > 0) {
              defaultPhotosMap[variant.id] = variant.images[0];
            }
          }
          // Load price overrides if they exist
          if (variant.priceOverride) {
            priceOverridesMap[variant.id] = variant.priceOverride.toString();
          }
        });
        setVariantImages(variantImagesMap);
        setDefaultVariantPhotos(defaultPhotosMap);
        setVariantPriceOverrides(priceOverridesMap);

        setStorefrontSelections(
          Array.isArray(productData.storefronts) && productData.storefronts.length > 0
            ? productData.storefronts
            : [selectedWebsite]
        );
        
        // Initialize markets from existing product
        // Markets are read-only - they come from Shopify, not editable in ProductModal

        setLoading(false);
      } catch (error) {
        console.error('Failed to load product:', error);
        setToastMessage({ type: 'error', text: 'Failed to load product data.' });
        setLoading(false);
      }
    };

    loadExistingProduct();
  }, [mode, existingProduct, db]);

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

    // Check for new properties in database: displayName, displayDescription, bulletpoints
    if (item.displayName) {
      setDisplayName(item.displayName);
    }
    if (item.displayDescription) {
      setDisplayDescription(item.displayDescription);
    }
    if (item.bulletpoints && Array.isArray(item.bulletpoints)) {
      setBulletPoints(item.bulletpoints.filter(Boolean)); // Filter out empty strings
    }

    // Group variants by color/style and set default images
    const initialDefaultPhotos = {};
    variants.forEach((variant) => {
      const variantId = variant.id || variant.shopifyId;
      const defaults = getVariantDefaultImages(variant);
      if (defaults.length > 0) {
        initialVariantImages[variantId] = [...defaults];
        // Set first default image as default photo if no explicit defaultPhoto exists
        if (variant.defaultPhoto) {
          initialDefaultPhotos[variantId] = variant.defaultPhoto;
        } else if (defaults.length > 0) {
          initialDefaultPhotos[variantId] = defaults[0];
        }
      }
    });

    setExpandedVariants(initialExpanded);
    setVariantImages(initialVariantImages);
    setDefaultVariantPhotos(initialDefaultPhotos);
    
    // Initialize variant price overrides from imported data
    const initialPriceOverrides = {};
    variants.forEach((variant) => {
      const variantId = variant.id || variant.shopifyId;
      // Only set if variant has a price (from Shopify)
      if (variant.price) {
        initialPriceOverrides[variantId] = variant.price.toString();
      }
    });
    setVariantPriceOverrides(initialPriceOverrides);

    if (item.matchedCategorySlug) {
      loadCategoryId(item.matchedCategorySlug);
    }
  }, [item, sortedVariants, mode, basePriceInput]);

  const loadCategoryId = async (slug) => {
    if (!db || !slug) return;
    try {
      const categoriesQuery = query(
        collection(db, ...getCollectionPath('categories', selectedWebsite)),
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

    // Main product photos are now optional - if none selected, use default variant's photo
    // Validation removed - we'll use default variant photo if no main images are selected

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
      // Ensure at least one storefront is selected (default to selectedWebsite)
      const selectedStorefronts = storefrontSelections.length > 0 ? storefrontSelections : [selectedWebsite];
      
      if (selectedStorefronts.length === 0) {
        setToastMessage({ type: 'error', text: 'Please select at least one storefront.' });
        setLoading(false);
        return;
      }
      
      // Note: productsCollection is not used directly - we create per-storefront collections in the loop below
      
      // For edit mode, skip uniqueness check (same product)
      // For create modes, check uniqueness across all selected storefronts
      if (mode !== 'edit') {
        const uniquenessChecks = await Promise.all(
          selectedStorefronts.map(async (storefront) => {
            const storefrontProductsCollection = collection(db, ...getCollectionPath('products', storefront));
            const [nameSnapshot, slugSnapshot] = await Promise.all([
              getDocs(query(storefrontProductsCollection, where('name', '==', displayName), limit(1))),
              getDocs(query(storefrontProductsCollection, where('slug', '==', slug), limit(1))),
            ]);
            return { nameExists: !nameSnapshot.empty, slugExists: !slugSnapshot.empty };
          })
        );
        
        const nameExists = uniquenessChecks.some((check) => check.nameExists);
        const slugExists = uniquenessChecks.some((check) => check.slugExists);

        if (nameExists || slugExists) {
          setToastMessage({
            type: 'error',
            text: 'A product with this name or slug already exists in one of the selected storefronts. Please choose a different display name.',
          });
          setLoading(false);
          return;
        }
      } else {
        // For edit mode, check if name/slug conflicts with OTHER products in the storefronts where this product exists
        // Find product in all storefronts first
        const editUniquenessChecks = await Promise.all(
          selectedStorefronts.map(async (storefront) => {
            const storefrontProductsCollection = collection(db, ...getCollectionPath('products', storefront));
            const [nameSnapshot, slugSnapshot] = await Promise.all([
              getDocs(query(storefrontProductsCollection, where('name', '==', displayName), limit(2))),
              getDocs(query(storefrontProductsCollection, where('slug', '==', slug), limit(2))),
            ]);
            const nameConflict = nameSnapshot.docs.some((doc) => doc.id !== productId);
            const slugConflict = slugSnapshot.docs.some((doc) => doc.id !== productId);
            return { nameConflict, slugConflict };
          })
        );

        const nameConflict = editUniquenessChecks.some((check) => check.nameConflict);
        const slugConflict = editUniquenessChecks.some((check) => check.slugConflict);

        if (nameConflict || slugConflict) {
        setToastMessage({
          type: 'error',
          text: 'A product with this name already exists. Please choose a different display name.',
        });
        setLoading(false);
        return;
        }
      }

      // Validate default variant is selected - if not, use first selected variant
      // This must be done early because it's used in main image determination
      let validatedDefaultVariantId = defaultVariantId && selectedVariants.includes(defaultVariantId)
        ? defaultVariantId
        : null;
      
      // Always ensure we have a default variant - use first selected if none set
      if (!validatedDefaultVariantId && selectedVariants.length > 0) {
        validatedDefaultVariantId = selectedVariants[0];
      }

      // Get selected variant data (needed for main image determination)
      const selectedVariantData = mode === 'shopify'
        ? allVariants.filter((v) => selectedVariants.includes(v.id || v.shopifyId))
        : manualVariants.filter((v) => selectedVariants.includes(v.id || v.shopifyId));

      // Determine main image: use selected main image, or default variant's photo, or first selected image
      let mainImage = null;
      let additionalImages = [];
      
      if (selectedImages.length > 0) {
        // If main product photos are selected, use them
        mainImage = selectedImages.find((img) => img.isMain)?.url || selectedImages[0].url;
        additionalImages = selectedImages
          .filter((img) => !img.isMain)
          .map((img) => img.url);
      } else if (validatedDefaultVariantId && selectedVariantData.length > 0) {
        // If no main product photos, use default variant's default photo
        const defaultVariant = selectedVariantData.find((v) => (v.id || v.shopifyId) === validatedDefaultVariantId);
        if (defaultVariant) {
          const defaultVariantId = defaultVariant.id || defaultVariant.shopifyId;
          const defaultPhoto = defaultVariantPhotos[defaultVariantId];
          if (defaultPhoto) {
            mainImage = defaultPhoto;
          } else {
            // Fallback to first variant image or first available image
            const variantImageUrls = variantImages[getVariantGroupKey(defaultVariant)] || getSelectedVariantImages(defaultVariantId);
            if (variantImageUrls.length > 0) {
              mainImage = variantImageUrls[0];
            } else {
              const defaultImages = getVariantDefaultImages(defaultVariant);
              if (defaultImages.length > 0) {
                mainImage = defaultImages[0];
              }
            }
          }
        }
      }
      
      // If still no main image, use first available image from any source
      if (!mainImage) {
        if (availableImages.length > 0) {
          mainImage = availableImages[0];
        } else if (selectedVariantData.length > 0) {
          const firstVariant = selectedVariantData[0];
          const firstVariantId = firstVariant.id || firstVariant.shopifyId;
          const firstVariantImages = getVariantDefaultImages(firstVariant);
          if (firstVariantImages.length > 0) {
            mainImage = firstVariantImages[0];
          }
        }
      }
      
      // Ensure we have at least one image
      if (!mainImage) {
        setToastMessage({ type: 'error', text: 'Please select at least one image or variant photo.' });
        setLoading(false);
        return;
      }

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
      // Store doc_id from shopifyItems collection for recognition
      const sourceShopifyItemDocId = mode === 'shopify' ? item.id : (mode === 'edit' ? existingProduct?.sourceShopifyItemDocId : null);
      
      // Get markets array from shopifyItems (shopify mode) or existing product (edit mode)
      // Markets are important for market-based filtering in the storefront
      // Support both array format (legacy) and object format (new with Shopify Markets)
      let markets = [];
      let marketsObject = null;
      
      if (mode === 'shopify') {
        // From shopifyItems document
        if (item.marketsObject && typeof item.marketsObject === 'object') {
          // New format: markets object
          marketsObject = item.marketsObject;
          markets = Object.keys(item.marketsObject);
        } else {
          // Legacy format: markets array
          markets = item.markets || [];
        }
      } else if (mode === 'edit') {
        // From existing product
        if (existingProduct?.marketsObject && typeof existingProduct.marketsObject === 'object') {
          marketsObject = existingProduct.marketsObject;
          markets = Object.keys(existingProduct.marketsObject);
        } else {
          markets = existingProduct?.markets || [];
        }
      } else {
        // Manual mode - no markets (manual products don't use Shopify Markets)
        markets = [];
      }

      // Get publishedToOnlineStore flag from shopifyItems (shopify mode) or existing product (edit mode)
      // This determines if product is accessible via Storefront API
      const publishedToOnlineStore = mode === 'shopify' 
        ? (item.publishedToOnlineStore !== undefined ? item.publishedToOnlineStore : true) // Default to true for backward compatibility
        : (mode === 'edit' 
          ? (existingProduct?.publishedToOnlineStore !== undefined ? existingProduct.publishedToOnlineStore : true) // Default to true for backward compatibility
          : true); // Manual mode - assume published (manual products don't use Storefront API)

      const categoryIds = categoryId ? [categoryId] : [];

      const productData = {
        name: displayName,
        slug,
        categoryIds,
        basePrice: parsedBasePrice,
        description: displayDescription,
        defaultVariantId: validatedDefaultVariantId,
        bulletPoints: bulletPoints.filter(Boolean),
        images: [mainImage, ...additionalImages],
        active: true,
        sourceType,
        ...(sourceShopifyId ? { sourceShopifyId } : {}),
        ...(sourceShopifyItemDocId ? { sourceShopifyItemDocId } : {}),
        ...(markets.length > 0 ? { markets } : {}), // Include markets array if available
        ...(marketsObject && Object.keys(marketsObject).length > 0 ? { marketsObject } : {}), // Include markets object if available
        publishedToOnlineStore, // Include Online Store publication status
        manuallyEdited: true,
        updatedAt: serverTimestamp(),
        ...(mode !== 'edit' ? { createdAt: serverTimestamp() } : {}),
        storefronts: selectedStorefronts,
      };

      // Save product to each selected storefront folder
      const productRefs = [];
      
      for (const storefront of selectedStorefronts) {
        const storefrontProductsCollection = collection(db, ...getCollectionPath('products', storefront));
        
        if (mode === 'edit') {
          // For edit mode, try to find product by ID first, then by sourceShopifyId
          let existingDoc = null;
          
          // First try by productId (if we know it)
          if (productId) {
            try {
              const productDoc = await getDoc(doc(db, ...getDocumentPath('products', productId, storefront)));
              if (productDoc.exists()) {
                existingDoc = productDoc;
              }
            } catch (e) {
              // Product doesn't exist in this storefront
            }
          }
          
          // If not found by ID, try by sourceShopifyId
          if (!existingDoc && sourceShopifyId) {
            const existingProductQuery = query(
              storefrontProductsCollection,
              where('sourceShopifyId', '==', sourceShopifyId),
              limit(1)
            );
            const existingSnapshot = await getDocs(existingProductQuery);
            if (!existingSnapshot.empty) {
              existingDoc = existingSnapshot.docs[0];
            }
          }
          
          if (existingDoc) {
            // Update existing product
            await updateDoc(existingDoc.ref, productData);
            productRefs.push({ id: existingDoc.id, storefront });
            
            // Delete existing variants that are not selected
            const existingVariantsSnapshot = await getDocs(
              collection(db, ...getDocumentPath('products', existingDoc.id, storefront), 'variants')
            );
            const existingVariantIds = existingVariantsSnapshot.docs.map((doc) => doc.id);
            const variantsToDelete = existingVariantIds.filter((id) => !selectedVariants.includes(id));

            for (const variantId of variantsToDelete) {
              await deleteDoc(doc(db, ...getDocumentPath('products', existingDoc.id, storefront), 'variants', variantId));
            }
          } else {
            // Product doesn't exist in this storefront, create it
            const newProductRef = await addDoc(storefrontProductsCollection, productData);
            productRefs.push({ id: newProductRef.id, storefront });
          }
        } else {
          // Create new product in this storefront
          const newProductRef = await addDoc(storefrontProductsCollection, productData);
          productRefs.push({ id: newProductRef.id, storefront });
        }
      }
      
      // Use first product ref for variant operations (we'll save variants to all storefronts)
      const productRef = productRefs[0] || { id: null };

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

        // Always add main product photos to variant images (they show with all variants)
        // But keep variant-specific images first (especially the default variant photo)
        const allMainImages = selectedImages.map((img) => img.url);
        // Preserve order: default variant photo first, then other variant-specific images, then main images
        const uniqueVariantImages = [];
        const seen = new Set();
        
        // Get default photo for this variant (if set)
        const defaultPhoto = defaultVariantPhotos[variantId];
        
        // Add default photo FIRST if it exists
        if (defaultPhoto && variantImageUrls.includes(defaultPhoto)) {
          uniqueVariantImages.push(defaultPhoto);
          seen.add(defaultPhoto);
        }
        
        // Add variant-specific images (excluding default photo if already added)
        variantImageUrls.forEach((url) => {
          if (url && !seen.has(url)) {
            uniqueVariantImages.push(url);
            seen.add(url);
          }
        });
        
        // Then add main images (excluding duplicates)
        allMainImages.forEach((url) => {
          if (url && !seen.has(url)) {
            uniqueVariantImages.push(url);
            seen.add(url);
          }
        });
        
        // Extract color/style and size from variant title
        const normalizedColor = mode === 'shopify' 
          ? getVariantColor(variant) 
          : (variant.color || null);
        const normalizedSize = mode === 'shopify'
          ? getVariantSize(variant)
          : (variant.size || null);

        // Preserve location-specific inventory levels for market-based availability checks
        const inventoryLevels = mode === 'shopify' && variant.inventory_levels
          ? variant.inventory_levels // From Shopify import (location-specific)
          : (variant.inventory_levels || []); // From existing Firestore data or empty

        const variantData = {
          size: normalizedSize || null,
          color: normalizedColor || null,
          sku: variant.sku || null,
          stock: variant.inventory_quantity || variant.inventoryQuantity || variant.stock || 0,
          inventory_levels: inventoryLevels.length > 0 ? inventoryLevels : undefined, // Store location-specific inventory
          priceOverride: variantPriceOverrides[variantId] !== undefined 
            ? (variantPriceOverrides[variantId] === '' ? null : parseFloat(variantPriceOverrides[variantId]) || null)
            : (parseFloat(variant.price || variant.priceOverride || 0) || null),
          images: uniqueVariantImages,
          defaultPhoto: defaultPhoto || (uniqueVariantImages.length > 0 ? uniqueVariantImages[0] : null), // Store default photo
          // Always preserve shopifyVariantId if it exists (from Shopify or from existing Firestore data)
          ...(variant.shopifyVariantId
            ? { shopifyVariantId: variant.shopifyVariantId.toString() }
            : (mode === 'shopify' && variant.id
              ? { shopifyVariantId: variant.id.toString() } // Store Shopify variant ID for new Shopify variants
              : {})),
          // Always preserve shopifyInventoryItemId if it exists
          ...(variant.inventory_item_id || variant.shopifyInventoryItemId
            ? { shopifyInventoryItemId: variant.inventory_item_id || variant.shopifyInventoryItemId }
            : {}),
            updatedAt: serverTimestamp(),
          ...(mode !== 'edit' || !variant.id ? { createdAt: serverTimestamp() } : {}),
        };

        // Save variant to all storefronts where product exists
        for (const productRefInfo of productRefs) {
          if (mode === 'edit' && variant.id) {
            // Try to find existing variant in this storefront
            const variantRef = doc(db, ...getDocumentPath('products', productRefInfo.id, productRefInfo.storefront), 'variants', variant.id);
            try {
              await updateDoc(variantRef, variantData);
            } catch (error) {
              // Variant doesn't exist in this storefront, create it
              await setDoc(variantRef, variantData);
            }
          } else {
            // Create new variant in this storefront
            await addDoc(
              collection(db, ...getDocumentPath('products', productRefInfo.id, productRefInfo.storefront), 'variants'),
              variantData
            );
          }
        }
      }

      // Mark Shopify item as processed (only for shopify mode)
      if (mode === 'shopify' && item?.id) {
        // Get current document to check if storefronts are new
        const shopifyItemRef = doc(db, ...getDocumentPath('shopifyItems', item.id));
        const shopifyItemDoc = await getDoc(shopifyItemRef);
        const existingStorefronts = shopifyItemDoc.exists() 
          ? (shopifyItemDoc.data().storefronts || [])
          : [];
        
        // Count how many new storefronts are being added
        const newStorefronts = selectedStorefronts.filter(
          sf => !existingStorefronts.includes(sf)
        );
        const newStorefrontCount = newStorefronts.length;

        const updateData = {
          processedStorefronts: arrayUnion(...selectedStorefronts),
          storefronts: arrayUnion(...selectedStorefronts),
          updatedAt: serverTimestamp(),
        };

        // Only increment if there are new storefronts being added
        if (newStorefrontCount > 0) {
          // If field doesn't exist, set it; otherwise increment
          const currentCount = shopifyItemDoc.exists() 
            ? (shopifyItemDoc.data().storefrontUsageCount || 0)
            : 0;
          updateData.storefrontUsageCount = currentCount + newStorefrontCount;
        }

        await setDoc(shopifyItemRef, updateData, { merge: true });
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

  const getCategoryName = (categoryId) => {
    const category = categories.find((cat) => cat.id === categoryId);
    return category?.name || '—';
  };

  const toggleStorefront = (storefront) => {
    setStorefrontSelections((prev) => {
      if (prev.includes(storefront)) {
        return prev.filter((s) => s !== storefront);
      }
      return [...prev, storefront];
    });
  };

  useEffect(() => {
    if (mode !== 'edit') {
      setStorefrontSelections([selectedWebsite]);
    }
  }, [mode, selectedWebsite]);

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
            {loading && (
              <div className="absolute inset-0 z-50 flex items-center justify-center rounded-3xl bg-white/90 backdrop-blur-sm dark:bg-zinc-900/90">
                <div className="flex items-center gap-3">
                  <svg className="h-5 w-5 animate-spin text-emerald-600" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                  </svg>
                  <span className="text-sm text-zinc-700 dark:text-zinc-300">Saving product...</span>
                </div>
              </div>
            )}
            <div className="mx-auto w-full max-w-4xl">
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
                {availableImages.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-3">
                      Main Product Photos ({selectedImages.length} selected) <span className="text-xs font-normal text-zinc-400">(Optional)</span>
                      <span className="ml-2 text-xs font-normal text-zinc-500">
                        - Used in product cards and product detail page. If none selected, default variant's photo will be used.
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
                      <div className="flex items-center gap-3">
                      <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                        Select Variants ({selectedVariants.length} selected)
                      </label>
                        <button
                          type="button"
                          onClick={() => {
                            const allSelectableIds = availableVariants
                              .filter((v) => {
                                const variantId = v.id || v.shopifyId;
                                const stock = mode === 'shopify'
                                  ? (v.inventory_quantity || v.inventoryQuantity || 0)
                                  : (v.stock || 0);
                                return mode === 'manual' || mode === 'edit' || stock > 0;
                              })
                              .map((v) => v.id || v.shopifyId);
                            const allSelected = allSelectableIds.every((id) => selectedVariants.includes(id));
                            if (allSelected) {
                              setSelectedVariants([]);
                            } else {
                              setSelectedVariants([...new Set([...selectedVariants, ...allSelectableIds])]);
                            }
                          }}
                          className="text-xs text-emerald-600 hover:text-emerald-700 dark:text-emerald-400"
                        >
                          {availableVariants
                            .filter((v) => {
                              const variantId = v.id || v.shopifyId;
                              const stock = mode === 'shopify'
                                ? (v.inventory_quantity || v.inventoryQuantity || 0)
                                : (v.stock || 0);
                              return (mode === 'manual' || mode === 'edit' || stock > 0) && selectedVariants.includes(variantId);
                            }).length === availableVariants.filter((v) => {
                              const stock = mode === 'shopify'
                                ? (v.inventory_quantity || v.inventoryQuantity || 0)
                                : (v.stock || 0);
                              return mode === 'manual' || mode === 'edit' || stock > 0;
                            }).length
                            ? 'Deselect All'
                            : 'Select All'}
                        </button>
                      </div>
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
                    <div className="max-h-[36rem] overflow-y-auto overflow-x-hidden space-y-3 rounded-lg border border-zinc-200 dark:border-zinc-700 p-3">
                      {availableVariants.map((variant, index) => {
                        const variantId = variant.id || variant.shopifyId;
                        const isSelected = selectedVariants.includes(variantId);
                        const stock = mode === 'shopify'
                          ? (variant.inventory_quantity || variant.inventoryQuantity || 0)
                          : (variant.stock || 0);
                        const isOutOfStock = stock <= 0;
                        const selectedVariantImagesForVariant = getSelectedVariantImages(variantId);
                        const previewImage =
                          defaultVariantPhotos[variantId] ||
                          selectedVariantImagesForVariant[0] ||
                          getVariantDefaultImages(variant)[0] ||
                          selectedImages.find((img) => img.isMain)?.url ||
                          selectedImages[0]?.url ||
                          availableImages[0];
                        const isExpanded = expandedVariants.has(variantId);
                        const variantInstance = availableVariants.find((v) => (v.id || v.shopifyId) === variantId) || variant;
                        const sameGroupVariants = getSameColorVariantIds(variantId);
                        const groupKey = getVariantGroupKey(variantInstance);
                        const displayGroup = mode === 'shopify'
                          ? (getVariantColor(variantInstance) || 'this variant')
                          : (variantInstance?.color || variantInstance?.type || 'this variant');
                        // Variant-specific images (original variant photos) - get for THIS specific variant
                        const thisVariantSpecificImages = variantImages[variantId] || [];
                        // Group-level variant images (for backward compatibility)
                        const groupVariantImages = variantImages[groupKey] || [];
                        // Combine: this variant's specific images first, then group images
                        const variantSpecificImages = [...new Set([...thisVariantSpecificImages, ...groupVariantImages])];
                        // Main gallery selected images
                        const mainGallerySelectedUrls = selectedImages.map((img) => img.url);
                        // Combined: variant-specific images first (original variant photo), then main gallery selections
                        const groupSelectedImages = [...new Set([...variantSpecificImages, ...mainGallerySelectedUrls])];
                        // Available images: all main gallery images + variant-specific images
                        const variantDefaultImages = getVariantDefaultImages(variantInstance);
                        const availableVariantImages = Array.from(new Set([
                          ...availableImages, // All main gallery images
                          ...variantDefaultImages // Original variant photos
                        ]));
                        const selectedAttributeLabels = (variant.selectedOptions || []).map((option) => ({
                          label: option?.name || 'Option',
                          value: option?.value || '',
                        }));

                        return (
                          <div
                            key={variantId}
                            className={`rounded-xl border border-zinc-200 bg-white shadow-sm transition dark:border-zinc-700 dark:bg-zinc-900 ${
                              isSelected ? 'ring-1 ring-emerald-400 dark:ring-emerald-500' : ''
                            }`}
                          >
                            <div className="flex items-center justify-between gap-3 px-4 py-3">
                              <div className="flex items-center gap-3">
                              <input
                                  id={`variant-${variantId}`}
                                type="checkbox"
                                  checked={selectedVariants.includes(variantId)}
                                onChange={() => handleVariantToggle(variantId)}
                                  className="h-4 w-4 rounded border-zinc-300 text-emerald-500 focus:ring-emerald-400"
                                />
                                <div className="flex items-center gap-1">
                                  <input
                                    id={`default-variant-${variantId}`}
                                    type="radio"
                                    name="defaultVariant"
                                    checked={defaultVariantId === variantId}
                                    onChange={() => setDefaultVariantId(variantId)}
                                    disabled={!isSelected}
                                    className="h-4 w-4 border-zinc-300 text-emerald-500 focus:ring-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed"
                                    title={isSelected ? 'Set as default variant' : 'Select variant first'}
                                  />
                                  {defaultVariantId === variantId && (
                                    <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400" title="Default variant">
                                      Default
                                    </span>
                                  )}
                                </div>
                                <label htmlFor={`variant-${variantId}`} className="flex flex-col text-sm">
                                  <span className="font-medium text-zinc-900 dark:text-zinc-100">
                                    {variant.title || variant.name || variant.selectedOptions?.map((opt) => opt.value).join(' / ') || 'Unnamed variant'}
                                  </span>
                                  <span className="flex flex-wrap gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                                    {selectedAttributeLabels.map((attr) => (
                                      <span key={`${variantId}-${attr.label}`} className="rounded-full bg-zinc-100 px-2 py-0.5 dark:bg-zinc-800">
                                        {attr.value || '—'}
                                      </span>
                                    ))}
                                  </span>
                                </label>
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

                            {isExpanded && (
                                 <div className="border-t border-zinc-200 bg-white/70 px-3 py-3 dark:border-zinc-700 dark:bg-zinc-900/50 space-y-4">
                                   {/* Price Override (for shopify mode) */}
                                   {mode === 'shopify' && (
                                     <div>
                                       <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                                         Price Override (Optional)
                                       </label>
                                       <div className="flex items-center gap-2">
                                         <span className="text-xs text-zinc-500 dark:text-zinc-400">€</span>
                                         <input
                                           type="number"
                                           min="0"
                                           step="0.01"
                                           value={variantPriceOverrides[variantId] !== undefined ? variantPriceOverrides[variantId] : (variant.price || variant.priceOverride || '')}
                                           onChange={(e) => {
                                             const value = e.target.value;
                                             setVariantPriceOverrides((prev) => {
                                               if (value === '' || value === (variant.price || variant.priceOverride || '').toString()) {
                                                 // Remove override if empty or same as original
                                                 const updated = { ...prev };
                                                 delete updated[variantId];
                                                 return updated;
                                               }
                                               return { ...prev, [variantId]: value };
                                             });
                                           }}
                                           placeholder={variant.price || variant.priceOverride || basePriceInput || '0.00'}
                                           className="w-32 rounded-lg border border-zinc-200 px-2 py-1 text-xs focus:border-emerald-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                                         />
                                         <span className="text-xs text-zinc-500 dark:text-zinc-400">
                                           {variantPriceOverrides[variantId] !== undefined 
                                             ? '(Overridden)' 
                                             : variant.price || variant.priceOverride 
                                               ? `(From Shopify: €${variant.price || variant.priceOverride})`
                                               : `(Inherits base price: €${basePriceInput || '0.00'})`}
                                         </span>
                                       </div>
                                       <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                                         Leave empty to use Shopify price or base price. Override to set a custom price for this variant.
                                       </p>
                                     </div>
                                   )}
                                   
                                   <div className="mb-2 flex items-center justify-between">
                                     <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                                    Variant Photos ({groupSelectedImages.length} selected)
                                     </p>
                                  {sameGroupVariants.length > 1 && (
                                       <p className="text-xs text-zinc-500 dark:text-zinc-400">
                                      Applies to all {displayGroup} sizes
                                       </p>
                                     )}
                                   </div>
                                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 md:grid-cols-5">
                                  {availableVariantImages.map((imageUrl, idx) => {
                                    const isSelectedImage = groupSelectedImages.includes(imageUrl);
                                    const isDefaultPhoto = defaultVariantPhotos[variantId] === imageUrl;
                                    return (
                                      <button
                                        key={`${variantId}-image-${idx}`}
                                        type="button"
                                        onClick={(e) => {
                                          if (e.shiftKey || e.metaKey || e.ctrlKey) {
                                            // Set as default photo when holding Shift/Cmd/Ctrl
                                            // Apply to all grouped variants (same color/style)
                                            const sameGroupVariantIds = getSameColorVariantIds(variantId);
                                            setDefaultVariantPhotos((prev) => {
                                              const updated = { ...prev };
                                              // Set default photo for all variants in the same group
                                              sameGroupVariantIds.forEach((groupId) => {
                                                updated[groupId] = imageUrl;
                                              });
                                              return updated;
                                            });
                                            // Also select the image (toggle selection)
                                            handleVariantImageToggle(variantId, imageUrl);
                                          } else {
                                            // Toggle image selection
                                            handleVariantImageToggle(variantId, imageUrl);
                                          }
                                        }}
                                        onDoubleClick={() => {
                                          // Double-click to set as default photo
                                          // Apply to all grouped variants (same color/style)
                                          const sameGroupVariantIds = getSameColorVariantIds(variantId);
                                          setDefaultVariantPhotos((prev) => {
                                            const updated = { ...prev };
                                            // Set default photo for all variants in the same group
                                            sameGroupVariantIds.forEach((groupId) => {
                                              updated[groupId] = imageUrl;
                                            });
                                            return updated;
                                          });
                                        }}
                                        className={`group relative aspect-square w-full overflow-hidden rounded-lg border-2 transition ${
                                          isSelectedImage
                                            ? 'border-emerald-500 ring-2 ring-emerald-200'
                                            : 'border-zinc-200 dark:border-zinc-700'
                                        } ${isDefaultPhoto ? 'ring-2 ring-yellow-400 ring-offset-2' : ''}`}
                                        title={isDefaultPhoto ? 'Default photo (double-click to change)' : 'Click to select, Shift+Click or Double-click to set as default'}
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
                                        {isDefaultPhoto && (
                                          <div className="absolute top-1 right-1 rounded-full bg-yellow-500 p-1 shadow-lg">
                                            <svg className="h-3 w-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                                              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                                            </svg>
                                          </div>
                                        )}
                                      </button>
                                    );
                                  })}
                                </div>
                                {groupSelectedImages.length > 0 && (
                                  <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                                    💡 Tip: Double-click an image or Shift+Click to set it as the default photo (shown first). 
                                    {defaultVariantPhotos[variantId] && ' Yellow star indicates default photo.'}
                                  </p>
                                )}
                                {groupSelectedImages.length === 0 && (
                                  <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                                    No images selected for this variant. The product main images will be used if you leave this empty.
                                  </p>
                                )}
                              </div>
                            )}
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

                {/* Storefront Selection */}
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                    Assign to Storefronts *
                  </label>
                  {availableWebsites.length === 1 ? (
                    <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                      {availableWebsites[0]}
                    </div>
                  ) : (
                    <>
                      <div className="flex flex-wrap gap-2">
                        {availableWebsites.map((storefront) => {
                          const isSelected = storefrontSelections.includes(storefront);
                          return (
                            <button
                              key={storefront}
                              type="button"
                              onClick={() => toggleStorefront(storefront)}
                              className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition ${
                                isSelected
                                  ? 'border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                                  : 'border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:border-zinc-600'
                              }`}
                            >
                              {storefront}
                              {isSelected && (
                                <svg className="ml-1.5 inline h-3.5 w-3.5" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                </svg>
                              )}
                            </button>
                          );
                        })}
                      </div>
                      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                        Select which storefronts this product should appear in. At least one must be selected.
                      </p>
                    </>
                  )}
                </div>

                {/* Market Information (Read-only) */}
                {mode === 'shopify' && item && (
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                      Available in Markets
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {(() => {
                        const marketsList = item.marketsObject && typeof item.marketsObject === 'object'
                          ? Object.keys(item.marketsObject)
                          : (Array.isArray(item.markets) ? item.markets : []);
                        const marketNames = { FI: 'Finland', DE: 'Germany' };
                        return marketsList.length > 0 ? (
                          marketsList.map((market) => (
                            <span
                              key={market}
                              className="rounded-lg border border-emerald-500 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                            >
                              {market} ({marketNames[market] || market})
                              <svg className="ml-1.5 inline h-3.5 w-3.5" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                              </svg>
                            </span>
                          ))
                        ) : (
                          <span className="text-sm text-zinc-500 dark:text-zinc-400">No markets assigned (assign in Shopify)</span>
                        );
                      })()}
                    </div>
                    <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                      Markets are managed in Shopify. To change markets, update the product in Shopify and re-run the import script.
                    </p>
                  </div>
                )}

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

