// apps/api and apps/worker both depend on this package instead of
// @prisma/client directly, so there is exactly one generated client and
// one schema for the whole system (Section 16 — metadata-only DownloadJob
// table, shared by the API that creates jobs and the worker that
// processes them).
export * from "@prisma/client";
export { PrismaClient } from "@prisma/client";
