const USER_ID_PATTERN = /^[1-9][0-9]{0,15}$/
const SESSION_LIFETIME_SECONDS = 3_600

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '')
}

function decodeBase64Url(value: string): Uint8Array {
  const base64 = value.replaceAll('-', '+').replaceAll('_', '/')
  const binary = atob(base64 + '='.repeat((4 - base64.length % 4) % 4))
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false
  let difference = 0
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index]
  return difference === 0
}

async function sign(secret: string, message: string): Promise<Uint8Array> {
  if (secret.length < 32) throw new Error('Session signing secret is not configured')
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify'])
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message)))
}

export async function issueSessionToken(telegramUserId: string, secret: string, nowMs = Date.now()): Promise<string> {
  if (!USER_ID_PATTERN.test(telegramUserId)) throw new Error('Invalid verified user ID')
  const now = Math.floor(nowMs / 1_000)
  const header = encodeBase64Url(new TextEncoder().encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })))
  const payload = encodeBase64Url(new TextEncoder().encode(JSON.stringify({ sub: telegramUserId, iat: now, exp: now + SESSION_LIFETIME_SECONDS, iss: 'qa-na-paltsakh' })))
  const input = `${header}.${payload}`
  return `${input}.${encodeBase64Url(await sign(secret, input))}`
}

export async function verifySessionToken(token: string, secret: string, nowMs = Date.now()): Promise<string> {
  if (typeof token !== 'string' || token.length > 4_096) throw new Error('Unauthorized')
  const parts = token.split('.')
  if (parts.length !== 3) throw new Error('Unauthorized')
  const input = `${parts[0]}.${parts[1]}`
  const expected = await sign(secret, input)
  let actual: Uint8Array
  let header: Record<string, unknown>
  let payload: Record<string, unknown>
  try {
    actual = decodeBase64Url(parts[2])
    header = JSON.parse(new TextDecoder().decode(decodeBase64Url(parts[0])))
    payload = JSON.parse(new TextDecoder().decode(decodeBase64Url(parts[1])))
  } catch {
    throw new Error('Unauthorized')
  }

  const now = Math.floor(nowMs / 1_000)
  if (!constantTimeEqual(expected, actual)
    || header.alg !== 'HS256'
    || payload.iss !== 'qa-na-paltsakh'
    || typeof payload.sub !== 'string'
    || !USER_ID_PATTERN.test(payload.sub)
    || !Number.isSafeInteger(payload.iat)
    || !Number.isSafeInteger(payload.exp)
    || payload.iat > now + 30
    || payload.exp <= now
    || payload.exp - payload.iat > SESSION_LIFETIME_SECONDS) {
    throw new Error('Unauthorized')
  }
  return payload.sub
}