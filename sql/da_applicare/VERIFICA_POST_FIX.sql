-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICA dopo FIX_RLS_PAGHE.sql — SOLA LETTURA
--
-- Data: 15 settembre 2026. Da lanciare subito dopo il fix, nel SQL Editor,
-- una sezione alla volta. Nessuna sezione modifica dati: le due prove di
-- impersonazione (3 e 4) sono dentro begin/rollback e non lasciano traccia.
-- ═══════════════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Le policy — è la stessa query D2 dell'audit
--    ATTESO: sette righe, tutte con policy = paghe_solo_titolare,
--            using_expr = app_e_titolare(), with_check_expr = app_e_titolare().
--            Nessuna riga con `true`. Nessuna riga con p_all.
-- ═══════════════════════════════════════════════════════════════════════════
select c.relname as tabella,
       p.polname as policy,
       case p.polcmd when 'r' then 'SELECT' when 'a' then 'INSERT'
                     when 'w' then 'UPDATE' when 'd' then 'DELETE'
                     else 'ALL' end as comando,
       pg_get_expr(p.polqual,      p.polrelid) as using_expr,
       pg_get_expr(p.polwithcheck, p.polrelid) as with_check_expr
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
left join pg_policy p on p.polrelid = c.oid
where n.nspname = 'public' and c.relkind = 'r'
  and c.relname like 'tm\_paghe\_%'
order by tabella, policy;


-- ═══════════════════════════════════════════════════════════════════════════
-- 2. La funzione — esiste, è fatta come deve, anon non può chiamarla
--    ATTESO: una riga, security_definer = true, volatilita = stable,
--            search_path contiene "public, pg_temp",
--            anon = false, authenticated = true.
-- ═══════════════════════════════════════════════════════════════════════════
select p.proname                                            as funzione,
       p.prosecdef                                          as security_definer,
       case p.provolatile when 's' then 'stable' when 'i' then 'immutable'
                          else 'volatile' end               as volatilita,
       p.proconfig                                          as search_path,
       has_function_privilege('anon',          p.oid, 'EXECUTE') as anon,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'app_e_titolare';


-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Il titolare passa col nuovo meccanismo
--
--    3a. La condizione che la funzione valuta, applicata a info@…:
--        ATTESO: passa = true
-- ═══════════════════════════════════════════════════════════════════════════
select u.email,
       p.ruolo,
       (p.ruolo = 'titolare') as passa
from auth.users u
left join public.profili p on p.id = u.id
where u.email = 'info@carpenteriaticinese.ch';

--    3b. La prova vera: impersonare quell'utente e leggere le paghe.
--        Dentro una transazione annullata: non cambia niente.
--
--        PRIMA, da postgres (fuori dal blocco), prendi l'UUID del titolare:
--            select id from auth.users where email = 'info@carpenteriaticinese.ch';
--        e incollalo al posto di <UUID-DEL-TITOLARE> qui sotto.
--
--        Perché l'UUID va scritto a mano e non letto con una subquery:
--        dentro il blocco si diventa `authenticated`, e quel ruolo NON può
--        leggere auth.users — una subquery lì dentro dà "permission denied"
--        e la prova non parte. La sezione 4 fa già così. (Corretto il 15.09.2026.)
--
--        Lancia TUTTO il blocco insieme, dal begin al rollback.
--        ATTESO: `funzione` = true, e `righe_voce` = il numero reale di
--                righe di tm_paghe_voce (quello che vedi anche da postgres).
begin;
  set local role authenticated;
  select set_config(
    'request.jwt.claims',
    '{"sub":"<UUID-DEL-TITOLARE>","role":"authenticated"}',
    true
  );
  select public.app_e_titolare()                 as funzione,
         (select count(*) from public.tm_paghe_voce) as righe_voce;
rollback;


-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Un NON titolare non vede niente — la prova speculare
--    Sostituisci <UUID-DI-UN-OPERAIO> con l'id di un profilo che NON è
--    titolare (prendilo da: select id, nome, ruolo from public.profili;).
--    ATTESO: `funzione` = false, `righe_voce` = 0. Zero righe, nessun errore:
--            è così che RLS nega.
-- ═══════════════════════════════════════════════════════════════════════════
begin;
  set local role authenticated;
  select set_config(
    'request.jwt.claims',
    '{"sub":"<UUID-DI-UN-OPERAIO>","role":"authenticated"}',
    true
  );
  select public.app_e_titolare()                 as funzione,
         (select count(*) from public.tm_paghe_voce) as righe_voce;
rollback;


-- ═══════════════════════════════════════════════════════════════════════════
-- 5. Nessun utente loggato: la funzione fallisce chiusa
--    Qui nel SQL Editor auth.uid() è null.
--    ATTESO: false (non null, non errore).
-- ═══════════════════════════════════════════════════════════════════════════
select public.app_e_titolare() as senza_utente_atteso_false;


-- ═══════════════════════════════════════════════════════════════════════════
-- 6. Sul campo — non SQL
--    · Apri Timber Paghe con info@carpenteriaticinese.ch: deve funzionare
--      come prima, dati compresi.
--    · Se hai un account operaio a portata di mano: apri Timber Paghe con
--      quello. Deve mostrare tutto vuoto, senza errori. Prima mostrava tutto.
-- ═══════════════════════════════════════════════════════════════════════════
