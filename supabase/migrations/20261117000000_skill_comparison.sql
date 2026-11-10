create or replace function public.get_skill_comparison(p_telegram_user_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if p_telegram_user_id is null or p_telegram_user_id !~ '^[1-9][0-9]{0,15}$' then
    raise exception 'Invalid skill comparison request';
  end if;

  with categories(id) as (
    values ('fundamentals'::text), ('web-api'::text), ('scenarios'::text)
  ), personal as (
    select a.category,
      count(*)::integer as attempts,
      round(count(*) filter (where a.is_correct)::numeric * 100 / count(*))::integer as accuracy
    from public.quiz_attempts a
    where a.telegram_user_id = p_telegram_user_id
      and a.category in ('fundamentals', 'web-api', 'scenarios')
    group by a.category
  ), participant_scores as (
    select profile.telegram_user_id, a.category,
      round(count(*) filter (where a.is_correct)::numeric * 100 / count(*))::integer as accuracy
    from public.profiles profile
    join public.quiz_attempts a on a.telegram_user_id = profile.telegram_user_id
    where profile.leaderboard_enabled and profile.leaderboard_name is not null
      and a.category in ('fundamentals', 'web-api', 'scenarios')
    group by profile.telegram_user_id, a.category
  ), community as (
    select participant_scores.category, count(*)::integer as participants, round(avg(accuracy))::integer as average
    from participant_scores
    group by participant_scores.category
  )
  select jsonb_build_object('categories', coalesce(jsonb_agg(jsonb_build_object(
    'id', categories.id,
    'personalAccuracy', personal.accuracy,
    'personalAttempts', coalesce(personal.attempts, 0),
    'communityAverage', case when coalesce(community.participants, 0) >= 5 then community.average else null end,
    'communityParticipants', coalesce(community.participants, 0)
  ) order by categories.id), '[]'::jsonb))
  into v_result
  from categories
  left join personal on personal.category = categories.id
  left join community on community.category = categories.id;

  return v_result;
end;
$$;

revoke all on function public.get_skill_comparison(text) from public, anon, authenticated;
grant execute on function public.get_skill_comparison(text) to service_role;
