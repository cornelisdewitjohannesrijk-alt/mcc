import webpush from 'web-push'
import prisma from '../db/prisma'
import { config } from '../config'

let configured = false

function ensureConfigured() {
  if (configured) return
  if (!config.VAPID_PUBLIC_KEY || !config.VAPID_PRIVATE_KEY) return
  webpush.setVapidDetails(
    config.VAPID_MAILTO,
    config.VAPID_PUBLIC_KEY,
    config.VAPID_PRIVATE_KEY,
  )
  configured = true
}

export async function sendPushToAll(payload: {
  title: string
  body: string
  icon?: string
  data?: Record<string, unknown>
}) {
  ensureConfigured()
  if (!configured) return // VAPID not set up — skip silently

  const subscriptions = await prisma.pushSubscription.findMany()
  if (!subscriptions.length) return

  const notification = JSON.stringify(payload)

  const results = await Promise.allSettled(
    subscriptions.map((sub) =>
      webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        notification,
      ),
    ),
  )

  // Clean up expired/invalid subscriptions (410 Gone)
  const toDelete: string[] = []
  results.forEach((result, i) => {
    if (result.status === 'rejected') {
      const err = result.reason as { statusCode?: number }
      if (err?.statusCode === 410 || err?.statusCode === 404) {
        toDelete.push(subscriptions[i].endpoint)
      }
    }
  })

  if (toDelete.length) {
    await prisma.pushSubscription.deleteMany({ where: { endpoint: { in: toDelete } } })
  }
}
