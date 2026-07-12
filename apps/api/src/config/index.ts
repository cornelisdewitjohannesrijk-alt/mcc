import { z } from 'zod'

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(4000),
  API_URL: z.string().url().default('http://localhost:4000'),
  // Public URL used for media uploads sent to WhatsApp/Messenger — must be reachable by Meta.
  // Set to your ngrok URL in dev, your production domain in prod.
  PUBLIC_URL: z.string().url().optional(),

  // Database
  DATABASE_URL: z.string().min(1),

  // Redis
  REDIS_URL: z.string().default('redis://localhost:6379'),

  // Auth
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('7d'),

  // WhatsApp
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  WHATSAPP_BUSINESS_ACCOUNT_ID: z.string().optional(),
  WHATSAPP_ACCESS_TOKEN: z.string().optional(),
  // App Secret (NOT the access token) — used to verify webhook signatures.
  // Found in: Meta Developer Console → Your App → Settings → Basic → App Secret
  WHATSAPP_APP_SECRET: z.string().optional(),
  WHATSAPP_WEBHOOK_VERIFY_TOKEN: z.string().optional(),

  // Messenger
  MESSENGER_PAGE_ID: z.string().optional(),
  MESSENGER_PAGE_ACCESS_TOKEN: z.string().optional(),
  MESSENGER_APP_SECRET: z.string().optional(),
  MESSENGER_WEBHOOK_VERIFY_TOKEN: z.string().optional(),

  // Media Storage (S3-compatible)
  MEDIA_STORAGE_ENDPOINT: z.string().optional(),
  MEDIA_STORAGE_BUCKET: z.string().optional(),
  MEDIA_STORAGE_ACCESS_KEY: z.string().optional(),
  MEDIA_STORAGE_SECRET_KEY: z.string().optional(),
  MEDIA_STORAGE_PUBLIC_URL: z.string().optional(),
})

function loadConfig() {
  const result = envSchema.safeParse(process.env)

  if (!result.success) {
    console.error('Invalid environment variables:')
    console.error(result.error.flatten().fieldErrors)
    process.exit(1)
  }

  return result.data
}

export const config = loadConfig()
export type Config = typeof config
