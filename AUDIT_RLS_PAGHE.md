# AUDIT RLS — tabelle `tm_paghe_*`

Progetto Supabase: `wgidgbauhivdctdxfjnk`
Data tentativo audit: 2026-09-14
Esito: **NON VERIFICATO — accesso mancante.** Vedi "Blocco" sotto.

## Blocco

L'audit non è stato eseguito. Manca il canale di accesso necessario:

1. Il repo `CarpenteriaTicinese-cantiere` contiene solo `index.html` e
   `manifest.json`. Nessuna migrazione SQL, nessun dump di schema, nessun
   file di policy versionato. Non esiste quindi una fonte di verità in
   repository da cui leggere le RLS.
2. L'unica credenziale presente nel front-end è la chiave pubblica (anon).
   Con la chiave anon, via PostgREST, **non è tecnicamente possibile**
   leggere `pg_policies` / `pg_catalog`: PostgREST espone solo gli schemi
   applicativi, non il catalogo di sistema.
3. In questa sessione non è configurato né un MCP Supabase né una
   connection string Postgres (service_role / password DB). Nessun canale
   di lettura sul catalogo.

Conclusione: **allo stato attuale non posso dire se le policy su
`tm_paghe_*` siano permissive o ristrette.** Qualsiasi affermazione in un
senso o nell'altro sarebbe un'ipotesi, e su una tabella di paghe
un'ipotesi non è accettabile.

## Come sbloccare (una delle tre, in ordine di preferenza)

**A) Query manuale — 2 minuti, nessuna credenziale condivisa (consigliata)**
Supabase Dashboard → SQL Editor → incolla ed esegui:

```sql
select
  c.relname                        as tabella,
  p.polname                        as policy,
  case p.polcmd
    when 'r' then 'SELECT' when 'a' then 'INSERT'
    when 'w' then 'UPDATE' when 'd' then 'DELETE'
    else 'ALL' end                 as comando,
  p.polpermissive                  as permissive,
  coalesce(
    (select string_agg(r.rolname, ', ')
       from pg_roles r where r.oid = any(p.polroles)),
    'PUBLIC')                      as ruoli,
  pg_get_expr(p.polqual,      p.polrelid) as using_expr,
  pg_get_expr(p.polwithcheck, p.polrelid) as with_check_expr
from pg_policy p
join pg_class c on c.oid = p.polrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname like 'tm\_paghe\_%'
order by c.relname, p.polname;
```

E, separatamente, verifica che RLS sia proprio attiva (una tabella senza
policy ma con RLS disattivata è aperta a tutti gli utenti autenticati):

```sql
select c.relname, c.relrowsecurity as rls_attiva, c.relforcerowsecurity
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname like 'tm\_%'
order by c.relrowsecurity, c.relname;
```

Incolla qui sotto l'output e completo l'audit.

**B)** Fornire una connection string Postgres in sola lettura (utente
dedicato con solo `SELECT` sul catalogo). Non serve service_role.

**C)** Configurare l'MCP Supabase in modalità read-only per questa sessione.

## Cosa cerco nell'output (criterio di giudizio)

| Esito | Significato |
|---|---|
| `relrowsecurity = false` su una `tm_paghe_*` | **Grave.** RLS spenta: chiunque abbia la chiave anon e un account autenticato legge le paghe di tutte le aziende. |
| Policy con `USING (true)` o ruolo `authenticated` senza filtro | **Grave.** Isolamento multi-tenant assente. |
| `USING (azienda_id = tm_get_azienda_id())` su tutti e 4 i comandi | Conforme allo standard già applicato a `tm_conta_*`. |
| Policy solo su SELECT, mancante su INSERT/UPDATE/DELETE | **Da correggere.** Lettura protetta ma scrittura no. |

## Stato

FASE 0 **non chiusa**. FASE 1 (rubrica `tm_contatti` nel preventivatore)
resta ferma: nessuno schema letto, nessun file proposto, nessun codice
scritto, nessuna tabella toccata.
