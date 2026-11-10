import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { normalizeLeaderboard } from './cloudApi.js'

const migration = readFileSync(new URL('../../supabase/migrations/20261111000000_leaderboard.sql', import.meta.url), 'utf8')
const avatarMigration = readFileSync(new URL('../../supabase/migrations/20261112000000_leaderboard_avatars.sql', import.meta.url), 'utf8')
const endpoint = readFileSync(new URL('../../supabase/functions/quiz-api/index.ts', import.meta.url), 'utf8')
const validLeaderboard = {
  entries: [
    { rank: 1, displayName: 'QA Мастер', xp: 120, answeredCount: 18, accuracy: 83, telegramUserId: 'private-id' },
    { rank: 2, displayName: 'Тестировщик 2', xp: 90, answeredCount: 12, accuracy: 75 },
  ],
  currentUserRank: 2,
  totalParticipants: 2,
  preferences: { enabled: true, displayName: 'Тестировщик 2' },
}

describe('leaderboard privacy and response validation', () => {
  it('accepts server rankings and strips unapproved identity fields', () => {
    expect(normalizeLeaderboard(validLeaderboard)).toEqual({
      entries: [
        { rank: 1, displayName: 'QA Мастер', xp: 120, answeredCount: 18, accuracy: 83, avatarUrl: null },
        { rank: 2, displayName: 'Тестировщик 2', xp: 90, answeredCount: 12, accuracy: 75, avatarUrl: null },
      ],
      currentUserRank: 2,
      totalParticipants: 2,
      preferences: { enabled: true, displayName: 'Тестировщик 2' },
    })
  })

  it('rejects malformed, oversized, duplicate-order, and invalid-name entries', () => {
    expect(normalizeLeaderboard({ ...validLeaderboard, entries: [{ ...validLeaderboard.entries[0], rank: 0 }] })).toBeNull()
    expect(normalizeLeaderboard({ ...validLeaderboard, entries: [{ ...validLeaderboard.entries[0], accuracy: 101 }] })).toBeNull()
    expect(normalizeLeaderboard({ ...validLeaderboard, entries: [{ ...validLeaderboard.entries[0], displayName: '<script>alert(1)</script>' }] })).toBeNull()
    expect(normalizeLeaderboard({ ...validLeaderboard, entries: Array(51).fill(validLeaderboard.entries[0]) })).toBeNull()
    expect(normalizeLeaderboard({ ...validLeaderboard, currentUserRank: 3 })).toBeNull()
  })

  it('keeps participation opt-in and returns only explicit pseudonyms from a service-only RPC', () => {
    expect(migration).toContain('leaderboard_enabled boolean not null default false')
    expect(migration).toContain('where profile.leaderboard_enabled and profile.leaderboard_name is not null')
    expect(migration).toContain("'displayName', ranked.leaderboard_name")
    expect(migration).not.toContain("'telegramUserId'")
    expect(migration).toMatch(/revoke all on function public\.get_public_leaderboard\(text, integer\) from public, anon, authenticated;/)
    expect(migration).toContain('to service_role;')
    expect(endpoint).toContain('verifySessionToken(token, sessionSecret)')
    expect(endpoint).toContain("body.action === 'update_leaderboard'")
    expect(endpoint).toContain("body.action === 'get_leaderboard'")
    expect(endpoint).toContain("body.action === 'get_leaderboard_preferences'")
  })

  it('returns photos only in the opted-in public leaderboard response', () => {
    expect(avatarMigration).toContain("'avatarUrl', ranked.avatar_url")
    expect(avatarMigration).toContain('where profile.leaderboard_enabled and profile.leaderboard_name is not null')
    expect(avatarMigration).not.toContain("'telegramUserId'")
    expect(avatarMigration).toContain('to service_role;')
  })
})
