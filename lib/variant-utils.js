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
 * Extract size from variant using Shopify option names ONLY
 * Assumes Shopify API options are always available and reliable
 * @param {Object} variant - Variant object with option1, option2, option3, selectedOptions
 * @param {Array} productOptions - Product options array from rawProduct.options (REQUIRED)
 * @returns {string|null} - Extracted size value (with brackets cleaned)
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
      return cleanBrackets(sizeValue);
    }
  }
  
  return null;
};

/**
 * Normalize variant name to always have color/style first, then size
 * This ensures consistent grouping regardless of Shopify's order
 * Uses Shopify options ONLY - no fallbacks
 * @param {Object} variant - Variant object
 * @param {Array} productOptions - Product options array (REQUIRED)
 * @returns {string|null} - Normalized variant name in "color / size" format
 */
export const normalizeVariantName = (variant, productOptions = null) => {
  if (!variant) return null;
  
  // Extract color and size using Shopify options ONLY
  const color = getVariantColor(variant, productOptions);
  const size = getVariantSize(variant, productOptions);
  
  // If we have both, construct as "color / size"
  if (color && size) {
    return `${color} / ${size}`;
  }
  
  // If we only have color, return it
  if (color) {
    return color;
  }
  
  // If we only have size, return it
  if (size) {
    return size;
  }
  
  // If options aren't available, construct from selectedOptions directly
  if (variant.selectedOptions && Array.isArray(variant.selectedOptions) && variant.selectedOptions.length > 0) {
    const values = variant.selectedOptions
      .map(opt => cleanBrackets(opt.value || ''))
      .filter(Boolean);
    if (values.length > 0) {
      return values.join(' / ');
    }
  }
  
  // Last resort: use variantName if it exists (for already-saved variants)
  return variant.variantName || null;
};

/**
 * Get group key for variant (color/style) - used for grouping variants and images
 */
export const getVariantGroupKey = (variant, productOptions = null) => {
  return getVariantColor(variant, productOptions) || `variant:${variant.id || variant.shopifyId}`;
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
 * Group variants with same color/style (prefix before "/")
 */
export const getVariantsWithSameColor = (variantsList, variantId, productOptions = null) => {
  const variant = variantsList.find((v) => (v.id || v.shopifyId) === variantId);
  if (!variant) return [variantId];

  const groupKey = getVariantColor(variant, productOptions);
  if (!groupKey) return [variantId];

  // Group variants with same color/style (case-insensitive)
  const normalizedKey = normalizeString(groupKey);
  return variantsList
    .filter((v) => {
      const vColor = getVariantColor(v, productOptions);
      return vColor && normalizeString(vColor) === normalizedKey;
    })
    .map((v) => v.id || v.shopifyId);
};

