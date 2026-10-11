/* ===== Table du MJ — noyau : état, sauvegarde, dés, utilitaires ===== */
'use strict';

window.addEventListener('error', e => {
  fetch('/api/clientlog', { method: 'POST', body: `${e.message} @ ${e.filename}:${e.lineno}:${e.colno}` }).catch(() => {});
});
window.addEventListener('unhandledrejection', e => {
  fetch('/api/clientlog', { method: 'POST', body: 'Promesse rejetée : ' + (e.reason && (e.reason.stack || e.reason)) }).catch(() => {});
});

/* ---------- utilitaires ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = (p = '') => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const mod = s => Math.floor(((+s || 10) - 10) / 2);
const fmod = n => (n >= 0 ? '+' : '') + n;
const num = (v, d = 0) => { const n = parseFloat(String(v).replace(',', '.')); return isNaN(n) ? d : n; };
const slug = s => String(s).normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'x';
const initials = s => String(s || '?').split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
function getPath(o, p) { return p.split('.').reduce((a, k) => (a == null ? a : a[k]), o); }
function setPath(o, p, v) {
  const ks = p.split('.'); let a = o;
  for (let i = 0; i < ks.length - 1; i++) { if (a[ks[i]] == null || typeof a[ks[i]] !== 'object') a[ks[i]] = {}; a = a[ks[i]]; }
  a[ks[ks.length - 1]] = v;
}
const timers = {};
function capture(el, e) { try { el.setPointerCapture(e.pointerId); } catch (_) { } }
function debounce(key, fn, ms = 350) { clearTimeout(timers[key]); timers[key] = setTimeout(() => { delete timers[key]; fn(); }, ms); }
function colorFor(s) { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) % 360; return `hsl(${h} 45% 38%)`; }

/* ---------- données de référence D&D 5e ---------- */
const STATS = ['FOR', 'DEX', 'CON', 'INT', 'SAG', 'CHA'];
const STAT_NAMES = { FOR: 'Force', DEX: 'Dextérité', CON: 'Constitution', INT: 'Intelligence', SAG: 'Sagesse', CHA: 'Charisme' };
const SKILLS = [
  ['Acrobaties', 'DEX'], ['Arcanes', 'INT'], ['Athlétisme', 'FOR'], ['Discrétion', 'DEX'], ['Dressage', 'SAG'],
  ['Escamotage', 'DEX'], ['Histoire', 'INT'], ['Intimidation', 'CHA'], ['Investigation', 'INT'], ['Médecine', 'SAG'],
  ['Nature', 'INT'], ['Perception', 'SAG'], ['Perspicacité', 'SAG'], ['Persuasion', 'CHA'], ['Religion', 'INT'],
  ['Représentation', 'CHA'], ['Survie', 'SAG'], ['Tromperie', 'CHA'],
];
const XP_TABLE = [0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000, 85000, 100000, 120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000];
const CR_XP = { '0': 10, '1/8': 25, '1/4': 50, '1/2': 100, '1': 200, '2': 450, '3': 700, '4': 1100, '5': 1800, '6': 2300, '7': 2900, '8': 3900, '9': 5000, '10': 5900, '11': 7200, '12': 8400, '13': 10000, '14': 11500, '15': 13000, '16': 15000, '17': 18000, '18': 20000, '19': 22000, '20': 25000, '21': 33000, '22': 41000, '23': 50000, '24': 62000, '30': 155000 };
const HIT_DIE = { barbare: 12, guerrier: 10, paladin: 10, rodeur: 10, magicien: 6, sorcier: 6, ensorceleur: 6 };
const FULL_SLOTS = [[], [2], [3], [4, 2], [4, 3], [4, 3, 2], [4, 3, 3], [4, 3, 3, 1], [4, 3, 3, 2], [4, 3, 3, 3, 1], [4, 3, 3, 3, 2], [4, 3, 3, 3, 2, 1], [4, 3, 3, 3, 2, 1], [4, 3, 3, 3, 2, 1, 1], [4, 3, 3, 3, 2, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1, 1], [4, 3, 3, 3, 3, 1, 1, 1, 1], [4, 3, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 3, 2, 2, 1, 1]];
const CONDITIONS = {
  'À terre': 'Seul déplacement possible : ramper (coût double), à moins de se relever (moitié de la vitesse). Désavantage aux jets d\'attaque. Les attaques contre la créature ont l\'avantage à 1,50 m, le désavantage au-delà.',
  'Agrippé': 'Vitesse 0. Prend fin si l\'agrippeur est neutralisé ou si la créature est éloignée de lui.',
  'Assourdi': 'N\'entend rien. Échoue automatiquement aux tests basés sur l\'ouïe.',
  'Aveuglé': 'Ne voit rien, échoue aux tests basés sur la vue. Désavantage à ses attaques, avantage aux attaques contre elle.',
  'Charmé': 'Ne peut pas attaquer le charmeur ni le cibler avec des effets nuisibles. Le charmeur a l\'avantage aux tests sociaux contre elle.',
  'Effrayé': 'Désavantage aux tests et attaques tant que la source de sa peur est visible. Ne peut pas s\'en rapprocher volontairement.',
  'Empoisonné': 'Désavantage aux jets d\'attaque et aux tests de caractéristique.',
  'Entravé': 'Vitesse 0. Désavantage à ses attaques et aux sauvegardes de DEX ; avantage aux attaques contre elle.',
  'Étourdi': 'Neutralisé, ne peut pas bouger, parle avec difficulté. Échoue aux sauvegardes de FOR et DEX ; avantage aux attaques contre elle.',
  'Inconscient': 'Neutralisé, lâche ce qu\'elle tient, tombe à terre. Échoue aux sauvegardes FOR/DEX. Avantage contre elle ; toute attaque réussie à 1,50 m est un critique.',
  'Invisible': 'Impossible à voir sans magie. Avantage à ses attaques, désavantage aux attaques contre elle.',
  'Neutralisé': 'Ne peut effectuer ni action ni réaction.',
  'Paralysé': 'Neutralisé, ne peut ni bouger ni parler. Échoue aux sauvegardes FOR/DEX. Avantage contre elle ; critique automatique à 1,50 m.',
  'Pétrifié': 'Transformée en substance inanimée. Neutralisée, résistance à tous les dégâts, immunisée au poison et aux maladies.',
  'Concentration': 'Maintient un sort. Si elle subit des dégâts : sauvegarde de CON DD 10 ou moitié des dégâts (le plus élevé).',
  'Rage': 'Avantage aux tests/sauvegardes de FOR, bonus aux dégâts de FOR, résistance contondant/perforant/tranchant.',
  'Caché': 'Les ennemis ne savent pas où elle est. Avantage à la prochaine attaque.',
  'Béni': '+1d4 aux jets d\'attaque et de sauvegarde.',
  'Marqué': 'Cible d\'un effet de marque (Marque du chasseur, etc.).',
  'Transformé': 'Sous une autre forme (forme sauvage, forme titanesque…).',
};
const EXHAUSTION = ['—', 'Désavantage aux tests de caractéristique', 'Vitesse divisée par 2', 'Désavantage aux attaques et sauvegardes', 'PV max divisés par 2', 'Vitesse réduite à 0', 'Mort'];
const profForLevel = l => 2 + Math.floor((clamp(l, 1, 20) - 1) / 4);
const levelForXP = xp => { let l = 1; for (let i = 0; i < 20; i++) if (xp >= XP_TABLE[i]) l = i + 1; return l; };
const classKey = c => slug(String(c.classe || '').split(/[\s—–-]/)[0]);

