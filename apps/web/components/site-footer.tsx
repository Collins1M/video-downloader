import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="border-t border-line/60">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="flex flex-col gap-8 md:flex-row md:items-start md:justify-between">
          <div className="max-w-md">
            <p className="flex items-center gap-2 font-display text-base font-medium">
              <span className="flex h-5 w-5 items-center justify-center rounded-sm border border-amber/40 font-mono text-[9px] text-amber">
                ▶
              </span>
              Reel
            </p>
            <p className="mt-3 text-sm leading-relaxed text-ink-muted">
              Your downloads are delivered to your device. Temporary processing data is
              automatically removed.
            </p>
          </div>

          <div className="max-w-lg font-mono text-xs leading-relaxed text-ink-muted/80">
            <p>
              This service is intended for downloading content that you own, have permission to
              download, or that is made available for downloading by its source. Respect
              copyright, platform terms, and applicable laws.
            </p>
          </div>
        </div>

        <div className="mt-10 flex flex-col gap-4 border-t border-line/60 pt-6 text-xs text-ink-muted/60 sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} Reel.</p>
          <nav className="flex items-center gap-4 font-mono">
            <Link href="/terms" className="transition-colors hover:text-ink">
              Terms
            </Link>
            <Link href="/privacy" className="transition-colors hover:text-ink">
              Privacy
            </Link>
            <span>Built for content you're authorized to download.</span>
          </nav>
        </div>
      </div>
    </footer>
  );
}
