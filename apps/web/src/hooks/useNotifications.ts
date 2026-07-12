'use client'

import { useState, useEffect, useCallback } from 'react'

export function useNotifications() {
  const [permission, setPermission] = useState<NotificationPermission>('default')

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setPermission(Notification.permission)
    }
  }, [])

  const requestPermission = useCallback(async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) return 'denied' as const
    const p = await Notification.requestPermission()
    setPermission(p)
    return p
  }, [])

  const notify = useCallback(
    (
      title: string,
      options?: {
        body?: string
        icon?: string
        tag?: string
        onClick?: () => void
      },
    ) => {
      if (typeof window === 'undefined') return
      if (!('Notification' in window)) return
      if (Notification.permission !== 'granted') return

      const n = new Notification(title, {
        body: options?.body,
        icon: options?.icon ?? '/icons/icon-192.png',
        tag: options?.tag,
        badge: '/icons/badge-72.png',
        silent: false,
      })

      if (options?.onClick) {
        n.onclick = () => {
          window.focus()
          n.close()
          options.onClick!()
        }
      }

      // Auto-close after 6 seconds
      setTimeout(() => n.close(), 6000)

      return n
    },
    [],
  )

  return { permission, requestPermission, notify }
}
