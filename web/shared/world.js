/* ===== World map (shared by the GM and player views): pins, routes, halts, animated travel, unroll and combat cues =====
   A world map is a map with kind: 'world', no grid, a scale in km per pixel and:
     pins:   [{ id, x, y, name, icon, note, hidden }]
     routes: [{ id, name, color, shown, pts: [{ x, y, mode }], halts: [{ id, d, name, note, enc, hidden }], prog }]
             (pts[i].mode = means of travel of the leg that ends at point i; d and prog = distance along the route, in pixels)
     activeRoute: id of the route followed by the party
   Campaign: travel { id, map, route, from, to, dur }, unroll { id, map }, cue { id, kind, text } (played once by each screen). */
'use strict';

const TRAVEL_MODES = {
  foot: { label: 'On foot', kmDay: 36, icon: 'footsteps', dash: '10 7' },
  horse: { label: 'On horseback', kmDay: 48, icon: 'paw', dash: '18 6' },
  cart: { label: 'By cart', kmDay: 30, icon: 'bag', dash: '5 6' },
  boat: { label: 'By boat', kmDay: 72, icon: 'compass', dash: '20 6 4 6' },
  fly: { label: 'Flying', kmDay: 120, icon: 'dove', dash: '2 9' },
};
const ROUTE_COLOR = '#a3311f';   // ink red: readable on light parchments and dark maps (with its light edge)
const PIN_ICONS = ['castle', 'tower', 'flag', 'tankard', 'compass', 'skull', 'portal', 'crystal', 'lantern', 'people', 'fire', 'moon'];
const isWorld = m => m?.kind === 'world';
const modeOf = k => TRAVEL_MODES[k] || TRAVEL_MODES.foot;

/* ---------- route geometry (pixels of the map image) ---------- */
function routeLegs(r) {
  const out = []; let acc = 0;
  for (let i = 1; i < (r.pts || []).length; i++) {
    const a = r.pts[i - 1], b = r.pts[i], len = Math.hypot(b.x - a.x, b.y - a.y);
    out.push({ i, a, b, len, start: acc, mode: b.mode || 'foot' }); acc += len;
  }
  return out;
}
const routeLen = r => routeLegs(r).reduce((s, l) => s + l.len, 0);
function pointAt(r, d) {
  const legs = routeLegs(r);
  if (!legs.length) return r.pts?.[0] ? { ...r.pts[0], leg: null } : null;
  for (const l of legs) if (d <= l.start + l.len) { const k = l.len ? clamp((d - l.start) / l.len, 0, 1) : 0; return { x: l.a.x + (l.b.x - l.a.x) * k, y: l.a.y + (l.b.y - l.a.y) * k, leg: l }; }
  const last = legs[legs.length - 1]; return { x: last.b.x, y: last.b.y, leg: last };
}
/* route points up to distance d (the traveled part) */
function ptsUpTo(r, d) {
  const out = r.pts?.length ? [r.pts[0]] : [];
  for (const l of routeLegs(r)) {
    if (d >= l.start + l.len) out.push(l.b);
    else { if (d > l.start) { const p = pointAt(r, d); out.push({ x: p.x, y: p.y, mode: l.mode }); } break; }
  }
  return out;
}
function nearestOnRoute(r, x, y) {
  let best = null;
  for (const l of routeLegs(r)) {
    const dx = l.b.x - l.a.x, dy = l.b.y - l.a.y, k = l.len ? clamp(((x - l.a.x) * dx + (y - l.a.y) * dy) / (l.len * l.len), 0, 1) : 0;
    const px = l.a.x + dx * k, py = l.a.y + dy * k, dist = Math.hypot(x - px, y - py);
    if (!best || dist < best.dist) best = { d: l.start + l.len * k, dist, x: px, y: py };
  }
  return best;
}
/* km and days of travel (each leg at the speed of its means of travel) */
const pxKm = (m, px) => (m.scale ? px * m.scale : null);
function travelDays(m, r, from = 0, to = Infinity) {
  if (!m.scale) return null;
  let days = 0;
  for (const l of routeLegs(r)) {
    const a = Math.max(from, l.start), b = Math.min(to, l.start + l.len);
    if (b > a) days += (b - a) * m.scale / modeOf(l.mode).kmDay;
  }
  return days;
}
const fmtKm = km => (km == null ? '?' : km >= 100 ? Math.round(km) + ' km' : (Math.round(km * 10) / 10).toString().replace('.', LANG === 'en' ? '.' : ',') + ' km');
const fmtDays = d => (d == null ? '' : d < 0.1 ? t('less than an hour') : d < 1 ? t('{n} h', { n: Math.max(1, Math.round(d * 8)) }) : t(Math.round(d * 2) / 2 === 1 ? '{n} day' : '{n} days', { n: String(Math.round(d * 2) / 2).replace('.', LANG === 'en' ? '.' : ',') }));

