/* ===== Onglet Carte (MJ) : cartes, grille, pions, brouillard, mesure ===== */
'use strict';

let MV = null, mapTool = 'move', selTok = null, fogBrush = 1;
const curMap = () => S.camp.maps.find(m => m.id === S.camp.currentMap) || null;
const saveMap = () => saveCamp();

function placeToken(m, ref, cx, cy, extra = {}) {
  // déplace le pion existant s'il y en a déjà un pour cette référence
  let t = ref && m.tokens.find(x => x.ref && x.ref.kind === ref.kind && x.ref.id === ref.id);
  if (t && ref.kind !== 'mon') { t.x = cx; t.y = cy; }
  else {
    t = { id: uid('tk'), x: cx, y: cy, size: 1, name: '', img: '', ref: ref || null, hidden: false, ...extra };
    if (ref?.kind === 'mon') { const mo = S.mons[ref.id]; t.name = mo?.name || ''; t.size = mo?.size || 1; }
    if (ref?.kind === 'cb') { const cb = CB().list.find(x => x.uid === ref.id); if (cb) { t.name = cb.name; t.kind = cb.kind; } if (cb?.hidden) t.hidden = true; if (cb?.monId) t.size = S.mons[cb.monId]?.size || 1; }
    m.tokens.push(t);
  }
  selTok = t.id; return t;
}
function freeCell(m, cx, cy) {
  for (let r = 0; r < 12; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const x = cx + dx, y = cy + dy;
    if (!m.tokens.some(t => Math.round(t.x) === x && Math.round(t.y) === y)) return { x, y };
  }
  return { x: cx, y: cy };
}
function viewCenterCell() {
  const r = MV.vp.getBoundingClientRect(), w = MV.toWorld(r.left + r.width / 2, r.top + r.height / 2), c = MV.toCell(w.x, w.y);
  return { x: Math.floor(c.cx), y: Math.floor(c.cy) };
}
function placeAllPCs() {
  const m = curMap(); if (!m) return; const c0 = viewCenterCell();
  charList().forEach(c => { if (!m.tokens.some(t => t.ref?.kind === 'pc' && t.ref.id === c.id)) { const p = freeCell(m, c0.x, c0.y); placeToken(m, { kind: 'pc', id: c.id }, p.x, p.y); } });
  saveMap(); drawMapSide(); MV.drawTokens();
}
function placeCombatants() {
  const m = curMap(); if (!m) return; const c0 = viewCenterCell();
  CB().list.forEach(cb => {
    if (cb.kind === 'pc') { if (!m.tokens.some(t => t.ref?.kind === 'pc' && t.ref.id === cb.charId)) { const p = freeCell(m, c0.x, c0.y); placeToken(m, { kind: 'pc', id: cb.charId }, p.x, p.y); } }
    else if (!m.tokens.some(t => t.ref?.kind === 'cb' && t.ref.id === cb.uid)) { const p = freeCell(m, c0.x + 4, c0.y); placeToken(m, { kind: 'cb', id: cb.uid }, p.x, p.y); }
  });
  saveMap(); drawMapSide(); MV.drawTokens();
}
async function createMapFromFile(file) {
  const r = await upload(file);
  const m = newMap(r.name || 'Carte', r.url);
  S.camp.maps.push(m); S.camp.currentMap = m.id; if (!S.camp.playerMap) S.camp.playerMap = m.id;
  saveMap(); selTok = null; MV.setMap(m, { fit: true }); drawMapSide();
  toast('<i class="ico i-carte"></i> Carte ajoutée. Ajustez la grille dans le panneau (ou outil « Calibrer »).');
}

