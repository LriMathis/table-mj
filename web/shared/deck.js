/* ===== Deck of Many Things: card display shared by the GM and player views =====
   The deck exists only in campaigns whose campaign.json has a "deck" object (see server/deck.py). */
'use strict';

const DECK_TONES = { 'faste': ['Faste', '#d9a441'], 'néfaste': ['Néfaste', '#d0503f'], 'ambivalent': ['Ambivalent', '#a07ad6'] };
const DECK_SETS = { '13': 'Jeu de 13 et de 22', '22': 'Jeu de 22 seulement', plus: 'Lame errante (extension)' };
const DECK_CORE = ['13', '22'];

const deckTone = c => DECK_TONES[c?.tone] || DECK_TONES.ambivalent;
const deckIcon = (c, cls = '') => `<i class="ico ${cls}" style="--i:url(/shared/icons/${esc(c?.icon || 'joker')}.svg)"></i>`;
const deckCards = D => Object.fromEntries((D?.cards || []).map(c => [c.id, c]));

/* uniform random integer in [0, n) */
function deckRand(n) {
  try { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] % n; } catch (e) { return Math.floor(Math.random() * n); }
}
function deckPool(D, allowed = null) {
  const gone = new Set(D.gone || []);
  let ids = (D.inDeck || []).filter(i => !gone.has(i));
  if (allowed) { const ok = new Set(allowed); ids = ids.filter(i => ok.has(i)); }
  return ids;
}
function deckOfficial(D, size) { return (D.cards || []).filter(c => size === 13 ? c.set === '13' : DECK_CORE.includes(c.set)).map(c => c.id); }
const sameSet = (a, b) => a.length === b.length && a.every(x => b.includes(x));
/* same rules as server/deck.py pick(): a shuffled deck, or the official d100 table for an untouched 13- or 22-card deck */
function deckPick(D, ids) {
  if (!ids.length) return [null, null];
  const cards = deckCards(D), inDeck = D.inDeck || [];
  const col = sameSet(inDeck, deckOfficial(D, 13)) ? 'd13' : sameSet(inDeck, deckOfficial(D, 22)) ? 'd22' : null;
  if (D.mode === 'd100' && col && sameSet(ids, deckPool(D))) {
    for (let k = 0; k < 200; k++) {
      const r = 1 + deckRand(100), hit = ids.find(i => cards[i]?.[col] && cards[i][col][0] <= r && r <= cards[i][col][1]);
      if (hit) return [hit, r];
    }
  }
  return [ids[deckRand(ids.length)], null];
}

/* small tile */
function deckMini(c, { on = null, gone = false, attr = '' } = {}) {
  const [, col] = deckTone(c);
  return `<button class="dk-mini ${on === false ? 'off' : ''} ${gone ? 'gone' : ''}" style="--tone:${col}" data-card="${esc(c.id)}" ${attr} title="${esc(c.n)} (${esc(c.en)})">
    ${deckIcon(c, 'dk-mi')}<b>${esc(c.n)}</b><small>${c.set === 'plus' ? 'errante' : c.set === '13' ? '13 · 22' : '22'}${gone ? ' · disparue' : ''}</small></button>`;
}
/* full card. gm: shows the GM sections; render: function used for GM text with links (richNote) */
function deckCardHTML(c, { gm = false, render = md, draw = null } = {}) {
  if (!c) return `<div class="empty">Carte inconnue.</div>`;
  const [tone, col] = deckTone(c);
  const ex = c.extra || {};
  const notes = [];
  if (ex.gone) notes.push('Cette carte quitte le Jeu pour toujours une fois tirée.');
  if (ex.end) notes.push('Le tireur ne tire plus de cartes.');
  if (ex.auto) notes.push(`Un tirage supplémentaire obligatoire (+${ex.auto}).`);
  return `<div class="dk-big" style="--tone:${col}">
    <div class="dk-face"><div class="dk-set">${esc(DECK_SETS[c.set] || '')}${draw?.roll ? ` · d100 : ${draw.roll}` : ''}</div>
      <div class="dk-art">${deckIcon(c, 'dk-bi')}</div>
      <div class="dk-name">${esc(c.n)}</div><div class="dk-en">${esc(c.en)}</div><div class="dk-tone">${tone}</div>
      ${c.flavor ? `<div class="dk-flavor">${esc(c.flavor)}</div>` : ''}</div>
    <div class="dk-body">
      <h4>${gm ? 'Effet officiel' : 'Effet de la carte'}${c.set === 'plus' ? ' <span class="muted small">(The Book of Many Things)</span>' : ' <span class="muted small">(règles 2024)</span>'}</h4>
      <div class="dk-fx">${md(c.fx || '')}</div>
      ${notes.length ? `<div class="dk-note">${notes.map(esc).join('<br>')}</div>` : ''}
      ${gm && c.table ? `<h4><i class="ico i-book"></i> À la table</h4><div class="md-view small">${render(c.table)}</div>` : ''}
      ${gm && c.cc ? `<h4><i class="ico i-damage"></i> Contrecoup (campagne ✎)</h4><div class="md-view small">${render(c.cc)}</div>` : ''}
      ${gm && (c.twists || []).length ? `<h4><i class="ico i-masks"></i> Rebondissements possibles</h4><ul class="dk-tw">${c.twists.map(x => `<li>${render(x).replace(/^<p>|<\/p>$/g, '')}</li>`).join('')}</ul>` : ''}
      ${gm && c.lore ? `<h4><i class="ico i-scroll"></i> Dans la campagne</h4><div class="md-view small">${render(c.lore)}</div>` : ''}
    </div></div>`;
}
/* option buttons offered by some cards after the draw (Jester, Puzzle, Tower, Humanoid, Stairway) */
function deckOptions(c, entry) {
  const ex = c?.extra || {};
  if (!entry || entry.used) return entry?.used ? `<div class="muted small">Option choisie.</div>` : '';
  const b = [];
  if (ex.may) b.push(`<button class="primary small" data-dkopt="may" data-draw="${esc(entry.id)}">${esc(ex.label || `Tirer ${ex.may} carte(s) de plus`)}</button>`);
  if (ex.stop) b.push(`<button class="primary small" data-dkopt="stop" data-draw="${esc(entry.id)}">Arrêter de tirer ici</button>`);
  if (ex.reduce) b.push(`<button class="primary small" data-dkopt="reduce" data-draw="${esc(entry.id)}">${esc(ex.label || 'Réduire le nombre annoncé')}</button>`);
  return b.length ? `<div class="row dk-opts">${b.join('')}</div>` : '';
}

