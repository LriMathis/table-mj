/* ===== Vue joueurs : carte, fiche, actions, sorts, dés, journal ===== */
'use strict';

const P = { tab: 'fiche', adv: 0, secret: false, campId: null, lastHandout: 0, lastMap: null, lastFocus: 0, lastTurn: null, dragging: false, notesTimer: null, panel: true };
let me = null;
try { P.tab = localStorage.getItem('mj-ptab') || 'fiche'; P.panel = localStorage.getItem('mj-panel') !== '0'; } catch (e) { }
const meKey = () => 'mj-joueur:' + (P.campId || '');
const myChar = () => (me && S.chars[me]) || null;

const PV = new MapView($('#pv'), {
  player: true, emptyText: 'En attente du Maître du Jeu…',
  panOnLeft: e => !e.target.closest('.token.mine'),
  mine: o => !!me && o.charId === me,
});

async function loadPlayer() {
  const d = await api('GET', '/api/player-state' + (me ? '?char=' + encodeURIComponent(me) : ''));
  S.chars = d.characters || {}; S.mons = d.monsters || {}; S.camp = campDefaults(d.campaign || {}); S.rev = d.rev;
  if (P.campId !== d.campagne?.id) {
    P.campId = d.campagne?.id;
    try { me = localStorage.getItem(meKey()); } catch (e) { me = null; }
    if (me === null) { try { me = localStorage.getItem('mj-joueur'); } catch (e) { } }   // ancienne version
    const q = new URLSearchParams(location.search);   // lien direct : /joueurs?perso=vex&onglet=sorts
    if (q.get('perso') && S.chars[q.get('perso')]) { me = q.get('perso'); try { localStorage.setItem(meKey(), me); } catch (e) { } }
    if (q.get('onglet') && TABS_P[q.get('onglet')]) P.tab = q.get('onglet');
    if (me && !S.chars[me]) me = null;
    if (me === null || me === undefined) setTimeout(showPicker, 50);
  }
  $('#camp-title').textContent = d.campagne?.name || '';
  document.title = (myChar()?.name ? myChar().name + ' — ' : '') + (d.campagne?.name || 'Table');
}
const playerMap = () => S.camp.maps[0] || null;
const myToken = () => playerMap()?.tokens.find(t => me && tokenInfo(t).charId === me);
const C = () => S.camp.combat;
const myTurn = () => { const c = C(), cur = c.active && c.list[c.turn]; return !!(cur && cur.kind === 'pc' && cur.charId === me); };
const canAct = () => { const m = S.camp.settings?.playerActions || 'turn'; return m === 'always' || (m === 'turn' && (!C().active || myTurn())); };

function avatar(c, cls = '') {
  return c.portrait ? `<div class="avatar ${cls}" style="background-image:url('${esc(c.portrait)}')"></div>` : `<div class="avatar ${cls}" style="background-color:${c.color || colorFor(c.name)}">${esc(initials(c.name))}</div>`;
}

/* ---------------------------------------------------------------- choix du personnage */
function showPicker() {
  const pcs = Object.values(S.chars).sort((a, b) => a.name.localeCompare(b.name));
  const el = $('#pick'); el.classList.remove('hidden');
  el.innerHTML = `<div class="pick-in"><h1><i class="ico i-lanterne"></i> ${esc($('#camp-title').textContent || 'La table')}</h1><p class="muted">Qui êtes-vous ? Choisissez votre personnage pour accéder à votre fiche, vos sorts et votre pion.</p>
    <div class="picks">${pcs.map(c => `<button class="pk" data-pk="${c.id}">${avatar(c)}<b>${esc(c.name)}</b><span class="muted small">${esc(c.race || '')} · ${esc(String(c.classe || '').split(/[—–]/)[0])} ${c.niveau || ''}</span></button>`).join('')}
    <button class="pk" data-pk=""><div class="avatar" style="background:#333"><i class="ico i-oeil"></i></div><b>Spectateur</b><span class="muted small">écran de table, sans personnage</span></button></div></div>`;
  $$('[data-pk]', el).forEach(d => d.onclick = () => {
    me = d.dataset.pk || null; try { localStorage.setItem(meKey(), me || ''); } catch (e) { }
    el.classList.add('hidden'); refresh(true).then(() => { if (me) setTimeout(centerMe, 150); });
  });
}
function centerMe() {
  const t = myToken(), m = playerMap(); if (!t || !m) return toast('Votre pion n\'est pas sur cette carte. Demandez au MJ de vous placer.');
  const g = m.grid, s = (t.size || 1) / 2;
  PV.centerOn(g.ox + (t.x + s) * g.size, g.oy + (t.y + s) * g.size, Math.max(PV.view.z, 0.6));
}

