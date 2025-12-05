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
        let shopifyItemData = null;
        if (productData.sourceShopifyItemDocId) {
          try {
            const shopifyItemDoc = await getDoc(
              doc(db, ...getCollectionPath('shopifyItems'), productData.sourceShopifyItemDocId)
            );
            if (shopifyItemDoc.exists()) {
              shopifyItemData = { id: shopifyItemDoc.id, ...shopifyItemDoc.data() };
              console.log('[useProductLoader] Loaded shopifyItem:', {
                id: shopifyItemData.id,
                hasRawProduct: !!shopifyItemData.rawProduct,
                rawProductImagesCount: shopifyItemData.rawProduct?.images?.length || 0,
                imageUrlsCount: shopifyItemData.imageUrls?.length || 0,
                imagesCount: shopifyItemData.images?.length || 0,
              });
              setEditModeShopifyItem?.(shopifyItemData);
            }
          } catch (error) {
            console.warn('[useProductLoader] Failed to load shopifyItem for editing:', error);
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

        // Get shopifyItem rawProduct for variant matching
        const shopifyRawProduct = shopifyItemData?.rawProduct || null;
        const shopifyVariants = shopifyRawProduct?.variants || [];
        
        console.log('[useProductLoader] Processing variants:', {
          variantsCount: variantsData.length,
          shopifyVariantsCount: shopifyVariants.length,
          hasRawProduct: !!shopifyRawProduct,
          rawProductImagesCount: shopifyRawProduct?.images?.length || 0,
        });

        // Convert existing variants to format compatible with modal
        // Preserve shopifyVariantId and shopifyInventoryItemId from Firestore
        // Match with shopifyItem variants to get full variant data including images
        const convertedVariants = variantsData.map((v) => {
          // Try to find matching Shopify variant by shopifyVariantId
          const matchingShopifyVariant = shopifyVariants.find(
            sv => sv.id?.toString() === v.shopifyVariantId?.toString() || 
                   sv.id?.toString() === v.shopifyInventoryItemId?.toString()
          );
          
          console.log('[useProductLoader] Converting variant:', {
            firestoreId: v.id,
            shopifyVariantId: v.shopifyVariantId,
            foundMatchingShopifyVariant: !!matchingShopifyVariant,
            matchingShopifyVariantId: matchingShopifyVariant?.id,
            matchingShopifyVariantImageId: matchingShopifyVariant?.image_id,
          });
          
          return {
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
            images: v.images || matchingShopifyVariant?.images || [], // Use Firestore images or Shopify variant images
            variantName: cleanVariantName(v.variantName || null), // Preserve variantName for display (cleaned)
            // Add Shopify variant data if available
            ...(matchingShopifyVariant ? {
              image_id: matchingShopifyVariant.image_id,
              imageId: matchingShopifyVariant.image_id,
              selectedOptions: matchingShopifyVariant.selectedOptions || [],
            } : {}),
          };
        });

        setManualVariants(convertedVariants);
        setSelectedVariants(convertedVariants.map((v) => v.id));

        // Set form fields
        setDisplayName(productData.name || '');
        setDisplayDescription(productData.description || '');
        setBulletPoints(productData.bulletPoints || []);
        setCategoryId(productData.categoryId || productData.categoryIds?.[0] || '');
        // Base price is read-only (comes from Shopify), so setBasePriceInput is optional
        if (setBasePriceInput) {
          setBasePriceInput(
            productData.basePrice !== undefined && productData.basePrice !== null
              ? productData.basePrice.toString()
              : ''
          );
        }
        setDefaultVariantId(productData.defaultVariantId || null);

        // Collect ALL images from shopifyItem (product images + all variant images)
        // Then preselect only the images that are currently saved in Firestore
        let allAvailableImages = [];
        
        if (shopifyItemData) {
          const shopifyImages = [];
          
          // 1. Get product-level images from imageUrls array (processed images)
          if (Array.isArray(shopifyItemData.imageUrls)) {
            shopifyImages.push(...shopifyItemData.imageUrls);
          }
          
          // 2. Get ALL images from rawProduct.images (includes product images + variant images)
          if (shopifyItemData.rawProduct?.images && Array.isArray(shopifyItemData.rawProduct.images)) {
            const rawImages = shopifyItemData.rawProduct.images
              .map(img => img.src || img.url)
              .filter(Boolean);
            shopifyImages.push(...rawImages);
          }
          
          // 3. Check images array (fallback)
          if (Array.isArray(shopifyItemData.images)) {
            shopifyImages.push(...shopifyItemData.images);
          }
          
          // Remove duplicates - this gives us ALL available images (product + variants)
          allAvailableImages = Array.from(new Set(shopifyImages.filter(Boolean)));
          
          console.log('[useProductLoader] Collected all images from shopifyItem:', {
            totalImagesCount: allAvailableImages.length,
            productImagesCount: productData.images?.length || 0,
          });
        } else {
          // No shopifyItem, use product images as available
          allAvailableImages = productData.images || [];
          console.log('[useProductLoader] No shopifyItem, using product images as available:', allAvailableImages.length);
        }
        
        // Get currently saved images from Firestore
        const currentProductImages = productData.images || [];
        
        // Create image objects: only include saved images in selectedImages
        // The availableImages in ProductModal will include all images from shopifyItem
        // But selectedImages should only contain the images that are currently saved
        const imageObjects = currentProductImages.map((url, idx) => ({
          url,
          isMain: idx === 0, // First saved image is the main image
        }));
        
        console.log('[useProductLoader] Setting selectedImages (only saved images):', {
          savedImagesCount: imageObjects.length,
          mainImage: imageObjects.find(img => img.isMain)?.url,
          savedImageUrls: currentProductImages,
          totalAvailableImagesFromShopify: allAvailableImages.length,
        });
        
        setSelectedImages(imageObjects);

        // Set variant images and default photos from shopifyItem
        // This should match how shopify mode initializes variant images (see useShopifyItemInitializer)
        const variantImagesMap = {};
        const defaultPhotosMap = {};
        
        // Helper function to get variant images from shopifyItem (similar to getVariantDefaultImages in ProductModal)
        const getVariantImagesFromShopify = (variant) => {
          const images = [];
          const variantImageId = variant.image_id || variant.imageId;
          const rawProduct = shopifyRawProduct;
          
          if (!rawProduct?.images) {
            console.log('[useProductLoader] No rawProduct images for variant:', variant.id);
            return variant.images || []; // Fallback to Firestore images
          }
          
          // Get the Shopify variant ID to match with image variant_ids
          // variant_ids in images are Shopify variant IDs
          const shopifyVariantIdToMatch = variant.shopifyVariantId || variant.shopifyId || variant.id;
          
          console.log('[useProductLoader] Getting variant images from shopify:', {
            variantId: variant.id,
            shopifyVariantId: variant.shopifyVariantId,
            shopifyVariantIdToMatch,
            variantImageId,
            rawProductImagesCount: rawProduct.images.length,
          });
          
          // Prioritize the variant-specific photo (from image_id) - it should be first
          if (variantImageId) {
            const variantImage = rawProduct.images.find((img) => img.id === variantImageId);
            if (variantImage?.src) {
              images.push(variantImage.src);
              console.log('[useProductLoader] Found variant image by image_id:', variantImage.src);
            }
          }

          // Then add other variant-specific images
          // Match by Shopify variant ID (variant_ids in images are Shopify variant IDs)
          const variantSpecificImages = rawProduct.images
            .filter((img) => {
              const imgVariantIds = img.variant_ids || [];
              // Match by Shopify variant ID
              const matchesVariant = imgVariantIds.some((vid) => 
                vid?.toString() === shopifyVariantIdToMatch?.toString()
              );
              return matchesVariant && img.id !== variantImageId;
            })
            .map((img) => img.src)
            .filter(Boolean);

          console.log('[useProductLoader] Found variant-specific images:', variantSpecificImages.length, variantSpecificImages);
          images.push(...variantSpecificImages);
          
          // If no shopify images found, use Firestore images
          if (images.length === 0 && variant.images && variant.images.length > 0) {
            console.log('[useProductLoader] No shopify images, using Firestore images:', variant.images);
            return variant.images;
          }
          
          const result = Array.from(new Set(images.filter(Boolean)));
          console.log('[useProductLoader] Final variant images:', result.length, result);
          return result;
        };
        
        convertedVariants.forEach((variant) => {
          // Use Firestore images as the selected images (what was actually saved)
          // These are the images that should appear as "selected" in the UI
          const savedVariantImages = variant.images || [];
          
          console.log('[useProductLoader] Processing variant:', {
            variantId: variant.id,
            savedImagesCount: savedVariantImages.length,
            savedImages: savedVariantImages,
            hasDefaultPhoto: !!variant.defaultPhoto,
            defaultPhoto: variant.defaultPhoto,
          });
          
          // Only set variantImagesMap with images that were actually saved (from Firestore)
          // This ensures only saved images appear as "selected" in the UI
          if (savedVariantImages.length > 0) {
            variantImagesMap[variant.id] = savedVariantImages;
            console.log('[useProductLoader] Set selected variant images from Firestore:', savedVariantImages);
          }
          
          // Set default photo from Firestore if specified, otherwise use first saved image
          if (variant.defaultPhoto) {
            defaultPhotosMap[variant.id] = variant.defaultPhoto;
            console.log('[useProductLoader] Using Firestore defaultPhoto for variant:', variant.id, variant.defaultPhoto);
          } else if (savedVariantImages.length > 0) {
            defaultPhotosMap[variant.id] = savedVariantImages[0];
            console.log('[useProductLoader] Setting first saved image as default for variant:', variant.id, savedVariantImages[0]);
          } else {
            // If no saved images, try to get default from shopifyItem (but don't mark as selected)
            const shopifyVariantImages = getVariantImagesFromShopify(variant);
            if (shopifyVariantImages.length > 0) {
              defaultPhotosMap[variant.id] = shopifyVariantImages[0];
              console.log('[useProductLoader] No saved images, using first shopify image as default:', variant.id, shopifyVariantImages[0]);
            }
          }
          
          // Don't load price overrides - prices come from Shopify only
        });
        
        console.log('[useProductLoader] Final variant images map:', {
          variantCount: Object.keys(variantImagesMap).length,
          defaultPhotosCount: Object.keys(defaultPhotosMap).length,
          variantImagesMap,
          defaultPhotosMap,
        });
        
        setVariantImages(variantImagesMap);
        setDefaultVariantPhotos(defaultPhotosMap);

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
    setStorefrontSelections,
    setEditModeShopifyItem,
    setToastMessage,
    setLoading,
  ]);

  return { loading, error };
}

