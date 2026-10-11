/* ===== Spellbook: every spell (official rules), search and add to sheets ===== */
'use strict';

let grimFor = null, grimSel = null;
const grimF = { q: '', lvl: '', cls: '', school: '', conc: false, ritual: false, dmg: false, srd: false };

function grimList() {
  const q = spellKey(grimF.q);
  return Object.entries(SPELLS.db?.sorts || {}).filter(([k, s]) =>
    (!q || spellKey(s.n).includes(q) || spellKey(s.vo).includes(q)) &&
    (grimF.lvl === '' || s.niv === +grimF.lvl) && (!grimF.cls || (s.classes || []).includes(grimF.cls)) &&
    (!grimF.school || s.ecole === grimF.school) && (!grimF.conc || s.conc) && (!grimF.ritual || s.rituel) &&
    (!grimF.dmg || s.dmg || s.soin) && (!grimF.srd || s.srd))
    .sort((a, b) => a[1].niv - b[1].niv || spellName(a[1]).localeCompare(spellName(b[1])));
}
function renderSpellbook(main) {
  const all = Object.values(SPELLS.db?.sorts || {});
  const classes = [...new Set(all.flatMap(s => s.classes || []))].sort((a, b) => termLead(a).localeCompare(termLead(b)));
  const schools = [...new Set(all.map(s => s.ecole))].sort((a, b) => term(a).localeCompare(term(b)));
  if (!S.chars[grimFor]) grimFor = charList().find(c => c.spellcasting)?.id || charList()[0]?.id || null;
  main.innerHTML = `<div class="split"><div class="side-list grim-side" style="width:360px">
      <input id="gr-q" placeholder="${t('Spell name (English or French)…')}" value="${esc(grimF.q)}">
      <div class="row"><select id="gr-lvl"><option value="">${t('All levels')}</option>${[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `<option value="${n}" ${grimF.lvl === String(n) ? 'selected' : ''}>${n ? t('Level {n}', { n }) : t('Cantrips')}</option>`).join('')}</select>
        <select id="gr-cl"><option value="">${t('All classes')}</option>${classes.map(c => `<option value="${esc(c)}" ${grimF.cls === c ? 'selected' : ''}>${esc(termLead(c))}</option>`).join('')}</select>
        <select id="gr-ec"><option value="">${t('All schools')}</option>${schools.map(c => `<option value="${esc(c)}" ${grimF.school === c ? 'selected' : ''}>${esc(term(c))}</option>`).join('')}</select></div>
      <div class="row small">${[['conc', t('concentration')], ['ritual', t('ritual')], ['dmg', t('damage / healing')], ['srd', t('SRD (open rules)')]].map(([k, l]) => `<label class="chk"><input type="checkbox" data-gf="${k}" ${grimF[k] ? 'checked' : ''}> ${l}</label>`).join('')}</div>
      <div id="gr-count" class="muted small"></div>
      <div id="gr-list" class="list" style="max-height:calc(100vh - 230px);overflow:auto"></div></div>
    <div class="sheet" id="gr-detail"></div></div>`;
  const redraw = () => { drawGrimList(); };
  $('#gr-q').oninput = e => { grimF.q = e.target.value; redraw(); };
  $('#gr-lvl').onchange = e => { grimF.lvl = e.target.value; redraw(); };
  $('#gr-cl').onchange = e => { grimF.cls = e.target.value; redraw(); };
  $('#gr-ec').onchange = e => { grimF.school = e.target.value; redraw(); };
  $$('[data-gf]').forEach(i => i.onchange = () => { grimF[i.dataset.gf] = i.checked; redraw(); });
  drawGrimList(); drawGrimDetail();
}
function drawGrimList() {
  const el = $('#gr-list'); if (!el) return;
  const L = grimList();
  $('#gr-count').textContent = t(L.length > 1 ? '{n} spells' : '{n} spell', { n: L.length });
  el.innerHTML = L.slice(0, 400).map(([k, s]) => `<div class="li ${k === grimSel ? 'sel' : ''}" data-gk="${k}"><span class="sp-ico">${SCHOOL_ICON[s.ecole] || '<i class="ico i-sparkle"></i>'}</span>
    <div class="grow"><b>${esc(spellName(s))}</b> <span class="muted small">${s.niv ? t('lvl {n}', { n: s.niv }) : t('cantrip')}${s.conc ? ' · C' : ''}${s.rituel ? ' · R' : ''}</span>
    <div class="muted small ellipsis">${esc(s.resume)}</div></div></div>`).join('') || `<div class="muted">${t('No spells.')}</div>`;
  $$('[data-gk]', el).forEach(d => d.onclick = () => { grimSel = d.dataset.gk; drawGrimList(); drawGrimDetail(); });
}
function drawGrimDetail() {
  const el = $('#gr-detail'); if (!el) return;
  const sp = SPELLS.db?.sorts?.[grimSel];
  const c = S.chars[grimFor];
  if (!sp) {
    el.innerHTML = `<div class="card"><h3><i class="ico i-book"></i> ${t('Spellbook')}</h3><p>${t('{n} D&D 5e spells. Damage, saving throws and attacks follow the official rules (SRD 5.1) and scale with the slot or character level.', { n: Object.keys(SPELLS.db?.sorts || {}).length })}</p>
      <p class="muted small">${esc(SPELLS.db?.source || '')}</p>
      ${charList().filter(x => Object.values(x.spells || {}).some(l => l?.length)).map(x => `<div class="card" style="margin-top:8px" data-char="${x.id}"><h4>${esc(x.name)} <span class="muted small">${t('DC')} ${x.spellcasting?.dc ?? '—'} · ${t('attack')} ${fmod(+x.spellcasting?.attack || 0)}</span></h4>${spellListHTML(x)}</div>`).join('')}</div>`;
    return;
  }
  const has = c && Object.values(c.spells || {}).some(l => (l || []).some(n => findSpell(n, sp.niv)[0] === grimSel));
  el.innerHTML = `<div class="card">${spellCardHTML(grimSel, sp, c)}
    <div class="row" style="margin-top:10px"><span class="small">${t('Add to')}</span><select id="gr-for">${charList().map(x => `<option value="${x.id}" ${x.id === grimFor ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select>
      <button class="primary" id="gr-add" ${has ? 'disabled' : ''}>${has ? '✔ ' + t('already on the sheet') : '+ ' + t('Add to the sheet')}</button></div>
    ${sp.desc ? '' : `<p class="muted small">${t('Summary only: the full description is on AideDD (link above).')}</p>`}</div>`;
  $('#gr-for').onchange = e => { grimFor = e.target.value; drawGrimDetail(); };
  $('#gr-add').onclick = () => {
    const ch = S.chars[grimFor]; if (!ch) return;
    ch.spells ??= {}; (ch.spells[sp.niv] ||= []).push(sp.n);
    if (sp.niv > 0 && !ch.spellcasting) ch.spellcasting = { ability: 'INT', dc: 8 + ch.prof + mod(ch.stats.INT), attack: ch.prof + mod(ch.stats.INT), slots: {} };
    saveChar(ch); toast(t('{spell} added to {name}.', { spell: esc(spellName(sp)), name: esc(ch.name) })); drawGrimDetail();
  };
}
TABS.spellbook = { render: renderSpellbook };
