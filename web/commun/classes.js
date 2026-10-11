/* ===== Progression des classes D&D 5e (SRD 5.1 ; artificier d'après le Chaudron de Tasha) ===== */
'use strict';

const ASI_STD = [4, 8, 12, 16, 19];
const CLASSES = {
  barbare: { nom: 'Barbare', de: 12, sous: 3, sousNom: 'Voie primitive', asi: ASI_STD, cast: null,
    f: { 1: ['Rage', 'Défense sans armure'], 2: ['Attaque téméraire', 'Sens du danger'], 3: ['Voie primitive'], 5: ['Attaque supplémentaire', 'Déplacement rapide'],
      6: ['Aptitude de voie'], 7: ['Instinct sauvage'], 9: ['Critique brutal'], 10: ['Aptitude de voie'], 11: ['Rage implacable'], 13: ['Critique brutal (2 dés)'],
      14: ['Aptitude de voie'], 15: ['Rage persistante'], 17: ['Critique brutal (3 dés)'], 18: ['Puissance indomptable'], 20: ['Champion primitif'] } },
  barde: { nom: 'Barde', de: 8, sous: 3, sousNom: 'Collège bardique', asi: ASI_STD, cast: 'full', ab: 'CHA', liste: 'Barde', mode: 'connus', swap: true,
    tours: [2, 2, 2, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4],
    connus: [4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 15, 15, 16, 18, 19, 19, 20, 22, 22, 22], expertise: [3, 10], secrets: [10, 14, 18],
    f: { 1: ['Incantation', 'Inspiration bardique (d6)'], 2: ['Touche-à-tout', 'Chant reposant (d6)'], 3: ['Collège bardique', 'Expertise'], 5: ['Inspiration bardique (d8)', 'Source d\'inspiration'],
      6: ['Contre-charme', 'Aptitude de collège'], 9: ['Chant reposant (d8)'], 10: ['Inspiration bardique (d10)', 'Expertise', 'Secrets magiques'], 13: ['Chant reposant (d10)'],
      14: ['Secrets magiques', 'Aptitude de collège'], 15: ['Inspiration bardique (d12)'], 17: ['Chant reposant (d12)'], 18: ['Secrets magiques'], 20: ['Inspiration supérieure'] } },
  clerc: { nom: 'Clerc', de: 8, sous: 1, sousNom: 'Domaine divin', asi: ASI_STD, cast: 'full', ab: 'SAG', liste: 'Clerc', mode: 'prepares',
    tours: [3, 3, 3, 4, 4, 4, 4, 4, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5],
    f: { 1: ['Incantation', 'Domaine divin'], 2: ['Conduit divin (1/repos)', 'Aptitude de domaine'], 5: ['Destruction des morts-vivants (FP 1/2)'], 6: ['Conduit divin (2/repos)', 'Aptitude de domaine'],
      8: ['Destruction des morts-vivants (FP 1)', 'Aptitude de domaine'], 10: ['Intervention divine'], 11: ['Destruction des morts-vivants (FP 2)'], 14: ['Destruction des morts-vivants (FP 3)'],
      17: ['Destruction des morts-vivants (FP 4)', 'Aptitude de domaine'], 18: ['Conduit divin (3/repos)'], 20: ['Intervention divine améliorée'] } },
  druide: { nom: 'Druide', de: 8, sous: 2, sousNom: 'Cercle druidique', asi: ASI_STD, cast: 'full', ab: 'SAG', liste: 'Druide', mode: 'prepares',
    tours: [2, 2, 2, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4],
    f: { 1: ['Druidique', 'Incantation'], 2: ['Forme sauvage', 'Cercle druidique'], 4: ['Forme sauvage améliorée (FP 1/2)'], 6: ['Aptitude de cercle'], 8: ['Forme sauvage améliorée (FP 1, vol)'],
      10: ['Aptitude de cercle'], 14: ['Aptitude de cercle'], 18: ['Jeunesse éternelle', 'Incantation bestiale'], 20: ['Archidruide'] } },
  guerrier: { nom: 'Guerrier', de: 10, sous: 3, sousNom: 'Archétype martial', asi: [4, 6, 8, 12, 14, 16, 19], cast: null,
    f: { 1: ['Style de combat', 'Second souffle'], 2: ['Fougue'], 3: ['Archétype martial'], 5: ['Attaque supplémentaire'], 7: ['Aptitude d\'archétype'], 9: ['Indomptable'],
      10: ['Aptitude d\'archétype'], 11: ['Attaque supplémentaire (2)'], 13: ['Indomptable (2 utilisations)'], 15: ['Aptitude d\'archétype'], 17: ['Fougue (2 utilisations)', 'Indomptable (3 utilisations)'],
      18: ['Aptitude d\'archétype'], 20: ['Attaque supplémentaire (3)'] } },
  moine: { nom: 'Moine', de: 8, sous: 3, sousNom: 'Tradition monastique', asi: ASI_STD, cast: null,
    f: { 1: ['Défense sans armure', 'Arts martiaux'], 2: ['Ki', 'Déplacement sans armure'], 3: ['Tradition monastique', 'Parade de projectiles'], 4: ['Chute ralentie'],
      5: ['Attaque supplémentaire', 'Frappe étourdissante'], 6: ['Frappes de ki', 'Aptitude de tradition'], 7: ['Dérobade', 'Esprit tranquille'], 10: ['Pureté physique'],
      11: ['Aptitude de tradition'], 13: ['Langue du soleil et de la lune'], 14: ['Âme de diamant'], 15: ['Jeunesse éternelle'], 17: ['Aptitude de tradition'], 18: ['Corps vide'], 20: ['Perfection'] } },
  paladin: { nom: 'Paladin', de: 10, sous: 3, sousNom: 'Serment sacré', asi: ASI_STD, cast: 'half', ab: 'CHA', liste: 'Paladin', mode: 'prepares',
    f: { 1: ['Sens divin', 'Imposition des mains'], 2: ['Style de combat', 'Incantation', 'Châtiment divin'], 3: ['Santé divine', 'Serment sacré'], 5: ['Attaque supplémentaire'],
      6: ['Aura de protection'], 7: ['Aptitude de serment'], 10: ['Aura de courage'], 11: ['Châtiment divin amélioré'], 14: ['Contact purifiant'], 15: ['Aptitude de serment'],
      18: ['Auras améliorées'], 20: ['Aptitude de serment'] } },
  rodeur: { nom: 'Rôdeur', de: 10, sous: 3, sousNom: 'Archétype de rôdeur', asi: ASI_STD, cast: 'half', ab: 'SAG', liste: 'Rôdeur', mode: 'connus', swap: true,
    connus: [0, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11],
    f: { 1: ['Ennemi juré', 'Explorateur-né'], 2: ['Style de combat', 'Incantation'], 3: ['Archétype de rôdeur', 'Vigilance primitive'], 5: ['Attaque supplémentaire'],
      6: ['Ennemi juré et explorateur-né améliorés'], 7: ['Aptitude d\'archétype'], 8: ['Traversée des terrains'], 10: ['Camouflage naturel'], 11: ['Aptitude d\'archétype'],
      14: ['Disparition'], 15: ['Aptitude d\'archétype'], 18: ['Sens sauvages'], 20: ['Tueur d\'ennemis'] } },
  roublard: { nom: 'Roublard', de: 8, sous: 3, sousNom: 'Archétype de roublard', asi: [4, 8, 10, 12, 16, 19], cast: null, expertise: [1, 6],
    f: { 1: ['Expertise', 'Attaque sournoise', 'Jargon des voleurs'], 2: ['Ruse'], 3: ['Archétype de roublard'], 5: ['Esquive instinctive'], 6: ['Expertise'], 7: ['Dérobade'],
      9: ['Aptitude d\'archétype'], 11: ['Talent'], 13: ['Aptitude d\'archétype'], 14: ['Perception aveugle'], 15: ['Esprit fuyant'], 17: ['Aptitude d\'archétype'], 18: ['Insaisissable'], 20: ['Coup de chance'] } },
  ensorceleur: { nom: 'Ensorceleur', de: 6, sous: 1, sousNom: 'Origine magique', asi: ASI_STD, cast: 'full', ab: 'CHA', liste: 'Ensorceleur', mode: 'connus', swap: true,
    tours: [4, 4, 4, 5, 5, 5, 5, 5, 5, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6],
    connus: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 12, 13, 13, 14, 14, 15, 15, 15, 15],
    f: { 1: ['Incantation', 'Origine magique'], 2: ['Source de magie'], 3: ['Métamagie (2 options)'], 6: ['Aptitude d\'origine'], 10: ['Métamagie (option supplémentaire)'],
      14: ['Aptitude d\'origine'], 17: ['Métamagie (option supplémentaire)'], 18: ['Aptitude d\'origine'], 20: ['Restauration ensorcelée'] } },
  occultiste: { nom: 'Occultiste', de: 8, sous: 1, sousNom: 'Patron d\'outre-monde', asi: ASI_STD, cast: 'pact', ab: 'CHA', liste: 'Occultiste', mode: 'connus', swap: true,
    tours: [2, 2, 2, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4],
    connus: [2, 3, 4, 5, 6, 7, 8, 9, 10, 10, 11, 11, 12, 12, 13, 13, 14, 14, 15, 15],
    f: { 1: ['Patron d\'outre-monde', 'Magie de pacte'], 2: ['Manifestations occultes'], 3: ['Pacte'], 6: ['Aptitude de patron'], 10: ['Aptitude de patron'], 11: ['Arcanum mystique (niveau 6)'],
      13: ['Arcanum mystique (niveau 7)'], 14: ['Aptitude de patron'], 15: ['Arcanum mystique (niveau 8)'], 17: ['Arcanum mystique (niveau 9)'], 20: ['Maître de l\'occulte'] } },
  magicien: { nom: 'Magicien', de: 6, sous: 2, sousNom: 'Tradition arcanique', asi: ASI_STD, cast: 'full', ab: 'INT', liste: 'Magicien', mode: 'grimoire',
    tours: [3, 3, 3, 4, 4, 4, 4, 4, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5],
    f: { 1: ['Incantation', 'Restauration arcanique'], 2: ['Tradition arcanique'], 6: ['Aptitude de tradition'], 10: ['Aptitude de tradition'], 14: ['Aptitude de tradition'],
      18: ['Maîtrise des sorts'], 20: ['Sorts de prédilection'] } },
  artificier: { nom: 'Artificier', de: 8, sous: 3, sousNom: 'Spécialisation', asi: ASI_STD, cast: 'halfup', ab: 'INT', liste: 'Magicien', listeNote: 'liste d\'artificier absente du SRD : liste du magicien proposée', mode: 'prepares',
    tours: [2, 2, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4],
    f: { 1: ['Bricolage magique', 'Incantation'], 2: ['Infusion d\'objets'], 3: ['Spécialisation', 'Le bon outil'], 6: ['Expertise des outils'], 7: ['Éclair de génie'],
      10: ['Adepte des objets magiques'], 11: ['Objet stockeur de sort'], 14: ['Savant des objets magiques'], 18: ['Maître des objets magiques'], 20: ['Âme de l\'artifice'] } },
};

