-- MamaCare database schema for Supabase (website and phone app share it).
--
-- Run the whole file in the Supabase SQL editor. It is safe to run again after an update:
-- every statement is "create if not exists", "create or replace" or "drop ... if exists" first.
--
--   Part 1  Accounts, saved recipes, recipe history            (the original setup)
--   Part 2  Doctor accounts and patient profiles
--   Part 3  Care team: patient <-> doctor links, shared health records, reviews, messages, diet instructions
--   Part 4  Private file storage for scanned reports
--   Part 5  Live updates (Realtime) and the one-time copy of old vitals sessions
--
-- Doctor sign-up needs an access code (default: doctor123). To change it:
--   update private.settings set value = 'new-code' where key = 'doctor_access_code';

create extension if not exists pgcrypto;

-- =====================================================================================================
-- Part 1. Accounts, saved recipes, recipe history
-- =====================================================================================================

create table if not exists public.saved_recipes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  recipe_name text not null,
  recipe jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.recipe_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_page text not null,
  recipe_name text not null,
  recipe jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.saved_recipes enable row level security;
alter table public.recipe_history enable row level security;
alter table public.user_profiles enable row level security;

drop policy if exists "saved_recipes_select_own" on public.saved_recipes;
drop policy if exists "saved_recipes_insert_own" on public.saved_recipes;
drop policy if exists "saved_recipes_delete_own" on public.saved_recipes;
drop policy if exists "recipe_history_select_own" on public.recipe_history;
drop policy if exists "recipe_history_insert_own" on public.recipe_history;
drop policy if exists "user_profiles_select_own" on public.user_profiles;
drop policy if exists "user_profiles_insert_own" on public.user_profiles;
drop policy if exists "user_profiles_update_own" on public.user_profiles;

create policy "saved_recipes_select_own" on public.saved_recipes
  for select to authenticated using (auth.uid() = user_id);
create policy "saved_recipes_insert_own" on public.saved_recipes
  for insert to authenticated with check (auth.uid() = user_id);
create policy "saved_recipes_delete_own" on public.saved_recipes
  for delete to authenticated using (auth.uid() = user_id);
create policy "recipe_history_select_own" on public.recipe_history
  for select to authenticated using (auth.uid() = user_id);
create policy "recipe_history_insert_own" on public.recipe_history
  for insert to authenticated with check (auth.uid() = user_id);
create policy "user_profiles_select_own" on public.user_profiles
  for select to authenticated using (auth.uid() = id);
create policy "user_profiles_insert_own" on public.user_profiles
  for insert to authenticated with check (auth.uid() = id);
create policy "user_profiles_update_own" on public.user_profiles
  for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

-- =====================================================================================================
-- Part 2. Doctor accounts and patient profiles
-- =====================================================================================================

-- Settings that must never be readable through the API (the "private" schema is not exposed).
create schema if not exists private;
revoke all on schema private from public;

create table if not exists private.settings (
  key text primary key,
  value text not null
);
insert into private.settings (key, value) values ('doctor_access_code', 'doctor123')
  on conflict (key) do nothing;

-- A row here is what makes an account a doctor. Rows are only created by the sign-up trigger below.
create table if not exists public.doctor_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null check (char_length(full_name) between 1 and 120),
  specialty text not null default 'Obstetrics & Gynaecology' check (char_length(specialty) <= 120),
  hospital text check (char_length(hospital) <= 160),
  city text check (char_length(city) <= 80),
  bio text check (char_length(bio) <= 1000),
  accepting_patients boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- What a patient's doctor sees about her: name, month of pregnancy and the diet-planner profile.
create table if not exists public.patient_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text check (char_length(full_name) <= 120),
  pregnancy_month smallint check (pregnancy_month between 1 and 9),
  info jsonb not null default '{}'::jsonb check (jsonb_typeof(info) = 'object' and pg_column_size(info) < 20000),
  updated_at timestamptz not null default now()
);

create or replace function private.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists doctor_profiles_touch on public.doctor_profiles;
create trigger doctor_profiles_touch before update on public.doctor_profiles
  for each row execute procedure private.touch_updated_at();
drop trigger if exists patient_profiles_touch on public.patient_profiles;
create trigger patient_profiles_touch before update on public.patient_profiles
  for each row execute procedure private.touch_updated_at();

create or replace function public.check_doctor_code(p_code text)
returns boolean
language sql stable security definer
set search_path = public, private
as $$
  select exists (
    select 1 from private.settings
    where key = 'doctor_access_code' and lower(value) = lower(btrim(coalesce(p_code, '')))
  );
