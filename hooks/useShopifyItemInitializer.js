import { useEffect, useRef } from 'react';
import { generateProductContent } from '@/lib/productContentApi';

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
  setIsGeneratingAIContent,
}) {
  useEffect(() => {
    console.log('[useShopifyItemInitializer] Effect triggered', { mode, itemId: item?.id, hasItem: !!item });
    
    if (mode !== 'shopify' || !item) {
      console.log('[useShopifyItemInitializer] Skipping - not in shopify mode or no item');
      return;
    }

    // Check if this is a new item (different ID)
    const isNewItem = initializedItemIdRef.current !== item.id;
    console.log('[useShopifyItemInitializer] Item check', { 
      currentItemId: item.id, 
      initializedItemId: initializedItemIdRef.current,
      isNewItem 
    });
    
    if (isNewItem) {
      console.log('[useShopifyItemInitializer] 🆕 New item detected - starting initialization');
      
      // Step 1: Get item data
      const title = item?.title || '';
      const rawProduct = item?.rawProduct;
      const bodyHtml = rawProduct?.body_html || '';
      console.log('[useShopifyItemInitializer] 📋 Item data extracted', { 
        hasTitle: !!title, 
        titleLength: title.length,
        hasBodyHtml: !!bodyHtml,
        bodyHtmlLength: bodyHtml.length,
        hasDisplayName: !!item.displayName,
        hasDisplayDescription: !!item.displayDescription
      });
      
      // Step 2: Cut body_html at "src=" to exclude photos
      let truncatedBodyHtml = bodyHtml;
      const srcIndex = bodyHtml.indexOf('src=');
      if (srcIndex !== -1) {
        truncatedBodyHtml = bodyHtml.substring(0, srcIndex);
        console.log('[useShopifyItemInitializer] ✂️ Body HTML truncated at src=', { 
          originalLength: bodyHtml.length, 
          truncatedLength: truncatedBodyHtml.length 
        });
      } else {
        console.log('[useShopifyItemInitializer] ℹ️ No src= found in body_html, using full body');
      }
      
      // Step 3: Initialize images and variants
      console.log('[useShopifyItemInitializer] 🖼️ Initializing images and variants');
      const images = item.imageUrls || item.images || [];
      setSelectedImages([]);
      const variants = sortedVariants;
      setSelectedVariants([]);
      
      // Step 4: Check for existing properties in database first (if already saved)
      console.log('[useShopifyItemInitializer] 💾 Checking for existing saved content');
      if (item.displayName) {
        console.log('[useShopifyItemInitializer] ✅ Found existing displayName, setting from item:', item.displayName);
        setDisplayName(item.displayName);
      }
      if (item.displayDescription) {
        console.log('[useShopifyItemInitializer] ✅ Found existing displayDescription, setting from item');
        setDisplayDescription(item.displayDescription);
      }
      if (item.bulletpoints && Array.isArray(item.bulletpoints)) {
        console.log('[useShopifyItemInitializer] ✅ Found existing bulletpoints, setting from item:', item.bulletpoints.length, 'points');
        setBulletPoints(item.bulletpoints.filter(Boolean)); // Filter out empty strings
      }

      // Step 5: Group variants by color/style and set default images
      console.log('[useShopifyItemInitializer] 🎨 Setting up variant images and defaults');
      const initialExpanded = new Set();
      const initialVariantImages = {};
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
      console.log('[useShopifyItemInitializer] ✅ Variant setup complete', { 
        variantCount: variants.length,
        variantImageCount: Object.keys(initialVariantImages).length 
      });
      
      // Step 6: Mark this item as initialized
      initializedItemIdRef.current = item.id;
      console.log('[useShopifyItemInitializer] ✅ Basic initialization complete, marked item as initialized');
      
      // Step 7: Generate AI content in the background (only if no existing content)
      // Use setTimeout to defer this until after all initialization is complete and modal is rendered
      const needsAIGeneration = title && truncatedBodyHtml && !item.displayName && !item.displayDescription;
      
      if (needsAIGeneration) {
        console.log('[useShopifyItemInitializer] 🤖 Scheduling AI content generation in background');
        
        // Defer API call until after modal is fully rendered and initialized
        setTimeout(() => {
          console.log('[useShopifyItemInitializer] 🤖 Starting AI content generation');
          
          if (setIsGeneratingAIContent) {
            setIsGeneratingAIContent(true);
            console.log('[useShopifyItemInitializer] ⏳ Set loading state to true');
          }
          
          const startTime = Date.now();
          generateProductContent(title, truncatedBodyHtml)
            .then((content) => {
              const duration = Date.now() - startTime;
              console.log('[useShopifyItemInitializer] ✅ AI content generated successfully', { 
                duration: `${duration}ms`,
                hasDisplayName: !!content.displayName,
                hasDisplayDescription: !!content.displayDescription,
                bulletpointCount: content.bulletpoints?.length || 0,
                content 
              });
              
              // Populate form fields with generated content (only if not already set by item data)
              if (content.displayName) {
                console.log('[useShopifyItemInitializer] ✍️ Setting displayName:', content.displayName);
                setDisplayName(content.displayName);
              }
              if (content.displayDescription) {
                console.log('[useShopifyItemInitializer] ✍️ Setting displayDescription (length:', content.displayDescription.length, ')');
                setDisplayDescription(content.displayDescription);
              }
              if (content.bulletpoints && Array.isArray(content.bulletpoints) && content.bulletpoints.length > 0) {
                const filtered = content.bulletpoints.filter(Boolean);
                console.log('[useShopifyItemInitializer] ✍️ Setting bulletpoints:', filtered.length, 'points');
                setBulletPoints(filtered);
              }
              
              if (setIsGeneratingAIContent) {
                setIsGeneratingAIContent(false);
                console.log('[useShopifyItemInitializer] ✅ Set loading state to false');
              }
            })
            .catch((error) => {
              const duration = Date.now() - startTime;
              console.error('[useShopifyItemInitializer] ❌ Failed to generate product content', { 
                duration: `${duration}ms`,
                error: error.message,
                error 
              });
              
              if (setIsGeneratingAIContent) {
                setIsGeneratingAIContent(false);
                console.log('[useShopifyItemInitializer] ✅ Set loading state to false (after error)');
              }
              // Continue without generated content - user can fill manually
            });
        }, 100); // Small delay to ensure modal is fully rendered
      } else {
        console.log('[useShopifyItemInitializer] ⏭️ Skipping AI generation', {
          reason: !title ? 'no title' : !truncatedBodyHtml ? 'no body_html' : item.displayName || item.displayDescription ? 'existing content found' : 'unknown'
        });
      }
    } else {
      // Same item - preserve variant selections
      console.log('[useShopifyItemInitializer] ♻️ Same item detected - preserving selections');
      return; // Early return to skip the rest of initialization
    }

    // Don't set price overrides - prices come from Shopify only
    // Don't automatically set category - let user choose manually
    // eslint-disable-next-line react-hooks/exhaustive-deps
    // Intentionally only depend on item?.id and mode to prevent re-initialization when sortedVariants or basePriceInput change
  }, [item?.id, mode]);
}

