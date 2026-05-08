'use client'

import { useState, useTransition } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import ModalShell from '@/components/modal-shell'
import { createKnowledgeBase } from '@/actions/knowledge-base'

export default function KbAddModal({ categoryOptions = [] }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  const applyFlash = (message) => {
    const params = new URLSearchParams(searchParams?.toString() || '')
    params.set('flash', message)
    router.replace(`${pathname}?${params.toString()}`)
    router.refresh()
  }

  const onSave = formData => {
    startTransition(async () => {
      const result = await createKnowledgeBase(formData)
      setOpen(false)
      applyFlash(result?.message || 'Knowledge Base created')
    })
  }

  return (
    <>
      <div className='card mb-4'>
        <button type='button' onClick={() => setOpen(true)} className='rounded-lg bg-brand text-white px-3 py-2 font-semibold' disabled={isPending}>
          Add KB
        </button>
      </div>

      {open ? (
        <ModalShell title='Add Knowledge Base' onClose={() => setOpen(false)} maxWidth='max-w-3xl'>
          <form action={onSave} className='space-y-3'>
            <div>
              <label className='text-xs text-slate-500'>Category</label>
              <select name='category' className='w-full rounded-md border border-slate-300 px-3 py-2 text-sm' required defaultValue=''>
                <option value='' disabled>Select category</option>
                {categoryOptions.map(item => (
                  <option key={item.id} value={item.name}>{item.name} ({item.for194Member ? 'Member' : 'Public'})</option>
                ))}
              </select>
            </div>
            <div>
              <label className='text-xs text-slate-500'>Question</label>
              <input name='question' className='w-full rounded-md border border-slate-300 px-3 py-2 text-sm' required />
            </div>
            <div>
              <label className='text-xs text-slate-500'>Answer</label>
              <textarea name='answer' className='w-full rounded-md border border-slate-300 px-3 py-2 text-sm' rows={4} required />
            </div>
            <div>
              <label className='text-xs text-slate-500'>Full Answer (for exact match)</label>
              <textarea name='fullAnswer' className='w-full rounded-md border border-slate-300 px-3 py-2 text-sm' rows={4} required />
            </div>
            <div>
              <label className='text-xs text-slate-500'>Status</label>
              <select name='status' defaultValue='DRAFT' className='w-full rounded-md border border-slate-300 px-3 py-2 text-sm'>
                <option value='DRAFT'>DRAFT</option>
                <option value='REVIEW'>REVIEW</option>
                <option value='PUBLISHED'>PUBLISHED</option>
                <option value='ARCHIVED'>ARCHIVED</option>
              </select>
            </div>

            <div className='flex justify-end gap-2'>
              <button type='button' onClick={() => setOpen(false)} className='rounded-md border border-slate-300 px-3 py-2 text-sm' disabled={isPending}>
                Cancel
              </button>
              <button type='submit' className='rounded-md bg-brand text-white px-3 py-2 text-sm' disabled={isPending}>
                Save
              </button>
            </div>
          </form>
        </ModalShell>
      ) : null}
    </>
  )
}
