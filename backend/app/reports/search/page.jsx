import AdminShell from '@/components/admin-shell'
import SimpleTable from '@/components/simple-table'
import ListPagination from '@/components/list-pagination'
import { apiGet } from '@/lib/admin-api'

export default async function SearchReportPage({ searchParams }) {
  const p = await searchParams
  const qs = new URLSearchParams()
  if (p?.from) qs.set('from', p.from)
  if (p?.to) qs.set('to', p.to)
  const query = qs.toString() ? `?${qs.toString()}` : ''
  const data = await apiGet('/api/admin/search-analytics', query)

  const pageSize = 20
  const paginate = (rows, pageParam) => {
    const page = Math.max(1, Number.parseInt(String(p?.[pageParam] || '1'), 10) || 1)
    const total = rows.length
    const totalPages = Math.max(1, Math.ceil(total / pageSize))
    const start = (page - 1) * pageSize
    return {
      page,
      total,
      totalPages,
      rows: rows.slice(start, start + pageSize)
    }
  }

  const topQuestions = paginate(data.topQuestions || [], 'topPage')
  const unansweredQuestions = paginate(data.unansweredQuestions || [], 'unansweredPage')
  const repeatedQuestions = paginate(data.repeatedQuestions || [], 'repeatedPage')
  const lowSatisfactionTopics = paginate(data.lowSatisfactionTopics || [], 'lowSatPage')

  return (
    <AdminShell title='Search Analytics'>
      <div className='space-y-6'>
        <form className='card flex items-end gap-3'>
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

        <section>
          <h3 className='font-semibold mb-2'>Top Questions</h3>
          <SimpleTable columns={[{ key: 'question', header: 'Question' }, { key: 'count', header: 'Count' }]} rows={topQuestions.rows} />
          <ListPagination
            basePath='/reports/search'
            searchParams={p}
            page={topQuestions.page}
            pageSize={pageSize}
            total={topQuestions.total}
            totalPages={topQuestions.totalPages}
            pageParam='topPage'
          />
        </section>
        <section>
          <h3 className='font-semibold mb-2'>Unanswered Questions</h3>
          <SimpleTable columns={[{ key: 'question', header: 'Question' }]} rows={unansweredQuestions.rows} />
          <ListPagination
            basePath='/reports/search'
            searchParams={p}
            page={unansweredQuestions.page}
            pageSize={pageSize}
            total={unansweredQuestions.total}
            totalPages={unansweredQuestions.totalPages}
            pageParam='unansweredPage'
          />
        </section>

        <section>
          <h3 className='font-semibold mb-2'>Repeated Questions</h3>
          <SimpleTable columns={[{ key: 'question', header: 'Question' }, { key: 'count', header: 'Count' }]} rows={repeatedQuestions.rows} />
          <ListPagination
            basePath='/reports/search'
            searchParams={p}
            page={repeatedQuestions.page}
            pageSize={pageSize}
            total={repeatedQuestions.total}
            totalPages={repeatedQuestions.totalPages}
            pageParam='repeatedPage'
          />
        </section>

        <section>
          <h3 className='font-semibold mb-2'>Low Satisfaction Topics</h3>
          <SimpleTable
            columns={[
              { key: 'question', header: 'Question' },
              { key: 'count', header: 'Count' },
              { key: 'down', header: 'Thumb Down' },
              { key: 'downRate', header: 'Down Rate', render: v => `${((v || 0) * 100).toFixed(1)}%` }
            ]}
            rows={lowSatisfactionTopics.rows}
          />
          <ListPagination
            basePath='/reports/search'
            searchParams={p}
            page={lowSatisfactionTopics.page}
            pageSize={pageSize}
            total={lowSatisfactionTopics.total}
            totalPages={lowSatisfactionTopics.totalPages}
            pageParam='lowSatPage'
          />
        </section>
      </div>
    </AdminShell>
  )
}
