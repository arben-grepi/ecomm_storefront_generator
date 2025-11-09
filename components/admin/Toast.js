'use client';

import { useEffect, useState } from 'react';

export default function Toast({ message, onDismiss, duration = 3000 }) {
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
      className={`fixed top-4 left-1/2 z-50 -translate-x-1/2 transition-all duration-300 ${
        show ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2 pointer-events-none'
      }`}
    >
      <div
        className={`rounded-xl border px-4 py-3 text-sm shadow-lg ${
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

