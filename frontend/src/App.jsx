import { useState, useRef, useEffect } from 'react'

const WELCOME_MESSAGE = {
  id: 'welcome',
  role: 'assistant',
  text: '私は194964のスマートアシスタントです。\nご質問があれば、お気軽にご入力ください。'
}

const SESSION_KEY = '194964_session_id'
const MESSAGES_KEY = '194964_messages'
const MODEL_KEY = '194964_model'

function loadMessages () {
  try {
    const saved = localStorage.getItem(MESSAGES_KEY)
    return saved ? JSON.parse(saved) : [WELCOME_MESSAGE]
  } catch {
    return [WELCOME_MESSAGE]
  }
}

function saveMessages (messages) {
  try { localStorage.setItem(MESSAGES_KEY, JSON.stringify(messages)) } catch {}
}

function Avatar ({ model }) {
  const label = model
    ? model.split(/[-/]/).filter(Boolean).slice(0, 2).map(s => s[0].toUpperCase()).join('')
    : 'CS'
  return (
    <div className='flex-shrink-0 w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-md mr-2 mt-1'>
      <span className='text-white text-xs font-bold tracking-wide'>{label}</span>
    </div>
  )
}

function ThumbButtons ({ interactionId, feedback, onFeedback }) {
  return (
    <div className='flex gap-1 mt-2'>
      <button
        onClick={() => onFeedback(interactionId, true)}
        className={`p-1 rounded transition-colors ${feedback === true ? 'text-green-500' : 'text-gray-300 hover:text-green-500'}`}
        title='役に立った'
      >
        <svg className='w-3.5 h-3.5' fill={feedback === true ? 'currentColor' : 'none'} stroke='currentColor' viewBox='0 0 24 24'>
          <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5' />
        </svg>
      </button>
      <button
        onClick={() => onFeedback(interactionId, false)}
        className={`p-1 rounded transition-colors ${feedback === false ? 'text-red-500' : 'text-gray-300 hover:text-red-500'}`}
        title='役に立たなかった'
      >
        <svg className='w-3.5 h-3.5' fill={feedback === false ? 'currentColor' : 'none'} stroke='currentColor' viewBox='0 0 24 24'>
          <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M10 14H5.236a2 2 0 01-1.789-2.894l3.5-7A2 2 0 018.736 3h4.018a2 2 0 01.485.06l3.76.94m-7 10v5a2 2 0 002 2h.095c.5 0 .905-.405.905-.905 0-.714.211-1.412.608-2.006L17 13V4m-7 10h2m5-10h2a2 2 0 012 2v6a2 2 0 01-2 2h-2.5' />
        </svg>
      </button>
    </div>
  )
}

function ChatBubble ({ message, onFeedback }) {
  const isUser = message.role === 'user'
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
      {!isUser && <Avatar model={message.model} />}
      <div className={`max-w-[78%] px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap shadow-sm ${
        isUser
          ? 'bg-gradient-to-br from-indigo-500 to-purple-600 text-white rounded-br-sm'
          : 'bg-white text-gray-800 rounded-bl-sm border border-gray-100 shadow'
      }`}>
        {message.text}
        {message.model && !isUser && (
          <span className='block mt-1.5 text-[10px] text-gray-400'>{message.model}</span>
        )}
        {!isUser && 'interactionId' in message && (
          <ThumbButtons interactionId={message.interactionId} feedback={message.feedback} onFeedback={onFeedback} />
        )}
      </div>
    </div>
  )
}

function TypingIndicator ({ model }) {
  return (
    <div className='flex justify-start mb-4'>
      <Avatar model={model} />
      <div className='bg-white border border-gray-100 rounded-2xl rounded-bl-sm px-4 py-3 shadow'>
        <div className='flex gap-1.5 items-center h-4'>
          {[0, 150, 300].map(delay => (
            <span key={delay} className='w-2 h-2 bg-indigo-400 rounded-full animate-bounce' style={{ animationDelay: `${delay}ms` }} />
          ))}
        </div>
      </div>
    </div>
  )
}

function ModelPicker ({ models, selected, onChange }) {
  return (
    <div className='flex flex-wrap gap-1.5 py-0.5'>
      {models.map(m => (
        <button
          key={m.id}
          onClick={() => onChange(m.id)}
          className={`flex-shrink-0 text-xs px-3 py-1 rounded-full border transition-all ${
            selected === m.id
              ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
              : 'bg-white text-gray-500 border-gray-200 hover:border-indigo-300 hover:text-indigo-600'
          }`}
        >
          {m.label}
        </button>
      ))}
    </div>
  )
}

function formatPrice (value) {
  if (typeof value !== 'number') return '-'
  const formatted = new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 }).format(value)
  return `$${formatted}`
}

const SORT_KEYS = { model: 'label', provider: 'provider', in: 'input', out: 'output', cache: 'caching' }

