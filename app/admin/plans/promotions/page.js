'use client';

export default function PromotionsPlanPage() {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-8 px-6 py-16">
      <header className="space-y-2">
        <p className="text-sm uppercase tracking-[0.3em] text-zinc-400">Implementation plan</p>
        <h1 className="text-3xl font-semibold text-zinc-900">Promotion & discount management</h1>
        <p className="text-base text-zinc-500">
          Outline for introducing campaign management, coupon codes, and promotion reporting.
        </p>
      </header>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-zinc-800">Milestones</h2>
        <ol className="list-decimal space-y-2 pl-6 text-zinc-600">
          <li>Build promotions list view with status filter (upcoming, active, expired).</li>
          <li>Create promotion editor supporting code, description, type (percentage/amount), value, validity window, and usage cap.</li>
          <li>Add targeting controls for categories and individual products.</li>
          <li>Integrate redemption logic into checkout flow (placeholder hook until payments are wired).</li>
          <li>Expose basic performance metrics (redemptions, revenue attributed).</li>
        </ol>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-zinc-800">API / Data needs</h2>
        <ul className="list-disc space-y-2 pl-6 text-zinc-600">
          <li>Firestore collection: <code>promotions</code> with fields defined in database schema.</li>
          <li>Associate promotions to orders at checkout for performance tracking.</li>
          <li>Optional Cloud Function to enforce redemption limits atomically.</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-zinc-800">UX notes</h2>
        <ul className="list-disc space-y-2 pl-6 text-zinc-600">
          <li>Highlight active promotions on the dashboard overview.</li>
          <li>Prevent overlapping codes by validating uniqueness on save.</li>
          <li>Support copy-to-clipboard for generated code values.</li>
        </ul>
      </section>
    </div>
  );
}
