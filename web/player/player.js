/* ===== Player view: map, sheet, actions, spells, dice, journal ===== */
'use strict';

const OLD_TABS = { fiche: 'sheet', sorts: 'spells', des: 'dice', groupe: 'party' };   // tab names of earlier versions
const P = { tab: 'sheet', adv: 0, secret: false, campId: null, lastHandout: 0, lastMap: null, lastFocus: 0, lastTurn: null, dragging: false, notesTimer: null, panel: true };
let me = null;
const savedTab = store.get('gt-ptab') ?? store.get('mj-ptab');
P.tab = OLD_TABS[savedTab] || savedTab || 'sheet';
P.panel = (store.get('gt-panel') ?? store.get('mj-panel')) !== '0';
const meKey = () => 'gt-player:' + (P.campId || '');
const myChar = () => (me && S.chars[me]) || null;

const PV = new MapView($('#pv'), {
  player: true, emptyText: t('Waiting for the Game Master…'),
  panOnLeft: e => !e.target.closest('.token.mine'),
  mine: o => !!me && o.charId === me,
});

async function loadPlayer() {
  const d = await api('GET', '/api/player-state' + (me ? '?char=' + encodeURIComponent(me) : ''));
  S.chars = d.characters || {}; S.mons = d.monsters || {}; S.camp = campDefaults(d.campaign || {}); S.rev = d.rev;
  if (P.campId !== d.campaignMeta?.id) {
    P.campId = d.campaignMeta?.id;
    me = store.get(meKey()) ?? store.get('mj-joueur:' + (P.campId || ''));   // second key: earlier versions
    const q = new URLSearchParams(location.search);   // direct link: /player?char=vex&tab=spells
    const qChar = q.get('char') || q.get('perso'), qTab = q.get('tab') || q.get('onglet');
    if (qChar && S.chars[qChar]) { me = qChar; store.set(meKey(), me); }
    if (qTab && TABS_P[OLD_TABS[qTab] || qTab]) P.tab = OLD_TABS[qTab] || qTab;
    if (me && !S.chars[me]) me = null;
    if (me === null || me === undefined) setTimeout(showPicker, 50);
  }
  if (me && d.me !== me) return loadPlayer();   // first load: fetch again with the character (its own data, e.g. the deck)
  $('#camp-title').textContent = d.campaignMeta?.name || '';
  document.title = (myChar()?.name ? myChar().name + ' — ' : '') + (d.campaignMeta?.name || t('GM Table'));
}
const playerMap = () => S.camp.maps[0] || null;
const myToken = () => playerMap()?.tokens.find(tk => me && tokenInfo(tk).charId === me);
const C = () => S.camp.combat;
const myTurn = () => { const c = C(), cur = c.active && c.list[c.turn]; return !!(cur && cur.kind === 'pc' && cur.charId === me); };
const canAct = () => { const m = S.camp.settings?.playerActions || 'turn'; return m === 'always' || (m === 'turn' && (!C().active || myTurn())); };

function avatar(c, cls = '') {
  return c.portrait ? `<div class="avatar ${cls}" style="background-image:url('${esc(c.portrait)}')"></div>` : `<div class="avatar ${cls}" style="background-color:${c.color || colorFor(c.name)}">${esc(initials(c.name))}</div>`;
}
const classLine = c => esc(classLabel(String(c.classe || '').split(/[—–]/)[0].trim()));

/* ---------------------------------------------------------------- character choice */
function showPicker() {
  const pcs = Object.values(S.chars).sort((a, b) => a.name.localeCompare(b.name));
  const el = $('#pick'); el.classList.remove('hidden');
  el.innerHTML = `<div class="pick-in"><h1><i class="ico i-lantern"></i> ${esc($('#camp-title').textContent || t('The table'))}</h1><p class="muted">${t('Who are you? Pick your character to access your sheet, your spells and your token.')}</p>
    <div class="picks">${pcs.map(c => `<button class="pk" data-pk="${c.id}">${avatar(c)}<b>${esc(c.name)}</b><span class="muted small">${esc(c.race || '')} · ${classLine(c)} ${c.niveau || ''}</span></button>`).join('')}
    <button class="pk" data-pk=""><div class="avatar" style="background:#333"><i class="ico i-eye"></i></div><b>${t('Spectator')}</b><span class="muted small">${t('table screen, no character')}</span></button></div>
    <div class="row" style="justify-content:center;margin-top:14px">${[['en', 'English'], ['fr', 'Français']].map(([l, n]) => `<button class="small ${l === LANG ? 'on' : ''}" data-lang="${l}">${n}</button>`).join('')}</div></div>`;
  $$('[data-lang]', el).forEach(b => b.onclick = () => { if (b.dataset.lang !== LANG) setLang(b.dataset.lang); });
  $$('[data-pk]', el).forEach(d => d.onclick = () => {
    me = d.dataset.pk || null; store.set(meKey(), me || '');
    el.classList.add('hidden'); refresh(true).then(() => { if (me) setTimeout(centerMe, 150); });
  });
}
function centerMe() {
  const tk = myToken(), m = playerMap(); if (!tk || !m) return toast(t('Your token is not on this map. Ask the GM to place you.'));
  const g = m.grid, s = (tk.size || 1) / 2;
  PV.centerOn(g.ox + (tk.x + s) * g.size, g.oy + (tk.y + s) * g.size, Math.max(PV.view.z, 0.6));
}

/* ---------------------------------------------------------------- actions sent to the server */
async function act(type, payload = {}, title) {
  if (!me) return toast(t('Pick your character first.'));
  try {
    const r = await api('POST', '/api/action', { char: me, type, adv: P.adv, ...payload });
    P.adv = 0; $$('[data-adv]').forEach(b => b.classList.toggle('on', b.dataset.adv === '0'));
    if (r.rolls?.length || r.infos?.length) showResult(title, r);
    await refresh(true);
    return r;
  } catch (e) { toast('<i class="ico i-forbidden"></i> ' + esc(e.message || t('Action refused'))); return null; }
}
function showResult(title, r) {
  const el = $('#result');
  const rays = r.result?.rays;
  el.innerHTML = `<div class="res-box">${title ? `<div class="res-title">${esc(title)}</div>` : ''}
    ${(r.rolls || []).slice().reverse().map(x => `<div class="res-line ${x.crit ? 'crit' : x.fumble ? 'fumble' : ''}"><span class="res-n">${x.total}</span><div><b>${esc(x.label)}</b><div class="muted small">${x.detail || ''}</div></div></div>`).join('')}
    ${rays?.length ? `<div class="small">${rays.map((y, i) => y.hit === null ? '' : `${rays.length > 1 ? (i + 1) + ' : ' : ''}${y.hit ? `<b class="hit">${t('HIT')}</b>` : `<b class="miss">${t('miss')}</b>`}`).join(' · ')}</div>` : ''}
    ${r.result && r.result.hit !== undefined && r.result.hit !== null ? `<div class="res-verdict ${r.result.hit ? 'hit' : 'miss'}">${r.result.hit ? t('HIT!') : t('Miss…')}</div>` : ''}
    ${!(r.rolls || []).length ? (r.infos || []).map(x => `<div>${esc(x)}</div>`).join('') : ''}
    <div class="muted small">${t('The GM sees this roll and applies the effects.')}</div></div>`;
  el.classList.remove('hidden'); el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
  clearTimeout(P.resT); P.resT = setTimeout(() => el.classList.add('hidden'), 5000);
  el.onclick = () => el.classList.add('hidden');
}

