import { NextResponse } from 'next/server'
import { SESSION_COOKIE_NAME } from '@/lib/session'

export async function POST() {
  const res = NextResponse.redirect(new URL('/login', process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3100'))
  res.cookies.delete(SESSION_COOKIE_NAME)
  return res
}
