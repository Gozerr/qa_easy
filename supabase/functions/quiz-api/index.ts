import { createServiceClient, corsHeaders, isAllowedOrigin, jsonResponse, readJsonBody } from '../_shared/http.ts'
import { verifySessionToken } from '../_shared/sessionToken.ts'

const QUESTION_ID = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const CATEGORIES = new Set(['fundamentals', 'web-api', 'scenarios'])
const MARATHON_CATEGORY = new Map([
  ['marathon-fundamentals', 'fundamentals'],
  ['marathon-web-api', 'web-api'],
  ['marathon-scenarios', 'scenarios'],
])
const DIFFICULTIES = new Set(['Начальный', 'Средний', 'Сложный'])
const LEADERBOARD_NAME = /^[\p{L}\p{N}][\p{L}\p{N} _-]{1,23}$/u

function randomBelow(maximum: number): number {
  const range = 0x1_0000_0000
  const limit = Math.floor(range / maximum) * maximum
  const value = new Uint32Array(1)
  do crypto.getRandomValues(value); while (value[0] >= limit)
  return value[0] % maximum
}

function secureShuffle<T>(items: T[]): T[] {
  const output = [...items]
  for (let index = output.length - 1; index > 0; index -= 1) {
    const target = randomBelow(index + 1)
    ;[output[index], output[target]] = [output[target], output[index]]
  }
  return output
}

function currentUtcDate(): string {
  return new Date().toISOString().slice(0, 10)
}

function validDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const timestamp = Date.parse(`${value}T00:00:00.000Z`)
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value
}

async function getQuestions(client: ReturnType<typeof createServiceClient>, body: Record<string, unknown>) {
  if (body.category !== undefined && (typeof body.category !== 'string' || !CATEGORIES.has(body.category))) {
    return { error: 'Некорректная категория.' }
  }
  if (body.difficulty !== undefined && (typeof body.difficulty !== 'string' || !DIFFICULTIES.has(body.difficulty))) {
    return { error: 'Некорректная сложность.' }
  }
  if (body.interviewLevel !== undefined && !['junior', 'middle'].includes(String(body.interviewLevel))) {
    return { error: 'Некорректный уровень.' }
  }

  let query = client.from('questions')
    .select('id,category,difficulty,question_text,options,explanation,hint,interview_level')
    .eq('is_active', true)
    .order('id')
    .limit(50)
  if (typeof body.category === 'string') query = query.eq('category', body.category)
  if (typeof body.difficulty === 'string') query = query.eq('difficulty', body.difficulty)
  if (typeof body.interviewLevel === 'string') query = query.eq('interview_level', body.interviewLevel)

  const { data, error } = await query
  if (error || !data) throw new Error('Question retrieval failed')
  return {
    questions: data.map((row) => ({
      id: row.id,
      category: row.category,
      difficulty: row.difficulty,
      question: row.question_text,
      options: row.options,
      explanation: row.explanation,
      ...(row.hint ? { hint: row.hint } : {}),
      ...(row.interview_level ? { interviewLevel: row.interview_level } : {}),
    })),
  }
}

async function getDailyTask(client: ReturnType<typeof createServiceClient>) {
  const date = currentUtcDate()
  const { data: templates, error: templateError } = await client.from('daily_task_templates')
    .select('id,slot,title,description,content')
    .eq('is_active', true)
    .order('slot')
  if (templateError || !templates?.length || templates.length !== 30) throw new Error('Daily task templates unavailable')

  const [year, month, day] = date.split('-').map(Number)
  const dayNumber = Math.floor(Date.UTC(year, month - 1, day) / 86_400_000)
  const slot = ((dayNumber % templates.length) + templates.length) % templates.length
  const template = templates.find((item) => item.slot === slot)
  if (!template || !template.content || typeof template.content.questionId !== 'string') throw new Error('Invalid daily template')

  const { data, error } = await client.from('daily_tasks').upsert({
    task_date: date,
    template_id: template.id,
    title: template.title,
    description: template.description,
    content: template.content,
    is_active: true,
  }, { onConflict: 'task_date' }).select('task_date,title,description,content').single()
  if (error || !data) throw new Error('Daily task persistence failed')

  return { task: { id: template.id, date: data.task_date, title: data.title, description: data.description, content: data.content } }
}

