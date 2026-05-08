'use client'

import { useState, useEffect } from 'react'

const STYLE_BY_TYPE = {
  success: {
    box: 'border-emerald-300 bg-emerald-50 text-emerald-800',
    close: 'text-emerald-700 hover:text-emerald-900'
  },
  error: {
    box: 'border-red-300 bg-red-50 text-red-800',
    close: 'text-red-700 hover:text-red-900'
  }
}

export default function FlashMessage({ message, type = 'success', timeout = 5000 }) {
  const [open, setOpen] = useState(Boolean(message))

  useEffect(() => {
    if (!message) return
    setOpen(true)
    const timer = setTimeout(() => setOpen(false), timeout)
    return () => clearTimeout(timer)
  }, [message, timeout])

  if (!open || !message) return null

  const style = STYLE_BY_TYPE[type] || STYLE_BY_TYPE.success

  return (
    <div className={`mb-4 rounded-md border px-3 py-2 text-sm flex items-start justify-between gap-3 ${style.box}`}>
      <span>{message}</span>
      <button
        type='button'
        className={`text-xs ${style.close}`}
        onClick={() => setOpen(false)}
      >
        Dismiss
      </button>
    </div>
  )
}