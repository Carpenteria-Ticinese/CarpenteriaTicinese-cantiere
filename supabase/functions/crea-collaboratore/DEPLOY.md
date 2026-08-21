# Deploy di `crea-collaboratore`

Questa Edge Function permette al titolare di creare gli account collaboratore
dall'app, così la **registrazione libera su Supabase può restare disattivata**.

> ⚠️ La `service_role` key **non va mai** messa in `index.html`, in questo repo,
> né incollata in una chat. Dentro la funzione è già disponibile come variabile
> d'ambiente `SUPABASE_SERVICE_ROLE_KEY`, iniettata automaticamente da Supabase.
> Non serve configurarla a mano.

---

## Strada A — dal dashboard (nessun software da installare)

1. Vai su <https://supabase.com/dashboard> → progetto **wgidgbauhivdctdxfjnk**.
2. Menù laterale → **Edge Functions** → **Deploy a new function** → **Via editor**.
3. Nome esatto della funzione: `crea-collaboratore`
   (deve combaciare con la stringa usata da `sb.functions.invoke` in `index.html`).
4. Cancella il codice di esempio e incolla **tutto** il contenuto di
   [`index.ts`](./index.ts).
5. **Deploy**.

Lascia attiva l'opzione di verifica JWT, se il dashboard la propone.

## Strada B — da riga di comando

Serve Node installato. Non serve installare la CLI in modo permanente.

```bash
# 1. Login: apre il browser e chiede di autorizzare
npx supabase@latest login

# 2. Collega la cartella locale al progetto
npx supabase@latest link --project-ref wgidgbauhivdctdxfjnk

# 3. Deploy (dalla radice del repo)
npx supabase@latest functions deploy crea-collaboratore
```

Se il passo 2 chiede la password del database, la trovi in
**Project Settings → Database → Connection string**.

---

## Dopo il deploy: spegnere la registrazione libera

Solo **dopo** aver verificato che la creazione di un collaboratore funziona:

1. Dashboard → **Authentication** → **Sign In / Providers** → **Email**.
2. Disattiva **"Allow new users to sign up"**.
3. Salva.

Da quel momento nessuno può più auto-registrarsi. La funzione continua a
funzionare: `admin.createUser` è un'operazione amministrativa e non passa dal
flusso di registrazione pubblico.

Restano funzionanti anche il login normale e il "password dimenticata"
(`resetPasswordForEmail`), che non dipendono dalla registrazione aperta.

---

## Come testare

### Test 1 — funziona per il titolare
1. Entra nell'app con l'utente **titolare**.
2. **Personale** → **➕ Aggiungi collaboratore**.
3. Compila nome, cognome, email, ruolo, password temporanea (min. 6 caratteri).
4. **Crea accesso**.

Atteso:
- toast verde `Collaboratore <Nome> <Cognome> creato ✓`;
- **resti loggato come titolare** (in alto continui a vedere il tuo nome e il
  badge `titolare`) — prima, con `signUp()`, la sessione veniva sostituita;
- il collaboratore compare nella lista Personale;
- su Supabase → **Authentication → Users** c'è il nuovo utente con
  *Email confirmed* già valorizzato.

### Test 2 — il nuovo collaboratore entra davvero
Fai logout e accedi con l'email e la password temporanea appena create.
Devi entrare e vedere l'app col ruolo assegnato.

### Test 3 — email duplicata
Riprova a creare un collaboratore con la **stessa email**.
Atteso: messaggio rosso `Questa email e' gia' registrata.` e nessun account creato.

### Test 4 — un non-titolare non può creare account
Accedi come caposquadra o operaio. Il pulsante non è raggiungibile dall'interfaccia;
anche chiamando la funzione a mano, la risposta è
`403 — Solo il titolare puo' creare collaboratori.`

### Test 5 — la registrazione libera è davvero chiusa
Dopo aver disattivato l'opzione, prova a registrarti dalla schermata di login
(se l'app lo permette) o dall'API: deve fallire con *Signups not allowed*.

---

## Se qualcosa non va

| Sintomo | Causa probabile |
|---|---|
| `Function not found` / 404 | Il nome non è esattamente `crea-collaboratore` |
| `Solo il titolare puo' creare collaboratori` mentre sei titolare | La riga in `profili` per il tuo utente ha `ruolo` diverso da `titolare` |
| `Configurazione del server incompleta` | Variabili d'ambiente non iniettate: rifai il deploy |
| Errore CORS nella console del browser | La funzione non è stata deployata, oppure è stata deployata con codice diverso da `index.ts` |

I log della funzione: dashboard → **Edge Functions** → `crea-collaboratore` → **Logs**.
