'use server'

import { revalidatePath } from 'next/cache'
import { apiWrite } from '@/lib/admin-api'

export async function createSystemSetting(formData) {
  await apiWrite('/api/admin/system-settings', 'POST', {
    version: Number(formData.get('version')),
    description: String(formData.get('description') || ''),
    systemPromptTemplate: String(formData.get('systemPromptTemplate') || ''),
    unknownAnswerCleanText: String(formData.get('unknownAnswerCleanText') || ''),
    isActive: Boolean(formData.get('isActive'))
  })
  revalidatePath('/system-setting')
  return { ok: true, message: 'System setting created' }
}

export async function activateSystemSetting(formData) {
  const id = Number(formData.get('id'))
  await apiWrite(`/api/admin/system-settings/${id}/activate`, 'PATCH')
  revalidatePath('/system-setting')
  return { ok: true, message: `System setting #${id} activated` }
}
