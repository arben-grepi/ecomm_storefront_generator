'use client';

import { useEffect, useState } from 'react';

export default function Toast({
  message,
  onDismiss,
  duration = 3000,
  position = 'fixed',
  offsetClass = 'top-4 left-1/2 -translate-x-1/2',
  className = '',
}) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (message) {
      setShow(true);
      const timer = setTimeout(() => {
        setShow(false);
        setTimeout(() => {
          if (onDismiss) {
            onDismiss();
          }
        }, 300);
      }, duration);

      return () => clearTimeout(timer);
    }
  }, [message, duration, onDismiss]);

  if (!message) {
    return null;
  }

  return (
    <div
      className={`${position} ${offsetClass} z-[9999] transition-all duration-300 pointer-events-none ${
        show ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2'
      } ${className}`}
    >
      <div
        className={`pointer-events-auto rounded-xl border px-6 py-4 text-base font-medium shadow-lg min-w-[300px] max-w-md ${
          message.type === 'success'
            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
            : 'border-rose-200 bg-rose-50 text-rose-700'
        }`}
      >
        {message.text}
      </div>
    </div>
  );
}

