'use server'

import { revalidatePath } from 'next/cache'
import { apiWrite } from '@/lib/admin-api'

export async function updateDefaultModel(formData) {
  const modelId = String(formData.get('modelId') || '').trim()
  await apiWrite('/api/admin/models/default', 'PATCH', { modelId })
  revalidatePath('/system-setting')
  revalidatePath('/prompt-playground')
  revalidatePath('/pending')
  return { ok: true, message: `Default model updated to ${modelId}` }
}
