import { NextResponse } from 'next/server'
import { requireAdminUsername } from '@/lib/admin-session'

export async function PATCH(request, { params }) {
  const { id } = await params
  const adminUser = await requireAdminUsername()
  const key = process.env.ADMIN_API_KEY || ''
  const base = process.env.API_BASE_URL || 'http://localhost:3001'

  const body = await request.json()
  const res = await fetch(`${base}/api/admin/interactions/${id}/tags`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'x-admin-user': adminUser,
      ...(key ? { 'x-admin-key': key } : {})
    },
    body: JSON.stringify(body),
    cache: 'no-store'
  })

  const data = await res.json()
  return NextResponse.json(data, { status: res.status })
}
