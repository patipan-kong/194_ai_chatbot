import Fastify from 'fastify'
import cors from '@fastify/cors'
import rateLimit from '@fastify/rate-limit'
import OpenAI from 'openai'
import { GoogleGenAI } from '@google/genai'
import Anthropic from '@anthropic-ai/sdk'
import { PrismaClient } from './generated/prisma/index.js'
import { PrismaPg } from '@prisma/adapter-pg'
import { registerAdminRoutes } from './admin-routes.js'
import { readFileSync, writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import 'dotenv/config'

const __dirname = dirname(fileURLToPath(import.meta.url))

const _pgAdapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter: _pgAdapter })

const AI_MODEL_CONFIG_PATH = join(__dirname, 'ai-model.json')
let aiModelConfig = JSON.parse(readFileSync(AI_MODEL_CONFIG_PATH, 'utf-8'))
const MODELS = aiModelConfig.models
const PROVIDERS = aiModelConfig.providers
let DEFAULT_MODEL = aiModelConfig.default
const DEFAULT_CHAT_SETTINGS = {
  maxMessageChars: 2000,
  rateLimit: { max: 30, timeWindow: '1 minute' }
}
const DEFAULT_ALERT_SETTINGS = {
  dailyCostThreshold: 5,
  monthlyCostThreshold: 100,
  pendingReviewThreshold: 20,
  notifyTarget: 'dashboard'
}
let CHAT_SETTINGS = normalizeChatSettings(aiModelConfig.chat)
let ALERT_SETTINGS = normalizeAlertSettings(aiModelConfig.alerts)

const UNKNOWN_ANSWER_TOKEN = 'UNKNOWN_ANSWER'
const SETTINGS_REFRESH_MS = 30 * 1000
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
const SYSTEM_CREATED_BY = 'system'
const DEFAULT_UNKNOWN_ANSWER_CLEAN_TEXT = '申し訳ございませんが、この情報についてはLINE（@194964）を通じて弊社スタッフに直接お問い合わせいただくことをお勧めします。'+"We apologize, but we recommend that you contact our staff directly via LINE (@194964) regarding this information."

// System prompt/runtime text cache (refreshes from DB periodically)
let SYSTEM_PROMPT = null
let UNKNOWN_ANSWER_CLEAN_TEXT = DEFAULT_UNKNOWN_ANSWER_CLEAN_TEXT
let ACTIVE_SYSTEM_SETTING_ID = 1
let _settingsExpiresAt = 0
let FAQ_EXACT_MAP = new Map()

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

function normalizeChatSettings (chat = {}) {
  const maxMessageChars = Number.isFinite(chat?.maxMessageChars) && chat.maxMessageChars > 0
    ? Math.floor(chat.maxMessageChars)
    : DEFAULT_CHAT_SETTINGS.maxMessageChars
  const max = Number.isFinite(chat?.rateLimit?.max) && chat.rateLimit.max > 0
    ? Math.floor(chat.rateLimit.max)
    : DEFAULT_CHAT_SETTINGS.rateLimit.max
  const timeWindow = typeof chat?.rateLimit?.timeWindow === 'string' && chat.rateLimit.timeWindow.trim()
    ? chat.rateLimit.timeWindow.trim()
    : DEFAULT_CHAT_SETTINGS.rateLimit.timeWindow
  return { maxMessageChars, rateLimit: { max, timeWindow } }
}

function normalizeAlertSettings (alerts = {}) {
  const daily = Number(alerts?.dailyCostThreshold)
  const monthly = Number(alerts?.monthlyCostThreshold)
  const pending = Number(alerts?.pendingReviewThreshold)
  const notifyTarget = typeof alerts?.notifyTarget === 'string' && alerts.notifyTarget.trim()
    ? alerts.notifyTarget.trim()
    : DEFAULT_ALERT_SETTINGS.notifyTarget

  return {
    dailyCostThreshold: Number.isFinite(daily) && daily >= 0 ? daily : DEFAULT_ALERT_SETTINGS.dailyCostThreshold,
    monthlyCostThreshold: Number.isFinite(monthly) && monthly >= 0 ? monthly : DEFAULT_ALERT_SETTINGS.monthlyCostThreshold,
    pendingReviewThreshold: Number.isFinite(pending) && pending >= 0 ? pending : DEFAULT_ALERT_SETTINGS.pendingReviewThreshold,
    notifyTarget
  }
}

function persistAiModelConfig () {
  writeFileSync(AI_MODEL_CONFIG_PATH, `${JSON.stringify(aiModelConfig, null, 2)}\n`, 'utf-8')
}

