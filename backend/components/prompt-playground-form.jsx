'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'

const SORT_STORAGE_KEY = 'prompt-playground-model-sort'
const SELECTED_MODELS_STORAGE_KEY = 'prompt-playground-selected-models'

function formatPrice(value) {
  if (typeof value !== 'number') return '-'
  const formatted = new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 }).format(value)
  return `$${formatted}`
}

function getRatingValue(model, key) {
  const value = Number(model?.rating?.[key])
  return Number.isFinite(value) ? value : null
}

function getTokenCost(model, key) {
  const value = Number(model?.cost?.token_1m?.[key])
  return Number.isFinite(value) ? value : null
}

function getModelTokenAvgCost(model) {
  const values = [
    getTokenCost(model, 'input'),
    getTokenCost(model, 'output'),
    getTokenCost(model, 'caching')
  ].filter(Number.isFinite)

  if (!values.length) return null
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function getDbAvgCost(modelId, modelAvgCosts) {
  const v = modelAvgCosts[modelId]
  return typeof v === 'number' && v > 0 ? v : null
}

function getEfficiencyScore(accuracy, helpfulness, speed, avgCost) {
  if (!Number.isFinite(accuracy) || !Number.isFinite(helpfulness) || !Number.isFinite(speed) || !Number.isFinite(avgCost) || avgCost <= 0) {
    return null
  }

  const weightedRating = accuracy * 0.45 + helpfulness * 0.35 + speed * 0.2
  const normalizedCost = Math.sqrt(avgCost * 100)
  if (!Number.isFinite(normalizedCost) || normalizedCost <= 0) return null
  return weightedRating / normalizedCost
}

function getAdminScore(accuracy, helpfulness, avgCost) {
  if (!Number.isFinite(accuracy) || !Number.isFinite(helpfulness) || !Number.isFinite(avgCost) || avgCost <= 0) {
    return null
  }

  const weightedRating = accuracy + helpfulness
  const normalizedCost = Math.pow(avgCost * 100, 0.2)
  if (!Number.isFinite(normalizedCost) || normalizedCost <= 0) return null
  return weightedRating / normalizedCost
}

function SortIcon({ dir }) {
  if (!dir) return <span className='ml-1 text-slate-300'>⇅</span>
  return <span className='ml-1'>{dir === 'asc' ? '↑' : '↓'}</span>
}

function normalizeResults(result) {
  if (Array.isArray(result)) return result
  if (typeof result === 'string') {
    try {
      const parsed = JSON.parse(result)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  return []
}

export default function PromptPlaygroundForm({ promptOptions = [], modelOptions = [], defaultModel = '', historyItems = [], selectedHistory = null, historyPage = 1, historyTotalPages = 1, modelAvgCosts = {} }) {
  const firstSetting = promptOptions.find(item => item.isActive) || promptOptions[0] || null
  const [settingId, setSettingId] = useState(firstSetting ? String(firstSetting.id) : '')
  const [promptTemplate, setPromptTemplate] = useState(firstSetting?.systemPromptTemplate || '')
  const [question, setQuestion] = useState('')
  const [selectedModels, setSelectedModels] = useState(() => {
    if (!modelOptions.length) return []
    if (defaultModel && modelOptions.some(item => item.modelId === defaultModel)) return [defaultModel]
    return [modelOptions[0].modelId]
  })
  const [audience, setAudience] = useState('guest')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [results, setResults] = useState([])
  const [latestHistoryId, setLatestHistoryId] = useState(null)
  const [sort, setSort] = useState({ col: 'model', dir: 'asc' })
  const [ratingFilters, setRatingFilters] = useState({
    accuracy: 'all',
    speed: 'all',
    helpfulness: 'all',
    inCost: 'all'
  })

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SORT_STORAGE_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw)
      const col = typeof parsed?.col === 'string' ? parsed.col : null
      const dir = parsed?.dir === 'asc' || parsed?.dir === 'desc' ? parsed.dir : null
      if (col && dir) {
        setSort({ col, dir })
      }
    } catch {}
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(SORT_STORAGE_KEY, JSON.stringify(sort))
    } catch {}
  }, [sort])

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SELECTED_MODELS_STORAGE_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw)
      const saved = Array.isArray(parsed) ? parsed.map(item => String(item || '')).filter(Boolean) : []
      if (!saved.length) return

      const modelIdSet = new Set(modelOptions.map(item => item.modelId))
      const validSaved = saved.filter(modelId => modelIdSet.has(modelId))
      if (validSaved.length) {
        setSelectedModels(validSaved)
      }
    } catch {}
  }, [modelOptions])

  useEffect(() => {
    const modelIdSet = new Set(modelOptions.map(item => item.modelId))
    const validSelected = selectedModels.filter(modelId => modelIdSet.has(modelId))

    if (validSelected.length !== selectedModels.length) {
      setSelectedModels(validSelected)
      return
    }

    if (!validSelected.length && modelOptions.length) {
      const fallback = defaultModel && modelIdSet.has(defaultModel)
        ? [defaultModel]
        : [modelOptions[0].modelId]
      setSelectedModels(fallback)
      return
    }

    try {
      localStorage.setItem(SELECTED_MODELS_STORAGE_KEY, JSON.stringify(validSelected))
    } catch {}
  }, [defaultModel, modelOptions, selectedModels])

  const promptMap = useMemo(() => {
    const map = new Map()
    for (const item of promptOptions) {
      map.set(String(item.id), item)
    }
    return map
  }, [promptOptions])

  const filteredModelOptions = useMemo(() => {
    const matchRange = (value, range) => {
      if (range === 'all') return true
      if (!Number.isFinite(value)) return false
      if (range === '3-5') return value >= 3 && value <= 5
      if (range === '4-5') return value >= 4 && value <= 5
      if (range === '5') return value === 5
      return true
    }

    const matchInCost = (value, range) => {
      if (range === 'all') return true
      if (!Number.isFinite(value)) return false
      if (range === 'lt-0.1') return value < 0.1
      if (range === 'lt-0.2') return value < 0.2
      if (range === 'lt-0.5') return value < 0.5
      return true
    }

    return modelOptions.filter(item => {
      const accuracy = getRatingValue(item, 'accuracy')
      const speed = getRatingValue(item, 'speed')
      const helpfulness = getRatingValue(item, 'helpfulness')
      const inCost = getTokenCost(item, 'input')

      return (
        matchRange(accuracy, ratingFilters.accuracy)
        && matchRange(speed, ratingFilters.speed)
        && matchRange(helpfulness, ratingFilters.helpfulness)
        && matchInCost(inCost, ratingFilters.inCost)
      )
    })
  }, [modelOptions, ratingFilters])

  const sortedModelOptions = useMemo(() => {
    const rows = [...filteredModelOptions]
    const { col, dir } = sort
    if (!col || !dir) return rows

    rows.sort((a, b) => {
      let av = null
      let bv = null

      if (col === 'provider') {
        av = String(a.provider || '').toLowerCase()
        bv = String(b.provider || '').toLowerCase()
      } else if (col === 'model') {
        av = String(a.label || a.modelId || '').toLowerCase()
        bv = String(b.label || b.modelId || '').toLowerCase()
      } else if (col === 'in' || col === 'out' || col === 'cache') {
        const keyByCol = { in: 'input', out: 'output', cache: 'caching' }
        av = getTokenCost(a, keyByCol[col])
        bv = getTokenCost(b, keyByCol[col])
      } else if (col === 'accuracy' || col === 'speed' || col === 'helpfulness') {
        av = getRatingValue(a, col)
        bv = getRatingValue(b, col)
      } else if (col === 'avgCost') {
        av = getDbAvgCost(a.modelId, modelAvgCosts) ?? getModelTokenAvgCost(a)
        bv = getDbAvgCost(b.modelId, modelAvgCosts) ?? getModelTokenAvgCost(b)
      } else if (col === 'efficiency') {
        av = getEfficiencyScore(
          getRatingValue(a, 'accuracy'),
          getRatingValue(a, 'helpfulness'),
          getRatingValue(a, 'speed'),
          getDbAvgCost(a.modelId, modelAvgCosts) ?? getModelTokenAvgCost(a)
        )
        bv = getEfficiencyScore(
          getRatingValue(b, 'accuracy'),
          getRatingValue(b, 'helpfulness'),
          getRatingValue(b, 'speed'),
          getDbAvgCost(b.modelId, modelAvgCosts) ?? getModelTokenAvgCost(b)
        )
      } else if (col === 'adminScore') {
        av = getAdminScore(
          getRatingValue(a, 'accuracy'),
          getRatingValue(a, 'helpfulness'),
          getDbAvgCost(a.modelId, modelAvgCosts) ?? getModelTokenAvgCost(a)
        )
        bv = getAdminScore(
          getRatingValue(b, 'accuracy'),
          getRatingValue(b, 'helpfulness'),
          getDbAvgCost(b.modelId, modelAvgCosts) ?? getModelTokenAvgCost(b)
        )
      }

      const isString = typeof av === 'string' || typeof bv === 'string'
      if (isString) {
        const sa = String(av || '')
        const sb = String(bv || '')
        if (sa === sb) return 0
        if (dir === 'asc') return sa < sb ? -1 : 1
        return sa > sb ? -1 : 1
      }

      const na = Number.isFinite(av) ? av : Infinity
      const nb = Number.isFinite(bv) ? bv : Infinity
      return dir === 'asc' ? na - nb : nb - na
    })

    return rows
  }, [filteredModelOptions, sort, modelAvgCosts])

  const onRatingFilterChange = (key, value) => {
    setRatingFilters(prev => ({ ...prev, [key]: value }))
  }

  const toggleSort = col => {
    setSort(prev => {
      if (prev.col !== col) return { col, dir: 'asc' }
      if (prev.dir === 'asc') return { col, dir: 'desc' }
      return { col: null, dir: null }
    })
  }

  const renderSortHeader = (col, label, align = 'left') => (
    <th className={`px-2 py-2 ${align === 'right' ? 'text-right' : 'text-left'}`}>
      <button
        type='button'
        onClick={() => toggleSort(col)}
        className='inline-flex items-center font-medium hover:text-brand'
      >
        {label}
        <SortIcon dir={sort.col === col ? sort.dir : null} />
      </button>
    </th>
  )

  const toggleModel = modelId => {
    setSelectedModels(prev => {
      if (prev.includes(modelId)) return prev.filter(item => item !== modelId)
      return [...prev, modelId]
    })
  }

  const onSettingChange = event => {
    const nextId = event.target.value
    setSettingId(nextId)
    const selected = promptMap.get(nextId)
    setPromptTemplate(selected?.systemPromptTemplate || '')
  }

  const onSubmit = async event => {
    event.preventDefault()
    setError('')

    const safeQuestion = question.trim()
    if (!safeQuestion) {
      setError('Please provide a question')
      return
    }
    if (!selectedModels.length) {
      setError('Please select at least one model')
      return
    }

    setIsSubmitting(true)
    try {
      const res = await fetch('/api/prompt-playground/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          settingId: Number(settingId) || null,
          promptTemplate,
          question: safeQuestion,
          models: selectedModels,
          audience
        })
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data?.error || 'Playground request failed')
        setResults([])
        setLatestHistoryId(null)
        return
      }
      setResults(Array.isArray(data?.items) ? data.items : [])
      setLatestHistoryId(Number(data?.historyId || 0) || null)
    } catch (err) {
      setError(err?.message || 'Playground request failed')
      setResults([])
      setLatestHistoryId(null)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className='space-y-4'>
      <form onSubmit={onSubmit} className='card space-y-4'>
        <div className='grid grid-cols-1 gap-3 md:grid-cols-3'>
          <div>
            <label className='text-xs text-slate-500'>Prompt Version</label>
            <select value={settingId} onChange={onSettingChange} className='w-full rounded-lg border border-slate-300 px-3 py-2'>
              {promptOptions.map(item => (
                <option key={item.id} value={item.id}>
                  v{item.version}{item.isActive ? ' (active)' : ''}{item.description ? ` - ${item.description}` : ''}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className='text-xs text-slate-500'>Question</label>
            <input
              value={question}
              onChange={event => setQuestion(event.target.value)}
              className='w-full rounded-lg border border-slate-300 px-3 py-2'
              placeholder='Ask a test question'
            />
          </div>
          <div>
            <label className='text-xs text-slate-500'>Test as</label>
            <div className='flex gap-2 mt-1'>
              {['guest', 'member'].map(opt => (
                <button
                  key={opt}
                  type='button'
                  onClick={() => setAudience(opt)}
                  className={`px-4 py-1.5 rounded-lg border text-sm font-medium transition-colors ${
                    audience === opt
                      ? opt === 'member'
                        ? 'bg-indigo-600 border-indigo-600 text-white'
                        : 'bg-slate-700 border-slate-700 text-white'
                      : 'border-slate-300 text-slate-600 hover:border-slate-400'
                  }`}
                >
                  {opt === 'guest' ? 'Guest (Public)' : 'Member (194)'}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className='grid grid-cols-1 gap-4 xl:grid-cols-2'>
          <div>
            <label className='text-xs text-slate-500'>System Prompt Template</label>
            <textarea
              rows={14}
              value={promptTemplate}
              onChange={event => setPromptTemplate(event.target.value)}
              className='w-full rounded-lg border border-slate-300 px-3 py-2'
            />
          </div>

          <div>
            <label className='text-xs text-slate-500 block mb-2'>AI Models (with cost and rating)</label>
            <div className='mb-2 rounded-md border border-slate-200 bg-slate-50 p-2 text-[11px] text-slate-600'>
              <p>Score = (Accuracy * 0.45 + Helpfulness * 0.35 + Speed * 0.20) / sqrt(Cost[100])</p>
              <p>A.Score = (Accuracy + Helpfulness) / (Cost[100]^0.2)</p>
            </div>
            <div className='mb-2 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4'>
              <div>
                <label className='text-[11px] text-slate-500'>In</label>
                <select
                  value={ratingFilters.inCost}
                  onChange={event => onRatingFilterChange('inCost', event.target.value)}
                  className='mt-1 w-full rounded-lg border border-slate-300 px-2 py-1 text-xs'
                >
                  <option value='all'>All</option>
                  <option value='lt-0.1'>&lt;$0.1</option>
                  <option value='lt-0.2'>&lt;$0.2</option>
                  <option value='lt-0.5'>&lt;$0.5</option>
                </select>
              </div>
              <div>
                <label className='text-[11px] text-slate-500'>Accuracy</label>
                <select
                  value={ratingFilters.accuracy}
                  onChange={event => onRatingFilterChange('accuracy', event.target.value)}
                  className='mt-1 w-full rounded-lg border border-slate-300 px-2 py-1 text-xs'
                >
                  <option value='all'>All</option>
                  <option value='3-5'>3-5</option>
                  <option value='4-5'>4-5</option>
                  <option value='5'>5</option>
                </select>
              </div>
              <div>
                <label className='text-[11px] text-slate-500'>Speed</label>
                <select
                  value={ratingFilters.speed}
                  onChange={event => onRatingFilterChange('speed', event.target.value)}
                  className='mt-1 w-full rounded-lg border border-slate-300 px-2 py-1 text-xs'
                >
                  <option value='all'>All</option>
                  <option value='3-5'>3-5</option>
                  <option value='4-5'>4-5</option>
                  <option value='5'>5</option>
                </select>
              </div>
              <div>
                <label className='text-[11px] text-slate-500'>Helpfulness</label>
                <select
                  value={ratingFilters.helpfulness}
                  onChange={event => onRatingFilterChange('helpfulness', event.target.value)}
                  className='mt-1 w-full rounded-lg border border-slate-300 px-2 py-1 text-xs'
                >
                  <option value='all'>All</option>
                  <option value='3-5'>3-5</option>
                  <option value='4-5'>4-5</option>
                  <option value='5'>5</option>
                </select>
              </div>
            </div>
            <div className='rounded-lg border border-slate-200'>
              <table className='w-full text-[10px]'>
                <thead className='bg-slate-50 text-slate-600'>
                  <tr>
                    <th className='px-2 py-2 text-left'>Select</th>
                    {renderSortHeader('provider', 'Provider', 'left')}
                    {renderSortHeader('model', 'Model', 'left')}
                    {renderSortHeader('in', 'In', 'right')}
                    {renderSortHeader('out', 'Out', 'right')}
                    {renderSortHeader('cache', 'Cache', 'right')}
                    {renderSortHeader('avgCost', 'Cost[100]', 'right')}
                    {renderSortHeader('accuracy', 'Accuracy', 'right')}
                    {renderSortHeader('speed', 'Speed', 'right')}
                    {renderSortHeader('helpfulness', 'Helpfulness', 'right')}
                    {renderSortHeader('efficiency', 'Score', 'right')}
                    {renderSortHeader('adminScore', 'A.Score', 'right')}
                  </tr>
                </thead>
                <tbody>
                  {sortedModelOptions.map(item => {
                    const checked = selectedModels.includes(item.modelId)
                    const tokenCost = item.cost?.token_1m || {}
                    const rawAvgCost = getDbAvgCost(item.modelId, modelAvgCosts) ?? getModelTokenAvgCost(item)
                    const avgCost100 = typeof rawAvgCost === 'number' ? rawAvgCost * 100 : null
                    const efficiencyScore = getEfficiencyScore(
                      getRatingValue(item, 'accuracy'),
                      getRatingValue(item, 'helpfulness'),
                      getRatingValue(item, 'speed'),
                      rawAvgCost
                    )
                    const adminScore = getAdminScore(
                      getRatingValue(item, 'accuracy'),
                      getRatingValue(item, 'helpfulness'),
                      rawAvgCost
                    )
                    return (
                      <tr key={item.modelId} className='border-t border-slate-100'>
                        <td className='px-2 py-2'>
                          <input
                            type='checkbox'
                            checked={checked}
                            onChange={() => toggleModel(item.modelId)}
                          />
                        </td>
                        <td className='px-2 py-2 capitalize text-slate-600'>{item.provider}</td>
                        <td className='px-2 py-2'>
                          <p className='font-medium text-slate-700'>{item.label}</p>
                          <p className='text-[10px] text-slate-400'>{item.modelId}</p>
                        </td>
                        <td className='px-2 py-2 text-right text-slate-600'>{formatPrice(tokenCost.input)}</td>
                        <td className='px-2 py-2 text-right text-slate-600'>{formatPrice(tokenCost.output)}</td>
                        <td className='px-2 py-2 text-right text-slate-600'>{formatPrice(tokenCost.caching)}</td>
                        <td className='px-2 py-2 text-right text-slate-600'>{formatPrice(avgCost100)}</td>
                        <td className='px-2 py-2 text-right text-slate-600'>{getRatingValue(item, 'accuracy') ?? '-'}</td>
                        <td className='px-2 py-2 text-right text-slate-600'>{getRatingValue(item, 'speed') ?? '-'}</td>
                        <td className='px-2 py-2 text-right text-slate-600'>{getRatingValue(item, 'helpfulness') ?? '-'}</td>
                        <td className='px-2 py-2 text-right text-slate-600'>{typeof efficiencyScore === 'number' ? Math.round(efficiencyScore) : '-'}</td>
                        <td className='px-2 py-2 text-right text-slate-600'>{typeof adminScore === 'number' ? Math.round(adminScore) : '-'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className='flex items-center gap-3'>
          <button className='rounded-lg bg-brand text-white px-3 py-2 font-semibold disabled:opacity-60' disabled={isSubmitting}>
            {isSubmitting ? 'Running...' : 'Compare Outputs'}
          </button>
          {latestHistoryId ? <Link className='text-sm text-brand underline' href={`/prompt-playground?historyPage=${historyPage}&historyId=${latestHistoryId}`}>Open saved history</Link> : null}
          {error ? <p className='text-sm text-red-600'>{error}</p> : null}
        </div>
      </form>

      <div className='card'>
        <h3 className='font-semibold mb-3'>Results</h3>
        {!results.length ? (
          <p className='text-sm text-slate-500'>No comparison result yet</p>
        ) : (
          <div className='overflow-x-auto'>
            <table className='w-full text-sm'>
              <thead>
                <tr className='border-b border-slate-200 text-left'>
                  <th className='py-2 pr-3'>Model</th>
                  <th className='py-2 pr-3'>Latency</th>
                  <th className='py-2 pr-3'>Cost</th>
                  <th className='py-2 pr-3'>Score</th>
                  <th className='py-2 pr-3'>A.Score</th>
                  <th className='py-2 pr-3'>Answer</th>
                  <th className='py-2'>Interaction</th>
                </tr>
              </thead>
              <tbody>
                {results.map(row => {
                  const modelMeta = modelOptions.find(item => item.modelId === row.modelId)
                  const rawAvgCost = getDbAvgCost(row.modelId, modelAvgCosts) ?? getModelTokenAvgCost(modelMeta)
                  const rowEfficiency = getEfficiencyScore(
                    getRatingValue(modelMeta, 'accuracy'),
                    getRatingValue(modelMeta, 'helpfulness'),
                    getRatingValue(modelMeta, 'speed'),
                    rawAvgCost
                  )
                  const rowAdminScore = getAdminScore(
                    getRatingValue(modelMeta, 'accuracy'),
                    getRatingValue(modelMeta, 'helpfulness'),
                    rawAvgCost
                  )

                  return (
                    <tr key={`${row.modelId}-${row.interactionId || 'x'}`} className='border-b border-slate-100 align-top'>
                      <td className='py-2 pr-3 font-medium'>{row.modelId}</td>
                      <td className='py-2 pr-3'>{typeof row.latencyMs === 'number' ? `${(row.latencyMs / 1000).toFixed(2)} s` : '-'}</td>
                      <td className='py-2 pr-3'>{typeof row.cost === 'number' ? `$${row.cost.toFixed(6)}` : '-'}</td>
                      <td className='py-2 pr-3'>{typeof rowEfficiency === 'number' ? Math.round(rowEfficiency) : '-'}</td>
                      <td className='py-2 pr-3'>{typeof rowAdminScore === 'number' ? Math.round(rowAdminScore) : '-'}</td>
                      <td className='py-2 pr-3 whitespace-pre-wrap'>
                        {row.error ? <span className='text-red-600'>{row.error}</span> : (row.answer || '-')}
                      </td>
                      <td className='py-2'>
                        {row.interactionId ? <Link className='text-brand underline' href={`/interactions/${row.interactionId}`}>Open</Link> : '-'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className='grid grid-cols-1 gap-4 xl:grid-cols-2'>
        <div className='card'>
          <h3 className='font-semibold mb-3'>Test History</h3>
          {!historyItems.length ? (
            <p className='text-sm text-slate-500'>No history yet</p>
          ) : (
            <div className='space-y-2'>
              {historyItems.map(item => {
                const resultRows = normalizeResults(item.result)
                const shortQuestion = String(item.question || '')
                return (
                  <Link
                    key={item.id}
                    href={`/prompt-playground?historyPage=${historyPage}&historyId=${item.id}`}
                    className='block rounded-lg border border-slate-200 px-3 py-2 hover:bg-slate-50'
                  >
                    <p className='text-xs text-slate-500'>#{item.id} · {new Date(item.createdAt).toLocaleString()}</p>
                    <p className='text-sm font-medium text-slate-700 line-clamp-2'>{shortQuestion || '-'}</p>
                    <p className='text-xs text-slate-500 mt-1'>Results: {resultRows.length}</p>
                  </Link>
                )
              })}
            </div>
          )}

          <div className='mt-3 flex items-center justify-between text-sm'>
            <Link
              href={`/prompt-playground?historyPage=${Math.max(1, historyPage - 1)}`}
              className={`rounded border px-2 py-1 ${historyPage <= 1 ? 'pointer-events-none opacity-40' : 'hover:bg-slate-50'}`}
            >
              Previous
            </Link>
            <span className='text-slate-500'>Page {historyPage} / {Math.max(1, historyTotalPages)}</span>
            <Link
              href={`/prompt-playground?historyPage=${Math.min(Math.max(1, historyTotalPages), historyPage + 1)}`}
              className={`rounded border px-2 py-1 ${historyPage >= Math.max(1, historyTotalPages) ? 'pointer-events-none opacity-40' : 'hover:bg-slate-50'}`}
            >
              Next
            </Link>
          </div>
        </div>

        <div className='card'>
          <h3 className='font-semibold mb-3'>History Detail</h3>
          {!selectedHistory ? (
            <p className='text-sm text-slate-500'>Click a history item to view question, prompt, and results</p>
          ) : (
            <div className='space-y-3'>
              <div>
                <p className='text-xs text-slate-500'>Question</p>
                <p className='whitespace-pre-wrap text-sm'>{selectedHistory.question || '-'}</p>
              </div>
              <div>
                <p className='text-xs text-slate-500'>Prompt Template</p>
                <pre className='whitespace-pre-wrap text-xs rounded-lg border border-slate-200 bg-slate-50 p-2 max-h-56 overflow-auto'>{selectedHistory.promptTemplate || '-'}</pre>
              </div>
              <div>
                <p className='text-xs text-slate-500 mb-1'>Result</p>
                <div className='overflow-x-auto'>
                  <table className='w-full text-xs'>
                    <thead>
                      <tr className='border-b border-slate-200 text-left'>
                        <th className='py-1 pr-2'>Model</th>
                        <th className='py-1 pr-2'>Latency</th>
                        <th className='py-1 pr-2'>Cost</th>
                        <th className='py-1 pr-2'>Score</th>
                        <th className='py-1 pr-2'>A.Score</th>
                        <th className='py-1 pr-2'>Answer</th>
                      </tr>
                    </thead>
                    <tbody>
                      {normalizeResults(selectedHistory.result).map((row, idx) => {
                        const modelMeta = modelOptions.find(item => item.modelId === row?.modelId)
                        const rawAvgCost = getDbAvgCost(row?.modelId, modelAvgCosts) ?? getModelTokenAvgCost(modelMeta)
                        const rowEfficiency = getEfficiencyScore(
                          getRatingValue(modelMeta, 'accuracy'),
                          getRatingValue(modelMeta, 'helpfulness'),
                          getRatingValue(modelMeta, 'speed'),
                          rawAvgCost
                        )
                        const rowAdminScore = getAdminScore(
                          getRatingValue(modelMeta, 'accuracy'),
                          getRatingValue(modelMeta, 'helpfulness'),
                          rawAvgCost
                        )

                        return (
                          <tr key={`${selectedHistory.id}-${idx}`} className='border-b border-slate-100 align-top'>
                            <td className='py-1 pr-2'>{row?.modelId || '-'}</td>
                            <td className='py-1 pr-2'>{typeof row?.latencyMs === 'number' ? `${(row.latencyMs / 1000).toFixed(2)} s` : '-'}</td>
                            <td className='py-1 pr-2'>{typeof row?.cost === 'number' ? `$${row.cost.toFixed(6)}` : '-'}</td>
                            <td className='py-1 pr-2'>{typeof rowEfficiency === 'number' ? Math.round(rowEfficiency) : '-'}</td>
                            <td className='py-1 pr-2'>{typeof rowAdminScore === 'number' ? Math.round(rowAdminScore) : '-'}</td>
                            <td className='py-1 pr-2 whitespace-pre-wrap'>{row?.error ? <span className='text-red-600'>{row.error}</span> : (row?.answer || '-')}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
