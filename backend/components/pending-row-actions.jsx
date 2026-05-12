'use client'

import { useState, useTransition } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { askAiSuggestion, promotePendingToKb, updatePendingStatus } from '@/actions/pending'
import ModalShell from '@/components/modal-shell'

export default function PendingRowActions({ row, models = [], defaultModel = '' }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const suggestionModels = models.filter(model => Number(model?.rating?.helpfulness) >= 5)
  const [isStatusOpen, setIsStatusOpen] = useState(false)
  const [isPromoteOpen, setIsPromoteOpen] = useState(false)
  const [selectedModel, setSelectedModel] = useState(
    suggestionModels.find(model => model.id === defaultModel)?.id || suggestionModels?.[0]?.id || ''
  )
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [suggestionPrompt, setSuggestionPrompt] = useState('You are helping an admin draft a knowledge-base answer. Keep it factual and easy to understand.')
  const [answerStyle, setAnswerStyle] = useState('long')
  const [answerDraft, setAnswerDraft] = useState(row.aiResponse || '')
  const [suggestion, setSuggestion] = useState('')
  const [suggestionMeta, setSuggestionMeta] = useState('')
  const [suggestionError, setSuggestionError] = useState('')
  const [isPending, startTransition] = useTransition()

  const applyFlash = (message) => {
    const params = new URLSearchParams(searchParams?.toString() || '')
    params.set('flash', message)
    router.replace(`${pathname}?${params.toString()}`)
    router.refresh()
  }

  const onSaveStatus = (formData) => {
    startTransition(async () => {
      const result = await updatePendingStatus(formData)
      setIsStatusOpen(false)
      applyFlash(result?.message || `Pending #${row.id} status updated`)
    })
  }

  const onPromote = (formData) => {
    startTransition(async () => {
      const result = await promotePendingToKb(formData)
      setIsPromoteOpen(false)
      applyFlash(result?.message || `Pending #${row.id} promoted to KB`)
    })
  }

  const onSuggest = () => {
    startTransition(async () => {
      setSuggestionError('')
      setSuggestion('')
      if (!selectedModel) {
        setSuggestionError('No model available with helpfulness >= 4')
        return
      }
      const fd = new FormData()
      fd.set('question', String(row.question || ''))
      fd.set('model', selectedModel)
      fd.set('prompt', suggestionPrompt)
      fd.set('answerStyle', answerStyle)
      const result = await askAiSuggestion(fd)
      if (result?.error) {
        setSuggestionError(result.error)
        return
      }
      setSuggestion(result?.suggestion || '')
      setSuggestionMeta(result?.model ? `Suggested by ${result.model}` : '')
    })
  }

  return (
    <>
      <div className='flex gap-2'>
        <button type='button' onClick={() => setIsStatusOpen(true)} className='rounded-md border border-slate-300 px-2 py-1 text-xs' disabled={isPending}>
          Update Status
        </button>
        <button type='button' onClick={() => setIsPromoteOpen(true)} className='rounded-md border border-brand px-2 py-1 text-xs text-brand' disabled={isPending}>
          Send to KB Review
        </button>
      </div>

      {isStatusOpen ? (
        <ModalShell title={`Update Pending #${row.id}`} onClose={() => setIsStatusOpen(false)} maxWidth='max-w-md'>
          <form action={onSaveStatus} className='space-y-3'>
            <input type='hidden' name='id' value={row.id} />
            <div>
              <label className='text-xs text-slate-500'>Status</label>
              <select name='status' defaultValue={row.status} className='w-full rounded-md border border-slate-300 px-3 py-2 text-sm'>
                <option value='PENDING'>PENDING</option>
                <option value='PROCESSING'>PROCESSING</option>
                <option value='COMPLETED'>COMPLETED</option>
                <option value='IGNORED'>IGNORED</option>
              </select>
            </div>
            <div>
              <label className='text-xs text-slate-500'>Review Note</label>
              <textarea
                name='reviewNote'
                defaultValue={row.reviewNote || ''}
                rows={3}
                className='w-full rounded-md border border-slate-300 px-3 py-2 text-sm'
                placeholder='Optional note for reviewer decision'
              />
            </div>
            <div className='flex justify-end gap-2'>
              <button type='button' onClick={() => setIsStatusOpen(false)} className='rounded-md border border-slate-300 px-3 py-2 text-sm' disabled={isPending}>
                Cancel
              </button>
              <button type='submit' className='rounded-md bg-brand text-white px-3 py-2 text-sm' disabled={isPending}>
                Save
              </button>
            </div>
          </form>
        </ModalShell>
      ) : null}

      {isPromoteOpen ? (
        <ModalShell title={`Send Pending #${row.id} to KB Review`} onClose={() => setIsPromoteOpen(false)} maxWidth='max-w-3xl'>
          <form action={onPromote} className='space-y-3'>
            <input type='hidden' name='id' value={row.id} />

            <div>
              <label className='text-xs text-slate-500'>Category</label>
              <input name='category' defaultValue='General' className='w-full rounded-md border border-slate-300 px-3 py-2 text-sm' required />
            </div>
            <div>
              <label className='text-xs text-slate-500'>Question</label>
              <input name='question' defaultValue={row.question || ''} className='w-full rounded-md border border-slate-300 px-3 py-2 text-sm' required />
            </div>
            <div>
              <label className='text-xs text-slate-500'>Answer Draft</label>
              <textarea name='answer' value={answerDraft} onChange={e => setAnswerDraft(e.target.value)} className='w-full rounded-md border border-slate-300 px-3 py-2 text-sm' rows={5} required />
            </div>

            <div className='rounded-md border border-slate-200 bg-slate-50 p-3 space-y-2'>
              <div className='text-xs font-semibold text-slate-700'>Ask AI Suggestion</div>
              <div className='grid grid-cols-[1fr_auto] gap-2 items-start'>
                <div>
                  <label className='text-xs text-slate-500'>Model</label>
                  <select value={selectedModel} onChange={e => setSelectedModel(e.target.value)} className='w-full rounded-md border border-slate-300 px-3 py-2 text-sm' disabled={!suggestionModels.length}>
                    {suggestionModels.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                  </select>
                  <button
                    type='button'
                    className='mt-1 text-xs text-brand underline'
                    onClick={() => setShowAdvanced(prev => !prev)}
                  >
                    {showAdvanced ? 'Hide advanced' : 'Advanced'}
                  </button>
                </div>
                <button type='button' onClick={onSuggest} className='rounded-md border border-slate-300 px-3 py-2 text-sm bg-white self-start' disabled={isPending || !selectedModel || !row.question}>
                  ASK AI
                </button>
              </div>
              {showAdvanced ? (
                <>
                  <div>
                    <label className='text-xs text-slate-500'>Prompt</label>
                    <textarea
                      value={suggestionPrompt}
                      onChange={e => setSuggestionPrompt(e.target.value)}
                      rows={3}
                      className='w-full rounded-md border border-slate-300 px-3 py-2 text-sm'
                      placeholder='Instruction for AI suggestion'
                    />
                  </div>
                  <div>
                    <label className='text-xs text-slate-500'>Answer Style</label>
                    <select value={answerStyle} onChange={e => setAnswerStyle(e.target.value)} className='w-full rounded-md border border-slate-300 px-3 py-2 text-sm'>
                      <option value='short'>Short</option>
                      <option value='long'>Long</option>
                    </select>
                  </div>
                </>
              ) : null}
              {!suggestionModels.length ? <div className='text-xs text-amber-700'>No model with helpfulness &gt;= 4.</div> : null}
              {suggestionError ? <div className='text-xs text-red-600'>{suggestionError}</div> : null}
              {suggestion ? (
                <div className='rounded-md border border-slate-200 bg-white p-3'>
                  {suggestionMeta ? <div className='text-[11px] text-slate-500 mb-1'>{suggestionMeta}</div> : null}
                  <div className='max-h-64 overflow-y-auto rounded border border-slate-100 bg-slate-50 p-2 text-sm whitespace-pre-wrap break-words text-slate-700'>
                    {suggestion}
                  </div>
                  <div className='mt-2'>
                    <button type='button' onClick={() => setAnswerDraft(suggestion)} className='rounded-md border border-brand px-2 py-1 text-xs text-brand'>
                      Use Suggestion
                    </button>
                  </div>
                </div>
              ) : null}
            </div>

            <div className='flex justify-end gap-2'>
              <button type='button' onClick={() => setIsPromoteOpen(false)} className='rounded-md border border-slate-300 px-3 py-2 text-sm' disabled={isPending}>
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