function updateAlertSettings (patch = {}) {
  const next = normalizeAlertSettings({ ...ALERT_SETTINGS, ...patch })
  aiModelConfig = { ...aiModelConfig, alerts: next }
  ALERT_SETTINGS = next
  persistAiModelConfig()
  return ALERT_SETTINGS
}

function setDefaultModel (modelId) {
  const nextModel = String(modelId || '').trim()
  if (!nextModel) return DEFAULT_MODEL
  if (!MODELS.some(model => model.id === nextModel)) return DEFAULT_MODEL
  aiModelConfig = { ...aiModelConfig, default: nextModel }
  DEFAULT_MODEL = nextModel
  persistAiModelConfig()
  return DEFAULT_MODEL
}

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
  console.log(`Building system prompt with ${rows.length} active FAQ items`)
  const safeTemplate = typeof template === 'string' && template.trim()
    ? template
    : DEFAULT_SYSTEM_PROMPT_TEMPLATE

  if (safeTemplate.includes('{{FAQ_DATA}}')) {
    return safeTemplate.replace('{{FAQ_DATA}}', faqText)
  }

  // Backward-compatible fallback: if placeholder is missing, append FAQ block.
  return `${safeTemplate.trim()}\n\n[FAQ DATA]\n${faqText}`
}

function normalizeFaqKey (text) {
  if (typeof text !== 'string') return ''

  // NFKC makes full-width/half-width forms comparable (important for Japanese input).
  const normalized = text
    .normalize('NFKC')
    .toLowerCase()
    .trim()
    .replace(/[\p{P}\p{S}]/gu, ' ')
    .replace(/\s+/g, ' ')

  return normalized
}

function findExactFaqAnswer (question) {
  const key = normalizeFaqKey(question)
  if (!key) return null
  return FAQ_EXACT_MAP.get(key) || null
}

async function getOrCreateActiveSystemSetting () {
  const active = await prisma.systemSetting.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: 'desc' }
  })
  if (active) return active

  return prisma.systemSetting.create({
    data: {
      version: 1,
      systemPromptTemplate: DEFAULT_SYSTEM_PROMPT_TEMPLATE,
      unknownAnswerCleanText: DEFAULT_UNKNOWN_ANSWER_CLEAN_TEXT,
      isActive: true,
      createdBy: SYSTEM_CREATED_BY
    }
  })
}

async function refreshRuntimeTextConfig (force = false) {
  const now = Date.now()
  if (!force && SYSTEM_PROMPT && now < _settingsExpiresAt) return

  const [setting, rows] = await Promise.all([
    getOrCreateActiveSystemSetting(),
    prisma.knowledgeBase.findMany({
      where: { status: 'PUBLISHED', isDelete: false },
      orderBy: { updatedAt: 'desc' }
    })
  ])

  const nextSystemPrompt = buildSystemPrompt(setting.systemPromptTemplate, rows)
  if (SYSTEM_PROMPT && SYSTEM_PROMPT !== nextSystemPrompt) {
    _geminiCaches.clear()
  }

  SYSTEM_PROMPT = nextSystemPrompt
  UNKNOWN_ANSWER_CLEAN_TEXT = setting.unknownAnswerCleanText
  ACTIVE_SYSTEM_SETTING_ID = setting.id
  FAQ_EXACT_MAP = new Map(
    rows
      .map(item => [normalizeFaqKey(item.question), item.answer])
      .filter(([key, answer]) => key && typeof answer === 'string' && answer.trim())
  )
  _settingsExpiresAt = now + SETTINGS_REFRESH_MS
}

const app = Fastify({ logger: true })

