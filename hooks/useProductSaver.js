import { useState } from 'react';
import { doc, getDoc, getDocs, setDoc, serverTimestamp, collection, addDoc, updateDoc, query, where, limit, deleteDoc, arrayUnion } from 'firebase/firestore';
import { getCollectionPath, getDocumentPath } from '@/lib/store-collections';
import { getVariantColor, getVariantSize, getVariantGroupKey, cleanVariantName, normalizeVariantName, cleanBrackets, getVaryingOptionIndex, getVariantOptionValue } from '@/lib/variant-utils';
import { getFullQualityImageUrl } from '@/lib/image-utils';

const slugify = (value) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');

/**
 * Custom hook for saving products
 * Breaks down the large handleSave function into smaller, manageable pieces
 */
export function useProductSaver({
  db,
  mode,
  item,
  existingProduct,
  productId,
  displayName,
  displayDescription,
  bulletPoints,
  categoryId,
  selectedImages,
  selectedVariants,
  defaultVariantId,
  allVariants,
  manualVariants,
  variantImages,
  defaultVariantPhotos,
  getSelectedVariantImages,
  getVariantDefaultImages,
  availableImages,
  storefrontSelections,
  selectedWebsite,
  availableWebsites,
  setLoading,
  setToastMessage,
  onSaved,
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  /**
   * Validate product data before saving
   */
  const validateProductData = () => {
    if (!db || !categoryId) {
      setToastMessage({ type: 'error', text: 'Please select a category.' });
      return false;
    }

    if (mode === 'shopify' && !item) {
      setToastMessage({ type: 'error', text: 'Shopify item data is missing.' });
      return false;
    }

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
      return false;
    }

    if (!displayName.trim()) {
      setToastMessage({ type: 'error', text: 'Please enter a display name.' });
      return false;
    }

    if (storefrontSelections.length === 0) {
      setToastMessage({ type: 'error', text: 'Please select at least one storefront.' });
      return false;
    }

    return true;
  };

  /**
   * Check if product name/slug is unique across storefronts
   */
  const checkUniqueness = async (slug, selectedStorefronts) => {
    if (mode !== 'edit') {
      // For create modes, check uniqueness across all selected storefronts
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
        return false;
      }
    } else {
      // For edit mode, check if name/slug conflicts with OTHER products
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
        return false;
      }
    }

    return true;
  };

  /**
   * Determine main image and additional images
   * ALWAYS uses the default variant's default photo as the main product image
   * This ensures the product card shows the default variant photo and updates when it changes
   */
  const determineMainImage = (selectedVariantData) => {
    let mainImage = null;
    let additionalImages = [];
    
    // PRIORITY 1: ALWAYS use default variant's default photo as main image if default variant exists
    // This is NON-NEGOTIABLE - product card MUST show default variant's photo
    if (defaultVariantId && selectedVariantData.length > 0) {
      const defaultVariant = selectedVariantData.find((v) => (v.id || v.shopifyId) === defaultVariantId);
      if (defaultVariant) {
        const defaultVariantIdKey = defaultVariant.id || defaultVariant.shopifyId;
        
        // Method 1: Check explicitly set default photo in defaultVariantPhotos
        let defaultPhoto = defaultVariantPhotos[defaultVariantIdKey];
        
        // Method 2: If no explicit default photo, get from variant's selected/grouped images
        if (!defaultPhoto) {
          const productOptions = mode === 'shopify' ? (item?.rawProduct?.options || null) : null;
          const groupKey = getVariantGroupKey(defaultVariant, productOptions, selectedVariantData);
          const variantImageUrls = variantImages[groupKey] || getSelectedVariantImages(defaultVariantIdKey);
          if (variantImageUrls.length > 0) {
            defaultPhoto = variantImageUrls[0];
          }
        }
        
        // Method 3: If still no photo, get from variant's default images (from Shopify)
        if (!defaultPhoto) {
          const defaultImages = getVariantDefaultImages(defaultVariant);
          if (defaultImages.length > 0) {
            defaultPhoto = defaultImages[0];
          }
        }
        
        // Method 4: Last resort - check if variant has a saved defaultPhoto field
        if (!defaultPhoto && defaultVariant.defaultPhoto) {
          defaultPhoto = defaultVariant.defaultPhoto;
        }
        
        // Method 5: Check variant.images array (for edit mode)
        if (!defaultPhoto && defaultVariant.images && Array.isArray(defaultVariant.images) && defaultVariant.images.length > 0) {
          defaultPhoto = defaultVariant.images[0];
        }
        
        // If we found ANY photo from the default variant, use it as main image
        // This ensures product card ALWAYS shows the default variant's photo
        if (defaultPhoto) {
          mainImage = defaultPhoto;
          console.log('[useProductSaver] ✅ Using default variant photo as main image:', {
            defaultVariantId: defaultVariantIdKey,
            mainImage,
            source: defaultVariantPhotos[defaultVariantIdKey] ? 'explicit defaultPhoto' : 
                    variantImages[getVariantGroupKey(defaultVariant, mode === 'shopify' ? (item?.rawProduct?.options || null) : null, selectedVariantData)] ? 'variant images' :
                    'variant default images'
          });
        } else {
          console.warn('[useProductSaver] ⚠️ Default variant found but no photo available:', {
            defaultVariantId: defaultVariantIdKey,
            variant: defaultVariant
          });
        }
      } else {
        console.warn('[useProductSaver] ⚠️ Default variant ID specified but variant not found in selectedVariantData:', {
          defaultVariantId,
          selectedVariantIds: selectedVariantData.map(v => v.id || v.shopifyId)
        });
      }
    }
    
    // PRIORITY 2: Only if no default variant photo found, use first selectedImage
    if (!mainImage && selectedImages.length > 0) {
      mainImage = selectedImages[0].url;
      console.log('[useProductSaver] ⚠️ Using first selected image as main image (no default variant photo found):', mainImage);
    }
    
    // Collect additional images (selected images that aren't the main image)
    if (selectedImages.length > 0) {
      additionalImages = selectedImages
        .filter((img) => img.url !== mainImage)
        .map((img) => img.url);
    }
    
    // PRIORITY 3: Last resort fallback to available images or first variant
    if (!mainImage) {
      if (availableImages.length > 0) {
        mainImage = availableImages[0];
        console.log('[useProductSaver] ⚠️ Using first available image as main image (fallback):', mainImage);
      } else if (selectedVariantData.length > 0) {
        const firstVariant = selectedVariantData[0];
        const firstVariantImages = getVariantDefaultImages(firstVariant);
        if (firstVariantImages.length > 0) {
          mainImage = firstVariantImages[0];
          console.log('[useProductSaver] ⚠️ Using first variant default image as main image (fallback):', mainImage);
        }
      }
    }
    
    if (!mainImage) {
      setToastMessage({ type: 'error', text: 'Please select at least one image or variant photo.' });
      return null;
    }

    console.log('[useProductSaver] 📸 Final main image determined:', {
      mainImage,
      defaultVariantId,
      hasDefaultVariantPhoto: defaultVariantId && defaultVariantPhotos[defaultVariantId] ? true : false
    });

    return { mainImage, additionalImages };
  };

  /**
   * Get base price from Shopify variants (first variant's price)
   * Prices come from Shopify only - no manual editing
   */
  const getBasePriceFromShopify = (selectedVariantData) => {
    // For shopify mode, get price from first selected variant
    if (mode === 'shopify' && selectedVariantData.length > 0) {
      const firstVariant = selectedVariantData[0];
      const price = parseFloat(firstVariant?.price || 0);
      if (price > 0) {
        return price;
      }
    }
    
    // For edit mode, use existing basePrice
    if (mode === 'edit' && existingProduct?.basePrice) {
      return parseFloat(existingProduct.basePrice);
    }
    
    // For manual mode, prices should be set in Shopify first
    if (mode === 'manual') {
      setToastMessage({ type: 'error', text: 'Manual products require prices to be set in Shopify first.' });
      return null;
    }
    
    setToastMessage({ type: 'error', text: 'Unable to determine product price from Shopify.' });
    return null;
  };

  /**
   * Get default variant's price for product card display
   * Returns the price from the default variant, or null if not found
   */
  const getDefaultVariantPrice = (selectedVariantData, validatedDefaultVariantId) => {
    if (!validatedDefaultVariantId || !selectedVariantData.length) return null;
    
    const defaultVariant = selectedVariantData.find((v) => (v.id || v.shopifyId) === validatedDefaultVariantId);
    if (!defaultVariant) return null;
    
    // Get price from variant (from webhook)
    return defaultVariant.price != null ? parseFloat(defaultVariant.price) : null;
  };

  /**
   * Build product data object
   */
  const buildProductData = (slug, parsedBasePrice, validatedDefaultVariantId, mainImage, additionalImages, defaultVariantPrice) => {
    const sourceType = mode === 'shopify' ? 'shopify' : 'manual';
    const sourceShopifyId = mode === 'shopify' ? item.shopifyId : (mode === 'edit' ? existingProduct?.sourceShopifyId : null);
    const sourceShopifyItemDocId = mode === 'shopify' ? item.id : (mode === 'edit' ? existingProduct?.sourceShopifyItemDocId : null);
    
    let markets = [];
    let marketsObject = null;
    
    if (mode === 'shopify') {
      if (item.marketsObject && typeof item.marketsObject === 'object') {
        marketsObject = item.marketsObject;
        // Only include markets where available !== false (i.e., available: true or available is undefined)
        // This ensures we only save markets where the product is executable in Shopify
        markets = Object.keys(item.marketsObject).filter(market => {
          const marketData = item.marketsObject[market];
          return marketData && marketData.available !== false;
        });
      } else {
        markets = item.markets || [];
      }
    } else if (mode === 'edit') {
      if (existingProduct?.marketsObject && typeof existingProduct.marketsObject === 'object') {
        marketsObject = existingProduct.marketsObject;
        // Only include markets where available !== false (i.e., available: true or available is undefined)
        // This ensures we only save markets where the product is executable in Shopify
        markets = Object.keys(existingProduct.marketsObject).filter(market => {
          const marketData = existingProduct.marketsObject[market];
          return marketData && marketData.available !== false;
        });
      } else {
        markets = existingProduct?.markets || [];
      }
    }

    const publishedToOnlineStore = mode === 'shopify' 
      ? (item.publishedToOnlineStore !== undefined ? item.publishedToOnlineStore : true)
      : (mode === 'edit' 
        ? (existingProduct?.publishedToOnlineStore !== undefined ? existingProduct.publishedToOnlineStore : true)
        : true);

    const categoryIds = categoryId ? [categoryId] : [];

    return {
      name: displayName,
      slug,
      categoryIds,
      basePrice: parsedBasePrice,
      defaultVariantPrice, // Price from default variant (for product card display)
      description: displayDescription,
      defaultVariantId: validatedDefaultVariantId,
      bulletPoints: bulletPoints.filter(Boolean),
      images: [
        getFullQualityImageUrl(mainImage),
        ...additionalImages.map(getFullQualityImageUrl)
      ].filter(Boolean),
      active: true,
      sourceType,
      ...(sourceShopifyId ? { sourceShopifyId } : {}),
      ...(sourceShopifyItemDocId ? { sourceShopifyItemDocId } : {}),
      ...(markets.length > 0 ? { markets } : {}),
      ...(marketsObject && Object.keys(marketsObject).length > 0 ? { marketsObject } : {}),
      publishedToOnlineStore,
      manuallyEdited: true,
      updatedAt: serverTimestamp(),
      ...(mode !== 'edit' ? { createdAt: serverTimestamp() } : {}),
      storefronts: storefrontSelections,
    };
  };

  /**
   * Save product to all selected storefronts
   */
  const saveProductToStorefronts = async (productData, selectedStorefronts) => {
    const productRefs = [];
    
    for (const storefront of selectedStorefronts) {
      const storefrontProductsCollection = collection(db, ...getCollectionPath('products', storefront));
      
      if (mode === 'edit') {
        let existingDoc = null;
        
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
        
        if (!existingDoc && productData.sourceShopifyId) {
          const existingProductQuery = query(
            storefrontProductsCollection,
            where('sourceShopifyId', '==', productData.sourceShopifyId),
            limit(1)
          );
          const existingSnapshot = await getDocs(existingProductQuery);
          if (!existingSnapshot.empty) {
            existingDoc = existingSnapshot.docs[0];
          }
        }
        
        if (existingDoc) {
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
          const newProductRef = await addDoc(storefrontProductsCollection, productData);
          productRefs.push({ id: newProductRef.id, storefront });
        }
      } else {
        const newProductRef = await addDoc(storefrontProductsCollection, productData);
        productRefs.push({ id: newProductRef.id, storefront });
      }
    }
    
    return productRefs;
  };

  /**
   * Calculate product-level stock status from variants
   */
  const calculateProductStock = (variants) => {
    if (!variants || variants.length === 0) {
      return {
        totalStock: 0,
        hasInStockVariants: false,
        inStockVariantCount: 0,
        totalVariantCount: 0,
      };
    }

    let totalStock = 0;
    let inStockVariantCount = 0;

    variants.forEach((variant) => {
      const stock = variant.inventory_quantity || variant.inventoryQuantity || variant.stock || 0;
      totalStock += stock;
      
      const hasStock = stock > 0;
      const allowsBackorder = variant.inventory_policy === 'continue';
      if (hasStock || allowsBackorder) {
        inStockVariantCount++;
      }
    });

    return {
      totalStock,
      hasInStockVariants: inStockVariantCount > 0,
      inStockVariantCount,
      totalVariantCount: variants.length,
    };
  };

  /**
   * Save variants to all storefronts
   */
  const saveVariants = async (productRefs, selectedVariantData, mainImage, additionalImages) => {
    const productOptions = mode === 'shopify' ? (item?.rawProduct?.options || null) : null;
    for (const variant of selectedVariantData) {
      const variantId = variant.id || variant.shopifyId;
      const groupKey = getVariantGroupKey(variant, productOptions, selectedVariantData);

      let variantImageUrls = variantImages[groupKey] || getSelectedVariantImages(variantId);

      if (mode === 'shopify') {
        if (!variantImageUrls.length) {
          variantImageUrls = getVariantDefaultImages(variant);
        }
        if (!variantImageUrls.length) {
          variantImageUrls = [mainImage, ...additionalImages];
        }
      } else {
        if (!variantImageUrls.length) {
          variantImageUrls = variant.images || [mainImage, ...additionalImages];
        }
      }

      const allMainImages = selectedImages.map((img) => img.url);
      const uniqueVariantImages = [];
      const seen = new Set();
      
      const defaultPhoto = defaultVariantPhotos[variantId];
      
      if (defaultPhoto && variantImageUrls.includes(defaultPhoto)) {
        uniqueVariantImages.push(defaultPhoto);
        seen.add(defaultPhoto);
      }
      
      variantImageUrls.forEach((url) => {
        if (url && !seen.has(url)) {
          uniqueVariantImages.push(url);
          seen.add(url);
        }
      });
      
      allMainImages.forEach((url) => {
        if (url && !seen.has(url)) {
          uniqueVariantImages.push(url);
          seen.add(url);
        }
      });
      
      // Intelligently map options to color/size/type based on option names
      let normalizedColor = null;
      let normalizedSize = null;
      let normalizedType = null;
      
      if (mode === 'shopify' && productOptions && Array.isArray(productOptions)) {
        // Try to extract color and size using option names
        normalizedColor = getVariantColor(variant, productOptions);
        normalizedSize = getVariantSize(variant, productOptions);
        
        // If no color or size found, find the varying option and map it to type
        if (!normalizedColor && !normalizedSize) {
          const allVariants = selectedVariantData;
          const varyingOptionIndex = getVaryingOptionIndex(productOptions, allVariants);
          
          if (varyingOptionIndex !== null) {
            const varyingOption = productOptions[varyingOptionIndex];
            const optionValue = getVariantOptionValue(variant, varyingOptionIndex);
            
            // Map based on option name if it's not Color/Size
            if (varyingOption?.name) {
              const optionName = varyingOption.name.toLowerCase();
              if (/color|colour/i.test(optionName)) {
                normalizedColor = optionValue;
              } else if (/size/i.test(optionName)) {
                normalizedSize = optionValue;
              } else {
                // For other options (Package, Weight, etc.), map to type
                normalizedType = optionValue;
              }
            } else if (optionValue) {
              normalizedType = optionValue;
            }
          }
        }
        
        // Also check for type if there's a second varying option
        if (!normalizedType && productOptions.length > 1) {
          // If we already have color or size, the other varying option might be type
          const allVariants = selectedVariantData;
          for (let i = 0; i < productOptions.length; i++) {
            const opt = productOptions[i];
            if (opt?.name && !/color|colour|size/i.test(opt.name)) {
              const optionValue = getVariantOptionValue(variant, i);
              if (optionValue) {
                normalizedType = optionValue;
                break;
              }
            }
          }
        }
      } else {
        // Manual mode - use existing fields
        normalizedColor = variant.color || null;
        normalizedSize = variant.size || null;
        normalizedType = variant.type || null;
      }

      // Construct variant name from variant data
      // Always normalize to "color / size" format for consistent grouping
      // Uses Shopify options ONLY - assumes options are always available
      let variantName = null;
      if (mode === 'shopify') {
        // Use normalizeVariantName which uses Shopify options
        // This requires productOptions to be available
        if (productOptions && Array.isArray(productOptions) && productOptions.length > 0) {
          variantName = normalizeVariantName(variant, productOptions);
        }
        
        // If normalization didn't work, construct from selectedOptions directly
        if (!variantName && variant.selectedOptions && Array.isArray(variant.selectedOptions) && variant.selectedOptions.length > 0) {
          // Reorder selectedOptions to put color first, size second
          const colorOptionIndex = productOptions?.findIndex(opt => opt.name && /color|colour/i.test(opt.name)) ?? -1;
          const sizeOptionIndex = productOptions?.findIndex(opt => opt.name && /size/i.test(opt.name)) ?? -1;
          
          const orderedOptions = [];
          if (colorOptionIndex >= 0 && variant.selectedOptions[colorOptionIndex]) {
            orderedOptions.push(cleanBrackets(variant.selectedOptions[colorOptionIndex].value));
          }
          if (sizeOptionIndex >= 0 && variant.selectedOptions[sizeOptionIndex]) {
            orderedOptions.push(cleanBrackets(variant.selectedOptions[sizeOptionIndex].value));
          }
          // Add any remaining options
          variant.selectedOptions.forEach((opt, idx) => {
            if (idx !== colorOptionIndex && idx !== sizeOptionIndex && opt.value) {
              orderedOptions.push(cleanBrackets(opt.value));
            }
          });
          
          variantName = orderedOptions.length > 0 ? orderedOptions.join(' / ') : null;
        }
      } else {
        // Manual mode: construct as "color / size" (already in correct order)
        const nameParts = [];
        if (normalizedColor) nameParts.push(normalizedColor);
        if (variant.type) nameParts.push(variant.type);
        if (normalizedSize) nameParts.push(normalizedSize);
        variantName = nameParts.length > 0 ? nameParts.join(' / ') : null;
      }
      if (!variantName && variant.variantName) {
        // If variant already has a variantName, try to normalize it
        const tempVariant = { ...variant, title: variant.variantName };
        variantName = normalizeVariantName(tempVariant, productOptions) || variant.variantName;
      }
      variantName = cleanVariantName(variantName);

      const inventoryLevels = mode === 'shopify' && variant.inventory_levels
        ? variant.inventory_levels
        : (variant.inventory_levels || []);

      // Get variant price from Shopify
      const variantPrice = mode === 'shopify' 
        ? (variant.price != null ? parseFloat(variant.price) : null)
        : (mode === 'edit' && variant.price != null ? parseFloat(variant.price) : null);

      // Build variant data object
      const variantDataRaw = {
        size: normalizedSize || null,
        color: normalizedColor || null,
        type: normalizedType || null,
        variantName: variantName || null,
        sku: variant.sku || null,
        stock: variant.inventory_quantity || variant.inventoryQuantity || variant.stock || 0,
        price: Number.isFinite(variantPrice) ? variantPrice : null, // Save actual price from Shopify
        images: uniqueVariantImages.map(getFullQualityImageUrl).filter(Boolean),
        defaultPhoto: defaultPhoto ? getFullQualityImageUrl(defaultPhoto) : (uniqueVariantImages.length > 0 ? getFullQualityImageUrl(uniqueVariantImages[0]) : null),
        updatedAt: serverTimestamp(),
        ...(mode !== 'edit' || !variant.id ? { createdAt: serverTimestamp() } : {}),
      };

      // Only include inventory_levels if it has values
      if (inventoryLevels.length > 0) {
        variantDataRaw.inventory_levels = inventoryLevels;
      }

      // Add Shopify-specific fields if they exist
      if (variant.shopifyVariantId) {
        variantDataRaw.shopifyVariantId = variant.shopifyVariantId.toString();
      } else if (mode === 'shopify' && variant.id) {
        variantDataRaw.shopifyVariantId = variant.id.toString();
      }

      if (variant.inventory_item_id || variant.shopifyInventoryItemId) {
        variantDataRaw.shopifyInventoryItemId = variant.inventory_item_id || variant.shopifyInventoryItemId;
      }

      // Remove all undefined values (Firestore doesn't allow undefined)
      const variantData = Object.fromEntries(
        Object.entries(variantDataRaw).filter(([_, value]) => value !== undefined)
      );

      for (const productRefInfo of productRefs) {
        if (mode === 'edit' && variant.id) {
          const variantRef = doc(db, ...getDocumentPath('products', productRefInfo.id, productRefInfo.storefront), 'variants', variant.id);
          try {
            await updateDoc(variantRef, variantData);
          } catch (error) {
            await setDoc(variantRef, variantData);
          }
        } else {
          await addDoc(
            collection(db, ...getDocumentPath('products', productRefInfo.id, productRefInfo.storefront), 'variants'),
            variantData
          );
        }
      }
    }
  };

  /**
   * Update categories with product references
   * Silently creates category in storefronts where it doesn't exist
   */
  const updateCategories = async (productRefs, selectedStorefronts) => {
    if (!categoryId || productRefs.length === 0) return;

    console.log('[useProductSaver] updateCategories:', {
      categoryId,
      selectedStorefronts,
      productRefsCount: productRefs.length,
    });

    // First, try to find category data in selected storefronts
    let categoryData = null;
    let categoryFoundInStorefront = null;
    
    for (const storefront of selectedStorefronts) {
      try {
        const categoryDoc = await getDoc(doc(db, ...getDocumentPath('categories', categoryId, storefront)));
        if (categoryDoc.exists()) {
          categoryData = categoryDoc.data();
          categoryFoundInStorefront = storefront;
          console.log('[useProductSaver] Found category in storefront:', storefront, categoryData);
          break;
        }
      } catch (e) {
        // Category doesn't exist in this storefront, continue
      }
    }

    // If not found in selected storefronts, try all available storefronts
    if (!categoryData) {
      const allStorefrontsToCheck = [...new Set([selectedWebsite, ...availableWebsites])];
      for (const storefront of allStorefrontsToCheck) {
        try {
          const categoryDoc = await getDoc(doc(db, ...getDocumentPath('categories', categoryId, storefront)));
          if (categoryDoc.exists()) {
            categoryData = categoryDoc.data();
            categoryFoundInStorefront = storefront;
            console.log('[useProductSaver] Found category in other storefront:', storefront, categoryData);
            break;
          }
        } catch (e) {
          // Category doesn't exist in this storefront, continue
        }
      }
    }

    if (!categoryData) {
      console.warn(`[useProductSaver] Category ${categoryId} not found in any storefront. Cannot create category automatically.`);
      setToastMessage({ 
        type: 'error', 
        text: `Category not found. Please ensure the category exists in at least one storefront.` 
      });
      return;
    }

    // Now ensure category exists in all selected storefronts
    for (const storefront of selectedStorefronts) {
      const categoryRef = doc(db, ...getDocumentPath('categories', categoryId, storefront));
      const categoryDoc = await getDoc(categoryRef);
      
      if (!categoryDoc.exists()) {
        // Category doesn't exist in this storefront - create it silently
        const categorySlug = categoryData.slug || slugify(categoryData.name || 'Unnamed Category') || categoryId;
        const newCategoryData = {
          name: categoryData.name || 'Unnamed Category',
          slug: categorySlug,
          description: categoryData.description || '',
          imageUrl: categoryData.imageUrl || null,
          active: categoryData.active !== false,
          storefronts: selectedStorefronts,
          previewProductIds: [],
          metrics: {
            totalViews: 0,
            lastViewedAt: null,
          },
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };
        
        console.log('[useProductSaver] Creating category in storefront:', storefront, newCategoryData);
        await setDoc(categoryRef, newCategoryData);
        console.log('[useProductSaver] ✅ Category created silently in storefront:', storefront);
      } else {
        // Category exists - update storefronts list if needed
        const existingData = categoryDoc.data();
        const existingStorefronts = Array.isArray(existingData.storefronts) ? existingData.storefronts : [];
        const needsUpdate = !selectedStorefronts.every(sf => existingStorefronts.includes(sf));
        
        if (needsUpdate) {
          const updatedStorefronts = [...new Set([...existingStorefronts, ...selectedStorefronts])];
          console.log('[useProductSaver] Updating category storefronts:', {
            storefront,
            existingStorefronts,
            updatedStorefronts,
          });
          await updateDoc(categoryRef, {
            storefronts: updatedStorefronts,
            updatedAt: serverTimestamp(),
          });
        }
      }

      // Add product to category's previewProductIds
      const currentCategoryDoc = await getDoc(categoryRef);
      const currentData = currentCategoryDoc.exists() ? currentCategoryDoc.data() : {};
      const currentPreviewIds = Array.isArray(currentData.previewProductIds) ? currentData.previewProductIds : [];
      
      const productIdsToAdd = productRefs
        .filter(ref => ref.storefront === storefront)
        .map(ref => ref.id)
        .filter(id => !currentPreviewIds.includes(id));
      
      if (productIdsToAdd.length > 0) {
        console.log('[useProductSaver] Adding products to category preview:', {
          storefront,
          productIdsToAdd,
        });
        await updateDoc(categoryRef, {
          previewProductIds: arrayUnion(...productIdsToAdd),
          updatedAt: serverTimestamp(),
        });
      }
    }
  };

  /**
   * Update shopifyItems collection to reflect admin changes
   * This ensures webhooks know which storefronts contain this product
   * and keeps shopifyItems in sync with actual product state
   */
  const updateShopifyItem = async (selectedStorefronts) => {
    // Get the shopifyItem document ID
    let shopifyItemId = null;
    let shopifyItemRef = null;
    
    if (mode === 'shopify' && item?.id) {
      // For shopify mode, use item.id (which is the shopifyItems document ID)
      shopifyItemId = item.id;
      shopifyItemRef = doc(db, ...getDocumentPath('shopifyItems', shopifyItemId));
    } else if (mode === 'edit' && existingProduct?.sourceShopifyItemDocId) {
      // For edit mode, use sourceShopifyItemDocId if available
      shopifyItemId = existingProduct.sourceShopifyItemDocId;
      shopifyItemRef = doc(db, ...getDocumentPath('shopifyItems', shopifyItemId));
    } else if (mode === 'edit' && existingProduct?.sourceShopifyId) {
      // For edit mode, try to find by sourceShopifyId
      const shopifyItemsCollection = collection(db, 'shopifyItems');
      const querySnapshot = await getDocs(
        query(shopifyItemsCollection, where('shopifyId', '==', existingProduct.sourceShopifyId.toString()), limit(1))
      );
      if (!querySnapshot.empty) {
        shopifyItemId = querySnapshot.docs[0].id;
        shopifyItemRef = doc(db, ...getDocumentPath('shopifyItems', shopifyItemId));
      }
    }
    
    // If we can't find the shopifyItem, skip update (manual products don't have shopifyItems)
    if (!shopifyItemRef) {
      return;
    }

    const shopifyItemDoc = await getDoc(shopifyItemRef);
    if (!shopifyItemDoc.exists()) {
      console.warn(`[useProductSaver] shopifyItem ${shopifyItemId} not found, skipping update`);
      return;
    }

    const existingData = shopifyItemDoc.data();
    const existingStorefronts = existingData.storefronts || [];
    
    // Calculate which storefronts were added/removed
    const newStorefronts = selectedStorefronts.filter(sf => !existingStorefronts.includes(sf));
    const removedStorefronts = existingStorefronts.filter(sf => !selectedStorefronts.includes(sf));
    const newStorefrontCount = newStorefronts.length;

    // Build update data
    const updateData = {
      // Update storefronts array to match actual state (not just add)
      storefronts: selectedStorefronts,
      // Add to processedStorefronts (never remove, as it's historical)
      processedStorefronts: arrayUnion(...selectedStorefronts),
      hasProcessedStorefronts: selectedStorefronts.length > 0,
      updatedAt: serverTimestamp(),
    };

    // Update storefrontUsageCount if new storefronts were added
    if (newStorefrontCount > 0) {
      const currentCount = existingData.storefrontUsageCount || 0;
      updateData.storefrontUsageCount = currentCount + newStorefrontCount;
    }

    // Update category information if available
    // Note: We store the category ID from the first storefront where the product exists
    // This is informational - webhooks don't use this for category matching
    if (categoryId) {
      // Try to preserve existing matchedCategorySlug if it exists
      // Otherwise, we could look it up, but for now we'll just note that category was set
      updateData.lastCategoryId = categoryId;
    }

    await setDoc(shopifyItemRef, updateData, { merge: true });
    
    console.log(`[useProductSaver] Updated shopifyItem ${shopifyItemId}:`, {
      storefronts: selectedStorefronts,
      added: newStorefronts,
      removed: removedStorefronts,
      categoryId,
    });
  };

  /**
   * Main save function
   */
  const save = async () => {
    if (!validateProductData()) {
      return;
    }

    const slug = displayName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    setSaving(true);
    setLoading(true);
    setError(null);

    try {
      const selectedStorefronts = storefrontSelections;
      
      if (!(await checkUniqueness(slug, selectedStorefronts))) {
        setSaving(false);
        setLoading(false);
        return;
      }

      let validatedDefaultVariantId = defaultVariantId && selectedVariants.includes(defaultVariantId)
        ? defaultVariantId
        : null;
      
      if (!validatedDefaultVariantId && selectedVariants.length > 0) {
        validatedDefaultVariantId = selectedVariants[0];
      }

      const selectedVariantData = mode === 'shopify'
        ? allVariants.filter((v) => selectedVariants.includes(v.id || v.shopifyId))
        : manualVariants.filter((v) => selectedVariants.includes(v.id || v.shopifyId));

      const imageResult = determineMainImage(selectedVariantData);
      if (!imageResult) {
        setSaving(false);
        setLoading(false);
        return;
      }

      const { mainImage, additionalImages } = imageResult;

      // Get base price from Shopify (prices are read-only, come from Shopify)
      const parsedBasePrice = getBasePriceFromShopify(selectedVariantData);
      if (!parsedBasePrice) {
        setSaving(false);
        setLoading(false);
        return;
      }

      // Get default variant's price for product card display (falls back to basePrice if not found)
      const defaultVariantPrice = getDefaultVariantPrice(selectedVariantData, validatedDefaultVariantId) || parsedBasePrice;
      
      const productData = buildProductData(slug, parsedBasePrice, validatedDefaultVariantId, mainImage, additionalImages, defaultVariantPrice);
      const productRefs = await saveProductToStorefronts(productData, selectedStorefronts);
      await saveVariants(productRefs, selectedVariantData, mainImage, additionalImages);
      
      // Calculate and update product-level stock after variants are saved
      const stockStatus = calculateProductStock(selectedVariantData);
      for (const productRefInfo of productRefs) {
        const productRef = doc(db, ...getDocumentPath('products', productRefInfo.id, productRefInfo.storefront));
        await updateDoc(productRef, {
          totalStock: stockStatus.totalStock,
          hasInStockVariants: stockStatus.hasInStockVariants,
          inStockVariantCount: stockStatus.inStockVariantCount,
          totalVariantCount: stockStatus.totalVariantCount,
          defaultVariantPrice, // Keep in sync (webhooks might update variant prices)
          updatedAt: serverTimestamp(),
        });
      }
      
      await updateCategories(productRefs, selectedStorefronts);
      await updateShopifyItem(selectedStorefronts);

      setToastMessage({ 
        type: 'success', 
        text: mode === 'edit' ? 'Product updated successfully!' : 'Product created successfully!' 
      });
      setTimeout(() => {
        onSaved();
      }, 1500);
    } catch (error) {
      console.error(`Failed to ${mode === 'edit' ? 'update' : 'create'} product:`, error);
      setError(error);
      setToastMessage({ 
        type: 'error', 
        text: `Failed to ${mode === 'edit' ? 'update' : 'create'} product. Please try again.` 
      });
    } finally {
      setSaving(false);
      setLoading(false);
    }
  };

  return { save, saving, error };
}



