import Fastify from 'fastify'
import cors from '@fastify/cors'
import OpenAI from 'openai'
import { GoogleGenAI } from '@google/genai'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import 'dotenv/config'

const __dirname = dirname(fileURLToPath(import.meta.url))

const faq = JSON.parse(
  readFileSync(join(__dirname, '../faq.json'), 'utf-8')
)

// All supported models and their provider routing
const MODELS = [
  { id: 'gemini-2.5-flash',      label: 'Gemini 2.5 Flash',    provider: 'gemini', temperature: 0.7 },
  { id: 'gpt-5-mini',            label: 'GPT-5 Mini',          provider: 'openai', temperature: 1.0 },
  { id: 'gpt-5-nano',            label: 'GPT-5 Nano',          provider: 'openai', temperature: 1.0 },
  { id: 'llama-3.1-8b-instant',  label: 'Llama 3.1 8B',        provider: 'groq', temperature: 0.7 }
]
const DEFAULT_MODEL = 'llama-3.1-8b-instant'

// Module-level system prompt cache (built once)
const SYSTEM_PROMPT = buildSystemPrompt()

// Cached OpenAI-compatible clients per provider
const _clients = new Map()
function getClient (provider) {
  if (_clients.has(provider)) return _clients.get(provider)
  let client
  switch (provider) {
    case 'gemini':
      client = new OpenAI({
        apiKey: process.env.GEMINI_API_KEY,
        baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/'
      })
      break
    case 'openai':
      client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
      break
    case 'groq':
      client = new OpenAI({
        apiKey: process.env.GROQ_API_KEY,
        baseURL: 'https://api.groq.com/openai/v1'
      })
      break
    default:
      throw new Error(`Unknown provider: ${provider}`)
  }
  _clients.set(provider, client)
  return client
}

// Gemini context cache (TTL 1 h, refreshed 5 min before expiry)
let _geminiCache = null
let _geminiCacheExpiry = 0

async function getGeminiCachedContent () {
  if (_geminiCache && Date.now() < _geminiCacheExpiry) return _geminiCache
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
  const cache = await ai.caches.create({
    model: 'gemini-2.5-flash',
    config: { systemInstruction: SYSTEM_PROMPT, ttl: '3600s' }
  })
  _geminiCache = { ai, cacheName: cache.name }
  _geminiCacheExpiry = Date.now() + 55 * 60 * 1000 // refresh 5 min early
  return _geminiCache
}

function buildSystemPrompt () {
  const faqText = faq.faq
    .map(item => `#${item.category}\nQ:${item.question}\nA:${item.answer}`)
    .join('\n')

  return `As 194964 Support. 
  Rules:
  - Reply in user's language (JP/EN).
  - Data source:
  ${faqText}

  Constraints:
  1. If not in FAQ, only say: "申し訳ございませんが、この情報についてはLINE（@194964）を通じて弊社スタッフに直接お問い合わせいただくことをอ勧めします。" (Translate for EN).
  2. Politeness: Friendly & human-like.
  3. Pricing: If unclear, say: "ウェブサイトを確認するか、スタッフに尋ねることをお勧めします。" (Translate for EN).`
}

const app = Fastify({ logger: true })

await app.register(cors, {
  origin: true,
  methods: ['GET', 'POST', 'OPTIONS']
})

app.setNotFoundHandler((request, reply) => {
  reply.code(404).send({ error: 'Not Found', statusCode: 404 })
})

app.setErrorHandler((err, request, reply) => {
  app.log.error(err)
  reply.code(err.statusCode || 500).send({
    error: err.message || 'Internal Server Error',
    statusCode: err.statusCode || 500
  })
})

// Return available models to the frontend
app.get('/api/models', async () => ({ models: MODELS, default: DEFAULT_MODEL }))

app.post('/api/chat', async (request, reply) => {
  const { message, model: modelId = DEFAULT_MODEL } = request.body

  if (!message || typeof message !== 'string') {
    return reply.code(400).send({ error: 'message is required' })
  }

  const modelConfig = MODELS.find(m => m.id === modelId)
  if (!modelConfig) {
    return reply.code(400).send({ error: `Unknown model: ${modelId}` })
  }

  const envKeys = { gemini: 'GEMINI_API_KEY', openai: 'OPENAI_API_KEY', groq: 'GROQ_API_KEY' }
  const envKey = envKeys[modelConfig.provider]
  if (!process.env[envKey]) {
    return reply.code(500).send({ error: `${envKey} is not set in .env` })
  }

  try {
    if (modelConfig.provider === 'gemini') {
      // Use Gemini native SDK with context caching; fall back to OpenAI-compat on error
      try {
        const { ai, cacheName } = await getGeminiCachedContent()
        const response = await ai.models.generateContent({
          model: modelId,
          config: { cachedContent: cacheName, temperature: modelConfig.temperature },
          contents: [{ role: 'user', parts: [{ text: message }] }]
        })
        return { reply: response.text, model: modelId }
      } catch (cacheErr) {
        app.log.warn({ cacheErr }, 'Gemini context cache unavailable, falling back')
        _geminiCache = null // force refresh on next request
      }
    }

    const client = getClient(modelConfig.provider)
    const completion = await client.chat.completions.create({
      model: modelId,
      temperature: modelConfig.temperature,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: message }
      ]
    })
    return { reply: completion.choices[0].message.content, model: modelId }
  } catch (err) {
    app.log.error({ err }, 'AI request failed')
    return reply.code(500).send({ error: 'AI service error', detail: err.message })
  }
})

app.get('/health', async () => ({ status: 'ok' }))

const port = process.env.PORT || 3001
await app.listen({ port, host: '0.0.0.0' })
