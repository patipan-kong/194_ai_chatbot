import AdminShell from '@/components/admin-shell'
import SimpleTable from '@/components/simple-table'
import { apiGet } from '@/lib/admin-api'
import InteractionsCostActions from '@/components/interactions-cost-actions'
import SortPreferenceSync from '@/components/sort-preference-sync'
import ListPagination from '@/components/list-pagination'
import Link from 'next/link'

export default async function InteractionsPage({ searchParams }) {
  const p = await searchParams
  const hasSourceParam = Object.prototype.hasOwnProperty.call(p || {}, 'source')
  const source = hasSourceParam ? String(p?.source || '') : 'chat-public'
  const qs = new URLSearchParams()
  if (p?.modelId) qs.set('modelId', p.modelId)
  if (p?.question) qs.set('question', p.question)
  if (p?.isThumbUp) qs.set('isThumbUp', p.isThumbUp)
  qs.set('source', source)
  if (p?.from) qs.set('from', p.from)
  if (p?.to) qs.set('to', p.to)
  if (p?.sortBy) qs.set('sortBy', p.sortBy)
  if (p?.sortDir) qs.set('sortDir', p.sortDir)
  const page = Math.max(1, Number.parseInt(String(p?.page || '1'), 10) || 1)
  const pageSize = Math.max(1, Number.parseInt(String(p?.pageSize || '20'), 10) || 20)
  qs.set('page', String(page))
  qs.set('pageSize', String(pageSize))
  const query = qs.toString() ? `?${qs.toString()}` : ''

  const [interactionData, dashboard] = await Promise.all([
    apiGet('/api/admin/interactions', query),
    apiGet('/api/admin/dashboard')
  ])
  const { items, total = 0, totalPages = 1 } = interactionData || {}
  const models = (dashboard?.modelRouting || []).map(m => m.modelId).filter(Boolean)

  return (
    <AdminShell title='Interactions'>
      <SortPreferenceSync storageKey='interactions-table' sortKeys={['sortBy', 'sortDir']} />

      <form className='card mb-4 grid grid-cols-10 gap-2 items-end'>
        <div className='col-span-2'>
          <label className='text-xs text-slate-500'>Model</label>
          <select name='modelId' defaultValue={p?.modelId || ''} className='w-full rounded-lg border border-slate-300 px-3 py-2'>
            <option value=''>All</option>
            {models.map(modelId => (
              <option key={modelId} value={modelId}>{modelId}</option>
            ))}
          </select>
        </div>
        <div className='col-span-2'>
          <label className='text-xs text-slate-500'>Question contains</label>
          <input name='question' defaultValue={p?.question || ''} className='w-full rounded-lg border border-slate-300 px-3 py-2' />
        </div>
        <div>
          <label className='text-xs text-slate-500'>Thumb</label>
          <select name='isThumbUp' defaultValue={p?.isThumbUp || ''} className='w-full rounded-lg border border-slate-300 px-3 py-2'>
            <option value=''>All</option>
            <option value='true'>Up</option>
            <option value='false'>Down</option>
          </select>
        </div>
        <div>
          <label className='text-xs text-slate-500'>Source</label>
          <select name='source' defaultValue={source} className='w-full rounded-lg border border-slate-300 px-3 py-2'>
            <option value='chat-public'>Chat Public</option>
            <option value='chat-member'>Chat Member</option>
            <option value='chat'>Chat (All)</option>
            <option value='playground'>Prompt Playground</option>
            <option value=''>All</option>
          </select>
        </div>
        <div>
          <label className='text-xs text-slate-500'>Sort By</label>
          <select name='sortBy' defaultValue={p?.sortBy || 'createdAt'} className='w-full rounded-lg border border-slate-300 px-3 py-2'>
            <option value='createdAt'>createdAt</option>
            <option value='modelId'>modelId</option>
            <option value='inputTokens'>inputTokens</option>
            <option value='outputTokens'>outputTokens</option>
            <option value='responseTime'>responseTime</option>
            <option value='cost'>cost</option>
            <option value='userQuestion'>question</option>
          </select>
        </div>
        <div>
          <label className='text-xs text-slate-500'>Direction</label>
          <select name='sortDir' defaultValue={p?.sortDir || 'desc'} className='w-full rounded-lg border border-slate-300 px-3 py-2'>
            <option value='desc'>DESC</option>
            <option value='asc'>ASC</option>
          </select>
        </div>
        <div>
          <label className='text-xs text-slate-500'>From</label>
          <input name='from' type='date' defaultValue={p?.from || ''} className='w-full rounded-lg border border-slate-300 px-3 py-2' />
        </div>
        <div>
          <label className='text-xs text-slate-500'>To</label>
          <input name='to' type='date' defaultValue={p?.to || ''} className='w-full rounded-lg border border-slate-300 px-3 py-2' />
        </div>
        <button className='rounded-lg bg-brand text-white px-3 py-2 font-semibold'>Apply</button>
      </form>

      <InteractionsCostActions
        filters={{
          modelId: p?.modelId || '',
          question: p?.question || '',
          isThumbUp: p?.isThumbUp || '',
          source,
          from: p?.from || '',
          to: p?.to || ''
        }}
      />

      <SimpleTable
        columns={[
          { key: 'id', header: 'ID' },
          { key: 'userQuestion', header: 'Question', render: v => (
            <span className='max-w-xs block truncate' title={v}>{v}</span>
          )},
          {
            key: 'isThumbUp',
            header: 'Thumb',
            render: v => v === true
              ? <span className='rounded px-1.5 py-0.5 text-xs font-medium bg-green-100 text-green-700'>👍 Up</span>
              : v === false
                ? <span className='rounded px-1.5 py-0.5 text-xs font-medium bg-red-100 text-red-700'>👎 Down</span>
                : <span className='text-slate-400 text-xs'>–</span>
          },
          {
            key: 'pendingReview',
            header: 'Missing',
            render: v => v?.source === 'UNKNOWN_ANSWER'
              ? <span className='rounded px-1.5 py-0.5 text-xs font-medium bg-orange-100 text-orange-700'>Missing</span>
              : <span className='text-slate-400 text-xs'>–</span>
          },
          {
            key: 'tags',
            header: 'Tags',
            render: v => Array.isArray(v) && v.length > 0
              ? <span className='flex flex-wrap gap-1'>{v.map(t => <span key={t} className='rounded-full bg-blue-100 text-blue-700 px-1.5 py-0.5 text-xs'>{t}</span>)}</span>
              : <span className='text-slate-400 text-xs'>–</span>
          },
          { key: 'modelId', header: 'Model' },
          { key: 'inputTokens', header: 'In' },
          { key: 'outputTokens', header: 'Out' },
          { key: 'responseTime', header: 'Latency', render: v => `${((v || 0) / 1000).toFixed(2)} s` },
          { key: 'cost', header: 'Cost', render: v => `$${(v || 0).toFixed(5)}` },
          { key: 'createdAt', header: 'At', render: v => new Date(v).toLocaleString() },
          {
            key: 'detail',
            header: 'Detail',
            render: (_, row) => <Link href={`/interactions/${row.id}`} className='text-brand underline'>Open</Link>
          }
        ]}
        rows={items || []}
      />

      <ListPagination
        basePath='/interactions'
        searchParams={p}
        page={page}
        pageSize={pageSize}
        total={total}
        totalPages={totalPages}
      />
    </AdminShell>
  )
}
