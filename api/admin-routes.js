import { calculateInteractionCost } from './utils.js'
import { randomBytes, scryptSync, timingSafeEqual } from 'crypto'

const ADMIN_API_KEY = process.env.ADMIN_API_KEY || ''
const SCRYPT_KEY_LEN = 64

function hashPassword (password) {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, SCRYPT_KEY_LEN).toString('hex')
  return `scrypt:${salt}:${hash}`
}

function verifyPassword (password, stored) {
  if (stored.startsWith('scrypt:')) {
    const parts = stored.split(':')
    if (parts.length !== 3) return false
    const [, salt, expectedHex] = parts
    const expectedBuf = Buffer.from(expectedHex, 'hex')
    const actualBuf = scryptSync(password, salt, SCRYPT_KEY_LEN)
    if (expectedBuf.length !== actualBuf.length) return false
    return timingSafeEqual(expectedBuf, actualBuf)
  }
  // Legacy plaintext — constant-time comparison for migration path
  const storedBuf = Buffer.from(stored)
  const inputBuf = Buffer.from(password)
  if (storedBuf.length !== inputBuf.length) return false
  return timingSafeEqual(storedBuf, inputBuf)
}
const DEFAULT_DASHBOARD_MODEL_WINDOW_DAYS = 90
const MAX_DASHBOARD_MODEL_WINDOW_DAYS = 365
const SEARCH_ANALYTICS_GROUP_LIMIT = 5000

function toDate(value, fallback) {
  if (!value) return fallback
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? fallback : d
}

function toInt(value, fallback = 0) {
  const n = Number.parseInt(value, 10)
  return Number.isNaN(n) ? fallback : n
}

function getDashboardModelWindowDays() {
  const configured = toInt(process.env.DASHBOARD_MODEL_WINDOW_DAYS, DEFAULT_DASHBOARD_MODEL_WINDOW_DAYS)
  return Math.min(MAX_DASHBOARD_MODEL_WINDOW_DAYS, Math.max(1, configured))
}

function mapPendingStatus(status) {
  if (status === 'PROCESSING') return 'PENDING'
  if (status === 'COMPLETED') return 'RESOLVED'
  if (status === 'PENDING' || status === 'RESOLVED' || status === 'IGNORED') return status
  return null
}

function normalizeDateRange(query) {
  const now = new Date()
  const from = toDate(query?.from, new Date(now.getFullYear(), now.getMonth(), 1))
  const to = toDate(query?.to, now)
  return { from, to }
}

function normalizePageQuery(query, defaults = { page: 1, pageSize: 50, maxPageSize: 200 }) {
  const page = Math.max(1, toInt(query?.page, defaults.page))
  const pageSizeRaw = toInt(query?.pageSize ?? query?.limit, defaults.pageSize)
  const pageSize = Math.min(defaults.maxPageSize, Math.max(1, pageSizeRaw))
  return { page, pageSize, skip: (page - 1) * pageSize }
}

function normalizeDeletedFilter(value) {
  const mode = String(value || '').toLowerCase()
  if (mode === 'all') return 'all'
  if (mode === 'deleted' || mode === 'only') return 'deleted'
  return 'active'
}

function normalizeKbStatus(value, fallback = null) {
  const status = String(value || '').toUpperCase()
  if (status === 'DRAFT' || status === 'REVIEW' || status === 'PUBLISHED' || status === 'ARCHIVED') return status
  return fallback
}

function canTransitionKbStatus(currentStatus, nextStatus) {
  if (!currentStatus || !nextStatus) return false
  if (currentStatus === nextStatus) return true

  const allowedTransitions = {
    DRAFT: new Set(['REVIEW', 'ARCHIVED']),
    REVIEW: new Set(['DRAFT', 'PUBLISHED', 'ARCHIVED']),
    PUBLISHED: new Set(['ARCHIVED']),
    ARCHIVED: new Set(['DRAFT', 'REVIEW'])
  }

  return Boolean(allowedTransitions[currentStatus]?.has(nextStatus))
}

function kbStatusTransitionAction(currentStatus, nextStatus) {
  if (!currentStatus || !nextStatus || currentStatus === nextStatus) return null
  return `KB_STATUS_${currentStatus}_TO_${nextStatus}`
}

function normalizeCategoryName(value, fallback = '') {
  const name = String(value || '').trim()
  return name || fallback
}

function normalizeCategoryAudience(value) {
  const normalized = String(value || '').toLowerCase()
  if (normalized === 'member') return 'member'
  if (normalized === 'public') return 'public'
  return 'all'
}

function buildInteractionSourceWhere(sourceRaw) {
  const source = String(sourceRaw || '').toLowerCase()
  if (!source) return {}

  if (source === 'playground') {
    return { userId: { startsWith: 'playground:' } }
  }

  if (source === 'chat') {
    return { NOT: { userId: { startsWith: 'playground:' } } }
  }

  if (source === 'chat-member') {
    return {
      AND: [
        { NOT: { userId: { startsWith: 'playground:' } } },
        { userId: { startsWith: '194964:' } }
      ]
    }
  }

  if (source === 'chat-public') {
    return {
      AND: [
        { NOT: { userId: { startsWith: 'playground:' } } },
        { NOT: { userId: { startsWith: '194964:' } } }
      ]
    }
  }

  return {}
}

function serializeKnowledgeBase(item) {
  if (!item) return item
  const categoryName = item?.categoryRef?.name || item?.category || ''
  const categoryId = item?.categoryRef?.id || item?.categoryId || null
  const categoryFor194Member = typeof item?.categoryRef?.for194Member === 'boolean'
    ? item.categoryRef.for194Member
    : null

  return {
    ...item,
    category: categoryName,
    categoryId,
    categoryFor194Member
  }
}

function buildDashboardAlerts({ dailyCost, monthlyCost, pendingReviewCount, thresholds }) {
  const alerts = []

  if (dailyCost >= thresholds.dailyCostThreshold) {
    alerts.push({
      code: 'DAILY_COST_HIGH',
      severity: 'warning',
      message: `Daily cost reached ${dailyCost.toFixed(4)} (threshold ${thresholds.dailyCostThreshold.toFixed(4)})`
    })
  }

  if (monthlyCost >= thresholds.monthlyCostThreshold) {
    alerts.push({
      code: 'MONTHLY_COST_HIGH',
      severity: 'critical',
      message: `Monthly cost reached ${monthlyCost.toFixed(4)} (threshold ${thresholds.monthlyCostThreshold.toFixed(4)})`
    })
  }

  if (pendingReviewCount >= thresholds.pendingReviewThreshold) {
    alerts.push({
      code: 'PENDING_REVIEW_HIGH',
      severity: 'warning',
      message: `Pending reviews reached ${pendingReviewCount} (threshold ${thresholds.pendingReviewThreshold})`
    })
  }

  return alerts
}