/* ---------------------------------------------------------------- actions vers le serveur */
async function act(type, payload = {}, title) {
  if (!me) return toast('Choisissez d\'abord votre personnage.');
  try {
    const r = await api('POST', '/api/action', { char: me, type, adv: P.adv, ...payload });
    P.adv = 0; $$('[data-adv]').forEach(b => b.classList.toggle('on', b.dataset.adv === '0'));
    if (r.rolls?.length || r.infos?.length) showResult(title, r);
    await refresh(true);
    return r;
  } catch (e) { toast('<i class="ico i-interdit"></i> ' + esc(e.message || 'Action refusée')); return null; }
}
function showResult(title, r) {
  const el = $('#result');
  const rays = r.result?.rays;
  el.innerHTML = `<div class="res-box">${title ? `<div class="res-title">${esc(title)}</div>` : ''}
    ${(r.rolls || []).slice().reverse().map(x => `<div class="res-line ${x.crit ? 'crit' : x.fumble ? 'fumble' : ''}"><span class="res-n">${x.total}</span><div><b>${esc(x.label)}</b><div class="muted small">${x.detail || ''}</div></div></div>`).join('')}
    ${rays?.length ? `<div class="small">${rays.map((y, i) => y.hit === null ? '' : `${rays.length > 1 ? (i + 1) + ' : ' : ''}${y.hit ? '<b class="hit">TOUCHÉ</b>' : '<b class="miss">raté</b>'}`).join(' · ')}</div>` : ''}
    ${r.result && r.result.hit !== undefined && r.result.hit !== null ? `<div class="res-verdict ${r.result.hit ? 'hit' : 'miss'}">${r.result.hit ? 'TOUCHÉ !' : 'Raté…'}</div>` : ''}
    ${!(r.rolls || []).length ? (r.infos || []).map(t => `<div>${esc(t)}</div>`).join('') : ''}
    <div class="muted small">Le MJ voit ce jet et applique les effets.</div></div>`;
  el.classList.remove('hidden'); el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
  clearTimeout(P.resT); P.resT = setTimeout(() => el.classList.add('hidden'), 5000);
  el.onclick = () => el.classList.add('hidden');
}

