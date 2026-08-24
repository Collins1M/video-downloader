"use client";

import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import type { ChartPoint } from "@video-downloader/types";

const AXIS_STYLE = { fontSize: 11, fontFamily: "var(--font-mono)", fill: "#8B8D97" };

function shortDate(dateKey: string): string {
  const d = new Date(dateKey + "T00:00:00Z");
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-5">
      <p className="mb-4 font-mono text-xs uppercase tracking-wide text-ink-muted">{title}</p>
      <div className="h-56">{children}</div>
    </div>
  );
}

export function DownloadsChart({ data }: { data: ChartPoint[] }) {
  return (
    <ChartCard title="Downloads per day">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
          <CartesianGrid stroke="#2A2B31" vertical={false} />
          <XAxis dataKey="date" tickFormatter={shortDate} tick={AXIS_STYLE} axisLine={{ stroke: "#2A2B31" }} tickLine={false} minTickGap={24} />
          <YAxis tick={AXIS_STYLE} axisLine={false} tickLine={false} allowDecimals={false} />
          <Tooltip
            labelFormatter={shortDate}
            contentStyle={{ background: "#16171B", border: "1px solid #2A2B31", borderRadius: 8, fontSize: 12 }}
          />
          <Area type="monotone" dataKey="value" stroke="#FFA94D" fill="#FFA94D" fillOpacity={0.15} strokeWidth={2} />
        </AreaChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

export function ErrorsChart({ data }: { data: ChartPoint[] }) {
  return (
    <ChartCard title="Errors per day">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
          <CartesianGrid stroke="#2A2B31" vertical={false} />
          <XAxis dataKey="date" tickFormatter={shortDate} tick={AXIS_STYLE} axisLine={{ stroke: "#2A2B31" }} tickLine={false} minTickGap={24} />
          <YAxis tick={AXIS_STYLE} axisLine={false} tickLine={false} allowDecimals={false} />
          <Tooltip
            labelFormatter={shortDate}
            contentStyle={{ background: "#16171B", border: "1px solid #2A2B31", borderRadius: 8, fontSize: 12 }}
          />
          <Bar dataKey="value" fill="#FFA94D" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

export function BandwidthChart({ data }: { data: ChartPoint[] }) {
  const gbData = data.map((p) => ({ ...p, value: p.value / (1024 * 1024 * 1024) }));
  return (
    <ChartCard title="Bandwidth used per day (GB)">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={gbData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
          <CartesianGrid stroke="#2A2B31" vertical={false} />
          <XAxis dataKey="date" tickFormatter={shortDate} tick={AXIS_STYLE} axisLine={{ stroke: "#2A2B31" }} tickLine={false} minTickGap={24} />
          <YAxis tick={AXIS_STYLE} axisLine={false} tickLine={false} />
          <Tooltip
            labelFormatter={shortDate}
            formatter={(value: number) => [`${value.toFixed(2)} GB`, "Bandwidth"]}
            contentStyle={{ background: "#16171B", border: "1px solid #2A2B31", borderRadius: 8, fontSize: 12 }}
          />
          <Area type="monotone" dataKey="value" stroke="#FFC078" fill="#FFC078" fillOpacity={0.15} strokeWidth={2} />
        </AreaChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
