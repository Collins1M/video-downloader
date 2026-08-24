import { X } from "lucide-react";

function stageForProgress(progress: number): string {
  if (progress === 0) return "Preparing";
  if (progress < 50) return "Fetching media";
  if (progress < 95) return "Processing video";
  if (progress < 100) return "Starting download";
  return "Complete";
}

export function DownloadProgress({
  progress,
  formatLabel,
  onCancel,
}: {
  progress: number;
  formatLabel: string;
  onCancel: () => void;
}) {
  return (
    <div className="animate-fade-up rounded-2xl border border-line bg-surface p-6 sm:p-8">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-display text-base font-medium">Preparing your download</p>
          <p className="mt-1 font-mono text-xs uppercase tracking-wide text-ink-muted">
            {formatLabel}
          </p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          aria-label="Cancel download"
          className="rounded-md p-1.5 text-ink-muted transition-colors hover:bg-surface-raised hover:text-ink"
        >
          <X className="h-4 w-4" strokeWidth={1.5} />
        </button>
      </div>

      <div className="mt-6">
        <div
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Download progress: ${stageForProgress(progress)}`}
          className="h-2 w-full overflow-hidden rounded-full bg-surface-raised"
        >
          <div
            className="h-full rounded-full bg-amber transition-all duration-500 ease-out"
            style={{ width: `${Math.max(4, progress)}%` }}
          />
        </div>
        <div
          aria-live="polite"
          className="mt-2 flex items-center justify-between font-mono text-xs text-ink-muted"
        >
          <span>{stageForProgress(progress)}…</span>
          <span className="tabular text-amber">{progress}%</span>
        </div>
      </div>
    </div>
  );
}
