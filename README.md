# GM Table — D&D 5e

A virtual tabletop for Dungeons & Dragons 5th edition. The game master runs the game from their computer; players follow the map and play their character from a browser (phone, tablet or computer), on the same network or remotely.

- Battle map with grid, tokens, fog of war, ruler and pings
- Combat tracker: initiative, hit points, conditions, automatically resolved attacks and spells
- 477-spell spellbook, guided level-up for all 13 classes
- Multiple campaigns, illustrated bestiary, journal, automatic backups
- English and French interface, chosen on each device
- No dependencies: Python 3 (standard library) and plain JavaScript, no build step

## Requirements

- Python 3.10 or later
- Linux, macOS or Windows (the `.sh` scripts are for Linux and macOS; on Windows, run `python main.py`)

## Getting started

```bash
git clone git@github.com:LriMathis/table-mj.git
cd table-mj
./start-remote.sh
```

| Command | Use |
|---|---|
| `./start.sh` | Game master only, on this computer |
| `./start-lan.sh` | Game master and players on the same local network |
| `./start-remote.sh` | Game master and players over the internet |

`main.py` options: `--lan`, `--remote`, `--port N`, `--data FOLDER`, `--sheets FOLDER`, `--no-browser`.

- **Game master interface**: http://127.0.0.1:8765/ (opens automatically). It is only reachable from the game master's computer.
- **Player view**: the address to share is printed in the terminal and shown in **Map → Connected players**.
- Direct links: `/#combat`, `/#spellbook`… open a GM tab; `/player?char=vex&tab=spells` opens a player's sheet.
- Stop the server with **Ctrl+C**. Keep the terminal open during the session.

### Local network

Players open `http://<computer-ip>:8765/player`. If the page does not load, allow the port in the firewall: `sudo ufw allow 8765/tcp`.

### Remote play

The server runs on the game master's computer; a free HTTPS tunnel, with no account needed, makes it reachable from the internet.

1. The game master runs `./start-remote.sh`. On first use, `cloudflared` is downloaded to `tools/` (about 40 MB).
2. An address such as `https://xxxx.trycloudflare.com/player` is printed in the terminal and shown in the Map tab, with a copy button.
3. Players open this address in their browser. They have nothing to install.

The address changes at every start. Voice chat is not included: use a tool such as Discord alongside.

**Security**: the tunnel points to a separate port that only serves the player view. The game master interface and API return 403 there, and any request relayed by a proxy is refused by the game master API. If cloudflared is unavailable, the server falls back to `ssh` and localhost.run; in that mode, images larger than about 300 KB may not load.

## Features

### Battle map
- Create a map by dropping an image; adjustable grid, or calibrate it by drawing one square.
- Medallion tokens: ring in the side's color (blue for PCs, red for opponents, gold for NPCs) and a hit point arc.
- Conditions shown as badges; dead, hidden and active combatants clearly marked.
- Fog of war painted with a brush, measuring ruler (diagonal = 1 square), pings visible to everyone (Alt + click for the GM, long press for players).
- The GM chooses which map players see and can send them their framing.

### Combat and spells
- 477 spells with names and summaries from [AideDD](https://www.aidedd.org) and mechanics from the SRD 5.1; official English names are shown in the English interface.
- Damage scales with the slot level or, for cantrips, the character level.
- Multiple rays, saving throws (DC, half damage), healing, temporary hit points, concentration and rituals are handled automatically.
- Cast from the sheet or the turn panel: the slot is spent, then the target is chosen.
- Custom spell names on character sheets are recognized.

### Player view
- Sheet, actions, spells, dice, journal and party, on a phone-friendly screen.
- In combat, attacks and spells are only possible on the player's turn (except reactions); players are alerted when their turn comes.
- Dice are rolled by the server. The GM sees every roll and applies damage in one click.
- Opponents' health is given as a state (wounded, bloodied…), never as exact hit points.

### Level-up
A step-by-step wizard following the official rules for all 13 classes:
1. Hit points (average, roll or maximum), class features and subclass.
2. Ability score improvement or feat (16 feats, effects applied).
3. Expertise.
4. New spells and replacing a known spell.
5. Editable summary.

Several levels can be chained, the last 5 level-ups can be undone, and the GM can let players level up their own characters.

### GM tools
- Multiple campaigns, each with its own characters, maps, combats and journal; the bestiary and images are shared.
- New campaigns can be created from the sheets in `sheets/` or from characters of another campaign.
- Show a text or an image on every player's screen.
- Quests and NPCs revealed to players on demand; GM notes are never sent to them.
- Player settings: token movement, actions, level-up.
- Illustrated bestiary with clickable stat blocks that roll the dice.
- 8 visual themes and 2 languages, chosen on each device.

## Game content

The bundled game content (character sheets, class features, feats, spell summaries, monsters) is in French. The interface translates the game terms it stores (abilities, skills, conditions, damage types, classes, spell names) when it runs in English.

## Backups

Everything is saved automatically in `data/`. `.zip` archives are also created in `data/backups/` at startup, every 20 minutes when something changed and at each campaign switch. A manual backup can be made from the Campaigns tab.

Data saved by earlier versions (French folder names such as `donnees/`) is moved to the current layout automatically on first start; nothing is overwritten.

The automatic archives are not versioned in this repository.

## Project structure

```
main.py                  entry point
start*.sh                launch scripts
server/                  HTTP server (standard library only)
  app.py                 startup, command line, automatic backups
  web.py                 routes: game master API (local) and player API
  tunnel.py              tunnel for remote play
  storage.py             data files, active campaign, merging of changes
  campaigns.py           campaigns and sheet import
  players.py             filtered data for players, rolls, attacks, spells
  rules.py               D&D 5e rules
  dice.py                dice roller
  sheets.py              text character sheet parser
  i18n.py                server messages in French
web/
  shared/                styles, themes, map, dice, spell database, translations
  gm/                    game master interface
  player/                player interface
data/                    campaigns, bestiary and images
sheets/                  character sheets to import (.txt / .md)
assets/                  original portraits and images
```

## Credits

- Icons and monster portraits: [game-icons.net](https://game-icons.net) (Lorc, Delapouite, Skoll, Caro Asercion, DarkZaitzev, Carl Olsen), [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/).
- Spells: names and summaries from [AideDD](https://www.aidedd.org), mechanics from the SRD 5.1 ([CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)).
- Remote play: [cloudflared](https://github.com/cloudflare/cloudflared) (Cloudflare Quick Tunnels).
