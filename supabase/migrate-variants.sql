-- Safe to run again. Price column may already exist.
-- Drop the old duration check before rewriting units to lifetime/hours/days.

alter table public.application_variants
  add column if not exists price numeric(10, 2) not null default 0;

alter table public.application_variants
  drop constraint if exists application_variants_duration_unit_check;

update public.application_variants
set duration_unit = 'lifetime'
where duration_unit = 'unlimited';

update public.application_variants
set duration_unit = 'hours'
where duration_unit = 'minutes';

update public.application_variants
set duration_unit = 'days'
where duration_unit = 'weeks';

alter table public.application_variants
  add constraint application_variants_duration_unit_check
  check (duration_unit in ('hours', 'days', 'months', 'years', 'lifetime'));
