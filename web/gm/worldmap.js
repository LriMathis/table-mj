/* ===== World map tools (GM): scale, pins, routes, halts, travel, unroll, combat from a halt (see shared/world.js) ===== */
'use strict';

const WM = { sel: null, mode: 'foot', drawing: null, hover: null };
const WORLD_TOOLS = [['move', 'hand', 'Move'], ['ruler', 'ruler', 'Ruler'], ['pin', 'flag', 'Place a pin'], ['route', 'footsteps', 'Draw a route'],
  ['halt', 'hourglass', 'Add a halt'], ['scale', 'set-square', 'Scale'], ['reveal', 'torch', 'Reveal'], ['hide', 'fog', 'Hide']];
const WORLD_HELP = {
  pin: 'Click on the map to place a pin (town, port, dungeon…).',
  route: 'Click point by point to draw the route; the means of travel below applies to the next legs. Double click or Enter = finish.',
  halt: 'Click on a route to add a halt (hidden from players until the party reaches it).',
  scale: 'Draw a line between two places whose distance you know, then give it in km.',
};
const wRoute = (m, id) => (m.routes || []).find(r => r.id === id);
const wSave = () => { saveMap(); MV && MV.drawWorld(); };

function makeWorld(m, on) {
  // the grid settings of the battle map are kept, to be restored when it becomes a normal map again
  if (on) { m.kind = 'world'; m.gridBefore = { show: m.grid.show, snap: m.grid.snap }; m.grid.show = false; m.grid.snap = false; m.pins ??= []; m.routes ??= []; }
  else { delete m.kind; Object.assign(m.grid, m.gridBefore || { show: true, snap: true }); delete m.gridBefore; }
  WM.sel = null; WM.drawing = null; mapTool = 'move';
}
function finishRoute() {
  const m = curMap(), r = m && wRoute(m, WM.drawing);
  WM.drawing = null; WM.hover = null;
  if (r && r.pts.length < 2) { m.routes = m.routes.filter(x => x !== r); WM.sel = null; toast(t('A route needs at least two points.')); }
  wSave(); drawMapSide();
}

