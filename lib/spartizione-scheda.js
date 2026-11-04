/*
 * SCHEDA SPARTIZIONE — App Cantieri, Carpenteria Ticinese Sagl (v20)
 * Per il capo squadra sul tetto: telefono, guanti, occhiali. Titolare e responsabile anche. Decisione di Umberto, 3.11 e 4.11.2026.
 *
 * Qui nessuna formula: tutti i conti stanno in lib/spartizione-formule.js (copia del motore del Preventivatore).
 * Questo file legge i campi, chiama quelle funzioni e mostra il risultato.
 *
 * Misure: si scrivono in m, cm o mm (di base cm in questa scheda, parola di Umberto). Dentro, sempre METRI.
 * Il testo del campo non conta: al cambio di unita' i campi si riscrivono dai metri, cosi' non si perde niente.
 *
 * Da dove vengono le misure:
 *   - con CANT_06 sul database: dall'offerta del cantiere (funzione cant_spartizione_misure: solo misure, niente voci).
 *     Il capo squadra puo' correggere falda e gronda (misure prese sul tetto). Il materiale resta quello dell'ufficio.
 *   - senza CANT_06, o senza offerta: le scrive lui a mano.
 * Quello che scrive resta su questo telefono (localStorage, per persona e per cantiere). Niente va nel database.
 */