function renderCarte(main) {
  main.innerHTML = `<div class="map-wrap"><div class="map-side" id="map-side"></div>
    <div class="map-vp tool-${mapTool}" id="map-vp"></div></div>`;
  MV && MV.destroy();
  MV = new MapView($('#map-vp'), {
    emptyText: 'Glissez une image JPEG/PNG ici pour créer une carte de combat',
    panOnLeft: e => mapTool === 'move' && !e.target.closest('.token'),
    selected: () => selTok,
    onView: () => debounce('mapview', saveMap, 1200),
    onDims: () => saveMap(),
  });
  MV.setMap(curMap());
  // HUD
  MV.vp.insertAdjacentHTML('beforeend', `<div class="map-title hidden" id="map-title"></div><div class="map-hud"><button id="mh-out" title="Dézoomer">－</button><span class="zl"></span><button id="mh-in" title="Zoomer">＋</button><button id="mh-fit" title="Ajuster à l'écran">⤢</button></div><div id="map-lbl"></div>`);
  MV.applyView();
  $('#mh-in').onclick = () => MV.zoom(1.25); $('#mh-out').onclick = () => MV.zoom(0.8); $('#mh-fit').onclick = () => MV.fit();
  bindMapVP(MV.vp);
  drawMapSide();
}
function drawMapSide() {
  const el = $('#map-side'); if (!el) return;
  const m = curMap(), g = m?.grid, t = m?.tokens.find(x => x.id === selTok), ti = t && tokenInfo(t);
  const tt = $('#map-title');
  if (tt) { tt.classList.toggle('hidden', !m); tt.innerHTML = m ? `<i class="ico i-carte"></i> ${esc(m.name)}${S.camp.playerMap === m.id ? ' <small><i class="ico i-oeil"></i> vue joueurs</small>' : ''}` : ''; }
  const pcs = charList(), cbs = CB().list.filter(x => x.kind !== 'pc');
  const onMap = ref => m && m.tokens.some(x => x.ref && x.ref.kind === ref.kind && x.ref.id === ref.id);
  el.innerHTML = `
  <div class="sec"><h4><i class="ico i-carte"></i> Cartes</h4>
    <select id="mp-sel"><option value="">— aucune —</option>${S.camp.maps.map(x => `<option value="${x.id}" ${x.id === S.camp.currentMap ? 'selected' : ''}>${esc(x.name)}${x.id === S.camp.playerMap ? ' (vue joueurs)' : ''}</option>`).join('')}</select>
    ${m ? `<div class="row"><button class="small" id="mp-ren">Renommer</button><button class="small" id="mp-img">Changer l'image</button><button class="small danger" id="mp-del"><i class="ico i-poubelle"></i></button></div>
      <button id="mp-show" class="${S.camp.playerMap === m.id ? 'on' : ''}" title="Carte affichée sur la vue joueurs"><i class="ico i-oeil"></i> ${S.camp.playerMap === m.id ? 'Montrée aux joueurs' : 'Montrer aux joueurs'}</button>
      <button class="small" id="mp-focus" title="Centre la vue joueurs sur ce que vous voyez"><i class="ico i-cible"></i> Envoyer ma vue aux joueurs</button>` : ''}
    <div class="dropzone" id="mp-drop"><i class="ico i-importer"></i> Glissez un JPEG ici<br>pour une <b>nouvelle carte</b><br><span class="small">(ou cliquez)</span></div>
  </div>
  <div class="sec"><h4><i class="ico i-groupe"></i> Joueurs connectés</h4>
    ${S.info?.distance ? (S.info.public ? `<span class="small"><b>À distance</b> — adresse à envoyer aux joueurs :</span><code class="small" style="user-select:all;color:var(--gold2);word-break:break-all">${esc(S.info.public)}</code><button class="small" id="pl-copy"><i class="ico i-lien"></i> Copier l'adresse</button>`
      : '<span class="muted small">Ouverture du tunnel pour la partie à distance…</span>') : ''}
    ${S.info?.reseau ? `<span class="small">Même Wi-Fi :</span>${(S.info.urls.length ? S.info.urls : ['http://<ip-du-pc>:' + S.info.port + '/joueurs']).map(u => `<code class="small" style="user-select:all;color:var(--gold2)">${esc(u)}</code>`).join('')}`
      : S.info?.distance ? '' : `<span class="muted small">Mode local. Pour que les joueurs se connectent : <code>./lancer_reseau.sh</code> (même Wi-Fi) ou <code>./lancer_distance.sh</code> (par Internet).</span>`}
    <div class="col small">${charList().map(c => `<span>${S.presence?.[c.id] != null ? '<span class="online">●</span>' : '<span class="muted">○</span>'} ${esc(c.name)}</span>`).join('')}</div>
    <label class="field"><span>Les joueurs peuvent déplacer leur pion</span><select id="pl-move">
      ${[['always', 'toujours'], ['turn', 'seulement à leur tour (en combat)'], ['off', 'jamais (bloqué)']].map(([v, l]) => `<option value="${v}" ${(S.camp.settings?.playerMove || 'always') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    <label class="field"><span>Attaques et sorts lancés par les joueurs</span><select id="pl-act">
      ${[['turn', 'à leur tour (en combat), libres hors combat'], ['always', 'à tout moment'], ['off', 'désactivés (le MJ lance)']].map(([v, l]) => `<option value="${v}" ${(S.camp.settings?.playerActions || 'turn') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    <label class="chk small"><input type="checkbox" id="pl-lvl" ${S.camp.settings?.playerLevelUp ? 'checked' : ''}> les joueurs font eux-mêmes leur montée de niveau</label>
    <button class="small" id="pl-msg"><i class="ico i-annonce"></i> Montrer un message / une image</button>
    <span class="muted small">Alt + clic sur la carte = signal visible par tous (les joueurs : appui long).</span>
  </div>
  ${m ? `
  <div class="sec"><h4><i class="ico i-outils"></i> Outils</h4>
    <div class="tools">${[['move', '<i class="ico i-main"></i> Déplacer'], ['ruler', '<i class="ico i-regle"></i> Règle'], ['reveal', '<i class="ico i-torche"></i> Révéler'], ['hide', '<i class="ico i-brouillard"></i> Cacher'], ['calib', '<i class="ico i-equerre"></i> Calibrer']].map(([k, l]) => `<button data-tool="${k}" class="${mapTool === k ? 'on' : ''}">${l}</button>`).join('')}</div>
    <span class="muted small">${{ move: 'Glissez les pions. Glisser le fond = déplacer la vue. Molette = zoom.', ruler: 'Glissez pour mesurer (diagonale = 1 case).', reveal: 'Peignez pour révéler le brouillard.', hide: 'Peignez pour remettre du brouillard.', calib: 'Tracez un rectangle sur UNE case de la carte pour caler la grille.' }[mapTool]} Clic droit / espace + glisser = déplacer la vue.</span>
    <label class="chk"><input type="checkbox" id="fog-on" ${m.fog.on ? 'checked' : ''}> Brouillard de guerre</label>
    ${m.fog.on ? `<div class="row"><span class="small">Pinceau</span><input type="range" id="fog-br" min="0" max="5" value="${fogBrush}" style="flex:1"><span class="small">${fogBrush * 2 + 1}×${fogBrush * 2 + 1}</span></div>
      <div class="row"><button class="small" id="fog-all">Tout révéler</button><button class="small" id="fog-none">Tout cacher</button></div>` : ''}
  </div>
  <div class="sec"><h4><i class="ico i-equerre"></i> Grille</h4>
    <div class="row"><label class="chk"><input type="checkbox" id="g-show" ${g.show ? 'checked' : ''}> afficher</label><label class="chk"><input type="checkbox" id="g-snap" ${g.snap ? 'checked' : ''}> aimanter</label></div>
    <div class="row"><span class="small" style="width:56px">Taille</span><input type="range" id="g-size" min="10" max="300" step="0.5" value="${g.size}" style="flex:1"><input id="g-sizen" type="number" step="0.5" value="${g.size}" style="width:58px"></div>
    <div class="row"><span class="small" style="width:56px">Décalage</span><input id="g-ox" type="number" value="${g.ox}" style="width:58px" title="X"><input id="g-oy" type="number" value="${g.oy}" style="width:58px" title="Y"></div>
    <div class="row"><span class="small" style="width:56px">Couleur</span><input type="color" id="g-col" value="${g.color}" style="width:40px;padding:0"><input type="range" id="g-al" min="0" max="1" step="0.05" value="${g.alpha}" style="flex:1"></div>
    <div class="row"><span class="small">1 case =</span><input id="g-m" type="number" step="0.5" value="${g.meters}" style="width:54px"><span class="small">m</span></div>
  </div>
  <div class="sec"><h4><i class="ico i-pion"></i> Pions</h4>
    <span class="muted small">Glissez un nom sur la carte, ou glissez une image directement sur la carte pour créer un pion.</span>
    <div class="row"><button class="small" id="tk-pcs">Placer les PJ</button><button class="small" id="tk-cbs">Placer les combattants</button><button class="small" id="tk-new">+ Pion</button></div>
    <b class="small">Personnages</b>
    ${pcs.map(c => `<div class="tok-src ${onMap({ kind: 'pc', id: c.id }) ? 'placed' : ''}" draggable="true" data-ref='{"kind":"pc","id":"${c.id}"}'>${avatarHTML(c)}<span>${esc(c.name)}</span></div>`).join('')}
    ${cbs.length ? `<b class="small">Combat</b>${cbs.map(cb => `<div class="tok-src ${onMap({ kind: 'cb', id: cb.uid }) ? 'placed' : ''}" draggable="true" data-ref='{"kind":"cb","id":"${cb.uid}"}'>${avatarHTML({ name: cb.name, portrait: cbPortrait(cb), color: cb.kind === 'npc' ? '#7a6a20' : '#7a2a2a' })}<span>${esc(cb.name)}</span>${cb.hp <= 0 ? ' <i class="ico i-mort"></i>' : ''}</div>`).join('')}` : ''}
    <details><summary class="small"><b>Bestiaire</b></summary>${monList().map(mo => `<div class="tok-src" draggable="true" data-ref='{"kind":"mon","id":"${mo.id}"}'>${avatarHTML({ name: mo.name, portrait: mo.portrait, color: '#7a2a2a' })}<span>${esc(mo.name)}</span></div>`).join('')}</details>
  </div>
  ${t ? `<div class="sec"><h4><i class="ico i-cible"></i> Pion : ${esc(ti.name)}</h4>
    ${!t.ref || t.ref.kind === 'mon' ? `<input id="tk-name" value="${esc(t.name)}" placeholder="Nom">` : ''}
    ${ti.hp != null ? `<div>${ti.hp}/${ti.hpMax} PV</div><div class="row"><input id="tk-amt" type="number" style="width:60px"><button class="small danger" id="tk-dmg">Dégâts</button><button class="small ok" id="tk-heal">Soins</button></div>` : ''}
    <div class="row"><span class="small">Taille</span><select id="tk-size">${[[0.5, 'Très petite (½)'], [1, 'P / M (1 case)'], [2, 'Grande (2×2)'], [3, 'Énorme (3×3)'], [4, 'Gigantesque (4×4)']].map(([v, l]) => `<option value="${v}" ${v == (t.size || 1) ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
    <label class="chk"><input type="checkbox" id="tk-hid" ${t.hidden ? 'checked' : ''}> caché aux joueurs</label>
    <div class="dropzone" id="tk-img" style="padding:6px"><i class="ico i-image"></i> Glissez une image pour ce pion</div>
    <div class="row">${t.img ? '<button class="small" id="tk-noimg">Retirer l\'image</button>' : ''}<input type="color" id="tk-col" value="${t.color && t.color.startsWith('#') ? t.color : '#555555'}" style="width:36px;padding:0" title="Couleur">
      <button class="small danger" id="tk-del">Retirer (Suppr)</button></div>
  </div>` : ''}` : ''}`;
  bindMapSide(el, m, t);
}
function bindMapSide(el, m, t) {
  const redraw = () => { saveMap(); MV.drawAll(); drawMapSide(); };
  $('#mp-sel', el).onchange = e => { S.camp.currentMap = e.target.value || null; selTok = null; saveMap(); MV.setMap(curMap()); drawMapSide(); };
  const dz = $('#mp-drop', el);
  dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('drop-hot'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('drop-hot'));
  dz.addEventListener('drop', e => { e.preventDefault(); e.stopPropagation(); dz.classList.remove('drop-hot'); const f = imageFiles(e.dataTransfer)[0]; if (f) createMapFromFile(f); });
  dz.onclick = () => { const i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*'; i.onchange = () => i.files[0] && createMapFromFile(i.files[0]); i.click(); };
  $('#pl-move', el).onchange = e => { S.camp.settings ??= {}; S.camp.settings.playerMove = e.target.value; saveMap(); };
  $('#pl-act', el).onchange = e => { S.camp.settings ??= {}; S.camp.settings.playerActions = e.target.value; saveMap(); };
  $('#pl-msg', el).onclick = () => handoutModal();
  $('#pl-copy', el) && ($('#pl-copy', el).onclick = () => navigator.clipboard.writeText(S.info.public).then(() => toast('Adresse copiée.'), () => toast('Copie impossible : sélectionnez l\'adresse.')));
  $('#pl-lvl', el).onchange = e => { S.camp.settings ??= {}; S.camp.settings.playerLevelUp = e.target.checked; saveMap(); };
  $$('.tok-src', el).forEach(s => s.addEventListener('dragstart', e => e.dataTransfer.setData('text/x-mj-ref', s.dataset.ref)));
  if (!m) return;
  $('#mp-ren', el).onclick = () => ask('Renommer la carte', [{ k: 'n', label: 'Nom', value: m.name }], o => { m.name = o.n || m.name; redraw(); });
  $('#mp-img', el).onclick = () => pickImage(r => { m.url = r.url; m.w = 0; saveMap(); MV.setMap(m, { fit: true }); });
  $('#mp-del', el).onclick = () => confirmBox(`Supprimer la carte « ${esc(m.name)} » ?`, () => {
    S.camp.maps = S.camp.maps.filter(x => x.id !== m.id); S.camp.currentMap = S.camp.maps[0]?.id || null;
    if (S.camp.playerMap === m.id) S.camp.playerMap = S.camp.currentMap;
    saveMap(); MV.setMap(curMap()); drawMapSide();
  });
  $('#mp-show', el).onclick = () => { S.camp.playerMap = m.id; saveMap(); drawMapSide(); toast('<i class="ico i-oeil"></i> Carte affichée sur la vue joueurs.'); };
  $('#mp-focus', el).onclick = () => {
    const r = MV.vp.getBoundingClientRect(), w = MV.toWorld(r.left + r.width / 2, r.top + r.height / 2);
    S.camp.playerFocus = { map: m.id, x: w.x, y: w.y, z: MV.view.z, span: r.width / MV.view.z, t: Date.now() }; S.camp.playerMap = m.id; saveMap(); toast('<i class="ico i-cible"></i> Vue envoyée aux joueurs.');
  };
  $$('[data-tool]', el).forEach(b => b.onclick = () => { mapTool = b.dataset.tool; MV.vp.className = 'map-vp tool-' + mapTool; drawMapSide(); });
  $('#fog-on', el).onchange = e => { m.fog.on = e.target.checked; redraw(); };
  $('#fog-br', el) && ($('#fog-br', el).oninput = e => { fogBrush = +e.target.value; drawMapSide(); });
  $('#fog-all', el) && ($('#fog-all', el).onclick = () => {
    const g = m.grid; m.fog.rev = {};
    for (let y = Math.floor(-g.oy / g.size); y < (m.h - g.oy) / g.size; y++) for (let x = Math.floor(-g.ox / g.size); x < (m.w - g.ox) / g.size; x++) m.fog.rev[x + ',' + y] = 1;
    redraw();
  });
  $('#fog-none', el) && ($('#fog-none', el).onclick = () => { m.fog.rev = {}; redraw(); });
  const g = m.grid, gset = (k, v) => { g[k] = v; saveMap(); MV.drawAll(); };
  $('#g-show', el).onchange = e => gset('show', e.target.checked);
  $('#g-snap', el).onchange = e => gset('snap', e.target.checked);
  $('#g-size', el).oninput = e => { $('#g-sizen', el).value = e.target.value; gset('size', +e.target.value); };
  $('#g-sizen', el).onchange = e => { $('#g-size', el).value = e.target.value; gset('size', Math.max(4, num(e.target.value, 70))); };
  $('#g-ox', el).onchange = e => gset('ox', num(e.target.value));
  $('#g-oy', el).onchange = e => gset('oy', num(e.target.value));
  $('#g-col', el).oninput = e => gset('color', e.target.value);
  $('#g-al', el).oninput = e => gset('alpha', +e.target.value);
  $('#g-m', el).onchange = e => gset('meters', num(e.target.value, 1.5));
  $('#tk-pcs', el).onclick = placeAllPCs;
  $('#tk-cbs', el).onclick = placeCombatants;
  $('#tk-new', el).onclick = () => ask('Nouveau pion', [{ k: 'name', label: 'Nom' }, { k: 'kind', label: 'Type', type: 'select', value: 'npc', options: [['npc', 'PNJ / objet'], ['mon', 'Adversaire'], ['pc', 'Allié']] }], o => {
    const c = viewCenterCell(), p = freeCell(m, c.x, c.y); placeToken(m, null, p.x, p.y, { name: o.name, kind: o.kind }); redraw();
  });
  if (!t) return;
  $('#tk-name', el) && ($('#tk-name', el).onchange = e => { t.name = e.target.value; redraw(); });
  const linked = () => { if (t.ref?.kind === 'pc') return { e: S.chars[t.ref.id], n: S.chars[t.ref.id]?.name, s: () => saveChar(S.chars[t.ref.id]) }; const cb = t.ref?.kind === 'cb' && CB().list.find(x => x.uid === t.ref.id); return cb ? { e: ent(cb), n: cbName(cb), s: () => cbSave(cb) } : null; };
  $('#tk-dmg', el) && ($('#tk-dmg', el).onclick = () => { const l = linked(); if (l) { dealDamage(l.e, num($('#tk-amt', el).value), l.n); l.s(); redraw(); } });
  $('#tk-heal', el) && ($('#tk-heal', el).onclick = () => { const l = linked(); if (l) { healEntity(l.e, num($('#tk-amt', el).value), l.n); l.s(); redraw(); } });
  $('#tk-size', el).onchange = e => { t.size = +e.target.value; redraw(); };
  $('#tk-hid', el).onchange = e => { t.hidden = e.target.checked; redraw(); };
  $('#tk-col', el).oninput = e => { t.color = e.target.value; saveMap(); MV.drawTokens(); };
  dropImage($('#tk-img', el), r => { t.img = r.url; redraw(); });
  $('#tk-noimg', el) && ($('#tk-noimg', el).onclick = () => { t.img = ''; redraw(); });
  $('#tk-del', el).onclick = () => { m.tokens = m.tokens.filter(x => x.id !== t.id); selTok = null; redraw(); };
}

function bindMapVP(vp) {
  const lbl = (html, x, y) => { let l = $('#map-lbl'); l.className = html ? 'ruler-lbl' : 'hidden'; l.innerHTML = html; const r = vp.getBoundingClientRect(); l.style.left = (x - r.left + 14) + 'px'; l.style.top = (y - r.top + 10) + 'px'; };
  vp.addEventListener('pointerdown', e => {
    const m = curMap(); if (!m || e.button !== 0 || MV.spaceDown) return;
    if (e.altKey) { e.preventDefault(); e.stopPropagation(); const w = MV.toWorld(e.clientX, e.clientY); api('POST', '/api/ping', { map: m.id, x: w.x, y: w.y, color: '#ff5a3c' }).catch(() => { }); return; }
    const tokEl = e.target.closest('.token'), w0 = MV.toWorld(e.clientX, e.clientY), c0 = MV.toCell(w0.x, w0.y), g = m.grid;
    if (mapTool === 'move' && tokEl) {
      e.preventDefault(); e.stopPropagation();
      const t = m.tokens.find(x => x.id === tokEl.dataset.tok); if (!t) return;
      const changedSel = selTok !== t.id; selTok = t.id;
      $$('.token.sel', vp).forEach(x => x.classList.remove('sel')); tokEl.classList.add('sel');
      if (changedSel) drawMapSide();
      const sx = t.x, sy = t.y; let moved = false;
      capture(vp, e);
      const mv = ev => {
        const w = MV.toWorld(ev.clientX, ev.clientY), c = MV.toCell(w.x, w.y);
        t.x = sx + c.cx - c0.cx; t.y = sy + c.cy - c0.cy; moved = true;
        tokEl.style.left = (g.ox + t.x * g.size) + 'px'; tokEl.style.top = (g.oy + t.y * g.size) + 'px';
        const d = gridDist({ cx: sx, cy: sy }, { cx: t.x, cy: t.y }, g.meters);
        lbl(`${d.m} m <span class="muted">(${d.cells} cases)</span>`, ev.clientX, ev.clientY);
      };
      const up = () => {
        vp.removeEventListener('pointermove', mv); vp.removeEventListener('pointerup', up); lbl('');
        if (moved) {
          if (g.snap) { const st = (t.size || 1) < 1 ? 0.5 : 1; t.x = Math.round(t.x / st) * st; t.y = Math.round(t.y / st) * st; }
          saveMap(); MV.drawTokens();
        }
      };
      vp.addEventListener('pointermove', mv); vp.addEventListener('pointerup', up);
      return;
    }
    if (mapTool === 'move') { if (selTok) { selTok = null; MV.drawTokens(); drawMapSide(); } return; }
    e.preventDefault(); capture(vp, e);
    const ovl = MV.ovl;
    if (mapTool === 'ruler') {
      let a = c0;
      if (tokEl) { const t = m.tokens.find(x => x.id === tokEl.dataset.tok); if (t) a = { cx: t.x + (t.size || 1) / 2, cy: t.y + (t.size || 1) / 2 }; }
      const mv = ev => {
        const w = MV.toWorld(ev.clientX, ev.clientY), b = MV.toCell(w.x, w.y);
        const d = gridDist({ cx: Math.floor(a.cx), cy: Math.floor(a.cy) }, { cx: Math.floor(b.cx), cy: Math.floor(b.cy) }, g.meters);
        const ax = g.ox + a.cx * g.size, ay = g.oy + a.cy * g.size;
        ovl.innerHTML = `<svg style="position:absolute;left:0;top:0;overflow:visible;pointer-events:none" width="1" height="1"><line x1="${ax}" y1="${ay}" x2="${w.x}" y2="${w.y}" stroke="#000a" stroke-width="${7 / MV.view.z}" stroke-linecap="round"/><line x1="${ax}" y1="${ay}" x2="${w.x}" y2="${w.y}" stroke="#ffd38a" stroke-width="${3 / MV.view.z}" stroke-dasharray="${12 / MV.view.z} ${7 / MV.view.z}" stroke-linecap="round"/><circle cx="${ax}" cy="${ay}" r="${6 / MV.view.z}" fill="#ffd38a" stroke="#000a" stroke-width="${2 / MV.view.z}"/><circle cx="${w.x}" cy="${w.y}" r="${6 / MV.view.z}" fill="none" stroke="#ffd38a" stroke-width="${2.5 / MV.view.z}"/></svg>`;
        lbl(`<i class="ico i-regle"></i> ${d.m} m <span class="muted">(${d.cells} cases)</span>`, ev.clientX, ev.clientY);
      };
      const up = () => { vp.removeEventListener('pointermove', mv); vp.removeEventListener('pointerup', up); ovl.innerHTML = ''; lbl(''); };
      vp.addEventListener('pointermove', mv); vp.addEventListener('pointerup', up);
      return;
    }
    if (mapTool === 'reveal' || mapTool === 'hide') {
      if (!m.fog.on) { toast('Activez d\'abord le brouillard de guerre.'); return; }
      const paint = c => {
        const x0 = Math.floor(c.cx), y0 = Math.floor(c.cy);
        for (let dy = -fogBrush; dy <= fogBrush; dy++) for (let dx = -fogBrush; dx <= fogBrush; dx++) {
          const k = (x0 + dx) + ',' + (y0 + dy); if (mapTool === 'reveal') m.fog.rev[k] = 1; else delete m.fog.rev[k];
        }
        MV.drawFog();
      };
      paint(c0);
      const mv = ev => { const w = MV.toWorld(ev.clientX, ev.clientY); paint(MV.toCell(w.x, w.y)); };
      const up = () => { vp.removeEventListener('pointermove', mv); vp.removeEventListener('pointerup', up); saveMap(); };
      vp.addEventListener('pointermove', mv); vp.addEventListener('pointerup', up);
      return;
    }
    if (mapTool === 'calib') {
      const mv = ev => {
        const w = MV.toWorld(ev.clientX, ev.clientY);
        ovl.innerHTML = `<div style="position:absolute;left:${Math.min(w0.x, w.x)}px;top:${Math.min(w0.y, w.y)}px;width:${Math.abs(w.x - w0.x)}px;height:${Math.abs(w.y - w0.y)}px;border:${2 / MV.view.z}px solid #ffd38a;background:#ffd38a33"></div>`;
      };
      const up = ev => {
        vp.removeEventListener('pointermove', mv); vp.removeEventListener('pointerup', up); ovl.innerHTML = '';
        const w = MV.toWorld(ev.clientX, ev.clientY), s = (Math.abs(w.x - w0.x) + Math.abs(w.y - w0.y)) / 2;
        if (s < 5) return toast('Tracez un rectangle autour d\'une case.');
        const x = Math.min(w0.x, w.x), y = Math.min(w0.y, w.y);
        g.size = +s.toFixed(1); g.ox = +(((x % s) + s) % s).toFixed(1); g.oy = +(((y % s) + s) % s).toFixed(1); g.show = true;
        mapTool = 'move'; vp.className = 'map-vp tool-move'; saveMap(); MV.drawAll(); drawMapSide(); toast('<i class="ico i-equerre"></i> Grille calibrée.');
      };
      vp.addEventListener('pointermove', mv); vp.addEventListener('pointerup', up);
    }
  });
  vp.addEventListener('dblclick', e => {
    const tokEl = e.target.closest('.token'), m = curMap(); if (!tokEl || !m) return;
    const t = m.tokens.find(x => x.id === tokEl.dataset.tok);
    if (t?.ref?.kind === 'pc') { selChar = t.ref.id; charSub = 'fiche'; go('persos'); }
    else if (t?.ref?.kind === 'cb') { selCb = t.ref.id; go('combat'); }
  });
  vp.addEventListener('dragover', e => { e.preventDefault(); vp.classList.add('drop-hot'); });
  vp.addEventListener('dragleave', e => { if (e.target === vp) vp.classList.remove('drop-hot'); });
  vp.addEventListener('drop', async e => {
    e.preventDefault(); vp.classList.remove('drop-hot');
    const m = curMap(), ref = e.dataTransfer.getData('text/x-mj-ref'), f = imageFiles(e.dataTransfer)[0];
    if (!m) { if (f) createMapFromFile(f); return; }
    const w = MV.toWorld(e.clientX, e.clientY), c = MV.toCell(w.x, w.y);
    if (ref) { placeToken(m, JSON.parse(ref), Math.floor(c.cx), Math.floor(c.cy)); saveMap(); MV.drawTokens(); drawMapSide(); return; }
    if (!f) return;
    const r = await upload(f), tokEl = e.target.closest('.token');
    if (tokEl) {
      const t = m.tokens.find(x => x.id === tokEl.dataset.tok); t.img = r.url;
      if (t.ref?.kind === 'pc' && S.chars[t.ref.id] && !S.chars[t.ref.id].portrait) { S.chars[t.ref.id].portrait = r.url; saveChar(S.chars[t.ref.id]); }
      if (t.ref?.kind === 'cb') { const cb = CB().list.find(x => x.uid === t.ref.id); if (cb) cb.portrait = r.url; }
      selTok = t.id;
    } else placeToken(m, null, Math.floor(c.cx), Math.floor(c.cy), { name: r.name, kind: 'mon' });
    saveMap(); MV.drawTokens(); drawMapSide();
  });
}
function onPings(list) { if (MV && S.tab === 'carte') MV.showPings(list); }
TABS.carte = {
  full: true, render: renderCarte, refresh: () => { if (!MV) return go('carte'); MV.setMap(curMap()); drawMapSide(); }, leave: () => { MV && MV.destroy(); MV = null; },
  key: e => {
    const m = curMap(), t = m?.tokens.find(x => x.id === selTok); if (!t) return;
    const mv = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (mv) { e.preventDefault(); t.x += mv[0]; t.y += mv[1]; saveMap(); MV.drawTokens(); }
    else if (e.key === 'Delete' || e.key === 'Backspace') { m.tokens = m.tokens.filter(x => x.id !== t.id); selTok = null; saveMap(); MV.drawTokens(); drawMapSide(); }
    else if (e.key === 'h') { t.hidden = !t.hidden; saveMap(); MV.drawTokens(); drawMapSide(); }
  },
};
