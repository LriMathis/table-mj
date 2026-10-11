/* ===== Map tab (GM): maps, grid, tokens, fog of war, ruler ===== */
'use strict';

let MV = null, mapTool = 'move', selTok = null, fogBrush = 1;
const curMap = () => S.camp.maps.find(m => m.id === S.camp.currentMap) || null;
const saveMap = () => saveCamp();

function placeToken(m, ref, cx, cy, extra = {}) {
  // moves the existing token if there is already one for this reference
  let tk = ref && m.tokens.find(x => x.ref && x.ref.kind === ref.kind && x.ref.id === ref.id);
  if (tk && ref.kind !== 'mon') { tk.x = cx; tk.y = cy; }
  else {
    tk = { id: uid('tk'), x: cx, y: cy, size: 1, name: '', img: '', ref: ref || null, hidden: false, ...extra };
    if (ref?.kind === 'mon') { const mo = S.mons[ref.id]; tk.name = mo?.name || ''; tk.size = mo?.size || 1; }
    if (ref?.kind === 'cb') { const cb = CB().list.find(x => x.uid === ref.id); if (cb) { tk.name = cb.name; tk.kind = cb.kind; } if (cb?.hidden) tk.hidden = true; if (cb?.monId) tk.size = S.mons[cb.monId]?.size || 1; }
    m.tokens.push(tk);
  }
  selTok = tk.id; return tk;
}
function freeCell(m, cx, cy) {
  for (let r = 0; r < 12; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const x = cx + dx, y = cy + dy;
    if (!m.tokens.some(tk => Math.round(tk.x) === x && Math.round(tk.y) === y)) return { x, y };
  }
  return { x: cx, y: cy };
}
function viewCenterCell() {
  const r = MV.vp.getBoundingClientRect(), w = MV.toWorld(r.left + r.width / 2, r.top + r.height / 2), c = MV.toCell(w.x, w.y);
  return { x: Math.floor(c.cx), y: Math.floor(c.cy) };
}
function placeAllPCs() {
  const m = curMap(); if (!m) return; const c0 = viewCenterCell();
  charList().forEach(c => { if (!m.tokens.some(tk => tk.ref?.kind === 'pc' && tk.ref.id === c.id)) { const p = freeCell(m, c0.x, c0.y); placeToken(m, { kind: 'pc', id: c.id }, p.x, p.y); } });
  saveMap(); drawMapSide(); MV.drawTokens();
}
function placeCombatants() {
  const m = curMap(); if (!m) return; const c0 = viewCenterCell();
  CB().list.forEach(cb => {
    if (cb.kind === 'pc') { if (!m.tokens.some(tk => tk.ref?.kind === 'pc' && tk.ref.id === cb.charId)) { const p = freeCell(m, c0.x, c0.y); placeToken(m, { kind: 'pc', id: cb.charId }, p.x, p.y); } }
    else if (!m.tokens.some(tk => tk.ref?.kind === 'cb' && tk.ref.id === cb.uid)) { const p = freeCell(m, c0.x + 4, c0.y); placeToken(m, { kind: 'cb', id: cb.uid }, p.x, p.y); }
  });
  saveMap(); drawMapSide(); MV.drawTokens();
}
async function createMapFromFile(file) {
  const r = await upload(file);
  const m = newMap(r.name || t('Map'), r.url);
  S.camp.maps.push(m); S.camp.currentMap = m.id; if (!S.camp.playerMap) S.camp.playerMap = m.id;
  saveMap(); selTok = null; MV.setMap(m, { fit: true }); drawMapSide();
  toast(`<i class="ico i-map"></i> ${t('Map added. Adjust the grid in the panel (or with the "Calibrate" tool).')}`);
}