(function () {
  'use strict';
  const CT = window.CTSpart;
  const S = CT.CTSpartizione, Q = CT.CTQuantita, T = CT.CTTegole, U = CT.CTUnita, MOD = CT.CTModello;
  const ST = { cantId: null, vuole: null, unita: 'cm', pendU: '%', faldaI: 0, offerta: null, esito: '', errore: '', loc: null, rpcAssente: false, gira: 0, altriAperti: false };
  const $ = id => document.getElementById(id);
  const esc = s => (s === 0 ? '0' : typeof escHtml === 'function' ? escHtml(s) : String(s == null ? '' : s));   // escHtml(0) darebbe vuoto
  const sicuro = f => { try { return f(); } catch (e) { return null; } };

  // ─── Memoria sul telefono ───
  const chiaveLoc = () => 'ct_spart_v1_' + (USER && USER.id) + '_' + ST.cantId;
  const chiaveU = () => 'ct_spart_unita_' + (USER && USER.id);
  const chiaveP = () => 'ct_spart_pend_' + (USER && USER.id);
  const chiaveUlt = () => 'ct_spart_ultimo_' + (USER && USER.id);
  const chiaveOff = () => 'ct_spart_off_v1_' + (USER && USER.id) + '_' + ST.cantId;   // ultima copia delle misure dell'offerta: sul tetto la rete puo' mancare
  const nuovoLoc = () => ({ v: 1, gradi: null, tegola: null, falde: [{ nome: 'Falda 1', gronda: null, falda: null, pz: 1 }], misure: [], segnati: {}, bordo: {}, opz: {}, sup: null, colmi: null, cantonali: null, rifOfferta: null });
  function leggiLoc() {
    const t = sicuro(() => localStorage.getItem(chiaveLoc()));
    const o = t ? sicuro(() => JSON.parse(t)) : null;
    return o && o.v === 1 ? Object.assign(nuovoLoc(), o) : nuovoLoc();
  }
  function salva() { const s = JSON.stringify(ST.loc); sicuro(() => localStorage.setItem(chiaveLoc(), s)); }

  // ─── Numeri a schermo. Sempre con l'unita' scritta. ───
  const campoDa = (metri, u) => { const x = U.daMetri(metri, u || ST.unita); return x == null ? '' : String(x).replace('.', ','); };
  function conApostrofi(x) { const [i, d] = String(x).split('.'); return i.replace(/\B(?=(\d{3})+(?!\d))/g, "'") + (d ? ',' + d : ''); }
  const fmtMm = mm => { if (mm == null) return '—'; const x = U.converti(mm, 'mm', ST.unita); return conApostrofi(x) + ' ' + ST.unita; };
  const fmtN = (x, d = 2) => (x == null ? '—' : conApostrofi(Math.round(x * 10 ** d) / 10 ** d));
  const gradiDaPerc = p => Math.atan(p / 100) * 180 / Math.PI;
  const percDaGradi = g => Math.tan(g * Math.PI / 180) * 100;

  // ─── L'offerta da dare alle formule: quella del database (o vuota) piu' quello che ha scritto il capo squadra ───
  const modoMano = () => { const s = ST.offerta && (ST.offerta.misure || []).find(m => m.id === 'sup'); return !(s && s.righe && s.righe.length); };
  function fonde(a, b) {
    const o = Object.assign({}, a);
    for (const k of Object.keys(b || {})) o[k] = (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k])) ? fonde(a && a[k], b[k]) : b[k];
    return o;
  }
  const completa = f => Number(f.gronda) > 0 && Number(f.falda) > 0;
  const pendenzaSconosciuta = () => ST.loc.gradi == null && !(ST.offerta && ST.offerta.pendenza && ST.offerta.pendenza.gradi != null);
  function costruisci() {
    const loc = ST.loc;
    const off = ST.offerta ? JSON.parse(JSON.stringify(ST.offerta)) : { unita: 'm', capitoli: [], pendenza: { gradi: 0 }, misure: [], quantita: {} };
    off.tipo = 'offerta'; off.unita = 'm'; off.capitoli = off.capitoli || [];
    off.pendenza = { gradi: loc.gradi != null ? loc.gradi : Number(off.pendenza && off.pendenza.gradi) || 0 };
    off.quantita = fonde(off.quantita || {}, loc.opz);
    // pannelli: nel motore sono un elenco, qui si tengono per numero
    if (loc.opz.isolante && loc.opz.isolante.pannelli) off.quantita.isolante.pannelli = [0, 1].map(i => Object.assign({}, (ST.offerta && ST.offerta.quantita && ST.offerta.quantita.isolante && (ST.offerta.quantita.isolante.pannelli || [])[i]) || {}, loc.opz.isolante.pannelli[i] || {}));
    if (loc.tegola) off.quantita.tegola = loc.tegola;
    let sup = off.misure.find(m => m.id === 'sup');
    if (!sup) { sup = { id: 'sup', nome: 'sup', unita: 'm2', pendenza: 'falda', percProposta: 3, righe: [] }; off.misure.push(sup); }
    if (modoMano()) {
      // A mano: gronda e falda sono le misure sul tetto, gia' lungo la pendenza (coefficiente 1).
      // Una falda incompleta passa a zero: non sposta i totali e tiene il suo numero.
      const alcune = loc.falde.some(completa);
      sup.righe = alcune ? loc.falde.map(f => completa(f) ? { descrizione: f.nome, larg: f.gronda, lung: f.falda, pz: f.pz == null ? 1 : f.pz, coeff: 1 } : { descrizione: f.nome, larg: 0, lung: 0, pz: 1, coeff: 1 }) : [];
    }
    if (loc.sup != null) sup.scelto = loc.sup;
    [['colmi', 'no'], ['cantonali', 'no']].forEach(([id, p]) => {
      if (loc[id] == null) return;
      off.misure = off.misure.filter(m => m.id !== id);
      off.misure.push({ id, nome: id, unita: 'ml', pendenza: p, percProposta: 3, righe: [{ lung: loc[id], pz: 1, coeff: 1 }] });
    });
    const dalDb = (off.spartizioneCantiere && off.spartizioneCantiere.falde) || [];
    const falde = [];
    for (let i = 0; i < Math.max(dalDb.length, loc.misure.length); i++) {
      const a = dalDb[i] || {}, b = loc.misure[i] || {};
      falde[i] = { falda: b.falda !== undefined ? b.falda : a.falda, gronda: b.gronda !== undefined ? b.gronda : a.gronda };
    }
    off.spartizioneCantiere = { falde, segnati: loc.segnati, bordo: loc.bordo };
    return off;
  }
  // I testi delle formule parlano delle schede del Preventivatore: qui si dicono con parole di cantiere.
  function avvisiPerCantiere(avvisi) {
    return avvisi.map(a => {
      if (/^La misura SUP è vuota/.test(a)) return 'Mancano le misure: scrivi gronda e falda.';
      if (/^Tegola non scelta/.test(a)) return 'Tegola non scelta: sceglila qui sopra.';
      if (/^Senza righe nella misura SUP/.test(a)) return 'Senza gronda e falda le quote dei listoni non si possono dare.';
      return a.replace(/^⚠️\s*/, '');
    });
  }

  // ─── Apertura ───
  function cantieriScelta() { return (typeof _cantVisibili === 'function' ? _cantVisibili() : []).filter(_cantSceglibileOre); }
  async function apri() {
    const el = $('spz-content'); if (!el) return;
    if (!puoAprire('spartizione')) { el.innerHTML = '<div class="empty"><p>Sezione non accessibile.</p></div>'; return; }
    ST.unita = sicuro(() => localStorage.getItem(chiaveU())) || 'cm';
    if (!U.FATTORE[ST.unita]) ST.unita = 'cm';
    ST.pendU = sicuro(() => localStorage.getItem(chiaveP())) === '°' ? '°' : '%';
    el.innerHTML = '<div class="empty"><div class="spin" style="margin:0 auto"></div></div>';
    if (_p4FiltraCantieri()) await _p4CaricaVisibilita();
    let id = ST.vuole || (curCant && curCant.id) || sicuro(() => localStorage.getItem(chiaveUlt())) || null;
    ST.vuole = null;
    if (id && (!_p4PuoVedereCantiere(id) || !(CANTIERI || []).some(c => c.id === id))) id = null;
    await scegli(id);
  }
  async function scegli(id) {
    const giro = ++ST.gira;
    ST.cantId = id || null; ST.faldaI = 0; ST.offerta = null; ST.esito = ''; ST.errore = '';
    if (!ST.cantId) { disegna(); return; }
    sicuro(() => localStorage.setItem(chiaveUlt(), ST.cantId));
    ST.loc = leggiLoc();
    if (!ST.rpcAssente) {
      disegnaAttesa();
      const { data, error } = await sb.rpc('cant_spartizione_misure', { p_cantiere: ST.cantId });
      if (giro !== ST.gira) return;
      if (error) {
        // Funzione non ancora sul database: normale, la scheda va a mano. Una sola prova per sessione.
        if (error.code === 'PGRST202' || error.code === '42883' || error.code === '42P01') { ST.rpcAssente = true; ST.esito = 'assente'; }
        else {
          const t = sicuro(() => localStorage.getItem(chiaveOff())), copia = t ? sicuro(() => JSON.parse(t)) : null;
          ST.esito = 'errore'; ST.errore = error.message || '';
          if (copia) { ST.offerta = MOD.assicuraMetri(copia); ST.esito = 'copia'; }
        }
      } else if (!data) { ST.esito = 'nessuna'; sicuro(() => localStorage.removeItem(chiaveOff())); }
      else {
        ST.offerta = MOD.assicuraMetri(data); ST.esito = 'offerta';
        sicuro(() => localStorage.setItem(chiaveOff(), JSON.stringify(data)));
      }
    } else ST.esito = 'assente';
    disegna();
  }
  function disegnaAttesa() { const el = $('spz-content'); if (el) el.innerHTML = selettoreCantiere() + '<div class="empty"><div class="spin" style="margin:0 auto"></div></div>'; }

  function selettoreCantiere() {
    const lista = cantieriScelta();
    let opz = '<option value="">— scegli il cantiere —</option>';
    lista.forEach(c => { opz += '<option value="' + esc(c.id) + '"' + (c.id === ST.cantId ? ' selected' : '') + '>' + esc(_cantEtichetta(c)) + '</option>'; });
    return '<label class="spz-campo"><span>🏗️ Cantiere</span><select id="spz-cantiere" class="spz-sel" onchange="spz.cantiere(this.value)">' + opz + '</select></label>';
  }

  // ─── Disegno della scheda (i campi). I risultati stanno in un riquadro a parte: scrivere non fa saltare i campi. ───
  function bannerFonte() {
    if (ST.esito === 'offerta' || ST.esito === 'copia') {
      const o = ST.offerta, d = o.aggiornato_il ? new Date(o.aggiornato_il).toLocaleDateString('it-CH') : '';
      let s = (ST.esito === 'copia' ? '<div class="spz-avviso">⚠️ Offerta non letta (rete?): uso l\'ultima copia su questo telefono. <button class="btn btn-s spz-tasto" onclick="spz.cantiere(\'' + esc(ST.cantId) + '\')">🔄 Riprova</button></div>' : '')
        + '<div class="spz-nota" id="spz-fonte">📄 Misure dall\'offerta del cantiere (' + esc(o.stato) + (d ? ', ' + esc(d) : '') + ').' + (o.altre > 0 ? ' Altre offerte su questo cantiere: ' + o.altre + '. Uso questa.' : '') + '</div>';
      if (ST.loc.rifOfferta && ST.loc.rifOfferta !== o.aggiornato_il) s += '<div class="spz-avviso">⚠️ L\'offerta è cambiata dopo le tue misure: controllale.</div>';
      if (modoMano()) s += '<div class="spz-avviso">⚠️ Nell\'offerta non ci sono le falde: scrivile tu qui sotto.</div>';
      return s;
    }
    if (ST.esito === 'errore') return '<div class="spz-avviso" id="spz-fonte">⚠️ Offerta non letta: scrivi tu le misure. <button class="btn btn-s spz-tasto" onclick="spz.cantiere(\'' + esc(ST.cantId) + '\')">🔄 Riprova</button></div>';
    if (ST.esito === 'nessuna') return '<div class="spz-nota" id="spz-fonte">✍️ Nessuna offerta collegata a questo cantiere: scrivi tu le misure.</div>';
    return '<div class="spz-nota" id="spz-fonte">✍️ Scrivi tu le misure.</div>';
  }
  function campoLung(id, testo, metri, azione, nota) {
    return '<label class="spz-campo"><span>' + esc(testo) + '</span><span class="spz-input"><input id="' + id + '" type="text" inputmode="decimal" enterkeyhint="done" autocomplete="off" value="' + esc(campoDa(metri)) + '" onfocus="this.select()" onchange="' + azione + '"><b>' + ST.unita + '</b></span>'
      + (nota ? '<em>' + esc(nota) + '</em>' : '') + '<small class="spz-err" id="' + id + '-err"></small></label>';
  }
  function campoNum(id, testo, valore, unita, azione, nota) {
    return '<label class="spz-campo"><span>' + esc(testo) + '</span><span class="spz-input"><input id="' + id + '" type="text" inputmode="decimal" enterkeyhint="done" autocomplete="off" value="' + esc(valore == null ? '' : String(valore).replace('.', ',')) + '" onfocus="this.select()" onchange="' + azione + '"><b>' + esc(unita) + '</b></span>'
      + (nota ? '<em>' + esc(nota) + '</em>' : '') + '<small class="spz-err" id="' + id + '-err"></small></label>';
  }
  function testaFalda(sp) {
    const f = sp.falde[ST.faldaI];
    const nomi = modoMano() ? ST.loc.falde.map(x => x.nome) : sp.falde.map(x => x.nome);
    let s = '';
    if (nomi.length > 1) {
      s += '<div class="spz-tabs" role="tablist" aria-label="Falde">';
      nomi.forEach((n, i) => {
        const x = sp.falde[i], fatta = x && x.quote.length > 0 && x.quote.every(q => q.segnato);
        s += '<button type="button" role="tab" aria-selected="' + (i === ST.faldaI) + '" class="spz-tab' + (i === ST.faldaI ? ' on' : '') + '" onclick="spz.falda(' + i + ')">' + (i === ST.faldaI ? '● ' : '') + esc(n) + (fatta ? ' ✓ fatta' : '') + '</button>';
      });
      s += '</div>';
    }
    return s;
  }
  function campiFalda(sp) {
    const i = ST.faldaI;
    if (modoMano()) {
      const r = ST.loc.falde[i];
      return '<label class="spz-campo"><span>Nome della falda</span><span class="spz-input"><input id="spz-nome" type="text" maxlength="40" value="' + esc(r.nome) + '" onchange="spz.nome(this)"></span></label>'
        + campoLung('spz-falda', 'Lunghezza della falda (lungo la pendenza)', r.falda, 'spz.misura(\'falda\',this)')
        + campoLung('spz-gronda', 'Lunghezza della gronda', r.gronda, 'spz.misura(\'gronda\',this)')
        + campoNum('spz-pz', 'Falde uguali', r.pz == null ? 1 : r.pz, 'pezzi', 'spz.pezzi(this)')
        + '<div class="spz-riga"><button type="button" class="btn btn-s spz-tasto" onclick="spz.piuFalda()">➕ Aggiungi falda</button>'
        + (ST.loc.falde.length > 1 ? '<button type="button" class="btn btn-s spz-tasto" onclick="spz.togliFalda()">✖️ Togli falda</button>' : '') + '</div>';
    }
    const f = sp.falde[i]; if (!f) return '';
    const pz = f.pezzi !== 1 ? ' × ' + f.pezzi : '';
    const uf = f.misuraUfficio;
    return '<div class="spz-nome">' + esc(f.nome) + pz + '</div>'
      + campoLung('spz-falda', 'Lunghezza della falda (lungo la pendenza)', f.faldaMm / 1000, 'spz.misura(\'falda\',this)', 'Ufficio: ' + fmtMm(uf.faldaMm))
      + campoLung('spz-gronda', 'Lunghezza della gronda', f.larghezzaMm / 1000, 'spz.misura(\'gronda\',this)', 'Ufficio: ' + fmtMm(uf.larghezzaMm));
  }
  function disegna() {
    const el = $('spz-content'); if (!el) return;
    let h = '<h2 class="spz-titolo">📐 Spartizione tegole</h2>' + selettoreCantiere();
    if (!cantieriScelta().length) { el.innerHTML = h + '<div class="spz-avviso" id="spz-nessun-cantiere">⚠️ ' + (typeof _P2_CANTIERI_ERRORE !== 'undefined' && _P2_CANTIERI_ERRORE ? 'Cantieri non caricati. Controlla la connessione e riapri l\'app.' : 'Nessun cantiere assegnato. Chiedi al titolare.') + '</div>'; return; }
    if (!ST.cantId) { el.innerHTML = h + '<div class="spz-nota" id="spz-scegli">🏗️ Scegli il cantiere qui sopra.</div>'; return; }
    const off = costruisci(), sp = S.spartizione(off);
    if (ST.faldaI >= Math.max(1, modoMano() ? ST.loc.falde.length : sp.falde.length)) ST.faldaI = 0;
    h += bannerFonte();
    h += '<div class="spz-card"><div class="spz-et">📏 Misure in</div><div class="spz-unita" role="group" aria-label="Unità delle misure">'
      + ['m', 'cm', 'mm'].map(u => '<button type="button" id="spz-u-' + u + '" aria-pressed="' + (u === ST.unita) + '" class="spz-u' + (u === ST.unita ? ' on' : '') + '" onclick="spz.unita(\'' + u + '\')">' + (u === ST.unita ? '● ' : '') + u + '</button>').join('') + '</div></div>';
    const teg = sp.tegola ? sp.tegola.id : '';
    let opz = '<option value="">— scegli la tegola —</option>';
    T.TEGOLE.forEach(t => { opz += '<option value="' + esc(t.id) + '"' + (t.id === teg ? ' selected' : '') + '>' + esc(t.nome.split(' — ')[0]) + (t.stato === 'dubbio' ? ' (da confermare)' : '') + '</option>'; });
    const g = pendenzaSconosciuta() ? null : off.pendenza.gradi;
    h += '<div class="spz-card"><label class="spz-campo"><span>🧱 Tegola</span><select id="spz-tegola" class="spz-sel" onchange="spz.tegola(this.value)">' + opz + '</select></label>'
      + '<div id="spz-tegola-nota">' + notaTegola(sp) + '</div>'
      + '<label class="spz-campo"><span>📐 Pendenza del tetto</span><span class="spz-input"><input id="spz-pendenza" type="text" inputmode="decimal" enterkeyhint="done" autocomplete="off" value="' + esc(testoPendenza(g)) + '" onfocus="this.select()" onchange="spz.pendenza(this)"><b>' + ST.pendU + '</b></span><small class="spz-err" id="spz-pendenza-err"></small></label>'
      + '<div class="spz-unita spz-unita-2" role="group" aria-label="Unità della pendenza">' + ['%', '°'].map(u => '<button type="button" id="spz-pu-' + (u === '%' ? 'p' : 'g') + '" aria-pressed="' + (u === ST.pendU) + '" class="spz-u' + (u === ST.pendU ? ' on' : '') + '" onclick="spz.pendUnita(\'' + u + '\')">' + (u === ST.pendU ? '● ' : '') + 'in ' + u + '</button>').join('') + '</div></div>';
    h += '<div class="spz-card">' + testaFalda(sp) + '<div id="spz-campi-falda">' + campiFalda(sp) + '</div>'
      + '<button type="button" id="spz-rifai" class="btn btn-g spz-rifai" onclick="spz.rifai()">📐 Rifai la spartizione</button><div id="spz-fatto" role="status"></div></div>';
    h += '<details class="spz-card" id="spz-altri"' + (ST.altriAperti ? ' open' : '') + ' ontoggle="spz.altri(this.open)"><summary>⚙️ Altri valori</summary>' + campiAltri(off) + '</details>';
    h += '<div id="spz-ris"></div>';
    h += '<div class="spz-riga spz-fondo"><button type="button" class="btn btn-s spz-tasto" id="spz-stampa" onclick="spz.stampa()">🖨️ Stampa</button><button type="button" class="btn btn-s spz-tasto" id="spz-svuota" onclick="spz.svuota()">🗑️ Togli le mie misure</button></div>';
    h += '<div class="spz-nota">📱 Quello che scrivi resta su questo telefono.</div>';
    el.innerHTML = h;
    risultati();
  }
  const testoPendenza = g => { if (g == null) return ''; const x = ST.pendU === '%' ? percDaGradi(g) : g; return String(Math.round(x * 100) / 100).replace('.', ','); };
  function notaTegola(sp) {
    const t = sp.tegola; if (!t) return '';
    return '<div class="' + (t.stato === 'dubbio' ? 'spz-avviso' : 'spz-nota') + '">' + (t.stato === 'dubbio' ? '⚠️ Dati della tegola da confermare in ufficio.' : '✅ Dati dalla scheda del produttore.') + (t.da && t.da !== 'scelta a mano' ? ' Proposta dall\'offerta.' : '') + '</div>';
  }
  function campiAltri(off) {
    const q = Q.impostazioni(off), iso = q.isolante;
    const lung = (id, testo, chiave, metri, nota) => campoLung('spz-o-' + id, testo, metri, 'spz.opzLung(\'' + chiave + '\',this)', nota);
    const num = (id, testo, chiave, val, u, nota) => campoNum('spz-o-' + id, testo, val, u, 'spz.opzNum(\'' + chiave + '\',this)', nota);
    const barra = (id, chiave, val) => '<div class="spz-et">' + id + ': barre da</div><div class="spz-unita spz-unita-2" role="group">' + [4, 5].map(b => '<button type="button" id="spz-b-' + chiave.split('.')[0] + '-' + b + '" aria-pressed="' + (val === b) + '" class="spz-u' + (val === b ? ' on' : '') + '" onclick="spz.opzVal(\'' + chiave + '\',' + b + ')">' + (val === b ? '● ' : '') + b + ' m</button>').join('') + '</div>';
    return '<div class="spz-nota" id="spz-sup-calc">' + testoSuperficie(off) + '</div>' + num('sup', 'Superficie per il materiale (vuoto = calcolata)', 'sup', ST.loc.sup, 'm²', 'Si può scrivere direttamente.')
      + lung('colmi', 'Colmi', 'colmi', ST.loc.colmi != null ? ST.loc.colmi : metriMisura(off, 'colmi'), 'Lunghezza totale')
      + lung('cant', 'Cantonali', 'cantonali', ST.loc.cantonali != null ? ST.loc.cantonali : metriMisura(off, 'cantonali'), 'Lunghezza totale')
      + lung('primo', 'Primo listone dalla scossalina', 'primoListone', q.primoListone)
      + lung('sporg', 'Sporgenza delle tegole al bordo, per lato', 'sporgenzaBordo', q.sporgenzaBordo)
      + lung('passo', 'Passo a mano (vuoto = proposto)', 'passoMano', q.passoMano)
      + lung('inter', 'Interasse delle travi', 'controlistoni.interasse', q.controlistoni.interasse)
      + barra('Listoni', 'listoni.lungBarra', q.listoni.lungBarra) + barra('Controlistoni', 'controlistoni.lungBarra', q.controlistoni.lungBarra)
      + '<div class="spz-et">Listone anche al colmo</div><div class="spz-unita spz-unita-2" role="group">' + [[true, 'Sì'], [false, 'No']].map(([b, n]) => '<button type="button" id="spz-colmo-' + b + '" aria-pressed="' + (!!q.listoni.listoneColmo === b) + '" class="spz-u' + (!!q.listoni.listoneColmo === b ? ' on' : '') + '" onclick="spz.opzVal(\'listoni.listoneColmo\',' + b + ')">' + (!!q.listoni.listoneColmo === b ? '● ' : '') + n + '</button>').join('') + '</div>'
      + num('sc-teg', 'Tegole: scarto', 'scartoTegole', q.scartoTegole, '%') + num('sf-lis', 'Listoni: sfrido', 'listoni.sfrido', q.listoni.sfrido, '%') + num('sf-con', 'Controlistoni: sfrido', 'controlistoni.sfrido', q.controlistoni.sfrido, '%')
      + lung('sp-g', 'Sporto di gronda (in pianta)', 'sportoGronda', q.sportoGronda) + lung('sp-l', 'Sporti dei lati (somma dei due)', 'sportoLati', q.sportoLati)
      + '<div class="spz-et">Isolante: strati</div><div class="spz-unita" role="group">' + [0, 1, 2].map(b => '<button type="button" id="spz-str-' + b + '" aria-pressed="' + (Number(iso.strati) === b) + '" class="spz-u' + (Number(iso.strati) === b ? ' on' : '') + '" onclick="spz.opzVal(\'isolante.strati\',' + b + ')">' + (Number(iso.strati) === b ? '● ' : '') + (b || 'Niente') + '</button>').join('') + '</div>'
      + num('sc-iso', 'Isolante: scarto', 'isolante.scarto', iso.pannelli[0].scarto, '%')
      + lung('pan-l', 'Pannello: larghezza', 'isolante.pannelli.larg', iso.pannelli[0].larg) + lung('pan-h', 'Pannello: lunghezza', 'isolante.pannelli.lung', iso.pannelli[0].lung)
      + '<button type="button" class="btn btn-s spz-tasto" id="spz-azzera" onclick="spz.azzeraAltri()">🔄 Valori di base</button>';
  }
  function testoSuperficie(off) {
    const m = off.misure.find(x => x.id === 'sup'), v = MOD.valoriMisura(m, off.pendenza.gradi);
    return '📐 Calcolata: ' + fmtN(v.reale) + ' m². Per il materiale: ' + fmtN(v.usato) + ' m²' + (v.scelto != null ? ' (scritta)' : ' (+3 %, per eccesso)') + '.' + (v.avvisi.length ? ' ⚠️ Scritta meno di quella calcolata.' : '');
  }
  function metriMisura(off, id) { const m = off.misure.find(x => x.id === id); return m ? MOD.valoriMisura(m, off.pendenza.gradi).reale || null : null; }

  // ─── Risultati ───
  function risultati() {
    const el = $('spz-ris'); if (!el) return;
    const off = costruisci(), sp = S.spartizione(off);
    const nt = $('spz-tegola-nota'); if (nt) nt.innerHTML = notaTegola(sp);
    const ns = $('spz-sup-calc'); if (ns) ns.innerHTML = testoSuperficie(off);
    let f = sp.falde[ST.faldaI];
    const perche = t => (t ? '<details class="spz-perche"><summary>perché?</summary><span>' + esc(t) + '</span></details>' : '');
    let h = '';
    const incompleta = modoMano() && ST.loc.falde[ST.faldaI] && !completa(ST.loc.falde[ST.faldaI]);
    if (incompleta || !f) h += '<div class="spz-nota" id="spz-manca">✍️ Scrivi falda e gronda, poi «Rifai la spartizione».</div>';
    else {
      const manoP = modoMano();
      h += '<div class="spz-numeri" id="spz-numeri">'
        + num('Passo', fmtMm(f.passoMm), perche(f.perche.passo))
        + num('File di tegole', f.file == null ? '—' : f.file, '')
        + num('Ultima fila', fmtMm(f.ultimaFilaMm), (f.ultimaCorta ? '<em>≠ più corta</em>' : '') + perche(f.perche.ultima), f.ultimaCorta ? 'spz-div' : '')
        + num('Primo listone', fmtMm(f.primoListoneMm), '<em>dalla scossalina</em>')
        + num('Falda', fmtMm(f.faldaMm), (f.daCantiere ? '<em>misura sul tetto</em>' : '') + (manoP ? '' : perche(f.perche.falda)))
        + num('Gronda', fmtMm(f.larghezzaMm), '')
        + num('Tegole per fila', f.tegolePerFila == null ? '—' : f.tegolePerFila, perche(f.perche.perFila))
        + num('Tegole della falda', f.tegoleFalda == null ? '—' : f.tegoleFalda, '<em>da posare, senza scarto</em>' + perche(f.perche.tegoleFalda))
        + num('Controlistoni', f.controlistoni.linee + ' × ' + fmtMm(f.controlistoni.lunghezzaMm), '<em>ogni ' + fmtMm(f.controlistoni.interasseCm * 10) + '</em>' + perche(f.perche.controlistoni))
        + '</div>';
      h += bordo(f, sp);
      if (f.quote.length) h += quote(f);
    }
    const av = avvisiPerCantiere(sp.avvisi);
    if (pendenzaSconosciuta() && sp.tegola) av.unshift('Pendenza non scritta: per il passo conto la pendenza più bassa. Scrivila.');
    if (av.length) h += '<ul class="spz-avvisi" id="spz-avvisi" aria-label="Avvisi">' + av.map(a => '<li>⚠️ ' + esc(a) + '</li>').join('') + '</ul>';
    if (sp.materiale.length) {
      h += '<div class="spz-card" id="spz-materiale"><h3>📦 Materiale per tutto il tetto</h3><div class="spz-nota">Scarti e sfridi compresi.</div>'
        + sp.materiale.map(m => '<div class="spz-mat"><div><b>' + esc(m.cosa) + '</b><small>' + esc(m.dettaglio) + '</small>' + perche(m.perche) + '</div><div class="spz-q"><b>' + m.quantita + '</b> ' + esc(m.unita) + '</div></div>').join('') + '</div>';
    }
    el.innerHTML = h;
    function num(t, val, extra, cl) { return '<div class="spz-num ' + (cl || '') + '"><span>' + esc(t) + '</span><b>' + esc(val) + '</b>' + (extra || '') + '</div>'; }
  }
  function bordo(f, sp) {
    const b = f.bordo; if (!b || !b.combinazioni.length) return '';
    const nomeN = sp.nomi && sp.nomi.normale ? sp.nomi.normale[0] : 'normali';
    return '<div class="spz-card" id="spz-bordo"><h3>🧱 Tegole al bordo</h3><div class="spz-nota">Sporgenza voluta ' + fmtMm(b.sporgenzaMm) + ' per lato. La scelta la fai tu: tocca una riga.</div>'
      + b.combinazioni.map(c => {
        const scelta = b.scelta === c.chiave, cons = b.consigliata === c.chiave, spenta = c.daVerificare || !c.arriva;
        const titolo = esc(c.nomeMio || c.nome);
        const testo = c.daVerificare ? titolo + ': <em>da verificare</em> (manca la larghezza di ' + esc((c.mancano || []).join(' e ')) + ')'
          : titolo + ': <b>' + c.normali + '</b> ' + esc(nomeN) + ' · ' + (c.arriva ? 'sporge <b>' + fmtMm(c.restoMm) + '</b> per lato' : 'non arriva al bordo (' + fmtMm(c.restoMm) + ')');
        return '<button type="button" class="spz-opz' + (scelta ? ' on' : '') + (spenta ? ' spenta' : '') + '"' + (spenta ? ' disabled' : '') + ' aria-pressed="' + scelta + '" onclick="spz.bordo(\'' + esc(c.chiave) + '\')">' + (scelta ? '● Scelta · ' : '') + (cons ? '★ Consigliata · ' : '') + testo + '</button>';
      }).join('') + '</div>';
  }
  function quote(f) {
    const righe = f.quote.slice().reverse().map(q => {
      const nome = (q.n === 0 ? 'G · gronda' : 'Fila ' + q.n) + (q.n > 0 && q.n === f.file ? ' · colmo' : '');
      return '<tr class="' + (q.segnato ? 'on ' : '') + (q.diversa ? 'div' : '') + '" onclick="spz.segna(' + q.n + ',' + !q.segnato + ')"><td class="spz-sp"><span class="spz-check" role="checkbox" aria-checked="' + q.segnato + '" aria-label="Segnato ' + esc(nome) + '">' + (q.segnato ? '✓' : '') + '</span></td>'
        + '<td>' + (q.segnato ? '✓ ' : '') + esc(nome) + '</td><td class="dx"><b>' + fmtMm(q.quotaMm) + '</b></td><td class="dx">' + fmtMm(q.distanzaMm) + (q.diversa ? '<div class="spz-diversa">≠ diversa</div>' : '') + '</td></tr>';
    }).join('');
    return '<div class="spz-card" id="spz-quote"><h3>📏 Quote dei listoni</h3><div class="spz-nota">Dalla scossalina, lungo la pendenza. Tocca una riga quando l\'hai segnata.' + (f.listoneColmo ? ' Più 1 listone al colmo.' : '') + '</div>'
      + '<table class="spz-tab"><thead><tr><th>Fatto</th><th>Listone</th><th class="dx">Quota</th><th class="dx">Distanza</th></tr></thead><tbody>' + righe + '</tbody></table>'
      + '<div class="spz-disegno">' + S.disegnoFalda(f, { larghezza: 360, misura: fmtMm }) + '</div>'
      + '<div class="spz-nota">━ passo uguale · ╍ ≠ distanza diversa · ✓ segnato</div></div>';
  }

  // ─── Azioni ───
  function errore(id, testo) { const e = $(id + '-err'); if (e) e.textContent = testo || ''; }
  const TESTO_ERR = { errato: 'Numero non valido: non lo uso. Esempio: 583,8', zero: '0 non è una misura: non lo uso.' };
  function leggiCampo(input, permettiZero) {
    const r = CT.leggiMisura(input.value, ST.unita);
    if (r.stato === 'errato' || (r.stato === 'zero' && !permettiZero)) { errore(input.id, TESTO_ERR[r.stato]); return null; }
    errore(input.id, '');
    if (r.stato === 'vuoto') return null;
    input.value = campoDa(r.metri);   // incollato con altra unita' o con apostrofi: si riscrive pulito
    return r.metri;
  }
  function cambiatoQualcosa() { ST.loc.rifOfferta = ST.offerta ? ST.offerta.aggiornato_il : null; salva(); risultati(); const x = $('spz-fatto'); if (x) x.textContent = ''; }
  function setPercorso(o, chiave, val) {
    const p = chiave.split('.'); let c = o;
    p.slice(0, -1).forEach(k => { c[k] = (c[k] && typeof c[k] === 'object') ? c[k] : {}; c = c[k]; });
    if (val == null) delete c[p[p.length - 1]]; else c[p[p.length - 1]] = val;
  }
  window.spz = {
    cantiere(id) { scegli(id); },
    falda(i) { document.activeElement && document.activeElement.blur && document.activeElement.blur(); ST.faldaI = i; disegna(); },
    unita(u) { document.activeElement && document.activeElement.blur && document.activeElement.blur(); ST.unita = u; sicuro(() => localStorage.setItem(chiaveU(), u)); disegna(); },
    pendUnita(u) { document.activeElement && document.activeElement.blur && document.activeElement.blur(); ST.pendU = u; sicuro(() => localStorage.setItem(chiaveP(), u)); disegna(); },
    altri(aperto) { ST.altriAperti = aperto; },
    tegola(id) { ST.loc.tegola = id || null; ST.loc.bordo = {}; cambiatoQualcosa(); },
    pendenza(input) {
      const n = CT.leggiNumero(input.value);
      if (String(input.value).trim() === '') { errore(input.id, ''); ST.loc.gradi = null; input.value = testoPendenza(ST.offerta && ST.offerta.pendenza ? ST.offerta.pendenza.gradi : null); }
      else if (n === null || n < 0 || (ST.pendU === '°' && n >= 90)) { errore(input.id, 'Numero non valido: non lo uso.'); return; }
      else { errore(input.id, ''); ST.loc.gradi = ST.pendU === '%' ? gradiDaPerc(n) : n; }
      cambiatoQualcosa();
    },
    misura(cosa, input) {
      const m = leggiCampo(input, false), i = ST.faldaI;
      if (modoMano()) ST.loc.falde[i][cosa] = m;
      else {
        const sp = S.spartizione(costruisci()), f = sp.falde[i];
        const uf = cosa === 'falda' ? f.misuraUfficio.faldaMm : f.misuraUfficio.larghezzaMm;
        ST.loc.misure[i] = ST.loc.misure[i] || {};
        // uguale all'ufficio (al mm) = nessuna misura del tetto; vuoto = torna all'ufficio
        ST.loc.misure[i][cosa] = m == null || Math.abs(m * 1000 - uf) < 0.5 ? null : m;
        if (m == null && String(input.value).trim() === '') input.value = campoDa(uf / 1000);
      }
      cambiatoQualcosa();
    },
    nome(input) { const n = String(input.value).trim(); ST.loc.falde[ST.faldaI].nome = n || 'Falda ' + (ST.faldaI + 1); salva(); disegnaTab(); },
    pezzi(input) {
      const n = CT.leggiNumero(input.value);
      if (n === null || n <= 0) { errore(input.id, 'Numero non valido: uso 1.'); ST.loc.falde[ST.faldaI].pz = 1; }
      else { errore(input.id, ''); ST.loc.falde[ST.faldaI].pz = n; }
      cambiatoQualcosa();
    },
    piuFalda() { document.activeElement && document.activeElement.blur && document.activeElement.blur(); ST.loc.falde.push({ nome: 'Falda ' + (ST.loc.falde.length + 1), gronda: null, falda: null, pz: 1 }); ST.faldaI = ST.loc.falde.length - 1; salva(); disegna(); },
    togliFalda() {
      if (ST.loc.falde.length < 2 || !confirm('Togliere questa falda?')) return;
      const i = ST.faldaI, sposta = o => { const n = {}; Object.keys(o).forEach(k => { const x = Number(k); if (x < i) n[x] = o[k]; else if (x > i) n[x - 1] = o[k]; }); return n; };
      ST.loc.falde.splice(i, 1); ST.loc.segnati = sposta(ST.loc.segnati); ST.loc.bordo = sposta(ST.loc.bordo); ST.faldaI = 0; salva(); disegna();
    },
    rifai() {
      document.activeElement && document.activeElement.blur && document.activeElement.blur();
      risultati();
      const x = $('spz-fatto'), a = $('spz-falda'), b = $('spz-gronda');
      if (x && a && b && a.value && b.value) x.textContent = '✅ Spartizione rifatta: falda ' + a.value + ' ' + ST.unita + ', gronda ' + b.value + ' ' + ST.unita + '.';
      const r = $('spz-ris'); if (r && r.scrollIntoView) r.scrollIntoView({ block: 'start' });
    },
    bordo(chiave) { const i = ST.faldaI; if (ST.loc.bordo[i] === chiave) delete ST.loc.bordo[i]; else ST.loc.bordo[i] = chiave; salva(); risultati(); },
    segna(n, si) {
      const i = ST.faldaI, l = new Set(ST.loc.segnati[i] || []);
      if (si) l.add(n); else l.delete(n);
      ST.loc.segnati[i] = Array.from(l).sort((a, b) => a - b); salva();
      const y = window.scrollY; risultati(); disegnaTab(); window.scrollTo(0, y);
    },
    opzLung(chiave, input) {
      const m = leggiCampo(input, true);
      if (chiave === 'colmi' || chiave === 'cantonali') ST.loc[chiave] = m;
      else if (chiave.startsWith('isolante.pannelli.')) { const k = chiave.split('.')[2]; ST.loc.opz.isolante = ST.loc.opz.isolante || {}; const p = ST.loc.opz.isolante.pannelli = ST.loc.opz.isolante.pannelli || [{}, {}]; [0, 1].forEach(i => { if (m == null) delete p[i][k]; else p[i][k] = m; }); }
      else setPercorso(ST.loc.opz, chiave, m);
      cambiatoQualcosa();
    },
    opzNum(chiave, input) {
      const n = String(input.value).trim() === '' ? null : CT.leggiNumero(input.value);
      if (String(input.value).trim() !== '' && (n === null || n < 0)) { errore(input.id, 'Numero non valido: non lo uso.'); return; }
      errore(input.id, '');
      if (chiave === 'sup') ST.loc.sup = n === 0 ? null : n;
      else if (chiave === 'isolante.scarto') { ST.loc.opz.isolante = ST.loc.opz.isolante || {}; const p = ST.loc.opz.isolante.pannelli = ST.loc.opz.isolante.pannelli || [{}, {}]; [0, 1].forEach(i => { if (n == null) delete p[i].scarto; else p[i].scarto = n; }); }
      else setPercorso(ST.loc.opz, chiave, n);
      cambiatoQualcosa();
    },
    opzVal(chiave, val) { setPercorso(ST.loc.opz, chiave, val); salva(); disegna(); },
    azzeraAltri() { ST.loc.opz = {}; ST.loc.sup = null; ST.loc.colmi = null; ST.loc.cantonali = null; salva(); disegna(); },
    svuota() {
      if (!confirm('Togliere le misure scritte su questo telefono per questo cantiere?')) return;
      sicuro(() => localStorage.removeItem(chiaveLoc())); ST.loc = nuovoLoc(); ST.faldaI = 0; disegna();
    },
    stampa() { stampa(); },
    // per le prove e per chi legge il codice: lo stato calcolato adesso
    calcola() { const off = costruisci(); return { off, sp: S.spartizione(off), unita: ST.unita, esito: ST.esito, modoMano: modoMano() }; },
  };
  function disegnaTab() {
    const t = document.querySelector('#scr-spartizione .spz-tabs'); if (!t) return;
    const sp = S.spartizione(costruisci()), w = document.createElement('div'); w.innerHTML = testaFalda(sp);
    if (w.firstChild) t.replaceWith(w.firstChild);
  }

  // ─── Stampa: l'unita' e' sempre scritta ───
  function stampa() {
    const off = costruisci(), sp = S.spartizione(off), c = (CANTIERI || []).find(x => x.id === ST.cantId);
    const w = window.open('', '_blank');
    if (!w) { showToast('Finestra di stampa bloccata dal telefono', 'e'); return; }
    let h = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Spartizione</title><style>body{font-family:Arial,sans-serif;font-size:15px;color:#111;padding:20px}h1,h2{margin:0 0 8px}table{border-collapse:collapse;width:100%;margin:10px 0}th,td{border:1px solid #bbb;padding:5px 8px;text-align:left}.dx{text-align:right}.falda{page-break-after:always}svg{max-width:100%;height:auto}.no-print{margin-bottom:12px}@media print{.no-print{display:none}}</style></head><body>'
      + '<button class="no-print" onclick="window.print()" style="font-size:18px;padding:10px 18px">🖨️ Stampa / salva PDF</button>'
      + '<h1>Spartizione tegole · ' + esc(c ? _cantEtichetta(c) : '') + '</h1><p>Tegola: ' + esc(sp.tegola ? sp.tegola.nome.split(' — ')[0] : 'non scelta') + ' · Pendenza ' + fmtN(percDaGradi(off.pendenza.gradi), 1) + ' % (' + fmtN(off.pendenza.gradi, 1) + '°) · Misure in ' + ST.unita + '</p>';
    sp.falde.forEach(f => {
      if (!f.quote.length) return;
      h += '<div class="falda"><h2>' + esc(f.nome) + (f.pezzi !== 1 ? ' × ' + f.pezzi : '') + '</h2><p>Falda ' + fmtMm(f.faldaMm) + ' · Gronda ' + fmtMm(f.larghezzaMm) + ' · Passo ' + fmtMm(f.passoMm) + ' · ' + f.file + ' file · Primo listone ' + fmtMm(f.primoListoneMm) + ' dalla scossalina · ' + f.tegoleFalda + ' tegole da posare</p>'
        + S.disegnoFalda(f, { misura: fmtMm })
        + '<table><tr><th>Listone</th><th class="dx">Quota</th><th class="dx">Distanza</th></tr>' + f.quote.slice().reverse().map(q => '<tr><td>' + (q.segnato ? '✓ ' : '') + (q.n === 0 ? 'Gronda' : 'Fila ' + q.n) + '</td><td class="dx">' + fmtMm(q.quotaMm) + '</td><td class="dx">' + fmtMm(q.distanzaMm) + (q.diversa ? ' ≠' : '') + '</td></tr>').join('') + '</table></div>';
    });
    if (sp.materiale.length) h += '<div><h2>Materiale per tutto il tetto</h2><table>' + sp.materiale.map(m => '<tr><td>' + esc(m.cosa) + (m.dettaglio ? ' <small>(' + esc(m.dettaglio) + ')</small>' : '') + '</td><td class="dx"><b>' + m.quantita + '</b> ' + esc(m.unita) + '</td></tr>').join('') + '</table></div>';
    w.document.write(h + '</body></html>'); w.document.close();
  }

  window.spzApri = apri;
  window.spzDaCantiere = function () { if (curCant) ST.vuole = curCant.id; navTo('spartizione'); };
})();
