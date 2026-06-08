# dismar_stock

Front-end de controle de estoque integrado com Supabase.

## Estrutura do banco

O arquivo [supabase-schema.sql](c:\Users\carlo\Desktop\x15\dismar_stock-main\dismar_stock-main\supabase-schema.sql) cria:

- `suppliers`
- `products`
- `movements`
- `app_config`

Tambem cria objetos de apoio para dashboard e operacao:

- `dashboard_summary`
- `inventory_by_category`
- `stock_alerts`
- `recent_movements_view`
- `adjust_product_stock(...)`

Ele tambem adiciona:

- indices para busca e listagem
- triggers de `updated_at`
- politicas RLS abertas para este front publico

## Como conectar

1. Crie um projeto no Supabase.
2. Abra o `SQL Editor` e execute o arquivo [supabase-schema.sql](c:\Users\carlo\Desktop\x15\dismar_stock-main\dismar_stock-main\supabase-schema.sql).
3. Se quiser dados de teste para o dashboard, execute tambem [supabase-seed.sql](c:\Users\carlo\Desktop\x15\dismar_stock-main\dismar_stock-main\supabase-seed.sql).
4. Copie a `Project URL` e a `anon public key` em `Settings > API`.
5. Preencha [supabase-config.js](c:\Users\carlo\Desktop\x15\dismar_stock-main\dismar_stock-main\supabase-config.js):

```js
window.SUPABASE_CONFIG = {
  url: 'https://SEU-PROJETO.supabase.co',
  anonKey: 'SUA_ANON_KEY'
};
```

6. Abra o `index.html` normalmente no navegador.

## Cobertura do banco

O Supabase agora sustenta:

- dashboard com metricas gerais de estoque
- relatorio por categoria
- alertas de estoque baixo e ruptura
- historico de movimentacoes
- configuracao geral do app
- ajuste de estoque com transacao no banco para evitar inconsistencias

## Observacao

As politicas atuais permitem acesso publico total porque este front ainda nao tem autenticacao. Se quisermos colocar login depois, o proximo passo natural e fechar essas policies por usuario ou perfil.

## Deploy

Este projeto pode ser publicado como site estatico no Netlify.

Arquivos usados no deploy:

- [netlify.toml](c:\Users\carlo\Desktop\x15\dismar_stock-main\dismar_stock-main\netlify.toml)
- [index.html](c:\Users\carlo\Desktop\x15\dismar_stock-main\dismar_stock-main\index.html)
- [script.js](c:\Users\carlo\Desktop\x15\dismar_stock-main\dismar_stock-main\script.js)
- [style.css](c:\Users\carlo\Desktop\x15\dismar_stock-main\dismar_stock-main\style.css)

Fluxo recomendado:

1. Subir este repositorio para GitHub.
2. Conectar o repositorio ao Netlify.
3. Publicar o site como projeto estatico.
4. Depois preencher o `supabase-config.js` e ativar o banco.
