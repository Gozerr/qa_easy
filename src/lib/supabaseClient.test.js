import { describe, expect, it } from 'vitest'
import { getSupabaseConfig } from './supabaseClient.js'
import { normalizeServerStats } from './cloudApi.js'

describe('Supabase configuration and response validation', () => {
  it('handles missing environment values without throwing', () => {
    expect(getSupabaseConfig({})).toEqual({ configured: false, reason: 'missing' })
    expect(getSupabaseConfig({ VITE_SUPABASE_URL: 'https://project.supabase.co' })).toEqual({ configured: false, reason: 'missing' })
  })

  it('accepts HTTPS Project URL and a public key without exposing a service role', () => {
    const config = getSupabaseConfig({
      VITE_SUPABASE_URL: 'https://project.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_public-key-example',
    })
    expect(config).toEqual({ configured: true, url: 'https://project.supabase.co', publishableKey: 'sb_publishable_public-key-example' })
  })

  it('rejects insecure or credential-bearing project URLs', () => {
    expect(getSupabaseConfig({ VITE_SUPABASE_URL: 'http://remote.example', VITE_SUPABASE_ANON_KEY: 'public-key-example' }).reason).toBe('invalid')
    expect(getSupabaseConfig({ VITE_SUPABASE_URL: 'https://user:pass@project.supabase.co', VITE_SUPABASE_ANON_KEY: 'public-key-example' }).reason).toBe('invalid')
  })

  it('refuses secret/service-role keys in browser environment variables', () => {
    expect(getSupabaseConfig({ VITE_SUPABASE_URL: 'https://project.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_do-not-use' }).reason).toBe('secret-key-not-allowed')
    const encoded = btoa(JSON.stringify({ role: 'service_role' })).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '')
    expect(getSupabaseConfig({ VITE_SUPABASE_URL: 'https://project.supabase.co', VITE_SUPABASE_ANON_KEY: `a.${encoded}.c` }).reason).toBe('secret-key-not-allowed')
  })

  it('rejects malformed, oversized and inconsistent server stats', () => {
    const valid = { xp: 10, answeredCount: 2, correctCount: 1, currentStreak: 1, longestStreak: 1, completedQuestionIds: ['qa-01'], dailyCompletions: ['2026-11-09'] }
    expect(normalizeServerStats(valid)).toEqual(valid)
    expect(normalizeServerStats({ ...valid, correctCount: 3 })).toBeNull()
    expect(normalizeServerStats({ ...valid, xp: Number.MAX_SAFE_INTEGER + 2 })).toBeNull()
    expect(normalizeServerStats({ ...valid, dailyCompletions: ['2026-02-30'] })).toBeNull()
  })
})