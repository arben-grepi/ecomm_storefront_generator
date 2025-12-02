import { useEffect, useState } from 'react';
import { doc, getDoc, getDocs, collection } from 'firebase/firestore';
import { getCollectionPath, getDocumentPath } from '@/lib/store-collections';
import { cleanVariantName } from '@/lib/variant-utils';

/**
 * Custom hook to load existing product data when editing
 */
export function useProductLoader({
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
}) {
  const [loading, setInternalLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (mode !== 'edit' || !existingProduct || !db) return;

    const loadExistingProduct = async () => {
      try {
        setInternalLoading(true);
        setLoading?.(true);
        setError(null);
        
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
          setToastMessage?.({ type: 'error', text: 'Product not found.' });
          setInternalLoading(false);
          setLoading?.(false);
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
              setEditModeShopifyItem?.(shopifyItemData);
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
          variantName: cleanVariantName(v.variantName || null), // Preserve variantName for display (cleaned)
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

        setInternalLoading(false);
        setLoading?.(false);
      } catch (error) {
        console.error('Failed to load product:', error);
        setError(error);
        setToastMessage?.({ type: 'error', text: 'Failed to load product data.' });
        setInternalLoading(false);
        setLoading?.(false);
      }
    };

    loadExistingProduct();
  }, [
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
  ]);

  return { loading, error };
}