$$;

-- Runs before a new auth user is saved: a doctor sign-up with a wrong code is rejected, and the code itself
-- is removed from the stored user metadata.
create or replace function public.validate_doctor_signup()
returns trigger
language plpgsql security definer
set search_path = public, private
as $$
begin
  if coalesce(new.raw_user_meta_data ->> 'account_type', 'patient') = 'doctor'
     and not public.check_doctor_code(new.raw_user_meta_data ->> 'doctor_code') then
    raise exception 'Invalid doctor access code' using errcode = '28000';
  end if;
  new.raw_user_meta_data := coalesce(new.raw_user_meta_data, '{}'::jsonb) - 'doctor_code';
  return new;
end;
$$;

drop trigger if exists before_auth_user_created_doctor on auth.users;
create trigger before_auth_user_created_doctor
  before insert on auth.users
  for each row execute procedure public.validate_doctor_signup();

-- Runs after a new auth user is saved: creates the account profile, plus a doctor or patient profile.
create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_name text := nullif(btrim(meta ->> 'full_name'), '');
  v_fallback text := nullif(split_part(coalesce(new.email, ''), '@', 1), '');
begin
  insert into public.user_profiles (id, email, full_name)
  values (new.id, coalesce(new.email, ''), v_name)
  on conflict (id) do update
    set email = excluded.email,
        full_name = excluded.full_name,
        updated_at = now();

  if meta ->> 'account_type' = 'doctor' then
    insert into public.doctor_profiles (id, full_name, specialty, hospital, city)
    values (
      new.id,
      left(coalesce(v_name, v_fallback, 'Doctor'), 120),
      left(coalesce(nullif(btrim(meta ->> 'specialty'), ''), 'Obstetrics & Gynaecology'), 120),
      left(nullif(btrim(meta ->> 'hospital'), ''), 160),
      left(nullif(btrim(meta ->> 'city'), ''), 80)
    )
    on conflict (id) do nothing;
  else
    insert into public.patient_profiles (id, full_name)
    values (new.id, left(coalesce(v_name, v_fallback), 120))
    on conflict (id) do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
  after insert on auth.users
  for each row execute procedure public.handle_new_user_profile();

-- Accounts created before this update are patients.
insert into public.patient_profiles (id, full_name)
select u.id,
       left(coalesce(nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
                     nullif(split_part(coalesce(u.email, ''), '@', 1), '')), 120)
from auth.users u
where not exists (select 1 from public.doctor_profiles d where d.id = u.id)
on conflict (id) do nothing;

-- =====================================================================================================
-- Part 3. Care team
-- =====================================================================================================

-- One row per patient <-> doctor relationship. A patient has at most one active doctor at a time;
-- switching ends the old link and starts a new one (see assign_doctor).
create table if not exists public.care_links (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patient_profiles(id) on delete cascade,
  doctor_id uuid not null references public.doctor_profiles(id) on delete cascade,
  patient_name text not null,
  status text not null default 'active' check (status in ('active', 'ended')),
  patient_note text check (char_length(patient_note) <= 1000),
  started_at timestamptz not null default now(),
  doctor_seen_at timestamptz,
  ended_at timestamptz,
  ended_by text check (ended_by in ('patient', 'doctor')),
  end_reason text check (char_length(end_reason) <= 300),
  constraint care_links_end_consistent check ((status = 'active') = (ended_at is null))
);
create unique index if not exists care_links_one_active_per_patient
  on public.care_links (patient_id) where status = 'active';
create index if not exists care_links_doctor_idx on public.care_links (doctor_id, status);

-- Everything a patient saves for her doctor: scanned reports, vitals sessions, risk checks and diet plans.
create table if not exists public.patient_records (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null check (kind in ('report', 'vitals', 'risk', 'diet_plan', 'med_check')),
  title text not null check (char_length(title) between 1 and 200),
  summary text check (char_length(summary) <= 500),
  severity text not null default 'info' check (severity in ('normal', 'info', 'attention', 'urgent')),
  data jsonb not null check (jsonb_typeof(data) = 'object' and pg_column_size(data) < 4000000),
  is_sample boolean not null default false,
  file_path text check (char_length(file_path) <= 300),
  file_name text check (char_length(file_name) <= 200),
  file_mime text check (char_length(file_mime) <= 100),
  file_size integer check (file_size >= 0),
  review_status text not null default 'none' check (review_status in ('none', 'requested', 'reviewed')),
  review_requested_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid references public.doctor_profiles(id) on delete set null,
  reviewer_name text,
  verdict text check (verdict in ('looks_fine', 'needs_changes', 'see_me')),
  created_at timestamptz not null default now()
);
create index if not exists patient_records_patient_idx on public.patient_records (patient_id, created_at desc);
-- Databases set up before medicine checks existed: widen the allowed kinds.
alter table public.patient_records drop constraint if exists patient_records_kind_check;
alter table public.patient_records add constraint patient_records_kind_check
  check (kind in ('report', 'vitals', 'risk', 'diet_plan', 'med_check'));

