/* ===== Personnages : fiches, PV, XP, repos ===== */
'use strict';

const FULL_CASTER_KEYS = ['magicien', 'druide', 'clerc', 'barde', 'ensorceleur', 'sorcier'];
let selChar = null, charSub = 'fiche';
try { selChar = localStorage.getItem('mj-char'); } catch (e) { }

function blankChar(name) {
  return {
    id: slug(name) + '-' + Math.random().toString(36).slice(2, 5), name, title: '', player: '', race: '', classe: '', niveau: 1,
    historique: '', alignement: '', taille: 'Moyenne', vitesse: '9 m', stats: { FOR: 10, DEX: 10, CON: 10, INT: 10, SAG: 10, CHA: 10 },
    saves: [], prof: 2, hpMax: 10, hp: 10, hpTemp: 0, ca: 10, initBonus: 0, xp: 0, hitDie: 8, hitDice: 1, skills: {}, attacks: [],
    resources: [], spellcasting: null, spells: {}, features: [], equipment: '', gold: 0, conditions: [], deathSaves: { s: 0, f: 0 },
    exhaustion: 0, notes: '', sheet: '', portrait: '', color: '', source: '',
  };
}

/* ---------- mécanique ---------- */
function hasCond(c, n) { return (c.conditions || []).some(x => x.n === n); }
function addCond(c, n, r = null) { c.conditions ??= []; if (!hasCond(c, n)) c.conditions.push({ n, r }); }
function remCond(c, n) { c.conditions = (c.conditions || []).filter(x => x.n !== n); if (n === 'Concentration' && c.concentration) c.concentration = null; }

/* dégâts sur une entité (personnage ou combattant monstre) ; retourne le texte du journal */
function dealDamage(e, n, name) {
  n = Math.max(0, Math.round(n)); if (!n) return;
  const absorbed = Math.min(e.hpTemp || 0, n);
  e.hpTemp = (e.hpTemp || 0) - absorbed;
  const rest = n - absorbed, before = e.hp;
  e.hp = Math.max(0, e.hp - rest);
  let txt = `<i class="ico i-degats"></i> <b>${esc(name)}</b> subit ${n} dégâts${absorbed ? ` (${absorbed} absorbés par PV temp.)` : ''} → ${e.hp}/${e.hpMax} PV`;
  if (hasCond(e, 'Concentration')) txt += ` — <b>jet de CON DD ${Math.max(10, Math.floor(n / 2))}</b> pour maintenir la concentration`;
  if (e.hp === 0 && before > 0) {
    if (e.kind && e.kind !== 'pc') { e.dead = true; txt += ` — <i class="ico i-mort"></i> <b>vaincu</b>`; }
    else if (rest - before >= e.hpMax) { txt += ` — <i class="ico i-mort"></i> <b>MORT INSTANTANÉE</b> (dégâts restants ≥ PV max)`; addCond(e, 'Inconscient'); }
    else { addCond(e, 'Inconscient'); remCond(e, 'Concentration'); txt += ` — <i class="ico i-sommeil"></i> <b>inconscient</b>, jets contre la mort`; }
  } else if (e.hp === 0 && before === 0 && e.kind !== 'mon') {
    e.deathSaves ??= { s: 0, f: 0 }; e.deathSaves.f = Math.min(3, e.deathSaves.f + 1);
    txt += ` — échec de jet contre la mort (${e.deathSaves.f}/3)`;
  }
  logInfo(txt);
}
function healEntity(e, n, name) {
  n = Math.max(0, Math.round(n)); if (!n) return;
  const was = e.hp; e.hp = Math.min(e.hpMax, e.hp + n);
  if (was === 0) { remCond(e, 'Inconscient'); e.deathSaves = { s: 0, f: 0 }; e.dead = false; }
  logInfo(`<i class="ico i-soin"></i> <b>${esc(name)}</b> récupère ${e.hp - was} PV → ${e.hp}/${e.hpMax}`);
}

