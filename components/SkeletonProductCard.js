'use client';

/**
 * Skeleton product card component for loading states
 * Shows an animated placeholder that mimics the shape of ProductCard
 */
export default function SkeletonProductCard({ className = '' }) {
  return (
    <div className={`animate-pulse ${className}`}>
      {/* Image placeholder */}
      <div className="aspect-[3/4] rounded-3xl bg-secondary/50" />
      
      {/* Content placeholder */}
      <div className="mt-3 space-y-2">
        {/* Title placeholder */}
        <div className="h-4 w-3/4 rounded bg-secondary/50" />
        {/* Price placeholder */}
        <div className="h-5 w-1/3 rounded bg-secondary/40" />
      </div>
    </div>
  );
}