-- The patient's current medicines and supplements ("My medicines"); her doctor can read them.
create table if not exists public.patient_medications (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 200),
  dose text check (char_length(dose) <= 100),
  frequency text check (char_length(frequency) <= 100),
  source text not null default 'manual' check (source in ('manual', 'prescription')),
  created_at timestamptz not null default now()
);
create index if not exists patient_medications_patient_idx on public.patient_medications (patient_id, created_at);
create index if not exists patient_records_requested_idx on public.patient_records (patient_id)
  where review_status = 'requested';

-- Comments on a record (record_id set) and the general conversation (record_id null).
-- A doctor's comment can carry a verdict; that is what "reviewing" a record means.
create table if not exists public.care_messages (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references auth.users(id) on delete cascade,
  record_id uuid references public.patient_records(id) on delete cascade,
  author_id uuid references auth.users(id) on delete set null,
  author_role text not null check (author_role in ('patient', 'doctor')),
  author_name text not null,
  body text not null check (char_length(body) between 1 and 4000),
  verdict text check (verdict in ('looks_fine', 'needs_changes', 'see_me')),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  constraint care_messages_verdict_by_doctor check (verdict is null or (author_role = 'doctor' and record_id is not null))
);
create index if not exists care_messages_thread_idx on public.care_messages (patient_id, record_id, created_at);
create index if not exists care_messages_unread_idx on public.care_messages (patient_id, author_role)
  where read_at is null;

-- The doctor's diet instructions; the diet planner applies them automatically.
create table if not exists public.diet_instructions (
  patient_id uuid primary key references auth.users(id) on delete cascade,
  avoid text[] not null default '{}',
  include text[] not null default '{}',
  restrictions text[] not null default '{}',
  note text check (char_length(note) <= 2000),
  updated_by uuid references public.doctor_profiles(id) on delete set null,
  updated_by_name text,
  updated_at timestamptz not null default now()
);

-- ---------- Access helpers (used by the row-level security policies) ----------

create or replace function public.is_doctor()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.doctor_profiles where id = auth.uid());
$$;

create or replace function public.is_doctor_of(p_patient uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.care_links
    where patient_id = p_patient and doctor_id = auth.uid() and status = 'active'
  );
$$;

