-- Safe to run again. Per-reseller discount, in percent off the variant price.
alter table public.resellers
  add column if not exists discount_percent numeric(5, 2) not null default 0
  check (discount_percent >= 0 and discount_percent <= 100);
