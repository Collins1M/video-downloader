const STEPS = [
  {
    code: "00:01",
    title: "Paste",
    body: "Paste a supported video URL into the field above.",
  },
  {
    code: "00:02",
    title: "Choose",
    body: "Select the resolution, container, or audio quality you want.",
  },
  {
    code: "00:03",
    title: "Download",
    body: "Your file is processed and streamed straight to your device.",
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="border-t border-line/60 px-6 py-20 sm:py-28">
      <div className="mx-auto max-w-5xl">
        <h2 className="font-display text-2xl font-medium tracking-tight sm:text-3xl">
          How it works
        </h2>

        <div className="mt-10 grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-3">
          {STEPS.map((step) => (
            <div key={step.code} className="bg-surface p-6 sm:p-8">
              <p className="font-mono text-sm tabular text-amber">{step.code}</p>
              <p className="mt-4 font-display text-lg font-medium">{step.title}</p>
              <p className="mt-2 text-sm leading-relaxed text-ink-muted">{step.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
