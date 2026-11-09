const USER_ID_PATTERN = /^[1-9][0-9]{0,15}$/
const MAX_INIT_DATA_LENGTH = 8_192
const CLOCK_SKEW_SECONDS = 30

export class TelegramAuthError extends Error {
  constructor() {
    super('Telegram authorization data is invalid or expired')
    this.name = 'TelegramAuthError'
  }
}

async function hmac(keyBytes: Uint8Array, message: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message)))
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false
  let difference = 0
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index)
  return difference === 0
}

export interface VerifiedTelegramData {
  telegramUserId: string
  username: string | null
  firstName: string
  lastName: string | null
  avatarUrl: string | null
  authDate: number
}

export async function verifyTelegramInitData(
  rawInitData: string,
  botToken: string,
  nowMs = Date.now(),
  maxAgeSeconds = 3_600,
): Promise<VerifiedTelegramData> {
  if (typeof rawInitData !== 'string' || rawInitData.length === 0 || rawInitData.length > MAX_INIT_DATA_LENGTH || !botToken) {
    throw new TelegramAuthError()
  }

  let params: URLSearchParams
  try {
    params = new URLSearchParams(rawInitData)
  } catch {
    throw new TelegramAuthError()
  }

  const values = new Map<string, string>()
  for (const [key, value] of params.entries()) {
    if (values.has(key)) throw new TelegramAuthError()
    values.set(key, value)
  }

  const receivedHash = values.get('hash')?.toLowerCase()
  const authDate = Number(values.get('auth_date'))
  const nowSeconds = Math.floor(nowMs / 1_000)
  if (!receivedHash || !/^[0-9a-f]{64}$/.test(receivedHash) || !Number.isSafeInteger(authDate)) throw new TelegramAuthError()
  if (authDate > nowSeconds + CLOCK_SKEW_SECONDS || nowSeconds - authDate > maxAgeSeconds) throw new TelegramAuthError()

  const dataCheckString = [...values.entries()]
    .filter(([key]) => key !== 'hash')
    .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n')
  const secretKey = await hmac(new TextEncoder().encode('WebAppData'), botToken)
  const expectedHash = toHex(await hmac(secretKey, dataCheckString))
  if (!constantTimeEqual(receivedHash, expectedHash)) throw new TelegramAuthError()

  let user: Record<string, unknown>
  try {
    user = JSON.parse(values.get('user') ?? '')
  } catch {
    throw new TelegramAuthError()
  }

  if (!user || typeof user !== 'object' || !Number.isSafeInteger(user.id) || !USER_ID_PATTERN.test(String(user.id))) {
    throw new TelegramAuthError()
  }
  if (typeof user.first_name !== 'string' || user.first_name.trim().length === 0 || user.first_name.length > 128) {
    throw new TelegramAuthError()
  }

  const username = typeof user.username === 'string' && user.username.length <= 64 ? user.username : null
  const lastName = typeof user.last_name === 'string' && user.last_name.length <= 128 ? user.last_name : null
  let avatarUrl: string | null = null
  if (typeof user.photo_url === 'string' && user.photo_url.length <= 2_048) {
    try {
      const parsed = new URL(user.photo_url)
      if (parsed.protocol === 'https:') avatarUrl = parsed.href
    } catch {
      avatarUrl = null
    }
  }

  return {
    telegramUserId: String(user.id),
    username,
    firstName: user.first_name.trim(),
    lastName,
    avatarUrl,
    authDate,
  }
}