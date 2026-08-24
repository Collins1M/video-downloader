"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

const FAQS = [
  {
    q: "Which sites are supported?",
    a: "Reel works with publicly accessible, non-DRM video sources. Not every website is supported — if a link doesn't work, the source may not be compatible.",
  },
  {
    q: "Is there a size or length limit?",
    a: "Yes. Very large files may exceed the maximum supported size, in which case you'll see a clear error rather than a stalled download.",
  },
  {
    q: "Do I need an account?",
    a: "No. Analyzing and downloading both work anonymously — there's no sign-up step.",
  },
  {
    q: "What happens to the file after I download it?",
    a: "The temporary copy used to build your download is deleted from our servers right after it's sent to your browser, or automatically after a short window if it's never picked up.",
  },
  {
    q: "Can I download content I don't have rights to?",
    a: "No — this tool is meant for content you own, have permission to download, or that the source makes available for downloading. Respect copyright and platform terms.",
  },
];

export function FAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section id="faq" className="border-t border-line/60 px-6 py-20 sm:py-28">
      <div className="mx-auto max-w-3xl">
        <h2 className="font-display text-2xl font-medium tracking-tight sm:text-3xl">FAQ</h2>

        <div className="mt-8 divide-y divide-line/60 rounded-2xl border border-line bg-surface">
          {FAQS.map((item, i) => {
            const isOpen = openIndex === i;
            const triggerId = `faq-trigger-${i}`;
            const panelId = `faq-panel-${i}`;
            return (
              <div key={item.q}>
                <h3>
                  <button
                    type="button"
                    id={triggerId}
                    onClick={() => setOpenIndex(isOpen ? null : i)}
                    aria-expanded={isOpen}
                    aria-controls={panelId}
                    className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left sm:px-6"
                  >
                    <span className="font-medium">{item.q}</span>
                    <ChevronDown
                      className={`h-4 w-4 flex-none text-ink-muted transition-transform ${isOpen ? "rotate-180" : ""}`}
                      strokeWidth={1.5}
                    />
                  </button>
                </h3>
                {isOpen && (
                  <p
                    id={panelId}
                    role="region"
                    aria-labelledby={triggerId}
                    className="px-5 pb-4 text-sm leading-relaxed text-ink-muted sm:px-6"
                  >
                    {item.a}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
