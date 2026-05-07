import AdminShell from '@/components/admin-shell'
import FlashMessage from '@/components/flash-message'
import PromptPlaygroundForm from '@/components/prompt-playground-form'
import { updateDefaultModel } from '@/actions/model-config'
import { apiGet } from '@/lib/admin-api'
import { redirect } from 'next/navigation'

export default async function PromptPlaygroundPage({ searchParams }) {
  const p = await searchParams
  const flash = String(p?.flash || '')
  const historyId = Number.parseInt(String(p?.historyId || '0'), 10) || 0
  const historyPage = Math.max(1, Number.parseInt(String(p?.historyPage || '1'), 10) || 1)
  const historyParams = new URLSearchParams()
  historyParams.set('page', String(historyPage))
  historyParams.set('pageSize', '20')

  const [settingsData, modelConfig, historyData, historyDetailData] = await Promise.all([
    apiGet('/api/admin/system-settings', '?page=1&pageSize=200'),
    apiGet('/api/admin/models/default'),
    apiGet('/api/admin/prompt-playground/history', `?${historyParams.toString()}`),
    historyId ? apiGet(`/api/admin/prompt-playground/history/${historyId}`) : Promise.resolve({ item: null })
  ])

  const settingItems = settingsData?.items || []
  const modelItems = modelConfig?.models || []
  const defaultModel = modelConfig?.defaultModel || ''
  const historyItems = historyData?.items || []
  const historyTotalPages = Number(historyData?.totalPages || 1)
  const selectedHistory = historyDetailData?.item || null

  const promptOptions = settingItems.map(item => ({
    id: item.id,
    version: item.version,
    description: item.description || '',
    isActive: Boolean(item.isActive),
    systemPromptTemplate: item.systemPromptTemplate || ''
  }))

  const modelOptions = modelItems
    .map(item => ({
      modelId: item.id,
      label: item.label || item.id,
      provider: item.provider || '',
      cost: item.cost || null,
      rating: item.rating || null
    }))
    .filter(item => item.modelId)

  async function onUpdateDefaultModel(formData) {
    'use server'
    const result = await updateDefaultModel(formData)
    const params = new URLSearchParams()
    params.set('flash', result?.message || 'Saved')
    redirect(`/prompt-playground?${params.toString()}`)
  }

  return (
    <AdminShell title='Prompt Playground'>
      <FlashMessage message={flash} />

      <form action={onUpdateDefaultModel} className='card mb-4 flex items-end gap-3'>
        <div className='min-w-[280px]'>
          <label className='text-xs text-slate-500'>Default AI Model (frontend chat)</label>
          <select name='modelId' defaultValue={defaultModel} className='w-full rounded-lg border border-slate-300 px-3 py-2'>
            {modelOptions.map(model => (
              <option key={model.modelId} value={model.modelId}>{model.label} ({model.modelId})</option>
            ))}
          </select>
        </div>
        <button className='rounded-lg bg-brand text-white px-3 py-2 font-semibold'>Set Default Model</button>
      </form>

      <PromptPlaygroundForm
        promptOptions={promptOptions}
        modelOptions={modelOptions}
        defaultModel={defaultModel}
        historyItems={historyItems}
        selectedHistory={selectedHistory}
        historyPage={historyPage}
        historyTotalPages={historyTotalPages}
      />
    </AdminShell>
  )
}
