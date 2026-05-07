const ADMIN_API_KEY = process.env.ADMIN_API_KEY || ''

function toDate(value, fallback) {
  if (!value) return fallback
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? fallback : d
}

function toInt(value, fallback = 0) {
  const n = Number.parseInt(value, 10)
  return Number.isNaN(n) ? fallback : n
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

function calculateInteractionCostForModel(MODELS, { modelId, inputTokens, outputTokens }) {
  const model = MODELS.find(m => m.id === modelId)
  const inputPricePer1M = model?.cost?.token_1m?.input
  const outputPricePer1M = model?.cost?.token_1m?.output

  if (typeof inputPricePer1M !== 'number' || typeof outputPricePer1M !== 'number') {
    return 0
  }

  const inTokens = Number.isFinite(inputTokens) ? inputTokens : 0
  const outTokens = Number.isFinite(outputTokens) ? outputTokens : 0
  return (inTokens * (inputPricePer1M / 1_000_000)) + (outTokens * (outputPricePer1M / 1_000_000))
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

  app.get('/api/admin/dashboard', { preHandler: adminGuard }, async () => {
    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

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
      interactions,
      pendingUnknown
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
      prisma.interaction.findMany({ select: { modelId: true, isThumbUp: true, cost: true, responseTime: true } }),
      prisma.pendingReview.findMany({ where: { source: 'UNKNOWN_ANSWER', interactionId: { not: null } }, select: { interaction: { select: { modelId: true } } } })
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

    for (const row of interactions) {
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
      entry.answers += 1
      if (row.isThumbUp === true) entry.thumbUp += 1
      if (row.isThumbUp === false) entry.thumbDown += 1
      entry.sumCost += row.cost || 0
      entry.sumLatency += row.responseTime || 0
      byModel.set(row.modelId, entry)
    }

    for (const row of pendingUnknown) {
      const modelId = row.interaction?.modelId
      if (!modelId || !byModel.has(modelId)) continue
      byModel.get(modelId).unknown += 1
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
    const status = normalizeKbStatus(query.status)
    const deleted = normalizeDeletedFilter(query.deleted)
    const isDeleteFilter = deleted === 'all' ? undefined : deleted === 'deleted'
    const where = {
      ...(isDeleteFilter === undefined ? {} : { isDelete: isDeleteFilter }),
      ...(category ? { category } : {}),
      ...(status ? { status } : {})
    }
    const pagination = normalizePageQuery(query, { page: 1, pageSize: 20, maxPageSize: 500 })
    const [items, total] = await Promise.all([
      prisma.knowledgeBase.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: pagination.skip,
        take: pagination.pageSize
      }),
      prisma.knowledgeBase.count({ where })
    ])

    return {
      items,
      page: pagination.page,
      pageSize: pagination.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pagination.pageSize))
    }
  })

  app.get('/api/admin/knowledge-base/categories', { preHandler: adminGuard }, async () => {
    const rows = await prisma.knowledgeBase.findMany({
      where: { isDelete: false },
      select: { category: true },
      distinct: ['category'],
      orderBy: { category: 'asc' }
    })
    return { items: rows.map(r => r.category) }
  })

  app.post('/api/admin/knowledge-base', { preHandler: adminGuard }, async request => {
    const body = request.body || {}
    const createdBy = request.headers['x-admin-user'] || 'admin'
    const status = normalizeKbStatus(body.status, 'DRAFT')
    const created = await prisma.knowledgeBase.create({
      data: {
        category: body.category,
        question: body.question,
        answer: body.answer,
        status,
        isActive: status === 'PUBLISHED'
      }
    })
    await writeAudit({ action: 'CREATE_KB', entityType: 'KnowledgeBase', entityId: created.id, newValue: created, changedBy: String(createdBy), request })
    await writeAudit({ action: `CREATE_KB_${status}`, entityType: 'KnowledgeBase', entityId: created.id, newValue: { status }, changedBy: String(createdBy), request })
    await refreshRuntimeTextConfig(true)
    return { item: created }
  })

  app.post('/api/admin/knowledge-base/import', { preHandler: adminGuard }, async request => {
    const body = request.body || {}
    const changedBy = String(request.headers['x-admin-user'] || 'admin')
    const items = Array.isArray(body.items) ? body.items : []
    if (!items.length) return { imported: 0, skipped: 0 }

    const normalized = items
      .map(item => ({
        category: String(item.category || '').trim(),
        question: String(item.question || '').trim(),
        answer: String(item.answer || '').trim(),
        status: normalizeKbStatus(item.status, 'PUBLISHED'),
        isActive: normalizeKbStatus(item.status, 'PUBLISHED') === 'PUBLISHED'
      }))
      .filter(item => item.category && item.question && item.answer)

    if (!normalized.length) return { imported: 0, skipped: items.length }

    const result = await prisma.knowledgeBase.createMany({
      data: normalized,
      skipDuplicates: true
    })

    await writeAudit({
      action: 'IMPORT_KB',
      entityType: 'KnowledgeBase',
      entityId: 0,
      newValue: { requested: items.length, normalized: normalized.length, imported: result.count },
      changedBy,
      request
    })
    await refreshRuntimeTextConfig(true)
    return { imported: result.count, skipped: items.length - result.count }
  })

  app.patch('/api/admin/knowledge-base/:id', { preHandler: adminGuard }, async (request, reply) => {
    const id = toInt(request.params.id)
    const body = request.body || {}
    const changedBy = String(request.headers['x-admin-user'] || 'admin')
    const oldValue = await prisma.knowledgeBase.findFirst({ where: { id, isDelete: false } })
    if (!oldValue) return { error: 'Not found' }

    const statusFromBody = normalizeKbStatus(body.status)
    const nextStatus = statusFromBody || (body.isActive !== undefined ? (Boolean(body.isActive) ? 'PUBLISHED' : 'ARCHIVED') : null)

    if (nextStatus && !canTransitionKbStatus(oldValue.status, nextStatus)) {
      return reply.code(400).send({
        error: `Invalid KB status transition: ${oldValue.status} -> ${nextStatus}`
      })
    }

    const updated = await prisma.knowledgeBase.update({
      where: { id },
      data: {
        ...(body.category !== undefined ? { category: body.category } : {}),
        ...(body.question !== undefined ? { question: body.question } : {}),
        ...(body.answer !== undefined ? { answer: body.answer } : {}),
        ...(nextStatus ? { status: nextStatus, isActive: nextStatus === 'PUBLISHED' } : {})
      }
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
    return { item: updated }
  })

  app.delete('/api/admin/knowledge-base/:id', { preHandler: adminGuard }, async request => {
    const id = toInt(request.params.id)
    const changedBy = String(request.headers['x-admin-user'] || 'admin')
    const oldValue = await prisma.knowledgeBase.findFirst({ where: { id, isDelete: false } })
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
    const oldValue = await prisma.knowledgeBase.findFirst({ where: { id, isDelete: true } })
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
      changedBy
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
      ...(query.source === 'playground' ? { userId: { startsWith: 'playground:' } } : {}),
      ...(query.source === 'chat' ? { NOT: { userId: { startsWith: 'playground:' } } } : {}),
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
      ...(body.source === 'playground' ? { userId: { startsWith: 'playground:' } } : {}),
      ...(body.source === 'chat' ? { NOT: { userId: { startsWith: 'playground:' } } } : {}),
      ...(body.isThumbUp === 'true' ? { isThumbUp: true } : {}),
      ...(body.isThumbUp === 'false' ? { isThumbUp: false } : {})
    }

    const rows = await prisma.interaction.findMany({
      where,
      select: { id: true, modelId: true, inputTokens: true, outputTokens: true }
    })

    if (!rows.length) return { updated: 0 }

    const updates = rows.map(row => {
      const cost = calculateInteractionCostForModel(MODELS, row)
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

    const items = await prisma.pendingReview.findMany({ where, orderBy: { createdAt: 'desc' } })

    const grouped = new Map()
    for (const item of items) {
      const key = item.question
      const curr = grouped.get(key) || { question: item.question, count: 0, latest: item }
      curr.count += 1
      if (new Date(item.createdAt) > new Date(curr.latest.createdAt)) curr.latest = item
      grouped.set(key, curr)
    }

    const groups = [...grouped.values()]
      .sort((a, b) => new Date(b.latest.createdAt) - new Date(a.latest.createdAt))
    const total = groups.length
    const slicedGroups = groups.slice(pagination.skip, pagination.skip + pagination.pageSize)

    return {
      groups: slicedGroups,
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
      answer: item.aiResponse || 'Please update this answer with verified information before publishing.'
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
        category: body.category || 'General',
        question: body.question || item.question,
        answer: body.answer || item.aiResponse || '',
        status: 'REVIEW',
        isActive: false
      }
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

  app.post('/api/admin/auth/login', async (request, reply) => {
    const body = request.body || {}
    const username = String(body.username || '').trim()
    const password = String(body.password || '')
    if (!username || !password) {
      return reply.code(400).send({ ok: false, error: 'username and password required' })
    }
    const user = await prisma.adminUser.findFirst({
      where: { username, isDelete: false }
    })
    if (!user || user.password !== password) {
      return reply.code(401).send({ ok: false, error: 'Invalid credentials' })
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

  app.post('/api/admin/admin-users', { preHandler: adminGuard }, async request => {
    const body = request.body || {}
    const changedBy = String(request.headers['x-admin-user'] || 'admin')
    const item = await prisma.adminUser.create({ data: { username: body.username, password: body.password } })
    await writeAudit({ action: 'CREATE_ADMIN_USER', entityType: 'AdminUser', entityId: item.id, newValue: { id: item.id, username: item.username }, changedBy, request })
    return { item }
  })

  app.patch('/api/admin/admin-users/:id', { preHandler: adminGuard }, async request => {
    const id = toInt(request.params.id)
    const body = request.body || {}
    const changedBy = String(request.headers['x-admin-user'] || 'admin')
    const oldValue = await prisma.adminUser.findFirst({ where: { id, isDelete: false } })
    if (!oldValue) return { error: 'Not found' }

    const item = await prisma.adminUser.update({
      where: { id },
      data: {
        ...(body.username !== undefined ? { username: body.username } : {}),
        ...(body.password !== undefined ? { password: body.password } : {})
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

  app.post('/api/admin/admin-users/:id/restore', { preHandler: adminGuard }, async request => {
    const id = toInt(request.params.id)
    const changedBy = String(request.headers['x-admin-user'] || 'admin')
    const oldValue = await prisma.adminUser.findFirst({ where: { id, isDelete: true } })
    if (!oldValue) return { error: 'Not found' }

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
    const rows = await prisma.interaction.findMany({
      where: { createdAt: { gte: from, lte: to } },
      select: { modelId: true, isThumbUp: true, responseTime: true, inputTokens: true, outputTokens: true, cost: true, id: true }
    })

    const unknownRows = await prisma.pendingReview.findMany({
      where: { source: 'UNKNOWN_ANSWER', createdAt: { gte: from, lte: to } },
      select: { interaction: { select: { modelId: true } } }
    })

    const unknownByModel = new Map()
    for (const row of unknownRows) {
      const modelId = row.interaction?.modelId
      if (!modelId) continue
      unknownByModel.set(modelId, (unknownByModel.get(modelId) || 0) + 1)
    }

    const map = new Map()
    for (const row of rows) {
      const curr = map.get(row.modelId) || {
        modelId: row.modelId,
        answers: 0,
        thumbUp: 0,
        thumbDown: 0,
        latencySum: 0,
        inputSum: 0,
        outputSum: 0,
        costSum: 0
      }
      curr.answers += 1
      if (row.isThumbUp === true) curr.thumbUp += 1
      if (row.isThumbUp === false) curr.thumbDown += 1
      curr.latencySum += row.responseTime || 0
      curr.inputSum += row.inputTokens || 0
      curr.outputSum += row.outputTokens || 0
      curr.costSum += row.cost || 0
      map.set(row.modelId, curr)
    }

    const items = [...map.values()].map(v => {
      const unknown = unknownByModel.get(v.modelId) || 0
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
        avgCost: v.answers ? v.costSum / v.answers : 0,
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
    const rows = await prisma.interaction.findMany({
      where: { createdAt: { gte: from, lte: to } },
      select: { userQuestion: true, isThumbUp: true }
    })

    const topMap = new Map()
    for (const row of rows) {
      const q = (row.userQuestion || '').trim()
      if (!q) continue
      const curr = topMap.get(q) || { question: q, count: 0, down: 0 }
      curr.count += 1
      if (row.isThumbUp === false) curr.down += 1
      topMap.set(q, curr)
    }

    const all = [...topMap.values()].sort((a, b) => b.count - a.count)
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