/* ---------------------------------------------------------------- panneau */
function advBar() {
  return `<div class="seg adv-seg">${[['-1', '▼ Désavantage'], ['0', 'Normal'], ['1', '▲ Avantage']].map(([v, l]) => `<button data-adv="${v}" class="${String(P.adv) === v ? 'on' : ''}">${l}</button>`).join('')}</div>`;
}
function turnNote() {
  const mode = S.camp.settings?.playerActions || 'turn';
  if (mode === 'off') return '<div class="note warn"><i class="ico i-verrou"></i> Le MJ lance lui-même les attaques et les sorts pour le moment. Les tests et les dés restent libres.</div>';
  if (!C().active) return '<div class="note"><i class="ico i-boussole"></i> Exploration : vous pouvez agir librement. Le MJ voit chacun de vos jets.</div>';
  if (myTurn()) return '<div class="note ok"><i class="ico i-combat"></i> C\'est votre tour ! Une action, une action bonus, votre déplacement… et éventuellement une réaction.</div>';
  return '<div class="note"><i class="ico i-sablier"></i> Ce n\'est pas votre tour : attaques et sorts attendront (sauf réactions comme <i>Bouclier</i>). Tests et sauvegardes restent possibles.</div>';
}
function targetsList() {
  return C().list.filter(cb => !(cb.kind === 'pc' && cb.charId === me) && !(cb.kind !== 'pc' && cb.dead)).map(cb => {
    const pc = cb.kind === 'pc', ch = pc ? S.chars[cb.charId] : null;
    return { uid: cb.uid, name: pc ? ch?.name || '?' : cb.name, foe: cb.kind === 'mon', hp: pc ? null : cb.hp };
  });
}
function drawHead() {
  const c = myChar(), el = $('#me-head');
  if (!c) { el.innerHTML = `<div class="row"><b>Spectateur</b><button class="small right" id="me-chg"><i class="ico i-persos"></i> Choisir un personnage</button></div>`; $('#me-chg').onclick = showPicker; return; }
  const ds = c.deathSaves || { s: 0, f: 0 }, p = c.hpMax ? clamp(c.hp / c.hpMax, 0, 1) : 0;
  el.innerHTML = `<div class="mh">${avatar(c, 'big')}<div class="grow">
      <div class="row"><b class="mh-name">${esc(c.name)}</b><button class="small right link" id="me-chg">changer</button></div>
      <div class="muted small">${esc(c.race || '')} · ${esc(c.classe || '')} · niv. ${c.niveau}</div>
      <div class="hpbig"><div class="bar"><i class="${p < .25 ? 'low' : p < .5 ? 'mid' : ''}" style="width:${p * 100}%"></i>${c.hpTemp ? `<b style="left:0;width:${clamp(c.hpTemp / c.hpMax, 0, 1) * 100}%"></b>` : ''}</div>
        <span><b>${c.hp}</b>/${c.hpMax} PV${c.hpTemp ? ` <span class="tmp">+${c.hpTemp}</span>` : ''}</span></div>
      <div class="mh-stats"><span title="Classe d'armure"><i class="ico i-bouclier"></i> ${c.ca}</span><span title="Initiative"><i class="ico i-eclair"></i> ${fmod(+c.initBonus || 0)}</span><span title="Vitesse"><i class="ico i-pas"></i> ${esc(c.vitesse || '')}</span><span title="Perception passive"><i class="ico i-oeil"></i> ${10 + skillBonus(c, 'Perception')}</span></div>
    </div></div>
    ${(c.conditions || []).length || c.concentration ? `<div class="row conds">${(c.conditions || []).map(x => `<span class="chip ${x.n === 'Concentration' ? 'conc' : 'cond'}" title="${esc(CONDITIONS[x.n] || '')}">${COND_ICONS[x.n] || ''} ${esc(x.n === 'Concentration' && c.concentration ? 'Concentration : ' + c.concentration : x.n)}${x.r ? ` (${x.r})` : ''}</span>`).join('')}
      ${c.concentration ? '<button class="small" id="conc-end">Arrêter la concentration</button>' : ''}</div>` : ''}
    ${c.hp <= 0 ? `<div class="death-box"><i class="ico i-mort"></i> Inconscient — jets contre la mort : <span class="pips">${[0, 1, 2].map(i => `<span class="pip s ${i < ds.s ? 'full' : ''}"></span>`).join('')}</span> / <span class="pips">${[0, 1, 2].map(i => `<span class="pip f ${i < ds.f ? 'full' : ''}"></span>`).join('')}</span>
      <button class="primary small" id="ds-roll"><i class="ico i-des"></i> Jet contre la mort</button></div>` : ''}`;
  $('#me-chg').onclick = showPicker;
  $('#conc-end') && ($('#conc-end').onclick = () => act('conc_end', {}));
  $('#ds-roll') && ($('#ds-roll').onclick = () => act('mort', {}, 'Jet contre la mort'));
}

