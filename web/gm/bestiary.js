/* ===== Bestiary ===== */
'use strict';

const SRD_MONSTERS = [
  // starter monsters (French SRD content): name, type, CR, AC, HP, HP formula, speed, [STR,DEX,CON,INT,WIS,CHA], attacks [name, bonus, damage, type], traits, size (squares)
  ['Rat géant', 'Bête', '1/8', 12, 7, '2d6', '9 m', [7, 15, 11, 2, 10, 4], [['Morsure', 4, '1d4+2', 'perforant']], '**Odorat aiguisé.** Avantage aux tests de Perception basés sur l\'odorat.\n**Tactique de groupe.** Avantage si un allié est à 1,50 m de la cible.', 0.5],
  ['Kobold', 'Humanoïde', '1/8', 12, 5, '2d6-2', '9 m', [7, 15, 9, 8, 7, 8], [['Dague', 4, '1d4+2', 'perforant'], ['Fronde', 4, '1d4+2', 'contondant']], '**Sensibilité au soleil.** Désavantage aux attaques et à la Perception (vue) en plein soleil.\n**Tactique de groupe.** Avantage si un allié est à 1,50 m de la cible.', 1],
  ['Bandit', 'Humanoïde', '1/8', 12, 11, '2d8+2', '9 m', [11, 12, 12, 10, 10, 10], [['Cimeterre', 3, '1d6+1', 'tranchant'], ['Arbalète légère', 3, '1d8+1', 'perforant']], '', 1],
  ['Gobelin', 'Humanoïde', '1/4', 15, 7, '2d6', '9 m', [8, 14, 10, 10, 8, 8], [['Cimeterre', 4, '1d6+2', 'tranchant'], ['Arc court', 4, '1d6+2', 'perforant']], '**Fuite agile.** Peut Se désengager ou Se cacher par une action bonus à chacun de ses tours.', 1],
  ['Squelette', 'Mort-vivant', '1/4', 13, 13, '2d8+4', '9 m', [10, 14, 15, 6, 8, 5], [['Épée courte', 4, '1d6+2', 'perforant'], ['Arc court', 4, '1d6+2', 'perforant']], '**Vulnérabilité** contondant. **Immunités** poison, épuisement, empoisonné.', 1],
  ['Zombie', 'Mort-vivant', '1/4', 8, 22, '3d8+9', '6 m', [13, 6, 16, 3, 6, 5], [['Coup', 3, '1d6+1', 'contondant']], '**Robustesse de mort-vivant.** S\'il tombe à 0 PV, sauvegarde de CON DD 5 + dégâts subis (sauf radiant ou critique) : réussite = il reste à 1 PV.', 1],
  ['Loup', 'Bête', '1/4', 13, 11, '2d8+2', '12 m', [12, 15, 12, 3, 12, 6], [['Morsure', 4, '2d4+2', 'perforant']], '**Tactique de groupe.** Avantage si un allié est à 1,50 m de la cible.\n**Morsure.** Si la cible est une créature : sauvegarde de FOR DD 11 ou à terre.', 1],
  ['Orc', 'Humanoïde', '1/2', 13, 15, '2d8+6', '9 m', [16, 12, 16, 7, 11, 10], [['Hache à deux mains', 5, '1d12+3', 'tranchant'], ['Javeline', 5, '1d6+3', 'perforant']], '**Agressif.** Par une action bonus, se déplace de sa vitesse vers un ennemi qu\'il voit.', 1],
  ['Hobgobelin', 'Humanoïde', '1/2', 18, 11, '2d8+2', '9 m', [13, 12, 12, 10, 10, 9], [['Épée longue', 3, '1d8+1', 'tranchant'], ['Arc long', 3, '1d8+1', 'perforant']], '**Avantage martial.** Une fois par tour, +2d6 dégâts si un allié est à 1,50 m de la cible.', 1],
  ['Ombre', 'Mort-vivant', '1/2', 12, 16, '3d8+3', '12 m', [6, 14, 13, 6, 10, 8], [['Drain de force', 4, '2d6+2', 'nécrotique']], '**Furtivité dans l\'ombre.** Peut se cacher par une action bonus dans la pénombre.\n**Drain de force.** La FOR de la cible diminue de 1d4 ; à 0, elle meurt.', 1],
  ['Gnoll', 'Humanoïde', '1/2', 15, 22, '5d8', '9 m', [14, 12, 11, 6, 10, 7], [['Morsure', 4, '1d4+2', 'perforant'], ['Lance', 4, '1d6+2', 'perforant']], '**Déchaînement.** Quand il réduit une créature à 0 PV, il peut se déplacer de la moitié de sa vitesse et mordre (action bonus).', 1],
  ['Araignée géante', 'Bête', '1', 14, 26, '4d10+4', '9 m, escalade 9 m', [14, 16, 12, 2, 11, 4], [['Morsure', 5, '1d8+3', 'perforant + 2d8 poison (CON DD 11, moitié)'], ['Toile (5-6)', 5, '', 'entravé']], '**Pattes d\'araignée.** Escalade sans test.\n**Toile.** Recharge 5-6, portée 9/18 m, la cible est entravée (FOR DD 12 pour se libérer).', 2],
  ['Gobelours', 'Humanoïde', '1', 16, 27, '5d8+5', '9 m', [15, 14, 13, 8, 11, 9], [['Morgenstern', 4, '2d8+2', 'perforant'], ['Javeline', 4, '1d6+2', 'perforant']], '**Brute.** Une arme de corps à corps inflige un dé supplémentaire (inclus).\n**Attaque surprise.** +2d6 dégâts contre une créature surprise au premier round.', 1],
  ['Goule', 'Mort-vivant', '1', 12, 22, '5d8', '9 m', [13, 15, 10, 7, 10, 6], [['Morsure', 2, '2d6+2', 'perforant'], ['Griffes', 4, '2d4+2', 'tranchant']], '**Griffes.** Une cible non elfe ni mort-vivant : sauvegarde de CON DD 10 ou paralysée 1 minute (nouvelle sauvegarde à la fin de chaque tour).', 1],
  ['Loup sanguinaire', 'Bête', '1', 14, 37, '5d10+10', '15 m', [17, 15, 15, 3, 12, 7], [['Morsure', 5, '2d6+3', 'perforant']], '**Tactique de groupe.** Avantage si un allié est à 1,50 m de la cible.\n**Morsure.** FOR DD 13 ou à terre.', 2],
  ['Ours brun', 'Bête', '1', 11, 34, '4d10+12', '12 m, escalade 9 m', [19, 10, 16, 2, 13, 7], [['Morsure', 6, '1d8+4', 'perforant'], ['Griffes', 6, '2d6+4', 'tranchant']], '**Attaques multiples.** Une morsure et une attaque de griffes.', 2],
  ['Chef bandit', 'Humanoïde', '2', 15, 65, '10d8+20', '9 m', [15, 16, 14, 14, 11, 14], [['Cimeterre', 5, '1d6+3', 'tranchant'], ['Dague', 5, '1d4+3', 'perforant']], '**Attaques multiples.** Deux cimeterres et une dague.\n**Parade (réaction).** +2 à la CA contre une attaque au corps à corps.', 1],
  ['Ogre', 'Géant', '2', 11, 59, '7d10+21', '12 m', [19, 8, 16, 5, 7, 7], [['Massue', 6, '2d8+4', 'contondant'], ['Javeline', 6, '2d6+4', 'perforant']], '', 2],
  ['Nécrophage', 'Mort-vivant', '3', 14, 45, '6d8+18', '9 m', [15, 14, 16, 10, 13, 15], [['Épée longue', 4, '1d8+2', 'tranchant'], ['Drain de vie', 4, '1d6+2', 'nécrotique'], ['Arc long', 4, '1d8+2', 'perforant']], '**Attaques multiples.** Deux épées longues, ou une épée et un drain de vie.\n**Drain de vie.** CON DD 13 ou PV max réduits du montant des dégâts.\n**Sensibilité au soleil.**', 1],
  ['Minotaure', 'Monstruosité', '3', 14, 76, '9d10+27', '12 m', [18, 11, 16, 6, 16, 9], [['Hache à deux mains', 6, '2d12+4', 'tranchant'], ['Encorner', 6, '2d8+4', 'perforant']], '**Charge.** S\'il se déplace d\'au moins 3 m en ligne droite puis encorne : +2d8 dégâts, FOR DD 14 ou repoussé de 3 m et à terre.', 2],
  ['Ours-hibou', 'Monstruosité', '3', 13, 59, '7d10+21', '12 m', [20, 12, 17, 3, 12, 7], [['Bec', 7, '1d10+5', 'perforant'], ['Griffes', 7, '2d8+5', 'tranchant']], '**Attaques multiples.** Un bec et des griffes.', 2],
  ['Fantôme', 'Mort-vivant', '4', 11, 45, '10d8', '0 m, vol 12 m', [7, 13, 10, 10, 12, 17], [['Toucher flétrissant', 5, '4d6+3', 'nécrotique']], '**Mouvement incorporel.** Traverse créatures et objets.\n**Visage terrifiant.** SAG DD 13 ou effrayé 1 minute ; échec de 5 ou plus = vieillit de 1d4×10 ans.\n**Possession (recharge 6).** CHA DD 13.\n*(Vex est terrifié.)*', 1],
  ['Troll', 'Géant', '5', 15, 84, '8d10+40', '9 m', [18, 13, 20, 7, 9, 7], [['Morsure', 7, '1d6+4', 'perforant'], ['Griffes', 7, '2d6+4', 'tranchant']], '**Attaques multiples.** Une morsure et deux griffes.\n**Régénération.** Récupère 10 PV au début de son tour, sauf s\'il a subi des dégâts d\'acide ou de feu ce tour-là.', 2],
  ['Mage', 'Humanoïde', '6', 12, 40, '9d8', '9 m', [9, 14, 11, 17, 12, 11], [['Dague', 5, '1d4+2', 'perforant'], ['Rayon de feu', 6, '2d10', 'feu']], '**Sorts (DD 14, +6).** Projectile magique, Bouclier, Boule de feu (8d6, DEX DD 14), Contresort, Invisibilité supérieure, Cône de froid.', 1],
];
function seedBestiary() {
  SRD_MONSTERS.forEach(([name, type, cr, ca, hp, f, v, st, atk, traits, size]) => {
    const m = { id: slug(name), name, type, cr, xp: CR_XP[cr] || 0, ca, hp, hpFormula: f, vitesse: v, size: size || 1, stats: Object.fromEntries(STATS.map((s, i) => [s, st[i]])),
      attacks: atk.map(([n, b, d, ty]) => ({ name: n, bonus: b, damage: d, type: ty })), traits, portrait: '', notes: '' };
    if (!S.mons[m.id]) { S.mons[m.id] = m; saveMon(m); }
  });
}

