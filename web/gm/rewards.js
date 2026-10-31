/* ===== Quest rewards (journal): coins, experience, items and free text, handed out when the quest is done =====
   quest.reward = { coins: {pp, po, pa, pc}, coinMode: 'share' | 'each', xp, xpMode: 'share' | 'each',
                    items: [{ ref, name, qty }] (ref null = free item), text, pub (players see it in advance), given (date) } */
'use strict';

const emptyReward = () => ({ coins: { pp: 0, po: 0, pa: 0, pc: 0 }, coinMode: 'share', xp: 0, xpMode: 'share', items: [], text: '', pub: false, given: null });
const hasReward = r => !!r && (purseCp(r.coins || {}) > 0 || +r.xp > 0 || (r.items || []).length > 0 || !!(r.text || '').trim());

/* editor of a quest's reward */
function rewardModal(q, onSave) {
  const r = JSON.parse(JSON.stringify(q.reward || emptyReward()));
  r.coins ||= {}; r.items ||= [];
  const mode = (k, v) => `<select data-rmode="${k}"><option value="share" ${v !== 'each' ? 'selected' : ''}>à partager entre eux</option><option value="each" ${v === 'each' ? 'selected' : ''}>pour chacun</option></select>`;
  const draw = box => {
    $('#rw-items', box).innerHTML = r.items.map((it, i) => `<div class="row small" style="flex-wrap:nowrap">${itemThumb(invView({ ref: it.ref, name: it.name, img: it.img }), 26)}
      <input data-riname="${i}" value="${esc(it.name)}" style="flex:1"><input data-riqty="${i}" type="number" min="1" value="${it.qty || 1}" style="width:56px" title="Quantité">
      <button class="small icon" data-rix="${i}">✕</button></div>`).join('') || '<span class="muted small">Aucun objet.</span>';
    $$('[data-riname]', box).forEach(e => e.oninput = () => r.items[+e.dataset.riname].name = e.value);
    $$('[data-riqty]', box).forEach(e => e.oninput = () => r.items[+e.dataset.riqty].qty = Math.max(1, Math.round(num(e.value, 1))));
    $$('[data-rix]', box).forEach(b => b.onclick = () => { r.items.splice(+b.dataset.rix, 1); draw(box); });
  };
  modal(`<h3><i class="ico i-sparkle"></i> Récompense — ${esc(q.t)}</h3>
    <div class="field"><span><i class="ico i-purse"></i> Argent</span><div class="row" style="flex-wrap:wrap">${COINS.map(k => `<label class="coin-in c-${k}" title="${COIN_LONG[k]}"><i></i><input data-rcoin="${k}" type="number" min="0" value="${r.coins[k] || 0}" style="width:80px"> ${k}</label>`).join('')}
      ${mode('coins', r.coinMode)}</div></div>
    <div class="field"><span><i class="ico i-xp"></i> Expérience</span><div class="row"><input id="rw-xp" type="number" min="0" value="${r.xp || 0}" style="width:100px"> XP ${mode('xp', r.xpMode)}</div></div>
    <div class="field"><span><i class="ico i-bag"></i> Objets <span class="muted small">(vous choisirez qui les reçoit au moment de donner la récompense)</span></span>
      <div id="rw-items" class="col"></div>
      <div class="row" style="margin-top:4px"><input id="rw-add" list="rw-dl" placeholder="+ objet du catalogue…" style="flex:1"><datalist id="rw-dl">${eqAll().map(x => `<option value="${esc(x.name)}">${esc(x.cat || '')}</option>`).join('')}</datalist>
        <button class="small" id="rw-free">+ objet libre</button></div></div>
    <label class="field"><span>Autre récompense (texte libre : faveur, titre, terrain…)</span><textarea id="rw-text" rows="2">${esc(r.text || '')}</textarea></label>
    <label class="chk small"><input type="checkbox" id="rw-pub" ${r.pub ? 'checked' : ''}> les joueurs voient la récompense promise dans leur journal (si la quête leur est visible)</label>
    <div class="actions">${q.reward ? '<button class="danger" id="rw-del">Supprimer la récompense</button>' : ''}<button data-close>Annuler</button><button class="primary" id="rw-ok">Enregistrer</button></div>`, (box, close) => {
    draw(box);
    const add = () => {
      const v = $('#rw-add', box).value.trim(); if (!v) return;
      const x = eqAll().find(y => y.name === v) || eqAll().find(y => spellKey(y.name) === spellKey(v));
      r.items.push(x ? { ref: x.id, name: x.name, qty: 1 } : { ref: null, name: v, qty: 1 });
      $('#rw-add', box).value = ''; draw(box);
    };
    $('#rw-add', box).onchange = add;
    $('#rw-add', box).onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); add(); } };
    $('#rw-free', box).onclick = () => { r.items.push({ ref: null, name: 'Objet', qty: 1 }); draw(box); };
    $('#rw-del', box) && ($('#rw-del', box).onclick = () => { close(); onSave(null); });
    $('#rw-ok', box).onclick = () => {
      COINS.forEach(k => r.coins[k] = Math.max(0, Math.floor(num($(`[data-rcoin="${k}"]`, box).value, 0))));
      r.coinMode = $('[data-rmode="coins"]', box).value; r.xpMode = $('[data-rmode="xp"]', box).value;
      r.xp = Math.max(0, Math.round(num($('#rw-xp', box).value, 0)));
      r.text = $('#rw-text', box).value.trim(); r.pub = $('#rw-pub', box).checked;
      r.items = r.items.filter(it => (it.name || '').trim());
      close(); onSave(hasReward(r) ? r : null);
    };
  });
}

