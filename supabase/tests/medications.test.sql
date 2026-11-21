-- "My medicines" list and medicine-check records. Runs after care_team.test.sql (reuses its users and helpers).
\set ON_ERROR_STOP 1
\set QUIET 1
\o /dev/null
\set asha  '''a0000000-0000-4000-8000-000000000001'''
\set bina  '''b0000000-0000-4000-8000-000000000002'''
\set mehta '''d0000000-0000-4000-8000-000000000003'''
\set rao   '''d0000000-0000-4000-8000-000000000004'''

\echo '12. My medicines: patient edits, her current doctor reads, nobody else sees them'
set role authenticated;
select test.act_as(:asha);
insert into public.patient_medications (name, dose, frequency, source) values
  ('Thyronorm', '50 mcg', 'OD', 'manual'), ('Orofer XT', null, '1-0-1', 'prescription');
update public.patient_medications set frequency = 'BD' where name = 'Orofer XT';
select test.eq((select frequency from public.patient_medications where name = 'Orofer XT'), 'BD', 'patient can edit');
select test.expect_error($$insert into public.patient_medications (patient_id, name) values ('b0000000-0000-4000-8000-000000000002', 'x')$$, 'row-level security');
select test.expect_error($$insert into public.patient_medications (name) values ('   ')$$, 'check constraint');
insert into public.patient_records (kind, title, severity, data) values ('med_check', 'Medicine check', 'attention', '{"status":"caution"}');
select test.eq((select count(*) from public.patient_records where kind = 'med_check'), 1::bigint, 'medicine check record saved');

-- Asha's current doctor is Rao (from the care-team tests).
select test.act_as(:rao);
select test.eq((select count(*) from public.patient_medications), 2::bigint, 'current doctor reads the list');
update public.patient_medications set name = 'changed';
select test.eq((select count(*) from public.patient_medications where name = 'changed'), 0::bigint, 'doctor cannot edit');
delete from public.patient_medications;
select test.expect_error($$insert into public.patient_medications (patient_id, name) values ('a0000000-0000-4000-8000-000000000001', 'x')$$, 'row-level security');
select test.act_as(:asha);
select test.eq((select count(*) from public.patient_medications), 2::bigint, 'doctor could not delete');

select test.act_as(:mehta);
select test.eq((select count(*) from public.patient_medications), 0::bigint, 'previous doctor sees nothing');
select test.act_as(:bina);
select test.eq((select count(*) from public.patient_medications), 0::bigint, 'other patient sees nothing');
select test.act_as(:asha);
delete from public.patient_medications where name = 'Thyronorm';
select test.eq((select count(*) from public.patient_medications), 1::bigint, 'patient can delete');
reset role;

\echo 'All medicine tests passed.'
