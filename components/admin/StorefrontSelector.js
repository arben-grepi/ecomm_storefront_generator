'use client';

/**
 * StorefrontSelector - Component for selecting storefronts
 */
export default function StorefrontSelector({
  availableWebsites,
  storefrontSelections,
  setStorefrontSelections,
  setToastMessage,
  websitesLoading,
}) {
  if (websitesLoading) {
    return (
      <div>
        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
          Assign to Storefronts *
        </label>
        <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400">
          Loading storefronts...
        </div>
      </div>
    );
  }

  if (!availableWebsites || availableWebsites.length === 0) {
    return (
      <div>
        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
          Assign to Storefronts *
        </label>
        <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400">
          No storefronts available
        </div>
      </div>
    );
  }

  return (
    <div>
      <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
        Storefronts *
      </label>
      {availableWebsites.length === 1 ? (
        <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800/50 dark:text-zinc-400">
          {availableWebsites[0]} (only storefront available)
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {availableWebsites.map((storefront) => {
              const isSelected = storefrontSelections.includes(storefront);
              return (
                <label
                  key={storefront}
                  className="flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 transition hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                  style={{
                    borderColor: isSelected ? '#10b981' : undefined,
                    backgroundColor: isSelected ? '#ecfdf5' : undefined,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setStorefrontSelections([...storefrontSelections, storefront]);
                      } else {
                        // Prevent unchecking if it's the only selected storefront
                        if (storefrontSelections.length > 1) {
                          setStorefrontSelections(storefrontSelections.filter(s => s !== storefront));
                        } else {
                          e.preventDefault();
                          setToastMessage({ type: 'error', text: 'At least one storefront must be selected.' });
                        }
                      }
                    }}
                    className="h-4 w-4 rounded border-zinc-300 text-emerald-600 focus:ring-2 focus:ring-emerald-500 focus:ring-offset-0 dark:border-zinc-600 dark:bg-zinc-800"
                  />
                  <span className="flex-1 text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    {storefront}
                  </span>
                  {isSelected && (
                    <svg className="h-5 w-5 text-emerald-600 dark:text-emerald-400" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                </label>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
            Select one or more storefronts where this product should appear. At least one must be selected.
          </p>
        </>
      )}
    </div>
  );
}

