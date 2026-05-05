import Fastify from 'fastify'
import cors from '@fastify/cors'
import OpenAI from 'openai'
import { GoogleGenAI } from '@google/genai'
import Anthropic from '@anthropic-ai/sdk'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import 'dotenv/config'

const __dirname = dirname(fileURLToPath(import.meta.url))

const faq = JSON.parse(
  readFileSync(join(__dirname, '../faq.json'), 'utf-8')
)

const aiModelConfig = JSON.parse(
  readFileSync(join(__dirname, 'ai-model.json'), 'utf-8')
)
const MODELS = aiModelConfig.models
const PROVIDERS = aiModelConfig.providers
const DEFAULT_MODEL = aiModelConfig.default

// Module-level system prompt cache (built once)
const SYSTEM_PROMPT = buildSystemPrompt()

// Cached OpenAI-compatible clients per provider
const _clients = new Map()
function getClient (provider) {
  if (_clients.has(provider)) return _clients.get(provider)
  const cfg = PROVIDERS[provider]
  if (!cfg) throw new Error(`Unknown provider: ${provider}`)
  const client = new OpenAI({ apiKey: process.env[cfg.envKey], baseURL: cfg.baseURL })
  _clients.set(provider, client)
  return client
}

// Gemini context caches are kept per model (TTL 1 h, refreshed 5 min before expiry).
const GEMINI_CACHE_BYPASS_MODELS = new Set(['gemini-3-flash-lite'])
const GEMINI_CACHE_REFRESH_MS = 55 * 60 * 1000
const _geminiAi = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
const _geminiCaches = new Map()
const _anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

async function getGeminiCachedContent (modelId) {
  if (GEMINI_CACHE_BYPASS_MODELS.has(modelId)) return null

  const now = Date.now()
  const existing = _geminiCaches.get(modelId)
  if (existing && now < existing.expiresAt) return existing

  const cache = await _geminiAi.caches.create({
    model: modelId,
    config: { systemInstruction: SYSTEM_PROMPT, ttl: '3600s' }
  })

  const cacheEntry = {
    ai: _geminiAi,
    cacheName: cache.name,
    expiresAt: now + GEMINI_CACHE_REFRESH_MS
  }
  _geminiCaches.set(modelId, cacheEntry)
  return cacheEntry
}

function buildSystemPrompt () {
  const faqText = faq.faq
    .map(item => `#${item.category}\nQ:${item.question}\nA:${item.answer}`)
    .join('\n')

  return `As 194964 Support. 
  [LANGUAGE PROTOCOL]
  - ALWAYS identify the user's input language first.
  - Respond in the SAME language as the user's last message (e.g., if asked in English, reply in English).
  - The FAQ DATA below is in Japanese. You must TRANSLATE the relevant information into the user's language accurately.
  - Do NOT reply in Japanese unless the user asks in Japanese.

  [FAQ DATA]
  ${faqText}

 [BEHAVIOR RULES]
  1. Use the FAQ DATA to answer.
  2. If not in FAQ, only say: "申し訳ございませんが、この情報についてはLINE（@194964）を通じて弊社スタッフに直接お問い合わせいただくことをお勧めします。" (Translate for EN).
  3. Politeness: Friendly & human-like.
  4. Pricing: If unclear, say: "ウェブサイトを確認するか、スタッフに尋ねることをお勧めします。" (Translate for EN).
  5. Do NOT use <think> tags in your response.
  `  
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
  const apiModelId = modelConfig.apiModel || modelId

  const envKey = PROVIDERS[modelConfig.provider]?.envKey
  if (!envKey || !process.env[envKey]) {
    return reply.code(500).send({ error: `${envKey} is not set in .env` })
  }

  try {
    if (modelConfig.provider === 'anthropic') {
      const response = await _anthropicClient.messages.create({
        model: apiModelId,
        system: SYSTEM_PROMPT,
        temperature: modelConfig.temperature,
        max_tokens: 1024,
        messages: [{ role: 'user', content: message }]
      })
      const text = response.content
        .filter(block => block.type === 'text')
        .map(block => block.text)
        .join('\n')
      return { reply: cleanResponse(text), model: modelId }
    }

    if (modelConfig.provider === 'gemini' && modelId.includes('2.5')) {
      // Use Gemini native SDK with context caching; fall back to OpenAI-compat on error
      try {
        const cacheEntry = await getGeminiCachedContent(apiModelId)
        const ai = cacheEntry?.ai || _geminiAi
        const generationConfig = cacheEntry
          ? { cachedContent: cacheEntry.cacheName, temperature: modelConfig.temperature }
          : { systemInstruction: SYSTEM_PROMPT, temperature: modelConfig.temperature }
        const response = await ai.models.generateContent({
          model: apiModelId,
          config: generationConfig,
          contents: [{ role: 'user', parts: [{ text: message }] }]
        })
        return { reply: response.text, model: modelId }
      } catch (cacheErr) {
        app.log.warn({ cacheErr }, 'Gemini context cache unavailable, falling back')
        _geminiCaches.delete(apiModelId) // force refresh for this model on next request
      }
    }

    const client = getClient(modelConfig.provider)
    const completion = await client.chat.completions.create({
      model: apiModelId,
      temperature: modelConfig.temperature,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: message }
      ],
    })
    const finalAnswer = cleanResponse(completion.choices[0].message.content);
    return { reply: finalAnswer, model: modelId }
  } catch (err) {
    app.log.error({ err }, 'AI request failed')
    return reply.code(500).send({ error: 'AI service error', detail: err.message })
  }
})

app.get('/health', async () => ({ status: 'ok' }))

const port = process.env.PORT || 3001
await app.listen({ port, host: '0.0.0.0' })

function cleanResponse(text) {
  if (typeof text !== 'string') return ''
  return text.replace(/<think>[\s\S]*?<\/think>/g, '').trim()
}