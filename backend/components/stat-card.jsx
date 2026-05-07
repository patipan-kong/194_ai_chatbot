export default function StatCard({ label, value, helper }) {
  return (
    <div className='card'>
      <p className='text-xs uppercase tracking-wide text-slate-500'>{label}</p>
      <p className='mt-2 text-2xl font-semibold'>{value}</p>
      {helper ? <p className='mt-1 text-xs text-slate-500'>{helper}</p> : null}
    </div>
  )
}
