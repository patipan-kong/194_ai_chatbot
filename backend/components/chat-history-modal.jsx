'use client'

import { useState, useTransition, useRef, useEffect } from 'react'
import ModalShell from '@/components/modal-shell'

async function fetchChatHistory(interactionId) {
  const res = await fetch(`/api/proxy/interactions/${interactionId}/chat-history`)
  if (!res.ok) throw new Error('Failed to load chat history')
  return res.json()
}

function ChatBubble({ msg, isCurrent }) {
  const isThumbMissing = msg.pendingReview?.source === 'UNKNOWN_ANSWER'
  return (
    <div className='flex flex-col gap-0.5 mb-4'>
      {/* User */}
      <div className='flex justify-end'>
        <div className='max-w-[75%] rounded-2xl rounded-tr-sm bg-brand text-white px-4 py-2 text-sm whitespace-pre-wrap'>
          {msg.userQuestion}
        </div>
      </div>

      {/* AI */}
      <div className='flex justify-start items-end gap-2'>
        <div className={`max-w-[75%] rounded-2xl rounded-tl-sm px-4 py-2 text-sm whitespace-pre-wrap ${isThumbMissing ? 'bg-orange-50 border border-orange-200' : 'bg-slate-100 text-slate-800'}`}>
          {msg.aiResponse}
        </div>
      </div>

      {/* meta row */}
      <div className='flex items-center gap-2 px-1 text-xs text-slate-400'>
        <span>{new Date(msg.createdAt).toLocaleString()}</span>
        {msg.isThumbUp === true && <span className='text-green-600'>👍</span>}
        {msg.isThumbUp === false && <span className='text-red-600'>👎</span>}
        {isThumbMissing && <span className='rounded px-1.5 py-0.5 bg-orange-100 text-orange-700 font-medium'>Missing</span>}
        <span className='ml-auto text-[10px]'>#{msg.id}</span>
      </div>
    </div>
  )
}

export default function ChatHistoryModal({ interactionId }) {
  const [open, setOpen] = useState(false)
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [isPending, startTransition] = useTransition()
  const bottomRef = useRef(null)

  const onOpen = () => {
    setOpen(true)
    if (data) return
    startTransition(async () => {
      try {
        const result = await fetchChatHistory(interactionId)
        setData(result)
      } catch (e) {
        setError(e.message)
      }
    })
  }

  useEffect(() => {
    if (open && data) {
      setTimeout(() => {
        const el = document.getElementById(`msg-${interactionId}`)
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }, 80)
    }
  }, [open, data, interactionId])

  return (
    <>
      <button
        type='button'
        onClick={onOpen}
        className='rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-50'
      >
        View Chat History
      </button>

      {open ? (
        <ModalShell
          title={`Chat History — User ${data?.userId || '...'} (${(data?.items || []).length} messages)`}
          onClose={() => setOpen(false)}
          maxWidth='max-w-2xl'
        >
          <div className='h-[60vh] overflow-y-auto px-1 py-2 space-y-0'>
            {isPending && !data && (
              <p className='text-sm text-slate-500 text-center py-8'>Loading…</p>
            )}
            {error && (
              <p className='text-sm text-red-600 text-center py-8'>{error}</p>
            )}
            {data?.items?.map(msg => (
              <div key={msg.id} id={`msg-${msg.id}`}>
                <ChatBubble msg={msg} isCurrent={msg.id === interactionId} />
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
        </ModalShell>
      ) : null}
    </>
  )
}
