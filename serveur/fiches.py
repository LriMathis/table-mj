"""Lecture des fiches de personnages texte/markdown (*.txt, *.md) et conversion en fiches de l'application."""
import os
import re

from .stockage import norm, slugify

STATS = ["FOR", "DEX", "CON", "INT", "SAG", "CHA"]
FULL_CASTERS = ["magicien", "druide", "clerc", "barde", "ensorceleur", "sorcier"]
HALF_CASTERS = ["paladin", "rodeur", "artificier"]
CAST_ABILITY = {"artificier": "INT", "magicien": "INT", "druide": "SAG", "clerc": "SAG", "rodeur": "SAG",
                "sorcier": "CHA", "ensorceleur": "CHA", "barde": "CHA", "paladin": "CHA",
                "occultiste": "CHA"}
SAVE_PROF = {"barbare": ["FOR", "CON"], "barde": ["DEX", "CHA"], "clerc": ["SAG", "CHA"],
             "druide": ["INT", "SAG"], "ensorceleur": ["CON", "CHA"], "sorcier": ["CON", "CHA"],
             "guerrier": ["FOR", "CON"], "magicien": ["INT", "SAG"], "moine": ["FOR", "DEX"],
             "paladin": ["SAG", "CHA"], "rodeur": ["FOR", "DEX"], "roublard": ["DEX", "INT"],
             "occultiste": ["SAG", "CHA"], "artificier": ["CON", "INT"]}
HIT_DIE = {"barbare": 12, "guerrier": 10, "paladin": 10, "rodeur": 10, "magicien": 6,
           "sorcier": 6, "ensorceleur": 6}
FULL_SLOTS = [[], [2], [3], [4, 2], [4, 3], [4, 3, 2], [4, 3, 3], [4, 3, 3, 1], [4, 3, 3, 2],
              [4, 3, 3, 3, 1], [4, 3, 3, 3, 2], [4, 3, 3, 3, 2, 1], [4, 3, 3, 3, 2, 1],
              [4, 3, 3, 3, 2, 1, 1], [4, 3, 3, 3, 2, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1],
              [4, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1, 1], [4, 3, 3, 3, 3, 1, 1, 1, 1],
              [4, 3, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 3, 2, 2, 1, 1]]
XP_TABLE = [0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000, 85000, 100000,
            120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000]
# mot-clé d'équipement -> (nom, dés, type de dégâts, "finesse"|"distance"|"force")
WEAPONS = [("grande massue", "Grande massue", "1d8", "contondant", "force"),
           ("massue", "Massue", "1d4", "contondant", "force"),
           ("marteau de forgeron", "Marteau de forgeron", "1d4", "contondant", "force"),
           ("dague", "Dague", "1d4", "perforant", "finesse"),
           ("poignard", "Poignard", "1d4", "perforant", "finesse"),
           ("arbalete de poing", "Arbalète de poing", "1d6", "perforant", "distance"),
           ("arbalete legere", "Arbalète légère", "1d8", "perforant", "distance"),
           ("arc long", "Arc long", "1d8", "perforant", "distance"),
           ("arc court", "Arc court", "1d6", "perforant", "distance"),
           ("rapiere", "Rapière", "1d8", "perforant", "finesse"),
           ("epee longue", "Épée longue", "1d8", "tranchant", "force"),
           ("epee courte", "Épée courte", "1d6", "perforant", "finesse"),
           ("cimeterre", "Cimeterre", "1d6", "tranchant", "finesse"),
           ("hache a deux mains", "Hache à deux mains", "1d12", "tranchant", "force"),
           ("hachette", "Hachette", "1d6", "tranchant", "force"),
           ("marteau de guerre", "Marteau de guerre", "1d8", "contondant", "force"),
           ("lance", "Lance", "1d6", "perforant", "force"),
           ("faucille", "Faucille", "1d4", "tranchant", "force"),
           ("baton", "Bâton", "1d6", "contondant", "force"),
           ("boomerang", "Boomerang", "1d4", "contondant", "distance")]
NUM_WORDS = {"une": 1, "un": 1, "deux": 2, "trois": 3, "quatre": 4}
NOT_FEATURE = ["caracteristique", "competence", "equipement", "personnalite", "apparence",
               "motivation", "relation", "style", "role", "particularite", "sorts", "resume"]
