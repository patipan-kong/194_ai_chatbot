import Fastify from 'fastify'
import cors from '@fastify/cors'
import OpenAI from 'openai'
import { GoogleGenAI } from '@google/genai'
import Anthropic from '@anthropic-ai/sdk'
import { PrismaClient } from './generated/prisma/index.js'
import { PrismaPg } from '@prisma/adapter-pg'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import 'dotenv/config'

const __dirname = dirname(fileURLToPath(import.meta.url))

const _pgAdapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter: _pgAdapter })

const aiModelConfig = JSON.parse(
  readFileSync(join(__dirname, 'ai-model.json'), 'utf-8')
)
const MODELS = aiModelConfig.models
const PROVIDERS = aiModelConfig.providers
const DEFAULT_MODEL = aiModelConfig.default

const UNKNOWN_ANSWER_TOKEN = 'UNKNOWN_ANSWER'
const SETTINGS_REFRESH_MS = 30 * 1000
const SETTINGS_KEYS = {
  systemPromptTemplate: 'SYSTEM_PROMPT_TEMPLATE',
  unknownAnswerCleanText: 'UNKNOWN_ANSWER_CLEAN_TEXT'
}
const DEFAULT_SYSTEM_PROMPT_TEMPLATE = `As 194964 Support
  [LANGUAGE PROTOCOL]
  - ALWAYS identify the user's input language first
  - Respond in the SAME language as the user's last message (e.g., if asked in English, reply in English)
  - DO NOT start your response with "You asked in..." or "Translated from..."
  - DO NOT provide any meta-commentary about the language
  - The FAQ DATA below is in Japanese. You must TRANSLATE the relevant information into the user's language accurately
  - Do NOT reply in Japanese unless the user asks in Japanese

  [FAQ DATA]
  {{FAQ_DATA}}

 [BEHAVIOR RULES]
  1. Use the FAQ DATA to answer
  2. If not in FAQ, only say: "UNKNOWN_ANSWER"
  3. Politeness: Friendly & human-like
  4. Do NOT use <think> tags in your response
  `
const DEFAULT_UNKNOWN_ANSWER_CLEAN_TEXT = '申し訳ございませんが、この情報についてはLINE（@194964）を通じて弊社スタッフに直接お問い合わせいただくことをお勧めします。'

// System prompt/runtime text cache (refreshes from DB periodically)
let SYSTEM_PROMPT = null
let UNKNOWN_ANSWER_CLEAN_TEXT = DEFAULT_UNKNOWN_ANSWER_CLEAN_TEXT
let _settingsExpiresAt = 0

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

function buildSystemPrompt (template, rows) {
  const faqText = rows
    .map(item => `#${item.category}\nQ:${item.question}\nA:${item.answer}`)
    .join('\n')

  return template.replace('{{FAQ_DATA}}', faqText)
}

async function getOrCreateSetting (key, defaultValue) {
  const record = await prisma.appSetting.upsert({
    where: { key },
    update: {},
    create: { key, value: defaultValue }
  })
  return record.value
}

async function refreshRuntimeTextConfig (force = false) {
  const now = Date.now()
  if (!force && SYSTEM_PROMPT && now < _settingsExpiresAt) return

  const [template, unknownAnswerText, rows] = await Promise.all([
    getOrCreateSetting(SETTINGS_KEYS.systemPromptTemplate, DEFAULT_SYSTEM_PROMPT_TEMPLATE),
    getOrCreateSetting(SETTINGS_KEYS.unknownAnswerCleanText, DEFAULT_UNKNOWN_ANSWER_CLEAN_TEXT),
    prisma.knowledgeBase.findMany({ where: { isActive: true } })
  ])

  const nextSystemPrompt = buildSystemPrompt(template, rows)
  if (SYSTEM_PROMPT && SYSTEM_PROMPT !== nextSystemPrompt) {
    _geminiCaches.clear()
  }

  SYSTEM_PROMPT = nextSystemPrompt
  UNKNOWN_ANSWER_CLEAN_TEXT = unknownAnswerText
  _settingsExpiresAt = now + SETTINGS_REFRESH_MS
}