create or replace function public.can_access_patient(p_patient uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p_patient = auth.uid() or public.is_doctor_of(p_patient);
$$;

-- Storage folders are named after the patient's id.
create or replace function public.can_access_patient_folder(p_folder text)
returns boolean language sql stable security definer set search_path = public as $$
  select p_folder is not null and (
    p_folder = auth.uid()::text
    or exists (
      select 1 from public.care_links
      where doctor_id = auth.uid() and status = 'active' and patient_id::text = p_folder
    )
  );
$$;

create or replace function private.clean_list(p text[])
returns text[] language sql immutable as $$
  select coalesce(array_agg(x order by first_pos), '{}'::text[])
  from (
    select x, min(pos) as first_pos
    from (
      select lower(left(btrim(v), 60)) as x, pos
      from unnest(coalesce(p, '{}'::text[])) with ordinality as t(v, pos)
    ) items
    where x <> ''
    group by x
    order by min(pos)
    limit 30
  ) cleaned;
$$;

-- ---------- Records: new rows from the app are sanitised; urgent results ask the doctor automatically ----------

create or replace function public.patient_records_before_insert()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  -- Rows inserted from the SQL editor (no signed-in user) are trusted as-is, e.g. the vitals copy in part 5.
  if auth.uid() is null then
    return new;
  end if;
  if new.patient_id is distinct from auth.uid() then
    raise exception 'You can only add records to your own account' using errcode = '42501';
  end if;
  if new.file_path is not null and new.file_path not like new.patient_id::text || '/%' then
    raise exception 'The file must be stored in your own folder' using errcode = '22023';
  end if;

  new.created_at := now();
  new.reviewed_at := null;
  new.reviewed_by := null;
  new.reviewer_name := null;
  new.verdict := null;
  if new.review_status = 'requested' or (new.severity = 'urgent' and not new.is_sample) then
    new.review_status := 'requested';
    new.review_requested_at := now();
  else
    new.review_status := 'none';
    new.review_requested_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists patient_records_sanitize on public.patient_records;
create trigger patient_records_sanitize before insert on public.patient_records
  for each row execute procedure public.patient_records_before_insert();

-- ---------- Row-level security ----------

alter table public.doctor_profiles enable row level security;
alter table public.patient_profiles enable row level security;
alter table public.care_links enable row level security;
alter table public.patient_records enable row level security;
alter table public.care_messages enable row level security;
alter table public.diet_instructions enable row level security;
alter table public.patient_medications enable row level security;

drop policy if exists "doctor_profiles_read" on public.doctor_profiles;
drop policy if exists "doctor_profiles_update_own" on public.doctor_profiles;
drop policy if exists "patient_profiles_read" on public.patient_profiles;
drop policy if exists "patient_profiles_insert_own" on public.patient_profiles;
drop policy if exists "patient_profiles_update_own" on public.patient_profiles;
drop policy if exists "care_links_read" on public.care_links;
drop policy if exists "patient_records_read" on public.patient_records;
drop policy if exists "patient_records_insert_own" on public.patient_records;
drop policy if exists "patient_records_delete_own" on public.patient_records;
drop policy if exists "care_messages_read" on public.care_messages;
drop policy if exists "diet_instructions_read" on public.diet_instructions;
drop policy if exists "patient_medications_read" on public.patient_medications;
drop policy if exists "patient_medications_insert_own" on public.patient_medications;
drop policy if exists "patient_medications_update_own" on public.patient_medications;
drop policy if exists "patient_medications_delete_own" on public.patient_medications;

-- Any signed-in user can browse the doctor directory. Doctors edit only their own profile.
create policy "doctor_profiles_read" on public.doctor_profiles
  for select to authenticated using (true);
create policy "doctor_profiles_update_own" on public.doctor_profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- A patient manages her profile; her current doctor can read it.
create policy "patient_profiles_read" on public.patient_profiles
  for select to authenticated using (public.can_access_patient(id));
create policy "patient_profiles_insert_own" on public.patient_profiles
  for insert to authenticated with check (id = auth.uid() and not public.is_doctor());
create policy "patient_profiles_update_own" on public.patient_profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- Both sides can see their links. Links change only through assign_doctor / end_care.
create policy "care_links_read" on public.care_links
  for select to authenticated using (patient_id = auth.uid() or doctor_id = auth.uid());

-- A patient adds and deletes her own records; her current doctor can read them. Reviews go through functions.
create policy "patient_records_read" on public.patient_records
  for select to authenticated using (public.can_access_patient(patient_id));
create policy "patient_records_insert_own" on public.patient_records
  for insert to authenticated with check (patient_id = auth.uid() and not public.is_doctor());
create policy "patient_records_delete_own" on public.patient_records
  for delete to authenticated using (patient_id = auth.uid());

create policy "care_messages_read" on public.care_messages
  for select to authenticated using (public.can_access_patient(patient_id));

create policy "diet_instructions_read" on public.diet_instructions
  for select to authenticated using (public.can_access_patient(patient_id));

-- A patient manages her medicine list; her current doctor can read it.
create policy "patient_medications_read" on public.patient_medications
  for select to authenticated using (public.can_access_patient(patient_id));
create policy "patient_medications_insert_own" on public.patient_medications
  for insert to authenticated with check (patient_id = auth.uid() and not public.is_doctor());
create policy "patient_medications_update_own" on public.patient_medications
  for update to authenticated using (patient_id = auth.uid()) with check (patient_id = auth.uid());
create policy "patient_medications_delete_own" on public.patient_medications
  for delete to authenticated using (patient_id = auth.uid());

-- ---------- Functions the apps call ----------

-- Who am I? {role: 'doctor' | 'patient', doctor: {...} | null, patient: {...} | null}
create or replace function public.my_account()
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select jsonb_build_object(
    'role', case when exists (select 1 from public.doctor_profiles where id = auth.uid()) then 'doctor' else 'patient' end,
    'doctor', (select to_jsonb(d) from public.doctor_profiles d where d.id = auth.uid()),
    'patient', (select to_jsonb(p) from public.patient_profiles p where p.id = auth.uid())
  );
$$;

-- Patient chooses (or switches to) a doctor. Connection is immediate; the previous doctor loses access at once.
create or replace function public.assign_doctor(p_doctor_id uuid, p_note text default null)
returns public.care_links
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_link public.care_links;
  v_name text;
begin
  if v_uid is null then
    raise exception 'Please log in first' using errcode = '28000';
  end if;
  if public.is_doctor() then
    raise exception 'Doctor accounts cannot choose a doctor' using errcode = '42501';
  end if;
  if not exists (select 1 from public.doctor_profiles where id = p_doctor_id and accepting_patients) then
    raise exception 'This doctor is not accepting new patients' using errcode = 'P0002';
  end if;

  -- One change at a time per patient (two taps, two devices).
  perform pg_advisory_xact_lock(hashtext('care_link:' || v_uid::text));

  insert into public.patient_profiles (id) values (v_uid) on conflict (id) do nothing;
  select coalesce(full_name, 'Patient') into v_name from public.patient_profiles where id = v_uid;

  select * into v_link from public.care_links where patient_id = v_uid and status = 'active';
  if found then
    if v_link.doctor_id = p_doctor_id then
      return v_link;
    end if;
    update public.care_links
       set status = 'ended', ended_at = now(), ended_by = 'patient', end_reason = 'Switched to another doctor'
     where id = v_link.id;
  end if;

  insert into public.care_links (patient_id, doctor_id, patient_name, patient_note)
  values (v_uid, p_doctor_id, v_name, nullif(left(btrim(coalesce(p_note, '')), 1000), ''))
  returning * into v_link;
  return v_link;
end;
$$;

-- Either side ends a care link.
create or replace function public.end_care(p_link_id uuid, p_reason text default null)
returns public.care_links
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_link public.care_links;
begin
  if v_uid is null then
    raise exception 'Please log in first' using errcode = '28000';
  end if;
  select * into v_link from public.care_links where id = p_link_id for update;
  if not found or (v_link.patient_id <> v_uid and v_link.doctor_id <> v_uid) then
    raise exception 'Care link not found' using errcode = 'P0002';
  end if;
  if v_link.status = 'ended' then
    return v_link;
  end if;
  update public.care_links
     set status = 'ended',
         ended_at = now(),
         ended_by = case when v_uid = v_link.patient_id then 'patient' else 'doctor' end,
         end_reason = nullif(left(btrim(coalesce(p_reason, '')), 300), '')
   where id = p_link_id
  returning * into v_link;
  return v_link;
end;
$$;

-- Doctor opened a new patient: no longer "new" in the inbox.
create or replace function public.mark_patient_seen(p_link_id uuid)
returns void
language sql security definer
set search_path = public
as $$
  update public.care_links
     set doctor_seen_at = now()
   where id = p_link_id and doctor_id = auth.uid() and status = 'active' and doctor_seen_at is null;
$$;

-- Patient asks her doctor to review a record (optionally with a question).
create or replace function public.request_review(p_record_id uuid, p_note text default null)
returns public.patient_records
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_rec public.patient_records;
  v_note text := nullif(left(btrim(coalesce(p_note, '')), 4000), '');
begin
  if v_uid is null then
    raise exception 'Please log in first' using errcode = '28000';
  end if;
  select * into v_rec from public.patient_records where id = p_record_id and patient_id = v_uid for update;
  if not found then
    raise exception 'Record not found' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.care_links where patient_id = v_uid and status = 'active') then
    raise exception 'Choose a doctor first' using errcode = 'P0001';
  end if;

  update public.patient_records
     set review_status = 'requested', review_requested_at = now()
   where id = p_record_id
  returning * into v_rec;

  if v_note is not null then
    insert into public.care_messages (patient_id, record_id, author_id, author_role, author_name, body)
    select v_uid, p_record_id, v_uid, 'patient', coalesce(p.full_name, 'Patient'), v_note
    from (select 1) one left join public.patient_profiles p on p.id = v_uid;
  end if;
  return v_rec;
