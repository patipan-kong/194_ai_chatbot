import 'dotenv/config'
import { PrismaClient } from '../generated/prisma/index.js'
import { PrismaPg } from '@prisma/adapter-pg'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter })

async function main () {
  const faq = JSON.parse(
    readFileSync(join(__dirname, '../../faq.json'), 'utf-8')
  )

  const items = faq.faq
  console.log(`Seeding ${items.length} FAQ items into KnowledgeBase...`)

  let upserted = 0
  for (const item of items) {
    await prisma.knowledgeBase.upsert({
      where: {
        // Use composite uniqueness: same category + question = same row
        category_question: {
          category: item.category,
          question: item.question
        }
      },
      update: {
        answer:    item.answer,
        isActive:  true,
        updatedAt: new Date()
      },
      create: {
        category: item.category,
        question: item.question,
        answer:   item.answer,
        isActive: true
      }
    })
    upserted++
  }

  console.log(`Done. ${upserted} rows upserted.`)
}

main()
  .catch(err => { console.error(err); process.exit(1) })
  .finally(() => prisma.$disconnect())
