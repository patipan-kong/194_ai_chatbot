'use server'

import { revalidatePath } from 'next/cache'
import { apiWrite } from '@/lib/admin-api'

export async function createKnowledgeBase(formData) {
  const status = String(formData.get('status') || 'DRAFT').toUpperCase()
  await apiWrite('/api/admin/knowledge-base', 'POST', {
    category: String(formData.get('category') || ''),
    question: String(formData.get('question') || ''),
    answer: String(formData.get('answer') || ''),
    fullAnswer: String(formData.get('fullAnswer') || formData.get('answer') || ''),
    status
  })
  revalidatePath('/knowledge-base')
  return { ok: true, message: 'Knowledge Base created' }
}

export async function toggleKnowledgeBaseActive(formData) {
  const id = Number(formData.get('id'))
  const status = String(formData.get('status') || '').toUpperCase()
  const nextStatusByStatus = {
    DRAFT: 'REVIEW',
    REVIEW: 'PUBLISHED',
    PUBLISHED: 'ARCHIVED',
    ARCHIVED: 'REVIEW'
  }
  const nextStatus = nextStatusByStatus[status] || 'REVIEW'
  await apiWrite(`/api/admin/knowledge-base/${id}`, 'PATCH', { status: nextStatus })
  revalidatePath('/knowledge-base')
  return { ok: true, message: `Knowledge Base #${id} moved to ${nextStatus}` }
}

export async function updateKnowledgeBase(formData) {
  const id = Number(formData.get('id'))
  const status = String(formData.get('status') || 'DRAFT').toUpperCase()
  await apiWrite(`/api/admin/knowledge-base/${id}`, 'PATCH', {
    category: String(formData.get('category') || ''),
    question: String(formData.get('question') || ''),
    answer: String(formData.get('answer') || ''),
    fullAnswer: String(formData.get('fullAnswer') || formData.get('answer') || ''),
    status
  })
  revalidatePath('/knowledge-base')
  return { ok: true, message: `Knowledge Base #${id} updated` }
}

export async function deleteKnowledgeBase(formData) {
  const id = Number(formData.get('id'))
  await apiWrite(`/api/admin/knowledge-base/${id}`, 'DELETE')
  revalidatePath('/knowledge-base')
  return { ok: true, message: `Knowledge Base #${id} marked as deleted` }
}

export async function restoreKnowledgeBase(formData) {
  const id = Number(formData.get('id'))
  await apiWrite(`/api/admin/knowledge-base/${id}/restore`, 'POST')
  revalidatePath('/knowledge-base')
  return { ok: true, message: `Knowledge Base #${id} restored` }
}
