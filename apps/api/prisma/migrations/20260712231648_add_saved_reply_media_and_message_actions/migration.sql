-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "pinned_at" TIMESTAMP(3),
ADD COLUMN     "starred" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "saved_replies" ADD COLUMN     "media_type" TEXT,
ADD COLUMN     "media_url" TEXT;
