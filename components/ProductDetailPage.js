'use client';

import { useEffect, useMemo, useState, useRef } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useCart } from '@/lib/cart';
import SettingsMenu from '@/components/SettingsMenu';
import { useStorefront } from '@/lib/storefront-context';
import { saveStorefrontToCache } from '@/lib/get-storefront';
import { getMarket } from '@/lib/get-market';
import { getStorefrontTheme } from '@/lib/storefront-logos';
import { getLogo } from '@/lib/logo-cache';
import { getFirebaseDb } from '@/lib/firebase';
import { doc, updateDoc, increment, getDoc } from 'firebase/firestore';
import { getDocumentPath } from '@/lib/store-collections';

// Format price based on market (EUR for EU markets)
import { isEUMarket, getMarketLocale, getMarketCurrency } from '@/lib/market-utils';

const formatPrice = (value, market = 'DE') => {
  const isEU = isEUMarket(market);
  const locale = getMarketLocale(market);
  const currency = getMarketCurrency(market);
  const currencyFormatter = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currency,
  });
  return currencyFormatter.format(value ?? 0);
};

// Known color names (case-insensitive matching)
const KNOWN_COLORS = [
  'black', 'white', 'red', 'blue', 'green', 'yellow', 'orange', 'purple', 'pink', 'brown',
  'gray', 'grey', 'silver', 'gold', 'beige', 'tan', 'navy', 'maroon', 'olive', 'teal',
  'cyan', 'magenta', 'lime', 'indigo', 'violet', 'coral', 'salmon', 'khaki', 'ivory',
  'cream', 'mint', 'lavender', 'peach', 'turquoise', 'burgundy', 'charcoal', 'crimson',
  'emerald', 'amber', 'copper', 'bronze', 'plum', 'sage', 'rose', 'cobalt', 'azure',
  'coral', 'pearl', 'champagne', 'mauve', 'taupe', 'slate', 'denim', 'forest', 'ocean',
  'sunset', 'midnight', 'ivory', 'bone', 'sand', 'stone', 'ash', 'smoke', 'steel', 'pewter'
];

// Known country names (case-insensitive matching) - to filter out from variant displays
const KNOWN_COUNTRIES = [
  'china', 'usa', 'united states', 'uk', 'united kingdom', 'germany', 'france', 'italy',
  'spain', 'japan', 'korea', 'south korea', 'india', 'brazil', 'canada', 'australia',
  'mexico', 'russia', 'poland', 'netherlands', 'belgium', 'sweden', 'norway', 'denmark',
  'finland', 'portugal', 'greece', 'turkey', 'thailand', 'vietnam', 'indonesia', 'philippines',
  'taiwan', 'hong kong', 'singapore', 'malaysia', 'new zealand', 'south africa', 'egypt',
  'argentina', 'chile', 'colombia', 'peru', 'venezuela', 'switzerland', 'austria', 'ireland'
];

// Check if a value is a known color
const isKnownColor = (value) => {
  if (!value || typeof value !== 'string') return false;
  const normalized = value.toLowerCase().trim();
  return KNOWN_COLORS.some(color => normalized === color || normalized.includes(color));
};

// Check if a value is a country name (to filter out)
const isCountry = (value) => {
  if (!value || typeof value !== 'string') return false;
  const normalized = value.toLowerCase().trim();
  return KNOWN_COUNTRIES.some(country => normalized === country || normalized.includes(country));
};

// Filter out countries from a value
const filterOutCountries = (value) => {
  if (!value || typeof value !== 'string') return value;
  // Remove country names from the value
  let filtered = value;
  KNOWN_COUNTRIES.forEach(country => {
    const regex = new RegExp(`\\b${country}\\b`, 'gi');
    filtered = filtered.replace(regex, '').trim();
  });
  // Clean up extra spaces and separators
  filtered = filtered.replace(/\s*•\s*/g, ' • ').replace(/\s+/g, ' ').trim();
  // Remove leading/trailing separators
  filtered = filtered.replace(/^[•\s]+|[•\s]+$/g, '').trim();
  return filtered || null;
};

