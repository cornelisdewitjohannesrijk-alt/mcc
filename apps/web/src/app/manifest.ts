import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'MCC — Messaging Dashboard',
    short_name: 'MCC',
    description: 'Unified WhatsApp & Messenger inbox',
    start_url: '/inbox',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#075e54',
    theme_color: '#075e54',
    categories: ['productivity', 'business', 'communication'],
    icons: [
      {
        src: '/icons/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
    ],
    shortcuts: [
      {
        name: 'Open Inbox',
        url: '/inbox',
        description: 'Go to your message inbox',
      },
    ],
  }
}
