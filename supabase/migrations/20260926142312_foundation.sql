create schema if not exists private;
revoke all on schema private from public;
create function private.set_updated_at() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end;
$$;
create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 display_name text not null default '',
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table public.properties (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 address text not null check (length(trim(address)) > 0),
 municipality text not null check (length(trim(municipality)) > 0),
 province text not null check (length(trim(province)) > 0),
 postal_code text not null default '' check (postal_code = '' or postal_code ~ '^[0-9]{5}$'),
 cadastral_reference text not null default '',
 asking_price numeric check (asking_price >= 0),
 built_area numeric check (built_area >= 0),
 usable_area numeric check (usable_area >= 0),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique (id,user_id)
);
create table public.visits (
 id uuid primary key default gen_random_uuid(),
 property_id uuid not null,
 user_id uuid not null references auth.users(id) on delete cascade,
 schema_id text not null default 'commercial-to-residential' check(length(schema_id)>0),
 schema_version text not null default '0.1.0' check(length(schema_version)>0),
 status text not null default 'draft' check(status in ('draft','syncing','completed','exported','analysed')),
 started_at timestamptz not null default now(),
 completed_at timestamptz check(completed_at >= started_at),
 device_id text not null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 foreign key (property_id,user_id) references public.properties(id,user_id) on delete cascade
);
create index properties_user_id_idx on public.properties(user_id);
create index visits_user_id_idx on public.visits(user_id);
create index visits_property_owner_idx on public.visits(property_id,user_id);
alter table public.profiles enable row level security;
alter table public.properties enable row level security;
alter table public.visits enable row level security;
create policy profiles_owner on public.profiles for all to authenticated using ((select auth.uid())=id) with check ((select auth.uid())=id);
create policy properties_owner on public.properties for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy visits_owner on public.visits for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
revoke all on public.profiles,public.properties,public.visits from anon;
grant select,insert,update,delete on public.profiles,public.properties,public.visits to authenticated;
create trigger profiles_updated before update on public.profiles for each row execute function private.set_updated_at();
create trigger properties_updated before update on public.properties for each row execute function private.set_updated_at();
create trigger visits_updated before update on public.visits for each row execute function private.set_updated_at();
-- Internal auth trigger only; no callable privileged function in an exposed schema.
create function private.create_profile() returns trigger language plpgsql security definer set search_path='' as $$
begin insert into public.profiles(id) values(new.id); return new; end;
$$;
revoke all on function private.create_profile() from public,anon,authenticated;
create trigger auth_user_profile after insert on auth.users for each row execute function private.create_profile();
insert into storage.buckets(id,name,public) values ('visit-photos','visit-photos',false),('property-documents','property-documents',false),('generated-reports','generated-reports',false);
-- No storage.objects policies yet: uploads/downloads denied until the next file increment.
