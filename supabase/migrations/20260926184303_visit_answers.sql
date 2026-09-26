-- Increment 2. Additive only: historical visits/schema versions are unchanged.
alter table public.visits add constraint visits_id_user_id_key unique (id, user_id);
create table public.visit_answers (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  question_id text not null check (length(trim(question_id)) > 0),
  section_id text,
  value_json jsonb,
  source_type text not null default 'unknown'
    check (source_type in ('observed','seller_claim','architect_check','municipal_check','documentary','unknown')),
  verified boolean not null default false,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint visit_answers_visit_owner_fkey foreign key (visit_id, user_id)
    references public.visits(id, user_id) on delete cascade,
  constraint visit_answers_visit_question_key unique (visit_id, question_id)
);
create index visit_answers_owner_updated_idx on public.visit_answers(user_id, updated_at);
create index visit_answers_visit_owner_idx on public.visit_answers(visit_id, user_id);
alter table public.visit_answers enable row level security;
create policy visit_answers_select on public.visit_answers for select to authenticated
using ((select auth.uid()) = user_id and exists (
  select 1 from public.visits v where v.id = visit_id and v.user_id = (select auth.uid())
));
create policy visit_answers_insert on public.visit_answers for insert to authenticated
with check ((select auth.uid()) = user_id and exists (
  select 1 from public.visits v where v.id = visit_id and v.user_id = (select auth.uid())
));
create policy visit_answers_update on public.visit_answers for update to authenticated
using ((select auth.uid()) = user_id and exists (
  select 1 from public.visits v where v.id = visit_id and v.user_id = (select auth.uid())
))
with check ((select auth.uid()) = user_id and exists (
  select 1 from public.visits v where v.id = visit_id and v.user_id = (select auth.uid())
));
create policy visit_answers_delete on public.visit_answers for delete to authenticated
using ((select auth.uid()) = user_id and exists (
  select 1 from public.visits v where v.id = visit_id and v.user_id = (select auth.uid())
));
revoke all on public.visit_answers from anon;
grant select, insert, update, delete on public.visit_answers to authenticated;
-- Client edit timestamps implement atomic LWW on the natural question key.
-- Equal timestamps are idempotent retries. IDs/ownership cannot be reassigned.
create function private.visit_answer_lww() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.visit_id <> old.visit_id or new.user_id <> old.user_id or new.question_id <> old.question_id then
    raise exception 'Answer identity is immutable' using errcode = '23514';
  end if;
  if new.updated_at <= old.updated_at then return old; end if;
  new.id := old.id;
  new.created_at := old.created_at;
  return new;
end;
$$;
revoke all on function private.visit_answer_lww() from public, anon, authenticated;
create trigger visit_answers_lww before update on public.visit_answers
for each row execute function private.visit_answer_lww();