/* ---------------------------------------------------------------- panel */
function advBar() {
  return `<div class="seg adv-seg">${[['-1', '▼ ' + t('Disadvantage')], ['0', t('Normal')], ['1', '▲ ' + t('Advantage')]].map(([v, l]) => `<button data-adv="${v}" class="${String(P.adv) === v ? 'on' : ''}">${l}</button>`).join('')}</div>`;
}
function turnNote() {
  const mode = S.camp.settings?.playerActions || 'turn';
  if (mode === 'off') return `<div class="note warn"><i class="ico i-lock"></i> ${t('The GM is rolling attacks and spells for now. Checks and dice remain free.')}</div>`;
  if (!C().active) return `<div class="note"><i class="ico i-compass"></i> ${t('Exploration: you can act freely. The GM sees each of your rolls.')}</div>`;
  if (myTurn()) return `<div class="note ok"><i class="ico i-combat"></i> ${t("It's your turn! An action, a bonus action, your movement… and possibly a reaction.")}</div>`;
  return `<div class="note"><i class="ico i-hourglass"></i> ${t('It is not your turn: attacks and spells will have to wait (except reactions such as <i>Shield</i>). Checks and saving throws are still possible.')}</div>`;
}
function targetsList() {
  return C().list.filter(cb => !(cb.kind === 'pc' && cb.charId === me) && !(cb.kind !== 'pc' && cb.dead)).map(cb => {
    const pc = cb.kind === 'pc', ch = pc ? S.chars[cb.charId] : null;
    return { uid: cb.uid, name: pc ? ch?.name || '?' : cb.name, foe: cb.kind === 'mon', hp: pc ? null : cb.hp };
  });
}
function condChip(x, c) {
  const label = x.n === 'Concentration' && c?.concentration ? `${t('Concentration')}: ${spellName(findSpell(c.concentration)[1], c.concentration)}` : condName(x.n);
  return `<span class="chip ${x.n === 'Concentration' ? 'conc' : 'cond'}" title="${esc(CONDITIONS[x.n] || '')}">${COND_ICONS[x.n] || ''} ${esc(label)}${x.r ? ` (${x.r})` : ''}</span>`;
}
function drawHead() {
  const c = myChar(), el = $('#me-head');
  if (!c) { el.innerHTML = `<div class="row"><b>${t('Spectator')}</b><button class="small right" id="me-chg"><i class="ico i-characters"></i> ${t('Pick a character')}</button></div>`; $('#me-chg').onclick = showPicker; return; }
  const ds = c.deathSaves || { s: 0, f: 0 }, p = c.hpMax ? clamp(c.hp / c.hpMax, 0, 1) : 0;
  el.innerHTML = `<div class="mh">${avatar(c, 'big')}<div class="grow">
      <div class="row"><b class="mh-name">${esc(c.name)}</b><button class="small right link" id="me-chg">${t('change')}</button></div>
      <div class="muted small">${esc(c.race || '')} · ${esc(classLabel(c.classe || ''))} · ${t('lvl {n}', { n: c.niveau })}</div>
      <div class="hpbig"><div class="bar"><i class="${p < .25 ? 'low' : p < .5 ? 'mid' : ''}" style="width:${p * 100}%"></i>${c.hpTemp ? `<b style="left:0;width:${clamp(c.hpTemp / c.hpMax, 0, 1) * 100}%"></b>` : ''}</div>
        <span><b>${c.hp}</b>/${c.hpMax} ${t('HP')}${c.hpTemp ? ` <span class="tmp">+${c.hpTemp}</span>` : ''}</span></div>
      <div class="mh-stats"><span title="${t('Armor Class')}"><i class="ico i-shield"></i> ${c.ca}</span><span title="${t('Initiative')}"><i class="ico i-lightning"></i> ${fmod(+c.initBonus || 0)}</span><span title="${t('Speed')}"><i class="ico i-footsteps"></i> ${esc(c.vitesse || '')}</span><span title="${t('Passive Perception')}"><i class="ico i-eye"></i> ${10 + skillBonus(c, 'Perception')}</span></div>
    </div></div>
    ${(c.conditions || []).length || c.concentration ? `<div class="row conds">${(c.conditions || []).map(x => condChip(x, c)).join('')}
      ${c.concentration ? `<button class="small" id="conc-end">${t('End concentration')}</button>` : ''}</div>` : ''}
    ${c.hp <= 0 ? `<div class="death-box"><i class="ico i-skull"></i> ${t('Unconscious — death saving throws')}: <span class="pips">${[0, 1, 2].map(i => `<span class="pip s ${i < ds.s ? 'full' : ''}"></span>`).join('')}</span> / <span class="pips">${[0, 1, 2].map(i => `<span class="pip f ${i < ds.f ? 'full' : ''}"></span>`).join('')}</span>
      <button class="primary small" id="ds-roll"><i class="ico i-dice"></i> ${t('Death saving throw')}</button></div>` : ''}`;
  $('#me-chg').onclick = showPicker;
  $('#conc-end') && ($('#conc-end').onclick = () => act('end_concentration', {}));
  $('#ds-roll') && ($('#ds-roll').onclick = () => act('death', {}, t('Death saving throw')));
}

