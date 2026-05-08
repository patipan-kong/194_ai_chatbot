import AdminShell from '@/components/admin-shell'
import SimpleTable from '@/components/simple-table'
import KbRowActions from '@/components/kb-row-actions'
import KbAddModal from '@/components/kb-add-modal'
import ListPagination from '@/components/list-pagination'
import FlashMessage from '@/components/flash-message'
import { apiGet } from '@/lib/admin-api'

const STATUS_BADGE = {
  DRAFT: 'bg-slate-100 text-slate-700 border-slate-200',
  REVIEW: 'bg-amber-100 text-amber-800 border-amber-200',
  PUBLISHED: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  ARCHIVED: 'bg-rose-100 text-rose-800 border-rose-200'
}

export default async function KnowledgeBasePage({ searchParams }) {
  const p = await searchParams
  const category = p?.category || ''
  const categoryAudience = p?.categoryAudience || 'all'
  const status = p?.status || ''
  const deleted = p?.deleted || 'active'
  const page = Math.max(1, Number.parseInt(String(p?.page || '1'), 10) || 1)
  const pageSize = Math.max(1, Number.parseInt(String(p?.pageSize || '20'), 10) || 20)
  const qs = new URLSearchParams()
  if (category) qs.set('category', category)
  if (categoryAudience) qs.set('categoryAudience', categoryAudience)
  if (status) qs.set('status', status)
  if (deleted) qs.set('deleted', deleted)
  qs.set('page', String(page))
  qs.set('pageSize', String(pageSize))
  const query = `?${qs.toString()}`
  const [kbData, categories] = await Promise.all([
    apiGet('/api/admin/knowledge-base', query),
    apiGet('/api/admin/knowledge-base/categories')
  ])
  const { items, total = 0, totalPages = 1 } = kbData || {}
  const flash = String(p?.flash || '')
  const categoryOptions = categories?.categories || []

  return (
    <AdminShell title='Knowledge Base'>
      <FlashMessage message={flash} />
      <KbAddModal categoryOptions={categoryOptions} />

      <form className='card mb-4 grid grid-cols-7 gap-3 items-end'>
        <div>
          <label className='text-xs text-slate-500'>Filter Category</label>
          <select name='category' defaultValue={category} className='w-full rounded-lg border border-slate-300 px-3 py-2'>
            <option value=''>All</option>
            {(categories?.categories || []).map(c => (
              <option key={c.id} value={c.name}>{c.name} ({c.for194Member ? 'Member' : 'Public'})</option>
            ))}
          </select>
        </div>
        <div>
          <label className='text-xs text-slate-500'>Category Audience</label>
          <select name='categoryAudience' defaultValue={categoryAudience} className='w-full rounded-lg border border-slate-300 px-3 py-2'>
            <option value='all'>All</option>
            <option value='public'>Public</option>
            <option value='member'>Member</option>
          </select>
        </div>
        <div>
          <label className='text-xs text-slate-500'>Status</label>
          <select name='status' defaultValue={status} className='w-full rounded-lg border border-slate-300 px-3 py-2'>
            <option value=''>All</option>
            <option value='DRAFT'>DRAFT</option>
            <option value='REVIEW'>REVIEW</option>
            <option value='PUBLISHED'>PUBLISHED</option>
            <option value='ARCHIVED'>ARCHIVED</option>
          </select>
        </div>
        <div>
          <label className='text-xs text-slate-500'>Recycle Bin</label>
          <select name='deleted' defaultValue={deleted} className='w-full rounded-lg border border-slate-300 px-3 py-2'>
            <option value='active'>Active Only</option>
            <option value='deleted'>Deleted Only</option>
            <option value='all'>All</option>
          </select>
        </div>
        <button className='rounded-lg bg-slate-700 text-white px-3 py-2 font-semibold'>Apply Filter</button>
      </form>

      <SimpleTable
        columns={[
          { key: 'id', header: 'ID' },
          { key: 'category', header: 'Category' },
          { key: 'question', header: 'Question' },
          {
            key: 'status',
            header: 'Status',
            render: value => {
              const statusValue = String(value || 'DRAFT').toUpperCase()
              const className = STATUS_BADGE[statusValue] || STATUS_BADGE.DRAFT
              return <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${className}`}>{statusValue}</span>
            }
          },
          { key: 'isActive', header: 'Active', render: v => (v ? 'Yes' : 'No') },
          { key: 'isDelete', header: 'Deleted', render: v => (v ? 'Yes' : 'No') },
          { key: 'updatedAt', header: 'Updated', render: v => new Date(v).toLocaleString() },
          {
            key: 'actions',
            header: 'Actions',
            render: (_, row) => <KbRowActions row={row} categoryOptions={categoryOptions} />
          }
        ]}
        rows={items || []}
      />

      <ListPagination
        basePath='/knowledge-base'
        searchParams={p}
        page={page}
        pageSize={pageSize}
        total={total}
        totalPages={totalPages}
      />
    </AdminShell>
  )
}
