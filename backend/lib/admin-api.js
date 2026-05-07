import { cookies } from 'next/headers'

async function adminHeaders() {
  const jar = await cookies()
  const adminUser = jar.get('admin_user')?.value || 'admin'
  const key = process.env.ADMIN_API_KEY || ''
  const headers = { 'Content-Type': 'application/json', 'x-admin-user': adminUser }
  if (key) headers['x-admin-key'] = key
  return headers
}

export async function apiGet(path, searchParams = '') {
  const base = process.env.API_BASE_URL || 'http://localhost:3001'
  const res = await fetch(`${base}${path}${searchParams}`, {
    headers: await adminHeaders(),
    cache: 'no-store'
  })
  if (!res.ok) throw new Error(`GET ${path} failed`)
  return res.json()
}

export async function apiWrite(path, method, body) {
  const base = process.env.API_BASE_URL || 'http://localhost:3001'
  const res = await fetch(`${base}${path}`, {
    method,
    headers: await adminHeaders(),
    body: JSON.stringify(body ?? {})
  })
  if (!res.ok) throw new Error(`${method} ${path} failed`)
  return res.json()
}
