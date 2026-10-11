/* ===== Assistant de montée de niveau (MJ et joueurs) ===== */
'use strict';

const SUBCLASS_HINTS = {
  barbare: ['Voie du berserker', 'Voie du guerrier totémique'], barde: ['Collège du savoir', 'Collège de la vaillance'], clerc: ['Domaine de la vie', 'Domaine de la lumière', 'Domaine de la guerre'],
  druide: ['Cercle de la terre', 'Cercle de la lune'], guerrier: ['Champion', 'Maître de guerre', 'Chevalier occulte'], moine: ['Voie de la main ouverte', 'Voie de l\'ombre'],
  paladin: ['Serment de dévotion', 'Serment des anciens', 'Serment de vengeance'], rodeur: ['Chasseur', 'Maître des bêtes'], roublard: ['Voleur', 'Assassin', 'Escroc arcanique'],
  ensorceleur: ['Lignée draconique', 'Magie sauvage'], occultiste: ['Le Fiélon', 'L\'Archifée', 'Le Grand Ancien'], magicien: ['École d\'évocation', 'École de nécromancie', 'École d\'abjuration'],
  artificier: ['Alchimiste', 'Artilleur', 'Armurier', 'Forgeron de guerre'],
};
const GENERIC_FEATURE = /^Aptitude d/;
const portraitHTML = (c, size) => c.portrait ? `<div class="avatar" style="width:${size}px;height:${size}px;background-image:url('${esc(c.portrait)}')"></div>`
  : `<div class="avatar" style="width:${size}px;height:${size}px;background-color:${c.color || colorFor(c.name)}">${esc(initials(c.name))}</div>`;

function prepMax(cls, n, c) {
  const C = CLASSES[cls]; if (!C?.ab) return 0;
  const lv = C.cast === 'full' ? n : Math.floor(n / 2) + (C.cast === 'halfup' ? n % 2 : 0);
  return Math.max(1, mod(c.stats?.[C.ab]) + lv);
}
/* aptitudes officielles des niveaux déjà atteints qui ne figurent pas sur la fiche */
function missingFeatures(c, C, n) {
  if (!C?.f) return [];
  const have = (c.features || []).map(x => spellKey(x.name));
  const out = [];
  for (let l = 1; l < n; l++) for (const f of C.f[l] || []) {
    if (GENERIC_FEATURE.test(f) || f === C.sousNom) continue;
    const k = spellKey(f.replace(/ \(.*\)$/, ''));
    if (!have.some(h => h.includes(k) || k.includes(h))) out.push([l, f]);
  }
  return out;
}
function knownKeys(c) { const s = new Set(); for (const [l, list] of Object.entries(c.spells || {})) for (const n of list || []) { const [k] = findSpell(n, +l); s.add(k || spellKey(n)); } return s; }

