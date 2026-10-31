/* ===== Items: catalog (classic equipment + magic items), inventories, armor class and weapon attacks =====
   Catalog: /data/catalog/items.json (built from dd2024.fr and AideDD) + the GM's own items (S.items).
   A character's inventory: c.inventory = [{ uid, ref, name, desc, img, qty, equipped, attuned, charges: {cur, max}, base, notes }].
   `ref` points to a catalog item ('eq-…', 'mi-…', or a GM item 'cu-…'); the entry's own fields override it.
   The server applies the same rules (server/items.py) when a player equips an item. */
'use strict';

const ITEMS = { db: null, byId: {}, ready: null };
const MAX_ATTUNED = 3;
function loadItems() {
  if (!ITEMS.ready) ITEMS.ready = fetch('/data/catalog/items.json').then(r => r.ok ? r.json() : []).then(list => {
    ITEMS.db = list; list.forEach(x => ITEMS.byId[x.id] = x); return list;
  }).catch(e => { console.error(e); ITEMS.db = []; });
  return ITEMS.ready;
}
/* catalog item of an inventory entry (official or GM item) */
const itemDef = ref => (ref && (ITEMS.byId[ref] || S.items?.[ref])) || null;
/* merged view of an inventory entry: catalog values + entry overrides */
function invView(e) {
  const d = itemDef(e.ref) || {}, base = itemDef(e.base || d.base) || {};
  return {
    ...d, ...e, def: d,
    name: e.name || d.name || '?', desc: e.desc || d.desc || '', img: e.img || d.img || base.img || '',
    kind: d.kind || e.kind || 'gear', cat: d.cat || e.cat || '',
    weapon: e.weapon || d.weapon || base.weapon || null, armor: e.armor || d.armor || base.armor || null,
    mech: { ...(d.mech || {}), ...(e.mech || {}) }, attune: e.attune ?? d.attune ?? false,
  };
}
const isWeapon = v => !!v.weapon;
const isShield = v => v.armor?.type === 'shield';
const isArmor = v => !!v.armor && v.armor.type !== 'shield';
/* a magic bonus only counts when the item is attuned (if it requires attunement) */
const itemActive = v => v.equipped && (!v.attune || v.attuned);

/* armor class from the equipped items (null when the GM forces a value with caManual) */
function computeAC(c) {
  const inv = (c.inventory || []).map(invView), m = s => mod(c.stats?.[s]);
  const armor = inv.find(v => v.equipped && isArmor(v)), shield = inv.find(v => v.equipped && isShield(v));
  let ac, how;
  if (armor) {
    const a = armor.armor, dex = a.type === 'light' ? m('DEX') : a.type === 'medium' ? Math.min(m('DEX'), a.dexMax ?? 2) : 0;
    ac = a.base + dex + (itemActive(armor) ? +armor.mech.ac || 0 : 0); how = armor.name;
  } else {
    const cls = classOf(c), feats = (c.features || []).map(f => normTxt(f.name));
    if (cls === 'barbare' || feats.some(f => f.startsWith('defense sans armure')) && cls !== 'moine') { ac = 10 + m('DEX') + m('CON'); how = t('Unarmored Defense'); }
    else if (cls === 'moine' && !shield) { ac = 10 + m('DEX') + m('SAG'); how = t('Unarmored Defense'); }
    else { ac = 10 + m('DEX'); how = t('no armor'); }
  }
  if (shield) ac += 2 + (itemActive(shield) ? +shield.mech.ac || 0 : 0);
  inv.forEach(v => { if (v !== armor && v !== shield && itemActive(v) && v.mech.ac && !isArmor(v) && !isShield(v) && (!v.mech.noArmor || !armor && !shield)) ac += +v.mech.ac; });
  return { ac, how: how + (shield ? ' + ' + shield.name : '') };
}
/* bonus to every saving throw (cloak / ring of protection…) */
function itemSaveBonus(c) { return (c.inventory || []).map(invView).filter(v => itemActive(v) && v.mech.save).reduce((s, v) => s + (+v.mech.save || 0), 0); }

