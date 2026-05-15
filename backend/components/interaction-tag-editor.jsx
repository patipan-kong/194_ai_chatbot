'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

const PRESET_TAGS = ['billing', 'bug', 'complaint', 'feature-request', 'shipping', 'returns', 'account', 'other']

export default function InteractionTagEditor({ interactionId, initialTags = [] }) {
  const router = useRouter()
  const [tags, setTags] = useState(initialTags)
  const [input, setInput] = useState('')
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState(null)

  const addTag = tag => {
    const t = tag.trim().toLowerCase()
    if (!t || t.length > 50 || tags.includes(t) || tags.length >= 10) return
    setTags(prev => [...prev, t])
    setInput('')
  }

  const removeTag = tag => setTags(prev => prev.filter(t => t !== tag))

  const onKeyDown = e => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      addTag(input)
    }
  }

  const save = () => {
    setError(null)
    startTransition(async () => {
      const res = await fetch(`/api/proxy/interactions/${interactionId}/tags`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tags })
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error || 'Save failed')
        return
      }
      router.refresh()
    })
  }

  return (
    <div className='card space-y-3'>
      <p className='text-xs text-slate-500'>Tags</p>

      <div className='flex flex-wrap gap-1.5'>
        {tags.map(tag => (
          <span key={tag} className='inline-flex items-center gap-1 rounded-full bg-blue-100 text-blue-700 px-2.5 py-0.5 text-xs font-medium'>
            {tag}
            <button
              type='button'
              onClick={() => removeTag(tag)}
              className='hover:text-blue-900 leading-none'
              aria-label={`Remove ${tag}`}
            >
              ×
            </button>
          </span>
        ))}
        {tags.length === 0 && <span className='text-slate-400 text-xs'>No tags</span>}
      </div>

      <div className='flex gap-2 flex-wrap'>
        {PRESET_TAGS.filter(t => !tags.includes(t)).map(t => (
          <button
            key={t}
            type='button'
            onClick={() => addTag(t)}
            className='rounded-full border border-slate-300 text-slate-600 px-2.5 py-0.5 text-xs hover:bg-slate-100'
          >
            + {t}
          </button>
        ))}
      </div>

      <div className='flex gap-2'>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder='Custom tag (Enter to add)'
          className='flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm'
          maxLength={50}
        />
        <button
          type='button'
          onClick={() => addTag(input)}
          className='rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100'
        >
          Add
        </button>
        <button
          type='button'
          onClick={save}
          disabled={isPending}
          className='rounded-lg bg-brand text-white px-3 py-1.5 text-sm font-semibold disabled:opacity-60'
        >
          {isPending ? 'Saving…' : 'Save'}
        </button>
      </div>

      {error && <p className='text-xs text-red-600'>{error}</p>}
    </div>
  )
}
