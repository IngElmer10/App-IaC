CREATE TABLE "PlatformPlan" (
  "id" TEXT PRIMARY KEY, "code" TEXT NOT NULL UNIQUE, "name" TEXT NOT NULL,
  "description" TEXT NOT NULL, "instanceType" TEXT NOT NULL, "vcpu" INTEGER NOT NULL,
  "memoryMb" INTEGER NOT NULL, "storageGb" INTEGER NOT NULL, "maxStudents" INTEGER NOT NULL,
  "maxSessions" INTEGER NOT NULL, "active" BOOLEAN NOT NULL DEFAULT true,
  CHECK ("vcpu" > 0 AND "memoryMb" > 0 AND "storageGb" > 0 AND "maxStudents" > 0 AND "maxSessions" > 0)
);
CREATE TABLE "PlatformTenant" (
  "id" TEXT PRIMARY KEY, "slug" TEXT NOT NULL UNIQUE, "name" TEXT NOT NULL,
  "contactEmail" TEXT NOT NULL, "environment" TEXT NOT NULL, "engine" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING', "planId" TEXT NOT NULL REFERENCES "PlatformPlan"("id"),
  "credentials" TEXT NOT NULL, "instanceId" TEXT, "publicUrl" TEXT, "deployedVersion" TEXT,
  "health" JSONB, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CHECK ("environment" IN ('dev', 'staging', 'prod')),
  CHECK ("engine" IN ('terraform', 'cloudformation', 'opentofu', 'pulumi'))
);
CREATE TABLE "PlatformOperation" (
  "id" TEXT PRIMARY KEY, "tenantId" TEXT NOT NULL REFERENCES "PlatformTenant"("id"),
  "action" TEXT NOT NULL, "state" TEXT NOT NULL DEFAULT 'QUEUED', "progress" INTEGER NOT NULL DEFAULT 0,
  "actor" TEXT NOT NULL, "payload" JSONB, "logs" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[], "error" TEXT,
  "appVersion" TEXT NOT NULL DEFAULT '0.2.0', "templateVersion" TEXT NOT NULL DEFAULT '1.0.0',
  "toolVersion" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "finishedAt" TIMESTAMP(3),
  CHECK ("progress" BETWEEN 0 AND 100), CHECK ("state" IN ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED'))
);
CREATE UNIQUE INDEX "PlatformOperation_one_active" ON "PlatformOperation"("tenantId") WHERE "state" IN ('QUEUED', 'RUNNING');
CREATE INDEX "PlatformOperation_state_createdAt_idx" ON "PlatformOperation"("state", "createdAt");
CREATE TABLE "PlatformBackup" (
  "id" TEXT PRIMARY KEY, "tenantId" TEXT NOT NULL REFERENCES "PlatformTenant"("id"),
  "objectKey" TEXT NOT NULL UNIQUE, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "PlatformAlert" (
  "id" TEXT PRIMARY KEY, "tenantId" TEXT NOT NULL REFERENCES "PlatformTenant"("id"),
  "name" TEXT NOT NULL, "state" TEXT NOT NULL, "message" TEXT NOT NULL,
  "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "resolvedAt" TIMESTAMP(3)
);
CREATE INDEX "PlatformAlert_tenantId_state_idx" ON "PlatformAlert"("tenantId", "state");
