import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function POST(request) {
  const body = await request.json().catch(() => ({}))
  const jar = await cookies()
  const adminUser = jar.get('admin_user')?.value || 'admin'
  const key = process.env.ADMIN_API_KEY || ''
  const base = process.env.API_BASE_URL || 'http://localhost:3001'

  const headers = {
    'Content-Type': 'application/json',
    'x-admin-user': adminUser
  }
  if (key) headers['x-admin-key'] = key

  const res = await fetch(`${base}/api/admin/prompt-playground/compare`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    cache: 'no-store'
  })

  const data = await res.json().catch(() => ({ error: 'Invalid API response' }))
  return NextResponse.json(data, { status: res.status })
}