/* tout ce que le passage de niveau change ; W.off = changements décochés */
function computeLevel(W) {
  const c = W.c, n = W.n, cls = W.cls, C = CLASSES[cls] || {};
  const nc = JSON.parse(JSON.stringify(c)); delete nc.levelHistory;
  nc.stats ??= {}; nc.skills ??= {}; nc.resources ??= []; nc.features ??= []; nc.spells ??= {}; nc.saves ??= []; nc.attacks ??= [];
  const ch = [];
  const add = (k, label, fn, { fixed = false, group = '' } = {}) => { const on = fixed || !W.off.has(k); ch.push({ k, label, on, fixed, group }); if (on) fn(); };
  const oldMods = Object.fromEntries(STATS.map(s => [s, mod(c.stats?.[s])])), oldProf = +c.prof || profForLevel(c.niveau);

  add('niveau', `Niveau <b>${c.niveau} → ${n}</b>`, () => { nc.niveau = n; }, { fixed: true, group: 'Base' });
  /* caractéristiques */
  const bump = {};
  if (W.asiLevel && W.asiMode !== 'don') {
    if (W.asiMode === '+2') bump[W.asiA] = (bump[W.asiA] || 0) + 2; else { bump[W.asiA] = (bump[W.asiA] || 0) + 1; bump[W.asiB] = (bump[W.asiB] || 0) + 1; }
  }
  const feat = W.asiLevel && W.asiMode === 'don' ? FEATS.find(f => f.n === W.feat) : null;
  if (feat?.fx?.stat1 && W.featStat) bump[W.featStat] = (bump[W.featStat] || 0) + 1;
  for (const [s, d] of Object.entries(bump)) {
    const v0 = +c.stats?.[s] || 10, v1 = Math.min(20, v0 + d);
    if (v1 !== v0) add('stat:' + s, `${STAT_NAMES[s]} <b>${v0} → ${v1}</b> <span class="muted">(mod. ${fmod(mod(v0))} → ${fmod(mod(v1))})</span>`, () => { nc.stats[s] = v1; }, { group: 'Caractéristiques' });
  }
  if (feat) {
    add('feat', `Don : <b>${esc(feat.n)}</b> <span class="muted">— ${esc(feat.d)}</span>`, () => {
      nc.features.push({ name: 'Don : ' + feat.n, text: feat.d });
      if (feat.fx?.saveProf && W.featStat && !nc.saves.includes(W.featStat)) nc.saves.push(W.featStat);
      if (feat.fx?.res) nc.resources.push({ ...feat.fx.res, cur: feat.fx.res.max });
      if (feat.fx?.speed) nc.vitesse = String(nc.vitesse || '9 m').replace(/^([\d,.]+)/, m => String(+(num(m) + feat.fx.speed).toFixed(1)).replace('.', ','));
      if (feat.fx?.skills) for (const sk of W.featSkills) if (nc.skills[sk] == null) nc.skills[sk] = mod(nc.stats[(SKILLS.find(x => x[0] === sk) || [])[1]]) + profForLevel(n);
    }, { group: 'Caractéristiques' });
  }
  const newMods = Object.fromEntries(STATS.map(s => [s, mod(nc.stats?.[s])]));
  /* points de vie */
  const hd = +c.hitDie || C.de || 8, con = newMods.CON;
  const base = W.hpMethod === 'max' ? hd : W.hpMethod === 'roll' ? (W.hpRoll || Math.floor(hd / 2) + 1) : Math.floor(hd / 2) + 1;
  const tough = (c.features || []).some(f => /robuste/i.test(f.name)) ? 2 : 0;
  const gain = Math.max(1, base + con) + tough;
  add('pv', `PV max <b>${c.hpMax} → ${c.hpMax + gain}</b> <span class="muted">(${W.hpMethod === 'roll' ? 'jet ' + base : W.hpMethod === 'max' ? 'maximum ' + base : 'moyenne ' + base} ${fmod(con)} CON${tough ? ' +2 Robuste' : ''})</span>`,
    () => { nc.hpMax += gain; nc.hp += gain; }, { fixed: true, group: 'Base' });
  if (con > oldMods.CON) add('pv-con', `Constitution améliorée : <b>+${(con - oldMods.CON) * c.niveau} PV max</b> pour les niveaux précédents`, () => { nc.hpMax += (con - oldMods.CON) * c.niveau; nc.hp += (con - oldMods.CON) * c.niveau; }, { group: 'Base' });
  if (feat?.fx?.hpPerLevel) add('pv-feat', `Robuste : <b>+${2 * c.niveau} PV max</b> pour les niveaux précédents`, () => { nc.hpMax += 2 * c.niveau; nc.hp += 2 * c.niveau; }, { group: 'Base' });
  add('dv', `Dés de vie : <b>${n} d${hd}</b>`, () => { nc.hitDice = (+c.hitDice || 0) + 1; }, { fixed: true, group: 'Base' });
  const newProf = profForLevel(n), dProf = newProf - oldProf;
  if (dProf) add('prof', `Bonus de maîtrise <b>${fmod(oldProf)} → ${fmod(newProf)}</b>`, () => { nc.prof = newProf; }, { group: 'Base' });
  const profNow = nc.prof;
  /* aptitudes de classe */
  const subNeeded = C.sous === n && !/[—–-]/.test(c.classe || '');
  if (subNeeded && W.subclass) add('sous', `${esc(C.sousNom)} : <b>${esc(W.subclass)}</b>`, () => { nc.classe = `${c.classe} — ${W.subclass}`; }, { group: 'Aptitudes' });
  for (const f of (C.f?.[n] || [])) {
    if ((c.features || []).some(x => x.name === f)) continue;
    const sub = W.subclass || String(c.classe || '').split(/[—–]/)[1]?.trim() || '';
    const name = GENERIC_FEATURE.test(f) && sub ? `${f} (${sub})` : f;
    const text = W.featText[f] || FEATURE_DESC[f] || FEATURE_DESC[f.replace(/ \(.*\)$/, '')] || (GENERIC_FEATURE.test(f) ? `Aptitude de ${sub || C.sousNom || 'sous-classe'} gagnée au niveau ${n} (voir les règles de la sous-classe).` : `Aptitude de ${C.nom} gagnée au niveau ${n}.`);
    add('f:' + f, `Aptitude : <b>${esc(name)}</b>`, () => nc.features.push({ name, text }), { group: 'Aptitudes' });
  }
  for (const [lv, f] of W.catchup) {
    if ((c.features || []).some(x => x.name === f)) continue;
    add('cu:' + f, `Aptitude du niveau ${lv} (rattrapage) : <b>${esc(f)}</b>`, () => nc.features.push({ name: f, text: FEATURE_DESC[f] || `Aptitude de ${C.nom} (niveau ${lv}).` }), { group: 'Aptitudes' });
  }
  if (cls === 'roublard') {
    const dice = Math.ceil(n / 2) + 'd6';
    const sa = nc.features.find(f => /attaque sournoise/i.test(f.name));
    if (sa && !sa.name.includes(dice) && !sa.text.includes(dice))
      add('sournoise', `Attaque sournoise : <b>${dice}</b>`, () => { sa.name = sa.name.replace(/\d+d6/, dice); sa.text = /\d+d6/.test(sa.text) ? sa.text.replace(/\d+d6/, dice) : sa.text + ` (${dice} au niveau ${n})`; }, { group: 'Aptitudes' });
  }
  /* ressources de classe */
  for (const [rn, max, reset] of classResources(cls, n, nc)) {
    const key = spellKey(rn).split(' ').slice(0, 2).join(' ');
    const r = nc.resources.find(x => spellKey(x.name).startsWith(key) || spellKey(x.name) === spellKey(rn));
    if (r && r.max !== max && max < 99) add('r:' + rn, `${esc(r.name)} : <b>${r.max} → ${max}</b>`, () => { r.cur += Math.max(0, max - r.max); r.max = max; r.reset = r.reset || reset; }, { group: 'Ressources' });
    if (!r) add('r:' + rn, `Nouvelle ressource : <b>${esc(rn)}</b> (${max >= 99 ? 'illimité' : max}, repos ${reset})`, () => nc.resources.push({ name: rn, max: Math.min(max, 99), cur: Math.min(max, 99), reset }), { group: 'Ressources' });
  }
  /* incantation */
  if (C.cast) {
    if (!nc.spellcasting && slotsFor(cls, n).some(x => x > 0))
      add('sc', `Incantation (${C.ab}) : DD <b>${8 + profNow + newMods[C.ab]}</b>, attaque <b>${fmod(profNow + newMods[C.ab])}</b>`, () => { nc.spellcasting = { ability: C.ab, dc: 8 + profNow + newMods[C.ab], attack: profNow + newMods[C.ab], slots: {} }; }, { group: 'Sorts' });
    const sc = nc.spellcasting;
    if (sc) {
      const row = slotsFor(cls, n), parts = [], keys = new Set([...Object.keys(sc.slots || {}).map(Number), ...row.map((_, i) => i + 1)]);
      for (const l of [...keys].sort((a, b) => a - b)) { const o = sc.slots?.[l]?.max || 0, v = row[l - 1] || 0; if (o !== v && (v || cls === 'occultiste')) parts.push([l, o, v]); }
      if (parts.length) add('slots', `Emplacements de sorts : ${parts.map(([l, o, v]) => `niv. ${l} <b>${o} → ${v}</b>`).join(', ')}`, () => {
        sc.slots ??= {}; for (const [l, o, v] of parts) { const s = sc.slots[l] ||= { max: 0, cur: 0 }; s.cur = Math.max(0, Math.min(v, s.cur + Math.max(0, v - o))); s.max = v; if (!v) delete sc.slots[l]; }
      }, { group: 'Sorts' });
    }
  }
  /* nouveaux sorts */
  for (const s of W.cantrips) add('t:' + s.k, `Tour de magie : <b>${esc(s.n)}</b>`, () => (nc.spells[0] ||= []).push(s.n), { group: 'Sorts' });
  for (const s of W.picks) add('s:' + s.k, `Sort de niveau ${s.niv} : <b>${esc(s.n)}</b>`, () => (nc.spells[s.niv] ||= []).push(s.n), { group: 'Sorts' });
  if (W.swapOut && W.swapIn) add('swap', `Remplacement : <b>${esc(W.swapOut.name)}</b> → <b>${esc(W.swapIn.n)}</b>`, () => {
    nc.spells[W.swapOut.lvl] = (nc.spells[W.swapOut.lvl] || []).filter(x => x !== W.swapOut.name); (nc.spells[W.swapIn.niv] ||= []).push(W.swapIn.n);
  }, { group: 'Sorts' });
  /* expertise */
  for (const sk of W.expertise) add('x:' + sk, `Expertise : <b>${esc(sk)}</b> (+${profNow})`, () => { nc.expertise = [...new Set([...(nc.expertise || []), sk])]; if (nc.skills[sk] != null) nc.skills[sk] += profNow; }, { group: 'Compétences' });
  /* valeurs dérivées (maîtrise et modificateurs) */
  const dMod = s => newMods[s] - oldMods[s], prev = c.skills || {};
  const skillDeltas = Object.keys(prev).map(sk => { const ab = (SKILLS.find(x => x[0] === sk) || [])[1]; return [sk, (nc.prof - oldProf) * ((c.expertise || []).includes(sk) ? 2 : 1) + (ab ? dMod(ab) : 0)]; }).filter(x => x[1]);
  if (skillDeltas.length) add('skills', `Compétences : ${skillDeltas.map(([s, d]) => `${esc(s)} ${fmod(prev[s])} → <b>${fmod(prev[s] + d)}</b>`).join(', ')}`, () => { for (const [s, d] of skillDeltas) nc.skills[s] += d; }, { group: 'Compétences' });
  const dInit = dMod('DEX') + (feat?.fx?.init || 0);
  if (dInit) add('init', `Initiative <b>${fmod(+c.initBonus || 0)} → ${fmod((+c.initBonus || 0) + dInit)}</b>`, () => { nc.initBonus = (+c.initBonus || 0) + dInit; }, { group: 'Compétences' });
  if (c.spellcasting && nc.spellcasting) {
    const d = (nc.prof - oldProf) + dMod(c.spellcasting.ability || C.ab || 'INT');
    if (d) add('scd', `Sorts : DD <b>${c.spellcasting.dc} → ${c.spellcasting.dc + d}</b>, attaque <b>${fmod(c.spellcasting.attack)} → ${fmod(c.spellcasting.attack + d)}</b>`, () => { nc.spellcasting.dc += d; nc.spellcasting.attack += d; }, { group: 'Sorts' });
  }
  (c.attacks || []).forEach((a, i) => {
    const b = +a.bonus || 0, ab = b === oldProf + oldMods.FOR ? 'FOR' : b === oldProf + oldMods.DEX ? 'DEX' : null;
    const dB = (nc.prof - oldProf) + (ab ? dMod(ab) : 0), dD = ab ? dMod(ab) : 0;
    if (!dB && !dD) return;
    const dmg = dD ? String(a.damage || '').replace(/([+-]\d+)?$/, m => { const v = (+m || 0) + dD; return v ? fmod(v) : ''; }) : a.damage;
    add('a:' + i, `${esc(a.name)} : <b>${fmod(b)} → ${fmod(b + dB)}</b>${dD ? `, dégâts <b>${esc(dmg)}</b>` : ''}`, () => { nc.attacks[i].bonus = b + dB; nc.attacks[i].damage = dmg; }, { group: 'Attaques' });
  });
  return { nc, ch };
}

