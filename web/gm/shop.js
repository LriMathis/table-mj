/* ===== GM tab "Magasin": the campaign's shops, random generator, stock, and the players' purchase / resale requests =====
   Data in campaign.json "shops" (see server/shop.py). One shop at a time can be open to the players; they only see the name,
   the picture, the price and the stock of the items, and send requests that the GM accepts (at the price they set) or refuses. */
'use strict';

const SH = { sel: store.get('gt-shop-sel', null) };
const SHOPS = () => { const D = S.camp.shops ??= {}; D.list ??= []; D.requests ??= []; D.open ??= null; return D; };
const shopById = id => SHOPS().list.find(s => s.id === id);
const pendingReqs = () => SHOPS().requests.filter(r => r.status === 'pending');
const pickOne = a => a[Math.floor(Math.random() * a.length)];
const rint = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
function shopSave() { saveCamp(); rerender(); updateShopBadge(); }

/* ---------------------------------------------------------------- data for the generator */
const SHOP_CATS = [['weapon', 'Armes'], ['armor', 'Armures et boucliers'], ['potion', 'Potions et élixirs'], ['scroll', 'Parchemins de sort'],
  ['wand', 'Anneaux, baguettes et bâtons'], ['wondrous', 'Objets merveilleux'], ['gear', "Équipement d'aventurier"], ['tool', 'Outils et instruments']];
const SHOP_PRESETS = {
  forge: { label: 'Forge et armurerie', cats: ['weapon', 'armor'], names: ['La Forge de {n}', "L'Enclume ardente", "Au Marteau d'acier", "La Lame et l'Écu"] },
  apothicaire: { label: 'Apothicaire / alchimiste', cats: ['potion'], names: ["L'Alambic de {n}", 'Les Fioles de {n}', 'Au Mortier fêlé', 'La Cornue bleue'] },
  arcanes: { label: "Échoppe d'arcanes", cats: ['scroll', 'wand', 'wondrous', 'potion'], names: ['Les Arcanes de {n}', 'La Tour aux mille grimoires', "Au Parchemin d'or", "L'Œil du mage"] },
  bazar: { label: "Bazar d'aventurier", cats: ['gear', 'tool', 'weapon', 'armor', 'potion'], names: ['Le Bazar de {n}', "Tout pour l'aventure", 'Au Sac sans fond', 'La Halte du voyageur'] },
  curiosites: { label: 'Cabinet de curiosités', cats: ['wondrous', 'wand'], names: ['Les Curiosités de {n}', 'Le Cabinet des merveilles', 'Au Bric-à-brac enchanté', 'La Malle aux secrets'] },
  custom: { label: 'Personnalisé', cats: [], names: ['La Boutique de {n}', 'Chez {n}', "L'Échoppe de {n}"] },
};
const RARITY_RANK = { 'commun': 1, 'peu commun': 2, 'rare': 3, 'très rare': 4, 'légendaire': 5 };
const RARITY_WEIGHT = { 1: 10, 2: 6, 3: 3, 4: 1.2, 5: .4 };
const RARITY_LIST = Object.keys(RARITY_RANK);
/* items of variable rarity that a merchant can sell: [name, rarity] */
const SHOP_VARIANTS = {
  'mi-potion-de-guerison': [['Potion de guérison', 'commun'], ['Potion de guérison supérieure', 'peu commun'], ['Potion de guérison majeure', 'rare'], ['Potion de guérison suprême', 'très rare']],
  'mi-potion-de-force-de-geant': [['Potion de force de géant des collines', 'peu commun'], ['Potion de force de géant du givre', 'rare'], ['Potion de force de géant de pierre', 'rare'],
    ['Potion de force de géant du feu', 'rare'], ['Potion de force de géant des nuages', 'très rare'], ['Potion de force de géant des tempêtes', 'légendaire']],
};
/* "+1, +2 or +3" items: rarity of each bonus */
const PLUS_RARITY = {
  'mi-arme-1-2-ou-3': ['peu commun', 'rare', 'très rare'], 'mi-munition-1-2-ou-3': ['peu commun', 'rare', 'très rare'],
  'mi-bouclier-1-2-ou-3': ['peu commun', 'rare', 'très rare'], 'mi-baguette-du-mage-de-guerre-1-2-ou-3': ['peu commun', 'rare', 'très rare'],
  'mi-armure-1-2-ou-3': ['rare', 'très rare', 'légendaire'],
};
const SCROLL_ID = 'mi-parchemin-de-sort';
const SCROLL_RARITY = ['commun', 'commun', 'peu commun', 'peu commun', 'rare', 'rare', 'très rare', 'très rare', 'très rare', 'légendaire'];

const NPC_FIRST = ['Aldric', 'Berthe', 'Corwin', 'Dagna', 'Elric', 'Fenna', 'Gorim', 'Hilda', 'Isolde', 'Jasper', 'Kethra', 'Lothar', 'Mirela', 'Nob', 'Orsik',
  'Pell', 'Quillon', 'Rosalind', 'Sorrel', 'Tibalt', 'Ulla', 'Varis', 'Wendel', 'Ysolde', 'Zéphyrine', 'Barnabé', 'Grisemine', 'Tobias', 'Oswin', 'Maëlis'];
const NPC_LAST = ['Brassefer', "Doigts-d'Or", 'Tisonnier', 'Courtepaille', 'Belle-Écaille', 'Fendroc', 'Pièce-Fine', 'Trois-Bourses', 'Lanterne', 'Mille-Poches',
  'Cuivreclair', 'Sourcil-Gris', 'Vif-Argent', 'Pied-Léger', 'Barbe-Rousse'];
const NPC_RACES = ['Humain', 'Nain', 'Elfe', 'Halfelin', 'Gnome', 'Demi-orc', 'Tieffelin', 'Drakéide', 'Demi-elfe', 'Goliath'];
const NPC_LOOKS = ['porte des lunettes rafistolées', "a les doigts tachés d'encre", 'arbore une moustache impeccablement cirée', 'a une cicatrice qui lui barre la joue',
  'parle en mâchonnant une pipe éteinte', 'porte trop de bagues pour être honnête', 'a un perroquet qui répète les prix', 'mord chaque pièce pour vérifier qu\'elle est vraie',
  'a le tablier couvert de brûlures', 'sent fort la cannelle', 'a un œil de verre qui ne regarde jamais au même endroit', 'a un chat obèse qui dort sur le comptoir'];
