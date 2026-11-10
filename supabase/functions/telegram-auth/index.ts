import { createServiceClient, corsHeaders, isAllowedOrigin, jsonResponse, readJsonBody } from '../_shared/http.ts'
import { TelegramAuthError, verifyTelegramInitData } from '../_shared/telegramAuth.ts'
import { issueSessionToken } from '../_shared/sessionToken.ts'

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(request) })
  if (!isAllowedOrigin(request)) return jsonResponse(request, { error: 'Origin not allowed' }, 403)
  if (request.method !== 'POST') return jsonResponse(request, { error: 'Method not allowed' }, 405)

  try {
    const body = await readJsonBody(request)
    if (typeof body.initData !== 'string') return jsonResponse(request, { error: 'Invalid request' }, 400)

    const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN')
    const sessionSecret = Deno.env.get('TELEGRAM_SESSION_SECRET')
    if (!botToken || !sessionSecret || sessionSecret.length < 32) {
      return jsonResponse(request, { error: 'Authentication service is not configured' }, 503)
    }

    const configuredAge = Number(Deno.env.get('TELEGRAM_INIT_DATA_MAX_AGE_SECONDS') ?? 3_600)
    const maxAge = Number.isSafeInteger(configuredAge) && configuredAge >= 60 && configuredAge <= 86_400 ? configuredAge : 3_600
    const verified = await verifyTelegramInitData(body.initData, botToken, Date.now(), maxAge)
    const serviceClient = createServiceClient()

    const { error: profileError } = await serviceClient.from('profiles').upsert({
      telegram_user_id: verified.telegramUserId,
      username: verified.username,
      first_name: verified.firstName,
      last_name: verified.lastName,
      avatar_url: verified.avatarUrl,
    }, { onConflict: 'telegram_user_id' })
    if (profileError) throw new Error('Profile persistence failed')

    const { error: progressError } = await serviceClient.from('user_progress').upsert(
      { telegram_user_id: verified.telegramUserId },
      { onConflict: 'telegram_user_id', ignoreDuplicates: true },
    )
    if (progressError) throw new Error('Progress initialization failed')

    const { data: progress, error: statsError } = await serviceClient.rpc('get_user_stats', {
      p_telegram_user_id: verified.telegramUserId,
    })
    if (statsError || !progress) throw new Error('Progress retrieval failed')

    const accessToken = await issueSessionToken(verified.telegramUserId, sessionSecret)
    return jsonResponse(request, {
      accessToken,
      progress,
      profile: {
        firstName: verified.firstName,
        lastName: verified.lastName,
        username: verified.username,
        avatarUrl: verified.avatarUrl,
      },
    })
  } catch (error) {
    if (error instanceof TelegramAuthError) return jsonResponse(request, { error: 'Сессия Telegram недействительна или устарела.' }, 401)
    if (error instanceof SyntaxError) return jsonResponse(request, { error: 'Некорректный запрос.' }, 400)
    return jsonResponse(request, { error: 'Сервис авторизации временно недоступен.' }, 503)
  }
})
