-- ═══════════════════════════════════════════════════════════════════════════
-- Trigger anti auto-promozione su profili.ruolo
--
-- Problema: l'app deve poter fare UPDATE su `profili` per l'utente stesso
-- (serve per salvare la lingua, vedi sb.from('profili').update({lingua})).
-- Quella stessa policy pero' permette a un collaboratore di scriversi
-- ruolo = 'titolare' e prendersi tutti i permessi.
--
-- Soluzione: un trigger che rifiuta qualsiasi modifica della colonna `ruolo`
-- a meno che a farla non sia la service_role, cioe' le Edge Function.
-- Risultato: il ruolo si cambia SOLO passando da 'cambia-ruolo', che a sua
-- volta verifica che il chiamante sia titolare.
--
-- Da eseguire una volta sola: Dashboard Supabase → SQL Editor → Run.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.blocca_cambio_ruolo()
returns trigger
language plpgsql
-- SECURITY INVOKER (default): NON mettere SECURITY DEFINER.
-- Dentro una funzione SECURITY DEFINER current_user diventa il proprietario
-- della funzione, quindi il confronto qui sotto sarebbe sempre falso e il
-- trigger bloccherebbe anche la service_role.
security invoker
set search_path = public, pg_catalog
as $$
begin
  -- Nessun cambio di ruolo: lascia passare.
  if new.ruolo is not distinct from old.ruolo then
    return new;
  end if;

  -- current_user riflette il SET ROLE fatto da PostgREST in base alla chiave
  -- usata: 'service_role' con la service key, 'authenticated' con un utente
  -- loggato, 'anon' senza login. postgres/supabase_admin sono le connessioni
  -- dirette (SQL Editor del dashboard), lasciate passare per poter sempre
  -- intervenire a mano in caso di emergenza.
  if current_user in ('service_role', 'supabase_admin', 'postgres') then
    return new;
  end if;

  -- Secondo controllo, indipendente dal primo: il ruolo dichiarato nel JWT.
  if coalesce(
       nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
       ''
     ) = 'service_role' then
    return new;
  end if;

  raise exception
    'Il ruolo applicativo non puo essere modificato direttamente. Usa la funzione cambia-ruolo (solo titolare).'
    using errcode = '42501'; -- insufficient_privilege
end;
$$;

drop trigger if exists trg_blocca_cambio_ruolo on public.profili;

create trigger trg_blocca_cambio_ruolo
  before update of ruolo on public.profili
  for each row
  execute function public.blocca_cambio_ruolo();


-- ═══════════════════════════════════════════════════════════════════════════
-- COME TESTARLO
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ── Test 1: dal SQL Editor il blocco NON scatta (sei postgres) ─────────────
-- Questo e' voluto: serve la via di fuga manuale. Per vedere il trigger in
-- azione dal SQL Editor devi impersonare un utente normale:
--
--   begin;
--   set local role authenticated;
--   set local request.jwt.claims = '{"sub":"<UUID-DI-UN-OPERAIO>","role":"authenticated"}';
--   update profili set ruolo = 'titolare' where id = '<UUID-DI-UN-OPERAIO>';
--   rollback;
--
-- Atteso: ERROR ... "Il ruolo applicativo non puo essere modificato
-- direttamente" con SQLSTATE 42501. Il rollback annulla comunque tutto.
--
-- ── Test 2: la service_role passa ──────────────────────────────────────────
--   begin;
--   set local role service_role;
--   set local request.jwt.claims = '{"role":"service_role"}';
--   update profili set ruolo = 'operaio' where id = '<UUID-DI-UN-OPERAIO>';
--   rollback;
--
-- Atteso: UPDATE 1, nessun errore. E' la strada che usa la Edge Function.
--
-- ── Test 3: dal browser, come operaio (la prova che conta davvero) ─────────
-- Entra nell'app con un account NON titolare, apri la console del browser e:
--
--   const {data:{user}} = await sb.auth.getUser();
--   await sb.from('profili').update({ruolo:'titolare'}).eq('id', user.id);
--
-- Atteso: risposta con error non nullo e messaggio del trigger. Poi ricarica
-- l'app: devi essere ancora nel tuo ruolo di prima.
--
-- ── Test 4: il resto dell'app continua a funzionare ────────────────────────
-- Cambia la lingua dall'app come utente normale: deve funzionare. Il trigger
-- e' BEFORE UPDATE OF ruolo, quindi non tocca gli update sulle altre colonne.
--
-- ── Test 5: il titolare dall'app funziona ──────────────────────────────────
-- Personale → menu "Ruolo app" di un collaboratore → cambia valore.
-- Atteso: toast di conferma. La modifica passa dalla Edge Function, che gira
-- come service_role e quindi supera il trigger.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- PER ANNULLARE TUTTO
-- ═══════════════════════════════════════════════════════════════════════════
--   drop trigger if exists trg_blocca_cambio_ruolo on public.profili;
--   drop function if exists public.blocca_cambio_ruolo();
