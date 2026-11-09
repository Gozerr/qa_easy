create extension if not exists pgcrypto with schema extensions;

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  telegram_user_id text not null unique check (telegram_user_id ~ '^[1-9][0-9]{0,15}$'),
  username text check (username is null or char_length(username) <= 64),
  first_name text not null check (char_length(first_name) between 1 and 128),
  last_name text check (last_name is null or char_length(last_name) <= 128),
  avatar_url text check (avatar_url is null or char_length(avatar_url) <= 2048),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.questions (
  id text primary key check (id ~ '^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$'),
  category text not null check (category in ('fundamentals', 'web-api', 'scenarios')),
  difficulty text not null check (difficulty in ('Начальный', 'Средний', 'Сложный')),
  question_text text not null check (char_length(question_text) between 1 and 1000),
  options jsonb not null check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) between 2 and 12),
  correct_option_id text not null check (correct_option_id ~ '^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$'),
  explanation text not null check (char_length(explanation) between 1 and 3000),
  hint text check (hint is null or char_length(hint) <= 1000),
  interview_level text check (interview_level is null or interview_level in ('junior', 'middle')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_progress (
  id uuid primary key default gen_random_uuid(),
  telegram_user_id text not null unique references public.profiles(telegram_user_id) on delete cascade,
  total_answered integer not null default 0 check (total_answered between 0 and 1000000000),
  total_correct integer not null default 0 check (total_correct between 0 and total_answered),
  total_incorrect integer not null default 0 check (total_incorrect between 0 and total_answered),
  xp bigint not null default 0 check (xp between 0 and 1000000000),
  current_streak integer not null default 0 check (current_streak between 0 and 100000),
  longest_streak integer not null default 0 check (longest_streak between current_streak and 100000),
  last_activity_date date,
  updated_at timestamptz not null default now(),
  check (total_answered = total_correct + total_incorrect)
);

create table if not exists public.daily_task_templates (
  id text primary key check (id ~ '^daily-[0-9]{2}$'),
  slot smallint not null unique check (slot between 0 and 29),
  title text not null check (char_length(title) between 1 and 160),
  description text not null check (char_length(description) between 1 and 1200),
  content jsonb not null check (jsonb_typeof(content) = 'object'),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.daily_tasks (
  id uuid primary key default gen_random_uuid(),
  task_date date not null unique,
  template_id text not null references public.daily_task_templates(id),
  title text not null,
  description text not null,
  content jsonb not null check (jsonb_typeof(content) = 'object'),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null,
  session_id uuid not null,
  telegram_user_id text not null references public.profiles(telegram_user_id) on delete cascade,
  question_id text not null references public.questions(id),
  selected_option_id text not null check (selected_option_id ~ '^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$'),
  is_correct boolean not null,
  category text not null check (category in ('fundamentals', 'web-api', 'scenarios')),
  daily_date date,
  created_at timestamptz not null default now(),
  unique (telegram_user_id, attempt_id),
  unique (telegram_user_id, attempt_id, daily_date),
  unique (telegram_user_id, session_id, question_id)
);

create or replace function public.has_unique_text_items(p_items text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select cardinality(p_items) = count(distinct item) from unnest(p_items) as item;
$$;

create table if not exists public.quiz_sessions (
  session_id uuid not null,
  telegram_user_id text not null references public.profiles(telegram_user_id) on delete cascade,
  question_ids text[] not null check (cardinality(question_ids) between 1 and 50),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '2 hours',
  primary key (telegram_user_id, session_id),
  check (expires_at > created_at),
  check (public.has_unique_text_items(question_ids))
);
create index if not exists quiz_sessions_expiry_idx on public.quiz_sessions (expires_at);

create table if not exists public.daily_task_completions (
  telegram_user_id text not null references public.profiles(telegram_user_id) on delete cascade,
  task_date date not null references public.daily_tasks(task_date),
  attempt_id uuid not null,
  completed_at timestamptz not null default now(),
  primary key (telegram_user_id, task_date),
  foreign key (telegram_user_id, attempt_id) references public.quiz_attempts(telegram_user_id, attempt_id) on delete cascade
);

create index if not exists questions_active_category_difficulty_idx
  on public.questions (category, difficulty, id) where is_active;
create index if not exists quiz_attempts_user_created_idx
  on public.quiz_attempts (telegram_user_id, created_at desc);
create index if not exists quiz_attempts_user_question_idx
  on public.quiz_attempts (telegram_user_id, question_id);
create index if not exists daily_tasks_active_date_idx
  on public.daily_tasks (task_date) where is_active;
create index if not exists daily_completions_user_date_idx
  on public.daily_task_completions (telegram_user_id, task_date desc);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at before update on public.profiles
for each row execute function public.touch_updated_at();
drop trigger if exists questions_touch_updated_at on public.questions;
create trigger questions_touch_updated_at before update on public.questions
for each row execute function public.touch_updated_at();
drop trigger if exists progress_touch_updated_at on public.user_progress;
create trigger progress_touch_updated_at before update on public.user_progress
for each row execute function public.touch_updated_at();

create or replace function public.validate_question_options()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  option_count integer;
  unique_option_count integer;
begin
  select count(*), count(distinct option_item->>'id')
  into option_count, unique_option_count
  from jsonb_array_elements(new.options) as option_item;

  if option_count < 2 or option_count > 12 or option_count <> unique_option_count then
    raise exception 'Question options are invalid';
  end if;
  if not exists (
    select 1 from jsonb_array_elements(new.options) as option_item
    where option_item->>'id' = new.correct_option_id
  ) then
    raise exception 'Correct option does not exist';
  end if;
  if exists (
    select 1 from jsonb_array_elements(new.options) as option_item
    where jsonb_typeof(option_item) <> 'object'
      or coalesce(char_length(option_item->>'text'), 0) not between 1 and 500
      or coalesce(char_length(option_item->>'id'), 0) not between 1 and 80
  ) then
    raise exception 'Question option shape is invalid';
  end if;
  return new;
end;
$$;

drop trigger if exists questions_validate_options on public.questions;
create trigger questions_validate_options before insert or update of options, correct_option_id on public.questions
for each row execute function public.validate_question_options();

alter table public.profiles enable row level security;
alter table public.user_progress enable row level security;
alter table public.questions enable row level security;
alter table public.daily_task_templates enable row level security;
alter table public.daily_tasks enable row level security;
alter table public.quiz_attempts enable row level security;
alter table public.daily_task_completions enable row level security;
alter table public.quiz_sessions enable row level security;

revoke all on public.profiles, public.user_progress, public.questions, public.daily_task_templates,
  public.daily_tasks, public.quiz_attempts, public.daily_task_completions from anon, authenticated;
revoke all on public.quiz_sessions from anon, authenticated;
grant all on public.profiles, public.user_progress, public.questions, public.daily_task_templates,
  public.daily_tasks, public.quiz_attempts, public.daily_task_completions, public.quiz_sessions to service_role;

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
begin
  if p_telegram_user_id is null or p_telegram_user_id !~ '^[1-9][0-9]{0,15}$'
    or p_session_id is null or p_question_ids is null
    or cardinality(p_question_ids) < 1 or cardinality(p_question_ids) > 50
    or not public.has_unique_text_items(p_question_ids) then
    raise exception 'Invalid quiz session';
  end if;

  select count(*) into v_count from public.questions
  where id = any(p_question_ids) and is_active;
  if v_count <> cardinality(p_question_ids) then raise exception 'Session contains unavailable questions'; end if;

  insert into public.quiz_sessions (telegram_user_id, session_id, question_ids)
  values (p_telegram_user_id, p_session_id, p_question_ids);
end;
$$;

create or replace function public.submit_quiz_attempt(
  p_telegram_user_id text,
  p_attempt_id uuid,
  p_session_id uuid,
  p_question_id text,
  p_selected_option_id text,
  p_daily_date date default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_question public.questions%rowtype;
  v_existing public.quiz_attempts%rowtype;
  v_attempt public.quiz_attempts%rowtype;
  v_progress public.user_progress%rowtype;
  v_correct boolean;
  v_today date := (timezone('utc', now()))::date;
  v_daily_inserted boolean := false;
  v_daily_insert_count integer := 0;
begin
  if p_telegram_user_id is null or p_telegram_user_id !~ '^[1-9][0-9]{0,15}$' then
    raise exception 'Invalid user';
  end if;
  if p_attempt_id is null or p_session_id is null or p_question_id is null
    or p_question_id !~ '^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$'
    or p_selected_option_id is null or p_selected_option_id !~ '^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$' then
    raise exception 'Invalid attempt';
  end if;
  if not exists (select 1 from public.profiles where telegram_user_id = p_telegram_user_id) then
    raise exception 'Unknown user';
  end if;

  select * into v_question from public.questions
  where id = p_question_id and is_active;
  if not found then raise exception 'Question not found'; end if;
  if not exists (
    select 1 from jsonb_array_elements(v_question.options) as option_item
    where option_item->>'id' = p_selected_option_id
  ) then raise exception 'Invalid option'; end if;

  select * into v_existing from public.quiz_attempts
  where telegram_user_id = p_telegram_user_id and attempt_id = p_attempt_id;
  if found then
    if v_existing.question_id <> p_question_id or v_existing.selected_option_id <> p_selected_option_id
      or v_existing.session_id <> p_session_id then
      raise exception 'Attempt ID was already used with different data';
    end if;
    select * into v_progress from public.user_progress where telegram_user_id = p_telegram_user_id;
    return jsonb_build_object(
      'isCorrect', v_existing.is_correct,
      'correctOptionId', v_question.correct_option_id,
      'explanation', v_question.explanation,
      'progress', public.get_user_stats(p_telegram_user_id)
    );
  end if;

  if not exists (
    select 1 from public.quiz_sessions s
    where s.telegram_user_id = p_telegram_user_id
      and s.session_id = p_session_id
      and p_question_id = any(s.question_ids)
      and s.expires_at > now()
  ) then raise exception 'Question is not part of an active session'; end if;

  if p_daily_date is not null then
    if p_daily_date <> v_today then raise exception 'Daily date must be current UTC date'; end if;
    if exists (select 1 from public.daily_task_completions where telegram_user_id = p_telegram_user_id and task_date = p_daily_date) then
      raise exception 'Daily task is already completed';
    end if;
    if not exists (
      select 1 from public.daily_tasks
      where task_date = p_daily_date and is_active and content->>'questionId' = p_question_id
    ) then raise exception 'Question is not the active daily task'; end if;
  end if;

  v_correct := p_selected_option_id = v_question.correct_option_id;
  insert into public.quiz_attempts (
    attempt_id, session_id, telegram_user_id, question_id, selected_option_id, is_correct, category, daily_date
  ) values (
    p_attempt_id, p_session_id, p_telegram_user_id, p_question_id, p_selected_option_id, v_correct, v_question.category, p_daily_date
  ) returning * into v_attempt;

  insert into public.user_progress (telegram_user_id, total_answered, total_correct, total_incorrect, xp)
  values (p_telegram_user_id, 1, v_correct::integer, (not v_correct)::integer, case when v_correct then 10 else 3 end)
  on conflict (telegram_user_id) do update set
    total_answered = public.user_progress.total_answered + 1,
    total_correct = public.user_progress.total_correct + v_correct::integer,
    total_incorrect = public.user_progress.total_incorrect + (not v_correct)::integer,
    xp = least(1000000000, public.user_progress.xp + case when v_correct then 10 else 3 end),
    updated_at = now()
  returning * into v_progress;

  if p_daily_date is not null then
    insert into public.daily_task_completions (telegram_user_id, task_date, attempt_id)
    values (p_telegram_user_id, p_daily_date, p_attempt_id)
    on conflict (telegram_user_id, task_date) do nothing;
    get diagnostics v_daily_insert_count = row_count;
    v_daily_inserted := v_daily_insert_count > 0;

    if v_daily_inserted then
      update public.user_progress set
        current_streak = case
          when last_activity_date = p_daily_date then current_streak
          when last_activity_date = p_daily_date - 1 then least(100000, current_streak + 1)
          else 1
        end,
        longest_streak = greatest(longest_streak, case
          when last_activity_date = p_daily_date then current_streak
          when last_activity_date = p_daily_date - 1 then least(100000, current_streak + 1)
          else 1
        end),
        last_activity_date = p_daily_date
      where telegram_user_id = p_telegram_user_id returning * into v_progress;
    end if;
  end if;

  return jsonb_build_object(
    'isCorrect', v_correct,
    'correctOptionId', v_question.correct_option_id,
    'explanation', v_question.explanation,
    'progress', public.get_user_stats(p_telegram_user_id)
  );
end;
$$;

create or replace function public.get_user_stats(p_telegram_user_id text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'xp', coalesce(p.xp, 0),
    'answeredCount', coalesce(p.total_answered, 0),
    'correctCount', coalesce(p.total_correct, 0),
    'currentStreak', coalesce(p.current_streak, 0),
    'longestStreak', coalesce(p.longest_streak, 0),
    'completedQuestionIds', coalesce((
      select jsonb_agg(distinct a.question_id) from public.quiz_attempts a
      where a.telegram_user_id = p_telegram_user_id
    ), '[]'::jsonb),
    'dailyCompletions', coalesce((
      select jsonb_agg(c.task_date::text order by c.task_date) from public.daily_task_completions c
      where c.telegram_user_id = p_telegram_user_id
    ), '[]'::jsonb)
  )
  from public.user_progress p
  where p.telegram_user_id = p_telegram_user_id;
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

revoke all on function public.submit_quiz_attempt(text, uuid, uuid, text, text, date) from public, anon, authenticated;
revoke all on function public.get_user_stats(text) from public, anon, authenticated;
revoke all on function public.reset_user_progress(text) from public, anon, authenticated;
revoke all on function public.create_quiz_session(text, uuid, text[]) from public, anon, authenticated;
revoke all on function public.has_unique_text_items(text[]) from public, anon, authenticated;
grant execute on function public.submit_quiz_attempt(text, uuid, uuid, text, text, date) to service_role;
grant execute on function public.get_user_stats(text) to service_role;
grant execute on function public.reset_user_progress(text) to service_role;
grant execute on function public.create_quiz_session(text, uuid, text[]) to service_role;
grant execute on function public.has_unique_text_items(text[]) to service_role;