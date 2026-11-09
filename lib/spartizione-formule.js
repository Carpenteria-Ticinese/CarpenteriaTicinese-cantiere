/*
 * FORMULE DELLA SPARTIZIONE — App Cantieri, Carpenteria Ticinese Sagl
 * FILE GENERATO: non si corregge a mano. Le formule stanno in UN posto solo (decisione di Umberto, 3.11.2026):
 * il motore del Preventivatore, ramo notte-5-11, commit 8d93780. File: unita.js, quantita.js, spartizione.js, tegole.js,
 * e i pezzi delle misure di modello.js e documento.js. Si rifa' con lo script del Direttore, stesso commit o uno nuovo.
 * Qui entrano solo misure e quantita'. La prova confronta gli stessi casi col motore.
 * Tutto dentro window.CTSpart: CTUnita, CTModello, CTDocumento, CTTegole, CTQuantita, CTSpartizione, leggiMisura, leggiNumero.
 */
(function (globale) {
const CT = {};
/*
 * UNITÀ DI MISURA — Preventivatore Carpenteria Ticinese Sagl
 * ------------------------------------------------------------
 * Regola di Umberto (4.11.2026): ogni misura si scrive in m, cm o mm a scelta (selettore accanto al campo, di base metri;
 * schermata del capo squadra di base cm). DENTRO il programma tutte le misure salvate sono in METRI.
 * Precisione di quello che si scrive: 0,1 mm (0.0001 m). La conversione dei file vecchi non arrotonda (stessi numeri).
 *
 *   aMetri(valore, unita)   numero scritto nell'unità scelta → metri (arrotondato a 0,1 mm); '' o null → null
 *   daMetri(metri, unita)   metri → numero nell'unità scelta (m 4 decimali, cm 2, mm 1)
 *   converti(valore, da, a) da un'unità all'altra (per i risultati che il motore dà in mm o cm)
 *   testo(metri, unita)     «5.51 m», «551 cm», «5'510 mm»
 */
(function (root) {
  'use strict';
  const FATTORE = { m: 1, cm: 0.01, mm: 0.001 };
  const DECIMALI = { m: 4, cm: 2, mm: 1 };
  const UNITA = ['m', 'cm', 'mm'];
  const tonda = (x, d) => { const k = Math.pow(10, d); return Math.round(x * k) / k; };
  const valida = u => (FATTORE[u] ? u : 'm');

  function aMetri(valore, unita) {
    if (valore == null || valore === '') return null;
    const v = typeof valore === 'number' ? valore : Number(String(valore).trim().replace(/[’'\s]/g, '').replace(',', '.'));
    if (!isFinite(v)) return NaN;
    return tonda(v * FATTORE[valida(unita)], 4);
  }
  function daMetri(metri, unita) {
    if (metri == null || metri === '' || !isFinite(Number(metri))) return null;
    const u = valida(unita);
    return tonda(Number(metri) / FATTORE[u], DECIMALI[u]);
  }
  function converti(valore, da, a) {
    if (valore == null || !isFinite(Number(valore))) return null;
    const u = valida(a);
    return tonda(Number(valore) * FATTORE[valida(da)] / FATTORE[u], DECIMALI[u]);
  }
  function testo(metri, unita) {
    const x = daMetri(metri, unita);
    if (x == null) return '—';
    const [i, d] = String(x).split('.');
    return i.replace(/\B(?=(\d{3})+(?!\d))/g, "'") + (d ? '.' + d : '') + ' ' + valida(unita);
  }

  const API = { UNITA, FATTORE, aMetri, daMetri, converti, testo };
  root.CTUnita = API;
})(CT);

(function (root) {
  'use strict';
  const n = v => (typeof v === 'number' && isFinite(v)) ? v : 0;
  const copia = x => JSON.parse(JSON.stringify(x));
  function x15(x) { return x === 0 ? 0 : +(+x).toPrecision(15); }
  const M = { x15 };
  // ---------------------------------------------------------------- MISURE
  function coeffPendenza(gradi) { const t = Math.tan(n(gradi) * Math.PI / 180); return Math.sqrt(1 + t * t); }
  // coefficiente di una riga: scritto nella riga, altrimenti dalla pendenza della misura
  function coeffRiga(riga, misura, gradi) {
    if (typeof riga.coeff === 'number') return riga.coeff;
    const c = coeffPendenza(gradi);
    if (misura.pendenza === 'falda') return c;
    if (misura.pendenza === 'cantonale') return (c - 1) / 2 + 1; // come nell'Excel: metà dell'aumento
    return 1;
  }
  function valoreRiga(riga, misura, gradi) {
    const k = coeffRiga(riga, misura, gradi);
    switch (misura.unita) {
      // righe in METRI (regola di Umberto 4.11.2026; file vecchi in cm: migraMetri)
      case 'm2': return n(riga.larg) * n(riga.lung) * n(riga.pz) * k;
      case 'ml': return n(riga.lung) * n(riga.pz) * k;
      case 'm3': return n(riga.larg) * n(riga.alt) * n(riga.lung) * n(riga.pz) * k;
      default: return n(riga.pz) * k; // pz
    }
  }
  // { reale, proposto, scelto, usato, avvisi }
  function valoriMisura(m, gradi) {
    const avvisi = [];
    const reale = (m.righe && m.righe.length) ? M.x15(m.righe.reduce((s, r) => s + valoreRiga(r, m, gradi), 0)) : n(m.realeFisso);
    const perc = m.percProposta == null ? 3 : m.percProposta;
    // per eccesso all'unità (x15 toglie il rumore dei decimali: 100 × 1.03 = 103, non 103.00000000000001)
    const proposto = reale > 0 ? Math.ceil(M.x15(reale * (1 + perc / 100))) : 0;
    const scelto = typeof m.scelto === 'number' ? m.scelto : null;
    const usato = scelto != null ? scelto : proposto;
    if (scelto != null && scelto < reale - 1e-9) avvisi.push(`Misura "${m.nome}": scritto ${scelto} è MENO della misura reale ${reale}`);
    return { reale, proposto, scelto, usato, avvisi };
  }

  // ---------------------------------------------------------------- MISURE IN METRI (Umberto 4.11.2026)
  // Dentro il programma tutte le misure salvate sono in METRI (si scrivono in m, cm o mm: unita.js). Le offerte e i file salvati
  // prima (off.unita mancante) avevano: righe delle misure in cm; quantità (primo listone, sporgenza, interasse, sporti, pannelli)
  // in cm e passo a mano in mm; misure del capo squadra (faldaCm, grondaCm) in cm; spessori della stratigrafia (spessoreMm) in mm.
  // migraMetri li porta in metri UNA volta (off.unita = 'm'); senza arrotondare, così i totali restano al centesimo.
  const daCm = x => (typeof x === 'number' && isFinite(x) ? M.x15(x / 100) : x);
  const daMm = x => (typeof x === 'number' && isFinite(x) ? M.x15(x / 1000) : x);
  function migraMetri(off) {
    if (off) delete off.conto;   // all'apertura (file o database): un IBAN di un'offerta vecchia non resta (Umberto 9.11.2026)
    if (!off || off.unita === 'm') return off;
    for (const m of off.misure || []) for (const r of m.righe || []) for (const k of ['larg', 'alt', 'lung']) r[k] = daCm(r[k]);
    const q = off.quantita;
    if (q) {
      for (const k of ['primoListone', 'sporgenzaBordo', 'sportoGronda', 'sportoLati']) if (k in q) q[k] = daCm(q[k]);
      if ('passoMano' in q) q.passoMano = daMm(q.passoMano);
      if (q.controlistoni && 'interasse' in q.controlistoni) q.controlistoni.interasse = daCm(q.controlistoni.interasse);
      for (const f of q.falde || []) if (f) for (const k of ['sportoGronda', 'sportoLati']) if (k in f) f[k] = daCm(f[k]);
      for (const p of (q.isolante && q.isolante.pannelli) || []) if (p) for (const k of ['larg', 'lung']) if (k in p) p[k] = daCm(p[k]);
    }
    const sc = off.spartizioneCantiere;
    if (sc && sc.falde) sc.falde = sc.falde.map(f => {
      if (!f) return f;
      const g = Object.assign({}, f);
      if ('faldaCm' in g) { g.falda = daCm(g.faldaCm); delete g.faldaCm; }
      if ('grondaCm' in g) { g.gronda = daCm(g.grondaCm); delete g.grondaCm; }
      return g;
    });
    const st = off.stratigrafia;
    if (st && st.strati) for (const s of st.strati) if ('spessoreMm' in s) { s.spessore = s.spessoreMm == null ? null : daMm(s.spessoreMm); delete s.spessoreMm; }
    off.unita = 'm';
    return off;
  }
  /** L'offerta in metri: la stessa se è già in metri, se no una COPIA convertita (l'originale non si tocca). */
  const assicuraMetri = off => (!off || off.unita === 'm' ? off : migraMetri(copia(off)));

  root.CTModello = { coeffPendenza, coeffRiga, valoreRiga, valoriMisura, migraMetri, assicuraMetri };
})(CT);

(function (root) {
  'use strict';
  // Codici dell'Excel: "---" (o vuoto) = variante della voce sopra; "611.1" = figlia di "611"; "51" = voce a sé.
  const codice = v => String((v.excel && v.excel.codice) == null ? '' : v.excel.codice).trim();
  const vero = c => !!c && c !== '---' && !/^N\.?\s?B/i.test(c);
  const padre = c => (c.includes('.') ? c.slice(0, c.lastIndexOf('.')) : null);

  /** Indici dei testi (descrizioni principali) che appartengono alla voce i, secondo i codici dell'Excel. */
  function titoliDi(voci, i) {
    const out = []; let codTesta = null, posTesta = i;
    if (!vero(codice(voci[i]))) {
      // variante: risale ai testi sopra (saltando le altre varianti e le N.B.) fino al testo con codice vero
      for (let j = i - 1; j >= 0 && i - j < 40; j--) {
        const y = voci[j], c = codice(y);
        if (y.trattini) break;                         // «… a carico del committente»: riga a sé, mai titolo
        if (y.tipo === 'nota' || (y.tipo === 'voce' && !vero(c))) continue;
        if (y.tipo === 'voce') break; // voce a sé: il gruppo è finito
        out.push(j);
        if (vero(c)) { codTesta = c; posTesta = j; break; }
      }
    } else {
      codTesta = codice(voci[i]);
      // voce a sé: testi con lo STESSO codice subito sopra (solo testi e N.B. in mezzo)
      for (let j = i - 1; j >= 0; j--) {
        const y = voci[j];
        if (y.tipo === 'nota') continue;
        if (y.tipo !== 'testo' || y.trattini) break;
        if (codice(y) === codTesta) { out.push(j); posTesta = j; } else if (vero(codice(y))) break;
      }
    }
    // i "padri" del codice (611.1 → 611; 50.1 → 50), cercati sopra
    for (let p = codTesta && padre(codTesta); p; p = padre(p)) {
      for (let j = posTesta - 1; j >= 0 && posTesta - j < 60; j--) if (voci[j].tipo === 'testo' && codice(voci[j]) === p) { out.push(j); posTesta = j; break; }
    }
    return out;
  }

  root.CTDocumento = { titoliDi };
})(CT);

(function (root) {
  'use strict';
  const DOC = root.CTDocumento;
  const TEGOLE = [
    {"id":"fama","nome":"Fama (piatta scorrevole 13)","stato":"ok","passoMin":320,"passoMax":378,"larghezza":215,"doppiaOnda":null,"senzaOnda":true,"bordoSx":240,"bordoDx":195,"pzMazzo":6,"pzMazzoFrontone":2,"pendenza":{"normale":20,"aumentata":18,"straordinaria":15,"provvedimenti":10},"riconosci":/\bFAMA\b/i},
    {"id":"jura","nome":"Jura (piatta scorrevole)","stato":"ok","passoMin":320,"passoMax":378,"larghezza":213,"doppiaOnda":null,"senzaOnda":true,"bordoSx":230,"bordoDx":195,"pzMazzo":6,"pzMazzoFrontone":2,"pendenza":{"normale":20,"aumentata":18,"straordinaria":15,"provvedimenti":10},"riconosci":/\bJURA\b/i},
    {"id":"campa","nome":"Campa (scorrevole 13)","stato":"ok","passoMin":319,"passoMax":379,"larghezza":213,"doppiaOnda":null,"bordoSx":230,"bordoDx":195,"pzMazzo":6,"pzMazzoFrontone":2,"pendenza":{"normale":20,"aumentata":18,"straordinaria":15,"provvedimenti":10},"riconosci":/\bCAMPA\b/i},
    {"id":"neva-nova","nome":"Neva Nova (scorrevole con rilievo)","stato":"ok","passoMin":330,"passoMax":378,"larghezza":215,"doppiaOnda":null,"bordoSx":240,"bordoDx":195,"pzMazzo":6,"pzMazzoFrontone":2,"pendenza":{"normale":20,"aumentata":18,"straordinaria":15,"provvedimenti":10},"riconosci":/NEVA\s*NOVA/i},
    {"id":"arteso","nome":"Arteso (scorrevole grande 10)","stato":"ok","passoMin":360,"passoMax":400,"larghezza":255,"doppiaOnda":null,"bordoSx":230,"bordoDx":235,"pzMazzo":5,"pzMazzoFrontone":2,"pendenza":{"normale":20,"aumentata":20,"straordinaria":17,"provvedimenti":10},"riconosci":/\bARTESO\b/i},
    {"id":"monteso","nome":"Monteso (scorrevole grande, nasi fermaneve)","stato":"ok","passoMin":360,"passoMax":400,"larghezza":255,"pzMazzo":5,"pzMazzoFrontone":2,"riconosci":/\bMONTESO\b/i},
    {"id":"swiss-tl","nome":"Swiss TL (piatta scorrevole grande)","stato":"ok","passoMin":360,"passoMax":400,"larghezza":255,"doppiaOnda":null,"senzaOnda":true,"bordoSx":230,"bordoDx":235,"pzMazzo":5,"pzMazzoFrontone":2,"pendenza":{"normale":20,"aumentata":20,"straordinaria":17,"provvedimenti":10},"riconosci":/SWISS\s*TL/i},
    {"id":"plano","nome":"Plano (liscia 10)","stato":"ok","passoMin":360,"passoMax":400,"larghezza":255,"pzMazzo":5,"pzMazzoFrontone":2,"riconosci":/\bPLANO\b/i},
    {"id":"pada","nome":"Pada (tegola fiamminga 13) — «Ludovici», «Vario Scorrevole»","stato":"ok","passoMin":350,"passoMax":350,"larghezza":214,"doppiaOnda":272,"bordoSx":252,"bordoDx":194,"pzMazzo":6,"pzMazzoFrontone":2,"pzMazzoDoppia":4,"gioco":{"min":345,"max":355,"consigliato":350,"fonte":"scheda del produttore, pagina 2: lunghezza di copertura 350 mm, limite di tolleranza ± 5 mm"},"avviso":"Passo 35 cm con gioco di 5 mm in più o in meno. Ludovici = Pada.","pendenza":{"normale":17,"aumentata":16,"straordinaria":14,"provvedimenti":8,"fonte":"Umberto 5.11.2026"},"colmo":{"nome":"Tegola di colmo 50","pzMl":2.4},"nomi":{"normale":["padabruno"],"sx":["padafrontone sinistro"],"dx":["padafrontone destro"],"doppia":["doppio bordo"],"coppo":["padacoppo"]},"riconosci":/LUDOVICI|LUDOWICI|\bPADA\b|VARIO\s*SCORREVOLE/i},
    {"id":"vauban","nome":"Vauban (castoro a incastro)","stato":"ok","passoMin":258,"passoMax":273,"larghezza":169,"pzMazzo":7,"riconosci":/\bVAUBAN\b/i},
    {"id":"casta-doppia","nome":"Casta 17/38 coda di castoro, doppia copertura","stato":"ok","passoMin":150,"passoMax":150,"larghezza":170,"pendenza":{"normale":30,"aumentata":25,"straordinaria":15,"provvedimenti":13},"riconosci":/\bCASTA\b/i},
    {"id":"casta-semplice","nome":"Casta 17/38 coda di castoro, copertura semplice","stato":"ok","passoMin":240,"passoMax":240,"larghezza":170,"pendenza":{"normale":20,"aumentata":null,"straordinaria":null,"provvedimenti":null}},
    {"id":"alegra","nome":"Alegra","stato":"dubbio","passoMin":350,"passoMax":395,"larghezza":330,"pzMazzo":5,"pzMazzoFrontone":4,"avviso":"Valori da confermare in ufficio."},
    {"id":"bellus","nome":"Bellus (ardesia ceramica)","stato":"dubbio","passoMin":120,"passoMax":160,"larghezza":160,"avviso":"Valori da confermare in ufficio."},
    {"id":"roma-12","nome":"Roma 1.2 (coppo romano + embrice)","stato":"dubbio","passoMin":290,"passoMax":340,"larghezza":180,"avviso":"Valori da confermare in ufficio."},
    {"id":"doppia-romana","nome":"Doppia Romana (cemento)","stato":"ok","passoMin":315,"passoMax":345,"larghezza":300,"perPendenza":[{"daGradi":12.5,"min":315,"max":320},{"daGradi":17,"min":315,"max":330},{"daGradi":26,"min":315,"max":340},{"daGradi":40,"min":315,"max":345}],"riconosci":/DOPPIA\s+ROMANA/i},
    {"id":"coppo-francia","nome":"Coppo di Francia (cemento)","stato":"ok","passoMin":315,"passoMax":345,"larghezza":300,"perPendenza":[{"daGradi":12.5,"min":315,"max":320},{"daGradi":17,"min":315,"max":330},{"daGradi":26,"min":315,"max":340},{"daGradi":40,"min":315,"max":345}],"riconosci":/COPPO\s+DI\s+FRANCIA/i},
    {"id":"coppo-grecia","nome":"Coppo di Grecia (cemento)","stato":"ok","passoMin":315,"passoMax":345,"larghezza":300,"perPendenza":[{"daGradi":12.5,"min":315,"max":320},{"daGradi":17,"min":315,"max":330},{"daGradi":26,"min":315,"max":340},{"daGradi":40,"min":315,"max":345}],"riconosci":/COPPO\s+DI\s+GRECIA/i},
    {"id":"coppo-borgo","nome":"Coppo del Borgo (cemento)","stato":"dubbio","passoMin":315,"passoMax":345,"larghezza":380,"perPendenza":[{"daGradi":12.5,"min":315,"max":320},{"daGradi":17,"min":315,"max":330},{"daGradi":26,"min":315,"max":340},{"daGradi":40,"min":315,"max":345}],"avviso":"Valori da confermare in ufficio.","riconosci":/COPPO\s+DEL\s+BORGO/i},
    {"id":"tegal","nome":"Tegal Innotech (piana in cemento)","stato":"dubbio","passoMin":295,"passoMax":345,"larghezza":310,"perPendenza":[{"daGradi":13,"min":295,"max":295},{"daGradi":20,"min":295,"max":320},{"daGradi":25,"min":295,"max":340}],"avviso":"Valori da confermare in ufficio.","riconosci":/TEGAL/i},
    {"id":"titan","nome":"Coppo Titan (cemento, grande)","stato":"dubbio","passoMin":null,"passoMax":null,"larghezza":null,"pzM2":5,"avviso":"Passo dei listoni e larghezza non dati: listoni non calcolati.","riconosci":/\bTITAN\b/i},
    {"id":"frankfurter","nome":"Frankfurter Pfanne («Francoforte», cemento)","stato":"ok","passoMin":312,"passoMax":345,"larghezza":300,"perPendenza":[{"daGradi":0,"min":312,"max":320},{"daGradi":22,"min":312,"max":335},{"daGradi":30,"min":312,"max":345}],"riconosci":/FRANCOFORTE|FRANKFURTER/i},
    {"id":"portoghese","nome":"Portoghese (laterizio)","stato":"dubbio","passoMin":300,"passoMax":335,"larghezza":280,"avviso":"Valori da confermare in ufficio.","riconosci":/PORTOGHESE/i},
    {"id":"doppio-romano","nome":"Doppio Romano (laterizio)","stato":"dubbio","passoMin":315,"passoMax":345,"larghezza":295,"avviso":"Valori da confermare in ufficio."},
    {"id":"coppo-classico","nome":"Coppo Classico (laterizio)","stato":"dubbio","passoMin":270,"passoMax":310,"larghezza":null,"pzM2":20,"avviso":"Valori da confermare in ufficio."},
    {"id":"coppo-ticino","nome":"Coppo 50 cm tradizionale Ticino","stato":"dubbio","passoMin":280,"passoMax":320,"larghezza":null,"pzM2":17,"avviso":"Valori da confermare in ufficio."},
    {"id":"coppi-piemontese","nome":"Coppi alla piemontese (17 fondo + 17 coperchio)","stato":"dubbio","passoMin":170,"passoMax":170,"larghezza":null,"pzM2":34,"listoniLungoFalda":true,"avviso":"Valori da confermare in ufficio.","riconosci":/PIEMONTESE/i},
    {"id":"ardesia-naturale-grande","nome":"Ardesia naturale grande","stato":"dubbio","passoMin":90,"passoMax":130,"larghezza":null,"pzM2":25,"avviso":"Valori da confermare in ufficio."},
    {"id":"ardesia-naturale-piccola","nome":"Ardesia naturale piccola","stato":"dubbio","passoMin":90,"passoMax":110,"larghezza":null,"pzM2":35,"avviso":"Valori da confermare in ufficio."},
    {"id":"ardesia-400x600","nome":"Ardesia 400 × 600 posa doppia","stato":"ok","passoMin":240,"passoMax":260,"larghezza":400,"perPendenza":[{"daGradi":0,"min":240,"max":240,"pz":10.3},{"daGradi":30,"min":250,"max":250,"pz":9.9},{"daGradi":40,"min":260,"max":260,"pz":9.5}],"riconosci":/400\s*[x×]\s*600/i},
    {"id":"ardesia-400x400","nome":"Ardesia 400 × 400 posa doppia","stato":"ok","passoMin":140,"passoMax":160,"larghezza":400,"perPendenza":[{"daGradi":0,"min":140,"max":140,"pz":17.5},{"daGradi":30,"min":150,"max":150,"pz":16.4},{"daGradi":40,"min":160,"max":160,"pz":15.4}],"riconosci":/400\s*[x×]\s*400/i},
    {"id":"gres-400x250","nome":"Gres porcellanato 400 × 250","stato":"ok","passoMin":140,"passoMax":180,"larghezza":250,"avviso":"Il passo (14/16/18 cm) dipende anche da lunghezza della falda e zona climatica: controllare la tabella del produttore.","riconosci":/GRES-400-250/i},
    {"id":"gres-400x400","nome":"Gres porcellanato 400 × 400","stato":"ok","passoMin":205,"passoMax":220,"larghezza":null,"pzM2":8.5}
  ];

  const trova = id => TEGOLE.find(t => t.id === id) || null;

  // Passo permesso per quella pendenza: { min, max, pz, nota } (min/max null = non dato dal produttore)
  function passoPermesso(t, gradi) {
    if (t.perPendenza && t.perPendenza.length) {
      const righe = t.perPendenza.filter(r => r.daGradi <= gradi + 1e-9);
      const r = righe.length ? righe[righe.length - 1] : t.perPendenza[0];
      const nota = righe.length ? `tabella del produttore: da ${String(r.daGradi).replace('.', ',')}° passo ${r.min === r.max ? r.min / 10 : r.min / 10 + '–' + r.max / 10} cm`
        : `pendenza sotto la tabella del produttore: uso la prima riga (passo ${r.min / 10}–${r.max / 10} cm)`;
      return { min: r.min, max: r.max, pz: r.pz != null ? r.pz : null, nota };
    }
    return { min: t.passoMin, max: t.passoMax, pz: null, nota: t.passoMin != null ? 'intervallo del produttore' : 'passo non dato' };
  }

  // Tegola proposta dalle voci spuntate dell'offerta (prima voce di copertura che si riconosce)
  // Il testo della voce vale insieme ai testi principali sopra di lei (es. «Copertura mediante tegole … LUDOVICI» sopra
  // la variante «Pendenza dei correntini»): stessa regola del PDF (documento.titoliDi).
  function proponiTegola(off) {
    for (const c of off.capitoli || []) {
      const voci = c.voci || [];
      for (let i = 0; i < voci.length; i++) {
        const v = voci[i];
        if (v.usa === false || v.tipo !== 'voce' || v.eventuale) continue;   // usa non scritto (offerte dall'Excel) = usata, come nel calcolo
        const testo = [v.descrizione || ''].concat(DOC.titoliDi(voci, i).map(j => voci[j].descrizione || '')).join(' ');
        if (!/tegol|coppi|ardesi|copertura/i.test(testo)) continue;
        const t = TEGOLE.find(x => x.riconosci && x.riconosci.test(testo));
        if (t) return { id: t.id, voce: v.id, numero: v.numero || '' };
      }
    }
    return null;
  }

  root.CTTegole = { TEGOLE, trova, passoPermesso, proponiTegola };
})(CT);

/*
 * QUANTITÀ D'UFFICIO (Spartizione, passo 2, 3.11.2026) — Preventivi, Carpenteria Ticinese Sagl
 * ------------------------------------------------------------------------------------------
 * Decisione di Umberto (3.11.2026): le formule stanno in UN posto solo (questo motore). Qui si contano, con le STESSE
 * misure dell'offerta (misura SUP con le sue righe in cm e la pendenza del tetto):
 *   tegole · listoni (barre da 4 o 5 m) · controlistoni (barre da 4 o 5 m) · pannelli di isolante (1 o 2 strati).
 * La scheda Spartizione dell'App Cantieri usa queste stesse funzioni.
 *
 * Geometria di una falda = una riga della misura SUP (larg × lung × pezzi, come la scrive l'architetto):
 *   Lg = larghezza (cm → m) = lunghezza lungo la gronda, sporti laterali compresi
 *   Lp = lunghezza (cm → m) = profondità della falda in pianta, sporto di gronda compreso
 *   k  = coefficiente di falda (pendenza del tetto, come nella misura SUP)
 *   Lf = Lp × k = lunghezza della falda lungo la pendenza (gronda → colmo)
 *
 * FORMULE (ogni risultato porta la sua spiegazione «perche»):
 *   primo listone     a 3 cm dalla scossalina sottotetto (bordo di gronda), impostazione primoListone (Umberto 4.11.2026)
 *   file di tegole    N = per eccesso ((Lf − primo listone − stacco dal colmo) / passo)                 passo dentro l'intervallo del produttore
 *   passo proposto    N = per eccesso (Lf / passo massimo), passo = Lf / N per eccesso al mm (file tutte uguali)
 *   pz/m²             1'000'000 / (passo mm × larghezza mm)        (o pz fissi / tabella del produttore)
 *   tegole            per eccesso (SUP dell'offerta m² × pz/m² × (1 + scarto %))   scarto di base 3 % OLTRE al +3 % della SUP (Umberto)
 *   listoni           ml = (N + 1) × Lg per falda (N + 2 con «listone al colmo»); barre = per eccesso (ml × (1 + sfrido %) / lunghezza barra)
 *   controlistoni     ml = (Lg / interasse travi per difetto + 1) × Lf per falda; barre come i listoni
 *   isolante          pannelli = per eccesso (superficie × (1 + scarto %) / (larghezza × lunghezza pannello))
 *                     strato 1 = solo sopra la casa (senza sporti), strato 2 = tutta la falda (con sporti)
 *                     superficie con sporti = SUP dell'offerta; senza sporti = stessa maggiorazione della SUP
 *
 * off.quantita = {               (manca = valori di base, vedi BASE)
 *   TUTTE LE MISURE IN METRI (regola di Umberto 4.11.2026; prima cm/mm: modello.migraMetri)
 *   tegola: id (tegole.js) | null = proposta dalle voci spuntate,  passoMano: m | null,  scartoTegole: %,
 *   primoListone: m, sporgenzaBordo: m, primaFila: m dal bordo | null, primaFilaSposta: m, staccoColmo: m, staccoMinimo: m, staccoMassimo: m (dal colmo), gioco: sì/no, frontone: sì/no, pzMazzo: pezzi, gommini: { ogni: m },
 *   listoni: { lungBarra: 4|5, sfrido: %, listoneColmo: sì/no },  controlistoni: { lungBarra: 4|5, sfrido: %, interasse: m },
 *   sportoGronda: m (in pianta),  sportoLati: m (somma dei due lati),  falde: [{ sportoGronda?, sportoLati? }] per riga di SUP,
 *   isolante: { strati: 1|2, unoSu: 'tutta'|'casa', pannelli: [{ nome, larg m, lung m, scarto % }, { … }] }
 *   Dati delle tegole (tegole.js: passo, larghezza) in mm come le schede del produttore.
 * }
 */
(function (root) {
  'use strict';
  const nodo = false;
  const MOD = nodo ? require('./modello.js') : root.CTModello;
  const TEG = nodo ? require('./tegole.js') : root.CTTegole;

  const n = x => (typeof x === 'number' && isFinite(x) ? x : 0);
  const x15 = x => Math.round(x * 1e9) / 1e9;          // toglie il rumore dei decimali prima di arrotondare
  const eccesso = x => Math.ceil(x15(x));
  const difetto = x => Math.floor(x15(x));
  const it = (x, dec = 2) => {                           // numero all'italiana per le spiegazioni: 1'234,56 (zeri finali tolti)
    const s = x15(x).toFixed(dec);
    let [i, d] = s.split('.');
    d = d ? d.replace(/0+$/, '') : '';
    return i.replace(/\B(?=(\d{3})+(?!\d))/g, "'") + (d ? ',' + d : '');
  };

  // Valori di base (risposte di Umberto, 3.11.2026), tutti modificabili per offerta nella schermata
  const BASE = {
    tegola: null, passoMano: null, scartoTegole: 3,       // +3 % OLTRE al +3 % della SUP dell'offerta (Umberto)
    primoListone: 0.03,                                   // m (3 cm) dalla scossalina sottotetto (bordo di gronda) al listone di gronda (Umberto 4.11.2026)
    sporgenzaBordo: 0.03,                                 // m (3 cm) che la tegola sporge oltre il bordo laterale, per lato (Umberto 4.11.2026: «3 cm, a volte meno»)
    staccoColmo: 0.03,                                    // m: sul colmo un listone largo 6 cm, 3 cm per parte (Umberto 5.11.2026)
    staccoMinimo: 0.028,                                  // m: mai meno di 28 mm dal colmo (Umberto 5.11.2026)
    staccoMassimo: 0.05,                                  // m: oltre 5 cm dal colmo l'app avvisa, non blocca (Umberto 5.11.2026)
    primaFilaSposta: 0.02,                                // m: l'app può alzare la prima fila fino a 2 cm per non tagliare l'ultima (Umberto 5.11.2026)
    primaFila: 0.35,                                      // m: prima fila a 35 cm dal bordo (Umberto 5.11.2026). null = fila 1 a primo listone + passo, come prima
    gioco: true,                                          // l'ultima fila non si taglia, se è possibile (Umberto 5.11.2026). Spento = il calcolo di prima
    frontone: false,                                      // tegola di frontone: la decide lui; se è in offerta ci va, se no non ci va (Umberto 5.11.2026)
    gommini: { ogni: 0.85 },                              // m: 1 gommino ogni 85 cm per controlistone (vecchia app Spartizione)
    listoni: { lungBarra: 5, sfrido: 10, listoneColmo: false },
    colmo: { sfrido: 4 },                                 // coppi di colmo: pezzi al ml della SCHEDA + sfrido % a parte (Umberto 4.11.2026:
                                                          // il suo 2,5 al metro deve uscire come 2,4 della scheda + sfrido) → 2,4 × 1,04 = 2,496
    controlistoni: { lungBarra: 5, sfrido: 5, interasse: 0.6 },   // interasse delle travi: m
    sportoGronda: 0, sportoLati: 0, falde: [],
    isolante: { strati: 2, unoSu: 'tutta', pannelli: [{ nome: 'Strato 1 (sopra la casa)', larg: 0.6, lung: 1.2, scarto: 5 }, { nome: 'Strato 2 (tutta la falda)', larg: 0.6, lung: 1.2, scarto: 5 }] },   // m
  };
  function impostazioni(off) {
    const q = off.quantita || {};
    const iso = Object.assign({}, BASE.isolante, q.isolante || {});
    iso.pannelli = [0, 1].map(i => Object.assign({}, BASE.isolante.pannelli[i], (q.isolante && q.isolante.pannelli && q.isolante.pannelli[i]) || {}));
    return Object.assign({}, BASE, q, {
      listoni: Object.assign({}, BASE.listoni, q.listoni || {}),
      colmo: Object.assign({}, BASE.colmo, q.colmo || {}),
      controlistoni: Object.assign({}, BASE.controlistoni, q.controlistoni || {}),
      falde: q.falde || [], isolante: iso, gommini: Object.assign({}, BASE.gommini, q.gommini || {}),
    });
  }

  // coefficiente di una riga della misura (stessa regola di modello.js: coeffRiga)
  function coeffRiga(r, m, gradi) {
    if (typeof r.coeff === 'number') return r.coeff;
    const c = MOD.coeffPendenza(gradi);
    if (m.pendenza === 'falda') return c;
    if (m.pendenza === 'cantonale') return (c - 1) / 2 + 1;
    return 1;
  }

  /**
   * Avviso di pendenza dalla scheda del produttore (4.11.2026): inclinazione minima con sottotetto per sollecitazione normale / aumentata /
   * straordinaria e «inferiore al minimo» (solo con ulteriori provvedimenti). Ritorna il testo o null (pendenza ok o niente scheda).
   */
  function avvisoPendenza(t, gradi) {
    const P = t && t.pendenza;
    if (!P || !(gradi > 0) || P.normale == null || gradi >= P.normale - 1e-9) return null;
    const g = `Pendenza del tetto ${it(gradi, 1)}°`, fonte = P.fonte ? ` (fonte: ${P.fonte})` : '';
    if (P.aumentata != null && gradi >= P.aumentata - 1e-9 && P.aumentata < P.normale)
      return `${g}: con la ${t.nome.split(' ')[0]} il sottotetto normale va da ${it(P.normale)}°; qui serve il sottotetto per sollecitazione aumentata (da ${it(P.aumentata)}°)${fonte}.`;
    if (P.straordinaria != null && gradi >= P.straordinaria - 1e-9)
      return `${g}: con la ${t.nome.split(' ')[0]} serve il sottotetto per sollecitazione straordinaria (da ${it(P.straordinaria)}°; normale da ${it(P.normale)}°)${fonte}.`;
    if (P.provvedimenti != null && gradi >= P.provvedimenti - 1e-9)
      return `${g}: sotto il minimo della ${t.nome.split(' ')[0]} (${it(P.straordinaria != null ? P.straordinaria : P.normale)}°): solo con ulteriori provvedimenti del produttore (ammesso da ${it(P.provvedimenti)}°)${fonte}.`;
    return `${g}: sotto ogni minimo della scheda della ${t.nome.split(' ')[0]} (${it(P.provvedimenti != null ? P.provvedimenti : P.normale)}°): non ammessa${fonte}.`;
  }

  // Passo e file di una falda lunga Lf metri
  function passoFalda(Lf, perm, passoMano) {
    const L = Lf * 1000;
    if (passoMano) {
      const fuori = (perm.min != null && passoMano < perm.min) || (perm.max != null && passoMano > perm.max);
      return { passo: passoMano, N: eccesso(L / passoMano), scelto: 'a mano', fuori };
    }
    if (perm.max == null) return { passo: null, N: null, scelto: 'non dato', fuori: false };
    let N = eccesso(L / perm.max);
    let passo = eccesso(L / Math.max(N, 1));
    if (passo < perm.min) { passo = perm.min; N = eccesso(L / passo); } // intervallo stretto (passo fisso): l'ultima fila si chiude a parte
    return { passo, N, scelto: 'proposto', fuori: false };
  }

  /*
   * GIOCO DELLE TEGOLE (Umberto 5.11.2026): prima di tagliare si allunga o si accorcia il passo, dentro il gioco, uguale per tutte le file.
   * Gioco = passo minimo e massimo della tegola (t.gioco dalla scheda; se no l'intervallo del produttore).
   * Prima fila a 35 cm dal bordo (q.primaFila), o dove la scrive lui. Fila k a primaFila + (k − 1) × passo. Il listone di gronda resta dov'è.
   * Spazio A = falda − prima fila, al mm. Con M passi: stacco = A − M × passo, passo intero al mm.
   *   1. Prima fila al valore scritto. Si cerca stacco fra il minimo (2,8 cm) e il massimo (5 cm), il più vicino a quello di base (3 cm).
   *      Più numeri di file vanno bene: il passo più vicino al consigliato (t.gioco.consigliato; se no il massimo: meno file).
   *   2. Non c'è: l'app sposta la prima fila in su, mai in giù, di quanto basta, fino a q.primaFilaSposta (2 cm) sopra il valore scritto. Lo spostamento più piccolo.
   *   3. Non c'è neanche così: prima fila al valore scritto e una fila in più, ferma allo stacco di base, «ultima fila da tagliare: X cm», anche corta.
   *      Il passo è quello che taglia meno: L = A − stacco di base; (M + 1) file intere a passo p non ci starebbero; si taglia (M + 1) × p − L.
   * Stacco di base scritto a mano oltre il massimo: vale il suo numero, con un avviso. È lui che decide.
   */
  function giocoDi(t, perm) {
    if (t && t.gioco) return Object.assign({ noto: true }, t.gioco);
    return { min: perm.min, max: perm.max, consigliato: perm.max, noto: perm.min != null && perm.max > perm.min };
  }
  function passoConGioco(LfMm, origineMm, conPrimaFila, st, g, spostaMaxMm) {
    const A0 = Math.round(x15(LfMm)) - Math.round(x15(origineMm));   // mm dalla prima quota al colmo, come le quote a schermo
    const file = M => (conPrimaFila ? M + 1 : M);
    const intervallo = g.min === g.max ? `passo ${g.min} mm` : `gioco ${g.min}–${g.max} mm`;
    const nessuna = { passo: g.min, N: 0, scelto: 'gioco', fuori: false, staccoMm: Math.max(0, A0), taglio: false, spostaMm: 0, spiega: `${intervallo}: falda troppo corta, nessuna fila` };
    if (A0 < st.min) return nessuna;
    const cerca = A => {
      let meglio = null;
      for (let M = Math.max(conPrimaFila ? 0 : 1, Math.floor((A - st.max) / g.max)); M * g.min <= A - st.min; M++) {
        let qui = null;
        const ideale = M ? (A - st.base) / M : g.consigliato;
        for (const x of M ? [Math.floor(ideale), Math.ceil(ideale)] : [g.consigliato]) {
          const passo = Math.min(g.max, Math.max(g.min, x)), sta = A - M * passo;
          if (sta < st.min || sta > st.max) continue;
          if (!qui || Math.abs(sta - st.base) < Math.abs(qui.sta - st.base)) qui = { M, passo, sta };
        }
        if (!qui) continue;
        const peso = c => [Math.abs(c.passo - g.consigliato), Math.abs(c.sta - st.base)];
        if (!meglio || peso(qui)[0] < peso(meglio)[0] - 1e-9 || (Math.abs(peso(qui)[0] - peso(meglio)[0]) < 1e-9 && peso(qui)[1] < peso(meglio)[1])) meglio = qui;
      }
      return meglio;
    };
    for (let sposta = 0; sposta <= (conPrimaFila ? spostaMaxMm : 0); sposta++) {
      const b = cerca(A0 - sposta);
      if (b) return { passo: b.passo, N: file(b.M), scelto: 'gioco', fuori: false, staccoMm: b.sta, taglio: false, spostaMm: sposta,
        spiega: `${intervallo}: ${file(b.M)} file a ${b.passo} mm, stacco dal colmo ${b.sta} mm, nessuna fila da tagliare` + (sposta ? `; prima fila spostata di ${sposta} mm` : '') };
    }
    // Non ci sta dentro il gioco: prima fila al valore scritto, una fila in più col passo che taglia meno
    const L = A0 - st.base;
    if (L <= 0) return nessuna;
    let taglia = null;
    for (let M = Math.max(0, Math.floor(L / g.max) - 1); M * g.min < L; M++) {
      const passo = Math.max(g.min, Math.floor(L / (M + 1)) + 1);
      if (passo > g.max || M * passo >= L) continue;
      const via = (M + 1) * passo - L;
      if (!taglia || via < taglia.via) taglia = { M, passo, via };
    }
    if (!taglia) return nessuna;
    const resta = L - taglia.M * taglia.passo;
    return { passo: taglia.passo, N: file(taglia.M) + 1, scelto: 'gioco', fuori: false, staccoMm: st.base, taglio: true, spostaMm: 0,
      spiega: `${intervallo}: dentro il gioco non ci sta; ${file(taglia.M)} file a ${taglia.passo} mm e l'ultima da tagliare, ${resta} mm` };
  }
  // Passo e file di una falda (mm). Interruttori: q.gioco spento = il calcolo di prima, col solo stacco; q.primaFila vuoto = fila 1 a primo listone + passo.
  function passoScelto(LfMm, off0Mm, q, t, perm, passoManoMm) {
    const lungoFalda = !!(t && t.listoniLungoFalda);
    const pf = !lungoFalda && n(q.primaFila) > 0 ? Math.min(x15(n(q.primaFila) * 1000), LfMm) : null;
    const origine = pf != null ? pf : off0Mm;
    const base = lungoFalda ? 0 : Math.max(0, x15(n(q.staccoColmo) * 1000));
    const sta = Math.min(base, Math.max(0, LfMm - origine));
    if (!q.gioco || passoManoMm || lungoFalda || perm.max == null) {
      const Lu = sta > 0 || pf != null ? Math.round(LfMm - origine - sta) : LfMm - origine;   // al mm: niente fila in più per mezzo millimetro
      const p = passoFalda(Lu / 1000, perm, passoManoMm);
      const fuoriPrima = pf != null && p.N != null;
      return Object.assign(p, { N: fuoriPrima ? p.N + 1 : p.N, staccoMm: sta, taglio: false, primaFilaMm: pf, spostaMm: 0,
        spiega: fuoriPrima ? `prima fila ${pf} mm + ${p.N} passi da ${p.passo} mm` : undefined });
    }
    const st = { base, min: Math.min(base, Math.max(0, x15(n(q.staccoMinimo) * 1000))), max: Math.max(base, x15(n(q.staccoMassimo) * 1000)) };
    const r = passoConGioco(LfMm, origine, pf != null, st, giocoDi(t, perm), Math.floor(x15(Math.max(0, n(q.primaFilaSposta)) * 1000)));
    return Object.assign(r, { primaFilaMm: pf != null ? pf + r.spostaMm : null });
  }

  function pzAlM2(t, perm, passo) {
    if (perm.pz != null) return { pz: perm.pz, perche: `${it(perm.pz)} pz/m² dalla tabella del produttore` };
    if (t.pzM2 != null) return { pz: t.pzM2, perche: `${it(t.pzM2)} pz/m² fissi (${t.stato === 'dubbio' ? 'da confermare' : 'dato del produttore'})` };
    if (!passo || !t.larghezza) return { pz: null, perche: 'pz/m² non calcolabili: manca passo o larghezza' };
    const pz = 1e6 / (passo * t.larghezza);
    return { pz, perche: `1'000'000 / (passo ${passo} mm × larghezza ${t.larghezza} mm) = ${it(pz, 3)} pz/m²` };
  }

  /**
   * Quantità d'ufficio dell'offerta. Ritorna:
   * { tegola, sup: { reale, usato, maggiorazione }, falde: […], tegole, listoni, controlistoni, isolante: { strati: […] }, avvisi }
   * Ogni numero finale ha { valore, perche } (spiegazione in italiano, leggibile).
   */
  function calcolaQuantita(off) {
    off = MOD.assicuraMetri(off);                         // file vecchi in cm/mm → metri
    const q = impostazioni(off);
    const passoManoMm = q.passoMano ? Math.round(n(q.passoMano) * 10000) / 10 : null;   // passo a mano: m → mm (dati tegole in mm)
    const avvisi = [];
    const gradi = off.pendenza ? n(off.pendenza.gradi) : 0;
    const sup = (off.misure || []).find(m => m.id === 'sup');
    const vm = sup ? MOD.valoriMisura(sup, gradi) : { reale: 0, usato: 0 };
    const maggiorazione = vm.reale > 0 ? vm.usato / vm.reale : 1;

    // tegola: scelta a mano o proposta dalle voci spuntate
    const proposta = TEG.proponiTegola(off);
    const idT = q.tegola || (proposta && proposta.id) || null;
    const t = idT ? TEG.trova(idT) : null;
    const tegola = t ? { id: t.id, nome: t.nome, stato: t.stato, avviso: t.avviso || null,
      da: q.tegola ? 'scelta a mano' : `proposta dalla voce ${proposta.numero}` } : null;
    if (!t) avvisi.push('Scegli la tegola: nessuna voce di copertura spuntata la fa riconoscere.');
    if (t && t.stato === 'dubbio') avvisi.push(`⚠️ Dato da confermare (tabella tegole): ${t.nome}. ${t.avviso || ''}`);
    const perm = t ? TEG.passoPermesso(t, gradi) : { min: null, max: null, pz: null, nota: '' };
    // pendenza minima SOLO dalla scheda del produttore (tegole.js, «pendenza» con file e pagina); senza scheda: nessun avviso
    const avP = avvisoPendenza(t ? TEG.trova(t.id) : null, gradi);
    if (avP) avvisi.push(avP);
    if (!sup || vm.usato <= 0) avvisi.push('La misura SUP è vuota: scrivi le falde nella scheda «2 · Misure».');

    // ---------------- falde (righe della SUP)
    const falde = [];
    const righe = sup && sup.righe && sup.righe.length ? sup.righe : [];
    righe.forEach((r, i) => {
      const f = q.falde[i] || {};
      const Lg = n(r.larg), Lp = n(r.lung), pz = r.pz == null ? 1 : n(r.pz), k = coeffRiga(r, sup, gradi);
      const Lf = Lp * k;
      const S = Lg * Lf * pz;
      const sg = n(f.sportoGronda != null ? f.sportoGronda : q.sportoGronda);
      const sl = n(f.sportoLati != null ? f.sportoLati : q.sportoLati);
      const Ssenza = Math.max(0, Lg - sl) * Math.max(0, Lp - sg) * k * pz;
      // le file si dividono sulla falda MENO il primo listone (3 cm dalla scossalina, Umberto 4.11.2026); coppi alla piemontese: no
      const off0 = t && !t.listoniLungoFalda ? Math.min(n(q.primoListone), Lf) : 0;
      // stacco dal colmo (Umberto 5.11.2026): l'ultima fila non arriva mai al colmo. Coppi alla piemontese: no.
      const p = t ? passoScelto(Lf * 1000, off0 * 1000, q, t, perm, passoManoMm) : { passo: null, N: null, scelto: '', fuori: false, staccoMm: 0 };
      const stacco = (p.staccoMm || 0) / 1000;
      if (stacco > 0 && stacco >= Lf - off0) avvisi.push(`Falda ${i + 1}: lo stacco dal colmo è più lungo della falda.`);
      const Lu = stacco > 0 ? Math.round((Lf - off0 - stacco) * 1000) / 1000 : Lf - off0;   // al mm: niente fila in piu per mezzo millimetro
      const pzm = t ? pzAlM2(t, perm, p.passo) : { pz: null, perche: '' };
      // listoni portategola: una linea per fila + quella di gronda (N + 1), + quella al colmo se accesa (N + 2), lunghe Lg;
      // coppi alla piemontese: lungo la falda (l'interruttore del colmo non conta)
      let listoniMl = null, listoniPerche = '';
      if (t && p.passo) {
        if (t.listoniLungoFalda) {
          const linee = difetto(Lg * 1000 / p.passo) + 1;
          listoniMl = linee * Lf * pz;
          listoniPerche = `(${it(Lg)} m / ${it(p.passo / 1000, 3)} m per difetto + 1) = ${linee} linee × ${it(Lf, 3)} m${pz !== 1 ? ' × ' + pz : ''} = ${it(listoniMl)} ml`;
        } else {
          const colmo = !!q.listoni.listoneColmo;
          listoniMl = (p.N + (colmo ? 2 : 1)) * Lg * pz;
          listoniPerche = `(${p.N} file + ${colmo ? '2: gronda e colmo' : '1: gronda'}) × ${it(Lg)} m${pz !== 1 ? ' × ' + pz : ''} = ${it(listoniMl)} ml`;
        }
      }
      const ic = n(q.controlistoni.interasse);
      const lineeC = ic > 0 ? difetto(Lg / ic) + 1 : 0;
      const controMl = lineeC * Lf * pz;
      if (p.fuori) avvisi.push(`Falda ${i + 1}: passo a mano ${p.passo} mm fuori dall'intervallo del produttore (${perm.min}–${perm.max} mm).`);
      if (Ssenza <= 0 && S > 0) avvisi.push(`Falda ${i + 1}: gli sporti sono più grandi della falda (superficie senza sporti = 0).`);
      falde.push({
        indice: i, nome: r.descrizione || `Falda ${i + 1}`, Lg, Lp, k, Lf, pz, S, Ssenza, sportoGronda: sg, sportoLati: sl,   // m
        passo: p.passo, N: p.N, passoScelto: p.scelto, pzM2: pzm.pz, pzPerche: pzm.perche,
        tegolePerFila: t && t.larghezza ? eccesso(Lg * 1000 / t.larghezza) : null,
        listoniMl, listoniPerche, lineeControlistoni: lineeC, controlistoniMl: controMl,
        controlistoniPerche: `(${it(Lg)} m / ${it(ic)} m per difetto + 1) = ${lineeC} linee × ${it(Lf, 3)} m${pz !== 1 ? ' × ' + pz : ''} = ${it(controMl)} ml`,
        primoListone: off0, staccoColmo: stacco, taglio: !!p.taglio, primaFila: p.primaFilaMm != null ? p.primaFilaMm / 1000 : null, primaFilaSpostata: (p.spostaMm || 0) / 1000,   // m
        passoPerche: (p.primaFilaMm != null ? '' : off0 || stacco ? `falda ${it(Lf, 3)} m − primo listone ${it(off0 * 100, 1)} cm${stacco ? ` − stacco dal colmo ${it(stacco * 100, 1)} cm` : ''} = ${it(Lu, 3)} m; ` : '') + (p.spiega ? p.spiega : p.passo == null ? 'passo non dato dal produttore' : p.scelto === 'a mano'
          ? `passo scritto a mano ${p.passo} mm; file = ${it(Lu, 3)} m / ${it(p.passo / 1000, 3)} m per eccesso = ${p.N}`
          : `file = ${it(Lu, 3)} m / passo massimo ${it(perm.max / 1000, 3)} m per eccesso = ${p.N}; passo = ${it(Lu * 1000, 1)} mm / ${p.N} per eccesso = ${p.passo} mm (${perm.nota})`),
      });
    });
    const sReale = falde.reduce((s, f) => s + f.S, 0);
    const sSenzaReale = falde.reduce((s, f) => s + f.Ssenza, 0);
    const geometria = falde.length > 0;
    if (!geometria && vm.usato > 0) avvisi.push('La SUP non ha righe (larghezza × lunghezza): listoni e controlistoni calcolati dalla superficie, sporti non calcolabili.');

    // ---------------- tegole: SUP dell'offerta × pz/m² (media pesata se le falde hanno passi diversi)
    let tegole = { valore: null, perche: 'manca la tegola o il passo' };
    let pzMedio = null;
    if (t) {
      if (geometria) {
        const conPz = falde.filter(f => f.pzM2 != null);
        if (conPz.length === falde.length && sReale > 0) pzMedio = falde.reduce((s, f) => s + f.S * f.pzM2, 0) / sReale;
      } else {
        const passo = passoManoMm || perm.max;
        pzMedio = pzAlM2(t, perm, passo).pz;
      }
      if (pzMedio != null && vm.usato > 0) {
        const lordo = vm.usato * pzMedio * (1 + n(q.scartoTegole) / 100);
        const passi = [...new Set(falde.map(f => f.passo))].filter(Boolean);
        tegole = {
          valore: eccesso(lordo), pzM2: pzMedio,
          perche: `SUP dell'offerta ${it(vm.usato)} m² × ${it(pzMedio, 3)} pz/m²` + (passi.length === 1 ? ` (passo ${passi[0]} mm)` : passi.length > 1 ? ' (media delle falde)' : '')
            + (n(q.scartoTegole) ? ` × (1 + ${it(q.scartoTegole)} % scarto)` : '') + ` = ${it(lordo)} → per eccesso ${eccesso(lordo)} pezzi`,
        };
      }
    }

    // ---------------- coppi di colmo (solo se la tegola ha il colmo nella scheda: tegole.js «colmo»)
    //   pezzi = per eccesso ((colmi + cantonali, ml dell'offerta) × pezzi al ml della scheda × (1 + sfrido %))
    let colmo = null;
    const dt = t ? TEG.trova(t.id) : null;
    if (dt && dt.colmo && dt.colmo.pzMl) {
      const mlDi = id => { const m = (off.misure || []).find(x => x.id === id); return m ? n(MOD.valoriMisura(m, gradi).usato) : 0; };
      const mlC = mlDi('colmi'), mlK = mlDi('cantonali'), ml = mlC + mlK;
      const sf = n(q.colmo.sfrido), pzMl = dt.colmo.pzMl, conSfrido = pzMl * (1 + sf / 100);
      const nomeMio = dt.nomi && dt.nomi.coppo ? dt.nomi.coppo[0] : 'coppi di colmo';
      colmo = { nome: nomeMio, nomeZZ: dt.colmo.nome, ml: x15(ml), mlColmi: mlC, mlCantonali: mlK, pzMl, sfrido: sf, pzMlConSfrido: x15(conSfrido),
        pezzi: ml > 0 ? eccesso(ml * conSfrido) : null, fonte: dt.colmo.fonte,
        perche: `(colmi ${it(mlC)} + cantonali ${it(mlK)} ml) × ${it(pzMl, 2)} pz/ml della scheda (${dt.colmo.nome}) × (1 + ${it(sf)} % sfrido) = ${it(ml)} × ${it(conSfrido, 3)} = ${it(ml * conSfrido)} → per eccesso ${eccesso(ml * conSfrido)} pezzi` };
    }

    // ---------------- listoni e controlistoni (barre da 4 o 5 m)
    function barre(ml, conf, nome) {
      if (ml == null) return { ml: null, barre: null, perche: `${nome}: non calcolabili` };
      const L = n(conf.lungBarra) || 5, sf = n(conf.sfrido);
      const b = eccesso(ml * (1 + sf / 100) / L);
      return { ml: x15(ml), barre: b, lungBarra: L, sfrido: sf, perche: `${it(ml)} ml${sf ? ` × (1 + ${it(sf)} % sfrido)` : ''} / ${it(L)} m = ${it(ml * (1 + sf / 100) / L)} → per eccesso ${b} barre da ${it(L)} m` };
    }
    let mlListoni = null, mlContro = null;
    if (geometria) {
      if (falde.every(f => f.listoniMl != null)) mlListoni = falde.reduce((s, f) => s + f.listoniMl, 0);
      mlContro = falde.reduce((s, f) => s + f.controlistoniMl, 0);
    } else if (vm.usato > 0) {
      const passo = passoManoMm || perm.max;
      if (passo) mlListoni = vm.usato * 1000 / passo;
      if (n(q.controlistoni.interasse) > 0) mlContro = vm.usato / n(q.controlistoni.interasse);
    }
    const listoni = barre(mlListoni, q.listoni, 'Listoni');
    if (!geometria && mlListoni != null) listoni.perche = `SUP ${it(vm.usato)} m² / passo ${it((passoManoMm || perm.max) / 1000, 3)} m = ${it(mlListoni)} ml; ` + listoni.perche;
    const controlistoni = barre(mlContro, q.controlistoni, 'Controlistoni');
    if (!geometria && mlContro != null) controlistoni.perche = `SUP ${it(vm.usato)} m² / interasse ${it(n(q.controlistoni.interasse))} m = ${it(mlContro)} ml; ` + controlistoni.perche;

    // ---------------- isolante: strato 1 sopra la casa (senza sporti), strato 2 su tutta la falda (con sporti)
    const sCon = vm.usato;
    const sSenza = geometria ? eccesso(sSenzaReale * maggiorazione) : vm.usato;
    const perche1 = geometria
      ? `superficie senza sporti ${it(sSenzaReale)} m² × maggiorazione della SUP (${it(vm.usato)} / ${it(vm.reale)}) = ${it(sSenzaReale * maggiorazione)} → ${sSenza} m²`
      : `SUP dell'offerta ${it(vm.usato)} m² (sporti non calcolabili)`;
    function pannelli(S, pan, perSup) {
      const A = n(pan.larg) * n(pan.lung);              // m²
      if (!A || !S) return { superficie: S, pannelli: null, perche: 'superficie o pannello mancante' };
      const lordo = S * (1 + n(pan.scarto) / 100) / A;
      return { nome: pan.nome, superficie: S, larg: pan.larg, lung: pan.lung, scarto: n(pan.scarto), areaPannello: A, pannelli: eccesso(lordo),
        perche: `${perSup}; ${it(S)} m²${n(pan.scarto) ? ` × (1 + ${it(pan.scarto)} % scarto)` : ''} / (${it(n(pan.larg) * 100)} × ${it(n(pan.lung) * 100)} cm = ${it(A, 4)} m²) = ${it(lordo)} → per eccesso ${eccesso(lordo)} pannelli` };
    }
    const iso = q.isolante;
    const strati = [];
    if (n(iso.strati) === 2) {
      strati.push(Object.assign({ strato: 1, dove: 'solo sopra la casa (senza sporti)' }, pannelli(sSenza, iso.pannelli[0], perche1)));
      strati.push(Object.assign({ strato: 2, dove: 'tutta la falda (con sporti)' }, pannelli(sCon, iso.pannelli[1], `SUP dell'offerta ${it(sCon)} m²`)));
    } else if (n(iso.strati) === 1) {
      const casa = iso.unoSu === 'casa';
      strati.push(Object.assign({ strato: 1, dove: casa ? 'solo sopra la casa (senza sporti)' : 'tutta la falda (con sporti)' },
        pannelli(casa ? sSenza : sCon, iso.pannelli[0], casa ? perche1 : `SUP dell'offerta ${it(sCon)} m²`)));
    }

    return {
      tegola, gradi, passoPermesso: perm, sup: { reale: vm.reale, usato: vm.usato, maggiorazione, senzaSporti: sSenza, senzaSportiReale: sSenzaReale, geometria },
      falde, tegole, colmo, listoni, controlistoni, isolante: { strati }, avvisi, impostazioni: q,
    };
  }

  const API = { BASE, impostazioni, calcolaQuantita, passoFalda, passoScelto, passoConGioco, giocoDi, pzAlM2, avvisoPendenza, it };
  if (nodo) module.exports = API;
  else root.CTQuantita = API;
})(CT);

/*
 * SPARTIZIONE PER IL CANTIERE (capo squadra, 4.11.2026) — Preventivi, Carpenteria Ticinese Sagl
 * ------------------------------------------------------------------------------------------
 * Decisione di Umberto (3.11.2026): le formule stanno in UN posto solo. Qui NON c'è nessuna formula nuova di quantità:
 * tutto viene da quantita.calcolaQuantita (scheda «8 · Quantità»). Questo file mette i numeri nella forma che serve
 * sul tetto: per ogni falda il passo, le file, la QUOTA di ogni listone da segnare e il disegno della falda.
 * Il risultato contiene solo misure e quantita' (la prova lo controlla).
 *
 * Da usare poi nell'App Cantieri (scheda del capo squadra): funzioni pure, nessun React, nessuna pagina.
 *   spartizione(off)        → { tegola, falde: [...], materiale: [...], avvisi }
 *   disegnoFalda(falda)     → SVG (testo) della falda vista dall'alto lungo la pendenza, con listoni e quote
 *   segna(off, falda, n, sì/no)            listone segnato sul tetto (✓), salvato in off.spartizioneCantiere.segnati
 *   misuraCantiere(off, falda, cosa, m)    misura presa sul tetto (falda, gronda: METRI), salvata in off.spartizioneCantiere.falde
 *   Dati salvati in METRI (regola 4.11.2026; prima faldaCm/grondaCm: modello.migraMetri). Risultati qui sotto in mm (…Mm).
 *
 * QUOTE DEI LISTONI (misurate sulla falda, lungo la pendenza, dalla scossalina sottotetto = bordo di gronda, verso il colmo):
 *   listone di gronda      quota = primo listone (3 cm di base, impostazione «primoListone» della scheda Quantità; Umberto 4.11.2026)
 *   fila k (k = 1 … N)     quota = primo listone + k × passo, l'ultima al massimo = lunghezza della falda − stacco dal colmo (Umberto 5.11.2026)
 *   Sono le stesse N + 1 linee che quantita.js conta per i listoni (N + 2 con «listone al colmo»: il listone in più
 *   sta al colmo, alla stessa quota dell'ultima fila).
 *   Se una distanza è diversa dal passo (ultima fila), la riga è «diversa»: altro colore nel disegno e nella tabella (Umberto).
 *   Ultima fila corta: con passo fisso (es. Pada) la fila in alto si chiude a parte.
 * MISURE: di base quelle dell'ufficio (misura SUP del Preventivatore); se il capo squadra scrive le misure prese sul tetto
 *   (falda lungo la pendenza, gronda) valgono quelle per la spartizione. Il materiale da ordinare resta quello dell'ufficio.
 * TEGOLE DELLA FALDA (da posare, senza scarto) = file N × tegole per fila (quantita.js: per eccesso larghezza / copertura).
 * DA ORDINARE (tutto il tetto) = i numeri della scheda «8 · Quantità», scarti e sfridi compresi.
 */
(function (root) {
  'use strict';
  const nodo = false;
  const Q = nodo ? require('./quantita.js') : root.CTQuantita;
  const TEG = nodo ? require('./tegole.js') : root.CTTegole;
  const MOD = nodo ? require('./modello.js') : root.CTModello;

  const x9 = x => Math.round(x * 1e9) / 1e9;
  const mm = x => Math.round(x9(x));                     // quota al millimetro
  const it = Q.it;
  // mm → «35,0» cm (sempre un decimale = i millimetri)
  const cm1 = x => { const s = it(mm(x) / 10, 1); return /,/.test(s) ? s : s + ',0'; };

  /**
   * Spartizione dell'offerta per il cantiere. Ritorna:
   * { tegola, gradi, falde: [{ nome, larghezzaMm, faldaMm, passoMm, file, ultimaFilaMm, ultimaCorta, quote: [{ n, nome, quotaMm, distanzaMm }],
   *   listoneColmo, tegolePerFila, tegoleFalda, controlistoni: { linee, interasseCm, lunghezzaMm }, perche: {...} }],
   *   materiale: [{ cosa, quantita, unita, dettaglio, perche }], avvisi }
   */
  function spartizione(off) {
    off = MOD.assicuraMetri(off);                         // file vecchi in cm → metri
    const r = Q.calcolaQuantita(off);
    const q = r.impostazioni;
    // avvisi per il cantiere: la tegola si sceglie in ufficio; «SUP senza righe» lo dice già l'avviso delle falde qui sotto
    const avvisi = r.avvisi.filter(a => !/^La SUP non ha righe/.test(a))
      .map(a => /^Scegli la tegola/.test(a) ? 'Tegola non scelta: la sceglie l\'ufficio nella scheda «8 · Quantità» (nessuna voce di copertura la fa riconoscere).' : a);
    const t = r.tegola;
    const lungoFalda = !!(t && TEG.trova(t.id) && TEG.trova(t.id).listoniLungoFalda); // coppi alla piemontese: listoni lungo la falda
    const datiT = t ? TEG.trova(t.id) : null;
    const cant = off.spartizioneCantiere || {};                       // dati del cantiere (misure prese sul tetto, listoni segnati)
    const falde = r.falde.map(f => {
      // MISURA PRESA IN CANTIERE (Umberto 4.11.2026): se il capo squadra scrive la falda e la gronda misurate sul tetto,
      // valgono quelle; passo e file si rifanno con la STESSA funzione della scheda Quantità (quantita.passoFalda).
      const mc = (cant.falde || [])[f.indice] || {};
      const mFalda = Number(mc.falda) > 0, mGronda = Number(mc.gronda) > 0;   // misure del tetto in METRI
      const daCantiere = mFalda || mGronda;
      const Lf = mFalda ? x9(Number(mc.falda) * 1000) : f.Lf * 1000;   // lungo la pendenza, mm
      const Lg = mGronda ? x9(Number(mc.gronda) * 1000) : f.Lg * 1000; // lungo la gronda, mm
      const off0 = x9((f.primoListone || 0) * 1000);         // primo listone: mm dalla scossalina sottotetto
      // stacco dal colmo (Umberto 5.11.2026): quota massima = falda − stacco. Coppi alla piemontese: no.
      let sta = x9((f.staccoColmo || 0) * 1000), pf = f.primaFila != null ? x9(f.primaFila * 1000) : null, spostata = x9((f.primaFilaSpostata || 0) * 1000);   // prima fila: mm dal bordo
      let passo = f.passo, N = f.N, passoPerche = f.passoPerche;
      if (mFalda && t && !lungoFalda) {
        const p = Q.passoScelto(Lf, off0, q, datiT, r.passoPermesso, q.passoMano ? x9(Number(q.passoMano) * 1000) : null);
        passo = p.passo; N = p.N; sta = p.staccoMm; pf = p.primaFilaMm != null ? p.primaFilaMm : null; spostata = p.spostaMm || 0;
        passoPerche = pf != null ? `misura presa in cantiere: falda ${cm1(Lf)} cm; ${p.spiega || ''}` : `misura presa in cantiere: falda ${cm1(Lf)} cm − primo listone ${cm1(off0)} cm${sta ? ` − stacco dal colmo ${cm1(sta)} cm` : ''} = ${cm1(Lf - off0 - sta)} cm; `
          + (p.spiega ? p.spiega : p.passo == null ? 'passo non dato dal produttore' : `file = ${cm1(Lf - off0 - sta)} / ${cm1(p.scelto === 'a mano' ? p.passo : r.passoPermesso.max)} cm per eccesso = ${p.N}; passo ${cm1(p.passo)} cm`);
      }
      const segnati = new Set(((cant.segnati || {})[f.indice]) || []);
      const quote = [];
      if (passo && N && !lungoFalda) {
        quote.push({ n: 0, nome: 'Listone di gronda', quotaMm: mm(off0), distanzaMm: mm(off0), dalla: 'scossalina', diversa: false, segnato: segnati.has(0) });
        for (let k = 1; k <= N; k++) {
          const qk = Math.min((pf != null ? pf - passo : off0) + k * passo, Lf - sta);
          const d = mm(qk) - quote[quote.length - 1].quotaMm;
          quote.push({ n: k, nome: k === N ? `Fila ${k} (ultima, al colmo)` : `Fila ${k}`, quotaMm: mm(qk), distanzaMm: d, dalla: 'precedente', diversa: Math.abs(d - passo) > 0.5 && !(pf != null && k === 1), segnato: segnati.has(k) });
        }
      }
      const ultima = quote.length > 1 ? (pf != null && quote.length === 2 ? passo : quote[quote.length - 1].distanzaMm) : null;
      // stacco vero: con il passo per difetto al mm l'ultima fila può stare qualche mm più giù
      const staFine = quote.length > 1 ? Math.max(0, mm(Lf) - quote[quote.length - 1].quotaMm) : mm(sta);
      const noSta = staFine ? ` − stacco dal colmo ${cm1(staFine)} cm` : '';
      const ultimaCorta = ultima != null && passo && ultima < passo - 0.5 ? true : false;
      const tegolePerFila = mGronda && datiT && datiT.larghezza ? Math.ceil(x9(Lg / datiT.larghezza)) : f.tegolePerFila;
      const ic = x9((Number(q.controlistoni.interasse) || 0) * 100);   // interasse travi: m → cm (per le spiegazioni)
      const lineeC = mGronda && ic > 0 ? Math.floor(x9(Lg / 10 / ic)) + 1 : f.lineeControlistoni;
      const tegoleFalda = N && tegolePerFila ? N * tegolePerFila * f.pz : null;
      const bordo = combinazioniBordo(Lg, datiT, x9((q.sporgenzaBordo != null ? Number(q.sporgenzaBordo) : 0.03) * 1000), ((cant.bordo || {})[f.indice]) || null);
      const bordoVisto = opzioniBordo(bordo, !!q.frontone);
      const frontone = q.frontone ? frontoneFalda(bordoVisto, datiT, N, f.pz, Lg) : null;
      return {
        indice: f.indice, nome: f.nome, pezzi: f.pz, daCantiere,
        misuraUfficio: { faldaMm: mm(f.Lf * 1000), larghezzaMm: mm(f.Lg * 1000) },
        larghezzaMm: mm(Lg), faldaMm: mm(Lf), pianoMm: mm(f.Lp * 1000), coeff: f.k, primoListoneMm: mm(off0), primaFilaMm: pf != null ? mm(pf) : null, primaFilaSpostataMm: mm(spostata), staccoColmoMm: staFine, quotaMassimaMm: mm(Lf) - staFine, taglio: !!(q.gioco && ultimaCorta),
        passoMm: passo, file: N, ultimaFilaMm: ultima, ultimaCorta, quote,
        listoneColmo: !!(q.listoni && q.listoni.listoneColmo) && !lungoFalda, lungoFalda,
        tegolePerFila, tegoleFalda, bordo, bordoVisto, frontone,
        controlistoni: { linee: lineeC, interasseCm: ic, lunghezzaMm: mm(Lf) },
        perche: {
          falda: mFalda ? `misura presa in cantiere: ${cm1(Lf)} cm (ufficio: ${cm1(f.Lf * 1000)} cm)`
            : `${it(f.Lp, 3)} m in pianta × coefficiente di pendenza ${it(f.k, 4)} = ${cm1(Lf)} cm lungo la pendenza`,
          passo: passoPerche,
          ultima: ultima == null ? '' : pf != null ? (ultimaCorta ? `${cm1(Lf)} cm${noSta} − prima fila ${cm1(pf)} cm − ${N - 2} × ${cm1(passo)} cm = ${cm1(ultima)} cm` : 'tutte le file uguali, ultima intera') : `${cm1(Lf)} cm${noSta} − primo listone ${cm1(off0)} cm − ${N - 1} × ${cm1(passo)} cm = ${cm1(ultima)} cm`,
          perFila: tegolePerFila ? `${cm1(Lg)} cm / larghezza di copertura della tegola, per eccesso = ${tegolePerFila} tegole` : '',
          tegoleFalda: tegoleFalda ? `${N} file × ${tegolePerFila} tegole per fila${f.pz !== 1 ? ' × ' + f.pz : ''} = ${tegoleFalda} (da posare, senza scarto)` : '',
          controlistoni: mGronda ? `(${cm1(Lg)} cm / ${it(ic)} cm per difetto + 1) = ${lineeC} linee (misura di cantiere)` : f.controlistoniPerche,
        },
      };
    });
    falde.forEach(f => {
      if (f.daCantiere) avvisi.push(`${f.nome}: misure prese in cantiere (falda ${cm1(f.faldaMm)} cm, gronda ${cm1(f.larghezzaMm)} cm; ufficio ${cm1(f.misuraUfficio.faldaMm)} × ${cm1(f.misuraUfficio.larghezzaMm)} cm). Il materiale qui sotto resta quello dell'ufficio.`);
      if (q.gioco && f.quote.length && f.staccoColmoMm > x9(Number(q.staccoMassimo) * 1000) + 0.5) avvisi.push(`${f.nome}: stacco dal colmo ${cm1(f.staccoColmoMm)} cm, oltre ${it(Number(q.staccoMassimo) * 100)} cm.`);
      if (f.file === 0 && f.faldaMm > 0) avvisi.push(`${f.nome}: falda più corta della prima fila.`);
      if (f.ultimaCorta && q.gioco) avvisi.push(`${f.nome}: ultima fila da tagliare: ${cm1(f.ultimaFilaMm)} cm (le altre ${cm1(f.passoMm)} cm).`);
      else if (f.ultimaCorta) avvisi.push(`${f.nome}: l'ultima fila in alto è di ${cm1(f.ultimaFilaMm)} cm (le altre ${cm1(f.passoMm)} cm): ${f.ultimaFilaMm < f.passoMm * 0.9 ? 'si chiude a parte (tegola tagliata o di chiusura).' : 'differenza piccola, dal passo arrotondato al millimetro.'}`);
      if (f.lungoFalda) avvisi.push(`${f.nome}: coppi alla piemontese, listoni lungo la falda ogni ${cm1(f.passoMm)} cm (quote lungo la gronda, non lungo la pendenza).`);
      else if (!f.passoMm && t) avvisi.push(`${f.nome}: passo non dato per questa tegola, quote dei listoni non calcolabili.`);
    });
    if (q.gioco && t && !lungoFalda && !q.passoMano && r.passoPermesso.max != null && !Q.giocoDi(datiT, r.passoPermesso).noto) avvisi.push(`Gioco non noto per ${t.nome.split(' ')[0]}: passo fisso ${cm1(r.passoPermesso.max)} cm.`);
    if (q.gioco && t && !lungoFalda && Number(q.staccoColmo) < Number(q.staccoMinimo)) avvisi.push(`Stacco dal colmo sotto il minimo di ${cm1(Number(q.staccoMinimo) * 1000)} cm.`);
    if (q.frontone && falde.some(f => f.frontone && f.frontone.manca)) avvisi.push(`Tegola di frontone: manca la misura del frontone per ${t.nome.split(' ')[0]}. Numeri del frontone non calcolati.`);
    falde.forEach(f => { if (f.frontone && f.frontone.nonCiSta) avvisi.push(`${f.nome}: gronda troppo corta per i due frontoni.`); });
    if (!falde.length && r.sup.usato > 0) avvisi.push('Senza righe nella misura SUP (larghezza × lunghezza) le quote delle falde non si possono dare.');

    const materiale = [];
    if (r.tegole.valore != null) materiale.push({ cosa: 'Tegole', quantita: r.tegole.valore, unita: 'pezzi', dettaglio: t ? t.nome : '', perche: r.tegole.perche });
    if (r.colmo && r.colmo.pezzi != null) materiale.push({ cosa: 'Coppi di colmo (' + r.colmo.nome + ')', quantita: r.colmo.pezzi, unita: 'pezzi', dettaglio: `${it(r.colmo.ml)} ml · ${it(r.colmo.pzMl, 2)} pz/ml + ${it(r.colmo.sfrido)} % sfrido`, perche: r.colmo.perche });
    if (r.listoni.barre != null) materiale.push({ cosa: 'Listoni', quantita: r.listoni.barre, unita: `barre da ${it(r.listoni.lungBarra)} m`, dettaglio: `${it(r.listoni.ml)} ml`, perche: r.listoni.perche });
    if (r.controlistoni.barre != null) materiale.push({ cosa: 'Controlistoni', quantita: r.controlistoni.barre, unita: `barre da ${it(r.controlistoni.lungBarra)} m`, dettaglio: `${it(r.controlistoni.ml)} ml`, perche: r.controlistoni.perche });
    r.isolante.strati.forEach(s => { if (s.pannelli != null) materiale.push({ cosa: `Isolante strato ${s.strato}`, quantita: s.pannelli, unita: `pannelli ${it(s.larg * 100)} × ${it(s.lung * 100)} cm`, dettaglio: s.dove, perche: s.perche }); });

    // foto: qui non ci sono (restano nel Preventivatore), i campi restano vuoti
    return { tegola: t, foto: datiT && datiT.foto ? datiT.foto : null, nomi: (datiT && datiT.nomi) || null, fotoPezzi: datiT ? { doppiaOnda: !!datiT.doppiaOnda, bordoSx: !!datiT.bordoSx, bordoDx: !!datiT.bordoDx } : null, gradi: r.gradi, percPendenza: Math.tan(r.gradi * Math.PI / 180) * 100, falde, materiale, distinta: distinta(r, q, falde, materiale, datiT), frontone: !!q.frontone, gioco: !!q.gioco, staccoColmoMm: mm((Number(q.staccoColmo) || 0) * 1000), avvisi };
  }

  /*
   * TEGOLE DI BORDO IN LARGHEZZA (proposta approvata da Umberto 4.11.2026). Lungo la gronda non si mettono solo tegole normali:
   * per arrivare bene al bordo si usano la doppia onda e/o le tegole di bordo (perimetro che scende sul lato del tetto).
   * L'app PROPONE le combinazioni e ne consiglia una; la scelta la fanno Umberto o il capo squadra (off.spartizioneCantiere.bordo).
   *   larghezza coperta W = bordo sx + doppia onda + n × normale + bordo dx (solo i pezzi della combinazione)
   *   n = normali: per difetto e per eccesso (le due possibilità più vicine)
   *   resto per lato = (W − gronda) / 2   (negativo = non arriva al bordo: scartata)
   *   consigliata = resto ≥ 0 più vicino alla sporgenza voluta (3 cm di base, Umberto); a pari distanza meno pezzi speciali
   * Larghezze della doppia onda e del bordo SOLO dalla tabella (tegole): se mancano, la combinazione è «da verificare».
   */
  const COMBINAZIONI = [
    { chiave: 'normali', nome: 'Solo tegole normali', pezzi: [] },
    { chiave: 'doppia', nome: 'Doppia onda + normali', pezzi: ['doppiaOnda'] },
    { chiave: 'bordi', nome: 'Bordo sinistro + normali + bordo destro', pezzi: ['bordoSx', 'bordoDx'] },
    { chiave: 'bordi-doppia', nome: 'Bordo sinistro + doppia onda + normali + bordo destro', pezzi: ['bordoSx', 'doppiaOnda', 'bordoDx'] },
  ];
  const NOMI_PEZZI = { doppiaOnda: 'doppia onda', bordoSx: 'tegola di bordo sinistra', bordoDx: 'tegola di bordo destra' };
  function combinazioniBordo(LgMm, t, sporgenzaMm, scelta) {
    const out = [];
    if (!t || !t.larghezza || !LgMm) return { combinazioni: out, consigliata: null, scelta: null, sporgenzaMm, perche: 'larghezza della tegola o della gronda mancante' };
    const b = t.larghezza;
    // nomi: prima quelli del materiale di Umberto (tegole.js «nomi»), se no quelli generici
    const CH = { doppiaOnda: 'doppia', bordoSx: 'sx', bordoDx: 'dx' };
    const nomeP = p => (t.nomi && t.nomi[CH[p]] ? t.nomi[CH[p]][0] : NOMI_PEZZI[p]);
    const nomeN = t.nomi && t.nomi.normale ? t.nomi.normale[0] : 'normali';
    const nomeMio = c => (t.nomi ? c.pezzi.filter(p => p !== 'bordoDx').map(nomeP).concat([nomeN], c.pezzi.includes('bordoDx') ? [nomeP('bordoDx')] : []).join(' + ') : c.nome);
    for (const c of COMBINAZIONI) {
      if (t.senzaOnda && c.pezzi.includes('doppiaOnda')) continue;   // tegola senza onda: niente doppio bordo (Umberto 4.11.2026)
      const mancano = c.pezzi.filter(p => !(t[p] > 0));
      if (mancano.length) {
        // doppia onda: Umberto deve ancora confermare che è il suo «doppio bordo»
        const daConfermare = mancano.includes('doppiaOnda') && t.tegolaBordoZZ > 0;
        out.push({ chiave: c.chiave, nome: c.nome, nomeMio: nomeMio(c), daVerificare: true, daConfermare, mancano: mancano.map(nomeP),
          perche: daConfermare ? `da confermare: è il «doppio bordo»? non usata finché Umberto non conferma`
            : `da verificare: manca la larghezza di ${mancano.map(p => NOMI_PEZZI[p]).join(' e ')} (dalla scheda del produttore)` });
        continue;
      }
      const speciali = c.pezzi.reduce((s, p) => s + t[p], 0);
      const nEsatto = (LgMm + 2 * sporgenzaMm - speciali) / b;
      for (const n of Array.from(new Set([Math.floor(x9(nEsatto)), Math.ceil(x9(nEsatto))])).filter(n => n >= 0)) {
        const W = speciali + n * b, resto = (W - LgMm) / 2;
        out.push({ chiave: c.chiave + ':' + n, tipo: c.chiave, nome: c.nome, nomeMio: nomeMio(c), normali: n, pezziSpeciali: c.pezzi.map(p => NOMI_PEZZI[p]), pezzi: c.pezzi.slice(), larghezzaMm: W,
          restoMm: x9(resto), arriva: resto >= -1e-9, distanzaMm: Math.abs(resto - sporgenzaMm),
          perche: `${c.pezzi.map(p => nomeP(p) + ' ' + cm1(t[p]) + ' cm').concat([n + ' × ' + (t.nomi ? nomeN + ' ' : '') + cm1(b) + ' cm']).join(' + ')} = ${cm1(W)} cm; `
            + `(${cm1(W)} − gronda ${cm1(LgMm)}) / 2 = ${cm1(resto)} cm per lato` + (resto < -1e-9 ? ' → non arriva al bordo' : '') });
      }
    }
    const buone = out.filter(c => !c.daVerificare && c.arriva).sort((a, b2) => a.distanzaMm - b2.distanzaMm || a.pezziSpeciali.length - b2.pezziSpeciali.length);
    const consigliata = buone.length ? buone[0].chiave : null;
    return { combinazioni: out, consigliata, scelta: scelta && out.some(c => c.chiave === scelta) ? scelta : null, sporgenzaMm,
      perche: consigliata ? `consigliata: sporge ${cm1(buone[0].restoMm)} cm per lato, la più vicina a ${cm1(sporgenzaMm)} cm voluti` : 'nessuna combinazione calcolabile che arrivi al bordo' };
  }
  /** Combinazione scelta per il bordo di una falda (null = togli la scelta). La scelta è di Umberto o del capo squadra. */
  function scegliBordo(off, falda, chiave) {
    off.spartizioneCantiere = off.spartizioneCantiere || {};
    const b = off.spartizioneCantiere.bordo = off.spartizioneCantiere.bordo || {};
    if (chiave) b[falda] = chiave; else delete b[falda];
    return off;
  }

  /*
   * TEGOLA DI FRONTONE (Umberto 5.11.2026): la decide lui, in cantiere e in ufficio. Se è in offerta ci va, se non è in offerta non ci va.
   * Sì = ogni fila ha un frontone a sinistra e uno a destra (bordoSx, bordoDx della tabella): restano le combinazioni con i bordi.
   * No = restano le combinazioni senza bordi. Se manca la larghezza del frontone: { manca: true }, mai un numero inventato.
   *   per falda: frontoni sinistri = file × pezzi, destri uguale; normali = file × normali per fila × pezzi
   *   di quanti cm non torna: gronda giusta = larghezza coperta − 2 × sporgenza voluta; differenza = gronda giusta − gronda
   */
  function opzioniBordo(bordo, frontoneSi) {
    const tipi = frontoneSi ? ['bordi', 'bordi-doppia'] : ['normali', 'doppia'];
    const combinazioni = bordo.combinazioni.filter(c => tipi.includes(c.tipo || c.chiave));
    const usabile = c => !c.daVerificare && c.arriva;
    const buone = combinazioni.filter(usabile).sort((a, b2) => a.distanzaMm - b2.distanzaMm || a.pezziSpeciali.length - b2.pezziSpeciali.length);
    const scelta = bordo.scelta && combinazioni.some(c => c.chiave === bordo.scelta && usabile(c)) ? bordo.scelta : null;
    return { combinazioni, consigliata: buone.length ? buone[0].chiave : null, scelta, sporgenzaMm: bordo.sporgenzaMm };
  }
  function frontoneFalda(op, t, N, pz, LgMm) {
    if (!t) return null;
    if (!(t.bordoSx > 0 && t.bordoDx > 0) || !t.larghezza) return { manca: true };
    if (!LgMm || !N) return null;                          // falda ancora senza misure
    const c = op.combinazioni.find(x => x.chiave === (op.scelta || op.consigliata));
    if (!c) return { nonCiSta: true };                     // gronda più corta dei due frontoni
    const doppia = c.pezzi.includes('doppiaOnda') ? 1 : 0;
    const grondaGiustaMm = c.larghezzaMm - 2 * op.sporgenzaMm;
    return { chiave: c.chiave, tipo: c.tipo, normaliPerFila: c.normali, doppiePerFila: doppia,
      sx: N * pz, dx: N * pz, doppie: N * pz * doppia, normali: N * c.normali * pz,
      larghezzaMm: c.larghezzaMm, restoMm: c.restoMm, sporgenzaMm: op.sporgenzaMm,
      grondaGiustaMm: x9(grondaGiustaMm), differenzaMm: x9(grondaGiustaMm - LgMm),
      perche: c.perche };
  }

  /*
   * DISTINTA (Umberto 5.11.2026): quello che serve, con i pezzi per mazzo e i gommini. I numeri d'ufficio restano in «materiale».
   *   tegole normali = tegole − pezzi speciali (ogni frontone o doppio bordo prende il posto di una tegola, come nelle voci dell'offerta)
   *   pezzi speciali = file × pezzi, con lo stesso scarto delle tegole
   *   mazzi = per eccesso (pezzi / pezzi per mazzo). Pezzi per mazzo: scritti a mano o dalla tabella. Se mancano: quantita null, riga da scrivere a mano.
   *   gommini = per eccesso (falda / ogni) × linee di controlistoni × pezzi (1 ogni 85 cm di base)
   */
  function distinta(r, q, falde, materiale, t) {
    const righe = [];
    const fr = falde.map(f => f.frontone).filter(x => x && x.sx != null);
    const scarto = 1 + (Number(q.scartoTegole) || 0) / 100;
    const somma = k => Math.ceil(x9(fr.reduce((s, x) => s + x[k], 0) * scarto));
    const nomi = (t && t.nomi) || {};
    const rigaMazzi = (cosa, pezzi, pz) => ({ id: 'mazzi', cosa, quantita: pz ? Math.ceil(x9(pezzi / pz)) : null, unita: pz ? `mazzi da ${it(pz)} pezzi` : 'mazzi', dettaglio: '', manca: !pz,
      perche: pz ? `${pezzi} pezzi / ${it(pz)} pezzi per mazzo, per eccesso` : 'pezzi per mazzo non scritti' });
    for (const m of materiale) {
      // listoni in mazzi (Umberto 5.11.2026): i pezzi per pacco cambiano con la sezione, li scrive lui; se mancano, la riga lo dice
      if (m.cosa === 'Listoni') { righe.push(Object.assign({}, m)); const pzL = Number(q.listoni && q.listoni.pzMazzo) > 0 ? Number(q.listoni.pzMazzo) : null; righe.push(Object.assign(rigaMazzi('Mazzi di listoni', m.quantita, pzL), { id: 'mazzi-listoni', testoManca: 'scrivi i pezzi per pacco' })); continue; }
      if (m.cosa !== 'Tegole') { righe.push(Object.assign({}, m)); continue; }
      const sx = somma('sx'), dx = somma('dx'), dp = somma('doppie'), speciali = sx + dx + dp;
      const normali = Math.max(0, m.quantita - speciali);
      const pzM = Number(q.pzMazzo) > 0 ? Number(q.pzMazzo) : (t && t.pzMazzo) || null;
      righe.push(Object.assign({}, m, { id: 'tegole', cosa: fr.length ? 'Tegole normali' : 'Tegole', quantita: normali,
        perche: speciali ? `${m.quantita} tegole − ${speciali} pezzi speciali = ${normali}. ${m.perche}` : m.perche }));
      righe.push(rigaMazzi('Mazzi di tegole', normali, pzM));
      if (fr.length) {
        const pzF = (t && t.pzMazzoFrontone) || null;
        righe.push({ id: 'frontone-sx', cosa: 'Frontoni sinistri', quantita: sx, unita: 'pezzi', dettaglio: (nomi.sx && nomi.sx[0]) || '', perche: `file × falde, con ${it((scarto - 1) * 100)} % di scarto` });
        righe.push({ id: 'frontone-dx', cosa: 'Frontoni destri', quantita: dx, unita: 'pezzi', dettaglio: (nomi.dx && nomi.dx[0]) || '', perche: `file × falde, con ${it((scarto - 1) * 100)} % di scarto` });
        righe.push(Object.assign(rigaMazzi('Mazzi di frontoni', sx + dx, pzF), { quantita: pzF ? Math.ceil(x9(sx / pzF)) + Math.ceil(x9(dx / pzF)) : null }));
        if (dp) {
          righe.push({ id: 'doppio', cosa: 'Doppio bordo', quantita: dp, unita: 'pezzi', dettaglio: '', perche: `file × falde, con ${it((scarto - 1) * 100)} % di scarto` });
          righe.push(rigaMazzi('Mazzi di doppio bordo', dp, (t && t.pzMazzoDoppia) || null));
        }
      }
    }
    const ogni = Number(q.gommini && q.gommini.ogni) || 0;
    const gommini = ogni > 0 ? r.falde.reduce((s, f) => s + Math.ceil(x9(f.Lf / ogni)) * f.lineeControlistoni * f.pz, 0) : 0;
    if (gommini > 0) righe.push({ id: 'gommini', cosa: 'Gommini sotto i controlistoni', quantita: gommini, unita: 'pezzi', dettaglio: `1 ogni ${it(ogni * 100)} cm`,
      perche: `per ogni controlistone: falda / ${it(ogni * 100)} cm, per eccesso` });
    return righe;
  }

  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  /**
   * Disegno di UNA falda (SVG in testo): vista sulla falda, gronda in basso e colmo in alto, un listone per riga con la
   * sua quota a destra (in cm dal bordo di gronda), controlistoni sottili in verticale. Caratteri grandi (cantiere).
   * opz: { larghezza px (base 640) }
   */
  function disegnoFalda(f, opz) {
    const o = opz || {};
    const W = o.larghezza || 560;
    const mis = o.misura || (x => cm1(x) + ' cm');
    const fs = 17, riga = 28;                              // carattere e altezza minima di una riga
    const n = f.quote.length;
    const H = Math.max(260, n * riga + 100);
    const x0 = 40, x1 = W - 200, y0 = 46, y1 = H - 46;    // rettangolo della falda (a destra lo spazio per le quote)
    const L = f.faldaMm || 1;
    const y = qmm => y1 - (y1 - y0) * (qmm / L);
    let s = `<rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" fill="#f6efe4" stroke="#5a4632" stroke-width="2"/>`;
    // controlistoni (sopra le travi): linee sottili verticali, al massimo una ogni 6 px
    const lc = f.controlistoni && f.controlistoni.linee ? f.controlistoni.linee : 0;
    if (lc > 1) for (let j = 0; j < lc; j++) { const x = x0 + (x1 - x0) * j / (lc - 1); s += `<line x1="${x.toFixed(1)}" y1="${y0}" x2="${x.toFixed(1)}" y2="${y1}" stroke="#c9b79c" stroke-width="1" stroke-dasharray="4 4"/>`; }
    // quote: se due etichette si toccano, l'etichetta scende di una riga (la linea resta al suo posto)
    let ultimaY = Infinity;
    f.quote.forEach(qq => {
      const yy = y(qq.quotaMm);
      // colore: segnato = verde con ✓; distanza diversa dal passo = blu con ≠ (mai solo colore: c'è anche il segno); gronda = marrone
      const col = qq.segnato ? '#1e7b34' : qq.diversa ? '#1f5fae' : qq.n === 0 ? '#5a4632' : '#8a3b12';
      const segno = (qq.segnato ? '✓ ' : '') + (qq.diversa ? '≠ ' : '');
      s += `<line x1="${x0}" y1="${yy.toFixed(1)}" x2="${x1}" y2="${yy.toFixed(1)}" stroke="${col}" stroke-width="${qq.n === 0 ? 4 : 2.5}"${qq.diversa ? ' stroke-dasharray="10 4"' : ''}/>`;
      let ty = yy + 5;
      if (ty > ultimaY - fs - 2) ty = ultimaY - fs - 2;
      ultimaY = ty;
      s += `<line x1="${x1}" y1="${yy.toFixed(1)}" x2="${x1 + 12}" y2="${(ty - 5).toFixed(1)}" stroke="${col}" stroke-width="1"/>`;
      s += `<text x="${x1 + 16}" y="${ty.toFixed(1)}" font-size="${fs}" font-weight="700" fill="${col}">${segno}${qq.n === 0 ? 'G' : qq.n} · ${esc(mis(qq.quotaMm))}</text>`;
    });
    s += `<text x="${(x0 + x1) / 2}" y="${y1 + 30}" font-size="${fs + 2}" font-weight="700" text-anchor="middle" fill="#2b2b2b">GRONDA · ${esc(mis(f.larghezzaMm))}</text>`;
    s += `<text x="${(x0 + x1) / 2}" y="${y0 - 16}" font-size="${fs + 2}" font-weight="700" text-anchor="middle" fill="#2b2b2b">COLMO</text>`;
    // lunghezza della falda (freccia a sinistra)
    s += `<line x1="${x0 - 18}" y1="${y0}" x2="${x0 - 18}" y2="${y1}" stroke="#2b2b2b" stroke-width="1.5"/><path d="M${x0 - 24} ${y0 + 10} L${x0 - 18} ${y0} L${x0 - 12} ${y0 + 10} M${x0 - 24} ${y1 - 10} L${x0 - 18} ${y1} L${x0 - 12} ${y1 - 10}" fill="none" stroke="#2b2b2b" stroke-width="1.5"/>`;
    s += `<text transform="translate(${x0 - 24} ${(y0 + y1) / 2}) rotate(-90)" font-size="${fs}" text-anchor="middle" fill="#2b2b2b">${esc(mis(f.faldaMm))} lungo la pendenza</text>`;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Atkinson Hyperlegible, Arial, sans-serif" role="img" aria-label="${esc(f.nome)}: ${n} listoni, passo ${esc(mis(f.passoMm || 0))}">${s}</svg>`;
  }

  /** Listone segnato sul tetto (✓) o tolto il segno: cambia off.spartizioneCantiere.segnati[falda] (lista dei numeri di fila, 0 = gronda). */
  function segna(off, falda, n, si) {
    off.spartizioneCantiere = off.spartizioneCantiere || {};
    const sg = off.spartizioneCantiere.segnati = off.spartizioneCantiere.segnati || {};
    const l = new Set(sg[falda] || []);
    if (si) l.add(n); else l.delete(n);
    sg[falda] = Array.from(l).sort((a, b) => a - b);
    return off;
  }
  /** Misura presa in cantiere per una falda (METRI; null = torna alla misura dell'ufficio). cosa: 'falda' | 'gronda' */
  function misuraCantiere(off, falda, cosa, metri) {
    if (cosa !== 'falda' && cosa !== 'gronda') throw new Error('Misura del cantiere: «falda» o «gronda»');
    off.spartizioneCantiere = off.spartizioneCantiere || {};
    const fl = off.spartizioneCantiere.falde = off.spartizioneCantiere.falde || [];
    fl[falda] = Object.assign({}, fl[falda] || {});
    if (metri == null || !(metri > 0)) delete fl[falda][cosa]; else fl[falda][cosa] = metri;
    return off;
  }

  /**
   * CONTROLLO DELLA SUPERFICIE (Umberto 4.11.2026), avviso SOLO a Umberto: se la superficie con le misure prese sul tetto
   * supera quella dell'ufficio di più del 3 %, il materiale ordinato potrebbe non bastare.
   *   superficie di una falda = falda lungo la pendenza × gronda × pezzi (misure del tetto dove scritte, se no dell'ufficio)
   *   ufficio = stesse falde con le misure dell'ufficio (righe della misura SUP, senza la maggiorazione)
   * Ritorna { ufficioM2, tettoM2, diffPerc, avviso: testo | null, misurate: n falde con misure del tetto }
   */
  const SOGLIA_SUPERFICIE = 3;
  function controlloSuperficie(off) {
    const sp = spartizione(off);
    let uff = 0, tetto = 0, misurate = 0;
    sp.falde.forEach(f => {
      uff += f.misuraUfficio.faldaMm * f.misuraUfficio.larghezzaMm * f.pezzi / 1e6;
      tetto += f.faldaMm * f.larghezzaMm * f.pezzi / 1e6;
      if (f.daCantiere) misurate++;
    });
    const diffPerc = uff > 0 ? (tetto - uff) / uff * 100 : 0;
    const avviso = misurate && diffPerc > SOGLIA_SUPERFICIE + 1e-9
      ? `Misure prese sul tetto: superficie ${it(tetto)} m² contro ${it(uff)} m² dell'ufficio (+${it(diffPerc, 1)} %, oltre il ${SOGLIA_SUPERFICIE} %). Il materiale ordinato potrebbe non bastare.`
      : null;
    return { ufficioM2: x9(uff), tettoM2: x9(tetto), diffPerc, avviso, misurate };
  }

  const API = { spartizione, distinta, opzioniBordo, frontoneFalda, disegnoFalda, segna, misuraCantiere, controlloSuperficie, SOGLIA_SUPERFICIE, combinazioniBordo, scegliBordo, COMBINAZIONI, cm: cm1 };
  if (nodo) module.exports = API;
  else root.CTSpartizione = API;
})(CT);

(function (root) {
  'use strict';
  const U = root.CTUnita;
  // Testo scritto o incollato -> { stato: 'vuoto'|'ok'|'zero'|'errato', metri, unita }.
  // Accetta virgola o punto, apostrofo e spazi, «1.234,5», e l'unita' scritta dopo il numero («583,8 cm»: vale quella scritta).
  function leggiMisura(testo, unitaCampo) {
    let t = String(testo == null ? '' : testo).trim().replace(/[\u00a0\u202f]/g, ' ');
    if (!t) return { stato: 'vuoto', metri: null, unita: unitaCampo };
    let unita = unitaCampo;
    const m = t.match(/^(.*?)\s*(mm|cm|m)\.?$/i);
    if (m) { t = m[1]; unita = m[2].toLowerCase(); }
    const pulito = leggiNumero(t);
    if (pulito === null) return { stato: 'errato', metri: null, unita };
    const metri = U.aMetri(pulito, unita);
    if (!isFinite(metri) || metri < 0) return { stato: 'errato', metri: null, unita };
    return metri === 0 ? { stato: 'zero', metri: 0, unita } : { stato: 'ok', metri, unita };
  }
  // Numero con virgola o punto. null = non e' un numero.
  function leggiNumero(testo) {
    let t = String(testo == null ? '' : testo).trim().replace(/[’'\s\u00a0\u202f]/g, '');
    if (!t) return null;
    const v = t.lastIndexOf(','), p = t.lastIndexOf('.');
    if (v >= 0 && p >= 0) { const dec = v > p ? ',' : '.'; t = t.split(dec === ',' ? '.' : ',').join('').replace(dec, '.'); }
    else t = t.replace(',', '.');
    if (!/^-?\d*\.?\d+$|^-?\d+\.$/.test(t)) return null;
    const n = Number(t);
    return isFinite(n) ? n : null;
  }
  root.leggiMisura = leggiMisura;
  root.leggiNumero = leggiNumero;
})(CT);

if (typeof module !== 'undefined' && module.exports) module.exports = CT; else globale.CTSpart = CT;
})(typeof window !== 'undefined' ? window : globalThis);