function addXP(c, n, silent) {
  c.xp = Math.max(0, (+c.xp || 0) + n);
  if (!silent) logInfo(`<i class="ico i-xp"></i> <b>${esc(c.name)}</b> ${n >= 0 ? 'gagne' : 'perd'} ${Math.abs(n)} XP (total ${c.xp})`);
  if (levelForXP(c.xp) > c.niveau) toast(`▲ <b>${esc(c.name)}</b> peut passer au niveau ${c.niveau + 1} !`, 4000);
  saveChar(c);
}
function levelUp(c, done) {
  levelUpWizard(c, { onApply: (nc, info) => applyLevelMJ(c, nc, info, done) });
}
function longRest(c, quiet) {
  c.hp = c.hpMax; c.hpTemp = 0; c.deathSaves = { s: 0, f: 0 };
  (c.resources || []).forEach(r => { if (r.reset === 'court' || r.reset === 'long') r.cur = r.max; });
  if (c.spellcasting) Object.values(c.spellcasting.slots || {}).forEach(s => s.cur = s.max);
  c.hitDice = Math.min(c.niveau, (c.hitDice || 0) + Math.max(1, Math.floor(c.niveau / 2)));
  if (c.exhaustion > 0) c.exhaustion--;
  c.conditions = (c.conditions || []).filter(x => !['Inconscient', 'Concentration', 'Rage', 'Transformé'].includes(x.n));
  if (!quiet) logInfo(`<i class="ico i-lune"></i> <b>${esc(c.name)}</b> termine un repos long.`);
  saveChar(c);
}
function shortRest(c, quiet) {
  (c.resources || []).forEach(r => { if (r.reset === 'court') r.cur = r.max; });
  if (classKey(c) === 'occultiste' && c.spellcasting) Object.values(c.spellcasting.slots).forEach(s => s.cur = s.max);
  c.conditions = (c.conditions || []).filter(x => !['Rage', 'Transformé'].includes(x.n));
  if (!quiet) logInfo(`<i class="ico i-cafe"></i> <b>${esc(c.name)}</b> termine un repos court.`);
  saveChar(c);
}
function spendHitDie(c) {
  if (!(c.hitDice > 0)) return toast('Plus de dés de vie disponibles.');
  const hd = c.hitDie || 8, r = roll(`1d${hd}${fmod(mod(c.stats.CON))}`, { label: 'Dé de vie', who: c.name });
  c.hitDice--; healEntity(c, Math.max(0, r.total), c.name); saveChar(c);
}
function restModal(kind) {
  const pcs = charList();
  if (kind === 'long') {
    confirmBox('<i class="ico i-lune"></i> Repos long pour tout le groupe ? (PV, emplacements de sorts, ressources et la moitié des dés de vie sont récupérés)', () => {
      pcs.forEach(c => longRest(c, true)); logInfo('<i class="ico i-lune"></i> <b>Le groupe termine un repos long.</b>'); rerender();
    });
    return;
  }
  pcs.forEach(c => shortRest(c, true)); logInfo('<i class="ico i-cafe"></i> <b>Le groupe termine un repos court.</b>');
  const draw = box => $('#sr-list', box).innerHTML = pcs.map(c => `<div class="row" style="padding:4px 0">
      <b style="width:110px">${esc(c.name)}</b><span style="width:110px">${c.hp}/${c.hpMax} PV</span>
      <span class="muted" style="width:90px">DV : ${c.hitDice || 0}/${c.niveau} (d${c.hitDie || 8})</span>
      <button data-hd="${c.id}" ${c.hitDice > 0 && c.hp < c.hpMax ? '' : 'disabled'}>Dépenser 1 DV</button></div>`).join('');
  modal(`<h3><i class="ico i-cafe"></i> Repos court</h3><p class="muted">Les capacités « par repos court » sont rechargées. Chaque personnage peut dépenser des dés de vie pour se soigner.</p>
    <div id="sr-list"></div><div class="actions"><button class="primary" data-close>Terminé</button></div>`, box => {
    draw(box);
    box.addEventListener('click', e => { const b = e.target.closest('[data-hd]'); if (b) { spendHitDie(S.chars[b.dataset.hd]); draw(box); } });
  });
  rerender();
}
function giveXPModal() {
  const pcs = charList();
  modal(`<h3><i class="ico i-xp"></i> Distribuer de l'expérience</h3>
    <div class="row"><label class="field"><span>Points d'XP</span><input id="xp-n" type="number" value="100" style="width:110px"></label>
    <label class="field"><span>Mode</span><select id="xp-mode"><option value="each">à chacun</option><option value="split">partagés entre les sélectionnés</option></select></label></div>
    <div class="col" style="margin-top:8px">${pcs.map(c => `<label class="chk"><input type="checkbox" value="${c.id}" checked> ${esc(c.name)} <span class="muted small">(niv. ${c.niveau}, ${c.xp} XP)</span></label>`).join('')}</div>
    <div class="actions"><button data-close>Annuler</button><button class="primary" id="xp-ok">Donner</button></div>`, (box, close) => {
    $('#xp-ok', box).onclick = () => {
      const ids = $$('input[type=checkbox]:checked', box).map(i => i.value); let n = num($('#xp-n', box).value);
      if (!ids.length) return;
      if ($('#xp-mode', box).value === 'split') n = Math.floor(n / ids.length);
      ids.forEach(id => addXP(S.chars[id], n));
      close(); rerender();
    };
  });
}
async function importSheets() {
  const sheets = await api('GET', '/api/scan').catch(() => []);
  if (!sheets.length) return toast('Aucune fiche trouvée dans le dossier <code>Dnd/fiches/</code> (fichiers .txt/.md contenant « **Race :** »).', 5000);
  const have = new Set(charList().map(c => slug(c.name)));
  modal(`<h3><i class="ico i-importer"></i> Importer des fiches dans « ${esc(S.campMeta.name || 'cette campagne')} »</h3>
    <p class="muted small">Fiches lues dans <code>${esc(S.root)}</code>. Chaque campagne a ses propres personnages : cochez ceux qui participent.</p>
    <div class="col">${sheets.map(x => `<label class="chk"><input type="checkbox" value="${esc(x.name)}" ${have.has(slug(x.name)) ? '' : 'checked'}> <b>${esc(x.name)}</b> <span class="muted small">${esc(String(x.classe).split(/[—–]/)[0])} niv. ${x.niveau} · ${esc(x.source)}${have.has(slug(x.name)) ? ' · déjà présent' : ''}</span></label>`).join('')}</div>
    <label class="chk small" style="margin-top:8px"><input type="checkbox" id="imp-force"> relire aussi les personnages déjà présents (garde PV, XP, niveau, portrait, notes)</label>
    <div class="actions"><button data-close>Annuler</button><button class="primary" id="imp-ok">Importer</button></div>`, (box, close) => {
    $('#imp-ok', box).onclick = async () => {
      const names = $$('input[type=checkbox][value]', box).filter(i => i.checked).map(i => i.value);
      if (!names.length) return;
      close();
      const res = await api('POST', '/api/import', { names, force: $('#imp-force', box).checked });
      await loadAll();
      modal(`<h3><i class="ico i-importer"></i> Import terminé</h3><table class="t">${res.map(r => `<tr><td>${esc(r.name)}</td><td class="muted">${esc(r.source)}</td><td>${esc(r.status)}</td></tr>`).join('')}</table>
        <div class="actions"><button class="primary" data-close>OK</button></div>`);
      rerender();
    };
  });
}

