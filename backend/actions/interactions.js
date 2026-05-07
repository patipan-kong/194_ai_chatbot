'use server'

import { revalidatePath } from 'next/cache'
import { apiWrite } from '@/lib/admin-api'

export async function recalculateInteractionCosts(formData) {
  await apiWrite('/api/admin/interactions/recalculate-cost', 'POST', {
    modelId: String(formData.get('modelId') || ''),
    question: String(formData.get('question') || ''),
    isThumbUp: String(formData.get('isThumbUp') || ''),
    source: String(formData.get('source') || ''),
    from: String(formData.get('from') || ''),
    to: String(formData.get('to') || '')
  })

  revalidatePath('/interactions')
}
