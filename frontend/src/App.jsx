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

function Avatar () {
  return (
    <div className='flex-shrink-0 w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-md mr-2 mt-1'>
      <span className='text-white text-xs font-bold tracking-wide'>CS</span>
    </div>
  )
}

function ChatBubble ({ message }) {
  const isUser = message.role === 'user'
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
      {!isUser && <Avatar />}
      <div className={`max-w-[78%] px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap shadow-sm ${
        isUser
          ? 'bg-gradient-to-br from-indigo-500 to-purple-600 text-white rounded-br-sm'
          : 'bg-white text-gray-800 rounded-bl-sm border border-gray-100 shadow'
      }`}>
        {message.text}
        {message.model && !isUser && (
          <span className='block mt-1.5 text-[10px] text-gray-400'>{message.model}</span>
        )}
      </div>
    </div>
  )
}

function TypingIndicator () {
  return (
    <div className='flex justify-start mb-4'>
      <Avatar />
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
    <div className='flex gap-1.5 overflow-x-auto scrollbar-hide py-0.5'>
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
        { id: Date.now() + 1, role: 'assistant', text: data.reply, model: data.model }
      ])
    } catch {
      setError('メッセージの送信に失敗しました。もう一度お試しください。')
    } finally {
      setLoading(false)
      inputRef.current?.focus()
    }
  }

  function handleKeyDown (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  return (
    <div className='flex flex-col h-dvh max-w-lg mx-auto bg-gradient-to-b from-slate-50 to-gray-100'>
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
        {messages.map(msg => <ChatBubble key={msg.id} message={msg} />)}
        {loading && <TypingIndicator />}
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
  )
}

