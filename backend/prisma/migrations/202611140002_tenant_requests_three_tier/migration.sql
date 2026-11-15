ALTER TABLE "PlatformTenant"
  ADD COLUMN "contactPhone" TEXT,
  ADD COLUMN "color" TEXT NOT NULL DEFAULT '#059669',
  ADD COLUMN "architectureVersion" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "resources" JSONB,
  ADD COLUMN "migrationBackupId" TEXT,
  ADD COLUMN "migrationSnapshot" JSONB;
ALTER TABLE "PlatformTenant" ADD CONSTRAINT "PlatformTenant_color_check" CHECK ("color" ~ '^#[0-9A-Fa-f]{6}$');
CREATE TABLE "TenantRequest" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "contactEmail" TEXT NOT NULL,
  "contactPhone" TEXT NOT NULL,
  "color" TEXT NOT NULL DEFAULT '#059669',
  "environment" TEXT NOT NULL,
  "engine" TEXT NOT NULL,
  "planId" TEXT NOT NULL REFERENCES "PlatformPlan"("id"),
  "credentials" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "rejectionReason" TEXT,
  "reviewedBy" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "tenantId" TEXT UNIQUE REFERENCES "PlatformTenant"("id"),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CHECK ("status" IN ('PENDING', 'APPROVED', 'REJECTED')),
  CHECK ("color" ~ '^#[0-9A-Fa-f]{6}$'),
  CHECK ("environment" IN ('dev', 'staging', 'prod')),
  CHECK ("engine" IN ('terraform', 'cloudformation', 'opentofu', 'pulumi')),
  CHECK (("status" = 'PENDING' AND "credentials" IS NOT NULL) OR ("status" <> 'PENDING' AND "credentials" IS NULL))
);
CREATE UNIQUE INDEX "TenantRequest_pending_slug_key" ON "TenantRequest"("slug") WHERE "status" = 'PENDING';
CREATE INDEX "TenantRequest_status_createdAt_idx" ON "TenantRequest"("status", "createdAt");
