/* ===== Sorts : base officielle (SRD 5.1 + noms/résumés AideDD), calculs selon le niveau, fenêtre de lancement ===== */
'use strict';

const SPELLS = { db: null, index: {}, ready: null };
const SCHOOL_ICON = { abjuration: '<i class="ico i-bouclier"></i>', invocation: '<i class="ico i-portail"></i>', divination: '<i class="ico i-loupe"></i>', enchantement: '<i class="ico i-etourdi"></i>', évocation: '<i class="ico i-feu"></i>', illusion: '<i class="ico i-masques"></i>', nécromancie: '<i class="ico i-mort"></i>', transmutation: '<i class="ico i-fiole"></i>' };
const spellKey = s => String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

function loadSpells() {
  if (!SPELLS.ready) SPELLS.ready = fetch('/commun/sorts.json').then(r => r.json()).then(d => {
    SPELLS.db = d;
    for (const [k, s] of Object.entries(d.sorts)) (SPELLS.index[spellKey(s.n)] ||= []).push(k);
    return d;
  }).catch(e => { console.error(e); SPELLS.db = { sorts: {}, alias: {} }; });
  return SPELLS.ready;
}
/* nom écrit sur la fiche -> [clé, sort] (mêmes règles que le serveur) */
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

/* résumé court d'un sort pour un lanceur donné */
function spellSummary(sp, c, slot) {
  if (!sp) return '';
  const sc = c?.spellcasting || {}, n = spellNumbers(sp, slot ?? sp.niv, +c?.niveau || 1, mod(c?.stats?.[sc.ability || 'INT']));
  const p = [];
  if (sp.atk) p.push(`<i class="ico i-cible"></i> attaque ${sp.atk === 'contact' ? 'au contact' : 'à distance'} ${fmod(+sc.attack || 0)}`);
  if (sp.auto) p.push('✔ touche automatiquement');
  if (sp.jds) p.push(`<i class="ico i-bouclier"></i> JdS ${sp.jds} DD ${sc.dc ?? '?'}${sp.jdsOk === 'moitie' ? ' (½)' : ''}`);
  if (n.multi) p.push(`${n.multi.n} ${n.multi.nom}s`);
  if (n.dmg?.expr) p.push(`<i class="ico i-degats"></i> ${n.dmg.expr} ${n.dmg.type}${n.dmg.estime ? ' ≈' : ''}`);
  if (n.dmg2?.expr) p.push(`+ ${n.dmg2.expr} ${n.dmg2.type}`);
  if (n.soin?.expr) p.push(`<i class="ico i-soin"></i> ${n.soin.expr}${n.soin.temp ? ' PV temp.' : ' PV'}`);
  return p.join(' · ');
}
/* fiche complète d'un sort */
function spellCardHTML(key, sp, c) {
  if (!sp) return '<p class="muted">Sort absent de la base : utilisez la description de la fiche.</p>';
  const tags = [sp.conc ? '<span class="tag conc">concentration</span>' : '', sp.rituel ? '<span class="tag">rituel</span>' : '', sp.srd ? '<span class="tag">SRD</span>' : ''].join(' ');
  return `<div class="spell-card">
    <div class="sp-head"><span class="sp-ico">${SCHOOL_ICON[sp.ecole] || '<i class="ico i-etincelle"></i>'}</span><div><h3>${esc(sp.n)}</h3>
      <div class="muted small">${sp.niv ? 'Niveau ' + sp.niv : 'Tour de magie'} · ${esc(sp.ecole)} ${tags}</div></div></div>
    <div class="sp-grid"><div><span>Incantation</span>${esc(sp.temps)}</div><div><span>Portée</span>${esc(sp.portee)}</div>
      <div><span>Composantes</span>${esc(sp.comp)}</div><div><span>Durée</span>${esc(sp.duree || (sp.conc ? 'concentration' : '—'))}</div></div>
    ${c ? `<div class="sp-sum">${spellSummary(sp, c)}</div>` : ''}
    <div class="sp-desc">${sp.desc ? md(sp.desc) : `<p>${linkDice(esc(sp.resume))}</p>`}</div>
    ${sp.note ? `<p class="small"><b>Rappel :</b> ${esc(sp.note)}</p>` : ''}
    <div class="muted small">${sp.classes?.length ? 'Classes : ' + esc(sp.classes.join(', ')) + ' · ' : ''}${esc(sp.src)} · <a href="${aideddUrl(key)}" target="_blank" rel="noopener">fiche AideDD ↗</a></div>
  </div>`;
}

/* liste des sorts d'un personnage, regroupée par niveau */
function charSpells(c) {
  const out = [];
  for (const [lvl, list] of Object.entries(c.spells || {})) for (const name of list || []) {
    const [key, sp] = findSpell(name, +lvl);
    out.push({ name, lvl: +lvl, key, sp });
  }
  return out.sort((a, b) => a.lvl - b.lvl || a.name.localeCompare(b.name));
}
function slotsAvail(c, minLvl) {
  const s = c.spellcasting?.slots || {};
  return Object.keys(s).map(Number).filter(l => l >= minLvl && s[l].max > 0).sort((a, b) => a - b).map(l => ({ l, cur: s[l].cur, max: s[l].max }));
}

