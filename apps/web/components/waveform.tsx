"use client";

const BAR_COUNT = 48;
// Precomputed heights/delays so the pattern looks organic rather than a
// uniform metronome — deterministic (no Math.random on every render).
const BARS = Array.from({ length: BAR_COUNT }, (_, i) => {
  const wave = Math.sin(i * 0.7) * 0.5 + 0.5;
  const jitter = Math.sin(i * 3.1) * 0.15;
  return {
    height: 0.25 + wave * 0.6 + jitter,
    delay: (i % 12) * 0.07,
  };
});

export function Waveform({
  active = false,
  className = "",
}: {
  /** When true, bars pulse (used for the real Analyzing state). When false, they sit static as ambient texture. */
  active?: boolean;
  className?: string;
}) {
  return (
    <div className={`flex h-full items-center gap-[3px] ${className}`} aria-hidden="true">
      {BARS.map((bar, i) => (
        <span
          key={i}
          className={`w-[3px] flex-none rounded-full bg-amber/70 ${active ? "animate-[waveform-pulse_1.1s_ease-in-out_infinite]" : ""}`}
          style={{
            height: `${bar.height * 100}%`,
            animationDelay: `${bar.delay}s`,
            opacity: active ? undefined : 0.35 + bar.height * 0.3,
            transform: active ? undefined : `scaleY(${bar.height})`,
          }}
        />
      ))}
    </div>
  );
}
