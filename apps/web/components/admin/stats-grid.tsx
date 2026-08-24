import type { AdminStats } from "@video-downloader/types";
import { formatBytes } from "@/lib/format";

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-5">
      <p className="font-mono text-xs uppercase tracking-wide text-ink-muted">{label}</p>
      <p className="mt-2 font-display text-2xl font-medium tabular text-ink sm:text-3xl">{value}</p>
    </div>
  );
}

export function StatsGrid({ stats }: { stats: AdminStats }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      <StatCard label="Total requests" value={stats.totalRequests.toLocaleString()} />
      <StatCard label="Active downloads" value={stats.activeDownloads.toLocaleString()} />
      <StatCard label="Completed" value={stats.completedDownloads.toLocaleString()} />
      <StatCard label="Failed" value={stats.failedDownloads.toLocaleString()} />
      <StatCard label="Bandwidth used" value={formatBytes(stats.bandwidthBytes) ?? "0 B"} />
      <StatCard
        label="Avg. processing time"
        value={stats.averageProcessingTimeSeconds !== null ? `${stats.averageProcessingTimeSeconds}s` : "—"}
      />
      <StatCard label="Active workers" value={stats.activeWorkers.toLocaleString()} />
    </div>
  );
}
