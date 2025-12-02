import { useState } from 'react';
import { doc, getDoc, getDocs, setDoc, serverTimestamp, collection, addDoc, updateDoc, query, where, limit, deleteDoc, arrayUnion } from 'firebase/firestore';
import { getCollectionPath, getDocumentPath } from '@/lib/store-collections';
import { getVariantColor, getVariantSize, getVariantGroupKey, cleanVariantName } from '@/lib/variant-utils';
import { getFullQualityImageUrl } from '@/lib/image-utils';

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
   */
  const determineMainImage = (selectedVariantData) => {
    let mainImage = null;
    let additionalImages = [];
    
    if (selectedImages.length > 0) {
      mainImage = selectedImages.find((img) => img.isMain)?.url || selectedImages[0].url;
      additionalImages = selectedImages
        .filter((img) => !img.isMain)
        .map((img) => img.url);
    } else if (defaultVariantId && selectedVariantData.length > 0) {
      const defaultVariant = selectedVariantData.find((v) => (v.id || v.shopifyId) === defaultVariantId);
      if (defaultVariant) {
        const defaultVariantIdKey = defaultVariant.id || defaultVariant.shopifyId;
        const defaultPhoto = defaultVariantPhotos[defaultVariantIdKey];
        if (defaultPhoto) {
          mainImage = defaultPhoto;
        } else {
          const variantImageUrls = variantImages[getVariantGroupKey(defaultVariant)] || getSelectedVariantImages(defaultVariantIdKey);
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
    
    if (!mainImage) {
      if (availableImages.length > 0) {
        mainImage = availableImages[0];
      } else if (selectedVariantData.length > 0) {
        const firstVariant = selectedVariantData[0];
        const firstVariantImages = getVariantDefaultImages(firstVariant);
        if (firstVariantImages.length > 0) {
          mainImage = firstVariantImages[0];
        }
      }
    }
    
    if (!mainImage) {
      setToastMessage({ type: 'error', text: 'Please select at least one image or variant photo.' });
      return null;
    }

    return { mainImage, additionalImages };
  };

  /**
   * Validate and parse base price
   */
  const validateBasePrice = (selectedVariantData) => {
    let parsedBasePrice = null;
    if (basePriceInput.trim()) {
      const parsed = parseFloat(basePriceInput);
      if (Number.isNaN(parsed) || parsed <= 0) {
        setToastMessage({ type: 'error', text: 'Please enter a valid base price greater than 0.' });
        return null;
      }
      parsedBasePrice = parsed;
    }

    if (!parsedBasePrice) {
      if (mode === 'manual' || mode === 'edit') {
        setToastMessage({ type: 'error', text: 'Please enter a base price for this product.' });
        return null;
      }

      const fallbackPrice = selectedVariantData.length > 0
        ? parseFloat(selectedVariantData[0]?.price || selectedVariantData[0]?.priceOverride || 0)
        : (existingProduct?.basePrice || 0);

      if (!fallbackPrice || Number.isNaN(fallbackPrice) || fallbackPrice <= 0) {
        setToastMessage({ type: 'error', text: 'Please enter a base price for this product.' });
        return null;
      }

      parsedBasePrice = fallbackPrice;
      setBasePriceInput(fallbackPrice.toString());
    }

    return parsedBasePrice;
  };

  /**
   * Build product data object
   */
  const buildProductData = (slug, parsedBasePrice, validatedDefaultVariantId, mainImage, additionalImages) => {
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
   * Save variants to all storefronts
   */
  const saveVariants = async (productRefs, selectedVariantData, mainImage, additionalImages) => {
    for (const variant of selectedVariantData) {
      const variantId = variant.id || variant.shopifyId;
      const groupKey = getVariantGroupKey(variant);

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
      
      const normalizedColor = mode === 'shopify' 
        ? getVariantColor(variant) 
        : (variant.color || null);
      const normalizedSize = mode === 'shopify'
        ? getVariantSize(variant)
        : (variant.size || null);

      // Construct variant name from variant data
      let variantName = null;
      if (mode === 'shopify') {
        variantName = variant.title || variant.name || null;
        if (!variantName && variant.selectedOptions && Array.isArray(variant.selectedOptions) && variant.selectedOptions.length > 0) {
          variantName = variant.selectedOptions.map((opt) => opt.value).join(' / ');
        }
      } else {
        const nameParts = [];
        if (normalizedColor) nameParts.push(normalizedColor);
        if (variant.type) nameParts.push(variant.type);
        if (normalizedSize) nameParts.push(normalizedSize);
        variantName = nameParts.length > 0 ? nameParts.join(' / ') : null;
      }
      if (!variantName && variant.variantName) {
        variantName = variant.variantName;
      }
      variantName = cleanVariantName(variantName);

      const inventoryLevels = mode === 'shopify' && variant.inventory_levels
        ? variant.inventory_levels
        : (variant.inventory_levels || []);

      const variantData = {
        size: normalizedSize || null,
        color: normalizedColor || null,
        variantName: variantName || null,
        sku: variant.sku || null,
        stock: variant.inventory_quantity || variant.inventoryQuantity || variant.stock || 0,
        inventory_levels: inventoryLevels.length > 0 ? inventoryLevels : undefined,
        priceOverride: variantPriceOverrides[variantId] !== undefined 
          ? (variantPriceOverrides[variantId] === '' ? null : parseFloat(variantPriceOverrides[variantId]) || null)
          : (parseFloat(variant.price || variant.priceOverride || 0) || null),
        images: uniqueVariantImages.map(getFullQualityImageUrl).filter(Boolean),
        defaultPhoto: defaultPhoto ? getFullQualityImageUrl(defaultPhoto) : (uniqueVariantImages.length > 0 ? getFullQualityImageUrl(uniqueVariantImages[0]) : null),
        ...(variant.shopifyVariantId
          ? { shopifyVariantId: variant.shopifyVariantId.toString() }
          : (mode === 'shopify' && variant.id
            ? { shopifyVariantId: variant.id.toString() }
            : {})),
        ...(variant.inventory_item_id || variant.shopifyInventoryItemId
          ? { shopifyInventoryItemId: variant.inventory_item_id || variant.shopifyInventoryItemId }
          : {}),
        updatedAt: serverTimestamp(),
        ...(mode !== 'edit' || !variant.id ? { createdAt: serverTimestamp() } : {}),
      };

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
   */
  const updateCategories = async (productRefs, selectedStorefronts) => {
    if (!categoryId || productRefs.length === 0) return;

    let categoryData = null;
    for (const storefront of [selectedWebsite, ...availableWebsites]) {
      try {
        const categoryDoc = await getDoc(doc(db, ...getDocumentPath('categories', categoryId, storefront)));
        if (categoryDoc.exists()) {
          categoryData = categoryDoc.data();
          break;
        }
      } catch (e) {
        // Category doesn't exist in this storefront, continue
      }
    }

    if (!categoryData) {
      console.warn(`Category ${categoryId} not found in any storefront. Skipping category updates.`);
      return;
    }

    for (const storefront of selectedStorefronts) {
      const categoryRef = doc(db, ...getDocumentPath('categories', categoryId, storefront));
      const categoryDoc = await getDoc(categoryRef);
      
      if (!categoryDoc.exists()) {
        const categorySlug = categoryData.slug || categoryId;
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
        await setDoc(categoryRef, newCategoryData);
      } else {
        const existingData = categoryDoc.data();
        const existingStorefronts = Array.isArray(existingData.storefronts) ? existingData.storefronts : [];
        const needsUpdate = !selectedStorefronts.every(sf => existingStorefronts.includes(sf));
        
        if (needsUpdate) {
          await updateDoc(categoryRef, {
            storefronts: selectedStorefronts,
            updatedAt: serverTimestamp(),
          });
        }
      }

      const currentCategoryDoc = await getDoc(categoryRef);
      const currentData = currentCategoryDoc.exists() ? currentCategoryDoc.data() : {};
      const currentPreviewIds = Array.isArray(currentData.previewProductIds) ? currentData.previewProductIds : [];
      
      const productIdsToAdd = productRefs
        .filter(ref => ref.storefront === storefront)
        .map(ref => ref.id)
        .filter(id => !currentPreviewIds.includes(id));
      
      if (productIdsToAdd.length > 0) {
        await updateDoc(categoryRef, {
          previewProductIds: arrayUnion(...productIdsToAdd),
          updatedAt: serverTimestamp(),
        });
      }
    }
  };

  /**
   * Mark Shopify item as processed
   */
  const markShopifyItemProcessed = async (selectedStorefronts) => {
    if (mode !== 'shopify' || !item?.id) return;

    const shopifyItemRef = doc(db, ...getDocumentPath('shopifyItems', item.id));
    const shopifyItemDoc = await getDoc(shopifyItemRef);
    const existingStorefronts = shopifyItemDoc.exists() 
      ? (shopifyItemDoc.data().storefronts || [])
      : [];
    
    const newStorefronts = selectedStorefronts.filter(
      sf => !existingStorefronts.includes(sf)
    );
    const newStorefrontCount = newStorefronts.length;

    const updateData = {
      processedStorefronts: arrayUnion(...selectedStorefronts),
      storefronts: arrayUnion(...selectedStorefronts),
      hasProcessedStorefronts: true, // Mark as processed for efficient querying
      updatedAt: serverTimestamp(),
    };

    if (newStorefrontCount > 0) {
      const currentCount = shopifyItemDoc.exists() 
        ? (shopifyItemDoc.data().storefrontUsageCount || 0)
        : 0;
      updateData.storefrontUsageCount = currentCount + newStorefrontCount;
    }

    await setDoc(shopifyItemRef, updateData, { merge: true });
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

      const parsedBasePrice = validateBasePrice(selectedVariantData);
      if (!parsedBasePrice) {
        setSaving(false);
        setLoading(false);
        return;
      }

      const productData = buildProductData(slug, parsedBasePrice, validatedDefaultVariantId, mainImage, additionalImages);
      const productRefs = await saveProductToStorefronts(productData, selectedStorefronts);
      await saveVariants(productRefs, selectedVariantData, mainImage, additionalImages);
      await updateCategories(productRefs, selectedStorefronts);
      await markShopifyItemProcessed(selectedStorefronts);

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

