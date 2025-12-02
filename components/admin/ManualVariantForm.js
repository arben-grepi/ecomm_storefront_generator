'use client';

/**
 * ManualVariantForm - Form for adding new variants in manual mode
 */
export default function ManualVariantForm({
  newVariantForm,
  setNewVariantForm,
  basePriceInput,
  setToastMessage,
  handleAddVariant,
}) {
  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 p-4 space-y-4">
      <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Add Variant</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
            <input
              type="radio"
              checked={newVariantForm.hasColor}
              onChange={() => setNewVariantForm((prev) => ({ ...prev, hasColor: true, type: '' }))}
              className="rounded border-zinc-300"
            />
            Color
          </label>
          <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
            <input
              type="radio"
              checked={!newVariantForm.hasColor}
              onChange={() => setNewVariantForm((prev) => ({ ...prev, hasColor: false, color: '' }))}
              className="rounded border-zinc-300"
            />
            Type
          </label>
        </div>
        {newVariantForm.hasColor ? (
          <label className="flex flex-col gap-1">
            <span className="text-xs text-zinc-600 dark:text-zinc-400">Color *</span>
            <input
              type="text"
              value={newVariantForm.color}
              onChange={(e) => setNewVariantForm((prev) => ({ ...prev, color: e.target.value }))}
              className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm focus:border-emerald-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              placeholder="e.g., Red, Black"
            />
          </label>
        ) : (
          <label className="flex flex-col gap-1">
            <span className="text-xs text-zinc-600 dark:text-zinc-400">Type *</span>
            <input
              type="text"
              value={newVariantForm.type}
              onChange={(e) => setNewVariantForm((prev) => ({ ...prev, type: e.target.value }))}
              className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm focus:border-emerald-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              placeholder="e.g., Style A, Model 1"
            />
          </label>
        )}
        <label className="flex flex-col gap-1">
          <span className="text-xs text-zinc-600 dark:text-zinc-400">Size *</span>
          <input
            type="text"
            value={newVariantForm.size}
            onChange={(e) => setNewVariantForm((prev) => ({ ...prev, size: e.target.value }))}
            className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm focus:border-emerald-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            placeholder="e.g., S, M, L, One Size"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-zinc-600 dark:text-zinc-400">Stock</span>
          <input
            type="number"
            min="0"
            value={newVariantForm.stock}
            onChange={(e) => setNewVariantForm((prev) => ({ ...prev, stock: e.target.value }))}
            className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm focus:border-emerald-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            placeholder="0"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-zinc-600 dark:text-zinc-400">Price Override</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={newVariantForm.priceOverride}
            onChange={(e) => {
              const value = e.target.value;
              setNewVariantForm((prev) => ({ ...prev, priceOverride: value }));
            }}
            onBlur={(e) => {
              const value = e.target.value;
              const basePrice = basePriceInput ? parseFloat(basePriceInput) : 0;
              const variantPrice = value ? parseFloat(value) : null;

              // Validate that variant price is not less than base price
              if (value && !isNaN(variantPrice) && !isNaN(basePrice) && basePrice > 0 && variantPrice < basePrice) {
                // Automatically adjust to base price
                setNewVariantForm((prev) => ({ ...prev, priceOverride: basePrice.toString() }));
                setToastMessage({
                  type: 'error',
                  text: `Variant price cannot be less than base price (€${basePrice.toFixed(2)}). Adjusted to base price.`,
                });
              }
            }}
            className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm focus:border-emerald-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            placeholder="Optional"
          />
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Must be at least equal to base price (€{basePriceInput || '0.00'})
          </p>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-zinc-600 dark:text-zinc-400">SKU</span>
          <input
            type="text"
            value={newVariantForm.sku}
            onChange={(e) => setNewVariantForm((prev) => ({ ...prev, sku: e.target.value }))}
            className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm focus:border-emerald-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            placeholder="Optional"
          />
        </label>
      </div>
      <button
        type="button"
        onClick={handleAddVariant}
        className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700"
      >
        + Add Variant
      </button>
    </div>
  );
}

