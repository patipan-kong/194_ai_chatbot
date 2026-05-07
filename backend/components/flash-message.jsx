'use client'

import { useState } from 'react'

export default function FlashMessage({ message }) {
  const [open, setOpen] = useState(Boolean(message))
  if (!open || !message) return null

  return (
    <div className='mb-4 rounded-md border border-emerald-300 bg-emerald-50 text-emerald-800 px-3 py-2 text-sm flex items-start justify-between gap-3'>
      <span>{message}</span>
      <button
        type='button'
        className='text-emerald-700 hover:text-emerald-900 text-xs'
        onClick={() => setOpen(false)}
      >
        Dismiss
      </button>
    </div>
  )
}