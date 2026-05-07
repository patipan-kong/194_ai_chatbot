import AdminShell from '@/components/admin-shell'
import SimpleTable from '@/components/simple-table'
import PendingRowActions from '@/components/pending-row-actions'
import ListPagination from '@/components/list-pagination'
import FlashMessage from '@/components/flash-message'
import { apiGet } from '@/lib/admin-api'

export default async function PendingPage({ searchParams }) {
  const p = await searchParams
  const grouped = p?.groupByQuestion === 'true'
  const hasStatusParam = Object.prototype.hasOwnProperty.call(p || {}, 'status')
  const status = hasStatusParam ? String(p?.status || '') : 'PENDING'
  const page = Math.max(1, Number.parseInt(String(p?.page || '1'), 10) || 1)
  const pageSize = Math.max(1, Number.parseInt(String(p?.pageSize || '20'), 10) || 20)
  const params = new URLSearchParams()
  if (grouped) params.set('groupByQuestion', 'true')
  if (status) params.set('status', status)
  params.set('page', String(page))
  params.set('pageSize', String(pageSize))
  const query = params.toString() ? `?${params.toString()}` : ''
  const [data, modelData] = await Promise.all([
    apiGet('/api/admin/pending-reviews', query),
    apiGet('/api/models')
  ])
  const items = grouped ? (data.groups || []).map(g => ({ ...g.latest, groupedCount: g.count })) : (data.items || [])
  const total = Number(data?.total || 0)
  const totalPages = Number(data?.totalPages || 1)
  const flash = String(p?.flash || '')
  const models = modelData?.models || []
  const defaultModel = modelData?.default || ''

  return (
    <AdminShell title='Pending Review'>
      <FlashMessage message={flash} />

      <form className='card mb-4 flex items-end gap-3'>
        <div>
          <label className='text-xs text-slate-500'>View Mode</label>
          <select name='groupByQuestion' defaultValue={grouped ? 'true' : 'false'} className='rounded-lg border border-slate-300 px-3 py-2'>
            <option value='false'>All Items</option>
            <option value='true'>Group By Question</option>
          </select>
        </div>
        <div>
          <label className='text-xs text-slate-500'>Status</label>
          <select name='status' defaultValue={status} className='rounded-lg border border-slate-300 px-3 py-2'>
            <option value=''>All</option>
            <option value='PENDING'>PENDING</option>
            <option value='RESOLVED'>RESOLVED</option>
            <option value='IGNORED'>IGNORED</option>
          </select>
        </div>
        <button className='rounded-lg bg-brand text-white px-3 py-2 font-semibold'>Apply</button>
      </form>

      <SimpleTable
        columns={[
          { key: 'id', header: 'ID' },
          { key: 'question', header: 'Question' },
          { key: 'groupedCount', header: 'Count', render: v => v || 1 },
          { key: 'source', header: 'Source' },
          { key: 'status', header: 'Status' },
          { key: 'reviewNote', header: 'Review Note' },
          { key: 'resolvedBy', header: 'Resolved By' },
          { key: 'resolvedAt', header: 'Resolved At', render: v => (v ? new Date(v).toLocaleString() : '-') },
          { key: 'createdAt', header: 'Created', render: v => new Date(v).toLocaleString() },
          {
            key: 'actions',
            header: 'Actions',
            render: (_, row) => <PendingRowActions row={row} models={models} defaultModel={defaultModel} />
          }
        ]}
        rows={items || []}
      />

      <ListPagination
        basePath='/pending'
        searchParams={p}
        page={page}
        pageSize={pageSize}
        total={total}
        totalPages={totalPages}
      />
    </AdminShell>
  )
}
