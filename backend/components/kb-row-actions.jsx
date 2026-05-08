'use client'

import { useState, useTransition } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { deleteKnowledgeBase, restoreKnowledgeBase, toggleKnowledgeBaseActive, updateKnowledgeBase } from '@/actions/knowledge-base'
import ModalShell from '@/components/modal-shell'
import ConfirmModal from '@/components/confirm-modal'

export default function KbRowActions({ row, categoryOptions = [] }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isOpen, setIsOpen] = useState(false)
  const [isConfirmOpen, setIsConfirmOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const isDeleted = Boolean(row.isDelete)
  const status = String(row.status || 'DRAFT').toUpperCase()
  const toggleLabelByStatus = {
    DRAFT: 'Send Review',
    REVIEW: 'Publish',
    PUBLISHED: 'Archive',
    ARCHIVED: 'Send Review'
  }

  const applyFlash = (message) => {
    const params = new URLSearchParams(searchParams?.toString() || '')
    params.set('flash', message)
    router.replace(`${pathname}?${params.toString()}`)
    router.refresh()
  }

  const onToggleActive = () => {
    startTransition(async () => {
      const formData = new FormData()
      formData.set('id', String(row.id))
      formData.set('status', status)
      const result = await toggleKnowledgeBaseActive(formData)
      applyFlash(result?.message || `Knowledge Base #${row.id} updated`)
    })
  }

  const onDeleteConfirmed = () => {
    startTransition(async () => {
      const formData = new FormData()
      formData.set('id', String(row.id))
      const result = await deleteKnowledgeBase(formData)
      setIsConfirmOpen(false)
      applyFlash(result?.message || `Knowledge Base #${row.id} deleted`)
    })
  }

  const onSave = (formData) => {
    startTransition(async () => {
      const result = await updateKnowledgeBase(formData)
      setIsOpen(false)
      applyFlash(result?.message || `Knowledge Base #${row.id} updated`)
    })
  }

  const onRestore = () => {
    startTransition(async () => {
      const formData = new FormData()
      formData.set('id', String(row.id))
      const result = await restoreKnowledgeBase(formData)
      applyFlash(result?.message || `Knowledge Base #${row.id} restored`)
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
            <button type='button' onClick={onToggleActive} className='rounded-md border border-slate-300 px-2 py-1 text-xs' disabled={isPending}>
              {toggleLabelByStatus[status] || 'Send Review'}
            </button>
            <button type='button' onClick={() => setIsConfirmOpen(true)} className='rounded-md border border-red-300 px-2 py-1 text-xs text-red-700' disabled={isPending}>
              Delete
            </button>
          </>
        )}
      </div>

      {isOpen && !isDeleted ? (
        <ModalShell title={`Edit Knowledge Base #${row.id}`} onClose={() => setIsOpen(false)} maxWidth='max-w-3xl'>
          <form action={onSave} className='space-y-3'>
            <input type='hidden' name='id' value={row.id} />

            <div>
              <label className='text-xs text-slate-500'>Category</label>
              <select name='category' defaultValue={row.category} className='w-full rounded-md border border-slate-300 px-3 py-2 text-sm' required>
                {categoryOptions.map(item => (
                  <option key={item.id} value={item.name}>{item.name} ({item.for194Member ? 'Member' : 'Public'})</option>
                ))}
              </select>
            </div>
            <div>
              <label className='text-xs text-slate-500'>Question</label>
              <input name='question' defaultValue={row.question} className='w-full rounded-md border border-slate-300 px-3 py-2 text-sm' required />
            </div>
            <div>
              <label className='text-xs text-slate-500'>Answer</label>
              <textarea name='answer' defaultValue={row.answer} className='w-full rounded-md border border-slate-300 px-3 py-2 text-sm' rows={4} required />
            </div>
            <div>
              <label className='text-xs text-slate-500'>Full Answer (for exact match)</label>
              <textarea name='fullAnswer' defaultValue={row.fullAnswer || row.answer} className='w-full rounded-md border border-slate-300 px-3 py-2 text-sm' rows={4} required />
            </div>
            <div>
              <label className='text-xs text-slate-500'>Status</label>
              <select name='status' defaultValue={status} className='w-full rounded-md border border-slate-300 px-3 py-2 text-sm'>
                <option value='DRAFT'>DRAFT</option>
                <option value='REVIEW'>REVIEW</option>
                <option value='PUBLISHED'>PUBLISHED</option>
                <option value='ARCHIVED'>ARCHIVED</option>
              </select>
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
          message={`Delete Knowledge Base #${row.id}? This action cannot be undone.`}
          onCancel={() => setIsConfirmOpen(false)}
          onConfirm={onDeleteConfirmed}
          confirmLabel='Delete'
          busy={isPending}
        />
      ) : null}
    </>
  )
}
