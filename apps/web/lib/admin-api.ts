import type { AdminStats, AdminChartsResponse, ApiErrorResponse } from "@video-downloader/types";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";
const SESSION_KEY = "admin-credentials";

export class AdminAuthError extends Error {
  constructor(message = "Invalid admin credentials.") {
    super(message);
  }
}

export function saveAdminCredentials(username: string, password: string) {
  sessionStorage.setItem(SESSION_KEY, btoa(`${username}:${password}`));
}

export function clearAdminCredentials() {
  sessionStorage.removeItem(SESSION_KEY);
}

function getAuthHeader(): string | null {
  const token = sessionStorage.getItem(SESSION_KEY);
  return token ? `Basic ${token}` : null;
}

async function adminRequest<T>(path: string): Promise<T> {
  const auth = getAuthHeader();
  if (!auth) throw new AdminAuthError("Not signed in.");

  const res = await fetch(`${API_BASE_URL}${path}`, {
    headers: { Authorization: auth },
  });

  if (res.status === 401) {
    clearAdminCredentials();
    throw new AdminAuthError();
  }

  if (!res.ok) {
    let body: ApiErrorResponse | null = null;
    try {
      body = await res.json();
    } catch {
      /* non-JSON error body */
    }
    throw new Error(body?.message ?? "Failed to load admin data.");
  }

  return res.json() as Promise<T>;
}

/** Verifies credentials work by hitting a real protected endpoint — there's no separate login route, Basic Auth is checked per-request. */
export async function verifyAdminCredentials(username: string, password: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/admin/stats`, {
    headers: { Authorization: `Basic ${btoa(`${username}:${password}`)}` },
  });
  if (!res.ok) throw new AdminAuthError();
}

export function getAdminStats(): Promise<AdminStats> {
  return adminRequest<AdminStats>("/admin/stats");
}

export function getAdminCharts(): Promise<AdminChartsResponse> {
  return adminRequest<AdminChartsResponse>("/admin/charts");
}
