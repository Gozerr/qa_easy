create table if not exists public.weekly_mission_claims (
  telegram_user_id text not null references public.profiles(telegram_user_id) on delete cascade,
  week_start date not null,
  mission_id text not null check (mission_id in ('daily-3', 'answers-10', 'accuracy-80')),
  reward_xp integer not null check (reward_xp between 1 and 500),
  claimed_at timestamptz not null default now(),
  primary key (telegram_user_id, week_start, mission_id),
  check (extract(isodow from week_start) = 1)
);

alter table public.weekly_mission_claims enable row level security;
revoke all on public.weekly_mission_claims from anon, authenticated;
grant all on public.weekly_mission_claims to service_role;

create or replace function public.get_weekly_missions(
  p_telegram_user_id text,
  p_week_start date default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_week_start date := coalesce(p_week_start, date_trunc('week', now() at time zone 'utc')::date);
  v_current_week date := date_trunc('week', now() at time zone 'utc')::date;
  v_daily_count integer;
  v_attempt_count integer;
  v_correct_count integer;
begin
  if p_telegram_user_id is null or p_telegram_user_id !~ '^[1-9][0-9]{0,15}$' or v_week_start <> v_current_week then
    raise exception 'Invalid weekly mission request';
  end if;

  select count(*)::integer into v_daily_count
  from public.daily_task_completions c
  where c.telegram_user_id = p_telegram_user_id
    and c.task_date >= v_week_start and c.task_date < v_week_start + 7;

  select count(*)::integer, count(*) filter (where a.is_correct)::integer
  into v_attempt_count, v_correct_count
  from public.quiz_attempts a
  where a.telegram_user_id = p_telegram_user_id
    and a.created_at >= (v_week_start::timestamp at time zone 'utc')
    and a.created_at < ((v_week_start + 7)::timestamp at time zone 'utc');

  return jsonb_build_object(
    'weekStart', v_week_start,
    'missions', jsonb_build_array(
      jsonb_build_object(
        'id', 'daily-3', 'title', 'Три дня практики',
        'description', 'Выполни QA Daily в три разных дня этой недели.',
        'progress', least(v_daily_count, 3), 'target', 3, 'eligible', v_daily_count >= 3, 'rewardXp', 60,
        'claimed', exists (select 1 from public.weekly_mission_claims c where c.telegram_user_id = p_telegram_user_id and c.week_start = v_week_start and c.mission_id = 'daily-3')
      ),
      jsonb_build_object(
        'id', 'answers-10', 'title', 'Десять проверок',
        'description', 'Ответь на 10 вопросов в проверенных тренировках за эту неделю.',
        'progress', least(v_attempt_count, 10), 'target', 10, 'eligible', v_attempt_count >= 10, 'rewardXp', 50,
        'claimed', exists (select 1 from public.weekly_mission_claims c where c.telegram_user_id = p_telegram_user_id and c.week_start = v_week_start and c.mission_id = 'answers-10')
      ),
      jsonb_build_object(
        'id', 'accuracy-80', 'title', 'Точность под давлением',
        'description', 'Ответь минимум на 10 вопросов и сохрани точность не ниже 80% за неделю.',
        'progress', least(v_correct_count, greatest(8, ceil(v_attempt_count * 0.8)::integer)),
        'target', greatest(8, ceil(v_attempt_count * 0.8)::integer),
        'eligible', v_attempt_count >= 10 and v_correct_count * 100 >= v_attempt_count * 80, 'rewardXp', 80,
        'claimed', exists (select 1 from public.weekly_mission_claims c where c.telegram_user_id = p_telegram_user_id and c.week_start = v_week_start and c.mission_id = 'accuracy-80')
      )
    )
  );
end;
$$;

create or replace function public.claim_weekly_mission(
  p_telegram_user_id text,
  p_week_start date,
  p_mission_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current_week date := date_trunc('week', now() at time zone 'utc')::date;
  v_mission jsonb;
  v_reward integer;
  v_inserted integer;
begin
  if p_telegram_user_id is null or p_telegram_user_id !~ '^[1-9][0-9]{0,15}$'
    or p_week_start is distinct from v_current_week
    or p_mission_id not in ('daily-3', 'answers-10', 'accuracy-80') then
    raise exception 'Invalid weekly mission claim';
  end if;

  perform 1 from public.user_progress p where p.telegram_user_id = p_telegram_user_id for update;
  if not found then raise exception 'Progress not found'; end if;

  if exists (select 1 from public.weekly_mission_claims c where c.telegram_user_id = p_telegram_user_id and c.week_start = p_week_start and c.mission_id = p_mission_id) then
    return jsonb_build_object('alreadyClaimed', true, 'rewardXp', 0, 'progress', public.get_user_stats(p_telegram_user_id));
  end if;

  select item into v_mission
  from jsonb_array_elements(public.get_weekly_missions(p_telegram_user_id, p_week_start)->'missions') as mission(item)
  where item->>'id' = p_mission_id;
  if v_mission is null or v_mission->>'eligible' <> 'true' then
    raise exception 'Weekly mission is not complete';
  end if;

  v_reward := (v_mission->>'rewardXp')::integer;
  insert into public.weekly_mission_claims (telegram_user_id, week_start, mission_id, reward_xp)
  values (p_telegram_user_id, p_week_start, p_mission_id, v_reward)
  on conflict do nothing;
  get diagnostics v_inserted = row_count;

  if v_inserted = 0 then
    return jsonb_build_object('alreadyClaimed', true, 'rewardXp', 0, 'progress', public.get_user_stats(p_telegram_user_id));
  end if;

  update public.user_progress p
  set xp = least(1000000000, p.xp + v_reward)
  where p.telegram_user_id = p_telegram_user_id;

  return jsonb_build_object('alreadyClaimed', false, 'rewardXp', v_reward, 'progress', public.get_user_stats(p_telegram_user_id));
end;
$$;

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

revoke all on function public.get_weekly_missions(text, date) from public, anon, authenticated;
revoke all on function public.claim_weekly_mission(text, date, text) from public, anon, authenticated;
revoke all on function public.reset_user_progress(text) from public, anon, authenticated;
grant execute on function public.get_weekly_missions(text, date) to service_role;
grant execute on function public.claim_weekly_mission(text, date, text) to service_role;
grant execute on function public.reset_user_progress(text) to service_role;
