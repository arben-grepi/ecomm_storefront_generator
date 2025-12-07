'use client';

/**
 * HexColorInput - Component for inputting hex colors
 */
export default function HexColorInput({ 
  label, 
  value, 
  onChange, 
  helpText = '' 
}) {
  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
        {label}
      </label>
      <div className="flex gap-2">
        <input
          type="color"
          value={value || '#000000'}
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
          placeholder="#000000"
          className="flex-1 rounded-lg border border-zinc-200 px-3 py-2 text-sm font-mono focus:border-emerald-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
        />
      </div>
      {helpText && (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">{helpText}</p>
      )}
    </div>
  );
}