/* descriptions courtes (règles officielles, résumées) */
const FEATURE_DESC = {
  'Rage': 'Action bonus : avantage aux tests et sauvegardes de FOR, bonus aux dégâts de FOR, résistance aux dégâts contondants, perforants et tranchants (1 minute).',
  'Défense sans armure': 'Sans armure, CA = 10 + DEX + CON (barbare) ou 10 + DEX + SAG (moine).',
  'Attaque téméraire': 'Avantage à vos attaques de FOR au corps à corps ce tour, mais les attaques contre vous ont l\'avantage.',
  'Sens du danger': 'Avantage aux sauvegardes de DEX contre les effets que vous voyez (pièges, sorts…).',
  'Attaque supplémentaire': 'Vous attaquez deux fois au lieu d\'une lorsque vous effectuez l\'action Attaquer.',
  'Déplacement rapide': '+3 m de vitesse sans armure lourde.',
  'Instinct sauvage': 'Avantage à l\'initiative ; vous pouvez agir au premier round même surpris si vous entrez en rage.',
  'Critique brutal': 'Un dé de dégâts d\'arme supplémentaire lors d\'un coup critique au corps à corps.',
  'Rage implacable': 'En rage, si vous tombez à 0 PV : sauvegarde de CON DD 10 (+5 à chaque fois) pour rester à 1 PV.',
  'Rage persistante': 'Votre rage ne s\'arrête que si vous tombez inconscient ou si vous le décidez.',
  'Puissance indomptable': 'Un test de FOR inférieur à votre valeur de FOR est remplacé par celle-ci.',
  'Champion primitif': '+4 en FOR et en CON (maximum 24).',
  'Inspiration bardique (d6)': 'Action bonus : un allié gagne un dé d\'inspiration à ajouter à un jet (CHA fois par repos long).',
  'Touche-à-tout': 'Ajoutez la moitié de votre maîtrise aux tests sans maîtrise.',
  'Chant reposant (d6)': 'Pendant un repos court, les alliés qui dépensent des dés de vie regagnent 1d6 PV de plus.',
  'Expertise': 'Doublez votre bonus de maîtrise pour deux compétences maîtrisées.',
  'Source d\'inspiration': 'Vos inspirations bardiques se rechargent aussi après un repos court.',
  'Contre-charme': 'Action : les alliés à 9 m ont l\'avantage contre la peur et le charme jusqu\'à la fin de votre prochain tour.',
  'Secrets magiques': 'Apprenez deux sorts de n\'importe quelle classe.',
  'Inspiration supérieure': 'Si vous n\'avez plus d\'inspiration en lançant l\'initiative, vous en récupérez une.',
  'Conduit divin (1/repos)': 'Renvoi des morts-vivants et effet de domaine, une fois par repos court ou long.',
  'Destruction des morts-vivants (FP 1/2)': 'Les morts-vivants renvoyés de FP 1/2 ou moins sont détruits.',
  'Intervention divine': 'Implorez l\'aide de votre divinité : réussite si d100 ≤ niveau de clerc.',
  'Forme sauvage': 'Prenez la forme d\'une bête déjà vue (FP 1/4, sans vol ni nage), 2 fois par repos court.',
  'Jeunesse éternelle': 'Vous vieillissez dix fois plus lentement.',
  'Archidruide': 'Forme sauvage illimitée ; ignorez les composantes V, S et M sans coût.',
  'Style de combat': 'Choisissez un style : Archerie (+2 attaque à distance), Défense (+1 CA en armure), Duel (+2 dégâts à une main), Arme à deux mains, Protection…',
  'Second souffle': 'Action bonus : regagnez 1d10 + niveau de guerrier PV, une fois par repos court.',
  'Fougue': 'Une action supplémentaire à votre tour, une fois par repos court.',
  'Indomptable': 'Relancez une sauvegarde ratée, une fois par repos long.',
  'Arts martiaux': 'DEX pour les attaques à mains nues et armes de moine, dé d\'arts martiaux, attaque à mains nues en action bonus.',
  'Ki': 'Points de ki (= niveau) : Déluge de coups, Défense patiente, Pas du vent.',
  'Déplacement sans armure': '+3 m de vitesse sans armure (augmente avec le niveau).',
  'Parade de projectiles': 'Réaction : réduisez les dégâts d\'un projectile de 1d10 + DEX + niveau.',
  'Chute ralentie': 'Réaction : réduisez les dégâts de chute de 5 × niveau.',
  'Frappe étourdissante': '1 ki : la cible touchée réussit une sauvegarde de CON ou est étourdie jusqu\'à la fin de votre prochain tour.',
  'Frappes de ki': 'Vos attaques à mains nues sont magiques.',
  'Dérobade': 'Sauvegarde de DEX pour moitié : aucun dégât en cas de réussite, moitié en cas d\'échec.',
  'Esprit tranquille': 'Action : mettez fin à un effet de charme ou de peur sur vous.',
  'Pureté physique': 'Immunité aux maladies et au poison.',
  'Âme de diamant': 'Maîtrise de toutes les sauvegardes ; 1 ki pour relancer une sauvegarde ratée.',
  'Corps vide': '4 ki : invisible et résistant à tout sauf la force pendant 1 minute.',
  'Sens divin': 'Action : détectez célestes, fiélons et morts-vivants à 18 m (1 + CHA fois par repos long).',
  'Imposition des mains': 'Réserve de PV (5 × niveau) à distribuer au toucher ; 5 points soignent une maladie ou un poison.',
  'Châtiment divin': 'Dépensez un emplacement en touchant : +2d8 radiants (+1d8 par niveau d\'emplacement, +1d8 contre morts-vivants et fiélons).',
  'Santé divine': 'Immunité aux maladies.',
  'Aura de protection': 'Vous et vos alliés à 3 m ajoutez votre CHA à vos sauvegardes.',
  'Aura de courage': 'Vous et vos alliés à 3 m ne pouvez pas être effrayés.',
  'Châtiment divin amélioré': 'Vos attaques au corps à corps infligent 1d8 radiants supplémentaires.',
  'Contact purifiant': 'Action : mettez fin à un sort sur une créature (CHA fois par repos long).',
  'Ennemi juré': 'Avantage pour pister et vous souvenir d\'informations sur un type d\'ennemi choisi.',
  'Explorateur-né': 'Avantages de déplacement et de survie dans un terrain de prédilection.',
  'Vigilance primitive': 'Dépensez un emplacement pour sentir certains types de créatures à 1,5 km.',
  'Attaque sournoise': 'Une fois par tour, dégâts supplémentaires (1d6 par 2 niveaux) avec l\'avantage ou un allié adjacent à la cible.',
  'Jargon des voleurs': 'Langage secret des voleurs.',
  'Ruse': 'Action bonus : Foncer, Se désengager ou Se cacher.',
  'Esquive instinctive': 'Réaction : divisez par deux les dégâts d\'une attaque que vous voyez.',
  'Talent': 'Les jets de compétences maîtrisées de 9 ou moins comptent comme 10.',
  'Perception aveugle': 'Vous percevez les créatures cachées ou invisibles à 3 m.',
  'Esprit fuyant': 'Maîtrise des sauvegardes de SAG.',
  'Insaisissable': 'Aucune attaque n\'a l\'avantage contre vous tant que vous n\'êtes pas neutralisé.',
  'Coup de chance': 'Transformez un échec en réussite (ou un raté en 20), une fois par repos court.',
  'Source de magie': 'Points de sorcellerie (= niveau) pour créer des emplacements ou alimenter la métamagie.',
  'Métamagie (2 options)': 'Choisissez deux options : Sort prudent, distant, renforcé, étendu, intensifié, accéléré, subtil, jumeau.',
  'Restauration ensorcelée': 'Regagnez 4 points de sorcellerie après un repos court.',
  'Manifestations occultes': 'Choisissez des manifestations (invocations) qui modifient vos capacités.',
  'Pacte': 'Choisissez un pacte : de la lame, de la chaîne ou du grimoire.',
  'Magie de pacte': 'Emplacements peu nombreux mais toujours au plus haut niveau, récupérés après un repos court.',
  'Maître de l\'occulte': 'Une minute de supplique : regagnez tous vos emplacements de pacte (1/repos long).',
  'Restauration arcanique': 'Une fois par jour pendant un repos court, récupérez des emplacements (total ≤ moitié du niveau).',
  'Maîtrise des sorts': 'Un sort de niveau 1 et un de niveau 2 lançables à volonté au plus bas niveau.',
  'Sorts de prédilection': 'Deux sorts de niveau 3 toujours préparés, lançables une fois gratuitement par repos court.',
  'Bricolage magique': 'Imprégnez un petit objet d\'un effet mineur (lumière, message, son…).',
  'Infusion d\'objets': 'Imprégnez des objets d\'infusions magiques après un repos long.',
  'Le bon outil': 'Créez un outil d\'artisan en une heure.',
  'Expertise des outils': 'Doublez votre maîtrise pour les outils maîtrisés.',
  'Éclair de génie': 'Réaction : ajoutez votre INT à un test ou une sauvegarde d\'une créature visible (INT fois par repos long).',
};