const TABS_P = {
  sheet(c) {
    const xpA = XP_TABLE[c.niveau - 1] || 0, xpB = XP_TABLE[c.niveau] ?? xpA, xpP = xpB > xpA ? clamp((c.xp - xpA) / (xpB - xpA), 0, 1) : 1;
    const canLv = levelForXP(c.xp) > c.niveau && c.niveau < 20, lvOk = !!S.camp.settings?.playerLevelUp;
    return `${canLv ? `<button class="lvl-banner" id="p-lvl" ${lvOk ? '' : 'disabled'}><i class="ico i-arrow-up"></i><span><b>${t('Level {n} available!', { n: c.niveau + 1 })}</b><small>${lvOk ? t('Choose your hit points, features, abilities and spells.') : t('The GM handles the level-up: let them know.')}</small></span></button>` : ''}
    <div class="card"><div class="row small"><span><i class="ico i-xp"></i> ${c.xp} XP</span><span class="muted right">${t('level {n} at {xp}', { n: c.niveau + 1, xp: xpB })}</span></div><div class="bar xp"><i style="width:${xpP * 100}%"></i></div>
        <div class="row small" style="margin-top:6px"><span>${t('Proficiency')} ${fmod(+c.prof || 0)}</span><span>· ${t('Hit dice')} ${c.hitDice || 0}/${c.niveau} (d${c.hitDie || 8})</span>${c.spellcasting ? `<span>· ${t('spell DC')} ${c.spellcasting.dc}</span>` : ''}${c.exhaustion ? `<span class="warn">· ${t('Exhaustion')} ${c.exhaustion}</span>` : ''}</div></div>
      <div class="pstats">${STATS.map(s => { const m = mod(c.stats?.[s]), p = (c.saves || []).includes(s); return `<div class="pstat">
        <button class="ab" data-chk="ab:${s}" title="${t('{ability} check', { ability: STAT_NAMES[s] })}"><span>${abbr(s)}</span><b>${fmod(m)}</b><small>${c.stats?.[s]}</small></button>
        <button class="sv ${p ? 'p' : ''}" data-chk="sv:${s}" title="${t('{ability} save', { ability: abbr(s) })}">${t('save')} ${fmod(saveBonus(c, s))}</button></div>`; }).join('')}</div>
      <div class="card"><h4>${t('Skills')} <span class="muted small">(${t('tap to roll')})</span></h4><div class="pskills">${SKILLS.map(([n, ab]) => {
        const has = c.skills && c.skills[n] != null; return `<button class="psk ${has ? 'p' : ''}" data-chk="sk:${n}"><span>${esc(term(n))} <small>${abbr(ab)}</small></span><b>${fmod(skillBonus(c, n))}</b></button>`; }).join('')}</div></div>
      ${(c.features || []).length ? `<div class="card"><h4><i class="ico i-sparkle"></i> ${t('Features')}</h4>${c.features.map(f => `<details><summary><b>${esc(f.name)}</b></summary><div class="small ft">${linkDice(esc(f.text)).replace(/\n/g, '<br>')}</div></details>`).join('')}</div>` : ''}
      ${c.equipment || c.gold ? `<div class="card"><h4><i class="ico i-bag"></i> ${t('Equipment')} <span class="muted small">${c.gold ? '· ' + purseFmt(purseOf(c)) : ''}</span></h4><div class="small" style="white-space:pre-wrap">${esc(c.equipment || '')}</div></div>` : ''}
      ${c.sheet ? `<details class="card"><summary><b><i class="ico i-scroll"></i> ${t('Full sheet')}</b></summary><div class="md-view small">${md(c.sheet)}</div></details>` : ''}`;
  },
  actions(c) {
    const tg = targetsList(), atks = c.attacks || [];
    // action economy of my combatant (counted by the server)
    const mine = C().active ? C().list.find(x => x.kind === 'pc' && x.charId === me) : null, E = mine?.eco || {}, n = attacksPerAction(c);
    const strict = (S.camp.settings?.playerActions || 'turn') === 'turn', off = S.camp.settings?.playerActions === 'off';
    const usedA = E.a && (E.atk || 0) >= n || (E.a && !E.atk);
    const reactOK = !off && !!mine && !myTurn() && !(strict && E.r) && c.hp > 0;
    const atkOK = canAct() && !(strict && mine && myTurn() && usedA) || reactOK;
    const bonusOK = canAct() && !(strict && mine && E.b);
    const fb = featureActions(c, 'b'), fr = featureActions(c, 'r');
    const chip = (on, label) => `<span class="eco ${on ? 'used' : ''}">${label}</span>`;
    return `${turnNote()}
      ${mine ? `<div class="card"><div class="eco-bar" style="margin:0">${chip(usedA, t('Action') + (n > 1 ? ` <small>${t('attacks')} ${Math.min(E.atk || 0, n)}/${n}</small>` : ''))}${chip(E.b, t('Bonus action'))}${chip(E.r, t('Reaction'))}</div></div>` : ''}
      ${C().active ? `<div class="card"><h4><i class="ico i-target"></i> ${t('Target')}</h4><select id="p-target"><option value="">— ${t('none (the GM will choose)')} —</option>${tg.map(x => `<option value="${x.uid}" ${x.uid === P.target ? 'selected' : ''}>${x.foe ? t('Opponent') : t('Ally')} — ${esc(x.name)}${x.hp != null ? ' — ' + HP_STATES[x.hp] : ''}</option>`).join('')}</select></div>` : ''}
      ${advBar()}
      <div class="card"><h4><i class="ico i-combat"></i> ${t('Attacks')} ${mine && !myTurn() && reactOK ? `<span class="tag">${t('Opportunity attack (reaction)')}</span>` : mine && n > 1 ? `<span class="muted small">${t('{n} attacks per Attack action', { n })}</span>` : ''}</h4>
        <div class="col">${atks.map((a, i) => `<div class="row" style="flex-wrap:nowrap"><button class="atk-btn" style="flex:1" data-atk="${i}" ${atkOK ? '' : 'disabled'}><span class="an">${esc(a.name)}</span><span class="ab">${fmod(+a.bonus || 0)}</span><span class="ad">${esc(a.damage || '')} ${esc(term(a.type || ''))}</span></button>
          ${a.damage && C().active ? `<button class="small" data-offh="${i}" ${bonusOK ? '' : 'disabled'} title="${t('Second attack with a light weapon in the other hand, as a bonus action (no ability modifier to the damage)')}">${t('off-hand')}</button>` : ''}</div>`).join('') || `<span class="muted small">${t('No attack on the sheet.')}</span>`}</div></div>
      ${C().active && (fb.length || fr.length) ? `<div class="card"><h4><i class="ico i-lightning"></i> ${t('Bonus actions')} / ${t('Reactions')}</h4>${[...fb.map(f => ['b', f]), ...fr.map(f => ['r', f])].map(([k, f]) => `<div class="ab-row">
          <button class="small primary" data-feat="${k}" data-fname="${esc(f.name)}" ${(k === 'b' ? bonusOK : (canAct() || reactOK) && !(strict && E.r)) ? '' : 'disabled'}>${k === 'b' ? t('bonus action') : t('Reaction')}</button>
          <div class="grow"><b>${esc(f.name)}</b><div class="muted small ab-txt">${linkDice(esc(f.text))}</div></div></div>`).join('')}</div>` : ''}
      ${(c.resources || []).length ? `<div class="card"><h4><i class="ico i-resource"></i> ${t('Resources')}</h4>${c.resources.map((r, i) => `<div class="res"><span class="rn">${esc(r.name)} <span class="muted small">${r.reset === 'aucun' ? '' : '(' + restName(r.reset) + ')'}</span></span>
          ${r.max <= 8 ? `<span class="pips">${Array.from({ length: r.max }, (_, k) => `<span class="pip ${k < r.cur ? 'full' : ''}"></span>`).join('')}</span>` : ''}<b>${r.cur}/${r.max}</b>
          <button class="small" data-res="${i}:-1" ${r.cur > 0 ? '' : 'disabled'}>${t('Use')}</button>${r.reset === 'aucun' ? `<button class="small" data-res="${i}:1">+1</button>` : ''}</div>`).join('')}</div>` : ''}
      <div class="card"><h4><i class="ico i-dice"></i> ${t('Quick rolls')}</h4><div class="row"><button data-chk="init"><i class="ico i-lightning"></i> ${t('Initiative')} ${fmod(+c.initBonus || 0)}</button>
        ${!C().active ? `<button data-hitdie ${c.hitDice > 0 && c.hp < c.hpMax ? '' : 'disabled'} title="${t('During a short rest')}"><i class="ico i-heal"></i> ${t('Hit die')} (${c.hitDice || 0})</button>` : ''}</div></div>`;
  },
  items(c) {
    const inv = (c.inventory || []).map((e, i) => [invView(e), i]);
    const group = (title, list) => list.length ? `<div class="card"><h4>${title}</h4><div class="inv-list">${list.map(([v, i]) => `<div class="inv-row ${v.equipped ? 'eq' : ''}">
        <span data-pinv="${i}">${itemThumb(v, 44)}</span><div class="grow" data-pinv="${i}"><b>${esc(v.name)}</b>${v.qty > 1 ? ` <span class="muted">×${v.qty}</span>` : ''}
          <div class="muted small">${esc(v.cat || '')}${v.weapon ? ` · ${esc(v.weapon.dmg)} ${esc(v.weapon.type)}` : ''}${v.armor ? ` · ${t('AC')} ${v.armor.type === 'shield' ? '+2' : v.armor.base}` : ''}${v.rarity ? ' · ' + esc(v.rarity) : ''}</div></div>
        <div class="col inv-btns">${equippable(v) ? `<button class="small ${v.equipped ? 'primary' : ''}" data-peq="${esc(v.uid)}">${v.equipped ? '✔ ' + t('equipped') : t('Equip')}</button>` : ''}
          ${v.attune ? `<button class="small ${v.attuned ? 'primary' : ''}" data-patt="${esc(v.uid)}">${v.attuned ? '✔ ' + t('attuned') : t('Attune')}</button>` : ''}
          ${v.charges ? `<button class="small" data-pch="${esc(v.uid)}" ${v.charges.cur > 0 ? '' : 'disabled'}><i class="ico i-wand"></i> ${v.charges.cur}/${v.charges.max}</button>` : ''}</div></div>`).join('')}</div></div>` : '';
    return `<div class="card"><div class="row small"><span><i class="ico i-shield"></i> ${t('AC')} <b>${c.ca}</b>${Array.isArray(c.inventory) && (c.caManual == null || c.caManual === '') ? ` <span class="muted">(${esc(computeAC(c).how)})</span>` : ''}</span>
        <span>· ${t('{n} attuned', { n: attunedCount(c) })}/${MAX_ATTUNED}</span></div>
        <div class="muted small" style="margin-top:4px">${t('Tap an item to read it. The GM gives and takes items; you equip them.')}</div></div>
      ${purseCardHTML(purseOf(c), '<button class="small" data-pchange>Faire de la monnaie</button>')}
      ${group(`<i class="ico i-shield"></i> ${t('Equipped')}`, inv.filter(([v]) => v.equipped))}
      ${group(`<i class="ico i-sparkle"></i> ${t('Magic items')}`, inv.filter(([v]) => !v.equipped && v.kind === 'magic'))}
      ${group(`<i class="ico i-bag"></i> ${t('Bag')}`, inv.filter(([v]) => !v.equipped && v.kind !== 'magic'))}
      ${!inv.length ? `<div class="empty">${t('Your inventory is empty.')}</div>` : ''}
      ${c.equipment && !inv.length ? `<div class="card small"><b>${t('Equipment')}</b><div style="white-space:pre-wrap">${esc(c.equipment)}</div></div>` : ''}`;
  },
  spells(c) {
    const list = charSpells(c), sc = c.spellcasting;
    if (!list.length) return `<div class="empty">${t('Your character does not cast spells.')}</div>`;
    let last = -1;
    return `${turnNote()}${advBar()}
      ${sc ? `<div class="card"><div class="row small"><span>${t('Spell save DC')} <b>${sc.dc}</b></span><span>· ${t('Attack')} <b>${fmod(+sc.attack || 0)}</b></span><span>· ${t('Ability')} ${abbr(sc.ability)}</span></div>
        <div class="slots">${Object.entries(sc.slots || {}).filter(([, s]) => s.max > 0).map(([l, s]) => `<div class="slot"><span>${t('Lvl {n}', { n: l })}</span><span class="pips">${Array.from({ length: s.max }, (_, k) => `<span class="pip ${k < s.cur ? 'full' : ''}"></span>`).join('')}</span></div>`).join('')}</div>
        ${c.concentration ? `<div class="small" style="margin-top:6px"><i class="ico i-spells"></i> ${t('Concentration')}: <b>${esc(spellName(findSpell(c.concentration)[1], c.concentration))}</b></div>` : ''}</div>` : ''}
      <div class="card">${list.map((it, i) => {
        const head = it.lvl !== last ? `<div class="sp-lvl">${it.lvl ? t('Level {n}', { n: it.lvl }) : t('Cantrips')}</div>` : ''; last = it.lvl;
        const reaction = /réaction/.test(it.sp?.temps || '');   // casting time stored in French
        const noSlot = it.lvl > 0 && !slotsAvail(c, it.lvl).some(s => s.cur > 0) && !it.sp?.rituel;
        return head + `<div class="psp"><button class="sp-cast" data-pcast="${i}" ${(canAct() || reaction) && !noSlot ? '' : 'disabled'}><i class="ico i-spells"></i></button>
          <div class="grow" data-pinfo="${i}"><b>${esc(it.label)}</b>${it.sp?.conc ? ' <span class="tag conc">C</span>' : ''}${it.sp?.rituel ? ' <span class="tag">R</span>' : ''}${reaction ? ` <span class="tag">${t('reaction')}</span>` : ''}
          <div class="muted small">${it.sp ? spellSummary(it.sp, c) || esc(it.sp.resume) : t('spell not in the database — ask the GM')}</div></div><button class="small icon" data-pinfo="${i}"><i class="ico i-magnifier"></i></button></div>`;
      }).join('')}</div>`;
  },
  dice(c) {
    const common = ['Perception', 'Investigation', 'Discrétion', 'Athlétisme', 'Survie', 'Perspicacité', 'Persuasion', 'Arcanes'];
    return `<div class="dice-grid">${[4, 6, 8, 10, 12, 20, 100].map(d => `<button class="die d${d}" data-die="${d}">d${d}</button>`).join('')}</div>
      ${advBar()}
      <form id="p-expr" class="row"><input name="e" placeholder="${t('e.g. 2d6+3, 4d6kh3')}" autocomplete="off"><input name="l" placeholder="${t('for… (optional)')}" style="width:40%"><button class="primary">${t('Roll')}</button></form>
      <label class="chk small"><input type="checkbox" id="p-secret" ${P.secret ? 'checked' : ''}> ${t('private roll (only the GM and I can see it)')}</label>
      <div class="card"><h4>${t('Common exploration checks')}</h4><div class="row">${common.map(n => `<button class="small" data-chk="sk:${n}">${esc(term(n))} ${fmod(skillBonus(c, n))}</button>`).join('')}</div></div>
      <div class="card"><h4>${t('My latest rolls')}</h4><div class="col">${S.camp.log.filter(e => e.char === me && e.kind === 'roll').slice(0, 8).map(e => logEntryHTML(e)).join('') || `<span class="muted small">${t('None.')}</span>`}</div></div>`;
  },
  journal(c) {
    const q = S.camp.quests || [], npcs = S.camp.npcs || [];
    return `${q.length ? `<div class="card"><h4><i class="ico i-target"></i> ${t('Quests')}</h4>${q.map(x => `<div class="${x.done ? 'done' : ''}">${x.done ? '✔' : '◆'} ${esc(x.t)}${x.reward ? `<div class="q-rew ${x.reward.given ? 'given' : ''}"><i class="ico i-sparkle"></i> ${x.reward.given ? 'Récompense reçue' : 'Récompense promise'} : ${esc(rewardLine(x.reward))}</div>` : ''}</div>`).join('')}</div>` : ''}
      ${npcs.length ? `<div class="card"><h4><i class="ico i-party"></i> ${t('People met')}</h4>${npcs.map(n => `<div><b>${esc(n.name)}</b> <span class="muted small">${esc(n.role || '')}</span>${n.pub ? `<div class="small">${esc(n.pub)}</div>` : ''}</div>`).join('')}</div>` : ''}
      ${S.camp.handout ? `<div class="card"><h4><i class="ico i-announce"></i> ${t('Latest message from the GM')}</h4><button class="small" id="ho-again">${t('View "{title}" again', { title: esc(S.camp.handout.title || t('message')) })}</button></div>` : ''}
      ${c ? `<div class="card"><h4><i class="ico i-quill"></i> ${t('My notes')} <span class="muted small" id="notes-st"></span></h4><textarea id="p-notes" rows="7" placeholder="${t('Clues, names, debts, schemes…')}">${esc(c.playerNotes || '')}</textarea></div>` : ''}
      <div class="card"><h4><i class="ico i-scroll"></i> ${t('What happened')}</h4><div class="col plog">${S.camp.log.slice(0, 40).map(e => logEntryHTML(e)).join('') || `<span class="muted small">${t('Nothing yet.')}</span>`}</div></div>`;
  },
  cards() {
    const D = S.camp.deck;
    if (!D) return `<div class="empty">${t('Nothing yet.')}</div>`;
    const a = D.access || {}, cards = Object.fromEntries((D.pool || []).concat((D.draws || []).map(x => x.card)).filter(c => c?.id).map(c => [c.id, c]));
    const rules = `<div class="card"><h4><i class="ico i-joker"></i> Le Jeu des Mille Fortunes</h4>
      <div class="small">Avant de tirer, vous annoncez combien de cartes vous allez tirer. Chaque carte agit dès qu'elle est tirée, et vous devez tirer la suivante dans l'heure. Si vous vous arrêtez avant, les cartes restantes jaillissent d'elles-mêmes et agissent toutes en même temps. Les cartes tirées en plus du nombre annoncé n'ont aucun effet.</div></div>`;
    let action;
    if (a.declared == null) {
      action = `<div class="card col"><h4>Annoncer un tirage</h4>
        <div class="small">Le MJ vous autorise à annoncer jusqu'à <b>${a.max}</b> carte(s). Une fois annoncé, impossible de revenir en arrière.</div>
        <div class="row"><select id="dk-n">${Array.from({ length: a.max }, (_, i) => `<option value="${i + 1}">${i + 1} carte${i ? 's' : ''}</option>`).join('')}</select>
        <button class="primary" id="dk-declare"><i class="ico i-joker"></i> J'annonce mon tirage</button></div></div>`;
    } else if (D.remaining > 0) {
      action = `<div class="card col"><div class="small">Vous avez annoncé <b>${a.declared}</b> carte(s)${a.extra ? ` (+${a.extra} en bonus)` : ''}. Tirées : <b>${a.drawn}</b>. Il en reste <b>${D.remaining}</b>.</div>
        <button class="primary" id="dk-draw" style="font-size:1.15rem;padding:12px"><i class="ico i-joker"></i> Piocher une carte</button></div>`;
    } else {
      action = `<div class="card"><div class="small"><i class="ico i-hourglass"></i> Votre tirage est terminé (${a.drawn} carte(s)). Le MJ peut vous autoriser un nouveau tirage.</div></div>`;
    }
    const last = (D.draws || [])[0];
    return `${rules}${action}
      ${last ? `<div class="card"><h4>Dernière carte tirée</h4>${last.ended ? `<div class="dk-ended">Cette carte met fin à votre tirage : vous ne tirez plus de cartes.</div>` : ''}
        ${deckFxHTML(last.card, last.fx, { canApply: last.fx?.status === 'choice' || !!last.fx?.error })}${deckCardHTML(last.card, { draw: last })}${deckOptions(last.card, last)}</div>` : ''}
      ${(D.draws || []).length > 1 ? `<div class="card"><h4>Mes tirages précédents</h4><div class="col">${D.draws.slice(1).map(x => `<div class="dk-hist" data-dkcard="${esc(x.card.id)}" style="--tone:${deckTone(x.card)[1]}">${deckIcon(x.card, 'dk-mi')}<b>${esc(x.card.n)}</b><span class="muted small right">${new Date(x.t).toLocaleString([], { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span></div>`).join('')}</div></div>` : ''}
      <details class="card"><summary><b>Les cartes que le MJ vous permet de tirer (${(D.pool || []).length})</b></summary>
        <div class="dk-grid" style="margin-top:8px">${(D.pool || []).map(c => deckMini(c, { attr: `data-dkcard="${esc(c.id)}"` })).join('')}</div></details>`;
  },
  shop(c) {
    const D = S.camp.shop;
    if (!D) return `<div class="empty">Aucun magasin n'est ouvert pour le moment.</div>`;
    const gold = purseCp(purseOf(c)) / 100, resale = Object.fromEntries((D.sell || []).map(x => [x.uid, x.price]));
    const inv = (c.inventory || []).map(invView);
    return `<div class="card sh-head">${D.npc?.img ? `<div class="avatar big" style="background-image:url('${esc(D.npc.img)}')"></div>` : `<div class="avatar big sh-noimg"><i class="ico i-purse"></i></div>`}
        <div class="grow"><h4 class="sh-name">${esc(D.name)}</h4>${D.npc?.name ? `<div class="small"><b>${esc(D.npc.name)}</b></div>` : ''}${D.npc?.greet ? `<div class="small sh-greet">« ${esc(D.npc.greet)} »</div>` : ''}</div></div>
      <div class="card"><div class="row small"><span><i class="ico i-purse"></i> Votre bourse : ${purseHTML(purseOf(c), { total: true })}</span><button class="small right" data-pchange>Faire de la monnaie</button></div>
        <div class="muted small" style="margin-top:4px">Le marchand valide chaque achat (vous pouvez négocier) et rend la monnaie si besoin.</div></div>
      ${D.items.length ? `<div class="shop-grid">${D.items.map(it => `<button class="shop-it ${it.price != null && it.price > gold ? 'dear' : ''}" data-pbuy="${esc(it.uid)}">
          <span class="sh-pic" style="${it.img ? `background-image:url('${esc(it.img)}')` : ''}">${it.img ? '' : '<i class="ico i-bag"></i>'}</span>
          <b class="sh-n">${esc(it.name)}</b><span class="sh-p">${it.price != null ? fmtPrice(it.price) : 'prix à discuter'}</span>
          ${it.qty != null ? `<span class="muted small">${it.qty === 1 ? 'dernier exemplaire' : it.qty + ' en stock'}</span>` : ''}</button>`).join('')}</div>`
        : `<div class="empty">Les étagères sont vides…</div>`}
      ${(D.requests || []).length ? `<div class="card"><h4><i class="ico i-handshake"></i> Mes demandes</h4>${D.requests.slice(0, 12).map(r => `<div class="sh-myreq small">${shopStatusChip(r)}
          <span>${r.kind === 'buy' ? 'Achat' : 'Vente'} : <b>${esc(r.item?.name)}</b>${r.qty > 1 ? ' ×' + r.qty : ''} · ${fmtPrice(r.offer ?? r.listed)}${r.note ? ` <i class="muted">« ${esc(r.note)} »</i>` : ''}</span>
          ${r.status === 'pending' ? `<button class="small right" data-pcancel="${esc(r.id)}">Annuler</button>` : ''}</div>`).join('')}</div>` : ''}
      ${inv.length ? `<details class="card" ${P.shopSell ? 'open' : ''} id="p-sellbox"><summary><b><i class="ico i-scales"></i> Vendre un objet au marchand</b> <span class="muted small">(il rachète à ${D.sellRate ?? 50} % de la valeur)</span></summary>
          <div class="inv-list" style="margin-top:6px">${inv.map(v => `<div class="inv-row">${itemThumb(v, 36)}<div class="grow"><b>${esc(v.name)}</b>${v.qty > 1 ? ` <span class="muted">×${v.qty}</span>` : ''}${v.equipped ? ` <span class="tag">équipé</span>` : ''}
            <div class="muted small">${resale[v.uid] != null ? 'Offre du marchand : ' + fmtPrice(resale[v.uid]) + (v.qty > 1 ? ' pièce' : '') : 'prix à négocier'}</div></div>
            <button class="small" data-psell="${esc(v.uid)}">Proposer</button></div>`).join('')}</div></details>` : ''}`;
  },
  party() {
    const pcs = Object.values(S.chars).sort((a, b) => a.name.localeCompare(b.name));
    return `<div class="col">${pcs.map(c => { const p = c.hpMax ? clamp(c.hp / c.hpMax, 0, 1) : 0; return `<div class="card mate ${c.id === me ? 'is-me' : ''}">${avatar(c)}
      <div class="grow"><div class="row"><b>${esc(c.name)}</b><span class="muted small">${classLine(c)} ${c.niveau}</span><span class="right small"><i class="ico i-shield"></i> ${c.ca}</span></div>
      <div class="bar"><i class="${p < .25 ? 'low' : p < .5 ? 'mid' : ''}" style="width:${p * 100}%"></i></div>
      <div class="row small"><span>${c.hp}/${c.hpMax} ${t('HP')}${c.hpTemp ? ' +' + c.hpTemp : ''}</span>${(c.conditions || []).map(x => condChip(x)).join('')}</div></div></div>`; }).join('')}</div>
      ${C().active ? `<div class="card"><h4><i class="ico i-combat"></i> ${t('Visible opponents')}</h4>${C().list.filter(x => x.kind !== 'pc').map(x => `<div class="row small"><b>${esc(x.name)}</b><span class="muted">${HP_STATES[x.hp] ?? ''}</span>${(x.conditions || []).map(k => condChip(k)).join('')}</div>`).join('') || `<span class="muted small">${t('None.')}</span>`}</div>` : ''}`;
  },
};

