#!/usr/bin/env bash
# Recreates the sandbox-only Prisma client stub at
# node_modules/.prisma/client/default.{d.ts,js}.
#
# Why this exists: this dev sandbox has no network access to Prisma's
# engine binary CDN (binaries.prisma.sh), so `prisma generate` fails
# here every time — confirmed empirically, not assumed (Phase 14: ran
# `prisma generate` against a real local Postgres instance once both
# were actually available in this sandbox, and it still failed on the
# CDN fetch with a 403). Every `npm install` runs @prisma/client's own
# postinstall, which overwrites node_modules/.prisma/client/default.*
# with a generic untyped placeholder (`PrismaClient: any`). This script
# replaces that placeholder with a hand-written stub whose shape matches
# packages/database/prisma/schema.prisma's DownloadJob model, so
# apps/api and apps/worker typecheck against real types instead of `any`,
# and every query method throws a clearly-labeled STUB_ERROR so e2e
# specs can assert their failures trace to this boundary specifically,
# not to a compile error, DI failure, or routing mismatch.
#
# Run after every fresh `npm install` in this sandbox:
#   ./scripts/prisma-sandbox-stub.sh
#
# This script — and the stub it produces — should never run outside this
# sandbox. A real deployment (Docker build, CI, production) has network
# access to Prisma's CDN and runs the genuine `prisma generate` via
# `npm run db:generate`, which produces the real typed client and
# overwrites whatever this script wrote.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STUB_DIR="$REPO_ROOT/node_modules/.prisma/client"
mkdir -p "$STUB_DIR"

cat > "$STUB_DIR/default.d.ts" << 'DTS_EOF'
/* eslint-disable @typescript-eslint/no-unused-vars */
// SANDBOX STUB — not a real `prisma generate` output. See
// scripts/prisma-sandbox-stub.sh for why this exists and when it's safe
// to run. Regenerated from the shape of
// packages/database/prisma/schema.prisma.

export type JobStatus = "queued" | "processing" | "completed" | "failed" | "cancelled";

export const JobStatus: {
  queued: "queued";
  processing: "processing";
  completed: "completed";
  failed: "failed";
  cancelled: "cancelled";
};

export interface DownloadJob {
  id: string;
  sourceUrl: string;
  status: JobStatus;
  format: string;
  progress: number;
  title: string | null;
  duration: number | null;
  fileSize: number | null;
  error: string | null;
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  expiresAt: Date | null;
  sessionId: string | null;
  ipAddress: string | null;
  requestId: string | null;
}

export type DownloadJobCreateInput = Partial<Omit<DownloadJob, "id" | "createdAt">> &
  Pick<DownloadJob, "sourceUrl" | "format">;
export type DownloadJobUpdateInput = Partial<Omit<DownloadJob, "id" | "createdAt">>;
export type DownloadJobWhereUniqueInput = { id: string };
export type DownloadJobWhereInput = Partial<Omit<DownloadJob, "status">> & {
  status?: JobStatus | { in?: JobStatus[] };
  expiresAt?: { lt?: Date; lte?: Date; gt?: Date; gte?: Date } | Date | null;
};
export type DownloadJobSelect = Partial<Record<keyof DownloadJob, boolean>>;
export type DownloadJobOrderByInput = Partial<Record<keyof DownloadJob, "asc" | "desc">>;
export type DownloadJobAggregateArgs = {
  where?: DownloadJobWhereInput;
  _sum?: Partial<Record<"progress" | "duration" | "fileSize", boolean>>;
  _avg?: Partial<Record<"progress" | "duration" | "fileSize", boolean>>;
  _count?: boolean | Partial<Record<keyof DownloadJob, boolean>>;
};
export type DownloadJobAggregateResult = {
  _sum: Partial<Record<"progress" | "duration" | "fileSize", number | null>>;
  _avg: Partial<Record<"progress" | "duration" | "fileSize", number | null>>;
  _count: number;
};

export interface DownloadJobDelegate {
  findUnique<S extends DownloadJobSelect | undefined = undefined>(args: {
    where: DownloadJobWhereUniqueInput;
    select?: S;
  }): Promise<DownloadJob | null>;
  findMany(args?: {
    where?: DownloadJobWhereInput;
    orderBy?: DownloadJobOrderByInput;
    take?: number;
    skip?: number;
  }): Promise<DownloadJob[]>;
  create(args: { data: DownloadJobCreateInput }): Promise<DownloadJob>;
  createMany(args: { data: DownloadJobCreateInput[] }): Promise<{ count: number }>;
  update(args: { where: DownloadJobWhereUniqueInput; data: DownloadJobUpdateInput }): Promise<DownloadJob>;
  deleteMany(args?: { where?: DownloadJobWhereInput }): Promise<{ count: number }>;
  count(args?: { where?: DownloadJobWhereInput }): Promise<number>;
  aggregate(args: DownloadJobAggregateArgs): Promise<DownloadJobAggregateResult>;
}

export declare class PrismaClient {
  constructor(...args: unknown[]);
  downloadJob: DownloadJobDelegate;
  $connect(): Promise<void>;
  $disconnect(): Promise<void>;
  $transaction<T>(fn: (tx: PrismaClient) => Promise<T>): Promise<T>;
  $queryRaw<T = unknown>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
  $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>;
}

export declare namespace Prisma {
  type DownloadJobCreateInput = import("./default").DownloadJobCreateInput;
  type DownloadJobUpdateInput = import("./default").DownloadJobUpdateInput;
  type DownloadJobWhereInput = import("./default").DownloadJobWhereInput;
  type DownloadJobWhereUniqueInput = import("./default").DownloadJobWhereUniqueInput;
}
DTS_EOF

cat > "$STUB_DIR/default.js" << 'JS_EOF'
"use strict";
// SANDBOX STUB — see scripts/prisma-sandbox-stub.sh. Every query method
// rejects with a clearly-labeled error so e2e specs can assert failures
// trace to this boundary (no real Postgres in this sandbox) rather than
// to a compile error, DI failure, or routing mismatch.
const STUB_ERROR = () =>
  new Error("STUB: no real query engine — this is the sandbox's hand-written Prisma stub, not a real DB connection");

const downloadJob = {
  findUnique: async () => {
    throw STUB_ERROR();
  },
  findMany: async () => {
    throw STUB_ERROR();
  },
  create: async () => {
    throw STUB_ERROR();
  },
  createMany: async () => {
    throw STUB_ERROR();
  },
  update: async () => {
    throw STUB_ERROR();
  },
  deleteMany: async () => {
    throw STUB_ERROR();
  },
  count: async () => {
    throw STUB_ERROR();
  },
  aggregate: async () => {
    throw STUB_ERROR();
  },
};

class PrismaClient {
  constructor() {
    this.downloadJob = downloadJob;
  }
  async $connect() {
    // Intentionally a no-op rather than throwing: real code paths call
    // this in onModuleInit before any query runs, and failing here would
    // mask the more informative per-query STUB_ERROR with a generic
    // connection error instead.
  }
  async $disconnect() {}
  async $transaction(fn) {
    return fn(this);
  }
  async $queryRaw() {
    throw STUB_ERROR();
  }
  async $queryRawUnsafe() {
    throw STUB_ERROR();
  }
}

const JobStatus = {
  queued: "queued",
  processing: "processing",
  completed: "completed",
  failed: "failed",
  cancelled: "cancelled",
};

module.exports = { PrismaClient, JobStatus };
JS_EOF

echo "Wrote sandbox Prisma stub to $STUB_DIR"
