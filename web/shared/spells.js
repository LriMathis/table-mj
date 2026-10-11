/* ===== Spells: official database (SRD 5.1 + AideDD names/summaries), level-based numbers, cast dialog ===== */
'use strict';

const SPELLS = { db: null, index: {}, ready: null };
const SCHOOL_ICON = { abjuration: '<i class="ico i-shield"></i>', invocation: '<i class="ico i-portal"></i>', divination: '<i class="ico i-magnifier"></i>', enchantement: '<i class="ico i-stunned"></i>', évocation: '<i class="ico i-fire"></i>', illusion: '<i class="ico i-masks"></i>', nécromancie: '<i class="ico i-skull"></i>', transmutation: '<i class="ico i-vial"></i>' };
const spellKey = s => String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
/* spell name in the interface language (the database keeps the official English name in `vo`) */
const spellName = (sp, fallback = '') => (sp ? (LANG === 'en' && sp.vo ? sp.vo : sp.n) : fallback);

function loadSpells() {
  if (!SPELLS.ready) SPELLS.ready = fetch('/shared/spells.json').then(r => r.json()).then(d => {
    SPELLS.db = d;
    for (const [k, s] of Object.entries(d.sorts)) {
      (SPELLS.index[spellKey(s.n)] ||= []).push(k);
      if (s.vo) (SPELLS.index[spellKey(s.vo)] ||= []).push(k);
    }
    return d;
  }).catch(e => { console.error(e); SPELLS.db = { sorts: {}, alias: {} }; });
  return SPELLS.ready;
}
/* name written on the sheet -> [key, spell] (same rules as the server) */
function findSpell(name, level) {
  const d = SPELLS.db; if (!d) return [null, null];
  const k = spellKey(name), al = d.alias;
  if (level != null && al[`${k}|${level}`]) return [al[`${k}|${level}`], d.sorts[al[`${k}|${level}`]]];
  const c = SPELLS.index[k] || [];
  const best = c.find(x => level == null || d.sorts[x].niv === +level);
  if (best) return [best, d.sorts[best]];
  if (al[k]) return [al[k], d.sorts[al[k]]];
  if (c.length) return [c[0], d.sorts[c[0]]];
  const w = k.split(' ');
  while (w.length > 1) { w.pop(); const c2 = SPELLS.index[w.join(' ')]; if (c2) return [c2[0], d.sorts[c2[0]]]; }
  return [null, null];
}
function pickTier(table, n) {
  if (!table) return null;
  const ks = Object.keys(table).map(Number).sort((a, b) => a - b);
  let best = null; for (const k of ks) if (k <= n) best = table[k];
  return best ?? table[ks[0]];
}
function spellNumbers(sp, slot, charLvl, abMod) {
  const out = {}, lvl = Math.max(+sp.niv || 0, +slot || 0);
  const rep = e => e && e.replace(/MOD/g, String(abMod)).replace('+-', '-');
  if (sp.dmg) {
    out.dmg = { expr: rep(sp.dmg.parNiv ? pickTier(sp.dmg.parNiv, charLvl) : pickTier(sp.dmg.parEmp, lvl)), type: sp.dmg.type || '', estime: !!sp.dmg.estime };
    if (sp.dmg.plus?.parEmp) out.dmg2 = { expr: rep(pickTier(sp.dmg.plus.parEmp, lvl)), type: sp.dmg.plus.type };
  }
  if (sp.soin) out.soin = { expr: rep(pickTier(sp.soin.parEmp, lvl)), temp: !!sp.soin.temp };
  if (sp.multi) out.multi = { n: sp.multi.parNiv ? +pickTier(sp.multi.parNiv, charLvl) : (sp.multi.base || 1) + (sp.multi.parEmp || 0) * (lvl - (+sp.niv || 0)), nom: sp.multi.nom || 'rayon' };
  return out;
}
const aideddUrl = k => 'https://www.aidedd.org/dnd/sorts.php?vf=' + encodeURIComponent(k);
/* "ray" / "dart"… of multi-target spells, stored in French */
const MULTI_EN = { rayon: 'ray', projectile: 'dart', 'fléchette': 'dart', faisceau: 'beam', 'éclair': 'bolt', cible: 'target' };
const multiName = n => (LANG === 'en' ? MULTI_EN[n] || n : n);