/* ---------- animated travel: every screen plays a move once, from when it receives it ---------- */
const WORLD = { seen: {}, anims: {}, raf: 0, onArrive: null, views: new Set() };
const ease = k => (k < .5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2);
function travelDuration(m, r, from, to) {
  const days = travelDays(m, r, from, to);
  return clamp(1800 + (days ?? Math.abs(to - from) / 200) * 700, 2200, 9000);
}
/* current (displayed) progress of the party on a route */
function partyProg(map, r) {
  const a = WORLD.anims[r.id];
  if (a && a.map === map.id) { const k = clamp((performance.now() - a.t0) / a.dur, 0, 1); return a.from + (a.to - a.from) * ease(k); }
  return r.prog || 0;
}
/* called whenever new campaign data arrives: starts the animations and effects not played yet */
function worldSync(camp, { first = false } = {}) {
  const tr = camp.travel;
  if (tr && !WORLD.seen['t' + tr.id]) {
    WORLD.seen['t' + tr.id] = 1;
    if (!first) { WORLD.anims[tr.route] = { ...tr, t0: performance.now() }; worldLoop(); }
  }
  for (const [k, fx] of [['u', camp.unroll], ['c', camp.cue]]) {
    if (fx && !WORLD.seen[k + fx.id]) { WORLD.seen[k + fx.id] = 1; if (!first) (k === 'u' ? playUnroll : playCue)(fx); }
  }
}
function worldLoop() {
  if (WORLD.raf) return;
  const step = () => {
    WORLD.raf = 0;
    const now = performance.now();
    for (const v of WORLD.views) v.drawWorld();
    for (const [rid, a] of Object.entries(WORLD.anims)) if (now - a.t0 >= a.dur) { delete WORLD.anims[rid]; WORLD.onArrive && WORLD.onArrive(a); }
    if (Object.keys(WORLD.anims).length) WORLD.raf = requestAnimationFrame(step);
    else for (const v of WORLD.views) v.drawWorld();
  };
  WORLD.raf = requestAnimationFrame(step);
}

