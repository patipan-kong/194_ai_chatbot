'use client'

import { useState, useTransition } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import ConfirmModal from '@/components/confirm-modal'
import { deleteCategory } from '@/actions/categories'

export default function CategoryDeleteAction({ categoryId, disabled = false }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  const applyFlash = (message, type) => {
    const params = new URLSearchParams(searchParams?.toString() || '')
    params.set('flash', message)
    params.set('flashType', type)
    router.replace(`${pathname}?${params.toString()}`)
    router.refresh()
  }

  const onConfirm = () => {
    startTransition(async () => {
      const formData = new FormData()
      formData.set('id', String(categoryId))
      const result = await deleteCategory(formData)
      setOpen(false)
      applyFlash(result?.message || 'Saved', result?.ok ? 'success' : 'error')
    })
  }

  return (
    <>
      <button
        type='button'
        className='rounded-md border border-red-300 px-2 py-1 text-xs text-red-700 disabled:opacity-60'
        disabled={disabled || isPending}
        onClick={() => setOpen(true)}
      >
        Delete
      </button>

      {open ? (
        <ConfirmModal
          title='Confirm Delete Category'
          message='Delete this category? This cannot be undone.'
          onCancel={() => setOpen(false)}
          onConfirm={onConfirm}
          confirmLabel='Delete'
          busy={isPending}
        />
      ) : null}
    </>
  )
}