/* choices asked by a card before its effects are applied (Star, Balance, Throne…) */
function deckChoiceForm(c) {
  return (c.choose || []).map(ch => ch.multi
    ? `<div class="field"><span>${esc(ch.label)}</span><div class="dk-multi" data-chk="${esc(ch.k)}" data-n="${ch.multi}">${ch.opts.map(([v, l]) => `<label class="chk small"><input type="checkbox" value="${esc(v)}"> ${esc(l)}</label>`).join('')}</div></div>`
    : `<label class="field"><span>${esc(ch.label)}</span><select data-ch="${esc(ch.k)}"><option value="">— choisir —</option>${ch.opts.map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join('')}</select></label>`).join('');
}
function deckReadChoices(box, c) {
  const out = {};
  for (const ch of c.choose || []) {
    if (ch.multi) {
      const v = $$(`[data-chk="${ch.k}"] input:checked`, box).map(i => i.value);
      if (v.length !== ch.multi) { toast(`Cochez exactement ${ch.multi} cases : ${esc(ch.label)}`); return null; }
      out[ch.k] = v;
    } else {
      const v = $(`[data-ch="${ch.k}"]`, box)?.value;
      if (!v) { toast(`Choix manquant : ${esc(ch.label)}`); return null; }
      out[ch.k] = v;
    }
  }
  return out;
}
/* state of the automatic effects of a draw: applied changes, choices to make… */
function deckFxHTML(c, fx, { canApply = true, gm = false, sheet = true } = {}) {
  if (!sheet) return `<div class="dk-fxbox muted small">Tiré par le MJ ou un PNJ : il n'y a pas de fiche de personnage à modifier.</div>`;
  if (!c?.auto && !(c?.choose || []).length) return `<div class="dk-fxbox muted small">Pas d'effet automatique pour cette carte : ${gm ? 'appliquez-la à la main (voir « À la table »).' : 'le MJ s\'en occupe.'}</div>`;
  fx = fx || {};
  if (fx.status === 'done') return `<div class="dk-fxbox ok"><b><i class="ico i-sparkle"></i> Effets appliqués à la fiche</b><ul>${(fx.changes || []).map(x => `<li>${esc(x)}</li>`).join('')}</ul>
    ${gm ? `<button class="small" data-dkundo>Annuler ces effets</button>` : ''}</div>`;
  const head = fx.status === 'undone' ? '<div class="muted small">Effets annulés.</div>' : '';
  if ((c.choose || []).length && canApply) return `<div class="dk-fxbox">${head}<b>Un choix est nécessaire avant d'appliquer la carte</b>${fx.error ? `<div class="warn small">${esc(fx.error)}</div>` : ''}
    <div class="col" data-dkform>${deckChoiceForm(c)}</div><button class="primary small" data-dkapply>Appliquer à la fiche</button></div>`;
  if (canApply) return `<div class="dk-fxbox">${head}${fx.error ? `<div class="warn small">${esc(fx.error)}</div>` : ''}<button class="primary small" data-dkapply>Appliquer les effets à la fiche</button></div>`;
  return head;
}

