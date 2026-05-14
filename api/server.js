import Fastify from 'fastify'
import cors from '@fastify/cors'
import rateLimit from '@fastify/rate-limit'
import OpenAI from 'openai'
import { GoogleGenAI } from '@google/genai'
import Anthropic from '@anthropic-ai/sdk'
import { PrismaClient } from './generated/prisma/index.js'
import { PrismaPg } from '@prisma/adapter-pg'
import { registerAdminRoutes } from './admin-routes.js'
import { calculateInteractionCost } from './utils.js'
import { chatRequestSchema, feedbackRequestSchema, formatZodError } from './validation.js'
import { readFileSync, writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import 'dotenv/config'

const __dirname = dirname(fileURLToPath(import.meta.url))

const _pgAdapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter: _pgAdapter })

function parseAllowedOrigins (value, fallback = []) {
  if (typeof value !== 'string' || !value.trim()) return fallback
  return value
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
}

const DEFAULT_PUBLIC_ORIGINS = ['http://localhost:5173']
const DEFAULT_ADMIN_ORIGINS = ['http://localhost:3100']
const PUBLIC_CORS_ORIGINS = parseAllowedOrigins(process.env.CORS_ALLOWED_ORIGINS, DEFAULT_PUBLIC_ORIGINS)
const ADMIN_CORS_ORIGINS = parseAllowedOrigins(process.env.ADMIN_CORS_ALLOWED_ORIGINS, DEFAULT_ADMIN_ORIGINS)

function isAllowedOrigin (origin, allowedOrigins = []) {
  if (!origin) return false
  return allowedOrigins.includes(origin)
}

function resolveCorsOriginForRequest (request) {
  const origin = request.headers.origin
  const routePath = request.raw.url || ''
  const isAdminRoute = routePath === '/api/admin' || routePath.startsWith('/api/admin/')

  if (!origin) return false
  if (isAdminRoute) return isAllowedOrigin(origin, ADMIN_CORS_ORIGINS)
  return isAllowedOrigin(origin, PUBLIC_CORS_ORIGINS)
}

const AI_MODEL_CONFIG_PATH = join(__dirname, 'ai-model.json')
const AI_MODEL_RUNTIME_PATH = join(__dirname, 'ai-model.runtime.json')
const aiModelConfig = JSON.parse(readFileSync(AI_MODEL_CONFIG_PATH, 'utf-8'))
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
loadRuntimeState()

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
let UNKNOWN_ANSWER_CLEAN_TEXT = DEFAULT_UNKNOWN_ANSWER_CLEAN_TEXT
let ACTIVE_SYSTEM_SETTING_ID = 1
let _settingsExpiresAt = 0
const RUNTIME_AUDIENCE_MEMBER = 'member'
const RUNTIME_AUDIENCE_PUBLIC = 'public'
let RUNTIME_FAQ_CONFIG = {
  [RUNTIME_AUDIENCE_MEMBER]: { systemPrompt: null, exactMap: new Map() },
  [RUNTIME_AUDIENCE_PUBLIC]: { systemPrompt: null, exactMap: new Map() }
}

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
const GEMINI_CACHE_BYPASS_MODELS = new Set(['gemini-3.1-flash-lite-preview'])
const GEMINI_CACHE_REFRESH_MS = 55 * 60 * 1000
const _geminiAi = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
const _geminiCaches = new Map()
const _anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

function isProviderConfigured (provider) {
  const envKey = PROVIDERS[provider]?.envKey
  return Boolean(envKey && process.env[envKey])
}

function isGeminiLocationUnsupportedError (err) {
  const message = typeof err?.message === 'string' ? err.message : ''
  return /User location is not supported for the API use/i.test(message)
}

function findFallbackModel (excludedProviders = []) {
  return MODELS.find(model => !excludedProviders.includes(model.provider) && isProviderConfigured(model.provider)) || null
}

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

function persistRuntimeState () {
  writeFileSync(AI_MODEL_RUNTIME_PATH, `${JSON.stringify({ default: DEFAULT_MODEL, alerts: ALERT_SETTINGS }, null, 2)}\n`, 'utf-8')
}

