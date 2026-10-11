/* ===== Campaign journal & GM tools ===== */
'use strict';

let selNote = null, noteEdit = false;

/* ---------- prepared encounters ---------- */
function encounterDifficulty(specs) {
  const pcs = charList(), lv = pcs.map(c => c.niveau);
  const th = [0, 1, 2, 3].map(k => lv.reduce((s, l) => s + ENC_THRESHOLDS[clamp(l, 1, 20)][k], 0));
  const count = specs.reduce((s, x) => s + (x.n || 1), 0), base = specs.reduce((s, x) => s + (x.n || 1) * (S.mons[x.id]?.xp || 0), 0);
  let mi = count <= 1 ? 1 : count === 2 ? 2 : count <= 6 ? 3 : count <= 10 ? 4 : count <= 14 ? 5 : 6;
  if (lv.length < 3) mi++; else if (lv.length >= 6) mi--;
  const adj = Math.round(base * ENC_MULT[clamp(mi, 0, 7)]);
  const d = adj >= th[3] ? ['deadly', t('Deadly')] : adj >= th[2] ? ['hard', t('Hard')] : adj >= th[1] ? ['medium', t('Medium')] : ['easy', t('Easy')];
  return { base, adj, th, cls: d[0], label: d[1], count };
}
function encounterModal(enc) {
  const d = encounterDifficulty(enc.monsters || []), map = S.camp.maps.find(m => m.id === enc.map);
  const line = (x, ally) => { const mo = S.mons[x.id]; return `<li>${x.n || 1} × <b>${esc(mo?.name || t('{id} (not found)', { id: x.id }))}</b> ${mo ? `<span class="muted small">${t('CR')} ${esc(mo.cr)} · ${t('AC')} ${mo.ca} · ${mo.hp} ${t('HP')}${ally ? ' · ' + t('ally') : ` · ${(x.n || 1) * mo.xp} XP`}</span>` : ''}${x.hidden ? ` <span class="tag">${t('hidden')}</span>` : ''}</li>`; };
  modal(`<h3><i class="ico i-combat"></i> ${esc(enc.name)}</h3>
    <div class="muted small">${esc(enc.act || '')}${enc.level ? ' · ' + t('planned for level {n}', { n: enc.level }) : ''}${map ? ' · ' + t('map: {name}', { name: esc(map.name) }) : ''}</div>
    <div class="md-view small" style="margin-top:8px">${md(enc.desc || '')}</div>
    <h4>${t('Opponents')}</h4><ul>${(enc.monsters || []).map(x => line(x)).join('')}</ul>
    ${(enc.allies || []).length ? `<h4>${t('Allies')}</h4><ul>${enc.allies.map(x => line(x, true)).join('')}</ul>` : ''}
    <div>${t('Difficulty for the current party')}: <b class="diff-${d.cls}">${d.label}</b> <span class="muted small">(${t('adjusted XP {adj} · thresholds {th} · XP to earn {base}', { adj: d.adj, th: d.th.join(' / '), base: d.base })})</span></div>
    <div class="col" style="margin-top:10px">
      <label class="chk"><input type="checkbox" id="en-clear" checked> ${t('Remove the opponents of the current combat')}</label>
      <label class="chk"><input type="checkbox" id="en-pcs" checked> ${t('Add the characters')}</label>
      ${(enc.allies || []).length ? `<label class="chk"><input type="checkbox" id="en-allies" checked> ${t('Add the allies')}</label>` : ''}
      ${map ? `<label class="chk"><input type="checkbox" id="en-show" checked> ${t('Show the map to players and place the tokens')}</label>` : ''}
      <label class="row small">${t('Monster hit points')} <select id="en-hp"><option value="avg">${t('average')}</option><option value="roll">${t('rolled')}</option></select></label>
    </div>
    <div class="actions"><button id="en-done">${enc.done ? '↺ ' + t('Mark as to do') : '✔ ' + t('Mark as done')}</button><button data-close>${t('Close')}</button><button class="primary" id="en-go"><i class="ico i-combat"></i> ${t('Run the encounter')}</button></div>`, (box, close) => {
    $('#en-done', box).onclick = () => { enc.done = !enc.done; saveCamp(); close(); rerender(); };
    $('#en-go', box).onclick = () => {
      launchEncounter(enc, { clear: $('#en-clear', box).checked, pcs: $('#en-pcs', box).checked, allies: !!$('#en-allies', box)?.checked, show: !!$('#en-show', box)?.checked, hp: $('#en-hp', box).value });
      close();
    };
  });
}
function launchEncounter(enc, o) {
  const C = CB();
  if (o.clear) {
    const rm = new Set(C.list.filter(x => x.kind !== 'pc').map(x => x.uid));
    C.list = C.list.filter(x => x.kind === 'pc'); C.list.forEach(x => x.init = null);
    C.active = false; C.round = 0; C.turn = 0;
    S.camp.maps.forEach(m => m.tokens = m.tokens.filter(tk => !(tk.ref?.kind === 'cb' && rm.has(tk.ref.id))));
  }
  if (o.pcs) charList().forEach(c => { if (!C.list.some(x => x.kind === 'pc' && x.charId === c.id)) C.list.push({ uid: uid('cb'), kind: 'pc', charId: c.id, init: null, initMod: +c.initBonus || 0 }); });
  const placed = [], missing = [];
  for (const [list, kind] of [[enc.monsters || [], 'mon'], [o.allies ? enc.allies || [] : [], 'npc']]) {
    for (const spec of list) {
      const mo = S.mons[spec.id]; if (!mo) { missing.push(spec.id); continue; }
      placed.push([spec, addMonsterToCombat(mo, spec.n || 1, o.hp, kind === 'mon' && !!spec.hidden, kind)]);
    }
  }
  const map = S.camp.maps.find(m => m.id === enc.map);
  if (map && o.show) {
    S.camp.currentMap = map.id; S.camp.playerMap = map.id;
    const sp = enc.pcSpawn || { x: 2, y: 2 };
    if (o.pcs) charList().forEach(c => { const p = freeCell(map, sp.x, sp.y); placeToken(map, { kind: 'pc', id: c.id }, p.x, p.y); });
    for (const [spec, cbs] of placed) cbs.forEach(cb => { const p = freeCell(map, spec.x ?? sp.x + 3, spec.y ?? sp.y); placeToken(map, { kind: 'cb', id: cb.uid }, p.x, p.y); });
    if (map.fog?.on) for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) map.fog.rev[(sp.x + dx) + ',' + (sp.y + dy)] = 1;
    selTok = null;
  }
  logInfo(`<i class="ico i-book"></i> <b>${t('Encounter: {name}', { name: esc(enc.name) })}</b>`, true);
  if (missing.length) toast(t('Monsters not found in the bestiary: {list}', { list: esc(missing.join(', ')) }), 5000);
  saveCamp(); go('combat');
  toast(`<i class="ico i-combat"></i> ${t('Encounter ready: roll initiative, then "Start the combat".')}`, 4000);
}
function openMap(id) { const m = S.camp.maps.find(x => x.id === id); if (!m) return toast(t('Map not found.')); S.camp.currentMap = id; saveCamp(); go('map'); }
/* note markup: {{rencontre:id}}, {{carte:id}}, {{monstre:id}} (French tags kept for existing notes) and their English equivalents */
function richNote(src) {
  return md(src)
    .replace(/\{\{(?:rencontre|encounter):([\w-]+)\}\}/g, (m, id) => { const e = (S.camp.encounters || []).find(x => x.id === id); return e ? `<button class="primary small" data-enc="${id}"><i class="ico i-combat"></i> ${esc(e.name)}${e.done ? ' ✔' : ''}</button>` : m; })
    .replace(/\{\{(?:carte|map):([\w-]+)\}\}/g, (m, id) => { const c = S.camp.maps.find(x => x.id === id); return c ? `<button class="small" data-openmap="${id}"><i class="ico i-map"></i> ${esc(c.name)}</button>` : m; })
    .replace(/\{\{(?:monstre|monster):([\w-]+)\}\}/g, (m, id) => { const c = S.mons[id]; return c ? `<button class="small link" data-openmon="${id}"><i class="ico i-bestiary"></i> ${esc(c.name)}</button>` : m; });
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-enc],[data-openmap],[data-openmon]'); if (!b) return;
  if (b.dataset.enc) { const x = (S.camp.encounters || []).find(y => y.id === b.dataset.enc); x && encounterModal(x); }
  else if (b.dataset.openmap) openMap(b.dataset.openmap);
  else { selMon = b.dataset.openmon; go('bestiary'); }
});

