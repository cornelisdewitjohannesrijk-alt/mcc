import { IconLock } from '@/components/icons'

export function WelcomeScreen() {
  return (
    <div className="flex h-full flex-col items-center justify-center chat-bg select-none">
      <div className="flex flex-col items-center gap-5 max-w-sm text-center px-8">
        {/* Big phone illustration */}
        <div className="relative">
          <div
            className="h-44 w-44 rounded-full flex items-center justify-center opacity-10"
            style={{ background: 'var(--wa-header)' }}
          />
          <div className="absolute inset-0 flex items-center justify-center">
            <svg viewBox="0 0 303 172" width="200" className="opacity-30" style={{ color: 'var(--wa-header)' }}>
              <rect x="0" y="0" width="303" height="172" rx="16" fill="currentColor" />
              <rect x="10" y="10" width="283" height="152" rx="10" fill="white" fillOpacity="0.7" />
              <circle cx="40" cy="86" r="20" fill="currentColor" fillOpacity="0.5" />
              <rect x="70" y="76" width="100" height="8" rx="4" fill="currentColor" fillOpacity="0.3" />
              <rect x="70" y="91" width="70" height="6" rx="3" fill="currentColor" fillOpacity="0.2" />
              <rect x="170" y="60" width="100" height="40" rx="8" fill="currentColor" fillOpacity="0.15" />
            </svg>
          </div>
        </div>

        <div>
          <h2 className="text-2xl font-light text-gray-700 mb-2">
            MCC Web
          </h2>
          <p className="text-sm text-gray-500 leading-relaxed">
            Send and receive messages from WhatsApp Business and Facebook Messenger.
            Select a conversation from the left to get started.
          </p>
        </div>

        <div
          className="flex items-center gap-1.5 text-xs text-gray-400 mt-4 px-4 py-2 rounded-full"
          style={{ background: 'rgba(0,0,0,0.04)' }}
        >
          <IconLock size={11} />
          <span>Your messages are managed securely</span>
        </div>
      </div>
    </div>
  )
}
