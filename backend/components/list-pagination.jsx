import Link from 'next/link'

function normalizeSearchParams(searchParams) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(searchParams || {})) {
    if (value === undefined || value === null || value === '') continue
    if (Array.isArray(value)) {
      for (const v of value) {
        if (v === undefined || v === null || v === '') continue
        params.append(key, String(v))
      }
      continue
    }
    params.set(key, String(value))
  }
  return params
}

function buildHref(basePath, params) {
  const qs = params.toString()
  return qs ? `${basePath}?${qs}` : basePath
}

export default function ListPagination({
  basePath,
  searchParams,
  page,
  pageSize,
  total,
  totalPages,
  pageParam = 'page',
  pageSizeParam = 'pageSize'
}) {
  if (!total || totalPages <= 1) return null

  const prevPage = Math.max(1, page - 1)
  const nextPage = Math.min(totalPages, page + 1)
  const start = (page - 1) * pageSize + 1
  const end = Math.min(total, page * pageSize)

  const prevParams = normalizeSearchParams(searchParams)
  prevParams.set(pageParam, String(prevPage))
  prevParams.set(pageSizeParam, String(pageSize))

  const nextParams = normalizeSearchParams(searchParams)
  nextParams.set(pageParam, String(nextPage))
  nextParams.set(pageSizeParam, String(pageSize))

  return (
    <div className='mt-3 flex items-center justify-between gap-3 text-sm text-slate-600'>
      <div>
        Showing {start}-{end} of {total}
      </div>
      <div className='flex items-center gap-2'>
        <span>Page {page} / {totalPages}</span>
        <Link
          href={buildHref(basePath, prevParams)}
          className={`rounded border px-3 py-1 ${page <= 1 ? 'pointer-events-none opacity-50' : 'hover:bg-slate-50'}`}
          aria-disabled={page <= 1}
        >
          Prev
        </Link>
        <Link
          href={buildHref(basePath, nextParams)}
          className={`rounded border px-3 py-1 ${page >= totalPages ? 'pointer-events-none opacity-50' : 'hover:bg-slate-50'}`}
          aria-disabled={page >= totalPages}
        >
          Next
        </Link>
      </div>
    </div>
  )
}