/* fenêtre « lancer un sort » ; targets = [{uid, name, foe}] ; onCast({slot, targets, adv, ritual}) */
function castModal(c, item, targets, onCast, { inCombat = false } = {}) {
  const sp = item.sp || { n: item.name, niv: item.lvl, temps: '1 action' }, lvl = item.lvl;
  const slots = lvl > 0 ? slotsAvail(c, lvl) : [];
  const first = slots.find(s => s.cur > 0);
  const multi = sp.atk ? (spellNumbers(sp, first?.l || lvl, +c.niveau || 1, 0).multi?.n || 1) : 1;
  const area = !!sp.jds && !sp.atk;
  modal(`<div class="cast">${spellCardHTML(item.key, item.sp, c)}
    <form class="col" id="cast-f" style="margin-top:10px">
      ${lvl > 0 ? `<div class="row"><b>Emplacement</b>${slots.map(s => `<label class="slotpick ${s.cur ? '' : 'off'}"><input type="radio" name="slot" value="${s.l}" ${s === first ? 'checked' : ''} ${s.cur ? '' : 'disabled'}>
          <span>niv. ${s.l}</span><small>${s.cur}/${s.max}</small></label>`).join('') || '<span class="muted">aucun emplacement</span>'}
        ${sp.rituel && !inCombat ? `<label class="chk small"><input type="checkbox" name="ritual"> en rituel (+10 min, sans emplacement)</label>` : ''}</div>` : ''}
      ${targets.length ? `<div class="col"><b>${area ? 'Créatures dans la zone' : sp.atk ? `Cible${multi > 1 ? 's (une par ' + (sp.multi?.nom || 'rayon') + ', dans l\'ordre)' : ''}` : 'Cible'}</b>
        <div class="tgt-list">${targets.map(t => `<label class="tgt ${t.foe ? 'foe' : 'ally'}"><input type="${area || multi > 1 ? 'checkbox' : 'radio'}" name="tgt" value="${t.uid}"> ${esc(t.name)}</label>`).join('')}</div></div>` : ''}
      ${sp.atk ? `<div class="row adv-pick"><label><input type="radio" name="cadv" value="0" checked> normal</label><label><input type="radio" name="cadv" value="1"> avantage</label><label><input type="radio" name="cadv" value="-1"> désavantage</label></div>` : ''}
      <div class="actions"><button type="button" data-close>Annuler</button><button class="primary" ${lvl > 0 && !first && !sp.rituel ? 'disabled' : ''}><i class="ico i-sorts"></i> Lancer ${esc(sp.n)}</button></div>
    </form></div>`, (box, close) => {
    const f = $('#cast-f', box);
    f.onsubmit = e => {
      e.preventDefault();
      const fd = new FormData(f);
      const ritual = !!fd.get('ritual');
      if (lvl > 0 && !ritual && !fd.get('slot')) return toast('Aucun emplacement disponible.');
      close();
      onCast({ slot: ritual ? lvl : +(fd.get('slot') || lvl), targets: fd.getAll('tgt'), adv: +(fd.get('cadv') || 0), ritual });
    };
  });
}

/* ---------- lancement local (MJ) : lance les dés et renvoie le détail ---------- */
function castLocal(c, item, { slot, targets = [], adv = 0, ritual = false }, tgtInfo) {
  const sc = c.spellcasting || {}, sp = item.sp || { n: item.name, niv: item.lvl };
  const lvl = item.lvl;
  if (lvl > 0 && !ritual) {
    const s = sc.slots?.[slot];
    if (!s || s.cur <= 0) { toast(`Plus d'emplacement de niveau ${slot}.`); return null; }
    s.cur--;
  }
  const nums = spellNumbers(sp, slot, +c.niveau || 1, mod(c.stats?.[sc.ability || 'INT']));
  const tg = targets.map(tgtInfo).filter(Boolean);
  const bits = [];
  if (sp.jds) bits.push(`JdS ${sp.jds} DD ${sc.dc}${sp.jdsOk === 'moitie' ? ' (moitié si réussite)' : ''}`);
  if (sp.zone) bits.push(esc(sp.zone));
  if (sp.note) bits.push(esc(sp.note));
  if (!Object.keys(nums).length && sp.resume) bits.push(esc(sp.resume));
  logInfo(`<i class="ico i-sorts"></i> <b>${esc(c.name)}</b> lance <b>${esc(sp.n)}</b>${lvl > 0 ? (ritual ? ' (rituel)' : ` — emplacement niv. ${slot}`) : ''}${tg.length ? ' → ' + tg.map(t => esc(t.name)).join(', ') : ''}${bits.length ? `<br><span class="small">${bits.join(' · ')}</span>` : ''}`);
  if (sp.conc) {
    if (c.concentration && c.concentration !== sp.n) logInfo(`<i class="ico i-sorts"></i> ${esc(c.name)} cesse de se concentrer sur <b>${esc(c.concentration)}</b>.`);
    c.concentration = sp.n; remCond(c, 'Concentration'); addCond(c, 'Concentration');
  }
  const res = { rays: [], sp, nums, tg };
  if (sp.atk) {
    const n = nums.multi?.n || 1;
    for (let i = 0; i < n; i++) {
      const t = tg.length ? tg[i % tg.length] : null;
      const r = attackRoll({ who: c.name, name: sp.n + (n > 1 ? ` (${nums.multi.nom} ${i + 1}/${n})` : ''), bonus: sc.attack, damage: nums.dmg?.expr || '', type: nums.dmg?.type || '', targetCA: t ? t.ca : null, targetName: t ? t.name : '', adv });
      res.rays.push({ ...r, t });
    }
  } else if (nums.dmg?.expr) {
    res.dmg = roll(nums.dmg.expr, { label: `Dégâts ${sp.n} ${nums.dmg.type}`, who: c.name, adv: 0 });
  }
  if (nums.soin?.expr) res.heal = roll(nums.soin.expr, { label: `${sp.n}${nums.soin.temp ? ' (PV temporaires)' : ' (soins)'}`, who: c.name, adv: 0 });
  saveChar(c);
  return res;
}
