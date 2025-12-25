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
  mode,
  isGeneratingAIContent = false,
}) {
  return (
    <>

      {/* AI Generated Text */}
      <div className="space-y-4">
        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Display Name
        </label>
        <div className="relative">
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            disabled={isGeneratingAIContent}
            className={`w-full rounded-lg border border-zinc-200 px-3 py-2 pr-10 text-sm focus:border-emerald-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 ${isGeneratingAIContent ? 'opacity-60 cursor-wait' : ''}`}
            placeholder={isGeneratingAIContent ? 'Generating with AI...' : 'Enter product display name'}
          />
          {isGeneratingAIContent && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <svg className="animate-spin h-4 w-4 text-emerald-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            </div>
          )}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
          Display Description
        </label>
        <div className="relative">
          <textarea
            value={displayDescription}
            onChange={(e) => setDisplayDescription(e.target.value)}
            disabled={isGeneratingAIContent}
            rows={4}
            className={`w-full rounded-lg border border-zinc-200 px-3 py-2 pr-10 text-sm focus:border-emerald-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 ${isGeneratingAIContent ? 'opacity-60 cursor-wait' : ''}`}
            placeholder={isGeneratingAIContent ? 'Generating with AI...' : 'Enter product description'}
          />
          {isGeneratingAIContent && (
            <div className="absolute right-3 top-3">
              <svg className="animate-spin h-4 w-4 text-emerald-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            </div>
          )}
        </div>
      </div>

      {/* Bullet Points */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Key Features (Bullet Points)
          </label>
          {isGeneratingAIContent && (
            <div className="flex items-center gap-2 text-xs text-emerald-600">
              <svg className="animate-spin h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <span>Generating...</span>
            </div>
          )}
        </div>
        <div className={`space-y-2 pb-6 ${isGeneratingAIContent ? 'opacity-60' : ''}`}>
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
                disabled={isGeneratingAIContent}
                className={`flex-1 rounded-lg border border-zinc-200 px-3 py-1.5 text-sm focus:border-emerald-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 ${isGeneratingAIContent ? 'opacity-60 cursor-wait' : ''}`}
                placeholder={isGeneratingAIContent ? 'Generating...' : 'Enter feature point'}
              />
              <button
                type="button"
                onClick={() => {
                  setBulletPoints(bulletPoints.filter((_, i) => i !== idx));
                }}
                disabled={isGeneratingAIContent}
                className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50 disabled:cursor-not-allowed"
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
            disabled={isGeneratingAIContent}
            className="rounded-full border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            + Add Bullet Point
          </button>
        </div>
      </div>
    </>
  );
}

