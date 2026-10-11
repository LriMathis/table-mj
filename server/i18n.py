"""Server-side translations.

Messages are written in English in the code. The browser sends its language in the
`X-Lang` header; `t()` returns the French text when that language is `fr`.
"""
import threading

_local = threading.local()

FR = {
    # errors
    "Not found.": "Introuvable.",
    "Unknown request.": "Requête inconnue.",
    "Invalid JSON.": "JSON invalide.",
    "Game master only (this computer).": "Réservé au MJ (ce PC).",
    "The active campaign has changed.": "La campagne active a changé.",
    "Cannot delete the active campaign.": "Impossible de supprimer la campagne active.",
    "Invalid position.": "Position invalide.",
    "The GM has locked token movement.": "Le MJ a bloqué les déplacements.",
    "Token not found.": "Pion introuvable.",
    "This token is not yours.": "Ce pion n'est pas le vôtre.",
    "It is not your turn.": "Ce n'est pas votre tour.",
    "Unknown character.": "Personnage inconnu.",
    "The GM is handling attacks and spells for now.": "Le MJ gère les attaques et les sorts lui-même pour le moment.",
    "You are unconscious: only death saving throws are possible.": "Vous êtes inconscient : seuls les jets contre la mort sont possibles.",
    "It is not your turn. Wait for your initiative turn.": "Ce n'est pas votre tour. Attendez votre tour d'initiative.",
    "Invalid dice expression.": "Expression de dés invalide.",
    "Unknown roll.": "Jet inconnu.",
    "Unknown attack.": "Attaque inconnue.",
    "This spell is not on your sheet.": "Ce sort n'est pas sur votre fiche.",
    "You need a level {n} slot or higher.": "Il faut un emplacement de niveau {n} ou plus.",
    "No level {n} slot left.": "Plus d'emplacement de niveau {n} disponible.",
    "A ritual takes 10 more minutes: not possible in combat.": "Un rituel prend 10 minutes de plus : impossible en combat.",
    "Unknown resource.": "Ressource inconnue.",
    "Only the GM can recharge this resource (rest).": "Seul le MJ peut recharger cette ressource (repos).",
    "No uses left.": "Plus d'utilisation disponible.",
    "Hit dice are spent during a short rest, not in combat.": "Les dés de vie se dépensent pendant un repos court, pas en combat.",
    "No hit dice left.": "Plus de dés de vie.",
    "You already have all your hit points.": "Vous avez déjà tous vos PV.",
    "You are not at 0 hit points.": "Vous n'êtes pas à 0 PV.",
    "Death saving throws are over.": "Les jets contre la mort sont terminés.",
    "The GM handles level-ups: let them know!": "Le MJ s'occupe lui-même des montées de niveau : prévenez-le !",
    "Invalid data.": "Données invalides.",
    "Invalid level.": "Niveau invalide.",
    "You need {xp} XP to reach level {n}.": "Il faut {xp} XP pour atteindre le niveau {n}.",
    "Inconsistent hit point gain.": "Gain de PV incohérent.",
    "Unknown action.": "Action inconnue.",
    # rolls and journal entries
    "Initiative": "Initiative",
    "{ability} check": "Test de {ability}",
    "{ability} save": "Sauvegarde {ability}",
    "Attack": "Attaque",
    "HIT": "TOUCHÉ",
    "miss": "raté",
    "{name} damage{crit} {type}": "Dégâts {name}{crit} {type}",
    " (critical)": " (critique)",
    "{who} casts {spell}": "{who} lance {spell}",
    " (ritual)": " (rituel)",
    " — level {n} slot": " — emplacement niv. {n}",
    "{ab} save DC {dc}": "JdS {ab} DD {dc}",
    " (half on success)": " (moitié si réussite)",
    "{who} stops concentrating on {spell}.": "{who} cesse de se concentrer sur {spell}.",
    "{spell}: temporary hit points": "{spell} : PV temporaires",
    "{spell} healing{target}": "Soins {spell}{target}",
    "{who} uses {res} ({n}/{max})": "{who} utilise {res} ({n}/{max})",
    "{who} gains {res} ({n}/{max})": "{who} gagne {res} ({n}/{max})",
    "Hit die": "Dé de vie",
    "{who} recovers {n} HP → {hp}/{max}": "{who} récupère {n} PV → {hp}/{max}",
    "Death saving throw": "Jet contre la mort",
    "{who} rolls a 20 and regains consciousness with 1 HP!": "{who} fait 20 et reprend conscience avec 1 PV !",
    "{who} is stable.": "{who} est stabilisé.",
    "{who} is dead.": "{who} est mort.",
    "{who} ends their concentration ({spell}).": "{who} met fin à sa concentration ({spell}).",
    "{who} reaches level {n}": "{who} passe au niveau {n}",
    # campaigns and sheet import
    "New campaign": "Nouvelle campagne",
    "My first campaign": "Ma première campagne",
    "{name} (copy)": "{name} (copie)",
    "already present": "déjà présent",
    "updated": "mis à jour",
    "imported": "importé",
}


def set_lang(lang):
    _local.lang = "fr" if str(lang or "").lower().startswith("fr") else "en"


def lang():
    return getattr(_local, "lang", "en")


def t(msg, **kw):
    s = FR.get(msg, msg) if lang() == "fr" else msg
    return s.format(**kw) if kw else s
