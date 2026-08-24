import type { FormatOption } from "@video-downloader/types";
import { Download } from "lucide-react";
import { formatBytes } from "@/lib/format";

function FormatRow({
  format,
  onSelect,
  disabled,
}: {
  format: FormatOption;
  onSelect: (format: FormatOption) => void;
  disabled: boolean;
}) {
  const size = formatBytes(format.estimatedSize);
  const label = format.type === "video" ? format.resolution : `${format.bitrateKbps} kbps`;

  return (
    <li className="flex items-center gap-3 border-b border-line/60 px-4 py-3 last:border-b-0 sm:px-5">
      <span className="w-14 flex-none font-mono text-sm tabular text-ink sm:w-16 sm:text-base">
        {label}
      </span>
      <span className="w-12 flex-none font-mono text-xs uppercase tracking-wide text-ink-muted">
        {format.container}
      </span>
      <span className="flex-1 text-right font-mono text-xs tabular text-ink-muted sm:text-sm">
        {size ?? "—"}
      </span>
      <button
        type="button"
        onClick={() => onSelect(format)}
        disabled={disabled}
        aria-label={`Download ${label} ${format.container}`}
        className="flex-none rounded-lg border border-line p-2.5 text-ink-muted transition-colors hover:border-amber/50 hover:text-amber disabled:pointer-events-none disabled:opacity-40 sm:px-4 sm:py-2"
      >
        <Download className="h-4 w-4 sm:hidden" strokeWidth={1.5} />
        <span className="hidden font-mono text-xs uppercase tracking-wide sm:inline">Download</span>
      </button>
    </li>
  );
}

export function FormatList({
  formats,
  onSelect,
  disabled,
}: {
  formats: FormatOption[];
  onSelect: (format: FormatOption) => void;
  disabled: boolean;
}) {
  const video = formats.filter((f) => f.type === "video");
  const audio = formats.filter((f) => f.type === "audio");

  return (
    <div className="animate-fade-up space-y-6">
      {video.length > 0 && (
        <div>
          <p className="mb-2 px-1 font-mono text-xs uppercase tracking-wider text-ink-muted">Video</p>
          <ul className="overflow-hidden rounded-2xl border border-line bg-surface">
            {video.map((f) => (
              <FormatRow key={f.id} format={f} onSelect={onSelect} disabled={disabled} />
            ))}
          </ul>
        </div>
      )}

      {audio.length > 0 && (
        <div>
          <p className="mb-2 px-1 font-mono text-xs uppercase tracking-wider text-ink-muted">Audio</p>
          <ul className="overflow-hidden rounded-2xl border border-line bg-surface">
            {audio.map((f) => (
              <FormatRow key={f.id} format={f} onSelect={onSelect} disabled={disabled} />
            ))}
          </ul>
        </div>
      )}

      {video.length === 0 && audio.length === 0 && (
        <p className="rounded-2xl border border-line bg-surface p-6 text-center font-mono text-sm text-ink-muted">
          No downloadable formats were found for this video.
        </p>
      )}
    </div>
  );
}
