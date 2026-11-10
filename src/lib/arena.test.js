import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const migration = readFileSync(new URL('../../supabase/migrations/20261115000000_qa_arena.sql', import.meta.url), 'utf8')
const endpoint = readFileSync(new URL('../../supabase/functions/quiz-api/index.ts', import.meta.url), 'utf8')

describe('server-verified QA Arena', () => {
  it('accepts only ten unique answers from a live verified scenario session', () => {
    expect(migration).toContain("a.category = 'scenarios'")
    expect(migration).toContain('cardinality(s.question_ids) = 10')
    expect(migration).toContain('cardinality(p_attempt_ids) <> 10')
    expect(migration).toContain("raise exception 'Arena requires ten verified scenario answers'")
    expect(migration).toContain('on conflict (telegram_user_id, session_id) do nothing')
    expect(migration).toContain('delete from public.arena_submissions where telegram_user_id = p_telegram_user_id')
  })

  it('uses an opt-in pseudonym leaderboard and service-only RPC access', () => {
    expect(migration).toContain('profile.leaderboard_enabled and profile.leaderboard_name is not null')
    expect(migration).not.toContain("'telegramUserId'")
    expect(migration).toContain('revoke all on function public.submit_arena_result(text, uuid, uuid[]) from public, anon, authenticated;')
    expect(migration).toContain('grant execute on function public.get_arena_leaderboard(text, text) to service_role;')
    expect(endpoint).toContain("body.action === 'submit_arena_result'")
    expect(endpoint).toContain("body.action === 'get_arena_leaderboard'")
    expect(endpoint).toContain('verifySessionToken(token, sessionSecret)')
  })
})
