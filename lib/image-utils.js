/**
 * Image utility functions for handling image URLs
 * - Display: Use optimized/thumbnail sizes for modal display
 * - Save: Keep full-quality URLs when saving to Firestore
 */

/**
 * Get display image URL (thumbnail/optimized for modal display)
 * For Shopify images, uses size parameter. For other images, returns as-is.
 * 
 * @param {string} url - Original image URL
 * @param {number} maxWidth - Maximum width for display (default: 300)
 * @returns {string} Optimized image URL for display
 */
export const getDisplayImageUrl = (url, maxWidth = 300) => {
  if (!url) return url;
  
  // For Shopify images, use size parameter
  if (url.includes('cdn.shopify.com')) {
    // Remove existing query parameters and add width parameter
    const baseUrl = url.split('?')[0];
    return `${baseUrl}?width=${maxWidth}`;
  }
  
  // For other images, return as-is (or implement resizing service if needed)
  return url;
};

/**
 * Get full-quality image URL (remove size parameters)
 * Use this when saving images to Firestore to preserve quality
 * 
 * @param {string} url - Image URL (may contain size parameters)
 * @returns {string} Full-quality image URL
 */
export const getFullQualityImageUrl = (url) => {
  if (!url) return url;
  
  // Remove any query parameters to get full quality
  // This ensures we save the original, unoptimized image URL
  return url.split('?')[0];
};

/**
 * Check if image URL is overly large and should be resized
 * Only resize if width > threshold (default: 2000px)
 * 
 * @param {string} url - Image URL
 * @param {number} threshold - Width threshold in pixels (default: 2000)
 * @returns {boolean} True if image should be resized
 */
export const shouldResizeImage = (url, threshold = 2000) => {
  if (!url) return false;
  
  // For Shopify images, check if width parameter exists and is > threshold
  if (url.includes('cdn.shopify.com')) {
    const widthMatch = url.match(/[?&]width=(\d+)/);
    if (widthMatch) {
      const width = parseInt(widthMatch[1], 10);
      return width > threshold;
    }
  }
  
  // For other images, we can't determine size from URL
  // Return false to preserve original
  return false;
};

