/* ===== Battle map display (shared by the GM and player views) ===== */
'use strict';

function newMap(name, url, w, h) {
  return {
    id: uid('map'), name, url, w: w || 0, h: h || 0,
    grid: { size: 70, ox: 0, oy: 0, show: true, color: '#000000', alpha: 0.35, snap: true, meters: 1.5 },
    tokens: [], fog: { on: false, rev: {} }, view: null,
  };
}
/* display info of a token, resolved from the characters / the combat */
function tokenInfo(t) {
  const r = t.ref || {}, cbt = S.camp.combat, cur = cbt.active ? cbt.list[cbt.turn] : null;
  let o = { name: t.name || '?', img: t.img || '', kind: t.kind || 'npc', hp: null, hpMax: null, dead: false, conds: [], cur: false, hidden: !!t.hidden, color: t.color || '' };
  if (r.kind === 'pc') {
    const c = S.chars[r.id];
    if (c) Object.assign(o, { name: c.name, img: t.img || c.portrait, kind: 'pc', hp: c.hp, hpMax: c.hpMax, conds: c.conditions || [], color: t.color || c.color, dead: c.hp <= 0 && (c.deathSaves?.f >= 3) });
    o.cur = !!(cur && cur.kind === 'pc' && cur.charId === r.id); o.charId = r.id;
  } else if (r.kind === 'cb') {
    const cb = cbt.list.find(x => x.uid === r.id);
    if (cb) {
      if (cb.kind === 'pc') { const c = S.chars[cb.charId]; o.charId = cb.charId; c && Object.assign(o, { name: c.name, img: t.img || c.portrait, kind: 'pc', hp: c.hp, hpMax: c.hpMax, conds: c.conditions || [] }); }
      else Object.assign(o, { name: cb.name, img: t.img || cbPortrait(cb), kind: cb.kind, hp: cb.hp, hpMax: cb.hpMax, conds: cb.conditions || [], dead: cb.dead || cb.hp <= 0, hidden: !!(t.hidden || cb.hidden) });
      o.cur = cur?.uid === cb.uid;
    }
  } else if (r.kind === 'mon') {
    const m = S.mons[r.id]; if (m) Object.assign(o, { name: t.name || m.name, img: t.img || m.portrait, kind: 'mon' });
  }
  return o;
}
/* portrait of a combatant: its own, otherwise the bestiary monster's */
const cbPortrait = cb => cb?.portrait || S.mons?.[cb?.monId]?.portrait || '';
/* icons of the conditions (keys are the stored French names) */
const COND_ICONS = { 'À terre': '<i class="ico i-prone"></i>', 'Agrippé': '<i class="ico i-grapple"></i>', 'Aveuglé': '<i class="ico i-hidden"></i>', 'Charmé': '<i class="ico i-charm"></i>', 'Effrayé': '<i class="ico i-frightened"></i>', 'Empoisonné': '<i class="ico i-poison"></i>', 'Entravé': '<i class="ico i-restrained"></i>', 'Étourdi': '<i class="ico i-stunned"></i>', 'Inconscient': '<i class="ico i-sleep"></i>', 'Invisible': '<i class="ico i-invisible"></i>', 'Paralysé': '<i class="ico i-frozen"></i>', 'Concentration': '<i class="ico i-spells"></i>', 'Rage': '<i class="ico i-rage"></i>', 'Caché': '<i class="ico i-hood"></i>', 'Béni': '<i class="ico i-sparkle"></i>', 'Neutralisé': '<i class="ico i-forbidden"></i>', 'Pétrifié': '<i class="ico i-statue"></i>', 'Transformé': '<i class="ico i-paw"></i>', 'Marqué': '<i class="ico i-target"></i>' };

/* background of a token without an image, by side */
const TOKEN_FILL = { pc: '#2a5a8a', mon: '#8a2a22', npc: '#7a6a20' };

