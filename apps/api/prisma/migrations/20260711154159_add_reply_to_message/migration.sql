-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "reply_to_message_id" TEXT,
ADD COLUMN     "reply_to_sender" TEXT,
ADD COLUMN     "reply_to_text" TEXT;
