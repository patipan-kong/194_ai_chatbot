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
      formData.set('from', filters.from || '')
      formData.set('to', filters.to || '')
      await recalculateInteractionCosts(formData)
      router.refresh()
    })
  }

  return (
    <div className='card mb-4 flex justify-end'>
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
