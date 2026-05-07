import AdminShell from '@/components/admin-shell'
import SimpleTable from '@/components/simple-table'
import ListPagination from '@/components/list-pagination'
import { apiGet } from '@/lib/admin-api'

export default async function AuditLogsPage({ searchParams }) {
  const p = await searchParams
  const page = Math.max(1, Number.parseInt(String(p?.page || '1'), 10) || 1)
  const pageSize = Math.max(1, Number.parseInt(String(p?.pageSize || '20'), 10) || 20)
  const params = new URLSearchParams()
  if (p?.from) params.set('from', p.from)
  if (p?.to) params.set('to', p.to)
  if (p?.entityType) params.set('entityType', p.entityType)
  if (p?.action) params.set('action', p.action)
  params.set('page', String(page))
  params.set('pageSize', String(pageSize))
  const query = `?${params.toString()}`
  const { items, total = 0, totalPages = 1 } = await apiGet('/api/admin/audit-logs', query)

  return (
    <AdminShell title='Audit Logs'>
      <SimpleTable
        columns={[
          { key: 'id', header: 'ID' },
          { key: 'action', header: 'Action' },
          { key: 'entityType', header: 'Entity' },
          { key: 'entityId', header: 'Entity ID' },
          { key: 'changedBy', header: 'Changed By' },
          { key: 'createdAt', header: 'At', render: v => new Date(v).toLocaleString() }
        ]}
        rows={items || []}
      />

      <ListPagination
        basePath='/audit-logs'
        searchParams={p}
        page={page}
        pageSize={pageSize}
        total={total}
        totalPages={totalPages}
      />
    </AdminShell>
  )
}
