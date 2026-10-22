-- Run once. Gives every application a permanent APP_ID.

alter table public.applications
  add column if not exists app_id text;

update public.applications
set app_id = 'APP-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12))
where app_id is null;

alter table public.applications
  alter column app_id set not null;

create unique index if not exists applications_app_id_key on public.applications (app_id);

create or replace function public.lock_application_app_id()
returns trigger
language plpgsql
as $$
begin
  if new.app_id is distinct from old.app_id then
    raise exception 'APP_ID cannot be changed';
  end if;
  return new;
end;
$$;

drop trigger if exists applications_lock_app_id on public.applications;
create trigger applications_lock_app_id
before update on public.applications
for each row execute function public.lock_application_app_id();
