/* ===== Shops: prices (same rules as server/shop.py) =====
   Magic items: price by rarity (Dungeon Master's Guide 2024), halved for consumables (potions, scrolls, ammunition).
   Classic equipment: its catalog price. A shop changes prices with its `mod` (%) and buys back at `sellRate` (%). */
'use strict';

const RARITY_PRICE = { 'commun': 100, 'peu commun': 400, 'rare': 4000, 'très rare': 40000, 'légendaire': 200000 };
const COIN_GP = { pc: .01, pa: .1, pe: .5, po: 1, pp: 10 };

/* '25 po', '5 pa', '1 000 po' -> gold pieces (null when there is no price) */
function parseCost(s) {
  const m = String(s || '').match(/^\s*([\d\s .,]+)\s*(pc|pa|pe|po|pp)\b/i);
  if (!m) return null;
  const n = parseFloat(m[1].replace(/[\s ]/g, '').replace(',', '.'));
  return isNaN(n) ? null : Math.round(n * COIN_GP[m[2].toLowerCase()] * 100) / 100;
}
const isConsumable = d => /^(potion|parchemin)/i.test(d?.cat || '') || /munition/i.test(d?.cat || '');
/* base value (gp) of a shop or inventory entry, null when unknown */
function itemBaseValue(e) {
  if (typeof e.value === 'number') return e.value;
  const d = itemDef(e.ref) || {}, base = itemDef(e.base || d.base) || {}, rarity = e.rarity || d.rarity;
  if (RARITY_PRICE[rarity]) return RARITY_PRICE[rarity] / (isConsumable(d) ? 2 : 1) + (parseCost(base.cost) || 0);
  if (rarity) return null;   // artifact, "variable": no market price
  return parseCost(e.cost || d.cost);
}
/* rounded like a merchant would */
function nicePrice(v) {
  if (v == null || isNaN(v)) return null;
  v = Math.max(0, +v);
  if (v < 1) return Math.round(Math.max(v, .01) * 100) / 100;
  if (v < 10) return Math.round(v * 10) / 10;
  if (v < 100) return Math.round(v);
  if (v < 1000) return Math.round(v / 5) * 5;
  if (v < 10000) return Math.round(v / 10) * 10;
  return Math.round(v / 50) * 50;
}
const shopUnitPrice = (shop, it) => typeof it.price === 'number' ? it.price : typeof it.value === 'number' ? nicePrice(it.value * (1 + (+shop.mod || 0) / 100)) : null;
const shopResale = (shop, v) => v == null ? null : nicePrice(v * (shop.sellRate ?? 50) / 100);
/* 12.5 -> "12 po 5 pa" */
function fmtPrice(v) {
  if (v == null || v === '' || isNaN(v)) return '?';
  const c = Math.round(+v * 100), po = Math.floor(c / 100), pa = Math.floor(c % 100 / 10), pc = c % 10;
  return [po && po.toLocaleString('fr-FR') + ' po', pa && pa + ' pa', pc && pc + ' pc'].filter(Boolean).join(' ') || '0 po';
}
const SHOP_STATUS = { pending: ['En attente', 'st-pending'], accepted: ['Acceptée', 'st-accepted'], refused: ['Refusée', 'st-refused'], cancelled: ['Annulée', 'st-cancelled'] };
const shopStatusChip = r => { const [l, c] = SHOP_STATUS[r.status] || [r.status, '']; return `<span class="shop-st ${c}">${l}${r.status === 'accepted' && r.final != null ? ' · ' + fmtPrice(r.final) : ''}</span>`; };
