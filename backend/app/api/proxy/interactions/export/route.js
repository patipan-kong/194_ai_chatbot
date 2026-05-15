import { NextResponse } from 'next/server'
import { requireAdminUsername } from '@/lib/admin-session'

export async function GET(request) {
  const adminUser = await requireAdminUsername()
  const key = process.env.ADMIN_API_KEY || ''
  const base = process.env.API_BASE_URL || 'http://localhost:3001'

  const { searchParams } = new URL(request.url)
  const res = await fetch(`${base}/api/admin/interactions/export?${searchParams.toString()}`, {
    headers: {
      'x-admin-user': adminUser,
      ...(key ? { 'x-admin-key': key } : {})
    },
    cache: 'no-store'
  })

  if (!res.ok) {
    return NextResponse.json({ error: 'Export failed' }, { status: res.status })
  }

  const csv = await res.text()
  const date = new Date().toISOString().slice(0, 10)
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="interactions-${date}.csv"`
    }
  })
}
