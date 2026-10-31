/* ===== Money: a character's purse of real coins (same rules as server/money.py) =====
   c.purse = { pp, po, pa, pc } (whole coins). 10 pc = 1 pa, 10 pa = 1 po, 10 po = 1 pp.
   c.gold stays the total value in gold pieces (kept in step with the purse). */
'use strict';

const COINS = ['pp', 'po', 'pa', 'pc'];   // largest first
const COIN_CP = { pp: 1000, po: 100, pa: 10, pc: 1 };
const COIN_NAME = { pp: 'platine', po: 'or', pa: 'argent', pc: 'cuivre' };
const COIN_LONG = { pp: 'pièces de platine', po: "pièces d'or", pa: "pièces d'argent", pc: 'pièces de cuivre' };
const toCp = gp => Math.round((+gp || 0) * 100);

/* purse of a character (built from the old single gold value when the sheet has none) */
function purseOf(c) {
  const p = c?.purse;
  if (p && typeof p === 'object') return Object.fromEntries(COINS.map(k => [k, Math.max(0, Math.floor(+p[k] || 0))]));
  const cp = Math.max(0, toCp(c?.gold));
  return { pp: 0, po: Math.floor(cp / 100), pa: Math.floor(cp % 100 / 10), pc: cp % 10 };
}
const purseCp = p => COINS.reduce((s, k) => s + (+p[k] || 0) * COIN_CP[k], 0);
/* copper amount -> coins, largest first (no platinum unless asked) */
function coinsFor(cp, coins = ['po', 'pa', 'pc']) {
  const out = { pp: 0, po: 0, pa: 0, pc: 0 };
  for (const k of coins) { out[k] = Math.floor(cp / COIN_CP[k]); cp -= out[k] * COIN_CP[k]; }
  out.pc += cp;
  return out;
}
const purseAdd = (p, q) => Object.fromEntries(COINS.map(k => [k, (+p[k] || 0) + (+q[k] || 0)]));
function purseFmt(p) { return COINS.filter(k => p[k]).map(k => `${(+p[k]).toLocaleString('fr-FR')} ${k}`).join(' ') || '0 po'; }
/* stores the purse on the character and the matching total */
function setPurse(c, p) {
  c.purse = Object.fromEntries(COINS.map(k => [k, Math.max(0, Math.floor(+p[k] || 0))]));
  c.gold = purseCp(c.purse) / 100;
  return c.purse;
}
/* coins as small coloured chips; opts.total adds the value in gold */
function purseHTML(p, opts = {}) {
  const shown = COINS.filter(k => p[k] || opts.all);
  return `<span class="purse">${(shown.length ? shown : ['po']).map(k => `<span class="coin c-${k}" title="${COIN_LONG[k]}"><i></i>${(+p[k] || 0).toLocaleString('fr-FR')} ${k}</span>`).join('')}
    ${opts.total && shown.length > 1 ? `<span class="muted small">(${fmtPrice(purseCp(p) / 100)} en tout)</span>` : ''}</span>`;
}
/* "Bourse" card of the inventory: the four coins, even at zero, from platinum to copper */
function purseCardHTML(p, extra = '') {
  return `<div class="card purse-card"><h4><i class="ico i-purse"></i> Bourse <span class="muted small">— ${fmtPrice(purseCp(p) / 100)} en tout</span><span class="right">${extra}</span></h4>
    <div class="purse-grid">${COINS.map(k => `<div class="purse-coin c-${k} ${p[k] ? '' : 'zero'}" title="${COIN_LONG[k]}"><i></i><b>${(+p[k] || 0).toLocaleString('fr-FR')}</b><span>${COIN_NAME[k]}</span></div>`).join('')}</div>
    <div class="muted small">10 pc = 1 pa · 10 pa = 1 po · 10 po = 1 pp</div></div>`;
}
/* splits coins between n characters: each coin type is shared out, the leftover coins go one by one to the first ones */
function shareCoins(coins, n) {
  const out = Array.from({ length: n }, () => ({ pp: 0, po: 0, pa: 0, pc: 0 }));
  let i = 0;
  for (const k of COINS) {
    const each = Math.floor((+coins[k] || 0) / n); let left = (+coins[k] || 0) - each * n;
    out.forEach(o => o[k] += each);
    while (left-- > 0) { out[i % n][k]++; i++; }
  }
  return out;
}
/* one-line summary of a quest reward (journal of the GM and of the players) */
function rewardLine(r) {
  if (!r) return '';
  const each = m => m === 'each' ? ' chacun' : ' à partager';
  return [purseCp(r.coins || {}) && purseFmt(r.coins) + each(r.coinMode), +r.xp && `${r.xp} XP` + each(r.xpMode),
    ...(r.items || []).map(i => i.name + (i.qty > 1 ? ' ×' + i.qty : '')), r.text].filter(Boolean).join(' · ');
}
/* coin exchange dialog; onOk(from, to, n) */
function changeModal(p, onOk) {
  modal(`<h3><i class="ico i-purse"></i> Faire de la monnaie</h3>
    <div class="small" style="margin-bottom:8px">Bourse : ${purseHTML(p)}<br><span class="muted">10 pc = 1 pa · 10 pa = 1 po · 10 po = 1 pp</span></div>
    <div class="row" style="flex-wrap:wrap;align-items:flex-end"><label class="field"><span>Donner</span><input id="ch-n" type="number" min="1" value="1" style="width:80px"></label>
      <label class="field"><span>pièces de</span><select id="ch-from">${COINS.map(k => `<option value="${k}" ${k === 'po' ? 'selected' : ''}>${COIN_NAME[k]} (${p[k]})</option>`).join('')}</select></label>
      <label class="field"><span>contre des pièces de</span><select id="ch-to">${COINS.map(k => `<option value="${k}" ${k === 'pa' ? 'selected' : ''}>${COIN_NAME[k]}</option>`).join('')}</select></label></div>
    <div id="ch-res" class="small" style="margin-top:6px"></div>
    <div class="actions"><button data-close>Annuler</button><button class="primary" id="ch-ok">Changer</button></div>`, (box, close) => {
    const read = () => ({ n: Math.floor(num($('#ch-n', box).value, 0)), from: $('#ch-from', box).value, to: $('#ch-to', box).value });
    const check = () => {
      const { n, from, to } = read(), v = n * COIN_CP[from];
      const err = from === to ? 'Choisissez deux pièces différentes.' : n < 1 ? '' : n > p[from] ? `Vous n'avez que ${p[from]} ${from}.`
        : v % COIN_CP[to] ? `Il faut un multiple de ${COIN_CP[to] / COIN_CP[from]} ${from} pour faire des ${to}.` : '';
      $('#ch-res', box).innerHTML = err ? `<span class="warn">${err}</span>` : n >= 1 ? `Vous recevez <b>${v / COIN_CP[to]} ${to}</b>.` : '';
      $('#ch-ok', box).disabled = !!err || n < 1;
      return !err && n >= 1;
    };
    $$('input,select', box).forEach(e => e.oninput = e.onchange = check);
    check();
    $('#ch-ok', box).onclick = () => { if (!check()) return; const r = read(); close(); onOk(r.from, r.to, r.n); };
  });
}