function renderJournal(main) {
  const J = S.camp.journal, encs = S.camp.encounters || [];
  if (!J.notes.find(n => n.id === selNote)) { selNote = J.notes[0]?.id || null; noteEdit = false; }
  const n = J.notes.find(x => x.id === selNote);
  let lastAct = null;
  main.innerHTML = `<div class="split">
    <div class="side-list" style="max-height:calc(100vh - 80px);overflow:auto"><button class="primary" id="nt-new">+ ${t('New note')}</button>
      <div class="list">${J.notes.map(x => `<div class="li ${x.id === selNote ? 'sel' : ''}" data-nt="${x.id}"><div><b>${deEmoji(esc(x.title || t('Untitled')))}</b>${x.sub ? `<div class="muted small">${esc(x.sub)}</div>` : ''}</div></div>`).join('') || `<div class="muted small">${t('No notes.')}</div>`}</div>
      ${encs.length ? `<h4 style="margin-top:10px"><i class="ico i-combat"></i> ${t('Prepared encounters')}</h4><div class="list">${encs.map(x => {
        const head = x.act !== lastAct ? `<div class="muted small" style="margin-top:4px">${esc(x.act || '')}</div>` : ''; lastAct = x.act;
        return head + `<div class="li" data-enc="${x.id}" style="${x.done ? 'opacity:.55' : ''}"><span>${x.done ? '✔' : '<i class="ico i-combat"></i>'}</span><div class="grow small"><b>${deEmoji(esc(x.name))}</b></div></div>`;
      }).join('')}</div>` : ''}
    </div>
    <div class="sheet"><div class="grid2" style="grid-template-columns:minmax(0,2fr) minmax(0,1fr)">
      <div class="card col">${!n ? `<div class="empty">${t('Create a session note.')}</div>` : noteEdit ? `
        <div class="row"><input id="nt-title" class="name-in" style="font-size:1.3rem;flex:1" value="${esc(n.title)}" placeholder="${t('Title')}"><button class="primary small" id="nt-ok">✔ ${t('Done')}</button><button class="danger small" id="nt-del" title="${t('Delete')}"><i class="ico i-trash"></i></button></div>
        <textarea id="nt-body" rows="30" style="font-family:monospace;font-size:.85rem">${esc(n.body)}</textarea>
        <div class="row"><button class="small" id="nt-log"><i class="ico i-list"></i> ${t('Insert recent events')}</button><span class="muted small">${t('Markdown: ## heading, **bold**, > read-aloud text, - list, {{encounter:id}}, {{map:id}}')}</span></div>`
        : `<div class="row"><h2 style="margin:0;flex:1">${deEmoji(esc(n.title))}</h2><button class="small" id="nt-show" title="${t('Show an excerpt on the players\' screens')}"><i class="ico i-announce"></i> ${t('Show')}</button><button class="small" id="nt-edit"><i class="ico i-quill"></i> ${t('Edit')}</button></div>
        <div class="md-view note-view">${richNote(n.body) || `<span class="muted">${t('Empty note.')}</span>`}</div>`}</div>
      <div class="col">
        <div class="card"><h4><i class="ico i-target"></i> ${t('Quests')}</h4><div class="col">${J.quests.map((q, i) => `<div class="row" style="flex-wrap:nowrap;align-items:flex-start"><input type="checkbox" data-qd="${i}" ${q.done ? 'checked' : ''}><span class="grow small" style="${q.done ? 'text-decoration:line-through;opacity:.6' : ''}">${esc(q.t)}</span><button class="small icon ${q.pub ? 'on' : ''}" data-qp="${i}" title="${q.pub ? t('Visible to players') : t('Hidden from players')}">${q.pub ? '<i class="ico i-eye"></i>' : '<i class="ico i-hidden"></i>'}</button><button class="small icon" data-qx="${i}">✕</button></div>`).join('')}</div>
          <input id="q-new" placeholder="+ ${t('new quest (Enter)')}" style="width:100%;margin-top:6px"></div>
        <div class="card"><h4><i class="ico i-party"></i> ${t('NPCs')}</h4><div class="col">${J.npcs.map((p, i) => `<details><summary><b>${esc(p.name)}</b> <span class="muted small">${esc(p.role || '')}</span></summary>
          <textarea data-npc="${i}" rows="5" class="small">${esc(p.desc || '')}</textarea>
          <label class="chk small"><input type="checkbox" data-npcp="${i}" ${p.pub ? 'checked' : ''}> ${t('known to the players')}</label>
          ${p.pub ? `<input data-npcpd="${i}" class="small" value="${esc(p.pubDesc || '')}" placeholder="${t('What the players know about them')}" style="width:100%">` : ''}
          <button class="small danger" data-npcx="${i}">${t('Delete')}</button></details>`).join('')}</div>
          <button class="small" id="npc-new" style="margin-top:6px">+ ${t('NPC')}</button></div>
      </div></div></div></div>`;
  const save = () => saveCamp();
  $('#nt-new').onclick = () => { const x = { id: uid('nt'), title: t('Session {n}', { n: J.notes.length + 1 }), date: Date.now(), body: '' }; J.notes.push(x); selNote = x.id; noteEdit = true; save(); rerender(); };
  $$('[data-nt]').forEach(d => d.onclick = () => { selNote = d.dataset.nt; noteEdit = false; rerender(); $('#main').scrollTop = 0; });
  if (n && noteEdit) {
    $('#nt-title').oninput = e => { n.title = e.target.value; save(); };
    $('#nt-body').oninput = e => { n.body = e.target.value; save(); };
    $('#nt-ok').onclick = () => { noteEdit = false; rerender(); };
    $('#nt-del').onclick = () => confirmBox(t('Delete this note?'), () => { J.notes = J.notes.filter(x => x.id !== n.id); save(); rerender(); });
    $('#nt-log').onclick = () => {
      const txt = S.camp.log.slice(0, 40).reverse().map(e => '- ' + (e.kind === 'info' ? e.text.replace(/<[^>]+>/g, '') : `${e.who || ''} ${e.label || e.expr} : ${e.total}`)).join('\n');
      n.body += (n.body ? '\n\n' : '') + txt; save(); rerender();
    };
  } else if (n) {
    $('#nt-edit').onclick = () => { noteEdit = true; rerender(); };
    $('#nt-show').onclick = () => { const sel = String(getSelection() || '').trim(); handoutModal({ title: n.title, body: sel || '' }); };
  }
  $('#q-new').onkeydown = e => { if (e.key === 'Enter' && e.target.value.trim()) { J.quests.push({ t: e.target.value.trim(), done: false }); save(); rerender(); setTimeout(() => $('#q-new')?.focus()); } };
  $$('[data-qd]').forEach(c => c.onchange = () => { J.quests[+c.dataset.qd].done = c.checked; save(); rerender(); });
  $$('[data-qx]').forEach(b => b.onclick = () => { J.quests.splice(+b.dataset.qx, 1); save(); rerender(); });
  $$('[data-qp]').forEach(b => b.onclick = () => { const q = J.quests[+b.dataset.qp]; q.pub = !q.pub; save(); rerender(); });
  $$('[data-npcp]').forEach(c => c.onchange = () => { J.npcs[+c.dataset.npcp].pub = c.checked; save(); rerender(); });
  $$('[data-npcpd]').forEach(i => i.oninput = () => { J.npcs[+i.dataset.npcpd].pubDesc = i.value; save(); });
  $('#npc-new').onclick = () => ask(t('New NPC'), [{ k: 'name', label: t('Name'), value: randomName() }, { k: 'role', label: t('Role (innkeeper, villain…)') }, { k: 'desc', label: t('Description'), type: 'textarea' }], o => { if (o.name) { J.npcs.push(o); save(); rerender(); } });
  $$('[data-npc]').forEach(x => x.oninput = () => { J.npcs[+x.dataset.npc].desc = x.value; save(); });
  $$('[data-npcx]').forEach(b => b.onclick = () => { J.npcs.splice(+b.dataset.npcx, 1); save(); rerender(); });
}