/* ---------- drawing (in map coordinates, inside the zoomed world layer) ---------- */
function worldHTML(m, { player = false, sel = null, drawing = null, hover = null, iz = 1 } = {}) {
  const dash = d => d.split(' ').map(x => (+x * iz).toFixed(1)).join(' ');   // dashes keep their length on screen whatever the zoom
  if (!isWorld(m)) return '';
  let svg = '', html = '';
  for (const r of m.routes || []) {
    if (!r.pts?.length) continue;
    const prog = partyProg(m, r), col = r.color || ROUTE_COLOR, isSel = sel?.route === r.id;
    const legs = routeLegs(r), done = ptsUpTo(r, prog);
    // whole route (dashed by means of travel), then the traveled part on top
    for (const l of legs) {
      const md = modeOf(l.mode);
      svg += `<line x1="${l.a.x}" y1="${l.a.y}" x2="${l.b.x}" y2="${l.b.y}" class="wr-shadow"/>`
        + `<line x1="${l.a.x}" y1="${l.a.y}" x2="${l.b.x}" y2="${l.b.y}" class="wr-line ${isSel ? 'sel' : ''}" stroke="${col}" stroke-dasharray="${dash(md.dash)}"/>`;
    }
    if (done.length > 1) svg += `<polyline points="${done.map(p => p.x + ',' + p.y).join(' ')}" class="wr-done" stroke="${col}"/>`;
    if (!player) r.pts.forEach((p, i) => { svg += `<circle cx="${p.x}" cy="${p.y}" r="4" class="wr-pt ${i === 0 ? 'start' : ''}" data-rpt="${r.id}:${i}"/>`; });
    // means of travel of each leg, at its middle
    for (const l of legs) {
      if (player && l.start > prog && !r.shown) continue;
      html += `<div class="wmode" style="left:${(l.a.x + l.b.x) / 2}px;top:${(l.a.y + l.b.y) / 2}px" title="${esc(t(modeOf(l.mode).label))}"><b><i class="ico i-${modeOf(l.mode).icon}"></i></b></div>`;
    }
    for (const h of r.halts || []) {
      if (player && h.hidden && h.d > prog + 0.5) continue;
      const p = pointAt(r, h.d); if (!p) continue;
      const reached = h.d <= prog + 0.5;
      html += `<div class="whalt ${reached ? 'reached' : ''} ${h.hidden ? 'secret' : ''} ${sel?.halt === h.id ? 'sel' : ''} ${h.enc ? 'enc' : ''}" data-halt="${r.id}:${h.id}" style="left:${p.x}px;top:${p.y}px">
        <i class="d"></i>${h.name ? `<span>${esc(h.name)}</span>` : ''}${!player && h.hidden ? '<i class="ico i-hidden"></i>' : ''}</div>`;
    }
    if (m.activeRoute === r.id) {
      const p = pointAt(r, prog);
      if (p) html += `<div class="wparty ${WORLD.anims[r.id] ? 'moving' : ''}" style="left:${p.x}px;top:${p.y}px" title="${esc(t('The party'))}"><i class="ico i-${modeOf(p.leg?.mode).icon === 'footsteps' ? 'party' : modeOf(p.leg?.mode).icon}"></i></div>`;
    }
  }
  if (drawing && hover) { const last = drawing.pts[drawing.pts.length - 1]; if (last) svg += `<line x1="${last.x}" y1="${last.y}" x2="${hover.x}" y2="${hover.y}" class="wr-preview"/>`; }
  for (const p of m.pins || []) {
    if (player && p.hidden) continue;
    html += `<div class="wpin ${p.hidden ? 'secret' : ''} ${sel?.pin === p.id ? 'sel' : ''}" data-pin="${p.id}" style="left:${p.x}px;top:${p.y}px">
      <b><i class="ico i-${PIN_ICONS.includes(p.icon) ? p.icon : 'flag'}"></i></b>${p.name ? `<span>${esc(p.name)}</span>` : ''}${!player && p.hidden ? '<i class="ico i-hidden h"></i>' : ''}</div>`;
  }
  return `<svg class="wsvg" width="${m.w || 1}" height="${m.h || 1}">${svg}</svg>${html}`;
}

/* ---------- screen effects ---------- */
function playUnroll() {
  const vp = document.querySelector('.map-vp'); if (!vp) return;
  window.dispatchEvent(new Event('world-unroll'));   // the player view makes room for the map first
  vp.classList.remove('unrolling'); void vp.offsetWidth; vp.classList.add('unrolling');
  const rod = document.createElement('div'); rod.className = 'unroll-rod'; vp.appendChild(rod);
  setTimeout(() => { vp.classList.remove('unrolling'); rod.remove(); }, 2800);
}
function playCue(c) {
  const d = document.createElement('div'); d.className = 'cue cue-' + (c.kind || 'combat');
  d.innerHTML = `<div><i class="ico i-swords"></i><b>${esc(c.text || t('Combat!'))}</b></div>`;
  document.body.appendChild(d); setTimeout(() => d.remove(), 2600);
  if (navigator.vibrate && navigator.userActivation?.hasBeenActive) navigator.vibrate([120, 60, 220]);
}
