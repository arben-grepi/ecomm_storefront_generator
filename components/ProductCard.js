'use client';

import Link from 'next/link';

const categoryLabels = {
  lingerie: 'Lingerie',
  underwear: 'Underwear',
  sports: 'Activewear',
  clothes: 'Clothing',
  dresses: 'Dresses',
};

export default function ProductCard({ product, categorySlug }) {
  const categoryLabel = categoryLabels[product.category] ?? 'Collection';

  return (
    <Link
      href={`/LUNERA/${categorySlug}/${product.slug}`}
      className="group flex w-full flex-col overflow-hidden rounded-2xl bg-white/90 shadow-sm ring-1 ring-secondary/70 transition hover:-translate-y-1 hover:shadow-xl sm:rounded-3xl"
      prefetch
    >
      <div className="aspect-[3/4] w-full overflow-hidden bg-secondary/70 sm:aspect-[3/4]">
        {product.image ? (
          <img
            src={product.image}
            alt={product.name}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-secondary">
            <svg className="h-10 w-10" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M3 8a2 2 0 012-2h14a2 2 0 012 2v9a2 2 0 01-2 2h-5l-2 3-2-3H5a2 2 0 01-2-2V8z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9 10h.01M15 10h.01M9.5 15a3.5 3.5 0 005 0"
              />
            </svg>
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-3 p-3 sm:p-5">
        <div>
          <p className="text-[0.65rem] font-medium uppercase tracking-[0.25em] text-primary sm:text-xs">
            {categoryLabel}
          </p>
          <h3 className="mt-2 text-sm font-medium text-slate-800 sm:text-base">
            {product.name}
          </h3>
        </div>
        <div className="mt-auto">
          <p className="text-base font-semibold text-primary sm:text-lg">
            ${product.price.toFixed(2)}
          </p>
        </div>
      </div>
    </Link>
  );
}
