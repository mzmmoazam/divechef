-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Niveau" AS ENUM ('N1', 'N2', 'N3', 'N4', 'INITIATEUR', 'MF1', 'MF2', 'UNKNOWN');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT,
    "niveau" "Niveau" NOT NULL DEFAULT 'UNKNOWN',
    "locale" TEXT NOT NULL DEFAULT 'fr',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Device" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "bleAddress" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "serialNumber" TEXT,
    "nickname" TEXT,
    "lastSyncAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Device_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Dive" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deviceId" TEXT,
    "externalId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "durationSec" INTEGER NOT NULL,
    "maxDepthM" DOUBLE PRECISION NOT NULL,
    "avgDepthM" DOUBLE PRECISION NOT NULL,
    "minWaterTempC" DOUBLE PRECISION,
    "maxAscentRateMps" DOUBLE PRECISION NOT NULL,
    "safetyScore" INTEGER,
    "scoredAt" TIMESTAMP(3),
    "scoringVersion" TEXT,
    "rawPayloadUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Dive_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiveSample" (
    "id" BIGSERIAL NOT NULL,
    "diveId" TEXT NOT NULL,
    "tSec" INTEGER NOT NULL,
    "depthM" DOUBLE PRECISION NOT NULL,
    "tempC" DOUBLE PRECISION,
    "cnsPct" DOUBLE PRECISION,
    "decoState" TEXT NOT NULL,
    "decoTimeSec" INTEGER NOT NULL,
    "decoDepthM" DOUBLE PRECISION NOT NULL,
    "ttsSec" INTEGER,

    CONSTRAINT "DiveSample_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Insight" (
    "id" TEXT NOT NULL,
    "diveId" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "evidence" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Insight_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Device_userId_bleAddress_key" ON "Device"("userId", "bleAddress");

-- CreateIndex
CREATE INDEX "Dive_userId_startedAt_idx" ON "Dive"("userId", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Dive_userId_externalId_key" ON "Dive"("userId", "externalId");

-- CreateIndex
CREATE INDEX "DiveSample_diveId_tSec_idx" ON "DiveSample"("diveId", "tSec");

-- CreateIndex
CREATE INDEX "Insight_diveId_idx" ON "Insight"("diveId");

-- AddForeignKey
ALTER TABLE "Device" ADD CONSTRAINT "Device_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dive" ADD CONSTRAINT "Dive_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiveSample" ADD CONSTRAINT "DiveSample_diveId_fkey" FOREIGN KEY ("diveId") REFERENCES "Dive"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Insight" ADD CONSTRAINT "Insight_diveId_fkey" FOREIGN KEY ("diveId") REFERENCES "Dive"("id") ON DELETE CASCADE ON UPDATE CASCADE;

