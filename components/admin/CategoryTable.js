'use client';

import React from 'react';
import Link from 'next/link';
import CategoryModalButton from './CreateCategoryButton';
import ProductItem from './ProductItem';

export default function CategoryTable({
  categories,
  loading,
  onToggleExpanded,
  expandedCategories,
  getCategoryProducts,
  onToggleActive,
  onUpdatePreviewProducts,
  db,
  setMessage,
}) {

  if (loading) {
    return (
      <table className="min-w-full divide-y divide-zinc-100 bg-white text-sm">
        <thead className="bg-zinc-50 text-zinc-500">
          <tr>
            <th className="px-4 py-3 text-left font-medium">Name</th>
            <th className="px-4 py-3 text-left font-medium">Slug</th>
            <th className="px-4 py-3 text-left font-medium">Status</th>
            <th className="px-4 py-3 text-left font-medium">Created</th>
            <th className="px-4 py-3 text-right font-medium">Action</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td colSpan={5} className="px-4 py-10 text-center text-zinc-400">
              Loading categories…
            </td>
          </tr>
        </tbody>
      </table>
    );
  }

  if (categories.length === 0) {
    return (
      <table className="min-w-full divide-y divide-zinc-100 bg-white text-sm">
        <thead className="bg-zinc-50 text-zinc-500">
          <tr>
            <th className="px-4 py-3 text-left font-medium">Name</th>
            <th className="px-4 py-3 text-left font-medium">Slug</th>
            <th className="px-4 py-3 text-left font-medium">Status</th>
            <th className="px-4 py-3 text-left font-medium">Created</th>
            <th className="px-4 py-3 text-right font-medium">Action</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td colSpan={5} className="px-4 py-10 text-center text-zinc-400">
              No categories found.
            </td>
          </tr>
        </tbody>
      </table>
    );
  }

  return (
    <table className="min-w-full divide-y divide-zinc-100 bg-white text-sm">
      <thead className="bg-zinc-50 text-zinc-500">
        <tr>
          <th className="px-4 py-3 text-left font-medium w-8"></th>
          <th className="px-4 py-3 text-left font-medium">Name</th>
          <th className="px-4 py-3 text-left font-medium">Slug</th>
          <th className="px-4 py-3 text-left font-medium">Status</th>
          <th className="px-4 py-3 text-left font-medium">Created</th>
          <th className="px-4 py-3 text-right font-medium">Action</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-zinc-100">
        {categories.map((category) => {
          const isExpanded = expandedCategories.has(category.id);
          const categoryProducts = getCategoryProducts(category.id);
          const currentPreviewIds = category.previewProductIds || [];

          return (
            <React.Fragment key={category.id}>
              <tr className="hover:bg-zinc-50/80">
                <td className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => onToggleExpanded(category.id)}
                    className="text-zinc-400 hover:text-zinc-600 transition"
                    aria-label={isExpanded ? 'Collapse products' : 'Expand products'}
                  >
                    <svg
                      className={`h-5 w-5 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-col">
                    <span className="font-medium text-zinc-800">{category.name}</span>
                    {category.description ? (
                      <span className="text-xs text-zinc-400">{category.description}</span>
                    ) : null}
                  </div>
                </td>
                <td className="px-4 py-3 text-zinc-500">{category.slug || '—'}</td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                      category.active === false
                        ? 'bg-rose-100 text-rose-600'
                        : 'bg-emerald-100 text-emerald-600'
                    }`}
                  >
                    {category.active === false ? 'Hidden' : 'Visible'}
                  </span>
                </td>
                <td className="px-4 py-3 text-zinc-500">
                  {category.createdAt?.toDate ? category.createdAt.toDate().toLocaleDateString() : '—'}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <CategoryModalButton
                      mode="edit"
                      triggerLabel="Edit"
                      category={category}
                      onCompleted={(updatedCategory) => {
                        setMessage({ type: 'success', text: `Category "${updatedCategory.name || category.name}" saved.` });
                      }}
                      className="rounded-full border border-zinc-200 px-3 py-1 text-xs font-medium text-zinc-600 transition hover:border-emerald-200 hover:bg-emerald-50/50"
                    />
                    <button
                      type="button"
                      onClick={() => onToggleActive(category)}
                      className="rounded-full border border-zinc-200 px-3 py-1 text-xs font-medium text-zinc-600 transition hover:border-emerald-200 hover:bg-emerald-50/50"
                    >
                      {category.active === false ? 'Unhide' : 'Hide'}
                    </button>
                  </div>
                </td>
              </tr>
              {isExpanded && (
                <tr>
                  <td colSpan={6} className="px-4 py-4 bg-zinc-50/50">
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-zinc-700">
                          Products ({categoryProducts.length})
                        </h3>
                        <Link
                          href={`/LUNERA/admin/products/new?categoryId=${category.id}`}
                          className="rounded-full border border-emerald-200 bg-emerald-50/50 px-3 py-1.5 text-xs font-medium text-emerald-600 transition hover:border-emerald-300 hover:bg-emerald-50"
                        >
                          + Add product
                        </Link>
                      </div>
                      {categoryProducts.length === 0 ? (
                        <div className="flex items-center justify-between">
                          <p className="text-sm text-zinc-400">No products in this category.</p>
                          <Link
                            href={`/LUNERA/admin/products/new?categoryId=${category.id}`}
                            className="rounded-full border border-emerald-200 bg-emerald-50/50 px-3 py-1.5 text-xs font-medium text-emerald-600 transition hover:border-emerald-300 hover:bg-emerald-50"
                          >
                            + Add product
                          </Link>
                        </div>
                      ) : (
                        <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
                          {categoryProducts.map((product) => {
                            const isSelected = currentPreviewIds.includes(product.id);
                            const canSelect = currentPreviewIds.length < 4 || isSelected;
                            const hasImage = product.images && product.images.length > 0 && product.images[0];

                            const handleToggle = () => {
                              if (!canSelect) return;

                              const newPreviewIds = isSelected
                                ? currentPreviewIds.filter((id) => id !== product.id)
                                : [...currentPreviewIds, product.id].slice(0, 4);

                              onUpdatePreviewProducts(category.id, newPreviewIds);
                            };

                            return (
                              <ProductItem
                                key={product.id}
                                product={product}
                                isSelected={isSelected}
                                canSelect={canSelect}
                                onToggle={handleToggle}
                              />
                            );
                          })}
                        </div>
                      )}
                      {currentPreviewIds.length > 0 && (
                        <div className="text-xs text-zinc-500 bg-emerald-50/50 border border-emerald-200 rounded-lg p-2">
                          <p className="text-emerald-700">
                            {currentPreviewIds.length} product{currentPreviewIds.length !== 1 ? 's' : ''} selected for homepage preview
                          </p>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              )}
            </React.Fragment>
          );
        })}
      </tbody>
    </table>
  );
}

