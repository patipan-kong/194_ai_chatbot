import AdminShell from '@/components/admin-shell'
import StatCard from '@/components/stat-card'
import SimpleTable from '@/components/simple-table'
import SortPreferenceSync from '@/components/sort-preference-sync'
import DashboardTrendsChart from '@/components/dashboard-trends-chart'
import ListPagination from '@/components/list-pagination'
import { apiGet } from '@/lib/admin-api'
import Link from 'next/link'

export default async function DashboardPage({ searchParams }) {
  const p = await searchParams
  const sortBy = String(p?.sortBy || 'label')
  const sortDir = String(p?.sortDir || 'asc').toLowerCase() === 'desc' ? 'desc' : 'asc'
  const page = Math.max(1, Number.parseInt(String(p?.page || '1'), 10) || 1)
  const pageSize = Math.max(1, Number.parseInt(String(p?.pageSize || '20'), 10) || 20)
  const trendParams = new URLSearchParams()
  if (p?.from) trendParams.set('from', p.from)
  if (p?.to) trendParams.set('to', p.to)
  const trendsQuery = trendParams.toString() ? `?${trendParams.toString()}` : ''
  const [data, trendData] = await Promise.all([
    apiGet('/api/admin/dashboard'),
    apiGet('/api/admin/dashboard/trends', trendsQuery)
  ])
  const sortable = new Set(['label', 'thumbUpRate', 'avgCost', 'avgLatency', 'unknownAnswerRate'])

  const rows = [...(data.modelRouting || [])].sort((a, b) => {
    const field = sortable.has(sortBy) ? sortBy : 'label'
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
      <Link href={`/dashboard?${params.toString()}`} className='hover:underline'>
        {label}{arrow}
      </Link>
    )
  }

  const total = rows.length
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const start = (page - 1) * pageSize
  const pagedRows = rows.slice(start, start + pageSize)

  return (
    <AdminShell title='Dashboard'>
      <SortPreferenceSync storageKey='dashboard-model-table' sortKeys={['sortBy', 'sortDir']} />

      {(data.alerts || []).length > 0 && (
        <section className='mb-4 space-y-2'>
          {(data.alerts || []).map(item => (
            <div
              key={item.code}
              className={`rounded-md border px-3 py-2 text-sm ${item.severity === 'critical' ? 'bg-red-50 border-red-300 text-red-800' : 'bg-amber-50 border-amber-300 text-amber-800'}`}
            >
              {item.message}
            </div>
          ))}
        </section>
      )}

      <section className='card mb-6'>
        <div className='flex items-end justify-between gap-3 mb-3 flex-wrap'>
          <div>
            <div className='text-sm font-semibold text-slate-800'>Daily Trend (Questions / Thumb Down / Missed)</div>
            <div className='text-xs text-slate-500'>Line chart from /api/admin/dashboard/trends</div>
          </div>
          <form className='flex items-end gap-2'>
            <input type='hidden' name='sortBy' value={sortBy} />
            <input type='hidden' name='sortDir' value={sortDir} />
            <div>
              <label className='block text-xs text-slate-500 mb-1'>From</label>
              <input name='from' type='date' defaultValue={p?.from || ''} className='rounded-md border border-slate-300 px-2 py-1.5 text-sm' />
            </div>
            <div>
              <label className='block text-xs text-slate-500 mb-1'>To</label>
              <input name='to' type='date' defaultValue={p?.to || ''} className='rounded-md border border-slate-300 px-2 py-1.5 text-sm' />
            </div>
            <button className='rounded-md bg-slate-800 text-white px-3 py-2 text-sm font-semibold'>Apply</button>
          </form>
        </div>
        <DashboardTrendsChart items={trendData?.items || []} />
      </section>

      <section className='grid grid-cols-4 gap-4 mb-6'>
        <StatCard label='Today Questions' value={data.today.questions} />
        <StatCard label='Today Thumb Up' value={data.today.thumbUp} />
        <StatCard label='Today Thumb Down' value={data.today.thumbDown} />
        <StatCard label='Pending Review' value={data.today.pendingReview} />
      </section>

      <section className='grid grid-cols-4 gap-4 mb-6'>
        <StatCard label='Month Questions' value={data.month.questions} />
        <StatCard label='Month Thumb Up' value={data.month.thumbUp} />
        <StatCard label='Month Thumb Down' value={data.month.thumbDown} />
        <StatCard label='Month Pending Review' value={data.month.pendingReview} />
      </section>

      <section className='grid grid-cols-3 gap-4 mb-6'>
        <StatCard label='Daily Cost' value={`$${(data.cost.daily || 0).toFixed(4)}`} />
        <StatCard label='Monthly Cost' value={`$${(data.cost.monthly || 0).toFixed(4)}`} />
        <StatCard label='Cost / Conversation' value={`$${(data.cost.perConversation || 0).toFixed(4)}`} />
      </section>

      <SimpleTable
        columns={[
          { key: 'label', header: makeSortHeader('Model', 'label') },
          { key: 'thumbUpRate', header: makeSortHeader('Thumb Up Rate', 'thumbUpRate'), render: v => `${((v || 0) * 100).toFixed(1)}%` },
          { key: 'avgCost', header: makeSortHeader('Avg Cost', 'avgCost'), render: v => `$${(v || 0).toFixed(5)}` },
          { key: 'avgLatency', header: makeSortHeader('Avg Latency (ms)', 'avgLatency'), render: v => Math.round(v || 0) },
          { key: 'unknownAnswerRate', header: makeSortHeader('Unknown Rate', 'unknownAnswerRate'), render: v => `${((v || 0) * 100).toFixed(1)}%` }
        ]}
        rows={pagedRows}
      />

      <ListPagination
        basePath='/dashboard'
        searchParams={p}
        page={page}
        pageSize={pageSize}
        total={total}
        totalPages={totalPages}
      />
    </AdminShell>
  )
}