let selMon = null, monFilter = '', monType = '', monEdit = false;
const CR_NUM = cr => { const [a, b] = String(cr).split('/'); return b ? +a / +b : +a || 0; };
const monFamily = m => String(m.type || 'Autre').split(/[\s(]/)[0];
const SIZE_NAMES = { 0.5: t('size:tiny'), 1: t('size:medium'), 2: t('size:large'), 3: t('size:huge'), 4: t('size:gargantuan') };
function renderBestiary(main) {
  const fams = [...new Set(monList().map(monFamily))].sort((a, b) => termLead(a).localeCompare(termLead(b)));
  main.innerHTML = `<div class="split"><div class="side-list" style="width:300px">
    <div class="row"><input id="mo-q" placeholder="${t('Search a monster…')}" value="${esc(monFilter)}" style="flex:1"><button class="primary" id="mo-new">+ ${t('New')}</button></div>
    <div class="fam-chips"><button class="chip-btn ${monType ? '' : 'on'}" data-fam="">${t('All')}</button>${fams.map(f => `<button class="chip-btn ${monType === f ? 'on' : ''}" data-fam="${esc(f)}">${esc(termLead(f))}</button>`).join('')}</div>
    <div id="mo-list" class="list" style="max-height:calc(100vh - 200px);overflow:auto"></div></div><div class="sheet" id="mo-sheet"></div></div>`;
  $('#mo-q').oninput = e => { monFilter = e.target.value; drawMonList(); };
  $$('[data-fam]').forEach(b => b.onclick = () => { monType = b.dataset.fam; $$('[data-fam]').forEach(x => x.classList.toggle('on', x === b)); drawMonList(); });
  $('#mo-new').onclick = () => ask(t('New monster'), [{ k: 'name', label: t('Name') }], o => {
    if (!o.name) return;
    const m = { id: slug(o.name) + '-' + Math.random().toString(36).slice(2, 5), name: o.name, type: '', cr: '1', xp: 200, ca: 12, hp: 10, hpFormula: '3d8', vitesse: '9 m', size: 1,
      stats: { FOR: 10, DEX: 10, CON: 10, INT: 10, SAG: 10, CHA: 10 }, attacks: [], traits: '', portrait: '', notes: '' };
    S.mons[m.id] = m; saveMon(m); selMon = m.id; monEdit = true; rerender();
  });
  drawMonList(); drawMonSheet();
}
function drawMonList() {
  const el = $('#mo-list'); if (!el) return;
  const q = monFilter.toLowerCase();
  const list = monList().filter(m => (!q || m.name.toLowerCase().includes(q) || String(m.type).toLowerCase().includes(q) || String(termLead(m.type)).toLowerCase().includes(q)) && (!monType || monFamily(m) === monType))
    .sort((a, b) => CR_NUM(a.cr) - CR_NUM(b.cr) || a.name.localeCompare(b.name));
  el.innerHTML = list.map(m => `<div class="li mon-li ${m.id === selMon ? 'sel' : ''}" data-mo="${m.id}">${avatarHTML({ name: m.name, portrait: m.portrait, color: '#7a2a2a' }, 40)}
    <div class="grow"><b>${esc(m.name)}</b><div class="muted small">${esc(termLead(m.type))}</div></div><span class="cr-badge" title="${t('Challenge rating')}">${t('CR')} ${esc(m.cr)}</span></div>`).join('') || `<div class="muted">${t('No results.')}</div>`;
  $$('[data-mo]', el).forEach(d => d.onclick = () => { selMon = d.dataset.mo; monEdit = false; drawMonList(); drawMonSheet(); });
}
function drawMonSheet() {
  const el = $('#mo-sheet'); if (!el) return;
  if (!S.mons[selMon]) selMon = monList()[0]?.id || null;
  const m = S.mons[selMon];
  if (!m) { el.innerHTML = `<div class="empty">${t('Select a monster, or create one.<br>Monsters can be added to combat and placed on the map.')}</div>`; return; }
  if (!monEdit) return drawStatBlock(el, m);
  el.innerHTML = `<div class="row"><button id="mo-view"><i class="ico i-book"></i> ${t('View the stat block')}</button><span class="muted small">${t('Edit mode — changes are saved automatically.')}</span></div><div class="sheet-head">
    <div class="portrait ${m.portrait ? 'has' : ''}" id="mo-portrait" style="${m.portrait ? `background-image:url('${esc(m.portrait)}')` : ''}">${t('Drop a JPEG here')}</div>
    <div class="grow col"><input class="name-in" data-mk="name" value="${esc(m.name)}">
      <div class="row"><label class="field"><span>${t('Type')}</span><input data-mk="type" value="${esc(m.type)}"></label>
        <label class="field"><span>${t('CR')}</span><select data-mk="cr">${Object.keys(CR_XP).map(c => `<option ${c == m.cr ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
        <label class="field"><span>XP</span><input data-mk="xp" data-num type="number" value="${m.xp}" style="width:80px"></label>
        <label class="field"><span>${t('Size (squares)')}</span><select data-mk="size" data-num>${[0.5, 1, 2, 3, 4].map(v => `<option ${v == (m.size || 1) ? 'selected' : ''}>${v}</option>`).join('')}</select></label></div>
      <div class="row"><label class="field"><span>${t('AC')}</span><input data-mk="ca" data-num type="number" value="${m.ca}"></label>
        <label class="field"><span>${t('Average HP')}</span><input data-mk="hp" data-num type="number" value="${m.hp}"></label>
        <label class="field"><span>${t('HP formula')}</span><input data-mk="hpFormula" value="${esc(m.hpFormula)}" style="width:100px"></label>
        <label class="field"><span>${t('Speed')}</span><input data-mk="vitesse" value="${esc(m.vitesse)}"></label></div></div>
    <div class="col"><div class="row"><input id="mo-n" type="number" value="1" min="1" style="width:50px"><button class="primary" id="mo-fight"><i class="ico i-combat"></i> ${t('Add to combat')}</button></div>
      <button id="mo-dup">${t('Duplicate')}</button><button class="danger" id="mo-del"><i class="ico i-trash"></i> ${t('Delete')}</button></div></div>
  <div class="stats">${STATS.map(s => `<div class="stat"><span class="ab">${abbr(s)}</span><span class="md" data-roll="1d20${fmod(mod(m.stats[s]))}" data-label="${t('{ability} check', { ability: STAT_NAMES[s] })}" data-who="${esc(m.name)}">${fmod(mod(m.stats[s]))}</span><input data-mk="stats.${s}" data-num type="number" value="${m.stats[s]}"></div>`).join('')}</div>
  <div class="grid2"><div class="card"><h4><i class="ico i-combat"></i> ${t('Attacks')}</h4><table class="t"><tr><th>${t('Name')}</th><th>${t('To hit')}</th><th>${t('Damage')}</th><th>${t('Type / effect')}</th><th></th></tr>
    ${m.attacks.map((a, i) => `<tr><td><input data-mk="attacks.${i}.name" value="${esc(a.name)}"></td><td style="width:56px"><input data-mk="attacks.${i}.bonus" data-num value="${a.bonus}"></td>
      <td style="width:80px"><input data-mk="attacks.${i}.damage" value="${esc(a.damage)}"></td><td><input data-mk="attacks.${i}.type" value="${esc(a.type)}"></td>
      <td style="white-space:nowrap"><button class="small primary" data-matk="${i}"><i class="ico i-dice"></i></button><button class="small icon" data-mdel="${i}">✕</button></td></tr>`).join('')}</table>
    <button class="small" id="mo-addatk" style="margin-top:6px">+ ${t('attack')}</button></div>
    <div class="card"><h4><i class="ico i-sparkle"></i> ${t('Traits')} <span class="muted small">(${t('markdown, **bold**')})</span></h4><textarea data-mk="traits" data-live rows="8">${esc(m.traits)}</textarea>
    <div class="md-view small">${md(m.traits)}</div></div></div>`;
  const save = redraw => { saveMon(m); if (redraw) { drawMonSheet(); drawMonList(); } };
  $('#mo-view', el).onclick = () => { monEdit = false; drawMonSheet(); };
  $$('[data-mk]', el).forEach(i => {
    const live = i.hasAttribute('data-live');
    i.addEventListener(live ? 'input' : 'change', () => {
      let v = i.value; if (i.hasAttribute('data-num')) v = num(v);
      setPath(m, i.dataset.mk, v); if (i.dataset.mk === 'cr') m.xp = CR_XP[v] ?? m.xp;
      save(!live);
    });
  });
  dropImage($('#mo-portrait', el), r => { m.portrait = r.url; save(true); });
  $('#mo-fight', el).onclick = () => { addMonsterToCombat(m, Math.max(1, num($('#mo-n', el).value, 1))); toast(`<i class="ico i-combat"></i> ${t('{name} added to the combat.', { name: esc(m.name) })}`); };
  $('#mo-dup', el).onclick = () => { const c = JSON.parse(JSON.stringify(m)); c.id = slug(m.name) + '-' + Math.random().toString(36).slice(2, 5); c.name = t('{name} (copy)', { name: m.name }); S.mons[c.id] = c; saveMon(c); selMon = c.id; rerender(); };
  $('#mo-del', el).onclick = () => confirmBox(t('Delete {name} from the bestiary?', { name: esc(m.name) }), async () => { delete S.mons[m.id]; await api('DELETE', '/api/monster/' + m.id); selMon = null; rerender(); });
  $$('[data-matk]', el).forEach(b => b.onclick = () => { const a = m.attacks[+b.dataset.matk]; attackRoll({ who: m.name, name: a.name, bonus: a.bonus, damage: a.damage, type: a.type }); });
  $$('[data-mdel]', el).forEach(b => b.onclick = () => { m.attacks.splice(+b.dataset.mdel, 1); save(true); });
  $('#mo-addatk', el).onclick = () => { m.attacks.push({ name: t('Attack'), bonus: 4, damage: '1d6+2', type: '' }); save(true); };
}
/* monster-manual style stat block */
function drawStatBlock(el, m) {
  const sz = (SIZE_NAMES[m.size || 1] || '').replace('size:', '');
  const saves = STATS.map(s => mod(m.stats?.[s]));
  el.innerHTML = `<div class="statblock-wrap">
    <div class="statblock">
      <div class="sb-head"><div><h2>${esc(m.name)}</h2><div class="sb-sub">${esc(termLead(m.type) || t('Creature'))}${sz ? ', ' + t('size {size}', { size: sz }) : ''}</div></div>
        <div class="sb-tools"><button class="small" id="sb-edit"><i class="ico i-quill"></i> ${t('Edit')}</button></div></div>
      <div class="sb-rule"></div>
      <div class="sb-line"><b>${t('Armor Class')}</b> ${m.ca}</div>
      <div class="sb-line"><b>${t('Hit Points')}</b> ${m.hp}${m.hpFormula ? ` (<span class="droll" data-roll="${esc(m.hpFormula)}" data-label="${t('HP')}" data-who="${esc(m.name)}">${esc(m.hpFormula)}</span>)` : ''}</div>
      <div class="sb-line"><b>${t('Speed')}</b> ${esc(m.vitesse || '—')}</div>
      <div class="sb-rule"></div>
      <div class="sb-abil">${STATS.map((s, i) => `<div data-roll="1d20${fmod(saves[i])}" data-label="${t('{ability} check', { ability: STAT_NAMES[s] })}" data-who="${esc(m.name)}" title="${t('{ability} check', { ability: STAT_NAMES[s] })}"><b>${abbr(s)}</b><span>${m.stats?.[s] ?? 10} (${fmod(saves[i])})</span></div>`).join('')}</div>
      <div class="sb-rule"></div>
      <div class="sb-line"><b>${t('Challenge')}</b> ${esc(m.cr)} <span class="muted">(${(m.xp || CR_XP[m.cr] || 0).toLocaleString(LANG === 'fr' ? 'fr-FR' : 'en-US')} XP)</span></div>
      ${m.traits ? `<div class="sb-rule"></div><div class="sb-traits md-view">${md(m.traits)}</div>` : ''}
      <h3 class="sb-sec">${t('Actions')}</h3>
      ${(m.attacks || []).map((a, i) => `<div class="sb-act"><b><i>${esc(a.name)}.</i></b> <span class="muted">${t('Attack')}:</span> <span class="droll" data-matk2="${i}">${t('{n} to hit', { n: fmod(+a.bonus || 0) })}</span>,
        <span class="muted">${t('hit')}:</span> <span class="droll" data-roll="${esc(a.damage)}" data-label="${t('{name} damage', { name: esc(a.name) })}" data-who="${esc(m.name)}">${esc(a.damage)}</span> ${esc(termLead(a.type || ''))}.</div>`).join('') || `<div class="muted small">${t('No actions.')}</div>`}
      ${m.notes ? `<div class="sb-rule"></div><div class="small muted">${esc(m.notes)}</div>` : ''}
    </div>
    <div class="sb-side">
      <div class="sb-portrait ${m.portrait ? '' : 'empty-p'}" id="sb-portrait" style="${m.portrait ? `background-image:url('${esc(m.portrait)}')` : ''}" title="${t('Drop an image to replace it')}">${m.portrait ? '' : t('Drop an image')}</div>
      <div class="card col"><b>${t('Add to combat')}</b>
        <div class="row"><input id="sb-n" type="number" value="1" min="1" style="width:56px"><select id="sb-hp"><option value="avg">${t('average HP')}</option><option value="roll">${t('rolled HP')}</option></select></div>
        <label class="chk small"><input type="checkbox" id="sb-hid"> ${t('hidden from players')}</label>
        <button class="primary" id="sb-fight"><i class="ico i-combat"></i> ${t('Add')}</button></div>
      <div class="card col small"><b>${t('Quick reference')}</b>
        <span>${t('Saving throws')}: ${STATS.map((s, i) => `<span class="droll" data-roll="1d20${fmod(saves[i])}" data-label="${t('{ability} save', { ability: abbr(s) })}" data-who="${esc(m.name)}">${abbr(s)} ${fmod(saves[i])}</span>`).join(' · ')}</span>
        <span>${t('Passive Perception')} ≈ ${10 + mod(m.stats?.SAG)}</span></div>
    </div></div>`;
  $('#sb-edit', el).onclick = () => { monEdit = true; drawMonSheet(); };
  dropImage($('#sb-portrait', el), r => { m.portrait = r.url; saveMon(m); drawMonSheet(); drawMonList(); });
  $('#sb-fight', el).onclick = () => { const n = Math.max(1, num($('#sb-n', el).value, 1)); addMonsterToCombat(m, n, $('#sb-hp', el).value, $('#sb-hid', el).checked); toast(`<i class="ico i-combat"></i> ${t('{n} × {name} added to the combat.', { n, name: esc(m.name) })}`); };
  $$('[data-matk2]', el).forEach(b => b.onclick = e => { e.stopPropagation(); const a = m.attacks[+b.dataset.matk2]; attackRoll({ who: m.name, name: a.name, bonus: a.bonus, damage: a.damage, type: a.type }); });
}
TABS.bestiary = { render: renderBestiary };
