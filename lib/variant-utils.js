/**
 * Variant utility functions for parsing and processing product variants
 * 
 * Handles both "color / size" and "size / color" formats by using Shopify's option names
 * Example: "L / Blue", "Blue / L", "A / S", "green / One Size", "Black / M"
 */

/**
 * Normalize a string value for comparison
 */
export const normalizeString = (value) => {
  if (value === null || value === undefined) return '';
  return value.toString().trim().toLowerCase();
};

/**
 * Clean brackets from a string (removes 【】, [], (), etc.)
 * "【Red】" -> "Red", "[Red]" -> "Red", "(Red)" -> "Red"
 */
export const cleanBrackets = (value) => {
  if (!value || typeof value !== 'string') return value;
  // Remove various bracket types: 【】, [], (), {}, <>
  return value.replace(/[【】\[\](){}<>]/g, '').trim();
};

/**
 * Clean variant name by removing trailing "|" or "/" characters
 * Handles cases like: "White|", "White /", "White / ", "White| ", etc.
 */
export const cleanVariantName = (variantName) => {
  if (!variantName || typeof variantName !== 'string') return variantName;
  // Remove trailing "|" or "/" characters (with optional whitespace before them)
  return variantName.replace(/[\s]*[|/]+[\s]*$/, '').trim() || null;
};

/**
 * Comprehensive color list - used to filter out non-color words from variant titles
 */
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

/**
 * Comprehensive size list - used to identify and validate sizes
 * Includes clothing sizes, bra sizes, and common size variations
 */
const SIZE_ENUM = new Set([
  // Standard clothing sizes
  'xs', 's', 'm', 'l', 'xl', 'xxl', 'xxxl', 'xxxxl',
  'x-small', 'small', 'medium', 'large', 'x-large', 'xx-large', 'xxx-large',
  // Numeric sizes (clothing)
  '0', '2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24', '26', '28', '30', '32', '34', '36', '38', '40', '42', '44', '46', '48', '50',
  // Bra sizes (band + cup)
  '28a', '28b', '28c', '28d', '28dd', '28e', '28f', '28g',
  '30a', '30b', '30c', '30d', '30dd', '30e', '30f', '30g',
  '32a', '32b', '32c', '32d', '32dd', '32e', '32f', '32g', '32h',
  '34a', '34b', '34c', '34d', '34dd', '34e', '34f', '34g', '34h',
  '36a', '36b', '36c', '36d', '36dd', '36e', '36f', '36g', '36h',
  '38a', '38b', '38c', '38d', '38dd', '38e', '38f', '38g', '38h',
  '40a', '40b', '40c', '40d', '40dd', '40e', '40f', '40g', '40h',
  '42a', '42b', '42c', '42d', '42dd', '42e', '42f', '42g', '42h',
  // Bra band sizes only
  '28', '30', '32', '34', '36', '38', '40', '42', '44', '46', '48',
  // Bra cup sizes only
  'a', 'aa', 'b', 'c', 'd', 'dd', 'e', 'f', 'ff', 'g', 'gg', 'h', 'hh', 'i', 'j',
  // Special sizes
  'one size', 'onesize', 'one-size', 'os', 'free size', 'freesize',
  'petite', 'tall', 'regular',
  // Plus sizes
  '1x', '2x', '3x', '4x', '5x',
  // European sizes
  'eu 32', 'eu 34', 'eu 36', 'eu 38', 'eu 40', 'eu 42', 'eu 44', 'eu 46',
  // UK sizes
  'uk 4', 'uk 6', 'uk 8', 'uk 10', 'uk 12', 'uk 14', 'uk 16', 'uk 18', 'uk 20',
].map(s => s.toLowerCase()));

/**
 * Check if a word is a color (case-insensitive)
 */
