-- ═══════════════════════════════════════════════════════════════════════════
-- FIX RLS tm_paghe_* — solo il titolare legge e scrive le paghe
--
-- Data:        15 settembre 2026
-- Progetto:    wgidgbauhivdctdxfjnk
-- Riferimento: AUDIT_IDENTITA_TITOLARE.md (Fase 0.5, 14 settembre 2026)
--
-- MOTIVO
--   Le sette tabelle tm_paghe_* hanno oggi una sola policy, `p_all`, comando
--   ALL, ruolo authenticated, USING (true) WITH CHECK (true): qualunque utente
--   che abbia fatto login legge, scrive e cancella gli stipendi di tutti.
--   Confermato il 14 settembre: invariato dal 2 settembre.
--
-- COSA FA
--   1. Crea la funzione public.app_e_titolare(): vero solo se chi chiama ha
--      una riga in public.profili con ruolo = 'titolare'. Se non c'è nessuna
--      riga, o non c'è nessun utente loggato, ritorna false: fallisce CHIUSA.
--   2. Su ognuna delle sette tabelle sostituisce `p_all` con una policy che
--      permette tutto e solo al titolare. RLS resta attiva.
--
-- COSA NON FA
--   Non tocca profili, tm_utenti, tm_conta_*, auth.users. Non aggiunge ruoli,
--   non crea eccezioni. Un solo titolare: info@carpenteriaticinese.ch.
--
-- COME SI APPLICA
--   Dashboard Supabase → SQL Editor → incolla TUTTO il file → Run.
--   È dentro una transazione: o passa tutto, o non cambia niente.
--   Dopo, lancia VERIFICA_POST_FIX.sql.
--
-- COME SI ANNULLA
--   In fondo al file, commentato.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- ───────────────────────────────────────────────────────────────────────────
-- 1. La funzione
-- ───────────────────────────────────────────────────────────────────────────
-- SECURITY DEFINER: gira come proprietario della funzione, quindi legge
--   public.profili senza passare dalle policy di profili. Serve perché una
--   policy che legge profili tramite le policy di profili andrebbe in
--   ricorsione, e perché il risultato non deve dipendere da come profili
--   sarà protetta domani.
-- STABLE: il planner la valuta una volta per query, non una volta per riga.
-- search_path fissato: impedisce che una tabella `profili` in un altro schema
--   venga letta al posto di quella vera.
-- exists(...) su zero righe è false: nessun utente, nessun profilo, nessun
--   ruolo → false. Mai null, mai true per sbaglio.

create or replace function public.app_e_titolare()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.profili p
    where p.id = auth.uid()
      and p.ruolo = 'titolare'
  )
$$;

comment on function public.app_e_titolare() is
  'Vero se l''utente loggato ha ruolo titolare in profili. '
  'Usata dalle policy RLS di tm_paghe_*. Fallisce chiusa (false).';

-- Solo gli utenti loggati possono chiamarla; anon no.
revoke all on function public.app_e_titolare() from public;
grant execute on function public.app_e_titolare() to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. Le sette tabelle, una per una
--    Stesso blocco ripetuto: drop della vecchia, create della nuova.
--    Scritte esplicite, senza cicli, così si legge esattamente cosa succede.
-- ───────────────────────────────────────────────────────────────────────────

-- tm_paghe_anagrafica
alter table public.tm_paghe_anagrafica enable row level security;
drop policy if exists p_all on public.tm_paghe_anagrafica;
create policy paghe_solo_titolare on public.tm_paghe_anagrafica
  for all to authenticated
  using (public.app_e_titolare())
  with check (public.app_e_titolare());

-- tm_paghe_azienda_config
alter table public.tm_paghe_azienda_config enable row level security;
drop policy if exists p_all on public.tm_paghe_azienda_config;
create policy paghe_solo_titolare on public.tm_paghe_azienda_config
  for all to authenticated
  using (public.app_e_titolare())
  with check (public.app_e_titolare());

-- tm_paghe_param_assegni
alter table public.tm_paghe_param_assegni enable row level security;
drop policy if exists p_all on public.tm_paghe_param_assegni;
create policy paghe_solo_titolare on public.tm_paghe_param_assegni
  for all to authenticated
  using (public.app_e_titolare())
  with check (public.app_e_titolare());

-- tm_paghe_param_contributi
alter table public.tm_paghe_param_contributi enable row level security;
drop policy if exists p_all on public.tm_paghe_param_contributi;
create policy paghe_solo_titolare on public.tm_paghe_param_contributi
  for all to authenticated
  using (public.app_e_titolare())
  with check (public.app_e_titolare());

