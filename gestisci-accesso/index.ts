// ─────────────────────────────────────────────────────────────────────────────
// Edge Function: gestisci-accesso
//
// Gestisce l'account app di un collaboratore, partendo dalla sua scheda in
// `operai` (l'account si riconosce dall'email, come nel resto dell'app).
//
//   { "azione": "cambia-email", "operaio_id": "...", "nuova_email": "..." }
//     Cambia l'email di accesso (gia' confermata) e quella in `operai` nello
//     stesso giro. Se la seconda scrittura fallisce, rimette com'era la prima.
//
//   { "azione": "blocca",   "operaio_id": "..." }
//     Blocca l'account (ban di Supabase) e chiude le sessioni aperte.
//
//   { "azione": "sblocca",  "operaio_id": "..." }
//     Toglie il blocco.
//
//   { "azione": "password", "operaio_id": "...", "nuova_password": "..." }
//     Imposta una password nuova (almeno 8 caratteri) scelta da chi chiama:
//     sul piano Free Supabase non manda le email di reimpostazione agli operai.
//
// Chi puo' usarla:
//   - titolare: su tutti tranne i titolari (e mai su se stesso);
//   - responsabile: solo su caposquadra, operaio, magazziniere.
//   Chiunque altro riceve 403 e non cambia niente.
//
// Se la persona non ha un account app risponde 404 con codice "nessun_account":
// l'app lo usa per proseguire come per chi non ha mai avuto accesso.
//
// La SERVICE_ROLE key viene letta SOLO dalla variabile d'ambiente
// SUPABASE_SERVICE_ROLE_KEY, iniettata da Supabase nel runtime della funzione.
// Non deve mai comparire nel client ne' in alcun file del repository.
// ─────────────────────────────────────────────────────────────────────────────

// Lo specifier 'npm:' e' supportato dal runtime Deno delle Edge Functions.
// Se il tuo dashboard non lo risolvesse, l'alternativa equivalente e':
//   import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createClient } from 'npm:@supabase/supabase-js@2';
// Serve solo per chiudere le sessioni aperte (tabella auth.sessions).
import postgres from 'npm:postgres@3';

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

// Su quali ruoli puo' agire chi chiama. null = account senza riga in `profili`.
const RUOLI_GESTIBILI: Record<string, ReadonlyArray<string | null>> = {
  titolare: ['caposquadra', 'responsabile', 'operaio', 'magazziniere', null],
  responsabile: ['caposquadra', 'operaio', 'magazziniere'],
};

// "Per sempre" per Supabase: circa 100 anni.
const BAN_PER_SEMPRE = '876000h';

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

