// ─────────────────────────────────────────────────────────────────────────────
// Edge Function: cambia-ruolo
//
// Gestisce il "ruolo app" dei collaboratori (colonna profili.ruolo) senza che
// il titolare debba entrare nel dashboard Supabase.
//
// Due azioni, stesso identico controllo di accesso (solo 'titolare'):
//
//   { "azione": "elenco" }
//     → { profili: [ { user_id, email, nome, ruolo } ] }
//       Serve al client per popolare i menù "Ruolo app": la tabella `profili`
//       non ha la colonna email, quindi l'abbinamento operaio→account si puo'
//       fare solo qui, incrociando auth.users con profili tramite service_role.
//
//   { "azione": "cambia", "user_id": "...", "nuovo_ruolo": "..." }
//     → { ok: true, user_id, ruolo_precedente, ruolo }
//
// Sul database c'e' un trigger che blocca la modifica di profili.ruolo per
// chiunque non sia service_role (vedi ../../sql/blocca_cambio_ruolo.sql):
// questa funzione e' l'unico modo di cambiare ruolo dall'app.
//
// La SERVICE_ROLE key viene letta SOLO dalla variabile d'ambiente
// SUPABASE_SERVICE_ROLE_KEY, iniettata da Supabase nel runtime della funzione.
// Non deve mai comparire nel client ne' in alcun file del repository.
// ─────────────────────────────────────────────────────────────────────────────

// Lo specifier 'npm:' e' supportato dal runtime Deno delle Edge Functions.
// Se il tuo dashboard non lo risolvesse, l'alternativa equivalente e':
//   import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

// Ruoli assegnabili dall'app. 'titolare' e' escluso di proposito, in entrambe
// le direzioni: non lo si puo' assegnare, e un profilo che ce l'ha non lo si
// puo' declassare da qui. I titolari si gestiscono solo dal dashboard.
const RUOLI_AMMESSI = ['caposquadra', 'responsabile', 'operaio', 'magazziniere'] as const;
type RuoloAmmesso = (typeof RUOLI_AMMESSI)[number];

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

function fail(message: string, status: number): Response {
  return json({ error: message }, status);
}