await app.register(cors, {
  origin: true,
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS']
})
await app.register(rateLimit, {
  global: false,
  addHeaders: {
    'x-ratelimit-limit': true,
    'x-ratelimit-remaining': true,
    'x-ratelimit-reset': true
  }
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

await registerAdminRoutes(app, prisma, MODELS, refreshRuntimeTextConfig, {
  getAlertSettings: () => ({ ...ALERT_SETTINGS }),
  updateAlertSettings,
  getDefaultModel: () => DEFAULT_MODEL,
  setDefaultModel,
  runPromptPlaygroundTest
})

function validateChatRequestPayload (rawBody = {}) {
  const modelId = rawBody.model || DEFAULT_MODEL
  const message = typeof rawBody.message === 'string' ? rawBody.message.trim() : ''

  if (!message) return { error: 'message is required' }
  if (message.length > CHAT_SETTINGS.maxMessageChars) {
    return { error: `message exceeds max length (${CHAT_SETTINGS.maxMessageChars})` }
  }

  const modelConfig = MODELS.find(m => m.id === modelId)
  if (!modelConfig) return { error: `Unknown model: ${modelId}` }

  const envKey = PROVIDERS[modelConfig.provider]?.envKey
  if (!envKey || !process.env[envKey]) {
    return { error: `${envKey} is not set in .env`, statusCode: 500 }
  }

  return {
    modelId,
    userId: rawBody.userId,
    message,
    modelConfig,
    apiModelId: modelConfig.apiModel || modelId
  }
}

async function streamTextChunks (text, onToken) {
  if (typeof text !== 'string' || !text) return
  const chunks = text.match(/.{1,48}/g) || []
  for (const chunk of chunks) {
    await onToken(chunk)
  }
}

async function generateChatResponse ({ message, modelId, userId, modelConfig, apiModelId, onToken }) {
  const t0 = Date.now()

  const exactFaqAnswer = findExactFaqAnswer(message)
  if (exactFaqAnswer) {
    const reply = cleanResponse(exactFaqAnswer)
    if (onToken) await streamTextChunks(reply, onToken)
    const interactionMeta = await logInteraction({
      userId,
      modelId,
      message,
      reply,
      responseTime: Date.now() - t0
    })
    const interactionId = interactionMeta?.id || null
    return { reply, model: modelId, interactionId }
  }

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
    const reply = cleanResponse(text)
    if (onToken) await streamTextChunks(reply, onToken)
    const interactionMeta = await logInteraction({
      userId,
      modelId,
      message,
      reply,
      responseTime: Date.now() - t0,
      inputTokens: response.usage?.input_tokens,
      outputTokens: response.usage?.output_tokens
    })
    const interactionId = interactionMeta?.id || null
    if (isNoAnswer) await addPendingReviewForNoAnswer(message, reply, interactionId)
    return { reply, model: modelId, interactionId }
  }

  if (modelConfig.provider === 'gemini' && modelId.includes('2.5')) {
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
      const reply = cleanResponse(response.text)
      if (onToken) await streamTextChunks(reply, onToken)
      const interactionMeta = await logInteraction({
        userId,
        modelId,
        message,
        reply,
        responseTime: Date.now() - t0,
        inputTokens: response.usageMetadata?.promptTokenCount,
        outputTokens: response.usageMetadata?.candidatesTokenCount
      })
      const interactionId = interactionMeta?.id || null
      if (isNoAnswer) await addPendingReviewForNoAnswer(message, reply, interactionId)
      return { reply, model: modelId, interactionId }
    } catch (cacheErr) {
      app.log.warn({ cacheErr }, 'Gemini context cache unavailable, falling back')
      _geminiCaches.delete(apiModelId)
    }
  }

  const client = getClient(modelConfig.provider)
  if (onToken) {
    let streamedText = ''
    const completion = await client.chat.completions.create({
      model: apiModelId,
      temperature: modelConfig.temperature,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: message }
      ],
      stream: true
    })

    for await (const chunk of completion) {
      const delta = chunk.choices?.[0]?.delta?.content || ''
      if (!delta) continue
      streamedText += delta
      await onToken(delta)
    }

    const isNoAnswer = isNoAnswerResponse(streamedText)
    const reply = cleanResponse(streamedText)
    const interactionMeta = await logInteraction({ userId, modelId, message, reply, responseTime: Date.now() - t0 })
    const interactionId = interactionMeta?.id || null
    if (isNoAnswer) await addPendingReviewForNoAnswer(message, reply, interactionId)
    return { reply, model: modelId, interactionId }
  }

  const completion = await client.chat.completions.create({
    model: apiModelId,
    temperature: modelConfig.temperature,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: message }
    ]
  })
  const isNoAnswer = isNoAnswerResponse(completion.choices[0].message.content)
  const reply = cleanResponse(completion.choices[0].message.content)
  const interactionMeta = await logInteraction({
    userId,
    modelId,
    message,
    reply,
    responseTime: Date.now() - t0,
    inputTokens: completion.usage?.prompt_tokens,
    outputTokens: completion.usage?.completion_tokens
  })
  const interactionId = interactionMeta?.id || null
  if (isNoAnswer) await addPendingReviewForNoAnswer(message, reply, interactionId)
  return { reply, model: modelId, interactionId }
}