function drawPanel() {
  $('#ptabs [data-pt="cards"]')?.classList.toggle('hidden', !S.camp.deck);
  $('#ptabs [data-pt="shop"]')?.classList.toggle('hidden', !S.camp.shop);
  if (!TABS_P[P.tab] || (P.tab === 'cards' && !S.camp.deck) || (P.tab === 'shop' && !S.camp.shop)) P.tab = 'sheet';
  $$('#ptabs button').forEach(b => b.classList.toggle('active', b.dataset.pt === P.tab));
  document.body.classList.toggle('panel-off', !P.panel);
  drawHead();
  const c = myChar(), el = $('#pbody');
  if (!c && P.tab !== 'party' && P.tab !== 'journal') { el.innerHTML = `<div class="empty">${t('Pick a character to see their sheet.')}</div>`; return; }
  if (document.activeElement?.id === 'p-notes') return;   // do not overwrite what is being typed
  const keep = el.scrollTop;
  el.innerHTML = TABS_P[P.tab](c);
  el.scrollTop = keep;
  bindPanel(c);
}
function bindPanel(c) {
  const el = $('#pbody');
  $$('[data-adv]', el).forEach(b => b.onclick = () => { P.adv = +b.dataset.adv; $$('[data-adv]').forEach(x => x.classList.toggle('on', x === b)); });
  $$('[data-chk]', el).forEach(b => b.onclick = () => act('check', { key: b.dataset.chk, secret: P.tab === 'dice' && P.secret }, bonusFor(c, b.dataset.chk)[0]));
  $('#p-target', el) && ($('#p-target', el).onchange = e => P.target = e.target.value);
  $$('[data-atk]', el).forEach(b => b.onclick = () => { const a = c.attacks[+b.dataset.atk]; act('attack', { idx: +b.dataset.atk, target: $('#p-target')?.value || '' }, a.name); });
  $$('[data-offh]', el).forEach(b => b.onclick = () => { const a = c.attacks[+b.dataset.offh]; act('attack', { idx: +b.dataset.offh, offhand: true, target: $('#p-target')?.value || '' }, `${a.name} (${t('off-hand')})`); });
  $$('[data-feat]', el).forEach(b => b.onclick = () => act('feature', { name: b.dataset.fname, kind: b.dataset.feat }, b.dataset.fname));
  $$('[data-pinv]', el).forEach(b => b.onclick = () => modal(itemCardHTML(invView(c.inventory[+b.dataset.pinv])) + `<div class="actions"><button data-close>${t('Close')}</button></div>`));
  $$('[data-peq]', el).forEach(b => b.onclick = () => act('inv_equip', { uid: b.dataset.peq }));
  $$('[data-patt]', el).forEach(b => b.onclick = () => act('inv_attune', { uid: b.dataset.patt }));
  $$('[data-pch]', el).forEach(b => b.onclick = () => act('inv_charge', { uid: b.dataset.pch, n: 1 }));
  $$('[data-res]', el).forEach(b => b.onclick = () => { const [i, d] = b.dataset.res.split(':').map(Number); act('resource', { idx: i, delta: d }); });
  $('[data-hitdie]', el) && ($('[data-hitdie]', el).onclick = () => act('hitdie', {}, t('Hit die')));
  const list = P.tab === 'spells' ? charSpells(c) : [];
  $$('[data-pinfo]', el).forEach(b => b.onclick = () => { const it = list[+b.dataset.pinfo]; modal(spellCardHTML(it.key, it.sp, c) + `<div class="actions"><button data-close>${t('Close')}</button></div>`); });
  $$('[data-pcast]', el).forEach(b => b.onclick = () => {
    const it = list[+b.dataset.pcast];
    castModal(c, it, C().active ? targetsList() : [], o => act('spell', { spell: it.name, lvl: it.lvl, slot: o.slot, targets: o.targets, adv: o.adv, ritual: o.ritual }, it.label), { inCombat: C().active });
  });
  $$('[data-die]', el).forEach(b => b.onclick = () => act('roll', { expr: '1d' + b.dataset.die, label: 'd' + b.dataset.die, secret: P.secret }, 'd' + b.dataset.die));
  $('#p-expr', el) && ($('#p-expr', el).onsubmit = e => { e.preventDefault(); const f = new FormData(e.target), x = String(f.get('e')).trim(); if (x) act('roll', { expr: x, label: f.get('l') || x, secret: P.secret }, f.get('l') || x); });
  $('#p-secret', el) && ($('#p-secret', el).onchange = e => P.secret = e.target.checked);
  $('#ho-again', el) && ($('#ho-again', el).onclick = () => showHandout(S.camp.handout));
  $('#dk-declare', el) && ($('#dk-declare', el).onclick = () => {
    const n = +$('#dk-n', el).value;
    modal(`<h3><i class="ico i-joker"></i> Tirer ${n} carte${n > 1 ? 's' : ''} ?</h3><p>Une fois le tirage annoncé, vous devrez tirer ${n > 1 ? 'toutes ces cartes' : 'cette carte'}. Le Jeu peut donner une fortune… ou tout reprendre.</p>
      <div class="actions"><button data-close>Je renonce</button><button class="danger" id="dk-ok">J'annonce ${n} carte${n > 1 ? 's' : ''}</button></div>`,
    (box, close) => { $('#dk-ok', box).onclick = () => { close(); act('deck_declare', { n }); }; });
  });
  $('#dk-draw', el) && ($('#dk-draw', el).onclick = async () => {
    const r = await act('deck_draw', {});
    const card = r?.result?.card; if (!card) return;
    const entry = (S.camp.deck?.draws || []).find(x => x.id === r.result.draw);
    $('#result').classList.add('hidden');
    const fx = r.result.fx || {};
    modal(`${r.result.ended ? `<div class="dk-ended">Cette carte met fin à votre tirage : vous ne tirez plus de cartes (règle officielle).</div>` : ''}
      ${deckFxHTML(card, fx, { canApply: fx.status === 'choice' })}
      ${deckCardHTML(card, { draw: entry })}<div id="dk-mopts">${deckOptions(card, entry)}</div>
      ${r.result.remaining ? `<div class="muted small" style="margin-top:8px">Il vous reste ${r.result.remaining} carte(s) à tirer.</div>` : ''}
      <div class="actions"><button class="primary" data-close>Fermer</button></div>`, (box, close) => {
      $$('[data-dkopt]', box).forEach(b => b.onclick = () => { close(); act('deck_option', { kind: b.dataset.dkopt, draw: b.dataset.draw }); });
      $('[data-dkapply]', box) && ($('[data-dkapply]', box).onclick = () => {
        const choices = deckReadChoices(box, card); if (!choices) return;
        close(); act('deck_fx', { draw: r.result.draw, choices });
      });
    });
  });
  $$('[data-dkopt]', el).forEach(b => b.onclick = () => act('deck_option', { kind: b.dataset.dkopt, draw: b.dataset.draw }));
  $('[data-dkapply]', el) && ($('[data-dkapply]', el).onclick = () => {
    const last = (S.camp.deck?.draws || [])[0], choices = last && deckReadChoices(el, last.card);
    if (choices) act('deck_fx', { draw: last.id, choices });
  });
  $$('[data-dkcard]', el).forEach(b => b.onclick = () => {
    const D = S.camp.deck, id = b.dataset.dkcard;
    const c = (D.pool || []).find(x => x.id === id) || (D.draws || []).map(x => x.card).find(x => x.id === id);
    c && modal(deckCardHTML(c) + `<div class="actions"><button class="primary" data-close>Fermer</button></div>`);
  });
  // magasin
  const D = S.camp.shop;
  $$('[data-pbuy]', el).forEach(b => b.onclick = () => { const it = D.items.find(x => x.uid === b.dataset.pbuy); it && shopAskModal(c, 'buy', it); });
  $$('[data-psell]', el).forEach(b => b.onclick = () => {
    const e = (c.inventory || []).find(x => x.uid === b.dataset.psell); if (!e) return;
    const v = invView(e), price = (D.sell || []).find(x => x.uid === e.uid)?.price;
    shopAskModal(c, 'sell', { uid: e.uid, name: v.name, img: v.img, price: price ?? null, qty: +e.qty || 1, equipped: e.equipped });
  });
  $$('[data-pcancel]', el).forEach(b => b.onclick = () => act('shop_cancel', { id: b.dataset.pcancel }));
  $$('[data-pchange]', el).forEach(b => b.onclick = () => changeModal(purseOf(c), (from, to, n) => act('money_change', { from, to, n })));
  $('#p-sellbox', el) && ($('#p-sellbox', el).ontoggle = e => P.shopSell = e.target.open);
  $('#p-lvl', el) && ($('#p-lvl', el).onclick = () => levelUpWizard(c, { player: true, onApply: (nc, info) => act('levelup', { data: nc, summary: info.summary, announce: info.announce }, t('Level-up')) }));
  $('#p-notes', el) && ($('#p-notes', el).oninput = e => {
    $('#notes-st').textContent = '● …'; clearTimeout(P.notesTimer);
    P.notesTimer = setTimeout(async () => { const r = await act('notes', { text: e.target.value }); $('#notes-st').innerHTML = r ? '✔ ' + t('saved') : '<i class="ico i-alert"></i>'; }, 900);
  });
}
/* purchase (kind 'buy', item of the shop) or resale (kind 'sell', item of the inventory) request */
function shopAskModal(c, kind, it) {
  const buy = kind === 'buy', gold = purseCp(purseOf(c)) / 100, maxQ = buy ? (it.qty ?? 99) : it.qty;
  modal(`<div class="sh-ask"><span class="sh-pic big" style="${it.img ? `background-image:url('${esc(it.img)}')` : ''}">${it.img ? '' : '<i class="ico i-bag"></i>'}</span>
      <div class="grow"><h3 style="margin:0 0 4px">${esc(it.name)}</h3>
        <div>${buy ? 'Prix' : 'Le marchand en offre'} : <b>${it.price != null ? fmtPrice(it.price) : 'à négocier'}</b>${maxQ > 1 ? ' <span class="muted small">(pièce)</span>' : ''}</div>
        ${buy ? `<div class="muted small">Votre bourse : ${purseFmt(purseOf(c))}</div>` : it.equipped ? `<div class="small warn">Cet objet est équipé : il sera retiré si la vente est acceptée.</div>` : ''}</div></div>
    ${maxQ > 1 ? `<label class="field"><span>Quantité</span><input id="pa-q" type="number" min="1" max="${maxQ}" value="1"></label>` : ''}
    <div id="pa-tot" class="small"></div>
    <label class="field"><span>${buy ? 'Proposer un autre prix' : 'Demander un autre prix'} <span class="muted small">(total, facultatif : pour négocier)</span></span><input id="pa-offer" type="number" min="0" step="any" placeholder="${buy ? 'votre offre' : 'votre prix'}, en po"></label>
    <label class="field"><span>Un mot pour le marchand <span class="muted small">(facultatif)</span></span><input id="pa-msg" maxlength="300" placeholder="${buy ? 'Allez, un petit geste pour un habitué ?' : 'Une pièce rare, vous ne la trouverez nulle part ailleurs !'}"></label>
    <div class="muted small">Le marchand (le MJ) accepte, refuse, ou fixe un autre prix. ${buy ? "L'or n'est retiré qu'une fois l'achat accepté." : "L'or n'est versé qu'une fois la vente acceptée."}</div>
    <div class="actions"><button data-close>Annuler</button><button class="primary" id="pa-ok">${buy ? 'Demander à acheter' : 'Proposer la vente'}</button></div>`, (box, close) => {
    const qty = () => clamp(Math.round(num($('#pa-q', box)?.value, 1)), 1, maxQ || 1);
    const upd = () => {
      const q = qty(), tot = it.price != null ? Math.round(it.price * q * 100) / 100 : null, offer = $('#pa-offer', box).value.trim();
      const pay = offer !== '' ? num(offer) : tot;
      $('#pa-tot', box).innerHTML = (tot != null ? `Total : <b>${fmtPrice(tot)}</b>` : '') + (buy && pay != null && pay > gold ? ` <span class="warn">— vous n'avez pas assez d'or, mais vous pouvez toujours proposer.</span>` : '');
    };
    $('#pa-q', box) && ($('#pa-q', box).oninput = upd);
    $('#pa-offer', box).oninput = upd;
    upd();
    $('#pa-ok', box).onclick = async () => {
      const offer = $('#pa-offer', box).value.trim(), payload = { uid: it.uid, qty: qty(), offer: offer === '' ? null : num(offer), msg: $('#pa-msg', box).value };
      close();   // empties the box: values are read before
      const r = await act(buy ? 'shop_buy' : 'shop_sell', payload);
      if (r) { $('#result').classList.add('hidden'); toast('<i class="ico i-handshake"></i> Demande envoyée au marchand. Réponse dans « Mes demandes ».', 3500); }
    };
  });
}
/* toasts when a shop opens and when the merchant answers */
function shopNotify() {
  const D = S.camp.shop, id = D?.id || null;
  if (P.shopId !== undefined && id && id !== P.shopId) toast(`<i class="ico i-purse"></i> <b>${esc(D.name)}</b> est ouvert ! (onglet Magasin)`, 4500);
  P.shopId = id;
  const seen = P.shopReq ||= {};
  for (const r of D?.requests || []) {
    if (seen[r.id] === 'pending' && r.status === 'accepted') toast(`<i class="ico i-handshake"></i> ${r.kind === 'buy' ? 'Achat' : 'Vente'} accepté : <b>${esc(r.item?.name)}</b> pour ${fmtPrice(r.final)}${r.note ? ` — « ${esc(r.note)} »` : ''}`, 6000);
    if (seen[r.id] === 'pending' && r.status === 'refused') toast(`<i class="ico i-forbidden"></i> Le marchand refuse : <b>${esc(r.item?.name)}</b>${r.note ? ` — « ${esc(r.note)} »` : ''}`, 6000);
    seen[r.id] = r.status;
  }
}
$$('#ptabs button').forEach(b => b.onclick = () => {
  if (P.tab === b.dataset.pt && window.innerWidth < 800) { P.panel = !P.panel; } else { P.tab = b.dataset.pt; P.panel = true; }
  store.set('gt-ptab', P.tab); store.set('gt-panel', P.panel ? '1' : '0');
  drawPanel();
});

