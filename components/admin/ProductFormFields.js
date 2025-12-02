'use client';

/**
 * ProductFormFields - Form fields for product display name, description, bullet points, and base price
 */
export default function ProductFormFields({
  displayName,
  setDisplayName,
  displayDescription,
  setDisplayDescription,
  bulletPoints,
  setBulletPoints,
  basePriceInput,
  setBasePriceInput,
  mode,
  handleGenerateAI,
  hideBasePrice = false,
}) {
  return (
    <>
      {!hideBasePrice && (
        <div>
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
            Base Price *
          </label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={basePriceInput}
            onChange={(e) => setBasePriceInput(e.target.value)}
            className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            placeholder="e.g., 79.99"
          />
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            All variants inherit this price unless a specific variant override is set.
          </p>
        </div>
      )}

      {/* AI Generated Text */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Display Name
          </label>
          {mode !== 'manual' && (
            <button
              type="button"
              onClick={handleGenerateAI}
              disabled={true}
              className="rounded-full bg-emerald-600 px-4 py-1.5 text-xs font-medium text-white transition hover:bg-emerald-700 disabled:opacity-50 cursor-not-allowed"
              title="AI text generation coming soon - see docs/ai-text-generation.md"
            >
              Generate with AI (Coming Soon)
            </button>
          )}
        </div>
        <input
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
          placeholder="Enter product display name"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
          Display Description
        </label>
        <textarea
          value={displayDescription}
          onChange={(e) => setDisplayDescription(e.target.value)}
          rows={4}
          className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
          placeholder="Enter product description"
        />
      </div>

      {/* Bullet Points */}
      <div>
        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
          Key Features (Bullet Points)
        </label>
        <div className="space-y-2 pb-6">
          {bulletPoints.map((point, idx) => (
            <div key={idx} className="flex items-start gap-2">
              <span className="mt-1 text-emerald-600">•</span>
              <input
                type="text"
                value={point}
                onChange={(e) => {
                  const newPoints = [...bulletPoints];
                  newPoints[idx] = e.target.value;
                  setBulletPoints(newPoints);
                }}
                className="flex-1 rounded-lg border border-zinc-200 px-3 py-1.5 text-sm focus:border-emerald-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                placeholder="Enter feature point"
              />
              <button
                type="button"
                onClick={() => {
                  setBulletPoints(bulletPoints.filter((_, i) => i !== idx));
                }}
                className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
              >
                Remove
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => {
              setBulletPoints([...bulletPoints, '']);
            }}
            className="rounded-full border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            + Add Bullet Point
          </button>
        </div>
      </div>
    </>
  );
}

