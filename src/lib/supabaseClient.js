import { createClient } from '@supabase/supabase-js'

export function getSupabaseConfig(environment = {}) {
  const rawUrl = environment.VITE_SUPABASE_URL?.trim()
  const publishableKey = (environment.VITE_SUPABASE_PUBLISHABLE_KEY ?? environment.VITE_SUPABASE_ANON_KEY)?.trim()

  if (!rawUrl || !publishableKey) return { configured: false, reason: 'missing' }
  if (publishableKey.length > 4_096 || /\s/.test(publishableKey)) return { configured: false, reason: 'invalid' }
  if (publishableKey.startsWith('sb_secret_')) return { configured: false, reason: 'secret-key-not-allowed' }
  const jwtParts = publishableKey.split('.')
  if (jwtParts.length === 3) {
    try {
      const base64 = jwtParts[1].replaceAll('-', '+').replaceAll('_', '/')
      const payload = JSON.parse(atob(base64 + '='.repeat((4 - base64.length % 4) % 4)))
      if (payload.role === 'service_role') return { configured: false, reason: 'secret-key-not-allowed' }
    } catch {
      return { configured: false, reason: 'invalid' }
    }
  }

  try {
    const url = new URL(rawUrl)
    const localHttp = ['localhost', '127.0.0.1'].includes(url.hostname) && url.protocol === 'http:'
    if ((!localHttp && url.protocol !== 'https:') || url.username || url.password || url.search || url.hash) {
      return { configured: false, reason: 'invalid' }
    }
    if (url.pathname !== '/' || !url.hostname) return { configured: false, reason: 'invalid' }
    return { configured: true, url: url.origin, publishableKey }
  } catch {
    return { configured: false, reason: 'invalid' }
  }
}

export const supabaseConfig = getSupabaseConfig(import.meta.env ?? {})
export const isSupabaseConfigured = supabaseConfig.configured
export const supabaseClient = isSupabaseConfigured
  ? createClient(supabaseConfig.url, supabaseConfig.publishableKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    })
  : null