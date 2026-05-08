import AdminShell from '@/components/admin-shell'
import FlashMessage from '@/components/flash-message'
import SimpleTable from '@/components/simple-table'
import ListPagination from '@/components/list-pagination'
import { createCategory, updateCategory } from '@/actions/categories'
import { apiGet } from '@/lib/admin-api'
import { redirect } from 'next/navigation'
import CategoryDeleteAction from '@/components/category-delete-action'

export default async function CategoriesPage({ searchParams }) {
  const p = await searchParams
  const page = Math.max(1, Number.parseInt(String(p?.page || '1'), 10) || 1)
  const pageSize = Math.max(1, Number.parseInt(String(p?.pageSize || '20'), 10) || 20)
  const name = String(p?.name || '')
  const audience = String(p?.audience || 'all')
  const flash = String(p?.flash || '')
  const flashType = String(p?.flashType || 'success')

  const params = new URLSearchParams()
  params.set('page', String(page))
  params.set('pageSize', String(pageSize))
  if (name) params.set('name', name)
  if (audience) params.set('audience', audience)

  const { items = [], total = 0, totalPages = 1 } = await apiGet('/api/admin/categories', `?${params.toString()}`)

  async function onCreate(formData) {
    'use server'
    const result = await createCategory(formData)
    const next = new URLSearchParams()
    next.set('flash', result?.message || 'Saved')
    next.set('flashType', result?.ok ? 'success' : 'error')
    redirect(`/categories?${next.toString()}`)
  }

  async function onUpdate(formData) {
    'use server'
    const result = await updateCategory(formData)
    const next = new URLSearchParams()
    next.set('flash', result?.message || 'Saved')
    next.set('flashType', result?.ok ? 'success' : 'error')
    if (name) next.set('name', name)
    if (audience) next.set('audience', audience)
    next.set('page', String(page))
    next.set('pageSize', String(pageSize))
    redirect(`/categories?${next.toString()}`)
  }

  return (
    <AdminShell title='Categories'>
      <FlashMessage message={flash} type={flashType} />

      <form className='card mb-4 grid grid-cols-5 gap-3 items-end'>
        <div>
          <label className='text-xs text-slate-500'>Name</label>
          <input name='name' defaultValue={name} className='w-full rounded-lg border border-slate-300 px-3 py-2' />
        </div>
        <div>
          <label className='text-xs text-slate-500'>Audience</label>
          <select name='audience' defaultValue={audience} className='w-full rounded-lg border border-slate-300 px-3 py-2'>
            <option value='all'>All</option>
            <option value='public'>Public</option>
            <option value='member'>Member</option>
          </select>
        </div>
        <button className='rounded-lg bg-slate-700 text-white px-3 py-2 font-semibold'>Apply Filter</button>
      </form>

      <form action={onCreate} className='card mb-4 grid grid-cols-4 gap-3 items-end'>
        <div>
          <label className='text-xs text-slate-500'>New Category Name</label>
          <input name='name' className='w-full rounded-lg border border-slate-300 px-3 py-2' required />
        </div>
        <label className='inline-flex items-center gap-2 text-sm'>
          <input type='checkbox' name='for194Member' className='h-4 w-4' />
          for194Member
        </label>
        <button className='rounded-lg bg-brand text-white px-3 py-2 font-semibold'>Create Category</button>
      </form>

      <SimpleTable
        columns={[
          { key: 'id', header: 'ID' },
          { key: 'name', header: 'Name' },
          { key: 'for194Member', header: 'Audience', render: v => (v ? 'Member' : 'Public') },
          { key: '_count', header: 'KB Rows', render: v => v?.knowledgeBase || 0 },
          {
            key: 'actions',
            header: 'Actions',
            render: (_, row) => (
              <div className='flex items-center gap-2'>
                <form action={onUpdate} className='flex items-center gap-2'>
                  <input type='hidden' name='id' value={row.id} />
                  <input
                    name='name'
                    defaultValue={row.name}
                    className='w-48 rounded-md border border-slate-300 px-2 py-1 text-xs'
                    required
                  />
                  <label className='inline-flex items-center gap-1 text-xs'>
                    <input type='checkbox' name='for194Member' defaultChecked={Boolean(row.for194Member)} className='h-3.5 w-3.5' />
                    member
                  </label>
                  <button className='rounded-md border border-slate-300 px-2 py-1 text-xs'>Save</button>
                </form>
                <CategoryDeleteAction categoryId={row.id} disabled={(row?._count?.knowledgeBase || 0) > 0} />
              </div>
            )
          }
        ]}
        rows={items}
      />

      <ListPagination
        basePath='/categories'
        searchParams={p}
        page={page}
        pageSize={pageSize}
        total={total}
        totalPages={totalPages}
      />
    </AdminShell>
  )
}
