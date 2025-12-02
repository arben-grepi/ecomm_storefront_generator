/**
 * Variant utility functions for parsing and processing product variants
 * 
 * Assumption: Variants always follow format "color/style / size"
 * Example: "A / S", "green / One Size", "Black / M"
 */

/**
 * Normalize a string value for comparison
 */
export const normalizeString = (value) => {
  if (value === null || value === undefined) return '';
  return value.toString().trim().toLowerCase();
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
 * Check if a word is a color (case-insensitive)
 */
export const isColor = (word) => {
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

/**
 * Extract only color words from the prefix before "/"
 * "Black vest / S" -> "Black" (removes "vest")
 * "Rose Purple vest / L" -> "Rose Purple" (removes "vest")
 * "A / S" -> "A" (single letter preserved)
 */
export const getVariantColor = (variant) => {
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

/**
 * Extract size (suffix after "/") from variant title
 * "A / S" -> "S", "green / One Size" -> "One Size"
 */
export const getVariantSize = (variant) => {
  if (!variant?.title) return null;
  const clean = variant.title.replace(/\s+/g, " ").trim();
  const match = clean.match(/\s*\/\s*(.+)$/);
  return match?.[1]?.trim() || null;
};

/**
 * Get group key for variant (color/style) - used for grouping variants and images
 */
export const getVariantGroupKey = (variant) => {
  return getVariantColor(variant) || `variant:${variant.id || variant.shopifyId}`;
};

/**
 * Sort variants: by color/style, then by size
 */
export const sortVariantsList = (variantsList = []) => {
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

/**
 * Group variants with same color/style (prefix before "/")
 */
export const getVariantsWithSameColor = (variantsList, variantId) => {
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

