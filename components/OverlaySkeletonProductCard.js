'use client';

/**
 * Overlay skeleton product card - matches OverlayProductCard styling
 */
export default function OverlaySkeletonProductCard({ 
  className = '',
  cardAspectRatio = '3:4',
  cardBorderRadius = 'medium',
}) {
  // Border radius mapping
  const getBorderRadiusClass = (radius) => {
    switch (radius) {
      case 'none': return 'rounded-none';
      case 'small': return 'rounded-lg sm:rounded-xl';
      case 'medium': return 'rounded-2xl sm:rounded-3xl';
      case 'large': return 'rounded-3xl sm:rounded-[2rem]';
      default: return 'rounded-2xl sm:rounded-3xl';
    }
  };
  
  const borderRadiusClass = getBorderRadiusClass(cardBorderRadius);
  const aspectRatioClass = {
    '3:4': 'aspect-[3/4]',
    '1:1': 'aspect-square',
  }[cardAspectRatio] || 'aspect-[3/4]';

  return (
    <div className={`animate-pulse ${className}`}>
      <div className={`flex w-full flex-col overflow-hidden ${borderRadiusClass} bg-white/90 shadow-lg`}>
        <div className={`${aspectRatioClass} w-full bg-secondary/20 relative`}>
          <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-black/10 to-transparent" />
          <div className="absolute bottom-0 left-0 right-0 p-3 sm:p-4 space-y-2">
            <div className="h-4 w-3/4 rounded bg-white/30" />
            <div className="h-5 w-1/3 rounded bg-white/40" />
          </div>
        </div>
      </div>
    </div>
  );
}

