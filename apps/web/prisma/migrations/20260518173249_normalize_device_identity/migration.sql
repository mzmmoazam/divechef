-- DropForeignKey
ALTER TABLE "Device" DROP CONSTRAINT "Device_userId_fkey";

-- DropIndex
DROP INDEX "Device_userId_bleAddress_key";

-- AlterTable
ALTER TABLE "Device" DROP COLUMN "bleAddress",
DROP COLUMN "createdAt",
DROP COLUMN "nickname",
ADD COLUMN     "firmwareVersion" TEXT,
ADD COLUMN     "friendlyName" TEXT,
ADD COLUMN     "registeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "scanName" TEXT,
ALTER COLUMN "serialNumber" SET NOT NULL;

-- CreateIndex
CREATE INDEX "Device_userId_idx" ON "Device"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Device_userId_serialNumber_key" ON "Device"("userId", "serialNumber");

-- AddForeignKey
ALTER TABLE "Device" ADD CONSTRAINT "Device_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
