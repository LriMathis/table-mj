/* ===== Grimoire : tous les sorts (règles officielles), recherche et ajout aux fiches ===== */
'use strict';

let grimFor = null, grimSel = null;
const grimF = { q: '', niv: '', classe: '', ecole: '', conc: false, rituel: false, dmg: false, srd: false };

function grimList() {
  const q = spellKey(grimF.q);
  return Object.entries(SPELLS.db?.sorts || {}).filter(([k, s]) =>
    (!q || spellKey(s.n).includes(q) || spellKey(s.vo).includes(q)) &&
    (grimF.niv === '' || s.niv === +grimF.niv) && (!grimF.classe || (s.classes || []).includes(grimF.classe)) &&
    (!grimF.ecole || s.ecole === grimF.ecole) && (!grimF.conc || s.conc) && (!grimF.rituel || s.rituel) &&
    (!grimF.dmg || s.dmg || s.soin) && (!grimF.srd || s.srd))
    .sort((a, b) => a[1].niv - b[1].niv || a[1].n.localeCompare(b[1].n));
}
function renderGrimoire(main) {
  const all = Object.values(SPELLS.db?.sorts || {});
  const classes = [...new Set(all.flatMap(s => s.classes || []))].sort();
  const ecoles = [...new Set(all.map(s => s.ecole))].sort();
  if (!S.chars[grimFor]) grimFor = charList().find(c => c.spellcasting)?.id || charList()[0]?.id || null;
  main.innerHTML = `<div class="split"><div class="side-list grim-side" style="width:360px">
      <input id="gr-q" placeholder="Nom du sort (français ou anglais)…" value="${esc(grimF.q)}">
      <div class="row"><select id="gr-niv"><option value="">Tous niveaux</option>${[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `<option value="${n}" ${grimF.niv === String(n) ? 'selected' : ''}>${n ? 'Niveau ' + n : 'Tours de magie'}</option>`).join('')}</select>
        <select id="gr-cl"><option value="">Toutes classes</option>${classes.map(c => `<option ${grimF.classe === c ? 'selected' : ''}>${c}</option>`).join('')}</select>
        <select id="gr-ec"><option value="">Toutes écoles</option>${ecoles.map(c => `<option ${grimF.ecole === c ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
      <div class="row small">${[['conc', 'concentration'], ['rituel', 'rituel'], ['dmg', 'dégâts / soins'], ['srd', 'SRD (règles libres)']].map(([k, l]) => `<label class="chk"><input type="checkbox" data-gf="${k}" ${grimF[k] ? 'checked' : ''}> ${l}</label>`).join('')}</div>
      <div id="gr-count" class="muted small"></div>
      <div id="gr-list" class="list" style="max-height:calc(100vh - 230px);overflow:auto"></div></div>
    <div class="sheet" id="gr-detail"></div></div>`;
  const redraw = () => { drawGrimList(); };
  $('#gr-q').oninput = e => { grimF.q = e.target.value; redraw(); };
  $('#gr-niv').onchange = e => { grimF.niv = e.target.value; redraw(); };
  $('#gr-cl').onchange = e => { grimF.classe = e.target.value; redraw(); };
  $('#gr-ec').onchange = e => { grimF.ecole = e.target.value; redraw(); };
  $$('[data-gf]').forEach(i => i.onchange = () => { grimF[i.dataset.gf] = i.checked; redraw(); });
  drawGrimList(); drawGrimDetail();
}
function drawGrimList() {
  const el = $('#gr-list'); if (!el) return;
  const L = grimList();
  $('#gr-count').textContent = `${L.length} sort${L.length > 1 ? 's' : ''}`;
  el.innerHTML = L.slice(0, 400).map(([k, s]) => `<div class="li ${k === grimSel ? 'sel' : ''}" data-gk="${k}"><span class="sp-ico">${SCHOOL_ICON[s.ecole] || '<i class="ico i-etincelle"></i>'}</span>
    <div class="grow"><b>${esc(s.n)}</b> <span class="muted small">${s.niv ? 'niv. ' + s.niv : 'tour'}${s.conc ? ' · C' : ''}${s.rituel ? ' · R' : ''}</span>
    <div class="muted small ellipsis">${esc(s.resume)}</div></div></div>`).join('') || '<div class="muted">Aucun sort.</div>';
  $$('[data-gk]', el).forEach(d => d.onclick = () => { grimSel = d.dataset.gk; drawGrimList(); drawGrimDetail(); });
}
function drawGrimDetail() {
  const el = $('#gr-detail'); if (!el) return;
  const sp = SPELLS.db?.sorts?.[grimSel];
  const c = S.chars[grimFor];
  if (!sp) {
    el.innerHTML = `<div class="card"><h3><i class="ico i-livre"></i> Grimoire</h3><p>${Object.keys(SPELLS.db?.sorts || {}).length} sorts de D&D 5e en français. Les dégâts, sauvegardes et attaques suivent les règles officielles (SRD 5.1) et s'adaptent au niveau de l'emplacement ou du personnage.</p>
      <p class="muted small">${esc(SPELLS.db?.source || '')}</p>
      ${charList().filter(x => Object.values(x.spells || {}).some(l => l?.length)).map(x => `<div class="card" style="margin-top:8px" data-char="${x.id}"><h4>${esc(x.name)} <span class="muted small">DD ${x.spellcasting?.dc ?? '—'} · attaque ${fmod(+x.spellcasting?.attack || 0)}</span></h4>${spellListHTML(x)}</div>`).join('')}</div>`;
    return;
  }
  const has = c && Object.values(c.spells || {}).some(l => (l || []).some(n => findSpell(n, sp.niv)[0] === grimSel));
  el.innerHTML = `<div class="card">${spellCardHTML(grimSel, sp, c)}
    <div class="row" style="margin-top:10px"><span class="small">Ajouter à</span><select id="gr-for">${charList().map(x => `<option value="${x.id}" ${x.id === grimFor ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select>
      <button class="primary" id="gr-add" ${has ? 'disabled' : ''}>${has ? '✔ déjà sur la fiche' : '+ Ajouter à la fiche'}</button></div>
    ${sp.desc ? '' : `<p class="muted small">Résumé uniquement : la description complète est sur AideDD (lien ci-dessus).</p>`}</div>`;
  $('#gr-for').onchange = e => { grimFor = e.target.value; drawGrimDetail(); };
  $('#gr-add').onclick = () => {
    const ch = S.chars[grimFor]; if (!ch) return;
    ch.spells ??= {}; (ch.spells[sp.niv] ||= []).push(sp.n);
    if (sp.niv > 0 && !ch.spellcasting) ch.spellcasting = { ability: 'INT', dc: 8 + ch.prof + mod(ch.stats.INT), attack: ch.prof + mod(ch.stats.INT), slots: {} };
    saveChar(ch); toast(`${esc(sp.n)} ajouté à ${esc(ch.name)}.`); drawGrimDetail();
  };
}
TABS.grimoire = { render: renderGrimoire };
