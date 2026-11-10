import { describe, expect, it } from 'vitest'
import { TelegramAuthError, verifyTelegramInitData } from '../../supabase/functions/_shared/telegramAuth.ts'
import { issueSessionToken, verifySessionToken } from '../../supabase/functions/_shared/sessionToken.ts'
import { readFileSync, readdirSync } from 'node:fs'

const BOT_TOKEN = 'local-test-bot-token-not-a-real-credential'
const SESSION_SECRET = 'local-only-session-signing-secret-32-bytes-minimum'
const NOW = Date.UTC(2026, 10, 9, 12, 0, 0)

async function hmac(keyBytes, message) {
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message)))
}

function toHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function signedInitData(user, authDate = Math.floor(NOW / 1_000)) {
  const params = new URLSearchParams({ auth_date: String(authDate), query_id: 'test-query', user: JSON.stringify(user) })
  const data = [...params.entries()]
    .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n')
  const secretKey = await hmac(new TextEncoder().encode('WebAppData'), BOT_TOKEN)
  params.set('hash', toHex(await hmac(secretKey, data)))
  return params.toString()
}

describe('Telegram authentication boundary', () => {
  it('accepts a correctly signed, fresh initData and returns only normalized identity fields', async () => {
    const raw = await signedInitData({ id: 123456, first_name: 'QA', last_name: 'Tester', username: 'qa_user', photo_url: 'https://t.me/photo.jpg' })
    await expect(verifyTelegramInitData(raw, BOT_TOKEN, NOW)).resolves.toEqual({
      telegramUserId: '123456',
      username: 'qa_user',
      firstName: 'QA',
      lastName: 'Tester',
      avatarUrl: 'https://t.me/photo.jpg',
      authDate: Math.floor(NOW / 1_000),
    })
  })

  it('rejects expired, future-dated, modified, duplicated and malformed initData', async () => {
    const expired = await signedInitData({ id: 123456, first_name: 'QA' }, Math.floor(NOW / 1_000) - 3_601)
    const valid = await signedInitData({ id: 123456, first_name: 'QA' })
    const tampered = valid.replace(/user=[^&]+/, 'user=%7B%22id%22%3A999%2C%22first_name%22%3A%22X%22%7D')

    await expect(verifyTelegramInitData(expired, BOT_TOKEN, NOW)).rejects.toBeInstanceOf(TelegramAuthError)
    await expect(verifyTelegramInitData(valid, BOT_TOKEN, NOW - 60_000, 3_600)).rejects.toBeInstanceOf(TelegramAuthError)
    await expect(verifyTelegramInitData(tampered, BOT_TOKEN, NOW)).rejects.toBeInstanceOf(TelegramAuthError)
    await expect(verifyTelegramInitData(`${valid}&auth_date=1`, BOT_TOKEN, NOW)).rejects.toBeInstanceOf(TelegramAuthError)
    await expect(verifyTelegramInitData('not-a-query-string', BOT_TOKEN, NOW)).rejects.toBeInstanceOf(TelegramAuthError)
  })

  it('rejects malformed or oversized identity claims even with a valid signature', async () => {
    const invalidUser = await signedInitData({ id: -1, first_name: 'QA' })
    const invalidName = await signedInitData({ id: 123, first_name: ' ' })
    await expect(verifyTelegramInitData(invalidUser, BOT_TOKEN, NOW)).rejects.toBeInstanceOf(TelegramAuthError)
    await expect(verifyTelegramInitData(invalidName, BOT_TOKEN, NOW)).rejects.toBeInstanceOf(TelegramAuthError)
    await expect(verifyTelegramInitData('x'.repeat(8_193), BOT_TOKEN, NOW)).rejects.toBeInstanceOf(TelegramAuthError)
  })
})

