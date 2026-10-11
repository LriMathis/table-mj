/* ===== Interface language =====
   Interface text is written in English in the code; i18n-fr.js holds the French translations.
   Game data saved by the app uses French keys and values (FOR, SAG, 'Empoisonné', 'perforant'…):
   term() shows them in English when the interface is in English. */
'use strict';

const LANG = (() => { try { return localStorage.getItem('gt-lang') === 'fr' ? 'fr' : 'en'; } catch (e) { return 'en'; } })();
document.documentElement.lang = LANG;

/* t('Delete {name}?', { name }) -> translated text with its placeholders filled in */
function t(s, vars) {
  let r = LANG === 'fr' && typeof FR !== 'undefined' && FR[s] != null ? FR[s] : s;
  if (vars) r = r.replace(/\{(\w+)\}/g, (m, k) => (vars[k] ?? m));
  return r;
}
function setLang(l) {
  try { localStorage.setItem('gt-lang', l); } catch (e) { }
  location.reload();
}

/* French game terms stored in the data -> English */
const TERMS_EN = {
  // abilities (keys stored in sheets) and their full names
  FOR: 'STR', SAG: 'WIS', Force: 'Strength', 'Dextérité': 'Dexterity', Sagesse: 'Wisdom', Charisme: 'Charisma',
  // skills
  Acrobaties: 'Acrobatics', Arcanes: 'Arcana', 'Athlétisme': 'Athletics', 'Discrétion': 'Stealth', Dressage: 'Animal Handling',
  Escamotage: 'Sleight of Hand', Histoire: 'History', 'Médecine': 'Medicine', 'Perspicacité': 'Insight',
  'Représentation': 'Performance', Survie: 'Survival', Tromperie: 'Deception',
  // conditions
  'À terre': 'Prone', 'Agrippé': 'Grappled', Assourdi: 'Deafened', 'Aveuglé': 'Blinded', 'Charmé': 'Charmed', 'Effrayé': 'Frightened',
  'Empoisonné': 'Poisoned', 'Entravé': 'Restrained', 'Étourdi': 'Stunned', Inconscient: 'Unconscious', 'Neutralisé': 'Incapacitated',
  'Paralysé': 'Paralyzed', 'Pétrifié': 'Petrified', 'Caché': 'Hidden', 'Béni': 'Blessed', 'Marqué': 'Marked', 'Transformé': 'Transformed',
  // damage types
  contondant: 'bludgeoning', perforant: 'piercing', tranchant: 'slashing', feu: 'fire', froid: 'cold', foudre: 'lightning',
  tonnerre: 'thunder', acide: 'acid', 'nécrotique': 'necrotic', radiant: 'radiant', psychique: 'psychic', force: 'force', poison: 'poison',
  // schools of magic
  invocation: 'conjuration', enchantement: 'enchantment', 'évocation': 'evocation', 'nécromancie': 'necromancy',
  // classes
  Barbare: 'Barbarian', Barde: 'Bard', Clerc: 'Cleric', Druide: 'Druid', Ensorceleur: 'Sorcerer', Guerrier: 'Fighter',
  Magicien: 'Wizard', Moine: 'Monk', Paladin: 'Paladin', 'Rôdeur': 'Ranger', Rodeur: 'Ranger', Roublard: 'Rogue',
  Occultiste: 'Warlock', Sorcier: 'Warlock', Artificier: 'Artificer',
  // monster types
  aberration: 'aberration', 'bête': 'beast', 'céleste': 'celestial', 'créature artificielle': 'construct', dragon: 'dragon',
  'élémentaire': 'elemental', 'fée': 'fey', 'fiélon': 'fiend', 'géant': 'giant', 'humanoïde': 'humanoid', 'monstruosité': 'monstrosity',
  vase: 'ooze', plante: 'plant', 'mort-vivant': 'undead', 'mort-vivant allié': 'allied undead',
};
const term = s => (LANG === 'en' && s != null && TERMS_EN[s] != null ? TERMS_EN[s] : s);
/* translates the leading word(s) of a stored value: "Magicien — École de Nécromancie", "Mort-vivant (ancien)" */
function termLead(s) {
  if (LANG !== 'en' || !s) return s;
  const str = String(s), cut = str.search(/\s+[(—–-]\s|\s*\(/), head = cut > 0 ? str.slice(0, cut) : str, rest = cut > 0 ? str.slice(cut) : '';
  const tr = TERMS_EN[head] ?? TERMS_EN[head.toLowerCase()] ?? TERMS_EN[head.split(/\s+/)[0]];
  if (tr == null) return s;
  const out = TERMS_EN[head] || TERMS_EN[head.toLowerCase()] ? tr : tr + head.slice(head.split(/\s+/)[0].length);
  return (head[0] === head[0].toUpperCase() ? out[0].toUpperCase() + out.slice(1) : out) + rest;
}

/* static HTML: elements marked data-t get their text, title and placeholder translated */
function translatePage(root = document) {
  if (LANG === 'en') return;
  for (const el of root.querySelectorAll('[data-t]')) {
    for (const n of el.childNodes) if (n.nodeType === 3 && n.textContent.trim()) n.textContent = n.textContent.replace(n.textContent.trim(), t(n.textContent.trim()));
    for (const a of ['title', 'placeholder']) if (el.hasAttribute(a)) el.setAttribute(a, t(el.getAttribute(a)));
  }
}
