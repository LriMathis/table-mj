/* ===== Level-up wizard (GM and players) ===== */
'use strict';

/* subclass suggestions (French names, as written on the sheets) */
const SUBCLASS_HINTS = {
  barbare: ['Voie du berserker', 'Voie du guerrier totémique'], barde: ['Collège du savoir', 'Collège de la vaillance'], clerc: ['Domaine de la vie', 'Domaine de la lumière', 'Domaine de la guerre'],
  druide: ['Cercle de la terre', 'Cercle de la lune'], guerrier: ['Champion', 'Maître de guerre', 'Chevalier occulte'], moine: ['Voie de la main ouverte', 'Voie de l\'ombre'],
  paladin: ['Serment de dévotion', 'Serment des anciens', 'Serment de vengeance'], rodeur: ['Chasseur', 'Maître des bêtes'], roublard: ['Voleur', 'Assassin', 'Escroc arcanique'],
  ensorceleur: ['Lignée draconique', 'Magie sauvage'], occultiste: ['Le Fiélon', 'L\'Archifée', 'Le Grand Ancien'], magicien: ['École d\'évocation', 'École de nécromancie', 'École d\'abjuration'],
  artificier: ['Alchimiste', 'Artilleur', 'Armurier', 'Forgeron de guerre'],
};
const GENERIC_FEATURE = /^Aptitude d/;   // "Aptitude de voie", "Aptitude de domaine"…: subclass feature placeholders
const portraitHTML = (c, size) => c.portrait ? `<div class="avatar" style="width:${size}px;height:${size}px;background-image:url('${esc(c.portrait)}')"></div>`
  : `<div class="avatar" style="width:${size}px;height:${size}px;background-color:${c.color || colorFor(c.name)}">${esc(initials(c.name))}</div>`;
/* stored rest values ("court", "long", "aucun") -> displayed text */
const restName = r => ({ court: t('short rest'), long: t('long rest'), aucun: t('no rest') }[r] || r);

function prepMax(cls, n, c) {
  const C = CLASSES[cls]; if (!C?.ab) return 0;
  const lv = C.cast === 'full' ? n : Math.floor(n / 2) + (C.cast === 'halfup' ? n % 2 : 0);
  return Math.max(1, mod(c.stats?.[C.ab]) + lv);
}
/* official features of the levels already reached that are missing from the sheet */
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