-- tm_paghe_param_lpp
alter table public.tm_paghe_param_lpp enable row level security;
drop policy if exists p_all on public.tm_paghe_param_lpp;
create policy paghe_solo_titolare on public.tm_paghe_param_lpp
  for all to authenticated
  using (public.app_e_titolare())
  with check (public.app_e_titolare());

-- tm_paghe_periodo
alter table public.tm_paghe_periodo enable row level security;
drop policy if exists p_all on public.tm_paghe_periodo;
create policy paghe_solo_titolare on public.tm_paghe_periodo
  for all to authenticated
  using (public.app_e_titolare())
  with check (public.app_e_titolare());

-- tm_paghe_voce
alter table public.tm_paghe_voce enable row level security;
drop policy if exists p_all on public.tm_paghe_voce;
create policy paghe_solo_titolare on public.tm_paghe_voce
  for all to authenticated
  using (public.app_e_titolare())
  with check (public.app_e_titolare());

-- ───────────────────────────────────────────────────────────────────────────
-- 3. Cintura di sicurezza, prima del commit: nessuna policy permissiva
--    deve essere sopravvissuta su queste sette tabelle. Se ne resta una con
--    `true`, le policy si sommano in OR e non hai stretto niente.
--    In quel caso la transazione si annulla da sola.
-- ───────────────────────────────────────────────────────────────────────────
do $$
declare
  n int;
begin
  select count(*) into n
  from pg_policy p
  join pg_class c on c.oid = p.polrelid
  join pg_namespace s on s.oid = c.relnamespace
  where s.nspname = 'public'
    and c.relname in ('tm_paghe_anagrafica','tm_paghe_azienda_config',
                      'tm_paghe_param_assegni','tm_paghe_param_contributi',
                      'tm_paghe_param_lpp','tm_paghe_periodo','tm_paghe_voce')
    and p.polname <> 'paghe_solo_titolare';
  if n > 0 then
    raise exception 'FERMATO: restano % policy diverse da paghe_solo_titolare. Nessuna modifica applicata.', n;
  end if;

  select count(*) into n
  from pg_policy p
  join pg_class c on c.oid = p.polrelid
  join pg_namespace s on s.oid = c.relnamespace
  where s.nspname = 'public'
    and c.relname in ('tm_paghe_anagrafica','tm_paghe_azienda_config',
                      'tm_paghe_param_assegni','tm_paghe_param_contributi',
                      'tm_paghe_param_lpp','tm_paghe_periodo','tm_paghe_voce')
    and p.polname = 'paghe_solo_titolare';
  if n <> 7 then
    raise exception 'FERMATO: attese 7 policy paghe_solo_titolare, trovate %. Nessuna modifica applicata.', n;
  end if;

  raise notice 'OK: 7 tabelle, 7 policy paghe_solo_titolare, nessuna policy permissiva residua.';
end $$;

commit;


-- ═══════════════════════════════════════════════════════════════════════════
-- ANNULLARE (rimette lo stato del 14 settembre: tutti gli autenticati leggono)
-- Da usare solo se dopo il fix qualcosa che DEVE funzionare non funziona.
-- Togli il commento e lancia. Poi rimetti il fix appena capito il problema.
-- ═══════════════════════════════════════════════════════════════════════════
/*
begin;
drop policy if exists paghe_solo_titolare on public.tm_paghe_anagrafica;
create policy p_all on public.tm_paghe_anagrafica      for all to authenticated using (true) with check (true);
drop policy if exists paghe_solo_titolare on public.tm_paghe_azienda_config;
create policy p_all on public.tm_paghe_azienda_config  for all to authenticated using (true) with check (true);
drop policy if exists paghe_solo_titolare on public.tm_paghe_param_assegni;
create policy p_all on public.tm_paghe_param_assegni   for all to authenticated using (true) with check (true);
drop policy if exists paghe_solo_titolare on public.tm_paghe_param_contributi;
create policy p_all on public.tm_paghe_param_contributi for all to authenticated using (true) with check (true);
drop policy if exists paghe_solo_titolare on public.tm_paghe_param_lpp;
create policy p_all on public.tm_paghe_param_lpp       for all to authenticated using (true) with check (true);
drop policy if exists paghe_solo_titolare on public.tm_paghe_periodo;
create policy p_all on public.tm_paghe_periodo         for all to authenticated using (true) with check (true);
drop policy if exists paghe_solo_titolare on public.tm_paghe_voce;
create policy p_all on public.tm_paghe_voce            for all to authenticated using (true) with check (true);
-- la funzione può restare: non fa niente da sola. Per toglierla:
-- drop function if exists public.app_e_titolare();
commit;
*/