Deno.serve(async (req: Request): Promise<Response> => {
  // Preflight CORS: deve rispondere prima di qualsiasi altro controllo.
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== 'POST') {
    return fail('Metodo non consentito.', 405);
  }

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
  const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error('Variabili ambiente mancanti: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
    return fail('Configurazione del server incompleta. Contatta l’amministratore.', 500);
  }

  // Client con privilegi service_role: bypassa RLS ed e' l'unico a cui il
  // trigger sul database permette di scrivere profili.ruolo.
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // ── 1. Chi sta chiamando? ──────────────────────────────────────────────────
  const authHeader = req.headers.get('Authorization') ?? '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) {
    return fail('Non autenticato: token di accesso mancante.', 401);
  }

  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  const chiamante = userData?.user;
  if (userErr || !chiamante) {
    return fail('Sessione non valida o scaduta. Rientra nell’app e riprova.', 401);
  }

  // ── 2. E' davvero il titolare? ─────────────────────────────────────────────
  const { data: profiloChiamante, error: profErr } = await admin
    .from('profili')
    .select('ruolo')
    .eq('id', chiamante.id)
    .maybeSingle();

  if (profErr) {
    console.error('Lettura profili fallita:', profErr.message);
    return fail('Impossibile verificare i permessi.', 500);
  }
  if (!profiloChiamante || profiloChiamante.ruolo !== 'titolare') {
    return fail('Solo il titolare puo’ gestire i ruoli.', 403);
  }

  // ── 3. Quale azione? ───────────────────────────────────────────────────────
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return fail('Richiesta non valida: corpo JSON illeggibile.', 400);
  }

  const azione = String(body.azione ?? 'cambia').trim();

  // ═══════════════════════════════════════════════════════════════════════════
  // AZIONE "elenco"
  // ═══════════════════════════════════════════════════════════════════════════
  if (azione === 'elenco') {
    // auth.users e' paginato: raccogliamo tutte le pagine.
    const utenti: Array<{ id: string; email?: string }> = [];
    const PER_PAGE = 1000;
    for (let page = 1; page <= 20; page++) {
      const { data: lista, error: listErr } = await admin.auth.admin.listUsers({
        page,
        perPage: PER_PAGE,
      });
      if (listErr) {
        console.error('listUsers fallita:', listErr.message);
        return fail('Impossibile leggere gli account: ' + listErr.message, 500);
      }
      const batch = lista?.users ?? [];
      utenti.push(...batch);
      if (batch.length < PER_PAGE) break;
    }

    const { data: profili, error: profListErr } = await admin
      .from('profili')
      .select('id, nome, ruolo');

    if (profListErr) {
      console.error('Lettura elenco profili fallita:', profListErr.message);
      return fail('Impossibile leggere i profili: ' + profListErr.message, 500);
    }

    const emailPerId = new Map<string, string>();
    for (const u of utenti) {
      if (u.email) emailPerId.set(u.id, u.email.toLowerCase());
    }

    const risultato = (profili ?? []).map((p: { id: string; nome: string | null; ruolo: string | null }) => ({
      user_id: p.id,
      email: emailPerId.get(p.id) ?? null,
      nome: p.nome,
      ruolo: p.ruolo,
    }));

    return json({ profili: risultato }, 200);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // AZIONE "cambia"
  // ═══════════════════════════════════════════════════════════════════════════
  if (azione !== 'cambia') {
    return fail(`Azione non riconosciuta: "${azione}".`, 400);
  }

  const userId = String(body.user_id ?? '').trim();
  const nuovoRuolo = String(body.nuovo_ruolo ?? '').trim();

  if (!userId) return fail('Manca user_id.', 400);
  if (!RUOLI_AMMESSI.includes(nuovoRuolo as RuoloAmmesso)) {
    return fail(`Ruolo non consentito: "${nuovoRuolo}".`, 400);
  }

  // Il titolare non puo' cambiare il proprio ruolo: 'titolare' non e'
  // riassegnabile da qui, quindi sarebbe un declassamento irreversibile
  // che lascerebbe l'app senza nessuno in grado di gestire i ruoli.
  if (userId === chiamante.id) {
    return fail('Non puoi cambiare il tuo stesso ruolo: perderesti l’accesso da titolare.', 400);
  }

  const { data: profiloTarget, error: targetErr } = await admin
    .from('profili')
    .select('id, nome, ruolo')
    .eq('id', userId)
    .maybeSingle();

  if (targetErr) {
    console.error('Lettura profilo target fallita:', targetErr.message);
    return fail('Impossibile leggere il profilo da modificare.', 500);
  }
  if (!profiloTarget) {
    return fail('Collaboratore non trovato.', 404);
  }

  // Stessa regola, dall'altro lato: un titolare non si declassa dall'app.
  if (profiloTarget.ruolo === 'titolare') {
    return fail('I profili con ruolo titolare si gestiscono solo dal dashboard Supabase.', 403);
  }

  if (profiloTarget.ruolo === nuovoRuolo) {
    return json(
      { ok: true, user_id: userId, ruolo_precedente: nuovoRuolo, ruolo: nuovoRuolo, invariato: true },
      200,
    );
  }

  const { error: updErr } = await admin
    .from('profili')
    .update({ ruolo: nuovoRuolo })
    .eq('id', userId);

  if (updErr) {
    console.error('Update ruolo fallito:', updErr.message);
    return fail('Aggiornamento del ruolo fallito: ' + updErr.message, 500);
  }

  return json(
    {
      ok: true,
      user_id: userId,
      nome: profiloTarget.nome,
      ruolo_precedente: profiloTarget.ruolo,
      ruolo: nuovoRuolo,
    },
    200,
  );
});
