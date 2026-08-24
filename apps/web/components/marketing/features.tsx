import { Gauge, ShieldCheck, Layers, Trash2 } from "lucide-react";

const FEATURES = [
  {
    icon: Gauge,
    title: "Streamed, not stored",
    body: "Files are processed and sent straight to your browser — nothing sits on our servers afterward.",
  },
  {
    icon: Layers,
    title: "Pick your format",
    body: "Choose resolution, container, and audio-only options based on what the source actually offers.",
  },
  {
    icon: ShieldCheck,
    title: "No account needed",
    body: "Analyze and download without signing up. Anonymous by default.",
  },
  {
    icon: Trash2,
    title: "Automatic cleanup",
    body: "Temporary processing files are removed automatically, whether a download finishes, fails, or is abandoned.",
  },
];

export function Features() {
  return (
    <section id="features" className="border-t border-line/60 px-6 py-20 sm:py-28">
      <div className="mx-auto max-w-5xl">
        <h2 className="font-display text-2xl font-medium tracking-tight sm:text-3xl">Features</h2>

        <div className="mt-10 grid gap-6 sm:grid-cols-2">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <div key={title} className="flex gap-4 rounded-2xl border border-line bg-surface p-6">
              <Icon className="h-5 w-5 flex-none text-amber" strokeWidth={1.5} />
              <div>
                <p className="font-display text-base font-medium">{title}</p>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">{body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
