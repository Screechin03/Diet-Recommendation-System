-- Access-rule tests for schema.sql. Run with supabase/tests/run.sh (local Postgres, no Supabase needed).
-- Each step acts as a real API user: role "authenticated" plus JWT claims, which is how Supabase runs queries.

\set ON_ERROR_STOP 1
\set QUIET 1
\o /dev/null
set client_min_messages = warning;

create schema if not exists test;
grant usage on schema test to anon, authenticated;

-- Act as a signed-in user (or anon with null).
create or replace function test.act_as(p_uid uuid) returns void language plpgsql as $$
begin
  if p_uid is null then
    perform set_config('request.jwt.claims', '{"role":"anon"}', false);
  else
    perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, false);
  end if;
end $$;

-- Run a statement that must fail; the error text must contain p_expect.
create or replace function test.expect_error(p_sql text, p_expect text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if position(lower(p_expect) in lower(sqlerrm)) = 0 then
      raise exception 'Expected error containing "%" but got "%" for: %', p_expect, sqlerrm, p_sql;
    end if;
    return;
  end;
  raise exception 'Expected an error containing "%" but the statement succeeded: %', p_expect, p_sql;
end $$;

create or replace function test.eq(p_actual anyelement, p_expected anyelement, p_label text) returns void language plpgsql as $$
begin
  if p_actual is distinct from p_expected then
    raise exception 'FAIL %: expected %, got %', p_label, p_expected, p_actual;
  end if;
end $$;

grant execute on all functions in schema test to anon, authenticated;

-- Fixed ids so the steps read clearly.
\set asha  '''a0000000-0000-4000-8000-000000000001'''
\set bina  '''b0000000-0000-4000-8000-000000000002'''
\set mehta '''d0000000-0000-4000-8000-000000000003'''
\set rao   '''d0000000-0000-4000-8000-000000000004'''

-- ---------------------------------------------------------------------------------------------------------
\echo '1. Sign-up creates the right profiles; a wrong doctor code is rejected and the code is never stored'
insert into auth.users (id, email, raw_user_meta_data) values
  (:asha, 'asha@example.com', '{"full_name":"Asha Verma"}'),
  (:bina, 'bina@example.com', '{}'),
  (:mehta, 'mehta@example.com', '{"full_name":"Dr. Neha Mehta","account_type":"doctor","doctor_code":"doctor123","specialty":"Obstetrics","hospital":"City Hospital"}'),
  (:rao, 'rao@example.com', '{"full_name":"Arjun Rao","account_type":"doctor","doctor_code":" DOCTOR123 "}');

select test.expect_error(
  $$insert into auth.users (email, raw_user_meta_data) values ('fake@example.com', '{"account_type":"doctor","doctor_code":"guess"}')$$,
  'Invalid doctor access code');
select test.expect_error(
  $$insert into auth.users (email, raw_user_meta_data) values ('fake2@example.com', '{"account_type":"doctor"}')$$,
  'Invalid doctor access code');

select test.eq((select count(*) from public.doctor_profiles), 2::bigint, 'two doctors');
select test.eq((select count(*) from public.patient_profiles where id in (:asha, :bina)), 2::bigint, 'two patients');
select test.eq((select full_name from public.patient_profiles where id = :asha), 'Asha Verma', 'patient name from sign-up');
select test.eq((select full_name from public.patient_profiles where id = :bina), 'bina', 'patient name falls back to email');
select test.eq((select hospital from public.doctor_profiles where id = :mehta), 'City Hospital', 'doctor hospital');
select test.eq((select count(*) from auth.users where raw_user_meta_data ? 'doctor_code'), 0::bigint, 'code stripped from metadata');
select test.eq((select count(*) from public.user_profiles where id in (:asha, :bina, :mehta, :rao)), 4::bigint, 'user_profiles for everyone');

-- ---------------------------------------------------------------------------------------------------------
\echo '2. Anonymous visitors: may check the doctor code, nothing else'
set role anon;
select test.act_as(null);
select test.eq(public.check_doctor_code('  Doctor123 '), true, 'code check is case-insensitive and trimmed');
select test.eq(public.check_doctor_code('nope'), false, 'wrong code');
select test.expect_error($$select public.my_account()$$, 'permission denied');
select test.expect_error($$select public.assign_doctor('d0000000-0000-4000-8000-000000000003', null)$$, 'permission denied');
select test.eq((select count(*) from public.doctor_profiles), 0::bigint, 'anon sees no doctors');
select test.expect_error($$select * from private.settings$$, 'permission denied');
reset role;

-- ---------------------------------------------------------------------------------------------------------
\echo '3. Roles, and attempts to become a doctor or fake a link'
set role authenticated;
select test.act_as(:asha);
select test.eq((public.my_account() ->> 'role'), 'patient', 'Asha is a patient');
select test.eq((select count(*) from public.doctor_profiles), 2::bigint, 'patients can browse the doctor directory');
select test.expect_error(
  $$insert into public.doctor_profiles (id, full_name) values ('a0000000-0000-4000-8000-000000000001', 'Fake')$$,
  'row-level security');
select test.expect_error(
  $$insert into public.care_links (patient_id, doctor_id, patient_name) values ('a0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000003', 'x')$$,
  'row-level security');
update public.doctor_profiles set accepting_patients = false where id = :mehta;   -- silently matches nothing
select test.eq((select accepting_patients from public.doctor_profiles where id = :mehta), true, 'patient cannot edit a doctor');
select test.expect_error($$select * from private.settings$$, 'permission denied');

select test.act_as(:mehta);
select test.eq((public.my_account() ->> 'role'), 'doctor', 'Mehta is a doctor');
select test.eq((public.my_account() -> 'doctor' ->> 'full_name'), 'Dr. Neha Mehta', 'doctor profile returned');
update public.doctor_profiles set accepting_patients = false where id = :rao;
select test.eq((select accepting_patients from public.doctor_profiles where id = :rao), true, 'doctor cannot edit another doctor');
select test.expect_error($$select public.assign_doctor('d0000000-0000-4000-8000-000000000004', null)$$, 'Doctor accounts cannot choose');
select test.expect_error(
  $$insert into public.patient_records (patient_id, kind, title, data) values ('d0000000-0000-4000-8000-000000000003', 'risk', 't', '{}')$$,
  'row-level security');
select test.expect_error(
  $$insert into public.patient_profiles (id) values ('d0000000-0000-4000-8000-000000000003')$$,
  'row-level security');
reset role;

-- ---------------------------------------------------------------------------------------------------------
\echo '4. Patients save records; review fields cannot be forged; urgent real results ask for a review'
set role authenticated;
select test.act_as(:asha);
insert into public.patient_records (kind, title, summary, severity, data, review_status, verdict, reviewed_by, reviewer_name)
values ('report', 'Blood test', '2 tests flagged', 'attention', '{"x":1}', 'reviewed', 'looks_fine', :mehta, 'Forged');
insert into public.patient_records (kind, title, severity, data) values ('vitals', 'Vital signs', 'urgent', '{"demo":false}');
insert into public.patient_records (kind, title, severity, data, is_sample) values ('vitals', 'Sample', 'urgent', '{"demo":true}', true);
insert into public.patient_records (kind, title, severity, data, file_path, file_name)
values ('report', 'Prescription', 'normal', '{}', 'a0000000-0000-4000-8000-000000000001/rx.pdf', 'rx.pdf');

select test.eq((select review_status from public.patient_records where title = 'Blood test'), 'none', 'forged review reset');
select test.eq((select verdict from public.patient_records where title = 'Blood test'), null::text, 'forged verdict cleared');
select test.eq((select reviewer_name from public.patient_records where title = 'Blood test'), null::text, 'forged reviewer cleared');
select test.eq((select review_status from public.patient_records where title = 'Vital signs'), 'requested', 'urgent result auto-requests review');
select test.eq((select review_status from public.patient_records where title = 'Sample'), 'none', 'sample data never auto-requests');

select test.expect_error(
  $$insert into public.patient_records (patient_id, kind, title, data) values ('b0000000-0000-4000-8000-000000000002', 'risk', 'x', '{}')$$,
  'your own account');
select test.expect_error(
  $$insert into public.patient_records (kind, title, data, file_path) values ('report', 'x', '{}', 'b0000000-0000-4000-8000-000000000002/stolen.pdf')$$,
  'own folder');
select test.expect_error($$insert into public.patient_records (kind, title, data) values ('xray', 'x', '{}')$$, 'check constraint');

-- No update policy: a patient cannot mark her own record as reviewed.
update public.patient_records set review_status = 'reviewed', verdict = 'looks_fine' where title = 'Blood test';
select test.eq((select review_status from public.patient_records where title = 'Blood test'), 'none', 'direct update ignored');

select test.act_as(:bina);
select test.eq((select count(*) from public.patient_records), 0::bigint, 'other patients see nothing');
select test.eq((select count(*) from public.patient_profiles), 1::bigint, 'Bina sees only her own profile');
select test.act_as(:mehta);
select test.eq((select count(*) from public.patient_records), 0::bigint, 'a doctor sees nothing before being chosen');
select test.eq((select count(*) from public.patient_profiles), 0::bigint, 'no patient profiles either');
reset role;

-- ---------------------------------------------------------------------------------------------------------
\echo '5. Choosing a doctor connects instantly; only that doctor gains access'
set role authenticated;
select test.act_as(:asha);
select test.expect_error($$select public.send_care_message('a0000000-0000-4000-8000-000000000001', 'hello')$$, 'Choose a doctor first');
select test.expect_error($$select public.request_review((select id from public.patient_records where title = 'Blood test'), null)$$, 'Choose a doctor first');
select (public.assign_doctor(:mehta, 'Second pregnancy, mild anaemia last time')).status;
select test.eq((select count(*) from public.care_links where status = 'active'), 1::bigint, 'one active link');
select test.eq((select (public.assign_doctor(:mehta, null)).doctor_id), :mehta::uuid, 'choosing the same doctor again is a no-op');
select test.eq((select count(*) from public.care_links), 1::bigint, 'still one link');

select test.act_as(:mehta);
select test.eq((select count(*) from public.patient_records), 4::bigint, 'doctor sees all of Asha''s records');
select test.eq((select full_name from public.patient_profiles where id = :asha), 'Asha Verma', 'doctor sees Asha''s profile');
select test.eq((select count(*) from public.doctor_patients()), 1::bigint, 'one patient');
select test.eq((select is_new from public.doctor_patients()), true, 'patient is new');
select test.eq((select pending_reviews from public.doctor_patients()), 1::bigint, 'one pending review (urgent vitals)');
select test.eq((select urgent_pending from public.doctor_patients()), 1::bigint, 'one urgent');
select test.eq((select records_count from public.doctor_patients()), 4::bigint, 'record count');
select test.eq((select string_agg(item_type, ',' order by priority) from public.doctor_inbox()), 'urgent,new_patient', 'inbox items in priority order');
select test.eq((select preview from public.doctor_inbox() where item_type = 'new_patient'), 'Second pregnancy, mild anaemia last time', 'new patient note');

select test.act_as(:rao);
select test.eq((select count(*) from public.patient_records), 0::bigint, 'other doctor sees nothing');
select test.eq((select count(*) from public.doctor_patients()), 0::bigint, 'other doctor has no patients');
select public.mark_patient_seen((select id from public.care_links limit 1));  -- Rao cannot even see the link id
select test.eq((select count(*) from public.care_links), 0::bigint, 'other doctor cannot see the link');

select test.act_as(:mehta);
select public.mark_patient_seen((select id from public.care_links where status = 'active'));
select test.eq((select is_new from public.doctor_patients()), false, 'patient seen');
reset role;

-- ---------------------------------------------------------------------------------------------------------
\echo '6. Reviews and messages'
set role authenticated;
select test.act_as(:mehta);
select public.send_care_message(:asha, '', (select id from public.patient_records where title = 'Vital signs'), 'see_me');
select test.eq((select review_status from public.patient_records where title = 'Vital signs'), 'reviewed', 'verdict marks record reviewed');
select test.eq((select verdict from public.patient_records where title = 'Vital signs'), 'see_me', 'verdict stored');
select test.eq((select reviewer_name from public.patient_records where title = 'Vital signs'), 'Dr. Neha Mehta', 'reviewer name');
select test.eq((select body from public.care_messages where verdict = 'see_me'), 'Reviewed: please book a visit so I can see you.', 'empty review gets a sentence');
select test.expect_error($$select public.send_care_message('a0000000-0000-4000-8000-000000000001', 'x', null, 'looks_fine')$$, 'must be about a record');
select test.expect_error($$select public.send_care_message('a0000000-0000-4000-8000-000000000001', 'x', null, 'great')$$, 'Unknown review result');
select test.expect_error($$select public.send_care_message('a0000000-0000-4000-8000-000000000001', '   ')$$, 'empty');
select test.expect_error(format('select public.send_care_message(%L, %L)', 'a0000000-0000-4000-8000-000000000001', repeat('x', 4001)), 'too long');
select test.expect_error($$select public.send_care_message('a0000000-0000-4000-8000-000000000001', 'x', 'b0000000-0000-4000-8000-000000000999')$$, 'Record not found');
select test.expect_error($$select public.request_review((select id from public.patient_records limit 1), 'x')$$, 'Record not found');
select test.eq((select count(*) from public.doctor_inbox() where item_type in ('urgent', 'review')), 0::bigint, 'reviewed item leaves the inbox');

select test.act_as(:rao);
select test.expect_error($$select public.send_care_message('a0000000-0000-4000-8000-000000000001', 'hi')$$, 'do not have access');
select test.expect_error($$select public.mark_thread_read('a0000000-0000-4000-8000-000000000001', null)$$, 'do not have access');
select test.act_as(:bina);
select test.expect_error($$select public.send_care_message('a0000000-0000-4000-8000-000000000001', 'hi')$$, 'do not have access');
select test.eq((select count(*) from public.care_messages), 0::bigint, 'Bina sees no messages');

select test.act_as(:asha);
select test.eq((select count(*) from public.care_messages where author_role = 'doctor' and read_at is null), 1::bigint, 'Asha has one unread review');
select test.expect_error($$select public.send_care_message('a0000000-0000-4000-8000-000000000001', 'x', (select id from public.patient_records where title = 'Blood test'), 'looks_fine')$$, 'Only doctors');
select public.request_review((select id from public.patient_records where title = 'Blood test'), 'Is my haemoglobin OK?');
select test.eq((select review_status from public.patient_records where title = 'Blood test'), 'requested', 'review requested');
select public.send_care_message(:asha, 'Booked for Monday', (select id from public.patient_records where title = 'Vital signs'));
select test.eq((select count(*) from public.care_messages where author_role = 'doctor' and read_at is null), 0::bigint, 'replying marks the doctor''s message read');
select public.send_care_message(:asha, 'Can I keep doing yoga?');

select test.act_as(:mehta);
select test.eq((select string_agg(item_type, ',' order by priority, at desc) from public.doctor_inbox()), 'review,message,message', 'inbox: review + two message threads');
select test.eq((select preview from public.doctor_inbox() where item_type = 'review'), 'Is my haemoglobin OK?', 'review shows the patient''s question');
select test.eq((select unread_messages from public.doctor_patients()), 3::bigint, 'three unread patient messages');
select test.eq(public.mark_thread_read(:asha, null), 1, 'general thread marked read');
select test.eq((select unread_messages from public.doctor_patients()), 2::bigint, 'two left');
reset role;

-- ---------------------------------------------------------------------------------------------------------
\echo '7. Diet instructions'
set role authenticated;
select test.act_as(:mehta);
select public.set_diet_instructions(:asha, array[' Papaya', 'papaya', 'RAW sprouts', '', null], array['Spinach', 'dates'],
                                    array['vegetarian', 'keto', 'Dairy-Free'], '  Iron-rich foods daily.  ');
select test.eq((select avoid from public.diet_instructions), array['papaya', 'raw sprouts'], 'avoid list cleaned');
select test.eq((select restrictions from public.diet_instructions), array['vegetarian', 'dairy-free'], 'only known restrictions kept');
select test.eq((select note from public.diet_instructions), 'Iron-rich foods daily.', 'note trimmed');
select test.eq((select updated_by_name from public.diet_instructions), 'Dr. Neha Mehta', 'author');
select test.act_as(:asha);
select test.eq((select include from public.diet_instructions), array['spinach', 'dates'], 'patient reads her instructions');
select test.expect_error($$select public.set_diet_instructions('a0000000-0000-4000-8000-000000000001', '{}', '{}', '{}', null)$$, 'do not have access');
select test.act_as(:rao);
select test.expect_error($$select public.set_diet_instructions('a0000000-0000-4000-8000-000000000001', '{}', '{}', '{}', null)$$, 'do not have access');
select test.eq((select count(*) from public.diet_instructions), 0::bigint, 'other doctor cannot read them');
reset role;

-- ---------------------------------------------------------------------------------------------------------
\echo '8. Storage: patient folder, current doctor only'
insert into storage.buckets (id, name) values ('other-bucket', 'other-bucket') on conflict do nothing;
set role authenticated;
select test.act_as(:asha);
insert into storage.objects (bucket_id, name) values ('medical-files', 'a0000000-0000-4000-8000-000000000001/rx.pdf');
select test.expect_error($$insert into storage.objects (bucket_id, name) values ('medical-files', 'b0000000-0000-4000-8000-000000000002/x.pdf')$$, 'row-level security');
select test.expect_error($$insert into storage.objects (bucket_id, name) values ('medical-files', 'loose.pdf')$$, 'row-level security');
select test.act_as(:bina);
select test.eq((select count(*) from storage.objects), 0::bigint, 'other patient cannot see the file');
select test.act_as(:mehta);
select test.eq((select count(*) from storage.objects), 1::bigint, 'current doctor can open the file');
select test.expect_error($$insert into storage.objects (bucket_id, name) values ('medical-files', 'a0000000-0000-4000-8000-000000000001/doctor.pdf')$$, 'row-level security');
delete from storage.objects;
select test.act_as(:asha);
select test.eq((select count(*) from storage.objects), 1::bigint, 'doctor cannot delete the patient''s file');
reset role;

-- ---------------------------------------------------------------------------------------------------------
\echo '9. Switching doctors: old doctor loses access at once, new doctor sees the full history'
set role authenticated;
select test.act_as(:asha);
select public.assign_doctor(:rao, null);
select test.eq((select count(*) from public.care_links where status = 'active'), 1::bigint, 'still exactly one active link');
select test.eq((select ended_by from public.care_links where doctor_id = :mehta), 'patient', 'old link ended by patient');
select test.eq((select end_reason from public.care_links where doctor_id = :mehta), 'Switched to another doctor', 'reason');

select test.act_as(:mehta);
select test.eq((select count(*) from public.patient_records), 0::bigint, 'old doctor: no records');
select test.eq((select count(*) from public.care_messages), 0::bigint, 'old doctor: no messages');
select test.eq((select count(*) from public.patient_profiles), 0::bigint, 'old doctor: no profile');
select test.eq((select count(*) from public.diet_instructions), 0::bigint, 'old doctor: no diet instructions');
select test.eq((select count(*) from storage.objects), 0::bigint, 'old doctor: no files');
select test.eq((select count(*) from public.doctor_inbox()), 0::bigint, 'old doctor: empty inbox');
select test.eq((select status || ':' || patient_name from public.doctor_patients()), 'ended:Asha Verma', 'old doctor: listed as past patient');
select test.eq((select records_count from public.doctor_patients()), 0::bigint, 'past patient: no counts');
select test.expect_error($$select public.send_care_message('a0000000-0000-4000-8000-000000000001', 'still here?')$$, 'do not have access');
select test.expect_error($$select public.set_diet_instructions('a0000000-0000-4000-8000-000000000001', '{}', '{}', '{}', null)$$, 'do not have access');

select test.act_as(:rao);
select test.eq((select count(*) from public.patient_records), 4::bigint, 'new doctor: all records');
select test.eq((select count(*) from public.care_messages where author_name = 'Dr. Neha Mehta'), 1::bigint, 'new doctor: previous doctor''s review');
select test.eq((select note from public.diet_instructions), 'Iron-rich foods daily.', 'new doctor: diet instructions');
select test.eq((select review_status from public.patient_records where title = 'Blood test'), 'requested', 'pending request carried over');
select test.eq((select count(*) from public.doctor_inbox() where item_type = 'review'), 1::bigint, 'and is in the new doctor''s inbox');
select test.eq((select count(*) from storage.objects), 1::bigint, 'new doctor: files');
reset role;

-- A second active link is impossible even for the database owner.
select test.expect_error(
  format('insert into public.care_links (patient_id, doctor_id, patient_name) values (%L, %L, %L)', :asha, :mehta, 'x'),
  'care_links_one_active_per_patient');

-- ---------------------------------------------------------------------------------------------------------
\echo '10. Ending care, not-accepting doctors, deleting records'
set role authenticated;
select test.act_as(:rao);
select test.expect_error($$select public.end_care('00000000-0000-4000-8000-000000000000', null)$$, 'Care link not found');
select (public.end_care((select id from public.care_links where status = 'active'), 'Moving city')).ended_by;
select test.eq((select count(*) from public.patient_records), 0::bigint, 'ended by doctor: access gone');

select test.act_as(:asha);
select test.eq((select ended_by || ':' || end_reason from public.care_links where doctor_id = :rao), 'doctor:Moving city', 'patient sees why');
select test.expect_error($$select public.send_care_message('a0000000-0000-4000-8000-000000000001', 'hello?')$$, 'Choose a doctor first');

select test.act_as(:mehta);
update public.doctor_profiles set accepting_patients = false where id = :mehta;
select test.act_as(:bina);
select test.expect_error($$select public.assign_doctor('d0000000-0000-4000-8000-000000000003', null)$$, 'not accepting');
select test.expect_error($$select public.end_care((select id from public.care_links limit 1), null)$$, 'Care link not found');

select test.act_as(:asha);
select public.assign_doctor(:rao, null);
select test.act_as(:rao);
delete from public.patient_records;
select test.eq((select count(*) from public.patient_records), 4::bigint, 'doctor cannot delete records');
select test.act_as(:asha);
delete from public.patient_records where title = 'Vital signs';
select test.eq((select count(*) from public.care_messages where record_id is not null and body = 'Booked for Monday'), 0::bigint, 'record comments deleted with the record');
select test.eq((select count(*) from public.patient_records), 3::bigint, 'patient deleted her record');
reset role;

-- ---------------------------------------------------------------------------------------------------------
\echo '11. Old vitals sessions were copied once, with their original dates'
select test.eq((select count(*) from public.patient_records where id = 'e0000000-0000-4000-8000-000000000001'), 1::bigint, 'legacy session copied');
select test.eq((select created_at from public.patient_records where id = 'e0000000-0000-4000-8000-000000000001'),
               '2026-10-01 09:00:00+00'::timestamptz, 'original date kept');
select test.eq((select severity from public.patient_records where id = 'e0000000-0000-4000-8000-000000000001'), 'info', 'insufficient -> info');

select test.eq((select string_agg(tablename, ',' order by tablename) from pg_publication_tables where pubname = 'supabase_realtime'),
               'care_links,care_messages', 'live updates for messages and links');

\echo 'All care-team tests passed.'
