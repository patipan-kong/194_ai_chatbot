'use client'

import { useState, useTransition } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { updateAlertSettings } from '@/actions/alerts'

export default function AlertThresholdSettingsForm({ initial }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()
  const [dailyCostThreshold, setDailyCostThreshold] = useState(String(initial?.dailyCostThreshold ?? 5))
  const [monthlyCostThreshold, setMonthlyCostThreshold] = useState(String(initial?.monthlyCostThreshold ?? 100))
  const [pendingReviewThreshold, setPendingReviewThreshold] = useState(String(initial?.pendingReviewThreshold ?? 20))
  const [notifyTarget, setNotifyTarget] = useState(String(initial?.notifyTarget || 'dashboard'))

  const onSubmit = event => {
    event.preventDefault()
    startTransition(async () => {
      const formData = new FormData()
      formData.set('dailyCostThreshold', dailyCostThreshold)
      formData.set('monthlyCostThreshold', monthlyCostThreshold)
      formData.set('pendingReviewThreshold', pendingReviewThreshold)
      formData.set('notifyTarget', notifyTarget)
      const result = await updateAlertSettings(formData)
      const params = new URLSearchParams(searchParams?.toString() || '')
      params.set('flash', result?.message || 'Alert thresholds saved')
      router.replace(`${pathname}?${params.toString()}`)
      router.refresh()
    })
  }

  return (
    <form onSubmit={onSubmit} className='card mb-6'>
      <div className='text-sm font-semibold text-slate-800 mb-3'>Alert Threshold Settings</div>
      <div className='grid grid-cols-1 md:grid-cols-4 gap-3'>
        <label className='text-sm'>
          <div className='mb-1 text-slate-700'>Daily Cost</div>
          <input
            type='number'
            min='0'
            step='0.0001'
            value={dailyCostThreshold}
            onChange={e => setDailyCostThreshold(e.target.value)}
            className='w-full rounded-md border px-3 py-2'
          />
        </label>

        <label className='text-sm'>
          <div className='mb-1 text-slate-700'>Monthly Cost</div>
          <input
            type='number'
            min='0'
            step='0.0001'
            value={monthlyCostThreshold}
            onChange={e => setMonthlyCostThreshold(e.target.value)}
            className='w-full rounded-md border px-3 py-2'
          />
        </label>

        <label className='text-sm'>
          <div className='mb-1 text-slate-700'>Pending Review</div>
          <input
            type='number'
            min='0'
            step='1'
            value={pendingReviewThreshold}
            onChange={e => setPendingReviewThreshold(e.target.value)}
            className='w-full rounded-md border px-3 py-2'
          />
        </label>

        <label className='text-sm'>
          <div className='mb-1 text-slate-700'>Notify Target</div>
          <select
            value={notifyTarget}
            onChange={e => setNotifyTarget(e.target.value)}
            className='w-full rounded-md border px-3 py-2'
          >
            <option value='dashboard'>Dashboard</option>
          </select>
        </label>
      </div>

      <div className='mt-3 flex justify-end'>
        <button
          type='submit'
          disabled={isPending}
          className='rounded-lg bg-slate-900 text-white px-4 py-2 font-semibold disabled:opacity-60'
        >
          {isPending ? 'Saving...' : 'Save Thresholds'}
        </button>
      </div>
    </form>
  )
}