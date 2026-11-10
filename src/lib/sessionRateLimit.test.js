import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const migration = readFileSync(new URL('../../supabase/migrations/20261119000000_quiz_session_limits.sql', import.meta.url), 'utf8')
const endpoint = readFileSync(new URL('../../supabase/functions/quiz-api/index.ts', import.meta.url), 'utf8')
const client = readFileSync(new URL('./cloudApi.js', import.meta.url), 'utf8')

describe('quiz session request limits', () => {
  it('serializes per-user session creation before checking minute and daily caps', () => {
    expect(migration).toContain('where telegram_user_id = p_telegram_user_id\n  for update;')
    expect(migration).toContain("created_at >= now() - interval '1 minute'")
    expect(migration).toContain('v_recent_count >= 20 or v_daily_count >= 180')
    expect(migration).toContain('on public.quiz_sessions (telegram_user_id, created_at desc)')
    expect(migration.indexOf('for update')).toBeLessThan(migration.indexOf('select\n    count(*) filter'))
    expect(migration.indexOf('v_recent_count >= 20')).toBeLessThan(migration.indexOf('insert into public.quiz_sessions'))
  })

  it('keeps the RPC server-only and returns a bounded rate-limit response', () => {
    expect(migration).toContain('revoke all on function public.create_quiz_session(text, uuid, text[]) from public, anon, authenticated;')
    expect(migration).toContain('grant execute on function public.create_quiz_session(text, uuid, text[]) to service_role;')
    expect(endpoint).toContain("sessionError?.message === 'Quiz session rate limit exceeded'")
    expect(endpoint).toContain("'Слишком много запусков. Попробуйте снова через минуту.' }, 429")
    expect(client).toContain('error?.context?.status === 429')
    expect(client).toContain('const SESSION_RATE_LIMIT_MESSAGE =')
  })
})