export default function ProductDetailPage({ category, product, variants, info = null, storefront: storefrontProp = null }) {
  const { addToCart, getCartItemCount, cart } = useCart();
  const storefrontFromContext = useStorefront(); // Get storefront from context (client-side)
  // Use prop if provided (from server), otherwise use context (client-side only)
  const storefront = storefrontProp || storefrontFromContext;
  const searchParams = useSearchParams();
  
  // Update cache when storefront prop is provided (from server)
  useEffect(() => {
    if (storefrontProp && typeof window !== 'undefined') {
      saveStorefrontToCache(storefrontProp);
    }
  }, [storefrontProp]);
  const [addingToCart, setAddingToCart] = useState(false);
  const [justAdded, setJustAdded] = useState(false);
  const [hasMounted, setHasMounted] = useState(false);
  const [isChangingVariant, setIsChangingVariant] = useState(false);
  const hasVariants = Array.isArray(variants) && variants.length > 0;
  // Cache market value to avoid parsing cookies on every render
  const market = useMemo(() => getMarket(), []);
  const isEU = isEUMarket(market);
  
  // Track if we've already incremented the view counter (prevent duplicate counts)
  const viewCountedRef = useRef(false);
  
  // Increment product view counter in the background when page loads
  useEffect(() => {
    // Only count once per page load
    if (viewCountedRef.current || !product?.id || !storefront) {
      console.log('[ProductDetailPage] ⏭️  Skipping view count update', {
        alreadyCounted: viewCountedRef.current,
        hasProductId: !!product?.id,
        productId: product?.id,
        storefront,
      });
      return;
    }
    viewCountedRef.current = true;
    
    // Update view counter in background (non-blocking)
    const updateViewCount = async () => {
      try {
        const db = getFirebaseDb();
        if (!db) {
          console.warn('[ProductDetailPage] ❌ No Firebase DB available for view count');
          return;
        }
        
        const productPath = getDocumentPath('products', product.id, storefront);
        console.log('[ProductDetailPage] 📊 Updating view count', {
          productId: product.id,
          storefront,
          path: productPath.join('/'),
        });
        
        const productRef = doc(db, ...productPath);
        await updateDoc(productRef, {
          viewCount: increment(1),
        });
        
        console.log('[ProductDetailPage] ✅ View count incremented successfully');
      } catch (error) {
        // Log all errors for debugging
        console.error('[ProductDetailPage] ❌ Failed to update view count:', {
          error: error.message,
          code: error.code,
          productId: product.id,
          storefront,
          path: getDocumentPath('products', product.id, storefront).join('/'),
        });
      }
    };
    
    // Fire and forget - don't await
    updateViewCount();
  }, [product?.id, storefront]);
  
  // Get colors from URL parameters (passed from product card) or fetch from Firestore
  const [siteInfo, setSiteInfo] = useState({
    companyName: info?.companyName || '',
    footerText: info?.footerText || '',
    colorPrimary: '#ec4899',
    colorSecondary: '#64748b',
    colorTertiary: '#94a3b8',
  });
  
  // Get colors from URL params if available, otherwise use info prop or fetch from Firestore
  useEffect(() => {
    const fetchColors = async () => {
      // First, try to get colors from URL params
      if (searchParams) {
        const colorPrimary = searchParams.get('colorPrimary');
        const colorSecondary = searchParams.get('colorSecondary');
        const colorTertiary = searchParams.get('colorTertiary');
        
        if (colorPrimary || colorSecondary || colorTertiary) {
          setSiteInfo(prev => ({
            ...prev,
            colorPrimary: colorPrimary ? decodeURIComponent(colorPrimary) : prev.colorPrimary,
            colorSecondary: colorSecondary ? decodeURIComponent(colorSecondary) : prev.colorSecondary,
            colorTertiary: colorTertiary ? decodeURIComponent(colorTertiary) : prev.colorTertiary,
          }));
          return; // URL params take precedence
        }
      }
      
      // If no URL params, use info prop if available
      if (info?.colorPrimary || info?.colorSecondary || info?.colorTertiary) {
        setSiteInfo(prev => ({
          ...prev,
          companyName: info.companyName || prev.companyName,
          footerText: info.footerText || prev.footerText,
          colorPrimary: info.colorPrimary || prev.colorPrimary,
          colorSecondary: info.colorSecondary || prev.colorSecondary,
          colorTertiary: info.colorTertiary || prev.colorTertiary,
        }));
        return;
      }
      
      // If no info prop, try cache first, then fetch from Firestore based on storefront
      if (storefront) {
        try {
          // Try to get from cache first
          if (typeof window !== 'undefined') {
            const { getCachedInfo } = require('@/lib/info-cache');
            const cachedInfo = getCachedInfo(storefront);
            if (cachedInfo) {
              setSiteInfo(prev => ({
                ...prev,
                companyName: cachedInfo.companyName || prev.companyName,
                footerText: cachedInfo.footerText || prev.footerText,
                colorPrimary: cachedInfo.colorPrimary || prev.colorPrimary,
                colorSecondary: cachedInfo.colorSecondary || prev.colorSecondary,
                colorTertiary: cachedInfo.colorTertiary || prev.colorTertiary,
              }));
              return; // Use cached data
            }
          }
          
          // If no cache, fetch from Firestore
          const db = getFirebaseDb();
          if (db) {
            const infoDoc = await getDoc(doc(db, storefront, 'Info'));
            if (infoDoc.exists()) {
              const data = infoDoc.data();
              setSiteInfo(prev => ({
                ...prev,
                companyName: data.companyName || prev.companyName,
                footerText: data.footerText || prev.footerText,
                colorPrimary: data.colorPrimary || prev.colorPrimary,
                colorSecondary: data.colorSecondary || prev.colorSecondary,
                colorTertiary: data.colorTertiary || prev.colorTertiary,
              }));
              
              // Cache the fetched data
              if (typeof window !== 'undefined') {
                const { saveInfoToCache } = require('@/lib/info-cache');
                saveInfoToCache(storefront, data);
              }
            }
          }
        } catch (error) {
          console.error('[ProductDetailPage] Failed to fetch colors from Firestore:', error);
          // Keep default colors on error
        }
      }
    };
    
    fetchColors();
  }, [searchParams, storefront, info]);
  
  // Use colors from siteInfo instead of static theme
  const theme = useMemo(() => {
    const primaryColor = siteInfo.colorPrimary || '#ec4899';
    return {
      primaryColor: primaryColor,
      primaryColorHover: primaryColor, // Could calculate darker version if needed
      textColor: primaryColor,
      borderColor: primaryColor,
    };
  }, [siteInfo.colorPrimary]);
  
  // Check if variants have colors
  // Trust that if variant.color exists, it IS a color (set using Shopify options during import)
  const hasColors = useMemo(() => {
    return variants.some((v) => v.color && v.color !== 'default' && !isCountry(v.color));
  }, [variants]);
  
  const hasTypes = useMemo(() => {
    return variants.some((v) => v.type);
  }, [variants]);

  // Find default variant if set (define early so it can be used in other useMemos)
  // If default variant is out of stock, find the first in-stock variant in the same group
  const defaultVariant = useMemo(() => {
    console.log('[ProductDetailPage] 🔍 Determining default variant:', {
      productId: product.id,
      productName: product.name,
      productDefaultVariantId: product.defaultVariantId,
      productKeys: Object.keys(product),
      hasVariants,
      variantsCount: variants.length,
      variantIds: variants.map(v => v.id)
    });
    
    if (!product.defaultVariantId) {
      console.log('[ProductDetailPage] ⚠️ No default variant ID on product! Product object:', {
        id: product.id,
        name: product.name,
        allKeys: Object.keys(product),
        defaultVariantId: product.defaultVariantId,
        basePrice: product.basePrice,
        defaultVariantPrice: product.defaultVariantPrice
      });
      return null;
    }
    
    if (!hasVariants) {
      console.log('[ProductDetailPage] ⚠️ No variants available');
      return null;
    }
    
    const defaultVariantFromProduct = variants.find((v) => v.id === product.defaultVariantId);
    if (!defaultVariantFromProduct) {
      console.log('[ProductDetailPage] ⚠️ Default variant not found in variants list:', {
        lookingFor: product.defaultVariantId,
        availableIds: variants.map(v => v.id)
      });
      return null;
    }
    
    // Check if default variant is in stock
    const stock = defaultVariantFromProduct.stock ?? 0;
    const allowsBackorder = defaultVariantFromProduct.inventory_policy === 'continue';
    const isInStock = stock > 0 || allowsBackorder;
    
    console.log('[ProductDetailPage] 📦 Default variant stock check:', {
      variantId: defaultVariantFromProduct.id,
      stock,
      allowsBackorder,
      isInStock,
      color: defaultVariantFromProduct.color,
      type: defaultVariantFromProduct.type,
      size: defaultVariantFromProduct.size
    });
    
    // If in stock, use it
    if (isInStock) {
      console.log('[ProductDetailPage] ✅ Using default variant (in stock):', defaultVariantFromProduct.id);
      return defaultVariantFromProduct;
    }
    
    // If out of stock, find first in-stock variant in the same group
    // Determine the default variant's group
    let defaultGroupKey = 'default';
    if (defaultVariantFromProduct.color && !isCountry(defaultVariantFromProduct.color)) {
      const filteredColor = filterOutCountries(defaultVariantFromProduct.color);
      if (filteredColor) defaultGroupKey = filteredColor;
    } else if (defaultVariantFromProduct.type) {
      const filteredType = filterOutCountries(defaultVariantFromProduct.type);
      if (filteredType) defaultGroupKey = filteredType;
    }
    
    console.log('[ProductDetailPage] 🔄 Default variant out of stock, finding alternative in group:', defaultGroupKey);
    
    // Find first in-stock variant in the same group
    const groupVariants = variants.filter((v) => {
      let vGroupKey = 'default';
      if (v.color && !isCountry(v.color)) {
        const filteredColor = filterOutCountries(v.color);
        if (filteredColor) vGroupKey = filteredColor;
      } else if (v.type) {
        const filteredType = filterOutCountries(v.type);
        if (filteredType) vGroupKey = filteredType;
      }
      return vGroupKey === defaultGroupKey;
    });
    
    // Return first in-stock variant from the group
    const inStockVariant = groupVariants.find((v) => {
      const vStock = v.stock ?? 0;
      const vAllowsBackorder = v.inventory_policy === 'continue';
      return vStock > 0 || vAllowsBackorder;
    });
    
    if (inStockVariant) {
      console.log('[ProductDetailPage] ✅ Using alternative in-stock variant:', {
        originalDefault: defaultVariantFromProduct.id,
        alternative: inStockVariant.id,
        group: defaultGroupKey
      });
    } else {
      console.log('[ProductDetailPage] ⚠️ No in-stock variant found in group, using original default:', defaultVariantFromProduct.id);
    }
    
    return inStockVariant || defaultVariantFromProduct; // Fallback to default variant if no in-stock variant found
  }, [product.defaultVariantId, variants, hasVariants]);

  // Group variants by color or type (include all variants for grouping, filtering happens later)
  // Trust variant.color field - it was set using Shopify options during import
  const variantsByGroup = useMemo(() => {
    if (!hasVariants) return new Map();
    const grouped = new Map();
    variants.forEach((variant) => {
      // Priority: color (if exists) > type > 'default'
      // If variant.color exists, it IS a color (set using Shopify's "Color" option during import)
      let groupKey = 'default';
      if (variant.color && !isCountry(variant.color)) {
        // Filter out countries but trust that it's a color
        const filteredColor = filterOutCountries(variant.color);
        groupKey = filteredColor || 'default';
      } else if (variant.type) {
        // Filter out countries from type
        const filteredType = filterOutCountries(variant.type);
        groupKey = filteredType || 'default';
      }
      if (!grouped.has(groupKey)) {
        grouped.set(groupKey, []);
      }
      grouped.get(groupKey).push(variant);
    });
    return grouped;
  }, [hasVariants, variants]);

  // Filter groups to only show groups that have at least one in-stock variant
  // Ensure default variant's group appears first
  const availableGroups = useMemo(() => {
    const allGroups = Array.from(variantsByGroup.keys()).filter((key) => {
      const groupVariants = variantsByGroup.get(key) || [];
      // Group is available if it has at least one in-stock variant
      const hasInStockVariant = groupVariants.some((variant) => {
        const stock = variant.stock ?? 0;
        const allowsBackorder = variant.inventory_policy === 'continue';
        return stock > 0 || allowsBackorder;
      });
      // Also include 'default' if it's the only group (for products without colors/types)
      return hasInStockVariant || (key === 'default' && variantsByGroup.size === 1);
    });
    
    // If default variant exists, move its group to the front
    if (defaultVariant) {
      let defaultGroupKey = null;
      // Find which group the default variant belongs to
      for (const [key, groupVariants] of variantsByGroup.entries()) {
        if (groupVariants.some(v => v.id === defaultVariant.id)) {
          defaultGroupKey = key;
          break;
        }
      }
      
      if (defaultGroupKey && allGroups.includes(defaultGroupKey)) {
        // Remove default group from its current position and add it to the front
        const filtered = allGroups.filter(g => g !== defaultGroupKey);
        return [defaultGroupKey, ...filtered];
      }
    }
    
    return allGroups;
  }, [variantsByGroup, defaultVariant]);

  // Initialize selected group and size from default variant
  // Trust variant.color field - it was set using Shopify options during import
  const getInitialGroup = () => {
    console.log('[ProductDetailPage] 🎯 getInitialGroup called:', {
      hasDefaultVariant: !!defaultVariant,
      defaultVariantId: defaultVariant?.id,
      availableGroups: Array.from(availableGroups),
      variantsByGroupKeys: Array.from(variantsByGroup.keys())
    });
    
    if (!defaultVariant) {
      const firstGroup = availableGroups.length > 0 ? availableGroups[0] : null;
      console.log('[ProductDetailPage] ⚠️ No default variant, using first available group:', firstGroup);
      return firstGroup;
    }
    
    // Find which group the default variant belongs to (check all variants, not just in-stock)
    let defaultGroupKey = null;
    for (const [key, groupVariants] of variantsByGroup.entries()) {
      if (groupVariants.some(v => v.id === defaultVariant.id)) {
        defaultGroupKey = key;
        break;
      }
    }
    
    console.log('[ProductDetailPage] 🔍 Found default variant group:', {
      defaultGroupKey,
      isInAvailableGroups: defaultGroupKey && availableGroups.includes(defaultGroupKey)
    });
    
    // If default variant's group is available, use it; otherwise use first available
    if (defaultGroupKey && availableGroups.includes(defaultGroupKey)) {
      console.log('[ProductDetailPage] ✅ Using default variant group:', defaultGroupKey);
      return defaultGroupKey;
    }
    
    // Fallback: try to find group from default variant's color/type
      if (defaultVariant.color && !isCountry(defaultVariant.color)) {
        const filteredColor = filterOutCountries(defaultVariant.color);
      if (filteredColor && availableGroups.includes(filteredColor)) {
        console.log('[ProductDetailPage] ✅ Using default variant color as group:', filteredColor);
        return filteredColor;
      }
    }
      if (defaultVariant.type) {
        const filteredType = filterOutCountries(defaultVariant.type);
      if (filteredType && availableGroups.includes(filteredType)) {
        console.log('[ProductDetailPage] ✅ Using default variant type as group:', filteredType);
        return filteredType;
      }
    }
    
    const firstGroup = availableGroups.length > 0 ? availableGroups[0] : null;
    console.log('[ProductDetailPage] ⚠️ Default variant group not available, using first group:', firstGroup);
    return firstGroup;
  };

  const getInitialSize = (group) => {
    console.log('[ProductDetailPage] 📏 getInitialSize called:', {
      group,
      hasDefaultVariant: !!defaultVariant,
      defaultVariantId: defaultVariant?.id
    });
    
    if (!defaultVariant || !group) {
      console.log('[ProductDetailPage] ⚠️ No default variant or group, returning null size');
      return null;
    }
    
    // Check all variants in the group (not just in-stock) to find default variant
      const groupVariants = variantsByGroup.get(group) || [];
      const defaultInGroup = groupVariants.find((v) => v.id === defaultVariant.id);
    
    console.log('[ProductDetailPage] 🔍 Checking default variant in group:', {
      groupVariantsCount: groupVariants.length,
      defaultInGroup: !!defaultInGroup,
      defaultInGroupSize: defaultInGroup?.size
    });
    
      if (defaultInGroup && defaultInGroup.size) {
        const filteredSize = filterOutCountries(defaultInGroup.size);
      console.log('[ProductDetailPage] ✅ Using default variant size:', filteredSize);
      return filteredSize;
      }
    
    console.log('[ProductDetailPage] ⚠️ No size found for default variant, returning null');
    return null;
  };

  // State: selected group (color or type) first, then size within that group
  const [selectedGroup, setSelectedGroup] = useState(() => {
    const initial = getInitialGroup();
    console.log('[ProductDetailPage] 🎬 Initial selectedGroup state:', initial);
    return initial;
  });
  const [selectedSize, setSelectedSize] = useState(() => {
    const initialGroup = getInitialGroup();
    const initialSize = getInitialSize(initialGroup);
    console.log('[ProductDetailPage] 🎬 Initial selectedSize state:', {
      group: initialGroup,
      size: initialSize
    });
    return initialSize;
  });

  // Helper function to get size index for sorting (matches logic in availableSizes)
  const getSizeIndexForSorting = (size) => {
    if (!size) return Infinity; // Variants without size go to the end
    const normalized = size.toUpperCase().trim();
    const sizeOrder = [
      'XXS', 'XXXS', 'XXXXS', 'XXXXXS',
      'XS', 'X-SMALL', 'X-S', 'EXTRA SMALL', 'EXTRA-SMALL',
      'S', 'SMALL', 'SIZE S',
      'M', 'MEDIUM', 'SIZE M',
      'L', 'LARGE', 'SIZE L',
      'XL', 'X-LARGE', 'X-L', 'EXTRA LARGE', 'EXTRA-LARGE', '1X',
      'XXL', '2XL', '2X', 'XX-LARGE', 'XX-L', 'EXTRA EXTRA LARGE',
      'XXXL', '3XL', '3X', 'XXX-LARGE', 'XXX-L',
      'XXXXL', '4XL', '4X',
      'XXXXXL', '5XL', '5X',
      'ONE SIZE', 'ONE-SIZE', 'ONESIZE', 'OS', 'OSFA', 'ONE SIZE FITS ALL'
    ];
    
    // Direct match
    const directIndex = sizeOrder.findIndex(order => {
      const orderNormalized = order.toUpperCase();
      return normalized === orderNormalized || normalized === orderNormalized.replace(/-/g, ' ').replace(/\s+/g, ' ');
    });
    if (directIndex !== -1) return directIndex;
    
    // Partial match
    const partialIndex = sizeOrder.findIndex(order => {
      const orderNormalized = order.toUpperCase();
      const cleanSize = normalized.replace(/^(SIZE|SIZE\s+)/i, '').trim();
      const cleanOrder = orderNormalized.replace(/^(SIZE|SIZE\s+)/i, '').trim();
      return cleanSize === cleanOrder || 
             normalized.includes(cleanOrder) || 
             cleanOrder.includes(cleanSize) ||
             (normalized.replace(/\s+/g, '') === cleanOrder.replace(/\s+/g, ''));
    });
    if (partialIndex !== -1) return partialIndex;
    
    return Infinity; // Not a traditional size
  };

  // Get variants for selected group - FILTER OUT OF STOCK VARIANTS
  // Ensure default variant appears first in the list, then sort by size
  const groupVariants = useMemo(() => {
    if (!selectedGroup) return [];
    const allVariants = variantsByGroup.get(selectedGroup) || [];
    // Filter to only show in-stock variants (stock > 0 OR inventory_policy === 'continue' for backorder)
    const inStockVariants = allVariants.filter((variant) => {
      const stock = variant.stock ?? 0;
      const allowsBackorder = variant.inventory_policy === 'continue';
      return stock > 0 || allowsBackorder;
    });
    
    // Separate default variant from others
    let defaultVariantItem = null;
    let otherVariants = [];
    
    if (defaultVariant && inStockVariants.some(v => v.id === defaultVariant.id)) {
      const defaultVariantIndex = inStockVariants.findIndex(v => v.id === defaultVariant.id);
      defaultVariantItem = inStockVariants[defaultVariantIndex];
      otherVariants = inStockVariants.filter((_, i) => i !== defaultVariantIndex);
    } else {
      otherVariants = inStockVariants;
    }
    
    // Sort other variants by size (traditional sizes first, then numeric, then alphabetical)
    const sortedOtherVariants = otherVariants.sort((a, b) => {
      const aSize = a.size ? filterOutCountries(a.size) : '';
      const bSize = b.size ? filterOutCountries(b.size) : '';
      
      if (!aSize && !bSize) return 0;
      if (!aSize) return 1; // No size goes to end
      if (!bSize) return -1;
      
      const aUpper = aSize.toUpperCase().trim();
      const bUpper = bSize.toUpperCase().trim();
      
      const aIndex = getSizeIndexForSorting(aSize);
      const bIndex = getSizeIndexForSorting(bSize);
      
      // Both are traditional sizes - sort by index
      if (aIndex !== Infinity && bIndex !== Infinity) {
        return aIndex - bIndex;
      }
      // Only a is traditional - put it first
      if (aIndex !== Infinity) return -1;
      // Only b is traditional - put it first
      if (bIndex !== Infinity) return 1;
      
      // Neither is traditional - try numeric sorting
      const aNum = parseFloat(aUpper.replace(/[^\d.]/g, ''));
      const bNum = parseFloat(bUpper.replace(/[^\d.]/g, ''));
      const aIsNum = !Number.isNaN(aNum);
      const bIsNum = !Number.isNaN(bNum);
      if (aIsNum && bIsNum) {
        return aNum - bNum;
      }
      if (aIsNum) return -1;
      if (bIsNum) return 1;
      
      // Fallback to alphabetical
      return aSize.localeCompare(bSize);
    });
    
    // Return default variant first (if exists), then sorted variants
    return defaultVariantItem 
      ? [defaultVariantItem, ...sortedOtherVariants]
      : sortedOtherVariants;
  }, [selectedGroup, variantsByGroup, defaultVariant]);

  // Get available sizes for selected group - simple and straightforward
  // Ensure default variant's size appears first
  const availableSizes = useMemo(() => {
    if (!selectedGroup) return [];
    
    // Get unique sizes from variants in the selected group (filter out countries)
    const sizeSet = new Set();
    groupVariants.forEach((v) => {
      if (v.size) {
        const filteredSize = filterOutCountries(v.size);
        if (filteredSize) {
          sizeSet.add(filteredSize);
        }
      }
    });
    
    // Traditional size order (case-insensitive matching)
    // This comprehensive list covers most common size variations
    const sizeOrder = [
      'XXS', 'XXXS', 'XXXXS', 'XXXXXS',
      'XS', 'X-SMALL', 'X-S', 'EXTRA SMALL', 'EXTRA-SMALL',
      'S', 'SMALL', 'SIZE S',
      'M', 'MEDIUM', 'SIZE M',
      'L', 'LARGE', 'SIZE L',
      'XL', 'X-LARGE', 'X-L', 'EXTRA LARGE', 'EXTRA-LARGE', '1X',
      'XXL', '2XL', '2X', 'XX-LARGE', 'XX-L', 'EXTRA EXTRA LARGE',
      'XXXL', '3XL', '3X', 'XXX-LARGE', 'XXX-L',
      'XXXXL', '4XL', '4X',
      'XXXXXL', '5XL', '5X',
      'ONE SIZE', 'ONE-SIZE', 'ONESIZE', 'OS', 'OSFA', 'ONE SIZE FITS ALL'
    ];
    const sizes = Array.from(sizeSet);
    
    // Get default variant's size if it exists
    let defaultSize = null;
    if (defaultVariant && defaultVariant.size) {
      defaultSize = filterOutCountries(defaultVariant.size);
    }
    
    // Helper function to normalize and match sizes (case-insensitive)
    const getSizeIndex = (size) => {
      const normalized = size.toUpperCase().trim();
      
      // Direct match
      const directIndex = sizeOrder.findIndex(order => {
        const orderNormalized = order.toUpperCase();
        return normalized === orderNormalized || normalized === orderNormalized.replace(/-/g, ' ').replace(/\s+/g, ' ');
      });
      if (directIndex !== -1) return directIndex;
      
      // Partial match (e.g., "Size S" matches "S", "XL" matches "XL")
      const partialIndex = sizeOrder.findIndex(order => {
        const orderNormalized = order.toUpperCase();
        // Remove common prefixes/suffixes for matching
        const cleanSize = normalized.replace(/^(SIZE|SIZE\s+)/i, '').trim();
        const cleanOrder = orderNormalized.replace(/^(SIZE|SIZE\s+)/i, '').trim();
        return cleanSize === cleanOrder || 
               normalized.includes(cleanOrder) || 
               cleanOrder.includes(cleanSize) ||
               (normalized.replace(/\s+/g, '') === cleanOrder.replace(/\s+/g, ''));
      });
      if (partialIndex !== -1) return partialIndex;
      
      return -1;
    };
    
    // Sort sizes, but put default size first if it exists
    const sortedSizes = sizes.sort((a, b) => {
      const aUpper = a.toUpperCase().trim();
      const bUpper = b.toUpperCase().trim();
      
      const aIndex = getSizeIndex(a);
      const bIndex = getSizeIndex(b);
      
      // Both are traditional sizes - sort by index
      if (aIndex !== -1 && bIndex !== -1) {
        return aIndex - bIndex;
      }
      // Only a is traditional - put it first
      if (aIndex !== -1) return -1;
      // Only b is traditional - put it first
      if (bIndex !== -1) return 1;
      
      // Neither is traditional - try numeric sorting
      const aNum = parseFloat(aUpper.replace(/[^\d.]/g, ''));
      const bNum = parseFloat(bUpper.replace(/[^\d.]/g, ''));
      const aIsNum = !Number.isNaN(aNum);
      const bIsNum = !Number.isNaN(bNum);
      if (aIsNum && bIsNum) {
        return aNum - bNum;
      }
      if (aIsNum) return -1;
      if (bIsNum) return 1;
      
      // Fallback to alphabetical
      return a.localeCompare(b);
    });
    
    // If default size exists and is in the list, move it to the front
    if (defaultSize && sortedSizes.includes(defaultSize)) {
      const filtered = sortedSizes.filter(s => s !== defaultSize);
      return [defaultSize, ...filtered];
    }
    
    return sortedSizes;
  }, [selectedGroup, groupVariants, defaultVariant]);

  // When group changes, try to preserve default variant's size if available
  // Otherwise, select first available size
  useEffect(() => {
    console.log('[ProductDetailPage] 🔄 useEffect: group/size change:', {
      selectedGroup,
      availableSizes,
      currentSelectedSize: selectedSize,
      hasDefaultVariant: !!defaultVariant,
      defaultVariantId: defaultVariant?.id
    });
    
    if (!selectedGroup || availableSizes.length === 0) {
      console.log('[ProductDetailPage] ⚠️ No group or no available sizes, clearing size');
      setSelectedSize(null);
      return;
    }
    
    // If we have a default variant and it's in this group, try to use its size
    if (defaultVariant) {
      const defaultInGroup = variantsByGroup.get(selectedGroup)?.find((v) => v.id === defaultVariant.id);
      console.log('[ProductDetailPage] 🔍 Checking default variant in selected group:', {
        defaultInGroup: !!defaultInGroup,
        defaultInGroupSize: defaultInGroup?.size
      });
      
      if (defaultInGroup && defaultInGroup.size) {
        const filteredDefaultSize = filterOutCountries(defaultInGroup.size);
        if (filteredDefaultSize && availableSizes.includes(filteredDefaultSize)) {
          console.log('[ProductDetailPage] ✅ Setting size to default variant size:', filteredDefaultSize);
          setSelectedSize(filteredDefaultSize);
          return;
        } else {
          console.log('[ProductDetailPage] ⚠️ Default variant size not available:', {
            filteredDefaultSize,
            availableSizes
          });
        }
      }
    }
    
    // Otherwise, select first available size
    console.log('[ProductDetailPage] 📏 Setting size to first available:', availableSizes[0]);
    setSelectedSize(availableSizes[0]);
  }, [selectedGroup, availableSizes, defaultVariant, variantsByGroup]);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  // Find selected variant based on group (color/type) + size
  // Prioritize default variant if it's in the selected group and matches the size
  const selectedVariant = useMemo(() => {
    console.log('[ProductDetailPage] 🎯 Determining selectedVariant:', {
      selectedGroup,
      selectedSize,
      groupVariantsCount: groupVariants.length,
      hasDefaultVariant: !!defaultVariant,
      defaultVariantId: defaultVariant?.id
    });
    
    if (!selectedGroup) {
      console.log('[ProductDetailPage] ⚠️ No selected group, returning null');
      return null;
    }
    
    // If size is selected, find variant with that size (matching filtered size)
    if (selectedSize) {
      console.log('[ProductDetailPage] 🔍 Size selected, looking for variant with size:', selectedSize);
      
      // First, try to find the default variant with this size
      if (defaultVariant) {
        const defaultInGroup = groupVariants.find((v) => v.id === defaultVariant.id);
        if (defaultInGroup) {
          const filteredDefaultSize = defaultInGroup.size ? filterOutCountries(defaultInGroup.size) : null;
          console.log('[ProductDetailPage] 🔍 Default variant in group:', {
            defaultInGroup: !!defaultInGroup,
            filteredDefaultSize,
            selectedSize,
            matches: filteredDefaultSize === selectedSize
          });
          
          if (filteredDefaultSize === selectedSize) {
            console.log('[ProductDetailPage] ✅ Selected default variant (matches size):', defaultInGroup.id);
            return defaultInGroup; // Default variant matches selected size
          }
        } else {
          console.log('[ProductDetailPage] ⚠️ Default variant not in groupVariants (might be out of stock)');
        }
      }
      
      // Otherwise, find any variant with this size
      const variant = groupVariants.find((v) => {
        const filteredVariantSize = v.size ? filterOutCountries(v.size) : null;
        return filteredVariantSize === selectedSize;
      });
      
      if (variant) {
        console.log('[ProductDetailPage] ✅ Selected variant with matching size:', variant.id);
      } else {
        console.log('[ProductDetailPage] ⚠️ No variant with matching size, using first variant:', groupVariants[0]?.id);
      }
      
      return variant || groupVariants[0] || null;
    }
    
    // No size selected - prioritize default variant if it's in this group
    console.log('[ProductDetailPage] 🔍 No size selected, checking default variant');
    if (defaultVariant) {
      const defaultInGroup = groupVariants.find((v) => v.id === defaultVariant.id);
      if (defaultInGroup) {
        console.log('[ProductDetailPage] ✅ Selected default variant (no size selected):', defaultInGroup.id);
        return defaultInGroup; // Default variant is in this group and in stock
      } else {
        console.log('[ProductDetailPage] ⚠️ Default variant not in groupVariants (might be out of stock)');
      }
    }
    
    // Otherwise, return first variant of selected group
    const firstVariant = groupVariants[0] || null;
    console.log('[ProductDetailPage] 📦 Selected first variant in group:', firstVariant?.id);
    return firstVariant;
  }, [selectedGroup, selectedSize, groupVariants, defaultVariant]);

  // Price priority: variant.price (from webhook) > product.basePrice
  const displayedPrice = selectedVariant?.price ?? product.basePrice ?? 0;

  // Gallery images: variant photos first, then main product photos
  // CRITICAL: Always prioritize default variant's defaultPhoto first
  const galleryImages = useMemo(() => {
    const mainProductImages = Array.isArray(product.images) ? product.images.filter(Boolean) : [];
    
    if (!selectedGroup || !hasVariants) {
      return mainProductImages;
    }

    // Collect all images from variants of the selected group
    // Support both `images` (array) and `image` (string) for backward compatibility
    // CRITICAL: Prioritize defaultPhoto for each variant (especially default variant)
    const selectedVariantDefaultPhoto = null; // Will be set below
    const selectedVariantImages = [];
    const otherGroupVariantImages = [];
    
    for (const variant of groupVariants) {
      let variantImages = [];
      
      // PRIORITY 1: Check for defaultPhoto first (this is the explicitly set default photo for the variant)
      const variantDefaultPhoto = variant.defaultPhoto || null;
      
      // PRIORITY 2: Get other images from variant
      if (Array.isArray(variant.images) && variant.images.length > 0) {
        variantImages = variant.images.filter(Boolean);
      } else if (variant.image) {
        variantImages = [variant.image];
      }
      
      // If this is the selected variant, prioritize its images
      if (selectedVariant && variant.id === selectedVariant.id) {
        // Add defaultPhoto first if it exists, then other images
        if (variantDefaultPhoto) {
          selectedVariantImages.push(variantDefaultPhoto);
        }
        // Add other images (excluding defaultPhoto if it was already added)
        variantImages.forEach((img) => {
          if (img && img !== variantDefaultPhoto) {
            selectedVariantImages.push(img);
          }
        });
      } else {
        // For other variants, also prioritize defaultPhoto
        if (variantDefaultPhoto) {
          otherGroupVariantImages.push(variantDefaultPhoto);
        }
        // Add other images (excluding defaultPhoto if it was already added)
        variantImages.forEach((img) => {
          if (img && img !== variantDefaultPhoto) {
            otherGroupVariantImages.push(img);
          }
        });
      }
    }
    
    // SPECIAL CASE: If default variant is in the selected group, ensure its defaultPhoto is FIRST
    // This ensures the default variant's default photo is always shown first when the page loads
    let defaultVariantDefaultPhoto = null;
    if (defaultVariant && groupVariants.some(v => v.id === defaultVariant.id)) {
      defaultVariantDefaultPhoto = defaultVariant.defaultPhoto || null;
    }

    // Remove duplicates while preserving order: default variant defaultPhoto first, then selected variant images, then other variant images, then main images
    const seen = new Set();
    const combined = [];
    
    // PRIORITY 1: Add default variant's defaultPhoto FIRST (if it exists and is in the selected group)
    if (defaultVariantDefaultPhoto && !seen.has(defaultVariantDefaultPhoto)) {
      combined.push(defaultVariantDefaultPhoto);
      seen.add(defaultVariantDefaultPhoto);
    }
    
    // PRIORITY 2: Add selected variant images (defaultPhoto should already be included above for default variant)
    selectedVariantImages.forEach((img) => {
      if (img && !seen.has(img)) {
        combined.push(img);
        seen.add(img);
      }
    });
    
    // PRIORITY 3: Then add other variant images
    otherGroupVariantImages.forEach((img) => {
      if (img && !seen.has(img)) {
        combined.push(img);
        seen.add(img);
      }
    });
    
    // PRIORITY 4: Finally add main product images
    mainProductImages.forEach((img) => {
      if (img && !seen.has(img)) {
        combined.push(img);
        seen.add(img);
      }
    });

    return combined.length > 0 ? combined : mainProductImages;
  }, [selectedGroup, groupVariants, product.images, hasVariants, selectedVariant, defaultVariant]);

  const [activeImage, setActiveImage] = useState(null);
  const [imageAspectRatio, setImageAspectRatio] = useState(3/4); // Default to 3:4

  // Update active image when group changes or gallery changes
  useEffect(() => {
    const primaryImage = galleryImages[0] || product.images?.[0] || null;
    setActiveImage(primaryImage);
    // Reset aspect ratio when image changes
    setImageAspectRatio(3/4);
  }, [selectedGroup, galleryImages, product.images]);

  // Fallback: Clear changing variant state after a timeout (in case image doesn't load or onLoad doesn't fire)
  useEffect(() => {
    if (isChangingVariant) {
      const timeout = setTimeout(() => {
        setIsChangingVariant(false);
      }, 1500); // Max 1.5 seconds, should be cleared earlier by onLoad
      return () => clearTimeout(timeout);
    }
  }, [isChangingVariant]);

  // Check if current variant is already in cart
  const currentCartItem = useMemo(() => {
    const variantId = selectedVariant?.id || null;
    return cart.find(
      (item) => item.productId === product.id && item.variantId === variantId
    );
  }, [cart, product.id, selectedVariant?.id]);

  const handleAddToBag = async () => {
    if (addingToCart) return;

    setAddingToCart(true);
    try {
      const variantId = selectedVariant?.id || null;
      const variantName = selectedVariant
        ? (() => {
            const parts = [];
            // Filter out countries from size
            const size = selectedVariant.size ? filterOutCountries(selectedVariant.size) : null;
            if (size) parts.push(size);
            
            // Include color if it exists (trust that it's a color from Shopify options)
            if (selectedVariant.color && !isCountry(selectedVariant.color)) {
              const filteredColor = filterOutCountries(selectedVariant.color);
              if (filteredColor) parts.push(filteredColor);
            }
            
            // Filter out countries from type
            const type = selectedVariant.type ? filterOutCountries(selectedVariant.type) : null;
            if (type) parts.push(type);
            return parts.length > 0 ? parts.join(' ') : 'One size';
          })()
        : 'One size';
      
      const image = selectedVariant?.images?.[0] || selectedVariant?.image || product.images?.[0] || null;

      await addToCart({
        productId: product.id,
        variantId, // Firestore variant document ID
        shopifyVariantId: selectedVariant?.shopifyVariantId || null, // Shopify variant ID for checkout
        quantity: 1,
        priceAtAdd: displayedPrice,
        productName: product.name,
        variantName,
        image,
        storefront: storefront || storefrontProp || 'LUNERA', // Include storefront so validation can find the product
      });

      // Show success state
      setJustAdded(true);
      setAddingToCart(false);
      
      // Revert to normal state after 2 seconds
      setTimeout(() => {
        setJustAdded(false);
      }, 2000);
    } catch (error) {
      console.error('Failed to add to cart:', error);
      setAddingToCart(false);
    }
  };

  return (
    <div className="relative min-h-screen bg-gradient-to-b from-white via-secondary/40 to-white">
      <header className="sticky top-0 z-40 border-b border-secondary/70 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <Link
              href={storefront === 'LUNERA' 
                ? `/?category=${category.id}` 
                : `/${storefront}?category=${category.id}`}
              className="flex items-center transition"
              style={{ color: siteInfo.colorPrimary || '#ec4899' }}
              aria-label={`Back to ${category.label}`}
            >
              <svg
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth="2"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
              </svg>
            </Link>
            <div className="flex flex-col sm:flex-row sm:items-center sm:gap-4">
              <Link href={storefront === 'LUNERA' ? '/' : `/${storefront}`} className="flex items-center sm:hidden">
                <Image
                  src={getLogo(storefront, siteInfo)}
                  alt={siteInfo.companyName || storefront}
                  width={240}
                  height={80}
                  className="h-10 w-auto object-contain flex-shrink-0"
                  style={{ objectFit: 'contain' }}
                  priority
                />
              </Link>
              <nav className="hidden items-center gap-2 text-xs uppercase tracking-[0.2em] sm:flex" style={{ color: siteInfo.colorPrimary || '#ec4899' }}>
                <Link href={storefront === 'LUNERA' ? '/' : `/${storefront}`} className="transition" style={{ color: siteInfo.colorPrimary || '#ec4899' }}>
                  Home
                </Link>
                <span>•</span>
                <Link 
                  href={storefront === 'LUNERA' 
                    ? `/?category=${category.id}` 
                    : `/${storefront}?category=${category.id}`} 
                  className="transition"
                  style={{ color: siteInfo.colorPrimary || '#ec4899' }}
                >
                  {category.label}
                </Link>
                <span>•</span>
                <span style={{ color: siteInfo.colorPrimary || '#ec4899' }}>{product.name}</span>
              </nav>
            </div>
          </div>
          <div className="flex items-center gap-3 sm:gap-4">
            {/* Cart icon - only show if cart has items (after hydration to avoid mismatch) */}
            {hasMounted && getCartItemCount() > 0 && (
              <Link
                href={`/cart?storefront=${encodeURIComponent(storefront)}&colorPrimary=${encodeURIComponent(siteInfo.colorPrimary || '')}&colorSecondary=${encodeURIComponent(siteInfo.colorSecondary || '')}&colorTertiary=${encodeURIComponent(siteInfo.colorTertiary || '')}`}
                onClick={() => {
                  // Ensure storefront is saved to cache before navigating to cart
                  if (storefront && typeof window !== 'undefined') {
                    saveStorefrontToCache(storefront);
                  }
                }}
                className="relative ml-2 flex items-center justify-center rounded-full border bg-white/80 p-2 shadow-sm transition-colors hover:bg-secondary"
                aria-label="Shopping cart"
                style={{ 
                  borderColor: `${siteInfo.colorSecondary || '#64748b'}4D`,
                  color: siteInfo.colorSecondary || '#64748b',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = siteInfo.colorSecondary || '#64748b';
                }}
              >
                <svg
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth="2"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007zM8.625 10.5a.375.375 0 11-.75 0 .375.375 0 01.75 0zm7.5 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"
                  />
                </svg>
                <span 
                  className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full text-xs font-semibold text-white" 
                  style={{ backgroundColor: siteInfo.colorPrimary || '#ec4899' }}
                  suppressHydrationWarning
                >
                  {getCartItemCount() > 9 ? '9+' : getCartItemCount()}
                </span>
              </Link>
            )}
            <SettingsMenu 
              secondaryColor={siteInfo.colorSecondary || '#64748b'} 
              primaryColor={siteInfo.colorPrimary || '#ec4899'} 
            />
          </div>
        </div>
      </header>

          <main className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-12 sm:px-6 lg:flex-row lg:items-start lg:gap-16 lg:px-8">
        {/* Gallery */}
        <section className="flex w-full flex-col gap-4 lg:w-1/2">
          <div 
            className="overflow-hidden rounded-3xl bg-secondary/70 shadow-sm ring-1 ring-secondary/50 relative w-full"
            style={{
              aspectRatio: imageAspectRatio,
              maxHeight: '80vh',
            }}
          >
            {activeImage ? (
              <img
                src={activeImage}
                alt={product.name}
                className="w-full h-full object-contain"
                style={{ display: 'block' }}
                onLoad={(e) => {
                  // Calculate aspect ratio from loaded image
                  const img = e.target;
                  if (img.naturalWidth && img.naturalHeight) {
                    const aspectRatio = img.naturalWidth / img.naturalHeight;
                    setImageAspectRatio(aspectRatio);
                  }
                  // Clear ghost effect once image is loaded
                  if (isChangingVariant) {
                    // Small delay to ensure smooth transition
                    setTimeout(() => {
                      setIsChangingVariant(false);
                    }, 200);
                  }
                }}
                onError={() => {
                  // Also clear on error
                  setIsChangingVariant(false);
                }}
              />
            ) : (
              <div className="flex items-center justify-center text-secondary w-full h-full" style={{ aspectRatio: imageAspectRatio }}>
                <svg className="h-16 w-16" viewBox="0 0 48 48" fill="none" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M8 37l10-12a2 2 0 013 0l7 8 5-6a2 2 0 013 0l7 8M5 11a2 2 0 012-2h34a2 2 0 012 2v26a2 2 0 01-2 2H7a2 2 0 01-2-2V11z"
                  />
                </svg>
              </div>
            )}
            {/* Ghost skeleton overlay when changing variant */}
            {isChangingVariant && (
              <div className="absolute inset-0 z-10 overflow-hidden rounded-3xl bg-white/50 backdrop-blur-sm">
                <div className="h-full w-full animate-pulse">
                  <div className="aspect-[3/4] w-full bg-secondary/40 relative overflow-hidden">
                    <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/20 to-transparent"></div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {galleryImages.length > 1 && (
            <div className="grid grid-cols-4 gap-3">
              {galleryImages.map((image) => (
                <button
                  key={image}
                  type="button"
                  onClick={() => setActiveImage(image)}
                  className={`overflow-hidden rounded-2xl border transition ${
                    activeImage === image
                      ? 'shadow-md'
                      : ''
                  }`}
                  style={{
                    borderColor: activeImage === image ? (siteInfo.colorPrimary || '#ec4899') : 'rgba(100, 116, 139, 0.7)',
                  }}
                  onMouseEnter={(e) => {
                    if (activeImage !== image) {
                      e.currentTarget.style.borderColor = `${siteInfo.colorPrimary || '#ec4899'}4D`;
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (activeImage !== image) {
                      e.currentTarget.style.borderColor = 'rgba(100, 116, 139, 0.7)';
                    }
                  }}
                >
                  <div className="aspect-square relative">
                    <Image src={image} alt="" fill sizes="(max-width: 1024px) 25vw, 12.5vw" className="object-contain" />
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>

        {/* Product Info */}
        <section className="flex w-full flex-col gap-8 lg:w-1/2">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/80 px-3 py-1 text-xs font-semibold uppercase tracking-[0.3em]" style={{ color: siteInfo.colorPrimary || '#ec4899' }}>
              {category.label}
            </div>
            <h1 className="text-3xl font-light sm:text-4xl md:text-5xl" style={{ color: siteInfo.colorPrimary || '#ec4899' }}>
              {product.name}
            </h1>
            <p className="text-lg sm:text-xl" style={{ color: siteInfo.colorSecondary || '#64748b' }}>{product.description}</p>
            {Array.isArray(product.bulletPoints) && product.bulletPoints.length > 0 && (
              <div className="space-y-2">
                <h2 className="text-sm font-semibold uppercase tracking-[0.3em]" style={{ color: siteInfo.colorPrimary || '#ec4899' }}>
                  Details
                </h2>
                <ul className="list-disc space-y-1 pl-5 text-sm" style={{ color: siteInfo.colorSecondary || '#64748b' }}>
                  {product.bulletPoints
                    .filter((point) => typeof point === 'string' && point.trim().length > 0)
                    .map((point, index) => (
                      <li key={`${product.id}-bullet-${index}`}>{point.trim()}</li>
                    ))}
                </ul>
              </div>
            )}
          </div>

              <div className="space-y-1">
                <div className="flex items-baseline gap-4">
                  <p className="text-3xl font-semibold sm:text-4xl" style={{ color: siteInfo.colorPrimary || '#ec4899' }}>
                    {formatPrice(displayedPrice, market)}
                  </p>
                </div>
                {isEU && (
                  <p className="text-sm" style={{ color: siteInfo.colorTertiary || '#94a3b8' }}>
                    Includes VAT
                  </p>
                )}
              </div>


          {hasVariants && (
            <div className="space-y-6">
              {/* Color/Type Selector */}
              {availableGroups.length > 1 && (
                <div className="space-y-3">
                  <h2 className="text-sm font-semibold uppercase tracking-[0.3em]" style={{ color: siteInfo.colorPrimary || '#ec4899' }}>
                    {(() => {
                      // Determine label based on whether selected group has colors
                      // Check if any variant in the selected group has a color field
                      const groupVariants = variantsByGroup.get(selectedGroup) || [];
                      const groupHasColor = groupVariants.some(v => v.color && !isCountry(v.color));
                      if (groupHasColor) {
                        return 'Color';
                      } else if (hasTypes) {
                        return 'Type';
                      } else {
                        return 'Variant';
                      }
                    })()}: {filterOutCountries(selectedGroup) || selectedGroup}
                  </h2>
                  <div className="flex flex-wrap gap-3">
                    {availableGroups.map((group) => {
                      const isSelected = selectedGroup === group;
                      const groupVariantsForGroup = variantsByGroup.get(group) || [];
                      // Get first image from variant (support both images array and image string)
                      const firstVariantWithImage = groupVariantsForGroup.find(
                        (v) => (Array.isArray(v.images) && v.images.length > 0) || v.image
                      );
                      const firstVariantImage = firstVariantWithImage
                        ? Array.isArray(firstVariantWithImage.images) && firstVariantWithImage.images.length > 0
                          ? firstVariantWithImage.images[0]
                          : firstVariantWithImage.image
                        : null;
                      // Check if this group is a color by checking if any variant in the group has a color field
                      // Trust that if variant.color exists, it IS a color (set using Shopify options during import)
                      const isGroupAColor = groupVariantsForGroup.some(v => v.color && !isCountry(v.color));
                      return (
                        <button
                          key={group}
                          type="button"
                          onClick={() => {
                            setIsChangingVariant(true);
                            setSelectedGroup(group);
                          }}
                          className={`relative flex items-center gap-2 rounded-xl border-2 px-4 py-2 transition ${
                            isSelected
                              ? 'shadow-md'
                              : 'bg-white/60'
                          }`}
                          style={{
                            borderColor: isSelected ? (siteInfo.colorPrimary || '#ec4899') : 'rgba(100, 116, 139, 0.7)',
                            backgroundColor: isSelected ? (siteInfo.colorPrimary || '#ec4899') : undefined,
                            color: isSelected ? (siteInfo.colorSecondary || '#64748b') : undefined,
                          }}
                          onMouseEnter={(e) => {
                            if (!isSelected) {
                              e.currentTarget.style.borderColor = `${siteInfo.colorPrimary || '#ec4899'}4D`;
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (!isSelected) {
                              e.currentTarget.style.borderColor = 'rgba(100, 116, 139, 0.7)';
                            }
                          }}
                        >
                          {firstVariantImage && hasColors && isGroupAColor && (
                            <div className="relative h-8 w-8">
                              <Image
                                src={firstVariantImage}
                                alt={group}
                                fill
                                sizes="32px"
                                className="rounded-full object-cover ring-1 ring-secondary/50"
                              />
                            </div>
                          )}
                          <span className="text-sm font-semibold" style={{ color: isSelected ? (siteInfo.colorSecondary || '#64748b') : (siteInfo.colorPrimary || '#ec4899') }}>{filterOutCountries(group) || group}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Size Selector (only show if there are multiple sizes for selected group) */}
              {availableSizes.length > 1 && (
                <div className="space-y-3">
                  <h2 className="text-sm font-semibold uppercase tracking-[0.3em]" style={{ color: siteInfo.colorPrimary || '#ec4899' }}>
                    Size
                  </h2>
                  <div className="grid grid-cols-4 gap-3">
                    {availableSizes.map((size) => {
                        const isSelected = selectedSize === size;
                        // Find variant by matching filtered size (need to check original size field)
                        const sizeVariant = groupVariants.find((v) => {
                          const filteredVariantSize = v.size ? filterOutCountries(v.size) : null;
                          return filteredVariantSize === size;
                        });
                        const isOutOfStock = !sizeVariant || (sizeVariant.stock ?? 0) === 0;
                        return (
                          <button
                            key={size}
                            type="button"
                            onClick={() => {
                              if (!isOutOfStock) {
                                setIsChangingVariant(true);
                                setSelectedSize(size);
                              }
                            }}
                            disabled={isOutOfStock}
                  className={`flex flex-col items-center justify-center rounded-xl border-2 px-3 py-2 text-sm font-semibold transition ${
                    isSelected
                      ? 'shadow-md'
                      : isOutOfStock
                      ? 'bg-white/30 cursor-not-allowed'
                      : 'bg-white/60'
                  }`}
                  style={{
                    borderColor: isSelected ? (siteInfo.colorPrimary || '#ec4899') : (isOutOfStock ? 'rgba(100, 116, 139, 0.3)' : 'rgba(100, 116, 139, 0.7)'),
                    backgroundColor: isSelected ? (siteInfo.colorPrimary || '#ec4899') : undefined,
                    color: isSelected ? (siteInfo.colorSecondary || '#64748b') : (isOutOfStock ? (siteInfo.colorTertiary || '#94a3b8') : (siteInfo.colorSecondary || '#64748b')),
                  }}
                  onMouseEnter={(e) => {
                    if (!isOutOfStock && !isSelected) {
                      e.currentTarget.style.borderColor = `${siteInfo.colorPrimary || '#ec4899'}4D`;
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isOutOfStock && !isSelected) {
                      e.currentTarget.style.borderColor = 'rgba(100, 116, 139, 0.7)';
                    }
                  }}
                          >
                            <span>{size}</span>
                          </button>
                        );
                      })}
                  </div>
                </div>
              )}

              {/* Show selected variant details */}
              {selectedVariant && (
                <div className="rounded-xl border border-secondary/70 bg-white/60 px-4 py-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold" style={{ color: siteInfo.colorPrimary || '#ec4899' }}>
                      {(() => {
                        const parts = [];
                        // Filter out countries from size
                        const size = selectedVariant.size ? filterOutCountries(selectedVariant.size) : null;
                        if (size) parts.push(size);
                        
                        // Include color if it exists (trust that it's a color from Shopify options)
                        if (selectedVariant.color && !isCountry(selectedVariant.color)) {
                          const filteredColor = filterOutCountries(selectedVariant.color);
                          if (filteredColor) parts.push(filteredColor);
                        }
                        
                        // Filter out countries from type
                        const type = selectedVariant.type ? filterOutCountries(selectedVariant.type) : null;
                        if (type) parts.push(type);
                        return parts.length > 0 ? parts.join(' • ') : 'One size';
                      })()}
                    </span>
                  </div>
                  {/* Display flexible attributes (Material, Model, Style, etc.) */}
                  {selectedVariant.attributes && typeof selectedVariant.attributes === 'object' && Object.keys(selectedVariant.attributes).length > 0 && (
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs" style={{ color: siteInfo.colorSecondary || '#64748b' }}>
                      {Object.entries(selectedVariant.attributes).map(([key, value]) => (
                        <div key={key} className="flex items-center gap-1">
                          <span className="font-medium">{key}:</span>
                          <span>{value}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

              <div className="flex flex-col gap-4">
                <button
                  type="button"
                  onClick={handleAddToBag}
                  disabled={addingToCart}
                  className="flex items-center justify-center gap-2 rounded-full px-8 py-3 text-sm font-semibold uppercase tracking-[0.3em] text-white shadow-lg transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 cursor-wait"
                  style={{
                    backgroundColor: justAdded 
                      ? (siteInfo.colorSecondary || '#64748b') 
                      : (siteInfo.colorPrimary || '#ec4899'),
                    opacity: addingToCart ? 0.8 : 1,
                    cursor: addingToCart ? 'wait' : 'pointer',
                  }}
                  onMouseEnter={(e) => {
                    if (!addingToCart && !justAdded) {
                      e.currentTarget.style.backgroundColor = `${siteInfo.colorPrimary || '#ec4899'}E6`;
                    } else if (!addingToCart && justAdded) {
                      // Slightly darker secondary color on hover when showing success
                      const secondaryColor = siteInfo.colorSecondary || '#64748b';
                      e.currentTarget.style.backgroundColor = `${secondaryColor}E6`;
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!addingToCart && !justAdded) {
                      e.currentTarget.style.backgroundColor = siteInfo.colorPrimary || '#ec4899';
                    } else if (!addingToCart && justAdded) {
                      e.currentTarget.style.backgroundColor = siteInfo.colorSecondary || '#64748b';
                    }
                  }}
                >
                  {addingToCart ? (
                    <>
                      <svg
                        className="h-4 w-4 animate-spin"
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
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        />
                      </svg>
                      Adding...
                    </>
                  ) : justAdded ? (
                    <>
                      <svg
                        className="h-4 w-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth="2.5"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M4.5 12.75l6 6 9-13.5"
                        />
                      </svg>
                      Added to cart!
                    </>
                  ) : currentCartItem ? (
                    <>
                      <svg
                        className="h-4 w-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth="2"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M12 4.5v15m7.5-7.5h-15"
                        />
                      </svg>
                      Add another ({currentCartItem.quantity} in cart)
                    </>
                  ) : (
                    <>
                      <svg
                        className="h-4 w-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth="2"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007zM8.625 10.5a.375.375 0 11-.75 0 .375.375 0 01.75 0zm7.5 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"
                        />
                      </svg>
                      Add to bag
                    </>
                  )}
                </button>
                {currentCartItem && !justAdded && (
                  <p className="text-xs font-medium" style={{ color: siteInfo.colorSecondary || '#64748b' }}>
                    This item is already in your cart. Click to add another.
                  </p>
                )}
                <p className="text-xs" style={{ color: siteInfo.colorTertiary || '#94a3b8' }}>
                  Free express shipping on orders over $150. Easy 30-day returns.
                </p>
              </div>

              {product.careInstructions && (
            <div className="space-y-2 rounded-3xl bg-white/70 p-6 ring-1 ring-secondary/70">
              <h3 className="text-sm font-semibold uppercase tracking-[0.3em]" style={{ color: siteInfo.colorPrimary || '#ec4899' }}>
                Care instructions
              </h3>
              <p className="text-sm whitespace-pre-line" style={{ color: siteInfo.colorSecondary || '#64748b' }}>
                {product.careInstructions}
              </p>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}