/* ---------- interface ---------- */
function levelUpWizard(c, { onApply, player = false } = {}) {
  const cls = classOf(c), C = CLASSES[cls] || null, n = (+c.niveau || 1) + 1;
  if (n > 20) return toast('Niveau maximum atteint.');
  const W = { c, n, cls, off: new Set(), hpMethod: 'avg', hpRoll: null, asiLevel: !!C?.asi?.includes(n), asiMode: '+2', asiA: 'FOR', asiB: 'DEX', feat: '', featStat: '', featSkills: [],
    subclass: '', featText: {}, catchup: [], cantrips: [], picks: [], swapOut: null, swapIn: null, expertise: [], showAll: false, noLimit: false, q: '', lvlF: '', step: 0, announce: true, chain: true };
  // meilleure caractéristique par défaut
  const best = STATS.slice().sort((a, b) => (c.stats?.[b] || 0) - (c.stats?.[a] || 0));
  W.asiA = best.find(s => (c.stats?.[s] || 0) < 20) || 'FOR'; W.asiB = best.find(s => s !== W.asiA && (c.stats?.[s] || 0) < 20) || 'CON';
  const sc0 = C?.cast ? slotsFor(cls, n) : [], maxLvl = sc0.reduce((m, v, i) => v > 0 ? i + 1 : m, 0);
  const nTours = C?.tours && n > 1 ? Math.max(0, C.tours[n - 1] - C.tours[n - 2]) : 0;
  const nSorts = !C?.cast ? 0 : C.mode === 'connus' ? Math.max(0, (C.connus[n - 1] || 0) - (C.connus[n - 2] || 0)) + (C.secrets?.includes(n) ? 2 : 0)
    : C.mode === 'grimoire' ? 2 : Math.max(maxLvl > (slotsFor(cls, n - 1).reduce((m, v, i) => v > 0 ? i + 1 : m, 0)) ? 1 : 0, prepMax(cls, n, c) - prepMax(cls, n - 1, c));
  const steps = [['base', 'Points de vie & aptitudes']];
  if (W.asiLevel) steps.push(['carac', 'Caractéristiques']);
  if (C?.expertise?.includes(n)) steps.push(['exp', 'Expertise']);
  if (C?.cast && maxLvl > 0) steps.push(['sorts', 'Sorts']);
  steps.push(['recap', 'Récapitulatif']);
  const known = knownKeys(c);
  const listFor = niv => Object.entries(SPELLS.db?.sorts || {}).filter(([k, s]) => (niv === 0 ? s.niv === 0 : s.niv >= 1 && s.niv <= maxLvl)
    && (W.showAll || C.secrets?.includes(n) || (s.classes || []).includes(C.liste)) && !known.has(k)).sort((a, b) => a[1].niv - b[1].niv || a[1].n.localeCompare(b[1].n));

  modal(`<div class="wiz"></div>`, (box, close) => {
    box.classList.add('wiz-box');
    const el = $('.wiz', box);
    const draw = () => {
      const st = steps[W.step][0];
      el.innerHTML = `<div class="wiz-head">${portraitHTML(c, 56)}<div class="grow"><div class="wiz-title">${esc(c.name)} <span class="muted">— ${esc(C?.nom || c.classe || 'classe inconnue')}</span></div>
          <div class="wiz-lv"><span>Niveau ${c.niveau}</span><i class="ico i-fleche-haut"></i><b>Niveau ${n}</b></div></div></div>
        <div class="wiz-steps">${steps.map(([k, l], i) => `<button class="wiz-step ${i === W.step ? 'on' : i < W.step ? 'done' : ''}" data-go="${i}"><span>${i + 1}</span>${l}</button>`).join('')}</div>
        <div class="wiz-body">${STEP_HTML[st](W, { C, cls, n, maxLvl, nTours, nSorts, listFor })}</div>
        <div class="wiz-foot"><button data-close>Annuler</button><span class="grow"></span>
          ${W.step > 0 ? '<button id="wz-prev">◀ Précédent</button>' : ''}
          ${W.step < steps.length - 1 ? '<button class="primary" id="wz-next">Suivant ▶</button>' : `<button class="primary" id="wz-ok"><i class="ico i-fleche-haut"></i> Passer au niveau ${n}</button>`}</div>`;
      bind(st);
    };
    const bind = st => {
      $$('[data-go]', el).forEach(b => b.onclick = () => { W.step = +b.dataset.go; draw(); });
      $('#wz-prev', el) && ($('#wz-prev', el).onclick = () => { W.step--; draw(); });
      $('#wz-next', el) && ($('#wz-next', el).onclick = () => { W.step++; draw(); el.parentElement.scrollTop = 0; });
      $('#wz-ok', el) && ($('#wz-ok', el).onclick = () => {
        const { nc, ch } = computeLevel(W);
        const sum = ch.filter(x => x.on && !['niveau', 'dv'].includes(x.k)).map(x => { const t = document.createElement('div'); t.innerHTML = x.label; return t.textContent; }).slice(0, 12);
        close(); onApply(nc, { summary: sum, announce: W.announce, chain: W.chain });
      });
      const on = (sel, ev, fn) => $$(sel, el).forEach(x => x[ev] = () => { fn(x); draw(); });
      on('[name=hpm]', 'onchange', x => { W.hpMethod = x.value; });
      on('#wz-roll', 'onclick', () => { const r = rollExpr('1d' + (+c.hitDie || C?.de || 8)); W.hpRoll = r.total; W.hpMethod = 'roll'; });
      on('#wz-sub', 'onchange', x => { W.subclass = x.value.trim(); });
      on('[data-cu]', 'onchange', () => { W.catchup = $$('[data-cu]:checked', el).map(i => { const [l, ...f] = i.dataset.cu.split('|'); return [+l, f.join('|')]; }); });
      $$('[data-ftext]', el).forEach(t => t.oninput = () => { W.featText[t.dataset.ftext] = t.value; });
      on('[name=asim]', 'onchange', x => { W.asiMode = x.value; });
      on('#wz-a', 'onchange', x => { W.asiA = x.value; });
      on('#wz-b', 'onchange', x => { W.asiB = x.value; });
      on('[data-feat]', 'onclick', x => { W.feat = x.dataset.feat; W.featStat = ''; W.featSkills = []; });
      on('#wz-fs', 'onchange', x => { W.featStat = x.value; });
      on('[data-fsk]', 'onchange', x => { W.featSkills = $$('[data-fsk]:checked', el).map(i => i.dataset.fsk).slice(0, 3); });
      on('[data-exp]', 'onchange', () => { W.expertise = $$('[data-exp]:checked', el).map(i => i.dataset.exp).slice(0, 2); });
      on('#wz-all', 'onchange', x => { W.showAll = x.checked; });
      on('#wz-nolim', 'onchange', x => { W.noLimit = x.checked; });
      on('[data-lf]', 'onclick', x => { W.lvlF = x.dataset.lf; });
      const q = $('#wz-q', el); if (q) { q.oninput = () => { W.q = q.value; const p = q.selectionStart; draw(); const q2 = $('#wz-q', el); q2.focus(); q2.setSelectionRange(p, p); }; }
      $$('[data-pick]', el).forEach(x => x.onchange = () => {
        const [kind, k] = x.dataset.pick.split('|'), s = SPELLS.db.sorts[k], arr = kind === 't' ? W.cantrips : W.picks, lim = kind === 't' ? nTours : nSorts;
        if (x.checked) { if (!W.noLimit && lim && arr.length >= lim && C.mode !== 'prepares') { x.checked = false; return toast(`Limite atteinte (${lim}). Décochez un sort ou cochez « ignorer les limites ».`); } arr.push({ k, n: s.n, niv: s.niv }); }
        else arr.splice(arr.findIndex(y => y.k === k), 1);
        draw();
      });
      $$('[data-spv]', el).forEach(x => x.onclick = e => { e.preventDefault(); const k = x.dataset.spv; $('#wz-prev-sp', el).innerHTML = spellCardHTML(k, SPELLS.db.sorts[k], c); });
      on('#wz-swo', 'onchange', x => { const [l, ...nm] = x.value.split('|'); W.swapOut = x.value ? { lvl: +l, name: nm.join('|') } : null; });
      on('#wz-swi', 'onchange', x => { const s = SPELLS.db.sorts[x.value]; W.swapIn = s ? { k: x.value, n: s.n, niv: s.niv } : null; });
      on('[data-chg]', 'onchange', x => { x.checked ? W.off.delete(x.dataset.chg) : W.off.add(x.dataset.chg); });
      on('#wz-ann', 'onchange', x => { W.announce = x.checked; });
      on('#wz-chain', 'onchange', x => { W.chain = x.checked; });
    };
    draw();
  });
}