class MapView {
  constructor(vp, opts = {}) {
    this.vp = vp; this.opts = opts; this.player = !!opts.player; this.map = null;
    vp.innerHTML = `<div class="map-world"><img class="bg" alt=""><canvas class="grid"></canvas><div class="toks"></div><canvas class="fog"></canvas><div class="ovl"></div><div class="pings"></div></div>
      <div class="map-empty hidden"><div class="big"><i class="ico i-map"></i></div><div>${opts.emptyText || t('No map')}</div></div>`;
    this.world = $('.map-world', vp); this.img = $('img.bg', vp); this.gridC = $('canvas.grid', vp); this.fogC = $('canvas.fog', vp);
    this.toks = $('.toks', vp); this.ovl = $('.ovl', vp); this.pingL = $('.pings', vp); this.shownPings = new Set(); this.empty = $('.map-empty', vp);
    this.view = { x: 0, y: 0, z: 1 };
    this.img.onload = () => {
      const m = this.map; if (!m) return;
      if (!m.w || m.w !== this.img.naturalWidth) { m.w = this.img.naturalWidth; m.h = this.img.naturalHeight; opts.onDims && opts.onDims(m); }
      this.sizeCanvases(); this.drawGrid(); this.drawFog(); this.drawTokens();
      if (!m.view || this._fitNext) { this._fitNext = false; this.fit(); }
    };
    vp.addEventListener('wheel', e => {
      e.preventDefault();
      const r = vp.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top;
      this.zoomAt(px, py, e.deltaY < 0 ? 1.15 : 1 / 1.15);
    }, { passive: false });
    vp.addEventListener('pointerdown', e => {
      const panBtn = e.button === 1 || e.button === 2 || (e.button === 0 && (this.spaceDown || (opts.panOnLeft && opts.panOnLeft(e))));
      if (!panBtn) return;
      e.preventDefault();
      const sx = e.clientX, sy = e.clientY, vx = this.view.x, vy = this.view.y;
      vp.classList.add('panning'); capture(vp, e);
      const mv = ev => { this.view.x = vx + ev.clientX - sx; this.view.y = vy + ev.clientY - sy; this.applyView(); };
      const up = () => { vp.classList.remove('panning'); vp.removeEventListener('pointermove', mv); vp.removeEventListener('pointerup', up); this.viewChanged(); };
      vp.addEventListener('pointermove', mv); vp.addEventListener('pointerup', up);
    });
    vp.addEventListener('contextmenu', e => e.preventDefault());
    this._kd = e => { if (e.code === 'Space' && !e.target.matches('input,textarea,select')) { this.spaceDown = true; } };
    this._ku = e => { if (e.code === 'Space') this.spaceDown = false; };
    window.addEventListener('keydown', this._kd); window.addEventListener('keyup', this._ku);
  }
  destroy() { window.removeEventListener('keydown', this._kd); window.removeEventListener('keyup', this._ku); }
  setMap(map, { fit } = {}) {
    const changed = map?.url !== this.map?.url || map?.id !== this.map?.id;
    this.map = map;
    this.empty.classList.toggle('hidden', !!map);
    this.world.classList.toggle('hidden', !map);
    if (!map) return;
    if (map.view && !fit && !this.player) this.view = { ...map.view };
    this._fitNext = !!fit;
    if (changed || !this.img.complete) { this.img.src = map.url; }
    else { this.sizeCanvases(); this.drawGrid(); this.drawFog(); this.drawTokens(); if (fit) this.fit(); }
    this.applyView();
  }
  sizeCanvases() {
    const m = this.map; if (!m || !m.w) return;
    for (const c of [this.gridC, this.fogC]) if (c.width !== m.w || c.height !== m.h) { c.width = m.w; c.height = m.h; }
    this.world.style.width = m.w + 'px'; this.world.style.height = m.h + 'px';
  }
  applyView() {
    this.world.style.transform = `translate(${this.view.x}px,${this.view.y}px) scale(${this.view.z})`;
    const zl = this.vp.querySelector('.map-hud .zl'); if (zl) zl.textContent = Math.round(this.view.z * 100) + ' %';
  }
  viewChanged() { if (this.map && !this.player) { this.map.view = { ...this.view }; this.opts.onView && this.opts.onView(); } }
  zoomAt(px, py, f) {
    const z = clamp(this.view.z * f, 0.05, 8), wx = (px - this.view.x) / this.view.z, wy = (py - this.view.y) / this.view.z;
    this.view.z = z; this.view.x = px - wx * z; this.view.y = py - wy * z; this.applyView(); this.viewChanged();
  }
  zoom(f) { const r = this.vp.getBoundingClientRect(); this.zoomAt(r.width / 2, r.height / 2, f); }
  fit() {
    const m = this.map; if (!m || !m.w) return;
    const r = this.vp.getBoundingClientRect(), z = Math.min(r.width / m.w, r.height / m.h) * 0.98;
    this.view = { z, x: (r.width - m.w * z) / 2, y: (r.height - m.h * z) / 2 }; this.applyView(); this.viewChanged();
  }
  centerOn(cx, cy, z) {
    const r = this.vp.getBoundingClientRect(); this.view.z = z || this.view.z;
    this.view.x = r.width / 2 - cx * this.view.z; this.view.y = r.height / 2 - cy * this.view.z; this.applyView();
  }
  toWorld(clientX, clientY) {
    const r = this.vp.getBoundingClientRect();
    return { x: (clientX - r.left - this.view.x) / this.view.z, y: (clientY - r.top - this.view.y) / this.view.z };
  }
  toCell(wx, wy) { const g = this.map.grid; return { cx: (wx - g.ox) / g.size, cy: (wy - g.oy) / g.size }; }
  drawGrid() {
    const m = this.map, g = m.grid, ctx = this.gridC.getContext('2d');
    ctx.clearRect(0, 0, m.w, m.h);
    if (!g.show || g.size < 4) return;
    ctx.strokeStyle = g.color; ctx.globalAlpha = g.alpha; ctx.lineWidth = Math.max(1, g.size / 70);
    ctx.beginPath();
    for (let x = ((g.ox % g.size) + g.size) % g.size; x <= m.w; x += g.size) { ctx.moveTo(x + .5, 0); ctx.lineTo(x + .5, m.h); }
    for (let y = ((g.oy % g.size) + g.size) % g.size; y <= m.h; y += g.size) { ctx.moveTo(0, y + .5); ctx.lineTo(m.w, y + .5); }
    ctx.stroke(); ctx.globalAlpha = 1;
  }
  drawFog() {
    const m = this.map, ctx = this.fogC.getContext('2d');
    ctx.clearRect(0, 0, m.w, m.h);
    if (!m.fog?.on) return;
    const g = m.grid;
    // bords adoucis : le flou suit la taille des cases
    this.fogC.style.filter = `blur(${Math.max(2, g.size * 0.12).toFixed(1)}px)`;
    ctx.fillStyle = this.player ? '#0b0906' : 'rgba(10,8,25,0.55)';
    ctx.fillRect(0, 0, m.w, m.h);
    for (const k of Object.keys(m.fog.rev || {})) {
      const [cx, cy] = k.split(',').map(Number);
      ctx.clearRect(g.ox + cx * g.size, g.oy + cy * g.size, g.size, g.size);
    }
  }
  cellHidden(cx, cy) { const m = this.map; return m.fog?.on && !m.fog.rev?.[`${Math.floor(cx)},${Math.floor(cy)}`]; }
  drawTokens() {
    const m = this.map, g = m.grid; if (!m) return;
    const sel = this.opts.selected ? this.opts.selected() : null;
    let html = '';
    for (const t of m.tokens) {
      const o = tokenInfo(t);
      if (this.player) {
        if (o.hidden) continue;
        const sz = t.size || 1;
        if (o.kind !== 'pc' && this.cellHidden(t.x + sz / 2, t.y + sz / 2)) continue;
      }
      const px = (t.size || 1) * g.size;
      // in the player view, opponents' hit points arrive as a state (0 to 4)
      const showHp = o.hp != null && o.hpMax && (!this.player || o.kind === 'pc' || o.hpMax === 4);
      const hp = showHp ? clamp(o.hp / o.hpMax, 0, 1) : 0;
      const state = this.player && o.kind !== 'pc' && o.hp != null && o.hpMax === 4 && o.hp > 0 && o.hp < 4 ? HP_STATES[o.hp] : '';
      const fill = o.color || TOKEN_FILL[o.kind] || TOKEN_FILL.npc;
      const conds = o.conds.slice(0, 4).map(c => `<span title="${esc(condName(c.n))}">${COND_ICONS[c.n] || '<i class="ico i-alert"></i>'}</span>`).join('');
      html += `<div class="token ${o.kind} ${this.opts.mine && this.opts.mine(o) ? 'mine' : ''} ${t.id === sel ? 'sel' : ''} ${o.cur ? 'cur' : ''} ${o.hidden ? 'hid' : ''} ${o.dead ? 'dead' : ''} ${px < 40 ? 'tiny' : ''}" data-tok="${t.id}"
        style="left:${g.ox + t.x * g.size}px;top:${g.oy + t.y * g.size}px;width:${px}px;height:${px}px;--px:${px}px;--fill:${fill}">
        ${showHp ? `<div class="tk-hp" style="--hp:${hp.toFixed(3)};--hpc:${hp > .5 ? '#5fd068' : hp > .25 ? '#e8b43a' : '#e5483b'}"></div>` : ''}
        <div class="tk-ring"></div>
        <div class="tk-img" ${o.img ? `style="background-image:url('${esc(o.img)}')"` : ''}>${o.img ? '' : `<b>${esc(initials(o.name))}</b>`}</div>
        ${o.dead ? '<div class="tk-dead"><i class="ico i-skull"></i></div>' : ''}
        ${o.hidden && !this.player ? '<div class="tk-hid"><i class="ico i-hidden"></i></div>' : ''}
        ${conds ? `<div class="tc">${conds}</div>` : ''}
        <div class="tl" title="${esc(o.name)}">${esc(o.name)}${state ? `<small>${state}</small>` : ''}</div></div>`;
    }
    this.toks.innerHTML = html;
  }
  /* pings (long press / Alt+click) sent by players or the GM */
  showPings(list) {
    if (!this.map) return;
    for (const p of list || []) {
      if (p.map !== this.map.id || this.shownPings.has(p.id) || p.age > 4) continue;
      this.shownPings.add(p.id);
      const d = document.createElement('div'); d.className = 'ping';
      d.style.left = p.x + 'px'; d.style.top = p.y + 'px'; d.style.setProperty('--pc', p.color || '#ffd34a');
      d.style.setProperty('--ps', (1 / this.view.z).toFixed(3));
      d.innerHTML = `<i></i><i></i><span>${esc(p.who)}</span>`;
      this.pingL.appendChild(d); setTimeout(() => d.remove(), 3200);
    }
  }
  drawAll() { if (!this.map) return; this.sizeCanvases(); this.drawGrid(); this.drawFog(); this.drawTokens(); }
}
/* distances are stored in meters (1 square = 1.5 m); shown in feet in English (1.5 m = 5 ft) */
const toFeet = m => Math.round(m * 10 / 3 * 10) / 10;
const fmtDist = m => (LANG === 'en' ? `${toFeet(m)} ft` : `${String(m).replace('.', ',')} m`);
/* D&D distance (diagonal = 1 square) between two points, in squares */
function gridDist(a, b, meters = 1.5) {
  const c = Math.max(Math.abs(Math.round(b.cx) - Math.round(a.cx)), Math.abs(Math.round(b.cy) - Math.round(a.cy)));
  return { cells: c, m: +(c * meters).toFixed(1) };
}
