import { cookies } from 'next/headers'
import { SESSION_COOKIE_NAME, verifySessionToken } from './session.js'

// Server-side helper for Server Components / actions / route handlers.
// Middleware uses request.cookies directly, not this helper.
export async function getCurrentSession() {
  const jar = await cookies()
  const token = jar.get(SESSION_COOKIE_NAME)?.value
  if (!token) return null
  return verifySessionToken(token)
}

export async function requireAdminUsername(fallback = 'admin') {
  const session = await getCurrentSession()
  return session?.username || fallback
}
