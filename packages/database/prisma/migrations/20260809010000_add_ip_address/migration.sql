-- AlterTable
ALTER TABLE "download_jobs" ADD COLUMN "ipAddress" TEXT;

-- CreateIndex
CREATE INDEX "download_jobs_ipAddress_status_idx" ON "download_jobs"("ipAddress", "status");
