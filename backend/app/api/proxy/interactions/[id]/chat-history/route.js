import { NextResponse } from 'next/server'
import { requireAdminUsername } from '@/lib/admin-session'

export async function GET(request, { params }) {
  const { id } = await params
  const adminUser = await requireAdminUsername()
  const key = process.env.ADMIN_API_KEY || ''
  const base = process.env.API_BASE_URL || 'http://localhost:3001'

  const headers = { 'Content-Type': 'application/json', 'x-admin-user': adminUser }
  if (key) headers['x-admin-key'] = key

  const res = await fetch(`${base}/api/admin/interactions/${id}/chat-history`, {
    headers,
    cache: 'no-store'
  })

  if (!res.ok) {
    return NextResponse.json({ error: 'Not found' }, { status: res.status })
  }

  const data = await res.json()
  return NextResponse.json(data)
}
