'use client';

/**
 * PaletteColorSelector - Component for selecting which palette color to use
 */
export default function PaletteColorSelector({ 
  label, 
  value, 
  onChange, 
  helpText = '',
  colorPalette = {}
}) {
  const paletteOptions = [
    { 
      value: 'primary', 
      label: 'Primary Color', 
      color: colorPalette.colorPrimary || '#ec4899'
    },
    { 
      value: 'secondary', 
      label: 'Secondary Color', 
      color: colorPalette.colorSecondary || '#64748b'
    },
    { 
      value: 'tertiary', 
      label: 'Tertiary Color', 
      color: colorPalette.colorTertiary || '#94a3b8'
    },
  ];

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
        {label}
      </label>
      <select
        value={value || 'secondary'}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
      >
        {paletteOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label} ({option.color})
          </option>
        ))}
      </select>
      {helpText && (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">{helpText}</p>
      )}
    </div>
  );
}