(function deckStyles() {
  const st = document.createElement('style');
  st.textContent = `
  .dk-mini { display:flex; flex-direction:column; align-items:center; gap:3px; width:104px; padding:8px 4px; border-radius:10px; border:1px solid var(--line);
    border-top:4px solid var(--tone); background:linear-gradient(180deg, var(--panel2), var(--bg2)); text-align:center; cursor:pointer; }
  .dk-mini b { font-family:var(--title); font-size:.82rem; line-height:1.1; } .dk-mini small { color:var(--muted); font-size:.7rem; }
  .dk-mini .dk-mi { width:30px; height:30px; background:var(--tone); }
  .dk-mini.off { opacity:.38; } .dk-mini.gone { opacity:.3; text-decoration:line-through; }
  .dk-mini:hover { border-color:var(--tone); box-shadow:0 0 0 2px color-mix(in srgb, var(--tone) 35%, transparent); }
  .dk-grid { display:flex; flex-wrap:wrap; gap:8px; }
  .dk-big { display:grid; grid-template-columns: 220px minmax(0,1fr); gap:16px; align-items:start; }
  .dk-face { border-radius:14px; padding:14px 12px; text-align:center; border:2px solid var(--tone);
    background: radial-gradient(circle at 50% 35%, color-mix(in srgb, var(--tone) 28%, transparent), transparent 65%), linear-gradient(180deg, var(--panel3), var(--bg2));
    box-shadow: 0 0 22px color-mix(in srgb, var(--tone) 30%, transparent); }
  .dk-set { font-size:.7rem; color:var(--muted); text-transform:uppercase; letter-spacing:.06em; }
  .dk-art { margin:12px auto 6px; width:96px; height:96px; border-radius:50%; display:grid; place-items:center; border:1px solid var(--tone);
    background: color-mix(in srgb, var(--tone) 12%, transparent); }
  .dk-art .dk-bi { width:62px; height:62px; background:var(--tone); }
  .dk-name { font-family:var(--title); font-size:1.5rem; font-weight:700; color:var(--tone); }
  .dk-en { color:var(--muted); font-size:.85rem; font-style:italic; }
  .dk-tone { display:inline-block; margin-top:6px; padding:1px 10px; border-radius:99px; border:1px solid var(--tone); font-size:.75rem; }
  .dk-flavor { margin-top:10px; font-style:italic; font-size:.88rem; line-height:1.35; }
  .dk-body h4 { margin:12px 0 4px; } .dk-body h4:first-child { margin-top:0; }
  .dk-fx { font-size:1.02rem; line-height:1.5; padding:8px 12px; border-left:3px solid var(--tone); background:var(--panel2); border-radius:0 8px 8px 0; }
  .dk-fx p { margin:0; }
  .dk-note { margin-top:6px; font-size:.85rem; color:var(--gold2); }
  .dk-tw { margin:4px 0; padding-left:20px; } .dk-tw li { margin:3px 0; }
  .dk-opts { margin-top:10px; gap:6px; }
  .dk-fxbox { margin-top:10px; padding:8px 12px; border-radius:8px; border:1px dashed var(--line); background:var(--panel2); }
  .dk-fxbox.ok { border-style:solid; border-color:var(--gold); }
  .dk-fxbox ul { margin:4px 0 6px; padding-left:20px; }
  .dk-fxbox .warn { color:var(--red); }
  .dk-multi { display:grid; grid-template-columns:repeat(auto-fill, minmax(130px, 1fr)); gap:2px 8px; }
  .dk-ended { margin-top:8px; padding:6px 10px; border-radius:8px; border:1px solid var(--red); color:var(--text); font-size:.9rem; }
  .dk-hist { display:flex; gap:8px; align-items:center; padding:6px 8px; border-radius:8px; border:1px solid var(--line); background:var(--panel); cursor:pointer; }
  .dk-hist:hover { border-color:var(--accent2); } .dk-hist .dk-mi { width:22px; height:22px; background:var(--tone); }
  .dk-felure { display:inline-flex; align-items:center; gap:6px; padding:3px 10px; border-radius:99px; border:1px solid var(--line); background:var(--panel2); }
  #main .note { padding: 7px 10px; border-radius: 8px; background: var(--panel2); border: 1px solid var(--line); font-size: .9rem; margin: 6px 0; }
  #main .note.warn { border-color: #8a5a20; }
  .dk-pl { display:grid; grid-template-columns: 170px 1fr; gap:10px; align-items:start; }
  #pbody .dk-big, .modal-box .dk-big.narrow { grid-template-columns: 1fr; } #pbody .dk-face { max-width:300px; margin:0 auto; width:100%; }
  @media (max-width: 760px) { .dk-big { grid-template-columns: 1fr; } .dk-face { max-width:320px; margin:0 auto; } .dk-pl { grid-template-columns: 1fr; } }
  `;
  document.head.appendChild(st);
})();
