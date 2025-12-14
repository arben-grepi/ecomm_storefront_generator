'use client';

import MinimalPreviewProductCard from './MinimalPreviewProductCard';
import BorderedPreviewProductCard from './BorderedPreviewProductCard';
import OverlayPreviewProductCard from './OverlayPreviewProductCard';
import CompactPreviewProductCard from './CompactPreviewProductCard';

/**
 * PreviewProductCardWrapper - Wraps preview cards and conditionally renders different card types
 */
export default function PreviewProductCardWrapper({ 
  cardType = 'minimal',
  cardWidth,
  cardPadding,
  ...props 
}) {
  // Remove cardWidth and cardPadding from props - they're not used
  switch (cardType) {
    case 'bordered':
      return <BorderedPreviewProductCard {...props} />;
    case 'overlay':
      return <OverlayPreviewProductCard {...props} />;
    case 'compact':
      return <CompactPreviewProductCard {...props} />;
    default: // minimal
      return <MinimalPreviewProductCard {...props} />;
  }
}