const TABS_P = {
  fiche(c) {
    const xpA = XP_TABLE[c.niveau - 1] || 0, xpB = XP_TABLE[c.niveau] ?? xpA, xpP = xpB > xpA ? clamp((c.xp - xpA) / (xpB - xpA), 0, 1) : 1;
    const canLv = levelForXP(c.xp) > c.niveau && c.niveau < 20, lvOk = !!S.camp.settings?.playerLevelUp;
    return `${canLv ? `<button class="lvl-banner" id="p-lvl" ${lvOk ? '' : 'disabled'}><i class="ico i-fleche-haut"></i><span><b>Niveau ${c.niveau + 1} disponible !</b><small>${lvOk ? 'Choisissez vos PV, aptitudes, caractéristiques et sorts.' : 'Le MJ s\'occupe de la montée de niveau : prévenez-le.'}</small></span></button>` : ''}
    <div class="card"><div class="row small"><span><i class="ico i-xp"></i> ${c.xp} XP</span><span class="muted right">niveau ${c.niveau + 1} à ${xpB}</span></div><div class="bar xp"><i style="width:${xpP * 100}%"></i></div>
        <div class="row small" style="margin-top:6px"><span>Maîtrise ${fmod(+c.prof || 0)}</span><span>· Dés de vie ${c.hitDice || 0}/${c.niveau} (d${c.hitDie || 8})</span>${c.spellcasting ? `<span>· DD sorts ${c.spellcasting.dc}</span>` : ''}${c.exhaustion ? `<span class="warn">· Épuisement ${c.exhaustion}</span>` : ''}</div></div>
      <div class="pstats">${STATS.map(s => { const m = mod(c.stats?.[s]), p = (c.saves || []).includes(s); return `<div class="pstat">
        <button class="ab" data-chk="ab:${s}" title="Test de ${STAT_NAMES[s]}"><span>${s}</span><b>${fmod(m)}</b><small>${c.stats?.[s]}</small></button>
        <button class="sv ${p ? 'p' : ''}" data-chk="sv:${s}" title="Sauvegarde de ${STAT_NAMES[s]}">sauv. ${fmod(saveBonus(c, s))}</button></div>`; }).join('')}</div>
      <div class="card"><h4>Compétences <span class="muted small">(touchez pour lancer)</span></h4><div class="pskills">${SKILLS.map(([n, ab]) => {
        const has = c.skills && c.skills[n] != null; return `<button class="psk ${has ? 'p' : ''}" data-chk="sk:${n}"><span>${n} <small>${ab}</small></span><b>${fmod(skillBonus(c, n))}</b></button>`; }).join('')}</div></div>
      ${(c.features || []).length ? `<div class="card"><h4><i class="ico i-etincelle"></i> Capacités</h4>${c.features.map(f => `<details><summary><b>${esc(f.name)}</b></summary><div class="small ft">${linkDice(esc(f.text)).replace(/\n/g, '<br>')}</div></details>`).join('')}</div>` : ''}
      ${c.equipment || c.gold ? `<div class="card"><h4><i class="ico i-sac"></i> Équipement <span class="muted small">${c.gold ? '· ' + c.gold + ' po' : ''}</span></h4><div class="small" style="white-space:pre-wrap">${esc(c.equipment || '')}</div></div>` : ''}
      ${c.sheet ? `<details class="card"><summary><b><i class="ico i-parchemin"></i> Fiche complète</b></summary><div class="md-view small">${md(c.sheet)}</div></details>` : ''}`;
  },
  actions(c) {
    const tg = targetsList(), atks = c.attacks || [];
    return `${turnNote()}
      ${C().active ? `<div class="card"><h4><i class="ico i-cible"></i> Cible</h4><select id="p-target"><option value="">— aucune (le MJ choisira) —</option>${tg.map(t => `<option value="${t.uid}" ${t.uid === P.target ? 'selected' : ''}>${t.foe ? 'Adversaire —' : 'Allié —'} ${esc(t.name)}${t.hp != null ? ' — ' + HP_STATES[t.hp] : ''}</option>`).join('')}</select></div>` : ''}
      ${advBar()}
      <div class="card"><h4><i class="ico i-combat"></i> Attaques</h4><div class="col">${atks.map((a, i) => `<button class="atk-btn" data-atk="${i}" ${canAct() ? '' : 'disabled'}><span class="an">${esc(a.name)}</span><span class="ab">${fmod(+a.bonus || 0)}</span><span class="ad">${esc(a.damage || '')} ${esc(a.type || '')}</span></button>`).join('') || '<span class="muted small">Aucune attaque sur la fiche.</span>'}</div></div>
      ${(c.resources || []).length ? `<div class="card"><h4><i class="ico i-ressource"></i> Ressources</h4>${c.resources.map((r, i) => `<div class="res"><span class="rn">${esc(r.name)} <span class="muted small">${r.reset === 'aucun' ? '' : '(repos ' + r.reset + ')'}</span></span>
          ${r.max <= 8 ? `<span class="pips">${Array.from({ length: r.max }, (_, k) => `<span class="pip ${k < r.cur ? 'full' : ''}"></span>`).join('')}</span>` : ''}<b>${r.cur}/${r.max}</b>
          <button class="small" data-res="${i}:-1" ${r.cur > 0 ? '' : 'disabled'}>Utiliser</button>${r.reset === 'aucun' ? `<button class="small" data-res="${i}:1">+1</button>` : ''}</div>`).join('')}</div>` : ''}
      <div class="card"><h4><i class="ico i-des"></i> Jets rapides</h4><div class="row"><button data-chk="init"><i class="ico i-eclair"></i> Initiative ${fmod(+c.initBonus || 0)}</button>
        ${!C().active ? `<button data-dv ${c.hitDice > 0 && c.hp < c.hpMax ? '' : 'disabled'} title="Pendant un repos court"><i class="ico i-soin"></i> Dé de vie (${c.hitDice || 0})</button>` : ''}</div></div>`;
  },
  sorts(c) {
    const list = charSpells(c), sc = c.spellcasting;
    if (!list.length) return '<div class="empty">Votre personnage ne lance pas de sorts.</div>';
    let last = -1;
    return `${turnNote()}${advBar()}
      ${sc ? `<div class="card"><div class="row small"><span>DD des sorts <b>${sc.dc}</b></span><span>· Attaque <b>${fmod(+sc.attack || 0)}</b></span><span>· Caractéristique ${sc.ability}</span></div>
        <div class="slots">${Object.entries(sc.slots || {}).filter(([, s]) => s.max > 0).map(([l, s]) => `<div class="slot"><span>Niv. ${l}</span><span class="pips">${Array.from({ length: s.max }, (_, k) => `<span class="pip ${k < s.cur ? 'full' : ''}"></span>`).join('')}</span></div>`).join('')}</div>
        ${c.concentration ? `<div class="small" style="margin-top:6px"><i class="ico i-sorts"></i> Concentration : <b>${esc(c.concentration)}</b></div>` : ''}</div>` : ''}
      <div class="card">${list.map((it, i) => {
        const head = it.lvl !== last ? `<div class="sp-lvl">${it.lvl ? 'Niveau ' + it.lvl : 'Tours de magie'}</div>` : ''; last = it.lvl;
        const reaction = /réaction/.test(it.sp?.temps || '');
        const noSlot = it.lvl > 0 && !slotsAvail(c, it.lvl).some(s => s.cur > 0) && !it.sp?.rituel;
        return head + `<div class="psp"><button class="sp-cast" data-pcast="${i}" ${(canAct() || reaction) && !noSlot ? '' : 'disabled'}><i class="ico i-sorts"></i></button>
          <div class="grow" data-pinfo="${i}"><b>${esc(it.name)}</b>${it.sp?.conc ? ' <span class="tag conc">C</span>' : ''}${it.sp?.rituel ? ' <span class="tag">R</span>' : ''}${reaction ? ' <span class="tag">réaction</span>' : ''}
          <div class="muted small">${it.sp ? spellSummary(it.sp, c) || esc(it.sp.resume) : 'sort hors base — demandez au MJ'}</div></div><button class="small icon" data-pinfo="${i}"><i class="ico i-loupe"></i></button></div>`;
      }).join('')}</div>`;
  },
  des(c) {
    return `<div class="dice-grid">${[4, 6, 8, 10, 12, 20, 100].map(d => `<button class="die d${d}" data-die="${d}">d${d}</button>`).join('')}</div>
      ${advBar()}
      <form id="p-expr" class="row"><input name="e" placeholder="ex : 2d6+3, 4d6kh3" autocomplete="off"><input name="l" placeholder="pour… (optionnel)" style="width:40%"><button class="primary">Lancer</button></form>
      <label class="chk small"><input type="checkbox" id="p-secret" ${P.secret ? 'checked' : ''}> jet discret (visible seulement par le MJ et moi)</label>
      <div class="card"><h4>Tests fréquents en exploration</h4><div class="row">${['Perception', 'Investigation', 'Discrétion', 'Athlétisme', 'Survie', 'Perspicacité', 'Persuasion', 'Arcanes'].map(n => `<button class="small" data-chk="sk:${n}">${n} ${fmod(skillBonus(c, n))}</button>`).join('')}</div></div>
      <div class="card"><h4>Mes derniers jets</h4><div class="col">${S.camp.log.filter(e => e.char === me && e.kind === 'roll').slice(0, 8).map(e => logEntryHTML(e)).join('') || '<span class="muted small">Aucun.</span>'}</div></div>`;
  },
  journal(c) {
    const q = S.camp.quests || [], npcs = S.camp.npcs || [];
    return `${q.length ? `<div class="card"><h4><i class="ico i-cible"></i> Quêtes</h4>${q.map(x => `<div class="${x.done ? 'done' : ''}">${x.done ? '✔' : '◆'} ${esc(x.t)}</div>`).join('')}</div>` : ''}
      ${npcs.length ? `<div class="card"><h4><i class="ico i-groupe"></i> Personnages rencontrés</h4>${npcs.map(n => `<div><b>${esc(n.name)}</b> <span class="muted small">${esc(n.role || '')}</span>${n.pub ? `<div class="small">${esc(n.pub)}</div>` : ''}</div>`).join('')}</div>` : ''}
      ${S.camp.handout ? `<div class="card"><h4><i class="ico i-annonce"></i> Dernier message du MJ</h4><button class="small" id="ho-again">Revoir « ${esc(S.camp.handout.title || 'message')} »</button></div>` : ''}
      ${c ? `<div class="card"><h4><i class="ico i-plume"></i> Mes notes <span class="muted small" id="notes-st"></span></h4><textarea id="p-notes" rows="7" placeholder="Indices, noms, dettes, plans foireux de Kraz…">${esc(c.playerNotes || '')}</textarea></div>` : ''}
      <div class="card"><h4><i class="ico i-parchemin"></i> Ce qui s'est passé</h4><div class="col plog">${S.camp.log.slice(0, 40).map(e => logEntryHTML(e)).join('') || '<span class="muted small">Rien pour l\'instant.</span>'}</div></div>`;
  },
  groupe() {
    const pcs = Object.values(S.chars).sort((a, b) => a.name.localeCompare(b.name));
    return `<div class="col">${pcs.map(c => { const p = c.hpMax ? clamp(c.hp / c.hpMax, 0, 1) : 0; return `<div class="card mate ${c.id === me ? 'is-me' : ''}">${avatar(c)}
      <div class="grow"><div class="row"><b>${esc(c.name)}</b><span class="muted small">${esc(String(c.classe || '').split(/[—–]/)[0])} ${c.niveau}</span><span class="right small"><i class="ico i-bouclier"></i> ${c.ca}</span></div>
      <div class="bar"><i class="${p < .25 ? 'low' : p < .5 ? 'mid' : ''}" style="width:${p * 100}%"></i></div>
      <div class="row small"><span>${c.hp}/${c.hpMax} PV${c.hpTemp ? ' +' + c.hpTemp : ''}</span>${(c.conditions || []).map(x => `<span class="chip cond" title="${esc(CONDITIONS[x.n] || '')}">${COND_ICONS[x.n] || ''} ${esc(x.n)}</span>`).join('')}</div></div></div>`; }).join('')}</div>
      ${C().active ? `<div class="card"><h4><i class="ico i-combat"></i> Adversaires visibles</h4>${C().list.filter(x => x.kind !== 'pc').map(x => `<div class="row small"><b>${esc(x.name)}</b><span class="muted">${HP_STATES[x.hp] ?? ''}</span>${(x.conditions || []).map(k => `<span class="chip cond">${COND_ICONS[k.n] || ''} ${esc(k.n)}</span>`).join('')}</div>`).join('') || '<span class="muted small">Aucun.</span>'}</div>` : ''}`;
  },
};

