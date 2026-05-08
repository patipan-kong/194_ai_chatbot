'use server'

import { revalidatePath } from 'next/cache'
import { apiWrite } from '@/lib/admin-api'

export async function createCategory(formData) {
  const name = String(formData.get('name') || '').trim()
  const for194Member = formData.get('for194Member') === 'on'
  try {
    await apiWrite('/api/admin/categories', 'POST', { name, for194Member })
    revalidatePath('/categories')
    revalidatePath('/knowledge-base')
    return { ok: true, message: `Category ${name} created` }
  } catch (err) {
    return { ok: false, message: err?.message || 'Failed to create category' }
  }
}

export async function updateCategory(formData) {
  const id = Number(formData.get('id'))
  const name = String(formData.get('name') || '').trim()
  const for194Member = formData.get('for194Member') === 'on'
  try {
    await apiWrite(`/api/admin/categories/${id}`, 'PATCH', { name, for194Member })
    revalidatePath('/categories')
    revalidatePath('/knowledge-base')
    return { ok: true, message: `Category #${id} updated` }
  } catch (err) {
    return { ok: false, message: err?.message || `Failed to update category #${id}` }
  }
}

export async function deleteCategory(formData) {
  const id = Number(formData.get('id'))
  try {
    await apiWrite(`/api/admin/categories/${id}`, 'DELETE')
    revalidatePath('/categories')
    revalidatePath('/knowledge-base')
    return { ok: true, message: `Category #${id} deleted` }
  } catch (err) {
    return { ok: false, message: err?.message || `Failed to delete category #${id}` }
  }
}
