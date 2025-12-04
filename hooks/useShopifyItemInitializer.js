import { useEffect, useRef } from 'react';

/**
 * Custom hook to initialize Shopify item data
 * Only resets variants when the item ID changes, not when category or other dependencies change
 */
export function useShopifyItemInitializer({
  mode,
  item,
  sortedVariants,
  getVariantDefaultImages,
  setSelectedImages,
  setSelectedVariants,
  setDisplayName,
  setDisplayDescription,
  setBulletPoints,
  setExpandedVariants,
  setVariantImages,
  setDefaultVariantPhotos,
  initializedItemIdRef,
}) {
  useEffect(() => {
    if (mode !== 'shopify' || !item) return;

    // Check if this is a new item (different ID)
    const isNewItem = initializedItemIdRef.current !== item.id;
    
    if (isNewItem) {
      const images = item.imageUrls || item.images || [];
      setSelectedImages([]);

      const variants = sortedVariants;
      setSelectedVariants([]);
        
      // Mark this item as initialized
      initializedItemIdRef.current = item.id;
    } else {
      // Same item - preserve variant selections
      // Don't reset selectedVariants - preserve user selections
      return; // Early return to skip the rest of initialization
    }

    // Only runs for new items
    const variants = sortedVariants;

    const initialExpanded = new Set();
    const initialVariantImages = {};

    // Don't set base price - prices come from Shopify only

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
    
    // Don't set price overrides - prices come from Shopify only

    // Don't automatically set category - let user choose manually
    // eslint-disable-next-line react-hooks/exhaustive-deps
    // Intentionally only depend on item?.id and mode to prevent re-initialization when sortedVariants or basePriceInput change
  }, [item?.id, mode]);
}

