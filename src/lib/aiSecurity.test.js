import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { isSoleAdmin, isZeroPricedModel } from '../../supabase/functions/_shared/aiContent.ts'

const migration = readFileSync(new URL('../../supabase/migrations/20261110000000_ai_content_workflow.sql', import.meta.url), 'utf8')
const endpoint = readFileSync(new URL('../../supabase/functions/ai-admin/index.ts', import.meta.url), 'utf8')
const contentHelper = readFileSync(new URL('../../supabase/functions/_shared/aiContent.ts', import.meta.url), 'utf8')

describe('AI admin security boundary', () => {
  it('accepts only exact catalog IDs with explicit zero prompt and completion prices', () => {
    expect(isZeroPricedModel({ id: 'approved:free', pricing: { prompt: '0', completion: 0 } }, 'approved:free')).toBe(true)
    expect(isZeroPricedModel({ id: 'paid', pricing: { prompt: '0.01', completion: '0' } }, 'paid')).toBe(false)
    expect(isZeroPricedModel({ id: 'approved:free', pricing: { prompt: null, completion: 0 } }, 'approved:free')).toBe(false)
    expect(isZeroPricedModel({ id: 'other:free', pricing: { prompt: 0, completion: 0 } }, 'approved:free')).toBe(false)
    expect(endpoint).toContain('isZeroPricedModel(model, GENERATOR_MODEL)')
    expect(endpoint).toContain('isZeroPricedModel(model, REVIEWER_MODEL)')
  })

  it('allows exactly one valid Telegram admin ID and rejects lists or malformed IDs', () => {
    expect(isSoleAdmin('123456789', '123456789')).toBe(true)
    expect(isSoleAdmin(undefined, '123456789')).toBe(false)
    expect(isSoleAdmin('123456789,987654321', '123456789')).toBe(false)
    expect(isSoleAdmin('0123456789', '0123456789')).toBe(false)
    expect(isSoleAdmin('123456789', '987654321')).toBe(false)
  })

  it('keeps AI records private and allows only service-role database operations', () => {
    for (const table of ['ai_content_drafts', 'ai_content_events', 'ai_generation_windows']) {
      expect(migration).toContain(`alter table public.${table} enable row level security;`)
    }
    expect(migration).toMatch(/revoke all on public\.ai_content_drafts[\s\S]*from anon, authenticated;/)
    expect(migration).toContain('grant all on public.ai_content_drafts, public.ai_content_events, public.ai_generation_windows to service_role;')
    expect(migration).toContain("v_draft.status <> 'approved'")
    expect(migration).toContain("set status = 'published'")
  })

  it('authorizes through verified Telegram identity and configured admin IDs only', () => {
    expect(endpoint).toContain("Deno.env.get('TELEGRAM_ADMIN_IDS')")
    expect(endpoint).toContain('verifySessionToken(token, sessionSecret)')
    expect(endpoint).toContain("if (!admin) return jsonResponse(request, { error: 'Недостаточно прав.' }, 403)")
    expect(endpoint).not.toContain('VITE_OPENROUTER')
    expect(endpoint).toContain("Deno.env.get('OPENROUTER_API_KEY')")
  })

  it('pins the approved free models, disables provider fallback and caps revisions', () => {
    expect(contentHelper).toContain("google/gemma-4-31b-it:free")
    expect(contentHelper).toContain("nvidia/nemotron-3.5-super-vl:free")
    expect(endpoint).toContain('assertConfiguredFreeModels()')
    expect(endpoint).toContain('allow_fallbacks: false')
    expect(endpoint).toContain('attempt <= 2')
    expect(endpoint).toContain("response_format: { type: 'json_object' }")
  })

  it('publishes only a reviewer-approved draft through a database transaction', () => {
    expect(endpoint).toContain("review.approved && review.correctOptionId === question.correctOptionId")
    expect(endpoint).toContain("action === 'publish'")
    expect(endpoint).toContain("client.rpc('publish_ai_content_draft'")
    expect(migration).toContain('for update;')
  })
})
