# Supabase Setup for Auth, Saved Recipes, and History

## 1) Environment variables
In your Next.js frontend `.env` file, set:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Example:

NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

## 2) Create the database (one file)
In the Supabase SQL editor, paste and run **`supabase/schema.sql`** (repo root). It creates everything the
website and the phone app need, and it is safe to run again after every update:

- accounts, saved recipes and recipe history;
- doctor accounts and patient profiles;
- the care team: patient ↔ doctor links, shared health records (reports, vitals, risk checks, diet plans),
  reviews, messages and diet instructions, all protected by row-level security;
- private storage for scanned documents (bucket `medical-files`);
- live updates for messages, and a one-time copy of any old `vital_sessions` rows.

**Doctor access code:** doctors need a code to sign up (default `doctor123`). To change it, run:

    update private.settings set value = 'new-code' where key = 'doctor_access_code';

To check the database rules on your own computer (needs Postgres 16): `supabase/tests/run.sh`.

## 3) Supabase Auth settings
Use Email/Password auth in Supabase Authentication settings.

For the doctor and patient flow, turning **Confirm email off** is simplest (people are signed in straight away).

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

## 5) Doctors and patients
- Patients sign up on `/signup`; doctors on `/doctor/signup` (with the access code) and log in on `/doctor/login`.
- In the app, doctors use "Are you a doctor? Doctor login" on the My care tab.
- A patient chooses a doctor under **My care → Find a doctor**. The doctor then sees every record she saves,
  can review it, message her and set diet instructions. Switching doctors removes the old doctor's access at once.
