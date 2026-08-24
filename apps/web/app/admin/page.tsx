"use client";

import { useCallback, useEffect, useState } from "react";
import { LogOut, RefreshCw } from "lucide-react";
import type { AdminStats, AdminChartsResponse } from "@video-downloader/types";
import { getAdminStats, getAdminCharts, clearAdminCredentials, AdminAuthError } from "@/lib/admin-api";
import { AdminLoginForm } from "@/components/admin/admin-login-form";
import { StatsGrid } from "@/components/admin/stats-grid";
import { DownloadsChart, ErrorsChart, BandwidthChart } from "@/components/admin/charts";

const REFRESH_INTERVAL_MS = 30_000;

export default function AdminPage() {
  const [authed, setAuthed] = useState(false);
  const [checkedSession, setCheckedSession] = useState(false);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [charts, setCharts] = useState<AdminChartsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // A saved session token means "was authenticated before" — the
    // first data fetch below is what actually re-validates it.
    setAuthed(Boolean(sessionStorage.getItem("admin-credentials")));
    setCheckedSession(true);
  }, []);

  const loadData = useCallback(async () => {
    try {
      const [statsData, chartsData] = await Promise.all([getAdminStats(), getAdminCharts()]);
      setStats(statsData);
      setCharts(chartsData);
      setError(null);
    } catch (err) {
      if (err instanceof AdminAuthError) {
        setAuthed(false);
      } else {
        setError(err instanceof Error ? err.message : "Failed to load dashboard data.");
      }
    }
  }, []);

  useEffect(() => {
    if (!authed) return;
    loadData();
    const timer = setInterval(loadData, REFRESH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [authed, loadData]);

  function handleSignOut() {
    clearAdminCredentials();
    setAuthed(false);
    setStats(null);
    setCharts(null);
  }

  if (!checkedSession) return null;

  if (!authed) {
    return <AdminLoginForm onSuccess={() => setAuthed(true)} />;
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-wider text-ink-muted">Admin</p>
          <h1 className="mt-1 font-display text-2xl font-medium tracking-tight">Dashboard</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={loadData}
            aria-label="Refresh"
            className="rounded-md p-2 text-ink-muted transition-colors hover:bg-surface-raised hover:text-ink"
          >
            <RefreshCw className="h-4 w-4" strokeWidth={1.5} />
          </button>
          <button
            type="button"
            onClick={handleSignOut}
            className="flex items-center gap-1.5 rounded-md px-3 py-2 font-mono text-xs uppercase tracking-wide text-ink-muted transition-colors hover:bg-surface-raised hover:text-ink"
          >
            <LogOut className="h-3.5 w-3.5" strokeWidth={1.5} />
            Sign out
          </button>
        </div>
      </div>

      {error && (
        <p className="mt-6 rounded-lg border border-amber/30 bg-amber/10 px-4 py-3 font-mono text-xs text-amber">
          {error}
        </p>
      )}

      {stats && (
        <div className="mt-8">
          <StatsGrid stats={stats} />
        </div>
      )}

      {charts && (
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <DownloadsChart data={charts.downloadsPerDay} />
          <ErrorsChart data={charts.errorsPerDay} />
          <div className="lg:col-span-2">
            <BandwidthChart data={charts.bandwidthPerDay} />
          </div>
        </div>
      )}

      {!stats && !error && (
        <p className="mt-8 font-mono text-sm text-ink-muted">Loading dashboard…</p>
      )}
    </div>
  );
}
