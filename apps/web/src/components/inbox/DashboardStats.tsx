'use client'

import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'

export function DashboardStats() {
  const { data } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: () => api.get('/dashboard/stats').then((r) => r.data.stats),
    refetchInterval: 60_000,
  })

  return (
    <div className="border-b border-gray-200 px-4 py-3">
      <h1 className="mb-3 text-base font-semibold text-gray-900">Inbox</h1>
      <div className="grid grid-cols-2 gap-2">
        <Stat label="Total" value={data?.totalConversations ?? '—'} />
        <Stat label="Unread" value={data?.totalUnread ?? '—'} highlight />
        <Stat label="Received today" value={data?.receivedToday ?? '—'} />
        <Stat label="Sent today" value={data?.sentToday ?? '—'} />
      </div>
    </div>
  )
}

function Stat({ label, value, highlight }: { label: string; value: number | string; highlight?: boolean }) {
  return (
    <div className="rounded-lg bg-gray-50 px-3 py-2">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-lg font-semibold ${highlight && Number(value) > 0 ? 'text-brand-600' : 'text-gray-900'}`}>
        {value}
      </p>
    </div>
  )
}