function SortIcon ({ dir }) {
  if (!dir) return <span className='ml-0.5 opacity-30'>⇅</span>
  return <span className='ml-0.5'>{dir === 'asc' ? '↑' : '↓'}</span>
}

function CostTable ({ models, selected, onChange }) {
  const [sort, setSort] = useState({ col: null, dir: null })

  function toggleSort (col) {
    setSort(prev =>
      prev.col !== col ? { col, dir: 'asc' }
      : prev.dir === 'asc' ? { col, dir: 'desc' }
      : { col: null, dir: null }
    )
  }

  const sorted = [...models].sort((a, b) => {
    if (!sort.col) return 0
    let av, bv
    if (sort.col === 'model' || sort.col === 'provider') {
      const key = sort.col === 'model' ? 'label' : 'provider'
      av = (a[key] || '').toLowerCase()
      bv = (b[key] || '').toLowerCase()
    } else {
      const key = SORT_KEYS[sort.col]
      av = a.cost?.token_1m?.[key] ?? Infinity
      bv = b.cost?.token_1m?.[key] ?? Infinity
    }
    if (av < bv) return sort.dir === 'asc' ? -1 : 1
    if (av > bv) return sort.dir === 'asc' ? 1 : -1
    return 0
  })

  const th = (col, label, align = 'right') => (
    <th
      className={`font-medium px-2 py-2 text-${align} cursor-pointer select-none hover:text-indigo-600 whitespace-nowrap`}
      onClick={() => toggleSort(col)}
    >
      {label}<SortIcon dir={sort.col === col ? sort.dir : null} />
    </th>
  )

  return (
    <div className='flex-1 overflow-auto scrollbar-hide'>
      <table className='w-full text-xs'>
        <thead className='sticky top-0 bg-gray-50 z-10'>
          <tr className='text-gray-500'>
            {th('provider', 'Provider', 'left')}
            {th('model', 'Model', 'left')}
            {th('in', 'In')}
            {th('out', 'Out')}
            {th('cache', 'Cache')}
          </tr>
        </thead>
        <tbody>
          {sorted.map(m => {
            const tokenCost = m.cost?.token_1m || {}
            const active = selected === m.id
            return (
              <tr
                key={m.id}
                onClick={() => onChange(m.id)}
                className={`border-t border-gray-100 cursor-pointer transition-colors ${
                  active ? 'bg-indigo-50/80' : 'hover:bg-gray-50'
                }`}
              >
                <td className='px-2 py-2.5 text-left'>
                  <span className='text-gray-500 capitalize'>{m.provider}</span>
                </td>
                <td className='px-2 py-2.5'>
                  <p className={`font-medium leading-tight ${active ? 'text-indigo-700' : 'text-gray-700'}`}>{m.label}</p>
                  <p className='text-[10px] text-gray-400 mt-0.5'>{m.id}</p>
                </td>
                <td className='px-2 py-2.5 text-right text-gray-600'>{formatPrice(tokenCost.input)}</td>
                <td className='px-2 py-2.5 text-right text-gray-600'>{formatPrice(tokenCost.output)}</td>
                <td className='px-2 py-2.5 text-right text-gray-600'>{formatPrice(tokenCost.caching)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export default function App () {
  const [messages, setMessages] = useState(loadMessages)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [models, setModels] = useState([])
  const [selectedModel, setSelectedModel] = useState(
    () => localStorage.getItem(MODEL_KEY) || 'llama-3.1-8b-instant'
  )
  const bottomRef = useRef(null)
  const inputRef = useRef(null)
  const sessionId = useRef(localStorage.getItem(SESSION_KEY) || undefined)

  useEffect(() => {
    const apiBase = import.meta.env.VITE_API_URL || ''
    fetch(`${apiBase}/api/models`)
      .then(r => r.json())
      .then(data => setModels(data.models || []))
      .catch(() => {})
  }, [])

  useEffect(() => { saveMessages(messages) }, [messages])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  function handleModelChange (id) {
    setSelectedModel(id)
    localStorage.setItem(MODEL_KEY, id)
  }

  function clearChat () {
    localStorage.removeItem(MESSAGES_KEY)
    localStorage.removeItem(SESSION_KEY)
    sessionId.current = undefined
    setMessages([WELCOME_MESSAGE])
    setError(null)
  }

  async function sendMessage () {
    const text = input.trim()
    if (!text || loading) return

    setInput('')
    setError(null)
    setMessages(prev => [...prev, { id: Date.now(), role: 'user', text }])
    setLoading(true)

    try {
      const apiBase = import.meta.env.VITE_API_URL || ''
      const res = await fetch(`${apiBase}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, model: selectedModel, sessionId: sessionId.current })
      })

      if (!res.ok) throw new Error(`Server error: ${res.status}`)
      const data = await res.json()

      if (data.sessionId) {
        sessionId.current = data.sessionId
        localStorage.setItem(SESSION_KEY, data.sessionId)
      }

      setMessages(prev => [
        ...prev,
        { id: Date.now() + 1, role: 'assistant', text: data.reply, model: data.model, interactionId: data.interactionId ?? null, feedback: null }
      ])
    } catch {
      setError('メッセージの送信に失敗しました。もう一度お試しください。')
    } finally {
      setLoading(false)
      inputRef.current?.focus()
    }
  }

  async function handleFeedback (interactionId, isThumbUp) {
    setMessages(prev => prev.map(msg =>
      msg.interactionId === interactionId ? { ...msg, feedback: isThumbUp } : msg
    ))
    if (!interactionId) return
    try {
      const apiBase = import.meta.env.VITE_API_URL || ''
      await fetch(`${apiBase}/api/feedback/${interactionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isThumbUp })
      })
    } catch {}
  }

  function handleKeyDown (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  return (
    <div className='min-h-dvh bg-gradient-to-b from-slate-50 to-gray-100 lg:p-4'>
      <div className='mx-auto h-dvh max-w-7xl lg:h-[calc(100dvh-2rem)] lg:grid lg:grid-cols-[minmax(0,1fr)_34rem] lg:gap-4'>
        <div className='flex flex-col h-full bg-gradient-to-b from-slate-50 to-gray-100 lg:rounded-2xl lg:overflow-hidden lg:border lg:border-gray-200 lg:shadow-sm'>
          {/* Header */}
          <header className='bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-4 py-3.5 flex items-center gap-3 shadow-lg flex-shrink-0'>
            <div className='w-10 h-10 rounded-full bg-white/20 backdrop-blur flex items-center justify-center ring-2 ring-white/30'>
              <span className='text-sm font-bold tracking-wide'>CS</span>
            </div>
            <div className='flex-1'>
              <p className='font-semibold text-base leading-tight'>194964 サポート</p>
              <p className='text-xs text-indigo-200'>スマートアシスタント</p>
            </div>
            <button
              onClick={clearChat}
              className='text-white/70 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-white/10'
              title='チャットをリセット'
            >
              <svg className='w-5 h-5' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16' />
              </svg>
            </button>
          </header>

          {/* Model picker */}
          {models.length > 0 && (
            <div className='px-4 pt-3 pb-2 bg-white border-b border-gray-100 flex-shrink-0'>
              <p className='text-[11px] text-gray-400 mb-1.5'>AI モデル選択</p>
              <ModelPicker models={models} selected={selectedModel} onChange={handleModelChange} />
            </div>
          )}

          {/* Date divider */}
          <div className='flex items-center gap-2 px-4 pt-3 pb-1'>
            <div className='flex-1 h-px bg-gray-200' />
            <span className='text-xs text-gray-400 whitespace-nowrap'>
              {new Date().toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' })}
            </span>
            <div className='flex-1 h-px bg-gray-200' />
          </div>

          {/* Messages */}
          <main className='flex-1 overflow-y-auto px-4 pt-2 pb-2 scrollbar-hide'>
            {messages.map(msg => <ChatBubble key={msg.id} message={msg} onFeedback={handleFeedback} />)}
            {loading && <TypingIndicator model={selectedModel} />}
            {error && (
              <div className='mx-2 mb-3 flex items-center gap-2 text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2.5'>
                <svg className='w-4 h-4 flex-shrink-0' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                  <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z' />
                </svg>
                {error}
              </div>
            )}
            <div ref={bottomRef} />
          </main>

          {/* Input */}
          <footer className='bg-white border-t border-gray-200 px-3 py-3 flex-shrink-0'>
            <div className='flex gap-2 items-end bg-gray-50 rounded-2xl border border-gray-200 px-3 py-2 focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-100 transition-all'>
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder='メッセージを入力...'
                rows={1}
                className='flex-1 resize-none bg-transparent text-sm focus:outline-none max-h-32 overflow-y-auto leading-relaxed text-gray-800 placeholder-gray-400'
                style={{ minHeight: '24px' }}
                disabled={loading}
              />
              <button
                onClick={sendMessage}
                disabled={!input.trim() || loading}
                className='flex-shrink-0 w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed hover:from-indigo-600 hover:to-purple-700 active:scale-95 transition-all shadow-sm'
                aria-label='送信'
              >
                <svg className='w-4 h-4 text-white rotate-90' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                  <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2.5} d='M12 19l9 2-9-18-9 18 9-2zm0 0v-8' />
                </svg>
              </button>
            </div>
            <p className='text-center text-xs text-gray-300 mt-1.5'>Enter で送信 · Shift+Enter で改行</p>
          </footer>
        </div>

        <aside className='hidden lg:flex lg:flex-col bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden'>
          <div className='px-4 py-3 border-b border-gray-100 bg-gray-50'>
            <p className='text-sm font-semibold text-gray-700'>Model Cost Table</p>
            <p className='text-[11px] text-gray-400 mt-0.5'>USD per 1M tokens</p>
          </div>
          <CostTable models={models} selected={selectedModel} onChange={handleModelChange} />
        </aside>
      </div>
    </div>
  )
}