const STEP_HTML = {
  base(W, { C, cls, n }) {
    const c = W.c, hd = +c.hitDie || C?.de || 8, con = mod(c.stats?.CON), avg = Math.floor(hd / 2) + 1;
    const feats = (C?.f?.[n] || []).filter(f => !(c.features || []).some(x => x.name === f));
    const subNeeded = C && C.sous === n && !/[—–-]/.test(c.classe || '');
    return `${!C ? `<div class="note warn">Classe « ${esc(c.classe)} » non reconnue : seuls les PV et la maîtrise seront mis à jour.</div>` : ''}
      <h4><i class="ico i-soin"></i> Points de vie <span class="muted small">(d${hd} ${fmod(con)} CON)</span></h4>
      <div class="wiz-cards">
        <label class="wcard ${W.hpMethod === 'avg' ? 'on' : ''}"><input type="radio" name="hpm" value="avg" ${W.hpMethod === 'avg' ? 'checked' : ''}><b>Moyenne</b><span class="big">+${Math.max(1, avg + con)}</span><small>règle officielle</small></label>
        <label class="wcard ${W.hpMethod === 'roll' ? 'on' : ''}"><input type="radio" name="hpm" value="roll" ${W.hpMethod === 'roll' ? 'checked' : ''}><b>Lancer le dé</b><span class="big">${W.hpRoll ? '+' + Math.max(1, W.hpRoll + con) : '?'}</span>
          <button type="button" class="small" id="wz-roll"><i class="ico i-des"></i> ${W.hpRoll ? 'Relancer' : 'Lancer'} 1d${hd}</button></label>
        <label class="wcard ${W.hpMethod === 'max' ? 'on' : ''}"><input type="radio" name="hpm" value="max" ${W.hpMethod === 'max' ? 'checked' : ''}><b>Maximum</b><span class="big">+${hd + con}</span><small>règle maison</small></label>
      </div>
      ${subNeeded ? `<h4><i class="ico i-livre"></i> ${esc(C.sousNom)}</h4><input id="wz-sub" list="wz-subl" value="${esc(W.subclass)}" placeholder="Choisissez ou écrivez la sous-classe" style="width:100%">
        <datalist id="wz-subl">${(SUBCLASS_HINTS[cls] || []).map(s => `<option value="${esc(s)}">`).join('')}</datalist>` : ''}
      <h4><i class="ico i-etincelle"></i> Nouvelles aptitudes</h4>
      ${feats.length ? feats.map(f => `<div class="wfeat"><b>${esc(f)}</b>${GENERIC_FEATURE.test(f) || !FEATURE_DESC[f]
        ? `<textarea data-ftext="${esc(f)}" rows="2" placeholder="Décrivez l'aptitude (voir les règles de la sous-classe)…">${esc(W.featText[f] || FEATURE_DESC[f] || '')}</textarea>` : `<div class="small">${esc(FEATURE_DESC[f])}</div>`}</div>`).join('')
        : '<p class="muted small">Pas de nouvelle aptitude de classe à ce niveau.</p>'}
      ${missingFeatures(c, C, n).length ? `<details class="wfeat" ${W.catchup.length ? 'open' : ''}><summary><b>Aptitudes des niveaux précédents absentes de la fiche</b> <span class="muted small">(${missingFeatures(c, C, n).length} — à cocher si votre fiche suit les règles officielles)</span></summary>
        <div class="col" style="margin-top:6px">${missingFeatures(c, C, n).map(([l, f]) => `<label class="chk small"><input type="checkbox" data-cu="${l}|${esc(f)}" ${W.catchup.some(x => x[1] === f) ? 'checked' : ''}> <b>${esc(f)}</b> <span class="muted">niv. ${l} — ${esc((FEATURE_DESC[f] || '').slice(0, 90))}</span></label>`).join('')}</div></details>` : ''}
      ${W.asiLevel ? '<p class="note"><i class="ico i-xp"></i> Ce niveau donne une <b>amélioration de caractéristiques</b> (ou un don) : étape suivante.</p>' : ''}`;
  },
  carac(W) {
    const c = W.c, opt = (id, v, excl) => `<select id="${id}">${STATS.map(s => `<option value="${s}" ${s === v ? 'selected' : ''} ${(c.stats?.[s] || 0) >= 20 ? 'disabled' : ''}>${STAT_NAMES[s]} (${c.stats?.[s]})</option>`).join('')}</select>`;
    const feat = FEATS.find(f => f.n === W.feat);
    return `<div class="wiz-cards">
        <label class="wcard ${W.asiMode === '+2' ? 'on' : ''}"><input type="radio" name="asim" value="+2" ${W.asiMode === '+2' ? 'checked' : ''}><b>+2 à une caractéristique</b><small>maximum 20</small></label>
        <label class="wcard ${W.asiMode === '+1' ? 'on' : ''}"><input type="radio" name="asim" value="+1" ${W.asiMode === '+1' ? 'checked' : ''}><b>+1 à deux caractéristiques</b><small>maximum 20</small></label>
        <label class="wcard ${W.asiMode === 'don' ? 'on' : ''}"><input type="radio" name="asim" value="don" ${W.asiMode === 'don' ? 'checked' : ''}><b>Un don</b><small>règle optionnelle</small></label></div>
      ${W.asiMode === '+2' ? `<div class="row">${opt('wz-a', W.asiA)} <b>+2</b></div>` : W.asiMode === '+1' ? `<div class="row">${opt('wz-a', W.asiA)} <b>+1</b> ${opt('wz-b', W.asiB)} <b>+1</b></div>` : ''}
      ${W.asiMode === '+1' && W.asiA === W.asiB ? '<div class="note warn">Choisissez deux caractéristiques différentes (sinon équivaut à +2).</div>' : ''}
      ${W.asiMode !== 'don' ? `<div class="stat-prev">${STATS.map(s => { const d = W.asiMode === '+2' ? (s === W.asiA ? 2 : 0) : (s === W.asiA ? 1 : 0) + (s === W.asiB ? 1 : 0); const v = Math.min(20, (c.stats?.[s] || 10) + d);
        return `<div class="${d ? 'up' : ''}"><span>${s}</span><b>${v}</b><small>${fmod(mod(v))}</small></div>`; }).join('')}</div>`
        : `<div class="feat-grid">${FEATS.map(f => `<button type="button" class="featc ${W.feat === f.n ? 'on' : ''}" data-feat="${esc(f.n)}"><b>${esc(f.n)}</b><small>${esc(f.d)}</small></button>`).join('')}</div>
          ${feat?.fx?.stat1 ? `<div class="row" style="margin-top:8px"><span>Caractéristique +1 :</span><select id="wz-fs"><option value="">— choisir —</option>${(Array.isArray(feat.fx.stat1) ? feat.fx.stat1 : STATS).map(s => `<option value="${s}" ${W.featStat === s ? 'selected' : ''}>${STAT_NAMES[s]} (${c.stats?.[s]})</option>`).join('')}</select></div>` : ''}
          ${feat?.fx?.skills ? `<div class="col" style="margin-top:8px"><span>Trois nouvelles compétences :</span><div class="pick-grid">${SKILLS.filter(([s]) => c.skills?.[s] == null).map(([s, ab]) => `<label class="chk"><input type="checkbox" data-fsk="${s}" ${W.featSkills.includes(s) ? 'checked' : ''}> ${s} <span class="muted small">${ab}</span></label>`).join('')}</div></div>` : ''}`}`;
  },
  exp(W) {
    const c = W.c, sk = Object.keys(c.skills || {}).filter(s => !(c.expertise || []).includes(s));
    return `<p>Choisissez <b>deux compétences maîtrisées</b> : votre bonus de maîtrise est doublé pour elles.</p>
      <div class="pick-grid">${sk.map(s => `<label class="chk"><input type="checkbox" data-exp="${esc(s)}" ${W.expertise.includes(s) ? 'checked' : ''} ${!W.expertise.includes(s) && W.expertise.length >= 2 ? 'disabled' : ''}> ${esc(s)} <span class="muted small">${fmod(c.skills[s])}</span></label>`).join('') || '<span class="muted">Aucune compétence maîtrisée sur la fiche.</span>'}</div>`;
  },
  sorts(W, { C, n, maxLvl, nTours, nSorts, listFor }) {
    const c = W.c, q = spellKey(W.q);
    const filt = L => L.filter(([k, s]) => (!q || spellKey(s.n).includes(q)) && (W.lvlF === '' || String(s.niv) === W.lvlF));
    const row = (kind, [k, s]) => { const sel = (kind === 't' ? W.cantrips : W.picks).some(x => x.k === k);
      return `<label class="sprow ${sel ? 'on' : ''}"><input type="checkbox" data-pick="${kind}|${k}" ${sel ? 'checked' : ''}><span class="sp-ico">${SCHOOL_ICON[s.ecole] || ''}</span>
        <span class="grow"><b>${esc(s.n)}</b> <span class="muted small">${s.niv ? 'niv. ' + s.niv : 'tour'}${s.conc ? ' · C' : ''}${s.rituel ? ' · R' : ''}</span><br><span class="small muted">${spellSummary(s, { ...c, niveau: n }) || esc(s.resume).slice(0, 90)}</span></span>
        <a href="#" class="small" data-spv="${k}">détails</a></label>`; };
    const modeTxt = C.mode === 'connus' ? `Vous apprenez <b>${nSorts}</b> nouveau${nSorts > 1 ? 'x' : ''} sort${nSorts > 1 ? 's' : ''}${C.secrets?.includes(n) ? ' (dont 2 de Secrets magiques, toutes classes)' : ''}.`
      : C.mode === 'grimoire' ? 'Vous ajoutez <b>2 sorts</b> de magicien à votre grimoire.'
        : `Vous préparez vos sorts chaque jour (maximum ${prepMax(W.cls, n, c)}). Ajoutez à la fiche ceux que vous voulez avoir sous la main${nSorts ? ` — suggestion : <b>${nSorts}</b>` : ''}.`;
    const mine = charSpells(c).filter(x => x.lvl > 0);
    return `<div class="note">${modeTxt} Niveau de sort maximum : <b>${maxLvl}</b>.${C.listeNote ? ` <span class="muted">(${esc(C.listeNote)})</span>` : ''}</div>
      <div class="row small"><label class="chk"><input type="checkbox" id="wz-all" ${W.showAll ? 'checked' : ''}> tous les sorts (hors liste de classe)</label>
        <label class="chk"><input type="checkbox" id="wz-nolim" ${W.noLimit ? 'checked' : ''}> ignorer les limites</label></div>
      <div class="wiz-split"><div class="col grow">
        <div class="row"><input id="wz-q" placeholder="Rechercher un sort…" value="${esc(W.q)}" style="flex:1">
          <span class="seg">${['', ...Array.from({ length: maxLvl + 1 }, (_, i) => String(i))].map(l => `<button type="button" data-lf="${l}" class="${W.lvlF === l ? 'on' : ''}">${l === '' ? 'Tous' : l === '0' ? 'Tours' : l}</button>`).join('')}</span></div>
        ${nTours ? `<h4>Tours de magie <span class="cnt ${W.cantrips.length === nTours ? 'ok' : ''}">${W.cantrips.length}/${nTours}</span></h4><div class="splist">${filt(listFor(0)).map(x => row('t', x)).join('') || '<span class="muted small">Aucun.</span>'}</div>` : ''}
        <h4>Sorts <span class="cnt ${nSorts && W.picks.length >= nSorts ? 'ok' : ''}">${W.picks.length}${nSorts ? '/' + nSorts : ''}</span></h4>
        <div class="splist">${filt(listFor(1)).map(x => row('s', x)).join('') || '<span class="muted small">Aucun sort ne correspond.</span>'}</div>
        ${C.swap && mine.length ? `<h4>Remplacer un sort connu <span class="muted small">(optionnel, permis par les règles)</span></h4>
          <div class="row"><select id="wz-swo"><option value="">— aucun —</option>${mine.map(x => `<option value="${x.lvl}|${esc(x.name)}" ${W.swapOut?.name === x.name ? 'selected' : ''}>${esc(x.name)} (niv. ${x.lvl})</option>`).join('')}</select> →
          <select id="wz-swi" ${W.swapOut ? '' : 'disabled'}><option value="">— nouveau sort —</option>${listFor(1).map(([k, s]) => `<option value="${k}" ${W.swapIn?.k === k ? 'selected' : ''}>${esc(s.n)} (niv. ${s.niv})</option>`).join('')}</select></div>` : ''}
      </div><div class="wiz-preview" id="wz-prev-sp"><p class="muted small">Cliquez sur « détails » pour lire un sort.</p></div></div>`;
  },
  recap(W) {
    const { ch } = computeLevel(W), groups = [...new Set(ch.map(x => x.group))];
    const more = levelForXP(W.c.xp) > W.n && W.n < 20;
    return `<p class="muted small">Décochez ce que vous ne voulez pas appliquer (règles maison, fiches personnalisées…).</p>
      ${groups.map(g => `<div class="rec-g"><h4>${esc(g)}</h4>${ch.filter(x => x.group === g).map(x => `<label class="rec ${x.on ? '' : 'off'}"><input type="checkbox" data-chg="${esc(x.k)}" ${x.on ? 'checked' : ''} ${x.fixed ? 'disabled' : ''}> <span>${x.label}</span></label>`).join('')}</div>`).join('')}
      <div class="row" style="margin-top:10px"><label class="chk"><input type="checkbox" id="wz-ann" ${W.announce ? 'checked' : ''}> annoncer la montée de niveau dans l'historique (visible des joueurs)</label>
      ${more ? `<label class="chk"><input type="checkbox" id="wz-chain" ${W.chain ? 'checked' : ''}> enchaîner avec le niveau ${W.n + 1} (XP suffisante)</label>` : ''}</div>
      <p class="muted small">Un instantané de la fiche est conservé : la montée de niveau pourra être annulée depuis la fiche.</p>`;
  },
};

