function toSafeNumber(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

export default function DashboardTrendsChart({ items = [] }) {
  if (!items.length) {
    return <div className='text-sm text-slate-500'>No trend data for selected range.</div>
  }

  const width = 920
  const height = 260
  const padding = { top: 20, right: 20, bottom: 40, left: 44 }
  const chartW = width - padding.left - padding.right
  const chartH = height - padding.top - padding.bottom

  const series = [
    { key: 'questions', label: 'Questions', color: '#0284c7' },
    { key: 'thumbDown', label: 'Thumb Down', color: '#dc2626' },
    { key: 'missed', label: 'Missed', color: '#ea580c' }
  ]

  const maxValue = Math.max(
    ...items.map(i => Math.max(
      toSafeNumber(i.questions),
      toSafeNumber(i.thumbDown),
      toSafeNumber(i.missed)
    )),
    1
  )
  const stepX = items.length > 1 ? chartW / (items.length - 1) : chartW

  const points = items.map((item, idx) => {
    const x = padding.left + (idx * stepX)
    const yByKey = {
      questions: padding.top + chartH - ((toSafeNumber(item.questions) / maxValue) * chartH),
      thumbDown: padding.top + chartH - ((toSafeNumber(item.thumbDown) / maxValue) * chartH),
      missed: padding.top + chartH - ((toSafeNumber(item.missed) / maxValue) * chartH)
    }
    return { x, yByKey, item }
  })

  const linePathByKey = Object.fromEntries(series.map(s => {
    const path = points
      .map((p, idx) => `${idx === 0 ? 'M' : 'L'}${p.x.toFixed(2)} ${p.yByKey[s.key].toFixed(2)}`)
      .join(' ')
    return [s.key, path]
  }))

  return (
    <div className='w-full overflow-x-auto'>
      <svg viewBox={`0 0 ${width} ${height}`} className='min-w-[700px] w-full h-auto'>
        <rect x='0' y='0' width={width} height={height} fill='white' />

        <g>
          {series.map((s, idx) => (
            <g key={s.key} transform={`translate(${padding.left + idx * 130}, 12)`}>
              <line x1='0' y1='0' x2='18' y2='0' stroke={s.color} strokeWidth='2.5' />
              <text x='24' y='4' fontSize='11' fill='#334155'>{s.label}</text>
            </g>
          ))}
        </g>

        {[0, 0.25, 0.5, 0.75, 1].map(level => {
          const y = padding.top + (chartH * level)
          const value = Math.round(maxValue * (1 - level))
          return (
            <g key={level}>
              <line x1={padding.left} y1={y} x2={width - padding.right} y2={y} stroke='#e2e8f0' strokeWidth='1' />
              <text x={padding.left - 8} y={y + 4} textAnchor='end' fontSize='11' fill='#64748b'>{value}</text>
            </g>
          )
        })}

        <line
          x1={padding.left}
          y1={padding.top + chartH}
          x2={width - padding.right}
          y2={padding.top + chartH}
          stroke='#94a3b8'
          strokeWidth='1.5'
        />

        {series.map(s => (
          <path
            key={s.key}
            d={linePathByKey[s.key]}
            fill='none'
            stroke={s.color}
            strokeWidth='2.5'
            strokeLinejoin='round'
            strokeLinecap='round'
          />
        ))}

        {points.map((p, idx) => (
          <g key={p.item.date}>
            {series.map(s => (
              <circle key={s.key} cx={p.x} cy={p.yByKey[s.key]} r='3' fill={s.color} />
            ))}
            {idx % Math.max(1, Math.floor(points.length / 8)) === 0 || idx === points.length - 1 ? (
              <text x={p.x} y={height - 14} textAnchor='middle' fontSize='10.5' fill='#64748b'>
                {String(p.item.date).slice(5)}
              </text>
            ) : null}
          </g>
        ))}
      </svg>
    </div>
  )
}