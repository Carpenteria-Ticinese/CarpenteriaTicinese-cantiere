// ─────────────────────────────────────────────────────────────────────────────
// Edge Function: crea-collaboratore
//
// Crea un account collaboratore per conto del titolare, senza toccare la
// sessione di chi chiama e senza richiedere la registrazione libera aperta
// su Supabase (Authentication → Providers → Email → "Allow new users to sign up"
// puo' quindi restare DISATTIVATA: admin.createUser la bypassa).
//
// Chi puo' chiamarla: solo un utente autenticato il cui record in `profili`
// ha ruolo = 'titolare'. Chiunque altro riceve 403 e nessun account viene creato.
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

// Ruoli che il titolare puo' assegnare. 'titolare' e' escluso di proposito:
// altrimenti chiunque sia titolare potrebbe crearne altri via API, scavalcando
// il <select> del modal. Le promozioni a titolare si fanno dal dashboard.
const RUOLI_AMMESSI = ['caposquadra', 'responsabile', 'operaio', 'magazziniere'] as const;
type RuoloAmmesso = (typeof RUOLI_AMMESSI)[number];

// Stesso mapping usato finora dal client per la tabella `operai`.
const RUOLO_OPERAIO: Record<RuoloAmmesso, string> = {
  caposquadra: 'Caposquadra',
  responsabile: 'Responsabile cantiere',
  magazziniere: 'Magazziniere',
  operaio: 'Operaio generico',
};

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

  // Client con privilegi service_role: bypassa RLS.
  // Serve sia per verificare il ruolo di chi chiama in modo affidabile
  // (senza dipendere dalle policy su `profili`), sia per creare l'utente.
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
  const { data: profilo, error: profErr } = await admin
    .from('profili')
    .select('ruolo')
    .eq('id', chiamante.id)
    .maybeSingle();

  if (profErr) {
    console.error('Lettura profili fallita:', profErr.message);
    return fail('Impossibile verificare i permessi.', 500);
  }
  if (!profilo || profilo.ruolo !== 'titolare') {
    return fail('Solo il titolare puo’ creare collaboratori.', 403);
  }

  // ── 3. Validazione input ───────────────────────────────────────────────────
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return fail('Richiesta non valida: corpo JSON illeggibile.', 400);
  }

  const email = String(body.email ?? '').trim().toLowerCase();
  const password = String(body.password ?? '');
  const nome = String(body.nome ?? '').trim();
  const cognome = String(body.cognome ?? '').trim();
  const ruolo = String(body.ruolo ?? 'caposquadra').trim();

  if (!nome || !cognome) return fail('Inserisci nome e cognome.', 400);
  // Volutamente permissiva: la validazione forte la fa comunque GoTrue.
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail('Email non valida.', 400);
  if (password.length < 6) return fail('La password deve avere almeno 6 caratteri.', 400);
  if (!RUOLI_AMMESSI.includes(ruolo as RuoloAmmesso)) {
    return fail(`Ruolo non consentito: "${ruolo}".`, 400);
  }
  const ruoloOk = ruolo as RuoloAmmesso;

  // ── 4. Creazione utente (bypassa la registrazione libera) ──────────────────
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // niente email di conferma: il collaboratore entra subito
    user_metadata: { nome, cognome },
  });

  if (createErr) {
    const m = (createErr.message || '').toLowerCase();
    if (m.includes('already been registered') || m.includes('already registered') ||
        m.includes('already exists') || m.includes('duplicate')) {
      return fail('Questa email e’ gia’ registrata.', 409);
    }
    console.error('createUser fallita:', createErr.message);
    return fail('Creazione account fallita: ' + createErr.message, 400);
  }

  const newUserId = created?.user?.id;
  if (!newUserId) {
    return fail('Creazione account fallita: nessun utente restituito.', 500);
  }

  // Da qui in poi, se qualcosa va storto cancelliamo l'utente appena creato:
  // un utente auth senza profilo non puo' fare nulla e bloccherebbe il
  // riutilizzo della stessa email.
  const rollback = async (motivo: string) => {
    console.error('Rollback createUser (' + motivo + ')');
    try {
      await admin.auth.admin.deleteUser(newUserId);
    } catch (e) {
      console.error('Rollback fallito, utente auth orfano:', newUserId, e);
    }
  };

  // ── 5. Profilo applicativo ─────────────────────────────────────────────────
  const { error: profInsErr } = await admin
    .from('profili')
    .upsert({ id: newUserId, nome: nome + ' ' + cognome, ruolo: ruoloOk }, { onConflict: 'id' });

  if (profInsErr) {
    await rollback('insert profili: ' + profInsErr.message);
    return fail('Account non creato: scrittura del profilo fallita (' + profInsErr.message + ').', 500);
  }

  // ── 6. Anagrafica operaio (solo se non esiste gia' per quella email) ───────
  let operaioCreato = false;
  const { data: opEsistente, error: opSelErr } = await admin
    .from('operai')
    .select('id')
    .ilike('email', email)
    .maybeSingle();

  if (opSelErr) {
    // Non blocchiamo: l'account e' valido, manca solo la riga in anagrafica.
    console.error('Lettura operai fallita:', opSelErr.message);
  } else if (!opEsistente) {
    const { error: opInsErr } = await admin.from('operai').insert({
      nome,
      cognome,
      ruolo: RUOLO_OPERAIO[ruoloOk],
      email,
    });
    if (opInsErr) {
      console.error('Insert operai fallita:', opInsErr.message);
    } else {
      operaioCreato = true;
    }
  }

  return json(
    {
      ok: true,
      user_id: newUserId,
      email,
      ruolo: ruoloOk,
      operaio_creato: operaioCreato,
    },
    200,
  );
});
