import { createClient } from 'npm:@supabase/supabase-js@2'

const MAX_BODY_BYTES = 16_384
const DEVELOPMENT_ORIGINS = new Set(['http://localhost:5173', 'http://127.0.0.1:5173'])

export function isAllowedOrigin(request: Request): boolean {
  const origin = request.headers.get('origin')
  if (!origin) return true
  if (DEVELOPMENT_ORIGINS.has(origin)) return true
  return (Deno.env.get('ALLOWED_ORIGINS') ?? '').split(',').map((item) => item.trim()).filter(Boolean).includes(origin)
}

export function corsHeaders(request: Request): HeadersInit {
  const origin = request.headers.get('origin')
  return {
    ...(origin && isAllowedOrigin(request) ? { 'Access-Control-Allow-Origin': origin } : {}),
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  }
}

export function jsonResponse(request: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(request), 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}

export async function readJsonBody(request: Request): Promise<Record<string, unknown>> {
  const contentLength = Number(request.headers.get('content-length') ?? 0)
  if (contentLength > MAX_BODY_BYTES) throw new Error('Payload too large')
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new Error('JSON required')

  const text = await request.text()
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) throw new Error('Payload too large')
  const value = JSON.parse(text)
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Object required')
  return value as Record<string, unknown>
}

export function createServiceClient() {
  const url = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !serviceRoleKey) throw new Error('Server configuration unavailable')
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
}