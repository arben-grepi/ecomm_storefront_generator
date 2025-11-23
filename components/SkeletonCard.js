'use client';

/**
 * Skeleton card component for loading states
 * Shows an animated placeholder that mimics the shape of CategoryCard
 */
export default function SkeletonCard({ className = '' }) {
  return (
    <div className={`animate-pulse rounded-2xl border border-secondary/30 bg-white/60 shadow-sm sm:rounded-3xl ${className}`}>
      {/* Image placeholder */}
      <div className="aspect-[4/3] rounded-t-2xl bg-secondary/50 sm:rounded-t-3xl" />
      
      {/* Content placeholder */}
      <div className="space-y-2 p-3 sm:space-y-2.5 sm:p-4">
        {/* Title placeholder */}
        <div className="h-5 w-3/4 rounded bg-secondary/50 sm:h-6" />
        {/* Description placeholder */}
        <div className="space-y-1.5">
          <div className="h-3 w-full rounded bg-secondary/40 sm:h-4" />
          <div className="h-3 w-5/6 rounded bg-secondary/40 sm:h-4" />
        </div>
        {/* Product preview grid placeholder */}
        <div className="grid grid-cols-4 gap-1.5 pt-1.5 sm:gap-2 sm:pt-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="aspect-square rounded-md bg-secondary/40 sm:rounded-lg" />
          ))}
        </div>
      </div>
    </div>
  );
}

