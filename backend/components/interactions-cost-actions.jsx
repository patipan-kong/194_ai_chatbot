'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { recalculateInteractionCosts } from '@/actions/interactions'

export default function InteractionsCostActions({ filters }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const onRecalculate = () => {
    startTransition(async () => {
      const formData = new FormData()
      formData.set('modelId', filters.modelId || '')
      formData.set('question', filters.question || '')
      formData.set('isThumbUp', filters.isThumbUp || '')
      formData.set('source', filters.source || '')
      formData.set('from', filters.from || '')
      formData.set('to', filters.to || '')
      await recalculateInteractionCosts(formData)
      router.refresh()
    })
  }

  const exportHref = (() => {
    const qs = new URLSearchParams()
    if (filters.modelId) qs.set('modelId', filters.modelId)
    if (filters.question) qs.set('question', filters.question)
    if (filters.isThumbUp) qs.set('isThumbUp', filters.isThumbUp)
    if (filters.source) qs.set('source', filters.source)
    if (filters.from) qs.set('from', filters.from)
    if (filters.to) qs.set('to', filters.to)
    return `/api/proxy/interactions/export?${qs.toString()}`
  })()

  return (
    <div className='card mb-4 flex justify-end gap-2'>
      <a
        href={exportHref}
        download
        className='rounded-lg border border-slate-300 bg-white text-slate-700 px-3 py-2 font-semibold hover:bg-slate-50'
      >
        Export CSV
      </a>
      <button
        type='button'
        onClick={onRecalculate}
        className='rounded-lg bg-slate-800 text-white px-3 py-2 font-semibold disabled:opacity-60'
        disabled={isPending}
      >
        {isPending ? 'Calculating...' : 'Calculate Cost'}
      </button>
    </div>
  )
}
