import type { Metadata } from "next";
import { LegalPage, LegalSection } from "@/components/legal/legal-page";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How Reel handles the data involved in downloading a video.",
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" effectiveDate="August 24, 2026">
      <LegalSection heading="What this page covers">
        <p>
          Reel is a self-hosted video downloader. This page describes, plainly, what data passes
          through the service while you use it and how long it sticks around — not a generic
          template, but a description of what the code actually does.
        </p>
      </LegalSection>

      <LegalSection heading="No accounts, no library of what you've downloaded">
        <p>
          Reel doesn't have user accounts, sign-in, or a saved history of your downloads. Every
          visitor is anonymous. There is no page anywhere that lists videos you've previously
          downloaded.
        </p>
      </LegalSection>

      <LegalSection heading="The anonymous session cookie">
        <p>
          On your first request, Reel sets an <code>session_id</code> cookie — a random identifier
          with no personal information in it, marked HttpOnly so page scripts can't read it. It
          exists for one reason: to apply per-visitor rate limits fairly, so one browser tab can't
          be mistaken for another. It isn't used for tracking across sites or for advertising.
        </p>
      </LegalSection>

      <LegalSection heading="What's stored while a download is processing">
        <p>
          When you start a download, Reel creates a temporary job record to track its progress.
          That record holds: the source URL you submitted, the format you chose, a status
          (queued/processing/completed/failed/cancelled), a progress percentage, the video's title
          and duration if known, the resulting file size once known, an error message if
          something went wrong, and timestamps for when the job was created, started, and
          completed. It also stores the requesting IP address and the anonymous session id, used
          together to enforce the concurrent-download and rate limits described below.
        </p>
        <p>
          This record is metadata only — Reel never stores the video or audio bytes themselves in
          this table. The actual file lives briefly on temporary disk storage and is deleted once
          it's been delivered, once it expires, or once processing fails (see below).
        </p>
      </LegalSection>

      <LegalSection heading="Temporary files are deleted automatically">
        <p>
          The downloaded file sits in temporary storage only long enough for you to retrieve it.
          It's deleted immediately after your browser finishes downloading it. If you never
          retrieve it, an expiry sweep removes it (and the job record) automatically after a
          configured time-to-live window. Nothing is kept indefinitely by design.
        </p>
      </LegalSection>

      <LegalSection heading="IP address and abuse prevention">
        <p>
          Your IP address is used to apply rate limits (so the service stays usable for everyone)
          and a concurrent-download cap per IP (so one visitor can't queue an unlimited number of
          simultaneous jobs). It's associated with job records for this purpose and isn't shared
          or sold.
        </p>
      </LegalSection>

      <LegalSection heading="Error tracking">
        <p>
          If the operator running this instance has configured it, unexpected server errors may be
          reported to Sentry for debugging. User-facing error messages shown to you are always
          generic and never include stack traces, file paths, or database details — see the
          service's exception handling, which is deliberately built to never leak internals in a
          response. Error tracking is optional and disabled by default.
        </p>
      </LegalSection>

      <LegalSection heading="No third-party ads or trackers">
        <p>
          Reel doesn't run advertising, analytics pixels, or third-party tracking scripts. The
          only outbound network activity from your browser is to this service's own API.
        </p>
      </LegalSection>

      <LegalSection heading="Changes to this policy">
        <p>
          If how this instance handles data changes, this page will be updated and the effective
          date above will change accordingly.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
