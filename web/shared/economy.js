/* ===== Action economy in combat: action, bonus action, reaction, multiattack, legendary actions =====
   Each combatant of the tracker carries `eco` for the current round: { a: action used, atk: attacks made with the
   Attack action, b: bonus action used, r: reaction used, leg: legendary actions spent }. It is cleared when its turn starts. */
'use strict';

const NUM_WORDS = { un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8 };
const normTxt = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’']/g, ' ');
const stemWord = w => w.length > 3 ? w.replace(/[sx]$/, '').replace(/e$/, '') : w;

/* "**Name.** text" entries of a markdown section (monster actions, bonus actions, reactions…) */
function mdEntries(src) {
  const out = [];
  String(src || '').split('\n').forEach(l => {
    const m = l.match(/^\*\*(.+?)\*\*\s*(.*)$/);
    if (m) out.push({ name: m[1].replace(/[.:]\s*$/, '').trim(), text: m[2].trim() });
    else if (l.trim()) out.length ? out[out.length - 1].text += '\n' + l : out.push({ name: '', text: l.trim() });
  });
  return out;
}
/* attack of the list named in a text ("ses griffes" -> "Griffe", "Morsure (sous forme de slaad uniquement)") */
function attackKey(name) { return normTxt(String(name).replace(/\(.*?\)/g, '')).split(/[^a-z0-9]+/).filter(Boolean).map(stemWord).join(' '); }
function findAttackIn(text, attacks) {
  const words = normTxt(text).split(/[^a-z0-9]+/).filter(Boolean), stems = words.map(stemWord), hits = [];
  attacks.forEach((a, idx) => {
    const k = attackKey(a.name).split(' '); if (!k[0]) return;
    for (let i = 0; i + k.length <= stems.length; i++) if (k.every((w, j) => stems[i + j] === w)) hits.push({ idx, pos: i, len: k.length });
  });
  return { words, hits };
}

/* Multiattack of a monster: { n: attacks per action, parts: [{ idx, n }] (exact sequence when it can be found), text } */
function parseMultiattack(actionsText, attacks) {
  const e = mdEntries(actionsText).find(x => /^attaques? multiples?/i.test(normTxt(x.name)));
  if (!e) return null;
  const { words, hits } = findAttackIn(e.text, attacks || []);
  const numAt = i => NUM_WORDS[words[i]] ?? (/^\d+$/.test(words[i] || '') ? +words[i] : null);
  let n = null;
  let first = -1;
  for (let i = 0; i < words.length; i++) if (numAt(i) != null && /^attaque/.test(words[i + 1] || '')) { n = numAt(i); first = i; break; }
  // "une attaque de Morsure et deux de Queue", "… et trois autres attaques": the counts add up (until an alternative "ou")
  if (n && /^(de|d)$/.test(words[first + 2] || '')) for (let i = first + 2; i < words.length - 1; i++) {
    if (words[i] === 'ou') break;
    if (words[i] === 'et' && numAt(i + 1) != null && /^(de|d|avec|autres?|attaques?)$/.test(words[i + 2] || '')) n += numAt(i + 1);
  }
  // count before each attack name: the closest number word within the 5 previous words
  const seen = new Set(), parts = [];
  hits.sort((a, b) => a.pos - b.pos).forEach(h => {
    if (seen.has(h.pos)) return; seen.add(h.pos);
    let c = 1;
    for (let j = h.pos - 1; j >= Math.max(0, h.pos - 5); j--) {
      if (numAt(j) != null) { c = numAt(j); break; }
      if (['et', 'ou', 'puis', 'plus'].includes(words[j])) break;
    }
    parts.push({ idx: h.idx, n: c });
  });
  // alternatives ("… ou deux attaques avec son arc"): keep the first parts that add up to n
  let seq = [];
  if (n) { let s = 0; for (const p of parts) { if (s + p.n > n) break; seq.push(p); s += p.n; } if (s !== n) seq = []; }
  else if (parts.length) { seq = parts; n = parts.reduce((s, p) => s + p.n, 0); }
  return { n: n || 1, parts: seq, text: e.text };
}

/* names of the attacks that are bonus actions (listed in the bonus actions section) */
function bonusAttackIdx(src, attacks) {
  const names = new Set(mdEntries(src).map(x => attackKey(x.name)));
  return (attacks || []).map((a, i) => names.has(attackKey(a.name)) ? i : -1).filter(i => i >= 0);
}
/* legendary actions: { uses, list: [{ name, text, cost }] } */
function parseLegendary(src) {
  const all = mdEntries(src); if (!all.length) return null;
  const head = all.filter(x => !x.name || /utilisations?|actions? legendaires?/.test(normTxt(x.name)));
  const txt = normTxt(head.map(x => x.name + ' ' + x.text).join(' '));
  const m = txt.match(/(\d+)\s*(?:\(|actions? legendaires|$)/) || txt.match(/legendaire\s*:\s*(\d+)/) || txt.match(/(\w+) actions legendaires/);
  const uses = m ? (+m[1] || NUM_WORDS[m[1]] || 3) : 3;
  const list = all.filter(x => !head.includes(x)).map(x => {
    const c = normTxt(x.name).match(/coute (\d+|deux|trois) actions/);
    return { name: x.name.replace(/\s*\(co[uû]te .*?\)/i, ''), text: x.text, cost: c ? (+c[1] || NUM_WORDS[c[1]]) : 1 };
  });
  return { uses, list };
}

/* attacks per Attack action for a character (Extra Attack) */
function attacksPerAction(c) {
  const cls = classOf(c), n = +c.niveau || 1;
  let k = 1;
  if (cls === 'guerrier') k = n >= 20 ? 4 : n >= 11 ? 3 : n >= 5 ? 2 : 1;
  else if (['barbare', 'moine', 'paladin', 'rodeur'].includes(cls) && n >= 5) k = 2;
  (c.features || []).forEach(f => {
    const m = normTxt(f.name).match(/^attaque supplementaire(?:\s*\((\d)\))?/);
    if (m) k = Math.max(k, m[1] ? +m[1] + 1 : 2);
  });
  return k;
}
/* character features used as a bonus action / reaction (the text says so) */
function featureActions(c, kind) {
  const re = kind === 'b' ? /action bonus|bonus action/i : /\br[ée]action\b/i;
  return (c.features || []).filter(f => re.test(f.text || '') || re.test(FEATURE_DESC?.[f.name] || ''))
    .map(f => ({ name: f.name, text: f.text || FEATURE_DESC?.[f.name] || '' }));
}
/* off-hand attack: no positive ability modifier to the damage */
const offhandDamage = d => String(d || '').replace(/\s*\+\s*\d+\s*$/, '');

/* casting time of a spell -> 'a' (action), 'b' (bonus action) or 'r' (reaction) */
function castKind(sp) {
  const s = normTxt(sp?.temps || '');
  return /bonus/.test(s) ? 'b' : /reaction/.test(s) ? 'r' : 'a';
}
const ECO_LABEL = { a: () => t('Action'), b: () => t('Bonus action'), r: () => t('Reaction') };
