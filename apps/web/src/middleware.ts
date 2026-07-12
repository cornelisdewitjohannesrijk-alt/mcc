import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const PUBLIC_PATHS = ['/login']

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p))

  // Read the auth token from cookies (set by login page)
  const token = request.cookies.get('mcc_token')?.value

  // Not logged in → redirect to login
  if (!token && !isPublic) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('next', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // Already logged in → redirect away from login
  if (token && pathname === '/login') {
    return NextResponse.redirect(new URL('/inbox', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    // Match everything except Next.js internals and static files
    '/((?!_next/static|_next/image|favicon.ico|icons/).*)',
  ],
}
