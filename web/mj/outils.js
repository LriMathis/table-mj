/* ===== Journal de campagne & outils du MJ ===== */
'use strict';

let selNote = null, noteEdit = false;

/* ---------- rencontres préparées ---------- */
function encounterDifficulty(specs) {
  const pcs = charList(), lv = pcs.map(c => c.niveau);
  const th = [0, 1, 2, 3].map(k => lv.reduce((s, l) => s + ENC[clamp(l, 1, 20)][k], 0));
  const count = specs.reduce((s, x) => s + (x.n || 1), 0), base = specs.reduce((s, x) => s + (x.n || 1) * (S.mons[x.id]?.xp || 0), 0);
  let mi = count <= 1 ? 1 : count === 2 ? 2 : count <= 6 ? 3 : count <= 10 ? 4 : count <= 14 ? 5 : 6;
  if (lv.length < 3) mi++; else if (lv.length >= 6) mi--;
  const adj = Math.round(base * MULT[clamp(mi, 0, 7)]);
  const d = adj >= th[3] ? ['deadly', 'Mortelle'] : adj >= th[2] ? ['hard', 'Difficile'] : adj >= th[1] ? ['medium', 'Moyenne'] : ['easy', 'Facile'];
  return { base, adj, th, cls: d[0], label: d[1], count };
}
function encounterModal(enc) {
  const d = encounterDifficulty(enc.monsters || []), map = S.camp.maps.find(m => m.id === enc.map);
  const line = (x, ally) => { const mo = S.mons[x.id]; return `<li>${x.n || 1} × <b>${esc(mo?.name || x.id + ' (introuvable)')}</b> ${mo ? `<span class="muted small">FP ${esc(mo.cr)} · CA ${mo.ca} · ${mo.hp} PV${ally ? ' · allié' : ` · ${(x.n || 1) * mo.xp} XP`}</span>` : ''}${x.hidden ? ' <span class="tag">caché</span>' : ''}</li>`; };
  modal(`<h3><i class="ico i-combat"></i> ${esc(enc.name)}</h3>
    <div class="muted small">${esc(enc.act || '')}${enc.level ? ` · prévu pour le niveau ${enc.level}` : ''}${map ? ` · carte : ${esc(map.name)}` : ''}</div>
    <div class="md-view small" style="margin-top:8px">${md(enc.desc || '')}</div>
    <h4>Adversaires</h4><ul>${(enc.monsters || []).map(x => line(x)).join('')}</ul>
    ${(enc.allies || []).length ? `<h4>Alliés</h4><ul>${enc.allies.map(x => line(x, true)).join('')}</ul>` : ''}
    <div>Difficulté pour le groupe actuel : <b class="diff-${d.cls}">${d.label}</b> <span class="muted small">(XP ajustée ${d.adj} · seuils ${d.th.join(' / ')} · XP à gagner ${d.base})</span></div>
    <div class="col" style="margin-top:10px">
      <label class="chk"><input type="checkbox" id="en-clear" checked> Retirer les adversaires du combat en cours</label>
      <label class="chk"><input type="checkbox" id="en-pcs" checked> Ajouter les personnages</label>
      ${(enc.allies || []).length ? '<label class="chk"><input type="checkbox" id="en-allies" checked> Ajouter les alliés (Os et Os²…)</label>' : ''}
      ${map ? '<label class="chk"><input type="checkbox" id="en-show" checked> Afficher la carte aux joueurs et placer les pions</label>' : ''}
      <label class="row small">PV des monstres <select id="en-hp"><option value="avg">moyens</option><option value="roll">lancés</option></select></label>
    </div>
    <div class="actions"><button id="en-done">${enc.done ? '↺ Marquer à faire' : '✔ Marquer terminée'}</button><button data-close>Fermer</button><button class="primary" id="en-go"><i class="ico i-combat"></i> Lancer la rencontre</button></div>`, (box, close) => {
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
    S.camp.maps.forEach(m => m.tokens = m.tokens.filter(t => !(t.ref?.kind === 'cb' && rm.has(t.ref.id))));
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
  logInfo(`<i class="ico i-livre"></i> <b>Rencontre : ${esc(enc.name)}</b>`, true);
  if (missing.length) toast('Monstres introuvables dans le bestiaire : ' + esc(missing.join(', ')), 5000);
  saveCamp(); go('combat');
  toast('<i class="ico i-combat"></i> Rencontre prête : lancez l\'initiative puis « Commencer le combat ».', 4000);
}
function openMap(id) { const m = S.camp.maps.find(x => x.id === id); if (!m) return toast('Carte introuvable.'); S.camp.currentMap = id; saveCamp(); go('carte'); }
function richNote(src) {
  return md(src)
    .replace(/\{\{rencontre:([\w-]+)\}\}/g, (m, id) => { const e = (S.camp.encounters || []).find(x => x.id === id); return e ? `<button class="primary small" data-enc="${id}"><i class="ico i-combat"></i> ${esc(e.name)}${e.done ? ' ✔' : ''}</button>` : m; })
    .replace(/\{\{carte:([\w-]+)\}\}/g, (m, id) => { const c = S.camp.maps.find(x => x.id === id); return c ? `<button class="small" data-openmap="${id}"><i class="ico i-carte"></i> ${esc(c.name)}</button>` : m; })
    .replace(/\{\{monstre:([\w-]+)\}\}/g, (m, id) => { const c = S.mons[id]; return c ? `<button class="small link" data-openmon="${id}"><i class="ico i-bestiaire"></i> ${esc(c.name)}</button>` : m; });
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-enc],[data-openmap],[data-openmon]'); if (!b) return;
  if (b.dataset.enc) { const x = (S.camp.encounters || []).find(y => y.id === b.dataset.enc); x && encounterModal(x); }
  else if (b.dataset.openmap) openMap(b.dataset.openmap);
  else { selMon = b.dataset.openmon; go('bestiaire'); }
});

