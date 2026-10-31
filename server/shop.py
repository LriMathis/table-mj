"""Shops: the GM's merchants (campaign.json "shops"), player view, purchase / resale requests and the GM's answer.

campaign.json "shops":
  list      [{id, name, npc: {name, race, attitude, desc, greet, lines, img}, mod (price change, %), sellRate (resale, %),
              visibleTo (None = every character, or a list of ids), gen (generation settings), notes,
              items: [{uid, ref, name, base, mech, rarity, spell, img, value (base value, gp), price (None = computed), qty (None = unlimited), hidden}]}]
  open      id of the shop the players can see (None = closed)
  requests  [{id, t, kind ("buy" | "sell"), charId, who, shopId, shopName, item: {uid, name, img}, qty, listed, offer, msg,
              status ("pending" | "accepted" | "refused" | "cancelled"), final, note, done}]

Players only ever see the name, the picture, the price and the stock of an item: never its rarity or its description.
Same price rules as web/shared/shop.js.
"""
import math
import random
import re
import time

from . import items, money, storage

RARITY_PRICE = {"commun": 100, "peu commun": 400, "rare": 4000, "très rare": 40000, "légendaire": 200000}
COIN = {"pc": .01, "pa": .1, "pe": .5, "po": 1, "pp": 10}
MAX_PENDING = 8
SYS = random.SystemRandom()


def new_id(p="rq"):
    return p + format(int(time.time() * 1000), "x") + str(SYS.randint(100, 999))