/* ---------------------------------------------------------------- map, initiative, roll feed */
function drawIni() {
  const c = C(), el = $('#ini'), rd = $('#round'), tb = $('#turn');
  if (!c.active) { el.innerHTML = ''; rd.classList.add('hidden'); tb.classList.add('hidden'); P.lastTurn = null; return; }
  rd.classList.remove('hidden'); rd.innerHTML = '<i class="ico i-combat"></i> ' + t('Round {n}', { n: c.round });
  el.innerHTML = c.list.map((cb, i) => {
    const pc = cb.kind === 'pc', e = pc ? S.chars[cb.charId] : cb; if (!e) return '';
    const p = pc && e.hpMax ? clamp(e.hp / e.hpMax, 0, 1) : (cb.hp ?? 4) / 4;
    return `<div class="ip ${i === c.turn ? 'cur' : ''} ${pc && cb.charId === me ? 'me' : ''} ${!pc && cb.dead ? 'dead' : ''} ${cb.kind}">${avatar(pc ? e : { name: cb.name, portrait: cb.portrait, color: '#7a2a2a' })}
      <b>${esc(pc ? e.name : cb.name)}</b><div class="bar"><i class="${p < .25 ? 'low' : p < .5 ? 'mid' : ''}" style="width:${p * 100}%"></i></div></div>`;
  }).join('');
  const cur = c.list[c.turn], mine = myTurn();
  tb.classList.toggle('hidden', !mine);
  const key = cur ? cur.uid + ':' + c.round : null;
  if (mine && P.lastTurn !== key) { navigator.vibrate?.(250); beep(); toast(`<i class="ico i-combat"></i> <b>${t("It's your turn!")}</b>`, 3000); if (P.tab !== 'spells') { P.tab = 'actions'; } }
  P.lastTurn = key;
  $('.ip.cur')?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
}
function beep() {
  try { const a = new (window.AudioContext || window.webkitAudioContext)(), o = a.createOscillator(), g = a.createGain(); o.frequency.value = 660; g.gain.value = .08; o.connect(g); g.connect(a.destination); o.start(); o.frequency.setValueAtTime(880, a.currentTime + .12); o.stop(a.currentTime + .28); } catch (e) { }
}
function drawFeed() {
  $('#feed').innerHTML = deEmoji(S.camp.log.slice(0, 4).map(e => e.kind === 'info' ? `<div class="le info">${e.text}</div>`
    : `<div class="le ${e.crit ? 'crit' : e.fumble ? 'fumble' : ''}"><span class="t">${e.total}</span><b>${esc(e.who || '')}</b> ${esc(e.label || e.expr)}</div>`).join(''));
}
function showHandout(h) {
  if (!h) return;
  modal(`<div class="handout">${h.title ? `<h2>${esc(h.title)}</h2>` : ''}${h.img ? `<img src="${esc(h.img)}" alt="">` : ''}${h.body ? `<div class="md-view">${md(h.body)}</div>` : ''}</div>
    <div class="actions"><button class="primary" data-close>${t('Close')}</button></div>`);
}
function draw() {
  worldSync(S.camp, { first: !P.worldReady }); P.worldReady = true;   // journey, unroll and combat cue sent by the GM
  const m = playerMap();
  if (m?.id !== P.lastMap) { P.lastMap = m?.id; PV.setMap(m, { fit: true }); }
  else if (m) { if (PV.img.getAttribute('src') !== m.url) PV.setMap(m, { fit: true }); else { PV.map = m; PV.drawAll(); } }
  const f = S.camp.playerFocus;
  if (m && f && f.map === m.id && f.t !== P.lastFocus) { P.lastFocus = f.t; PV.centerOn(f.x, f.y, f.span ? $('#pv').getBoundingClientRect().width / f.span : f.z); }
  const h = S.camp.handout;
  if (h && h.t !== P.lastHandout) {
    const seen = +(store.get('gt-handout') ?? store.get('mj-handout', 0)) || 0;
    if (P.lastHandout && h.t > seen || (!P.lastHandout && h.t > seen && Date.now() - h.t < 3600e3)) { showHandout(h); store.set('gt-handout', h.t); }
    P.lastHandout = h.t;
  }
  drawIni(); drawFeed(); drawPanel(); shopNotify();
}
async function refresh(force) {
  if (P.dragging) return;
  try {
    const r = await api('GET', '/api/rev' + (me ? '?char=' + encodeURIComponent(me) : ''));
    PV.showPings(r.pings);
    if (!force && r.rev === S.rev && r.camp === P.campId) return;
    await loadPlayer();
  } catch (e) { return; }
  if (!P.dragging && $('#modal').classList.contains('hidden')) draw();
  else if (!P.dragging) { drawIni(); drawFeed(); }
}

