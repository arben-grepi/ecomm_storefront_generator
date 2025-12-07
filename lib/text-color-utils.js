/**
 * Text Color Utilities
 * Converts color palette selections to CSS styles
 */

/**
 * Get the hex color value from a palette selection
 * @param {string} paletteSelection - Which palette color to use ('primary', 'secondary', 'tertiary')
 * @param {Object} colorPalette - Object with primary, secondary, tertiary hex colors
 * @returns {string|null} Hex color value or null if not found
 */
export function getColorFromPalette(paletteSelection, colorPalette) {
  if (!paletteSelection || !colorPalette) {
    return null;
  }

  const colorMap = {
    'primary': colorPalette.colorPrimary,
    'secondary': colorPalette.colorSecondary,
    'tertiary': colorPalette.colorTertiary,
  };

  return colorMap[paletteSelection] || null;
}

/**
 * Get inline style for a palette color selection
 * @param {string} paletteSelection - Which palette color to use ('primary', 'secondary', 'tertiary')
 * @param {Object} colorPalette - Object with primary, secondary, tertiary hex colors
 * @returns {Object} Style object with color property
 */
export function getTextColorStyle(paletteSelection, colorPalette) {
  const hexColor = getColorFromPalette(paletteSelection, colorPalette);
  
  if (hexColor) {
    return { color: hexColor };
  }
  
  // Fallback to default colors if palette not available
  const fallbackColors = {
    'primary': '#ec4899', // Default pink
    'secondary': '#64748b', // Default slate-600
    'tertiary': '#94a3b8', // Default slate-400
  };
  
  return { color: fallbackColors[paletteSelection] || fallbackColors.secondary };
}

/**
 * Get both class and style for a palette color selection
 * @param {string} paletteSelection - Which palette color to use ('primary', 'secondary', 'tertiary')
 * @param {Object} colorPalette - Object with primary, secondary, tertiary hex colors
 * @returns {Object} Object with className and style properties
 */
export function getTextColorProps(paletteSelection, colorPalette) {
  const style = getTextColorStyle(paletteSelection, colorPalette);
  
  return {
    className: '', // No Tailwind class needed, using inline styles
    style: style,
  };
}

