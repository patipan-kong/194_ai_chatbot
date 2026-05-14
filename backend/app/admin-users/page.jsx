import AdminShell from '@/components/admin-shell'
import SimpleTable from '@/components/simple-table'
import AdminUserRowActions from '@/components/admin-user-row-actions'
import ListPagination from '@/components/list-pagination'
import FlashMessage from '@/components/flash-message'
import { apiGet } from '@/lib/admin-api'
import { createAdminUser } from '@/actions/admin-users'
import { redirect } from 'next/navigation'
import { requireAdminUsername } from '@/lib/admin-session'

export default async function AdminUsersPage({ searchParams }) {
  const p = await searchParams
  const currentAdminUser = await requireAdminUsername('')
  const deleted = p?.deleted || 'active'
  const page = Math.max(1, Number.parseInt(String(p?.page || '1'), 10) || 1)
  const pageSize = Math.max(1, Number.parseInt(String(p?.pageSize || '20'), 10) || 20)
  const qs = new URLSearchParams()
  if (deleted) qs.set('deleted', deleted)
  qs.set('page', String(page))
  qs.set('pageSize', String(pageSize))
  const query = `?${qs.toString()}`
  const { items, total = 0, totalPages = 1 } = await apiGet('/api/admin/admin-users', query)
  const flash = String(p?.flash || '')

  async function onCreateAdminUser(formData) {
    'use server'
    const result = await createAdminUser(formData)
    const params = new URLSearchParams()
    params.set('flash', result?.message || 'Saved')
    redirect(`/admin-users?${params.toString()}`)
  }

  return (
    <AdminShell title='Admin User Management'>
      <FlashMessage message={flash} />

      <form action={onCreateAdminUser} className='card mb-4 grid grid-cols-3 gap-3 items-end'>
        <div>
          <label className='text-xs text-slate-500'>Username</label>
          <input name='username' className='w-full rounded-lg border border-slate-300 px-3 py-2' required />
        </div>
        <div>
          <label className='text-xs text-slate-500'>Password</label>
          <input name='password' type='password' className='w-full rounded-lg border border-slate-300 px-3 py-2' required />
        </div>
        <button className='rounded-lg bg-brand text-white px-3 py-2 font-semibold'>Add Admin</button>
      </form>

      <form className='card mb-4 grid grid-cols-3 gap-3 items-end'>
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
          { key: 'username', header: 'Username' },
          { key: 'isDelete', header: 'Deleted', render: v => (v ? 'Yes' : 'No') },
          { key: 'createdAt', header: 'Created', render: v => new Date(v).toLocaleString() },
          {
            key: 'actions',
            header: 'Actions',
            render: (_, row) => <AdminUserRowActions row={row} currentAdminUser={currentAdminUser} />
          }
        ]}
        rows={items || []}
      />

      <ListPagination
        basePath='/admin-users'
        searchParams={p}
        page={page}
        pageSize={pageSize}
        total={total}
        totalPages={totalPages}
      />
    </AdminShell>
  )
}