const NPC_MOOD = {
  sympa: {
    label: 'Sympathique', icon: 'i-heart', mods: [-10, -15, -20], mod: -15, sell: 60,
    traits: ['chaleureux et bavard, adore les aventuriers et leurs histoires', 'généreux, glisse souvent un petit cadeau avec les achats',
      'curieux de tout, pose mille questions sur les voyages du groupe', 'jovial, offre une tisane (ou une bière) à chaque client'],
    greet: ['Entrez, entrez ! Pour des amis, je fais toujours un petit prix.', "Des aventuriers ! Venez, j'ai justement ce qu'il vous faut.",
      'Bienvenue ! Prenez votre temps, regardez, demandez.', 'Ah, enfin des visages sympathiques ! Que puis-je pour vous ?'],
    lines: ['« Pour vous, je descends encore un peu… mais ne le dites à personne. »', '« Revenez me raconter comment ça s\'est passé, hein ? »',
      '« Tenez, je vous offre ça en plus, ça porte bonheur. »', '« Si vous trouvez des curiosités en route, je vous les rachète volontiers. »',
      '« Un conseil d\'ami : évitez la route du nord en ce moment. »'],
  },
  neutre: {
    label: 'Neutre', icon: 'i-scales', mods: [0, 0, 5], mod: 0, sell: 50,
    traits: ['professionnel et pressé, ne parle que de prix', 'poli mais distant, garde un œil sur ses marchandises',
      'pragmatique, marchande par principe mais sans rancune', "discret, ne pose jamais de questions sur l'origine de l'or"],
    greet: ["Bonjour. Regardez, mais ne touchez qu'avec les yeux.", 'Les prix sont affichés. On peut discuter, un peu.',
      'Bienvenue. Je ferme au coucher du soleil.', 'Vous cherchez quelque chose en particulier ?'],
    lines: ['« C\'est le prix. Enfin… on peut peut-être s\'arranger. »', '« Je ne fais pas crédit. »', '« Vous payez, vous emportez. Simple. »',
      '« Ça, c\'est de la qualité. Ça se paie. »', '« Je rachète, mais pas à n\'importe quel prix. »'],
  },
  hostile: {
    label: 'Désagréable', icon: 'i-skull', mods: [20, 30, 50], mod: 30, sell: 35,
    traits: ['méfiant, soupçonne chaque client d\'être un voleur', "cupide, gonfle les prix dès qu'il flaire de l'or",
      'grincheux, déteste les aventuriers « qui ramènent des ennuis »', 'arrogant, méprise ceux qui ne connaissent rien à sa marchandise'],
    greet: ["Quoi ? Achetez ou sortez, je n'ai pas toute la journée.", 'Ne touchez à rien. Tout ce qui est cassé est payé.',
      'Encore des aventuriers… Essuyez vos bottes.', "Vous avez de l'or, au moins ? Alors entrez."],
    lines: ['« Le prix ? Il vient d\'augmenter. »', '« Vous voulez marchander ? Ha ! Allez voir ailleurs. »', '« Mains sur le comptoir, que je les voie. »',
      '« Je n\'achète pas de camelote volée. Enfin… pas à ce prix-là. »', '« Si vous n\'êtes pas content, la porte est derrière vous. »'],
  },
};
const moodOf = s => NPC_MOOD[s?.npc?.attitude] || NPC_MOOD.neutre;
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

function genNpc(att = 'random') {
  if (!NPC_MOOD[att]) att = pickOne(['sympa', 'neutre', 'neutre', 'hostile']);
  const M = NPC_MOOD[att], race = pickOne(NPC_RACES);
  return {
    npc: { name: pickOne(NPC_FIRST) + ' ' + pickOne(NPC_LAST), race, attitude: att, img: '',
      desc: `${race}, ${pickOne(M.traits)} ; ${pickOne(NPC_LOOKS)}.`, greet: pickOne(M.greet), lines: shuffle(M.lines).slice(0, 3).join('\n') },
    mod: pickOne(M.mods), sellRate: M.sell,
  };
}

