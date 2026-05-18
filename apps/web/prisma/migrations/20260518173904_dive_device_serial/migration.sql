-- AlterTable
ALTER TABLE "Dive" ADD COLUMN     "deviceSerial" TEXT;

-- CreateIndex
CREATE INDEX "Dive_userId_deviceSerial_idx" ON "Dive"("userId", "deviceSerial");