/* applique côté MJ (persos.js) */
function applyLevelMJ(c, nc, info, done) {
  const snap = JSON.parse(JSON.stringify(c)); delete snap.levelHistory;
  const hist = [...(c.levelHistory || []), { niveau: c.niveau, t: Date.now(), snap }].slice(-5);
  for (const k of Object.keys(c)) if (!(k in nc)) delete c[k];
  Object.assign(c, nc, { levelHistory: hist });
  if (info.announce) logInfo(`<i class="ico i-fleche-haut"></i> <b>${esc(c.name)}</b> passe au <b>niveau ${c.niveau}</b>${info.summary.length ? ' : ' + esc(info.summary.join(' · ')) : ''}`);
  saveChar(c); done && done();
  if (info.chain && levelForXP(c.xp) > c.niveau && c.niveau < 20) setTimeout(() => levelUpWizard(c, { onApply: (n2, i2) => applyLevelMJ(c, n2, i2, done) }), 300);
}
function undoLevel(c, done) {
  const last = (c.levelHistory || []).slice(-1)[0]; if (!last) return toast('Aucune montée de niveau à annuler.');
  confirmBox(`Annuler le passage de <b>${esc(c.name)}</b> au niveau ${c.niveau} ? La fiche revient à son état du niveau ${last.niveau} (XP, PV actuels, notes et états sont conservés).`, () => {
    const keep = { xp: c.xp, notes: c.notes, playerNotes: c.playerNotes, conditions: c.conditions, portrait: c.portrait, color: c.color, hpTemp: c.hpTemp, levelHistory: c.levelHistory.slice(0, -1) };
    const hp = c.hp;
    for (const k of Object.keys(c)) delete c[k];
    Object.assign(c, last.snap, keep); c.hp = Math.min(hp, c.hpMax);
    logInfo(`<i class="ico i-sablier"></i> Montée de niveau annulée : <b>${esc(c.name)}</b> revient au niveau ${c.niveau}.`, true);
    saveChar(c); done && done();
  });
}
