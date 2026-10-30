-- AlterTable
ALTER TABLE "CatalogLink" ADD COLUMN     "pricing" JSONB NOT NULL DEFAULT '{}';

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "listPrice" DECIMAL(12,2);
