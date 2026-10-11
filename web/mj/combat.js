/* ===== Combat : initiative, tours, attaques, dégâts ===== */
'use strict';

let selCb = null, lastAtk = null;
const CB = () => S.camp.combat;
const ent = cb => cb.kind === 'pc' ? S.chars[cb.charId] : cb;
const cbName = cb => cb.kind === 'pc' ? (S.chars[cb.charId]?.name || '?') : cb.name;
function cbSave(cb) { if (cb.kind === 'pc' && S.chars[cb.charId]) saveChar(S.chars[cb.charId]); saveCamp(); }
function cbAlive(cb) { const e = ent(cb); return e && !(cb.kind !== 'pc' && (cb.dead || e.hp <= 0)); }
function sortCombat() {
  const cur = CB().list[CB().turn]?.uid;
  CB().list.sort((a, b) => (b.init ?? -99) - (a.init ?? -99) || (b.initMod || 0) - (a.initMod || 0) || (a.kind === 'pc' ? -1 : 1));
  if (cur) CB().turn = Math.max(0, CB().list.findIndex(x => x.uid === cur));
}
function currentCb() { return CB().active ? CB().list[CB().turn] : null; }

function addPCsToCombat() {
  let n = 0;
  charList().forEach(c => {
    if (CB().list.some(x => x.kind === 'pc' && x.charId === c.id)) return;
    CB().list.push({ uid: uid('cb'), kind: 'pc', charId: c.id, init: null, initMod: +c.initBonus || 0 }); n++;
  });
  if (!n) toast('Tous les personnages sont déjà dans le combat.');
  saveCamp();
}
function monsterHP(m, mode) {
  if (mode === 'roll' && m.hpFormula) { const r = rollExpr(m.hpFormula); if (r) return Math.max(1, r.total); }
  return +m.hp || 1;
}
function addMonsterToCombat(m, count = 1, hpMode = 'avg', hidden = false, kind = 'mon') {
  const same = CB().list.filter(x => x.monId === m.id).length, out = [];
  for (let i = 0; i < count; i++) {
    const hp = monsterHP(m, hpMode), k = same + i + 1;
    const cb = {
      uid: uid('cb'), kind, monId: m.id, name: count + same > 1 ? `${m.name} ${k}` : m.name, init: null,
      initMod: mod(m.stats?.DEX), hp, hpMax: hp, hpTemp: 0, ca: +m.ca || 10, conditions: [], dead: false, hidden,
      attacks: JSON.parse(JSON.stringify(m.attacks || [])), stats: { ...(m.stats || {}) }, xp: CR_XP[m.cr] ?? (+m.xp || 0),
      cr: m.cr, traits: m.traits || '', portrait: m.portrait || '', color: m.color || '',
    };
    if (kind === 'npc') cb.xp = 0;
    CB().list.push(cb); out.push(cb);
  }
  saveCamp();
  return out;
}
function addCustomCombatant() {
  ask('Ajouter un PNJ / créature rapide', [{ k: 'name', label: 'Nom' }, { k: 'hp', label: 'PV', type: 'number', value: 10 }, { k: 'ca', label: 'CA', type: 'number', value: 12 },
    { k: 'initMod', label: 'Bonus d\'initiative', type: 'number', value: 0 }, { k: 'xp', label: 'XP (si vaincu)', type: 'number', value: 0 },
    { k: 'kind', label: 'Camp', type: 'select', value: 'mon', options: [['mon', 'Adversaire'], ['npc', 'Allié / PNJ']] }], o => {
    if (!o.name) return;
    CB().list.push({ uid: uid('cb'), kind: o.kind, name: o.name, init: null, initMod: o.initMod, hp: o.hp, hpMax: o.hp, hpTemp: 0, ca: o.ca, conditions: [], dead: false, attacks: [], stats: {}, xp: o.xp, traits: '' });
    saveCamp(); rerender();
  });
}
function rollInitiative(onlyMissing) {
  const parts = [];
  CB().list.forEach(cb => {
    if (onlyMissing && cb.init != null) return;
    const e = ent(cb); if (!e) return;
    const b = cb.kind === 'pc' ? +e.initBonus || 0 : cb.initMod || 0;
    cb.initMod = b;
    const r = rollExpr('1d20' + fmod(b)); cb.init = r.total;
    parts.push(`${esc(cbName(cb))} <b>${r.total}</b>`);
  });
  sortCombat();
  if (parts.length) logInfo('<i class="ico i-eclair"></i> <b>Initiative</b> : ' + parts.join(' · '));
  saveCamp(); rerender();
}
function tickConditions(cb) {
  const e = ent(cb); if (!e) return;
  (e.conditions || []).forEach(x => { if (x.r > 0) { x.r--; if (x.r === 0) logInfo(`<i class="ico i-sablier"></i> L'état <b>${esc(x.n)}</b> de ${esc(cbName(cb))} prend fin.`); } });
  e.conditions = (e.conditions || []).filter(x => x.r !== 0);
}
function announceTurn() {
  const cb = currentCb(); if (!cb) return;
  tickConditions(cb); selCb = cb.uid;
  const e = ent(cb);
  logInfo(`<i class="ico i-sablier"></i> Round ${CB().round} — tour de <b>${esc(cbName(cb))}</b>${cb.kind === 'pc' && e?.hp === 0 ? ' (inconscient : jet contre la mort !)' : ''}`);
  cbSave(cb);
}
function startCombat() {
  if (!CB().list.length) return toast('Ajoutez des combattants d\'abord.');
  if (CB().list.some(x => x.init == null)) rollInitiative(true);
  sortCombat(); CB().active = true; CB().round = 1; CB().turn = 0;
  logInfo('<i class="ico i-combat"></i> <b>Le combat commence !</b>');
  if (!cbAlive(CB().list[0])) nextTurn(true); else announceTurn();
  saveCamp(); rerender();
}
function nextTurn(silentSkip) {
  const L = CB().list; if (!L.length) return;
  for (let i = 0; i < L.length; i++) {
    CB().turn++;
    if (CB().turn >= L.length) { CB().turn = 0; CB().round++; }
    if (cbAlive(L[CB().turn])) break;
  }
  announceTurn(); saveCamp(); rerender();
}
function prevTurn() {
  const L = CB().list; if (!L.length) return;
  CB().turn--; if (CB().turn < 0) { CB().turn = L.length - 1; CB().round = Math.max(1, CB().round - 1); }
  selCb = L[CB().turn].uid; saveCamp(); rerender();
}
function endCombat() {
  const defeated = CB().list.filter(x => x.kind !== 'pc' && x.kind !== 'npc' && (x.dead || x.hp <= 0));
  const xp = defeated.reduce((s, x) => s + (+x.xp || 0), 0);
  const pcs = CB().list.filter(x => x.kind === 'pc' && S.chars[x.charId]).map(x => S.chars[x.charId]);
  modal(`<h3><i class="ico i-drapeau"></i> Fin du combat</h3>
    <p>${defeated.length} adversaire(s) vaincu(s) : ${defeated.map(d => esc(d.name)).join(', ') || '—'}</p>
    <div class="row"><label class="field"><span>XP total</span><input id="ec-xp" type="number" value="${xp}" style="width:100px"></label>
    <span class="muted">→ partagé entre les personnages cochés</span></div>
    <div class="col" style="margin:8px 0">${pcs.map(c => `<label class="chk"><input type="checkbox" value="${c.id}" checked> ${esc(c.name)}</label>`).join('')}</div>
    <label class="chk"><input type="checkbox" id="ec-clear" checked> Retirer les adversaires du suivi d'initiative</label>
    <label class="chk"><input type="checkbox" id="ec-tok" checked> Retirer les pions des adversaires vaincus de la carte</label>
    <div class="actions"><button data-close>Annuler</button><button class="primary" id="ec-ok">Terminer le combat</button></div>`, (box, close) => {
    $('#ec-ok', box).onclick = () => {
      const ids = $$('input[type=checkbox][value]', box).filter(i => i.checked).map(i => i.value);
      const total = num($('#ec-xp', box).value);
      if (total > 0 && ids.length) { const each = Math.floor(total / ids.length); ids.forEach(id => addXP(S.chars[id], each, true)); logInfo(`<i class="ico i-xp"></i> <b>${total} XP</b> partagés : ${each} XP chacun pour ${ids.map(id => esc(S.chars[id].name)).join(', ')}`); }
      const removed = new Set(CB().list.filter(x => x.kind !== 'pc').map(x => x.uid));
      if ($('#ec-tok', box).checked) S.camp.maps.forEach(m => m.tokens = m.tokens.filter(t => !(t.ref?.kind === 'cb' && defeated.some(d => d.uid === t.ref.id))));
      if ($('#ec-clear', box).checked) CB().list = CB().list.filter(x => x.kind === 'pc');
      CB().list.forEach(x => { if (removed.has(x.uid)) return; x.init = null; });
      CB().active = false; CB().round = 0; CB().turn = 0;
      charList().forEach(c => remCond(c, 'Concentration'));
      logInfo('<i class="ico i-drapeau"></i> <b>Fin du combat.</b>'); saveCamp(); close(); rerender();
    };
  });
}
function removeCombatant(uidv) {
  const i = CB().list.findIndex(x => x.uid === uidv); if (i < 0) return;
  CB().list.splice(i, 1);
  if (CB().turn >= CB().list.length) CB().turn = 0; else if (i < CB().turn) CB().turn--;
  S.camp.maps.forEach(m => m.tokens = m.tokens.filter(t => !(t.ref?.kind === 'cb' && t.ref.id === uidv)));
  saveCamp(); rerender();
}
function saveBonusCb(cb, ab) { return cb.kind === 'pc' ? saveBonus(S.chars[cb.charId], ab) : mod(cb.stats?.[ab]) + (cb.saveProf?.[ab] || 0); }