/* ---------------------------------------------------------------- items */
function shopCat(x) {
  const c = x.cat || '';
  if (eqIsMagic(x)) {
    if (/^arme/i.test(c)) return 'weapon';
    if (/^armure/i.test(c)) return 'armor';
    if (/^potion/i.test(c)) return 'potion';
    if (/^parchemin/i.test(c)) return 'scroll';
    if (/^(anneau|baguette|bâton|sceptre)/i.test(c)) return 'wand';
    return 'wondrous';
  }
  if (x.kind === 'weapon' || /munition/i.test(c)) return 'weapon';
  if (x.kind === 'armor' || x.kind === 'shield') return 'armor';
  if (x.kind === 'tool' || /instrument|^jeu/i.test(c)) return 'tool';
  if (/consommable/i.test(c)) return 'potion';
  return 'gear';
}
/* the weapon / armor a generic magic item is made of ("Arme (toute épée)") */
function pickBase(x) {
  const bn = normTxt(x.baseName || ''), classic = (ITEMS.db || []).filter(y => !eqIsMagic(y));
  let L;
  if (/^armure/i.test(x.cat || '')) {
    if (/bouclier/.test(bn)) return null;
    L = classic.filter(y => y.kind === 'armor');
    const named = L.filter(y => bn.includes(normTxt(y.name)));
    if (named.length) L = named;
    else {
      const types = [/legere/.test(bn) && 'light', /intermediaire/.test(bn) && 'medium', /lourde/.test(bn) && 'heavy'].filter(Boolean);
      if (types.length) L = L.filter(y => types.includes(y.armor?.type));
      if (/pas de peau/.test(bn)) L = L.filter(y => !/peau/i.test(y.name));
    }
  } else {
    if (/munition|fleche/.test(bn)) { L = classic.filter(y => /munition/i.test(y.cat || '')); return L.length ? pickOne(L) : null; }
    L = classic.filter(y => y.kind === 'weapon');
    const groups = [[/epee/, /epee|cimeterre|rapiere/], [/\barc\b/, /^arc\b/], [/arbalete/, /arbalete/], [/hache/, /hache/], [/fleau/, /fleau/], [/maillet/, /maillet/], [/marteau/, /marteau/]]
      .filter(([k]) => k.test(bn)).map(([, re]) => re);
    if (groups.length) L = L.filter(y => groups.some(re => re.test(normTxt(y.name))));
    if (/contondant/.test(bn)) L = L.filter(y => /contondant/.test(y.weapon?.type || ''));
    if (/tranchant/.test(bn)) L = L.filter(y => /tranchant/.test(y.weapon?.type || ''));
    if (/de guerre/.test(bn)) L = L.filter(y => !y.weapon?.simple);
    if (/feu/.test(bn)) L = [];
  }
  return L.length ? pickOne(L) : null;
}
const rankOk = (r, max) => RARITY_RANK[r] && RARITY_RANK[r] <= max;
const weighted = (list, w) => { const tot = list.reduce((s, x) => s + w(x), 0); let r = Math.random() * tot; for (const x of list) { r -= w(x); if (r <= 0) return x; } return list[list.length - 1]; };
/* lowest rarity at which a catalog item can be sold (null: never sold at random) */
function minRank(x) {
  if (!eqIsMagic(x)) return 0;
  if (x.id === SCROLL_ID) return 1;
  if (SHOP_VARIANTS[x.id]) return Math.min(...SHOP_VARIANTS[x.id].map(v => RARITY_RANK[v[1]]));
  if (PLUS_RARITY[x.id]) return RARITY_RANK[PLUS_RARITY[x.id][0]];
  return RARITY_RANK[x.rarity] || null;
}
/* a shop item made from a catalog item, within the maximum rarity (null if impossible) */
function makeShopItem(x, max, opts = {}) {
  const it = { uid: uid('si'), ref: x.id, qty: 1 };
  const magic = eqIsMagic(x), cons = isConsumable(x);
  if (!magic) {
    if (parseCost(x.cost) == null) return null;
    it.qty = x.kind === 'weapon' || x.kind === 'armor' || x.kind === 'shield' ? rint(1, 2) : rint(1, 5);
  } else if (x.id === SCROLL_ID) {
    const lvls = SCROLL_RARITY.map((r, l) => [l, r]).filter(([, r]) => rankOk(r, max));
    if (!lvls.length) return null;
    const [lvl, r] = weighted(lvls, ([, r]) => RARITY_WEIGHT[RARITY_RANK[r]]);
    const sp = pickOne(Object.values(SPELLS.db?.sorts || {}).filter(s => s.niv === lvl));
    if (!sp) return null;
    Object.assign(it, { name: `Parchemin de sort : ${sp.n} (${lvl ? 'niv. ' + lvl : 'tour de magie'})`, spell: sp.n, rarity: r, qty: rint(1, 2) });
  } else if (SHOP_VARIANTS[x.id]) {
    const ok = SHOP_VARIANTS[x.id].filter(v => rankOk(v[1], max));
    if (!ok.length) return null;
    const [name, r] = weighted(ok, v => RARITY_WEIGHT[RARITY_RANK[v[1]]]);
    Object.assign(it, { rarity: r, qty: RARITY_RANK[r] <= 2 ? rint(1, 4) : 1 });
    if (name !== x.name) it.name = name;
  } else if (PLUS_RARITY[x.id]) {
    const ok = PLUS_RARITY[x.id].map((r, i) => [i + 1, r]).filter(([, r]) => rankOk(r, max));
    if (!ok.length) return null;
    const [p, r] = weighted(ok, ([, r]) => RARITY_WEIGHT[RARITY_RANK[r]]);
    const base = x.baseName ? pickBase(x) : null;
    Object.assign(it, { rarity: r, mech: x.mech?.ac != null ? { ac: p } : /baguette/.test(x.id) ? {} : { atk: p, dmg: p },
      name: `${base ? base.name : x.name.replace(/\s*\+1.*$/, '')} +${p}`, qty: cons ? rint(5, 20) : 1 });
    if (base) it.base = base.id;
  } else {
    if (!rankOk(x.rarity, max)) return null;
    if (x.baseName && !x.base) {
      const base = pickBase(x);
      if (base) Object.assign(it, { base: base.id, name: `${x.name} (${base.name.toLowerCase()})` });
    }
    if (cons) it.qty = RARITY_RANK[x.rarity] <= 2 ? rint(1, 4) : 1;
  }
  const v = itemBaseValue(it);
  if (v == null) return null;
  it.value = magic && !opts.exact ? nicePrice(v * (0.9 + Math.random() * 0.2)) : v;   // each merchant has their own idea of the price
  return it;
}
/* random stock with the shop's settings */
function generateStock(gen, n, existing = []) {
  const max = gen.maxRarity === 'none' ? 0 : RARITY_RANK[gen.maxRarity] || 2;
  const pool = {};
  for (const x of eqAll()) {
    if (x.rarity === 'artéfact' || x.rarity === 'variable' && x.id !== SCROLL_ID && !SHOP_VARIANTS[x.id]) continue;
    const r = minRank(x);
    if (r == null || r > max) continue;
    const c = shopCat(x);
    if (!(gen.cats || []).includes(c)) continue;
    (pool[c] ??= { mundane: [], magic: [] })[r ? 'magic' : 'mundane'].push(x);
  }
  const cats = Object.keys(pool), out = [], seen = new Set(existing.map(it => it.name || itemDef(it.ref)?.name));
  if (!cats.length) return out;
  for (let k = 0; out.length < n && k < n * 40; k++) {
    const P = pool[pickOne(cats)], magic = P.magic.length && (!P.mundane.length || Math.random() < (gen.magicShare ?? .5));
    let x;
    if (magic) {
      const ranks = [...new Set(P.magic.map(minRank))];
      const rk = weighted(ranks, r => RARITY_WEIGHT[r]);
      x = pickOne(P.magic.filter(y => minRank(y) === rk));
    } else x = pickOne(P.mundane);
    if (!x) continue;
    const it = makeShopItem(x, max);
    const key = it && (it.name || x.name);
    if (!it || seen.has(key)) continue;
    seen.add(key); out.push(it);
  }
  return sortStock(out);
}
const CAT_ORDER = Object.fromEntries(SHOP_CATS.map(([k], i) => [k, i]));
function sortStock(list) {
  return list.sort((a, b) => {
    const da = itemDef(a.ref) || a, db = itemDef(b.ref) || b;
    return (CAT_ORDER[shopCat(da)] ?? 9) - (CAT_ORDER[shopCat(db)] ?? 9) || (a.value ?? 0) - (b.value ?? 0);
  });
}
function shopItemView(it) {
  const d = itemDef(it.ref) || {}, base = itemDef(it.base || d.base) || {};
  return { d, name: it.name || d.name || '?', img: it.img || d.img || base.img || '', rarity: it.rarity || d.rarity || '', cat: d.cat || (it.ref ? '' : 'objet libre'), kind: d.kind || it.kind || 'gear' };
}
function shopItemCard(it) {
  const v = shopItemView(it);
  return itemCardHTML({ ...invView({ ref: it.ref, base: it.base, name: it.name, mech: it.mech, img: it.img, desc: it.desc, kind: it.kind }), rarity: v.rarity },
    { extra: `<div class="small"><b>Valeur de base</b> ${fmtPrice(it.value)}${it.spell ? ` · <b>Sort</b> ${esc(it.spell)}` : ''}</div>` });
}
const genSummary = g => g ? `${(g.cats || []).map(c => (SHOP_CATS.find(x => x[0] === c) || [, c])[1].toLowerCase()).join(', ') || 'aucun type'} · ${g.maxRarity === 'none' ? 'sans objet magique' : 'jusqu\'à ' + (g.maxRarity || 'peu commun')} · ${g.count || 10} objets` : 'stock composé à la main';