/* moving one's own token */
const vp = $('#pv');
vp.addEventListener('pointerdown', e => {
  const tokEl = e.target.closest('.token.mine'), m = playerMap(); if (!tokEl || !m || e.button !== 0) return;
  const tk = m.tokens.find(x => x.id === tokEl.dataset.tok); if (!tk) return;
  e.preventDefault(); e.stopPropagation(); capture(vp, e); P.dragging = true;
  const g = m.grid, w0 = PV.toWorld(e.clientX, e.clientY), c0 = PV.toCell(w0.x, w0.y), sx = tk.x, sy = tk.y, lbl = $('#lbl');
  const mv = ev => {
    const w = PV.toWorld(ev.clientX, ev.clientY), c = PV.toCell(w.x, w.y);
    tk.x = sx + c.cx - c0.cx; tk.y = sy + c.cy - c0.cy;
    tokEl.style.left = (g.ox + tk.x * g.size) + 'px'; tokEl.style.top = (g.oy + tk.y * g.size) + 'px';
    const d = gridDist({ cx: sx, cy: sy }, { cx: tk.x, cy: tk.y }, g.meters);
    lbl.className = 'move-lbl'; lbl.style.position = 'fixed'; lbl.style.left = (ev.clientX + 16) + 'px'; lbl.style.top = (ev.clientY - 30) + 'px';
    lbl.innerHTML = `${fmtDist(d.m)} <span class="muted">(${t(d.cells === 1 ? '{n} square' : '{n} squares', { n: d.cells })})</span>`;
  };
  const up = async () => {
    vp.removeEventListener('pointermove', mv); vp.removeEventListener('pointerup', up); vp.removeEventListener('pointercancel', up);
    lbl.className = 'hidden';
    const st = (tk.size || 1) < 1 ? 0.5 : 1; tk.x = Math.round(tk.x / st) * st; tk.y = Math.round(tk.y / st) * st;
    PV.drawTokens();
    try { await api('POST', '/api/move', { char: me, token: tk.id, x: tk.x, y: tk.y }); }
    catch (err) { toast('<i class="ico i-forbidden"></i> ' + esc(err.message || t('Move refused'))); }
    P.dragging = false; refresh(true);
  };
  vp.addEventListener('pointermove', mv); vp.addEventListener('pointerup', up); vp.addEventListener('pointercancel', up);
});
/* ping: long press (or double click) on the map */
let pressT = null;
const sendPing = (x, y) => { const m = playerMap(); if (!m) return; const w = PV.toWorld(x, y); api('POST', '/api/ping', { char: me, who: myChar()?.name || t('Spectator'), map: m.id, x: w.x, y: w.y, color: myChar()?.color || '#4fd1ff' }).then(() => refresh()).catch(() => { }); };
vp.addEventListener('pointerdown', e => { if (e.target.closest('.token.mine')) return; const x = e.clientX, y = e.clientY; clearTimeout(pressT); pressT = setTimeout(() => { navigator.vibrate?.(40); sendPing(x, y); }, 650); });
['pointerup', 'pointercancel', 'pointerleave'].forEach(k => vp.addEventListener(k, () => clearTimeout(pressT)));
vp.addEventListener('pointermove', e => { if (pressT && (Math.abs(e.movementX) + Math.abs(e.movementY) > 3)) clearTimeout(pressT); });
vp.addEventListener('dblclick', e => { if (!e.target.closest('.token')) sendPing(e.clientX, e.clientY); });
/* two-finger zoom */
const touches = new Map(); let pinch = null;
vp.addEventListener('pointerdown', e => { if (e.pointerType === 'touch') touches.set(e.pointerId, e); });
vp.addEventListener('pointermove', e => {
  if (!touches.has(e.pointerId)) return; touches.set(e.pointerId, e);
  if (touches.size !== 2 || P.dragging) { pinch = null; return; }
  clearTimeout(pressT);
  const [a, b] = [...touches.values()], d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  const r = vp.getBoundingClientRect(), mx = (a.clientX + b.clientX) / 2 - r.left, my = (a.clientY + b.clientY) / 2 - r.top;
  if (pinch) PV.zoomAt(mx, my, d / pinch);
  pinch = d;
});
const endTouch = e => { touches.delete(e.pointerId); if (touches.size < 2) pinch = null; };
vp.addEventListener('pointerup', endTouch); vp.addEventListener('pointercancel', endTouch);

