// HMAC-signed admin session tokens. Web Crypto APIs are used so this module
// works in both Edge (middleware) and Node (server actions / route handlers)
// runtimes.

const SESSION_TTL_MS = 24 * 60 * 60 * 1000 // 24h
const COOKIE_NAME = 'admin_auth'

const encoder = new TextEncoder()
const decoder = new TextDecoder()

function getSecret () {
  const secret = process.env.ADMIN_SESSION_SECRET
  if (!secret || secret.length < 32) {
    throw new Error('ADMIN_SESSION_SECRET must be set and at least 32 characters')
  }
  return secret
}

function base64UrlEncode (bytes) {
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64UrlDecode (str) {
  const pad = str.length % 4 === 0 ? '' : '='.repeat(4 - (str.length % 4))
  const bin = atob(str.replace(/-/g, '+').replace(/_/g, '/') + pad)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

async function importKey () {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(getSecret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  )
}

function timingSafeEqual (a, b) {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]
  return diff === 0
}

export async function createSessionToken (username, ttlMs = SESSION_TTL_MS) {
  const payload = { u: username, e: Date.now() + ttlMs }
  const payloadBytes = encoder.encode(JSON.stringify(payload))
  const key = await importKey()
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, payloadBytes))
  return `${base64UrlEncode(payloadBytes)}.${base64UrlEncode(sig)}`
}

export async function verifySessionToken (token) {
  if (typeof token !== 'string' || !token.includes('.')) return null
  const [payloadB64, sigB64] = token.split('.')
  if (!payloadB64 || !sigB64) return null

  let payloadBytes, sig
  try {
    payloadBytes = base64UrlDecode(payloadB64)
    sig = base64UrlDecode(sigB64)
  } catch {
    return null
  }

  let key
  try {
    key = await importKey()
  } catch {
    return null
  }

  const expected = new Uint8Array(await crypto.subtle.sign('HMAC', key, payloadBytes))
  if (!timingSafeEqual(expected, sig)) return null

  let payload
  try {
    payload = JSON.parse(decoder.decode(payloadBytes))
  } catch {
    return null
  }

  if (typeof payload?.u !== 'string' || typeof payload?.e !== 'number') return null
  if (Date.now() > payload.e) return null
  return { username: payload.u, expiresAt: payload.e }
}

export const SESSION_COOKIE_NAME = COOKIE_NAME
export const SESSION_TTL_SECONDS = SESSION_TTL_MS / 1000
