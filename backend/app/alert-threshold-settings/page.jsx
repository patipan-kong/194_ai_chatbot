import AdminShell from '@/components/admin-shell'
import AlertThresholdSettingsForm from '@/components/alert-threshold-settings-form'
import FlashMessage from '@/components/flash-message'
import { apiGet } from '@/lib/admin-api'

export default async function AlertThresholdSettingsPage({ searchParams }) {
  const p = await searchParams
  const data = await apiGet('/api/admin/alerts/settings')
  const flash = String(p?.flash || '')

  return (
    <AdminShell title='Alert Threshold Settings'>
      <FlashMessage message={flash} />
      <AlertThresholdSettingsForm initial={data.item} />
    </AdminShell>
  )
}