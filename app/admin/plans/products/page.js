'use client';

export default function ProductsPlanPage() {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-8 px-6 py-16">
      <header className="space-y-2">
        <p className="text-sm uppercase tracking-[0.3em] text-zinc-400">Implementation plan</p>
        <h1 className="text-3xl font-semibold text-zinc-900">Product management workflow</h1>
        <p className="text-base text-zinc-500">
          This document outlines the steps required to build product and variant management inside the admin dashboard.
        </p>
      </header>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-zinc-800">Milestones</h2>
        <ol className="list-decimal space-y-2 pl-6 text-zinc-600">
          <li>Create product list view with search, category filter, and active/inactive toggle.</li>
          <li>Build product detail editor supporting name, slug, description, media gallery, supplier assignment, and tags.</li>
          <li>Implement variant manager for size/color combinations, stock counts, price overrides, and SKU fields.</li>
          <li>Surface metrics panel (views, carts, purchases) read-only with placeholder data until analytics is wired.</li>
          <li>Add supplier selector with quick view of supplier contact details.</li>
        </ol>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-zinc-800">API / Data needs</h2>
        <ul className="list-disc space-y-2 pl-6 text-zinc-600">
          <li>Firestore collections: <code>products</code>, <code>products/{'{'}productId{'}'}/variants</code>, <code>suppliers</code>.</li>
          <li>Ability to upload and store product imagery (use Firebase Storage).</li>
          <li>Utility functions for stock adjustments and price overrides.</li>
          <li>Optional Cloud Function hook to validate variant stock on save.</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-zinc-800">UX notes</h2>
        <ul className="list-disc space-y-2 pl-6 text-zinc-600">
          <li>Keep editing UI consistent with current admin styling.</li>
          <li>Support draft saving and preview in future iterations.</li>
          <li>Include breadcrumbs or sticky navigation for large forms.</li>
        </ul>
      </section>
    </div>
  );
}
