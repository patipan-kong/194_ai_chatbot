'use client'

export default function ModalShell({ title, children, onClose, maxWidth = 'max-w-2xl' }) {
  return (
    <div className='fixed inset-0 z-50 grid place-items-center bg-black/40 p-4'>
      <div className={`w-full ${maxWidth} max-h-[90dvh] rounded-2xl bg-white p-4 shadow-xl flex flex-col`}>
        <div className='flex items-center justify-between mb-3'>
          <h3 className='text-sm font-semibold'>{title}</h3>
          <button type='button' onClick={onClose} className='rounded-md border border-slate-300 px-2 py-1 text-xs'>
            Close
          </button>
        </div>
        <div className='overflow-y-auto pr-1'>
          {children}
        </div>
      </div>
    </div>
  )
}