# préfixes de classe (masculin/féminin) -> classe
CLASS_PREFIX = [("ensorcel", "ensorceleur"), ("magicien", "magicien"), ("druid", "druide"), ("clerc", "clerc"), ("barde", "barde"),
                ("sorci", "sorcier"), ("guerri", "guerrier"), ("rodeu", "rodeur"), ("roublard", "roublard"), ("paladin", "paladin"),
                ("moine", "moine"), ("barbare", "barbare"), ("occultiste", "occultiste"), ("artifici", "artificier")]
SKILL_ALIAS = {"Intuition": "Perspicacité", "Perception passive": None}


def clean_heading(s):
    s = re.sub(r"^[^\w]+", "", s.strip())
    s = re.sub(r"^\d+\.\s*", "", s)
    return s.replace("*", "").strip()


def strip_md(s):
    return re.sub(r"\*\*|__", "", s).strip()


def mod(score):
    return (score - 10) // 2


def is_plain_heading(st):
    """Titre de section en capitales (« CAPACITÉS PRINCIPALES »)."""
    letters = re.sub(r"[^A-Za-zÀ-ÿ]", "", st)
    return len(letters) >= 4 and letters == letters.upper() and not re.search(r"\d", st) and len(st) < 60


def plain_to_md(chunk):
    """Convertit une fiche « texte simple » (Race : …, CARACTÉRISTIQUES, FOR 16 (+3)…) au format markdown attendu."""
    lines = chunk.split("\n")
    out, section = [lines[0]], None
    for l in lines[1:]:
        st = l.strip()
        m_kv = re.match(r"^([A-Za-zÀ-ÿ'’ -]{2,40}?)\s*:\s*(.+)$", st)
        if st and is_plain_heading(st):
            section = norm(st)
            out.append("## " + st)
        elif section is None and m_kv:
            out.append(f"**{m_kv.group(1).strip()} :** {m_kv.group(2).strip()}")
        elif section and section.startswith("caracteristique") and re.match(r"^(FOR|DEX|CON|INT|SAG|CHA)\s+\d+", st):
            m = re.match(r"^(FOR|DEX|CON|INT|SAG|CHA)\s+(\d+)(.*)$", st)
            out.append(f"* **{m.group(1)} {m.group(2)}**{m.group(3)}")
        elif section and section.startswith("caracteristique") and m_kv:
            out.append(f"**{m_kv.group(1).strip()} :** {m_kv.group(2).strip()}")
        elif section and any(k in section for k in ("capacit", "technique", "pouvoir", "aptitude")) and m_kv and st[0].isupper():
            v = m_kv.group(2).strip()
            out.append(f"**{m_kv.group(1).strip()} :** {v[:1].upper() + v[1:]}")
        else:
            out.append(l)
    return "\n".join(out)


def find_sheets(text):
    lines = text.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    starts = [i for i, l in enumerate(lines)
              if re.match(r"^#\s+\S", l) and re.search(r"^(\*\*)?Race\s*:", "\n".join(lines[i + 1:i + 14]), re.M)]
    out = []
    for k, s in enumerate(starts):
        e = starts[k + 1] if k + 1 < len(starts) else len(lines)
        chunk = lines[s:e]
        while chunk and chunk[-1].strip() in ("", "---"):
            chunk.pop()
        md = "\n".join(chunk)
        out.append(md if "**Race" in md else plain_to_md(md))
    return out