async function runPromptPlaygroundTest ({ question, promptTemplate, settingId, modelIds, changedBy }) {
  const selectedSetting = settingId
    ? await prisma.systemSetting.findUnique({ where: { id: settingId } })
    : null
  const activeSetting = selectedSetting || await getOrCreateActiveSystemSetting()

  const rows = await prisma.knowledgeBase.findMany({
    where: { status: 'PUBLISHED', isDelete: false },
    orderBy: { updatedAt: 'desc' }
  })

  const promptSource = typeof promptTemplate === 'string' && promptTemplate.trim()
    ? promptTemplate
    : activeSetting.systemPromptTemplate
  const systemPrompt = buildSystemPrompt(promptSource, rows)
  const unknownAnswerCleanText = activeSetting.unknownAnswerCleanText
  const userId = `playground:${changedBy || 'admin'}`
  const results = []

  for (const modelId of modelIds) {
    const modelConfig = MODELS.find(m => m.id === modelId)
    if (!modelConfig) {
      results.push({ modelId, error: `Unknown model: ${modelId}` })
      continue
    }

    const envKey = PROVIDERS[modelConfig.provider]?.envKey
    if (!envKey || !process.env[envKey]) {
      results.push({ modelId, error: `${envKey} is not set in .env` })
      continue
    }

    const apiModelId = modelConfig.apiModel || modelId
    const t0 = Date.now()

    try {
      let text = ''
      let inputTokens = null
      let outputTokens = null

      if (modelConfig.provider === 'anthropic') {
        const response = await _anthropicClient.messages.create({
          model: apiModelId,
          system: systemPrompt,
          temperature: modelConfig.temperature,
          max_tokens: 1024,
          messages: [{ role: 'user', content: question }]
        })
        text = response.content
          .filter(block => block.type === 'text')
          .map(block => block.text)
          .join('\n')
        inputTokens = response.usage?.input_tokens ?? null
        outputTokens = response.usage?.output_tokens ?? null
      } else if (modelConfig.provider === 'gemini' && modelId.includes('2.5')) {
        const response = await _geminiAi.models.generateContent({
          model: apiModelId,
          config: { systemInstruction: systemPrompt, temperature: modelConfig.temperature },
          contents: [{ role: 'user', parts: [{ text: question }] }]
        })
        text = response.text || ''
        inputTokens = response.usageMetadata?.promptTokenCount ?? null
        outputTokens = response.usageMetadata?.candidatesTokenCount ?? null
      } else {
        const client = getClient(modelConfig.provider)
        const completion = await client.chat.completions.create({
          model: apiModelId,
          temperature: modelConfig.temperature,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: question }
          ]
        })
        text = completion.choices[0]?.message?.content || ''
        inputTokens = completion.usage?.prompt_tokens ?? null
        outputTokens = completion.usage?.completion_tokens ?? null
      }

      const responseTime = Date.now() - t0
      const answer = cleanResponse(text, unknownAnswerCleanText)
      const interactionMeta = await logInteraction({
        userId,
        modelId,
        message: question,
        reply: answer,
        responseTime,
        inputTokens,
        outputTokens,
        settingId: activeSetting.id
      })

      results.push({
        modelId,
        answer,
        latencyMs: responseTime,
        cost: interactionMeta?.cost || 0,
        interactionId: interactionMeta?.id || null
      })
    } catch (err) {
      app.log.error({ err, modelId }, 'Prompt playground test failed')
      results.push({ modelId, error: err.message || 'Model execution failed' })
    }
  }

  let historyId = null
  try {
    const history = await prisma.promptPlaygroundRun.create({
      data: {
        question,
        promptTemplate: promptSource,
        selectedModels: modelIds,
        result: results,
        createdBy: changedBy || 'admin'
      }
    })
    historyId = history.id
  } catch (err) {
    app.log.warn({ err }, 'Failed to store prompt playground history')
  }

  return { items: results, historyId }
}

app.post('/api/chat', {
  config: {
    rateLimit: {
      max: CHAT_SETTINGS.rateLimit.max,
      timeWindow: CHAT_SETTINGS.rateLimit.timeWindow
    }
  }
}, async (request, reply) => {
  const validated = validateChatRequestPayload(request.body || {})
  if (validated.error) {
    return reply.code(validated.statusCode || 400).send({ error: validated.error })
  }

  await refreshRuntimeTextConfig()

  try {
    const result = await generateChatResponse(validated)
    return result
  } catch (err) {
    app.log.error({ err }, 'AI request failed')
    return reply.code(500).send({ error: 'AI service error', detail: err.message })
  }
})