function areaDamageModal(pre = {}, onDone) {
  const L = CB().list.filter(cbAlive);
  const ab0 = pre.ab ?? 'DEX', checked = cb => pre.uids?.length ? pre.uids.includes(cb.uid) : cb.kind !== 'pc';
  modal(`<h3><i class="ico i-degats"></i> Dégâts de zone / sauvegarde${pre.title ? ' — ' + esc(pre.title) : ''}</h3>
    <div class="row"><label class="field"><span>Dégâts (formule ou nombre)</span><input id="ad-dmg" value="${esc(pre.n ?? '2d8')}" style="width:110px"></label>
      <label class="field"><span>Sauvegarde</span><select id="ad-ab"><option value="">aucune</option>${STATS.map(s => `<option ${s === ab0 ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
      <label class="field"><span>DD</span><input id="ad-dc" type="number" value="${pre.dc ?? 15}" style="width:60px"></label>
      <label class="field"><span>Si réussite</span><select id="ad-half"><option value="half">moitié</option><option value="none" ${pre.half === false ? 'selected' : ''}>aucun dégât</option></select></label></div>
    ${L.length ? '' : '<p class="muted">Aucun combattant : ajoutez les créatures au combat pour appliquer les dégâts.</p>'}
    <div class="col" style="margin-top:8px;max-height:300px;overflow:auto">${L.map(cb => `<label class="chk"><input type="checkbox" value="${cb.uid}" ${checked(cb) ? 'checked' : ''}> ${esc(cbName(cb))}</label>`).join('')}</div>
    <div class="actions"><button data-close>Annuler</button><button class="primary" id="ad-ok">Appliquer</button></div>`, (box, close) => {
    $('#ad-ok', box).onclick = () => {
      const dexpr = $('#ad-dmg', box).value.trim(), r = /^\d+$/.test(dexpr) ? { total: +dexpr, detail: dexpr } : rollExpr(dexpr);
      if (!r) return toast('Formule invalide');
      const ab = $('#ad-ab', box).value, dc = num($('#ad-dc', box).value), half = $('#ad-half', box).value === 'half';
      const res = [];
      $$('input[type=checkbox]:checked', box).forEach(i => {
        const cb = CB().list.find(x => x.uid === i.value), e = ent(cb); let dmg = r.total, txt = '';
        if (ab) {
          const s = rollExpr('1d20' + fmod(saveBonusCb(cb, ab))), ok = s.total >= dc;
          if (ok) dmg = half ? Math.floor(dmg / 2) : 0;
          txt = ` (sauv. ${s.total} ${ok ? '✔' : '✘'})`;
        }
        res.push(`${esc(cbName(cb))}${txt} : ${dmg}`);
        dealDamage(e, dmg, cbName(cb)); cbSave(cb);
      });
      logInfo(`<i class="ico i-degats"></i> <b>Zone ${r.total} dégâts</b> [${r.detail}]${ab ? ` — sauvegarde ${ab} DD ${dc}` : ''}<br>${res.join(' · ')}`);
      onDone && onDone(); close(); rerender();
    };
  });
}

/* ---------- actions des joueurs : appliquer depuis l'historique ---------- */
function pickTargetModal(title, kindHint, cb) {
  const L = CB().list.filter(x => cbAlive(x) || x.kind === 'pc');
  const pcs = charList().filter(c => !L.some(x => x.kind === 'pc' && x.charId === c.id));
  if (!L.length && !pcs.length) return toast('Aucune cible disponible.');
  modal(`<h3>${title}</h3><div class="tgt-list">${L.map(x => `<button class="tgt ${x.kind === 'pc' || x.kind === 'npc' ? 'ally' : 'foe'}" data-t="cb:${x.uid}">${esc(cbName(x))} <span class="muted small">${ent(x).hp}/${ent(x).hpMax}</span></button>`).join('')}
    ${pcs.map(c => `<button class="tgt ally" data-t="pc:${c.id}">${esc(c.name)} <span class="muted small">${c.hp}/${c.hpMax}</span></button>`).join('')}</div>
    <div class="actions"><button data-close>Annuler</button></div>`, (box, close) => {
    $$('[data-t]', box).forEach(b => b.onclick = () => { close(); const [k, id] = b.dataset.t.split(':'); cb(k === 'pc' ? { e: S.chars[id], name: S.chars[id].name, save: () => saveChar(S.chars[id]) } : targetOf(id)); });
  });
}
function targetOf(uidv) {
  const cb = CB().list.find(x => x.uid === uidv); if (!cb) return null;
  return { e: ent(cb), name: cbName(cb), save: () => cbSave(cb), cb };
}
function applyFromLog(id) {
  const e = S.camp.log.find(x => x.id === id); if (!e?.apply) return;
  const a = e.apply, done = () => { e.applied = true; saveCamp(); renderLog(); rerender(); };
  if (a.type === 'zone') return areaDamageModal({ n: a.n, ab: a.ab, dc: a.dc, half: a.half, uids: a.uids, title: e.label }, done);
  const go2 = t => {
    if (!t?.e) return toast('Cible introuvable (plus dans le combat ?)');
    if (a.type === 'dmg') dealDamage(t.e, a.n, t.name);
    else if (a.temp) { t.e.hpTemp = Math.max(t.e.hpTemp || 0, a.n); logInfo(`<i class="ico i-bouclier"></i> <b>${esc(t.name)}</b> gagne ${a.n} PV temporaires`); }
    else healEntity(t.e, a.n, t.name);
    t.save(); done();
  };
  if (a.uid && targetOf(a.uid)) go2(targetOf(a.uid));
  else pickTargetModal(a.type === 'dmg' ? `<i class="ico i-degats"></i> Appliquer ${a.n} dégâts ${esc(a.dtype || '')} à…` : `<i class="ico i-soin"></i> Soigner ${a.n} PV…`, a.type, go2);
}
document.addEventListener('click', ev => { const b = ev.target.closest('[data-apply]'); if (b) { ev.preventDefault(); applyFromLog(b.dataset.apply); } });

/* ---------- sorts lancés par le MJ (fiche ou combat) ---------- */
function combatTargets(exceptUid, casterIsPc = true) {
  return CB().list.filter(x => x.uid !== exceptUid && cbAlive(x)).map(x => ({ uid: x.uid, name: cbName(x), foe: (x.kind === 'mon') === casterIsPc }));
}
function castFromMJ(c, item, cbUid) {
  const inCombat = CB().active;
  const tg = combatTargets(cbUid);
  castModal(c, item, tg, o => {
    const res = castLocal(c, item, o, u => { const t = CB().list.find(x => x.uid === u); return t && { uid: u, name: cbName(t), ca: ent(t).ca }; });
    if (res) spellResultModal(c, res, o);
    rerender();
  }, { inCombat });
}
function spellResultModal(c, res, o) {
  const { sp, nums } = res, rows = [];
  res.rays.forEach((r, i) => {
    rows.push(`<div class="atk-res">${res.rays.length > 1 ? `<b>${esc(nums.multi?.nom || 'rayon')} ${i + 1}</b> · ` : ''}Attaque <b>${r.atk.total}</b> ${r.atk.crit ? '<i class="ico i-etincelle"></i> CRITIQUE' : r.atk.fumble ? '<i class="ico i-mort"></i>' : ''}
      ${r.t ? (r.hit ? `<span class="hit">TOUCHÉ</span> ${esc(r.t.name)}` : `<span class="miss">RATÉ</span> ${esc(r.t.name)}`) : ''}
      ${r.dmg ? ` — <b>${r.dmg.total}</b> ${esc(nums.dmg?.type || '')}` : ''}
      ${r.dmg ? `<button class="small danger" data-ap="${i}">${r.t ? 'Appliquer à ' + esc(r.t.name) : 'Appliquer à…'}</button>` : ''}</div>`);
  });
  if (res.dmg) rows.push(`<div class="atk-res">Dégâts <b style="font-size:1.3rem">${res.dmg.total}</b> ${esc(nums.dmg.type)} ${sp.jds ? `— JdS ${sp.jds} DD ${c.spellcasting?.dc}` : ''}
      <button class="small danger" id="sr-zone">${sp.jds ? '<i class="ico i-degats"></i> Résoudre les sauvegardes…' : 'Appliquer à…'}</button></div>`);
  if (res.heal) rows.push(`<div class="atk-res"><i class="ico i-soin"></i> <b style="font-size:1.3rem">${res.heal.total}</b> ${nums.soin.temp ? 'PV temporaires' : 'PV'} <button class="small ok" id="sr-heal">Appliquer à…</button></div>`);
  if (!rows.length) return toast(`<i class="ico i-sorts"></i> ${esc(c.name)} lance ${esc(sp.n)}.`);
  modal(`<h3><i class="ico i-sorts"></i> ${esc(sp.n)}</h3>${rows.join('')}<div class="actions"><button class="primary" data-close>Fermer</button></div>`, (box, close) => {
    $$('[data-ap]', box).forEach(b => b.onclick = () => {
      const r = res.rays[+b.dataset.ap];
      const doIt = t => { dealDamage(t.e, r.dmg.total, t.name); t.save(); b.disabled = true; b.textContent = '✔'; rerender(); };
      r.t ? doIt(targetOf(r.t.uid)) : pickTargetModal('Appliquer à…', 'dmg', doIt);
    });
    $('#sr-zone', box) && ($('#sr-zone', box).onclick = () => {
      if (sp.jds) { close(); areaDamageModal({ n: res.dmg.total, ab: sp.jds, dc: c.spellcasting?.dc, half: sp.jdsOk === 'moitie', uids: o.targets, title: sp.n }); }
      else pickTargetModal('Appliquer à…', 'dmg', t => { dealDamage(t.e, res.dmg.total, t.name); t.save(); close(); rerender(); });
    });
    $('#sr-heal', box) && ($('#sr-heal', box).onclick = () => pickTargetModal('Soigner…', 'heal', t => {
      if (nums.soin.temp) { t.e.hpTemp = Math.max(t.e.hpTemp || 0, res.heal.total); logInfo(`<i class="ico i-bouclier"></i> <b>${esc(t.name)}</b> gagne ${res.heal.total} PV temporaires`); } else healEntity(t.e, res.heal.total, t.name);
      t.save(); close(); rerender();
    }));
  });
}
function spellListHTML(c, cbUid) {
  const list = charSpells(c); if (!list.length) return '';
  let last = -1;
  return list.map(it => {
    const head = it.lvl !== last ? `<div class="sp-lvl">${it.lvl ? 'Niveau ' + it.lvl : 'Tours de magie'}</div>` : ''; last = it.lvl;
    return head + `<div class="sp-row"><button class="small primary" data-cast="${it.lvl}|${esc(it.name)}" ${cbUid ? `data-cbu="${cbUid}"` : ''}><i class="ico i-sorts"></i></button>
      <span class="sp-name" data-spinfo="${it.lvl}|${esc(it.name)}">${esc(it.name)}${it.sp?.conc ? ' <span class="tag conc">C</span>' : ''}${it.sp?.rituel ? ' <span class="tag">R</span>' : ''}</span>
      <span class="muted small sp-sum">${it.sp ? spellSummary(it.sp, c) : 'hors base'}</span></div>`;
  }).join('');
}
document.addEventListener('click', ev => {
  const b = ev.target.closest('[data-cast],[data-spinfo]'); if (!b || !S.isMJ) return;
  const holder = b.closest('[data-char]'); const c = holder && S.chars[holder.dataset.char]; if (!c) return;
  const [l, ...rest] = (b.dataset.cast || b.dataset.spinfo).split('|'), name = rest.join('|');
  const item = charSpells(c).find(x => x.lvl === +l && x.name === name); if (!item) return;
  if (b.dataset.cast) castFromMJ(c, item, b.dataset.cbu || CB().list.find(x => x.kind === 'pc' && x.charId === c.id)?.uid);
  else modal(spellCardHTML(item.key, item.sp, c) + `<div class="actions"><button data-close>Fermer</button></div>`);
});

/* ---------- rendu ---------- */
function renderCombat(main) {
  const C = CB();
  const mons = monList();
  main.innerHTML = `
  <div class="row sticky-top">
    <span class="round-badge">${C.active ? `<i class="ico i-combat"></i> Round ${C.round}` : '<i class="ico i-colombe"></i> Hors combat'}</span>
    ${C.active ? `<button id="cb-prev">◀ Précédent</button><button class="primary" id="cb-next">Tour suivant ▶ <span class="muted small">(espace)</span></button><button class="danger" id="cb-end"><i class="ico i-drapeau"></i> Fin du combat</button>`
      : `<button class="primary" id="cb-start"><i class="ico i-combat"></i> Commencer le combat</button>`}
    <span class="right"></span>
    <button id="cb-pcs">+ Personnages</button>
    <select id="cb-mon" style="width:170px"><option value="">+ Monstre du bestiaire…</option>${mons.map(m => `<option value="${m.id}">${esc(m.name)} (FP ${esc(m.cr)})</option>`).join('')}</select>
    <input id="cb-count" type="number" value="1" min="1" style="width:46px" title="Nombre">
    <select id="cb-hpmode" title="PV des monstres"><option value="avg">PV moyens</option><option value="roll">PV lancés</option></select>
    <label class="chk small" title="Adversaires cachés sur la vue joueurs"><input type="checkbox" id="cb-hidden"> cachés</label>
    <button id="cb-custom">+ PNJ rapide</button>
    ${(S.camp.encounters || []).length ? `<select id="cb-enc" style="width:190px"><option value="">Rencontre préparée…</option>${S.camp.encounters.map(x => `<option value="${x.id}">${x.done ? '✔ ' : ''}${esc(x.name)}</option>`).join('')}</select>` : ''}
    <button id="cb-init" title="Lancer l'initiative de tous"><i class="ico i-des"></i> Initiative</button>
    <button id="cb-area"><i class="ico i-degats"></i> Zone</button>
    <button id="cb-clear" class="danger small" title="Vider la liste"><i class="ico i-poubelle"></i></button>
  </div>
  <div class="combat-wrap">
    <div class="init-list" id="init-list"></div>
    <div class="turn-panel" id="turn-panel"></div>
  </div>`;
  $('#cb-start') && ($('#cb-start').onclick = startCombat);
  $('#cb-next') && ($('#cb-next').onclick = () => nextTurn());
  $('#cb-prev') && ($('#cb-prev').onclick = prevTurn);
  $('#cb-end') && ($('#cb-end').onclick = endCombat);
  $('#cb-pcs').onclick = () => { addPCsToCombat(); rerender(); };
  $('#cb-mon').onchange = e => { const m = S.mons[e.target.value]; if (m) { addMonsterToCombat(m, Math.max(1, num($('#cb-count').value, 1)), $('#cb-hpmode').value, $('#cb-hidden').checked); rerender(); } };
  $('#cb-custom').onclick = addCustomCombatant;
  $('#cb-enc') && ($('#cb-enc').onchange = e => { const x = S.camp.encounters.find(y => y.id === e.target.value); e.target.value = ''; if (x) encounterModal(x); });
  $('#cb-init').onclick = () => rollInitiative(false);
  $('#cb-area').onclick = areaDamageModal;
  $('#cb-clear').onclick = () => confirmBox('Vider complètement la liste d\'initiative ?', () => { C.list = []; C.active = false; C.round = 0; C.turn = 0; saveCamp(); rerender(); });
  drawInitList(); drawTurnPanel();
}
function drawInitList() {
  const el = $('#init-list'); if (!el) return;
  const C = CB();
  if (!C.list.length) { el.innerHTML = '<div class="empty">Aucun combattant. Ajoutez les personnages et des monstres du bestiaire.</div>'; return; }
  el.innerHTML = C.list.map((cb, i) => {
    const e = ent(cb); if (!e) return '';
    const cur = C.active && i === C.turn, dead = cb.kind !== 'pc' && (cb.dead || e.hp <= 0);
    const av = cb.kind === 'pc' ? avatarHTML(e) : avatarHTML({ name: cb.name, portrait: cbPortrait(cb), color: cb.color || (cb.kind === 'npc' ? '#7a6a20' : '#7a2a2a') });
    return `<div class="cbt ${cb.kind} ${cur ? 'cur' : ''} ${dead ? 'dead' : ''} ${cb.hidden ? 'hid' : ''}" data-cb="${cb.uid}">
      <input class="ini" data-init="${cb.uid}" value="${cb.init ?? ''}" placeholder="—" title="Initiative (bonus ${fmod(cb.initMod || 0)})">
      ${av}
      <div><span class="cname" data-pick="${cb.uid}">${cur ? '▶ ' : ''}${esc(cbName(cb))}</span> ${cb.kind === 'mon' ? `<span class="tag">FP ${esc(cb.cr ?? '?')}</span>` : cb.kind === 'npc' ? '<span class="tag">allié</span>' : `<span class="tag">niv. ${e.niveau}</span>`}
        ${cb.hidden ? '<span class="tag" title="Invisible sur la vue joueurs">caché</span>' : ''}
        <div class="conds">${condChips(e, 'cb:' + cb.uid)}${condSelect('cb:' + cb.uid)}</div></div>
      <div class="hpc">${hpBar(e)}<div class="row"><b>${e.hp}</b>/${e.hpMax}${e.hpTemp ? ` <span class="muted">+${e.hpTemp}</span>` : ''}
        <input type="number" data-amt="${cb.uid}" placeholder="n"><button class="small danger" data-dmg="${cb.uid}" title="Dégâts">−</button><button class="small ok" data-heal="${cb.uid}" title="Soins">+</button><button class="small" data-tmp="${cb.uid}" title="PV temporaires">T</button></div></div>
      <div class="ca">CA<b>${e.ca}</b></div>
      <div class="row" style="flex-wrap:nowrap">${cb.kind !== 'pc' ? `<button class="small icon" data-hide="${cb.uid}" title="Cacher/montrer aux joueurs">${cb.hidden ? '<i class="ico i-cache"></i>' : '<i class="ico i-oeil"></i>'}</button>` : ''}
        <button class="small icon" data-rm="${cb.uid}" title="Retirer">✕</button></div>
    </div>`;
  }).join('');
  el.onchange = e => {
    const i = e.target.closest('[data-init]');
    if (i) { const cb = C.list.find(x => x.uid === i.dataset.init); cb.init = i.value === '' ? null : num(i.value); sortCombat(); saveCamp(); drawInitList(); }
  };
  el.onclick = e => {
    const t = e.target.closest('button,[data-pick]'); if (!t) return;
    const id = t.dataset.dmg || t.dataset.heal || t.dataset.tmp || t.dataset.hide || t.dataset.rm || t.dataset.pick;
    const cb = C.list.find(x => x.uid === id); if (!cb) return;
    const en = ent(cb), amt = num($(`[data-amt="${id}"]`, el)?.value);
    if (t.dataset.dmg) { dealDamage(en, amt, cbName(cb)); cbSave(cb); }
    else if (t.dataset.heal) { healEntity(en, amt, cbName(cb)); cbSave(cb); }
    else if (t.dataset.tmp) { en.hpTemp = Math.max(en.hpTemp || 0, amt); cbSave(cb); }
    else if (t.dataset.hide) { cb.hidden = !cb.hidden; S.camp.maps.forEach(m => m.tokens.forEach(tk => { if (tk.ref?.id === cb.uid) tk.hidden = cb.hidden; })); saveCamp(); }
    else if (t.dataset.rm) return confirmBox(`Retirer ${esc(cbName(cb))} du combat ?`, () => removeCombatant(id));
    else if (t.dataset.pick) selCb = id;
    drawInitList(); drawTurnPanel();
  };
  el.onkeydown = e => { const a = e.target.closest('[data-amt]'); if (a && e.key === 'Enter') { const cb = C.list.find(x => x.uid === a.dataset.amt); dealDamage(ent(cb), num(a.value), cbName(cb)); cbSave(cb); drawInitList(); drawTurnPanel(); } };
}
function drawTurnPanel() {
  const el = $('#turn-panel'); if (!el) return;
  const C = CB();
  let cb = C.list.find(x => x.uid === selCb) || currentCb() || C.list[0];
  if (!cb) { el.innerHTML = `<div class="card"><h3>Comment ça marche</h3><ol class="muted small" style="padding-left:18px;line-height:1.6">
    <li>Ajoutez les personnages (+ Personnages) et des monstres.</li><li>Lancez l'initiative (ou saisissez-la à la main).</li>
    <li>Commencez le combat, puis « Tour suivant » (touche espace).</li><li>Cliquez sur un nom pour l'afficher ici, choisissez une cible, lancez une attaque : les dégâts s'appliquent en un clic.</li>
    <li>À la fin, l'XP des adversaires vaincus est partagée.</li></ol></div>`; return; }
  const e = ent(cb), isPc = cb.kind === 'pc';
  const attacks = isPc ? [...(e.attacks || [])] : (cb.attacks || []);
  const targets = C.list.filter(x => x.uid !== cb.uid && cbAlive(x));
  const defTarget = lastAtk?.from === cb.uid ? lastAtk.target : (targets.find(x => (x.kind === 'pc') !== isPc)?.uid || '');
  el.innerHTML = `<div class="card">
    <div class="row">${isPc ? avatarHTML(e, 52) : avatarHTML({ name: cb.name, portrait: cbPortrait(cb), color: cb.color || '#7a2a2a' }, 52)}
      <div><h3 style="margin:0">${esc(cbName(cb))}</h3><div class="muted small">${isPc ? esc(e.race + ' · ' + e.classe) : `FP ${esc(cb.cr ?? '?')} · ${cb.xp} XP`}</div></div>
      ${isPc ? `<button class="small right" id="tp-sheet">Fiche ›</button>` : ''}</div>
    <div class="row" style="margin-top:6px"><b>${e.hp}/${e.hpMax} PV</b> · CA ${e.ca}${isPc ? ` · DD sorts ${e.spellcasting?.dc ?? '—'} · Perception passive ${10 + skillBonus(e, 'Perception')}` : ''}</div>
    ${hpBar(e)}
  </div>
  <div class="card"><h4><i class="ico i-cible"></i> Attaquer</h4>
    <div class="row"><span class="muted small">Cible</span><select id="tp-target" style="flex:1"><option value="">(aucune)</option>${targets.map(t => `<option value="${t.uid}" ${t.uid === defTarget ? 'selected' : ''}>${esc(cbName(t))} — CA ${ent(t).ca}, ${ent(t).hp} PV</option>`).join('')}</select></div>
    <div class="col" style="margin-top:6px">${attacks.map((a, i) => `<div class="row"><button class="primary small" data-tpatk="${i}" style="min-width:150px;justify-content:space-between">${esc(a.name)} <span>${fmod(+a.bonus || 0)}</span></button>
      <span class="muted small">${esc(a.damage || '')} ${esc(a.type || '')}</span></div>`).join('') || '<span class="muted small">Aucune attaque définie.</span>'}</div>
    <div id="tp-res" style="margin-top:8px"></div>
    ${!isPc ? `<button class="small" id="tp-addatk" style="margin-top:6px">+ attaque</button>` : ''}
  </div>
  ${!isPc && cb.stats && Object.keys(cb.stats).length ? `<div class="card"><h4>Sauvegardes</h4><div class="row">${STATS.map(s => `<button class="small" data-roll="1d20${fmod(saveBonusCb(cb, s))}" data-label="Sauvegarde ${s}" data-who="${esc(cb.name)}">${s} ${fmod(saveBonusCb(cb, s))}</button>`).join('')}</div></div>` : ''}
  ${isPc ? `<div class="card"><h4>Jets rapides</h4><div class="row">${STATS.map(s => `<button class="small" data-roll="1d20${fmod(saveBonus(e, s))}" data-label="Sauvegarde ${s}" data-who="${esc(e.name)}">Sauv. ${s} ${fmod(saveBonus(e, s))}</button>`).join('')}</div>
      ${(e.resources || []).length ? `<div class="col" style="margin-top:8px">${e.resources.map((r, i) => `<div class="res"><span class="rn small">${esc(r.name)}</span><button class="icon small" data-tpres="${i}:-1">−</button><b>${r.cur}/${r.max}</b><button class="icon small" data-tpres="${i}:1">+</button></div>`).join('')}</div>` : ''}
      ${e.spellcasting ? `<div class="row" style="margin-top:8px"><span class="small muted">Emplacements :</span>${Object.entries(e.spellcasting.slots).map(([l, s]) => `<span class="small">N${l}</span><span class="pips">${Array.from({ length: s.max }, (_, k) => `<button class="pip ${k < s.cur ? 'full' : ''}" data-tpslot="${l}:${k}"></button>`).join('')}</span>`).join(' ')}</div>` : ''}
      </div>` : ''}
  ${isPc && Object.values(e.spells || {}).some(l => l?.length) ? `<div class="card" data-char="${e.id}"><h4><i class="ico i-sorts"></i> Sorts <span class="muted small">DD ${e.spellcasting?.dc ?? '—'} · attaque ${fmod(+e.spellcasting?.attack || 0)}${e.concentration ? ` · concentration : <b>${esc(e.concentration)}</b>` : ''}</span></h4>${spellListHTML(e, cb.uid)}</div>` : ''}
  ${!isPc && cb.traits ? `<div class="card"><h4>Capacités</h4><div class="ft md-view small">${md(cb.traits)}</div></div>` : ''}
  ${isPc && e.features?.length ? `<div class="card"><h4>Capacités</h4>${e.features.map(f => `<details><summary><b>${esc(f.name)}</b></summary><div class="small ft" style="white-space:pre-wrap">${linkDice(esc(f.text))}</div></details>`).join('')}</div>` : ''}`;
  $('#tp-sheet', el) && ($('#tp-sheet', el).onclick = () => { selChar = cb.charId; charSub = 'fiche'; go('persos'); });
  $$('[data-tpatk]', el).forEach(b => b.onclick = () => {
    const a = attacks[+b.dataset.tpatk], tu = $('#tp-target', el).value, t = CB().list.find(x => x.uid === tu);
    const res = attackRoll({ who: cbName(cb), name: a.name, bonus: a.bonus, damage: a.damage, type: a.type, targetCA: t ? ent(t).ca : null, targetName: t ? cbName(t) : '' });
    lastAtk = { from: cb.uid, target: tu };
    const box = $('#tp-res', el);
    box.innerHTML = `<div class="atk-res">Attaque : <b>${res.atk.total}</b> ${res.atk.crit ? '<i class="ico i-etincelle"></i> <b>CRITIQUE</b>' : res.atk.fumble ? '<i class="ico i-mort"></i> échec critique' : ''}
      ${t ? (res.hit ? '<span class="hit">TOUCHÉ</span>' : '<span class="miss">RATÉ</span>') : ''}
      ${res.dmg ? `<div>Dégâts : <b style="font-size:1.3rem">${res.dmg.total}</b> ${esc(a.type || '')}</div>` : ''}
      ${t && (res.dmg || !a.damage) ? `<div class="row" style="margin-top:6px"><input id="tp-dmgv" type="number" value="${res.dmg?.total ?? ''}" style="width:60px">
        <button class="danger small" id="tp-apply">Appliquer à ${esc(cbName(t))}</button><button class="small" id="tp-half">½</button></div>` : ''}</div>`;
    $('#tp-apply', box) && ($('#tp-apply', box).onclick = () => { dealDamage(ent(t), num($('#tp-dmgv', box).value), cbName(t)); cbSave(t); drawInitList(); drawTurnPanel(); });
    $('#tp-half', box) && ($('#tp-half', box).onclick = () => { const i = $('#tp-dmgv', box); i.value = Math.floor(num(i.value) / 2); });
  });
  $('#tp-addatk', el) && ($('#tp-addatk', el).onclick = () => ask('Nouvelle attaque', [{ k: 'name', label: 'Nom' }, { k: 'bonus', label: 'Bonus au toucher', type: 'number', value: 4 }, { k: 'damage', label: 'Dégâts', value: '1d6+2' }, { k: 'type', label: 'Type' }], o => { cb.attacks.push(o); saveCamp(); drawTurnPanel(); }));
  $$('[data-tpres]', el).forEach(b => b.onclick = () => { const [i, d] = b.dataset.tpres.split(':').map(Number); const r = e.resources[i]; r.cur = clamp(r.cur + d, 0, r.max); saveChar(e); drawTurnPanel(); });
  $$('[data-tpslot]', el).forEach(b => b.onclick = () => { const [l, k] = b.dataset.tpslot.split(':').map(Number); const s = e.spellcasting.slots[l]; s.cur = s.cur > k ? k : k + 1; saveChar(e); drawTurnPanel(); });
}
TABS.combat = {
  render: renderCombat,
  key: e => { if (e.code === 'Space' && CB().active) { e.preventDefault(); nextTurn(); } },
};
