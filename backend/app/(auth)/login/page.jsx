import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

async function loginAction(formData) {
  'use server'

  const username = String(formData.get('username') || '').trim()
  const password = String(formData.get('password') || '')

  // 1. Try DB login via API
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

  // 2. Fallback: env var credentials
  if (!authenticatedUser) {
    const expectedUser = process.env.ADMIN_UI_USER || 'admin'
    const expectedPass = process.env.ADMIN_UI_PASSWORD || 'admin123'
    if (username === expectedUser && password === expectedPass) {
      authenticatedUser = username
    }
  }

  if (!authenticatedUser) {
    redirect('/login?error=1')
  }

  const jar = await cookies()
  jar.set('admin_auth', 'ok', { httpOnly: true, sameSite: 'lax', path: '/' })
  jar.set('admin_user', authenticatedUser, { httpOnly: true, sameSite: 'lax', path: '/' })
  redirect('/dashboard')
}

export default async function LoginPage({ searchParams }) {
  const jar = await cookies()
  if (jar.get('admin_auth')?.value) {
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