/* everything the level-up changes; W.off = unchecked changes */
function computeLevel(W) {
  const c = W.c, n = W.n, cls = W.cls, C = CLASSES[cls] || {};
  const nc = JSON.parse(JSON.stringify(c)); delete nc.levelHistory;
  nc.stats ??= {}; nc.skills ??= {}; nc.resources ??= []; nc.features ??= []; nc.spells ??= {}; nc.saves ??= []; nc.attacks ??= [];
  const ch = [];
  const add = (k, label, fn, { fixed = false, group = '' } = {}) => { const on = fixed || !W.off.has(k); ch.push({ k, label, on, fixed, group }); if (on) fn(); };
  const oldMods = Object.fromEntries(STATS.map(s => [s, mod(c.stats?.[s])])), oldProf = +c.prof || profForLevel(c.niveau);
  const G = { base: t('Basics'), ab: t('Abilities'), feat: t('Features'), res: t('Resources'), sp: t('Spells'), sk: t('Skills'), atk: t('Attacks') };

  add('level', `${t('Level')} <b>${c.niveau} → ${n}</b>`, () => { nc.niveau = n; }, { fixed: true, group: G.base });
  /* abilities */
  const bump = {};
  if (W.asiLevel && W.asiMode !== 'feat') {
    if (W.asiMode === '+2') bump[W.asiA] = (bump[W.asiA] || 0) + 2; else { bump[W.asiA] = (bump[W.asiA] || 0) + 1; bump[W.asiB] = (bump[W.asiB] || 0) + 1; }
  }
  const feat = W.asiLevel && W.asiMode === 'feat' ? FEATS.find(f => f.n === W.feat) : null;
  if (feat?.fx?.stat1 && W.featStat) bump[W.featStat] = (bump[W.featStat] || 0) + 1;
  for (const [s, d] of Object.entries(bump)) {
    const v0 = +c.stats?.[s] || 10, v1 = Math.min(20, v0 + d);
    if (v1 !== v0) add('stat:' + s, `${STAT_NAMES[s]} <b>${v0} → ${v1}</b> <span class="muted">(${t('mod.')} ${fmod(mod(v0))} → ${fmod(mod(v1))})</span>`, () => { nc.stats[s] = v1; }, { group: G.ab });
  }
  if (feat) {
    add('feat', `${t('Feat')}: <b>${esc(feat.n)}</b> <span class="muted">— ${esc(feat.d)}</span>`, () => {
      nc.features.push({ name: t('Feat') + ': ' + feat.n, text: feat.d });
      if (feat.fx?.saveProf && W.featStat && !nc.saves.includes(W.featStat)) nc.saves.push(W.featStat);
      if (feat.fx?.res) nc.resources.push({ ...feat.fx.res, cur: feat.fx.res.max });
      if (feat.fx?.speed) nc.vitesse = String(nc.vitesse || '9 m').replace(/^([\d,.]+)/, m => String(+(num(m) + feat.fx.speed).toFixed(1)).replace('.', ','));
      if (feat.fx?.skills) for (const sk of W.featSkills) if (nc.skills[sk] == null) nc.skills[sk] = mod(nc.stats[(SKILLS.find(x => x[0] === sk) || [])[1]]) + profForLevel(n);
    }, { group: G.ab });
  }
  const newMods = Object.fromEntries(STATS.map(s => [s, mod(nc.stats?.[s])]));
  /* hit points */
  const hd = +c.hitDie || C.de || 8, con = newMods.CON;
  const base = W.hpMethod === 'max' ? hd : W.hpMethod === 'roll' ? (W.hpRoll || Math.floor(hd / 2) + 1) : Math.floor(hd / 2) + 1;
  const tough = (c.features || []).some(f => /robuste/i.test(f.name)) ? 2 : 0;   // "Robuste" = Tough feat
  const gain = Math.max(1, base + con) + tough;
  const how = W.hpMethod === 'roll' ? t('roll {n}', { n: base }) : W.hpMethod === 'max' ? t('maximum {n}', { n: base }) : t('average {n}', { n: base });
  add('hp', `${t('Max HP')} <b>${c.hpMax} → ${c.hpMax + gain}</b> <span class="muted">(${how} ${fmod(con)} CON${tough ? ' +2 ' + t('Tough') : ''})</span>`,
    () => { nc.hpMax += gain; nc.hp += gain; }, { fixed: true, group: G.base });
  if (con > oldMods.CON) add('hp-con', t('Constitution increased: <b>+{n} max HP</b> for previous levels', { n: (con - oldMods.CON) * c.niveau }), () => { nc.hpMax += (con - oldMods.CON) * c.niveau; nc.hp += (con - oldMods.CON) * c.niveau; }, { group: G.base });
  if (feat?.fx?.hpPerLevel) add('hp-feat', t('Tough: <b>+{n} max HP</b> for previous levels', { n: 2 * c.niveau }), () => { nc.hpMax += 2 * c.niveau; nc.hp += 2 * c.niveau; }, { group: G.base });
  add('hd', `${t('Hit dice')}: <b>${n} d${hd}</b>`, () => { nc.hitDice = (+c.hitDice || 0) + 1; }, { fixed: true, group: G.base });
  const newProf = profForLevel(n), dProf = newProf - oldProf;
  if (dProf) add('prof', `${t('Proficiency bonus')} <b>${fmod(oldProf)} → ${fmod(newProf)}</b>`, () => { nc.prof = newProf; }, { group: G.base });
  const profNow = nc.prof;
  /* class features */
  const subNeeded = C.sous === n && !/[—–-]/.test(c.classe || '');
  if (subNeeded && W.subclass) add('subclass', `${esc(C.sousNom)}: <b>${esc(W.subclass)}</b>`, () => { nc.classe = `${c.classe} — ${W.subclass}`; }, { group: G.feat });
  for (const f of (C.f?.[n] || [])) {
    if ((c.features || []).some(x => x.name === f)) continue;
    const sub = W.subclass || String(c.classe || '').split(/[—–]/)[1]?.trim() || '';
    const name = GENERIC_FEATURE.test(f) && sub ? `${f} (${sub})` : f;
    const text = W.featText[f] || FEATURE_DESC[f] || FEATURE_DESC[f.replace(/ \(.*\)$/, '')] || (GENERIC_FEATURE.test(f)
      ? t('{sub} feature gained at level {n} (see the subclass rules).', { sub: sub || C.sousNom || t('Subclass'), n })
      : t('{cls} feature gained at level {n}.', { cls: termLead(C.nom), n }));
    add('f:' + f, `${t('Feature')}: <b>${esc(name)}</b>`, () => nc.features.push({ name, text }), { group: G.feat });
  }
  for (const [lv, f] of W.catchup) {
    if ((c.features || []).some(x => x.name === f)) continue;
    add('cu:' + f, `${t('Level {n} feature (catch-up)', { n: lv })}: <b>${esc(f)}</b>`, () => nc.features.push({ name: f, text: FEATURE_DESC[f] || t('{cls} feature (level {n}).', { cls: termLead(C.nom), n: lv }) }), { group: G.feat });
  }
  if (cls === 'roublard') {
    const dice = Math.ceil(n / 2) + 'd6';
    const sa = nc.features.find(f => /attaque sournoise/i.test(f.name));   // Sneak Attack
    if (sa && !sa.name.includes(dice) && !sa.text.includes(dice))
      add('sneak', `${esc(sa.name.replace(/\s*\(.*\)$/, ''))}: <b>${dice}</b>`, () => { sa.name = sa.name.replace(/\d+d6/, dice); sa.text = /\d+d6/.test(sa.text) ? sa.text.replace(/\d+d6/, dice) : sa.text + ` (${dice}, ${t('level {n}', { n })})`; }, { group: G.feat });
  }
  /* class resources */
  for (const [rn, max, reset] of classResources(cls, n, nc)) {
    const key = spellKey(rn).split(' ').slice(0, 2).join(' ');
    const r = nc.resources.find(x => spellKey(x.name).startsWith(key) || spellKey(x.name) === spellKey(rn));
    if (r && r.max !== max && max < 99) add('r:' + rn, `${esc(r.name)}: <b>${r.max} → ${max}</b>`, () => { r.cur += Math.max(0, max - r.max); r.max = max; r.reset = r.reset || reset; }, { group: G.res });
    if (!r) add('r:' + rn, `${t('New resource')}: <b>${esc(rn)}</b> (${max >= 99 ? t('unlimited') : max}, ${restName(reset)})`, () => nc.resources.push({ name: rn, max: Math.min(max, 99), cur: Math.min(max, 99), reset }), { group: G.res });
  }
  /* spellcasting */
  if (C.cast) {
    if (!nc.spellcasting && slotsFor(cls, n).some(x => x > 0))
      add('sc', `${t('Spellcasting')} (${abbr(C.ab)}): ${t('DC')} <b>${8 + profNow + newMods[C.ab]}</b>, ${t('attack')} <b>${fmod(profNow + newMods[C.ab])}</b>`, () => { nc.spellcasting = { ability: C.ab, dc: 8 + profNow + newMods[C.ab], attack: profNow + newMods[C.ab], slots: {} }; }, { group: G.sp });
    const sc = nc.spellcasting;
    if (sc) {
      const row = slotsFor(cls, n), parts = [], keys = new Set([...Object.keys(sc.slots || {}).map(Number), ...row.map((_, i) => i + 1)]);
      for (const l of [...keys].sort((a, b) => a - b)) { const o = sc.slots?.[l]?.max || 0, v = row[l - 1] || 0; if (o !== v && (v || cls === 'occultiste')) parts.push([l, o, v]); }
      if (parts.length) add('slots', `${t('Spell slots')}: ${parts.map(([l, o, v]) => `${t('lvl {n}', { n: l })} <b>${o} → ${v}</b>`).join(', ')}`, () => {
        sc.slots ??= {}; for (const [l, o, v] of parts) { const s = sc.slots[l] ||= { max: 0, cur: 0 }; s.cur = Math.max(0, Math.min(v, s.cur + Math.max(0, v - o))); s.max = v; if (!v) delete sc.slots[l]; }
      }, { group: G.sp });
    }
  }
  /* new spells (the French name is stored on the sheet) */
  for (const s of W.cantrips) add('t:' + s.k, `${t('Cantrip')}: <b>${esc(s.label)}</b>`, () => (nc.spells[0] ||= []).push(s.n), { group: G.sp });
  for (const s of W.picks) add('s:' + s.k, `${t('Level {n} spell', { n: s.niv })}: <b>${esc(s.label)}</b>`, () => (nc.spells[s.niv] ||= []).push(s.n), { group: G.sp });
  if (W.swapOut && W.swapIn) add('swap', `${t('Replacement')}: <b>${esc(W.swapOut.label)}</b> → <b>${esc(W.swapIn.label)}</b>`, () => {
    nc.spells[W.swapOut.lvl] = (nc.spells[W.swapOut.lvl] || []).filter(x => x !== W.swapOut.name); (nc.spells[W.swapIn.niv] ||= []).push(W.swapIn.n);
  }, { group: G.sp });
  /* expertise */
  for (const sk of W.expertise) add('x:' + sk, `${t('Expertise')}: <b>${esc(term(sk))}</b> (+${profNow})`, () => { nc.expertise = [...new Set([...(nc.expertise || []), sk])]; if (nc.skills[sk] != null) nc.skills[sk] += profNow; }, { group: G.sk });
  /* derived values (proficiency and modifiers) */
  const dMod = s => newMods[s] - oldMods[s], prev = c.skills || {};
  const skillDeltas = Object.keys(prev).map(sk => { const ab = (SKILLS.find(x => x[0] === sk) || [])[1]; return [sk, (nc.prof - oldProf) * ((c.expertise || []).includes(sk) ? 2 : 1) + (ab ? dMod(ab) : 0)]; }).filter(x => x[1]);
  if (skillDeltas.length) add('skills', `${t('Skills')}: ${skillDeltas.map(([s, d]) => `${esc(term(s))} ${fmod(prev[s])} → <b>${fmod(prev[s] + d)}</b>`).join(', ')}`, () => { for (const [s, d] of skillDeltas) nc.skills[s] += d; }, { group: G.sk });
  const dInit = dMod('DEX') + (feat?.fx?.init || 0);
  if (dInit) add('init', `${t('Initiative')} <b>${fmod(+c.initBonus || 0)} → ${fmod((+c.initBonus || 0) + dInit)}</b>`, () => { nc.initBonus = (+c.initBonus || 0) + dInit; }, { group: G.sk });
  if (c.spellcasting && nc.spellcasting) {
    const d = (nc.prof - oldProf) + dMod(c.spellcasting.ability || C.ab || 'INT');
    if (d) add('scd', `${t('Spells')}: ${t('DC')} <b>${c.spellcasting.dc} → ${c.spellcasting.dc + d}</b>, ${t('attack')} <b>${fmod(c.spellcasting.attack)} → ${fmod(c.spellcasting.attack + d)}</b>`, () => { nc.spellcasting.dc += d; nc.spellcasting.attack += d; }, { group: G.sp });
  }
  (c.attacks || []).forEach((a, i) => {
    const b = +a.bonus || 0, ab = b === oldProf + oldMods.FOR ? 'FOR' : b === oldProf + oldMods.DEX ? 'DEX' : null;
    const dB = (nc.prof - oldProf) + (ab ? dMod(ab) : 0), dD = ab ? dMod(ab) : 0;
    if (!dB && !dD) return;
    const dmg = dD ? String(a.damage || '').replace(/([+-]\d+)?$/, m => { const v = (+m || 0) + dD; return v ? fmod(v) : ''; }) : a.damage;
    add('a:' + i, `${esc(a.name)}: <b>${fmod(b)} → ${fmod(b + dB)}</b>${dD ? `, ${t('damage')} <b>${esc(dmg)}</b>` : ''}`, () => { nc.attacks[i].bonus = b + dB; nc.attacks[i].damage = dmg; }, { group: G.atk });
  });
  return { nc, ch };
}

