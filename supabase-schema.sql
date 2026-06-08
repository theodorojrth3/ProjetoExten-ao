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

create or replace function public.adjust_product_stock(
  p_product_id uuid,
  p_type text,
  p_qty integer,
  p_notes text default ''
)
returns table (
  product_id uuid,
  product_name text,
  movement_type text,
  moved_qty integer,
  old_qty integer,
  new_qty integer,
  movement_id uuid,
  movement_created_at timestamptz
)
language plpgsql
as $$
declare
  v_product public.products%rowtype;
  v_new_qty integer;
  v_movement public.movements%rowtype;
begin
  if p_type not in ('entry', 'exit') then
    raise exception 'Invalid movement type: %', p_type;
  end if;

  if p_qty is null or p_qty <= 0 then
    raise exception 'Quantity must be greater than zero';
  end if;

  select *
  into v_product
  from public.products
  where id = p_product_id
  for update;

  if not found then
    raise exception 'Product not found';
  end if;

  if p_type = 'entry' then
    v_new_qty := v_product.qty + p_qty;
  else
    v_new_qty := v_product.qty - p_qty;
  end if;

  if v_new_qty < 0 then
    raise exception 'Insufficient stock';
  end if;

  update public.products
  set
    qty = v_new_qty,
    last_update = timezone('utc', now())
  where id = v_product.id
  returning * into v_product;

  insert into public.movements (
    product_id,
    product_name,
    type,
    qty,
    old_qty,
    new_qty,
    notes
  )
  values (
    v_product.id,
    v_product.name,
    p_type,
    p_qty,
    v_product.qty - case when p_type = 'entry' then p_qty else -p_qty end,
    v_product.qty,
    coalesce(p_notes, '')
  )
  returning * into v_movement;

  return query
  select
    v_product.id,
    v_product.name,
    v_movement.type,
    v_movement.qty,
    v_movement.old_qty,
    v_movement.new_qty,
    v_movement.id,
    v_movement.created_at;
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

create or replace view public.dashboard_summary as
select
  count(*)::integer as total_products,
  coalesce(sum(qty), 0)::integer as total_qty,
  coalesce(sum(qty * price), 0)::numeric(14, 2) as total_value,
  count(*) filter (where qty <= min_stock)::integer as low_stock_products,
  count(*) filter (where qty = 0)::integer as out_of_stock_products,
  count(distinct supplier_id)::integer as linked_suppliers,
  max(last_update) as last_stock_update
from public.products;

create or replace view public.inventory_by_category as
select
  coalesce(category, 'Sem categoria') as category,
  count(*)::integer as products_count,
  coalesce(sum(qty), 0)::integer as total_qty,
  coalesce(sum(qty * price), 0)::numeric(14, 2) as total_value
from public.products
group by coalesce(category, 'Sem categoria')
order by total_value desc, category asc;

create or replace view public.stock_alerts as
select
  p.id,
  p.name,
  p.sku,
  p.category,
  p.qty,
  p.min_stock,
  p.last_update,
  case
    when p.qty = 0 then 'out_of_stock'
    when p.qty <= p.min_stock then 'low_stock'
    else 'ok'
  end as alert_type,
  s.name as supplier_name
from public.products p
left join public.suppliers s on s.id = p.supplier_id
where p.qty <= p.min_stock
order by p.qty asc, p.name asc;

create or replace view public.recent_movements_view as
select
  m.id,
  m.product_id,
  m.product_name,
  m.type,
  m.qty,
  m.old_qty,
  m.new_qty,
  m.notes,
  m.created_at,
  p.category,
  p.supplier_id
from public.movements m
left join public.products p on p.id = m.product_id
order by m.created_at desc;

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
