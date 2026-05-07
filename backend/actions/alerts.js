'use server'

import { revalidatePath } from 'next/cache'
import { apiWrite } from '@/lib/admin-api'

export async function updateAlertSettings(formData) {
  const dailyCostThreshold = Number(formData.get('dailyCostThreshold'))
  const monthlyCostThreshold = Number(formData.get('monthlyCostThreshold'))
  const pendingReviewThreshold = Number(formData.get('pendingReviewThreshold'))
  const notifyTarget = String(formData.get('notifyTarget') || 'dashboard')

  await apiWrite('/api/admin/alerts/settings', 'PATCH', {
    dailyCostThreshold,
    monthlyCostThreshold,
    pendingReviewThreshold,
    notifyTarget
  })

  revalidatePath('/dashboard')
  revalidatePath('/alert-threshold-settings')
  return { ok: true, message: 'Alert thresholds updated' }
}