/* ---------- rendu ---------- */
function hpBar(e) {
  const p = e.hpMax ? clamp(e.hp / e.hpMax, 0, 1) : 0, t = e.hpMax ? clamp((e.hpTemp || 0) / e.hpMax, 0, 1) : 0;
  return `<div class="bar" title="${e.hp}/${e.hpMax} PV${e.hpTemp ? ' + ' + e.hpTemp + ' temp.' : ''}"><i class="${p < .25 ? 'low' : p < .5 ? 'mid' : ''}" style="width:${p * 100}%"></i>${t ? `<b style="left:${p * 100}%;width:${t * 100}%"></b>` : ''}</div>`;
}
function xpBar(c) {
  const l = c.niveau, a = XP_TABLE[l - 1] || 0, b = XP_TABLE[l] ?? a;
  const p = b > a ? clamp((c.xp - a) / (b - a), 0, 1) : 1;
  return `<div class="bar xp" title="${c.xp} / ${b} XP"><i style="width:${p * 100}%"></i></div>`;
}
function avatarHTML(c, size) {
  const st = size ? `width:${size}px;height:${size}px;` : '';
  return c.portrait ? `<div class="avatar" style="${st}background-image:url('${esc(c.portrait)}')"></div>`
    : `<div class="avatar" style="${st}background-color:${c.color || colorFor(c.name)}">${esc(initials(c.name))}</div>`;
}
function condChips(e, owner) {
  return (e.conditions || []).map(x => `<span class="chip ${x.n === 'Concentration' ? 'conc' : 'cond'}" title="${esc(CONDITIONS[x.n] || '')}">${esc(x.n)}${x.r ? ` (${x.r})` : ''}<button data-rmcond="${esc(x.n)}" data-owner="${owner}">✕</button></span>`).join('');
}
function condSelect(owner) {
  return `<select data-addcond="${owner}" class="small" style="width:auto"><option value="">+ état…</option>${Object.keys(CONDITIONS).map(n => `<option>${n}</option>`).join('')}<option value="*">Autre…</option></select>`;
}

