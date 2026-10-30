-- DropIndex
DROP INDEX "ProductImage_clientId_idx";

-- AlterTable
ALTER TABLE "SheetConnection" ADD COLUMN     "spreadsheetTitle" TEXT,
ALTER COLUMN "spreadsheetId" DROP NOT NULL,
ALTER COLUMN "sheetName" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "ProductImage_clientId_status_idx" ON "ProductImage"("clientId", "status");