function fail(message: string, status: number, codice?: string): Response {
  return json(codice ? { error: message, codice } : { error: message }, status);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

  // ── 2. Titolare o responsabile? ───────────────────────────────────────────
  const { data: profChiamante, error: profErr } = await admin
    .from('profili').select('ruolo').eq('id', chiamante.id).maybeSingle();
  if (profErr) {
    console.error('Lettura profili fallita:', profErr.message);
    return fail('Impossibile verificare i permessi.', 500);
  }
  const gestibili = profChiamante ? RUOLI_GESTIBILI[String(profChiamante.ruolo)] : undefined;
  if (!gestibili) {
    return fail('Solo il titolare o il responsabile possono gestire gli accessi.', 403);
  }

  // ── 3. Richiesta ───────────────────────────────────────────────────────────
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return fail('Richiesta non valida: corpo JSON illeggibile.', 400);
  }
  const azione = String(body.azione ?? '').trim();
  if (!['cambia-email', 'blocca', 'sblocca', 'password'].includes(azione)) {
    return fail(`Azione non riconosciuta: "${azione}".`, 400);
  }
  const operaioId = String(body.operaio_id ?? '').trim();
  if (!operaioId) return fail('Manca operaio_id.', 400);

  // ── 4. La persona e il suo account ─────────────────────────────────────────
  const { data: operaio, error: opErr } = await admin
    .from('operai').select('id, nome, cognome, email').eq('id', operaioId).maybeSingle();
  if (opErr) {
    console.error('Lettura operai fallita:', opErr.message);
    return fail('Impossibile leggere la scheda del collaboratore.', 500);
  }
  if (!operaio) return fail('Collaboratore non trovato.', 404);
  const emailAttuale = String(operaio.email ?? '').trim().toLowerCase();
  if (!emailAttuale) {
    return fail('Questa persona non ha un account app.', 404, 'nessun_account');
  }

  // auth.users e' paginato: si cercano tutte le pagine.
  async function trovaUtente(email: string): Promise<{ id: string; email?: string } | null | 'errore'> {
    for (let page = 1; page <= 20; page++) {
      const { data: lista, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) {
        console.error('listUsers fallita:', error.message);
        return 'errore';
      }
      const batch = lista?.users ?? [];
      const u = batch.find((x: { email?: string }) => String(x.email ?? '').toLowerCase() === email);
      if (u) return u;
      if (batch.length < 1000) break;
    }
    return null;
  }

  const utente = await trovaUtente(emailAttuale);
  if (utente === 'errore') return fail('Impossibile leggere gli account.', 500);
  if (!utente) return fail('Questa persona non ha un account app.', 404, 'nessun_account');

  if (utente.id === chiamante.id) {
    return fail('Non puoi farlo sul tuo stesso account.', 400);
  }

  const { data: profTarget, error: targetErr } = await admin
    .from('profili').select('ruolo').eq('id', utente.id).maybeSingle();
  if (targetErr) {
    console.error('Lettura profilo target fallita:', targetErr.message);
    return fail('Impossibile leggere il ruolo del collaboratore.', 500);
  }
  const ruoloTarget = profTarget ? String(profTarget.ruolo ?? '') : null;
  if (!gestibili.includes(ruoloTarget)) {
    return fail(
      profChiamante!.ruolo === 'responsabile'
        ? 'Un responsabile può gestire solo caposquadra, operai e magazzinieri.'
        : 'I titolari si gestiscono solo dal dashboard Supabase.',
      403,
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CAMBIA EMAIL
  // ═══════════════════════════════════════════════════════════════════════════
  if (azione === 'cambia-email') {
    const nuova = String(body.nuova_email ?? '').trim().toLowerCase();
    if (!nuova || !EMAIL_RE.test(nuova)) return fail('Email nuova non valida.', 400);
    if (nuova === emailAttuale) {
      return json({ ok: true, invariata: true, email: nuova }, 200);
    }
    const giaUsata = await trovaUtente(nuova);
    if (giaUsata === 'errore') return fail('Impossibile leggere gli account.', 500);
    if (giaUsata) return fail('Questa email è già usata da un altro account.', 409);

    // 1° passo: email di accesso, gia' confermata (nessuna email di verifica)
    const { error: authErr } = await admin.auth.admin.updateUserById(utente.id, {
      email: nuova,
      email_confirm: true,
    });
    if (authErr) {
      console.error('Cambio email account fallito:', authErr.message);
      return fail('Email non cambiata: ' + authErr.message, 400);
    }

    // 2° passo: email nella scheda. Se fallisce si rimette com'era il 1°.
    const { data: opUpd, error: opUpdErr } = await admin
      .from('operai').update({ email: nuova }).eq('id', operaioId).select('id');
    if (opUpdErr || !opUpd || !opUpd.length) {
      const motivo = opUpdErr ? opUpdErr.message : '0 righe';
      console.error('Cambio email in operai fallito:', motivo);
      const { error: backErr } = await admin.auth.admin.updateUserById(utente.id, {
        email: emailAttuale,
        email_confirm: true,
      });
      if (backErr) {
        console.error('RIPRISTINO FALLITO, sistemare a mano:', utente.id, backErr.message);
        return fail(
          'ATTENZIONE: l’email di accesso è diventata ' + nuova + ' ma la scheda è rimasta ' +
            emailAttuale + '. Va sistemato a mano dal dashboard Supabase.',
          500,
        );
      }
      return fail('Email non cambiata (scheda collaboratore non aggiornata: ' + motivo + '). Tutto è rimasto com’era.', 500);
    }
    return json({ ok: true, email: nuova }, 200);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // NUOVA PASSWORD
  // ═══════════════════════════════════════════════════════════════════════════
  if (azione === 'password') {
    const pwd = String(body.nuova_password ?? '');
    if (pwd.length < 8) return fail('La password deve avere almeno 8 caratteri.', 400);
    if (pwd.length > 72) return fail('La password è troppo lunga (massimo 72 caratteri).', 400);
    const { error: pwErr } = await admin.auth.admin.updateUserById(utente.id, { password: pwd });
    if (pwErr) {
      console.error('Cambio password fallito:', pwErr.message);
      return fail('Password non cambiata: ' + pwErr.message, 400);
    }
    return json({ ok: true }, 200);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // BLOCCA / SBLOCCA
  // ═══════════════════════════════════════════════════════════════════════════
  const blocca = azione === 'blocca';
  const { error: banErr } = await admin.auth.admin.updateUserById(utente.id, {
    ban_duration: blocca ? BAN_PER_SEMPRE : 'none',
  });
  if (banErr) {
    console.error((blocca ? 'Blocco' : 'Sblocco') + ' fallito:', banErr.message);
    return fail((blocca ? 'Account non bloccato: ' : 'Account non sbloccato: ') + banErr.message, 500);
  }
  if (!blocca) return json({ ok: true, bloccato: false }, 200);

  // Il blocco impedisce nuovi accessi e il rinnovo della sessione. Per chiudere
  // subito quelle aperte si cancellano dal database. Se non riesce il blocco
  // resta valido: la sessione aperta scade da sola (di norma entro un'ora).
  let sessioniChiuse = false;
  const DB_URL = Deno.env.get('SUPABASE_DB_URL');
  if (DB_URL) {
    let sql: ReturnType<typeof postgres> | null = null;
    try {
      sql = postgres(DB_URL, { max: 1, prepare: false });
      await sql`delete from auth.sessions where user_id = ${utente.id}`;
      sessioniChiuse = true;
    } catch (e) {
      console.error('Chiusura sessioni fallita:', (e as Error).message);
    } finally {
      try { await sql?.end(); } catch { /* niente */ }
    }
  }
  return json(
    sessioniChiuse
      ? { ok: true, bloccato: true, sessioni_chiuse: true }
      : { ok: true, bloccato: true, sessioni_chiuse: false,
          avviso: 'Account bloccato. Le sessioni già aperte scadono da sole entro un’ora.' },
    200,
  );
});