export async function registerAdminRoutes(app, prisma, MODELS, refreshRuntimeTextConfig, configApi = {}) {
  const adminGuard = async (request, reply) => {
    if (!ADMIN_API_KEY) return
    const key = request.headers['x-admin-key']
    if (key !== ADMIN_API_KEY) {
      return reply.code(401).send({ error: 'Unauthorized' })
    }
  }

  async function writeAudit({ action, entityType, entityId, oldValue = null, newValue = null, changedBy = 'admin', request = null }) {
    const forwardedFor = request?.headers?.['x-forwarded-for']
    const ipAddress = Array.isArray(forwardedFor)
      ? String(forwardedFor[0] || '')
      : String(forwardedFor || request?.ip || '').split(',')[0].trim() || null
    const userAgent = String(request?.headers?.['user-agent'] || '').trim() || null

    try {
      await prisma.auditLog.create({
        data: { action, entityType, entityId, oldValue, newValue, changedBy, ipAddress, userAgent }
      })
    } catch (err) {
      app.log.warn({ err }, 'audit write failed')
    }
  }

  async function ensureCategoryByName(name, for194Member = false) {
    const normalized = normalizeCategoryName(name)
    if (!normalized) return null
    return prisma.category.upsert({
      where: { name: normalized },
      update: {},
      create: { name: normalized, for194Member: Boolean(for194Member) }
    })
  }

  app.get('/api/admin/dashboard', { preHandler: adminGuard }, async () => {
    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const dashboardModelWindowDays = getDashboardModelWindowDays()
    const modelWindowStart = new Date(now)
    modelWindowStart.setDate(now.getDate() - dashboardModelWindowDays)

    const [
      todayQuestions,
      todayUp,
      todayDown,
      monthQuestions,
      monthUp,
      monthDown,
      pendingCount,
      dailyCost,
      monthlyCost,
      interactionSummary,
      interactionThumbUp,
      interactionThumbDown,
      pendingUnknownByModel
    ] = await Promise.all([
      prisma.interaction.count({ where: { createdAt: { gte: todayStart } } }),
      prisma.interaction.count({ where: { createdAt: { gte: todayStart }, isThumbUp: true } }),
      prisma.interaction.count({ where: { createdAt: { gte: todayStart }, isThumbUp: false } }),
      prisma.interaction.count({ where: { createdAt: { gte: monthStart } } }),
      prisma.interaction.count({ where: { createdAt: { gte: monthStart }, isThumbUp: true } }),
      prisma.interaction.count({ where: { createdAt: { gte: monthStart }, isThumbUp: false } }),
      prisma.pendingReview.count({ where: { status: 'PENDING' } }),
      prisma.interaction.aggregate({ where: { createdAt: { gte: todayStart } }, _sum: { cost: true }, _count: { id: true } }),
      prisma.interaction.aggregate({ where: { createdAt: { gte: monthStart } }, _sum: { cost: true }, _count: { id: true } }),
      prisma.interaction.groupBy({
        by: ['modelId'],
        where: { createdAt: { gte: modelWindowStart } },
        _count: { _all: true },
        _sum: { cost: true, responseTime: true }
      }),
      prisma.interaction.groupBy({
        by: ['modelId'],
        where: { createdAt: { gte: modelWindowStart }, isThumbUp: true },
        _count: { _all: true }
      }),
      prisma.interaction.groupBy({
        by: ['modelId'],
        where: { createdAt: { gte: modelWindowStart }, isThumbUp: false },
        _count: { _all: true }
      }),
      prisma.$queryRaw`
        SELECT i."modelId" AS "modelId", COUNT(*)::int AS "unknownCount"
        FROM "PendingReview" p
        JOIN "Interaction" i ON i."id" = p."interactionId"
        WHERE p."source" = 'UNKNOWN_ANSWER'
          AND p."interactionId" IS NOT NULL
          AND p."createdAt" >= ${modelWindowStart}
        GROUP BY i."modelId"
      `
    ])

    const byModel = new Map()
    for (const m of MODELS) {
      byModel.set(m.id, {
        modelId: m.id,
        label: m.label,
        provider: m.provider,
        answers: 0,
        thumbUp: 0,
        thumbDown: 0,
        sumCost: 0,
        sumLatency: 0,
        unknown: 0
      })
    }

    const thumbUpByModel = new Map(interactionThumbUp.map(row => [row.modelId, row._count._all || 0]))
    const thumbDownByModel = new Map(interactionThumbDown.map(row => [row.modelId, row._count._all || 0]))
    const unknownByModel = new Map(
      pendingUnknownByModel.map(row => [row.modelId, Number(row.unknownCount) || 0])
    )

    for (const row of interactionSummary) {
      const entry = byModel.get(row.modelId) || {
        modelId: row.modelId,
        label: row.modelId,
        provider: 'unknown',
        answers: 0,
        thumbUp: 0,
        thumbDown: 0,
        sumCost: 0,
        sumLatency: 0,
        unknown: 0
      }
      entry.answers = row._count._all || 0
      entry.thumbUp = thumbUpByModel.get(row.modelId) || 0
      entry.thumbDown = thumbDownByModel.get(row.modelId) || 0
      entry.sumCost = row._sum.cost || 0
      entry.sumLatency = row._sum.responseTime || 0
      entry.unknown = unknownByModel.get(row.modelId) || 0
      byModel.set(row.modelId, entry)
    }

    const modelRouting = [...byModel.values()].map(entry => ({
      modelId: entry.modelId,
      label: entry.label,
      provider: entry.provider,
      thumbUpRate: entry.answers ? entry.thumbUp / entry.answers : 0,
      avgCost: entry.answers ? entry.sumCost / entry.answers : 0,
      avgLatency: entry.answers ? entry.sumLatency / entry.answers : 0,
      unknownAnswerRate: entry.answers ? entry.unknown / entry.answers : 0,
      answers: entry.answers
    }))

    const thresholds = typeof configApi.getAlertSettings === 'function'
      ? configApi.getAlertSettings()
      : { dailyCostThreshold: 5, monthlyCostThreshold: 100, pendingReviewThreshold: 20, notifyTarget: 'dashboard' }
    const dailyCostValue = dailyCost._sum.cost || 0
    const monthlyCostValue = monthlyCost._sum.cost || 0
    const alerts = buildDashboardAlerts({
      dailyCost: dailyCostValue,
      monthlyCost: monthlyCostValue,
      pendingReviewCount: pendingCount,
      thresholds
    })

    return {
      today: { questions: todayQuestions, thumbUp: todayUp, thumbDown: todayDown, pendingReview: pendingCount },
      month: { questions: monthQuestions, thumbUp: monthUp, thumbDown: monthDown, pendingReview: pendingCount },
      cost: {
        daily: dailyCostValue,
        monthly: monthlyCostValue,
        perConversation: monthlyCost._count.id ? monthlyCostValue / monthlyCost._count.id : 0,
        perModel: modelRouting.map(m => ({ modelId: m.modelId, label: m.label, cost: m.avgCost })),
        perPositiveFeedback: monthUp ? monthlyCostValue / monthUp : 0
      },
      modelRouting,
      alerts,
      alertSettings: thresholds
    }
  })

  app.get('/api/admin/dashboard/trends', { preHandler: adminGuard }, async request => {
    const { from, to } = normalizeDateRange(request.query || {})
    const [rows, unknownRows] = await Promise.all([
      prisma.interaction.findMany({
        where: { createdAt: { gte: from, lte: to } },
        select: { createdAt: true, cost: true, isThumbUp: true }
      }),
      prisma.pendingReview.findMany({
        where: {
          source: 'UNKNOWN_ANSWER',
          createdAt: { gte: from, lte: to }
        },
        select: { createdAt: true }
      })
    ])

    const byDay = new Map()
    for (const row of rows) {
      const d = new Date(row.createdAt)
      const day = new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString().slice(0, 10)
      const curr = byDay.get(day) || { date: day, questions: 0, thumbUp: 0, thumbDown: 0, missed: 0, cost: 0 }
      curr.questions += 1
      if (row.isThumbUp === true) curr.thumbUp += 1
      if (row.isThumbUp === false) curr.thumbDown += 1
      curr.cost += row.cost || 0
      byDay.set(day, curr)
    }

    for (const row of unknownRows) {
      const d = new Date(row.createdAt)
      const day = new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString().slice(0, 10)
      const curr = byDay.get(day) || { date: day, questions: 0, thumbUp: 0, thumbDown: 0, missed: 0, cost: 0 }
      curr.missed += 1
      byDay.set(day, curr)
    }

    const items = [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date))
    return { items }
  })

  app.get('/api/admin/knowledge-base', { preHandler: adminGuard }, async request => {
    const query = request.query || {}
    const category = query.category
    const categoryAudience = normalizeCategoryAudience(query.categoryAudience)
    const status = normalizeKbStatus(query.status)
    const deleted = normalizeDeletedFilter(query.deleted)
    const isDeleteFilter = deleted === 'all' ? undefined : deleted === 'deleted'
    const where = {
      ...(isDeleteFilter === undefined ? {} : { isDelete: isDeleteFilter }),
      ...(category ? { categoryRef: { name: category } } : {}),
      ...(categoryAudience === 'member' ? { categoryRef: { ...(category ? { name: category } : {}), for194Member: true } } : {}),
      ...(categoryAudience === 'public' ? { categoryRef: { ...(category ? { name: category } : {}), for194Member: false } } : {}),
      ...(status ? { status } : {})
    }
    const pagination = normalizePageQuery(query, { page: 1, pageSize: 20, maxPageSize: 500 })
    const [items, total] = await Promise.all([
      prisma.knowledgeBase.findMany({
        where,
        include: { categoryRef: true },
        orderBy: { updatedAt: 'desc' },
        skip: pagination.skip,
        take: pagination.pageSize
      }),
      prisma.knowledgeBase.count({ where })
    ])

    return {
      items: items.map(serializeKnowledgeBase),
      page: pagination.page,
      pageSize: pagination.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pagination.pageSize))
    }
  })

  app.get('/api/admin/knowledge-base/categories', { preHandler: adminGuard }, async () => {
    const rows = await prisma.category.findMany({
      orderBy: { name: 'asc' }
    })
    return {
      items: rows.map(r => r.name),
      categories: rows
    }
  })

  app.get('/api/admin/categories', { preHandler: adminGuard }, async request => {
    const query = request.query || {}
    const name = String(query.name || '').trim()
    const audience = normalizeCategoryAudience(query.audience)
    const pagination = normalizePageQuery(query, { page: 1, pageSize: 20, maxPageSize: 500 })

    const where = {
      ...(name ? { name: { contains: name, mode: 'insensitive' } } : {}),
      ...(audience === 'member' ? { for194Member: true } : {}),
      ...(audience === 'public' ? { for194Member: false } : {})
    }

    const [items, total] = await Promise.all([
      prisma.category.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: pagination.skip,
        take: pagination.pageSize,
        include: {
          _count: {
            select: { knowledgeBase: true }
          }
        }
      }),
      prisma.category.count({ where })
    ])

    return {
      items,
      page: pagination.page,
      pageSize: pagination.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pagination.pageSize))
    }
  })

  app.post('/api/admin/categories', { preHandler: adminGuard }, async (request, reply) => {
    const body = request.body || {}
    const changedBy = String(request.headers['x-admin-user'] || 'admin')
    const name = normalizeCategoryName(body.name)
    if (!name) return reply.code(400).send({ error: 'name is required' })

    const created = await prisma.category.create({
      data: {
        name,
        for194Member: Boolean(body.for194Member)
      }
    })

    await writeAudit({
      action: 'CREATE_CATEGORY',
      entityType: 'Category',
      entityId: created.id,
      newValue: created,
      changedBy,
      request
    })
    await refreshRuntimeTextConfig(true)
    return { item: created }
  })

  app.patch('/api/admin/categories/:id', { preHandler: adminGuard }, async (request, reply) => {
    const id = toInt(request.params.id)
    const body = request.body || {}
    const changedBy = String(request.headers['x-admin-user'] || 'admin')
    const oldValue = await prisma.category.findUnique({ where: { id } })
    if (!oldValue) return reply.code(404).send({ error: 'Not found' })

    const name = body.name !== undefined
      ? normalizeCategoryName(body.name, oldValue.name)
      : oldValue.name
    if (!name) return reply.code(400).send({ error: 'name is required' })

    const updated = await prisma.category.update({
      where: { id },
      data: {
        name,
        ...(body.for194Member !== undefined ? { for194Member: Boolean(body.for194Member) } : {})
      }
    })

    await writeAudit({
      action: 'UPDATE_CATEGORY',
      entityType: 'Category',
      entityId: id,
      oldValue,
      newValue: updated,
      changedBy,
      request
    })
    await refreshRuntimeTextConfig(true)
    return { item: updated }
  })

  app.delete('/api/admin/categories/:id', { preHandler: adminGuard }, async (request, reply) => {
    const id = toInt(request.params.id)
    const changedBy = String(request.headers['x-admin-user'] || 'admin')

    const oldValue = await prisma.category.findUnique({
      where: { id },
      include: {
        _count: {
          select: { knowledgeBase: { where: { isDelete: false } } }
        }
      }
    })
    if (!oldValue) return { ok: true }

    if ((oldValue?._count?.knowledgeBase || 0) > 0) {
      return reply.code(400).send({ error: 'Cannot delete category that is used by knowledge base rows' })
    }

    await prisma.category.delete({ where: { id } })

    await writeAudit({
      action: 'DELETE_CATEGORY',
      entityType: 'Category',
      entityId: id,
      oldValue,
      newValue: { deleted: true },
      changedBy,
      request
    })
    await refreshRuntimeTextConfig(true)
    return { ok: true }
  })

  app.post('/api/admin/knowledge-base', { preHandler: adminGuard }, async request => {
    const body = request.body || {}
    const createdBy = request.headers['x-admin-user'] || 'admin'
    const status = normalizeKbStatus(body.status, 'DRAFT')
    const categoryName = normalizeCategoryName(body.category)
    if (!categoryName) {
      return { error: 'category is required' }
    }
    const created = await prisma.knowledgeBase.create({
      data: {
        categoryRef: {
          connectOrCreate: {
            where: { name: categoryName },
            create: { name: categoryName }
          }
        },
        question: body.question,
        answer: body.answer,
        fullAnswer: String(body.fullAnswer || body.answer || ''),
        status,
        isActive: status === 'PUBLISHED'
      },
      include: { categoryRef: true }
    })
    await writeAudit({ action: 'CREATE_KB', entityType: 'KnowledgeBase', entityId: created.id, newValue: created, changedBy: String(createdBy), request })
    await writeAudit({ action: `CREATE_KB_${status}`, entityType: 'KnowledgeBase', entityId: created.id, newValue: { status }, changedBy: String(createdBy), request })
    await refreshRuntimeTextConfig(true)
    return { item: serializeKnowledgeBase(created) }
  })

  app.post('/api/admin/knowledge-base/import', { preHandler: adminGuard }, async request => {
    const body = request.body || {}
    const changedBy = String(request.headers['x-admin-user'] || 'admin')
    const items = Array.isArray(body.items) ? body.items : []
    if (!items.length) return { imported: 0, skipped: 0 }

    const normalized = items
      .map(item => ({
        category: normalizeCategoryName(item.category),
        question: String(item.question || '').trim(),
        answer: String(item.answer || '').trim(),
        fullAnswer: String(item.fullAnswer || item.answer || '').trim(),
        status: normalizeKbStatus(item.status, 'PUBLISHED'),
        isActive: normalizeKbStatus(item.status, 'PUBLISHED') === 'PUBLISHED'
      }))
      .filter(item => item.category && item.question && item.answer && item.fullAnswer)

    if (!normalized.length) return { imported: 0, skipped: items.length }

    let importedCount = 0
    const categoryIdByName = new Map()
    for (const item of normalized) {
      let categoryId = categoryIdByName.get(item.category)
      if (!categoryId) {
        const categoryRow = await ensureCategoryByName(item.category)
        categoryId = categoryRow?.id
        if (!categoryId) continue
        categoryIdByName.set(item.category, categoryId)
      }

      await prisma.knowledgeBase.upsert({
        where: {
          categoryId_question: {
            categoryId,
            question: item.question
          }
        },
        update: {
          answer: item.answer,
          fullAnswer: item.fullAnswer,
          status: item.status,
          isActive: item.isActive
        },
        create: {
          categoryId,
          question: item.question,
          answer: item.answer,
          fullAnswer: item.fullAnswer,
          status: item.status,
          isActive: item.isActive
        }
      })
      importedCount += 1
    }

    await writeAudit({
      action: 'IMPORT_KB',
      entityType: 'KnowledgeBase',
      entityId: 0,
      newValue: { requested: items.length, normalized: normalized.length, imported: importedCount },
      changedBy,
      request
    })
    await refreshRuntimeTextConfig(true)
    return { imported: importedCount, skipped: items.length - importedCount }
  })

  app.patch('/api/admin/knowledge-base/:id', { preHandler: adminGuard }, async (request, reply) => {
    const id = toInt(request.params.id)
    const body = request.body || {}
    const changedBy = String(request.headers['x-admin-user'] || 'admin')
    const oldValue = await prisma.knowledgeBase.findFirst({ where: { id, isDelete: false }, include: { categoryRef: true } })
    if (!oldValue) return { error: 'Not found' }

    const statusFromBody = normalizeKbStatus(body.status)
    const nextStatus = statusFromBody || (body.isActive !== undefined ? (Boolean(body.isActive) ? 'PUBLISHED' : 'ARCHIVED') : null)

    if (nextStatus && !canTransitionKbStatus(oldValue.status, nextStatus)) {
      return reply.code(400).send({
        error: `Invalid KB status transition: ${oldValue.status} -> ${nextStatus}`
      })
    }

    const categoryName = body.category !== undefined
      ? normalizeCategoryName(body.category, oldValue?.categoryRef?.name || '')
      : null
    if (body.category !== undefined && !categoryName) {
      return reply.code(400).send({ error: 'category is required' })
    }
    const updated = await prisma.knowledgeBase.update({
      where: { id },
      data: {
        ...(body.category !== undefined
          ? {
              categoryRef: {
                connectOrCreate: {
                  where: { name: categoryName },
                  create: { name: categoryName }
                }
              }
            }
          : {}),
        ...(body.question !== undefined ? { question: body.question } : {}),
        ...(body.answer !== undefined ? { answer: body.answer } : {}),
        ...(body.fullAnswer !== undefined ? { fullAnswer: String(body.fullAnswer || '') } : {}),
        ...(nextStatus ? { status: nextStatus, isActive: nextStatus === 'PUBLISHED' } : {})
      },
      include: { categoryRef: true }
    })
    await writeAudit({ action: 'UPDATE_KB', entityType: 'KnowledgeBase', entityId: id, oldValue, newValue: updated, changedBy, request })
    const transitionAction = kbStatusTransitionAction(oldValue.status, updated.status)
    if (transitionAction) {
      await writeAudit({
        action: transitionAction,
        entityType: 'KnowledgeBase',
        entityId: id,
        oldValue: { status: oldValue.status },
        newValue: { status: updated.status },
        changedBy,
        request
      })
    }
    await refreshRuntimeTextConfig(true)
    return { item: serializeKnowledgeBase(updated) }
  })

  app.delete('/api/admin/knowledge-base/:id', { preHandler: adminGuard }, async request => {
    const id = toInt(request.params.id)
    const changedBy = String(request.headers['x-admin-user'] || 'admin')
    const oldValue = await prisma.knowledgeBase.findFirst({ where: { id, isDelete: false }, include: { categoryRef: true } })
    if (!oldValue) return { ok: true }

    const updated = await prisma.knowledgeBase.update({
      where: { id },
      data: { status: 'ARCHIVED', isActive: false, isDelete: true }
    })
    await writeAudit({ action: 'SOFT_DELETE_KB', entityType: 'KnowledgeBase', entityId: id, oldValue, newValue: updated, changedBy, request })
    await refreshRuntimeTextConfig(true)
    return { ok: true }
  })

  app.post('/api/admin/knowledge-base/:id/restore', { preHandler: adminGuard }, async request => {
    const id = toInt(request.params.id)
    const changedBy = String(request.headers['x-admin-user'] || 'admin')
    const oldValue = await prisma.knowledgeBase.findFirst({ where: { id, isDelete: true }, include: { categoryRef: true } })
    if (!oldValue) return { error: 'Not found' }

    const updated = await prisma.knowledgeBase.update({
      where: { id },
      data: { isDelete: false, status: 'DRAFT', isActive: false }
    })
    await writeAudit({ action: 'RESTORE_KB', entityType: 'KnowledgeBase', entityId: id, oldValue, newValue: updated, changedBy, request })
    await refreshRuntimeTextConfig(true)
    return { item: updated }
  })

  app.post('/api/admin/prompt-playground/compare', { preHandler: adminGuard }, async (request, reply) => {
    if (typeof configApi.runPromptPlaygroundTest !== 'function') {
      return reply.code(500).send({ error: 'Prompt playground is not configured' })
    }

    const body = request.body || {}
    const question = String(body.question || '').trim()
    const promptTemplate = String(body.promptTemplate || '')
    const settingId = toInt(body.settingId, 0) || null
    const audience = body.audience === 'member' ? 'member' : 'guest'
    const changedBy = String(request.headers['x-admin-user'] || 'admin')
    const models = Array.isArray(body.models)
      ? body.models.map(item => String(item || '').trim()).filter(Boolean)
      : []

    if (!question) {
      return reply.code(400).send({ error: 'question is required' })
    }
    if (!models.length) {
      return reply.code(400).send({ error: 'at least one model is required' })
    }

    const compareResult = await configApi.runPromptPlaygroundTest({
      question,
      promptTemplate,
      settingId,
      modelIds: models,
      changedBy,
      audience
    })

    const items = Array.isArray(compareResult)
      ? compareResult
      : (compareResult?.items || [])
    const historyId = Number(compareResult?.historyId || 0) || null
    return { items, historyId }
  })

  app.get('/api/admin/prompt-playground/history', { preHandler: adminGuard }, async request => {
    const query = request.query || {}
    const pagination = normalizePageQuery(query, { page: 1, pageSize: 20, maxPageSize: 200 })

    try {
      const [items, total] = await Promise.all([
        prisma.promptPlaygroundRun.findMany({
          orderBy: { createdAt: 'desc' },
          skip: pagination.skip,
          take: pagination.pageSize,
          select: {
            id: true,
            question: true,
            promptTemplate: true,
            selectedModels: true,
            result: true,
            createdBy: true,
            createdAt: true
          }
        }),
        prisma.promptPlaygroundRun.count()
      ])

      return {
        items,
        page: pagination.page,
        pageSize: pagination.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pagination.pageSize))
      }
    } catch (err) {
      app.log.warn({ err }, 'Prompt playground history list unavailable')
      return { items: [], page: 1, pageSize: pagination.pageSize, total: 0, totalPages: 1 }
    }
  })

  app.get('/api/admin/prompt-playground/history/:id', { preHandler: adminGuard }, async request => {
    const id = toInt(request.params.id)
    if (!id) return { item: null }

    try {
      const item = await prisma.promptPlaygroundRun.findUnique({
        where: { id },
        select: {
          id: true,
          question: true,
          promptTemplate: true,
          selectedModels: true,
          result: true,
          createdBy: true,
          createdAt: true
        }
      })
      return { item }
    } catch (err) {
      app.log.warn({ err }, 'Prompt playground history detail unavailable')
      return { item: null }
    }
  })

  app.get('/api/admin/interactions', { preHandler: adminGuard }, async request => {
    const query = request.query || {}
    const { from, to } = normalizeDateRange(query)
    const sortBy = String(query.sortBy || 'createdAt')
    const sortDir = String(query.sortDir || 'desc').toLowerCase() === 'asc' ? 'asc' : 'desc'
    const sortable = new Set(['modelId', 'userQuestion', 'isThumbUp', 'inputTokens', 'outputTokens', 'responseTime', 'cost', 'createdAt'])
    const orderBy = sortable.has(sortBy) ? { [sortBy]: sortDir } : { createdAt: 'desc' }

    const where = {
      createdAt: { gte: from, lte: to },
      ...(query.modelId ? { modelId: query.modelId } : {}),
      ...(query.question ? { userQuestion: { contains: query.question, mode: 'insensitive' } } : {}),
      ...buildInteractionSourceWhere(query.source),
      ...(query.isThumbUp === 'true' ? { isThumbUp: true } : {}),
      ...(query.isThumbUp === 'false' ? { isThumbUp: false } : {})
    }
    const pagination = normalizePageQuery(query, { page: 1, pageSize: 20, maxPageSize: 500 })
    const [items, total] = await Promise.all([
      prisma.interaction.findMany({
        where,
        orderBy,
        skip: pagination.skip,
        take: pagination.pageSize,
        include: { pendingReview: { select: { source: true } } }
      }),
      prisma.interaction.count({ where })
    ])

    return {
      items,
      page: pagination.page,
      pageSize: pagination.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pagination.pageSize))
    }
  })

  app.get('/api/admin/alerts/settings', { preHandler: adminGuard }, async () => {
    const settings = typeof configApi.getAlertSettings === 'function'
      ? configApi.getAlertSettings()
      : { dailyCostThreshold: 5, monthlyCostThreshold: 100, pendingReviewThreshold: 20, notifyTarget: 'dashboard' }
    return { item: settings }
  })

  app.get('/api/admin/models/default', { preHandler: adminGuard }, async () => {
    const defaultModel = typeof configApi.getDefaultModel === 'function'
      ? configApi.getDefaultModel()
      : null
    return {
      defaultModel,
      models: MODELS.map(model => ({
        id: model.id,
        label: model.label,
        provider: model.provider,
        cost: model.cost || null,
        rating: model.rating || null
      }))
    }
  })

  app.patch('/api/admin/models/default', { preHandler: adminGuard }, async (request, reply) => {
    if (typeof configApi.setDefaultModel !== 'function') {
      return reply.code(500).send({ error: 'Model config updater is not configured' })
    }

    const body = request.body || {}
    const modelId = String(body.modelId || '').trim()
    if (!modelId) {
      return reply.code(400).send({ error: 'modelId is required' })
    }
    if (!MODELS.some(model => model.id === modelId)) {
      return reply.code(400).send({ error: `Unknown model: ${modelId}` })
    }

    const changedBy = String(request.headers['x-admin-user'] || 'admin')
    const oldDefaultModel = typeof configApi.getDefaultModel === 'function' ? configApi.getDefaultModel() : null
    const oldValue = { defaultModel: oldDefaultModel }
    const nextDefaultModel = configApi.setDefaultModel(modelId)
    const newValue = { defaultModel: nextDefaultModel }

    await writeAudit({
      action: 'UPDATE_DEFAULT_MODEL',
      entityType: 'ModelConfig',
      entityId: 0,
      oldValue,
      newValue,
      changedBy,
      request
    })

    return newValue
  })

  app.patch('/api/admin/alerts/settings', { preHandler: adminGuard }, async request => {
    if (typeof configApi.updateAlertSettings !== 'function') {
      return { error: 'Alert settings updater is not configured' }
    }

    const body = request.body || {}
    const changedBy = String(request.headers['x-admin-user'] || 'admin')
    const oldValue = configApi.getAlertSettings()
    const nextValue = configApi.updateAlertSettings({
      ...(body.dailyCostThreshold !== undefined ? { dailyCostThreshold: Number(body.dailyCostThreshold) } : {}),
      ...(body.monthlyCostThreshold !== undefined ? { monthlyCostThreshold: Number(body.monthlyCostThreshold) } : {}),
      ...(body.pendingReviewThreshold !== undefined ? { pendingReviewThreshold: Number(body.pendingReviewThreshold) } : {}),
      ...(body.notifyTarget !== undefined ? { notifyTarget: String(body.notifyTarget) } : {})
    })

    await writeAudit({
      action: 'UPDATE_ALERT_SETTINGS',
      entityType: 'AlertSettings',
      entityId: 0,
      oldValue,
      newValue: nextValue,
      changedBy,
      request
    })

    return { item: nextValue }
  })

  app.post('/api/admin/interactions/recalculate-cost', { preHandler: adminGuard }, async request => {
    const body = request.body || {}
    const { from, to } = normalizeDateRange(body)

    const where = {
      createdAt: { gte: from, lte: to },
      ...(body.modelId ? { modelId: String(body.modelId) } : {}),
      ...(body.question ? { userQuestion: { contains: String(body.question), mode: 'insensitive' } } : {}),
      ...buildInteractionSourceWhere(body.source),
      ...(body.isThumbUp === 'true' ? { isThumbUp: true } : {}),
      ...(body.isThumbUp === 'false' ? { isThumbUp: false } : {})
    }

    const rows = await prisma.interaction.findMany({
      where,
      select: { id: true, modelId: true, inputTokens: true, outputTokens: true }
    })

    if (!rows.length) return { updated: 0 }

    const updates = rows.map(row => {
      const cost = calculateInteractionCost(MODELS, row)
      return prisma.interaction.update({ where: { id: row.id }, data: { cost } })
    })

    await prisma.$transaction(updates)
    return { updated: rows.length }
  })

  app.get('/api/admin/interactions/:id', { preHandler: adminGuard }, async request => {
    const id = toInt(request.params.id)
    const item = await prisma.interaction.findUnique({
      where: { id },
      include: { setting: true, pendingReview: { select: { source: true } } }
    })
    return {
      item,
      promptTemplateUsed: item?.setting?.systemPromptTemplate || null,
      promptVersionUsed: item?.setting?.version || null
    }
  })

  app.get('/api/admin/interactions/:id/chat-history', { preHandler: adminGuard }, async request => {
    const id = toInt(request.params.id)
    const anchor = await prisma.interaction.findUnique({ where: { id }, select: { userId: true } })
    if (!anchor) return { items: [] }

    const items = await prisma.interaction.findMany({
      where: { userId: anchor.userId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        userQuestion: true,
        aiResponse: true,
        createdAt: true,
        modelId: true,
        isThumbUp: true,
        pendingReview: { select: { source: true } }
      }
    })
    return { userId: anchor.userId, items }
  })

  app.get('/api/admin/pending-reviews', { preHandler: adminGuard }, async request => {
    const query = request.query || {}
    const groupByQuestion = request.query?.groupByQuestion === 'true'
    const mappedStatus = mapPendingStatus(query.status)
    const where = mappedStatus ? { status: mappedStatus } : {}
    const pagination = normalizePageQuery(query, { page: 1, pageSize: 20, maxPageSize: 500 })

    if (!groupByQuestion) {
      const [items, total] = await Promise.all([
        prisma.pendingReview.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: pagination.skip,
          take: pagination.pageSize
        }),
        prisma.pendingReview.count({ where })
      ])
      return {
        items,
        page: pagination.page,
        pageSize: pagination.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pagination.pageSize))
      }
    }

    let groupedRows
    let totalRows

    if (mappedStatus) {
      [groupedRows, totalRows] = await Promise.all([
        prisma.$queryRaw`
          SELECT
            grouped."question" AS "question",
            grouped."count"::int AS "count",
            grouped."id" AS "id",
            grouped."aiResponse" AS "aiResponse",
            grouped."source" AS "source",
            grouped."status" AS "status",
            grouped."reviewNote" AS "reviewNote",
            grouped."resolvedBy" AS "resolvedBy",
            grouped."resolvedAt" AS "resolvedAt",
            grouped."interactionId" AS "interactionId",
            grouped."createdAt" AS "createdAt",
            grouped."updatedAt" AS "updatedAt"
          FROM (
            SELECT
              p.*,
              COUNT(*) OVER (PARTITION BY p."question") AS "count",
              ROW_NUMBER() OVER (PARTITION BY p."question" ORDER BY p."createdAt" DESC, p."id" DESC) AS "rn"
            FROM "PendingReview" p
            WHERE p."status" = ${mappedStatus}
              AND p."question" IS NOT NULL
              AND LENGTH(TRIM(p."question")) > 0
          ) grouped
          WHERE grouped."rn" = 1
          ORDER BY grouped."createdAt" DESC, grouped."id" DESC
          OFFSET ${pagination.skip}
          LIMIT ${pagination.pageSize}
        `,
        prisma.$queryRaw`
          SELECT COUNT(DISTINCT p."question")::int AS "total"
          FROM "PendingReview" p
          WHERE p."status" = ${mappedStatus}
            AND p."question" IS NOT NULL
            AND LENGTH(TRIM(p."question")) > 0
        `
      ])
    } else {
      [groupedRows, totalRows] = await Promise.all([
        prisma.$queryRaw`
          SELECT
            grouped."question" AS "question",
            grouped."count"::int AS "count",
            grouped."id" AS "id",
            grouped."aiResponse" AS "aiResponse",
            grouped."source" AS "source",
            grouped."status" AS "status",
            grouped."reviewNote" AS "reviewNote",
            grouped."resolvedBy" AS "resolvedBy",
            grouped."resolvedAt" AS "resolvedAt",
            grouped."interactionId" AS "interactionId",
            grouped."createdAt" AS "createdAt",
            grouped."updatedAt" AS "updatedAt"
          FROM (
            SELECT
              p.*,
              COUNT(*) OVER (PARTITION BY p."question") AS "count",
              ROW_NUMBER() OVER (PARTITION BY p."question" ORDER BY p."createdAt" DESC, p."id" DESC) AS "rn"
            FROM "PendingReview" p
            WHERE p."question" IS NOT NULL
              AND LENGTH(TRIM(p."question")) > 0
          ) grouped
          WHERE grouped."rn" = 1
          ORDER BY grouped."createdAt" DESC, grouped."id" DESC
          OFFSET ${pagination.skip}
          LIMIT ${pagination.pageSize}
        `,
        prisma.$queryRaw`
          SELECT COUNT(DISTINCT p."question")::int AS "total"
          FROM "PendingReview" p
          WHERE p."question" IS NOT NULL
            AND LENGTH(TRIM(p."question")) > 0
        `
      ])
    }

    const groups = groupedRows.map(row => ({
      question: row.question,
      count: Number(row.count) || 0,
      latest: {
        id: row.id,
        question: row.question,
        aiResponse: row.aiResponse,
        source: row.source,
        status: row.status,
        reviewNote: row.reviewNote,
        resolvedBy: row.resolvedBy,
        resolvedAt: row.resolvedAt,
        interactionId: row.interactionId,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt
      }
    }))
    const total = Number(totalRows?.[0]?.total) || 0

    return {
      groups,
      page: pagination.page,
      pageSize: pagination.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pagination.pageSize))
    }
  })

  app.patch('/api/admin/pending-reviews/:id/status', { preHandler: adminGuard }, async request => {
    const id = toInt(request.params.id)
    const status = mapPendingStatus(request.body?.status)
    if (!status) return { error: 'Invalid status' }

    const changedBy = String(request.headers['x-admin-user'] || 'admin')
    const reviewNoteRaw = request.body?.reviewNote
    const reviewNote = reviewNoteRaw === undefined ? undefined : String(reviewNoteRaw || '').trim() || null
    const oldValue = await prisma.pendingReview.findUnique({ where: { id } })
    if (!oldValue) return { error: 'Not found' }

    const data = {
      status,
      ...(reviewNote !== undefined ? { reviewNote } : {}),
      ...(status === 'PENDING'
        ? { resolvedBy: null, resolvedAt: null }
        : { resolvedBy: changedBy, resolvedAt: new Date() })
    }

    const updated = await prisma.pendingReview.update({ where: { id }, data })
    await writeAudit({ action: 'UPDATE_PENDING_STATUS', entityType: 'PendingReview', entityId: id, oldValue, newValue: updated, changedBy, request })
    return { item: updated }
  })

  app.post('/api/admin/pending-reviews/:id/draft-kb', { preHandler: adminGuard }, async request => {
    const id = toInt(request.params.id)
    const item = await prisma.pendingReview.findUnique({ where: { id } })
    if (!item) return { error: 'Not found' }

    const draft = {
      category: 'General',
      question: item.question,
      answer: item.aiResponse || 'Please update this answer with verified information before publishing.',
      fullAnswer: item.aiResponse || 'Please update this answer with verified information before publishing.'
    }
    return { draft }
  })

  app.post('/api/admin/pending-reviews/:id/promote-kb', { preHandler: adminGuard }, async request => {
    const id = toInt(request.params.id)
    const body = request.body || {}
    const changedBy = String(request.headers['x-admin-user'] || 'admin')
    const item = await prisma.pendingReview.findUnique({ where: { id } })
    if (!item) return { error: 'Not found' }

    const created = await prisma.knowledgeBase.create({
      data: {
        categoryRef: {
          connectOrCreate: {
            where: { name: normalizeCategoryName(body.category, 'General') },
            create: { name: normalizeCategoryName(body.category, 'General') }
          }
        },
        question: body.question || item.question,
        answer: body.answer || item.aiResponse || '',
        fullAnswer: body.fullAnswer || body.answer || item.aiResponse || '',
        status: 'REVIEW',
        isActive: false
      },
      include: { categoryRef: true }
    })

    const updatedPending = await prisma.pendingReview.update({
      where: { id },
      data: { status: 'RESOLVED', resolvedBy: changedBy, resolvedAt: new Date() }
    })

    await writeAudit({ action: 'PROMOTE_PENDING_TO_KB', entityType: 'PendingReview', entityId: id, oldValue: item, newValue: updatedPending, changedBy, request })
    await writeAudit({ action: 'CREATE_KB', entityType: 'KnowledgeBase', entityId: created.id, newValue: created, changedBy, request })
    await refreshRuntimeTextConfig(true)
    return { knowledgeBase: created, pendingReview: updatedPending }
  })

  app.get('/api/admin/system-settings', { preHandler: adminGuard }, async request => {
    const query = request.query || {}
    const pagination = normalizePageQuery(query, { page: 1, pageSize: 20, maxPageSize: 500 })
    const [items, total] = await Promise.all([
      prisma.systemSetting.findMany({
        orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
        skip: pagination.skip,
        take: pagination.pageSize
      }),
      prisma.systemSetting.count()
    ])
    return {
      items,
      page: pagination.page,
      pageSize: pagination.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pagination.pageSize))
    }
  })

  app.post('/api/admin/system-settings', { preHandler: adminGuard }, async request => {
    const body = request.body || {}
    const changedBy = String(request.headers['x-admin-user'] || body.createdBy || 'admin')
    const latest = await prisma.systemSetting.findFirst({ orderBy: { version: 'desc' } })
    const created = await prisma.systemSetting.create({
      data: {
        version: body.version || ((latest?.version || 0) + 1),
        description: body.description,
        systemPromptTemplate: body.systemPromptTemplate,
        unknownAnswerCleanText: body.unknownAnswerCleanText,
        isActive: Boolean(body.isActive),
        createdBy: changedBy
      }
    })

    if (created.isActive) {
      await prisma.systemSetting.updateMany({ where: { id: { not: created.id } }, data: { isActive: false } })
      await refreshRuntimeTextConfig(true)
    }

    await writeAudit({ action: 'CREATE_SYSTEM_SETTING', entityType: 'SystemSetting', entityId: created.id, newValue: created, changedBy, request })
    return { item: created }
  })

  app.patch('/api/admin/system-settings/:id/activate', { preHandler: adminGuard }, async request => {
    const id = toInt(request.params.id)
    const changedBy = String(request.headers['x-admin-user'] || 'admin')
    const oldValue = await prisma.systemSetting.findUnique({ where: { id } })
    if (!oldValue) return { error: 'Not found' }

    await prisma.systemSetting.updateMany({ data: { isActive: false } })
    const updated = await prisma.systemSetting.update({ where: { id }, data: { isActive: true } })
    await refreshRuntimeTextConfig(true)
    await writeAudit({ action: 'ACTIVATE_SYSTEM_SETTING', entityType: 'SystemSetting', entityId: id, oldValue, newValue: updated, changedBy, request })
    return { item: updated }
  })

  app.post('/api/admin/auth/login', {
    config: {
      rateLimit: {
        max: 5,
        timeWindow: '15 minutes',
        keyGenerator: request => request.ip || 'unknown'
      }
    }
  }, async (request, reply) => {
    const body = request.body || {}
    const username = String(body.username || '').trim()
    const password = String(body.password || '')
    if (!username || !password) {
      return reply.code(400).send({ ok: false, error: 'username and password required' })
    }
    const user = await prisma.adminUser.findFirst({
      where: { username, isDelete: false }
    })
    if (!user || !verifyPassword(password, user.password)) {
      return reply.code(401).send({ ok: false, error: 'Invalid credentials' })
    }
    // Auto-rehash legacy plaintext passwords on successful login
    if (!user.password.startsWith('scrypt:')) {
      const rehashed = hashPassword(password)
      await prisma.adminUser.update({ where: { id: user.id }, data: { password: rehashed } })
    }
    return { ok: true, username: user.username }
  })

  app.get('/api/admin/admin-users', { preHandler: adminGuard }, async request => {
    const query = request.query || {}
    const pagination = normalizePageQuery(query, { page: 1, pageSize: 20, maxPageSize: 500 })
    const deleted = normalizeDeletedFilter(query.deleted)
    const isDeleteFilter = deleted === 'all' ? undefined : deleted === 'deleted'
    const where = isDeleteFilter === undefined ? {} : { isDelete: isDeleteFilter }
    const [items, total] = await Promise.all([
      prisma.adminUser.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: pagination.skip,
        take: pagination.pageSize
      }),
      prisma.adminUser.count({ where })
    ])
    return {
      items,
      page: pagination.page,
      pageSize: pagination.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pagination.pageSize))
    }
  })

  app.post('/api/admin/admin-users', { preHandler: adminGuard }, async (request, reply) => {
    const body = request.body || {}
    const changedBy = String(request.headers['x-admin-user'] || 'admin')
    const username = typeof body.username === 'string' ? body.username.trim() : ''
    const password = typeof body.password === 'string' ? body.password : ''
    if (!username || !password) {
      return reply.code(400).send({ error: 'username and password required' })
    }
    const existing = await prisma.adminUser.findFirst({ where: { username } })
    if (existing) {
      return reply.code(409).send({ error: 'username already exists' })
    }
    const item = await prisma.adminUser.create({ data: { username, password: hashPassword(password) } })
    await writeAudit({ action: 'CREATE_ADMIN_USER', entityType: 'AdminUser', entityId: item.id, newValue: { id: item.id, username: item.username }, changedBy, request })
    return { item }
  })

  app.patch('/api/admin/admin-users/:id', { preHandler: adminGuard }, async (request, reply) => {
    const id = toInt(request.params.id)
    const body = request.body || {}
    const changedBy = String(request.headers['x-admin-user'] || 'admin')
    const oldValue = await prisma.adminUser.findFirst({ where: { id, isDelete: false } })
    if (!oldValue) return { error: 'Not found' }

    if (body.username !== undefined) {
      const username = String(body.username).trim()
      if (!username) {
        return reply.code(400).send({ error: 'username cannot be empty' })
      }
      if (username !== oldValue.username) {
        const conflict = await prisma.adminUser.findFirst({
          where: { username, NOT: { id } }
        })
        if (conflict) {
          return reply.code(409).send({ error: 'username already exists' })
        }
      }
    }

    const item = await prisma.adminUser.update({
      where: { id },
      data: {
        ...(body.username !== undefined ? { username: String(body.username).trim() } : {}),
        ...(body.password !== undefined ? { password: hashPassword(String(body.password)) } : {})
      }
    })
    await writeAudit({ action: 'UPDATE_ADMIN_USER', entityType: 'AdminUser', entityId: item.id, oldValue: { id: oldValue.id, username: oldValue.username }, newValue: { id: item.id, username: item.username }, changedBy, request })
    return { item }
  })

  app.delete('/api/admin/admin-users/:id', { preHandler: adminGuard }, async request => {
    const id = toInt(request.params.id)
    const changedBy = String(request.headers['x-admin-user'] || 'admin')
    const oldValue = await prisma.adminUser.findFirst({ where: { id, isDelete: false } })
    if (!oldValue) return { ok: true }
    if (oldValue.username === changedBy) {
      return { error: 'Cannot delete current admin user' }
    }

    const updated = await prisma.adminUser.update({
      where: { id },
      data: { isDelete: true }
    })
    await writeAudit({
      action: 'SOFT_DELETE_ADMIN_USER',
      entityType: 'AdminUser',
      entityId: id,
      oldValue: { id: oldValue.id, username: oldValue.username },
      newValue: { id: updated.id, username: updated.username, isDelete: updated.isDelete },
      changedBy,
      request
    })
    return { ok: true }
  })

  app.post('/api/admin/admin-users/:id/restore', { preHandler: adminGuard }, async (request, reply) => {
    const id = toInt(request.params.id)
    const changedBy = String(request.headers['x-admin-user'] || 'admin')
    const oldValue = await prisma.adminUser.findFirst({ where: { id, isDelete: true } })
    if (!oldValue) return { error: 'Not found' }

    const conflict = await prisma.adminUser.findFirst({ where: { username: oldValue.username, isDelete: false } })
    if (conflict) {
      return reply.code(409).send({ error: 'username is already taken by another active user' })
    }

    const updated = await prisma.adminUser.update({
      where: { id },
      data: { isDelete: false }
    })
    await writeAudit({
      action: 'RESTORE_ADMIN_USER',
      entityType: 'AdminUser',
      entityId: id,
      oldValue: { id: oldValue.id, username: oldValue.username, isDelete: oldValue.isDelete },
      newValue: { id: updated.id, username: updated.username, isDelete: updated.isDelete },
      changedBy,
      request
    })
    return { item: updated }
  })

  app.get('/api/admin/model-report', { preHandler: adminGuard }, async request => {
    const { from, to } = normalizeDateRange(request.query || {})
    const modelMetaById = new Map(
      MODELS.map(model => {
        const accuracy = Number(model?.rating?.accuracy)
        const helpfulness = Number(model?.rating?.helpfulness)
        const tokenCosts = [
          Number(model?.cost?.token_1m?.input),
          Number(model?.cost?.token_1m?.output),
          Number(model?.cost?.token_1m?.caching)
        ].filter(Number.isFinite)

        return [
          model.id,
          {
            accuracy: Number.isFinite(accuracy) ? accuracy : null,
            helpfulness: Number.isFinite(helpfulness) ? helpfulness : null,
            referenceCost: tokenCosts.length ? tokenCosts.reduce((sum, value) => sum + value, 0) / tokenCosts.length : null
          }
        ]
      })
    )

    const [summaryRows, thumbUpRows, thumbDownRows, unknownRows] = await Promise.all([
      prisma.interaction.groupBy({
        by: ['modelId'],
        where: { createdAt: { gte: from, lte: to } },
        _count: { _all: true },
        _sum: { responseTime: true, inputTokens: true, outputTokens: true, cost: true }
      }),
      prisma.interaction.groupBy({
        by: ['modelId'],
        where: { createdAt: { gte: from, lte: to }, isThumbUp: true },
        _count: { _all: true }
      }),
      prisma.interaction.groupBy({
        by: ['modelId'],
        where: { createdAt: { gte: from, lte: to }, isThumbUp: false },
        _count: { _all: true }
      }),
      prisma.$queryRaw`
        SELECT i."modelId" AS "modelId", COUNT(*)::int AS "unknownCount"
        FROM "PendingReview" p
        JOIN "Interaction" i ON i."id" = p."interactionId"
        WHERE p."source" = 'UNKNOWN_ANSWER'
          AND p."createdAt" >= ${from}
          AND p."createdAt" <= ${to}
        GROUP BY i."modelId"
      `
    ])

    const thumbUpByModel = new Map(thumbUpRows.map(row => [row.modelId, row._count._all || 0]))
    const thumbDownByModel = new Map(thumbDownRows.map(row => [row.modelId, row._count._all || 0]))
    const unknownByModel = new Map(unknownRows.map(row => [row.modelId, Number(row.unknownCount) || 0]))

    const map = new Map()
    for (const row of summaryRows) {
      map.set(row.modelId, {
        modelId: row.modelId,
        answers: row._count._all || 0,
        thumbUp: thumbUpByModel.get(row.modelId) || 0,
        thumbDown: thumbDownByModel.get(row.modelId) || 0,
        latencySum: row._sum.responseTime || 0,
        inputSum: row._sum.inputTokens || 0,
        outputSum: row._sum.outputTokens || 0,
        costSum: row._sum.cost || 0
      })
    }

    const items = [...map.values()].map(v => {
      const unknown = unknownByModel.get(v.modelId) || 0
      const modelMeta = modelMetaById.get(v.modelId) || null
      const accuracy = Number.isFinite(modelMeta?.accuracy) ? modelMeta.accuracy : null
      const helpfulness = Number.isFinite(modelMeta?.helpfulness) ? modelMeta.helpfulness : null
      const avgCost = v.answers ? v.costSum / v.answers : 0
      const referenceCost = Number.isFinite(modelMeta?.referenceCost) ? modelMeta.referenceCost : null
      const efficiencyScore = Number.isFinite(accuracy) && Number.isFinite(helpfulness) && Number.isFinite(referenceCost) && referenceCost > 0
        ? (accuracy + helpfulness) / referenceCost
        : null

      return {
        modelId: v.modelId,
        answers: v.answers,
        missAnswer: unknown,
        missAnswerRate: v.answers ? unknown / v.answers : 0,
        thumbUp: v.thumbUp,
        thumbUpRate: v.answers ? v.thumbUp / v.answers : 0,
        thumbDown: v.thumbDown,
        thumbDownRate: v.answers ? v.thumbDown / v.answers : 0,
        avgLatency: v.answers ? v.latencySum / v.answers : 0,
        avgInputTokens: v.answers ? v.inputSum / v.answers : 0,
        avgOutputTokens: v.answers ? v.outputSum / v.answers : 0,
        avgCost,
        referenceCost,
        accuracy,
        helpfulness,
        efficiencyScore,
        totalInputTokens: v.inputSum,
        totalOutputTokens: v.outputSum,
        answerCount: v.answers,
        thumbUpCount: v.thumbUp,
        thumbDownCount: v.thumbDown,
        missAnswerCount: unknown
      }
    })

    return { items }
  })

  app.get('/api/admin/search-analytics', { preHandler: adminGuard }, async request => {
    const { from, to } = normalizeDateRange(request.query || {})
    const groupedRows = await prisma.$queryRaw`
      SELECT
        TRIM("userQuestion") AS "question",
        COUNT(*)::int AS "count",
        COUNT(*) FILTER (WHERE "isThumbUp" = false)::int AS "down"
      FROM "Interaction"
      WHERE "createdAt" >= ${from}
        AND "createdAt" <= ${to}
        AND LENGTH(TRIM("userQuestion")) > 0
      GROUP BY TRIM("userQuestion")
      ORDER BY COUNT(*) DESC
      LIMIT ${SEARCH_ANALYTICS_GROUP_LIMIT}
    `

    const all = groupedRows.map(row => ({
      question: row.question,
      count: Number(row.count) || 0,
      down: Number(row.down) || 0
    }))
    const topQuestions = all
    const repeatedQuestions = all.filter(x => x.count > 1)
    const lowSatisfactionTopics = all
      .map(x => ({ ...x, downRate: x.count ? x.down / x.count : 0 }))
      .filter(x => x.count >= 2)
      .sort((a, b) => b.downRate - a.downRate)

    const unansweredRows = await prisma.pendingReview.findMany({
      where: { source: 'UNKNOWN_ANSWER', createdAt: { gte: from, lte: to } },
      select: { question: true }
    })

    return {
      topQuestions,
      unansweredQuestions: unansweredRows,
      repeatedQuestions,
      lowSatisfactionTopics
    }
  })

  app.get('/api/admin/audit-logs', { preHandler: adminGuard }, async request => {
    const query = request.query || {}
    const { from, to } = normalizeDateRange(query)
    const pagination = normalizePageQuery(query, { page: 1, pageSize: 20, maxPageSize: 500 })
    const where = {
      createdAt: { gte: from, lte: to },
      ...(query.entityType ? { entityType: query.entityType } : {}),
      ...(query.action ? { action: query.action } : {})
    }

    const [items, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: pagination.skip,
        take: pagination.pageSize
      }),
      prisma.auditLog.count({ where })
    ])

    return {
      items,
      page: pagination.page,
      pageSize: pagination.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pagination.pageSize))
    }
  })
}
