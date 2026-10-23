-- =====================================================================
--  Hagenda — database + beveiliging
--  Plak dit volledig in Supabase > SQL Editor > New query > Run.
--  Je mag het opnieuw uitvoeren; het is zo geschreven dat dit veilig is.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- tabellen ----------
create table if not exists public.households (
  id           uuid primary key default gen_random_uuid(),
  name         text not null default 'Ons huishouden',
  invite_code  text not null unique default upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 8)),
  created_at   timestamptz not null default now()
);

create table if not exists public.members (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  household_id  uuid not null references public.households(id) on delete cascade,
  display_name  text not null,
  color         text not null default '#3346c9',
  created_at    timestamptz not null default now()
);

create table if not exists public.calendars (
  id              uuid primary key default gen_random_uuid(),
  household_id    uuid not null references public.households(id) on delete cascade,
  owner_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name            text not null,
  color           text not null default '#3346c9',
  kind            text not null default 'local'  check (kind in ('local','ics')),
  visibility      text not null default 'shared' check (visibility in ('shared','private')),
  last_synced_at  timestamptz,
  last_error      text,
  created_at      timestamptz not null default now()
);

-- De iCal-link is geheim (wie hem heeft, kan de agenda lezen).
-- Daarom apart, en enkel zichtbaar voor de eigenaar.
create table if not exists public.calendar_secrets (
  calendar_id  uuid primary key references public.calendars(id) on delete cascade,
  ics_url      text not null
);