/* short summary of a spell for a given caster */
function spellSummary(sp, c, slot) {
  if (!sp) return '';
  const sc = c?.spellcasting || {}, n = spellNumbers(sp, slot ?? sp.niv, +c?.niveau || 1, mod(c?.stats?.[sc.ability || 'INT']));
  const p = [];
  if (sp.atk) p.push(`<i class="ico i-target"></i> ${sp.atk === 'contact' ? t('melee spell attack') : t('ranged spell attack')} ${fmod(+sc.attack || 0)}`);
  if (sp.auto) p.push('✔ ' + t('hits automatically'));
  if (sp.jds) p.push(`<i class="ico i-shield"></i> ${t('{ab} save DC {dc}', { ab: abbr(sp.jds), dc: sc.dc ?? '?' })}${sp.jdsOk === 'moitie' ? ' (½)' : ''}`);
  if (n.multi) p.push(`${n.multi.n} ${multiName(n.multi.nom)}s`);
  if (n.dmg?.expr) p.push(`<i class="ico i-damage"></i> ${n.dmg.expr} ${term(n.dmg.type)}${n.dmg.estime ? ' ≈' : ''}`);
  if (n.dmg2?.expr) p.push(`+ ${n.dmg2.expr} ${term(n.dmg2.type)}`);
  if (n.soin?.expr) p.push(`<i class="ico i-heal"></i> ${n.soin.expr} ${n.soin.temp ? t('temp. HP') : t('HP')}`);
  return p.join(' · ');
}
/* full spell card */
function spellCardHTML(key, sp, c) {
  if (!sp) return `<p class="muted">${t('Spell not in the database: use the description on the sheet.')}</p>`;
  const tags = [sp.conc ? `<span class="tag conc">${t('concentration')}</span>` : '', sp.rituel ? `<span class="tag">${t('ritual')}</span>` : '', sp.srd ? '<span class="tag">SRD</span>' : ''].join(' ');
  const other = LANG === 'en' ? sp.n : sp.vo;
  return `<div class="spell-card">
    <div class="sp-head"><span class="sp-ico">${SCHOOL_ICON[sp.ecole] || '<i class="ico i-sparkle"></i>'}</span><div><h3>${esc(spellName(sp))}</h3>
      <div class="muted small">${sp.niv ? t('Level {n}', { n: sp.niv }) : t('Cantrip')} · ${esc(term(sp.ecole))} ${tags}${other && other !== spellName(sp) ? ` · <i>${esc(other)}</i>` : ''}</div></div></div>
    <div class="sp-grid"><div><span>${t('Casting time')}</span>${esc(sp.temps)}</div><div><span>${t('Range')}</span>${esc(sp.portee)}</div>
      <div><span>${t('Components')}</span>${esc(sp.comp)}</div><div><span>${t('Duration')}</span>${esc(sp.duree || (sp.conc ? t('concentration') : '—'))}</div></div>
    ${c ? `<div class="sp-sum">${spellSummary(sp, c)}</div>` : ''}
    <div class="sp-desc">${sp.desc ? md(sp.desc) : `<p>${linkDice(esc(sp.resume))}</p>`}</div>
    ${sp.note ? `<p class="small"><b>${t('Note')}:</b> ${esc(sp.note)}</p>` : ''}
    <div class="muted small">${sp.classes?.length ? t('Classes') + ': ' + esc(sp.classes.map(termLead).join(', ')) + ' · ' : ''}${esc(sp.src)} · <a href="${aideddUrl(key)}" target="_blank" rel="noopener">${t('AideDD page')} ↗</a></div>
  </div>`;
}

/* spells of a character, grouped by level */
function charSpells(c) {
  const out = [];
  for (const [lvl, list] of Object.entries(c.spells || {})) for (const name of list || []) {
    const [key, sp] = findSpell(name, +lvl);
    out.push({ name, lvl: +lvl, key, sp, label: spellName(sp, name) });
  }
  return out.sort((a, b) => a.lvl - b.lvl || a.label.localeCompare(b.label));
}
function slotsAvail(c, minLvl) {
  const s = c.spellcasting?.slots || {};
  return Object.keys(s).map(Number).filter(l => l >= minLvl && s[l].max > 0).sort((a, b) => a - b).map(l => ({ l, cur: s[l].cur, max: s[l].max }));
}