/* dons proposés à la place d'une amélioration de caractéristiques */
const FEATS = [
  { n: 'Alerte', d: '+5 à l\'initiative, vous ne pouvez pas être surpris et les créatures cachées n\'ont pas l\'avantage contre vous.', fx: { init: 5 } },
  { n: 'Robuste', d: 'Vos PV max augmentent de 2 par niveau.', fx: { hpPerLevel: 2 } },
  { n: 'Résilient', d: '+1 à une caractéristique et maîtrise de la sauvegarde associée.', fx: { stat1: true, saveProf: true } },
  { n: 'Chanceux', d: '3 points de chance par repos long : relancez un d20 (attaque, test, sauvegarde) ou une attaque contre vous.', fx: { res: { name: 'Chanceux', max: 3, reset: 'long' } } },
  { n: 'Mage de guerre', d: 'Avantage aux sauvegardes de concentration, sorts avec mains occupées, sort en attaque d\'opportunité.' },
  { n: 'Sentinelle', d: 'Vos attaques d\'opportunité réduisent la vitesse à 0 ; vous attaquez qui s\'en prend à un allié proche.' },
  { n: 'Mobile', d: '+3 m de vitesse ; pas d\'attaque d\'opportunité de la part d\'une créature que vous avez attaquée.', fx: { speed: 3 } },
  { n: 'Observateur', d: '+1 en INT ou SAG, +5 à la Perception et à l\'Investigation passives, lecture sur les lèvres.', fx: { stat1: ['INT', 'SAG'] } },
  { n: 'Tireur d\'élite', d: 'Ignorez abris partiels et longue portée ; option −5 à l\'attaque / +10 aux dégâts à distance.' },
  { n: 'Maître des armes lourdes', d: 'Attaque bonus après un critique ou un ennemi abattu ; option −5 / +10 avec arme lourde.' },
  { n: 'Maître des boucliers', d: 'Bousculade en action bonus, bouclier ajouté aux sauvegardes de DEX, Dérobade avec bouclier.' },
  { n: 'Guérisseur', d: 'Trousse de soins : stabilise et rend 1 PV, ou rend 1d6 + 4 + DV max PV (1/repos court par créature).' },
  { n: 'Doué', d: 'Maîtrise de trois compétences ou outils de votre choix.', fx: { skills: 3 } },
  { n: 'Initié à la magie', d: 'Deux tours de magie et un sort de niveau 1 d\'une classe au choix (1/repos long).' },
  { n: 'Inspirant', d: '10 minutes de discours : jusqu\'à 6 alliés gagnent niveau + CHA PV temporaires.' },
  { n: 'Expert en duel', d: '+1 CA en réaction contre une attaque au corps à corps (arme maîtrisée).' },
];

