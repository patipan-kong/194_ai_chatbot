'use server'

import { revalidatePath } from 'next/cache'
import { apiWrite } from '@/lib/admin-api'

export async function createAdminUser(formData) {
  await apiWrite('/api/admin/admin-users', 'POST', {
    username: String(formData.get('username') || ''),
    password: String(formData.get('password') || '')
  })
  revalidatePath('/admin-users')
  return { ok: true, message: 'Admin user created' }
}

export async function deleteAdminUser(formData) {
  const id = Number(formData.get('id'))
  await apiWrite(`/api/admin/admin-users/${id}`, 'DELETE')
  revalidatePath('/admin-users')
  return { ok: true, message: `Admin user #${id} marked as deleted` }
}

export async function updateAdminUser(formData) {
  const id = Number(formData.get('id'))
  const username = String(formData.get('username') || '')
  const password = String(formData.get('password') || '')

  await apiWrite(`/api/admin/admin-users/${id}`, 'PATCH', {
    ...(username ? { username } : {}),
    ...(password ? { password } : {})
  })
  revalidatePath('/admin-users')
  return { ok: true, message: `Admin user #${id} updated` }
}

export async function restoreAdminUser(formData) {
  const id = Number(formData.get('id'))
  await apiWrite(`/api/admin/admin-users/${id}/restore`, 'POST')
  revalidatePath('/admin-users')
  return { ok: true, message: `Admin user #${id} restored` }
}
