import { cookies } from 'next/headers'

async function adminHeaders() {
  const jar = await cookies()
  const adminUser = jar.get('admin_user')?.value || 'admin'
  const key = process.env.ADMIN_API_KEY || ''
  const headers = { 'Content-Type': 'application/json', 'x-admin-user': adminUser }
  if (key) headers['x-admin-key'] = key
  return headers
}

async function extractApiErrorMessage(res, fallback) {
  try {
    const data = await res.json()
    const detail = String(data?.error || data?.detail || '').trim()
    if (detail) return detail
  } catch {}

  try {
    const text = (await res.text()).trim()
    if (text) return text
  } catch {}

  return fallback
}

export async function apiGet(path, searchParams = '') {
  const base = process.env.API_BASE_URL || 'http://localhost:3001'
  const res = await fetch(`${base}${path}${searchParams}`, {
    headers: await adminHeaders(),
    cache: 'no-store'
  })
  if (!res.ok) {
    const message = await extractApiErrorMessage(res, `GET ${path} failed`)
    throw new Error(message)
  }
  return res.json()
}

export async function apiWrite(path, method, body) {
  const base = process.env.API_BASE_URL || 'http://localhost:3001'
  const res = await fetch(`${base}${path}`, {
    method,
    headers: await adminHeaders(),
    body: JSON.stringify(body ?? {})
  })
  if (!res.ok) {
    const message = await extractApiErrorMessage(res, `${method} ${path} failed`)
    throw new Error(message)
  }
  return res.json()
}