/* classe de règles à partir du texte de la fiche (gère le féminin) */
function classOf(c) {
  const t = String(c?.classe || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const pairs = [['ensorcel', 'ensorceleur'], ['magicien', 'magicien'], ['druid', 'druide'], ['clerc', 'clerc'], ['barde', 'barde'], ['guerri', 'guerrier'],
    ['rodeu', 'rodeur'], ['roublard', 'roublard'], ['paladin', 'paladin'], ['moine', 'moine'], ['barbare', 'barbare'], ['occultiste', 'occultiste'], ['artifici', 'artificier']];
  for (const [p, k] of pairs) if (t.startsWith(p)) return k;
  if (t.startsWith('sorci')) return /lignee|ensorcel|draconi|sauvage/.test(t) ? 'ensorceleur' : 'occultiste';   // « sorcier » est ambigu en français
  return null;
}
/* emplacements de sorts au niveau n */
function slotsFor(cls, n) {
  const C = CLASSES[cls]; if (!C?.cast) return null;
  if (C.cast === 'full') return FULL_SLOTS[n] || [];
  if (C.cast === 'half') return n >= 2 ? FULL_SLOTS[Math.ceil(n / 2)] : [];
  if (C.cast === 'halfup') return FULL_SLOTS[Math.ceil(n / 2)] || [];
  if (C.cast === 'pact') {
    const nb = [1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4][n - 1], lv = Math.min(5, Math.ceil(n / 2));
    return Array.from({ length: lv }, (_, i) => i === lv - 1 ? nb : 0);
  }
  return [];
}
/* valeurs de ressources de classe attendues au niveau n (clé = nom normalisé) */
function classResources(cls, n, c) {
  const m = s => mod(c.stats?.[s]);
  const r = [];
  if (cls === 'barbare') r.push(['Rage', [2, 2, 3, 3, 3, 4, 4, 4, 4, 4, 4, 5, 5, 5, 5, 5, 6, 6, 6, 99][n - 1], 'long']);
  if (cls === 'moine' && n >= 2) r.push(['Points de ki', n, 'court']);
  if (cls === 'ensorceleur' && n >= 2) r.push(['Points de sorcellerie', n, 'long']);
  if (cls === 'barde') r.push(['Inspiration bardique', Math.max(1, m('CHA')), n >= 5 ? 'court' : 'long']);
  if (cls === 'paladin') r.push(['Imposition des mains', 5 * n, 'long']);
  if (cls === 'clerc' && n >= 2) r.push(['Conduit divin', n >= 18 ? 3 : n >= 6 ? 2 : 1, 'court']);
  if (cls === 'druide' && n >= 2) r.push(['Forme sauvage', 2, 'court']);
  if (cls === 'guerrier') { r.push(['Second souffle', 1, 'court']); if (n >= 2) r.push(['Fougue', n >= 17 ? 2 : 1, 'court']); if (n >= 9) r.push(['Indomptable', n >= 17 ? 3 : n >= 13 ? 2 : 1, 'long']); }
  if (cls === 'artificier' && n >= 7) r.push(['Éclair de génie', Math.max(1, m('INT')), 'long']);
  return r;
}
