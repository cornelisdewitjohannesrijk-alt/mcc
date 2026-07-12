// MCC Push Notification Service Worker

self.addEventListener('push', (event) => {
  if (!event.data) return

  let data = {}
  try {
    data = event.data.json()
  } catch {
    data = { title: 'New message', body: event.data.text() }
  }

  const title = data.title || 'New message'
  const options = {
    body: data.body || '',
    icon: data.icon || '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: data.data || {},
    vibrate: [200, 100, 200],
    tag: 'mcc-message', // Replace previous notification with new one
    renotify: true,
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const conversationId = event.notification.data?.conversationId
  const url = conversationId ? `/inbox?c=${conversationId}` : '/inbox'

  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Focus existing tab if open
        for (const client of clientList) {
          if (client.url.includes('/inbox') && 'focus' in client) {
            return client.focus()
          }
        }
        // Otherwise open a new tab
        if (clients.openWindow) return clients.openWindow(url)
      }),
  )
})
