export async function register () {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  const errors = []

  if (!process.env.ADMIN_SESSION_SECRET || process.env.ADMIN_SESSION_SECRET.length < 32) {
    errors.push('ADMIN_SESSION_SECRET must be set and at least 32 characters')
  }

  if (!process.env.API_BASE_URL) {
    errors.push('API_BASE_URL is required')
  }

  if (errors.length) {
    const message = `Missing required environment variables:\n${errors.map(e => `  - ${e}`).join('\n')}`
    console.error(`[startup] FATAL: ${message}`)
    throw new Error(message)
  }
}