/* ---------- API & état ---------- */
const S = { chars: {}, mons: {}, camp: {}, rev: 0, tab: 'persos', root: '', campId: null, campMeta: {} };
let pending = 0;
async function api(method, url, body, headers = {}) {
  const opt = { method, headers: { ...headers } };
  if (body !== undefined) { opt.body = JSON.stringify(body); opt.headers['Content-Type'] = 'application/json'; }
  if (method !== 'GET' && S.campId && S.isMJ) opt.headers['X-Campagne'] = S.campId;
  const r = await fetch(url, opt);
  if (r.status === 409 && r.headers.get('Content-Type')?.includes('json')) {
    const d = await r.json().catch(() => ({}));
    if (/campagne/i.test(d.error || '') && S.isMJ) { toast('La campagne active a changé : rechargement…'); setTimeout(() => location.reload(), 800); }
    const err = new Error(d.error || 'conflit'); err.status = 409; err.data = d; throw err;
  }
  if (!r.ok) { const d = await r.json().catch(() => ({})); const err = new Error(d.error || (method + ' ' + url + ' → ' + r.status)); err.status = r.status; err.data = d; throw err; }
  return r.json();
}
function saveState(kind) {
  const el = $('#savestate'); if (!el) return;
  el.className = kind === 'dirty' ? 'dirty' : kind === 'err' ? 'err' : '';
  el.innerHTML = kind === 'dirty' ? '● enregistrement…' : kind === 'err' ? '<i class="ico i-alerte"></i> erreur de sauvegarde' : '✔ enregistré';
}
function queueSave(key, fn) {
  if (!S.isMJ) return;   // la vue joueurs n'écrit jamais directement les données
  saveState('dirty');
  debounce('save:' + key, async () => {
    pending++;
    let ok = true;
    try { const r = await fn(); if (r?.rev) S.rev = r.merged ? 0 : Math.max(S.rev, r.rev); } catch (e) { console.error(e); ok = false; saveState('err'); }
    finally { pending--; }
    if (ok && !pending && !Object.keys(timers).some(k => k.startsWith('save:'))) saveState('ok');
  }, 300);
}
function saveChar(c) { queueSave('c:' + c.id, () => api('PUT', '/api/character/' + c.id, c, { 'X-Base-Rev': String(S.rev || 0) })); }
function saveMon(m) { queueSave('m:' + m.id, () => api('PUT', '/api/monster/' + m.id, m)); }
function saveCamp() { queueSave('camp', () => api('PUT', '/api/campaign', S.camp, { 'X-Base-Rev': String(S.rev || 0) })); }
function flushSaves() {
  for (const k of Object.keys(timers)) if (k.startsWith('save:')) { clearTimeout(timers[k]); delete timers[k]; }
  const send = (url, obj) => fetch(url, { method: 'PUT', body: JSON.stringify(obj), keepalive: true, headers: { 'Content-Type': 'application/json', 'X-Base-Rev': String(S.rev || 0), 'X-Campagne': S.campId || '' } });
  send('/api/campaign', S.camp);
}
window.addEventListener('beforeunload', () => { if ($('#savestate')?.classList.contains('dirty')) flushSaves(); });

