'use client';

import { useEffect } from 'react';

/**
 * GoogleFontsLoader - Loads Google Fonts for the font selector
 * Adds the fonts to the document head so they're available for preview
 */
export default function GoogleFontsLoader() {
  useEffect(() => {
    // Check if fonts are already loaded
    const existingLink = document.querySelector('link[href*="fonts.googleapis.com/css2"]');
    if (existingLink) {
      return; // Fonts already loaded
    }

    // Create and add Google Fonts link
    const link = document.createElement('link');
    link.rel = 'preconnect';
    link.href = 'https://fonts.googleapis.com';
    document.head.appendChild(link);

    const link2 = document.createElement('link');
    link2.rel = 'preconnect';
    link2.href = 'https://fonts.gstatic.com';
    link2.crossOrigin = 'anonymous';
    document.head.appendChild(link2);

    const fontLink = document.createElement('link');
    fontLink.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Roboto:wght@400;500;700&family=Open+Sans:wght@400;600;700&family=Montserrat:wght@400;600;700&family=Poppins:wght@400;500;600;700&family=Raleway:wght@400;500;600;700&family=Nunito:wght@400;600;700&family=Lato:wght@400;700&family=Source+Sans+Pro:wght@400;600;700&family=Work+Sans:wght@400;500;600&family=DM+Sans:wght@400;500;700&family=Plus+Jakarta+Sans:wght@400;500;600;700&family=Space+Grotesk:wght@400;500;600;700&family=Outfit:wght@400;500;600;700&family=Manrope:wght@400;500;600;700&family=Rubik:wght@400;500;600;700&family=Quicksand:wght@400;500;600;700&family=Playfair+Display:wght@400;500;600;700&family=Lora:wght@400;500;600;700&family=Merriweather:wght@400;700&family=Cormorant+Garamond:wght@400;500;600;700&family=Crimson+Pro:wght@400;600;700&family=Libre+Baskerville:wght@400;700&family=Cinzel:wght@400;500;600;700&family=Bebas+Neue&family=Oswald:wght@400;500;600;700&family=Dancing+Script:wght@400;500;600;700&family=Pacifico&family=Comfortaa:wght@400;500;600;700&display=swap';
    fontLink.rel = 'stylesheet';
    document.head.appendChild(fontLink);
  }, []);

  return null;
}