$('#h-me').onclick = centerMe;
$('#h-theme').onclick = themeModal;
$('#h-in').onclick = () => PV.zoom(1.25); $('#h-out').onclick = () => PV.zoom(0.8); $('#h-fit').onclick = () => PV.fit();
$('#h-full').onclick = () => document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.();
$('#h-panel').onclick = () => { P.panel = !P.panel; store.set('gt-panel', P.panel ? '1' : '0'); drawPanel(); setTimeout(() => PV.drawAll(), 50); };
// the GM unrolls the world map: the sheet folds away (☰ brings it back) and the map takes the whole screen
window.addEventListener('world-unroll', () => { if (P.panel) { P.panel = false; drawPanel(); } PV.fit(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') $('#modal').classList.add('hidden'); });
document.addEventListener('click', e => {   // clickable dice formulas in the sheet
  const d = e.target.closest('[data-roll]'); if (!d) return; e.preventDefault(); e.stopImmediatePropagation();
  act('roll', { expr: d.dataset.roll, label: d.dataset.label || d.dataset.roll }, d.dataset.roll);
}, true);

(async () => {
  try { await Promise.all([loadPlayer(), loadSpells(), loadItems(), api('GET', '/api/items').then(d => S.items = d).catch(() => S.items = {})]); }
  catch (e) { document.body.insertAdjacentHTML('beforeend', `<div id="msg" class="card">${t('Cannot reach the GM table.')}</div>`); return; }
  draw(); if (me) setTimeout(centerMe, 300);
  setInterval(refresh, 1000);
})();