create table if not exists public.events (
  id            uuid primary key default gen_random_uuid(),
  calendar_id   uuid not null references public.calendars(id) on delete cascade,
  title         text not null,
  starts_at     timestamptz not null,
  ends_at       timestamptz not null,
  all_day       boolean not null default false,
  location      text not null default '',
  notes         text not null default '',
  rrule         jsonb,                 -- {"freq":"weekly","until":"2027-06-30"} of null
  external_uid  text,                  -- gevuld voor geïmporteerde afspraken
  sync_run      uuid,
  created_by    uuid default auth.uid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists events_cal_time on public.events (calendar_id, starts_at);
-- volledige unieke index (NULL telt als uniek, dus eigen afspraken botsen niet)
drop index if exists public.events_external;
create unique index events_external on public.events (calendar_id, external_uid);

create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists events_touch on public.events;
create trigger events_touch before update on public.events for each row execute function public.touch_updated_at();

-- ---------- hulpfuncties voor de beveiligingsregels ----------
create or replace function public.my_household() returns uuid
language sql stable security definer set search_path = public as $$
  select household_id from public.members where user_id = auth.uid()
$$;

create or replace function public.can_see_calendar(cal uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.calendars c
    where c.id = cal and c.household_id = public.my_household()
      and (c.visibility = 'shared' or c.owner_id = auth.uid())
  )
$$;

-- Afspraken toevoegen/wijzigen: enkel in eigen agenda's (geen geïmporteerde),
-- privé = alleen eigenaar, gedeeld = iedereen in het huishouden.
create or replace function public.can_edit_calendar(cal uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.calendars c
    where c.id = cal and c.kind = 'local' and c.household_id = public.my_household()
      and (c.visibility = 'shared' or c.owner_id = auth.uid())
  )
$$;

-- ---------- Row Level Security: niemand ziet iets wat niet van hem is ----------
alter table public.households       enable row level security;
alter table public.members          enable row level security;
alter table public.calendars        enable row level security;
alter table public.calendar_secrets enable row level security;
alter table public.events           enable row level security;

drop policy if exists hh_select on public.households;
create policy hh_select on public.households for select using (id = public.my_household());
drop policy if exists hh_update on public.households;
create policy hh_update on public.households for update using (id = public.my_household());

drop policy if exists mem_select on public.members;
create policy mem_select on public.members for select using (household_id = public.my_household());
drop policy if exists mem_update on public.members;
create policy mem_update on public.members for update using (user_id = auth.uid()) with check (user_id = auth.uid() and household_id = public.my_household());

drop policy if exists cal_select on public.calendars;
create policy cal_select on public.calendars for select
  using (household_id = public.my_household() and (visibility = 'shared' or owner_id = auth.uid()));
drop policy if exists cal_insert on public.calendars;
create policy cal_insert on public.calendars for insert
  with check (household_id = public.my_household() and owner_id = auth.uid());
drop policy if exists cal_update on public.calendars;
create policy cal_update on public.calendars for update
  using (household_id = public.my_household() and (owner_id = auth.uid() or (kind = 'local' and visibility = 'shared')))
  with check (household_id = public.my_household() and (owner_id = auth.uid() or (kind = 'local' and visibility = 'shared')));
drop policy if exists cal_delete on public.calendars;
create policy cal_delete on public.calendars for delete using (owner_id = auth.uid());

-- Een gedeelde agenda van een ander mag je hernoemen/kleur geven, maar niet
-- privé maken of van eigenaar veranderen.
create or replace function public.guard_calendar_update() returns trigger language plpgsql as $$
begin
  if auth.uid() is not null and old.owner_id <> auth.uid() then
    if new.visibility <> old.visibility or new.owner_id <> old.owner_id or new.kind <> old.kind then
      raise exception 'Alleen de eigenaar kan dit wijzigen';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists calendars_guard on public.calendars;
create trigger calendars_guard before update on public.calendars for each row execute function public.guard_calendar_update();

drop policy if exists sec_all on public.calendar_secrets;
create policy sec_all on public.calendar_secrets for all
  using (exists (select 1 from public.calendars c where c.id = calendar_id and c.owner_id = auth.uid()))
  with check (exists (select 1 from public.calendars c where c.id = calendar_id and c.owner_id = auth.uid()));

drop policy if exists ev_select on public.events;
create policy ev_select on public.events for select using (public.can_see_calendar(calendar_id));
drop policy if exists ev_insert on public.events;
create policy ev_insert on public.events for insert with check (public.can_edit_calendar(calendar_id));
drop policy if exists ev_update on public.events;
create policy ev_update on public.events for update using (public.can_edit_calendar(calendar_id)) with check (public.can_edit_calendar(calendar_id));
drop policy if exists ev_delete on public.events;
create policy ev_delete on public.events for delete using (public.can_edit_calendar(calendar_id));

-- ---------- huishouden starten / aansluiten ----------
create or replace function public.create_household(p_name text, p_display_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare hid uuid;
begin
  if auth.uid() is null then raise exception 'Niet ingelogd'; end if;
  if exists (select 1 from members where user_id = auth.uid()) then raise exception 'Je hoort al bij een huishouden'; end if;
  insert into households(name) values (coalesce(nullif(p_name,''),'Ons huishouden')) returning id into hid;
  insert into members(user_id, household_id, display_name, color) values (auth.uid(), hid, p_display_name, '#3346c9');
  insert into calendars(household_id, owner_id, name, color, kind, visibility) values
    (hid, auth.uid(), 'Samen', '#3346c9', 'local', 'shared'),
    (hid, auth.uid(), 'Privé', '#5b6275', 'local', 'private');
  return hid;
end $$;

create or replace function public.join_household(p_code text, p_display_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare hid uuid;
begin
  if auth.uid() is null then raise exception 'Niet ingelogd'; end if;
  if exists (select 1 from members where user_id = auth.uid()) then raise exception 'Je hoort al bij een huishouden'; end if;
  select id into hid from households where invite_code = upper(trim(p_code));
  if hid is null then raise exception 'Ongeldige code'; end if;
  insert into members(user_id, household_id, display_name, color) values (auth.uid(), hid, p_display_name, '#d0367a');
  insert into calendars(household_id, owner_id, name, color, kind, visibility)
    values (hid, auth.uid(), 'Privé', '#7a3ad6', 'local', 'private');
  return hid;
end $$;

revoke all on function public.create_household(text,text) from public, anon;
revoke all on function public.join_household(text,text) from public, anon;
grant execute on function public.create_household(text,text) to authenticated;
grant execute on function public.join_household(text,text) to authenticated;

-- ---------- live bijwerken op alle toestellen ----------
do $$ begin
  begin alter publication supabase_realtime add table public.events;    exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.calendars; exception when duplicate_object then null; end;
end $$;