function drawPanel() {
  $$('#ptabs button').forEach(b => b.classList.toggle('active', b.dataset.pt === P.tab));
  document.body.classList.toggle('panel-off', !P.panel);
  drawHead();
  const c = myChar(), el = $('#pbody');
  if (!c && P.tab !== 'groupe' && P.tab !== 'journal') { el.innerHTML = '<div class="empty">Choisissez un personnage pour voir sa fiche.</div>'; return; }
  if (document.activeElement?.id === 'p-notes') return;   // ne pas écraser la saisie en cours
  const keep = el.scrollTop;
  el.innerHTML = TABS_P[P.tab](c);
  el.scrollTop = keep;
  bindPanel(c);
}
function bindPanel(c) {
  const el = $('#pbody');
  $$('[data-adv]', el).forEach(b => b.onclick = () => { P.adv = +b.dataset.adv; $$('[data-adv]').forEach(x => x.classList.toggle('on', x === b)); });
  $$('[data-chk]', el).forEach(b => b.onclick = () => act('check', { key: b.dataset.chk, secret: P.tab === 'des' && P.secret }, bonusFor(c, b.dataset.chk)[0]));
  $('#p-target', el) && ($('#p-target', el).onchange = e => P.target = e.target.value);
  $$('[data-atk]', el).forEach(b => b.onclick = () => { const a = c.attacks[+b.dataset.atk]; act('attack', { idx: +b.dataset.atk, target: $('#p-target')?.value || '' }, a.name); });
  $$('[data-res]', el).forEach(b => b.onclick = () => { const [i, d] = b.dataset.res.split(':').map(Number); act('res', { idx: i, delta: d }); });
  $('[data-dv]', el) && ($('[data-dv]', el).onclick = () => act('dv', {}, 'Dé de vie'));
  const list = P.tab === 'sorts' ? charSpells(c) : [];
  $$('[data-pinfo]', el).forEach(b => b.onclick = () => { const it = list[+b.dataset.pinfo]; modal(spellCardHTML(it.key, it.sp, c) + '<div class="actions"><button data-close>Fermer</button></div>'); });
  $$('[data-pcast]', el).forEach(b => b.onclick = () => {
    const it = list[+b.dataset.pcast];
    castModal(c, it, C().active ? targetsList() : [], o => act('spell', { spell: it.name, lvl: it.lvl, slot: o.slot, targets: o.targets, adv: o.adv, ritual: o.ritual }, it.name), { inCombat: C().active });
  });
  $$('[data-die]', el).forEach(b => b.onclick = () => act('roll', { expr: '1d' + b.dataset.die, label: 'd' + b.dataset.die, secret: P.secret }, 'd' + b.dataset.die));
  $('#p-expr', el) && ($('#p-expr', el).onsubmit = e => { e.preventDefault(); const f = new FormData(e.target), x = String(f.get('e')).trim(); if (x) act('roll', { expr: x, label: f.get('l') || x, secret: P.secret }, f.get('l') || x); });
  $('#p-secret', el) && ($('#p-secret', el).onchange = e => P.secret = e.target.checked);
  $('#ho-again', el) && ($('#ho-again', el).onclick = () => showHandout(S.camp.handout));
  $('#p-lvl', el) && ($('#p-lvl', el).onclick = () => levelUpWizard(c, { player: true, onApply: (nc, info) => act('levelup', { data: nc, summary: info.summary, announce: info.announce }, 'Montée de niveau') }));
  $('#p-notes', el) && ($('#p-notes', el).oninput = e => {
    $('#notes-st').textContent = '● …'; clearTimeout(P.notesTimer);
    P.notesTimer = setTimeout(async () => { const r = await act('notes', { text: e.target.value }); $('#notes-st').innerHTML = r ? '✔ enregistré' : '<i class="ico i-alerte"></i>'; }, 900);
  });
}
$$('#ptabs button').forEach(b => b.onclick = () => {
  if (P.tab === b.dataset.pt && window.innerWidth < 800) { P.panel = !P.panel; } else { P.tab = b.dataset.pt; P.panel = true; }
  try { localStorage.setItem('mj-ptab', P.tab); localStorage.setItem('mj-panel', P.panel ? '1' : '0'); } catch (e) { }
  drawPanel();
});