function loadRuntimeState () {
  try {
    const runtime = JSON.parse(readFileSync(AI_MODEL_RUNTIME_PATH, 'utf-8'))
    if (runtime.default && MODELS.some(m => m.id === runtime.default)) {
      DEFAULT_MODEL = runtime.default
    }
    if (runtime.alerts) {
      ALERT_SETTINGS = normalizeAlertSettings({ ...ALERT_SETTINGS, ...runtime.alerts })
    }
  } catch {
    // No runtime file yet; defaults from ai-model.json are used
  }
}

function updateAlertSettings (patch = {}) {
  ALERT_SETTINGS = normalizeAlertSettings({ ...ALERT_SETTINGS, ...patch })
  persistRuntimeState()
  return ALERT_SETTINGS
}

function setDefaultModel (modelId) {
  const nextModel = String(modelId || '').trim()
  if (!nextModel) return DEFAULT_MODEL
  if (!MODELS.some(model => model.id === nextModel)) return DEFAULT_MODEL
  DEFAULT_MODEL = nextModel
  persistRuntimeState()
  return DEFAULT_MODEL
}

function validateStartupEnv () {
  const errors = []
  if (!process.env.DATABASE_URL) {
    errors.push('DATABASE_URL is required')
  }
  const configuredProviders = Object.keys(PROVIDERS).filter(p => isProviderConfigured(p))
  if (configuredProviders.length === 0) {
    errors.push(`No AI provider API keys configured. Set at least one of: ${Object.values(PROVIDERS).map(p => p.envKey).join(', ')}`)
  }
  if (errors.length) {
    for (const err of errors) console.error(`[startup] FATAL: ${err}`)
    process.exit(1)
  }
  const defaultModelConfig = MODELS.find(m => m.id === DEFAULT_MODEL)
  if (defaultModelConfig && !isProviderConfigured(defaultModelConfig.provider)) {
    console.warn(`[startup] WARNING: default model "${DEFAULT_MODEL}" uses provider "${defaultModelConfig.provider}" (${PROVIDERS[defaultModelConfig.provider]?.envKey} not set)`)
  }
}

async function getGeminiCachedContent (modelId, systemPrompt) {
  if (GEMINI_CACHE_BYPASS_MODELS.has(modelId)) return null

  const now = Date.now()
  const existing = _geminiCaches.get(modelId)
  if (existing && now < existing.expiresAt) return existing

  const cache = await _geminiAi.caches.create({
    model: modelId,
    config: { systemInstruction: systemPrompt, ttl: '3600s' }
  })

  const cacheEntry = {
    ai: _geminiAi,
    cacheName: cache.name,
    expiresAt: now + GEMINI_CACHE_REFRESH_MS
  }
  _geminiCaches.set(modelId, cacheEntry)
  return cacheEntry
}

// Strips content from FAQ fields that could be interpreted as system-prompt instructions.
// Guards against: template placeholder re-injection ({{...}}) and bracket-style section
// headers ([ALL CAPS]) that match the format used by the system prompt template itself.
function sanitizeFaqField (text) {
  if (typeof text !== 'string') return ''
  return text
    .replace(/\{\{[^}]*\}\}/g, '')
    .replace(/^\[([A-Z][A-Z\s]*)\][ \t]*$/gm, '($1)')
    .trim()
}

