"use client";

import { useEffect, useState } from "react";
import { Waveform } from "@/components/waveform";

const STAGES = ["Checking URL", "Fetching media information", "Detecting available formats"];

export function AnalyzingState() {
  const [stageIndex, setStageIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setStageIndex((i) => Math.min(i + 1, STAGES.length - 1));
    }, 1400);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="animate-fade-up rounded-2xl border border-line bg-surface px-6 py-8 text-center sm:px-10 sm:py-10">
      <div className="mx-auto h-16 w-full max-w-sm sm:h-20">
        <Waveform active className="justify-center" />
      </div>

      <p className="mt-6 font-display text-lg font-medium" aria-live="polite">
        Analyzing video…
      </p>

      <ul
        aria-live="polite"
        className="mt-4 flex flex-col items-center gap-1.5 font-mono text-xs text-ink-muted"
      >
        {STAGES.map((stage, i) => (
          <li
            key={stage}
            className={`transition-opacity duration-300 ${i <= stageIndex ? "opacity-100" : "opacity-30"} ${i === stageIndex ? "text-amber" : ""}`}
          >
            {i < stageIndex ? "✓ " : i === stageIndex ? "› " : "  "}
            {stage}
          </li>
        ))}
      </ul>
    </div>
  );
}
