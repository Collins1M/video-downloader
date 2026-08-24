import Link from "next/link";

const NAV_LINKS = [
  { href: "#how-it-works", label: "How it works" },
  { href: "#features", label: "Features" },
  { href: "#faq", label: "FAQ" },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-line/60 bg-void/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Link href="/" className="flex items-center gap-2 font-display text-lg font-medium tracking-tight">
          <span className="flex h-6 w-6 items-center justify-center rounded-sm border border-amber/40 font-mono text-[10px] text-amber">
            ▶
          </span>
          Reel
        </Link>

        <nav className="hidden items-center gap-8 font-mono text-xs uppercase tracking-wider text-ink-muted md:flex">
          {NAV_LINKS.map((link) => (
            <a key={link.href} href={link.href} className="transition-colors hover:text-ink">
              {link.label}
            </a>
          ))}
        </nav>
      </div>
    </header>
  );
}