async function createQuizSession(client: ReturnType<typeof createServiceClient>, userId: string, body: Record<string, unknown>) {
  const mode = body.mode
  const requestedSize = body.size
  if (!['practice', 'interview-junior', 'interview-middle', 'theory', 'daily'].includes(String(mode)) && !MARATHON_CATEGORY.has(String(mode))
    || !Number.isSafeInteger(requestedSize) || Number(requestedSize) < 1 || Number(requestedSize) > 10) {
    return { error: 'Некорректный формат тренировки.' }
  }

  const size = mode === 'theory' || mode === 'daily' ? 1 : Number(requestedSize)
  let query = client.from('questions').select('id,options').eq('is_active', true)
  if (mode === 'practice') query = query.eq('category', 'scenarios')
  const marathonCategory = MARATHON_CATEGORY.get(String(mode))
  if (marathonCategory) query = query.eq('category', marathonCategory)
  if (mode === 'interview-junior') query = query.eq('interview_level', 'junior')
  if (mode === 'interview-middle') query = query.eq('interview_level', 'middle')
  if (mode === 'theory') {
    if (typeof body.questionId !== 'string' || !QUESTION_ID.test(body.questionId)) return { error: 'Некорректный вопрос.' }
    query = query.eq('id', body.questionId)
  }
  if (mode === 'daily') {
    if (!validDate(body.dailyDate) || body.dailyDate !== currentUtcDate()) return { error: 'Дата задания недействительна.' }
    const { data: daily, error: dailyError } = await client.from('daily_tasks').select('content').eq('task_date', body.dailyDate).eq('is_active', true).maybeSingle()
    if (dailyError || typeof daily?.content?.questionId !== 'string') throw new Error('Daily session unavailable')
    query = query.eq('id', daily.content.questionId)
  }

  const { data, error } = await query.limit(50)
  if (error || !data?.length) throw new Error('Question session unavailable')
  const selected = secureShuffle(data).slice(0, Math.min(size, data.length))
  const sessionId = crypto.randomUUID()
  const questionIds = selected.map((question) => question.id)
  const { error: sessionError } = await client.rpc('create_quiz_session', {
    p_telegram_user_id: userId,
    p_session_id: sessionId,
    p_question_ids: questionIds,
  })
  if (sessionError) throw new Error('Quiz session persistence failed')

  return {
    sessionId,
    items: selected.map((question) => {
      const optionIds = Array.isArray(question.options)
        ? question.options.map((option: { id?: unknown }) => option?.id).filter((id: unknown): id is string => typeof id === 'string')
        : []
      return { questionId: question.id, optionIds: secureShuffle(optionIds) }
    }),
  }
}

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(request) })
  if (!isAllowedOrigin(request)) return jsonResponse(request, { error: 'Origin not allowed' }, 403)
  if (request.method !== 'POST') return jsonResponse(request, { error: 'Method not allowed' }, 405)

  try {
    const body = await readJsonBody(request)
    if (typeof body.action !== 'string') return jsonResponse(request, { error: 'Некорректный запрос.' }, 400)
    const authorization = request.headers.get('authorization') ?? ''
    const token = /^Bearer ([A-Za-z0-9._-]{20,4096})$/.exec(authorization)?.[1]
    const sessionSecret = Deno.env.get('TELEGRAM_SESSION_SECRET')
    if (!token || !sessionSecret) return jsonResponse(request, { error: 'Требуется подтверждённая сессия Telegram.' }, 401)

    let telegramUserId: string
    try {
      telegramUserId = await verifySessionToken(token, sessionSecret)
    } catch {
      return jsonResponse(request, { error: 'Сессия Telegram недействительна или истекла.' }, 401)
    }

    const client = createServiceClient()
    if (body.action === 'create_session') return jsonResponse(request, await createQuizSession(client, telegramUserId, body))
    if (body.action === 'get_questions') return jsonResponse(request, await getQuestions(client, body))
    if (body.action === 'get_daily') return jsonResponse(request, await getDailyTask(client))
    if (body.action === 'get_progress') {
      const { data, error } = await client.rpc('get_user_stats', { p_telegram_user_id: telegramUserId })
      if (error || !data) throw new Error('Progress retrieval failed')
      return jsonResponse(request, { progress: data })
    }
    if (body.action === 'get_weekly_missions') {
      if (typeof body.weekStart !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(body.weekStart)) {
        return jsonResponse(request, { error: 'Некорректная неделя.' }, 400)
      }
      const { data, error } = await client.rpc('get_weekly_missions', {
        p_telegram_user_id: telegramUserId,
        p_week_start: body.weekStart,
      })
      if (error || !data) throw new Error('Weekly missions unavailable')
      return jsonResponse(request, data)
    }
    if (body.action === 'claim_weekly_mission') {
      if (typeof body.weekStart !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(body.weekStart)
        || !['daily-3', 'answers-10', 'accuracy-80'].includes(body.missionId)) {
        return jsonResponse(request, { error: 'Некорректная недельная миссия.' }, 400)
      }
      const { data, error } = await client.rpc('claim_weekly_mission', {
        p_telegram_user_id: telegramUserId,
        p_week_start: body.weekStart,
        p_mission_id: body.missionId,
      })
      if (error || !data) throw new Error('Weekly mission claim failed')
      return jsonResponse(request, data)
    }
    if (body.action === 'get_xp_history') {
      if (typeof body.limit !== 'number' || !Number.isSafeInteger(body.limit) || body.limit < 1 || body.limit > 100) {
        return jsonResponse(request, { error: 'Некорректный размер истории.' }, 400)
      }
      const { data, error } = await client.rpc('get_xp_history', {
        p_telegram_user_id: telegramUserId,
        p_limit: body.limit,
      })
      if (error || !data || !Array.isArray(data.transactions)) throw new Error('XP history unavailable')
      return jsonResponse(request, data)
    }
    if (body.action === 'get_skill_comparison') {
      const { data, error } = await client.rpc('get_skill_comparison', { p_telegram_user_id: telegramUserId })
      if (error || !data || !Array.isArray(data.categories)) throw new Error('Skill comparison unavailable')
      return jsonResponse(request, data)
    }
    if (body.action === 'get_arena_leaderboard') {
      if (!['scenario-investigation', 'fundamentals', 'web-api'].includes(String(body.challengeId))) {
        return jsonResponse(request, { error: 'Неизвестное испытание.' }, 400)
      }
      const { data, error } = await client.rpc('get_arena_leaderboard', {
        p_telegram_user_id: telegramUserId,
        p_challenge_id: body.challengeId,
      })
      if (error || !data) throw new Error('Arena leaderboard unavailable')
      return jsonResponse(request, data)
    }
    if (body.action === 'submit_arena_result') {
      if (typeof body.sessionId !== 'string' || !UUID.test(body.sessionId)
        || !['scenario-investigation', 'fundamentals', 'web-api'].includes(String(body.challengeId))
        || !Array.isArray(body.attemptIds) || body.attemptIds.length !== 10
        || !body.attemptIds.every((id) => typeof id === 'string' && UUID.test(id))
        || new Set(body.attemptIds).size !== 10) {
        return jsonResponse(request, { error: 'Некорректный результат испытания.' }, 400)
      }
      const { data, error } = await client.rpc('submit_arena_result', {
        p_telegram_user_id: telegramUserId,
        p_session_id: body.sessionId,
        p_attempt_ids: body.attemptIds,
        p_challenge_id: body.challengeId,
      })
      if (error || !data || typeof data.accepted !== 'boolean' || !data.leaderboard) throw new Error('Arena result unavailable')
      return jsonResponse(request, data)
    }
    if (body.action === 'get_leaderboard_preferences') {
      const { data: profile, error } = await client.from('profiles')
        .select('leaderboard_enabled,leaderboard_name')
        .eq('telegram_user_id', telegramUserId)
        .single()
      if (error || !profile) throw new Error('Leaderboard preferences unavailable')
      return jsonResponse(request, {
        preferences: { enabled: profile.leaderboard_enabled, displayName: profile.leaderboard_name ?? '' },
      })
    }
    if (body.action === 'get_leaderboard') {
      const { data: profile, error: profileError } = await client.from('profiles')
        .select('leaderboard_enabled,leaderboard_name')
        .eq('telegram_user_id', telegramUserId)
        .single()
      if (profileError || !profile) throw new Error('Leaderboard preferences unavailable')
      const { data, error } = await client.rpc('get_public_leaderboard', {
        p_telegram_user_id: telegramUserId,
        p_limit: 50,
      })
      if (error || !data) throw new Error('Leaderboard retrieval failed')
      return jsonResponse(request, {
        ...data,
        preferences: { enabled: profile.leaderboard_enabled, displayName: profile.leaderboard_name ?? '' },
      })
    }
    if (body.action === 'update_leaderboard') {
      if (typeof body.enabled !== 'boolean') return jsonResponse(request, { error: 'Некорректные настройки рейтинга.' }, 400)
      const displayName = typeof body.displayName === 'string' ? body.displayName.trim() : ''
      if (body.enabled && !LEADERBOARD_NAME.test(displayName)) {
        return jsonResponse(request, { error: 'Псевдоним должен содержать 2–24 буквы, цифры, пробелы или дефисы.' }, 400)
      }
      if (displayName && !LEADERBOARD_NAME.test(displayName)) {
        return jsonResponse(request, { error: 'Псевдоним содержит недопустимые символы.' }, 400)
      }
      const { data, error } = await client.from('profiles')
        .update({ leaderboard_enabled: body.enabled, leaderboard_name: displayName || null })
        .eq('telegram_user_id', telegramUserId)
        .select('leaderboard_enabled,leaderboard_name')
        .single()
      if (error || !data) throw new Error('Leaderboard preferences update failed')
      return jsonResponse(request, {
        preferences: { enabled: data.leaderboard_enabled, displayName: data.leaderboard_name ?? '' },
      })
    }
    if (body.action === 'reset_progress') {
      const { error } = await client.rpc('reset_user_progress', { p_telegram_user_id: telegramUserId })
      if (error) throw new Error('Progress reset failed')
      const { data: progress, error: statsError } = await client.rpc('get_user_stats', { p_telegram_user_id: telegramUserId })
      if (statsError || !progress) throw new Error('Progress retrieval failed')
      return jsonResponse(request, { progress })
    }
    if (body.action === 'submit_attempt') {
      if (typeof body.attemptId !== 'string' || !UUID.test(body.attemptId)
        || typeof body.sessionId !== 'string' || !UUID.test(body.sessionId)
        || typeof body.questionId !== 'string' || !QUESTION_ID.test(body.questionId)
        || typeof body.selectedOptionId !== 'string' || !QUESTION_ID.test(body.selectedOptionId)) {
        return jsonResponse(request, { error: 'Некорректный ответ.' }, 400)
      }
      const dailyDate = body.dailyDate ?? null
      if (dailyDate !== null && (!validDate(dailyDate) || dailyDate !== currentUtcDate())) {
        return jsonResponse(request, { error: 'Дата задания недействительна.' }, 400)
      }
      const { data, error } = await client.rpc('submit_quiz_attempt', {
        p_telegram_user_id: telegramUserId,
        p_attempt_id: body.attemptId,
        p_session_id: body.sessionId,
        p_question_id: body.questionId,
        p_selected_option_id: body.selectedOptionId,
        p_daily_date: dailyDate,
      })
      if (error || !data || typeof data.isCorrect !== 'boolean') throw new Error('Attempt submission failed')
      return jsonResponse(request, data)
    }
    return jsonResponse(request, { error: 'Неизвестная операция.' }, 400)
  } catch {
    return jsonResponse(request, { error: 'Сервис временно недоступен.' }, 503)
  }
})
