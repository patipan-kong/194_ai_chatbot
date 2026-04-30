import Fastify from 'fastify'
import cors from '@fastify/cors'
import OpenAI from 'openai'
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

// Lazy-initialised OpenAI-compatible clients
function getClient (provider) {
  switch (provider) {
    case 'gemini':
      return new OpenAI({
        apiKey: process.env.GEMINI_API_KEY,
        baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/'
      })
    case 'openai':
      return new OpenAI({
        apiKey: process.env.OPENAI_API_KEY
      })
    case 'groq':
      return new OpenAI({
        apiKey: process.env.GROQ_API_KEY,
        baseURL: 'https://api.groq.com/openai/v1'
      })
    default:
      throw new Error(`Unknown provider: ${provider}`)
  }
}

function buildSystemPrompt () {
  const faqText = faq.faq
    .map(item => `[${item.category}]\nQ: ${item.question}\nA: ${item.answer}`)
    .join('\n\n')

  return `You are 194964's smart customer support assistant.

LANGUAGE RULE:
- Detect the user's language and reply in the same language (Japanese or English).
- You may use the Japanese FAQ data and translate answers to English when needed.

FAQ DATA:
${faqText}

BEHAVIOR RULES:
1. If the question is NOT covered by the FAQ above, respond exactly with:
   "申し訳ございませんが、この情報についてはLINE（@194964）を通じて弊社スタッフに直接お問い合わせいただくことをお勧めします。"
   (When replying in English, translate this naturally.)
2. Respond politely and in a friendly manner.
3. If pricing is unclear, recommend checking the website or asking staff, using:
   "ウェブサイトを確認するか、スタッフに尋ねることをお勧めします。"
   (Translate naturally for English replies.)
4. Always respond as if talking to a real person.`
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
    const client = getClient(modelConfig.provider)
    const completion = await client.chat.completions.create({
      model: modelId,
      temperature: modelConfig.temperature,
      messages: [
        { role: 'system', content: buildSystemPrompt() },
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