/* ---------- message / image shown to players ---------- */
function handoutModal(pre = {}) {
  let img = pre.img || '';
  modal(`<h3><i class="ico i-announce"></i> ${t('Show to players')}</h3><form class="col" id="ho-f">
    <label class="field"><span>${t('Title')}</span><input name="title" value="${esc(pre.title || '')}" placeholder="${t('A sealed letter…')}"></label>
    <label class="field"><span>${t('Text (markdown)')}</span><textarea name="body" rows="8" placeholder="${t('What the players read. Tip: select a passage of a note before clicking "Show".')}">${esc(pre.body || '')}</textarea></label>
    <div class="dropzone" id="ho-img">${img ? `<img src="${esc(img)}" style="max-width:100%;max-height:160px">` : `<i class="ico i-image"></i> ${t('Drop an image (illustration, letter, portrait…) or click')}`}</div>
    <div class="actions">${S.camp.handout ? `<button type="button" id="ho-clear" class="danger">${t('Remove the displayed message')}</button>` : ''}<button type="button" data-close>${t('Cancel')}</button><button class="primary"><i class="ico i-announce"></i> ${t('Display to players')}</button></div></form>`, (box, close) => {
    dropImage($('#ho-img', box), r => { img = r.url; $('#ho-img', box).innerHTML = `<img src="${esc(img)}" style="max-width:100%;max-height:160px">`; });
    $('#ho-clear', box) && ($('#ho-clear', box).onclick = () => { S.camp.handout = null; saveCamp(); close(); toast(t('Message removed.')); });
    $('#ho-f', box).onsubmit = e => {
      e.preventDefault(); const fd = new FormData(e.target);
      if (!fd.get('title') && !fd.get('body') && !img) return toast(t('Nothing to show.'));
      S.camp.handout = { t: Date.now(), title: fd.get('title'), body: fd.get('body'), img };
      logInfo(`<i class="ico i-announce"></i> ${t('Shown to players: {title}', { title: `<b>${esc(fd.get('title') || t('message'))}</b>` })}`, true);
      saveCamp(); close(); toast(`<i class="ico i-announce"></i> ${t("Displayed on the players' screens.")}`);
    };
  });
}

