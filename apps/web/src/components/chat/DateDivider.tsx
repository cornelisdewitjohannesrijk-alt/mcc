import { format, isToday, isYesterday } from 'date-fns'

export function DateDivider({ date }: { date: Date }) {
  let label: string
  if (isToday(date)) label = 'Today'
  else if (isYesterday(date)) label = 'Yesterday'
  else label = format(date, 'MMMM d, yyyy')

  return (
    <div className="flex items-center justify-center my-3 px-4">
      <span
        className="rounded-full px-3 py-0.5 text-xs shadow-sm"
        style={{
          background: '#e1f3fb',
          color: '#54656f',
        }}
      >
        {label}
      </span>
    </div>
  )
}
