/* ===== Combat: initiative, turns, attacks, damage ===== */
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
  if (!n) toast(t('All characters are already in the combat.'));
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
  ask(t('Add an NPC / quick creature'), [{ k: 'name', label: t('Name') }, { k: 'hp', label: t('HP'), type: 'number', value: 10 }, { k: 'ca', label: t('AC'), type: 'number', value: 12 },
    { k: 'initMod', label: t('Initiative bonus'), type: 'number', value: 0 }, { k: 'xp', label: t('XP (if defeated)'), type: 'number', value: 0 },
    { k: 'kind', label: t('Side'), type: 'select', value: 'mon', options: [['mon', t('Opponent')], ['npc', t('Ally / NPC')]] }], o => {
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
  if (parts.length) logInfo(`<i class="ico i-lightning"></i> <b>${t('Initiative')}</b> : ` + parts.join(' · '));
  saveCamp(); rerender();
}
function tickConditions(cb) {
  const e = ent(cb); if (!e) return;
  (e.conditions || []).forEach(x => { if (x.r > 0) { x.r--; if (x.r === 0) logInfo(`<i class="ico i-hourglass"></i> ${t("{who}'s {cond} condition ends.", { who: esc(cbName(cb)), cond: `<b>${esc(condName(x.n))}</b>` })}`); } });
  e.conditions = (e.conditions || []).filter(x => x.r !== 0);
}
function announceTurn() {
  const cb = currentCb(); if (!cb) return;
  tickConditions(cb); selCb = cb.uid;
  const e = ent(cb);
  logInfo(`<i class="ico i-hourglass"></i> ${t('Round {n}', { n: CB().round })} — ${t("{who}'s turn", { who: `<b>${esc(cbName(cb))}</b>` })}${cb.kind === 'pc' && e?.hp === 0 ? ' ' + t('(unconscious: death saving throw!)') : ''}`);
  cbSave(cb);
}
function startCombat() {
  if (!CB().list.length) return toast(t('Add combatants first.'));
  if (CB().list.some(x => x.init == null)) rollInitiative(true);
  sortCombat(); CB().active = true; CB().round = 1; CB().turn = 0;
  logInfo(`<i class="ico i-combat"></i> <b>${t('The combat begins!')}</b>`);
  if (!cbAlive(CB().list[0])) nextTurn(true); else announceTurn();
  saveCamp(); rerender();
}
function nextTurn() {
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
  modal(`<h3><i class="ico i-flag"></i> ${t('End of combat')}</h3>
    <p>${t('{n} opponent(s) defeated', { n: defeated.length })}: ${defeated.map(d => esc(d.name)).join(', ') || '—'}</p>
    <div class="row"><label class="field"><span>${t('Total XP')}</span><input id="ec-xp" type="number" value="${xp}" style="width:100px"></label>
    <span class="muted">→ ${t('split between the ticked characters')}</span></div>
    <div class="col" style="margin:8px 0">${pcs.map(c => `<label class="chk"><input type="checkbox" value="${c.id}" checked> ${esc(c.name)}</label>`).join('')}</div>
    <label class="chk"><input type="checkbox" id="ec-clear" checked> ${t('Remove the opponents from the initiative tracker')}</label>
    <label class="chk"><input type="checkbox" id="ec-tok" checked> ${t('Remove the tokens of defeated opponents from the map')}</label>
    <div class="actions"><button data-close>${t('Cancel')}</button><button class="primary" id="ec-ok">${t('End the combat')}</button></div>`, (box, close) => {
    $('#ec-ok', box).onclick = () => {
      const ids = $$('input[type=checkbox][value]', box).filter(i => i.checked).map(i => i.value);
      const total = num($('#ec-xp', box).value);
      if (total > 0 && ids.length) { const each = Math.floor(total / ids.length); ids.forEach(id => addXP(S.chars[id], each, true)); logInfo(`<i class="ico i-xp"></i> ${t('<b>{total} XP</b> split: {each} XP each for {names}', { total, each, names: ids.map(id => esc(S.chars[id].name)).join(', ') })}`); }
      const removed = new Set(CB().list.filter(x => x.kind !== 'pc').map(x => x.uid));
      if ($('#ec-tok', box).checked) S.camp.maps.forEach(m => m.tokens = m.tokens.filter(tk => !(tk.ref?.kind === 'cb' && defeated.some(d => d.uid === tk.ref.id))));
      if ($('#ec-clear', box).checked) CB().list = CB().list.filter(x => x.kind === 'pc');
      CB().list.forEach(x => { if (removed.has(x.uid)) return; x.init = null; });
      CB().active = false; CB().round = 0; CB().turn = 0;
      charList().forEach(c => remCond(c, 'Concentration'));
      logInfo(`<i class="ico i-flag"></i> <b>${t('End of combat.')}</b>`); saveCamp(); close(); rerender();
    };
  });
}
function removeCombatant(uidv) {
  const i = CB().list.findIndex(x => x.uid === uidv); if (i < 0) return;
  CB().list.splice(i, 1);
  if (CB().turn >= CB().list.length) CB().turn = 0; else if (i < CB().turn) CB().turn--;
  S.camp.maps.forEach(m => m.tokens = m.tokens.filter(tk => !(tk.ref?.kind === 'cb' && tk.ref.id === uidv)));
  saveCamp(); rerender();
}
function saveBonusCb(cb, ab) { return cb.kind === 'pc' ? saveBonus(S.chars[cb.charId], ab) : mod(cb.stats?.[ab]) + (cb.saveProf?.[ab] || 0); }

function areaDamageModal(pre = {}, onDone) {
  const L = CB().list.filter(cbAlive);
  const ab0 = pre.ab ?? 'DEX', checked = cb => pre.uids?.length ? pre.uids.includes(cb.uid) : cb.kind !== 'pc';
  modal(`<h3><i class="ico i-damage"></i> ${t('Area damage / saving throw')}${pre.title ? ' — ' + esc(pre.title) : ''}</h3>
    <div class="row"><label class="field"><span>${t('Damage (formula or number)')}</span><input id="ad-dmg" value="${esc(pre.n ?? '2d8')}" style="width:110px"></label>
      <label class="field"><span>${t('Saving throw')}</span><select id="ad-ab"><option value="">${t('none')}</option>${STATS.map(s => `<option value="${s}" ${s === ab0 ? 'selected' : ''}>${abbr(s)}</option>`).join('')}</select></label>
      <label class="field"><span>${t('DC')}</span><input id="ad-dc" type="number" value="${pre.dc ?? 15}" style="width:60px"></label>
      <label class="field"><span>${t('On a success')}</span><select id="ad-half"><option value="half">${t('half')}</option><option value="none" ${pre.half === false ? 'selected' : ''}>${t('no damage')}</option></select></label></div>
    ${L.length ? '' : `<p class="muted">${t('No combatant: add the creatures to the combat to apply damage.')}</p>`}
    <div class="col" style="margin-top:8px;max-height:300px;overflow:auto">${L.map(cb => `<label class="chk"><input type="checkbox" value="${cb.uid}" ${checked(cb) ? 'checked' : ''}> ${esc(cbName(cb))}</label>`).join('')}</div>
    <div class="actions"><button data-close>${t('Cancel')}</button><button class="primary" id="ad-ok">${t('Apply')}</button></div>`, (box, close) => {
    $('#ad-ok', box).onclick = () => {
      const dexpr = $('#ad-dmg', box).value.trim(), r = /^\d+$/.test(dexpr) ? { total: +dexpr, detail: dexpr } : rollExpr(dexpr);
      if (!r) return toast(t('Invalid formula'));
      const ab = $('#ad-ab', box).value, dc = num($('#ad-dc', box).value), half = $('#ad-half', box).value === 'half';
      const res = [];
      $$('input[type=checkbox]:checked', box).forEach(i => {
        const cb = CB().list.find(x => x.uid === i.value), e = ent(cb); let dmg = r.total, txt = '';
        if (ab) {
          const s = rollExpr('1d20' + fmod(saveBonusCb(cb, ab))), ok = s.total >= dc;
          if (ok) dmg = half ? Math.floor(dmg / 2) : 0;
          txt = ` (${t('save')} ${s.total} ${ok ? '✔' : '✘'})`;
        }
        res.push(`${esc(cbName(cb))}${txt} : ${dmg}`);
        dealDamage(e, dmg, cbName(cb)); cbSave(cb);
      });
      logInfo(`<i class="ico i-damage"></i> <b>${t('Area: {n} damage', { n: r.total })}</b> [${r.detail}]${ab ? ` — ${t('{ab} save DC {dc}', { ab: abbr(ab), dc })}` : ''}<br>${res.join(' · ')}`);
      onDone && onDone(); close(); rerender();
    };
  });
}

/* ---------- player actions: apply from the history ---------- */
function pickTargetModal(title, kindHint, cb) {
  const L = CB().list.filter(x => cbAlive(x) || x.kind === 'pc');
  const pcs = charList().filter(c => !L.some(x => x.kind === 'pc' && x.charId === c.id));
  if (!L.length && !pcs.length) return toast(t('No target available.'));
  modal(`<h3>${title}</h3><div class="tgt-list">${L.map(x => `<button class="tgt ${x.kind === 'pc' || x.kind === 'npc' ? 'ally' : 'foe'}" data-tgt="cb:${x.uid}">${esc(cbName(x))} <span class="muted small">${ent(x).hp}/${ent(x).hpMax}</span></button>`).join('')}
    ${pcs.map(c => `<button class="tgt ally" data-tgt="pc:${c.id}">${esc(c.name)} <span class="muted small">${c.hp}/${c.hpMax}</span></button>`).join('')}</div>
    <div class="actions"><button data-close>${t('Cancel')}</button></div>`, (box, close) => {
    $$('[data-tgt]', box).forEach(b => b.onclick = () => { close(); const [k, id] = b.dataset.tgt.split(':'); cb(k === 'pc' ? { e: S.chars[id], name: S.chars[id].name, save: () => saveChar(S.chars[id]) } : targetOf(id)); });
  });
}
function targetOf(uidv) {
  const cb = CB().list.find(x => x.uid === uidv); if (!cb) return null;
  return { e: ent(cb), name: cbName(cb), save: () => cbSave(cb), cb };
}
const gainTempHP = (tg, n) => { tg.e.hpTemp = Math.max(tg.e.hpTemp || 0, n); logInfo(`<i class="ico i-shield"></i> ${t('{who} gains {n} temporary hit points', { who: `<b>${esc(tg.name)}</b>`, n })}`); };
function applyFromLog(id) {
  const e = S.camp.log.find(x => x.id === id); if (!e?.apply) return;
  const a = e.apply, done = () => { e.applied = true; saveCamp(); renderLog(); rerender(); };
  if (a.type === 'zone') return areaDamageModal({ n: a.n, ab: a.ab, dc: a.dc, half: a.half, uids: a.uids, title: e.label }, done);
  const apply = tg => {
    if (!tg?.e) return toast(t('Target not found (no longer in the combat?)'));
    if (a.type === 'dmg') dealDamage(tg.e, a.n, tg.name);
    else if (a.temp) gainTempHP(tg, a.n);
    else healEntity(tg.e, a.n, tg.name);
    tg.save(); done();
  };
  if (a.uid && targetOf(a.uid)) apply(targetOf(a.uid));
  else pickTargetModal(a.type === 'dmg' ? `<i class="ico i-damage"></i> ${t('Apply {n} {type} damage to…', { n: a.n, type: esc(term(a.dtype || '')) })}` : `<i class="ico i-heal"></i> ${t('Heal {n} HP…', { n: a.n })}`, a.type, apply);
}
document.addEventListener('click', ev => { const b = ev.target.closest('[data-apply]'); if (b) { ev.preventDefault(); applyFromLog(b.dataset.apply); } });

/* ---------- spells cast by the GM (sheet or combat) ---------- */
function combatTargets(exceptUid, casterIsPc = true) {
  return CB().list.filter(x => x.uid !== exceptUid && cbAlive(x)).map(x => ({ uid: x.uid, name: cbName(x), foe: (x.kind === 'mon') === casterIsPc }));
}
function castFromGM(c, item, cbUid) {
  const inCombat = CB().active;
  const tg = combatTargets(cbUid);
  castModal(c, item, tg, o => {
    const res = castLocal(c, item, o, u => { const x = CB().list.find(y => y.uid === u); return x && { uid: u, name: cbName(x), ac: ent(x).ca }; });
    if (res) spellResultModal(c, res, o);
    rerender();
  }, { inCombat });
}
function spellResultModal(c, res, o) {
  const { sp, nums } = res, rows = [], name = spellName(sp);
  res.rays.forEach((r, i) => {
    rows.push(`<div class="atk-res">${res.rays.length > 1 ? `<b>${esc(multiName(nums.multi?.nom || 'rayon'))} ${i + 1}</b> · ` : ''}${t('Attack')} <b>${r.atk.total}</b> ${r.atk.crit ? `<i class="ico i-sparkle"></i> ${t('CRITICAL')}` : r.atk.fumble ? '<i class="ico i-skull"></i>' : ''}
      ${r.t ? (r.hit ? `<span class="hit">${t('HIT')}</span> ${esc(r.t.name)}` : `<span class="miss">${t('MISS')}</span> ${esc(r.t.name)}`) : ''}
      ${r.dmg ? ` — <b>${r.dmg.total}</b> ${esc(term(nums.dmg?.type || ''))}` : ''}
      ${r.dmg ? `<button class="small danger" data-ap="${i}">${r.t ? t('Apply to {name}', { name: esc(r.t.name) }) : t('Apply to…')}</button>` : ''}</div>`);
  });
  if (res.dmg) rows.push(`<div class="atk-res">${t('Damage')} <b style="font-size:1.3rem">${res.dmg.total}</b> ${esc(term(nums.dmg.type))} ${sp.jds ? `— ${t('{ab} save DC {dc}', { ab: abbr(sp.jds), dc: c.spellcasting?.dc })}` : ''}
      <button class="small danger" id="sr-zone">${sp.jds ? `<i class="ico i-damage"></i> ${t('Resolve the saving throws…')}` : t('Apply to…')}</button></div>`);
  if (res.heal) rows.push(`<div class="atk-res"><i class="ico i-heal"></i> <b style="font-size:1.3rem">${res.heal.total}</b> ${nums.soin.temp ? t('temporary hit points') : t('HP')} <button class="small ok" id="sr-heal">${t('Apply to…')}</button></div>`);
  if (!rows.length) return toast(`<i class="ico i-spells"></i> ${t('{who} casts {spell}', { who: esc(c.name), spell: esc(name) })}.`);
  modal(`<h3><i class="ico i-spells"></i> ${esc(name)}</h3>${rows.join('')}<div class="actions"><button class="primary" data-close>${t('Close')}</button></div>`, (box, close) => {
    $$('[data-ap]', box).forEach(b => b.onclick = () => {
      const r = res.rays[+b.dataset.ap];
      const doIt = tg => { dealDamage(tg.e, r.dmg.total, tg.name); tg.save(); b.disabled = true; b.textContent = '✔'; rerender(); };
      r.t ? doIt(targetOf(r.t.uid)) : pickTargetModal(t('Apply to…'), 'dmg', doIt);
    });
    $('#sr-zone', box) && ($('#sr-zone', box).onclick = () => {
      if (sp.jds) { close(); areaDamageModal({ n: res.dmg.total, ab: sp.jds, dc: c.spellcasting?.dc, half: sp.jdsOk === 'moitie', uids: o.targets, title: name }); }
      else pickTargetModal(t('Apply to…'), 'dmg', tg => { dealDamage(tg.e, res.dmg.total, tg.name); tg.save(); close(); rerender(); });
    });
    $('#sr-heal', box) && ($('#sr-heal', box).onclick = () => pickTargetModal(t('Heal…'), 'heal', tg => {
      if (nums.soin.temp) gainTempHP(tg, res.heal.total); else healEntity(tg.e, res.heal.total, tg.name);
      tg.save(); close(); rerender();
    }));
  });
}
function spellListHTML(c, cbUid) {
  const list = charSpells(c); if (!list.length) return '';
  let last = -1;
  return list.map(it => {
    const head = it.lvl !== last ? `<div class="sp-lvl">${it.lvl ? t('Level {n}', { n: it.lvl }) : t('Cantrips')}</div>` : ''; last = it.lvl;
    return head + `<div class="sp-row"><button class="small primary" data-cast="${it.lvl}|${esc(it.name)}" ${cbUid ? `data-cbu="${cbUid}"` : ''}><i class="ico i-spells"></i></button>
      <span class="sp-name" data-spinfo="${it.lvl}|${esc(it.name)}">${esc(it.label)}${it.sp?.conc ? ' <span class="tag conc">C</span>' : ''}${it.sp?.rituel ? ' <span class="tag">R</span>' : ''}</span>
      <span class="muted small sp-sum">${it.sp ? spellSummary(it.sp, c) : t('not in the database')}</span></div>`;
  }).join('');
}
document.addEventListener('click', ev => {
  const b = ev.target.closest('[data-cast],[data-spinfo]'); if (!b || !S.isGM) return;
  const holder = b.closest('[data-char]'); const c = holder && S.chars[holder.dataset.char]; if (!c) return;
  const [l, ...rest] = (b.dataset.cast || b.dataset.spinfo).split('|'), name = rest.join('|');
  const item = charSpells(c).find(x => x.lvl === +l && x.name === name); if (!item) return;
  if (b.dataset.cast) castFromGM(c, item, b.dataset.cbu || CB().list.find(x => x.kind === 'pc' && x.charId === c.id)?.uid);
  else modal(spellCardHTML(item.key, item.sp, c) + `<div class="actions"><button data-close>${t('Close')}</button></div>`);
});

/* ---------- rendering ---------- */
function renderCombat(main) {
  const C = CB();
  const mons = monList();
  main.innerHTML = `
  <div class="row sticky-top">
    <span class="round-badge">${C.active ? `<i class="ico i-combat"></i> ${t('Round {n}', { n: C.round })}` : `<i class="ico i-dove"></i> ${t('Out of combat')}`}</span>
    ${C.active ? `<button id="cb-prev">◀ ${t('Back')}</button><button class="primary" id="cb-next">${t('Next turn')} ▶ <span class="muted small">(${t('space')})</span></button><button class="danger" id="cb-end"><i class="ico i-flag"></i> ${t('End of combat')}</button>`
      : `<button class="primary" id="cb-start"><i class="ico i-combat"></i> ${t('Start the combat')}</button>`}
    <span class="right"></span>
    <button id="cb-pcs">+ ${t('Characters')}</button>
    <select id="cb-mon" style="width:170px"><option value="">+ ${t('Bestiary monster…')}</option>${mons.map(m => `<option value="${m.id}">${esc(m.name)} (${t('CR')} ${esc(m.cr)})</option>`).join('')}</select>
    <input id="cb-count" type="number" value="1" min="1" style="width:46px" title="${t('Number')}">
    <select id="cb-hpmode" title="${t('Monster hit points')}"><option value="avg">${t('average HP')}</option><option value="roll">${t('rolled HP')}</option></select>
    <label class="chk small" title="${t('Opponents hidden in the player view')}"><input type="checkbox" id="cb-hidden"> ${t('hidden')}</label>
    <button id="cb-custom">+ ${t('Quick NPC')}</button>
    ${(S.camp.encounters || []).length ? `<select id="cb-enc" style="width:190px"><option value="">${t('Prepared encounter…')}</option>${S.camp.encounters.map(x => `<option value="${x.id}">${x.done ? '✔ ' : ''}${esc(x.name)}</option>`).join('')}</select>` : ''}
    <button id="cb-init" title="${t('Roll initiative for everyone')}"><i class="ico i-dice"></i> ${t('Initiative')}</button>
    <button id="cb-area"><i class="ico i-damage"></i> ${t('Area')}</button>
    <button id="cb-clear" class="danger small" title="${t('Clear the list')}"><i class="ico i-trash"></i></button>
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
  $('#cb-area').onclick = () => areaDamageModal();
  $('#cb-clear').onclick = () => confirmBox(t('Completely clear the initiative list?'), () => { C.list = []; C.active = false; C.round = 0; C.turn = 0; saveCamp(); rerender(); });
  drawInitList(); drawTurnPanel();
}
function drawInitList() {
  const el = $('#init-list'); if (!el) return;
  const C = CB();
  if (!C.list.length) { el.innerHTML = `<div class="empty">${t('No combatants. Add the characters and monsters from the bestiary.')}</div>`; return; }
  el.innerHTML = C.list.map((cb, i) => {
    const e = ent(cb); if (!e) return '';
    const cur = C.active && i === C.turn, dead = cb.kind !== 'pc' && (cb.dead || e.hp <= 0);
    const av = cb.kind === 'pc' ? avatarHTML(e) : avatarHTML({ name: cb.name, portrait: cbPortrait(cb), color: cb.color || (cb.kind === 'npc' ? '#7a6a20' : '#7a2a2a') });
    return `<div class="cbt ${cb.kind} ${cur ? 'cur' : ''} ${dead ? 'dead' : ''} ${cb.hidden ? 'hid' : ''}" data-cb="${cb.uid}">
      <input class="ini" data-init="${cb.uid}" value="${cb.init ?? ''}" placeholder="—" title="${t('Initiative (bonus {n})', { n: fmod(cb.initMod || 0) })}">
      ${av}
      <div><span class="cname" data-pick="${cb.uid}">${cur ? '▶ ' : ''}${esc(cbName(cb))}</span> ${cb.kind === 'mon' ? `<span class="tag">${t('CR')} ${esc(cb.cr ?? '?')}</span>` : cb.kind === 'npc' ? `<span class="tag">${t('ally')}</span>` : `<span class="tag">${t('lvl {n}', { n: e.niveau })}</span>`}
        ${cb.hidden ? `<span class="tag" title="${t('Invisible in the player view')}">${t('hidden')}</span>` : ''}
        <div class="conds">${condChips(e, 'cb:' + cb.uid)}${condSelect('cb:' + cb.uid)}</div></div>
      <div class="hpc">${hpBar(e)}<div class="row"><b>${e.hp}</b>/${e.hpMax}${e.hpTemp ? ` <span class="muted">+${e.hpTemp}</span>` : ''}
        <input type="number" data-amt="${cb.uid}" placeholder="n"><button class="small danger" data-dmg="${cb.uid}" title="${t('Damage')}">−</button><button class="small ok" data-heal="${cb.uid}" title="${t('Heal')}">+</button><button class="small" data-tmp="${cb.uid}" title="${t('Temporary hit points')}">T</button></div></div>
      <div class="ca">${t('AC')}<b>${e.ca}</b></div>
      <div class="row" style="flex-wrap:nowrap">${cb.kind !== 'pc' ? `<button class="small icon" data-hide="${cb.uid}" title="${t('Hide/show to players')}">${cb.hidden ? '<i class="ico i-hidden"></i>' : '<i class="ico i-eye"></i>'}</button>` : ''}
        <button class="small icon" data-rm="${cb.uid}" title="${t('Remove')}">✕</button></div>
    </div>`;
  }).join('');
  el.onchange = e => {
    const i = e.target.closest('[data-init]');
    if (i) { const cb = C.list.find(x => x.uid === i.dataset.init); cb.init = i.value === '' ? null : num(i.value); sortCombat(); saveCamp(); drawInitList(); }
  };
  el.onclick = e => {
    const b = e.target.closest('button,[data-pick]'); if (!b) return;
    const id = b.dataset.dmg || b.dataset.heal || b.dataset.tmp || b.dataset.hide || b.dataset.rm || b.dataset.pick;
    const cb = C.list.find(x => x.uid === id); if (!cb) return;
    const en = ent(cb), amt = num($(`[data-amt="${id}"]`, el)?.value);
    if (b.dataset.dmg) { dealDamage(en, amt, cbName(cb)); cbSave(cb); }
    else if (b.dataset.heal) { healEntity(en, amt, cbName(cb)); cbSave(cb); }
    else if (b.dataset.tmp) { en.hpTemp = Math.max(en.hpTemp || 0, amt); cbSave(cb); }
    else if (b.dataset.hide) { cb.hidden = !cb.hidden; S.camp.maps.forEach(m => m.tokens.forEach(tk => { if (tk.ref?.id === cb.uid) tk.hidden = cb.hidden; })); saveCamp(); }
    else if (b.dataset.rm) return confirmBox(t('Remove {name} from the combat?', { name: esc(cbName(cb)) }), () => removeCombatant(id));
    else if (b.dataset.pick) selCb = id;
    drawInitList(); drawTurnPanel();
  };
  el.onkeydown = e => { const a = e.target.closest('[data-amt]'); if (a && e.key === 'Enter') { const cb = C.list.find(x => x.uid === a.dataset.amt); dealDamage(ent(cb), num(a.value), cbName(cb)); cbSave(cb); drawInitList(); drawTurnPanel(); } };
}
function drawTurnPanel() {
  const el = $('#turn-panel'); if (!el) return;
  const C = CB();
  let cb = C.list.find(x => x.uid === selCb) || currentCb() || C.list[0];
  if (!cb) { el.innerHTML = `<div class="card"><h3>${t('How it works')}</h3><ol class="muted small" style="padding-left:18px;line-height:1.6">
    <li>${t('Add the characters (+ Characters) and monsters.')}</li><li>${t('Roll initiative (or type it in).')}</li>
    <li>${t('Start the combat, then "Next turn" (space bar).')}</li><li>${t('Click a name to show it here, pick a target, roll an attack: damage is applied in one click.')}</li>
    <li>${t("At the end, the defeated opponents' XP is shared.")}</li></ol></div>`; return; }
  const e = ent(cb), isPc = cb.kind === 'pc';
  const attacks = isPc ? [...(e.attacks || [])] : (cb.attacks || []);
  const targets = C.list.filter(x => x.uid !== cb.uid && cbAlive(x));
  const defTarget = lastAtk?.from === cb.uid ? lastAtk.target : (targets.find(x => (x.kind === 'pc') !== isPc)?.uid || '');
  el.innerHTML = `<div class="card">
    <div class="row">${isPc ? avatarHTML(e, 52) : avatarHTML({ name: cb.name, portrait: cbPortrait(cb), color: cb.color || '#7a2a2a' }, 52)}
      <div><h3 style="margin:0">${esc(cbName(cb))}</h3><div class="muted small">${isPc ? esc(e.race) + ' · ' + esc(classLabel(e.classe)) : `${t('CR')} ${esc(cb.cr ?? '?')} · ${cb.xp} XP`}</div></div>
      ${isPc ? `<button class="small right" id="tp-sheet">${t('Sheet')} ›</button>` : ''}</div>
    <div class="row" style="margin-top:6px"><b>${e.hp}/${e.hpMax} ${t('HP')}</b> · ${t('AC')} ${e.ca}${isPc ? ` · ${t('spell DC')} ${e.spellcasting?.dc ?? '—'} · ${t('Passive Perception')} ${10 + skillBonus(e, 'Perception')}` : ''}</div>
    ${hpBar(e)}
  </div>
  <div class="card"><h4><i class="ico i-target"></i> ${t('Attack')}</h4>
    <div class="row"><span class="muted small">${t('Target')}</span><select id="tp-target" style="flex:1"><option value="">(${t('none')})</option>${targets.map(x => `<option value="${x.uid}" ${x.uid === defTarget ? 'selected' : ''}>${esc(cbName(x))} — ${t('AC')} ${ent(x).ca}, ${ent(x).hp} ${t('HP')}</option>`).join('')}</select></div>
    <div class="col" style="margin-top:6px">${attacks.map((a, i) => `<div class="row"><button class="primary small" data-tpatk="${i}" style="min-width:150px;justify-content:space-between">${esc(a.name)} <span>${fmod(+a.bonus || 0)}</span></button>
      <span class="muted small">${esc(a.damage || '')} ${esc(term(a.type || ''))}</span></div>`).join('') || `<span class="muted small">${t('No attack defined.')}</span>`}</div>
    <div id="tp-res" style="margin-top:8px"></div>
    ${!isPc ? `<button class="small" id="tp-addatk" style="margin-top:6px">+ ${t('attack')}</button>` : ''}
  </div>
  ${!isPc && cb.stats && Object.keys(cb.stats).length ? `<div class="card"><h4>${t('Saving throws')}</h4><div class="row">${STATS.map(s => `<button class="small" data-roll="1d20${fmod(saveBonusCb(cb, s))}" data-label="${t('{ability} save', { ability: abbr(s) })}" data-who="${esc(cb.name)}">${abbr(s)} ${fmod(saveBonusCb(cb, s))}</button>`).join('')}</div></div>` : ''}
  ${isPc ? `<div class="card"><h4>${t('Quick rolls')}</h4><div class="row">${STATS.map(s => `<button class="small" data-roll="1d20${fmod(saveBonus(e, s))}" data-label="${t('{ability} save', { ability: abbr(s) })}" data-who="${esc(e.name)}">${t('{ability} save', { ability: abbr(s) })} ${fmod(saveBonus(e, s))}</button>`).join('')}</div>
      ${(e.resources || []).length ? `<div class="col" style="margin-top:8px">${e.resources.map((r, i) => `<div class="res"><span class="rn small">${esc(r.name)}</span><button class="icon small" data-tpres="${i}:-1">−</button><b>${r.cur}/${r.max}</b><button class="icon small" data-tpres="${i}:1">+</button></div>`).join('')}</div>` : ''}
      ${e.spellcasting ? `<div class="row" style="margin-top:8px"><span class="small muted">${t('Slots')}:</span>${Object.entries(e.spellcasting.slots).map(([l, s]) => `<span class="small">${t('L{n}', { n: l })}</span><span class="pips">${Array.from({ length: s.max }, (_, k) => `<button class="pip ${k < s.cur ? 'full' : ''}" data-tpslot="${l}:${k}"></button>`).join('')}</span>`).join(' ')}</div>` : ''}
      </div>` : ''}
  ${isPc && Object.values(e.spells || {}).some(l => l?.length) ? `<div class="card" data-char="${e.id}"><h4><i class="ico i-spells"></i> ${t('Spells')} <span class="muted small">${t('DC')} ${e.spellcasting?.dc ?? '—'} · ${t('attack')} ${fmod(+e.spellcasting?.attack || 0)}${e.concentration ? ` · ${t('concentration')}: <b>${esc(spellName(findSpell(e.concentration)[1], e.concentration))}</b>` : ''}</span></h4>${spellListHTML(e, cb.uid)}</div>` : ''}
  ${!isPc && cb.traits ? `<div class="card"><h4>${t('Features')}</h4><div class="ft md-view small">${md(cb.traits)}</div></div>` : ''}
  ${isPc && e.features?.length ? `<div class="card"><h4>${t('Features')}</h4>${e.features.map(f => `<details><summary><b>${esc(f.name)}</b></summary><div class="small ft" style="white-space:pre-wrap">${linkDice(esc(f.text))}</div></details>`).join('')}</div>` : ''}`;
  $('#tp-sheet', el) && ($('#tp-sheet', el).onclick = () => { selChar = cb.charId; charSub = 'sheet'; go('characters'); });
  $$('[data-tpatk]', el).forEach(b => b.onclick = () => {
    const a = attacks[+b.dataset.tpatk], tu = $('#tp-target', el).value, tg = CB().list.find(x => x.uid === tu);
    const res = attackRoll({ who: cbName(cb), name: a.name, bonus: a.bonus, damage: a.damage, type: a.type, targetAC: tg ? ent(tg).ca : null, targetName: tg ? cbName(tg) : '' });
    lastAtk = { from: cb.uid, target: tu };
    const box = $('#tp-res', el);
    box.innerHTML = `<div class="atk-res">${t('Attack')}: <b>${res.atk.total}</b> ${res.atk.crit ? `<i class="ico i-sparkle"></i> <b>${t('CRITICAL')}</b>` : res.atk.fumble ? `<i class="ico i-skull"></i> ${t('critical failure')}` : ''}
      ${tg ? (res.hit ? `<span class="hit">${t('HIT')}</span>` : `<span class="miss">${t('MISS')}</span>`) : ''}
      ${res.dmg ? `<div>${t('Damage')}: <b style="font-size:1.3rem">${res.dmg.total}</b> ${esc(term(a.type || ''))}</div>` : ''}
      ${tg && (res.dmg || !a.damage) ? `<div class="row" style="margin-top:6px"><input id="tp-dmgv" type="number" value="${res.dmg?.total ?? ''}" style="width:60px">
        <button class="danger small" id="tp-apply">${t('Apply to {name}', { name: esc(cbName(tg)) })}</button><button class="small" id="tp-half">½</button></div>` : ''}</div>`;
    $('#tp-apply', box) && ($('#tp-apply', box).onclick = () => { dealDamage(ent(tg), num($('#tp-dmgv', box).value), cbName(tg)); cbSave(tg); drawInitList(); drawTurnPanel(); });
    $('#tp-half', box) && ($('#tp-half', box).onclick = () => { const i = $('#tp-dmgv', box); i.value = Math.floor(num(i.value) / 2); });
  });
  $('#tp-addatk', el) && ($('#tp-addatk', el).onclick = () => ask(t('New attack'), [{ k: 'name', label: t('Name') }, { k: 'bonus', label: t('Attack bonus'), type: 'number', value: 4 }, { k: 'damage', label: t('Damage'), value: '1d6+2' }, { k: 'type', label: t('Type') }], o => { cb.attacks.push(o); saveCamp(); drawTurnPanel(); }));
  $$('[data-tpres]', el).forEach(b => b.onclick = () => { const [i, d] = b.dataset.tpres.split(':').map(Number); const r = e.resources[i]; r.cur = clamp(r.cur + d, 0, r.max); saveChar(e); drawTurnPanel(); });
  $$('[data-tpslot]', el).forEach(b => b.onclick = () => { const [l, k] = b.dataset.tpslot.split(':').map(Number); const s = e.spellcasting.slots[l]; s.cur = s.cur > k ? k : k + 1; saveChar(e); drawTurnPanel(); });
}
TABS.combat = {
  render: renderCombat,
  key: e => { if (e.code === 'Space' && CB().active) { e.preventDefault(); nextTurn(); } },
};
