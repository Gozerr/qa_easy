import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const migration = readFileSync(new URL('../../supabase/migrations/20261113000000_weekly_missions.sql', import.meta.url), 'utf8')
const endpoint = readFileSync(new URL('../../supabase/functions/quiz-api/index.ts', import.meta.url), 'utf8')
const xpHistoryMigration = readFileSync(new URL('../../supabase/migrations/20261114000000_xp_history.sql', import.meta.url), 'utf8')

describe('server-backed weekly missions', () => {
  it('stores one claim per user, week and mission and only grants configured rewards', () => {
    expect(migration).toContain('primary key (telegram_user_id, week_start, mission_id)')
    expect(migration).toContain("p_mission_id not in ('daily-3', 'answers-10', 'accuracy-80')")
    expect(migration).toContain('on conflict do nothing')
    expect(migration).toContain('get diagnostics v_inserted = row_count')
    expect(migration).toContain('if v_inserted = 0 then')
    expect(migration).toContain("v_attempt_count >= 10 and v_correct_count * 100 >= v_attempt_count * 80")
    expect(migration).toContain('delete from public.weekly_mission_claims where telegram_user_id = p_telegram_user_id')
  })

  it('exposes missions only through the verified quiz API and restricts the RPCs to service role', () => {
    expect(endpoint).toContain("body.action === 'get_weekly_missions'")
    expect(endpoint).toContain("body.action === 'claim_weekly_mission'")
    expect(migration).toMatch(/revoke all on function public\.claim_weekly_mission\(text, date, text\) from public, anon, authenticated;/)
    expect(migration).toContain('grant execute on function public.claim_weekly_mission(text, date, text) to service_role;')
  })

  it('builds XP history from persisted server answers and claimed mission rewards', () => {
    expect(xpHistoryMigration).toContain('from public.quiz_attempts a')
    expect(xpHistoryMigration).toContain('from public.weekly_mission_claims c')
    expect(xpHistoryMigration).toContain('revoke all on function public.get_xp_history(text, integer) from public, anon, authenticated;')
    expect(xpHistoryMigration).toContain('grant execute on function public.get_xp_history(text, integer) to service_role;')
    expect(endpoint).toContain("body.action === 'get_xp_history'")
  })
})