app.post('/api/chat/stream', {
  config: {
    rateLimit: {
      max: CHAT_SETTINGS.rateLimit.max,
      timeWindow: CHAT_SETTINGS.rateLimit.timeWindow
    }
  }
}, async (request, reply) => {
  const validated = validateChatRequestPayload(request.body || {})
  if (validated.error) {
    return reply.code(validated.statusCode || 400).send({ error: validated.error })
  }

  await refreshRuntimeTextConfig()

  reply.raw.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
  reply.raw.setHeader('Cache-Control', 'no-cache, no-transform')
  reply.raw.setHeader('Connection', 'keep-alive')

  const writeSse = (event, data) => {
    reply.raw.write(`event: ${event}\n`)
    reply.raw.write(`data: ${JSON.stringify(data)}\n\n`)
  }

  try {
    const result = await generateChatResponse({
      ...validated,
      onToken: async token => writeSse('token', { token })
    })
    writeSse('done', result)
  } catch (err) {
    app.log.error({ err }, 'Streaming AI request failed')
    writeSse('error', { error: 'AI service error', detail: err.message })
  } finally {
    reply.raw.end()
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
app.get('/api/health', async () => {
  let dbStatus = 'ok'
  let dbError = null

  try {
    await prisma.$queryRaw`SELECT 1`
  } catch (err) {
    dbStatus = 'error'
    dbError = err.message
  }

  const configStatus = MODELS.length && DEFAULT_MODEL ? 'ok' : 'error'
  const status = dbStatus === 'ok' && configStatus === 'ok' ? 'ok' : 'degraded'

  return {
    status,
    uptimeSec: Math.round(process.uptime()),
    checks: {
      database: { status: dbStatus, error: dbError },
      modelConfig: {
        status: configStatus,
        modelCount: MODELS.length,
        defaultModel: DEFAULT_MODEL,
        chat: CHAT_SETTINGS,
        alerts: ALERT_SETTINGS
      }
    }
  }
})

const port = process.env.PORT || 3001
await refreshRuntimeTextConfig(true)
await app.listen({ port, host: '0.0.0.0' })

async function logInteraction ({ userId, modelId, message, reply, responseTime, inputTokens, outputTokens, settingId }) {
  try {
    const cost = calculateInteractionCost({ modelId, inputTokens, outputTokens })
    const record = await prisma.interaction.create({
      data: {
        userId:       userId || 'anonymous',
        settingId:    settingId || ACTIVE_SYSTEM_SETTING_ID || 1,
        modelId,
        userQuestion: message,
        aiResponse:   reply,
        responseTime: responseTime ?? null,
        inputTokens:  inputTokens  ?? null,
        outputTokens: outputTokens ?? null,
        cost
      }
    })
    return {
      id: record.id,
      cost,
      inputTokens: inputTokens ?? null,
      outputTokens: outputTokens ?? null,
      responseTime: responseTime ?? null
    }
  } catch (err) {
    app.log.warn({ err }, 'Failed to log interaction')
    return null
  }
}

function calculateInteractionCost ({ modelId, inputTokens, outputTokens }) {
  const model = MODELS.find(m => m.id === modelId)
  const inputPricePer1M = model?.cost?.token_1m?.input
  const outputPricePer1M = model?.cost?.token_1m?.output

  if (typeof inputPricePer1M !== 'number' || typeof outputPricePer1M !== 'number') {
    return 0
  }

  const inputPrice = inputPricePer1M / 1_000_000
  const outputPrice = outputPricePer1M / 1_000_000
  const inTokens = Number.isFinite(inputTokens) ? inputTokens : 0
  const outTokens = Number.isFinite(outputTokens) ? outputTokens : 0

  return (inTokens * inputPrice) + (outTokens * outputPrice)
}

async function addPendingReviewForNoAnswer (question, aiResponse, interactionId) {
  try {
    await prisma.pendingReview.create({
      data: {
        question,
        aiResponse,
        source: 'UNKNOWN_ANSWER',
        ...(interactionId ? { interactionId } : {})
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

function cleanResponse(text, unknownAnswerCleanText = UNKNOWN_ANSWER_CLEAN_TEXT) {
  if (typeof text !== 'string') return ''
  let cleaned = text.replace(/<think>[\s\S]*?<\/think>/g, '').trim()
  if (cleaned === UNKNOWN_ANSWER_TOKEN) {
    cleaned = unknownAnswerCleanText
  }
  return cleaned
}