# Deploy di `cambia-ruolo` + trigger anti auto-promozione

Permette al titolare di cambiare il **ruolo app** dei collaboratori dalla
schermata Personale, senza entrare nel dashboard Supabase. Il trigger SQL
impedisce a chiunque altro di toccare `profili.ruolo`.

> ⚠️ Come per l'altra funzione: la `service_role` key **non va mai** messa in
> `index.html`, nel repo o in una chat. Dentro la funzione è già disponibile
> come `SUPABASE_SERVICE_ROLE_KEY`, iniettata automaticamente da Supabase.

Ordine consigliato: **prima la funzione, poi il trigger**. Se metti il trigger
per primo, per qualche minuto nessuno può cambiare ruolo — nemmeno tu.

---

## Passo 1 — Deploy della funzione

### Dal dashboard
1. <https://supabase.com/dashboard> → progetto **wgidgbauhivdctdxfjnk**
2. **Edge Functions** → **Deploy a new function** → **Via editor**
3. Nome esatto: `cambia-ruolo`
4. Incolla tutto il contenuto di [`index.ts`](./index.ts) → **Deploy**

### Da riga di comando
```bash
npx supabase@latest functions deploy cambia-ruolo
```
(se non hai già fatto `login` e `link`, vedi il DEPLOY.md di `crea-collaboratore`)

## Passo 2 — Verifica che il menù funzioni

Entra come titolare → **Personale**. Sotto ogni collaboratore che ha un account
app compare **🔑 Ruolo app** con un menù a tendina. Cambia il valore di un
collaboratore di prova: deve apparire il toast di conferma.

Se il menù **non** compare: la funzione non è stata deployata, oppure il nome
non è esattamente `cambia-ruolo`. La schermata continua comunque a funzionare
come prima — il menù è l'unica cosa che manca.

## Passo 3 — Il trigger SQL

Dashboard → **SQL Editor** → **New query** → incolla tutto il contenuto di
[`../../sql/blocca_cambio_ruolo.sql`](../../sql/blocca_cambio_ruolo.sql) → **Run**.

Il file contiene anche i test da eseguire e il comando per annullare tutto.

---

## Come testare che il blocco funziona

### Test A — un operaio NON può promuoversi (il test che conta)
1. Entra nell'app con un account **non titolare**.
2. Apri la console del browser (F12) e incolla:
   ```js
   const {data:{user}} = await sb.auth.getUser();
   const r = await sb.from('profili').update({ruolo:'titolare'}).eq('id', user.id);
   console.log(r);
   ```
3. Atteso: `error` valorizzato con il messaggio del trigger.
4. Ricarica l'app: devi essere ancora nel ruolo di prima.

### Test B — un operaio non può usare la funzione
Sempre da console, come utente non titolare:
```js
const r = await sb.functions.invoke('cambia-ruolo',{body:{azione:'elenco'}});
console.log(r);
```
Atteso: errore **403** — *"Solo il titolare puo' gestire i ruoli."*

### Test C — il titolare dal menù funziona
Personale → menù **Ruolo app** di un collaboratore → cambia valore →
toast di conferma. Facendo logout/login con quell'account, i permessi devono
essere quelli del nuovo ruolo.

### Test D — il resto dell'app non si rompe
Cambia la lingua dell'app da un account normale: deve funzionare. Il trigger è
`BEFORE UPDATE OF ruolo`, quindi non tocca gli update sulle altre colonne di
`profili`.

---

## Regole applicate dalla funzione

| Caso | Esito |
|---|---|
| Chiamante non titolare | 403 |
| Ruolo richiesto `titolare` | 400 — non assegnabile via API |
| Target che è già `titolare` | 403 — si gestisce dal dashboard |
| Titolare che cambia il **proprio** ruolo | 400 — eviterebbe un lock-out irreversibile |
| Ruolo non in whitelist | 400 |
| `user_id` inesistente | 404 |
| Ruolo già uguale a quello richiesto | 200, nessuna scrittura |

I ruoli assegnabili sono `caposquadra`, `responsabile`, `operaio`, `magazziniere`.

## Se qualcosa non va

I log: dashboard → **Edge Functions** → `cambia-ruolo` → **Logs**.

| Sintomo | Causa probabile |
|---|---|
| Il menù non compare | Funzione non deployata o nome sbagliato |
| *"Solo il titolare..."* mentre sei titolare | La tua riga in `profili` ha `ruolo` diverso da `titolare` |
| *"Aggiornamento del ruolo fallito"* con messaggio del trigger | Il trigger sta bloccando anche la service_role: controlla di non aver aggiunto `SECURITY DEFINER` alla funzione SQL |