end;
$$;

-- Send a message. On a record, a doctor can add a verdict, which marks the record as reviewed.
create or replace function public.send_care_message(
  p_patient_id uuid,
  p_body text,
  p_record_id uuid default null,
  p_verdict text default null
)
returns public.care_messages
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_name text;
  v_body text := btrim(coalesce(p_body, ''));
  v_msg public.care_messages;
begin
  if v_uid is null then
    raise exception 'Please log in first' using errcode = '28000';
  end if;
  if p_verdict is not null and p_verdict not in ('looks_fine', 'needs_changes', 'see_me') then
    raise exception 'Unknown review result' using errcode = '22023';
  end if;

  if v_uid = p_patient_id then
    v_role := 'patient';
    if p_verdict is not null then
      raise exception 'Only doctors can review' using errcode = '42501';
    end if;
    if not exists (select 1 from public.care_links where patient_id = v_uid and status = 'active') then
      raise exception 'Choose a doctor first' using errcode = 'P0001';
    end if;
    select coalesce(full_name, 'Patient') into v_name from public.patient_profiles where id = v_uid;
  elsif public.is_doctor_of(p_patient_id) then
    v_role := 'doctor';
    select full_name into v_name from public.doctor_profiles where id = v_uid;
  else
    raise exception 'You do not have access to this patient' using errcode = '42501';
  end if;

  if p_record_id is not null
     and not exists (select 1 from public.patient_records where id = p_record_id and patient_id = p_patient_id) then
    raise exception 'Record not found' using errcode = 'P0002';
  end if;
  if p_verdict is not null and p_record_id is null then
    raise exception 'A review must be about a record' using errcode = '22023';
  end if;

  if v_body = '' then
    if p_verdict is null then
      raise exception 'The message is empty' using errcode = '22023';
    end if;
    v_body := case p_verdict
      when 'looks_fine' then 'Reviewed: this looks fine.'
      when 'needs_changes' then 'Reviewed: some changes are needed.'
      else 'Reviewed: please book a visit so I can see you.'
    end;
  end if;
  if char_length(v_body) > 4000 then
    raise exception 'The message is too long (4000 characters at most)' using errcode = '22001';
  end if;

  insert into public.care_messages (patient_id, record_id, author_id, author_role, author_name, body, verdict)
  values (p_patient_id, p_record_id, v_uid, v_role,
          coalesce(v_name, case v_role when 'doctor' then 'Doctor' else 'Patient' end), v_body, p_verdict)
  returning * into v_msg;

  if p_verdict is not null then
    update public.patient_records
       set review_status = 'reviewed', reviewed_at = now(), reviewed_by = v_uid, reviewer_name = v_name, verdict = p_verdict
     where id = p_record_id;
  end if;

  -- Replying means the other side's earlier messages in this thread have been read.
  update public.care_messages
     set read_at = now()
   where patient_id = p_patient_id
     and record_id is not distinct from p_record_id
     and author_role <> v_role
     and read_at is null;

  return v_msg;
