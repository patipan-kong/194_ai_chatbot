import { z } from 'zod'

const trimmedString = z
  .string()
  .transform(s => s.trim())

export const chatRequestSchema = z
  .object({
    message: trimmedString.pipe(z.string().min(1, 'message is required')),
    model: trimmedString.pipe(z.string().min(1)).optional(),
    userId: trimmedString.pipe(z.string().min(1).max(128)).optional()
  })
  .passthrough()

export const feedbackRequestSchema = z
  .object({
    isThumbUp: z.boolean()
  })
  .strict()

export function formatZodError (zodError) {
  const issue = zodError?.issues?.[0]
  if (!issue) return 'Invalid request'
  const path = (issue.path || []).join('.')
  return path ? `${path}: ${issue.message}` : issue.message
}
