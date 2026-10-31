/* ===== Equipment: catalog of classic equipment and magic items, give items to characters ===== */
'use strict';

let eqSel = null, eqFor = null;
const eqF = { q: '', side: 'classic', cat: '', rarity: '', source: '', attune: false };
const RARITIES = ['commun', 'peu commun', 'rare', 'très rare', 'légendaire', 'artéfact'];
const ITEM_KINDS = [['weapon', 'Weapon'], ['armor', 'Armor'], ['shield', 'Shield'], ['gear', 'Adventuring gear'], ['tool', 'Tool'], ['magic', 'Magic item']];

/* catalog (official + the GM's items), as views */
function eqAll() { return [...(ITEMS.db || []), ...Object.values(S.items || {})]; }
const eqIsMagic = x => x.kind === 'magic' || !!x.rarity;
function eqList() {
  const q = spellKey(eqF.q);
  return eqAll().filter(x => (eqF.side === 'magic') === eqIsMagic(x) &&
    (!q || spellKey(x.name).includes(q) || spellKey(x.vo).includes(q) || spellKey(x.cat).includes(q)) &&
    (!eqF.cat || x.cat === eqF.cat) && (!eqF.rarity || x.rarity === eqF.rarity) && (!eqF.source || x.source === eqF.source) && (!eqF.attune || x.attune))
    .sort((a, b) => eqF.side === 'magic' ? a.name.localeCompare(b.name) : (a.cat || '').localeCompare(b.cat || '') || a.name.localeCompare(b.name));
}
function renderEquipment(main) {
  const side = eqAll().filter(x => (eqF.side === 'magic') === eqIsMagic(x));
  const cats = [...new Set(side.map(x => x.cat).filter(Boolean))].sort();
  const sources = [...new Set(side.map(x => x.source).filter(Boolean))].sort();
  if (!S.chars[eqFor]) eqFor = charList()[0]?.id || null;
  main.innerHTML = `<div class="split"><div class="side-list" style="width:360px">
      <div class="seg eq-seg">${[['classic', '<i class="ico i-swords"></i> ' + t('Equipment')], ['magic', '<i class="ico i-sparkle"></i> ' + t('Magic items')]].map(([k, l]) => `<button data-side="${k}" class="${eqF.side === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      <div class="row"><input id="eq-q" placeholder="${t('Search an item…')}" value="${esc(eqF.q)}" style="flex:1"><button class="primary" id="eq-new" title="${t('Create your own item')}">+ ${t('New')}</button></div>
      <div class="row"><select id="eq-cat" style="flex:1"><option value="">${t('All categories')}</option>${cats.map(c => `<option ${eqF.cat === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
        ${eqF.side === 'magic' ? `<select id="eq-rar"><option value="">${t('All rarities')}</option>${RARITIES.map(r => `<option ${eqF.rarity === r ? 'selected' : ''}>${r}</option>`).join('')}</select>` : ''}</div>
      ${eqF.side === 'magic' ? `<div class="row"><select id="eq-src" style="flex:1"><option value="">${t('All sources')}</option>${sources.map(s => `<option ${eqF.source === s ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select>
        <label class="chk small"><input type="checkbox" id="eq-att" ${eqF.attune ? 'checked' : ''}> ${t('attunement')}</label></div>` : ''}
      <div id="eq-count" class="muted small"></div>
      <div id="eq-list" class="list" style="max-height:calc(100vh - 260px);overflow:auto"></div></div>
    <div class="sheet" id="eq-detail"></div></div>`;
  $$('[data-side]').forEach(b => b.onclick = () => { eqF.side = b.dataset.side; eqF.cat = eqF.rarity = eqF.source = ''; rerender(); });
  $('#eq-q').oninput = e => { eqF.q = e.target.value; drawEqList(); };
  $('#eq-cat').onchange = e => { eqF.cat = e.target.value; drawEqList(); };
  $('#eq-rar') && ($('#eq-rar').onchange = e => { eqF.rarity = e.target.value; drawEqList(); });
  $('#eq-src') && ($('#eq-src').onchange = e => { eqF.source = e.target.value; drawEqList(); });
  $('#eq-att') && ($('#eq-att').onchange = e => { eqF.attune = e.target.checked; drawEqList(); });
  $('#eq-new').onclick = () => itemForm(null);
  drawEqList(); drawEqDetail();
}
function drawEqList() {
  const el = $('#eq-list'); if (!el) return;
  const L = eqList();
  $('#eq-count').textContent = t('{n} items', { n: L.length });
  let last = null;
  el.innerHTML = L.map(x => {
    const head = eqF.side === 'classic' && x.cat !== last ? `<div class="sp-lvl">${esc(x.cat || '')}</div>` : ''; last = x.cat;
    const sub = x.weapon && !eqIsMagic(x) ? `${x.weapon.dmg} ${x.weapon.type}` : x.armor && !eqIsMagic(x) ? (x.armor.type === 'shield' ? `${t('AC')} +2` : `${t('AC')} ${x.armor.base}`) : eqIsMagic(x) ? `${x.cat}${x.attune ? ' · ' + t('attunement') : ''}` : x.cost || '';
    return head + `<div class="li ${x.id === eqSel ? 'sel' : ''}" data-eq="${esc(x.id)}">${itemThumb(x, 36)}
      <div class="grow"><b>${esc(x.name)}</b>${x.id.startsWith('cu-') ? ` <span class="tag">${t('mine')}</span>` : ''}<div class="muted small ellipsis">${esc(sub)}</div></div>
      ${x.rarity ? `<span class="rar small" style="--rc:${RARITY_COLOR[x.rarity] || '#888'}">${esc(x.rarity)}</span>` : ''}</div>`;
  }).join('') || `<div class="muted">${t('No results.')}</div>`;
  $$('[data-eq]', el).forEach(d => d.onclick = () => { eqSel = d.dataset.eq; drawEqList(); drawEqDetail(); });
}
/* weapons / armors a generic magic item can be made of ("Arme (n'importe quelle épée)") */
function baseChoices(x) {
  if (!x.baseName || x.base) return null;
  const isArm = /^armure/i.test(x.cat || '') || /armure/i.test(x.typeLine || '');
  return (ITEMS.db || []).filter(y => isArm ? y.kind === 'armor' || y.kind === 'shield' : y.kind === 'weapon');
}
function drawEqDetail() {
  const el = $('#eq-detail'); if (!el) return;
  const x = itemDef(eqSel);
  if (!x) {   // overview: who carries what
    el.innerHTML = `<div class="card"><h3><i class="ico i-bag"></i> ${t('Equipment')}</h3>
      <p>${t('{a} classic items (dd2024.fr, SRD 5.2.1) and {b} magic items (AideDD). Pick an item to see it and give it to a character.', { a: (ITEMS.db || []).filter(y => !eqIsMagic(y)).length, b: (ITEMS.db || []).filter(eqIsMagic).length })}</p></div>
      ${charList().map(c => `<div class="card"><h4>${avatarHTML(c, 28)} ${esc(c.name)} <span class="muted small">${t('AC')} ${c.ca} · ${t('{n} attuned', { n: attunedCount(c) })}/${MAX_ATTUNED}</span>
        <button class="small right" data-tochar="${c.id}">${t('Inventory')} ›</button></h4>
        <div class="row" style="flex-wrap:wrap;gap:6px">${(c.inventory || []).map(invView).map(v => `<span class="inv-chip ${v.equipped ? 'eq' : ''}" title="${esc(v.name)}">${itemThumb(v, 22)} ${esc(v.name)}${v.qty > 1 ? ' ×' + v.qty : ''}</span>`).join('') || `<span class="muted small">${t('Nothing yet.')}</span>`}</div></div>`).join('')}`;
    $$('[data-tochar]', el).forEach(b => b.onclick = () => { selChar = b.dataset.tochar; charSub = 'notes'; go('characters'); });
    return;
  }
  const bases = baseChoices(x);
  el.innerHTML = `<div class="card">${itemCardHTML(invView({ ref: x.id }))}
    <div class="row" style="margin-top:10px;flex-wrap:wrap"><span class="small">${t('Give to')}</span><select id="eq-for">${charList().map(c => `<option value="${c.id}" ${c.id === eqFor ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>
      <input id="eq-qty" type="number" value="1" min="1" style="width:56px" title="${t('Quantity')}">
      ${bases ? `<select id="eq-base" title="${t('Weapon / armor it is made of')}"><option value="">${esc(x.baseName)}…</option>${bases.map(b => `<option value="${b.id}">${esc(b.name)}</option>`).join('')}</select>` : ''}
      ${x.mech?.plusChoice ? `<select id="eq-plus" title="${t('Magic bonus')}">${[1, 2, 3].map(n => `<option value="${n}">+${n}</option>`).join('')}</select>` : ''}
      <button class="primary" id="eq-give"><i class="ico i-handshake"></i> ${t('Give')}</button>
      ${x.id.startsWith('cu-') ? `<button id="eq-edit"><i class="ico i-quill"></i> ${t('Edit')}</button><button class="danger" id="eq-del"><i class="ico i-trash"></i></button>` : ''}</div></div>`;
  $('#eq-for').onchange = e => { eqFor = e.target.value; };
  $('#eq-give').onclick = () => {
    const c = S.chars[$('#eq-for').value]; if (!c) return;
    const base = $('#eq-base')?.value, qty = Math.max(1, num($('#eq-qty').value, 1)), plus = +($('#eq-plus')?.value || 0);
    const extra = { qty, ...(base ? { base } : {}) };
    if (plus) {   // "Arme +1, +2 ou +3": the chosen bonus, and a name such as "Épée longue +2"
      extra.mech = x.mech.ac != null ? { ac: plus } : { atk: plus, dmg: plus };
      extra.name = `${base ? itemDef(base).name : x.name.replace(/\s*\+1.*$/, '')} +${plus}`;
    } else if (base) extra.name = `${x.name} (${itemDef(base).name.toLowerCase()})`;
    giveItem(c, x, extra);
    toast(`<i class="ico i-handshake"></i> ${t('{item} given to {name}.', { item: esc(x.name), name: esc(c.name) })}`);
  };
  $('#eq-edit') && ($('#eq-edit').onclick = () => itemForm(x));
  $('#eq-del') && ($('#eq-del').onclick = () => confirmBox(t('Delete {name} from the catalog? (Characters keep their copy.)', { name: esc(x.name) }), async () => {
    delete S.items[x.id]; await api('DELETE', '/api/item/' + x.id); eqSel = null; rerender();
  }));
}
/* adds an item to a character (stacks classic items of the same kind) */
function giveItem(c, def, extra = {}) {
  c.inventory ||= [];
  const same = !eqIsMagic(def) && c.inventory.find(e => e.ref === def.id && !e.name && !e.base);
  if (same) same.qty = (+same.qty || 1) + (extra.qty || 1);
  else c.inventory.push(newInvEntry(def, extra));
  applyInventory(c); saveChar(c);
  logInfo(`<i class="ico i-handshake"></i> ${t('{name} receives {item}', { name: `<b>${esc(c.name)}</b>`, item: `<b>${esc(def.name)}</b>${(extra.qty || 1) > 1 ? ' ×' + extra.qty : ''}` })}`);
}
/* the GM's own item (homebrew): stored in data/items/ */
function itemForm(x) {
  const it = x ? JSON.parse(JSON.stringify(x)) : { id: 'cu-' + Math.random().toString(36).slice(2, 9), kind: eqF.side === 'magic' ? 'magic' : 'gear', name: '', cat: '', desc: '', img: '', mech: {} };
  modal(`<h3><i class="ico i-quill"></i> ${x ? t('Edit the item') : t('New item')}</h3>
    <div class="row" style="align-items:flex-start;gap:12px"><div class="portrait ${it.img ? 'has' : ''}" id="if-img" style="width:120px;height:120px;${it.img ? `background-image:url('${esc(it.img)}')` : ''}">${t('Drop an image')}</div>
    <div class="col grow"><label class="field"><span>${t('Name')}</span><input id="if-name" value="${esc(it.name)}"></label>
      <div class="row"><label class="field"><span>${t('Kind')}</span><select id="if-kind">${ITEM_KINDS.map(([k, l]) => `<option value="${k}" ${it.kind === k ? 'selected' : ''}>${t(l)}</option>`).join('')}</select></label>
        <label class="field"><span>${t('Category')}</span><input id="if-cat" value="${esc(it.cat || '')}"></label>
        <label class="field"><span>${t('Rarity')}</span><select id="if-rar"><option value="">—</option>${RARITIES.map(r => `<option ${it.rarity === r ? 'selected' : ''}>${r}</option>`).join('')}</select></label></div>
      <div class="row"><label class="field"><span>${t('Damage')}</span><input id="if-dmg" value="${esc(it.weapon?.dmg || '')}" placeholder="1d8" style="width:70px"></label>
        <label class="field"><span>${t('Damage type')}</span><input id="if-dt" value="${esc(it.weapon?.type || '')}" style="width:90px"></label>
        <label class="chk small"><input type="checkbox" id="if-fin" ${it.weapon?.finesse ? 'checked' : ''}> finesse</label>
        <label class="chk small"><input type="checkbox" id="if-rng" ${it.weapon && it.weapon.melee === false ? 'checked' : ''}> ${t('ranged')}</label></div>
      <div class="row"><label class="field"><span>${t('Base AC (armor)')}</span><input id="if-ac" type="number" value="${it.armor?.base ?? ''}" style="width:60px"></label>
        <label class="field"><span>${t('Armor type')}</span><select id="if-at"><option value="">—</option>${[['light', t('light')], ['medium', t('medium')], ['heavy', t('heavy')], ['shield', t('Shield')]].map(([k, l]) => `<option value="${k}" ${it.armor?.type === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label class="field"><span>${t('Magic bonus')}</span><input id="if-plus" type="number" value="${it.mech?.atk || it.mech?.ac || ''}" style="width:50px"></label>
        <label class="field"><span>${t('Charges')}</span><input id="if-ch" type="number" value="${it.mech?.charges || ''}" style="width:50px"></label>
        <label class="chk small"><input type="checkbox" id="if-att" ${it.attune ? 'checked' : ''}> ${t('attunement')}</label></div></div></div>
    <label class="field"><span>${t('Description')} <span class="muted small">(${t('markdown, **bold**')})</span></span><textarea id="if-desc" rows="7">${esc(it.desc || '')}</textarea></label>
    <div class="actions"><button data-close>${t('Cancel')}</button><button class="primary" id="if-ok">${t('Save')}</button></div>`, (box, close) => {
    dropImage($('#if-img', box), r => { it.img = r.url; const p = $('#if-img', box); p.style.backgroundImage = `url('${r.url}')`; p.classList.add('has'); });
    $('#if-ok', box).onclick = () => {
      const v = id => $(id, box).value.trim(), plus = num(v('#if-plus')), kind = v('#if-kind');
      Object.assign(it, { name: v('#if-name') || t('Item'), kind, cat: v('#if-cat') || t(ITEM_KINDS.find(k => k[0] === kind)[1]), rarity: v('#if-rar'), desc: $('#if-desc', box).value, attune: $('#if-att', box).checked });
      it.weapon = v('#if-dmg') ? { dmg: v('#if-dmg'), type: v('#if-dt'), finesse: $('#if-fin', box).checked, melee: !$('#if-rng', box).checked, props: [] } : null;
      it.armor = v('#if-at') ? { type: v('#if-at'), base: v('#if-at') === 'shield' ? 2 : num(v('#if-ac'), 10), dexMax: v('#if-at') === 'medium' ? 2 : v('#if-at') === 'heavy' ? 0 : null } : null;
      it.mech = {}; if (plus) it.weapon ? (it.mech.atk = it.mech.dmg = plus) : (it.mech.ac = plus); if (num(v('#if-ch'))) it.mech.charges = num(v('#if-ch'));
      it.source = t('My items');
      S.items[it.id] = it; saveItem(it); eqSel = it.id; if (kind === 'magic' || it.rarity) eqF.side = 'magic'; close(); rerender();
    };
  });
}
TABS.equipment = { render: renderEquipment };