/* ---------------------------------------------------------------- generator dialog */
function genModal(shop) {
  const g = { preset: 'bazar', cats: SHOP_PRESETS.bazar.cats.slice(), maxRarity: 'peu commun', count: 10, mood: 'random', ...(shop?.gen || {}) };
  modal(`<h3><i class="ico i-dice"></i> ${shop ? 'Réglages du hasard — ' + esc(shop.name) : 'Générer un magasin'}</h3>
    <div class="row" style="flex-wrap:wrap"><label class="field"><span>Type de boutique</span><select id="gm-preset">${Object.entries(SHOP_PRESETS).map(([k, p]) => `<option value="${k}" ${g.preset === k ? 'selected' : ''}>${p.label}</option>`).join('')}</select></label>
      ${shop ? '' : `<label class="field grow"><span>Nom du magasin <span class="muted small">(vide = au hasard)</span></span><input id="gm-name"></label>`}</div>
    <div class="field"><span>Ce qu'il vend</span><div class="sh-cats">${SHOP_CATS.map(([k, l]) => `<label class="chk"><input type="checkbox" data-gcat="${k}" ${g.cats.includes(k) ? 'checked' : ''}> ${l}</label>`).join('')}</div></div>
    <div class="row" style="flex-wrap:wrap"><label class="field"><span>Rareté maximale</span><select id="gm-rar"><option value="none" ${g.maxRarity === 'none' ? 'selected' : ''}>aucun objet magique</option>${RARITY_LIST.map(r => `<option ${g.maxRarity === r ? 'selected' : ''}>${r}</option>`).join('')}</select></label>
      <label class="field"><span>Nombre d'objets</span><input id="gm-n" type="number" min="1" max="60" value="${g.count}" style="width:70px"></label>
      <label class="field" title="Quand une catégorie a des objets ordinaires et magiques"><span>Part de magique</span><select id="gm-share">${[[.25, 'peu'], [.5, 'moitié'], [.8, 'beaucoup']].map(([v, l]) => `<option value="${v}" ${(g.magicShare ?? .5) == v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      ${shop ? '' : `<label class="field"><span>Humeur du marchand</span><select id="gm-mood"><option value="random">au hasard</option>${Object.entries(NPC_MOOD).map(([k, m]) => `<option value="${k}" ${g.mood === k ? 'selected' : ''}>${m.label}</option>`).join('')}</select></label>`}</div>
    <div class="muted small">Prix des objets magiques : Guide du Maître 2024 (commun 100 po, peu commun 400 po, rare 4 000 po, très rare 40 000 po, légendaire 200 000 po ; moitié prix pour les consommables), à ±10 % selon le marchand, puis modifiés par son humeur.</div>
    <div class="actions"><button data-close>Annuler</button>${shop ? '<button id="gm-save">Enregistrer</button><button class="primary" id="gm-ok"><i class="ico i-dice"></i> Enregistrer et régénérer le stock</button>' : '<button class="primary" id="gm-ok"><i class="ico i-dice"></i> Générer</button>'}</div>`, (box, close) => {
    $('#gm-preset', box).onchange = e => { const p = SHOP_PRESETS[e.target.value]; if (p.cats.length) $$('[data-gcat]', box).forEach(c => c.checked = p.cats.includes(c.dataset.gcat)); };
    const read = () => ({ preset: $('#gm-preset', box).value, cats: $$('[data-gcat]', box).filter(c => c.checked).map(c => c.dataset.gcat), maxRarity: $('#gm-rar', box).value,
      count: clamp(Math.round(num($('#gm-n', box).value, 10)), 1, 60), magicShare: +$('#gm-share', box).value, mood: $('#gm-mood', box)?.value || g.mood });
    $('#gm-save', box) && ($('#gm-save', box).onclick = () => { shop.gen = read(); close(); shopSave(); });
    $('#gm-ok', box).onclick = () => {
      const ng = read();
      if (!ng.cats.length) return toast('Choisissez au moins un type d\'objet.');
      if (shop) { shop.gen = ng; shop.items = generateStock(ng, ng.count); close(); shopSave(); return; }
      const p = genNpc(ng.mood), first = p.npc.name.split(' ')[0];
      const s = { id: uid('sh'), name: $('#gm-name', box).value.trim() || pickOne(SHOP_PRESETS[ng.preset].names).replace('{n}', first), ...p, visibleTo: null, gen: ng, notes: '', items: generateStock(ng, ng.count) };
      SHOPS().list.unshift(s); SH.sel = s.id; store.set('gt-shop-sel', s.id); close(); shopSave();
      if (s.items.length < ng.count) toast(`Seulement ${s.items.length} objet(s) trouvé(s) avec ces réglages.`, 4000);
    };
  });
}

/* ---------------------------------------------------------------- manual add */
function addItemModal(shop) {
  const F = { q: '', side: 'all', rar: '' };
  modal(`<h3><i class="ico i-bag"></i> Ajouter un objet — ${esc(shop.name)}</h3>
    <div class="row"><input id="sp-q" placeholder="Rechercher un objet…" style="flex:1"><select id="sp-side"><option value="all">Tout</option><option value="classic">Équipement</option><option value="magic">Objets magiques</option></select>
      <select id="sp-rar"><option value="">Toutes raretés</option>${RARITIES.map(r => `<option>${r}</option>`).join('')}</select></div>
    <div id="sp-list" class="list" style="max-height:38vh;overflow:auto;margin:8px 0"></div>
    <div id="sp-cfg"></div>
    <div class="actions"><button data-close>Fermer</button></div>`, (box) => {
    const draw = () => {
      const q = spellKey(F.q);
      const L = eqAll().filter(x => (F.side === 'all' || (F.side === 'magic') === eqIsMagic(x)) && (!F.rar || x.rarity === F.rar) && (!q || spellKey(x.name).includes(q) || spellKey(x.cat).includes(q)))
        .sort((a, b) => a.name.localeCompare(b.name)).slice(0, 150);
      $('#sp-list', box).innerHTML = L.map(x => `<div class="li" data-sp="${esc(x.id)}">${itemThumb(x, 32)}<div class="grow"><b>${esc(x.name)}</b><div class="muted small">${esc(x.cat || '')}</div></div>
        ${x.rarity ? `<span class="rar small" style="--rc:${RARITY_COLOR[x.rarity] || '#888'}">${esc(x.rarity)}</span>` : `<span class="small muted">${esc(x.cost || '')}</span>`}</div>`).join('') || '<div class="muted">Aucun résultat.</div>';
      $$('[data-sp]', box).forEach(d => d.onclick = () => { $$('[data-sp]', box).forEach(o => o.classList.toggle('sel', o === d)); cfg(itemDef(d.dataset.sp)); });
    };
    const cfg = x => {
      const bases = baseChoices(x), plus = PLUS_RARITY[x.id], vars = SHOP_VARIANTS[x.id], scroll = x.id === SCROLL_ID, variable = x.rarity === 'variable' && !vars && !scroll;
      $('#sp-cfg', box).innerHTML = `<div class="card"><div class="row" style="flex-wrap:wrap;align-items:flex-end">
        <b style="flex-basis:100%">${esc(x.name)}</b>
        ${bases ? `<label class="field"><span>Fait à partir de</span><select id="sc-base"><option value="">${esc(x.baseName)}…</option>${bases.map(b => `<option value="${b.id}">${esc(b.name)}</option>`).join('')}</select></label>` : ''}
        ${plus ? `<label class="field"><span>Bonus</span><select id="sc-plus">${plus.map((r, i) => `<option value="${i + 1}">+${i + 1} (${r})</option>`).join('')}</select></label>` : ''}
        ${vars ? `<label class="field"><span>Variante</span><select id="sc-var">${vars.map((v, i) => `<option value="${i}">${esc(v[0])} (${v[1]})</option>`).join('')}</select></label>` : ''}
        ${scroll ? `<label class="field"><span>Sort</span><input id="sc-spell" list="sc-spells" placeholder="nom du sort"><datalist id="sc-spells">${Object.values(SPELLS.db?.sorts || {}).map(s => `<option value="${esc(s.n)}">`).join('')}</datalist></label>` : ''}
        ${variable ? `<label class="field"><span>Rareté (pour le prix)</span><select id="sc-rar">${RARITY_LIST.map(r => `<option>${r}</option>`).join('')}</select></label>` : ''}
        <label class="field"><span>Stock <span class="muted small">(vide = illimité)</span></span><input id="sc-qty" type="number" min="1" value="1" style="width:70px"></label>
        <label class="field"><span>Prix <span class="muted small">(vide = auto)</span></span><input id="sc-price" type="number" min="0" step="any" style="width:100px"></label>
        <button class="primary" id="sc-add">+ Ajouter</button></div></div>`;
      $('#sc-add', box).onclick = () => {
        const it = { uid: uid('si'), ref: x.id };
        const base = $('#sc-base', box)?.value, p = +($('#sc-plus', box)?.value || 0);
        if (base) it.base = base;
        if (p) {
          Object.assign(it, { rarity: plus[p - 1], mech: x.mech?.ac != null ? { ac: p } : /baguette/.test(x.id) ? {} : { atk: p, dmg: p } });
          it.name = `${base ? itemDef(base).name : x.name.replace(/\s*\+1.*$/, '')} +${p}`;
        } else if (base) it.name = `${x.name} (${itemDef(base).name.toLowerCase()})`;
        if (vars) { const v = vars[+$('#sc-var', box).value]; it.rarity = v[1]; if (v[0] !== x.name) it.name = v[0]; }
        if (scroll) {
          const [, sp] = findSpell($('#sc-spell', box).value.trim());
          if (!sp) return toast('Sort introuvable.');
          Object.assign(it, { name: `Parchemin de sort : ${sp.n} (${sp.niv ? 'niv. ' + sp.niv : 'tour de magie'})`, spell: sp.n, rarity: SCROLL_RARITY[sp.niv] });
        }
        if (variable) it.rarity = $('#sc-rar', box).value;
        const q = $('#sc-qty', box).value.trim(), pr = $('#sc-price', box).value.trim();
        it.qty = q === '' ? null : Math.max(1, Math.round(num(q, 1)));
        it.value = itemBaseValue(it);
        if (pr !== '') it.price = Math.max(0, num(pr));
        if (it.value == null && it.price == null) return toast('Cet objet n\'a pas de prix connu : indiquez un prix.');
        shop.items.push(it); saveCamp(); rerender();
        toast(`<b>${esc(it.name || x.name)}</b> ajouté au magasin.`);
      };
    };
    $('#sp-q', box).oninput = e => { F.q = e.target.value; draw(); };
    $('#sp-side', box).onchange = e => { F.side = e.target.value; draw(); };
    $('#sp-rar', box).onchange = e => { F.rar = e.target.value; draw(); };
    draw();
  });
}
/* an item that is not in the catalog (only in this shop) */
function freeItemModal(shop) {
  const it = { uid: uid('si'), ref: null, kind: 'gear', img: '' };
  modal(`<h3>Objet libre — ${esc(shop.name)}</h3>
    <div class="row" style="align-items:flex-start;gap:12px"><div class="portrait" id="fi-img" style="width:110px;height:110px">Déposer une image</div>
      <div class="col grow"><label class="field"><span>Nom</span><input id="fi-name"></label>
        <div class="row"><label class="field"><span>Prix (po)</span><input id="fi-price" type="number" min="0" step="any" style="width:100px"></label>
          <label class="field"><span>Stock <span class="muted small">(vide = illimité)</span></span><input id="fi-qty" type="number" min="1" value="1" style="width:70px"></label></div></div></div>
    <label class="field"><span>Description (lue par le joueur une fois l'objet acheté)</span><textarea id="fi-desc" rows="4"></textarea></label>
    <div class="actions"><button data-close>Annuler</button><button class="primary" id="fi-ok">Ajouter</button></div>`, (box, close) => {
    dropImage($('#fi-img', box), r => { it.img = r.url; const p = $('#fi-img', box); p.style.backgroundImage = `url('${r.url}')`; p.classList.add('has'); });
    $('#fi-ok', box).onclick = () => {
      it.name = $('#fi-name', box).value.trim();
      if (!it.name) return toast('Donnez un nom à l\'objet.');
      it.value = Math.max(0, num($('#fi-price', box).value, 0));
      const q = $('#fi-qty', box).value.trim(); it.qty = q === '' ? null : Math.max(1, Math.round(num(q, 1)));
      it.desc = $('#fi-desc', box).value;
      shop.items.push(it); close(); shopSave();
    };
  });
}

/* ---------------------------------------------------------------- requests */
async function resolveReq(id, accept, box) {
  const price = $('[data-rqprice]', box)?.value, note = $('[data-rqnote]', box)?.value || '';
  if (accept && (price === '' || price == null)) return toast('Indiquez le prix final.');
  $$('button', box).forEach(b => b.disabled = true);
  try {
    await api('POST', '/api/shop/resolve', { id, accept, price, note });
    toast(accept ? '<i class="ico i-handshake"></i> Transaction effectuée : or et inventaire mis à jour.' : 'Demande refusée.');
  } catch (e) { toast('<i class="ico i-alert"></i> ' + esc(e.message), 5000); }
  await loadAll(); renderLog(); rerender();
}
function reqRow(r) {
  const c = S.chars[r.charId], gold = c ? purseCp(purseOf(c)) / 100 : 0, short = r.kind === 'buy' && (r.offer ?? r.listed ?? 0) > gold;
  return `<div class="sh-req" data-req="${r.id}">${c ? avatarHTML(c, 38) : ''}<div class="grow">
    <div><b>${esc(r.who)}</b> ${r.kind === 'buy' ? 'veut acheter' : 'veut vendre'} <a href="#" data-rqitem="${r.id}">${itemThumb({ img: r.item?.img }, 24)} <b>${esc(r.item?.name)}</b></a>${r.qty > 1 ? ' ×' + r.qty : ''}
      <span class="muted small">· ${esc(r.shopName || '')} · ${new Date(r.t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></div>
    <div class="small">${r.kind === 'buy' ? 'Prix affiché' : 'Prix de rachat'} : <b>${fmtPrice(r.listed)}</b>${r.offer != null ? ` · ${r.kind === 'buy' ? 'propose' : 'demande'} <b class="sh-offer">${fmtPrice(r.offer)}</b>` : ''}
      · bourse de ${esc(c?.name || '?')} : ${c ? purseFmt(purseOf(c)) : '?'}${short ? ' <span class="tag warn">pas assez d\'or</span>' : ''}</div>
    ${r.msg ? `<div class="small"><i>« ${esc(r.msg)} »</i></div>` : ''}
    <div class="row" style="margin-top:5px;flex-wrap:wrap"><label class="small">Prix final <input type="number" min="0" step="any" data-rqprice value="${r.offer ?? r.listed ?? ''}" style="width:100px"> po</label>
      <input data-rqnote placeholder="Réponse du marchand (facultatif, vue par le joueur)" style="flex:1;min-width:180px">
      <button class="primary small" data-rqok="${r.id}">✔ Accepter</button><button class="danger small" data-rqno="${r.id}">✕ Refuser</button></div></div></div>`;
}
const histRow = r => `<div class="sh-hist small">${shopStatusChip(r)} <b>${esc(r.who)}</b> ${r.kind === 'buy' ? 'achat' : 'vente'} : ${esc(r.item?.name)}${r.qty > 1 ? ' ×' + r.qty : ''}
  <span class="muted">· ${esc(r.shopName || '')} · ${new Date(r.done || r.t).toLocaleString([], { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>${r.note ? ` <i class="muted">« ${esc(r.note)} »</i>` : ''}</div>`;
function reqView(D) {
  const pend = pendingReqs(), done = D.requests.filter(r => r.status !== 'pending').slice(0, 60);
  return `<div class="card"><h3 style="margin-top:0"><i class="ico i-handshake"></i> Demandes en attente (${pend.length})</h3>
      <div class="muted small" style="margin-bottom:6px">Fixez le prix final (négociation), puis acceptez : l'or est retiré ou ajouté et l'objet passe dans l'inventaire automatiquement.</div>
      ${pend.map(reqRow).join('') || '<div class="muted">Aucune demande en attente.</div>'}</div>
    <div class="card"><h4>Historique <button class="small link right" id="sh-hclear">effacer</button></h4>${done.map(histRow).join('') || '<div class="muted small">Rien pour l\'instant.</div>'}</div>`;
}

/* ---------------------------------------------------------------- tab */
function npcAvatar(npc, size) { return avatarHTML({ name: npc?.name || '?', portrait: npc?.img || '', color: '#6b4a22' }, size); }
function shopView(s) {
  const D = SHOPS(), open = D.open === s.id, vis = s.visibleTo, npc = s.npc ||= {}, items = s.items ||= [], M = moodOf(s);
  const pend = pendingReqs().filter(r => r.shopId === s.id);
  return `<div class="card"><div class="row" style="flex-wrap:wrap"><input id="sh-name" value="${esc(s.name)}" class="sh-title">
      <button class="${open ? 'danger' : 'primary'}" id="sh-open">${open ? '<i class="ico i-lock"></i> Fermer aux joueurs' : '<i class="ico i-eye"></i> Ouvrir aux joueurs'}</button>
      <button id="sh-dup" title="Dupliquer ce magasin">⧉</button><button class="danger" id="sh-del" title="Supprimer ce magasin"><i class="ico i-trash"></i></button></div>
    <div class="row small" style="margin-top:8px;flex-wrap:wrap"><span>${open ? '<b class="sh-on">● Ouvert : les joueurs voient ce magasin.</b>' : D.open ? `Fermé. (« ${esc(shopById(D.open)?.name || '')} » est ouvert : ouvrir celui-ci fermera l'autre.)` : 'Fermé : les joueurs ne le voient pas.'}</span>
      <span class="right">Visible pour :</span><label class="chk"><input type="checkbox" id="sh-visall" ${vis == null ? 'checked' : ''}> tous</label>
      ${vis != null ? charList().map(c => `<label class="chk"><input type="checkbox" data-shvis="${c.id}" ${vis.includes(c.id) ? 'checked' : ''}> ${esc(c.name)}</label>`).join('') : ''}</div>
    <div class="muted small" style="margin-top:4px"><i class="ico i-hidden"></i> Les joueurs ne voient que le nom, l'image, le prix et le stock des objets : jamais leur rareté ni leur description.</div></div>
  ${pend.length ? `<div class="card sh-pend"><h4><i class="ico i-handshake"></i> Demandes en attente (${pend.length})</h4>${pend.map(reqRow).join('')}</div>` : ''}
  <div class="card"><h4><i class="ico ${M.icon}"></i> Marchand <span class="muted small">— les joueurs voient son nom, son portrait et sa phrase d'accueil</span></h4>
    <div class="row" style="align-items:flex-start;gap:12px"><div class="portrait ${npc.img ? 'has' : ''}" id="sh-npcimg" style="width:96px;height:96px;flex:none;${npc.img ? `background-image:url('${esc(npc.img)}')` : ''}">Déposer une image</div>
      <div class="col grow"><div class="row" style="flex-wrap:wrap">
        <label class="field grow"><span>Nom</span><input id="sh-npcname" value="${esc(npc.name || '')}"></label>
        <label class="field"><span>Peuple</span><input id="sh-npcrace" value="${esc(npc.race || '')}" style="width:110px"></label>
        <label class="field"><span>Humeur</span><select id="sh-mood">${Object.entries(NPC_MOOD).map(([k, m]) => `<option value="${k}" ${npc.attitude === k ? 'selected' : ''}>${m.label}</option>`).join('')}</select></label>
        <label class="field" title="Tous les prix du magasin (négatif = remise)"><span>Prix</span><span class="row" style="gap:3px"><input id="sh-mod" type="number" step="5" value="${s.mod || 0}" style="width:64px">%</span></label>
        <label class="field" title="Part de la valeur que le marchand paie quand il rachète un objet"><span>Rachat</span><span class="row" style="gap:3px"><input id="sh-sell" type="number" step="5" min="0" max="200" value="${s.sellRate ?? 50}" style="width:64px">%</span></label></div>
        <label class="field"><span>Phrase d'accueil (vue par les joueurs)</span><input id="sh-greet" value="${esc(npc.greet || '')}"></label></div></div>
    <div class="row" style="align-items:flex-start;flex-wrap:wrap"><label class="field grow"><span>Description (MJ)</span><textarea id="sh-desc" rows="3">${esc(npc.desc || '')}</textarea></label>
      <label class="field grow"><span>Répliques (MJ)</span><textarea id="sh-lines" rows="3">${esc(npc.lines || '')}</textarea></label></div>
    <div class="row"><button class="small" id="sh-npcrnd"><i class="ico i-dice"></i> Autre marchand au hasard</button><span class="muted small">Changer l'humeur règle aussi les prix et le rachat (modifiables ensuite).</span></div></div>
  <div class="card"><h4><i class="ico i-bag"></i> Stock (${items.length}) <span class="muted small">— ${genSummary(s.gen)}</span></h4>
    <div class="row" style="flex-wrap:wrap;margin-bottom:6px"><button class="primary small" id="sh-add">+ Ajouter un objet</button><button class="small" id="sh-free">+ Objet libre</button>
      <button class="small" id="sh-addrnd"><i class="ico i-dice"></i> +3 au hasard</button><button class="small" id="sh-regen"><i class="ico i-dice"></i> Régénérer tout le stock</button>
      <button class="small" id="sh-genset"><i class="ico i-settings"></i> Réglages du hasard</button></div>
    ${items.length ? `<div class="sh-tabwrap"><table class="sh-tab"><thead><tr><th></th><th>Objet</th><th title="Valeur de base de l'objet">Valeur</th><th title="Vide = valeur × humeur du marchand">Prix affiché</th><th title="Vide = illimité">Stock</th><th></th></tr></thead><tbody>
      ${items.map(it => { const v = shopItemView(it), auto = shopUnitPrice(s, { ...it, price: null }); return `<tr class="${it.hidden ? 'sh-hid' : ''} ${it.qty === 0 ? 'sh-out' : ''}">
        <td>${itemThumb({ img: v.img, kind: v.kind }, 38)}</td>
        <td><a href="#" data-shinfo="${it.uid}"><b>${esc(v.name)}</b></a> ${v.rarity ? `<span class="rar small" style="--rc:${RARITY_COLOR[v.rarity] || '#888'}">${esc(v.rarity)}</span>` : ''}${it.hidden ? ' <span class="tag">caché</span>' : ''}${it.qty === 0 ? ' <span class="tag warn">épuisé</span>' : ''}<div class="muted small">${esc(v.cat)}</div></td>
        <td class="small nowrap">${it.value != null ? fmtPrice(it.value) : '—'}</td>
        <td class="nowrap"><input type="number" min="0" step="any" data-shprice="${it.uid}" value="${it.price ?? ''}" placeholder="${auto ?? '?'}" style="width:92px"> <span class="small">${fmtPrice(shopUnitPrice(s, it))}</span></td>
        <td><input type="number" min="0" step="1" data-shqty="${it.uid}" value="${it.qty ?? ''}" placeholder="∞" style="width:58px"></td>
        <td class="nowrap"><button class="small icon" data-shhide="${it.uid}" title="${it.hidden ? 'Montrer aux joueurs' : 'Cacher aux joueurs'}"><i class="ico ${it.hidden ? 'i-hidden' : 'i-eye'}"></i></button><button class="small icon" data-shdel="${it.uid}" title="Retirer du stock"><i class="ico i-trash"></i></button></td></tr>`; }).join('')}
      </tbody></table></div>` : '<div class="muted">Le stock est vide.</div>'}</div>
  <div class="card"><h4><i class="ico i-quill"></i> Notes du MJ</h4><textarea id="sh-notes" rows="3" placeholder="Secrets du marchand, objets à ne vendre qu'à certains clients…">${esc(s.notes || '')}</textarea></div>`;
}
function renderShop(main) {
  const D = SHOPS();
  if (SH.sel !== '__req' && !shopById(SH.sel)) SH.sel = D.list[0]?.id || (pendingReqs().length ? '__req' : null);
  const pend = pendingReqs(), s = shopById(SH.sel);
  main.innerHTML = `<div class="split"><div class="side-list" style="width:300px">
      <h3 style="margin:0"><i class="ico i-purse"></i> Magasins</h3>
      <div class="row"><button class="primary" id="sh-gen" style="flex:1"><i class="ico i-dice"></i> Générer un magasin</button><button id="sh-new" title="Magasin vide, à remplir à la main">+ Vide</button></div>
      <div class="li ${SH.sel === '__req' ? 'sel' : ''}" data-shsel="__req"><i class="ico i-handshake"></i><div class="grow"><b>Demandes des joueurs</b><div class="muted small">${pend.length ? pend.length + ' en attente' : 'aucune en attente'}</div></div>${pend.length ? `<span class="sh-badge">${pend.length}</span>` : ''}</div>
      ${D.list.map(x => `<div class="li ${x.id === SH.sel ? 'sel' : ''}" data-shsel="${x.id}">${npcAvatar(x.npc, 34)}<div class="grow"><b>${esc(x.name)}</b>
        <div class="muted small ellipsis">${esc(x.npc?.name || '')} · ${moodOf(x).label.toLowerCase()} · ${(x.items || []).length} objets</div></div>${D.open === x.id ? '<span class="shop-st st-accepted">ouvert</span>' : ''}</div>`).join('') || '<div class="muted small">Aucun magasin : générez-en un, ou créez-le vide et remplissez-le à la main.</div>'}
    </div><div class="sheet" id="sh-main">${SH.sel === '__req' ? reqView(D) : s ? shopView(s) : '<div class="empty">Générez un magasin pour commencer.</div>'}</div></div>`;
  bindShop(main, s);
  updateShopBadge();
}
function bindShop(main, s) {
  const D = SHOPS();
  $$('[data-shsel]', main).forEach(b => b.onclick = () => { SH.sel = b.dataset.shsel; store.set('gt-shop-sel', SH.sel); rerender(); });
  $('#sh-gen', main).onclick = () => genModal(null);
  $('#sh-new', main).onclick = () => {
    const p = genNpc('neutre'), x = { id: uid('sh'), name: 'Nouveau magasin', ...p, visibleTo: null, gen: null, notes: '', items: [] };
    D.list.unshift(x); SH.sel = x.id; store.set('gt-shop-sel', x.id); shopSave();
  };
  // requests (tab "Demandes" and the pending block of a shop)
  $$('[data-rqok]', main).forEach(b => b.onclick = () => resolveReq(b.dataset.rqok, true, b.closest('.sh-req')));
  $$('[data-rqno]', main).forEach(b => b.onclick = () => resolveReq(b.dataset.rqno, false, b.closest('.sh-req')));
  $$('[data-rqitem]', main).forEach(a => a.onclick = e => {
    e.preventDefault();
    const r = D.requests.find(x => x.id === a.dataset.rqitem); if (!r) return;
    const inv = r.kind === 'sell' && (S.chars[r.charId]?.inventory || []).find(x => x.uid === r.item.uid);
    const it = r.kind === 'buy' && shopById(r.shopId)?.items.find(x => x.uid === r.item.uid);
    modal((inv ? itemCardHTML(invView(inv), { extra: `<div class="small"><b>Valeur de base</b> ${fmtPrice(itemBaseValue(inv))}</div>` }) : it ? shopItemCard(it) : `<p>${esc(r.item.name)} (n'existe plus).</p>`) + `<div class="actions"><button data-close>Fermer</button></div>`);
  });
  $('#sh-hclear', main) && ($('#sh-hclear', main).onclick = () => confirmBox('Effacer l\'historique des demandes (les demandes en attente sont gardées) ?', () => { D.requests = pendingReqs(); shopSave(); }));
  if (!s) return;
  const npc = s.npc;
  const live = (id, fn) => { const el = $(id, main); if (el) el.oninput = e => { fn(e.target.value); saveCamp(); }; };
  live('#sh-name', v => s.name = v);
  live('#sh-npcname', v => npc.name = v);
  live('#sh-npcrace', v => npc.race = v);
  live('#sh-greet', v => npc.greet = v);
  live('#sh-desc', v => npc.desc = v);
  live('#sh-lines', v => npc.lines = v);
  live('#sh-notes', v => s.notes = v);
  $('#sh-name', main).onchange = () => rerender();
  $('#sh-mod', main).onchange = e => { s.mod = Math.round(num(e.target.value, 0)); shopSave(); };
  $('#sh-sell', main).onchange = e => { s.sellRate = clamp(Math.round(num(e.target.value, 50)), 0, 200); shopSave(); };
  $('#sh-mood', main).onchange = e => {
    const M = NPC_MOOD[e.target.value]; npc.attitude = e.target.value;
    Object.assign(s, { mod: M.mod, sellRate: M.sell }); npc.greet = pickOne(M.greet); npc.lines = shuffle(M.lines).slice(0, 3).join('\n'); shopSave();
  };
  $('#sh-npcrnd', main).onclick = () => { const p = genNpc(npc.attitude); p.npc.img = npc.img; Object.assign(s, p); shopSave(); };
  dropImage($('#sh-npcimg', main), r => { npc.img = r.url; shopSave(); });
  $('#sh-open', main).onclick = () => {
    const was = D.open === s.id; D.open = was ? null : s.id;
    logInfo(was ? `<i class="ico i-purse"></i> Le magasin <b>${esc(s.name)}</b> ferme ses portes.` : `<i class="ico i-purse"></i> Le magasin <b>${esc(s.name)}</b> est ouvert ! (onglet Magasin)`, s.visibleTo != null);
    shopSave();
  };
  $('#sh-visall', main).onchange = e => { s.visibleTo = e.target.checked ? null : charList().map(c => c.id); shopSave(); };
  $$('[data-shvis]', main).forEach(b => b.onchange = () => { const v = new Set(s.visibleTo || []); b.checked ? v.add(b.dataset.shvis) : v.delete(b.dataset.shvis); s.visibleTo = [...v]; shopSave(); });
  $('#sh-dup', main).onclick = () => { const x = JSON.parse(JSON.stringify(s)); x.id = uid('sh'); x.name += ' (copie)'; x.items.forEach(it => it.uid = uid('si')); D.list.unshift(x); SH.sel = x.id; shopSave(); };
  $('#sh-del', main).onclick = () => confirmBox(`Supprimer le magasin « ${esc(s.name)} » et son stock ?`, () => { D.list = D.list.filter(x => x !== s); if (D.open === s.id) D.open = null; SH.sel = null; shopSave(); });
  $('#sh-add', main).onclick = () => addItemModal(s);
  $('#sh-free', main).onclick = () => freeItemModal(s);
  const gen = () => s.gen || { preset: 'custom', cats: SHOP_CATS.map(c => c[0]), maxRarity: 'peu commun', count: 10 };
  $('#sh-addrnd', main).onclick = () => { const add = generateStock(gen(), 3, s.items); if (!add.length) return toast('Rien de nouveau à ajouter avec ces réglages.'); s.items = sortStock([...s.items, ...add]); shopSave(); };
  $('#sh-regen', main).onclick = () => confirmBox('Remplacer tout le stock par un nouveau stock au hasard ?', () => { const g = gen(); s.items = generateStock(g, g.count || 10); shopSave(); });
  $('#sh-genset', main).onclick = () => genModal(s);
  const itemOf = id => s.items.find(x => x.uid === id);
  $$('[data-shinfo]', main).forEach(a => a.onclick = e => { e.preventDefault(); const it = itemOf(a.dataset.shinfo); it && modal(shopItemCard(it) + `<div class="actions"><button data-close>Fermer</button></div>`); });
  $$('[data-shprice]', main).forEach(b => b.onchange = () => { const it = itemOf(b.dataset.shprice); it.price = b.value.trim() === '' ? null : Math.max(0, num(b.value)); shopSave(); });
  $$('[data-shqty]', main).forEach(b => b.onchange = () => { const it = itemOf(b.dataset.shqty); it.qty = b.value.trim() === '' ? null : Math.max(0, Math.round(num(b.value))); shopSave(); });
  $$('[data-shhide]', main).forEach(b => b.onclick = () => { const it = itemOf(b.dataset.shhide); it.hidden = !it.hidden; shopSave(); });
  $$('[data-shdel]', main).forEach(b => b.onclick = () => { s.items = s.items.filter(x => x.uid !== b.dataset.shdel); shopSave(); });
}
/* number of pending requests on the tab button */
function updateShopBadge() {
  const b = $('#tabs [data-tab="shop"]'); if (!b) return;
  const n = (S.camp.shops?.requests || []).filter(r => r.status === 'pending').length;
  let el = $('.sh-badge', b);
  if (!n) { el?.remove(); return; }
  if (!el) { el = document.createElement('span'); el.className = 'sh-badge'; b.appendChild(el); }
  el.textContent = n;
}
const _shopPrevLoaded = typeof onCampaignLoaded === 'function' ? onCampaignLoaded : null;
onCampaignLoaded = function () { if (_shopPrevLoaded) _shopPrevLoaded(); updateShopBadge(); };

TABS.shop = { render: renderShop };
