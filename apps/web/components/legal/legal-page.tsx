import type { ReactNode } from "react";

export function LegalPage({
  title,
  effectiveDate,
  children,
}: {
  title: string;
  effectiveDate: string;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-3xl px-6 py-16 sm:py-24">
      <p className="font-mono text-xs uppercase tracking-wide text-amber">Reel</p>
      <h1 className="mt-2 font-display text-3xl font-medium tracking-tight sm:text-4xl">{title}</h1>
      <p className="mt-3 font-mono text-xs text-ink-muted">Effective {effectiveDate}</p>

      <div className="prose-legal mt-10 space-y-8 leading-relaxed text-ink-muted">{children}</div>
    </div>
  );
}

export function LegalSection({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="font-display text-lg font-medium text-ink">{heading}</h2>
      <div className="mt-2 space-y-3">{children}</div>
    </section>
  );
}