function renderJournal(main) {
  const J = S.camp.journal, encs = S.camp.encounters || [];
  if (!J.notes.find(n => n.id === selNote)) { selNote = J.notes[0]?.id || null; noteEdit = false; }
  const n = J.notes.find(x => x.id === selNote);
  let lastAct = null;
  main.innerHTML = `<div class="split">
    <div class="side-list" style="max-height:calc(100vh - 80px);overflow:auto"><button class="primary" id="nt-new">+ Nouvelle note</button>
      <div class="list">${J.notes.map(x => `<div class="li ${x.id === selNote ? 'sel' : ''}" data-nt="${x.id}"><div><b>${deEmoji(esc(x.title || 'Sans titre'))}</b>${x.sub ? `<div class="muted small">${esc(x.sub)}</div>` : ''}</div></div>`).join('') || '<div class="muted small">Aucune note.</div>'}</div>
      ${encs.length ? `<h4 style="margin-top:10px"><i class="ico i-combat"></i> Rencontres préparées</h4><div class="list">${encs.map(x => {
        const head = x.act !== lastAct ? `<div class="muted small" style="margin-top:4px">${esc(x.act || '')}</div>` : ''; lastAct = x.act;
        return head + `<div class="li" data-enc="${x.id}" style="${x.done ? 'opacity:.55' : ''}"><span>${x.done ? '✔' : '<i class="ico i-combat"></i>'}</span><div class="grow small"><b>${deEmoji(esc(x.name))}</b></div></div>`;
      }).join('')}</div>` : ''}
    </div>
    <div class="sheet"><div class="grid2" style="grid-template-columns:minmax(0,2fr) minmax(0,1fr)">
      <div class="card col">${!n ? '<div class="empty">Créez une note de session.</div>' : noteEdit ? `
        <div class="row"><input id="nt-title" class="name-in" style="font-size:1.3rem;flex:1" value="${esc(n.title)}" placeholder="Titre"><button class="primary small" id="nt-ok">✔ Terminer</button><button class="danger small" id="nt-del"><i class="ico i-poubelle"></i></button></div>
        <textarea id="nt-body" rows="30" style="font-family:monospace;font-size:.85rem">${esc(n.body)}</textarea>
        <div class="row"><button class="small" id="nt-log"><i class="ico i-liste"></i> Insérer les événements récents</button><span class="muted small">Markdown : ## titre, **gras**, > texte à lire, - liste, {{rencontre:id}}, {{carte:id}}</span></div>`
        : `<div class="row"><h2 style="margin:0;flex:1">${deEmoji(esc(n.title))}</h2><button class="small" id="nt-show" title="Afficher un extrait sur les écrans des joueurs"><i class="ico i-annonce"></i> Montrer</button><button class="small" id="nt-edit"><i class="ico i-plume"></i> Modifier</button></div>
        <div class="md-view note-view">${richNote(n.body) || '<span class="muted">Note vide.</span>'}</div>`}</div>
      <div class="col">
        <div class="card"><h4><i class="ico i-cible"></i> Quêtes</h4><div class="col">${J.quests.map((q, i) => `<div class="row" style="flex-wrap:nowrap;align-items:flex-start"><input type="checkbox" data-qd="${i}" ${q.done ? 'checked' : ''}><span class="grow small" style="${q.done ? 'text-decoration:line-through;opacity:.6' : ''}">${esc(q.t)}</span><button class="small icon ${q.pub ? 'on' : ''}" data-qp="${i}" title="${q.pub ? 'Visible par les joueurs' : 'Cachée aux joueurs'}">${q.pub ? '<i class="ico i-oeil"></i>' : '<i class="ico i-cache"></i>'}</button><button class="small icon" data-qx="${i}">✕</button></div>`).join('')}</div>
          <input id="q-new" placeholder="+ nouvelle quête (Entrée)" style="width:100%;margin-top:6px"></div>
        <div class="card"><h4><i class="ico i-groupe"></i> PNJ</h4><div class="col">${J.npcs.map((p, i) => `<details><summary><b>${esc(p.name)}</b> <span class="muted small">${esc(p.role || '')}</span></summary>
          <textarea data-npc="${i}" rows="5" class="small">${esc(p.desc || '')}</textarea>
          <label class="chk small"><input type="checkbox" data-npcp="${i}" ${p.pub ? 'checked' : ''}> connu des joueurs</label>
          ${p.pub ? `<input data-npcpd="${i}" class="small" value="${esc(p.pubDesc || '')}" placeholder="Ce que les joueurs savent de lui" style="width:100%">` : ''}
          <button class="small danger" data-npcx="${i}">Supprimer</button></details>`).join('')}</div>
          <button class="small" id="npc-new" style="margin-top:6px">+ PNJ</button></div>
      </div></div></div></div>`;
  const save = () => saveCamp();
  $('#nt-new').onclick = () => { const x = { id: uid('nt'), title: 'Session ' + (J.notes.length + 1), date: Date.now(), body: '' }; J.notes.push(x); selNote = x.id; noteEdit = true; save(); rerender(); };
  $$('[data-nt]').forEach(d => d.onclick = () => { selNote = d.dataset.nt; noteEdit = false; rerender(); $('#main').scrollTop = 0; });
  if (n && noteEdit) {
    $('#nt-title').oninput = e => { n.title = e.target.value; save(); };
    $('#nt-body').oninput = e => { n.body = e.target.value; save(); };
    $('#nt-ok').onclick = () => { noteEdit = false; rerender(); };
    $('#nt-del').onclick = () => confirmBox('Supprimer cette note ?', () => { J.notes = J.notes.filter(x => x.id !== n.id); save(); rerender(); });
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
  $('#npc-new').onclick = () => ask('Nouveau PNJ', [{ k: 'name', label: 'Nom', value: randomName() }, { k: 'role', label: 'Rôle (aubergiste, méchant…)' }, { k: 'desc', label: 'Description', type: 'textarea' }], o => { if (o.name) { J.npcs.push(o); save(); rerender(); } });
  $$('[data-npc]').forEach(t => t.oninput = () => { J.npcs[+t.dataset.npc].desc = t.value; save(); });
  $$('[data-npcx]').forEach(b => b.onclick = () => { J.npcs.splice(+b.dataset.npcx, 1); save(); rerender(); });
}

/* ---------- message / image montrés aux joueurs ---------- */
function handoutModal(pre = {}) {
  let img = pre.img || '';
  modal(`<h3><i class="ico i-annonce"></i> Montrer aux joueurs</h3><form class="col" id="ho-f">
    <label class="field"><span>Titre</span><input name="title" value="${esc(pre.title || '')}" placeholder="Une lettre scellée…"></label>
    <label class="field"><span>Texte (markdown)</span><textarea name="body" rows="8" placeholder="Ce que les joueurs lisent. Astuce : sélectionnez un passage d'une note avant de cliquer sur « Montrer ».">${esc(pre.body || '')}</textarea></label>
    <div class="dropzone" id="ho-img">${img ? `<img src="${esc(img)}" style="max-width:100%;max-height:160px">` : '<i class="ico i-image"></i> Glissez une image (illustration, lettre, portrait…) ou cliquez'}</div>
    <div class="actions">${S.camp.handout ? '<button type="button" id="ho-clear" class="danger">Retirer le message affiché</button>' : ''}<button type="button" data-close>Annuler</button><button class="primary"><i class="ico i-annonce"></i> Afficher chez les joueurs</button></div></form>`, (box, close) => {
    dropImage($('#ho-img', box), r => { img = r.url; $('#ho-img', box).innerHTML = `<img src="${esc(img)}" style="max-width:100%;max-height:160px">`; });
    $('#ho-clear', box) && ($('#ho-clear', box).onclick = () => { S.camp.handout = null; saveCamp(); close(); toast('Message retiré.'); });
    $('#ho-f', box).onsubmit = e => {
      e.preventDefault(); const fd = new FormData(e.target);
      if (!fd.get('title') && !fd.get('body') && !img) return toast('Rien à montrer.');
      S.camp.handout = { t: Date.now(), title: fd.get('title'), body: fd.get('body'), img };
      logInfo(`<i class="ico i-annonce"></i> Montré aux joueurs : <b>${esc(fd.get('title') || 'message')}</b>`, true);
      saveCamp(); close(); toast('<i class="ico i-annonce"></i> Affiché sur les écrans des joueurs.');
    };
  });
}

/* ---------- outils ---------- */
const ENC = { 1: [25, 50, 75, 100], 2: [50, 100, 150, 200], 3: [75, 150, 225, 400], 4: [125, 250, 375, 500], 5: [250, 500, 750, 1100], 6: [300, 600, 900, 1400], 7: [350, 750, 1100, 1700], 8: [450, 900, 1400, 2100], 9: [550, 1100, 1600, 2400], 10: [600, 1200, 1900, 2800], 11: [800, 1600, 2400, 3600], 12: [1000, 2000, 3000, 4500], 13: [1100, 2200, 3400, 5100], 14: [1250, 2500, 3800, 5700], 15: [1400, 2800, 4300, 6400], 16: [1600, 3200, 4800, 7200], 17: [2000, 3900, 5900, 8800], 18: [2100, 4200, 6300, 9500], 19: [2400, 4900, 7300, 10900], 20: [2800, 5700, 8500, 12700] };
const MULT = [0.5, 1, 1.5, 2, 2.5, 3, 4, 5];
const SYL = {
  humain: [['Al', 'Bran', 'Ced', 'Dar', 'El', 'Gar', 'Hal', 'Is', 'Jor', 'Mar', 'Ro', 'Ser', 'Tom', 'Wil'], ['ric', 'an', 'wyn', 'eth', 'ias', 'old', 'mund', 'en', 'ard', 'ine', 'a', 'elle']],
  elfe: [['Ae', 'Cael', 'Ela', 'Fae', 'Gal', 'Ith', 'Lae', 'Mir', 'Syl', 'Thal', 'Vae'], ['riel', 'wen', 'thas', 'lindë', 'nor', 'vyr', 'iel', 'anor', 'ssa']],
  nain: [['Bal', 'Dur', 'Gim', 'Kor', 'Thor', 'Bru', 'Dor', 'Har', 'Mor'], ['in', 'gar', 'dak', 'rim', 'grun', 'bek', 'dun', 'li']],
  gobelin: [['Sn', 'Gr', 'Kr', 'Zz', 'Bl', 'Sk', 'Gn', 'Fl'], ['ik', 'ag', 'ub', 'oz', 'ix', 'urk', 'eek', 'az']],
  orc: [['Gro', 'Thra', 'Ug', 'Mok', 'Dur', 'Ghaz', 'Kra'], ['mash', 'gul', 'thak', 'nar', 'grim', 'buk']],
};
const pick = a => a[Math.floor(Math.random() * a.length)];
function randomName(race) { const s = SYL[race] || SYL[pick(Object.keys(SYL))]; return pick(s[0]) + pick(s[1]); }
const TAVERNS = [['Le Dragon', 'Le Sanglier', 'La Chope', 'Le Gobelin', 'La Licorne', 'Le Corbeau', 'La Lanterne', 'Le Renard'], ['ivre', 'd\'or', 'qui rit', 'borgne', 'noire', 'fumant', 'endormi', 'rouillé']];
const LOOT = ['une bourse de {d6*10} po', 'une gemme d\'une valeur de {d4*25} po', 'une potion de soins (2d4+2)', 'une carte au trésor déchirée', 'un parchemin de sort de niveau 1', 'une dague finement ouvragée (25 po)', 'une clé en os gravée de runes', '{d20} pa et {d10} po', 'une lettre scellée d\'un noble', 'une amulette étrange qui murmure la nuit', 'un anneau en argent (50 po)', 'une fiole de poison (1d4 doses)'];
const HOOKS = ['Un enfant vient demander de l\'aide : son frère a disparu près du vieux moulin.', 'Une caravane arrive en ville, les marchands sont terrorisés et refusent de parler.', 'Une étrange lanterne noire est aperçue dans la forêt chaque nuit.', 'Le prêtre local propose une récompense pour un artefact volé.', 'Un cadavre est retrouvé avec un symbole gravé sur la paume.', 'Une tempête oblige le groupe à se réfugier dans une auberge isolée… pleine de secrets.', 'Un ancien ennemi d\'un personnage réapparaît, bien vivant.', 'Les animaux de la région fuient tous dans la même direction.'];
const fillLoot = s => s.replace(/\{d(\d+)(?:\*(\d+))?\}/g, (m, d, k) => rnd(+d) * (+k || 1));

let encMons = [];
function renderOutils(main) {
  const pcs = charList();
  main.innerHTML = `<div class="grid2">
    <div class="card"><h3><i class="ico i-balance"></i> Calculateur de rencontre</h3>
      <div class="row muted small">Groupe : ${pcs.map(c => `${esc(c.name)} (niv. ${c.niveau})`).join(', ') || 'aucun personnage'}</div>
      <div class="row" style="margin-top:6px"><select id="enc-mon" style="flex:1"><option value="">+ ajouter un monstre…</option>${monList().map(m => `<option value="${m.id}">${esc(m.name)} (FP ${m.cr}, ${m.xp} XP)</option>`).join('')}</select></div>
      <div id="enc-res" style="margin-top:8px"></div></div>
    <div class="card"><h3><i class="ico i-des"></i> Générateurs</h3>
      <div class="row"><select id="gn-race">${Object.keys(SYL).map(r => `<option>${r}</option>`).join('')}</select><button id="gn-name">Nom de PNJ</button><button id="gn-tav">Nom d'auberge</button><button id="gn-loot">Butin</button><button id="gn-hook">Accroche</button></div>
      <div id="gn-out" class="col" style="margin-top:8px"></div></div>
    <div class="card"><h3><i class="ico i-xp"></i> Progression (XP)</h3><table class="t"><tr><th>Niveau</th><th>XP</th><th>Maîtrise</th><th>Personnages</th></tr>
      ${XP_TABLE.map((x, i) => `<tr><td>${i + 1}</td><td>${x.toLocaleString('fr-FR')}</td><td>${fmod(profForLevel(i + 1))}</td><td>${pcs.filter(c => c.niveau === i + 1).map(c => esc(c.name)).join(', ')}</td></tr>`).join('')}</table></div>
    <div class="card"><h3><i class="ico i-livre"></i> États</h3>${Object.entries(CONDITIONS).map(([k, v]) => `<div class="ref-cond"><b>${COND_ICONS[k] || ''} ${k}</b> — ${esc(v)}</div>`).join('')}
      <h4 style="margin-top:12px">Épuisement</h4>${EXHAUSTION.slice(1).map((t, i) => `<div class="small">${i + 1}. ${t}</div>`).join('')}
      <h4 style="margin-top:12px">Couverture</h4><div class="small">Moitié : +2 CA et sauv. DEX · Trois quarts : +5 · Totale : ne peut être ciblé.</div>
      <h4 style="margin-top:12px">DD typiques</h4><div class="small">Très facile 5 · Facile 10 · Moyen 15 · Difficile 20 · Très difficile 25 · Quasi impossible 30</div></div>
    <div class="card"><h3><i class="ico i-palette"></i> Apparence</h3><p class="muted small">8 thèmes sobres : Taverne, Ardoise, Nuit, Forêt, Braise, Givre, Parchemin, Clair. Chaque appareil garde le sien (les joueurs choisissent le leur depuis la carte).</p>
      <div class="row"><button class="primary" id="ap-theme">Choisir un thème…</button></div>
      <p class="muted small" style="margin-top:8px">Icônes et portraits de monstres : <a href="https://game-icons.net" target="_blank" rel="noopener">game-icons.net</a> (Lorc, Delapouite, Skoll, Caro Asercion, DarkZaitzev, Carl Olsen) — licence CC BY 3.0. Sorts : AideDD &amp; SRD 5.1.</p></div>
    <div class="card"><h3><i class="ico i-sauver"></i> Sauvegarde</h3><p class="muted small">Toutes les données sont enregistrées automatiquement dans <code>${esc(S.dataDir || '')}</code> (une archive est aussi faite régulièrement, voir l'onglet Campagnes). Vous pouvez exporter la campagne active dans un fichier.</p>
      <div class="row"><button id="bk-exp">▼ Exporter la campagne (.json)</button><button id="bk-imp">▲ Importer une sauvegarde</button></div></div>
  </div>`;
  $('#ap-theme').onclick = themeModal;
  const drawEnc = () => {
    const el = $('#enc-res'); const lv = pcs.map(c => c.niveau);
    const th = [0, 1, 2, 3].map(k => lv.reduce((s, l) => s + ENC[clamp(l, 1, 20)][k], 0));
    const count = encMons.reduce((s, x) => s + x.n, 0), base = encMons.reduce((s, x) => s + x.n * (S.mons[x.id]?.xp || 0), 0);
    let mi = count <= 1 ? 1 : count === 2 ? 2 : count <= 6 ? 3 : count <= 10 ? 4 : count <= 14 ? 5 : 6;
    if (lv.length < 3) mi++; else if (lv.length >= 6) mi--;
    const adj = Math.round(base * MULT[clamp(mi, 0, 7)]);
    const diff = adj >= th[3] ? ['deadly', 'MORTELLE'] : adj >= th[2] ? ['hard', 'Difficile'] : adj >= th[1] ? ['medium', 'Moyenne'] : adj >= th[0] ? ['easy', 'Facile'] : ['easy', 'Triviale'];
    el.innerHTML = `${encMons.map((x, i) => `<div class="row"><input type="number" class="n2" data-en="${i}" value="${x.n}" min="0"> × ${esc(S.mons[x.id]?.name)} <span class="muted small">(${S.mons[x.id]?.xp} XP)</span><button class="small icon right" data-ex="${i}">✕</button></div>`).join('')}
      <div style="margin-top:8px">Seuils du groupe : <span class="diff-easy">facile ${th[0]}</span> · <span class="diff-medium">moyen ${th[1]}</span> · <span class="diff-hard">difficile ${th[2]}</span> · <span class="diff-deadly">mortel ${th[3]}</span></div>
      ${count ? `<div style="margin-top:6px">XP de base <b>${base}</b> × ${MULT[clamp(mi, 0, 7)]} = XP ajustée <b>${adj}</b> → <b class="diff-${diff[0]}" style="font-size:1.2rem">${diff[1]}</b></div>
      <div class="muted small">XP gagnée par personnage : ${pcs.length ? Math.floor(base / pcs.length) : 0}</div>
      <div class="row" style="margin-top:6px"><button class="primary small" id="enc-go"><i class="ico i-combat"></i> Envoyer au combat</button><button class="small" id="enc-clr">Vider</button></div>` : ''}`;
    $$('[data-en]', el).forEach(i => i.onchange = () => { encMons[+i.dataset.en].n = Math.max(0, num(i.value)); drawEnc(); });
    $$('[data-ex]', el).forEach(b => b.onclick = () => { encMons.splice(+b.dataset.ex, 1); drawEnc(); });
    $('#enc-go', el) && ($('#enc-go', el).onclick = () => { encMons.forEach(x => x.n && S.mons[x.id] && addMonsterToCombat(S.mons[x.id], x.n)); toast('<i class="ico i-combat"></i> Rencontre ajoutée au combat.'); go('combat'); });
    $('#enc-clr', el) && ($('#enc-clr', el).onclick = () => { encMons = []; drawEnc(); });
  };
  $('#enc-mon').onchange = e => { const id = e.target.value; if (!id) return; const x = encMons.find(y => y.id === id); x ? x.n++ : encMons.push({ id, n: 1 }); e.target.value = ''; drawEnc(); };
  drawEnc();
  const out = h => { $('#gn-out').insertAdjacentHTML('afterbegin', `<div class="le info">${h}</div>`); };
  $('#gn-name').onclick = () => out('<i class="ico i-joueur"></i> ' + esc(randomName($('#gn-race').value)));
  $('#gn-tav').onclick = () => out('<i class="ico i-chope"></i> « ' + pick(TAVERNS[0]) + ' ' + pick(TAVERNS[1]) + ' »');
  $('#gn-loot').onclick = () => out('<i class="ico i-bourse"></i> ' + linkDice(esc(fillLoot(pick(LOOT)))));
  $('#gn-hook').onclick = () => out('<i class="ico i-parchemin"></i> ' + esc(pick(HOOKS)));
  $('#bk-exp').onclick = () => {
    const blob = new Blob([JSON.stringify({ characters: S.chars, monsters: S.mons, campaign: S.camp }, null, 1)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `campagne-${new Date().toISOString().slice(0, 10)}.json`; a.click();
  };
  $('#bk-imp').onclick = () => {
    const i = document.createElement('input'); i.type = 'file'; i.accept = '.json,application/json';
    i.onchange = async () => {
      try {
        const d = JSON.parse(await i.files[0].text());
        confirmBox('Importer cette sauvegarde ? Les personnages/monstres de même identifiant seront remplacés et la campagne écrasée.', async () => {
          for (const c of Object.values(d.characters || {})) await api('PUT', '/api/character/' + c.id, c);
          for (const m of Object.values(d.monsters || {})) await api('PUT', '/api/monster/' + m.id, m);
          if (d.campaign) await api('PUT', '/api/campaign', d.campaign);
          await loadAll(); renderLog(); toast('Sauvegarde importée.'); rerender();
        });
      } catch (e) { toast('Fichier invalide.'); }
    };
    i.click();
  };
}
TABS.journal = { render: renderJournal };
TABS.outils = { render: renderOutils };