/* ---------- full-screen layout: header bar with the tools (the side panel becomes a "Details" drawer) ---------- */
function worldLayout(on) {
  document.body.classList.toggle('world-mode', !!on);
  if (!on) document.body.classList.remove('wpanel', 'wdice');
}
const worldPanel = open => { document.body.classList.toggle('wpanel', open ?? !document.body.classList.contains('wpanel')); setTimeout(() => MV && MV.drawWorld(), 260); };
function drawWorldHead() {
  const el = $('#w-head'), m = curMap(); if (!el) return;
  const world = isWorld(m) && S.tab === 'map';
  worldLayout(world); el.classList.toggle('hidden', !world);
  if (!world) return;
  const r = wRoute(m, m.activeRoute), prog = r ? r.prog || 0 : 0, len = r ? routeLen(r) : 0;
  const next = r && (r.halts || []).filter(x => x.d > prog + 0.5).sort((a, b) => a.d - b.d)[0];
  const shown = S.camp.playerMap === m.id;
  el.innerHTML = `<div class="wh-top">
      <div class="wh-title"><i class="ico i-compass"></i><span>${t('World map')}</span><b>${esc(m.name)}</b><button class="icon" id="wh-ren" title="${t('Rename')}"><i class="ico i-quill"></i></button></div>
      <div class="wh-act">
        <select id="wh-map" title="${t('Maps')}">${S.camp.maps.map(x => `<option value="${x.id}" ${x.id === m.id ? 'selected' : ''}>${isWorld(x) ? '🧭 ' : ''}${esc(x.name)}</option>`).join('')}</select>
        <button id="wh-normal" title="${t('Back to a normal map (grid, tokens)')}"><i class="ico i-set-square"></i> ${t('Normal map')}</button>
        <button id="wh-show" class="${shown ? 'on' : ''}"><i class="ico i-eye"></i> ${shown ? t('Shown to players') : t('Show to players')}</button>
        <button id="wh-unroll" class="primary"><i class="ico i-scroll"></i> ${t('Unroll before the players')}</button>
        <button id="wh-panel" class="${document.body.classList.contains('wpanel') ? 'on' : ''}"><i class="ico i-list"></i> ${t('Details')}</button>
        <button id="wh-dice" class="icon ${document.body.classList.contains('wdice') ? 'on' : ''}" title="${t('Dice')}"><i class="ico i-dice"></i></button>
      </div></div>
    <div class="wh-tools">
      ${WORLD_TOOLS.filter(([k]) => k !== 'reveal' && k !== 'hide').map(([k, ic, l]) => `<button data-wtool="${k}" class="${mapTool === k ? 'on' : ''}"><i class="ico i-${ic}"></i> ${t(l)}</button>`).join('')}
      ${mapTool === 'route' ? `<select id="wh-mode" title="${t('Means of travel when drawing')}">${Object.entries(TRAVEL_MODES).map(([k, md]) => `<option value="${k}" ${k === WM.mode ? 'selected' : ''}>${t(md.label)}</option>`).join('')}</select>` : ''}
      ${WM.drawing ? `<button class="ok" id="wh-finish">✔ ${t('Finish the route')}</button>` : ''}
      ${r && len ? `<span class="wh-trip"><i class="ico i-party"></i> ${esc(r.name)} · ${fmtKm(pxKm(m, prog))} / ${fmtKm(pxKm(m, len))}
        ${prog < len - 0.5 ? `<button class="primary small" id="wh-go"><i class="ico i-footsteps"></i> ${next ? t('Go to: {name}', { name: esc(next.name || t('Halt')) }) : t('Go to the end')}</button>` : `<b class="ok">✔ ${t('Arrived.')}</b>`}</span>` : ''}
    </div>
    <div class="wh-tip hidden" id="wh-tip"></div>`;
  $('#wh-map', el).onchange = e => { S.camp.currentMap = e.target.value; selTok = null; WM.sel = null; WM.drawing = null; saveMap(); MV.setMap(curMap()); drawMapSide(); };
  $('#wh-normal', el).onclick = () => { makeWorld(m, false); MV.vp.className = 'map-vp tool-move'; saveMap(); MV.setMap(m, { fit: true }); drawMapSide(); };
  $('#wh-ren', el).onclick =() => ask(t('Rename the map'), [{ k: 'n', label: t('Name'), value: m.name }], o => { m.name = o.n || m.name; wSave(); drawMapSide(); });
  $('#wh-show', el).onclick = () => { S.camp.playerMap = m.id; saveMap(); drawMapSide(); toast(`<i class="ico i-eye"></i> ${t('Map shown in the player view.')}`); };
  $('#wh-unroll', el).onclick = () => { S.camp.playerMap = m.id; S.camp.unroll = { id: uid('ur'), map: m.id }; saveMap(); worldSync(S.camp); drawMapSide(); };
  $('#wh-panel', el).onclick = () => { worldPanel(); drawWorldHead(); };
  $('#wh-dice', el).onclick = () => { document.body.classList.toggle('wdice'); drawWorldHead(); setTimeout(() => MV && MV.drawWorld(), 50); };
  $('#wh-mode', el) && ($('#wh-mode', el).onchange = e => { WM.mode = e.target.value; drawMapSide(); });
  $('#wh-finish', el) && ($('#wh-finish', el).onclick = finishRoute);
  $('#wh-go', el) && ($('#wh-go', el).onclick = () => travelTo(m, r, next ? next.d : len));
  const tip = $('#wh-tip', el);
  $$('[data-wtool]', el).forEach(b => {
    b.onclick = () => { mapTool = b.dataset.wtool; MV.vp.className = 'map-vp tool-' + mapTool; if (mapTool !== 'route' && WM.drawing) finishRoute(); drawMapSide(); };
    const help = { move: 'Drag the pins, halts and route points. Drag the background = move the view. Wheel = zoom.', ruler: 'Drag to measure the distance (km and days on foot).', ...WORLD_HELP }[b.dataset.wtool];
    b.onmouseenter = () => {
      tip.innerHTML = `<b>${esc(b.textContent.trim())}</b>${esc(t(help))}`; tip.classList.remove('hidden');
      const rb = b.getBoundingClientRect(), re = el.getBoundingClientRect(); tip.style.left = Math.max(0, rb.left - re.left) + 'px';
    };
    b.onmouseleave = () => tip.classList.add('hidden');
  });
}