function campDefaults(c) {
  c.log ??= []; c.journal ??= { notes: [], quests: [], npcs: [] };
  c.combat ??= { active: false, round: 0, turn: 0, list: [], xpPool: 0, defeated: [] };
  c.maps ??= []; c.currentMap ??= null; c.seeded ??= false; c.encounters ??= []; c.settings ??= {};
  return c;
}
async function loadAll() {
  const d = await api('GET', '/api/all');
  S.chars = d.characters || {}; S.mons = d.monsters || {}; S.camp = campDefaults(d.campaign || {}); S.rev = d.rev; S.root = d.root;
  S.dataDir = d.data; S.campMeta = d.campagne || {}; S.campId = S.campMeta.id || null;
  const b = $('#camp-name'); if (b) b.textContent = S.campMeta.name || '';
}
const charList = () => Object.values(S.chars).sort((a, b) => (a.order ?? 99) - (b.order ?? 99) || a.name.localeCompare(b.name));
const monList = () => Object.values(S.mons).sort((a, b) => a.name.localeCompare(b.name));

/* ---------- images ---------- */
async function upload(file) {
  const r = await fetch('/api/upload', { method: 'POST', body: file, headers: { 'X-Filename': encodeURIComponent(file.name || 'image.jpg') } });
  if (!r.ok) throw new Error('upload');
  return r.json();
}
function imageFiles(dt) { return [...(dt?.files || [])].filter(f => /^image\//.test(f.type) || /\.(jpe?g|png|gif|webp|bmp)$/i.test(f.name)); }
/* rend un élément capable de recevoir une image glissée (ou cliquée) */
function dropImage(el, cb, { click = true } = {}) {
  el.addEventListener('dragover', e => { if ([...e.dataTransfer.types].includes('Files')) { e.preventDefault(); el.classList.add('drop-hot'); } });
  el.addEventListener('dragleave', () => el.classList.remove('drop-hot'));
  el.addEventListener('drop', async e => {
    const f = imageFiles(e.dataTransfer)[0]; el.classList.remove('drop-hot');
    if (!f) return; e.preventDefault(); e.stopPropagation();
    cb(await upload(f), f);
  });
  if (click) el.addEventListener('click', () => pickImage(cb));
}
function pickImage(cb) {
  const i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*';
  i.onchange = async () => { if (i.files[0]) cb(await upload(i.files[0]), i.files[0]); };
  i.click();
}

/* ---------- dés ---------- */
const rnd = n => 1 + Math.floor(Math.random() * n);
/* expression : 2d6+3, d20, 4d6kh3, 2d20kl1, 1d8+1d6-2, d% */
function rollExpr(expr, adv = 0) {
  const src = String(expr).toLowerCase().replace(/\s+/g, '').replace(/d%/g, 'd100');
  if (!src || !/^[-+]?(\d*d\d+((kh|kl|dh|dl)\d+)?|\d+)([-+](\d*d\d+((kh|kl|dh|dl)\d+)?|\d+))*$/.test(src)) return null;
  let total = 0, detail = [], nat = null, advUsed = false;
  for (const m of src.matchAll(/([-+]?)([^-+]+)/g)) {
    const sign = m[1] === '-' ? -1 : 1, term = m[2];
    const dm = term.match(/^(\d*)d(\d+)(?:(kh|kl|dh|dl)(\d+))?$/);
    if (!dm) { total += sign * +term; detail.push((sign < 0 ? '− ' : detail.length ? '+ ' : '') + term); continue; }
    let n = +(dm[1] || 1), sides = +dm[2], k = dm[3], kn = +dm[4];
    if (n > 200 || sides > 1000) return null;
    if (sides === 20 && n === 1 && adv && !advUsed && !k) { n = 2; k = adv > 0 ? 'kh' : 'kl'; kn = 1; advUsed = true; }
    const rolls = Array.from({ length: n }, () => rnd(sides));
    let keep = rolls.map((v, i) => i);
    if (k) {
      const ord = keep.slice().sort((a, b) => rolls[a] - rolls[b]);
      keep = k === 'kh' ? ord.slice(-kn) : k === 'kl' ? ord.slice(0, kn) : k === 'dh' ? ord.slice(0, n - kn) : ord.slice(kn);
    }
    const sum = keep.reduce((s, i) => s + rolls[i], 0);
    total += sign * sum;
    if (sides === 20 && keep.length === 1 && nat === null) nat = rolls[keep[0]];
    const shown = rolls.map((v, i) => keep.includes(i) ? (sides === 20 && (v === 20 || v === 1) ? `<b>${v}</b>` : v) : `<s>${v}</s>`).join(', ');
    detail.push((sign < 0 ? '− ' : detail.length ? '+ ' : '') + `${n}d${sides}${k ? k + kn : ''}[${shown}]`);
  }
  return { total, detail: detail.join(' '), nat, crit: nat === 20, fumble: nat === 1, expr: src };
}
const critExpr = e => String(e).replace(/(\d*)d(\d+)/g, (m, n, s) => `${2 * (+n || 1)}d${s}`);
const advVal = () => +($('input[name=adv]:checked')?.value || 0);
function resetAdv() { const r = $('input[name=adv][value="0"]'); if (r) r.checked = true; }

function pushLog(entry) {
  entry.id = uid(); entry.t = Date.now();
  S.camp.log.unshift(entry);
  if (S.camp.log.length > 300) S.camp.log.length = 300;
  renderLog(); saveCamp();
  return entry;
}
function logInfo(text, secret = false) { return pushLog({ kind: 'info', text, secret }); }
/* lance un jet et l'affiche/l'enregistre */
function roll(expr, { label = '', who = '', adv, secret, show = true } = {}) {
  if (adv === undefined) { adv = advVal(); resetAdv(); }
  if (secret === undefined) secret = $('#d-secret')?.checked || false;
  const r = rollExpr(expr, adv);
  if (!r) { toast('Expression de dés invalide : ' + expr); return null; }
  const e = pushLog({ kind: 'roll', label, who, expr: r.expr, total: r.total, detail: r.detail, crit: r.crit, fumble: r.fumble, adv, secret });
  if (show) showLast(e);
  return r;
}
function showLast(e) {
  const box = $('#d-last'); if (!box) return;
  box.innerHTML = `<div class="lbl">${esc(e.who ? e.who + ' — ' : '')}${esc(e.label || e.expr)}${e.adv ? (e.adv > 0 ? ' (avantage)' : ' (désavantage)') : ''}</div>
    <div class="big ${e.crit ? 'crit' : e.fumble ? 'fumble' : ''}">${e.total}</div>
    <div class="lbl">${e.detail}${e.crit ? ' — <b style="color:#7fe07f">CRITIQUE !</b>' : e.fumble ? ' — <b style="color:#ff6b5e">échec critique</b>' : ''}</div>`;
  box.classList.remove('pop'); void box.offsetWidth; box.classList.add('pop');
}
function applyLabel(a) {
  if (!a) return '';
  if (a.type === 'dmg') return a.uid && a.name ? `<i class="ico i-degats"></i> ${a.n} → ${esc(a.name)}` : `<i class="ico i-degats"></i> Appliquer ${a.n}…`;
  if (a.type === 'zone') return `<i class="ico i-degats"></i> Zone ${a.n} (JdS ${a.ab} DD ${a.dc})…`;
  if (a.type === 'heal') return a.uid && a.name ? `<i class="ico i-soin"></i> +${a.n} → ${esc(a.name)}` : `<i class="ico i-soin"></i> Soigner ${a.n}…`;
  return '';
}
function logEntryHTML(e, opts) { return deEmoji(logEntryRaw(e, opts)); }
function logEntryRaw(e, { mj = false } = {}) {
  const pl = e.src === 'joueur' ? '<span class="src-j" title="Lancé par le joueur"><i class="ico i-joueur"></i></span>' : '';
  if (e.kind === 'info') return `<div class="le info ${e.secret ? 'secret' : ''} ${e.src === 'joueur' ? 'from-pl' : ''}">${pl}${e.text}</div>`;
  const ap = mj && e.apply && typeof applyFromLog === 'function'
    ? `<div class="le-act">${e.applied ? `<span class="muted small">✔ appliqué</span>` : `<button class="small ${e.apply.type === 'heal' ? 'ok' : 'danger'}" data-apply="${e.id}">${applyLabel(e.apply)}</button>`}</div>` : '';
  return `<div class="le ${e.crit ? 'crit' : e.fumble ? 'fumble' : ''} ${e.secret ? 'secret' : ''} ${e.src === 'joueur' ? 'from-pl' : ''}" title="${new Date(e.t).toLocaleTimeString()}">
        <span class="t">${e.total}</span>${pl}${e.secret ? '<i class="ico i-verrou"></i> ' : ''}<b>${esc(e.who || '')}</b> ${esc(e.label || '')}
        <div class="d">${esc(e.expr)}${e.adv ? (e.adv > 0 ? ' ▲' : ' ▼') : ''} : ${e.detail || ''}</div>${ap}</div>`;
}
function renderLog() {
  const el = $('#d-log'); if (!el) return;
  el.innerHTML = S.camp.log.slice(0, 120).map(e => logEntryHTML(e, { mj: true })).join('');
}
/* état de santé approximatif montré aux joueurs pour les adversaires (0..4) */
const HP_STATES = ['<i class="ico i-mort"></i> hors de combat', 'à l\'agonie', 'en sang', 'blessé', 'indemne'];
/* thèmes d'affichage, mémorisés dans le navigateur (chacun choisit le sien, MJ comme joueurs) */
const THEMES = [
  ['', 'Taverne', 'Brun sombre, accents ambre', ['#161412', '#29251f', '#c9a35a', '#ece6da']],
  ['ardoise', 'Ardoise', 'Gris neutre, sobre', ['#15171b', '#252932', '#e2b04a', '#e6e9ef']],
  ['arcane', 'Nuit', 'Bleu nuit, accents lavande', ['#12141c', '#222634', '#9a9cd8', '#e3e5ee']],
  ['sylve', 'Forêt', 'Vert sourd, accents sauge', ['#121612', '#222922', '#a9c08a', '#e3e8df']],
  ['infernal', 'Braise', 'Brun rouge, accents cuivre', ['#171211', '#2a201e', '#d0835e', '#ece2de']],
  ['givre', 'Givre', 'Bleu acier, accents glacier', ['#11161a', '#202a32', '#8fbfd6', '#e2eaef']],
  ['parchemin', 'Parchemin', 'Clair et chaud', ['#e9dcc0', '#f5ecd8', '#9a6516', '#2e2215']],
  ['clair', 'Clair', 'Clair et neutre', ['#f3f4f7', '#ffffff', '#b7791f', '#1d2330']],
];
function themeModal() {
  const cur = document.documentElement.dataset.theme || '';
  modal(`<h3><i class="ico i-palette"></i> Apparence</h3><p class="muted small">Le thème est propre à cet appareil : chaque joueur peut choisir le sien.</p>
    <div class="theme-grid">${THEMES.map(([id, n, d, c]) => `<button class="theme-card ${id === cur ? 'on' : ''}" data-th="${id}">
      <span class="th-prev" style="background:${c[0]}"><i style="background:${c[1]};border-color:${c[2]}"></i><b style="background:${c[2]}"></b><em style="color:${c[3]}">Aa</em></span>
      <span class="th-name">${n}</span><span class="muted small">${d}</span></button>`).join('')}</div>
    <div class="actions"><button class="primary" data-close>Fermer</button></div>`, box => {
    $$('[data-th]', box).forEach(b => b.onclick = () => { applyTheme(b.dataset.th); $$('[data-th]', box).forEach(x => x.classList.toggle('on', x === b)); });
  });
}
function applyTheme(t) {
  if (t === undefined) { try { t = localStorage.getItem('mj-theme') || ''; } catch (e) { t = ''; } }
  if (t) document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme;
  if (!THEMES.some(x => x[0] === t)) t = '';
  try { localStorage.setItem('mj-theme', t); } catch (e) { }
  const meta = document.querySelector('meta[name=theme-color]'); if (meta) meta.content = (THEMES.find(x => x[0] === t) || THEMES[0])[3][0];
}
applyTheme();
/* jet d'attaque complet (attaque + dégâts) ; renvoie le résultat */
function attackRoll({ who, name, bonus, damage, type = '', targetCA = null, targetName = '', adv }) {
  if (adv === undefined) { adv = advVal(); resetAdv(); }
  const a = rollExpr(`1d20+${+bonus || 0}`.replace('+-', '-'), adv);
  const hit = a.crit || (!a.fumble && (targetCA == null || a.total >= targetCA));
  let d = null;
  if (damage && hit) d = rollExpr(a.crit ? critExpr(damage) : damage);
  const secret = $('#d-secret')?.checked || false;
  const e = pushLog({ kind: 'roll', who, label: `${name}${targetName ? ' → ' + targetName : ''}`, expr: a.expr, total: a.total, detail: a.detail + (targetCA != null ? ` vs CA ${targetCA} : ${hit ? 'TOUCHÉ' : 'raté'}` : ''), crit: a.crit, fumble: a.fumble, adv, secret });
  showLast(e);
  if (d) {
    pushLog({ kind: 'roll', who, label: `Dégâts ${name}${a.crit ? ' (critique)' : ''} ${type}`, expr: d.expr, total: d.total, detail: d.detail, secret });
    const box = $('#d-last');
    box.insertAdjacentHTML('beforeend', `<div class="lbl" style="margin-top:4px">Dégâts : <b style="font-size:1.4rem;color:#ffb37a">${d.total}</b> ${esc(type)}</div>`);
  }
  return { atk: a, hit, dmg: d };
}

/* les emojis présents dans les données (notes, fiches, ancien historique) sont affichés en dessins */
const EMOJI_ICON = { '⚔': 'combat', '🗡': 'combat', '🔮': 'sorts', '✨': 'etincelle', '💥': 'degats', '🎯': 'cible', '🏹': 'cible', '🧑': 'joueur', '👤': 'persos', '🧙': 'persos',
  '🎲': 'des', '💚': 'soin', '❤': 'coeur', '👁': 'oeil', '☠': 'mort', '💀': 'mort', '📣': 'annonce', '🛡': 'bouclier', '⭐': 'xp', '📖': 'livre', '📚': 'livre', '🧠': 'livre',
  '🗑': 'poubelle', '🗺': 'carte', '📜': 'parchemin', '🌙': 'lune', '☕': 'cafe', '✏': 'plume', '📝': 'plume', '💾': 'sauver', '⚡': 'eclair', '🔋': 'ressource', '🏁': 'drapeau',
  '⚠': 'alerte', '🔒': 'verrou', '💫': 'etourdi', '🐉': 'lanterne', '🕯': 'lanterne', '⏳': 'sablier', '🎒': 'sac', '👹': 'bestiaire', '😈': 'bestiaire', '🤝': 'mains', '📋': 'liste',
  '📊': 'liste', '🩹': 'pansement', '🏰': 'campagnes', '🔍': 'loupe', '🔎': 'loupe', '🔥': 'feu', '🎭': 'masques', '🦎': 'patte', '🐾': 'patte', '👥': 'groupe', '🧭': 'boussole',
  '💰': 'bourse', '🍺': 'chope', '🔔': 'cloche', '🪄': 'baguette', '👻': 'invisible', '💤': 'sommeil', '😡': 'rage', '▶': 'sablier' };
const EMOJI_KEEP = new Set(['✔', '✕', '✘', '✎', '↗', '↺', '◀', '⛶', '☰', '⧉', '©', '®', '™', '↔', '↕', '‼', '⁉', '#', '*', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9']);
function deEmoji(html) {
  return String(html).replace(/(\p{Extended_Pictographic})\uFE0F?(?:\u200D\p{Extended_Pictographic}\uFE0F?)*\s?/gu, (m, ch) => {
    if (EMOJI_KEEP.has(ch)) return m;
    const n = EMOJI_ICON[ch];
    return n ? `<i class="ico i-${n}"></i> ` : '';
  });
}
/* rend les formules de dés cliquables dans un texte déjà échappé */
function linkDice(html) {
  return html.replace(/(?<![\w])(\d*d\d+(?:\s*[+−-]\s*\d+(?!d))?)(?![\w])/g, m => `<span class="droll" data-roll="${m.replace(/\s+/g, '').replace('−', '-')}">${m}</span>`);
}
/* mini-rendu markdown */
function md(src) {
  const lines = String(src || '').replace(/\r/g, '').split('\n');
  let out = '', inList = false;
  const inline = s => linkDice(esc(s)).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/(^|[^*])\*([^*]+)\*/g, '$1<i>$2</i>');
  for (const l of lines) {
    const li = l.match(/^\s*[*-]\s+(.*)$/);
    if (li) { if (!inList) { out += '<ul>'; inList = true; } out += `<li>${inline(li[1])}</li>`; continue; }
    if (inList) { out += '</ul>'; inList = false; }
    let m;
    if ((m = l.match(/^(#{1,4})\s+(.*)$/))) out += `<h${m[1].length + 1}>${inline(m[2])}</h${m[1].length + 1}>`;
    else if (/^\s*---+\s*$/.test(l)) out += '<hr>';
    else if ((m = l.match(/^>\s?(.*)$/))) out += `<blockquote>${inline(m[1])}</blockquote>`;
    else if (l.trim()) out += `<p>${inline(l)}</p>`;
  }
  if (inList) out += '</ul>';
  return deEmoji(out);
}

/* ---------- modal, toast ---------- */
function toast(msg, ms = 2600) {
  const t = document.createElement('div'); t.className = 'toast'; t.innerHTML = deEmoji(msg);
  $('#toasts').appendChild(t); setTimeout(() => t.remove(), ms);
}
function modal(html, onMount) {
  const m = $('#modal'), box = $('.modal-box', m);
  box.innerHTML = html; m.classList.remove('hidden');
  const close = () => { m.classList.add('hidden'); box.innerHTML = ''; };
  m.onclick = e => { if (e.target === m) close(); };
  $$('[data-close]', box).forEach(b => b.onclick = close);
  onMount && onMount(box, close);
  const f = $('input,select,textarea', box); f && f.focus();
  return close;
}
function ask(title, fields, onOk) {
  // fields: [{k, label, type, value, options}]
  modal(`<h3>${title}</h3><form class="col">${fields.map(f => `<label class="field"><span>${esc(f.label)}</span>${
    f.type === 'select' ? `<select name="${f.k}">${f.options.map(o => `<option value="${esc(o[0])}" ${o[0] == f.value ? 'selected' : ''}>${esc(o[1])}</option>`).join('')}</select>`
      : f.type === 'textarea' ? `<textarea name="${f.k}">${esc(f.value ?? '')}</textarea>`
        : `<input name="${f.k}" type="${f.type || 'text'}" value="${esc(f.value ?? '')}">`}</label>`).join('')}
    <div class="actions"><button type="button" data-close>Annuler</button><button class="primary">Valider</button></div></form>`,
  (box, close) => {
    $('form', box).onsubmit = e => {
      e.preventDefault();
      const o = {}; fields.forEach(f => { const v = $(`[name="${f.k}"]`, box).value; o[f.k] = f.type === 'number' ? num(v) : v; });
      close(); onOk(o);
    };
  });
}
function confirmBox(msg, onOk) {
  modal(`<p>${msg}</p><div class="actions"><button data-close>Annuler</button><button class="danger" id="cf-ok">Confirmer</button></div>`,
    (box, close) => { $('#cf-ok', box).onclick = () => { close(); onOk(); }; });
}

/* ---------- navigation ---------- */
const TABS = {};
function go(tab) {
  if (TABS[S.tab]?.leave) TABS[S.tab].leave();
  S.tab = tab;
  try { localStorage.setItem('mj-tab', tab); } catch (e) { }
  $$('#tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  const main = $('#main');
  main.className = TABS[tab].full ? 'full' : '';
  main.innerHTML = '';
  TABS[tab].render(main);
}
function rerender() { const t = TABS[S.tab]; if (t.refresh) t.refresh(); else go(S.tab); }

/* ---------- panneau dés ---------- */
function groupOptions() {
  return `<option value="init">Initiative</option><optgroup label="Compétences">${SKILLS.map(([n]) => `<option value="sk:${n}">${n}</option>`).join('')}</optgroup>
  <optgroup label="Caractéristiques">${STATS.map(s => `<option value="ab:${s}">${STAT_NAMES[s]}</option>`).join('')}</optgroup>
  <optgroup label="Sauvegardes">${STATS.map(s => `<option value="sv:${s}">Sauvegarde ${s}</option>`).join('')}</optgroup>`;
}
function skillBonus(c, sk) { if (c.skills && c.skills[sk] != null) return +c.skills[sk]; const ab = (SKILLS.find(s => s[0] === sk) || [])[1]; return mod(c.stats?.[ab]); }
function saveBonus(c, ab) { return mod(c.stats?.[ab]) + ((c.saves || []).includes(ab) ? +c.prof || 0 : 0); }
function bonusFor(c, key) {
  if (key === 'init') return ['Initiative', +c.initBonus || 0];
  const [k, v] = key.split(':');
  if (k === 'sk') return [v, skillBonus(c, v)];
  if (k === 'ab') return ['Test de ' + STAT_NAMES[v], mod(c.stats?.[v])];
  return ['Sauvegarde ' + v, saveBonus(c, v)];
}
function initDicePanel() {
  $$('#dice [data-die]').forEach(b => b.onclick = () => roll('1d' + b.dataset.die, { label: 'd' + b.dataset.die }));
  $('#d-form').onsubmit = e => { e.preventDefault(); const v = $('#d-expr').value.trim(); if (v) roll(v, { label: v }); };
  $('#d-clear').onclick = () => confirmBox('Vider l\'historique des jets ?', () => { S.camp.log = []; renderLog(); saveCamp(); });
  $('#g-skill').innerHTML = groupOptions();
  $('#g-roll').onclick = () => {
    const key = $('#g-skill').value, adv = advVal(); resetAdv();
    const pcs = charList(); if (!pcs.length) return toast('Aucun personnage.');
    let label = '';
    const parts = pcs.map(c => {
      const [l, b] = bonusFor(c, key); label = l;
      const r = rollExpr('1d20' + fmod(b), adv);
      return { c, r };
    }).sort((a, b) => b.r.total - a.r.total);
    logInfo(`<b>Jet de groupe — ${esc(label)}</b>${adv ? (adv > 0 ? ' (avantage)' : ' (désavantage)') : ''}<br>` + parts.map(p => `${esc(p.c.name)} : <b>${p.r.total}</b>${p.r.crit ? ' <i class="ico i-etincelle"></i>' : p.r.fumble ? ' <i class="ico i-mort"></i>' : ''}`).join(' · '), $('#d-secret').checked);
    $('#d-last').innerHTML = `<div class="lbl">Jet de groupe — ${esc(label)}</div>` + parts.map(p => `<div>${esc(p.c.name)} : <b style="color:${p.r.crit ? '#7fe07f' : p.r.fumble ? '#ff6b5e' : 'var(--gold2)'}">${p.r.total}</b></div>`).join('');
  };
  renderLog();
}

/* clic global sur les formules de dés */
document.addEventListener('click', e => {
  const d = e.target.closest('[data-roll]');
  if (d) { e.preventDefault(); roll(d.dataset.roll, { label: d.dataset.label || d.dataset.roll, who: d.dataset.who || '' }); }
});

/* ---------- synchronisation (déplacements des joueurs, autre onglet…) ---------- */
let pointerDown = false;
document.addEventListener('pointerdown', () => pointerDown = true, true);
document.addEventListener('pointerup', () => pointerDown = false, true);
async function syncTick() {
  if (pending || pointerDown || Object.keys(timers).some(k => k.startsWith('save:'))) return;
  if (!$('#modal').classList.contains('hidden') || document.activeElement?.matches('input,textarea,select')) return;
  let r; try { r = await api('GET', '/api/rev'); } catch (e) { return; }
  S.presence = r.presence || {}; S.pings = r.pings || [];
  if (S.info && 'public' in r && r.public !== S.info.public) { S.info.public = r.public; if (S.tab === 'carte' && typeof drawMapSide === 'function') drawMapSide(); }
  if (typeof onPings === 'function') onPings(S.pings);
  if (r.camp && S.campId && r.camp !== S.campId) { location.reload(); return; }
  if (r.rev <= S.rev || pending || pointerDown) return;
  const seen = new Set(S.camp.log.map(e => e.id));
  await loadAll(); renderLog(); rerender();
  const fresh = S.camp.log.filter(e => !seen.has(e.id) && e.src === 'joueur').slice(0, 4).reverse();
  for (const e of fresh) toast(e.kind === 'info' ? e.text : `<i class="ico i-des"></i> <b>${esc(e.who)}</b> ${esc(e.label)} : <b>${e.total}</b>`, 4000);
}

async function boot() {
  S.isMJ = true;
  try { await Promise.all([loadAll(), loadSpells()]); } catch (e) { $('#main').innerHTML = '<div class="empty">Impossible de joindre le serveur. Lancez <code>./lancer_mj.sh</code> dans le dossier Dnd.</div>'; return; }
  if (!S.camp.seeded && typeof seedBestiary === 'function') { seedBestiary(); S.camp.seeded = true; saveCamp(); }
  try { S.info = await api('GET', '/api/info'); } catch (e) { S.info = null; }
  initDicePanel();
  $$('#tabs button').forEach(b => b.onclick = () => go(b.dataset.tab));
  let t = 'persos'; try { t = localStorage.getItem('mj-tab') || 'persos'; } catch (e) { }
  if (location.hash.length > 1) t = location.hash.slice(1);   // ex. /#combat
  go(TABS[t] ? t : 'persos');
  window.addEventListener('hashchange', () => { const h = location.hash.slice(1); if (TABS[h] && h !== S.tab) go(h); });
  setInterval(syncTick, 1200);
  document.addEventListener('keydown', e => {
    if (e.target.matches('input,textarea,select')) return;
    if (e.key === 'Escape') $('#modal').classList.add('hidden');
    TABS[S.tab]?.key && TABS[S.tab].key(e);
  });
}