end;
$$;

-- Mark the other side's messages in one thread as read (record thread, or the general thread when null).
create or replace function public.mark_thread_read(p_patient_id uuid, p_record_id uuid default null)
returns integer
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_other text;
  v_count integer;
begin
  if v_uid is not null and v_uid = p_patient_id then
    v_other := 'doctor';
  elsif public.is_doctor_of(p_patient_id) then
    v_other := 'patient';
  else
    raise exception 'You do not have access to this patient' using errcode = '42501';
  end if;
  update public.care_messages
     set read_at = now()
   where patient_id = p_patient_id
     and record_id is not distinct from p_record_id
     and author_role = v_other
     and read_at is null;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Doctor sets the patient's diet instructions (replaces the previous ones; empty lists clear them).
create or replace function public.set_diet_instructions(
  p_patient_id uuid,
  p_avoid text[] default '{}',
  p_include text[] default '{}',
  p_restrictions text[] default '{}',
  p_note text default null
)
returns public.diet_instructions
language plpgsql security definer
set search_path = public, private
as $$
declare
  v_uid uuid := auth.uid();
  v_name text;
  v_row public.diet_instructions;
begin
  if v_uid is null or not public.is_doctor_of(p_patient_id) then
    raise exception 'You do not have access to this patient' using errcode = '42501';
  end if;
  select full_name into v_name from public.doctor_profiles where id = v_uid;

  insert into public.diet_instructions as d (patient_id, avoid, include, restrictions, note, updated_by, updated_by_name, updated_at)
  values (
    p_patient_id,
    private.clean_list(p_avoid),
    private.clean_list(p_include),
    array(
      select r from unnest(private.clean_list(p_restrictions)) as r
      where r in ('vegan', 'vegetarian', 'gluten-free', 'dairy-free', 'egg-free', 'nut-free', 'soy-free')
    ),
    nullif(left(btrim(coalesce(p_note, '')), 2000), ''),
    v_uid,
    v_name,
    now()
  )
  on conflict (patient_id) do update
    set avoid = excluded.avoid,
        include = excluded.include,
        restrictions = excluded.restrictions,
        note = excluded.note,
        updated_by = excluded.updated_by,
        updated_by_name = excluded.updated_by_name,
        updated_at = now()
  returning * into v_row;
  return v_row;