def parse_sheet(md, source):
    lines = md.split("\n")
    head = clean_heading(lines[0][1:])
    parts = re.split(r"\s+[—–-]\s+", head, maxsplit=1)
    name = parts[0].strip().title()
    title = parts[1].strip() if len(parts) > 1 else ""

    fields = {}
    for l in lines:
        m = re.match(r"^\*\*([^*:]+?)\s*:\*\*\s*(.+)$", l.strip())
        if m and norm(m.group(1)) not in fields:
            fields[norm(m.group(1))] = strip_md(m.group(2))

    stats = {}
    for m in re.finditer(r"\*\*(FOR|DEX|CON|INT|SAG|CHA)\s+(\d+)\*\*", md):
        stats.setdefault(m.group(1), int(m.group(2)))
    for s in STATS:
        stats.setdefault(s, 10)

    def num(key, default=0):
        m = re.search(r"-?\d+", fields.get(key, ""))
        return int(m.group()) if m else default

    classe = fields.get("classe", "")
    lv_in_class = re.search(r"\s*[—–-]\s*niveau\s*(\d+)\s*$", classe, re.I)
    if lv_in_class:
        classe = classe[:lv_in_class.start()].strip()
    level = num("niveau", int(lv_in_class.group(1)) if lv_in_class else 1) or 1
    cl = norm(classe)
    base_class = next((c for p, c in CLASS_PREFIX if cl.startswith(p)), "")
    prof = num("bonus de maitrise", 2 + (level - 1) // 4)

    # sections
    sections = []  # (heading, level, [lines])
    cur = ("", 0, [])
    for l in lines[1:]:
        m = re.match(r"^(#{1,4})\s+(.*)$", l)
        if m:
            sections.append(cur)
            cur = (clean_heading(m.group(2)), len(m.group(1)), [])
        else:
            cur[2].append(l)
    sections.append(cur)

    skills, equipment, features, spells = {}, "", [], {}
    parent = ""
    for heading, lvl, body in sections:
        hn = norm(heading)
        if lvl == 0:
            continue
        if lvl <= 2:
            parent = hn
        text = "\n".join(body).strip()
        if "competence" in hn:
            flat = strip_md(re.sub(r"^\s*[*-]\s+", "", text, flags=re.M)).replace("\n", ", ")
            for m in re.finditer(r"([A-Za-zÀ-ÿ'’ ]+?)\s*([+-]\d+)", flat):
                nm = m.group(1).strip(" ,.").capitalize()
                nm = SKILL_ALIAS.get(nm, nm)
                if nm:
                    skills[nm] = int(m.group(2))
            continue
        if "equipement" in hn:
            equipment = strip_md(text)
            continue
        # sorts (titres "Tours de magie"/"Niveau N" ou lignes en gras)
        spell_lvl = None
        if re.search(r"tours de magie", hn):
            spell_lvl = 0
        elif re.match(r"niveau\s*(\d)", hn):
            spell_lvl = int(re.match(r"niveau\s*(\d)", hn).group(1))
        if spell_lvl is not None or "sort" in hn:
            for l in body:
                ls = strip_md(l)
                lab = re.match(r"^(tours de magie|niveau\s*(\d))\s*:?$", norm(ls))
                if lab:
                    spell_lvl = 0 if lab.group(1).startswith("tours") else int(lab.group(2))
                    continue
                bm = re.match(r"^\s*[*-]\s+(.+)$", l)
                if bm and spell_lvl is not None:
                    spells.setdefault(str(spell_lvl), []).append(strip_md(bm.group(1)).rstrip("."))
            continue
        if any(k in hn for k in NOT_FEATURE) or any(k in parent for k in ["personnalite", "apparence", "relation", "motivation", "role"]):
            continue
        if hn.startswith("caracteristique") or not text:
            continue
        loose, feat_here = [], False
        for para in re.split(r"\n\s*\n", text):
            p = para.strip()
            if not p or p == "---":
                continue
            m = re.match(r"^\*\*([^*]+?)\s*:\*\*\s*(.*)$", p, re.S)
            if m:
                features.append({"name": m.group(1).strip(), "text": strip_md(m.group(2))})
                feat_here = True
            elif feat_here:
                features[-1]["text"] += "\n" + strip_md(p)   # suite de la capacité précédente (exemples, précisions)
            else:
                loose.append(strip_md(p))
        if loose and heading and norm(heading) not in ("capacites principales", "techniques speciales"):
            features.append({"name": heading.title() if heading.isupper() else heading, "text": "\n".join(loose)})

    # ressources & attaques déduites des capacités
    resources, attacks = [], []
    for f in features:
        t = norm(f["text"])
        m = re.search(r"(\d+|une|un|deux|trois|quatre)\s+(?:fois|utilisations?)\s+par\s+(repos\s+court|repos\s+long|jour)", t)
        m2 = re.search(r"une fois avant (?:son|sa|leur) prochain repos (court|long)", t) or re.search(r"se recharge apres un repos (court|long)", t)
        m3 = re.search(r"reserve de (\d+) (?:pv|points de vie)", t)
        if m:
            n = int(m.group(1)) if m.group(1).isdigit() else NUM_WORDS[m.group(1)]
            resources.append({"name": f["name"], "max": n, "cur": n, "reset": "court" if m.group(2).endswith("court") else "long"})
        elif m2:
            resources.append({"name": f["name"], "max": 1, "cur": 1, "reset": m2.group(1)})
        elif m3:
            resources.append({"name": f["name"], "max": int(m3.group(1)), "cur": int(m3.group(1)), "reset": "long"})
        g = re.search(r"point de ([a-z]+)", t)
        n = re.search(r"a\s+(\d+)\s+points", t)
        if g and n:
            resources.append({"name": "Points de " + g.group(1).capitalize(), "max": int(n.group(1)),
                              "cur": 0, "reset": "aucun"})
        if "au toucher" in t or re.search(r"attaque (?:a distance|au corps a corps|de melee)[^.]*?\+\d+", t):
            b = re.search(r"\+(\d+)", f["text"])
            d = re.search(r"\d+d\d+(?:\s*[+-]\s*\d+)?", f["text"])
            if b and d:
                dmg = re.sub(r"\s+", "", d.group())
                after = f["text"][d.end():d.end() + 40].lower()
                typ = re.search(r"(tranchants?|perforants?|contondants?|élémentaires?|nécrotiques?|feu|froid|foudre|poison|psychiques?|radiants?)", after)
                attacks.append({"name": f["name"], "bonus": int(b.group(1)), "damage": dmg,
                                "type": typ.group(1) if typ else ""})
    eq = norm(equipment)
    used = set()
    for key, wname, dice, dtype, kind in WEAPONS:
        if key in eq and not any(key in u for u in used):
            used.add(key)
            m = mod(stats["DEX"]) if kind == "distance" else (
                max(mod(stats["DEX"]), mod(stats["FOR"])) if kind == "finesse" else mod(stats["FOR"]))
            dmg = dice + (f"+{m}" if m > 0 else (str(m) if m < 0 else ""))
            attacks.append({"name": wname, "bonus": prof + m, "damage": dmg, "type": dtype})

    spellcasting = None
    if spells:
        ab = CAST_ABILITY.get(base_class, "INT")
        dc = num("dd des sorts", 8 + prof + mod(stats[ab]))
        atk = num("attaque magique", prof + mod(stats[ab]))
        slots = {}
        if base_class in FULL_CASTERS:
            row = FULL_SLOTS[min(level, 20)]
        elif base_class in HALF_CASTERS:
            row = FULL_SLOTS[max(0, (level + 1) // 2)] if level >= 2 else []
        else:
            row = []
        for i, n in enumerate(row):
            slots[str(i + 1)] = {"max": n, "cur": n}
        for m in re.finditer(r"(\d+)\s+emplacements?\s+de\s+niveau\s+(\d)", norm(md)):   # valeur écrite sur la fiche
            slots[m.group(2)] = {"max": int(m.group(1)), "cur": int(m.group(1))}
        spellcasting = {"ability": ab, "dc": dc, "attack": atk, "slots": slots}

    speed = fields.get("vitesse") or fields.get("vitesse au sol") or "9 m"
    if fields.get("vol"):
        speed += ", vol " + fields["vol"]
    hp = num("pv", 10)
    hd = HIT_DIE.get(base_class, 8)
    return {
        "id": slugify(name),
        "name": name, "title": title, "player": "",
        "race": fields.get("race", ""), "classe": classe, "niveau": level,
        "historique": fields.get("historique", ""), "alignement": fields.get("alignement", ""),
        "taille": fields.get("taille", ""), "vitesse": speed,
        "stats": stats, "saves": SAVE_PROF.get(base_class, []), "prof": prof,
        "hpMax": hp, "hp": hp, "hpTemp": 0, "ca": num("ca", 10),
        "initBonus": num("initiative", mod(stats["DEX"])),
        "xp": XP_TABLE[min(level, 20) - 1], "hitDie": hd, "hitDice": level,
        "skills": skills, "attacks": attacks, "resources": resources,
        "spellcasting": spellcasting, "spells": spells, "features": features,
        "equipment": equipment, "gold": 0, "conditions": [], "deathSaves": {"s": 0, "f": 0},
        "exhaustion": 0, "notes": "", "sheet": md, "portrait": "", "color": "",
        "source": source, "inspiration": fields.get("inspiration") or fields.get("concept", ""),
    }



def scan_sheets(folder):
    found = []
    if not os.path.isdir(folder):
        return found
    for fn in sorted(os.listdir(folder)):
        if not fn.lower().endswith((".txt", ".md")):
            continue
        try:
            with open(os.path.join(folder, fn), encoding="utf-8", errors="replace") as f:
                text = f.read()
        except OSError:
            continue
        for md in find_sheets(text):
            found.append(parse_sheet(md, fn))
    return found