/* ---------- side panel ---------- */
function worldSideHTML(m) {
  const sel = WM.sel || {}, r = sel.route && wRoute(m, sel.route), pin = sel.pin && (m.pins || []).find(p => p.id === sel.pin);
  const halt = r && sel.halt && (r.halts || []).find(h => h.id === sel.halt);
  const encs = S.camp.encounters || [];
  const modeSel = (id, v) => `<select ${id}>${Object.entries(TRAVEL_MODES).map(([k, md]) => `<option value="${k}" ${k === v ? 'selected' : ''}>${t(md.label)} (${md.kmDay} ${t('km/day')})</option>`).join('')}</select>`;
  let h = `<div class="sec"><h4><i class="ico i-compass"></i> ${t('World map')}</h4>
    <span class="small">${m.scale ? t('Scale: 100 px = {km}', { km: fmtKm(m.scale * 100) }) : `<span class="warn">${t('Scale not set: use the "Scale" tool to get distances and travel days.')}</span>`}</span>
    <button class="primary" id="w-unroll"><i class="ico i-scroll"></i> ${t('Unroll the map before the players')}</button>
    <label class="row small">${t('Means of travel when drawing')} ${modeSel('id="w-mode"', WM.mode)}</label>
    ${WM.drawing ? `<button class="small ok" id="w-finish">✔ ${t('Finish the route')}</button>` : ''}
  </div>`;
  // pins
  h += `<div class="sec"><h4><i class="ico i-flag"></i> ${t('Pins')}</h4>
    ${(m.pins || []).length ? `<div class="col small">${m.pins.map(p => `<a class="wli ${p.id === sel.pin ? 'on' : ''}" data-wpin="${p.id}"><i class="ico i-${p.icon || 'flag'}"></i> ${esc(p.name || t('Unnamed'))}${p.hidden ? ` <i class="ico i-hidden" title="${t('hidden from players')}"></i>` : ''}</a>`).join('')}</div>`
      : `<span class="muted small">${t('No pins: use the "Place a pin" tool.')}</span>`}
    ${pin ? `<div class="wbox"><input id="wp-name" value="${esc(pin.name)}" placeholder="${t('Name')}">
      <div class="wicons">${PIN_ICONS.map(i => `<button class="small ${i === (pin.icon || 'flag') ? 'on' : ''}" data-wicon="${i}"><i class="ico i-${i}"></i></button>`).join('')}</div>
      <textarea id="wp-note" rows="3" placeholder="${t('GM note (never shown to players)')}">${esc(pin.note || '')}</textarea>
      <label class="chk small"><input type="checkbox" id="wp-hid" ${pin.hidden ? 'checked' : ''}> ${t('hidden from players')}</label>
      <button class="small danger" id="wp-del"><i class="ico i-trash"></i> ${t('Delete the pin')}</button></div>` : ''}
  </div>`;
  // routes
  h += `<div class="sec"><h4><i class="ico i-footsteps"></i> ${t('Routes')}</h4>
    ${(m.routes || []).length ? `<div class="col small">${m.routes.map(x => `<a class="wli ${x.id === sel.route ? 'on' : ''}" data-wroute="${x.id}"><i class="ico i-${m.activeRoute === x.id ? 'party' : 'footsteps'}"></i> ${esc(x.name)} <span class="muted">${fmtKm(pxKm(m, routeLen(x)))}</span></a>`).join('')}</div>`
      : `<span class="muted small">${t('No routes: use the "Draw a route" tool.')}</span>`}`;
  if (r) {
    const len = routeLen(r), prog = Math.min(r.prog || 0, len), days = travelDays(m, r), done = travelDays(m, r, 0, prog);
    const next = (r.halts || []).filter(x => x.d > prog + 0.5).sort((a, b) => a.d - b.d)[0];
    h += `<div class="wbox"><input id="wr-name" value="${esc(r.name)}">
      <div class="row small"><input type="color" id="wr-col" value="${r.color || ROUTE_COLOR}" style="width:36px;padding:0">
        <label class="chk"><input type="checkbox" id="wr-shown" ${r.shown ? 'checked' : ''}> ${t('players see the whole route')}</label></div>
      ${m.activeRoute === r.id ? `<span class="small"><i class="ico i-party"></i> ${t('The party follows this route.')}</span>` : `<button class="small" id="wr-active"><i class="ico i-party"></i> ${t('The party follows this route')}</button>`}
      <table class="t small wlegs"><tr><th>${t('Leg')}</th><th>${t('Travel')}</th><th>km</th><th>${t('Time')}</th></tr>
        ${routeLegs(r).map(l => `<tr><td>${l.i}</td><td>${modeSel(`data-wleg="${l.i}"`, l.mode)}</td><td>${fmtKm(pxKm(m, l.len))}</td><td>${fmtDays(m.scale ? l.len * m.scale / modeOf(l.mode).kmDay : null)}</td></tr>`).join('')}
        <tr><th colspan="2">${t('Total')}</th><th>${fmtKm(pxKm(m, len))}</th><th>${fmtDays(days)}</th></tr></table>
      <div class="row small"><button class="small" id="wr-more">+ ${t('Continue the route')}</button><button class="small" id="wr-pop">↶ ${t('Remove the last point')}</button></div>
      <h4 class="small"><i class="ico i-hourglass"></i> ${t('Halts')}</h4>
      ${(r.halts || []).length ? `<div class="col small">${[...r.halts].sort((a, b) => a.d - b.d).map(x => `<a class="wli ${x.id === sel.halt ? 'on' : ''}" data-whalt="${x.id}">${x.d <= prog + 0.5 ? '✔' : '◆'} ${esc(x.name || t('Halt'))} <span class="muted">${fmtKm(pxKm(m, x.d))}</span>${x.hidden ? ` <i class="ico i-hidden"></i>` : ''}${x.enc ? ` <i class="ico i-combat"></i>` : ''}</a>`).join('')}</div>`
        : `<span class="muted small">${t('No halts: use the "Add a halt" tool.')}</span>`}
      ${halt ? `<div class="wbox"><input id="wh-name" value="${esc(halt.name)}" placeholder="${t('Name')}">
        <textarea id="wh-note" rows="3" placeholder="${t('What happens here (GM note)')}">${esc(halt.note || '')}</textarea>
        <label class="field"><span>${t('Encounter launched here')}</span><select id="wh-enc"><option value="">— ${t('none')} —</option>${encs.map(x => `<option value="${x.id}" ${x.id === halt.enc ? 'selected' : ''}>${esc(x.name)}${S.camp.maps.some(mm => mm.id === x.map) ? '' : ' ' + t('(no battle map)')}</option>`).join('')}</select></label>
        <label class="chk small"><input type="checkbox" id="wh-hid" ${halt.hidden ? 'checked' : ''}> ${t('hidden until the party reaches it')}</label>
        <div class="row">${halt.enc ? `<button class="small primary" id="wh-fight"><i class="ico i-swords"></i> ${t('Launch the combat')}</button>` : ''}<button class="small danger" id="wh-del"><i class="ico i-trash"></i></button></div></div>` : ''}
      <h4 class="small"><i class="ico i-party"></i> ${t('Travel')}</h4>
      <span class="small">${t('Traveled: {done} of {total}', { done: fmtKm(pxKm(m, prog)), total: fmtKm(pxKm(m, len)) })}${done != null && prog > 0.5 ? ' · ' + fmtDays(done) : ''}</span>
      <div class="row">${prog < len - 0.5 ? `<button class="primary small" id="wt-next"><i class="ico i-footsteps"></i> ${next ? t('Go to: {name}', { name: esc(next.name || t('Halt')) }) : t('Go to the end')}</button>` : `<span class="small ok">✔ ${t('Arrived.')}</span>`}
        ${next && prog < len - 0.5 ? `<button class="small" id="wt-end">${t('Straight to the end')}</button>` : ''}<button class="small" id="wt-reset" title="${t('Back to the start (no animation)')}">⏮</button></div>
      <button class="small danger" id="wr-del"><i class="ico i-trash"></i> ${t('Delete the route')}</button>
    </div>`;
  }
  return h + '</div>';
}

