alter table public.arena_submissions
  drop constraint if exists arena_submissions_challenge_id_check;

alter table public.arena_submissions
  add constraint arena_submissions_challenge_id_check
  check (challenge_id in ('scenario-investigation', 'fundamentals', 'web-api'));

create or replace function public.get_arena_leaderboard(
  p_telegram_user_id text,
  p_challenge_id text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_season_start date := date_trunc('month', now() at time zone 'utc')::date;
  v_result jsonb;
begin
  if p_telegram_user_id is null or p_telegram_user_id !~ '^[1-9][0-9]{0,15}$'
    or p_challenge_id is null or p_challenge_id not in ('scenario-investigation', 'fundamentals', 'web-api') then
    raise exception 'Invalid arena leaderboard request';
  end if;

  with scores as (
    select s.telegram_user_id, max(s.score)::integer as best_score, count(*)::integer as matches,
      max(s.submitted_at) as last_played
    from public.arena_submissions s
    where s.season_start = v_season_start and s.challenge_id = p_challenge_id
    group by s.telegram_user_id
  ), ranked as (
    select row_number() over (order by scores.best_score desc, scores.matches desc, scores.last_played, scores.telegram_user_id)::integer as rank,
      profile.telegram_user_id, profile.leaderboard_name, profile.avatar_url, scores.best_score, scores.matches
    from scores
    join public.profiles profile using (telegram_user_id)
    where profile.leaderboard_enabled and profile.leaderboard_name is not null
  )
  select jsonb_build_object(
    'seasonStart', v_season_start,
    'challengeId', p_challenge_id,
    'entries', coalesce((select jsonb_agg(jsonb_build_object(
      'rank', ranked.rank,
      'displayName', ranked.leaderboard_name,
      'avatarUrl', ranked.avatar_url,
      'bestScore', ranked.best_score,
      'matches', ranked.matches
    ) order by ranked.rank) from ranked where ranked.rank <= 50), '[]'::jsonb),
    'currentUserRank', (select ranked.rank from ranked where ranked.telegram_user_id = p_telegram_user_id),
    'totalParticipants', (select count(*) from ranked)
  ) into v_result;

  return v_result;
end;
$$;

drop function if exists public.submit_arena_result(text, uuid, uuid[]);

create or replace function public.submit_arena_result(
  p_telegram_user_id text,
  p_session_id uuid,
  p_attempt_ids uuid[],
  p_challenge_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_season_start date := date_trunc('month', now() at time zone 'utc')::date;
  v_expected_category text;
  v_question_ids text[];
  v_attempt_count integer;
  v_correct_count integer;
  v_score integer;
  v_best_score integer;
  v_inserted integer;
begin
  if p_telegram_user_id is null or p_telegram_user_id !~ '^[1-9][0-9]{0,15}$'
    or p_session_id is null or p_attempt_ids is null or cardinality(p_attempt_ids) <> 10
    or not public.has_unique_text_items(p_attempt_ids::text[])
    or p_challenge_id is null or p_challenge_id not in ('scenario-investigation', 'fundamentals', 'web-api') then
    raise exception 'Invalid arena submission';
  end if;

  v_expected_category := case p_challenge_id
    when 'scenario-investigation' then 'scenarios'
    else p_challenge_id
  end;

  perform 1 from public.user_progress p where p.telegram_user_id = p_telegram_user_id for update;
  if not found then raise exception 'Progress not found'; end if;

  select s.question_ids into v_question_ids
  from public.quiz_sessions s
  where s.telegram_user_id = p_telegram_user_id and s.session_id = p_session_id
    and s.expires_at > now() and cardinality(s.question_ids) = 10;
  if not found then raise exception 'Arena session is unavailable'; end if;

  select count(*)::integer, count(*) filter (where a.is_correct)::integer,
    array_agg(distinct a.question_id)
  into v_attempt_count, v_correct_count, v_question_ids
  from public.quiz_attempts a
  where a.telegram_user_id = p_telegram_user_id
    and a.session_id = p_session_id
    and a.attempt_id = any(p_attempt_ids)
    and a.category = v_expected_category;

  if v_attempt_count <> 10 or cardinality(v_question_ids) <> 10 then
    raise exception 'Arena requires ten verified answers for the selected theme';
  end if;

  v_score := round(v_correct_count::numeric * 100 / 10)::integer;
  insert into public.arena_submissions (telegram_user_id, session_id, season_start, challenge_id, score, question_count)
  values (p_telegram_user_id, p_session_id, v_season_start, p_challenge_id, v_score, 10)
  on conflict (telegram_user_id, session_id) do nothing;
  get diagnostics v_inserted = row_count;

  select max(s.score)::integer into v_best_score
  from public.arena_submissions s
  where s.telegram_user_id = p_telegram_user_id and s.season_start = v_season_start
    and s.challenge_id = p_challenge_id;

  return jsonb_build_object(
    'accepted', v_inserted > 0,
    'score', v_score,
    'bestScore', coalesce(v_best_score, v_score),
    'leaderboard', public.get_arena_leaderboard(p_telegram_user_id, p_challenge_id)
  );
end;
$$;

revoke all on function public.get_arena_leaderboard(text, text) from public, anon, authenticated;
revoke all on function public.submit_arena_result(text, uuid, uuid[], text) from public, anon, authenticated;
grant execute on function public.get_arena_leaderboard(text, text) to service_role;
grant execute on function public.submit_arena_result(text, uuid, uuid[], text) to service_role;
