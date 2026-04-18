# Supabase Setup for Auth, Saved Recipes, and History

## 1) Environment variables
In your Next.js frontend `.env` file, set:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Example:

NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

## 2) Create tables in Supabase SQL editor
Run this SQL:

create extension if not exists pgcrypto;

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

create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_profiles (id, email, full_name)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', null)
  )
  on conflict (id) do update
    set email = excluded.email,
        full_name = excluded.full_name,
        updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;

create trigger on_auth_user_created_profile
  after insert on auth.users
  for each row execute procedure public.handle_new_user_profile();

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

create policy "saved_recipes_select_own"
  on public.saved_recipes
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "saved_recipes_insert_own"
  on public.saved_recipes
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "saved_recipes_delete_own"
  on public.saved_recipes
  for delete
  to authenticated
  using (auth.uid() = user_id);

create policy "recipe_history_select_own"
  on public.recipe_history
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "recipe_history_insert_own"
  on public.recipe_history
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "user_profiles_select_own"
  on public.user_profiles
  for select
  to authenticated
  using (auth.uid() = id);

create policy "user_profiles_insert_own"
  on public.user_profiles
  for insert
  to authenticated
  with check (auth.uid() = id);

create policy "user_profiles_update_own"
  on public.user_profiles
  for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

## 3) Supabase Auth settings
Use Email/Password auth in Supabase Authentication settings.

If email confirmation is enabled:
- Sign-up will show a success message asking the user to confirm email.

If email confirmation is disabled:
- User is signed in immediately after sign-up.

## 4) App behavior after setup
- Users can sign up on `/signup` and log in on `/login`.
- Signup data (email + full name) is stored in `user_profiles`.
- Logged-in users can click Save recipe on planner/finder result cards.
- Saved recipes are visible on `/saved-recipes`.
- Recommendation history is logged automatically on `/diet-planner` and `/recipe-finder` and visible on `/history`.
