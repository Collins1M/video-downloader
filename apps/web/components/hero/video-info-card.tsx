import type { VideoInfo } from "@video-downloader/types";
import { formatDuration } from "@/lib/format";

export function VideoInfoCard({ video }: { video: VideoInfo }) {
  return (
    <div className="flex animate-fade-up gap-4 rounded-2xl border border-line bg-surface p-4 sm:gap-5 sm:p-5">
      <div className="relative aspect-video w-28 flex-none overflow-hidden rounded-lg bg-surface-raised sm:w-40">
        {video.thumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={video.thumbnail}
            alt=""
            referrerPolicy="no-referrer"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center font-mono text-xs text-ink-muted">
            No preview
          </div>
        )}
        <span className="absolute bottom-1 right-1 rounded bg-void/80 px-1.5 py-0.5 font-mono text-[10px] tabular text-ink">
          {formatDuration(video.duration)}
        </span>
      </div>

      <div className="min-w-0 flex-1">
        <h3 className="line-clamp-2 font-display text-base font-medium leading-snug sm:text-lg">
          {video.title}
        </h3>
        <p className="mt-1.5 font-mono text-xs uppercase tracking-wide text-ink-muted">
          {video.source}
        </p>
      </div>
    </div>
  );
}
