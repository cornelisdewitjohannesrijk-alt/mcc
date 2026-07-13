-- AlterTable
ALTER TABLE "saved_replies" ADD COLUMN     "category" TEXT;

-- CreateIndex
CREATE INDEX "saved_replies_category_idx" ON "saved_replies"("category");
