// ─── Token helpers ────────────────────────────────────────────────────────────
// Stores JWT in both localStorage (for axios) and a cookie (for middleware).

const TOKEN_KEY = 'mcc_token'
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7 // 7 days

export function saveToken(token: string) {
  if (typeof window === 'undefined') return
  localStorage.setItem(TOKEN_KEY, token)
  // Cookie is read by Next.js middleware for route protection.
  // Not httpOnly so JS can write it — upgrade to httpOnly cookie via API in future.
  document.cookie = `${TOKEN_KEY}=${token}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`
}

export function getToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(TOKEN_KEY)
}

export function clearToken() {
  if (typeof window === 'undefined') return
  localStorage.removeItem(TOKEN_KEY)
  document.cookie = `${TOKEN_KEY}=; path=/; max-age=0; SameSite=Lax`
}
