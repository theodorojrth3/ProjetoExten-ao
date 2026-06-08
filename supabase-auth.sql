do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'app_role'
      and typnamespace = 'public'::regnamespace
  ) then
    create type public.app_role as enum ('admin', 'manager', 'operator', 'viewer');
  end if;
end
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  full_name text,
  role public.app_role not null default 'operator',
  is_active boolean not null default true,
  invited_by uuid references auth.users(id) on delete set null,
  invited_at timestamptz not null default timezone('utc', now()),
  accepted_at timestamptz,
  last_login_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (
    id,
    email,
    full_name,
    role,
    is_active,
    invited_at
  )
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(coalesce(new.email, ''), '@', 1)),
    'operator',
    true,
    timezone('utc', now())
  )
  on conflict (id) do update
    set email = excluded.email;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_auth_user();

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row
execute function public.set_updated_at();

grant select, insert, update on public.profiles to authenticated;
grant select, insert, update, delete on public.profiles to service_role;

alter table public.profiles enable row level security;

drop policy if exists "profiles self select" on public.profiles;
create policy "profiles self select"
on public.profiles
for select
to authenticated
using ((select auth.uid()) = id);

drop policy if exists "profiles self insert" on public.profiles;
create policy "profiles self insert"
on public.profiles
for insert
to authenticated
with check ((select auth.uid()) = id);

drop policy if exists "profiles self update" on public.profiles;
create policy "profiles self update"
on public.profiles
for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

drop policy if exists "public access suppliers" on public.suppliers;
drop policy if exists "public access products" on public.products;
drop policy if exists "public access movements" on public.movements;
drop policy if exists "public access app_config" on public.app_config;

grant select on public.suppliers to authenticated;
grant select, insert, update, delete on public.suppliers to authenticated;
grant select on public.products to authenticated;
grant select, insert, update, delete on public.products to authenticated;
grant select on public.movements to authenticated;
grant select, insert, update, delete on public.movements to authenticated;
grant select, insert, update on public.app_config to authenticated;

drop policy if exists "authenticated active users can read suppliers" on public.suppliers;
create policy "authenticated active users can read suppliers"
on public.suppliers
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and is_active = true
  )
);

drop policy if exists "authenticated active users can manage suppliers" on public.suppliers;
create policy "authenticated active users can manage suppliers"
on public.suppliers
for all
to authenticated
using (
  exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and is_active = true
      and role in ('admin', 'manager', 'operator')
  )
)
with check (
  exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and is_active = true
      and role in ('admin', 'manager', 'operator')
  )
);

drop policy if exists "authenticated active users can read products" on public.products;
create policy "authenticated active users can read products"
on public.products
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and is_active = true
  )
);

drop policy if exists "authenticated active users can manage products" on public.products;
create policy "authenticated active users can manage products"
on public.products
for all
to authenticated
using (
  exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and is_active = true
      and role in ('admin', 'manager', 'operator')
  )
)
with check (
  exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and is_active = true
      and role in ('admin', 'manager', 'operator')
  )
);

drop policy if exists "authenticated active users can read movements" on public.movements;
create policy "authenticated active users can read movements"
on public.movements
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and is_active = true
  )
);

drop policy if exists "authenticated active users can manage movements" on public.movements;
create policy "authenticated active users can manage movements"
on public.movements
for all
to authenticated
using (
  exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and is_active = true
      and role in ('admin', 'manager', 'operator')
  )
)
with check (
  exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and is_active = true
      and role in ('admin', 'manager', 'operator')
  )
);

drop policy if exists "authenticated active users can read config" on public.app_config;
create policy "authenticated active users can read config"
on public.app_config
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and is_active = true
  )
);

drop policy if exists "authenticated active users can update config" on public.app_config;
create policy "authenticated active users can update config"
on public.app_config
for all
to authenticated
using (
  exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and is_active = true
      and role in ('admin', 'manager', 'operator')
  )
)
with check (
  exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and is_active = true
      and role in ('admin', 'manager', 'operator')
  )
);