/* ---------- interface ---------- */
function levelUpWizard(c, { onApply, player = false } = {}) {
  const cls = classOf(c), C = CLASSES[cls] || null, n = (+c.niveau || 1) + 1;
  if (n > 20) return toast(t('Maximum level reached.'));
  const W = { c, n, cls, off: new Set(), hpMethod: 'avg', hpRoll: null, asiLevel: !!C?.asi?.includes(n), asiMode: '+2', asiA: 'FOR', asiB: 'DEX', feat: '', featStat: '', featSkills: [],
    subclass: '', featText: {}, catchup: [], cantrips: [], picks: [], swapOut: null, swapIn: null, expertise: [], showAll: false, noLimit: false, q: '', lvlF: '', step: 0, announce: true, chain: true };
  // highest abilities by default
  const best = STATS.slice().sort((a, b) => (c.stats?.[b] || 0) - (c.stats?.[a] || 0));
  W.asiA = best.find(s => (c.stats?.[s] || 0) < 20) || 'FOR'; W.asiB = best.find(s => s !== W.asiA && (c.stats?.[s] || 0) < 20) || 'CON';
  const sc0 = C?.cast ? slotsFor(cls, n) : [], maxLvl = sc0.reduce((m, v, i) => v > 0 ? i + 1 : m, 0);
  const nCantrips = C?.tours && n > 1 ? Math.max(0, C.tours[n - 1] - C.tours[n - 2]) : 0;
  const nSpells = !C?.cast ? 0 : C.mode === 'connus' ? Math.max(0, (C.connus[n - 1] || 0) - (C.connus[n - 2] || 0)) + (C.secrets?.includes(n) ? 2 : 0)
    : C.mode === 'grimoire' ? 2 : Math.max(maxLvl > (slotsFor(cls, n - 1).reduce((m, v, i) => v > 0 ? i + 1 : m, 0)) ? 1 : 0, prepMax(cls, n, c) - prepMax(cls, n - 1, c));
  const steps = [['base', t('Hit points & features')]];
  if (W.asiLevel) steps.push(['abilities', t('Abilities')]);
  if (C?.expertise?.includes(n)) steps.push(['expertise', t('Expertise')]);
  if (C?.cast && maxLvl > 0) steps.push(['spells', t('Spells')]);
  steps.push(['recap', t('Summary')]);
  const known = knownKeys(c);
  const listFor = lv => Object.entries(SPELLS.db?.sorts || {}).filter(([k, s]) => (lv === 0 ? s.niv === 0 : s.niv >= 1 && s.niv <= maxLvl)
    && (W.showAll || C.secrets?.includes(n) || (s.classes || []).includes(C.liste)) && !known.has(k)).sort((a, b) => a[1].niv - b[1].niv || spellName(a[1]).localeCompare(spellName(b[1])));

  modal(`<div class="wiz"></div>`, (box, close) => {
    box.classList.add('wiz-box');
    const el = $('.wiz', box);
    const draw = () => {
      const st = steps[W.step][0];
      el.innerHTML = `<div class="wiz-head">${portraitHTML(c, 56)}<div class="grow"><div class="wiz-title">${esc(c.name)} <span class="muted">— ${esc(C ? term(C.nom) : classLabel(c.classe) || t('unknown class'))}</span></div>
          <div class="wiz-lv"><span>${t('Level {n}', { n: c.niveau })}</span><i class="ico i-arrow-up"></i><b>${t('Level {n}', { n })}</b></div></div></div>
        <div class="wiz-steps">${steps.map(([k, l], i) => `<button class="wiz-step ${i === W.step ? 'on' : i < W.step ? 'done' : ''}" data-go="${i}"><span>${i + 1}</span>${l}</button>`).join('')}</div>
        <div class="wiz-body">${STEP_HTML[st](W, { C, cls, n, maxLvl, nCantrips, nSpells, listFor })}</div>
        <div class="wiz-foot"><button data-close>${t('Cancel')}</button><span class="grow"></span>
          ${W.step > 0 ? `<button id="wz-prev">◀ ${t('Back')}</button>` : ''}
          ${W.step < steps.length - 1 ? `<button class="primary" id="wz-next">${t('Next')} ▶</button>` : `<button class="primary" id="wz-ok"><i class="ico i-arrow-up"></i> ${t('Reach level {n}', { n })}</button>`}</div>`;
      bind(st);
    };
    const bind = st => {
      $$('[data-go]', el).forEach(b => b.onclick = () => { W.step = +b.dataset.go; draw(); });
      $('#wz-prev', el) && ($('#wz-prev', el).onclick = () => { W.step--; draw(); });
      $('#wz-next', el) && ($('#wz-next', el).onclick = () => { W.step++; draw(); el.parentElement.scrollTop = 0; });
      $('#wz-ok', el) && ($('#wz-ok', el).onclick = () => {
        const { nc, ch } = computeLevel(W);
        const sum = ch.filter(x => x.on && !['level', 'hd'].includes(x.k)).map(x => { const d = document.createElement('div'); d.innerHTML = x.label; return d.textContent; }).slice(0, 12);
        close(); onApply(nc, { summary: sum, announce: W.announce, chain: W.chain });
      });
      const on = (sel, ev, fn) => $$(sel, el).forEach(x => x[ev] = () => { fn(x); draw(); });
      on('[name=hpm]', 'onchange', x => { W.hpMethod = x.value; });
      on('#wz-roll', 'onclick', () => { const r = rollExpr('1d' + (+c.hitDie || C?.de || 8)); W.hpRoll = r.total; W.hpMethod = 'roll'; });
      on('#wz-sub', 'onchange', x => { W.subclass = x.value.trim(); });
      on('[data-cu]', 'onchange', () => { W.catchup = $$('[data-cu]:checked', el).map(i => { const [l, ...f] = i.dataset.cu.split('|'); return [+l, f.join('|')]; }); });
      $$('[data-ftext]', el).forEach(x => x.oninput = () => { W.featText[x.dataset.ftext] = x.value; });
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
        const [kind, k] = x.dataset.pick.split('|'), s = SPELLS.db.sorts[k], arr = kind === 't' ? W.cantrips : W.picks, lim = kind === 't' ? nCantrips : nSpells;
        if (x.checked) { if (!W.noLimit && lim && arr.length >= lim && C.mode !== 'prepares') { x.checked = false; return toast(t('Limit reached ({n}). Uncheck a spell or tick "ignore limits".', { n: lim })); } arr.push({ k, n: s.n, niv: s.niv, label: spellName(s) }); }
        else arr.splice(arr.findIndex(y => y.k === k), 1);
        draw();
      });
      $$('[data-spv]', el).forEach(x => x.onclick = e => { e.preventDefault(); const k = x.dataset.spv; $('#wz-prev-sp', el).innerHTML = spellCardHTML(k, SPELLS.db.sorts[k], c); });
      on('#wz-swo', 'onchange', x => { const [l, ...nm] = x.value.split('|'); const name = nm.join('|'); W.swapOut = x.value ? { lvl: +l, name, label: spellName(findSpell(name, +l)[1], name) } : null; });
      on('#wz-swi', 'onchange', x => { const s = SPELLS.db.sorts[x.value]; W.swapIn = s ? { k: x.value, n: s.n, niv: s.niv, label: spellName(s) } : null; });
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
    const missing = missingFeatures(c, C, n);
    return `${!C ? `<div class="note warn">${t('Class "{cls}" not recognized: only hit points and proficiency will be updated.', { cls: esc(c.classe) })}</div>` : ''}
      <h4><i class="ico i-heal"></i> ${t('Hit points')} <span class="muted small">(d${hd} ${fmod(con)} CON)</span></h4>
      <div class="wiz-cards">
        <label class="wcard ${W.hpMethod === 'avg' ? 'on' : ''}"><input type="radio" name="hpm" value="avg" ${W.hpMethod === 'avg' ? 'checked' : ''}><b>${t('Average')}</b><span class="big">+${Math.max(1, avg + con)}</span><small>${t('official rule')}</small></label>
        <label class="wcard ${W.hpMethod === 'roll' ? 'on' : ''}"><input type="radio" name="hpm" value="roll" ${W.hpMethod === 'roll' ? 'checked' : ''}><b>${t('Roll the die')}</b><span class="big">${W.hpRoll ? '+' + Math.max(1, W.hpRoll + con) : '?'}</span>
          <button type="button" class="small" id="wz-roll"><i class="ico i-dice"></i> ${W.hpRoll ? t('Reroll') : t('Roll')} 1d${hd}</button></label>
        <label class="wcard ${W.hpMethod === 'max' ? 'on' : ''}"><input type="radio" name="hpm" value="max" ${W.hpMethod === 'max' ? 'checked' : ''}><b>${t('Maximum')}</b><span class="big">+${hd + con}</span><small>${t('house rule')}</small></label>
      </div>
      ${subNeeded ? `<h4><i class="ico i-book"></i> ${esc(C.sousNom)}</h4><input id="wz-sub" list="wz-subl" value="${esc(W.subclass)}" placeholder="${t('Pick or type the subclass')}" style="width:100%">
        <datalist id="wz-subl">${(SUBCLASS_HINTS[cls] || []).map(s => `<option value="${esc(s)}">`).join('')}</datalist>` : ''}
      <h4><i class="ico i-sparkle"></i> ${t('New features')}</h4>
      ${feats.length ? feats.map(f => `<div class="wfeat"><b>${esc(f)}</b>${GENERIC_FEATURE.test(f) || !FEATURE_DESC[f]
        ? `<textarea data-ftext="${esc(f)}" rows="2" placeholder="${t('Describe the feature (see the subclass rules)…')}">${esc(W.featText[f] || FEATURE_DESC[f] || '')}</textarea>` : `<div class="small">${esc(FEATURE_DESC[f])}</div>`}</div>`).join('')
        : `<p class="muted small">${t('No new class feature at this level.')}</p>`}
      ${missing.length ? `<details class="wfeat" ${W.catchup.length ? 'open' : ''}><summary><b>${t('Features of previous levels missing from the sheet')}</b> <span class="muted small">(${t('{n} — tick them if your sheet follows the official rules', { n: missing.length })})</span></summary>
        <div class="col" style="margin-top:6px">${missing.map(([l, f]) => `<label class="chk small"><input type="checkbox" data-cu="${l}|${esc(f)}" ${W.catchup.some(x => x[1] === f) ? 'checked' : ''}> <b>${esc(f)}</b> <span class="muted">${t('lvl {n}', { n: l })} — ${esc((FEATURE_DESC[f] || '').slice(0, 90))}</span></label>`).join('')}</div></details>` : ''}
      ${W.asiLevel ? `<p class="note"><i class="ico i-xp"></i> ${t('This level grants an <b>ability score improvement</b> (or a feat): next step.')}</p>` : ''}`;
  },
  abilities(W) {
    const c = W.c, opt = (id, v) => `<select id="${id}">${STATS.map(s => `<option value="${s}" ${s === v ? 'selected' : ''} ${(c.stats?.[s] || 0) >= 20 ? 'disabled' : ''}>${STAT_NAMES[s]} (${c.stats?.[s]})</option>`).join('')}</select>`;
    const feat = FEATS.find(f => f.n === W.feat);
    return `<div class="wiz-cards">
        <label class="wcard ${W.asiMode === '+2' ? 'on' : ''}"><input type="radio" name="asim" value="+2" ${W.asiMode === '+2' ? 'checked' : ''}><b>${t('+2 to one ability')}</b><small>${t('maximum 20')}</small></label>
        <label class="wcard ${W.asiMode === '+1' ? 'on' : ''}"><input type="radio" name="asim" value="+1" ${W.asiMode === '+1' ? 'checked' : ''}><b>${t('+1 to two abilities')}</b><small>${t('maximum 20')}</small></label>
        <label class="wcard ${W.asiMode === 'feat' ? 'on' : ''}"><input type="radio" name="asim" value="feat" ${W.asiMode === 'feat' ? 'checked' : ''}><b>${t('A feat')}</b><small>${t('optional rule')}</small></label></div>
      ${W.asiMode === '+2' ? `<div class="row">${opt('wz-a', W.asiA)} <b>+2</b></div>` : W.asiMode === '+1' ? `<div class="row">${opt('wz-a', W.asiA)} <b>+1</b> ${opt('wz-b', W.asiB)} <b>+1</b></div>` : ''}
      ${W.asiMode === '+1' && W.asiA === W.asiB ? `<div class="note warn">${t('Pick two different abilities (otherwise it is the same as +2).')}</div>` : ''}
      ${W.asiMode !== 'feat' ? `<div class="stat-prev">${STATS.map(s => { const d = W.asiMode === '+2' ? (s === W.asiA ? 2 : 0) : (s === W.asiA ? 1 : 0) + (s === W.asiB ? 1 : 0); const v = Math.min(20, (c.stats?.[s] || 10) + d);
        return `<div class="${d ? 'up' : ''}"><span>${abbr(s)}</span><b>${v}</b><small>${fmod(mod(v))}</small></div>`; }).join('')}</div>`
        : `<div class="feat-grid">${FEATS.map(f => `<button type="button" class="featc ${W.feat === f.n ? 'on' : ''}" data-feat="${esc(f.n)}"><b>${esc(f.n)}</b><small>${esc(f.d)}</small></button>`).join('')}</div>
          ${feat?.fx?.stat1 ? `<div class="row" style="margin-top:8px"><span>${t('Ability +1')}:</span><select id="wz-fs"><option value="">— ${t('choose')} —</option>${(Array.isArray(feat.fx.stat1) ? feat.fx.stat1 : STATS).map(s => `<option value="${s}" ${W.featStat === s ? 'selected' : ''}>${STAT_NAMES[s]} (${c.stats?.[s]})</option>`).join('')}</select></div>` : ''}
          ${feat?.fx?.skills ? `<div class="col" style="margin-top:8px"><span>${t('Three new skills')}:</span><div class="pick-grid">${SKILLS.filter(([s]) => c.skills?.[s] == null).map(([s, ab]) => `<label class="chk"><input type="checkbox" data-fsk="${s}" ${W.featSkills.includes(s) ? 'checked' : ''}> ${term(s)} <span class="muted small">${abbr(ab)}</span></label>`).join('')}</div></div>` : ''}`}`;
  },
  expertise(W) {
    const c = W.c, sk = Object.keys(c.skills || {}).filter(s => !(c.expertise || []).includes(s));
    return `<p>${t('Pick <b>two proficient skills</b>: your proficiency bonus is doubled for them.')}</p>
      <div class="pick-grid">${sk.map(s => `<label class="chk"><input type="checkbox" data-exp="${esc(s)}" ${W.expertise.includes(s) ? 'checked' : ''} ${!W.expertise.includes(s) && W.expertise.length >= 2 ? 'disabled' : ''}> ${esc(term(s))} <span class="muted small">${fmod(c.skills[s])}</span></label>`).join('') || `<span class="muted">${t('No proficient skill on the sheet.')}</span>`}</div>`;
  },
  spells(W, { C, n, maxLvl, nCantrips, nSpells, listFor }) {
    const c = W.c, q = spellKey(W.q);
    const filt = L => L.filter(([k, s]) => (!q || spellKey(s.n).includes(q) || spellKey(s.vo).includes(q)) && (W.lvlF === '' || String(s.niv) === W.lvlF));
    const row = (kind, [k, s]) => { const sel = (kind === 't' ? W.cantrips : W.picks).some(x => x.k === k);
      return `<label class="sprow ${sel ? 'on' : ''}"><input type="checkbox" data-pick="${kind}|${k}" ${sel ? 'checked' : ''}><span class="sp-ico">${SCHOOL_ICON[s.ecole] || ''}</span>
        <span class="grow"><b>${esc(spellName(s))}</b> <span class="muted small">${s.niv ? t('lvl {n}', { n: s.niv }) : t('cantrip')}${s.conc ? ' · C' : ''}${s.rituel ? ' · R' : ''}</span><br><span class="small muted">${spellSummary(s, { ...c, niveau: n }) || esc(s.resume).slice(0, 90)}</span></span>
        <a href="#" class="small" data-spv="${k}">${t('details')}</a></label>`; };
    const modeTxt = C.mode === 'connus' ? t(nSpells > 1 ? 'You learn <b>{n}</b> new spells' : 'You learn <b>{n}</b> new spell', { n: nSpells }) + (C.secrets?.includes(n) ? ' ' + t('(including 2 Magical Secrets, any class)') : '') + '.'
      : C.mode === 'grimoire' ? t('You add <b>2 wizard spells</b> to your spellbook.')
        : t('You prepare your spells every day (maximum {max}). Add to the sheet the ones you want at hand', { max: prepMax(W.cls, n, c) }) + (nSpells ? ' — ' + t('suggestion: <b>{n}</b>', { n: nSpells }) : '') + '.';
    const mine = charSpells(c).filter(x => x.lvl > 0);
    return `<div class="note">${modeTxt} ${t('Highest spell level')}: <b>${maxLvl}</b>.${C.listeNote ? ` <span class="muted">(${esc(C.listeNote)})</span>` : ''}</div>
      <div class="row small"><label class="chk"><input type="checkbox" id="wz-all" ${W.showAll ? 'checked' : ''}> ${t('all spells (outside the class list)')}</label>
        <label class="chk"><input type="checkbox" id="wz-nolim" ${W.noLimit ? 'checked' : ''}> ${t('ignore limits')}</label></div>
      <div class="wiz-split"><div class="col grow">
        <div class="row"><input id="wz-q" placeholder="${t('Search a spell…')}" value="${esc(W.q)}" style="flex:1">
          <span class="seg">${['', ...Array.from({ length: maxLvl + 1 }, (_, i) => String(i))].map(l => `<button type="button" data-lf="${l}" class="${W.lvlF === l ? 'on' : ''}">${l === '' ? t('All') : l === '0' ? t('Cantrips') : l}</button>`).join('')}</span></div>
        ${nCantrips ? `<h4>${t('Cantrips')} <span class="cnt ${W.cantrips.length === nCantrips ? 'ok' : ''}">${W.cantrips.length}/${nCantrips}</span></h4><div class="splist">${filt(listFor(0)).map(x => row('t', x)).join('') || `<span class="muted small">${t('None.')}</span>`}</div>` : ''}
        <h4>${t('Spells')} <span class="cnt ${nSpells && W.picks.length >= nSpells ? 'ok' : ''}">${W.picks.length}${nSpells ? '/' + nSpells : ''}</span></h4>
        <div class="splist">${filt(listFor(1)).map(x => row('s', x)).join('') || `<span class="muted small">${t('No matching spell.')}</span>`}</div>
        ${C.swap && mine.length ? `<h4>${t('Replace a known spell')} <span class="muted small">(${t('optional, allowed by the rules')})</span></h4>
          <div class="row"><select id="wz-swo"><option value="">— ${t('none')} —</option>${mine.map(x => `<option value="${x.lvl}|${esc(x.name)}" ${W.swapOut?.name === x.name ? 'selected' : ''}>${esc(x.label)} (${t('lvl {n}', { n: x.lvl })})</option>`).join('')}</select> →
          <select id="wz-swi" ${W.swapOut ? '' : 'disabled'}><option value="">— ${t('new spell')} —</option>${listFor(1).map(([k, s]) => `<option value="${k}" ${W.swapIn?.k === k ? 'selected' : ''}>${esc(spellName(s))} (${t('lvl {n}', { n: s.niv })})</option>`).join('')}</select></div>` : ''}
      </div><div class="wiz-preview" id="wz-prev-sp"><p class="muted small">${t('Click "details" to read a spell.')}</p></div></div>`;
  },
  recap(W) {
    const { ch } = computeLevel(W), groups = [...new Set(ch.map(x => x.group))];
    const more = levelForXP(W.c.xp) > W.n && W.n < 20;
    return `<p class="muted small">${t('Uncheck what you do not want to apply (house rules, custom sheets…).')}</p>
      ${groups.map(g => `<div class="rec-g"><h4>${esc(g)}</h4>${ch.filter(x => x.group === g).map(x => `<label class="rec ${x.on ? '' : 'off'}"><input type="checkbox" data-chg="${esc(x.k)}" ${x.on ? 'checked' : ''} ${x.fixed ? 'disabled' : ''}> <span>${x.label}</span></label>`).join('')}</div>`).join('')}
      <div class="row" style="margin-top:10px"><label class="chk"><input type="checkbox" id="wz-ann" ${W.announce ? 'checked' : ''}> ${t('announce the level-up in the history (visible to players)')}</label>
      ${more ? `<label class="chk"><input type="checkbox" id="wz-chain" ${W.chain ? 'checked' : ''}> ${t('continue with level {n} (enough XP)', { n: W.n + 1 })}</label>` : ''}</div>
      <p class="muted small">${t('A snapshot of the sheet is kept: the level-up can be undone from the sheet.')}</p>`;
  },
};