end;
$$;

-- Doctor's patient list (current patients first, then past ones), with what needs attention.
create or replace function public.doctor_patients()
returns table (
  link_id uuid,
  patient_id uuid,
  patient_name text,
  pregnancy_month smallint,
  status text,
  started_at timestamptz,
  ended_at timestamptz,
  ended_by text,
  patient_note text,
  is_new boolean,
  records_count bigint,
  pending_reviews bigint,
  urgent_pending bigint,
  unread_messages bigint,
  last_activity timestamptz,
  last_record_title text,
  last_record_severity text
)
language sql stable security definer
set search_path = public
as $$
  with links as (
    select distinct on (l.patient_id) l.*
    from public.care_links l
    where l.doctor_id = auth.uid()
    order by l.patient_id, (l.status = 'active') desc, l.started_at desc
  )
  select
    l.id,
    l.patient_id,
    coalesce(case when l.status = 'active' then pp.full_name end, l.patient_name),
    case when l.status = 'active' then pp.pregnancy_month end,
    l.status,
    l.started_at,
    l.ended_at,
    l.ended_by,
    case when l.status = 'active' then l.patient_note end,
    (l.status = 'active' and l.doctor_seen_at is null),
    coalesce(rs.n_records, 0),
    coalesce(rs.n_pending, 0),
    coalesce(rs.n_urgent, 0),
    coalesce(ms.n_unread, 0),
    greatest(l.started_at, rs.last_record_at, ms.last_message_at),
    rs.last_title,
    rs.last_severity
  from links l
  left join public.patient_profiles pp on pp.id = l.patient_id
  left join lateral (
    select count(*) as n_records,
           count(*) filter (where r.review_status = 'requested') as n_pending,
           count(*) filter (where r.review_status = 'requested' and r.severity = 'urgent') as n_urgent,
           max(r.created_at) as last_record_at,
           (array_agg(r.title order by r.created_at desc))[1] as last_title,
           (array_agg(r.severity order by r.created_at desc))[1] as last_severity
    from public.patient_records r
    where r.patient_id = l.patient_id and l.status = 'active'
  ) rs on true
  left join lateral (
    select count(*) filter (where c.author_role = 'patient' and c.read_at is null) as n_unread,
           max(c.created_at) as last_message_at
    from public.care_messages c
    where c.patient_id = l.patient_id and l.status = 'active'
  ) ms on true
  order by (l.status = 'active') desc,
           greatest(l.started_at, rs.last_record_at, ms.last_message_at) desc nulls last;
$$;

-- Doctor's inbox: urgent results, review requests, unread messages and new patients, most urgent first.
create or replace function public.doctor_inbox()
returns table (
  item_type text,
  priority integer,
  patient_id uuid,
  patient_name text,
  record_id uuid,
  record_kind text,
  record_title text,
  severity text,
  preview text,
  item_count bigint,
  at timestamptz
)
language sql stable security definer
set search_path = public
as $$
  with active as (
    select l.patient_id, l.doctor_seen_at, l.started_at, l.patient_note,
           coalesce(pp.full_name, l.patient_name) as pname
    from public.care_links l
    left join public.patient_profiles pp on pp.id = l.patient_id
    where l.doctor_id = auth.uid() and l.status = 'active'
  )
  select * from (
    select case when r.severity = 'urgent' then 'urgent' else 'review' end,
           case when r.severity = 'urgent' then 0 else 1 end,
           a.patient_id, a.pname, r.id, r.kind, r.title, r.severity,
           coalesce(
             (select c.body from public.care_messages c
               where c.record_id = r.id and c.author_role = 'patient' and c.read_at is null
               order by c.created_at desc limit 1),
             r.summary),
           1::bigint,
           coalesce(r.review_requested_at, r.created_at)
    from active a
    join public.patient_records r on r.patient_id = a.patient_id and r.review_status = 'requested'

    union all

    select 'message', 2, a.patient_id, a.pname, c.record_id, r.kind, r.title, r.severity,
           (array_agg(c.body order by c.created_at desc))[1],
           count(*),
           max(c.created_at)
    from active a
    join public.care_messages c on c.patient_id = a.patient_id and c.author_role = 'patient' and c.read_at is null
    left join public.patient_records r on r.id = c.record_id
    where c.record_id is null or r.review_status <> 'requested'
    group by a.patient_id, a.pname, c.record_id, r.kind, r.title, r.severity

    union all

    select 'new_patient', 3, a.patient_id, a.pname, null, null, null, null, a.patient_note, 1::bigint, a.started_at
    from active a
    where a.doctor_seen_at is null
  ) items
  order by 2, 11 desc;
