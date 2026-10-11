"""Server-side dice roller (same syntax as the browser: 2d6+3, d20, 4d6kh3, 2d20kl1, d%)."""
import random
import re

_rng = random.SystemRandom()
_FULL = re.compile(r"^[-+]?(\d*d\d+((kh|kl|dh|dl)\d+)?|\d+)([-+](\d*d\d+((kh|kl|dh|dl)\d+)?|\d+))*$")


def roll(expr, adv=0):
    """Returns {total, detail, nat, crit, fumble, expr}, or None if the expression is invalid."""
    src = re.sub(r"\s+", "", str(expr).lower()).replace("d%", "d100")
    if not src or not _FULL.match(src):
        return None
    total, detail, nat, adv_used = 0, [], None, False
    for m in re.finditer(r"([-+]?)([^-+]+)", src):
        sign = -1 if m.group(1) == "-" else 1
        term = m.group(2)
        dm = re.fullmatch(r"(\d*)d(\d+)(?:(kh|kl|dh|dl)(\d+))?", term)
        if not dm:
            total += sign * int(term)
            detail.append(("− " if sign < 0 else ("+ " if detail else "")) + term)
            continue
        n, sides = int(dm.group(1) or 1), int(dm.group(2))
        k, kn = dm.group(3), int(dm.group(4) or 0)
        if n > 200 or sides > 1000 or sides < 1:
            return None
        if sides == 20 and n == 1 and adv and not adv_used and not k:
            n, k, kn, adv_used = 2, ("kh" if adv > 0 else "kl"), 1, True
        rolls = [_rng.randint(1, sides) for _ in range(n)]
        keep = list(range(n))
        if k:
            order = sorted(keep, key=lambda i: rolls[i])
            keep = {"kh": order[-kn:] if kn else [], "kl": order[:kn], "dh": order[:n - kn], "dl": order[kn:]}[k]
        s = sum(rolls[i] for i in keep)
        total += sign * s
        if sides == 20 and len(keep) == 1 and nat is None:
            nat = rolls[keep[0]]
        shown = ", ".join((f"<b>{v}</b>" if sides == 20 and v in (1, 20) else str(v)) if i in keep else f"<s>{v}</s>"
                          for i, v in enumerate(rolls))
        detail.append(("− " if sign < 0 else ("+ " if detail else "")) + f"{n}d{sides}{(k + str(kn)) if k else ''}[{shown}]")
    return {"total": total, "detail": " ".join(detail), "nat": nat, "crit": nat == 20, "fumble": nat == 1, "expr": src}


def crit_expr(expr):
    """Doubles the dice (critical hit)."""
    return re.sub(r"(\d*)d(\d+)", lambda m: f"{2 * int(m.group(1) or 1)}d{m.group(2)}", str(expr))


def fmod(n):
    return f"+{n}" if n >= 0 else str(n)