function buildSystemPrompt (template, rows) {
  const faqText = rows
    .map(item => {
      const categoryName = sanitizeFaqField(item?.categoryRef?.name || item?.category || 'General')
      const question = sanitizeFaqField(item.question)
      const answer = sanitizeFaqField(item.answer)
      return `#${categoryName}\nQ:${question}\nA:${answer}`
    })
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

function findExactFaqAnswer (question, exactMap) {
  const key = normalizeFaqKey(question)
  if (!key) return null
  return exactMap?.get(key) || null
}

function is194MemberUser (userId) {
  return String(userId || '').startsWith('194964:')
}

function getRuntimeFaqConfigForUser (userId) {
  return is194MemberUser(userId)
    ? RUNTIME_FAQ_CONFIG[RUNTIME_AUDIENCE_MEMBER]
    : RUNTIME_FAQ_CONFIG[RUNTIME_AUDIENCE_PUBLIC]
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
  if (!force && RUNTIME_FAQ_CONFIG[RUNTIME_AUDIENCE_PUBLIC]?.systemPrompt && now < _settingsExpiresAt) return

  const [setting, publicRows, memberRows] = await Promise.all([
    getOrCreateActiveSystemSetting(),
    prisma.knowledgeBase.findMany({
      where: {
        status: 'PUBLISHED',
        isDelete: false,
        categoryRef: { for194Member: false }
      },
      include: { categoryRef: true },
      orderBy: { updatedAt: 'desc' }
    }),
    prisma.knowledgeBase.findMany({
      where: {
        status: 'PUBLISHED',
        isDelete: false,
        categoryRef: { for194Member: true }
      },
      include: { categoryRef: true },
      orderBy: { updatedAt: 'desc' }
    })
  ])

  const nextPublicSystemPrompt = buildSystemPrompt(setting.systemPromptTemplate, publicRows)
  const nextMemberSystemPrompt = buildSystemPrompt(setting.systemPromptTemplate, memberRows)
  const prevPublicSystemPrompt = RUNTIME_FAQ_CONFIG[RUNTIME_AUDIENCE_PUBLIC]?.systemPrompt
  const prevMemberSystemPrompt = RUNTIME_FAQ_CONFIG[RUNTIME_AUDIENCE_MEMBER]?.systemPrompt
  if ((prevPublicSystemPrompt && prevPublicSystemPrompt !== nextPublicSystemPrompt) ||
      (prevMemberSystemPrompt && prevMemberSystemPrompt !== nextMemberSystemPrompt)) {
    _geminiCaches.clear()
  }

  RUNTIME_FAQ_CONFIG = {
    [RUNTIME_AUDIENCE_PUBLIC]: {
      systemPrompt: nextPublicSystemPrompt,
      exactMap: new Map(
        publicRows
          .map(item => [normalizeFaqKey(item.question), item.fullAnswer || item.answer])
          .filter(([key, answer]) => key && typeof answer === 'string' && answer.trim())
      )
    },
    [RUNTIME_AUDIENCE_MEMBER]: {
      systemPrompt: nextMemberSystemPrompt,
      exactMap: new Map(
        memberRows
          .map(item => [normalizeFaqKey(item.question), item.fullAnswer || item.answer])
          .filter(([key, answer]) => key && typeof answer === 'string' && answer.trim())
      )
    }
  }

  UNKNOWN_ANSWER_CLEAN_TEXT = setting.unknownAnswerCleanText
  ACTIVE_SYSTEM_SETTING_ID = setting.id
  _settingsExpiresAt = now + SETTINGS_REFRESH_MS
}

const app = Fastify({ logger: true, trustProxy: true })

await app.register(cors, () => (request, cb) => {
  cb(null, {
    origin: resolveCorsOriginForRequest(request),
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS']
  })
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
  const parsed = chatRequestSchema.safeParse(rawBody)
  if (!parsed.success) {
    return { error: formatZodError(parsed.error) }
  }
  const { message, model, userId } = parsed.data

  if (message.length > CHAT_SETTINGS.maxMessageChars) {
    return { error: `message exceeds max length (${CHAT_SETTINGS.maxMessageChars})` }
  }

  const modelId = model || DEFAULT_MODEL
  const modelConfig = MODELS.find(m => m.id === modelId)
  if (!modelConfig) return { error: `Unknown model: ${modelId}` }

  const envKey = PROVIDERS[modelConfig.provider]?.envKey
  if (!isProviderConfigured(modelConfig.provider)) {
    return { error: `${envKey} is not set in .env`, statusCode: 500 }
  }

  return {
    modelId,
    userId,
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

async function generateGeminiResponse ({ apiModelId, message, systemPrompt, temperature, useCache = false }) {
  let cacheEntry = null

  if (useCache) {
    try {
      cacheEntry = await getGeminiCachedContent(apiModelId, systemPrompt)
    } catch (cacheErr) {
      // Cache creation can fail on some deployments; continue with non-cached Gemini request.
      cacheEntry = null
    }
  }

  try {
    const response = await _geminiAi.models.generateContent({
      model: apiModelId,
      config: cacheEntry
        ? { cachedContent: cacheEntry.cacheName, temperature }
        : { systemInstruction: systemPrompt, temperature },
      contents: [{ role: 'user', parts: [{ text: message }] }]
    })
    return response
  } catch (geminiErr) {
    if (cacheEntry) {
      _geminiCaches.delete(apiModelId)
      return _geminiAi.models.generateContent({
        model: apiModelId,
        config: { systemInstruction: systemPrompt, temperature },
        contents: [{ role: 'user', parts: [{ text: message }] }]
      })
    }
    throw geminiErr
  }
}

async function callAnthropicProvider ({ apiModelId, message, systemPrompt, temperature }) {
  const response = await _anthropicClient.messages.create({
    model: apiModelId,
    system: systemPrompt,
    temperature,
    max_tokens: 1024,
    messages: [{ role: 'user', content: message }]
  })

  const text = response.content
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('\n')

  return {
    text,
    inputTokens: response.usage?.input_tokens,
    outputTokens: response.usage?.output_tokens,
    alreadyStreamed: false
  }
}

async function callGeminiProvider ({ apiModelId, message, systemPrompt, temperature, useCache = false }) {
  const response = await generateGeminiResponse({
    apiModelId,
    message,
    systemPrompt,
    temperature,
    useCache
  })

  return {
    text: response.text || '',
    inputTokens: response.usageMetadata?.promptTokenCount,
    outputTokens: response.usageMetadata?.candidatesTokenCount,
    alreadyStreamed: false
  }
}

async function callOpenAiCompatibleProvider ({ provider, apiModelId, message, systemPrompt, temperature, onToken }) {
  const client = getClient(provider)

  if (onToken) {
    let streamedText = ''
    const completion = await client.chat.completions.create({
      model: apiModelId,
      temperature,
      messages: [
        { role: 'system', content: systemPrompt },
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

    return {
      text: streamedText,
      inputTokens: null,
      outputTokens: null,
      alreadyStreamed: true
    }
  }

  const completion = await client.chat.completions.create({
    model: apiModelId,
    temperature,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: message }
    ]
  })

  return {
    text: completion.choices?.[0]?.message?.content || '',
    inputTokens: completion.usage?.prompt_tokens,
    outputTokens: completion.usage?.completion_tokens,
    alreadyStreamed: false
  }
}

async function callProvider ({ provider, apiModelId, message, systemPrompt, temperature, onToken, useCache = false }) {
  if (provider === 'anthropic') {
    return callAnthropicProvider({ apiModelId, message, systemPrompt, temperature })
  }

  if (provider === 'gemini') {
    return callGeminiProvider({ apiModelId, message, systemPrompt, temperature, useCache })
  }

  return callOpenAiCompatibleProvider({ provider, apiModelId, message, systemPrompt, temperature, onToken })
}

async function generateChatResponse ({ message, modelId, userId, modelConfig, apiModelId, onToken }) {
  const t0 = Date.now()
  const runtimeFaqConfig = getRuntimeFaqConfigForUser(userId)
  const systemPrompt = runtimeFaqConfig?.systemPrompt || DEFAULT_SYSTEM_PROMPT_TEMPLATE
  const exactMap = runtimeFaqConfig?.exactMap || new Map()

  const exactFaqAnswer = findExactFaqAnswer(message, exactMap)
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

  let providerResult
  if (modelConfig.provider === 'gemini') {
    try {
      providerResult = await callProvider({
        provider: modelConfig.provider,
        apiModelId,
        message,
        systemPrompt,
        temperature: modelConfig.temperature,
        onToken,
        useCache: false
      })
    } catch (geminiErr) {
      if (isGeminiLocationUnsupportedError(geminiErr)) {
        const fallbackModel = findFallbackModel(['gemini'])
        if (fallbackModel) {
          app.log.warn({ modelId, fallbackModelId: fallbackModel.id }, 'Gemini unavailable in current deployment region, retrying with fallback model')
          return generateChatResponse({
            message,
            userId,
            modelId: fallbackModel.id,
            modelConfig: fallbackModel,
            apiModelId: fallbackModel.apiModel || fallbackModel.id,
            onToken
          })
        }

        const regionErr = new Error('Gemini is not available from the current deployment region and no fallback model is configured')
        regionErr.cause = geminiErr
        throw regionErr
      }

      app.log.error({ geminiErr, modelId }, 'Gemini native request failed')
      throw geminiErr
    }
  } else {
    providerResult = await callProvider({
      provider: modelConfig.provider,
      apiModelId,
      message,
      systemPrompt,
      temperature: modelConfig.temperature,
      onToken
    })
  }

  const isNoAnswer = isNoAnswerResponse(providerResult.text)
  const reply = cleanResponse(providerResult.text)
  if (onToken && !providerResult.alreadyStreamed) {
    await streamTextChunks(reply, onToken)
  }
  const interactionMeta = await logInteraction({
    userId,
    modelId,
    message,
    reply,
    responseTime: Date.now() - t0,
    inputTokens: providerResult.inputTokens,
    outputTokens: providerResult.outputTokens
  })
  const interactionId = interactionMeta?.id || null
  if (isNoAnswer) await addPendingReviewForNoAnswer(message, reply, interactionId)
  return { reply, model: modelId, interactionId }
}

async function runPromptPlaygroundTest ({ question, promptTemplate, settingId, modelIds, changedBy, audience = 'guest' }) {
  const selectedSetting = settingId
    ? await prisma.systemSetting.findUnique({ where: { id: settingId } })
    : null
  const activeSetting = selectedSetting || await getOrCreateActiveSystemSetting()

  const isMember = audience === 'member'
  const rows = await prisma.knowledgeBase.findMany({
    where: {
      status: 'PUBLISHED',
      isDelete: false,
      categoryRef: { for194Member: isMember }
    },
    include: { categoryRef: true },
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
    if (!isProviderConfigured(modelConfig.provider)) {
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
      } else if (modelConfig.provider === 'gemini') {
        const response = await generateGeminiResponse({
          apiModelId,
          message: question,
          systemPrompt,
          temperature: modelConfig.temperature,
          useCache: modelId.includes('2.5')
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
  if (Number.isNaN(id) || id <= 0) {
    return reply.code(400).send({ error: 'Invalid id' })
  }
  const parsed = feedbackRequestSchema.safeParse(request.body || {})
  if (!parsed.success) {
    return reply.code(400).send({ error: formatZodError(parsed.error) })
  }
  await prisma.interaction.update({ where: { id }, data: { isThumbUp: parsed.data.isThumbUp } })
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

  const providerStatus = Object.fromEntries(
    Object.entries(PROVIDERS).map(([name, cfg]) => [
      name,
      { configured: isProviderConfigured(name), envKey: cfg.envKey }
    ])
  )
  const defaultModelConfig = MODELS.find(m => m.id === DEFAULT_MODEL)
  const defaultProviderReady = defaultModelConfig ? isProviderConfigured(defaultModelConfig.provider) : false
  const anyProviderReady = Object.values(providerStatus).some(p => p.configured)

  const configStatus = MODELS.length && DEFAULT_MODEL && defaultProviderReady ? 'ok'
    : anyProviderReady ? 'degraded'
    : 'error'
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
        defaultProviderReady,
        chat: CHAT_SETTINGS,
        alerts: ALERT_SETTINGS
      },
      providers: providerStatus
    }
  }
})

const port = process.env.PORT || 3001
validateStartupEnv()
await refreshRuntimeTextConfig(true)
await app.listen({ port, host: '0.0.0.0' })

async function logInteraction ({ userId, modelId, message, reply, responseTime, inputTokens, outputTokens, settingId }) {
  try {
    const cost = calculateInteractionCost(MODELS, { modelId, inputTokens, outputTokens })
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