export const isColor = (word) => {
  if (!word) return false;
  const normalized = cleanBrackets(word).trim().toLowerCase();
  
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

/**
 * Check if a word is a size (case-insensitive)
 */
export const isSize = (word) => {
  if (!word) return false;
  const normalized = cleanBrackets(word).trim().toLowerCase();
  
  // Check exact match
  if (SIZE_ENUM.has(normalized)) return true;
  
  // Check if it matches size patterns (numeric, letter combinations, etc.)
  // Single letter sizes (S, M, L, etc.)
  if (/^[a-z]$/i.test(normalized)) return true;
  
  // Numeric sizes (0-50)
  if (/^\d+$/.test(normalized)) {
    const num = parseInt(normalized, 10);
    if (num >= 0 && num <= 50) return true;
  }
  
  // Bra sizes (e.g., "32B", "34C")
  if (/^\d+[a-z]+$/i.test(normalized)) return true;
  
  // Plus sizes (1X, 2X, etc.)
  if (/^\d+x$/i.test(normalized)) return true;
  
  return false;
};

/**
 * Find which option varies across variants (has multiple unique values)
 * This helps determine which option should be used for grouping variants
 * @param {Array} productOptions - Product options array from rawProduct.options
 * @param {Array} variants - Array of variant objects
 * @returns {number|null} - Index of the varying option, or null if none vary
 */
export const getVaryingOptionIndex = (productOptions = null, variants = []) => {
  if (!productOptions || !Array.isArray(productOptions) || productOptions.length === 0) {
    return null;
  }
  
  if (!variants || !Array.isArray(variants) || variants.length === 0) {
    return null;
  }
  
  // Check each option to see how many unique values it has across variants
  for (let i = 0; i < productOptions.length; i++) {
    const optionIndex = i;
    const uniqueValues = new Set();
    
    variants.forEach((variant) => {
      const value = variant[`option${optionIndex + 1}`] || 
                   (variant.selectedOptions && variant.selectedOptions[optionIndex]?.value) ||
                   null;
      if (value) {
        uniqueValues.add(cleanBrackets(value).toLowerCase());
      }
    });
    
    // If this option has multiple unique values, it's a varying option
    // Prefer options with 2+ unique values (but less than total variants, meaning some grouping happens)
    if (uniqueValues.size > 1) {
      return optionIndex;
    }
  }
  
  // If no option varies, return the first option (position 0)
  return 0;
};

/**
 * Extract color from variant using Shopify option names ONLY
 * Assumes Shopify API options are always available and reliable
 * @param {Object} variant - Variant object with option1, option2, option3, selectedOptions
 * @param {Array} productOptions - Product options array from rawProduct.options (REQUIRED)
 * @returns {string|null} - Extracted color value (with brackets cleaned)
 */
export const getVariantColor = (variant, productOptions = null) => {
  // Require product options - fail fast if not available
  if (!productOptions || !Array.isArray(productOptions) || productOptions.length === 0) {
    return null;
  }
  
  // Find which option is "Color" (case-insensitive)
  const colorOptionIndex = productOptions.findIndex(opt => 
    opt.name && /color|colour/i.test(opt.name)
  );
  
  if (colorOptionIndex >= 0) {
    // Get the color value from the corresponding option
    const colorValue = variant[`option${colorOptionIndex + 1}`] || 
                      (variant.selectedOptions && variant.selectedOptions[colorOptionIndex]?.value);
    if (colorValue) {
      return cleanBrackets(colorValue);
    }
  }
  
  return null;
};

/**
 * Clean size value by removing patterns like "INTL .{SIZE}" or similar
 * Examples: "XXLINTL .XL" -> "XXL", "XXXLINTL .2XL" -> "XXXL"
 * @param {string} sizeValue - Raw size value
 * @returns {string} - Cleaned size value
 */
export const cleanSizeValue = (sizeValue) => {
  if (!sizeValue || typeof sizeValue !== 'string') return sizeValue;
  
  let cleaned = cleanBrackets(sizeValue);
  const original = cleaned;
  
  // If the value contains "INTL .{SIZE}" pattern, extract the size after INTL
  // Examples: "XLINTL .L" -> "L", "XXLINTL .XL" -> "XL", "XXXLINTL .2XL" -> "2XL", "XXL(INTL .XL)" -> "XL"
  // Pattern: {SIZE}INTL .{ACTUAL_SIZE} - we want {ACTUAL_SIZE}
  const intlMatch = cleaned.match(/INTL\s*\.?\s*([A-Z0-9X]+)/i);
  if (intlMatch) {
    // Found INTL pattern - extract the size that comes after it
    const actualSize = intlMatch[1];
    console.log('[cleanSizeValue] Found INTL pattern, extracted size:', { original, actualSize });
    return actualSize.trim();
  }
  
  // If no INTL pattern, remove any remaining INTL references but keep the main size
  // This handles edge cases where INTL might appear elsewhere
  cleaned = cleaned.replace(/\s*\(?\s*INTL\s*\.?\s*[A-Z0-9X]+\)?\s*/gi, '');
  cleaned = cleaned.replace(/\s*INTL\s*\.?\s*[A-Z0-9X]+/gi, '');
  cleaned = cleaned.replace(/\s+INT\.?\s+[A-Z0-9X]+/gi, '');
  
  // Trim and return
  const result = cleaned.trim();
  
  if (original !== result) {
    console.log('[cleanSizeValue] Cleaned size:', { original, result });
  }
  
  return result;
};

/**
 * Extract size from variant using Shopify option names ONLY
 * Assumes Shopify API options are always available and reliable
 * @param {Object} variant - Variant object with option1, option2, option3, selectedOptions
 * @param {Array} productOptions - Product options array from rawProduct.options (REQUIRED)
 * @returns {string|null} - Extracted size value (with brackets cleaned and size patterns removed)
 */
export const getVariantSize = (variant, productOptions = null) => {
  // Require product options - fail fast if not available
  if (!productOptions || !Array.isArray(productOptions) || productOptions.length === 0) {
    return null;
  }
  
  // Find which option is "Size" (case-insensitive)
  const sizeOptionIndex = productOptions.findIndex(opt => 
    opt.name && /size/i.test(opt.name)
  );
  
  if (sizeOptionIndex >= 0) {
    // Get the size value from the corresponding option
    const sizeValue = variant[`option${sizeOptionIndex + 1}`] || 
                      (variant.selectedOptions && variant.selectedOptions[sizeOptionIndex]?.value);
    if (sizeValue) {
      console.log('[getVariantSize] Raw size value:', { sizeValue, sizeOptionIndex, variantId: variant.id || variant.shopifyId });
      const cleaned = cleanBrackets(sizeValue);
      const result = cleanSizeValue(cleaned);
      console.log('[getVariantSize] Cleaned size:', { cleaned, result });
      return result;
    }
  }
  
  return null;
};

/**
 * Get option value for a variant by option index
 * @param {Object} variant - Variant object
 * @param {number} optionIndex - Zero-based index of the option
 * @param {Array} productOptions - Product options array (optional, to determine if this is a size option)
 * @returns {string|null} - Option value (cleaned, with size patterns removed if it's a size option)
 */
export const getVariantOptionValue = (variant, optionIndex, productOptions = null) => {
  if (!variant || optionIndex == null || optionIndex < 0) return null;
  
  const value = variant[`option${optionIndex + 1}`] || 
                (variant.selectedOptions && variant.selectedOptions[optionIndex]?.value) ||
                null;
  
  if (!value) return null;
  
  const cleaned = cleanBrackets(value);
  const optionName = productOptions?.[optionIndex]?.name;
  const isSize = optionName && /size/i.test(optionName);
  
  // If this is a size option, clean size patterns like "XXLINTL .XL" -> "XXL"
  if (productOptions && isSize) {
    const result = cleanSizeValue(cleaned);
    console.log('[getVariantOptionValue] Size option cleaned:', { 
      variantId: variant.id || variant.shopifyId,
      optionIndex, 
      optionName,
      original: value, 
      cleaned, 
      result 
    });
    return result;
  }
  
  return cleaned;
};

/**
 * Check if a string is a country name (United States, USA, China, etc.)
 */
const isCountryName = (str) => {
  if (!str) return false;
  const normalized = str.trim().toLowerCase();
  const countryPatterns = [
    /^(united states|usa|u\.s\.a\.|us)$/i,
    /^china$/i,
    /^(united kingdom|uk|u\.k\.)$/i,
    /^canada$/i,
    /^australia$/i,
    /^japan$/i,
    /^germany$/i,
    /^france$/i,
    /^italy$/i,
    /^spain$/i,
    /^netherlands$/i,
    /^belgium$/i,
    /^switzerland$/i,
    /^austria$/i,
    /^sweden$/i,
    /^norway$/i,
    /^denmark$/i,
    /^finland$/i,
    /^poland$/i,
    /^portugal$/i,
    /^greece$/i,
    /^ireland$/i,
    /^brazil$/i,
    /^mexico$/i,
    /^india$/i,
    /^south korea$/i,
    /^singapore$/i,
    /^hong kong$/i,
    /^taiwan$/i,
    /^thailand$/i,
    /^vietnam$/i,
    /^indonesia$/i,
    /^philippines$/i,
    /^malaysia$/i,
  ];
  return countryPatterns.some(pattern => pattern.test(normalized));
};

/**
 * Remove country names from variant name parts (both first and last segments)
 */
const removeCountryFromParts = (parts) => {
  if (!parts || parts.length === 0) return parts;
  
  let filtered = [...parts];
  
  // Remove country from the beginning
  if (filtered.length > 0 && isCountryName(filtered[0])) {
    filtered = filtered.slice(1);
  }
  
  // Remove country from the end
  if (filtered.length > 0 && isCountryName(filtered[filtered.length - 1])) {
    filtered = filtered.slice(0, -1);
  }
  
  return filtered;
};

/**
 * Normalize variant name using ALL options dynamically
 * Constructs name from all option values (not just color/size)
 * If any option contains "Country", removes country segments from beginning or end
 * @param {Object} variant - Variant object
 * @param {Array} productOptions - Product options array
 * @returns {string|null} - Normalized variant name with all options joined by " / "
 */
export const normalizeVariantName = (variant, productOptions = null) => {
  if (!variant) return null;
  
  console.log('[normalizeVariantName] Called with:', { 
    variantId: variant.id || variant.shopifyId, 
    hasProductOptions: !!productOptions,
    productOptionsLength: productOptions?.length,
    variantTitle: variant.title,
    selectedOptions: variant.selectedOptions?.map(opt => ({ name: opt.name, value: opt.value }))
  });
  
  // Check if any product option contains "Country" in its name
  const hasCountryOption = productOptions?.some(opt => 
    opt?.name && /country/i.test(opt.name)
  );
  
  // If we have productOptions, use them to get all option values
  if (productOptions && Array.isArray(productOptions) && productOptions.length > 0) {
    const optionValues = [];
    
    for (let i = 0; i < productOptions.length; i++) {
      const value = getVariantOptionValue(variant, i, productOptions);
      console.log('[normalizeVariantName] Option value:', { 
        index: i, 
        optionName: productOptions[i]?.name, 
        value,
        isSize: /size/i.test(productOptions[i]?.name || '')
      });
      if (value) {
        optionValues.push(value);
      }
    }
    
    if (optionValues.length > 0) {
      let variantName = optionValues.join(' / ');
      console.log('[normalizeVariantName] Combined variant name:', variantName);
      // If Country option exists, remove country segments from beginning or end
      if (hasCountryOption && variantName.includes(' / ')) {
        const parts = variantName.split(' / ');
        const filteredParts = removeCountryFromParts(parts);
        variantName = filteredParts.length > 0 ? filteredParts.join(' / ').trim() : variantName;
        console.log('[normalizeVariantName] After country removal:', variantName);
      }
      console.log('[normalizeVariantName] Final result:', variantName);
      return variantName;
    }
  }

  // Fallback: Extract color and size using Shopify options (backward compatibility)
  const color = getVariantColor(variant, productOptions);
  const size = getVariantSize(variant, productOptions);

  if (color && size) {
    let variantName = `${color} / ${size}`;
    // If Country option exists, remove country segments from beginning or end
    if (hasCountryOption && variantName.includes(' / ')) {
      const parts = variantName.split(' / ');
      const filteredParts = removeCountryFromParts(parts);
      variantName = filteredParts.length > 0 ? filteredParts.join(' / ').trim() : variantName;
    }
    return variantName;
  }

  if (color) {
    return color;
  }

  if (size) {
    return size;
  }

  // If options aren't available, construct from selectedOptions directly
  if (variant.selectedOptions && Array.isArray(variant.selectedOptions) && variant.selectedOptions.length > 0) {
    const values = variant.selectedOptions
      .map(opt => cleanBrackets(opt.value || ''))
      .filter(Boolean);
    if (values.length > 0) {
      let variantName = values.join(' / ');
      // If Country option exists, remove country segments from beginning or end
      if (hasCountryOption && variantName.includes(' / ')) {
        const parts = variantName.split(' / ');
        const filteredParts = removeCountryFromParts(parts);
        variantName = filteredParts.length > 0 ? filteredParts.join(' / ').trim() : variantName;
      }
      return variantName;
    }
  }

  // Last resort: use variantName if it exists (for already-saved variants)
  let fallbackName = variant.variantName || variant.title || null;
  // If Country option exists and fallback name contains "/", remove country segments
  if (hasCountryOption && fallbackName && fallbackName.includes(' / ')) {
    const parts = fallbackName.split(' / ');
    const filteredParts = removeCountryFromParts(parts);
    fallbackName = filteredParts.length > 0 ? filteredParts.join(' / ').trim() : fallbackName;
  }
  return fallbackName;
};

/**
 * Get group key for variant - used for grouping variants and images
 * Uses the varying option (option that changes between variants) for grouping
 * Falls back to color if available, then to unique variant ID
 * @param {Object} variant - Variant object
 * @param {Array} productOptions - Product options array
 * @param {Array} allVariants - All variants array (optional, for determining varying option)
 * @returns {string} - Group key for this variant
 */
export const getVariantGroupKey = (variant, productOptions = null, allVariants = null) => {
  if (!variant) {
    return `variant:${variant?.id || variant?.shopifyId || 'unknown'}`;
  }
  
  // First, try to use color (for backward compatibility with color-based products)
  const color = getVariantColor(variant, productOptions);
  if (color) {
    return color;
  }
  
  // If we have productOptions and allVariants, find the varying option
  if (productOptions && allVariants && Array.isArray(allVariants) && allVariants.length > 0) {
    const varyingOptionIndex = getVaryingOptionIndex(productOptions, allVariants);
    
    if (varyingOptionIndex !== null) {
      const groupValue = getVariantOptionValue(variant, varyingOptionIndex);
      if (groupValue) {
        return groupValue;
      }
    }
  }
  
  // Fallback: try to use the first option value
  if (productOptions && productOptions.length > 0) {
    const firstOptionValue = getVariantOptionValue(variant, 0);
    if (firstOptionValue) {
      // But only use it if it's not a static value like "United States" (shipping location)
      // We'll use it anyway, but the caller can pass allVariants to ensure proper grouping
      return firstOptionValue;
    }
  }
  
  // Last resort: unique variant ID
  return `variant:${variant.id || variant.shopifyId}`;
};

/**
 * Sort variants: by color/style, then by size
 */
export const sortVariantsList = (variantsList = [], productOptions = null) => {
  const list = [...variantsList];
  list.sort((a, b) => {
    const colorA = normalizeString(getVariantColor(a, productOptions) || '');
    const colorB = normalizeString(getVariantColor(b, productOptions) || '');
    if (colorA !== colorB) {
      return colorA.localeCompare(colorB);
    }
    const sizeA = normalizeString(getVariantSize(a, productOptions) || '');
    const sizeB = normalizeString(getVariantSize(b, productOptions) || '');
    return sizeA.localeCompare(sizeB);
  });
  return list;
};

/**
 * Group variants with same group key (color, varying option, or type)
 * Uses the same grouping logic as getVariantGroupKey
 */
export const getVariantsWithSameColor = (variantsList, variantId, productOptions = null) => {
  const variant = variantsList.find((v) => (v.id || v.shopifyId) === variantId);
  if (!variant) return [variantId];

  // Get the group key for this variant (using all variants to determine varying option)
  const groupKey = getVariantGroupKey(variant, productOptions, variantsList);
  if (!groupKey || groupKey.startsWith('variant:')) {
    // If no meaningful group key, return just this variant
    return [variantId];
  }

  // Group variants with same group key (case-insensitive)
  const normalizedKey = normalizeString(groupKey);
  return variantsList
    .filter((v) => {
      const vGroupKey = getVariantGroupKey(v, productOptions, variantsList);
      return vGroupKey && normalizeString(vGroupKey) === normalizedKey;
    })
    .map((v) => v.id || v.shopifyId);
};

