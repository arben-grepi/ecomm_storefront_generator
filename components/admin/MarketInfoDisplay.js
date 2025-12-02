'use client';

/**
 * MarketInfoDisplay - Displays market availability information (read-only)
 */
export default function MarketInfoDisplay({ item }) {
  if (!item) return null;

  // Get markets from marketsObject (new format) or markets array (legacy)
  const marketsList = item.marketsObject && typeof item.marketsObject === 'object'
    ? Object.keys(item.marketsObject)
    : (Array.isArray(item.markets) ? item.markets : []);
  const marketNames = { FI: 'Finland', DE: 'Germany' };
  
  return (
    <div>
      <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
        Market Availability
      </label>
      <div className="flex flex-wrap gap-2">
        {marketsList.length === 0 ? (
          <span className="text-sm text-zinc-500 dark:text-zinc-400">No markets assigned (assign in Shopify)</span>
        ) : (
          marketsList.map((market) => {
            const marketData = item.marketsObject?.[market];
            const isAvailable = marketData?.available !== false;
            
            return (
              <div key={market} className="flex flex-col gap-1">
                <span
                  className={`inline-flex items-center rounded-lg border px-3 py-1.5 text-sm font-medium ${
                    isAvailable
                      ? 'border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                      : 'border-amber-500 bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                  }`}
                >
                  <span className="whitespace-nowrap">
                    {market} ({marketNames[market] || market})
                  </span>
                  {isAvailable ? (
                    <svg className="ml-1.5 h-3.5 w-3.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  ) : (
                    <svg className="ml-1.5 h-3.5 w-3.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                  )}
                </span>
                {!isAvailable && (
                  <span className="text-xs text-amber-600 dark:text-amber-400">
                    ⚠️ Not available
                  </span>
                )}
              </div>
            );
          })
        )}
      </div>
      <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
        <strong>Green badge:</strong> Product is assigned and available to customers in this market.<br />
        <strong>Amber badge:</strong> Product is assigned but not available (check inventory, shipping, or publication settings in Shopify).
      </p>
      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
        Markets are managed in Shopify. To change markets, update the product in Shopify and re-run the import script.
      </p>
    </div>
  );
}