/* "cast a spell" dialog; targets = [{uid, name, foe}]; onCast({slot, targets, adv, ritual}) */
function castModal(c, item, targets, onCast, { inCombat = false } = {}) {
  const sp = item.sp || { n: item.name, niv: item.lvl, temps: '1 action' }, lvl = item.lvl;
  const slots = lvl > 0 ? slotsAvail(c, lvl) : [];
  const first = slots.find(s => s.cur > 0);
  const multi = sp.atk ? (spellNumbers(sp, first?.l || lvl, +c.niveau || 1, 0).multi?.n || 1) : 1;
  const area = !!sp.jds && !sp.atk;
  const tgtTitle = area ? t('Creatures in the area') : sp.atk && multi > 1 ? t('Targets (one per {what}, in order)', { what: multiName(sp.multi?.nom || 'rayon') }) : t('Target');
  modal(`<div class="cast">${spellCardHTML(item.key, item.sp, c)}
    <form class="col" id="cast-f" style="margin-top:10px">
      ${lvl > 0 ? `<div class="row"><b>${t('Slot')}</b>${slots.map(s => `<label class="slotpick ${s.cur ? '' : 'off'}"><input type="radio" name="slot" value="${s.l}" ${s === first ? 'checked' : ''} ${s.cur ? '' : 'disabled'}>
          <span>${t('lvl {n}', { n: s.l })}</span><small>${s.cur}/${s.max}</small></label>`).join('') || `<span class="muted">${t('no slot')}</span>`}
        ${sp.rituel && !inCombat ? `<label class="chk small"><input type="checkbox" name="ritual"> ${t('as a ritual (+10 min, no slot)')}</label>` : ''}</div>` : ''}
      ${targets.length ? `<div class="col"><b>${tgtTitle}</b>
        <div class="tgt-list">${targets.map(x => `<label class="tgt ${x.foe ? 'foe' : 'ally'}"><input type="${area || multi > 1 ? 'checkbox' : 'radio'}" name="tgt" value="${x.uid}"> ${esc(x.name)}</label>`).join('')}</div></div>` : ''}
      ${sp.atk ? `<div class="row adv-pick"><label><input type="radio" name="cadv" value="0" checked> ${t('normal')}</label><label><input type="radio" name="cadv" value="1"> ${t('advantage')}</label><label><input type="radio" name="cadv" value="-1"> ${t('disadvantage')}</label></div>` : ''}
      <div class="actions"><button type="button" data-close>${t('Cancel')}</button><button class="primary" ${lvl > 0 && !first && !sp.rituel ? 'disabled' : ''}><i class="ico i-spells"></i> ${t('Cast {spell}', { spell: esc(spellName(sp, item.name)) })}</button></div>
    </form></div>`, (box, close) => {
    const f = $('#cast-f', box);
    f.onsubmit = e => {
      e.preventDefault();
      const fd = new FormData(f);
      const ritual = !!fd.get('ritual');
      if (lvl > 0 && !ritual && !fd.get('slot')) return toast(t('No slot available.'));
      close();
      onCast({ slot: ritual ? lvl : +(fd.get('slot') || lvl), targets: fd.getAll('tgt'), adv: +(fd.get('cadv') || 0), ritual });
    };
  });
}

/* ---------- local casting (GM): rolls the dice and returns the details ---------- */
function castLocal(c, item, { slot, targets = [], adv = 0, ritual = false }, tgtInfo) {
  const sc = c.spellcasting || {}, sp = item.sp || { n: item.name, niv: item.lvl };
  const lvl = item.lvl, name = spellName(sp, item.name);
  if (lvl > 0 && !ritual) {
    const s = sc.slots?.[slot];
    if (!s || s.cur <= 0) { toast(t('No level {n} slot left.', { n: slot })); return null; }
    s.cur--;
  }
  const nums = spellNumbers(sp, slot, +c.niveau || 1, mod(c.stats?.[sc.ability || 'INT']));
  const tg = targets.map(tgtInfo).filter(Boolean);
  const bits = [];
  if (sp.jds) bits.push(t('{ab} save DC {dc}', { ab: abbr(sp.jds), dc: sc.dc }) + (sp.jdsOk === 'moitie' ? ' ' + t('(half on success)') : ''));
  if (sp.zone) bits.push(esc(sp.zone));
  if (sp.note) bits.push(esc(sp.note));
  if (!Object.keys(nums).length && sp.resume) bits.push(esc(sp.resume));
  const slotTxt = lvl > 0 ? (ritual ? ' ' + t('(ritual)') : ' — ' + t('level {n} slot', { n: slot })) : '';
  logInfo(`<i class="ico i-spells"></i> ${t('{who} casts {spell}', { who: `<b>${esc(c.name)}</b>`, spell: `<b>${esc(name)}</b>` })}${slotTxt}${tg.length ? ' → ' + tg.map(x => esc(x.name)).join(', ') : ''}${bits.length ? `<br><span class="small">${bits.join(' · ')}</span>` : ''}`);
  if (sp.conc) {
    if (c.concentration && c.concentration !== sp.n) logInfo(`<i class="ico i-spells"></i> ${t('{who} stops concentrating on {spell}.', { who: esc(c.name), spell: `<b>${esc(c.concentration)}</b>` })}`);
    c.concentration = sp.n; remCond(c, 'Concentration'); addCond(c, 'Concentration');
  }
  const res = { rays: [], sp, nums, tg };
  if (sp.atk) {
    const n = nums.multi?.n || 1;
    for (let i = 0; i < n; i++) {
      const tgt = tg.length ? tg[i % tg.length] : null;
      const r = attackRoll({ who: c.name, name: name + (n > 1 ? ` (${multiName(nums.multi.nom)} ${i + 1}/${n})` : ''), bonus: sc.attack, damage: nums.dmg?.expr || '', type: nums.dmg?.type || '', targetAC: tgt ? tgt.ac : null, targetName: tgt ? tgt.name : '', adv });
      res.rays.push({ ...r, t: tgt });
    }
  } else if (nums.dmg?.expr) {
    res.dmg = roll(nums.dmg.expr, { label: `${t('{name} damage', { name })} ${term(nums.dmg.type)}`, who: c.name, adv: 0 });
  }
  if (nums.soin?.expr) res.heal = roll(nums.soin.expr, { label: `${name} (${nums.soin.temp ? t('temporary hit points') : t('healing')})`, who: c.name, adv: 0 });
  saveChar(c);
  return res;
}
