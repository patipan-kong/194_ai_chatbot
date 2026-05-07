import { NextResponse } from 'next/server'

export async function POST() {
  const res = NextResponse.redirect(new URL('/login', process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3100'))
  res.cookies.delete('admin_auth')
  res.cookies.delete('admin_user')
  return res
}