function bindWorldSide(el, m) {
  const redraw = () => { wSave(); drawMapSide(); };
  const sel = WM.sel || {}, r = sel.route && wRoute(m, sel.route), pin = sel.pin && m.pins.find(p => p.id === sel.pin), halt = r && sel.halt && r.halts.find(h => h.id === sel.halt);
  $('#w-unroll', el).onclick = () => {
    S.camp.playerMap = m.id; S.camp.unroll = { id: uid('ur'), map: m.id }; saveMap(); worldSync(S.camp); drawMapSide();
    toast(`<i class="ico i-scroll"></i> ${t('The map unrolls before the players.')}`);
  };
  $('#w-mode', el).onchange = e => { WM.mode = e.target.value; };
  $('#w-finish', el) && ($('#w-finish', el).onclick = finishRoute);
  $$('[data-wpin]', el).forEach(a => a.onclick = () => { WM.sel = { pin: a.dataset.wpin }; const p = m.pins.find(x => x.id === a.dataset.wpin); p && MV.centerOn(p.x, p.y); MV.viewChanged(); MV.drawWorld(); drawMapSide(); });
  $$('[data-wroute]', el).forEach(a => a.onclick = () => { WM.sel = { route: a.dataset.wroute }; MV.drawWorld(); drawMapSide(); });
  $$('[data-whalt]', el).forEach(a => a.onclick = () => { WM.sel = { route: r.id, halt: a.dataset.whalt }; MV.drawWorld(); drawMapSide(); });
  if (pin) {
    $('#wp-name', el).onchange = e => { pin.name = e.target.value; redraw(); };
    $$('[data-wicon]', el).forEach(b => b.onclick = () => { pin.icon = b.dataset.wicon; redraw(); });
    $('#wp-note', el).onchange = e => { pin.note = e.target.value; wSave(); };
    $('#wp-hid', el).onchange = e => { pin.hidden = e.target.checked; redraw(); };
    $('#wp-del', el).onclick = () => { m.pins = m.pins.filter(p => p !== pin); WM.sel = null; redraw(); };
  }
  if (!r) return;
  $('#wr-name', el).onchange = e => { r.name = e.target.value || r.name; redraw(); };
  $('#wr-col', el).oninput = e => { r.color = e.target.value; wSave(); };
  $('#wr-shown', el).onchange = e => { r.shown = e.target.checked; redraw(); };
  $('#wr-active', el) && ($('#wr-active', el).onclick = () => { m.activeRoute = r.id; redraw(); });
  $$('[data-wleg]', el).forEach(s => s.onchange = () => { r.pts[+s.dataset.wleg].mode = s.value; redraw(); });
  $('#wr-more', el).onclick = () => { WM.drawing = r.id; mapTool = 'route'; MV.vp.className = 'map-vp tool-route'; drawMapSide(); toast(t('Click on the map to add points. Double click or Enter = finish.')); };
  $('#wr-pop', el).onclick = () => { if (r.pts.length > 1) { r.pts.pop(); const len = routeLen(r); r.prog = Math.min(r.prog || 0, len); r.halts = r.halts.filter(x => x.d <= len); redraw(); } };
  $('#wr-del', el).onclick = () => confirmBox(t('Delete the route "{name}"?', { name: esc(r.name) }), () => {
    m.routes = m.routes.filter(x => x !== r); if (m.activeRoute === r.id) m.activeRoute = m.routes[0]?.id || null; WM.sel = null; WM.drawing = null; redraw();
  });
  const len = routeLen(r), prog = r.prog || 0, next = (r.halts || []).filter(x => x.d > prog + 0.5).sort((a, b) => a.d - b.d)[0];
  $('#wt-next', el) && ($('#wt-next', el).onclick = () => travelTo(m, r, next ? next.d : len));
  $('#wt-end', el) && ($('#wt-end', el).onclick = () => travelTo(m, r, len));
  $('#wt-reset', el).onclick = () => { r.prog = 0; delete WORLD.anims[r.id]; redraw(); };
  if (halt) {
    $('#wh-name', el).onchange = e => { halt.name = e.target.value; redraw(); };
    $('#wh-note', el).onchange = e => { halt.note = e.target.value; wSave(); };
    $('#wh-enc', el).onchange = e => { halt.enc = e.target.value; redraw(); };
    $('#wh-hid', el).onchange = e => { halt.hidden = e.target.checked; redraw(); };
    $('#wh-fight', el) && ($('#wh-fight', el).onclick = () => fightAtHalt(m, halt));
    $('#wh-del', el).onclick = () => { r.halts = r.halts.filter(x => x !== halt); WM.sel = { route: r.id }; redraw(); };
  }
}

