import { DownloaderPanel } from "./downloader-panel";
import { Waveform } from "@/components/waveform";

export function Hero() {
  return (
    <section className="relative overflow-hidden px-6 pb-20 pt-16 sm:pb-28 sm:pt-24">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-64 opacity-[0.15] sm:h-80">
        <Waveform className="h-full" />
      </div>

      <div className="relative mx-auto flex max-w-3xl flex-col items-center text-center">
        <span className="mb-5 inline-flex items-center gap-2 rounded-full border border-line px-3 py-1 font-mono text-[11px] uppercase tracking-wider text-ink-muted">
          <span className="h-1.5 w-1.5 rounded-full bg-amber" />
          No account required
        </span>

        <h1 className="text-balance font-display text-4xl font-medium leading-[1.05] tracking-tight sm:text-6xl">
          Download videos.
          <br />
          <span className="text-amber">Simple. Fast.</span>
        </h1>

        <p className="mt-5 max-w-md text-balance text-base leading-relaxed text-ink-muted sm:text-lg">
          Paste a supported video link, choose your preferred format and quality, and download it
          directly to your device.
        </p>

        <div className="mt-10 w-full">
          <DownloaderPanel />
        </div>

        <p className="mt-6 font-mono text-xs text-ink-muted/70">
          Works with publicly accessible video sources. Not every website is supported.
        </p>
      </div>
    </section>
  );
}