def esc(s):
    return str(s or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")


# ---------------------------------------------------------------- prices

def parse_cost(s):
    """'25 po', '5 pa', '1 000 po' -> gold pieces (None when there is no price)."""
    m = re.match(r"\s*([\d\s .,]+)\s*(pc|pa|pe|po|pp)\b", str(s or ""), re.I)
    if not m:
        return None
    try:
        n = float(re.sub(r"[\s ]", "", m.group(1)).replace(",", "."))
    except ValueError:
        return None
    return round(n * COIN[m.group(2).lower()], 2)


def consumable(d):
    cat = (d.get("cat") or "").lower()
    return cat.startswith(("potion", "parchemin")) or "munition" in cat


def base_value(e, cat):
    """Base value (gp) of an inventory or shop entry, None when unknown (the GM sets the price)."""
    if isinstance(e.get("value"), (int, float)):
        return e["value"]
    d = cat.get(e.get("ref")) or {}
    base = cat.get(e.get("base") or d.get("base")) or {}
    rarity = e.get("rarity") or d.get("rarity")
    if rarity in RARITY_PRICE:
        v = RARITY_PRICE[rarity] / (2 if consumable(d) else 1)
        return v + (parse_cost(base.get("cost")) or 0)
    if rarity:   # artifact, "variable": no market price
        return None
    return parse_cost(e.get("cost") or d.get("cost"))


def nice_price(v):
    """Rounded like a merchant would: copper under 1 gp, silver under 10 gp, then whole, 5 and 10 gp."""
    if v is None:
        return None
    v = max(0.0, float(v))
    r = lambda x, step: math.floor(x / step + .5) * step   # half up, like Math.round
    if v < 1:
        return math.floor(max(v, .01) * 100 + .5) / 100
    if v < 10:
        return math.floor(v * 10 + .5) / 10
    for limit, step in ((100, 1), (1000, 5), (10000, 10)):
        if v < limit:
            return float(r(v, step))
    return float(r(v, 50))


def unit_price(shop, it):
    if isinstance(it.get("price"), (int, float)):
        return float(it["price"])
    if not isinstance(it.get("value"), (int, float)):
        return None
    return nice_price(it["value"] * (1 + float(shop.get("mod") or 0) / 100))


def resale_price(shop, v):
    return None if v is None else nice_price(v * float(shop.get("sellRate", 50)) / 100)


def gp(v):
    """12.5 -> '12 po 5 pa' (same as fmtPrice in web/shared/shop.js)."""
    if v is None:
        return "?"
    c = round(float(v) * 100)
    po, pa, pc = c // 100, c % 100 // 10, c % 10
    parts = ([f"{po:,}".replace(",", " ") + " po"] if po else []) + ([f"{pa} pa"] if pa else []) + ([f"{pc} pc"] if pc else [])
    return " ".join(parts) or "0 po"


# ---------------------------------------------------------------- views

def shops(camp):
    return camp.get("shops") or {}


def open_shop(camp, me):
    sh = shops(camp)
    shop = next((s for s in sh.get("list") or [] if s.get("id") == sh.get("open")), None)
    if not shop or not me:
        return None
    vis = shop.get("visibleTo")
    if isinstance(vis, list) and me not in vis:
        return None
    return shop


def item_look(it, cat):
    """Name and picture only (what the players may see)."""
    d = cat.get(it.get("ref")) or {}
    base = cat.get(it.get("base") or d.get("base")) or {}
    return {"name": it.get("name") or d.get("name") or "?", "img": it.get("img") or d.get("img") or base.get("img") or ""}


def player_view(camp, me, char=None):
    shop = open_shop(camp, me)
    if not shop:
        return None
    cat = items.catalog()
    out = []
    for it in shop.get("items") or []:
        if it.get("hidden") or it.get("qty") == 0:
            continue
        out.append(dict(item_look(it, cat), uid=it.get("uid"), price=unit_price(shop, it), qty=it.get("qty")))
    sell = []
    for e in (char or {}).get("inventory") or []:
        sell.append({"uid": e.get("uid"), "price": resale_price(shop, base_value(e, cat))})
    npc = shop.get("npc") or {}
    reqs = [{k: r.get(k) for k in ("id", "t", "kind", "item", "qty", "listed", "offer", "msg", "status", "final", "note", "shopName")}
            for r in shops(camp).get("requests") or [] if r.get("charId") == me][:30]
    return {"id": shop["id"], "name": shop.get("name") or "Magasin",
            "npc": {"name": npc.get("name", ""), "img": npc.get("img", ""), "greet": npc.get("greet", "")},
            "sellRate": shop.get("sellRate", 50), "items": out, "sell": sell, "requests": reqs}


# ---------------------------------------------------------------- player requests (Action from players.py)

def _push(A, req):
    reqs = A.camp.setdefault("shops", {}).setdefault("requests", [])
    i = next((k for k, r in enumerate(reqs) if r.get("id") == req["id"]), None)
    if i is None:
        reqs.insert(0, req)
        del reqs[200:]
    else:
        reqs[i] = req
    A.camp_patch("shop-req", entry=req)


def _shop(A, Denied):
    shop = open_shop(A.camp, A.cid)
    if not shop:
        raise Denied("Aucun magasin n'est ouvert pour vous en ce moment.", 409)
    pend = [r for r in shops(A.camp).get("requests") or [] if r.get("charId") == A.cid and r.get("status") == "pending"]
    if len(pend) >= MAX_PENDING:
        raise Denied(f"Vous avez déjà {MAX_PENDING} demandes en attente : attendez la réponse du MJ.", 409)
    return shop


def _qty(d, hi, Denied):
    try:
        n = int(d.get("qty") or 1)
    except (TypeError, ValueError):
        raise Denied("Quantité invalide.", 400)
    if not 1 <= n <= min(99, hi):
        raise Denied("Quantité invalide.", 400)
    return n


def _offer(d, Denied):
    o = d.get("offer")
    if o in (None, ""):
        return None
    try:
        o = round(float(str(o).replace(",", ".")), 2)
    except ValueError:
        raise Denied("Prix proposé invalide.", 400)
    if not 0 <= o <= 10 ** 7:
        raise Denied("Prix proposé invalide.", 400)
    return o


def act_buy(A, d, Denied):
    shop = _shop(A, Denied)
    it = next((x for x in shop.get("items") or [] if x.get("uid") == d.get("uid") and not x.get("hidden")), None)
    if not it or it.get("qty") == 0:
        raise Denied("Cet objet n'est plus en vente.", 404)
    n = _qty(d, it["qty"] if isinstance(it.get("qty"), int) else 99, Denied)
    unit = unit_price(shop, it)
    look = item_look(it, items.catalog())
    req = {"id": new_id(), "t": int(time.time() * 1000), "kind": "buy", "charId": A.cid, "who": A.c.get("name"),
           "shopId": shop["id"], "shopName": shop.get("name"), "item": dict(look, uid=it["uid"]), "qty": n,
           "listed": None if unit is None else round(unit * n, 2), "offer": _offer(d, Denied),
           "msg": str(d.get("msg") or "")[:300], "status": "pending"}
    _push(A, req)
    A.info(f"<i class='ico i-purse'></i> <b>{esc(A.c.get('name'))}</b> veut acheter <b>{esc(look['name'])}</b>"
           + (f" ×{n}" if n > 1 else "") + f" chez {esc(shop.get('name'))} ({gp(req['listed'])}"
           + (f", propose {gp(req['offer'])}" if req["offer"] is not None else "") + ")", secret=True)
    return {"request": req["id"]}


def act_sell(A, d, Denied):
    shop = _shop(A, Denied)
    e = next((x for x in A.c.get("inventory") or [] if x.get("uid") == d.get("uid")), None)
    if not e:
        raise Denied("Objet introuvable dans votre inventaire.", 404)
    n = _qty(d, int(e.get("qty") or 1), Denied)
    cat = items.catalog()
    unit = resale_price(shop, base_value(e, cat))
    look = item_look(e, cat)
    req = {"id": new_id(), "t": int(time.time() * 1000), "kind": "sell", "charId": A.cid, "who": A.c.get("name"),
           "shopId": shop["id"], "shopName": shop.get("name"), "item": dict(look, uid=e["uid"]), "qty": n,
           "listed": None if unit is None else round(unit * n, 2), "offer": _offer(d, Denied),
           "msg": str(d.get("msg") or "")[:300], "status": "pending"}
    _push(A, req)
    A.info(f"<i class='ico i-purse'></i> <b>{esc(A.c.get('name'))}</b> propose de vendre <b>{esc(look['name'])}</b>"
           + (f" ×{n}" if n > 1 else "") + f" à {esc(shop.get('name'))} ({gp(req['listed'])}"
           + (f", demande {gp(req['offer'])}" if req["offer"] is not None else "") + ")", secret=True)
    return {"request": req["id"]}


def act_cancel(A, d, Denied):
    req = next((r for r in shops(A.camp).get("requests") or [] if r.get("id") == d.get("id") and r.get("charId") == A.cid), None)
    if not req or req.get("status") != "pending":
        raise Denied("Cette demande n'est plus en attente.", 409)
    req = dict(req, status="cancelled", done=int(time.time() * 1000))
    _push(A, req)
    A.info(f"<i class='ico i-purse'></i> <b>{esc(A.c.get('name'))}</b> annule sa demande ({esc(req['item'].get('name'))}).", secret=True)
    return {}


# ---------------------------------------------------------------- the GM's answer

def new_entry(it, cat, n):
    """Inventory entry for n copies of a shop item (same fields as newInvEntry in web/shared/items.js)."""
    d = cat.get(it.get("ref")) or {}
    e = {"uid": "it" + format(int(time.time() * 1000), "x") + str(SYS.randint(1000, 9999)), "ref": d.get("id") or it.get("ref"),
         "qty": n, "equipped": False, "attuned": False}
    if (d.get("mech") or {}).get("charges"):
        e["charges"] = {"cur": d["mech"]["charges"], "max": d["mech"]["charges"]}
    if str(d.get("id") or "").startswith("cu-"):
        for k in ("name", "desc", "img", "kind", "weapon", "armor", "mech", "attune"):
            if k in d:
                e[k] = d[k]
    for k in ("name", "base", "mech", "rarity", "spell", "img", "desc", "kind"):
        if it.get(k):
            e[k] = it[k]
    v = base_value(it, cat)
    if v is not None:
        e["value"] = v
    return e


def gm_resolve(Action, Denied, d):
    """GM: accepts (at the price they set) or refuses a request. -> (code, result)"""
    camp = storage.load_camp()
    req = next((r for r in shops(camp).get("requests") or [] if r.get("id") == d.get("id")), None)
    if not req:
        return 404, {"error": "Demande introuvable."}
    if req.get("status") != "pending":
        return 409, {"error": "Cette demande a déjà reçu une réponse."}
    A = Action(req["charId"])
    req = dict(next(r for r in shops(A.camp).get("requests") or [] if r.get("id") == req["id"]))
    who, name, n = esc(A.c.get("name")), esc((req.get("item") or {}).get("name")), int(req.get("qty") or 1)
    what = f"<b>{name}</b>" + (f" ×{n}" if n > 1 else "")
    note = str(d.get("note") or "")[:300]
    req.update(note=note, done=int(time.time() * 1000))
    if d.get("accept"):
        try:
            price = round(float(str(d.get("price")).replace(",", ".")), 2)
        except (TypeError, ValueError):
            return 400, {"error": "Indiquez le prix final."}
        if price < 0:
            return 400, {"error": "Prix invalide."}
        purse = money.purse(A.c)
        cost = money.to_cp(price)
        cat = items.catalog()
        inv = [dict(x) for x in A.c.get("inventory") or []]
        if req["kind"] == "buy":
            shop = next((s for s in shops(A.camp).get("list") or [] if s.get("id") == req.get("shopId")), None)
            it = next((x for x in (shop or {}).get("items") or [] if x.get("uid") == req["item"].get("uid")), None)
            if not it:
                return 409, {"error": "Cet objet n'est plus dans le magasin."}
            if isinstance(it.get("qty"), int) and it["qty"] < n:
                return 409, {"error": f"Stock insuffisant ({it['qty']} restant(s))."}
            paid = money.pay(purse, cost)
            if paid is None:
                return 409, {"error": f"{A.c.get('name')} n'a que {money.fmt(purse)} : baissez le prix ou refusez."}
            ref = it.get("ref")
            stack = (not it.get("name") and not it.get("base") and not it.get("rarity") and not (cat.get(ref) or {}).get("rarity")
                     and next((x for x in inv if x.get("ref") == ref and not x.get("name") and not x.get("base")), None))
            if stack:
                stack["qty"] = int(stack.get("qty") or 1) + n
            else:
                inv.append(new_entry(it, cat, n))
            if isinstance(it.get("qty"), int):
                it["qty"] -= n
                A.camp_patch("shop-stock", shop=shop["id"], uid=it["uid"], qty=it["qty"])
            money.set_purse(A.set, A.c, paid[0])
            back = money.total_cp(paid[2])
            msg = (f"<i class='ico i-purse'></i> <b>{who}</b> achète {what} pour <b>{gp(price)}</b>"
                   + (f" (donne {money.fmt(paid[1])}, le marchand rend {money.fmt(paid[2])})" if back else "") + ".")
        else:
            e = next((x for x in inv if x.get("uid") == req["item"].get("uid")), None)
            if not e or int(e.get("qty") or 1) < n:
                return 409, {"error": f"{A.c.get('name')} n'a plus cet objet."}
            if int(e.get("qty") or 1) > n:
                e["qty"] = int(e.get("qty") or 1) - n
            else:
                inv.remove(e)
            money.set_purse(A.set, A.c, money.add(purse, money.coins_for(cost)))
            msg = f"<i class='ico i-purse'></i> <b>{who}</b> vend {what} pour <b>{gp(price)}</b>."
        A.c["inventory"] = inv
        items.apply_inventory(A.c)
        for k in ("inventory", "attacks", "ca", "saveItemBonus"):
            A.set([k], A.c.get(k))
        req.update(status="accepted", final=price)
    else:
        req["status"] = "refused"
        msg = f"<i class='ico i-purse'></i> Le marchand refuse : {'achat' if req['kind'] == 'buy' else 'vente'} de {what} par <b>{who}</b>."
    _push(A, req)
    A.info(msg + (f" <i>« {esc(note)} »</i>" if note else ""), secret=True)
    r = A.commit()
    return 200, {"ok": True, "rev": r, "request": req, "purse": A.c.get("purse")}
