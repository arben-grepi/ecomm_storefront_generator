'use client';

import MinimalSkeletonProductCard from './MinimalSkeletonProductCard';
import BorderedSkeletonProductCard from './BorderedSkeletonProductCard';
import OverlaySkeletonProductCard from './OverlaySkeletonProductCard';
import CompactSkeletonProductCard from './CompactSkeletonProductCard';

/**
 * SkeletonProductCardWrapper - Wraps skeleton cards and conditionally renders different card types
 */
export default function SkeletonProductCardWrapper({ 
  cardType = 'minimal',
  className = '',
  cardAspectRatio = '3:4',
  cardBorderRadius = 'medium',
  colorPrimary = '#ec4899',
  colorSecondary = '#64748b',
}) {
  const commonProps = {
    className,
    cardAspectRatio,
    cardBorderRadius,
  };

  switch (cardType) {
    case 'bordered':
      return <BorderedSkeletonProductCard {...commonProps} colorPrimary={colorPrimary} />;
    case 'overlay':
      return <OverlaySkeletonProductCard {...commonProps} />;
    case 'compact':
      return <CompactSkeletonProductCard {...commonProps} colorSecondary={colorSecondary} />;
    default: // minimal
      return <MinimalSkeletonProductCard {...commonProps} />;
  }
}