function renderPersos(main) {
  const pcs = charList();
  if (!S.chars[selChar]) selChar = pcs[0]?.id || null;
  main.innerHTML = `<div class="split">
    <div class="side-list">
      <div class="row"><button class="primary" id="pc-new">+ Nouveau</button><button id="pc-import" title="Lire les fiches .txt/.md du dossier Dnd/fiches"><i class="ico i-importer"></i> Importer</button></div>
      <div class="row"><button id="pc-sr"><i class="ico i-cafe"></i> Repos court</button><button id="pc-lr"><i class="ico i-lune"></i> Repos long</button></div>
      <button id="pc-xp"><i class="ico i-xp"></i> Distribuer de l'XP</button>
      <div id="pc-list" class="col"></div>
    </div>
    <div class="sheet" id="sheet"></div></div>`;
  $('#pc-new').onclick = () => ask('Nouveau personnage', [{ k: 'name', label: 'Nom' }], o => {
    if (!o.name.trim()) return; const c = blankChar(o.name.trim()); S.chars[c.id] = c; selChar = c.id; saveChar(c); rerender();
  });
  $('#pc-import').onclick = () => importSheets(false);
  $('#pc-sr').onclick = () => restModal('court');
  $('#pc-lr').onclick = () => restModal('long');
  $('#pc-xp').onclick = giveXPModal;
  drawPCList(); drawSheet();
}
function drawPCList() {
  const el = $('#pc-list'); if (!el) return;
  const pcs = charList();
  el.innerHTML = pcs.length ? pcs.map(c => `<div class="pc-item ${c.id === selChar ? 'sel' : ''}" data-sel="${c.id}">
      ${avatarHTML(c)}<div class="info"><div class="row"><span class="nm">${esc(c.name)}</span>${S.presence?.[c.id] != null ? '<span class="online" title="Joueur connecté">●</span>' : ''}<span class="muted small right">niv. ${c.niveau}</span></div>
      <div class="muted small">${esc(String(c.classe).split(/[—–]/)[0])} · CA ${c.ca} · ${c.hp}/${c.hpMax} PV</div>${hpBar(c)}${xpBar(c)}</div></div>`).join('')
    : `<div class="empty">Aucun personnage.<br>Cliquez sur « Importer » pour lire les fiches du dossier.</div>`;
  $$('[data-sel]', el).forEach(d => d.onclick = () => { selChar = d.dataset.sel; try { localStorage.setItem('mj-char', selChar); } catch (e) { } drawPCList(); drawSheet(); });
}
function drawSheet() {
  const el = $('#sheet'); if (!el) return;
  const c = S.chars[selChar];
  if (!c) { el.innerHTML = '<div class="empty">Sélectionnez ou créez un personnage.</div>'; return; }
  const nextXP = XP_TABLE[c.niveau] ?? null, canLevel = levelForXP(c.xp) > c.niveau && c.niveau < 20;
  el.innerHTML = `
  <div class="sheet-head">
    <div class="portrait ${c.portrait ? 'has' : ''}" id="portrait" style="${c.portrait ? `background-image:url('${esc(c.portrait)}')` : ''}" title="Glissez une image ici (ou cliquez)">Glissez un JPEG ici pour le portrait</div>
    <div class="grow col">
      <input class="name-in" data-k="name" value="${esc(c.name)}">
      <div class="row"><input data-k="title" value="${esc(c.title)}" placeholder="Titre / surnom" style="flex:1">
        <input data-k="player" value="${esc(c.player)}" placeholder="Joueur" style="width:140px"></div>
      <div class="row">
        <label class="field"><span>Race</span><input data-k="race" value="${esc(c.race)}" style="width:150px"></label>
        <label class="field"><span>Classe</span><input data-k="classe" value="${esc(c.classe)}" style="width:240px"></label>
        <label class="field"><span>Niveau</span><input data-k="niveau" data-t="n" type="number" value="${c.niveau}" style="width:56px"></label>
        <label class="field"><span>Historique</span><input data-k="historique" value="${esc(c.historique)}" style="width:170px"></label>
        <label class="field"><span>Alignement</span><input data-k="alignement" value="${esc(c.alignement)}" style="width:140px"></label>
      </div>
    </div>
    <div class="col">
      <button class="danger small" id="pc-del"><i class="ico i-poubelle"></i> Supprimer</button>
      ${c.portrait ? '<button class="small" id="pc-noportrait">Retirer portrait</button>' : ''}
      <label class="row small muted">Couleur <input type="color" data-k="color" value="${c.color && c.color.startsWith('#') ? c.color : '#7a5a2a'}" style="width:40px;padding:0"></label>
      ${c.source ? `<span class="muted small">source : ${esc(c.source)}</span>` : ''}
    </div>
  </div>
  <div class="subtabs">${[['fiche', '<i class="ico i-liste"></i> Fiche'], ['capa', '<i class="ico i-etincelle"></i> Capacités & sorts'], ['orig', '<i class="ico i-parchemin"></i> Fiche originale'], ['notes', '<i class="ico i-plume"></i> Notes & équipement']].map(([k, l]) => `<button data-sub="${k}" class="${charSub === k ? 'active' : ''}">${l}</button>`).join('')}</div>
  <div id="subbody" class="col" style="gap:12px"></div>`;
  const body = $('#subbody', el);
  if (charSub === 'fiche') body.innerHTML = sheetMain(c, nextXP, canLevel);
  else if (charSub === 'capa') body.innerHTML = sheetCapa(c);
  else if (charSub === 'orig') body.innerHTML = `<div class="row"><button id="orig-edit"><i class="ico i-plume"></i> Modifier le texte</button><span class="muted small">Les formules de dés sont cliquables.</span></div>
     <div class="card md-view" id="orig-view">${c.sheet ? md(c.sheet) : '<span class="muted">Pas de fiche texte.</span>'}</div>`;
  else body.innerHTML = `<div class="grid2"><div class="card"><h4><i class="ico i-sac"></i> Équipement</h4><textarea data-k="equipment" data-live rows="8">${esc(c.equipment)}</textarea>
      <div class="row" style="margin-top:6px"><label class="field"><span>Pièces d'or</span><input data-k="gold" data-t="n" type="number" value="${c.gold || 0}" style="width:100px"></label>
      <label class="field"><span>Vitesse</span><input data-k="vitesse" value="${esc(c.vitesse)}"></label><label class="field"><span>Taille</span><input data-k="taille" value="${esc(c.taille)}"></label></div></div>
      <div class="col"><div class="card"><h4><i class="ico i-plume"></i> Notes du MJ <span class="muted small">(jamais visibles par les joueurs)</span></h4><textarea data-k="notes" data-live rows="10" placeholder="Secrets, objectifs, liens avec l'intrigue…">${esc(c.notes)}</textarea></div>
      <div class="card"><h4><i class="ico i-joueur"></i> Notes du joueur <span class="muted small">(écrites depuis la vue joueurs)</span></h4><div class="md-view small">${c.playerNotes ? md(c.playerNotes) : '<span class="muted">Rien pour l\'instant.</span>'}</div></div></div></div>`;
  bindSheet(el, c);
}
function sheetMain(c, nextXP, canLevel) {
  const ds = c.deathSaves || { s: 0, f: 0 };
  return `${canLevel ? `<button class="lvl-banner" id="lvl-banner"><i class="ico i-fleche-haut"></i><span><b>${esc(c.name)} peut passer au niveau ${c.niveau + 1}</b><small>${c.xp} XP — ouvrir l'assistant de montée de niveau (PV, aptitudes, caractéristiques, sorts)</small></span></button>` : ''}
  <div class="vitals">
    <div class="vital hpbox">
      <div class="k" style="text-align:center">Points de vie</div>
      <div class="hpline"><button class="icon" data-hp="-1">−</button><span class="cur">${c.hp}</span><span class="muted">/</span>
        <input data-k="hpMax" data-t="n" type="number" value="${c.hpMax}" title="PV max"><button class="icon" data-hp="1">+</button>
        <span class="muted small">temp.</span><input data-k="hpTemp" data-t="n" type="number" value="${c.hpTemp || 0}" style="width:48px;font-size:1rem"></div>
      ${hpBar(c)}
      <div class="row" style="justify-content:center;margin-top:4px"><input id="hp-amt" type="number" placeholder="n" style="width:60px">
        <button class="danger small" id="hp-dmg">Dégâts</button><button class="ok small" id="hp-heal">Soins</button>
        <button class="small" id="hp-hd" title="Dépenser un dé de vie">DV ${c.hitDice || 0}/${c.niveau} (d${c.hitDie || 8})</button></div>
      ${c.hp === 0 ? `<div class="death" style="justify-content:center;margin-top:4px">Jets contre la mort :
        <span>succès ${[0, 1, 2].map(i => `<button class="pip s ${i < ds.s ? 'full' : ''}" data-ds="s:${i}"></button>`).join('')}</span>
        <span>échecs ${[0, 1, 2].map(i => `<button class="pip f ${i < ds.f ? 'full' : ''}" data-ds="f:${i}"></button>`).join('')}</span>
        <button class="small" id="ds-roll">Lancer</button></div>` : ''}
    </div>
    <div class="vital"><span class="k">CA</span><input data-k="ca" data-t="n" type="number" value="${c.ca}"></div>
    <div class="vital"><span class="k">Initiative</span><span class="v" data-roll="1d20${fmod(+c.initBonus || 0)}" data-label="Initiative" data-who="${esc(c.name)}" style="cursor:pointer">${fmod(+c.initBonus || 0)}</span><input data-k="initBonus" data-t="n" type="number" value="${c.initBonus}" style="width:44px;font-size:.8rem"></div>
    <div class="vital"><span class="k">Maîtrise</span><input data-k="prof" data-t="n" type="number" value="${c.prof}"></div>
    <div class="vital"><span class="k">Vitesse</span><span style="font-size:.9rem;max-width:110px;text-align:center">${esc(c.vitesse)}</span></div>
    <div class="vital" style="min-width:200px;align-items:stretch">
      <div class="row"><span class="k">Expérience</span><span class="right small">niv. <b>${c.niveau}</b></span></div>
      <div class="row"><input data-k="xp" data-t="n" type="number" value="${c.xp}" style="width:80px"><span class="muted small">/ ${nextXP ?? '—'}</span></div>
      ${xpBar(c)}
      <div class="row" style="margin-top:4px"><input id="xp-add" type="number" placeholder="+XP" style="width:66px"><button class="small" id="xp-btn">Ajouter</button>
      ${canLevel ? `<button class="primary small" id="lvl-up"><i class="ico i-fleche-haut"></i> Niveau ${c.niveau + 1}</button>` : `<button class="small" id="lvl-up" title="Monter de niveau manuellement (sans attendre l'XP)"><i class="ico i-fleche-haut"></i></button>`}
      ${(c.levelHistory || []).length ? `<button class="small" id="lvl-undo" title="Annuler le dernier passage de niveau">↺</button>` : ''}</div>
    </div>
  </div>
  <div class="card"><div class="row"><b>États</b>${condChips(c, 'pc:' + c.id)}${condSelect('pc:' + c.id)}
    <span class="right small muted">Épuisement</span><select data-k="exhaustion" data-t="n" class="small" style="width:auto">${EXHAUSTION.map((t, i) => `<option value="${i}" ${i == (c.exhaustion || 0) ? 'selected' : ''}>${i} ${i ? '— ' + t : ''}</option>`).join('')}</select></div></div>
  <div class="stats">${STATS.map(s => {
    const m = mod(c.stats[s]), p = (c.saves || []).includes(s);
    return `<div class="stat"><span class="ab">${s}</span><span class="md" data-roll="1d20${fmod(m)}" data-label="Test de ${STAT_NAMES[s]}" data-who="${esc(c.name)}" title="Test de ${STAT_NAMES[s]}">${fmod(m)}</span>
      <input data-k="stats.${s}" data-t="n" type="number" value="${c.stats[s]}">
      <span class="sv ${p ? 'p' : ''}"><span data-roll="1d20${fmod(saveBonus(c, s))}" data-label="Sauvegarde ${s}" data-who="${esc(c.name)}">sauv. ${fmod(saveBonus(c, s))}</span> <span data-togsave="${s}" title="Maîtrise de la sauvegarde">${p ? '●' : '○'}</span></span></div>`;
  }).join('')}</div>
  <div class="grid2">
    <div class="card"><h4>Compétences <span class="muted small">(clic = jet, valeur vide = modificateur brut)</span></h4><div class="skills">${SKILLS.map(([n, ab]) => {
      const has = c.skills && c.skills[n] != null, b = skillBonus(c, n);
      return `<div class="skill ${has ? 'p' : ''}"><span class="sn" data-roll="1d20${fmod(b)}" data-label="${n}" data-who="${esc(c.name)}">${n} <span class="sa">${ab}</span></span>
        <input data-skill="${n}" value="${has ? fmod(+c.skills[n]) : ''}" placeholder="${fmod(b)}"></div>`;
    }).join('')}</div>
    <div class="muted small" style="margin-top:6px">Perception passive : <b>${10 + skillBonus(c, 'Perception')}</b> · Investigation passive : <b>${10 + skillBonus(c, 'Investigation')}</b></div></div>
    <div class="col">
      <div class="card"><h4><i class="ico i-combat"></i> Attaques</h4><table class="t"><tr><th>Nom</th><th>Toucher</th><th>Dégâts</th><th>Type</th><th></th></tr>
        ${(c.attacks || []).map((a, i) => `<tr><td><input data-k="attacks.${i}.name" value="${esc(a.name)}"></td><td style="width:60px"><input data-k="attacks.${i}.bonus" data-t="n" value="${a.bonus}"></td>
        <td style="width:90px"><input data-k="attacks.${i}.damage" value="${esc(a.damage)}"></td><td style="width:90px"><input data-k="attacks.${i}.type" value="${esc(a.type || '')}"></td>
        <td style="white-space:nowrap"><button class="small primary" data-atk="${i}"><i class="ico i-des"></i></button><button class="small icon" data-delatk="${i}">✕</button></td></tr>`).join('')}
      </table><button class="small" id="atk-add" style="margin-top:6px">+ attaque</button></div>
      <div class="card"><h4><i class="ico i-ressource"></i> Ressources</h4>
        ${(c.resources || []).map((r, i) => `<div class="res"><span class="rn">${esc(r.name)} <span class="muted small">${r.reset === 'aucun' ? '' : 'repos ' + r.reset}</span></span>
          ${r.max <= 8 ? `<span class="pips">${Array.from({ length: r.max }, (_, k) => `<button class="pip ${k < r.cur ? 'full' : ''}" data-pip="${i}:${k}"></button>`).join('')}</span>` : ''}
          <button class="icon small" data-res="${i}:-1">−</button><b>${r.cur}/${r.max}</b><button class="icon small" data-res="${i}:1">+</button>
          <button class="icon small" data-editres="${i}">✎</button></div>`).join('') || '<div class="muted small">Aucune ressource suivie.</div>'}
        <button class="small" id="res-add" style="margin-top:6px">+ ressource</button></div>
    </div>
  </div>`;
}
function sheetCapa(c) {
  const sc = c.spellcasting;
  const lv = Object.keys(c.spells || {}).map(Number);
  const maxLv = Math.max(lv.length ? Math.max(...lv) : 0, ...Object.keys(sc?.slots || {}).map(Number), 0);
  return `<div class="grid2">
    <div class="card"><h4><i class="ico i-etincelle"></i> Capacités</h4>${(c.features || []).map((f, i) => `<div class="feature"><div class="row"><span class="fn">${esc(f.name)}</span>
       <button class="small icon right" data-editfeat="${i}">✎</button><button class="small icon" data-delfeat="${i}">✕</button></div><div class="ft">${linkDice(esc(f.text))}</div></div>`).join('') || '<div class="muted">Aucune.</div>'}
       <button class="small" id="feat-add" style="margin-top:8px">+ capacité</button></div>
    <div class="card" data-char="${c.id}"><h4><i class="ico i-sorts"></i> Sorts ${c.concentration ? `<span class="chip conc"><i class="ico i-sorts"></i> concentration : ${esc(c.concentration)}</span>` : ''} <a class="small right" href="#" id="to-grim"><i class="ico i-livre"></i> Grimoire</a></h4>
      ${sc ? `<div class="row"><label class="field"><span>Carac.</span><select data-k="spellcasting.ability">${STATS.map(s => `<option ${s === sc.ability ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
        <label class="field"><span>DD</span><input data-k="spellcasting.dc" data-t="n" type="number" value="${sc.dc}"></label>
        <label class="field"><span>Attaque</span><input data-k="spellcasting.attack" data-t="n" type="number" value="${sc.attack}"></label>
        <button data-roll="1d20${fmod(sc.attack)}" data-label="Attaque de sort" data-who="${esc(c.name)}" class="small"><i class="ico i-des"></i> Attaque de sort</button></div>` :
      `<button id="sc-on" class="small">Activer l'incantation</button>`}
      ${sc || lv.length ? Array.from({ length: maxLv + 1 }, (_, l) => {
        const sl = sc?.slots?.[l];
        return `<div style="margin-top:10px"><div class="row"><b>${l === 0 ? 'Tours de magie' : 'Niveau ' + l}</b>
          ${l > 0 && sc ? `<span class="pips">${Array.from({ length: sl?.max || 0 }, (_, k) => `<button class="pip ${k < sl.cur ? 'full' : ''}" data-slot="${l}:${k}" title="Emplacement"></button>`).join('')}</span>
          <span class="muted small">max</span><input class="n2" data-slotmax="${l}" type="number" value="${sl?.max || 0}">` : ''}</div>
          <div class="col sp-list" style="margin-top:4px;gap:2px">${(c.spells?.[l] || []).map((s, i) => { const [k, sp] = findSpell(s, l);
            return `<div class="sp-row"><button class="small primary" data-cast="${l}|${esc(s)}" title="Lancer"><i class="ico i-sorts"></i></button>
              <span class="sp-name" data-spinfo="${l}|${esc(s)}" title="Voir le sort">${esc(s)}${sp?.conc ? ' <span class="tag conc">C</span>' : ''}${sp?.rituel ? ' <span class="tag">R</span>' : ''}${!sp ? ' <span class="tag warn" title="Sort introuvable dans la base">?</span>' : sp.n !== s ? ` <span class="muted small">(${esc(sp.n)})</span>` : ''}</span>
              <span class="muted small sp-sum">${sp ? spellSummary(sp, c, l) : ''}</span><button class="small icon" data-delspell="${l}:${i}">✕</button></div>`; }).join('')}
          <input data-addspell="${l}" list="spell-dl-${l}" placeholder="+ ajouter un sort de niveau ${l}" style="width:220px">
          <datalist id="spell-dl-${l}">${Object.values(SPELLS.db?.sorts || {}).filter(x => x.niv === l).map(x => `<option value="${esc(x.n)}">`).join('')}</datalist></div></div>`;
      }).join('') : ''}
      ${sc ? `<button class="small" id="lvl-more" style="margin-top:10px">+ niveau de sort</button>` : ''}
    </div></div>`;
}

function bindSheet(el, c) {
  const save = (redraw = true) => { saveChar(c); if (redraw) { drawSheet(); drawPCList(); } };
  $$('[data-sub]', el).forEach(b => b.onclick = () => { charSub = b.dataset.sub; drawSheet(); });
  $$('[data-k]', el).forEach(inp => {
    const live = inp.hasAttribute('data-live');
    inp.addEventListener(live ? 'input' : 'change', () => {
      let v = inp.value; if (inp.dataset.t === 'n') v = num(v);
      setPath(c, inp.dataset.k, v);
      if (inp.dataset.k === 'hpMax') c.hp = Math.min(c.hp, c.hpMax);
      if (inp.dataset.k === 'xp' && levelForXP(c.xp) > c.niveau) toast(`▲ ${esc(c.name)} peut monter de niveau !`);
      save(!live);
    });
  });
  const portrait = $('#portrait', el);
  dropImage(portrait, r => { c.portrait = r.url; save(); });
  $('#pc-noportrait', el) && ($('#pc-noportrait', el).onclick = () => { c.portrait = ''; save(); });
  $('#pc-del', el).onclick = () => confirmBox(`Supprimer définitivement <b>${esc(c.name)}</b> ?`, async () => {
    delete S.chars[c.id]; await api('DELETE', '/api/character/' + c.id); selChar = null; rerender();
  });
  const amt = () => num($('#hp-amt', el)?.value);
  $$('[data-hp]', el).forEach(b => b.onclick = () => { const d = +b.dataset.hp; d < 0 ? dealDamage(c, 1, c.name) : healEntity(c, 1, c.name); save(); });
  $('#hp-dmg', el) && ($('#hp-dmg', el).onclick = () => { dealDamage(c, amt(), c.name); save(); });
  $('#hp-heal', el) && ($('#hp-heal', el).onclick = () => { healEntity(c, amt(), c.name); save(); });
  $('#hp-hd', el) && ($('#hp-hd', el).onclick = () => { spendHitDie(c); drawSheet(); drawPCList(); });
  $$('[data-ds]', el).forEach(b => b.onclick = () => { const [k, i] = b.dataset.ds.split(':'); c.deathSaves[k] = c.deathSaves[k] > +i ? +i : +i + 1; save(); });
  $('#ds-roll', el) && ($('#ds-roll', el).onclick = () => {
    const r = roll('1d20', { label: 'Jet contre la mort', who: c.name, adv: 0 });
    if (r.nat === 20) { c.hp = 1; remCond(c, 'Inconscient'); c.deathSaves = { s: 0, f: 0 }; logInfo(`<i class="ico i-etincelle"></i> <b>${esc(c.name)}</b> fait 20 et reprend conscience avec 1 PV !`); }
    else if (r.nat === 1) c.deathSaves.f = Math.min(3, c.deathSaves.f + 2);
    else if (r.total >= 10) c.deathSaves.s = Math.min(3, c.deathSaves.s + 1);
    else c.deathSaves.f = Math.min(3, c.deathSaves.f + 1);
    if (c.deathSaves.s >= 3) logInfo(`<i class="ico i-pansement"></i> <b>${esc(c.name)}</b> est stabilisé.`);
    if (c.deathSaves.f >= 3) logInfo(`<i class="ico i-mort"></i> <b>${esc(c.name)}</b> est mort.`);
    save();
  });
  $('#xp-btn', el) && ($('#xp-btn', el).onclick = () => { const n = num($('#xp-add', el).value); if (n) { addXP(c, n); drawSheet(); drawPCList(); } });
  $('#lvl-up', el) && ($('#lvl-up', el).onclick = () => levelUp(c, () => { drawSheet(); drawPCList(); }));
  $('#lvl-undo', el) && ($('#lvl-undo', el).onclick = () => undoLevel(c, () => { drawSheet(); drawPCList(); }));
  $('#lvl-banner', el) && ($('#lvl-banner', el).onclick = () => levelUp(c, () => { drawSheet(); drawPCList(); }));
  $$('[data-togsave]', el).forEach(b => b.onclick = () => { const s = b.dataset.togsave; c.saves = c.saves.includes(s) ? c.saves.filter(x => x !== s) : [...c.saves, s]; save(); });
  $$('[data-skill]', el).forEach(i => i.onchange = () => { const v = i.value.trim(); c.skills ??= {}; if (v === '') delete c.skills[i.dataset.skill]; else c.skills[i.dataset.skill] = num(v); save(); });
  $$('[data-atk]', el).forEach(b => b.onclick = () => { const a = c.attacks[+b.dataset.atk]; attackRoll({ who: c.name, name: a.name, bonus: a.bonus, damage: a.damage, type: a.type }); });
  $$('[data-delatk]', el).forEach(b => b.onclick = () => { c.attacks.splice(+b.dataset.delatk, 1); save(); });
  $('#atk-add', el) && ($('#atk-add', el).onclick = () => { c.attacks.push({ name: 'Arme', bonus: c.prof + mod(c.stats.FOR), damage: '1d6' + fmod(mod(c.stats.FOR)), type: '' }); save(); });
  $$('[data-pip]', el).forEach(b => b.onclick = () => { const [i, k] = b.dataset.pip.split(':').map(Number); const r = c.resources[i]; r.cur = r.cur > k ? k : k + 1; save(); });
  $$('[data-res]', el).forEach(b => b.onclick = () => { const [i, d] = b.dataset.res.split(':').map(Number); const r = c.resources[i]; r.cur = clamp(r.cur + d, 0, r.max); save(); });
  const resForm = (r, cb) => ask(r ? 'Modifier la ressource' : 'Nouvelle ressource', [{ k: 'name', label: 'Nom', value: r?.name || '' }, { k: 'max', label: 'Maximum', type: 'number', value: r?.max ?? 1 },
    { k: 'reset', label: 'Recharge', type: 'select', value: r?.reset || 'long', options: [['court', 'repos court'], ['long', 'repos long'], ['aucun', 'manuelle']] }], cb);
  $('#res-add', el) && ($('#res-add', el).onclick = () => resForm(null, o => { c.resources.push({ name: o.name || 'Ressource', max: o.max, cur: o.reset === 'aucun' ? 0 : o.max, reset: o.reset }); save(); }));
  $$('[data-editres]', el).forEach(b => b.onclick = () => {
    const i = +b.dataset.editres, r = c.resources[i];
    modal(`<h3>${esc(r.name)}</h3><div class="actions"><button class="danger" id="r-del">Supprimer</button><button id="r-ed" class="primary">Modifier</button></div>`, (box, close) => {
      $('#r-del', box).onclick = () => { c.resources.splice(i, 1); close(); save(); };
      $('#r-ed', box).onclick = () => { close(); resForm(r, o => { Object.assign(r, o); r.cur = Math.min(r.cur, r.max); save(); }); };
    });
  });
  // capacités & sorts
  const featForm = (f, cb) => ask(f ? 'Modifier la capacité' : 'Nouvelle capacité', [{ k: 'name', label: 'Nom', value: f?.name || '' }, { k: 'text', label: 'Description', type: 'textarea', value: f?.text || '' }], cb);
  $('#feat-add', el) && ($('#feat-add', el).onclick = () => featForm(null, o => { c.features.push(o); save(); }));
  $$('[data-editfeat]', el).forEach(b => b.onclick = () => featForm(c.features[+b.dataset.editfeat], o => { Object.assign(c.features[+b.dataset.editfeat], o); save(); }));
  $$('[data-delfeat]', el).forEach(b => b.onclick = () => { c.features.splice(+b.dataset.delfeat, 1); save(); });
  $('#sc-on', el) && ($('#sc-on', el).onclick = () => { c.spellcasting = { ability: 'INT', dc: 8 + c.prof + mod(c.stats.INT), attack: c.prof + mod(c.stats.INT), slots: { 1: { max: 2, cur: 2 } } }; save(); });
  $$('[data-slot]', el).forEach(b => b.onclick = () => { const [l, k] = b.dataset.slot.split(':').map(Number); const s = c.spellcasting.slots[l]; s.cur = s.cur > k ? k : k + 1; save(); });
  $$('[data-slotmax]', el).forEach(i => i.onchange = () => { const l = i.dataset.slotmax, s = c.spellcasting.slots[l] ||= { max: 0, cur: 0 }; s.max = Math.max(0, num(i.value)); s.cur = Math.min(s.cur, s.max); if (num(i.value) > 0 && s.cur === 0) s.cur = s.max; save(); });
  $$('[data-addspell]', el).forEach(i => {
    const add = () => { const v = i.value.trim(); if (!v) return; c.spells ??= {}; (c.spells[i.dataset.addspell] ||= []).push(v); save(); setTimeout(() => $(`[data-addspell="${i.dataset.addspell}"]`)?.focus(), 0); };
    i.onkeydown = e => { if (e.key === 'Enter') add(); };
    i.onchange = () => { if (Object.values(SPELLS.db?.sorts || {}).some(x => x.n === i.value.trim())) add(); };
  });
  $$('[data-delspell]', el).forEach(b => b.onclick = () => { const [l, i] = b.dataset.delspell.split(':'); c.spells[l].splice(+i, 1); save(); });
  $('#lvl-more', el) && ($('#lvl-more', el).onclick = () => { const n = Math.max(0, ...Object.keys(c.spellcasting.slots).map(Number), ...Object.keys(c.spells).map(Number)) + 1; if (n <= 9) { c.spellcasting.slots[n] = { max: 1, cur: 1 }; c.spells[n] ||= []; save(); } });
  $('#to-grim', el) && ($('#to-grim', el).onclick = e => { e.preventDefault(); grimFor = c.id; go('grimoire'); });
  $('#orig-edit', el) && ($('#orig-edit', el).onclick = () => {
    $('#orig-view', el).outerHTML = `<div class="col"><textarea id="orig-ta" rows="28" style="font-family:monospace">${esc(c.sheet)}</textarea><div class="row"><button class="primary" id="orig-save">Enregistrer</button></div></div>`;
    $('#orig-save', el).onclick = () => { c.sheet = $('#orig-ta', el).value; save(); };
  });
}

/* gestion des états (délégation globale, pour fiches et combat) */
function condOwner(o) {
  const [k, id] = o.split(':');
  if (k === 'pc') return { e: S.chars[id], save: () => saveChar(S.chars[id]) };
  const cb = S.camp.combat.list.find(x => x.uid === id);
  return cb?.kind === 'pc' ? { e: S.chars[cb.charId], save: () => saveChar(S.chars[cb.charId]) } : { e: cb, save: saveCamp };
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-rmcond]'); if (!b) return;
  const o = condOwner(b.dataset.owner); if (!o.e) return;
  remCond(o.e, b.dataset.rmcond); o.save(); rerender();
});
document.addEventListener('change', e => {
  const s = e.target.closest('[data-addcond]'); if (!s || !s.value) return;
  const o = condOwner(s.dataset.addcond); if (!o.e) return;
  const add = (n, r) => { addCond(o.e, n, r || null); o.save(); rerender(); };
  if (s.value === '*') ask('Nouvel état', [{ k: 'n', label: 'Nom' }, { k: 'r', label: 'Durée en rounds (0 = illimitée)', type: 'number', value: 0 }], v => v.n && add(v.n, v.r));
  else if (S.camp.combat.active) ask(`État : ${s.value}`, [{ k: 'r', label: 'Durée en rounds (0 = illimitée)', type: 'number', value: 0 }], v => add(s.value, v.r));
  else add(s.value);
});

TABS.persos = { render: renderPersos, refresh: () => { if ($('#sheet')) { drawPCList(); drawSheet(); } else go('persos'); } };
