create or replace function public.get_xp_history(
  p_telegram_user_id text,
  p_limit integer default 50
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_transactions jsonb;
begin
  if p_telegram_user_id is null or p_telegram_user_id !~ '^[1-9][0-9]{0,15}$'
    or p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception 'Invalid XP history request';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', event.id,
    'source', event.source,
    'title', event.title,
    'amount', event.amount,
    'createdAt', event.created_at
  ) order by event.created_at desc), '[]'::jsonb)
  into v_transactions
  from (
    select a.attempt_id::text as id,
      'answer'::text as source,
      left(q.question_text, 120) as title,
      case when a.is_correct then 10 else 3 end as amount,
      a.created_at
    from public.quiz_attempts a
    join public.questions q on q.id = a.question_id
    where a.telegram_user_id = p_telegram_user_id
    union all
    select 'weekly-' || replace(c.week_start::text, '-', '') || '-' || c.mission_id as id,
      'weekly-mission'::text as source,
      case c.mission_id
        when 'daily-3' then 'Три дня практики'
        when 'answers-10' then 'Десять проверок'
        when 'accuracy-80' then 'Точность под давлением'
      end as title,
      c.reward_xp as amount,
      c.claimed_at as created_at
    from public.weekly_mission_claims c
    where c.telegram_user_id = p_telegram_user_id
    order by created_at desc
    limit p_limit
  ) as event;

  return jsonb_build_object('transactions', v_transactions);
end;
$$;

revoke all on function public.get_xp_history(text, integer) from public, anon, authenticated;
grant execute on function public.get_xp_history(text, integer) to service_role;
