alter table public.profiles
  add column if not exists leaderboard_enabled boolean not null default false,
  add column if not exists leaderboard_name text;

alter table public.profiles
  add constraint profiles_leaderboard_name_check
  check (
    leaderboard_name is null
    or (
      char_length(btrim(leaderboard_name)) between 2 and 24
      and leaderboard_name !~ '[[:cntrl:]]'
    )
  );

create index if not exists user_progress_leaderboard_idx
  on public.user_progress (xp desc, total_correct desc, total_answered desc);

create or replace function public.get_public_leaderboard(p_telegram_user_id text, p_limit integer default 50)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if p_telegram_user_id is null or p_telegram_user_id !~ '^[1-9][0-9]{0,15}$'
    or p_limit < 1 or p_limit > 50 then
    raise exception 'Invalid leaderboard request';
  end if;

  with ranked as (
    select
      row_number() over (
        order by p.xp desc, p.total_correct desc, p.total_answered desc,
          p.last_activity_date desc nulls last, p.telegram_user_id
      ) as rank,
      profile.telegram_user_id,
      profile.leaderboard_name,
      p.xp,
      p.total_answered,
      p.total_correct
    from public.user_progress p
    join public.profiles profile using (telegram_user_id)
    where profile.leaderboard_enabled and profile.leaderboard_name is not null
  )
  select jsonb_build_object(
    'entries', coalesce((
      select jsonb_agg(jsonb_build_object(
        'rank', ranked.rank,
        'displayName', ranked.leaderboard_name,
        'xp', ranked.xp,
        'answeredCount', ranked.total_answered,
        'accuracy', case when ranked.total_answered = 0 then 0
          else floor(ranked.total_correct::numeric * 100 / ranked.total_answered)::integer end
      ) order by ranked.rank)
      from ranked
      where ranked.rank <= p_limit
    ), '[]'::jsonb),
    'currentUserRank', (select ranked.rank from ranked where ranked.telegram_user_id = p_telegram_user_id),
    'totalParticipants', (select count(*) from ranked)
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.get_public_leaderboard(text, integer) from public, anon, authenticated;
grant execute on function public.get_public_leaderboard(text, integer) to service_role;
