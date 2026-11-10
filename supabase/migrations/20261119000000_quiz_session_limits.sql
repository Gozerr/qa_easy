create index if not exists quiz_sessions_user_created_idx
  on public.quiz_sessions (telegram_user_id, created_at desc);

create or replace function public.create_quiz_session(
  p_telegram_user_id text,
  p_session_id uuid,
  p_question_ids text[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
  v_recent_count integer;
  v_daily_count integer;
  v_day_start timestamptz := date_trunc('day', now() at time zone 'utc') at time zone 'utc';
begin
  if p_telegram_user_id is null or p_telegram_user_id !~ '^[1-9][0-9]{0,15}$'
    or p_session_id is null or p_question_ids is null
    or cardinality(p_question_ids) < 1 or cardinality(p_question_ids) > 50
    or not public.has_unique_text_items(p_question_ids) then
    raise exception 'Invalid quiz session';
  end if;

  perform 1 from public.user_progress
  where telegram_user_id = p_telegram_user_id
  for update;
  if not found then raise exception 'Progress not found'; end if;

  delete from public.quiz_sessions
  where telegram_user_id = p_telegram_user_id and expires_at <= now();

  select
    count(*) filter (where created_at >= now() - interval '1 minute')::integer,
    count(*)::integer
  into v_recent_count, v_daily_count
  from public.quiz_sessions
  where telegram_user_id = p_telegram_user_id and created_at >= v_day_start;

  if v_recent_count >= 20 or v_daily_count >= 180 then
    raise exception 'Quiz session rate limit exceeded';
  end if;

  select count(*) into v_count from public.questions
  where id = any(p_question_ids) and is_active;
  if v_count <> cardinality(p_question_ids) then raise exception 'Session contains unavailable questions'; end if;

  insert into public.quiz_sessions (telegram_user_id, session_id, question_ids)
  values (p_telegram_user_id, p_session_id, p_question_ids);
end;
$$;

revoke all on function public.create_quiz_session(text, uuid, text[]) from public, anon, authenticated;
grant execute on function public.create_quiz_session(text, uuid, text[]) to service_role;
