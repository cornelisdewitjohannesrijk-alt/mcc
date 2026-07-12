import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-inter)', 'Segoe UI', 'Helvetica Neue', 'Arial', 'sans-serif'],
      },
      colors: {
        wa: {
          header: '#1877f2',
          'bubble-out': '#d0e4ff',
          'bubble-in': '#ffffff',
          unread: '#1877f2',
          timestamp: '#667781',
          icon: '#54656f',
        },
      },
    },
  },
  plugins: [],
}

export default config