describe('server session token', () => {
  it('signs and verifies an expiring token without persisting it in browser storage', async () => {
    const token = await issueSessionToken('123456', SESSION_SECRET, NOW)
    await expect(verifySessionToken(token, SESSION_SECRET, NOW)).resolves.toBe('123456')
    await expect(verifySessionToken(token, SESSION_SECRET, NOW + 3_601_000)).rejects.toThrow('Unauthorized')
    await expect(verifySessionToken(token, `${SESSION_SECRET}-wrong`, NOW)).rejects.toThrow()
    await expect(verifySessionToken(`${token}x`, SESSION_SECRET, NOW)).rejects.toThrow('Unauthorized')
  })
})

describe('database access boundary', () => {
  it('enables RLS and denies direct browser access to private/public content tables', () => {
    const migration = readFileSync(new URL('../../supabase/migrations/20261109000000_qa_training.sql', import.meta.url), 'utf8')
    for (const table of ['profiles', 'user_progress', 'questions', 'daily_task_templates', 'daily_tasks', 'quiz_attempts', 'daily_task_completions', 'quiz_sessions']) {
      expect(migration).toContain(`alter table public.${table} enable row level security;`)
    }
    expect(migration).toMatch(/revoke all on public\.profiles[\s\S]*from anon, authenticated;/)
    expect(migration).not.toMatch(/using\s*\(\s*true\s*\)/i)
    expect(migration).toContain('unique (telegram_user_id, session_id, question_id)')
    expect(migration).toContain('unique (telegram_user_id, attempt_id)')
  })

  it('keeps RLS on every application table and revokes direct browser grants', () => {
    const migrationFiles = readdirSync(new URL('../../supabase/migrations/', import.meta.url)).filter((name) => name.endsWith('.sql'))
    const migrations = migrationFiles.map((name) => readFileSync(new URL(`../../supabase/migrations/${name}`, import.meta.url), 'utf8')).join('\n')
    const tables = [...migrations.matchAll(/create table(?: if not exists)? public\.([a-z_][a-z_0-9]*)\s*\(/gi)].map(([, name]) => name.toLowerCase())
    const uniqueTables = [...new Set(tables)]
    expect(uniqueTables.length).toBeGreaterThan(10)

    const rowSecurity = new Set([...migrations.matchAll(/alter table public\.([a-z_][a-z_0-9]*) enable row level security/gi)].map(([, name]) => name.toLowerCase()))
    const directGrants = [...migrations.matchAll(/revoke all on (public\.[^;]+?) from anon, authenticated;/gi)]
      .flatMap(([, names]) => names.split(',').map((name) => name.trim().replace(/^public\./i, '').toLowerCase()))

    for (const table of uniqueTables) {
      expect(rowSecurity, `${table} must enable RLS`).toContain(table)
      expect(directGrants, `${table} must deny anon/authenticated table grants`).toContain(table)
    }
  })

  it('revokes public browser execution from every SECURITY DEFINER function', () => {
    const migrationFiles = readdirSync(new URL('../../supabase/migrations/', import.meta.url)).filter((name) => name.endsWith('.sql'))
    const migrations = migrationFiles.map((name) => readFileSync(new URL(`../../supabase/migrations/${name}`, import.meta.url), 'utf8')).join('\n')
    const definitions = [...migrations.matchAll(/create or replace function public\.([a-z_][a-z_0-9]*)\s*\(([\s\S]*?)(?=create or replace function public\.|$)/gi)]
      .filter(([, , body]) => /\bsecurity definer\b/i.test(body))
    expect(definitions.length).toBeGreaterThan(10)

    const revokedFunctions = new Set([...migrations.matchAll(/revoke all on function public\.([a-z_][a-z_0-9]*)\s*\([^;]*\)\s+from public,\s*anon,\s*authenticated;/gi)].map(([, name]) => name.toLowerCase()))
    for (const [, name] of definitions) {
      expect(revokedFunctions, `${name} must revoke PUBLIC/anon/authenticated execution`).toContain(name.toLowerCase())
    }
  })
})
