import AdminShell from '@/components/admin-shell'
import SimpleTable from '@/components/simple-table'
import SortPreferenceSync from '@/components/sort-preference-sync'
import ListPagination from '@/components/list-pagination'
import { apiGet } from '@/lib/admin-api'
import Link from 'next/link'

export default async function ModelReportPage({ searchParams }) {
  const p = await searchParams
  const qs = new URLSearchParams()
  if (p?.from) qs.set('from', p.from)
  if (p?.to) qs.set('to', p.to)
  const sortBy = String(p?.sortBy || 'modelId')
  const sortDir = String(p?.sortDir || 'asc').toLowerCase() === 'desc' ? 'desc' : 'asc'
  const page = Math.max(1, Number.parseInt(String(p?.page || '1'), 10) || 1)
  const pageSize = Math.max(1, Number.parseInt(String(p?.pageSize || '20'), 10) || 20)
  qs.set('sortBy', sortBy)
  qs.set('sortDir', sortDir)
  const query = qs.toString() ? `?${qs.toString()}` : ''
  const { items } = await apiGet('/api/admin/model-report', query)

  const sortable = new Set([
    'modelId',
    'answers',
    'missAnswer',
    'missAnswerRate',
    'thumbUp',
    'thumbUpRate',
    'thumbDown',
    'thumbDownRate',
    'avgLatency',
    'avgInputTokens',
    'avgOutputTokens',
    'avgCost'
  ])

  const rows = [...(items || [])].sort((a, b) => {
    const field = sortable.has(sortBy) ? sortBy : 'modelId'
    const av = a?.[field]
    const bv = b?.[field]

    if (typeof av === 'number' || typeof bv === 'number') {
      const na = Number(av || 0)
      const nb = Number(bv || 0)
      return sortDir === 'asc' ? na - nb : nb - na
    }

    const sa = String(av || '').toLowerCase()
    const sb = String(bv || '').toLowerCase()
    if (sa === sb) return 0
    if (sortDir === 'asc') return sa < sb ? -1 : 1
    return sa > sb ? -1 : 1
  })

  const makeSortHeader = (label, key) => {
    const nextDir = sortBy === key && sortDir === 'asc' ? 'desc' : 'asc'
    const arrow = sortBy === key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''
    const params = new URLSearchParams()
    if (p?.from) params.set('from', p.from)
    if (p?.to) params.set('to', p.to)
    params.set('sortBy', key)
    params.set('sortDir', nextDir)
    params.set('page', '1')
    params.set('pageSize', String(pageSize))
    return (
      <Link href={`/reports/model?${params.toString()}`} className='hover:underline'>
        {label}{arrow}
      </Link>
    )
  }

  const total = rows.length
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const start = (page - 1) * pageSize
  const pagedRows = rows.slice(start, start + pageSize)

  return (
    <AdminShell title='AI Model Report'>
      <SortPreferenceSync storageKey='model-report-table' sortKeys={['sortBy', 'sortDir']} />

      <form className='card mb-4 flex items-end gap-3'>
        <div>
          <label className='text-xs text-slate-500'>From</label>
          <input name='from' type='date' defaultValue={p?.from || ''} className='rounded-lg border border-slate-300 px-3 py-2' />
        </div>
        <div>
          <label className='text-xs text-slate-500'>To</label>
          <input name='to' type='date' defaultValue={p?.to || ''} className='rounded-lg border border-slate-300 px-3 py-2' />
        </div>
        <button className='rounded-lg bg-brand text-white px-3 py-2 font-semibold'>Apply</button>
      </form>

      <SimpleTable
        columns={[
          { key: 'modelId', header: makeSortHeader('Model', 'modelId') },
          { key: 'answers', header: makeSortHeader('No. of answer', 'answers') },
          { key: 'missAnswer', header: makeSortHeader('No. of miss answer', 'missAnswer') },
          { key: 'missAnswerRate', header: makeSortHeader('% of miss answer', 'missAnswerRate'), render: v => `${((v || 0) * 100).toFixed(1)}%` },
          { key: 'thumbUp', header: makeSortHeader('No. of ThumbUp', 'thumbUp') },
          { key: 'thumbUpRate', header: makeSortHeader('% of ThumbUp', 'thumbUpRate'), render: v => `${((v || 0) * 100).toFixed(1)}%` },
          { key: 'thumbDown', header: makeSortHeader('No. of ThumbDown', 'thumbDown') },
          { key: 'thumbDownRate', header: makeSortHeader('% of ThumbDown', 'thumbDownRate'), render: v => `${((v || 0) * 100).toFixed(1)}%` },
          { key: 'avgLatency', header: makeSortHeader('Avg. Latency (s)', 'avgLatency'), render: v => ((v || 0) / 1000).toFixed(2) },
          { key: 'avgInputTokens', header: makeSortHeader('Avg. InputTokens', 'avgInputTokens'), render: v => Math.round(v || 0) },
          { key: 'avgOutputTokens', header: makeSortHeader('Avg. OutputTokens', 'avgOutputTokens'), render: v => Math.round(v || 0) },
          { key: 'avgCost', header: makeSortHeader('Avg. Cost', 'avgCost'), render: v => `$${(v || 0).toFixed(6)}` }
        ]}
        rows={pagedRows}
      />

      <ListPagination
        basePath='/reports/model'
        searchParams={p}
        page={page}
        pageSize={pageSize}
        total={total}
        totalPages={totalPages}
      />
    </AdminShell>
  )
}
