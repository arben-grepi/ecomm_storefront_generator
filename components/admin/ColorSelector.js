'use client';

/**
 * ColorSelector - Component for selecting text colors
 * Supports both Tailwind color classes and custom hex colors
 */
export default function ColorSelector({ 
  label, 
  value, 
  onChange, 
  helpText = '' 
}) {
  const isHexColor = value && value.startsWith('#');
  const isPrimary = value === 'primary';
  
  // Common Tailwind color options
  const tailwindColors = [
    { value: 'primary', label: 'Primary (Theme Color)', description: 'Uses the storefront primary color' },
    { value: 'slate-600', label: 'Slate 600', description: 'Medium gray' },
    { value: 'slate-500', label: 'Slate 500', description: 'Light gray' },
    { value: 'slate-700', label: 'Slate 700', description: 'Dark gray' },
    { value: 'slate-400', label: 'Slate 400', description: 'Light gray' },
    { value: 'zinc-600', label: 'Zinc 600', description: 'Medium gray' },
    { value: 'zinc-500', label: 'Zinc 500', description: 'Light gray' },
    { value: 'gray-600', label: 'Gray 600', description: 'Medium gray' },
    { value: 'gray-500', label: 'Gray 500', description: 'Light gray' },
  ];

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
        {label}
      </label>
      
      {/* Toggle between Tailwind and Custom */}
      <div className="flex gap-2 mb-2">
        <button
          type="button"
          onClick={() => onChange('primary')}
          className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition ${
            !isHexColor
              ? 'border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300'
              : 'border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'
          }`}
        >
          Tailwind Color
        </button>
        <button
          type="button"
          onClick={() => onChange('#6b7280')}
          className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition ${
            isHexColor
              ? 'border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300'
              : 'border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'
          }`}
        >
          Custom Hex
        </button>
      </div>

      {isHexColor ? (
        // Custom hex color input
        <div className="flex gap-2">
          <input
            type="color"
            value={value || '#6b7280'}
            onChange={(e) => onChange(e.target.value)}
            className="h-10 w-20 rounded-lg border border-zinc-200 cursor-pointer dark:border-zinc-700"
          />
          <input
            type="text"
            value={value || ''}
            onChange={(e) => {
              const val = e.target.value;
              if (val === '' || /^#[0-9A-Fa-f]{0,6}$/.test(val)) {
                onChange(val);
              }
            }}
            placeholder="#6b7280"
            className="flex-1 rounded-lg border border-zinc-200 px-3 py-2 text-sm font-mono focus:border-emerald-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
          />
        </div>
      ) : (
        // Tailwind color selector
        <select
          value={value || 'slate-600'}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
        >
          {tailwindColors.map((color) => (
            <option key={color.value} value={color.value}>
              {color.label} - {color.description}
            </option>
          ))}
        </select>
      )}

      {helpText && (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">{helpText}</p>
      )}
    </div>
  );
}

