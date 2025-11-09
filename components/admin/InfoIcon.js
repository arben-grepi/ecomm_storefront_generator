'use client';

import { useState } from 'react';

export default function InfoIcon({ tooltip }) {
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        className="text-zinc-400 hover:text-zinc-600 transition-colors"
        aria-label="Information"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      </button>
      {showTooltip && (
        <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-64 rounded-lg bg-zinc-900 px-3 py-2 text-xs text-white shadow-lg z-50">
          {tooltip}
          <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-zinc-900" />
        </div>
      )}
    </div>
  );
}