/* ---------- tools ---------- */
/* XP thresholds per character level: easy, medium, hard, deadly */
const ENC_THRESHOLDS = { 1: [25, 50, 75, 100], 2: [50, 100, 150, 200], 3: [75, 150, 225, 400], 4: [125, 250, 375, 500], 5: [250, 500, 750, 1100], 6: [300, 600, 900, 1400], 7: [350, 750, 1100, 1700], 8: [450, 900, 1400, 2100], 9: [550, 1100, 1600, 2400], 10: [600, 1200, 1900, 2800], 11: [800, 1600, 2400, 3600], 12: [1000, 2000, 3000, 4500], 13: [1100, 2200, 3400, 5100], 14: [1250, 2500, 3800, 5700], 15: [1400, 2800, 4300, 6400], 16: [1600, 3200, 4800, 7200], 17: [2000, 3900, 5900, 8800], 18: [2100, 4200, 6300, 9500], 19: [2400, 4900, 7300, 10900], 20: [2800, 5700, 8500, 12700] };
const ENC_MULT = [0.5, 1, 1.5, 2, 2.5, 3, 4, 5];
const SYLLABLES = {
  human: [['Al', 'Bran', 'Ced', 'Dar', 'El', 'Gar', 'Hal', 'Is', 'Jor', 'Mar', 'Ro', 'Ser', 'Tom', 'Wil'], ['ric', 'an', 'wyn', 'eth', 'ias', 'old', 'mund', 'en', 'ard', 'ine', 'a', 'elle']],
  elf: [['Ae', 'Cael', 'Ela', 'Fae', 'Gal', 'Ith', 'Lae', 'Mir', 'Syl', 'Thal', 'Vae'], ['riel', 'wen', 'thas', 'lindë', 'nor', 'vyr', 'iel', 'anor', 'ssa']],
  dwarf: [['Bal', 'Dur', 'Gim', 'Kor', 'Thor', 'Bru', 'Dor', 'Har', 'Mor'], ['in', 'gar', 'dak', 'rim', 'grun', 'bek', 'dun', 'li']],
  goblin: [['Sn', 'Gr', 'Kr', 'Zz', 'Bl', 'Sk', 'Gn', 'Fl'], ['ik', 'ag', 'ub', 'oz', 'ix', 'urk', 'eek', 'az']],
  orc: [['Gro', 'Thra', 'Ug', 'Mok', 'Dur', 'Ghaz', 'Kra'], ['mash', 'gul', 'thak', 'nar', 'grim', 'buk']],
};
const RACE_NAMES = { human: t('human'), elf: t('elf'), dwarf: t('dwarf'), goblin: t('goblin'), orc: t('orc') };
const pick = a => a[Math.floor(Math.random() * a.length)];
function randomName(race) { const s = SYLLABLES[race] || SYLLABLES[pick(Object.keys(SYLLABLES))]; return pick(s[0]) + pick(s[1]); }
const GENERATORS = {
  en: {
    taverns: [['The Drunken', 'The Golden', 'The Laughing', 'The One-Eyed', 'The Black', 'The Smoking', 'The Sleeping', 'The Rusty'], ['Dragon', 'Boar', 'Tankard', 'Goblin', 'Unicorn', 'Raven', 'Lantern', 'Fox']],
    loot: ['a purse of {d6*10} gp', 'a gem worth {d4*25} gp', 'a potion of healing (2d4+2)', 'a torn treasure map', 'a 1st-level spell scroll', 'a finely crafted dagger (25 gp)', 'a bone key carved with runes', '{d20} sp and {d10} gp', 'a letter sealed by a noble', 'a strange amulet that whispers at night', 'a silver ring (50 gp)', 'a vial of poison (1d4 doses)'],
    hooks: ['A child asks for help: their brother went missing near the old mill.', 'A caravan arrives in town; the merchants are terrified and refuse to talk.', 'A strange black lantern is seen in the forest every night.', 'The local priest offers a reward for a stolen artifact.', 'A corpse is found with a symbol carved into its palm.', 'A storm forces the party to shelter in a remote inn… full of secrets.', "An old enemy of one of the characters reappears, alive and well.", 'Every animal in the region is fleeing in the same direction.'],
  },
  fr: {
    taverns: [['Le Dragon', 'Le Sanglier', 'La Chope', 'Le Gobelin', 'La Licorne', 'Le Corbeau', 'La Lanterne', 'Le Renard'], ['ivre', 'd\'or', 'qui rit', 'borgne', 'noire', 'fumant', 'endormi', 'rouillé']],
    loot: ['une bourse de {d6*10} po', 'une gemme d\'une valeur de {d4*25} po', 'une potion de soins (2d4+2)', 'une carte au trésor déchirée', 'un parchemin de sort de niveau 1', 'une dague finement ouvragée (25 po)', 'une clé en os gravée de runes', '{d20} pa et {d10} po', 'une lettre scellée d\'un noble', 'une amulette étrange qui murmure la nuit', 'un anneau en argent (50 po)', 'une fiole de poison (1d4 doses)'],
    hooks: ['Un enfant vient demander de l\'aide : son frère a disparu près du vieux moulin.', 'Une caravane arrive en ville, les marchands sont terrorisés et refusent de parler.', 'Une étrange lanterne noire est aperçue dans la forêt chaque nuit.', 'Le prêtre local propose une récompense pour un artefact volé.', 'Un cadavre est retrouvé avec un symbole gravé sur la paume.', 'Une tempête oblige le groupe à se réfugier dans une auberge isolée… pleine de secrets.', 'Un ancien ennemi d\'un personnage réapparaît, bien vivant.', 'Les animaux de la région fuient tous dans la même direction.'],
  },
};
const GEN = GENERATORS[LANG] || GENERATORS.en;
const fillLoot = s => s.replace(/\{d(\d+)(?:\*(\d+))?\}/g, (m, d, k) => rnd(+d) * (+k || 1));

