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
  const categoryIdByName = new Map()
  for (const item of items) {
    const categoryName = String(item.category || '').trim()
    if (!categoryName) continue

    let categoryId = categoryIdByName.get(categoryName)
    if (!categoryId) {
      const category = await prisma.category.upsert({
        where: { name: categoryName },
        update: {},
        create: { name: categoryName }
      })
      categoryId = category.id
      categoryIdByName.set(categoryName, categoryId)
    }

    await prisma.knowledgeBase.upsert({
      where: {
        // Use composite uniqueness: same category + question = same row
        categoryId_question: {
          categoryId,
          question: item.question
        }
      },
      update: {
        answer:    item.answer,
        fullAnswer: String(item.fullAnswer || item.answer || ''),
        isActive:  true,
        updatedAt: new Date()
      },
      create: {
        categoryId,
        question: item.question,
        answer:   item.answer,
        fullAnswer: String(item.fullAnswer || item.answer || ''),
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
