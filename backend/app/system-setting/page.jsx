import AdminShell from '@/components/admin-shell'
import SimpleTable from '@/components/simple-table'
import ListPagination from '@/components/list-pagination'
import FlashMessage from '@/components/flash-message'
import { apiGet } from '@/lib/admin-api'
import { activateSystemSetting, createSystemSetting } from '@/actions/system-setting'
import { updateDefaultModel } from '@/actions/model-config'
import Link from 'next/link'
import { redirect } from 'next/navigation'

export default async function SystemSettingPage({ searchParams }) {
  const p = await searchParams
  const page = Math.max(1, Number.parseInt(String(p?.page || '1'), 10) || 1)
  const pageSize = Math.max(1, Number.parseInt(String(p?.pageSize || '20'), 10) || 20)
  const params = new URLSearchParams()
  params.set('page', String(page))
  params.set('pageSize', String(pageSize))
  const [settingsData, modelConfig] = await Promise.all([
    apiGet('/api/admin/system-settings', `?${params.toString()}`),
    apiGet('/api/admin/models/default')
  ])
  const { items, total = 0, totalPages = 1 } = settingsData || {}
  const copyFromId = Number(p?.copyFrom || 0)
  const active = items?.find(x => x.isActive)
  const copySource = items?.find(x => x.id === copyFromId) || null
  const formSeed = copySource || null
  const nextVersion = Number(formSeed?.version || active?.version || 0) + 1
  const flash = String(p?.flash || '')
  const modelItems = modelConfig?.models || []
  const defaultModel = modelConfig?.defaultModel || ''

  const modelOptions = modelItems
    .map(item => ({
      modelId: item.id,
      label: item.label || item.id,
      provider: item.provider || ''
    }))
    .filter(item => item.modelId)

  async function onCreateSystemSetting(formData) {
    'use server'
    const result = await createSystemSetting(formData)
    const params = new URLSearchParams()
    params.set('flash', result?.message || 'Saved')
    redirect(`/system-setting?${params.toString()}`)
  }

  async function onActivateSystemSetting(formData) {
    'use server'
    const result = await activateSystemSetting(formData)
    const params = new URLSearchParams()
    params.set('flash', result?.message || 'Saved')
    redirect(`/system-setting?${params.toString()}`)
  }

  async function onUpdateDefaultModel(formData) {
    'use server'
    const result = await updateDefaultModel(formData)
    const params = new URLSearchParams()
    params.set('flash', result?.message || 'Saved')
    redirect(`/system-setting?${params.toString()}`)
  }

  return (
    <AdminShell title='System Setting'>
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

      <div className='card mb-4'>
        <p className='text-sm'>
          Use <span className='font-semibold'>Copy</span> from current/older version to prefill the form,
          then edit and create a new version.
        </p>
      </div>
      
      <form action={onCreateSystemSetting} className='card mb-4 space-y-3'>
        <div className='grid grid-cols-3 gap-3'>
          <div>
            <label className='text-xs text-slate-500'>Version</label>
            <input name='version' type='number' min='1' defaultValue={nextVersion} className='w-full rounded-lg border border-slate-300 px-3 py-2' />
          </div>
          <div>
            <label className='text-xs text-slate-500'>Activate now</label>
            <div>
              <input name='isActive' type='checkbox' className='mt-2 h-4 w-4' defaultChecked />
            </div>
          </div>
        </div>
        <div>
          <label className='text-xs text-slate-500'>Description</label>
          <textarea
            name='description'
            rows={2}
            defaultValue={formSeed?.description || ''}
            className='w-full rounded-lg border border-slate-300 px-3 py-2'
            placeholder='Short description for this prompt version'
          />
        </div>
        <div>
          <label className='text-xs text-slate-500'>System Prompt Template (use {'{{FAQ_DATA}}'})</label>
          <textarea name='systemPromptTemplate' rows={8} defaultValue={formSeed?.systemPromptTemplate || ''} className='w-full rounded-lg border border-slate-300 px-3 py-2' required />
        </div>
        <div>
          <label className='text-xs text-slate-500'>Unknown Answer Clean Text</label>
          <textarea name='unknownAnswerCleanText' rows={3} defaultValue={formSeed?.unknownAnswerCleanText || ''} className='w-full rounded-lg border border-slate-300 px-3 py-2' required />
        </div>
        <button className='rounded-lg bg-brand text-white px-3 py-2 font-semibold'>Create System Setting</button>
      </form>

      <SimpleTable
        columns={[
          { key: 'id', header: 'ID' },
          { key: 'version', header: 'Version' },
          { key: 'description', header: 'Description' },
          { key: 'createdBy', header: 'Created By' },
          { key: 'isActive', header: 'Active', render: v => (v ? 'Yes' : 'No') },
          { key: 'createdAt', header: 'Created', render: v => new Date(v).toLocaleString() },
          {
            key: 'actions',
            header: 'Actions',
            render: (_, row) => (
              <div className='flex items-center gap-2'>
                <form action={onActivateSystemSetting}>
                  <input type='hidden' name='id' value={row.id} />
                  <button className='rounded-md border border-slate-300 px-2 py-1 text-xs' disabled={row.isActive}>
                    {row.isActive ? 'Active' : 'Activate'}
                  </button>
                </form>
                <Link href={`/system-setting?copyFrom=${row.id}`} className='rounded-md border border-slate-300 px-2 py-1 text-xs'>
                  Copy
                </Link>
              </div>
            )
          }
        ]}
        rows={items || []}
      />

      <ListPagination
        basePath='/system-setting'
        searchParams={p}
        page={page}
        pageSize={pageSize}
        total={total}
        totalPages={totalPages}
      />
    </AdminShell>
  )
}
