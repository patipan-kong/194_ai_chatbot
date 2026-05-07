'use client'

import ModalShell from '@/components/modal-shell'

export default function ConfirmModal({ title, message, onCancel, onConfirm, confirmLabel = 'Confirm', busy = false }) {
  return (
    <ModalShell title={title} onClose={onCancel} maxWidth='max-w-md'>
      <p className='text-sm text-slate-700'>{message}</p>
      <div className='flex justify-end gap-2'>
        <button type='button' onClick={onCancel} className='rounded-md border border-slate-300 px-3 py-2 text-sm' disabled={busy}>
          Cancel
        </button>
        <button type='button' onClick={onConfirm} className='rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700' disabled={busy}>
          {confirmLabel}
        </button>
      </div>
    </ModalShell>
  )
}