/* ---------- travel ---------- */
function travelTo(m, r, to) {
  const from = partyProg(m, r);
  r.prog = to; m.activeRoute = r.id;
  S.camp.travel = { id: uid('tr'), map: m.id, route: r.id, from, to, dur: travelDuration(m, r, from, to) };
  if (S.camp.playerMap !== m.id) toast(t('This map is not shown to players: they will not see the journey.'), 4000);
  saveMap(); worldSync(S.camp); drawMapSide();
}
/* the party has reached the end of a move: halt reached -> what happens there */
WORLD.onArrive = a => {
  const m = S.camp.maps.find(x => x.id === a.map), r = m && wRoute(m, a.route); if (!r) return;
  if (S.tab === 'map') drawMapSide();
  const h = (r.halts || []).find(x => Math.abs(x.d - a.to) < 0.5);
  if (!h) { if (a.to >= routeLen(r) - 0.5) toast(`<i class="ico i-flag"></i> ${t('The party has arrived.')}`); return; }
  const enc = (S.camp.encounters || []).find(x => x.id === h.enc);
  modal(`<h3><i class="ico i-hourglass"></i> ${esc(h.name || t('Halt'))}</h3>
    ${h.note ? `<div class="md-view">${md(h.note)}</div>` : `<p class="muted">${t('The party makes a halt.')}</p>`}
    ${enc ? `<p><i class="ico i-combat"></i> ${t('Encounter: {name}', { name: `<b>${esc(enc.name)}</b>` })}</p>` : ''}
    <div class="actions"><button data-close>${t('Continue the journey')}</button>${enc ? `<button class="primary" id="wa-fight"><i class="ico i-swords"></i> ${t('Launch the combat')}</button>` : ''}</div>`, (box, close) => {
    $('#wa-fight', box) && ($('#wa-fight', box).onclick = () => { close(); fightAtHalt(m, h); });
  });
};
/* combat transition on every screen, then the prepared encounter (its battle map is shown to players) */
function fightAtHalt(m, h) {
  const enc = (S.camp.encounters || []).find(x => x.id === h.enc); if (!enc) return;
  S.camp.cue = { id: uid('cue'), kind: 'combat', text: t('Combat!') };
  worldSync(S.camp);
  if (!S.camp.maps.some(x => x.id === enc.map)) toast(t('This encounter has no battle map: players stay on the world map.'), 5000);
  setTimeout(() => launchEncounter(enc, { clear: true, pcs: true, allies: true, show: true, hp: 'avg' }), 900);
}