const app = Fastify({ logger: true })

await app.register(cors, {
  origin: true,
  methods: ['GET', 'POST', 'PATCH', 'OPTIONS']
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

  await refreshRuntimeTextConfig()

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
    const t0 = Date.now()

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
      const isNoAnswer = isNoAnswerResponse(text)
      let reply = cleanResponse(text)
      if (isNoAnswer) await addPendingReviewForNoAnswer(message, reply)
      const interactionId = await logInteraction({ modelId, message, reply, responseTime: Date.now() - t0,
        inputTokens: response.usage?.input_tokens, outputTokens: response.usage?.output_tokens })
      
      return { reply, model: modelId, interactionId }
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
        const isNoAnswer = isNoAnswerResponse(response.text)
        let reply = cleanResponse(response.text)
        const interactionId = await logInteraction({ modelId, message, reply, responseTime: Date.now() - t0,
          inputTokens: response.usageMetadata?.promptTokenCount,
          outputTokens: response.usageMetadata?.candidatesTokenCount })
        if (isNoAnswer) await addPendingReviewForNoAnswer(message, reply)
        return { reply, model: modelId, interactionId }
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
    const isNoAnswer = isNoAnswerResponse(completion.choices[0].message.content)
    let reply = cleanResponse(completion.choices[0].message.content)
    if (isNoAnswer) await addPendingReviewForNoAnswer(message, reply)
    const interactionId = await logInteraction({ modelId, message, reply, responseTime: Date.now() - t0,
      inputTokens: completion.usage?.prompt_tokens,
      outputTokens: completion.usage?.completion_tokens })
    
    return { reply, model: modelId, interactionId }
  } catch (err) {
    app.log.error({ err }, 'AI request failed')
    return reply.code(500).send({ error: 'AI service error', detail: err.message })
  }
})

app.patch('/api/feedback/:id', async (request, reply) => {
  const id = parseInt(request.params.id, 10)
  const { isThumbUp } = request.body
  if (isNaN(id) || typeof isThumbUp !== 'boolean') {
    return reply.code(400).send({ error: 'Invalid request' })
  }
  await prisma.interaction.update({ where: { id }, data: { isThumbUp } })
  return { ok: true }
})

app.get('/health', async () => ({ status: 'ok' }))

const port = process.env.PORT || 3001
await refreshRuntimeTextConfig(true)
await app.listen({ port, host: '0.0.0.0' })

async function logInteraction ({ modelId, message, reply, responseTime, inputTokens, outputTokens }) {
  try {
    const record = await prisma.interaction.create({
      data: {
        modelId,
        userQuestion: message,
        aiResponse:   reply,
        responseTime: responseTime ?? null,
        inputTokens:  inputTokens  ?? null,
        outputTokens: outputTokens ?? null
      }
    })
    return record.id
  } catch (err) {
    app.log.warn({ err }, 'Failed to log interaction')
    return null
  }
}

async function addPendingReviewForNoAnswer (question, aiResponse) {
  try {
    await prisma.pendingReview.create({
      data: {
        question,
        aiResponse,
        source: 'UNKNOWN_ANSWER'
      }
    })
  } catch (err) {
    app.log.warn({ err }, 'Failed to add pending review for unknown answer')
  }
}

function isNoAnswerResponse (text) {
  if (typeof text !== 'string') return false
  const cleaned = text.replace(/<think>[\s\S]*?<\/think>/g, '').trim()
  return cleaned === UNKNOWN_ANSWER_TOKEN
}

function cleanResponse(text) {
  if (typeof text !== 'string') return ''
  let cleaned = text.replace(/<think>[\s\S]*?<\/think>/g, '').trim()
  if (cleaned === UNKNOWN_ANSWER_TOKEN) {
    cleaned = UNKNOWN_ANSWER_CLEAN_TEXT
  }
  return cleaned
}