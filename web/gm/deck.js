/* ===== GM tab "Jeu": the campaign's Deck of Many Things (only in campaigns that have one) ===== */
'use strict';

const DK = { sub: store.get('gt-deck-sub', 'gm'), show: null, filter: 'all', who: '', other: '', announce: false };
const DECK = () => S.camp.deck;

/* the tab button is shown only when the active campaign has a deck */
function onCampaignLoaded() {
  const b = $('#tabs [data-tab="deck"]');
  if (b) b.classList.toggle('hidden', !DECK());
}

function deckDefaults(D) {
  D.inDeck ??= deckOfficial(D, 22); D.gone ??= []; D.draws ??= []; D.access ??= {}; D.mode ??= 'uniform';
  D.announce ??= true; D.felure ??= 2; D.gmSeq ??= null;
  return D;
}
function accessOf(D, id) {
  const a = D.access[id] ??= {};
  a.visible ??= false; a.allowed ??= null; a.max ??= 1; a.declared ??= null; a.drawn ??= 0; a.extra ??= 0;
  return a;
}
const remainingOf = a => a.declared == null ? 0 : Math.max(0, a.declared + (a.extra || 0) - (a.drawn || 0));
const fmtT = ms => new Date(ms).toLocaleString([], { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const gmRender = s => richNote(s);
function deckSave() { saveCamp(); rerender(); }

/* ---------------------------------------------------------------- draw by the GM */
function gmDraw(D, cardId = null, roll = null) {
  const cards = deckCards(D);
  if (!cardId) {
    [cardId, roll] = deckPick(D, deckPool(D));
    if (!cardId) return toast('Le Jeu est vide : ajoutez des cartes dans « Toutes les cartes ».');
  }
  const c = cards[cardId], ex = c.extra || {}, seq = D.gmSeq;
  const who = DK.who === '__other' ? (DK.other.trim() || 'PNJ') : (S.chars[DK.who]?.name || DK.who || 'MJ');
  const e = { id: uid('dr'), card: cardId, who, whoId: DK.who && DK.who !== '__other' ? DK.who : null, by: 'gm', t: Date.now(), roll, used: false, note: '' };
  if (seq) {
    seq.drawn++; e.n = seq.drawn; e.of = seq.declared + seq.extra;
    if (ex.auto) seq.extra += ex.auto;
    if (ex.end) { e.ended = seq.declared + seq.extra > seq.drawn; seq.declared = seq.drawn; seq.extra = 0; }
    e.seq = true;
  }
  if (DECK_CORE.includes(c.set)) D.felure = Math.min(10, (D.felure || 0) + 1);
  if (ex.gone && !D.gone.includes(cardId)) { D.gone.push(cardId); D.felure = Math.min(10, (D.felure || 0) + 1); }
  D.draws.unshift(e); D.draws.length = Math.min(D.draws.length, 300);
  logInfo(`<i class="ico i-joker"></i> <b>${esc(who)}</b> tire une carte du Jeu : <b>${esc(c.n)}</b>${e.of > 1 ? ` (${e.n}/${e.of})` : ''}`, !DK.announce);
  DK.show = e.id; deckSave();
  if (e.whoId && c.auto?.ops) gmFx(e);
}
/* full card -> fields used by the shared display of the automatic effects */
const fxCard = c => c && { ...c, choose: c.auto?.choose || [], auto: !!c.auto?.ops };
/* sends the campaign now (the server must know the draw), then applies the effects on the server */
async function gmFx(entry, extra = {}) {
  try {
    for (const k of Object.keys(timers)) if (k.startsWith('save:camp')) { clearTimeout(timers[k]); delete timers[k]; }
    const s = await api('PUT', '/api/campaign', S.camp, { 'X-Base-Rev': String(S.rev || 0) });
    S.rev = s.merged ? 0 : Math.max(S.rev, s.rev);
    const r = await api('POST', '/api/deck/fx', { draw: entry.id, ...extra });
    await loadAll();
    const D = DECK(), x = D.draws.find(y => y.id === entry.id);
    if (x?.fx?.grant && x.seq && !x.used && D.gmSeq) { D.gmSeq.extra += x.fx.grant; x.used = 'may'; saveCamp(); }
    if (r.fx?.status === 'done') toast(`<i class="ico i-sparkle"></i> Effets appliqués à la fiche de ${esc(entry.who)}.`);
    rerender();
  } catch (err) { toast('<i class="ico i-alert"></i> ' + esc(err.message || 'Échec')); await loadAll(); rerender(); }
}
function gmOption(D, entry, kind) {
  const c = deckCards(D)[entry.card], ex = c?.extra || {}, seq = D.gmSeq;
  if (entry.used) return;
  if (seq && entry.seq) {
    if (kind === 'may') seq.extra += ex.may;
    if (kind === 'stop') { seq.declared = seq.drawn; seq.extra = 0; }
    if (kind === 'reduce') seq.declared = Math.max(seq.drawn - seq.extra, seq.declared - ex.reduce);
  }
  entry.used = kind; deckSave();
}
function showToPlayers(c) {
  S.camp.handout = { t: Date.now(), title: c.n, body: `*${c.flavor || ''}*\n\n**Effet** : ${c.fx}` };
  logInfo(`<i class="ico i-announce"></i> Carte montrée aux joueurs : <b>${esc(c.n)}</b>`, true);
  saveCamp(); toast('<i class="ico i-announce"></i> Carte affichée sur l\'écran des joueurs.');
}

/* ---------------------------------------------------------------- sub-tabs */
function subGM(D) {
  const cards = deckCards(D), pool = deckPool(D), seq = D.gmSeq;
  const entry = D.draws.find(x => x.id === DK.show) || D.draws.find(x => x.by === 'gm');
  const c = entry && cards[entry.card];
  const rem = seq ? Math.max(0, seq.declared + seq.extra - seq.drawn) : null;
  return `<div class="grid2" style="grid-template-columns:minmax(260px,1fr) minmax(0,2.4fr)">
    <div class="col">
      <div class="card col"><h4><i class="ico i-joker"></i> Piocher</h4>
        <label class="field"><span>Qui tire ?</span><select id="dk-who"><option value="">Le MJ (sans tireur précis)</option>
          ${charList().map(p => `<option value="${p.id}" ${DK.who === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}
          <option value="__other" ${DK.who === '__other' ? 'selected' : ''}>Un PNJ ou quelqu'un d'autre…</option></select></label>
        ${charList().length ? '' : `<div class="muted small"><i class="ico i-alert"></i> Aucun personnage dans cette campagne : créez ou importez ceux des joueurs (onglet Personnages) pour que les effets des cartes s'appliquent automatiquement à leur fiche.</div>`}
        ${DK.who === '__other' ? `<input id="dk-other" placeholder="Nom du tireur (ex. le Croupier)" value="${esc(DK.other)}">` : ''}
        ${seq && rem ? `<div class="note"><b>${esc(seq.who)}</b> a annoncé <b>${seq.declared}</b> carte(s)${seq.extra ? ` (+${seq.extra} en bonus)` : ''} · tirées : <b>${seq.drawn}</b> · restantes : <b>${rem}</b>
            <div class="muted small">Chaque carte doit être tirée dans l'heure qui suit la précédente ; sinon les cartes restantes jaillissent d'elles-mêmes et agissent toutes en même temps.</div></div>
          <div class="row"><button class="primary" id="dk-draw"><i class="ico i-joker"></i> Piocher la carte ${seq.drawn + 1}</button><button class="small" id="dk-seq-end">Abandonner</button></div>`
        : seq ? (() => { const end = D.draws.find(x => x.seq && x.ended && x.t >= (seq.t || 0)); return `<div class="note"><b>Tirage terminé</b> : ${seq.drawn} carte(s) tirée(s) par ${esc(seq.who)}.
            ${end ? `<div class="dk-ended">La carte <b>${esc(cards[end.card]?.n || '')}</b> a mis fin au tirage : selon la règle officielle, le tireur ne tire plus de cartes. Les cartes annoncées restantes sont annulées.</div>` : ''}</div>
          <button class="primary" id="dk-seq-end"><i class="ico i-joker"></i> Nouveau tirage</button>`; })()
        : `<div class="row"><label class="row small">Cartes annoncées <input type="number" id="dk-n" min="1" max="22" value="1" style="width:60px"></label>
            <button class="primary" id="dk-seq">Annoncer le tirage</button></div>
          <button id="dk-draw1"><i class="ico i-joker"></i> Piocher une seule carte, tout de suite</button>`}
        ${pool.length ? '' : `<div class="dk-ended"><b>Le Jeu est vide</b> : aucune carte ne peut sortir. <button class="small" data-preset="22">Remettre le Jeu de 22</button> <button class="small" data-preset="66">Mettre les 66 cartes</button></div>`}
        <label class="chk small"><input type="checkbox" id="dk-ann" ${DK.announce ? 'checked' : ''}> Montrer ce tirage dans l'historique des joueurs</label>
        <div class="muted small">Jeu actuel : <b>${pool.length}</b> carte(s)${D.gone.length ? ` · disparues : ${D.gone.map(i => esc(cards[i]?.n || i)).join(', ')}` : ''} · tirage ${D.mode === 'd100' ? 'avec la table d100 officielle' : 'comme un paquet mélangé'}.</div>
      </div>
      <div class="card col"><h4><i class="ico i-hand"></i> Appliquer une carte précise</h4>
        <div class="muted small">Pour une carte éveillée qu'un porteur retourne (règle R3), une carte tirée avec un vrai paquet, ou un essai.</div>
        <select id="dk-pick">${(D.cards || []).map(x => `<option value="${x.id}">${esc(x.n)} (${esc(x.en)})</option>`).join('')}</select>
        <button id="dk-apply">Appliquer cette carte au tireur</button>
      </div>
      <div class="card"><h4><i class="ico i-list"></i> Derniers tirages</h4><div class="col">${D.draws.slice(0, 8).map(histLine).join('') || '<span class="muted small">Aucun.</span>'}</div></div>
    </div>
    <div class="card">${c ? `<div class="row" style="margin-bottom:8px"><b>${esc(entry.who)}</b><span class="muted small">${entry.by === 'player' ? 'tirage d\'un joueur' : 'tirage du MJ'} · ${fmtT(entry.t)}${entry.of > 1 ? ` · carte ${entry.n}/${entry.of}` : ''}</span>
        <span class="right"></span><button class="small" id="dk-showpl"><i class="ico i-announce"></i> Montrer aux joueurs</button></div>
        ${DECK_CORE.includes(c.set) ? `<div class="note warn small"><i class="ico i-alert"></i> Carte du Jeu de Séraphine : la Fêlure a monté de 1${c.extra?.gone ? ', et de 1 de plus car la carte a quitté le Jeu' : ''} (actuellement ${D.felure}).</div>` : `<div class="note small">Lame errante de Lise : la Fêlure ne bouge pas.</div>`}
        ${entry.ended ? `<div class="dk-ended">Cette carte met fin au tirage : ${esc(entry.who)} ne tire plus de cartes (règle officielle).</div>` : ''}
        ${deckFxHTML(fxCard(c), entry.fx, { gm: true, sheet: !!entry.whoId && !!S.chars[entry.whoId] })}
        ${deckCardHTML(c, { gm: true, render: gmRender, draw: entry })}
        ${entry.by === 'gm' && entry.seq ? deckOptions(c, entry) : entry.used ? `<div class="muted small">Option choisie par le joueur : ${esc(entry.used)}.</div>` : ''}
        <label class="field" style="margin-top:10px"><span>Note privée sur ce tirage (PNJ du Vaurien, objet choisi, conséquences…)</span><textarea id="dk-note" rows="3">${esc(entry.note || '')}</textarea></label>`
      : `<div class="empty"><i class="ico i-joker"></i><br>Aucune carte tirée pour l'instant.<br><span class="small">Choisissez un tireur, annoncez le nombre de cartes, puis piochez. La carte s'affichera ici avec son effet et les rebondissements possibles.</span></div>`}</div>
  </div>`;
}
function histLine(x) {
  const c = deckCards(DECK())[x.card] || { n: x.card };
  return `<div class="dk-hist" data-hist="${x.id}" style="--tone:${deckTone(c)[1]}">${deckIcon(c, 'dk-mi')}<b>${esc(c.n)}</b>
    <span class="muted small grow">${esc(x.who)}${x.by === 'player' ? ' <i class="ico i-player" title="tirage d\'un joueur"></i>' : ''}</span><span class="muted small">${fmtT(x.t)}</span></div>`;
}
function subPlayers(D) {
  const pcs = charList(), cards = deckCards(D), pool = deckPool(D);
  return `<div class="col">
    <div class="card col"><h4><i class="ico i-eye"></i> Ce que voient les joueurs</h4>
      <div class="muted small">Chaque joueur ne voit l'onglet <b>Jeu</b> de sa vue que si vous l'y autorisez ici. Il annonce combien de cartes il tire (au plus le maximum fixé), puis les pioche lui-même : le serveur tire au hasard parmi les cartes que vous lui autorisez. Vous voyez chaque tirage arriver ici et dans l'historique, avec l'effet et les rebondissements.</div>
      <label class="chk"><input type="checkbox" id="dk-pann" ${D.announce ? 'checked' : ''}> Annoncer les tirages des joueurs à toute la table (sinon, seuls le MJ et le tireur les voient)</label>
      <div class="row"><button class="small" id="dk-all-on">Donner l'accès à tous</button><button class="small" id="dk-all-off">Retirer l'accès à tous</button></div>
    </div>
    ${pcs.length ? pcs.map(p => {
      const a = accessOf(D, p.id), allowed = a.allowed ? a.allowed.filter(i => pool.includes(i)) : pool, rem = remainingOf(a);
      const last = D.draws.find(x => x.whoId === p.id && x.by === 'player');
      return `<div class="card"><div class="row"><b style="font-size:1.1rem">${esc(p.name)}</b>
          <label class="chk right"><input type="checkbox" data-vis="${p.id}" ${a.visible ? 'checked' : ''}> voit l'onglet Jeu</label></div>
        <div class="row" style="margin-top:6px;gap:14px">
          <label class="row small">Maximum de cartes annoncées <input type="number" min="1" max="22" data-max="${p.id}" value="${a.max}" style="width:60px"></label>
          <span class="small">Cartes autorisées : <b>${a.allowed ? `${allowed.length} choisie(s)` : `tout le Jeu (${pool.length})`}</b></span>
          <button class="small" data-allow="${p.id}">Choisir les cartes…</button></div>
        <div class="row small" style="margin-top:6px">${a.declared == null ? '<span class="muted">N\'a pas encore annoncé de tirage.</span>'
          : `<span>A annoncé <b>${a.declared}</b>${a.extra ? ` (+${a.extra})` : ''} · tirées <b>${a.drawn}</b> · restantes <b>${rem}</b></span>`}
          <button class="small" data-reset="${p.id}" title="Permet au joueur d'annoncer un nouveau tirage">Autoriser un nouveau tirage</button>
          ${last ? `<span class="right">Dernière carte : <a href="#" data-hist="${last.id}">${esc(cards[last.card]?.n || '?')}</a> <span class="muted">${fmtT(last.t)}</span></span>` : ''}</div>
      </div>`;
    }).join('') : `<div class="empty">Aucun personnage dans cette campagne. Créez ou importez les personnages des joueurs dans l'onglet Personnages.</div>`}
  </div>`;
}
function subCards(D) {
  const inDeck = new Set(D.inDeck), gone = new Set(D.gone);
  const list = (D.cards || []).filter(c => DK.filter === 'all' || (DK.filter === 'core' ? DECK_CORE.includes(c.set) : DK.filter === 'plus' ? c.set === 'plus' : inDeck.has(c.id)));
  return `<div class="col">
    <div class="card col"><h4><i class="ico i-joker"></i> Composition du Jeu</h4>
      <div class="row">
        <button class="small" data-preset="13">Jeu de 13 (règles 2024)</button>
        <button class="small" data-preset="22">Jeu de 22 (règles 2024)</button>
        <button class="small" data-preset="66">66 cartes (22 + 44 Lames errantes)</button>
        <button class="small" data-preset="none" title="Retire toutes les cartes du Jeu (plus rien ne peut sortir)">Retirer toutes les cartes</button>
        <label class="row small right">Tirage
          <select id="dk-mode"><option value="uniform" ${D.mode !== 'd100' ? 'selected' : ''}>comme un paquet mélangé</option><option value="d100" ${D.mode === 'd100' ? 'selected' : ''}>table d100 officielle (Jeu de 13 ou de 22)</option></select></label>
      </div>
      <div class="muted small">Cliquez une carte pour la lire en entier. La case à cocher sur la fiche d'une carte la met dans le Jeu ou l'en retire. Dans le Jeu : <b>${D.inDeck.length}</b> carte(s)${D.gone.length ? ` dont ${D.gone.length} disparue(s)` : ''}.</div>
      <div class="seg" style="align-self:flex-start">${[['all', 'Toutes (66)'], ['core', 'Les 22 de Séraphine'], ['plus', 'Les 44 Lames errantes'], ['in', 'Dans le Jeu']].map(([k, l]) => `<button class="${DK.filter === k ? 'on' : ''}" data-filter="${k}">${l}</button>`).join('')}</div>
    </div>
    <div class="dk-grid">${list.map(c => deckMini(c, { on: inDeck.has(c.id), gone: gone.has(c.id) })).join('')}</div>
  </div>`;
}
function subHistory(D) {
  return `<div class="card col"><div class="row"><h4 style="margin:0">Historique des tirages</h4><button class="small danger right" id="dk-hclear">Effacer l'historique</button></div>
    <div class="col">${D.draws.map(histLine).join('') || '<span class="muted small">Aucun tirage.</span>'}</div></div>`;
}

/* ---------------------------------------------------------------- modals */
function cardModal(id, entry = null) {
  const D = DECK(), c = deckCards(D)[id]; if (!c) return;
  const inDeck = D.inDeck.includes(id), gone = D.gone.includes(id);
  modal(`${entry ? `<div class="muted small" style="margin-bottom:6px"><b>${esc(entry.who)}</b> · ${fmtT(entry.t)}${entry.note ? ` · note : ${esc(entry.note)}` : ''}</div>` : ''}
    ${deckCardHTML(c, { gm: true, render: gmRender, draw: entry })}
    <div class="actions">
      <label class="chk"><input type="checkbox" id="cm-in" ${inDeck ? 'checked' : ''}> dans le Jeu</label>
      ${gone ? `<button id="cm-back">Remettre dans le Jeu (elle avait disparu)</button>` : ''}
      <button id="cm-show"><i class="ico i-announce"></i> Montrer aux joueurs</button>
      ${entry ? `<button id="cm-open">Ouvrir dans la pioche</button>` : ''}
      <button class="primary" data-close>Fermer</button></div>`, (box, close) => {
    $('#cm-in', box).onchange = e => { D.inDeck = e.target.checked ? [...new Set([...D.inDeck, id])] : D.inDeck.filter(x => x !== id); deckSave(); };
    $('#cm-back', box) && ($('#cm-back', box).onclick = () => { D.gone = D.gone.filter(x => x !== id); close(); deckSave(); });
    $('#cm-show', box).onclick = () => showToPlayers(c);
    $('#cm-open', box) && ($('#cm-open', box).onclick = () => { DK.show = entry.id; DK.sub = 'gm'; close(); go('deck'); });
  });
}
function allowModal(pid) {
  const D = DECK(), a = accessOf(D, pid), pool = deckPool(D), cards = deckCards(D);
  let sel = new Set(a.allowed || pool);
  const body = () => pool.map(i => deckMini(cards[i], { on: sel.has(i), attr: `data-tog="${i}"` })).join('');
  modal(`<h3>Cartes que ${esc(S.chars[pid]?.name || '')} peut tirer</h3>
    <div class="muted small">Seules les cartes actuellement dans le Jeu sont proposées. Les cartes grisées ne pourront pas sortir pour ce joueur.</div>
    <div class="row" style="margin:8px 0"><button class="small" id="al-all">Tout le Jeu</button><button class="small" id="al-none">Aucune</button>
      <button class="small" id="al-good">Seulement les fastes</button><button class="small" id="al-core">Seulement les 22 de Séraphine</button><button class="small" id="al-plus">Seulement les Lames errantes</button></div>
    <div class="dk-grid" id="al-grid">${body()}</div>
    <div class="actions"><button data-close>Annuler</button><button class="primary" id="al-ok">Enregistrer</button></div>`, (box, close) => {
    const redraw = () => { $('#al-grid', box).innerHTML = body(); bind(); };
    const bind = () => $$('[data-tog]', box).forEach(b => b.onclick = () => { const i = b.dataset.tog; sel.has(i) ? sel.delete(i) : sel.add(i); redraw(); });
    bind();
    $('#al-all', box).onclick = () => { sel = new Set(pool); redraw(); };
    $('#al-none', box).onclick = () => { sel = new Set(); redraw(); };
    $('#al-good', box).onclick = () => { sel = new Set(pool.filter(i => cards[i].tone === 'faste')); redraw(); };
    $('#al-core', box).onclick = () => { sel = new Set(pool.filter(i => DECK_CORE.includes(cards[i].set))); redraw(); };
    $('#al-plus', box).onclick = () => { sel = new Set(pool.filter(i => cards[i].set === 'plus')); redraw(); };
    $('#al-ok', box).onclick = () => { a.allowed = sel.size === pool.length ? null : [...sel]; close(); deckSave(); };
  });
}

/* ---------------------------------------------------------------- tab */
function renderDeck(main) {
  const D = DECK();
  if (!D) { main.innerHTML = `<div class="empty">Cette campagne n'a pas de Jeu de cartes.</div>`; return; }
  deckDefaults(D);
  const subs = [['gm', '<i class="ico i-joker"></i> Pioche du MJ'], ['players', '<i class="ico i-player"></i> Pioche des joueurs'], ['cards', '<i class="ico i-book"></i> Toutes les cartes'], ['history', '<i class="ico i-list"></i> Historique']];
  const body = { gm: subGM, players: subPlayers, cards: subCards, history: subHistory }[DK.sub] || subGM;
  main.innerHTML = `<div class="col">
    <div class="row"><h2 style="margin:0">Le Jeu des Mille Fortunes</h2>
      <span class="dk-felure" title="Piste de Fêlure (règle de campagne) : +1 par carte tirée parmi les 22 de Séraphine"><i class="ico i-alert"></i> Fêlure <b>${D.felure}</b>/10
        <button class="small icon" id="dk-fdown">−</button><button class="small icon" id="dk-fup">+</button></span>
      <div class="seg right">${subs.map(([k, l]) => `<button class="${DK.sub === k ? 'on' : ''}" data-sub="${k}">${l}</button>`).join('')}</div></div>
    ${body(D)}</div>`;
  bindDeck(main, D);
}
function bindDeck(main, D) {
  $$('[data-sub]', main).forEach(b => b.onclick = () => { DK.sub = b.dataset.sub; store.set('gt-deck-sub', DK.sub); rerender(); });
  $('#dk-fdown', main).onclick = () => { D.felure = clamp((D.felure || 0) - 1, 0, 10); deckSave(); };
  $('#dk-fup', main).onclick = () => { D.felure = clamp((D.felure || 0) + 1, 0, 10); deckSave(); };
  $$('[data-hist]', main).forEach(b => b.onclick = e => { e.preventDefault(); const x = D.draws.find(y => y.id === b.dataset.hist); if (!x) return; if (DK.sub === 'gm') { DK.show = x.id; rerender(); } else cardModal(x.card, x); });
  $$('[data-card]', main).forEach(b => b.onclick = () => cardModal(b.dataset.card));
  // pioche du MJ
  $('#dk-who', main) && ($('#dk-who', main).onchange = e => { DK.who = e.target.value; rerender(); });
  $('#dk-other', main) && ($('#dk-other', main).oninput = e => DK.other = e.target.value);
  $('#dk-ann', main) && ($('#dk-ann', main).onchange = e => DK.announce = e.target.checked);
  $('#dk-seq', main) && ($('#dk-seq', main).onclick = () => {
    const n = clamp(Math.round(num($('#dk-n', main).value, 1)), 1, 66);
    const who = DK.who === '__other' ? (DK.other.trim() || 'PNJ') : (S.chars[DK.who]?.name || 'MJ');
    D.gmSeq = { who, declared: n, drawn: 0, extra: 0, t: Date.now() };
    logInfo(`<i class="ico i-joker"></i> <b>${esc(who)}</b> annonce qu'il va tirer <b>${n}</b> carte(s) du Jeu.`, !DK.announce);
    deckSave();
  });
  $('#dk-draw', main) && ($('#dk-draw', main).onclick = () => gmDraw(D));
  $('#dk-draw1', main) && ($('#dk-draw1', main).onclick = () => gmDraw(D));
  $('#dk-seq-end', main) && ($('#dk-seq-end', main).onclick = () => { D.gmSeq = null; deckSave(); });
  $('#dk-apply', main) && ($('#dk-apply', main).onclick = () => gmDraw(D, $('#dk-pick', main).value));
  const entry = D.draws.find(x => x.id === DK.show) || D.draws.find(x => x.by === 'gm');
  $('#dk-showpl', main) && ($('#dk-showpl', main).onclick = () => showToPlayers(deckCards(D)[entry.card]));
  $('#dk-note', main) && ($('#dk-note', main).oninput = e => { entry.note = e.target.value; saveCamp(); });
  $$('[data-dkopt]', main).forEach(b => b.onclick = () => gmOption(D, entry, b.dataset.dkopt));
  $('[data-dkapply]', main) && ($('[data-dkapply]', main).onclick = () => {
    const c = fxCard(deckCards(D)[entry.card]), choices = deckReadChoices(main, c);
    if (choices) gmFx(entry, { choices });
  });
  $('[data-dkundo]', main) && ($('[data-dkundo]', main).onclick = () => confirmBox(`Annuler les effets de cette carte sur la fiche de ${esc(entry.who)} ?`, () => gmFx(entry, { undo: true })));
  // pioche des joueurs
  $('#dk-pann', main) && ($('#dk-pann', main).onchange = e => { D.announce = e.target.checked; deckSave(); });
  $('#dk-all-on', main) && ($('#dk-all-on', main).onclick = () => { charList().forEach(p => accessOf(D, p.id).visible = true); deckSave(); });
  $('#dk-all-off', main) && ($('#dk-all-off', main).onclick = () => { charList().forEach(p => accessOf(D, p.id).visible = false); deckSave(); });
  $$('[data-vis]', main).forEach(b => b.onchange = () => { accessOf(D, b.dataset.vis).visible = b.checked; deckSave(); });
  $$('[data-max]', main).forEach(b => b.onchange = () => { accessOf(D, b.dataset.max).max = clamp(Math.round(num(b.value, 1)), 1, 66); deckSave(); });
  $$('[data-allow]', main).forEach(b => b.onclick = () => allowModal(b.dataset.allow));
  $$('[data-reset]', main).forEach(b => b.onclick = () => { Object.assign(accessOf(D, b.dataset.reset), { declared: null, drawn: 0, extra: 0 }); deckSave(); toast('Le joueur peut annoncer un nouveau tirage.'); });
  // toutes les cartes
  $$('[data-preset]', main).forEach(b => b.onclick = () => {
    const p = b.dataset.preset;
    if (p === 'none') return confirmBox('Retirer toutes les cartes du Jeu ? Plus aucune carte ne pourra être piochée tant que vous n\'en remettez pas.', () => { D.inDeck = []; deckSave(); });
    D.inDeck = p === '13' ? deckOfficial(D, 13) : p === '22' ? deckOfficial(D, 22) : p === '66' ? D.cards.map(c => c.id) : [];
    deckSave();
  });
  $('#dk-mode', main) && ($('#dk-mode', main).onchange = e => { D.mode = e.target.value; deckSave(); });
  $$('[data-filter]', main).forEach(b => b.onclick = () => { DK.filter = b.dataset.filter; rerender(); });
  $('#dk-hclear', main) && ($('#dk-hclear', main).onclick = () => confirmBox('Effacer tout l\'historique des tirages ?', () => { D.draws = []; DK.show = null; deckSave(); }));
}

TABS.deck = { render: main => { if (!DECK()) { go('characters'); return; } renderDeck(main); } };
