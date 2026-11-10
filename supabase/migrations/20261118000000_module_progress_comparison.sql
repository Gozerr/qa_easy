create table if not exists public.theory_modules (
  module_id text primary key,
  title text not null,
  sort_order smallint not null unique,
  lesson_count smallint not null check (lesson_count = 5)
);

create table if not exists public.theory_lessons (
  lesson_id text primary key,
  module_id text not null references public.theory_modules(module_id) on delete cascade
);

create table if not exists public.lesson_progress (
  telegram_user_id text not null references public.profiles(telegram_user_id) on delete cascade,
  lesson_id text not null references public.theory_lessons(lesson_id) on delete cascade,
  completed_at timestamptz not null default now(),
  primary key (telegram_user_id, lesson_id)
);

insert into public.theory_modules (module_id, title, sort_order, lesson_count) values
  ('testing-basics', 'Основы тестирования', 1, 5),
  ('documentation', 'Тестовая документация', 2, 5),
  ('test-design', 'Техники тест-дизайна', 3, 5),
  ('test-types', 'Виды и уровни тестирования', 4, 5),
  ('web-testing', 'Web-тестирование', 5, 5),
  ('api-testing', 'Читаем ответы HTTP', 6, 5),
  ('sql-databases', 'SQL и базы данных', 7, 5),
  ('architecture-integrations', 'Архитектура и интеграции', 8, 5),
  ('automation', 'Автоматизация тестирования', 9, 5),
  ('specializations', 'Дополнительные направления', 10, 5)
on conflict (module_id) do update set title = excluded.title, sort_order = excluded.sort_order, lesson_count = excluded.lesson_count;

insert into public.theory_lessons (lesson_id, module_id) values
  ('basics-qa', 'testing-basics'), ('basics-principles', 'testing-basics'), ('basics-lifecycle', 'testing-basics'), ('basics-risk-analysis', 'testing-basics'), ('basics-acceptance-criteria', 'testing-basics'),
  ('docs-test-case', 'documentation'), ('docs-plan', 'documentation'), ('docs-defects', 'documentation'), ('docs-requirements', 'documentation'), ('docs-test-evidence', 'documentation'),
  ('design-equivalence', 'test-design'), ('design-combinations', 'test-design'), ('design-states', 'test-design'), ('design-decision-table', 'test-design'), ('design-prioritize', 'test-design'),
  ('types-functional', 'test-types'), ('types-levels', 'test-types'), ('types-regression', 'test-types'), ('types-compatibility', 'test-types'), ('types-exploratory', 'test-types'),
  ('web-client-server', 'web-testing'), ('web-state', 'web-testing'), ('web-responsive', 'web-testing'), ('web-network', 'web-testing'), ('web-forms', 'web-testing'),
  ('api-http', 'api-testing'), ('api-contract', 'api-testing'), ('api-auth-resilience', 'api-testing'), ('api-errors', 'api-testing'), ('api-pagination-data', 'api-testing'),
  ('sql-model', 'sql-databases'), ('sql-select', 'sql-databases'), ('sql-joins', 'sql-databases'), ('sql-transactions', 'sql-databases'), ('sql-data-validation', 'sql-databases'),
  ('arch-monolith-microservices', 'architecture-integrations'), ('arch-async', 'architecture-integrations'), ('arch-observability', 'architecture-integrations'), ('arch-contract-testing', 'architecture-integrations'), ('arch-timeouts-retries', 'architecture-integrations'),
  ('auto-when', 'automation'), ('auto-design', 'automation'), ('auto-ci-flaky', 'automation'), ('auto-api-tests', 'automation'), ('auto-maintenance', 'automation'),
  ('special-mobile', 'specializations'), ('special-security', 'specializations'), ('special-performance', 'specializations'), ('special-privacy', 'specializations'), ('special-release-readiness', 'specializations')
on conflict (lesson_id) do update set module_id = excluded.module_id;

alter table public.theory_modules enable row level security;
alter table public.theory_lessons enable row level security;
alter table public.lesson_progress enable row level security;
revoke all on public.theory_modules, public.theory_lessons, public.lesson_progress from anon, authenticated;
grant all on public.theory_modules, public.theory_lessons, public.lesson_progress to service_role;

create or replace function public.save_lesson_progress(p_telegram_user_id text, p_lesson_ids text[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_saved_count integer;
begin
  if p_telegram_user_id is null or p_telegram_user_id !~ '^[1-9][0-9]{0,15}$'
    or p_lesson_ids is null or cardinality(p_lesson_ids) < 1 or cardinality(p_lesson_ids) > 50
    or not public.has_unique_text_items(p_lesson_ids) then
    raise exception 'Invalid lesson progress request';
  end if;

  if exists (select 1 from unnest(p_lesson_ids) requested(lesson_id)
    left join public.theory_lessons lesson on lesson.lesson_id = requested.lesson_id
    where lesson.lesson_id is null) then
    raise exception 'Unknown lesson';
  end if;

  insert into public.lesson_progress (telegram_user_id, lesson_id)
  select p_telegram_user_id, requested.lesson_id
  from unnest(p_lesson_ids) requested(lesson_id)
  on conflict (telegram_user_id, lesson_id) do nothing;
  get diagnostics v_saved_count = row_count;

  return jsonb_build_object('savedCount', cardinality(p_lesson_ids));
end;
$$;

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

  with participants as (
    select profile.telegram_user_id
    from public.profiles profile
    where profile.leaderboard_enabled and profile.leaderboard_name is not null
      and exists (select 1 from public.lesson_progress any_progress where any_progress.telegram_user_id = profile.telegram_user_id)
  ), cohort as (
    select modules.module_id, participants.telegram_user_id,
      count(progress.lesson_id)::integer as completed_lessons
    from public.theory_modules modules
    cross join participants
    left join public.theory_lessons lessons on lessons.module_id = modules.module_id
    left join public.lesson_progress progress on progress.lesson_id = lessons.lesson_id
      and progress.telegram_user_id = participants.telegram_user_id
    group by modules.module_id, participants.telegram_user_id
  ), community as (
    select cohort.module_id, count(*)::integer as participants,
      round(avg(cohort.completed_lessons::numeric * 100 / modules.lesson_count))::integer as average_percent
    from cohort
    join public.theory_modules modules using (module_id)
    group by cohort.module_id
  ), personal as (
    select modules.module_id, count(progress.lesson_id)::integer as completed_lessons
    from public.theory_modules modules
    left join public.theory_lessons lessons on lessons.module_id = modules.module_id
    left join public.lesson_progress progress on progress.lesson_id = lessons.lesson_id
      and progress.telegram_user_id = p_telegram_user_id
    group by modules.module_id
  )
  select jsonb_build_object('modules', coalesce(jsonb_agg(jsonb_build_object(
    'id', modules.module_id,
    'personalCompletedLessons', personal.completed_lessons,
    'lessonCount', modules.lesson_count,
    'communityAveragePercent', case when coalesce(community.participants, 0) >= 5 then community.average_percent else null end,
    'communityParticipants', coalesce(community.participants, 0)
  ) order by modules.sort_order), '[]'::jsonb))
  into v_result
  from public.theory_modules modules
  join personal using (module_id)
  left join community using (module_id);

  return v_result;
end;
$$;

revoke all on function public.save_lesson_progress(text, text[]) from public, anon, authenticated;
revoke all on function public.get_skill_comparison(text) from public, anon, authenticated;
grant execute on function public.save_lesson_progress(text, text[]) to service_role;
grant execute on function public.get_skill_comparison(text) to service_role;