let encMons = [];
function renderTools(main) {
  const pcs = charList(), loc = LANG === 'fr' ? 'fr-FR' : 'en-US';
  main.innerHTML = `<div class="grid2">
    <div class="card"><h3><i class="ico i-scales"></i> ${t('Encounter calculator')}</h3>
      <div class="row muted small">${t('Party')}: ${pcs.map(c => `${esc(c.name)} (${t('lvl {n}', { n: c.niveau })})`).join(', ') || t('no characters')}</div>
      <div class="row" style="margin-top:6px"><select id="enc-mon" style="flex:1"><option value="">+ ${t('add a monster…')}</option>${monList().map(m => `<option value="${m.id}">${esc(m.name)} (${t('CR')} ${m.cr}, ${m.xp} XP)</option>`).join('')}</select></div>
      <div id="enc-res" style="margin-top:8px"></div></div>
    <div class="card"><h3><i class="ico i-dice"></i> ${t('Generators')}</h3>
      <div class="row"><select id="gn-race">${Object.keys(SYLLABLES).map(r => `<option value="${r}">${RACE_NAMES[r]}</option>`).join('')}</select><button id="gn-name">${t('NPC name')}</button><button id="gn-tav">${t('Inn name')}</button><button id="gn-loot">${t('Loot')}</button><button id="gn-hook">${t('Story hook')}</button></div>
      <div id="gn-out" class="col" style="margin-top:8px"></div></div>
    <div class="card"><h3><i class="ico i-xp"></i> ${t('Advancement (XP)')}</h3><table class="t"><tr><th>${t('Level')}</th><th>XP</th><th>${t('Proficiency')}</th><th>${t('Characters')}</th></tr>
      ${XP_TABLE.map((x, i) => `<tr><td>${i + 1}</td><td>${x.toLocaleString(loc)}</td><td>${fmod(profForLevel(i + 1))}</td><td>${pcs.filter(c => c.niveau === i + 1).map(c => esc(c.name)).join(', ')}</td></tr>`).join('')}</table></div>
    <div class="card"><h3><i class="ico i-book"></i> ${t('Conditions')}</h3>${Object.entries(CONDITIONS).map(([k, v]) => `<div class="ref-cond"><b>${COND_ICONS[k] || ''} ${esc(condName(k))}</b> — ${esc(v)}</div>`).join('')}
      <h4 style="margin-top:12px">${t('Exhaustion')}</h4>${EXHAUSTION.slice(1).map((x, i) => `<div class="small">${i + 1}. ${x}</div>`).join('')}
      <h4 style="margin-top:12px">${t('Cover')}</h4><div class="small">${t('Half: +2 AC and DEX saves · Three-quarters: +5 · Total: cannot be targeted.')}</div>
      <h4 style="margin-top:12px">${t('Typical DCs')}</h4><div class="small">${t('Very easy 5 · Easy 10 · Medium 15 · Hard 20 · Very hard 25 · Nearly impossible 30')}</div></div>
    <div class="card"><h3><i class="ico i-palette"></i> ${t('Appearance')}</h3><p class="muted small">${t('8 understated themes and two languages (English, French). Each device keeps its own (players pick theirs from the map).')}</p>
      <div class="row"><button class="primary" id="ap-theme">${t('Choose a theme or language…')}</button></div>
      <p class="muted small" style="margin-top:8px">${t('Icons and monster portraits')}: <a href="https://game-icons.net" target="_blank" rel="noopener">game-icons.net</a> (Lorc, Delapouite, Skoll, Caro Asercion, DarkZaitzev, Carl Olsen) — CC BY 3.0. ${t('Spells')}: AideDD &amp; SRD 5.1.</p></div>
    <div class="card"><h3><i class="ico i-save"></i> ${t('Backup')}</h3><p class="muted small">${t('All data is saved automatically in <code>{dir}</code> (an archive is also made regularly, see the Campaigns tab). You can export the active campaign to a file.', { dir: esc(S.dataDir || '') })}</p>
      <div class="row"><button id="bk-exp">▼ ${t('Export the campaign (.json)')}</button><button id="bk-imp">▲ ${t('Import a backup')}</button></div></div>
  </div>`;
  $('#ap-theme').onclick = themeModal;
  const drawEnc = () => {
    const el = $('#enc-res'); const lv = pcs.map(c => c.niveau);
    const th = [0, 1, 2, 3].map(k => lv.reduce((s, l) => s + ENC_THRESHOLDS[clamp(l, 1, 20)][k], 0));
    const count = encMons.reduce((s, x) => s + x.n, 0), base = encMons.reduce((s, x) => s + x.n * (S.mons[x.id]?.xp || 0), 0);
    let mi = count <= 1 ? 1 : count === 2 ? 2 : count <= 6 ? 3 : count <= 10 ? 4 : count <= 14 ? 5 : 6;
    if (lv.length < 3) mi++; else if (lv.length >= 6) mi--;
    const adj = Math.round(base * ENC_MULT[clamp(mi, 0, 7)]);
    const diff = adj >= th[3] ? ['deadly', t('DEADLY')] : adj >= th[2] ? ['hard', t('Hard')] : adj >= th[1] ? ['medium', t('Medium')] : adj >= th[0] ? ['easy', t('Easy')] : ['easy', t('Trivial')];
    el.innerHTML = `${encMons.map((x, i) => `<div class="row"><input type="number" class="n2" data-en="${i}" value="${x.n}" min="0"> × ${esc(S.mons[x.id]?.name)} <span class="muted small">(${S.mons[x.id]?.xp} XP)</span><button class="small icon right" data-ex="${i}">✕</button></div>`).join('')}
      <div style="margin-top:8px">${t('Party thresholds')}: <span class="diff-easy">${t('easy')} ${th[0]}</span> · <span class="diff-medium">${t('medium')} ${th[1]}</span> · <span class="diff-hard">${t('hard')} ${th[2]}</span> · <span class="diff-deadly">${t('deadly')} ${th[3]}</span></div>
      ${count ? `<div style="margin-top:6px">${t('Base XP')} <b>${base}</b> × ${ENC_MULT[clamp(mi, 0, 7)]} = ${t('adjusted XP')} <b>${adj}</b> → <b class="diff-${diff[0]}" style="font-size:1.2rem">${diff[1]}</b></div>
      <div class="muted small">${t('XP earned per character')}: ${pcs.length ? Math.floor(base / pcs.length) : 0}</div>
      <div class="row" style="margin-top:6px"><button class="primary small" id="enc-go"><i class="ico i-combat"></i> ${t('Send to combat')}</button><button class="small" id="enc-clr">${t('Clear')}</button></div>` : ''}`;
    $$('[data-en]', el).forEach(i => i.onchange = () => { encMons[+i.dataset.en].n = Math.max(0, num(i.value)); drawEnc(); });
    $$('[data-ex]', el).forEach(b => b.onclick = () => { encMons.splice(+b.dataset.ex, 1); drawEnc(); });
    $('#enc-go', el) && ($('#enc-go', el).onclick = () => { encMons.forEach(x => x.n && S.mons[x.id] && addMonsterToCombat(S.mons[x.id], x.n)); toast(`<i class="ico i-combat"></i> ${t('Encounter added to the combat.')}`); go('combat'); });
    $('#enc-clr', el) && ($('#enc-clr', el).onclick = () => { encMons = []; drawEnc(); });
  };
  $('#enc-mon').onchange = e => { const id = e.target.value; if (!id) return; const x = encMons.find(y => y.id === id); x ? x.n++ : encMons.push({ id, n: 1 }); e.target.value = ''; drawEnc(); };
  drawEnc();
  const out = h => { $('#gn-out').insertAdjacentHTML('afterbegin', `<div class="le info">${h}</div>`); };
  $('#gn-name').onclick = () => out('<i class="ico i-player"></i> ' + esc(randomName($('#gn-race').value)));
  $('#gn-tav').onclick = () => out(`<i class="ico i-tankard"></i> “${esc(pick(GEN.taverns[0]) + ' ' + pick(GEN.taverns[1]))}”`);
  $('#gn-loot').onclick = () => out('<i class="ico i-purse"></i> ' + linkDice(esc(fillLoot(pick(GEN.loot)))));
  $('#gn-hook').onclick = () => out('<i class="ico i-scroll"></i> ' + esc(pick(GEN.hooks)));
  $('#bk-exp').onclick = () => {
    const blob = new Blob([JSON.stringify({ characters: S.chars, monsters: S.mons, campaign: S.camp }, null, 1)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `campaign-${new Date().toISOString().slice(0, 10)}.json`; a.click();
  };
  $('#bk-imp').onclick = () => {
    const i = document.createElement('input'); i.type = 'file'; i.accept = '.json,application/json';
    i.onchange = async () => {
      try {
        const d = JSON.parse(await i.files[0].text());
        confirmBox(t('Import this backup? Characters/monsters with the same identifier will be replaced and the campaign overwritten.'), async () => {
          for (const c of Object.values(d.characters || {})) await api('PUT', '/api/character/' + c.id, c);
          for (const m of Object.values(d.monsters || {})) await api('PUT', '/api/monster/' + m.id, m);
          if (d.campaign) await api('PUT', '/api/campaign', d.campaign);
          await loadAll(); renderLog(); toast(t('Backup imported.')); rerender();
        });
      } catch (e) { toast(t('Invalid file.')); }
    };
    i.click();
  };
}
TABS.journal = { render: renderJournal };
TABS.tools = { render: renderTools };
