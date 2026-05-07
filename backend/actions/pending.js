'use server'

import { revalidatePath } from 'next/cache'
import { apiWrite } from '@/lib/admin-api'

export async function updatePendingStatus(formData) {
  const id = Number(formData.get('id'))
  const status = String(formData.get('status') || 'PENDING')
  const reviewNote = String(formData.get('reviewNote') || '')
  await apiWrite(`/api/admin/pending-reviews/${id}/status`, 'PATCH', { status, reviewNote })
  revalidatePath('/pending')
  return { ok: true, message: `Pending #${id} status updated` }
}

export async function promotePendingToKb(formData) {
  const id = Number(formData.get('id'))
  await apiWrite(`/api/admin/pending-reviews/${id}/promote-kb`, 'POST', {
    category: String(formData.get('category') || 'General'),
    question: String(formData.get('question') || ''),
    answer: String(formData.get('answer') || '')
  })
  revalidatePath('/pending')
  revalidatePath('/knowledge-base')
  return { ok: true, message: `Pending #${id} sent to KB review` }
}

export async function askAiSuggestion(formData) {
  const question = String(formData.get('question') || '').trim()
  const model = String(formData.get('model') || '').trim()
  const prompt = String(formData.get('prompt') || '').trim()
  const answerStyleRaw = String(formData.get('answerStyle') || 'long').trim().toLowerCase()
  const answerStyle = answerStyleRaw === 'short' ? 'short' : 'long'
  if (!question) return { error: 'Question is required' }

  const styleInstruction = answerStyle === 'short'
    ? 'Provide a short answer in 3-5 bullet points with only essential details.'
    : 'Provide a detailed, structured answer with clear sections and actionable steps.'

  const message = [
    prompt || 'You are helping an admin draft a knowledge-base answer. Do not limit your response to FAQ-only rules; use best available knowledge.',
    '',
    styleInstruction,
    'Do not output UNKNOWN_ANSWER. Provide the most helpful draft response.',
    '',
    `Question: ${question}`
  ].join('\n')

  const response = await apiWrite('/api/chat', 'POST', {
    message,
    model,
    userId: 'admin-suggestion'
  })

  return {
    suggestion: String(response?.reply || '').trim(),
    model: String(response?.model || model || '')
  }
}