/* applied by the GM (characters.js) */
function applyLevelGM(c, nc, info, done) {
  const snap = JSON.parse(JSON.stringify(c)); delete snap.levelHistory;
  const hist = [...(c.levelHistory || []), { niveau: c.niveau, t: Date.now(), snap }].slice(-5);
  for (const k of Object.keys(c)) if (!(k in nc)) delete c[k];
  Object.assign(c, nc, { levelHistory: hist });
  if (info.announce) logInfo(`<i class="ico i-arrow-up"></i> ${t('{who} reaches level {n}', { who: `<b>${esc(c.name)}</b>`, n: `<b>${c.niveau}</b>` })}${info.summary.length ? ' : ' + esc(info.summary.join(' · ')) : ''}`);
  saveChar(c); done && done();
  if (info.chain && levelForXP(c.xp) > c.niveau && c.niveau < 20) setTimeout(() => levelUpWizard(c, { onApply: (n2, i2) => applyLevelGM(c, n2, i2, done) }), 300);
}
function undoLevel(c, done) {
  const last = (c.levelHistory || []).slice(-1)[0]; if (!last) return toast(t('No level-up to undo.'));
  confirmBox(t('Undo the level {n} level-up of <b>{name}</b>? The sheet goes back to its level {old} state (XP, current HP, notes and conditions are kept).', { n: c.niveau, name: esc(c.name), old: last.niveau }), () => {
    const keep = { xp: c.xp, notes: c.notes, playerNotes: c.playerNotes, conditions: c.conditions, portrait: c.portrait, color: c.color, hpTemp: c.hpTemp, levelHistory: c.levelHistory.slice(0, -1) };
    const hp = c.hp;
    for (const k of Object.keys(c)) delete c[k];
    Object.assign(c, last.snap, keep); c.hp = Math.min(hp, c.hpMax);
    logInfo(`<i class="ico i-hourglass"></i> ${t('Level-up undone: <b>{name}</b> is back to level {n}.', { name: esc(c.name), n: c.niveau })}`, true);
    saveChar(c); done && done();
  });
}
