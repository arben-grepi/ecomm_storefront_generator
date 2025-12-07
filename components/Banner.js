'use client';

/**
 * Banner Component
 * Displays a full-width banner image with optional centered content overlay
 * 
 * @param {string} imageSrc - URL of the banner image
 * @param {React.ReactNode} children - Content to display centered on top of the banner
 * @param {number} maxHeight - Maximum height in pixels (default: 600)
 * @param {string} className - Additional CSS classes for the banner container
 */
export default function Banner({ imageSrc, children, maxHeight = 450, className = '', marginBottom = 40 }) {
  if (!imageSrc) {
    // If no image, just render children without banner
    return children ? <div className={className}>{children}</div> : null;
  }

  // Determine width: if className includes 'w-full', use 100% (for preview), otherwise use 100vw (for homepage)
  const useFullWidth = className.includes('w-full');
  const bannerWidth = useFullWidth ? '100%' : '100vw';

  return (
    <div className={`relative overflow-hidden ${className}`} style={{ width: bannerWidth, maxHeight: `${maxHeight}px`, marginBottom: `${marginBottom}px` }}>
      {/* Banner Image - Width 100vw on homepage, 100% in preview */}
      <div style={{ width: '100%', maxHeight: `${maxHeight}px`, overflow: 'hidden' }}>
        <img
          src={imageSrc}
          alt="Banner"
          className="h-auto"
          style={{ width: '100%', display: 'block' }}
          loading="eager"
        />
      </div>
      
      {/* Centered Content Overlay */}
      {children && (
        <div className="absolute inset-0 z-10 flex items-center justify-center">
          {children}
        </div>
      )}
    </div>
  );
}

