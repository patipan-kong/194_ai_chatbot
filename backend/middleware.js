import { NextResponse } from 'next/server'
import { SESSION_COOKIE_NAME, SESSION_TTL_SECONDS, createSessionToken, verifySessionToken } from './lib/session.js'

const PUBLIC_PATHS = ['/login', '/api/auth/login']

export async function middleware(request) {
  const { pathname } = request.nextUrl
  if (PUBLIC_PATHS.includes(pathname)) return NextResponse.next()

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value
  const session = token ? await verifySessionToken(token) : null
  if (!session) {
    const loginUrl = new URL('/login', request.url)
    const response = NextResponse.redirect(loginUrl)
    if (token) {
      response.cookies.delete(SESSION_COOKIE_NAME)
    }
    return response
  }

  const response = NextResponse.next()
  if (session.needsRefresh) {
    const freshToken = await createSessionToken(session.username)
    response.cookies.set(SESSION_COOKIE_NAME, freshToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: SESSION_TTL_SECONDS
    })
  }
  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)']
}
