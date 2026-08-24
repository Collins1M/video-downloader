export function PrivacySection() {
  return (
    <section className="border-t border-line/60 px-6 py-20 sm:py-28">
      <div className="mx-auto max-w-3xl text-center">
        <h2 className="font-display text-2xl font-medium tracking-tight sm:text-3xl">
          Built around not keeping your files
        </h2>
        <p className="mt-4 text-balance leading-relaxed text-ink-muted">
          Your downloads are delivered to your device. Temporary processing data — the video and
          audio streams fetched to build your file — is automatically removed once a download
          finishes, fails, or is abandoned. We don't keep a library of what you've downloaded.
        </p>
      </div>
    </section>
  );
}