/* ---------------------------------------------------------------- carte, initiative, fil des jets */
function drawIni() {
  const c = C(), el = $('#ini'), rd = $('#round'), tb = $('#turn');
  if (!c.active) { el.innerHTML = ''; rd.classList.add('hidden'); tb.classList.add('hidden'); P.lastTurn = null; return; }
  rd.classList.remove('hidden'); rd.innerHTML = '<i class="ico i-combat"></i> Round ' + c.round;
  el.innerHTML = c.list.map((cb, i) => {
    const pc = cb.kind === 'pc', e = pc ? S.chars[cb.charId] : cb; if (!e) return '';
    const p = pc && e.hpMax ? clamp(e.hp / e.hpMax, 0, 1) : (cb.hp ?? 4) / 4;
    return `<div class="ip ${i === c.turn ? 'cur' : ''} ${pc && cb.charId === me ? 'me' : ''} ${!pc && cb.dead ? 'dead' : ''} ${cb.kind}">${avatar(pc ? e : { name: cb.name, portrait: cb.portrait, color: '#7a2a2a' })}
      <b>${esc(pc ? e.name : cb.name)}</b><div class="bar"><i class="${p < .25 ? 'low' : p < .5 ? 'mid' : ''}" style="width:${p * 100}%"></i></div></div>`;
  }).join('');
  const cur = c.list[c.turn], mine = myTurn();
  tb.classList.toggle('hidden', !mine);
  const key = cur ? cur.uid + ':' + c.round : null;
  if (mine && P.lastTurn !== key) { navigator.vibrate?.(250); beep(); toast('<i class="ico i-combat"></i> <b>C\'est votre tour !</b>', 3000); if (P.tab !== 'sorts') { P.tab = 'actions'; } }
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
    <div class="actions"><button class="primary" data-close>Fermer</button></div>`);
}
function draw() {
  const m = playerMap();
  if (m?.id !== P.lastMap) { P.lastMap = m?.id; PV.setMap(m, { fit: true }); }
  else if (m) { if (PV.img.getAttribute('src') !== m.url) PV.setMap(m, { fit: true }); else { PV.map = m; PV.drawAll(); } }
  const f = S.camp.playerFocus;
  if (m && f && f.map === m.id && f.t !== P.lastFocus) { P.lastFocus = f.t; PV.centerOn(f.x, f.y, f.span ? $('#pv').getBoundingClientRect().width / f.span : f.z); }
  const h = S.camp.handout;
  if (h && h.t !== P.lastHandout) {
    let seen = 0; try { seen = +localStorage.getItem('mj-handout') || 0; } catch (e) { }
    if (P.lastHandout && h.t > seen || (!P.lastHandout && h.t > seen && Date.now() - h.t < 3600e3)) { showHandout(h); try { localStorage.setItem('mj-handout', h.t); } catch (e) { } }
    P.lastHandout = h.t;
  }
  drawIni(); drawFeed(); drawPanel();
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

/* déplacement de son pion */
const vp = $('#pv');
vp.addEventListener('pointerdown', e => {
  const tokEl = e.target.closest('.token.mine'), m = playerMap(); if (!tokEl || !m || e.button !== 0) return;
  const t = m.tokens.find(x => x.id === tokEl.dataset.tok); if (!t) return;
  e.preventDefault(); e.stopPropagation(); capture(vp, e); P.dragging = true;
  const g = m.grid, w0 = PV.toWorld(e.clientX, e.clientY), c0 = PV.toCell(w0.x, w0.y), sx = t.x, sy = t.y, lbl = $('#lbl');
  const mv = ev => {
    const w = PV.toWorld(ev.clientX, ev.clientY), c = PV.toCell(w.x, w.y);
    t.x = sx + c.cx - c0.cx; t.y = sy + c.cy - c0.cy;
    tokEl.style.left = (g.ox + t.x * g.size) + 'px'; tokEl.style.top = (g.oy + t.y * g.size) + 'px';
    const d = gridDist({ cx: sx, cy: sy }, { cx: t.x, cy: t.y }, g.meters);
    lbl.className = 'move-lbl'; lbl.style.position = 'fixed'; lbl.style.left = (ev.clientX + 16) + 'px'; lbl.style.top = (ev.clientY - 30) + 'px';
    lbl.innerHTML = `${d.m} m <span class="muted">(${d.cells} cases)</span>`;
  };
  const up = async () => {
    vp.removeEventListener('pointermove', mv); vp.removeEventListener('pointerup', up); vp.removeEventListener('pointercancel', up);
    lbl.className = 'hidden';
    const st = (t.size || 1) < 1 ? 0.5 : 1; t.x = Math.round(t.x / st) * st; t.y = Math.round(t.y / st) * st;
    PV.drawTokens();
    try { await api('POST', '/api/move', { char: me, token: t.id, x: t.x, y: t.y }); }
    catch (err) { toast('<i class="ico i-interdit"></i> ' + esc(err.message || 'Déplacement refusé')); }
    P.dragging = false; refresh(true);
  };
  vp.addEventListener('pointermove', mv); vp.addEventListener('pointerup', up); vp.addEventListener('pointercancel', up);
});
/* signal : appui long (ou double-clic) sur la carte */
let pressT = null;
const sendPing = (x, y) => { const m = playerMap(); if (!m) return; const w = PV.toWorld(x, y); api('POST', '/api/ping', { char: me, who: myChar()?.name || 'Spectateur', map: m.id, x: w.x, y: w.y, color: myChar()?.color || '#4fd1ff' }).then(() => refresh()).catch(() => { }); };
vp.addEventListener('pointerdown', e => { if (e.target.closest('.token.mine')) return; const x = e.clientX, y = e.clientY; clearTimeout(pressT); pressT = setTimeout(() => { navigator.vibrate?.(40); sendPing(x, y); }, 650); });
['pointerup', 'pointercancel', 'pointerleave'].forEach(k => vp.addEventListener(k, () => clearTimeout(pressT)));
vp.addEventListener('pointermove', e => { if (pressT && (Math.abs(e.movementX) + Math.abs(e.movementY) > 3)) clearTimeout(pressT); });
vp.addEventListener('dblclick', e => { if (!e.target.closest('.token')) sendPing(e.clientX, e.clientY); });
/* zoom à deux doigts */
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
$('#h-panel').onclick = () => { P.panel = !P.panel; try { localStorage.setItem('mj-panel', P.panel ? '1' : '0'); } catch (e) { } drawPanel(); setTimeout(() => PV.drawAll(), 50); };
document.addEventListener('keydown', e => { if (e.key === 'Escape') $('#modal').classList.add('hidden'); });
document.addEventListener('click', e => {   // formules de dés cliquables dans la fiche
  const d = e.target.closest('[data-roll]'); if (!d) return; e.preventDefault(); e.stopImmediatePropagation();
  act('roll', { expr: d.dataset.roll, label: d.dataset.label || d.dataset.roll }, d.dataset.roll);
}, true);

(async () => {
  try { await Promise.all([loadPlayer(), loadSpells()]); }
  catch (e) { document.body.insertAdjacentHTML('beforeend', '<div id="msg" class="card">Impossible de joindre la table du MJ.</div>'); return; }
  draw(); if (me) setTimeout(centerMe, 300);
  setInterval(refresh, 1000);
})();
