'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

export default function PageTransitionBar() {
  const pathname = usePathname();
  const [isVisible, setIsVisible] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    setIsVisible(true);
    setProgress(0);

    const start = requestAnimationFrame(() => setProgress(20));
    const mid = setTimeout(() => setProgress(65), 120);
    const end = setTimeout(() => setProgress(100), 320);
    const cleanup = setTimeout(() => {
      setIsVisible(false);
      setProgress(0);
    }, 650);

    return () => {
      cancelAnimationFrame(start);
      clearTimeout(mid);
      clearTimeout(end);
      clearTimeout(cleanup);
    };
  }, [pathname]);

  return (
    <div
      className={`pointer-events-none fixed left-0 top-0 z-[9999] h-1 origin-left bg-gradient-to-r from-pink-500 via-pink-400 to-pink-300 transition-all duration-200 ease-out ${
        isVisible ? 'opacity-100' : 'opacity-0'
      }`}
      style={{ transform: `scaleX(${progress / 100})` }}
    />
  );
}
