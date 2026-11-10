create table if not exists public.arena_submissions (
  telegram_user_id text not null references public.profiles(telegram_user_id) on delete cascade,
  session_id uuid not null,
  season_start date not null,
  challenge_id text not null check (challenge_id in ('scenario-investigation')),
  score smallint not null check (score between 0 and 100),
  question_count smallint not null check (question_count = 10),
  submitted_at timestamptz not null default now(),
  primary key (telegram_user_id, session_id),
  check (extract(day from season_start) = 1)
);

create index if not exists arena_submissions_season_challenge_idx
  on public.arena_submissions (season_start, challenge_id, score desc, submitted_at);

alter table public.arena_submissions enable row level security;
revoke all on public.arena_submissions from anon, authenticated;
grant all on public.arena_submissions to service_role;

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
    or p_challenge_id is null or p_challenge_id not in ('scenario-investigation') then
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

create or replace function public.submit_arena_result(
  p_telegram_user_id text,
  p_session_id uuid,
  p_attempt_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_season_start date := date_trunc('month', now() at time zone 'utc')::date;
  v_question_ids text[];
  v_attempt_count integer;
  v_correct_count integer;
  v_score integer;
  v_best_score integer;
  v_inserted integer;
begin
  if p_telegram_user_id is null or p_telegram_user_id !~ '^[1-9][0-9]{0,15}$'
    or p_session_id is null or p_attempt_ids is null or cardinality(p_attempt_ids) <> 10
    or not public.has_unique_text_items(p_attempt_ids::text[]) then
    raise exception 'Invalid arena submission';
  end if;

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
    and a.category = 'scenarios';

  if v_attempt_count <> 10 or cardinality(v_question_ids) <> 10 then
    raise exception 'Arena requires ten verified scenario answers';
  end if;

  v_score := round(v_correct_count::numeric * 100 / 10)::integer;
  insert into public.arena_submissions (telegram_user_id, session_id, season_start, challenge_id, score, question_count)
  values (p_telegram_user_id, p_session_id, v_season_start, 'scenario-investigation', v_score, 10)
  on conflict (telegram_user_id, session_id) do nothing;
  get diagnostics v_inserted = row_count;

  select max(s.score)::integer into v_best_score
  from public.arena_submissions s
  where s.telegram_user_id = p_telegram_user_id and s.season_start = v_season_start
    and s.challenge_id = 'scenario-investigation';

  return jsonb_build_object(
    'accepted', v_inserted > 0,
    'score', v_score,
    'bestScore', coalesce(v_best_score, v_score),
    'leaderboard', public.get_arena_leaderboard(p_telegram_user_id, 'scenario-investigation')
  );
end;
$$;

revoke all on function public.get_arena_leaderboard(text, text) from public, anon, authenticated;
revoke all on function public.submit_arena_result(text, uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.get_arena_leaderboard(text, text) to service_role;
grant execute on function public.submit_arena_result(text, uuid, uuid[]) to service_role;

create or replace function public.reset_user_progress(p_telegram_user_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_telegram_user_id is null or p_telegram_user_id !~ '^[1-9][0-9]{0,15}$' then
    raise exception 'Invalid user';
  end if;
  delete from public.arena_submissions where telegram_user_id = p_telegram_user_id;
  delete from public.weekly_mission_claims where telegram_user_id = p_telegram_user_id;
  delete from public.quiz_attempts where telegram_user_id = p_telegram_user_id;
  delete from public.daily_task_completions where telegram_user_id = p_telegram_user_id;
  delete from public.quiz_sessions where telegram_user_id = p_telegram_user_id;
  update public.user_progress set
    total_answered = 0,
    total_correct = 0,
    total_incorrect = 0,
    xp = 0,
    current_streak = 0,
    longest_streak = 0,
    last_activity_date = null
  where telegram_user_id = p_telegram_user_id;
end;
$$;

revoke all on function public.reset_user_progress(text) from public, anon, authenticated;
grant execute on function public.reset_user_progress(text) to service_role;