function renderMap(main) {
  main.innerHTML = `<div class="map-wrap"><div class="map-side" id="map-side"></div>
    <div class="map-vp tool-${mapTool}" id="map-vp"></div></div>`;
  MV && MV.destroy();
  MV = new MapView($('#map-vp'), {
    emptyText: t('Drop a JPEG/PNG image here to create a battle map'),
    panOnLeft: e => mapTool === 'move' && !e.target.closest('.token'),
    selected: () => selTok,
    onView: () => debounce('mapview', saveMap, 1200),
    onDims: () => saveMap(),
  });
  MV.setMap(curMap());
  // HUD
  MV.vp.insertAdjacentHTML('beforeend', `<div class="map-title hidden" id="map-title"></div><div class="map-hud"><button id="mh-out" title="${t('Zoom out')}">－</button><span class="zl"></span><button id="mh-in" title="${t('Zoom in')}">＋</button><button id="mh-fit" title="${t('Fit to screen')}">⤢</button></div><div id="map-lbl"></div>`);
  MV.applyView();
  $('#mh-in').onclick = () => MV.zoom(1.25); $('#mh-out').onclick = () => MV.zoom(0.8); $('#mh-fit').onclick = () => MV.fit();
  bindMapVP(MV.vp);
  drawMapSide();
}
function drawMapSide() {
  const el = $('#map-side'); if (!el) return;
  const m = curMap(), g = m?.grid, tk = m?.tokens.find(x => x.id === selTok), ti = tk && tokenInfo(tk);
  const tt = $('#map-title');
  if (tt) { tt.classList.toggle('hidden', !m); tt.innerHTML = m ? `<i class="ico i-map"></i> ${esc(m.name)}${S.camp.playerMap === m.id ? ` <small><i class="ico i-eye"></i> ${t('player view')}</small>` : ''}` : ''; }
  const pcs = charList(), cbs = CB().list.filter(x => x.kind !== 'pc');
  const onMap = ref => m && m.tokens.some(x => x.ref && x.ref.kind === ref.kind && x.ref.id === ref.id);
  const info = S.info || {};
  const tools = [['move', 'hand', t('Move')], ['ruler', 'ruler', t('Ruler')], ['reveal', 'torch', t('Reveal')], ['hide', 'fog', t('Hide')], ['calib', 'set-square', t('Calibrate')]];
  const toolHelp = { move: t('Drag the tokens. Drag the background = move the view. Wheel = zoom.'), ruler: t('Drag to measure (diagonal = 1 square).'), reveal: t('Paint to reveal the fog.'), hide: t('Paint to put the fog back.'), calib: t('Draw a rectangle on ONE square of the map to align the grid.') };
  const sizes = [[0.5, t('Tiny (½)')], [1, t('Small / Medium (1 square)')], [2, t('Large (2×2)')], [3, t('Huge (3×3)')], [4, t('Gargantuan (4×4)')]];
  el.innerHTML = `
  <div class="sec"><h4><i class="ico i-map"></i> ${t('Maps')}</h4>
    <select id="mp-sel"><option value="">— ${t('none')} —</option>${S.camp.maps.map(x => `<option value="${x.id}" ${x.id === S.camp.currentMap ? 'selected' : ''}>${esc(x.name)}${x.id === S.camp.playerMap ? ` (${t('player view')})` : ''}</option>`).join('')}</select>
    ${m ? `<div class="row"><button class="small" id="mp-ren">${t('Rename')}</button><button class="small" id="mp-img">${t('Change image')}</button><button class="small danger" id="mp-del" title="${t('Delete')}"><i class="ico i-trash"></i></button></div>
      <button id="mp-show" class="${S.camp.playerMap === m.id ? 'on' : ''}" title="${t('Map shown in the player view')}"><i class="ico i-eye"></i> ${S.camp.playerMap === m.id ? t('Shown to players') : t('Show to players')}</button>
      <button class="small" id="mp-focus" title="${t('Centers the player view on what you see')}"><i class="ico i-target"></i> ${t('Send my view to players')}</button>` : ''}
    <div class="dropzone" id="mp-drop"><i class="ico i-import"></i> ${t('Drop a JPEG here<br>for a <b>new map</b>')}<br><span class="small">(${t('or click')})</span></div>
  </div>
  <div class="sec"><h4><i class="ico i-party"></i> ${t('Connected players')}</h4>
    ${info.remote ? (info.public ? `<span class="small">${t('<b>Remote</b> — address to send to players:')}</span><code class="small" style="user-select:all;color:var(--gold2);word-break:break-all">${esc(info.public)}</code><button class="small" id="pl-copy"><i class="ico i-link"></i> ${t('Copy the address')}</button>`
      : `<span class="muted small">${t('Opening the tunnel for remote play…')}</span>`) : ''}
    ${info.lan ? `<span class="small">${t('Same Wi-Fi:')}</span>${(info.urls.length ? info.urls : ['http://<this-computer-ip>:' + info.port + '/player']).map(u => `<code class="small" style="user-select:all;color:var(--gold2)">${esc(u)}</code>`).join('')}`
      : info.remote ? '' : `<span class="muted small">${t('Local mode. To let players join: <code>./start-lan.sh</code> (same Wi-Fi) or <code>./start-remote.sh</code> (over the internet).')}</span>`}
    <div class="col small">${charList().map(c => `<span>${S.presence?.[c.id] != null ? '<span class="online">●</span>' : '<span class="muted">○</span>'} ${esc(c.name)}</span>`).join('')}</div>
    <label class="field"><span>${t('Players can move their token')}</span><select id="pl-move">
      ${[['always', t('always')], ['turn', t('only on their turn (in combat)')], ['off', t('never (locked)')]].map(([v, l]) => `<option value="${v}" ${(S.camp.settings?.playerMove || 'always') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    <label class="field"><span>${t('Attacks and spells cast by players')}</span><select id="pl-act">
      ${[['turn', t('on their turn (in combat), free out of combat')], ['always', t('at any time')], ['off', t('disabled (the GM rolls)')]].map(([v, l]) => `<option value="${v}" ${(S.camp.settings?.playerActions || 'turn') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    <label class="chk small"><input type="checkbox" id="pl-lvl" ${S.camp.settings?.playerLevelUp ? 'checked' : ''}> ${t('players level up their characters themselves')}</label>
    <button class="small" id="pl-msg"><i class="ico i-announce"></i> ${t('Show a message / an image')}</button>
    <span class="muted small">${t('Alt + click on the map = ping visible to everyone (players: long press).')}</span>
  </div>
  ${m ? `
  <div class="sec"><h4><i class="ico i-tools"></i> ${t('Tools')}</h4>
    <div class="tools">${tools.map(([k, ic, l]) => `<button data-tool="${k}" class="${mapTool === k ? 'on' : ''}"><i class="ico i-${ic}"></i> ${l}</button>`).join('')}</div>
    <span class="muted small">${toolHelp[mapTool]} ${t('Right click / space + drag = move the view.')}</span>
    <label class="chk"><input type="checkbox" id="fog-on" ${m.fog.on ? 'checked' : ''}> ${t('Fog of war')}</label>
    ${m.fog.on ? `<div class="row"><span class="small">${t('Brush')}</span><input type="range" id="fog-br" min="0" max="5" value="${fogBrush}" style="flex:1"><span class="small">${fogBrush * 2 + 1}×${fogBrush * 2 + 1}</span></div>
      <div class="row"><button class="small" id="fog-all">${t('Reveal all')}</button><button class="small" id="fog-none">${t('Hide all')}</button></div>` : ''}
  </div>
  <div class="sec"><h4><i class="ico i-set-square"></i> ${t('Grid')}</h4>
    <div class="row"><label class="chk"><input type="checkbox" id="g-show" ${g.show ? 'checked' : ''}> ${t('show')}</label><label class="chk"><input type="checkbox" id="g-snap" ${g.snap ? 'checked' : ''}> ${t('snap')}</label></div>
    <div class="row"><span class="small" style="width:56px">${t('Size')}</span><input type="range" id="g-size" min="10" max="300" step="0.5" value="${g.size}" style="flex:1"><input id="g-sizen" type="number" step="0.5" value="${g.size}" style="width:58px"></div>
    <div class="row"><span class="small" style="width:56px">${t('Offset')}</span><input id="g-ox" type="number" value="${g.ox}" style="width:58px" title="X"><input id="g-oy" type="number" value="${g.oy}" style="width:58px" title="Y"></div>
    <div class="row"><span class="small" style="width:56px">${t('Color')}</span><input type="color" id="g-col" value="${g.color}" style="width:40px;padding:0"><input type="range" id="g-al" min="0" max="1" step="0.05" value="${g.alpha}" style="flex:1"></div>
    <div class="row"><span class="small">${t('1 square =')}</span><input id="g-m" type="number" step="0.5" value="${LANG === 'en' ? toFeet(g.meters) : g.meters}" style="width:54px"><span class="small">${LANG === 'en' ? 'ft' : 'm'}</span></div>
  </div>
  <div class="sec"><h4><i class="ico i-token"></i> ${t('Tokens')}</h4>
    <span class="muted small">${t('Drag a name onto the map, or drop an image directly on the map to create a token.')}</span>
    <div class="row"><button class="small" id="tk-pcs">${t('Place the PCs')}</button><button class="small" id="tk-cbs">${t('Place the combatants')}</button><button class="small" id="tk-new">+ ${t('Token')}</button></div>
    <b class="small">${t('Characters')}</b>
    ${pcs.map(c => `<div class="tok-src ${onMap({ kind: 'pc', id: c.id }) ? 'placed' : ''}" draggable="true" data-ref='{"kind":"pc","id":"${c.id}"}'>${avatarHTML(c)}<span>${esc(c.name)}</span></div>`).join('')}
    ${cbs.length ? `<b class="small">${t('Combat')}</b>${cbs.map(cb => `<div class="tok-src ${onMap({ kind: 'cb', id: cb.uid }) ? 'placed' : ''}" draggable="true" data-ref='{"kind":"cb","id":"${cb.uid}"}'>${avatarHTML({ name: cb.name, portrait: cbPortrait(cb), color: cb.kind === 'npc' ? '#7a6a20' : '#7a2a2a' })}<span>${esc(cb.name)}</span>${cb.hp <= 0 ? ' <i class="ico i-skull"></i>' : ''}</div>`).join('')}` : ''}
    <details><summary class="small"><b>${t('Bestiary')}</b></summary>${monList().map(mo => `<div class="tok-src" draggable="true" data-ref='{"kind":"mon","id":"${mo.id}"}'>${avatarHTML({ name: mo.name, portrait: mo.portrait, color: '#7a2a2a' })}<span>${esc(mo.name)}</span></div>`).join('')}</details>
  </div>
  ${tk ? `<div class="sec"><h4><i class="ico i-target"></i> ${t('Token')}: ${esc(ti.name)}</h4>
    ${!tk.ref || tk.ref.kind === 'mon' ? `<input id="tk-name" value="${esc(tk.name)}" placeholder="${t('Name')}">` : ''}
    ${ti.hp != null ? `<div>${ti.hp}/${ti.hpMax} ${t('HP')}</div><div class="row"><input id="tk-amt" type="number" style="width:60px"><button class="small danger" id="tk-dmg">${t('Damage')}</button><button class="small ok" id="tk-heal">${t('Heal')}</button></div>` : ''}
    <div class="row"><span class="small">${t('Size')}</span><select id="tk-size">${sizes.map(([v, l]) => `<option value="${v}" ${v == (tk.size || 1) ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
    <label class="chk"><input type="checkbox" id="tk-hid" ${tk.hidden ? 'checked' : ''}> ${t('hidden from players')}</label>
    <div class="dropzone" id="tk-img" style="padding:6px"><i class="ico i-image"></i> ${t('Drop an image for this token')}</div>
    <div class="row">${tk.img ? `<button class="small" id="tk-noimg">${t('Remove the image')}</button>` : ''}<input type="color" id="tk-col" value="${tk.color && tk.color.startsWith('#') ? tk.color : '#555555'}" style="width:36px;padding:0" title="${t('Color')}">
      <button class="small danger" id="tk-del">${t('Remove (Del)')}</button></div>
  </div>` : ''}` : ''}`;
  bindMapSide(el, m, tk);
}
function bindMapSide(el, m, tk) {
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
  $('#pl-copy', el) && ($('#pl-copy', el).onclick = () => navigator.clipboard.writeText(S.info.public).then(() => toast(t('Address copied.')), () => toast(t('Could not copy: select the address.'))));
  $('#pl-lvl', el).onchange = e => { S.camp.settings ??= {}; S.camp.settings.playerLevelUp = e.target.checked; saveMap(); };
  $$('.tok-src', el).forEach(s => s.addEventListener('dragstart', e => e.dataTransfer.setData('text/x-gt-ref', s.dataset.ref)));
  if (!m) return;
  $('#mp-ren', el).onclick = () => ask(t('Rename the map'), [{ k: 'n', label: t('Name'), value: m.name }], o => { m.name = o.n || m.name; redraw(); });
  $('#mp-img', el).onclick = () => pickImage(r => { m.url = r.url; m.w = 0; saveMap(); MV.setMap(m, { fit: true }); });
  $('#mp-del', el).onclick = () => confirmBox(t('Delete the map "{name}"?', { name: esc(m.name) }), () => {
    S.camp.maps = S.camp.maps.filter(x => x.id !== m.id); S.camp.currentMap = S.camp.maps[0]?.id || null;
    if (S.camp.playerMap === m.id) S.camp.playerMap = S.camp.currentMap;
    saveMap(); MV.setMap(curMap()); drawMapSide();
  });
  $('#mp-show', el).onclick = () => { S.camp.playerMap = m.id; saveMap(); drawMapSide(); toast(`<i class="ico i-eye"></i> ${t('Map shown in the player view.')}`); };
  $('#mp-focus', el).onclick = () => {
    const r = MV.vp.getBoundingClientRect(), w = MV.toWorld(r.left + r.width / 2, r.top + r.height / 2);
    S.camp.playerFocus = { map: m.id, x: w.x, y: w.y, z: MV.view.z, span: r.width / MV.view.z, t: Date.now() }; S.camp.playerMap = m.id; saveMap(); toast(`<i class="ico i-target"></i> ${t('View sent to players.')}`);
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
  $('#g-m', el).onchange = e => gset('meters', LANG === 'en' ? +(num(e.target.value, 5) * 0.3).toFixed(2) : num(e.target.value, 1.5));
  $('#tk-pcs', el).onclick = placeAllPCs;
  $('#tk-cbs', el).onclick = placeCombatants;
  $('#tk-new', el).onclick = () => ask(t('New token'), [{ k: 'name', label: t('Name') }, { k: 'kind', label: t('Type'), type: 'select', value: 'npc', options: [['npc', t('NPC / object')], ['mon', t('Opponent')], ['pc', t('Ally')]] }], o => {
    const c = viewCenterCell(), p = freeCell(m, c.x, c.y); placeToken(m, null, p.x, p.y, { name: o.name, kind: o.kind }); redraw();
  });
  if (!tk) return;
  $('#tk-name', el) && ($('#tk-name', el).onchange = e => { tk.name = e.target.value; redraw(); });
  const linked = () => { if (tk.ref?.kind === 'pc') return { e: S.chars[tk.ref.id], n: S.chars[tk.ref.id]?.name, s: () => saveChar(S.chars[tk.ref.id]) }; const cb = tk.ref?.kind === 'cb' && CB().list.find(x => x.uid === tk.ref.id); return cb ? { e: ent(cb), n: cbName(cb), s: () => cbSave(cb) } : null; };
  $('#tk-dmg', el) && ($('#tk-dmg', el).onclick = () => { const l = linked(); if (l) { dealDamage(l.e, num($('#tk-amt', el).value), l.n); l.s(); redraw(); } });
  $('#tk-heal', el) && ($('#tk-heal', el).onclick = () => { const l = linked(); if (l) { healEntity(l.e, num($('#tk-amt', el).value), l.n); l.s(); redraw(); } });
  $('#tk-size', el).onchange = e => { tk.size = +e.target.value; redraw(); };
  $('#tk-hid', el).onchange = e => { tk.hidden = e.target.checked; redraw(); };
  $('#tk-col', el).oninput = e => { tk.color = e.target.value; saveMap(); MV.drawTokens(); };
  dropImage($('#tk-img', el), r => { tk.img = r.url; redraw(); });
  $('#tk-noimg', el) && ($('#tk-noimg', el).onclick = () => { tk.img = ''; redraw(); });
  $('#tk-del', el).onclick = () => { m.tokens = m.tokens.filter(x => x.id !== tk.id); selTok = null; redraw(); };
}

function bindMapVP(vp) {
  const lbl = (html, x, y) => { let l = $('#map-lbl'); l.className = html ? 'ruler-lbl' : 'hidden'; l.innerHTML = html; const r = vp.getBoundingClientRect(); l.style.left = (x - r.left + 14) + 'px'; l.style.top = (y - r.top + 10) + 'px'; };
  const distLbl = d => `${fmtDist(d.m)} <span class="muted">(${t(d.cells === 1 ? '{n} square' : '{n} squares', { n: d.cells })})</span>`;
  vp.addEventListener('pointerdown', e => {
    const m = curMap(); if (!m || e.button !== 0 || MV.spaceDown) return;
    if (e.altKey) { e.preventDefault(); e.stopPropagation(); const w = MV.toWorld(e.clientX, e.clientY); api('POST', '/api/ping', { map: m.id, x: w.x, y: w.y, color: '#ff5a3c' }).catch(() => { }); return; }
    const tokEl = e.target.closest('.token'), w0 = MV.toWorld(e.clientX, e.clientY), c0 = MV.toCell(w0.x, w0.y), g = m.grid;
    if (mapTool === 'move' && tokEl) {
      e.preventDefault(); e.stopPropagation();
      const tk = m.tokens.find(x => x.id === tokEl.dataset.tok); if (!tk) return;
      const changedSel = selTok !== tk.id; selTok = tk.id;
      $$('.token.sel', vp).forEach(x => x.classList.remove('sel')); tokEl.classList.add('sel');
      if (changedSel) drawMapSide();
      const sx = tk.x, sy = tk.y; let moved = false;
      capture(vp, e);
      const mv = ev => {
        const w = MV.toWorld(ev.clientX, ev.clientY), c = MV.toCell(w.x, w.y);
        tk.x = sx + c.cx - c0.cx; tk.y = sy + c.cy - c0.cy; moved = true;
        tokEl.style.left = (g.ox + tk.x * g.size) + 'px'; tokEl.style.top = (g.oy + tk.y * g.size) + 'px';
        lbl(distLbl(gridDist({ cx: sx, cy: sy }, { cx: tk.x, cy: tk.y }, g.meters)), ev.clientX, ev.clientY);
      };
      const up = () => {
        vp.removeEventListener('pointermove', mv); vp.removeEventListener('pointerup', up); lbl('');
        if (moved) {
          if (g.snap) { const st = (tk.size || 1) < 1 ? 0.5 : 1; tk.x = Math.round(tk.x / st) * st; tk.y = Math.round(tk.y / st) * st; }
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
      if (tokEl) { const tk = m.tokens.find(x => x.id === tokEl.dataset.tok); if (tk) a = { cx: tk.x + (tk.size || 1) / 2, cy: tk.y + (tk.size || 1) / 2 }; }
      const mv = ev => {
        const w = MV.toWorld(ev.clientX, ev.clientY), b = MV.toCell(w.x, w.y);
        const d = gridDist({ cx: Math.floor(a.cx), cy: Math.floor(a.cy) }, { cx: Math.floor(b.cx), cy: Math.floor(b.cy) }, g.meters);
        const ax = g.ox + a.cx * g.size, ay = g.oy + a.cy * g.size;
        ovl.innerHTML = `<svg style="position:absolute;left:0;top:0;overflow:visible;pointer-events:none" width="1" height="1"><line x1="${ax}" y1="${ay}" x2="${w.x}" y2="${w.y}" stroke="#000a" stroke-width="${7 / MV.view.z}" stroke-linecap="round"/><line x1="${ax}" y1="${ay}" x2="${w.x}" y2="${w.y}" stroke="#ffd38a" stroke-width="${3 / MV.view.z}" stroke-dasharray="${12 / MV.view.z} ${7 / MV.view.z}" stroke-linecap="round"/><circle cx="${ax}" cy="${ay}" r="${6 / MV.view.z}" fill="#ffd38a" stroke="#000a" stroke-width="${2 / MV.view.z}"/><circle cx="${w.x}" cy="${w.y}" r="${6 / MV.view.z}" fill="none" stroke="#ffd38a" stroke-width="${2.5 / MV.view.z}"/></svg>`;
        lbl(`<i class="ico i-ruler"></i> ${distLbl(d)}`, ev.clientX, ev.clientY);
      };
      const up = () => { vp.removeEventListener('pointermove', mv); vp.removeEventListener('pointerup', up); ovl.innerHTML = ''; lbl(''); };
      vp.addEventListener('pointermove', mv); vp.addEventListener('pointerup', up);
      return;
    }
    if (mapTool === 'reveal' || mapTool === 'hide') {
      if (!m.fog.on) { toast(t('Turn on the fog of war first.')); return; }
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
        if (s < 5) return toast(t('Draw a rectangle around one square.'));
        const x = Math.min(w0.x, w.x), y = Math.min(w0.y, w.y);
        g.size = +s.toFixed(1); g.ox = +(((x % s) + s) % s).toFixed(1); g.oy = +(((y % s) + s) % s).toFixed(1); g.show = true;
        mapTool = 'move'; vp.className = 'map-vp tool-move'; saveMap(); MV.drawAll(); drawMapSide(); toast(`<i class="ico i-set-square"></i> ${t('Grid calibrated.')}`);
      };
      vp.addEventListener('pointermove', mv); vp.addEventListener('pointerup', up);
    }
  });
  vp.addEventListener('dblclick', e => {
    const tokEl = e.target.closest('.token'), m = curMap(); if (!tokEl || !m) return;
    const tk = m.tokens.find(x => x.id === tokEl.dataset.tok);
    if (tk?.ref?.kind === 'pc') { selChar = tk.ref.id; charSub = 'sheet'; go('characters'); }
    else if (tk?.ref?.kind === 'cb') { selCb = tk.ref.id; go('combat'); }
  });
  vp.addEventListener('dragover', e => { e.preventDefault(); vp.classList.add('drop-hot'); });
  vp.addEventListener('dragleave', e => { if (e.target === vp) vp.classList.remove('drop-hot'); });
  vp.addEventListener('drop', async e => {
    e.preventDefault(); vp.classList.remove('drop-hot');
    const m = curMap(), ref = e.dataTransfer.getData('text/x-gt-ref'), f = imageFiles(e.dataTransfer)[0];
    if (!m) { if (f) createMapFromFile(f); return; }
    const w = MV.toWorld(e.clientX, e.clientY), c = MV.toCell(w.x, w.y);
    if (ref) { placeToken(m, JSON.parse(ref), Math.floor(c.cx), Math.floor(c.cy)); saveMap(); MV.drawTokens(); drawMapSide(); return; }
    if (!f) return;
    const r = await upload(f), tokEl = e.target.closest('.token');
    if (tokEl) {
      const tk = m.tokens.find(x => x.id === tokEl.dataset.tok); tk.img = r.url;
      if (tk.ref?.kind === 'pc' && S.chars[tk.ref.id] && !S.chars[tk.ref.id].portrait) { S.chars[tk.ref.id].portrait = r.url; saveChar(S.chars[tk.ref.id]); }
      if (tk.ref?.kind === 'cb') { const cb = CB().list.find(x => x.uid === tk.ref.id); if (cb) cb.portrait = r.url; }
      selTok = tk.id;
    } else placeToken(m, null, Math.floor(c.cx), Math.floor(c.cy), { name: r.name, kind: 'mon' });
    saveMap(); MV.drawTokens(); drawMapSide();
  });
}
function onPings(list) { if (MV && S.tab === 'map') MV.showPings(list); }
TABS.map = {
  full: true, render: renderMap, refresh: () => { if (!MV) return go('map'); MV.setMap(curMap()); drawMapSide(); }, leave: () => { MV && MV.destroy(); MV = null; },
  key: e => {
    const m = curMap(), tk = m?.tokens.find(x => x.id === selTok); if (!tk) return;
    const mv = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (mv) { e.preventDefault(); tk.x += mv[0]; tk.y += mv[1]; saveMap(); MV.drawTokens(); }
    else if (e.key === 'Delete' || e.key === 'Backspace') { m.tokens = m.tokens.filter(x => x.id !== tk.id); selTok = null; saveMap(); MV.drawTokens(); drawMapSide(); }
    else if (e.key === 'h') { tk.hidden = !tk.hidden; saveMap(); MV.drawTokens(); drawMapSide(); }
  },
};