/* weapon attacks of the equipped weapons: { name, bonus, damage, type, item, auto: true } */
function weaponAttack(c, v) {
  const w = v.weapon, m = s => mod(c.stats?.[s]);
  const ab = w.finesse ? (m('DEX') > m('FOR') ? 'DEX' : 'FOR') : w.melee === false ? 'DEX' : 'FOR';
  const mg = itemActive(v) ? v.mech : {}, am = m(ab);
  const bonus = (+c.prof || 2) + am + (+mg.atk || 0);
  const dmgBonus = am + (+mg.dmg || 0);
  return { name: v.name, bonus, damage: w.dmg + (dmgBonus ? fmod(dmgBonus) : ''), type: w.type + (w.versatile ? ` (${t('two hands')} ${w.versatile})` : ''), item: v.uid, auto: true };
}
/* replaces the automatic attacks with those of the equipped weapons (manual attacks are kept) */
function syncAttacks(c) {
  const inv = (c.inventory || []).map(invView);
  const manual = (c.attacks || []).filter(a => !a.auto);
  const linked = new Set(manual.map(a => a.item).filter(Boolean));
  const auto = inv.filter(v => v.equipped && isWeapon(v) && !linked.has(v.uid)).map(v => weaponAttack(c, v));
  c.attacks = [...manual, ...auto];
}
/* to call after any change of the inventory (GM side; the server does the same for players) */
function applyInventory(c) {
  c.inventory ||= [];
  syncAttacks(c);
  c.saveItemBonus = itemSaveBonus(c);
  if (c.caManual == null || c.caManual === '') c.ca = computeAC(c).ac;
  else c.ca = +c.caManual;
}
const attunedCount = c => (c.inventory || []).filter(e => e.attuned).length;
function newInvEntry(def, extra = {}) {
  const e = { uid: uid('it'), ref: def?.id || null, qty: 1, equipped: false, attuned: false, ...extra };
  if (def?.mech?.charges) e.charges = { cur: def.mech.charges, max: def.mech.charges };
  if (def?.id?.startsWith('cu-')) Object.assign(e, { name: def.name, desc: def.desc, img: def.img, kind: def.kind, weapon: def.weapon, armor: def.armor, mech: def.mech, attune: def.attune });
  return e;
}
/* can the item be equipped (worn / wielded)? */
const equippable = v => isWeapon(v) || !!v.armor || v.kind === 'magic' || ['gear', 'tool'].includes(v.kind) && /focaliseur|vêtement|bijou/i.test(v.cat || '');

const RARITY_COLOR = { 'commun': '#8a8a8a', 'peu commun': '#2e8b3e', 'rare': '#2f5fb3', 'très rare': '#7b3fb0', 'légendaire': '#c27a12', 'artéfact': '#b3261e' };
const ITEM_ICON = { weapon: 'swords', armor: 'shield', shield: 'shield', gear: 'bag', tool: 'tools', magic: 'sparkle' };
const itemIcon = v => `<i class="ico i-${ITEM_ICON[v.kind] || 'bag'}"></i>`;
/* small thumbnail used in lists */
const itemThumb = (v, size = 40) => v.img ? `<span class="it-thumb" style="width:${size}px;height:${size}px;background-image:url('${esc(v.img)}')"></span>`
  : `<span class="it-thumb it-empty" style="width:${size}px;height:${size}px">${itemIcon(v)}</span>`;
/* item card: picture, category line, numbers, description */
function itemCardHTML(v, opts = {}) {
  const w = v.weapon, a = v.armor, mg = v.mech || {};
  const lines = [];
  if (w) lines.push(`<b>${t('Damage')}</b> ${esc(w.dmg)} ${esc(w.type)}${w.versatile ? ` (${t('two hands')} ${esc(w.versatile)})` : ''}${w.range ? ` · ${t('range')} ${w.range.normal}/${w.range.long} m` : ''}${w.mastery ? ` · ${t('mastery')} ${esc(w.mastery)}` : ''}`);
  if (a) lines.push(a.type === 'shield' ? `<b>${t('AC')}</b> +2` : `<b>${t('AC')}</b> ${a.base}${a.type === 'light' ? ' + DEX' : a.type === 'medium' ? ` + DEX (max ${a.dexMax ?? 2})` : ''}${a.str ? ` · ${t('STR')} ${a.str}` : ''}${a.stealthDis ? ` · ${t('stealth disadvantage')}` : ''}`);
  const bon = [mg.atk && `+${mg.atk} ${t('attack and damage')}`, mg.ac && `+${mg.ac} ${t('AC')}`, mg.save && `+${mg.save} ${t('saving throws')}`, mg.charges && `${mg.charges} ${t('charges')}`].filter(Boolean);
  return `<div class="item-card"><div class="ic-pic ${v.img ? '' : 'noimg'}" style="${v.img ? `background-image:url('${esc(v.img)}')` : ''}">${v.img ? '' : itemIcon(v)}</div>
    <div class="ic-body"><h3>${esc(v.name)}</h3>
      <div class="ic-sub">${esc(v.typeLine || v.cat || '')}${v.rarity ? ` <span class="rar" style="--rc:${RARITY_COLOR[v.rarity] || '#888'}">${esc(v.rarity)}</span>` : ''}${v.attune ? ` <span class="tag">${t('attunement')}${typeof v.attune === 'string' ? ' ' + esc(v.attune) : ''}</span>` : ''}</div>
      ${lines.map(l => `<div class="small">${l}</div>`).join('')}${bon.length ? `<div class="small ic-bonus">${bon.join(' · ')}</div>` : ''}
      ${v.cost || v.weight != null ? `<div class="muted small">${[v.cost && `${t('Price')} ${esc(v.cost)}`, v.weight != null && v.weight !== '' && `${t('Weight')} ${String(v.weight).replace('.', ',')} kg`].filter(Boolean).join(' · ')}</div>` : ''}
      ${opts.extra || ''}
      <div class="md-view small ic-desc">${md(v.desc || '')}</div>
      ${v.notes ? `<div class="small"><b>${t('Notes')}</b> ${esc(v.notes)}</div>` : ''}
      <div class="muted small">${esc(v.source || '')}${v.aidedd ? ` · <a href="${esc(v.aidedd)}" target="_blank" rel="noopener">AideDD</a>` : ''}</div></div></div>`;
}
