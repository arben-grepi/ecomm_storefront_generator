'use client';

export default function OrdersPlanPage() {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-8 px-6 py-16">
      <header className="space-y-2">
        <p className="text-sm uppercase tracking-[0.3em] text-zinc-400">Implementation plan</p>
        <h1 className="text-3xl font-semibold text-zinc-900">Order operations</h1>
        <p className="text-base text-zinc-500">
          Roadmap for building the order list, detail view, and fulfillment tooling.
        </p>
      </header>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-zinc-800">Milestones</h2>
        <ol className="list-decimal space-y-2 pl-6 text-zinc-600">
          <li>Create orders list with filters (status, date range, customer).</li>
          <li>Build order detail page showing items, totals, shipping address, and payment summary.</li>
          <li>Add status transitions (pending → paid → shipped) with timestamp tracking.</li>
          <li>Integrate shipment tracking fields and printable packing slips.</li>
          <li>Provide export (CSV) for accounting and future integrations.</li>
        </ol>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-zinc-800">API / Data needs</h2>
        <ul className="list-disc space-y-2 pl-6 text-zinc-600">
          <li>Firestore <code>orders</code> collection aligned with schema doc.</li>
          <li>Derived views for revenue and order volume stats (used on dashboard).</li>
          <li>Placeholder hooks for payment/shipping providers.</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-zinc-800">UX notes</h2>
        <ul className="list-disc space-y-2 pl-6 text-zinc-600">
          <li>Surface customer contact info prominently for quick support.</li>
          <li>Highlight outstanding actions (awaiting payment, needs fulfillment).</li>
          <li>Allow quick navigation back to related customer or cart records.</li>
        </ul>
      </section>
    </div>
  );
}
