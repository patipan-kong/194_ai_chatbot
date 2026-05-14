import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { SESSION_COOKIE_NAME, SESSION_TTL_SECONDS, createSessionToken, verifySessionToken } from '@/lib/session'

async function loginAction(formData) {
  'use server'

  const username = String(formData.get('username') || '').trim()
  const password = String(formData.get('password') || '')

  if (!username || !password) {
    redirect('/login?error=1')
  }

  let authenticatedUser = null
  try {
    const base = process.env.API_BASE_URL || 'http://localhost:3001'
    const key = process.env.ADMIN_API_KEY || ''
    const headers = { 'Content-Type': 'application/json' }
    if (key) headers['x-admin-key'] = key
    const res = await fetch(`${base}/api/admin/auth/login`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ username, password }),
      cache: 'no-store'
    })
    if (res.ok) {
      const data = await res.json()
      if (data?.ok) authenticatedUser = data.username
    }
  } catch {}

  if (!authenticatedUser) {
    redirect('/login?error=1')
  }

  const token = await createSessionToken(authenticatedUser)
  const jar = await cookies()
  jar.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_TTL_SECONDS
  })
  redirect('/dashboard')
}

export default async function LoginPage({ searchParams }) {
  const jar = await cookies()
  const existing = jar.get(SESSION_COOKIE_NAME)?.value
  if (existing && (await verifySessionToken(existing))) {
    redirect('/dashboard')
  }

  const isError = (await searchParams)?.error === '1'

  return (
    <div className='min-h-dvh grid place-items-center px-4'>
      <form action={loginAction} className='card w-full max-w-md space-y-4'>
        <h1 className='text-xl font-semibold'>Admin Login</h1>
        {isError ? <p className='text-sm text-red-600'>Invalid credentials</p> : null}
        <div>
          <label className='block text-sm mb-1'>Username</label>
          <input name='username' className='w-full rounded-lg border border-slate-300 px-3 py-2' required />
        </div>
        <div>
          <label className='block text-sm mb-1'>Password</label>
          <input name='password' type='password' className='w-full rounded-lg border border-slate-300 px-3 py-2' required />
        </div>
        <button className='w-full rounded-lg bg-brand text-white py-2 font-semibold'>Sign in</button>
      </form>
    </div>
  )
}
