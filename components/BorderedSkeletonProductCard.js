'use client';

/**
 * Bordered skeleton product card - matches BorderedProductCard styling
 */
export default function BorderedSkeletonProductCard({ 
  className = '',
  cardAspectRatio = '3:4',
  cardBorderRadius = 'medium',
  colorPrimary = '#ec4899',
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
      <div 
        className={`flex w-full flex-col overflow-hidden ${borderRadiusClass} bg-white/90 ring-2 shadow-md`}
        style={{ '--tw-ring-color': colorPrimary }}
      >
        <div className={`${aspectRatioClass} w-full bg-secondary/20`} />
        <div className="flex flex-1 flex-col gap-3 p-3 sm:p-5">
          <div className="h-4 w-3/4 rounded bg-secondary/20" />
          <div className="mt-auto space-y-1">
            <div className="h-5 w-1/3 rounded bg-secondary/20" />
            <div className="h-3 w-1/2 rounded bg-secondary/15" />
          </div>
        </div>
      </div>
    </div>
  );
}

