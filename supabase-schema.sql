create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  cnpj text unique,
  phone text,
  email text,
  address text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sku text unique,
  category text,
  qty integer not null default 0 check (qty >= 0),
  price numeric(12, 2) not null default 0 check (price >= 0),
  min_stock integer not null default 10 check (min_stock >= 0),
  supplier_id uuid references public.suppliers(id) on delete set null,
  last_update timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  product_name text not null,
  type text not null check (type in ('entry', 'exit')),
  qty integer not null check (qty > 0),
  old_qty integer not null check (old_qty >= 0),
  new_qty integer not null check (new_qty >= 0),
  notes text not null default '',
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.app_config (
  id integer primary key default 1 check (id = 1),
  theme text not null default 'light' check (theme in ('light', 'dark')),
  currency text not null default 'BRL',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

insert into public.app_config (id, theme, currency)
values (1, 'light', 'BRL')
on conflict (id) do nothing;

create index if not exists products_name_idx on public.products(name);
create index if not exists products_category_idx on public.products(category);
create index if not exists products_supplier_id_idx on public.products(supplier_id);
create index if not exists movements_product_id_idx on public.movements(product_id);
create index if not exists movements_created_at_idx on public.movements(created_at desc);

drop trigger if exists suppliers_set_updated_at on public.suppliers;
create trigger suppliers_set_updated_at
before update on public.suppliers
for each row
execute function public.set_updated_at();

drop trigger if exists products_set_updated_at on public.products;
create trigger products_set_updated_at
before update on public.products
for each row
execute function public.set_updated_at();

drop trigger if exists app_config_set_updated_at on public.app_config;
create trigger app_config_set_updated_at
before update on public.app_config
for each row
execute function public.set_updated_at();

alter table public.suppliers enable row level security;
alter table public.products enable row level security;
alter table public.movements enable row level security;
alter table public.app_config enable row level security;

drop policy if exists "public access suppliers" on public.suppliers;
create policy "public access suppliers"
on public.suppliers
for all
using (true)
with check (true);

drop policy if exists "public access products" on public.products;
create policy "public access products"
on public.products
for all
using (true)
with check (true);

drop policy if exists "public access movements" on public.movements;
create policy "public access movements"
on public.movements
for all
using (true)
with check (true);

drop policy if exists "public access app_config" on public.app_config;
create policy "public access app_config"
on public.app_config
for all
using (true)
with check (true);
