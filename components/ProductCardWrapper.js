'use client';

import { memo } from 'react';
import ProductCard from './ProductCard';
import BorderedProductCard from './BorderedProductCard';
import OverlayProductCard from './OverlayProductCard';
import CompactProductCard from './CompactProductCard';

/**
 * ProductCardWrapper - Wraps ProductCard and conditionally renders different card types
 * This keeps the original ProductCard unchanged
 */
function ProductCardWrapper({ 
  cardType = 'minimal',
  cardWidth,
  cardPadding,
  ...props 
}) {
  // Remove cardWidth and cardPadding from props - they're not used
  // Cards use responsive grid sizing instead
  switch (cardType) {
    case 'bordered':
      return <BorderedProductCard {...props} />;
    case 'overlay':
      return <OverlayProductCard {...props} />;
    case 'compact':
      return <CompactProductCard {...props} />;
    default: // minimal
      return <ProductCard {...props} />;
  }
}

export default memo(ProductCardWrapper);