$$;

-- Only signed-in users may call these. (Supabase grants new functions to everyone by default.)
revoke all on function public.my_account() from public, anon;
revoke all on function public.assign_doctor(uuid, text) from public, anon;
revoke all on function public.end_care(uuid, text) from public, anon;
revoke all on function public.mark_patient_seen(uuid) from public, anon;
revoke all on function public.request_review(uuid, text) from public, anon;
revoke all on function public.send_care_message(uuid, text, uuid, text) from public, anon;
revoke all on function public.mark_thread_read(uuid, uuid) from public, anon;
revoke all on function public.set_diet_instructions(uuid, text[], text[], text[], text) from public, anon;
revoke all on function public.doctor_patients() from public, anon;
revoke all on function public.doctor_inbox() from public, anon;
revoke all on function public.is_doctor() from public, anon;
revoke all on function public.is_doctor_of(uuid) from public, anon;
revoke all on function public.can_access_patient(uuid) from public, anon;
revoke all on function public.can_access_patient_folder(text) from public, anon;
revoke all on function public.validate_doctor_signup() from public, anon, authenticated;
revoke all on function public.handle_new_user_profile() from public, anon, authenticated;
revoke all on function public.patient_records_before_insert() from public, anon, authenticated;

grant execute on function public.my_account() to authenticated;
grant execute on function public.assign_doctor(uuid, text) to authenticated;
grant execute on function public.end_care(uuid, text) to authenticated;
grant execute on function public.mark_patient_seen(uuid) to authenticated;
grant execute on function public.request_review(uuid, text) to authenticated;
grant execute on function public.send_care_message(uuid, text, uuid, text) to authenticated;
grant execute on function public.mark_thread_read(uuid, uuid) to authenticated;
grant execute on function public.set_diet_instructions(uuid, text[], text[], text[], text) to authenticated;
grant execute on function public.doctor_patients() to authenticated;
grant execute on function public.doctor_inbox() to authenticated;
grant execute on function public.is_doctor() to authenticated;
grant execute on function public.is_doctor_of(uuid) to authenticated;
grant execute on function public.can_access_patient(uuid) to authenticated;
grant execute on function public.can_access_patient_folder(text) to authenticated;
-- The doctor sign-up form checks the code before creating the account.
grant execute on function public.check_doctor_code(text) to anon, authenticated;

-- =====================================================================================================
-- Part 4. Private storage for the original scanned documents
-- =====================================================================================================
-- Files live at medical-files/<patient id>/<file>. The patient and her current doctor can open them.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('medical-files', 'medical-files', false, 10485760,
        array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "medical_files_read" on storage.objects;
drop policy if exists "medical_files_insert_own" on storage.objects;
drop policy if exists "medical_files_delete_own" on storage.objects;

create policy "medical_files_read" on storage.objects
  for select to authenticated
  using (bucket_id = 'medical-files' and public.can_access_patient_folder((storage.foldername(name))[1]));
create policy "medical_files_insert_own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'medical-files'
              and (storage.foldername(name))[1] = auth.uid()::text
              and not public.is_doctor());
create policy "medical_files_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'medical-files' and (storage.foldername(name))[1] = auth.uid()::text);

-- =====================================================================================================
-- Part 5. Live updates and the one-time copy of old vitals sessions
-- =====================================================================================================

-- New messages and link changes are pushed to open apps. (Records are picked up by the apps' refresh.)
do $$
declare
  t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['care_messages', 'care_links'] loop
      if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
      ) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end;
$$;

-- Earlier versions saved device sessions in vital_sessions. Copy them into patient_records once.
do $$
begin
  if to_regclass('public.vital_sessions') is not null then
    insert into public.patient_records (id, patient_id, kind, title, summary, severity, data, is_sample, created_at)
    select v.id, v.user_id, 'vitals', 'Vital signs', left(v.headline, 500),
           case v.status when 'insufficient' then 'info' else v.status end,
           v.analysis,
           coalesce((v.analysis ->> 'demo')::boolean, false),
           v.created_at
    from public.vital_sessions v
    where not exists (select 1 from public.doctor_profiles d where d.id = v.user_id)
    on conflict (id) do nothing;
  end if;
end;
$$;
