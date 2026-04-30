import Fastify from 'fastify'
import cors from '@fastify/cors'
import { ai } from '@platformatic/fastify-ai'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import 'dotenv/config'

const __dirname = dirname(fileURLToPath(import.meta.url))

const faq = JSON.parse(
  readFileSync(join(__dirname, '../faq.json'), 'utf-8')
)

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
  reply.code(404).send({
    error: 'Not Found',
    message: `Route ${request.method}:${request.url} not found`,
    statusCode: 404
  })
})

app.setErrorHandler((err, request, reply) => {
  app.log.error(err)
  reply.code(err.statusCode || 500).send({
    error: err.message || 'Internal Server Error',
    statusCode: err.statusCode || 500
  })
})

await app.register(ai, {
  providers: {
    gemini: { apiKey: process.env.GEMINI_API_KEY }
  },
  models: [
    { provider: 'gemini', model: 'gemini-2.5-flash' }
  ],
  storage: { type: 'memory' }
})

app.post('/api/chat', async (request, reply) => {
  const { message, sessionId } = request.body

  if (!message || typeof message !== 'string') {
    return reply.code(400).send({ error: 'message is required' })
  }

  if (!process.env.GEMINI_API_KEY) {
    return reply.code(500).send({ error: 'GEMINI_API_KEY is not set in .env' })
  }

  try {
    const response = await app.ai.request({
      request,
      prompt: message,
      context: buildSystemPrompt(),
      temperature: 0.7,
      stream: false
    }, reply)

    return {
      reply: response.text,
      sessionId: response.sessionId
    }
  } catch (err) {
    app.log.error({ err }, 'AI request failed')
    return reply.code(500).send({
      error: 'AI service error',
      detail: err.message
    })
  }
})

app.get('/health', async () => ({ status: 'ok' }))

const port = process.env.PORT || 3001
await app.listen({ port, host: '0.0.0.0' })