/* ---------- map interactions ---------- */
function worldPointerDown(e, m) {
  const vp = MV.vp, w0 = MV.toWorld(e.clientX, e.clientY), iz = 1 / MV.view.z;
  const pinEl = e.target.closest('[data-pin]'), haltEl = e.target.closest('[data-halt]'), ptEl = e.target.closest('[data-rpt]');
  const drag = (onMove, onUp) => {
    e.preventDefault(); e.stopPropagation(); capture(vp, e);
    const mv = ev => onMove(MV.toWorld(ev.clientX, ev.clientY));
    const up = () => { vp.removeEventListener('pointermove', mv); vp.removeEventListener('pointerup', up); onUp && onUp(); wSave(); drawMapSide(); };
    vp.addEventListener('pointermove', mv); vp.addEventListener('pointerup', up);
  };
  if (mapTool === 'move' || mapTool === 'pin' || mapTool === 'halt') {
    if (pinEl) { const p = m.pins.find(x => x.id === pinEl.dataset.pin); WM.sel = { pin: p.id }; worldPanel(true); MV.drawWorld(); drawMapSide(); drag(w => { p.x = w.x; p.y = w.y; MV.drawWorld(); }); return true; }
    if (haltEl) {
      const [rid, hid] = haltEl.dataset.halt.split(':'), r = wRoute(m, rid), h = r?.halts.find(x => x.id === hid); if (!h) return true;
      WM.sel = { route: rid, halt: hid }; worldPanel(true); MV.drawWorld(); drawMapSide();
      drag(w => { const n = nearestOnRoute(r, w.x, w.y); if (n) { h.d = n.d; MV.drawWorld(); } }); return true;
    }
    if (ptEl && mapTool === 'move') {
      const [rid, i] = ptEl.dataset.rpt.split(':'), r = wRoute(m, rid), p = r?.pts[+i]; if (!p) return true;
      WM.sel = { route: rid }; drawMapSide();
      drag(w => { p.x = w.x; p.y = w.y; MV.drawWorld(); }, () => { const len = routeLen(r); r.prog = Math.min(r.prog || 0, len); r.halts.forEach(h => { h.d = Math.min(h.d, len); }); }); return true;
    }
  }
  if (mapTool === 'pin') {
    e.preventDefault();
    const p = { id: uid('pin'), x: w0.x, y: w0.y, name: t('New place'), icon: 'flag', note: '', hidden: false };
    m.pins.push(p); WM.sel = { pin: p.id }; worldPanel(true); wSave(); drawMapSide();
    setTimeout(() => $('#wp-name')?.select(), 30);
    return true;
  }
  if (mapTool === 'route') {
    e.preventDefault();
    let r = wRoute(m, WM.drawing);
    if (!r) {
      r = { id: uid('rt'), name: t('Route {n}', { n: m.routes.length + 1 }), color: ROUTE_COLOR, shown: false, pts: [], halts: [], prog: 0 };
      m.routes.push(r); WM.drawing = r.id; if (!m.activeRoute) m.activeRoute = r.id;
    }
    const last = r.pts[r.pts.length - 1];
    if (!last || Math.hypot(last.x - w0.x, last.y - w0.y) > 4 * iz) r.pts.push({ x: w0.x, y: w0.y, mode: WM.mode });
    WM.sel = { route: r.id }; wSave(); drawMapSide();
    return true;
  }
  if (mapTool === 'halt') {
    e.preventDefault();
    const order = [WM.sel?.route, m.activeRoute, ...m.routes.map(x => x.id)];
    let best = null;
    for (const rid of order) { const r = wRoute(m, rid); const n = r && nearestOnRoute(r, w0.x, w0.y); if (n && (!best || n.dist < best.n.dist - 1)) best = { r, n }; }
    if (!best || best.n.dist > 40 * iz) { toast(t('Click on a route to add a halt.')); return true; }
    const h = { id: uid('ht'), d: best.n.d, name: t('Halt'), note: '', enc: '', hidden: true };
    best.r.halts.push(h); WM.sel = { route: best.r.id, halt: h.id }; worldPanel(true); wSave(); drawMapSide();
    setTimeout(() => $('#wh-name')?.select(), 30);
    return true;
  }
  if (mapTool === 'scale') {
    e.preventDefault(); capture(vp, e);
    const line = w => { MV.ovl.innerHTML = `<svg style="position:absolute;left:0;top:0;overflow:visible;pointer-events:none" width="1" height="1"><line x1="${w0.x}" y1="${w0.y}" x2="${w.x}" y2="${w.y}" stroke="#ffd38a" stroke-width="${3 * iz}" stroke-dasharray="${10 * iz} ${6 * iz}"/></svg>`; };
    const mv = ev => line(MV.toWorld(ev.clientX, ev.clientY));
    const up = ev => {
      vp.removeEventListener('pointermove', mv); vp.removeEventListener('pointerup', up); MV.ovl.innerHTML = '';
      const w = MV.toWorld(ev.clientX, ev.clientY), px = Math.hypot(w.x - w0.x, w.y - w0.y);
      if (px < 10 * iz) return toast(t('Draw a line between two places of the map.'));
      ask(t('Distance of this line'), [{ k: 'km', label: t('Real distance (km)'), value: m.scale ? Math.round(px * m.scale) : '' }], o => {
        const km = num(String(o.km).replace(',', '.'), 0); if (km <= 0) return;
        m.scale = km / px; mapTool = 'move'; vp.className = 'map-vp tool-move'; wSave(); drawMapSide(); toast(`<i class="ico i-set-square"></i> ${t('Scale set.')}`);
      });
    };
    vp.addEventListener('pointermove', mv); vp.addEventListener('pointerup', up);
    return true;
  }
  return false;
}
function bindWorldVP(vp) {
  vp.addEventListener('pointermove', e => {
    const m = curMap(); if (!isWorld(m) || mapTool !== 'route' || !WM.drawing || e.buttons) return;
    WM.hover = MV.toWorld(e.clientX, e.clientY); MV.drawWorld();
  });
  vp.addEventListener('dblclick', e => { if (isWorld(curMap()) && WM.drawing) { e.stopPropagation(); finishRoute(); } }, true);
}
function worldKey(e) {
  const m = curMap(); if (!isWorld(m)) return false;
  if (WM.drawing && (e.key === 'Enter' || e.key === 'Escape')) { e.preventDefault(); finishRoute(); return true; }
  if ((e.key === 'Delete' || e.key === 'Backspace') && WM.sel?.pin) { m.pins = m.pins.filter(p => p.id !== WM.sel.pin); WM.sel = null; wSave(); drawMapSide(); return true; }
  return false;
}
