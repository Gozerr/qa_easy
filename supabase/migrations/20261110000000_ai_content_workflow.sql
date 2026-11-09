create table if not exists public.ai_content_drafts (
  id uuid primary key default gen_random_uuid(),
  created_by text not null references public.profiles(telegram_user_id) on delete restrict,
  topic text not null check (char_length(topic) between 3 and 300),
  category text not null check (category in ('fundamentals', 'web-api', 'scenarios')),
  difficulty text not null check (difficulty in ('Начальный', 'Средний', 'Сложный')),
  status text not null check (status in ('generating', 'approved', 'rejected', 'failed', 'published')),
  content jsonb check (content is null or jsonb_typeof(content) = 'object'),
  review jsonb check (review is null or jsonb_typeof(review) = 'object'),
  revision_count smallint not null default 0 check (revision_count between 0 and 2),
  generator_model text not null,
  reviewer_model text not null,
  published_question_id text references public.questions(id) on delete set null,
  failure_code text check (failure_code is null or char_length(failure_code) <= 64),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_content_events (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references public.ai_content_drafts(id) on delete cascade,
  actor_telegram_user_id text not null references public.profiles(telegram_user_id) on delete restrict,
  stage text not null check (stage in ('generation', 'review', 'revision', 'publish', 'failure')),
  model text check (model is null or char_length(model) <= 120),
  outcome text not null check (char_length(outcome) between 1 and 64),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

create table if not exists public.ai_generation_windows (
  telegram_user_id text not null references public.profiles(telegram_user_id) on delete cascade,
  window_start timestamptz not null,
  request_count smallint not null default 0 check (request_count between 0 and 1000),
  primary key (telegram_user_id, window_start)
);

create index if not exists ai_content_drafts_recent_idx on public.ai_content_drafts (created_at desc);
create index if not exists ai_content_events_draft_idx on public.ai_content_events (draft_id, created_at);

alter table public.ai_content_drafts enable row level security;
alter table public.ai_content_events enable row level security;
alter table public.ai_generation_windows enable row level security;
revoke all on public.ai_content_drafts, public.ai_content_events, public.ai_generation_windows from anon, authenticated;
grant all on public.ai_content_drafts, public.ai_content_events, public.ai_generation_windows to service_role;

create or replace function public.consume_ai_generation_slot(p_telegram_user_id text, p_limit smallint default 5)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window timestamptz := date_trunc('hour', now());
  v_count smallint;
begin
  if p_telegram_user_id is null or p_telegram_user_id !~ '^[1-9][0-9]{0,15}$' or p_limit < 1 or p_limit > 20 then
    raise exception 'Invalid generation limit request';
  end if;
  insert into public.ai_generation_windows (telegram_user_id, window_start, request_count)
  values (p_telegram_user_id, v_window, 1)
  on conflict (telegram_user_id, window_start) do update
    set request_count = least(1000, public.ai_generation_windows.request_count + 1)
  returning request_count into v_count;
  return v_count <= p_limit;
end;
$$;

create or replace function public.publish_ai_content_draft(p_draft_id uuid, p_admin_id text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_draft public.ai_content_drafts%rowtype;
  v_question_id text;
begin
  select * into v_draft from public.ai_content_drafts where id = p_draft_id for update;
  if not found or v_draft.status <> 'approved' or v_draft.content is null then
    raise exception 'Draft is not approved for publication';
  end if;
  v_question_id := 'ai-' || replace(p_draft_id::text, '-', '');
  insert into public.questions (id, category, difficulty, question_text, options, correct_option_id, explanation, hint, is_active)
  values (
    v_question_id,
    v_draft.category,
    v_draft.difficulty,
    v_draft.content->>'question',
    v_draft.content->'options',
    v_draft.content->>'correctOptionId',
    v_draft.content->>'explanation',
    v_draft.content->>'hint',
    true
  );
  update public.ai_content_drafts
    set status = 'published', published_question_id = v_question_id, updated_at = now()
    where id = p_draft_id;
  insert into public.ai_content_events (draft_id, actor_telegram_user_id, stage, outcome, metadata)
    values (p_draft_id, p_admin_id, 'publish', 'published', jsonb_build_object('questionId', v_question_id));
  return v_question_id;
end;
$$;

revoke all on function public.consume_ai_generation_slot(text, smallint) from public, anon, authenticated;
revoke all on function public.publish_ai_content_draft(uuid, text) from public, anon, authenticated;
grant execute on function public.consume_ai_generation_slot(text, smallint) to service_role;
grant execute on function public.publish_ai_content_draft(uuid, text) to service_role;
