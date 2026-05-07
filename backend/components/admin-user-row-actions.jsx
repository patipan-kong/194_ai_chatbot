'use client'

import { useState, useTransition } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { deleteAdminUser, restoreAdminUser, updateAdminUser } from '@/actions/admin-users'
import ModalShell from '@/components/modal-shell'
import ConfirmModal from '@/components/confirm-modal'

export default function AdminUserRowActions({ row, currentAdminUser = '' }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isOpen, setIsOpen] = useState(false)
  const [isConfirmOpen, setIsConfirmOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const isDeleted = Boolean(row.isDelete)
  const isCurrentUser = !isDeleted && row.username === currentAdminUser

  const applyFlash = (message) => {
    const params = new URLSearchParams(searchParams?.toString() || '')
    params.set('flash', message)
    router.replace(`${pathname}?${params.toString()}`)
    router.refresh()
  }

  const onDeleteConfirmed = () => {
    startTransition(async () => {
      const formData = new FormData()
      formData.set('id', String(row.id))
      const result = await deleteAdminUser(formData)
      setIsConfirmOpen(false)
      applyFlash(result?.message || `Admin user #${row.id} deleted`)
    })
  }

  const onSave = (formData) => {
    startTransition(async () => {
      const result = await updateAdminUser(formData)
      setIsOpen(false)
      applyFlash(result?.message || `Admin user #${row.id} updated`)
    })
  }

  const onRestore = () => {
    startTransition(async () => {
      const formData = new FormData()
      formData.set('id', String(row.id))
      const result = await restoreAdminUser(formData)
      applyFlash(result?.message || `Admin user #${row.id} restored`)
    })
  }

  return (
    <>
      <div className='flex gap-2'>
        {isDeleted ? (
          <button type='button' onClick={onRestore} className='rounded-md border border-emerald-300 px-2 py-1 text-xs text-emerald-700' disabled={isPending}>
            Restore
          </button>
        ) : (
          <>
            <button type='button' onClick={() => setIsOpen(true)} className='rounded-md border border-slate-300 px-2 py-1 text-xs' disabled={isPending}>
              Edit
            </button>
            {isCurrentUser ? (
              <span className='rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-600'>Current User</span>
            ) : (
              <button type='button' onClick={() => setIsConfirmOpen(true)} className='rounded-md border border-red-300 px-2 py-1 text-xs text-red-700' disabled={isPending}>
                Delete
              </button>
            )}
          </>
        )}
      </div>

      {isOpen && !isDeleted ? (
        <ModalShell title={`Edit Admin User #${row.id}`} onClose={() => setIsOpen(false)} maxWidth='max-w-xl'>
          <form action={onSave} className='space-y-3'>
            <input type='hidden' name='id' value={row.id} />

            <div>
              <label className='text-xs text-slate-500'>Username</label>
              <input name='username' defaultValue={row.username} className='w-full rounded-md border border-slate-300 px-3 py-2 text-sm' required />
            </div>
            <div>
              <label className='text-xs text-slate-500'>New Password (optional)</label>
              <input name='password' type='password' placeholder='Leave empty to keep current password' className='w-full rounded-md border border-slate-300 px-3 py-2 text-sm' />
            </div>

            <div className='flex justify-end gap-2'>
              <button type='button' onClick={() => setIsOpen(false)} className='rounded-md border border-slate-300 px-3 py-2 text-sm' disabled={isPending}>
                Cancel
              </button>
              <button type='submit' className='rounded-md bg-brand text-white px-3 py-2 text-sm' disabled={isPending}>
                Save
              </button>
            </div>
          </form>
        </ModalShell>
      ) : null}

      {isConfirmOpen && !isDeleted ? (
        <ConfirmModal
          title='Confirm Delete'
          message={`Delete admin user #${row.id}? This action cannot be undone.`}
          onCancel={() => setIsConfirmOpen(false)}
          onConfirm={onDeleteConfirmed}
          confirmLabel='Delete'
          busy={isPending}
        />
      ) : null}
    </>
  )
}
