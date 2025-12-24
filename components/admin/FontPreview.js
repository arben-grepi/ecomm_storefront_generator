'use client';

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

/**
 * FontPreview - Shows a preview of the font when hovering over font select options
 * Displays in the center of the screen with absolute positioning
 */
export default function FontPreview({ fontFamily, isVisible }) {
  const [showPreview, setShowPreview] = useState(false);
  const timeoutRef = useRef(null);

  useEffect(() => {
    if (isVisible) {
      // Clear any existing timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      setShowPreview(true);
    } else {
      // Wait 1 second before hiding
      timeoutRef.current = setTimeout(() => {
        setShowPreview(false);
      }, 1000);
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [isVisible]);

  if (!showPreview || !fontFamily) {
    return null;
  }

  // Don't show preview for 'inherit' (default system font)
  if (fontFamily === 'inherit') {
    return null;
  }

  const previewContent = (
    <div
      className="fixed inset-0 z-[9999] pointer-events-none flex items-center justify-center"
      style={{
        fontFamily: fontFamily,
      }}
    >
      <div className="bg-white rounded-lg shadow-2xl border border-zinc-200 px-8 py-6 max-w-md mx-4">
        <div className="text-center">
          <p className="text-2xl font-medium text-zinc-900 mb-2">
            The quick brown fox jumps over the lazy dog
          </p>
          <p className="text-sm text-zinc-500 mt-4">
            {fontFamily}
          </p>
        </div>
      </div>
    </div>
  );

  // Render to portal to ensure it's on top of everything
  if (typeof window !== 'undefined') {
    return createPortal(previewContent, document.body);
  }

  return null;
}

