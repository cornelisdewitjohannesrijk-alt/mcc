import { redirect } from 'next/navigation'

// Root redirects to the inbox
export default function RootPage() {
  redirect('/inbox')
}
