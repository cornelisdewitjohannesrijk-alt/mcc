-- CreateEnum
CREATE TYPE "Platform" AS ENUM ('whatsapp', 'messenger');

-- CreateEnum
CREATE TYPE "MessageDirection" AS ENUM ('inbound', 'outbound');

-- CreateEnum
CREATE TYPE "MessageContentType" AS ENUM ('text', 'image', 'video', 'audio', 'document', 'sticker', 'location', 'template', 'unsupported');

-- CreateEnum
CREATE TYPE "MessageStatus" AS ENUM ('sent', 'delivered', 'read', 'failed');

-- CreateEnum
CREATE TYPE "ConversationStatus" AS ENUM ('open', 'resolved', 'pending');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('admin', 'agent');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'agent',
    "avatar_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "whatsapp_phone" TEXT,
    "messenger_psid" TEXT,
    "name" TEXT,
    "avatar_url" TEXT,
    "first_contact_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_message_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversations" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "status" "ConversationStatus" NOT NULL DEFAULT 'open',
    "unread_count" INTEGER NOT NULL DEFAULT 0,
    "last_customer_message_at" TIMESTAMP(3),
    "last_message_at" TIMESTAMP(3),
    "last_message_preview" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "platform_message_id" TEXT,
    "direction" "MessageDirection" NOT NULL,
    "contentType" "MessageContentType" NOT NULL DEFAULT 'text',
    "text" TEXT,
    "media_url" TEXT,
    "media_type" TEXT,
    "media_filename" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "location_name" TEXT,
    "status" "MessageStatus",
    "status_updated_at" TIMESTAMP(3),
    "timestamp" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_logs" (
    "id" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "event_type" TEXT NOT NULL,
    "payload_hash" TEXT,
    "payload" JSONB NOT NULL,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "customers_whatsapp_phone_key" ON "customers"("whatsapp_phone");

-- CreateIndex
CREATE UNIQUE INDEX "customers_messenger_psid_key" ON "customers"("messenger_psid");

-- CreateIndex
CREATE INDEX "conversations_platform_idx" ON "conversations"("platform");

-- CreateIndex
CREATE INDEX "conversations_status_idx" ON "conversations"("status");

-- CreateIndex
CREATE INDEX "conversations_last_message_at_idx" ON "conversations"("last_message_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "conversations_customer_id_platform_key" ON "conversations"("customer_id", "platform");

-- CreateIndex
CREATE UNIQUE INDEX "messages_platform_message_id_key" ON "messages"("platform_message_id");

-- CreateIndex
CREATE INDEX "messages_conversation_id_timestamp_idx" ON "messages"("conversation_id", "timestamp" DESC);

-- CreateIndex
CREATE INDEX "webhook_logs_platform_created_at_idx" ON "webhook_logs"("platform", "created_at");

-- CreateIndex
CREATE INDEX "webhook_logs_payload_hash_idx" ON "webhook_logs"("payload_hash");

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
