'use client';

import { useState, useRef, useEffect } from 'react';

/**
 * FontSelector - Custom dropdown for font selection with hover preview support
 */
export default function FontSelector({ 
  value, 
  onChange, 
  onHover, 
  options,
  className = '' 
}) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [isOpen]);

  const selectedOption = options.find(opt => opt.value === value) || options[0];

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        onMouseEnter={() => {
          if (value && value !== 'inherit' && onHover) {
            onHover(value, true);
          }
        }}
        onMouseLeave={() => {
          if (onHover) {
            onHover(null, false);
          }
        }}
        className="w-full rounded border border-zinc-200 px-2.5 py-1.5 text-xs text-left text-zinc-900 dark:text-zinc-100 focus:border-emerald-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 flex items-center justify-between"
      >
        <span className="text-zinc-900 dark:text-zinc-100">{selectedOption?.label || 'Select font'}</span>
        <svg
          className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded shadow-lg max-h-60 overflow-y-auto">
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                onChange(option.value);
                setIsOpen(false);
                if (onHover) {
                  onHover(null, false);
                }
              }}
              onMouseEnter={() => {
                if (option.value !== 'inherit' && onHover) {
                  onHover(option.value, true);
                }
              }}
              onMouseLeave={() => {
                if (onHover) {
                  onHover(null, false);
                }
              }}
              className={`w-full text-left px-3 py-2 text-xs text-zinc-900 dark:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition ${
                value === option.value ? 'bg-emerald-50 dark:bg-emerald-900/20' : ''
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