/* hands out the reward: recipients, then coins / XP / items on the sheets */
function giveRewardModal(q, onDone) {
  const r = q.reward, pcs = charList();
  if (!pcs.length) return toast('Aucun personnage dans la campagne.');
  modal(`<h3><i class="ico i-sparkle"></i> Donner la récompense — ${esc(q.t)}</h3>
    <div class="small" style="margin-bottom:6px">${esc(rewardLine(r))}</div>
    <div class="field"><span>Qui reçoit l'argent et l'expérience ?</span><div class="row" style="flex-wrap:wrap">${pcs.map(c => `<label class="chk"><input type="checkbox" data-rto="${c.id}" checked> ${esc(c.name)}</label>`).join('')}</div></div>
    ${(r.items || []).length ? `<div class="field"><span>Objets</span>${r.items.map((it, i) => `<div class="row small"><span class="grow">${esc(it.name)}${it.qty > 1 ? ' ×' + it.qty : ''}</span> →
      <select data-rit="${i}">${pcs.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}<option value="">personne (je le garde)</option></select></div>`).join('')}</div>` : ''}
    <div id="rw-prev" class="card small"></div>
    <div class="actions"><button data-close>Plus tard</button><button class="primary" id="rw-give"><i class="ico i-handshake"></i> Donner</button></div>`, (box, close) => {
    const plan = () => {
      const to = $$('[data-rto]', box).filter(c => c.checked).map(c => S.chars[c.dataset.rto]), n = to.length;
      const coins = !n ? [] : r.coinMode === 'each' ? to.map(() => ({ ...r.coins })) : shareCoins(r.coins || {}, n);
      const xp = !n ? 0 : r.xpMode === 'each' ? +r.xp || 0 : Math.floor((+r.xp || 0) / n);
      return { to, coins, xp };
    };
    const prev = () => {
      const p = plan();
      $('#rw-prev', box).innerHTML = p.to.length ? p.to.map((c, i) => `<div><b>${esc(c.name)}</b> : ${purseCp(p.coins[i]) ? purseFmt(p.coins[i]) : ''}${purseCp(p.coins[i]) && p.xp ? ' · ' : ''}${p.xp ? p.xp + ' XP' : ''}${!purseCp(p.coins[i]) && !p.xp ? '<span class="muted">rien (argent / XP)</span>' : ''}</div>`).join('')
        : '<span class="muted">Personne ne reçoit l\'argent ni l\'expérience.</span>';
    };
    $$('[data-rto]', box).forEach(c => c.onchange = prev);
    prev();
    $('#rw-give', box).onclick = () => {
      const p = plan(), lines = [];
      p.to.forEach((c, i) => {
        if (purseCp(p.coins[i])) setPurse(c, purseAdd(purseOf(c), p.coins[i]));
        if (p.xp) c.xp = (+c.xp || 0) + p.xp;
        if (purseCp(p.coins[i]) || p.xp) { saveChar(c); lines.push(`${esc(c.name)} : ${[purseCp(p.coins[i]) && purseFmt(p.coins[i]), p.xp && p.xp + ' XP'].filter(Boolean).join(' · ')}`); }
      });
      $$('[data-rit]', box).forEach(s => {
        const it = r.items[+s.dataset.rit], c = S.chars[s.value]; if (!c) return;
        const def = it.ref && itemDef(it.ref);
        if (def) giveItem(c, def, { qty: it.qty || 1, ...(it.name !== def.name ? { name: it.name } : {}) });
        else { c.inventory ||= []; c.inventory.push({ uid: uid('it'), ref: null, name: it.name, qty: it.qty || 1, kind: 'gear', equipped: false, attuned: false }); saveChar(c); }
        lines.push(`${esc(it.name)}${it.qty > 1 ? ' ×' + it.qty : ''} → ${esc(c.name)}`);
      });
      r.given = Date.now();
      logInfo(`<i class="ico i-sparkle"></i> <b>Récompense</b> — ${esc(q.t)}<br>${lines.join('<br>')}${r.text ? `<br>${esc(r.text)}` : ''}`, !q.pub);
      close(); onDone();
      toast('<i class="ico i-sparkle"></i> Récompense donnée : bourses, XP et inventaires mis à jour.');
    };
  });
}
