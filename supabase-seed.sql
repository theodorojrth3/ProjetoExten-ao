insert into public.suppliers (name, cnpj, phone, email, address)
values
  ('Distribuidora Central', '12.345.678/0001-90', '(11) 4002-1000', 'contato@central.com', 'Sao Paulo - SP'),
  ('Atacado Horizonte', '98.765.432/0001-10', '(21) 3555-9000', 'vendas@horizonte.com', 'Rio de Janeiro - RJ'),
  ('Nordeste Alimentos', '45.111.222/0001-44', '(81) 3123-4567', 'suporte@nordestealimentos.com', 'Recife - PE')
on conflict (cnpj) do nothing;

with supplier_refs as (
  select id, name
  from public.suppliers
),
product_seed as (
  select
    'Arroz Tipo 1'::text as name,
    'ARZ-001'::text as sku,
    'Graos'::text as category,
    140::integer as qty,
    28.90::numeric(12, 2) as price,
    25::integer as min_stock,
    'Distribuidora Central'::text as supplier_name
  union all
  select 'Feijao Carioca', 'FEJ-002', 'Graos', 62, 9.80, 20, 'Distribuidora Central'
  union all
  select 'Cafe Torrado', 'CAF-003', 'Bebidas', 34, 18.50, 18, 'Atacado Horizonte'
  union all
  select 'Acucar Refinado', 'ACU-004', 'Mercearia', 17, 5.40, 20, 'Nordeste Alimentos'
  union all
  select 'Macarrao Espaguete', 'MAC-005', 'Massas', 0, 6.20, 12, 'Atacado Horizonte'
)
insert into public.products (name, sku, category, qty, price, min_stock, supplier_id, last_update)
select
  p.name,
  p.sku,
  p.category,
  p.qty,
  p.price,
  p.min_stock,
  s.id,
  timezone('utc', now())
from product_seed p
left join supplier_refs s on s.name = p.supplier_name
on conflict (sku) do nothing;

insert into public.movements (product_id, product_name, type, qty, old_qty, new_qty, notes, created_at)
select
  id,
  name,
  'entry',
  qty,
  0,
  qty,
  'Carga inicial de demonstracao',
  timezone('utc', now()) - interval '2 day'
from public.products
where sku in ('ARZ-001', 'FEJ-002', 'CAF-003', 'ACU-004', 'MAC-005')
and not exists (
  select 1
  from public.movements m
  where m.product_id = public.products.id
    and m.notes = 'Carga inicial de demonstracao'
);
